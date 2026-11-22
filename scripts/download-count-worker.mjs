// The download count's Worker (landing-page::REQ-011, Implementation Decisions "The collection", "The run record" and
// "The shadow period"; ADR-0056): a Cron Trigger runs it every hour. It runs the core (download-count-core.mjs) on the
// release bucket through the Worker's R2 binding, reading GitHub without a token, and appends the run to the run record.
//
// aloong-planet/infra's `workers` stack deploys this module, as the main module, and the core beside it from the
// agentshed commit it pins, each checked against its pinned SHA-256, and binds the settings below
// (docs/ops/download-count.md). So this module imports the core and nothing else.
//
// In the shadow period it writes the shadow file. Its key is a constant here rather than a setting, so that no setting
// can point a shadow-period Worker at the statistics file: the switch is the commit that changes it.
import { collect, hourOf, isCount, isUtc, shaped, STATISTICS_KEY, WRITE_OPTIONS } from './download-count-core.mjs'

export const SHADOW_KEY = 'stats/downloads-shadow.json'
export const RUNS_KEY = 'stats/worker-runs.json'
/** The file this Worker writes, and the one it starts from while that is absent */
const KEY = SHADOW_KEY
const SEED_KEY = STATISTICS_KEY
const MAX_RUNS = 336
/** A SHA-256 as the run record writes it, and the comparison record copies it: 64 lowercase hex digits */
export const SHA256 = /^[0-9a-f]{64}$/

// The settings infra binds besides BUCKET (the R2 binding) and CORE_SHA256 (the core's pinned hash); ACCEPT_GAP_FROM,
// a cursor whose gap a run accepts (Failure G3), is bound only while a gap is to be accepted, and empty means unset
const SETTINGS = ['CF_ANALYTICS_API_TOKEN', 'CF_ZONE_ID', 'DOWNLOAD_HOST', 'GITHUB_REPOSITORY']

const SOURCES = ['ok', 'failed', 'not-read']
const GITHUB = ['ok', 'rate-limited', 'failed', 'not-read']
const ENTRY = ['scheduledTime', 'coreSha256', 'key', 'written', 'github', 'analytics', 'bucket', 'failure', 'r2Cursor']

/**
 * The run record, taken only when it has exactly the fields and types of the spec's table (Implementation Decisions
 * "The run record"); anything else is not one (Failure G9)
 */
export function validateRuns(record) {
  const fail = (reason) => { throw new Error(`the run record ${reason}`) }
  if (!shaped(record, ['schemaVersion', 'seed', 'runs'])) fail('does not have the run record\'s fields')
  if (record.schemaVersion !== 1) fail(`has schemaVersion ${JSON.stringify(record.schemaVersion)}, not 1`)
  const { seed } = record
  if (seed !== null && !(shaped(seed, ['at', 'r2Cursor', 'r2Bytes']) && isUtc(seed.at) && hourOf(seed.r2Cursor) !== null && isCount(seed.r2Bytes))) {
    fail(`has a seed that is not one: ${JSON.stringify(seed)}`)
  }
  if (!Array.isArray(record.runs) || record.runs.length > MAX_RUNS) fail(`has runs that are not a list of at most ${MAX_RUNS}`)
  for (const [i, run] of record.runs.entries()) {
    const holds = shaped(run, ENTRY) && isUtc(run.scheduledTime) && SHA256.test(run.coreSha256) &&
      [STATISTICS_KEY, SHADOW_KEY].includes(run.key) && typeof run.written === 'boolean' && GITHUB.includes(run.github) &&
      SOURCES.includes(run.analytics) && SOURCES.includes(run.bucket) &&
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
  let record = { schemaVersion: 1, seed: null, runs: [] }
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
 * Cloudflare reports the invocation as failed; a failure's text never holds the analytics token.
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
  const redact = (text) => (token ? text.replaceAll(token, '[the analytics token]') : text)
  const at = now()

  // A run that starts from the file it writes is where the shadow file starts: from the statistics file, or from
  // nothing when the bucket held neither. Its seed is written before the shadow file, so that the shadow file never
  // exists without one: a run that cannot write it fails, and the next run, finding no shadow file, seeds again
  const seedFirst = async ({ previous, previousKey }) => {
    if (previousKey === KEY) return
    const seed = previousKey === SEED_KEY
      ? { at: new Date(at).toISOString(), r2Cursor: previous.r2Cursor, r2Bytes: Object.values(previous.r2.objects).reduce((sum, { bytes }) => sum + bytes, 0) }
      : null
    try {
      await updateRuns(bucket, (record) => ({ ...record, seed }))
    } catch (error) {
      throw new Error(`the seed was not written to ${RUNS_KEY}: ${messageOf(error)}`, { cause: error })
    }
  }

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
      analyticsToken: token,
      zone: env.CF_ZONE_ID,
      host: new URL(env.DOWNLOAD_HOST).hostname,
      acceptGapFrom: env.ACCEPT_GAP_FROM || null,
      key: KEY,
      seedKey: SEED_KEY,
      beforeWrite: seedFirst
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
