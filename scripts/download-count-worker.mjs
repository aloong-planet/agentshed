// The download count's Worker (download-count::REQ-011, Implementation Decisions "The collection" and "The run record";
// ADR-0056): a Cron Trigger runs it every hour. It runs the core (download-count-core.mjs) on the release bucket through
// the Worker's R2 binding, reading GitHub with its read-only token (ADR-0057), and appends the run to the run record.
//
// aloong-planet/infra's `workers` stack deploys this module, as the main module, and the core beside it from the
// agentshed commit it pins, each checked against its pinned SHA-256, and binds the settings below
// (docs/ops/download-count.md). So this module imports the core and nothing else. As the main module, it exports only
// its handlers and functions: the runtime refuses to load a main module that exports anything else, a string included.
//
// It writes the statistics file, the one copy of the count. The key is a constant in the code rather than a setting,
// so that no setting can point the Worker at another file.
import {
  collect, hourOf, isUtc, RUNS_KEY, SHA256, SHADOW_KEY, shaped, STATISTICS_KEY, WRITE_OPTIONS
} from './download-count-core.mjs'

/** The file this Worker writes */
const KEY = STATISTICS_KEY
const MAX_RUNS = 336

// The settings infra binds besides BUCKET (the R2 binding) and CORE_SHA256 (the core's pinned hash); ACCEPT_GAP_FROM,
// a cursor whose gap a run accepts (Failure G3), is bound only while a gap is to be accepted, and empty means unset
const SETTINGS = ['CF_ANALYTICS_API_TOKEN', 'CF_ZONE_ID', 'DOWNLOAD_HOST', 'GITHUB_REPOSITORY', 'RELEASES_READ_TOKEN']

const SOURCES = ['ok', 'failed', 'not-read']
const GITHUB = ['ok', 'rate-limited', 'failed', 'not-read']
const ENTRY = ['scheduledTime', 'coreSha256', 'key', 'written', 'github', 'analytics', 'bucket', 'failure', 'r2Cursor']
// What a run of an earlier Worker, which deleted the shadow file, found of it: deleted, not there, or there and not
// deleted
const SHADOW_FILE = ['deleted', 'absent', 'failed']

/**
 * The run record, taken only when it has exactly the fields and types of the spec's table (Implementation Decisions
 * "The run record"); anything else is not one (Failure G9). The entries earlier Workers wrote are ones too until they
 * age out: the shadow period's, which wrote the shadow file and have no `shadowFile`, and those of the statistics file
 * that say what the run found of the shadow file in `shadowFile`.
 */
export function validateRuns(record) {
  const fail = (reason) => { throw new Error(`the run record ${reason}`) }
  if (!shaped(record, ['schemaVersion', 'runs'])) fail('does not have the run record\'s fields')
  if (record.schemaVersion !== 1) fail(`has schemaVersion ${JSON.stringify(record.schemaVersion)}, not 1`)
  if (!Array.isArray(record.runs) || record.runs.length > MAX_RUNS) fail(`has runs that are not a list of at most ${MAX_RUNS}`)
  for (const [i, run] of record.runs.entries()) {
    const withShadowFile = run?.key === KEY && Object.hasOwn(run, 'shadowFile')
    const holds = shaped(run, withShadowFile ? [...ENTRY, 'shadowFile'] : ENTRY) && isUtc(run.scheduledTime) &&
      SHA256.test(run.coreSha256) && (run.key === SHADOW_KEY || run.key === KEY) && (!withShadowFile || SHADOW_FILE.includes(run.shadowFile)) &&
      typeof run.written === 'boolean' && GITHUB.includes(run.github) && SOURCES.includes(run.analytics) && SOURCES.includes(run.bucket) &&
      (run.written ? run.failure === null && hourOf(run.r2Cursor) !== null : typeof run.failure === 'string' && run.r2Cursor === null)
    if (!holds) fail(`has a run that is not one: entry ${i}`)
  }
  return record
}

/**
 * The core's bucket over the Worker's R2 binding. A listing joins every page, as long as the binding says it is
 * truncated. A write is conditioned on what the run read (Failure G10): on the etag it read, or, for a key it read as
 * absent or never read, on there being no object, so a write fails rather than replace what another run wrote since.
 */
