#!/usr/bin/env node
// The download count's hourly run in the Download count workflow (landing-page::REQ-011; ADR-0055): the core
// (scripts/download-count-core.mjs) run on the release bucket through aws-cli, with its settings from the environment.
// In the shadow period (ADR-0056), a run that wrote the statistics file then compares it with the Worker's shadow file
// and appends the comparison to the comparison record (scripts/download-count-compare.mjs); a comparison never fails
// the run.
//
//   node scripts/download-count.mjs     the Download count workflow's one step (.github/workflows/download-count.yml)
//
// Environment: see SETTINGS below, and ACCEPT_GAP; the comparison takes GITHUB_RUN_ID and GITHUB_SHA, which GitHub
// sets in every workflow run.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { awsBucket, runAws } from './lib/r2-bucket.mjs'
import { collect, validateStatistics } from './download-count-core.mjs'
import { appendComparison, compare, COMPARISONS_KEY, validateComparisons } from './download-count-compare.mjs'
import { RUNS_KEY, SHADOW_KEY, validateRuns } from './download-count-worker.mjs'

// The collection's credentials (docs/ops/download-count.md): the bucket's, which aws-cli reads from the environment,
// the analytics token and zone, and the workflow's own token for GitHub
const SETTINGS = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'CF_ANALYTICS_API_TOKEN',
  'CF_ZONE_ID', 'GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'DOWNLOAD_HOST']
const CORE = new URL('./download-count-core.mjs', import.meta.url)

/** A file of the bucket, listed before it is read since aws-cli's read fails for a missing key: null when absent */
async function readJson(bucket, key, validate) {
  if (!(await bucket.list(key)).some((object) => object.key === key)) return null
  const text = await bucket.getText(key)
  let file
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error(`${key} in the bucket is not JSON`)
  }
  return validate(file)
}

/**
 * The comparison of the statistics file this run wrote with the shadow file, appended to the comparison record.
 * Any of the three files that cannot be read, or is not one, appends nothing and leaves the record as it was
 * (Failure G9).
 */
async function recordComparison({ bucket, env, at, statistics }) {
  const shadow = await readJson(bucket, SHADOW_KEY, (file) => validateStatistics(file, SHADOW_KEY))
  const runs = await readJson(bucket, RUNS_KEY, validateRuns)
  const record = await readJson(bucket, COMPARISONS_KEY, validateComparisons)
  const comparison = compare({
    at,
    workflowRunId: Number(env.GITHUB_RUN_ID),
    workflowCommit: env.GITHUB_SHA,
    workflowCoreSha256: createHash('sha256').update(await readFile(CORE)).digest('hex'),
    statistics,
    shadow,
    runs
  })
  await bucket.putText(COMPARISONS_KEY, `${JSON.stringify(appendComparison(record, comparison), null, 2)}\n`, { cacheControl: 'public, max-age=300', contentType: 'application/json' })
  return comparison
}

/** A workflow command's message, on one line: GitHub's escapes for %, CR and LF */
const escaped = (text) => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

/** A run from the workflow's environment; ACCEPT_GAP is 'true' only on a manual run that accepts a gap (Failure G3) */
export async function main(env, { run, fetch, now, log = console.log }) {
  for (const name of SETTINGS) {
    if (!env[name]) throw new Error(`${name} is not set`)
  }
  const bucket = awsBucket({ bucket: env.R2_BUCKET, endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, run })
  const { statistics } = await collect({
    bucket,
    fetch,
    now: now(),
    repository: env.GITHUB_REPOSITORY,
    githubToken: env.GITHUB_TOKEN,
    analyticsToken: env.CF_ANALYTICS_API_TOKEN,
    zone: env.CF_ZONE_ID,
    host: new URL(env.DOWNLOAD_HOST).hostname,
    acceptGap: env.ACCEPT_GAP === 'true'
  })
  const { total, sources } = statistics.summary
  log(`[download-count] ${total} downloads: ${sources.github} on GitHub, ${sources.r2} from the download host, counted to ${statistics.r2Cursor}`)
  try {
    const { status } = await recordComparison({ bucket, env, at: new Date(now()).toISOString(), statistics })
    log(`[download-count] compared with the shadow file: ${status}`)
  } catch (error) {
    log(`::warning::${escaped(`[download-count] no comparison with the shadow file was recorded: ${error instanceof Error ? error.message : String(error)}`)}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.env, { run: runAws, fetch: globalThis.fetch, now: Date.now }).catch((error) => {
    console.error(`[download-count] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
