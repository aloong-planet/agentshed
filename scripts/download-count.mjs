#!/usr/bin/env node
// The download count's hourly run in the Download count workflow (landing-page::REQ-011; ADR-0055): the core
// (scripts/download-count-core.mjs) run on the release bucket through aws-cli, with its settings from the environment.
//
//   node scripts/download-count.mjs     the Download count workflow's one step (.github/workflows/download-count.yml)
//
// Environment: see SETTINGS below, and ACCEPT_GAP.
import { fileURLToPath } from 'node:url'
import { awsBucket, runAws } from './lib/r2-bucket.mjs'
import { collect } from './download-count-core.mjs'

// The collection's credentials (docs/ops/download-count.md): the bucket's, which aws-cli reads from the environment,
// the analytics token and zone, and the workflow's own token for GitHub
const SETTINGS = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'CF_ANALYTICS_API_TOKEN',
  'CF_ZONE_ID', 'GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'DOWNLOAD_HOST']

/** A run from the workflow's environment; ACCEPT_GAP is 'true' only on a manual run that accepts a gap (Failure G3) */
export async function main(env, { run, fetch, now, log = console.log }) {
  for (const name of SETTINGS) {
    if (!env[name]) throw new Error(`${name} is not set`)
  }
  const statistics = await collect({
    bucket: awsBucket({ bucket: env.R2_BUCKET, endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, run }),
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.env, { run: runAws, fetch: globalThis.fetch, now: Date.now }).catch((error) => {
    console.error(`[download-count] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