function bindingBucket(binding) {
  const etags = new Map()
  const read = async (key) => {
    const object = await binding.get(key)
    etags.set(key, object?.etag ?? null)
    return object === null ? null : object.text()
  }
  return {
    read,
    async list(prefix) {
      const objects = []
      let cursor
      for (;;) {
        const page = await binding.list(cursor === undefined ? { prefix } : { prefix, cursor })
        objects.push(...page.objects.map(({ key, size }) => ({ key, size })))
        if (!page.truncated) return objects
        if (typeof page.cursor !== 'string') throw new Error(`the listing of ${prefix} is truncated without a cursor`)
        cursor = page.cursor
      }
    },
    async getText(key) {
      const text = await read(key)
      if (text === null) throw new Error(`${key} is not in the bucket`)
      return text
    },
    async putText(key, text, { cacheControl, contentType }) {
      const etag = etags.get(key)
      const onlyIf = typeof etag === 'string' ? { etagMatches: etag } : new Headers({ 'if-none-match': '*' })
      const written = await binding.put(key, text, { onlyIf, httpMetadata: { cacheControl, contentType } })
      if (written === null) throw new Error(`${key} changed in the bucket since the run read it`)
      etags.set(key, written.etag)
    }
  }
}

const asText = (file) => `${JSON.stringify(file, null, 2)}\n`
const messageOf = (error) => (error instanceof Error ? error.message : String(error))

/** The run record changed by `change` and written back, on the etag read (Failure G10); absent, it starts here */
async function updateRuns(bucket, change) {
  const text = await bucket.read(RUNS_KEY)
  let record = { schemaVersion: 1, runs: [] }
  if (text !== null) {
    try {
      record = JSON.parse(text)
    } catch {
      throw new Error('the run record is not JSON')
    }
    validateRuns(record)
  }
  await bucket.putText(RUNS_KEY, asText(validateRuns(change(record))), WRITE_OPTIONS)
}

/**
 * One run of the Cron Trigger (`controller.scheduledTime`, in milliseconds) on the Worker's settings (`env`), with the
 * fetch and clock given. It rejects when the run failed or its entry could not be appended to the run record, so that
 * Cloudflare reports the invocation as failed; a failure's text never holds either token.
 */
export async function run(controller, env, { fetch, now, log = console.log, error: report = console.error }) {
  const fail = (message) => {
    report(`[download-count] ${message}`)
    throw new Error(message)
  }
  if (typeof env.CORE_SHA256 !== 'string' || !SHA256.test(env.CORE_SHA256)) fail('CORE_SHA256 is not 64 lowercase hex digits')
  if (!env.BUCKET) fail('BUCKET is not bound')
  const bucket = bindingBucket(env.BUCKET)
  const token = env.CF_ANALYTICS_API_TOKEN
  const credentials = [[token, '[the analytics token]'], [env.RELEASES_READ_TOKEN, '[the GitHub token]']]
  const redact = (text) => credentials.reduce((redacted, [value, name]) => (value ? redacted.replaceAll(value, name) : redacted), text)
  const at = now()

  let counted = null
  let failure = null
  let outcomes = { github: 'not-read', analytics: 'not-read', bucket: 'not-read' }
  try {
    for (const name of SETTINGS) if (!env[name]) throw new Error(`${name} is not set`)
    counted = await collect({
      bucket,
      fetch,
      now: at,
      repository: env.GITHUB_REPOSITORY,
      githubToken: env.RELEASES_READ_TOKEN,
      analyticsToken: token,
      zone: env.CF_ZONE_ID,
      host: new URL(env.DOWNLOAD_HOST).hostname,
      acceptGapFrom: env.ACCEPT_GAP_FROM || null
    })
    outcomes = { github: 'ok', analytics: 'ok', bucket: 'ok' }
  } catch (error) {
    failure = redact(messageOf(error))
    outcomes = error?.outcomes ?? outcomes
  }

  const entry = {
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
    coreSha256: env.CORE_SHA256,
    key: KEY,
    written: counted !== null,
    ...outcomes,
    failure,
    r2Cursor: counted?.statistics.r2Cursor ?? null
  }
  let unrecorded = null
  try {
    await updateRuns(bucket, (record) => ({ ...record, runs: [...record.runs, entry].slice(-MAX_RUNS) }))
  } catch (error) {
    unrecorded = `the run's entry was not appended to ${RUNS_KEY}: ${redact(messageOf(error))}`
  }

  if (failure === null && unrecorded === null) {
    const { total, sources } = counted.statistics.summary
    log(`[download-count] ${total} downloads: ${sources.github} on GitHub, ${sources.r2} from the download host, counted to ${counted.statistics.r2Cursor} in ${KEY}`)
    return
  }
  fail([failure, unrecorded].filter((part) => part !== null).join('; '))
}

export default {
  /** The Cron Trigger's handler: fetch is the runtime's own, called through it at each call, never detached from it */
  scheduled(controller, env) {
    return run(controller, env, { fetch: (url, init) => fetch(url, init), now: () => Date.now() })
  }
}
