// The download count's watchdog (download-count Failures G8 and E4; ADR-0056). The Download count workflow runs it every
// hour, holding no secret: it reads the statistics file through the download host, as the landing page does, and fails
// the run, so that GitHub notifies, when the file shows that the collection may have stopped. A failing run prints the
// run record's newest entries, each as one line of JSON, so that no text in them is read as a workflow command.
//
// It runs nothing of the count. It holds its own copies of the files' keys and of the test of a UTC time that the count's
// core (aloong-planet-home, workers/download-count/scripts/) holds, and fetches nothing from there (ADR-0058): a change to
// either key, or to the form in which the files write their instants, needs the copies here changed too.
import { fileURLToPath } from 'node:url'

/** The statistics file's key in the bucket, and the run record's */
const STATISTICS_KEY = 'stats/downloads.json'
const RUNS_KEY = 'stats/worker-runs.json'
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
/** Whether a text is an ISO 8601 UTC time to the second or the millisecond, as the files write their instants */
const isUtc = (text) => typeof text === 'string' && UTC.test(text) && !Number.isNaN(Date.parse(text)) &&
  new Date(Date.parse(text)).toISOString().slice(0, 19) === text.slice(0, 19)

/** How far before the watchdog's clock, and after it, the statistics file's updatedAt may be (Failure G8) */
const BEHIND = 6 * 3_600_000
const AHEAD = 5 * 60_000
/** The run record entries a failing run prints */
const SHOWN = 24
/** How long a read may take before it counts as failed */
const TIMEOUT = 60_000

const messageOf = (error) => (error instanceof Error ? error.message : String(error))
/** A workflow command's message, on one line: GitHub's escapes for %, CR and LF */
const escaped = (text) => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
/** A value as one line of JSON: JSON.stringify escapes CR and LF but leaves U+2028 and U+2029, so they are escaped too */
const oneLine = (value) => JSON.stringify(value).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
const quoted = (value) => (value === undefined ? 'none' : oneLine(value).slice(0, 200))

/** An answer read from the download host; the body is read only from an answer with HTTP 200 */
async function read(fetch, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
  return { status: response.status, body: response.status === 200 ? await response.text() : null }
}

/**
 * What the statistics file answered at `now` says of the collection (Failure G8): `{ fresh: true, updatedAt }` while it
 * is brought up to date, and otherwise `{ fresh: false, reason }`
 */
export function judge({ status, body }, now) {
  const stale = (reason) => ({ fresh: false, reason })
  if (status !== 200) return stale(`answered HTTP ${status}`)
  let file
  try {
    file = JSON.parse(body)
  } catch {
    return stale('is not JSON')
  }
  if (file?.schemaVersion !== 1) return stale(`has schemaVersion ${quoted(file?.schemaVersion)}, not 1`)
  const { updatedAt } = file
  if (!isUtc(updatedAt)) return stale(`has updatedAt ${quoted(updatedAt)}, not a UTC time`)
  const updated = Date.parse(updatedAt)
  const clock = new Date(now).toISOString()
  if (updated < now - BEHIND) return stale(`was last updated at ${updatedAt}, more than 6 hours before ${clock}`)
  if (updated > now + AHEAD) return stale(`was last updated at ${updatedAt}, more than 5 minutes after ${clock}`)
  return { fresh: true, updatedAt }
}

/** The run record's entries, from its answer */
function runsOf({ status, body }) {
  if (status !== 200) throw new Error(`answered HTTP ${status}`)
  let record
  try {
    record = JSON.parse(body)
  } catch {
    throw new Error('is not JSON')
  }
  if (!Array.isArray(record?.runs)) throw new Error('holds no list of runs')
  return record.runs
}

/**
 * One watch from the workflow's environment, with the fetch and clock given: it resolves to the run's exit code, 0
 * while the statistics file is brought up to date and 1 otherwise. Whether it fails depends on the statistics file
 * alone; the run record only adds what a failing run prints.
 */
export async function main(env, { fetch, now, log = console.log }) {
  if (!env.DOWNLOAD_HOST) {
    log('::error::DOWNLOAD_HOST is not set')
    return 1
  }
  const statistics = new URL(STATISTICS_KEY, env.DOWNLOAD_HOST).href
  const verdict = await read(fetch, statistics).then(
    (answer) => judge(answer, now()),
    (error) => ({ fresh: false, reason: `could not be read: ${messageOf(error)}` })
  )
  if (verdict.fresh) {
    log(`The statistics file at ${statistics} was last updated at ${verdict.updatedAt}, as of ${new Date(now()).toISOString()}`)
    return 0
  }
  log(`::error::${escaped(`The statistics file at ${statistics} ${verdict.reason}: the download count may have stopped (docs/ops/download-count.md, "When the watchdog fails")`)}`)
  const runs = new URL(RUNS_KEY, env.DOWNLOAD_HOST).href
  try {
    const entries = runsOf(await read(fetch, runs)).slice(-SHOWN)
    log(`The run record's newest ${entries.length} entries, oldest first, from ${runs}:`)
    for (const entry of entries) log(oneLine(entry))
  } catch (error) {
    log(`The run record at ${runs} could not be read: ${messageOf(error)}`)
  }
  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.env, { fetch: globalThis.fetch, now: Date.now }).then((code) => { process.exitCode = code }, (error) => {
    console.log(`::error::${escaped(`[download-count] ${messageOf(error)}`)}`)
    process.exitCode = 1
  })
}
