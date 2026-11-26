// The download count's watchdog (scripts/download-count-watchdog.mjs; download-count Failures G8 and E4): a watch
// driven through main() with the download host standing in as a fetch and the clock fixed, and the script run as the
// workflow runs it, against a local HTTP server.
//
// Gaps: GitHub's runner reading the printed lines, and GitHub notifying of a failed scheduled run, are seen only in a
// run that fails (docs/ops/download-count.md). The files are served with public, max-age=300, so a cache on the way
// may hold a copy 5 minutes old, which the 6 hours Failure G8 allows cover; no case reads through such a cache.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { judge, main } from './download-count-watchdog.mjs'
import { json, text, writtenFile } from './testing/download-count-sources.mjs'
import { listening } from './testing/local-server.mjs'

const HOST = 'https://dl.agentshed.aloongplanet.com'
const STATISTICS = `${HOST}/stats/downloads.json`
const RUNS = `${HOST}/stats/worker-runs.json`
// The watchdog's clock: 12:47:30 on 2026-11-25
const NOW = Date.UTC(2026, 10, 25, 12, 47, 30)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const LINE_BREAKS = /[\n\r\u2028\u2029]/

const statisticsAt = (updatedAt) => json({ ...writtenFile(), updatedAt })
/** A run record entry, the switched Worker's, for the run `i` hours after 2026-11-24T00:31Z */
const entry = (i, fields = {}) => ({
  scheduledTime: new Date(Date.UTC(2026, 10, 24, 0, 31) + i * HOUR).toISOString(),
  coreSha256: '0123456789abcdef'.repeat(4),
  key: 'stats/downloads.json',
  written: false,
  github: 'rate-limited',
  analytics: 'not-read',
  bucket: 'ok',
  failure: `page 1 of GitHub's releases answered HTTP 403 for its rate limit (run ${i})`,
  r2Cursor: null,
  ...fields
})
const record = (runs) => json({ schemaVersion: 1, runs })

/** A watch whose download host answers `answers` (URL -> a function answering a Response, or throwing) */
async function watch(answers, { now = NOW, env = { DOWNLOAD_HOST: HOST } } = {}) {
  const lines = []
  const requested = []
  const fetch = async (url, init) => {
    requested.push(url)
    assert.ok(init?.signal instanceof AbortSignal, `${url} is read with no time limit`)
    const answer = answers[url] ?? (() => text('not here', 404))
    return answer()
  }
  const code = await main(env, { fetch, now: () => now, log: (line) => lines.push(line) })
  return { code, lines, requested }
}

// Failure G8: a statistics file brought up to date passes, and the run record is not read
test('a statistics file updated within the last 6 hours passes the watch, which reads nothing else', async () => {
  const { code, lines, requested } = await watch({ [STATISTICS]: () => statisticsAt('2026-11-25T11:47:12.000Z') })
  assert.equal(code, 0)
  assert.deepEqual(lines, [`The statistics file at ${STATISTICS} was last updated at 2026-11-25T11:47:12.000Z, as of 2026-11-25T12:47:30.000Z`])
  assert.deepEqual(requested, [STATISTICS])
})

// Failure G8: every answer that shows the collection may have stopped fails the watch, naming what the file showed
test('a statistics file that cannot be read, is not JSON, is not of schema 1 or has no UTC updatedAt fails the watch', async () => {
  const cases = [
    ['HTTP 404', () => text('not here', 404), 'answered HTTP 404'],
    ['HTTP 500', () => text('upstream error', 500), 'answered HTTP 500'],
    ['the host out of reach', () => { throw new TypeError('fetch failed') }, 'could not be read: fetch failed'],
    ['a body that is not JSON', () => text('{"schemaVersion": 1,'), 'is not JSON'],
    ['schemaVersion 2', () => json({ ...writtenFile(), schemaVersion: 2 }), 'has schemaVersion 2, not 1'],
    ['no schemaVersion', () => json({ updatedAt: '2026-11-25T11:47:12.000Z' }), 'has schemaVersion none, not 1'],
    ['a body of null', () => text('null'), 'has schemaVersion none, not 1'],
    // Approved by the dispatcher (2026-11-25): an updatedAt that is absent or not a UTC time fails closed
    ['no updatedAt', () => json({ schemaVersion: 1 }), 'has updatedAt none, not a UTC time'],
    ['an updatedAt in another time zone', () => statisticsAt('2026-11-25T19:47:12+08:00'), 'has updatedAt "2026-11-25T19:47:12+08:00", not a UTC time'],
    ['an updatedAt that is no time', () => statisticsAt('yesterday'), 'has updatedAt "yesterday", not a UTC time'],
    // What the file holds reaches the error's message with GitHub's escapes, so that it shows as it is written
    ['an updatedAt holding an escape', () => statisticsAt('50%0A::error::x'), 'has updatedAt "50%250A::error::x", not a UTC time']
  ]
  for (const [label, answer, reason] of cases) {
    const { code, lines } = await watch({ [STATISTICS]: answer, [RUNS]: () => record([entry(0)]) })
    assert.equal(code, 1, label)
    assert.equal(lines[0], `::error::The statistics file at ${STATISTICS} ${reason}: the download count may have stopped (docs/ops/download-count.md, "When the watchdog fails")`, label)
  }
})

// Failure G8's two limits, each on both sides: 6 hours before the clock and 5 minutes after it
test('the watch takes an updatedAt from 6 hours before its clock to 5 minutes after it, and fails one beyond either', async () => {
  const cases = [
    ['6 hours before', NOW - 6 * HOUR, 0],
    ['6 hours and 1 ms before', NOW - 6 * HOUR - 1, 1],
    ['5 minutes after', NOW + 5 * MINUTE, 0],
    ['5 minutes and 1 ms after', NOW + 5 * MINUTE + 1, 1]
  ]
  for (const [label, updated, expected] of cases) {
    const { code } = await watch({ [STATISTICS]: () => statisticsAt(new Date(updated).toISOString()), [RUNS]: () => record([entry(0)]) })
    assert.equal(code, expected, label)
  }
  assert.deepEqual(judge({ status: 200, body: JSON.stringify({ ...writtenFile(), updatedAt: '2026-11-25T06:47:29.999Z' }) }, NOW), {
    fresh: false, reason: 'was last updated at 2026-11-25T06:47:29.999Z, more than 6 hours before 2026-11-25T12:47:30.000Z'
  })
  assert.deepEqual(judge({ status: 200, body: JSON.stringify({ ...writtenFile(), updatedAt: '2026-11-25T12:52:30.001Z' }) }, NOW), {
    fresh: false, reason: 'was last updated at 2026-11-25T12:52:30.001Z, more than 5 minutes after 2026-11-25T12:47:30.000Z'
  })
})

// Failure G8: which spellings of an instant the watch reads as a UTC time. The watchdog holds its own test of it (ADR-0058),
// which must keep to the form the files write their instants in: ISO 8601, UTC, to the second or the millisecond, and an
// instant that exists. The expected answers are the core's at the commit this repository last held it (origin/main at
// 6dd517fb), run over the same values.
const judged = (updatedAt) => judge({ status: 200, body: JSON.stringify({ ...writtenFile(), updatedAt }) }, NOW)

test('the watch reads an updatedAt written in UTC to the second or the millisecond as a time, and judges its age', () => {
  const clock = '2026-11-25T12:47:30.000Z'
  const cases = [
    // The second form, which the existing cases never use (they write the millisecond, a non-zero one included)
    ['to the second', '2026-11-25T11:47:12Z', { fresh: true, updatedAt: '2026-11-25T11:47:12Z' }],
    // A year no instant of the files has: the form allows any four digits
    ['the last millisecond of year 9999', '9999-12-31T23:59:59.999Z', {
      fresh: false, reason: `was last updated at 9999-12-31T23:59:59.999Z, more than 5 minutes after ${clock}`
    }]
  ]
  for (const [label, updatedAt, expected] of cases) assert.deepEqual(judged(updatedAt), expected, label)
})

test('the watch refuses an updatedAt that is not an instant written in UTC to the second or the millisecond', () => {
  const cases = [
    ['no zone', '2026-11-25T11:47:12'],
    ['an offset of zero', '2026-11-25T11:47:12+00:00'],
    ['a lowercase z', '2026-11-25T11:47:12z'],
    ['one digit of a second', '2026-11-25T11:47:12.1Z'],
    ['six digits of a second', '2026-11-25T11:47:12.123456Z'],
    ['the 30th of February', '2026-02-30T00:00:00Z'],
    ['a 29th of February in a year that has none', '2023-02-29T00:00:00Z'],
    ['hour 24', '2026-11-25T24:00:00Z'],
    ['month 13', '2026-13-01T00:00:00Z'],
    ['second 60', '2026-11-25T11:47:60Z'],
    // The date parser reads an instant with a NUL after it, so only the form's end keeps it out
    ['a NUL after it', `2026-11-25T11:47:12Z${String.fromCharCode(0)}`]
  ]
  for (const [label, updatedAt] of cases) {
    const verdict = judged(updatedAt)
    assert.equal(verdict.fresh, false, label)
    assert.match(verdict.reason, /^has updatedAt .+, not a UTC time$/, label)
  }
})

// Failure G8: the failed run shows the run record's newest 24 entries
test('a failing watch prints the run record\'s newest 24 entries, oldest first', async () => {
  const runs = Array.from({ length: 30 }, (_, i) => entry(i))
  const { code, lines } = await watch({ [STATISTICS]: () => statisticsAt('2026-11-25T01:47:12.000Z'), [RUNS]: () => record(runs) })
  assert.equal(code, 1)
  assert.equal(lines.length, 26)
  assert.equal(lines[1], `The run record's newest 24 entries, oldest first, from ${RUNS}:`)
  assert.deepEqual(lines.slice(2).map((line) => JSON.parse(line).scheduledTime), Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 10, 24, 6, 31) + i * HOUR).toISOString()))
  assert.deepEqual(lines.slice(2).map((line) => JSON.parse(line)), runs.slice(6))
})

// Failure E4: an entry's failure quotes what GitHub, Cloudflare or the bucket answered, and is printed whole on one line
test('each entry prints as one line of JSON, whatever its failure holds', async () => {
  const runs = [
    entry(0, { failure: '::error::GitHub answered this' }),
    entry(1, { failure: 'a reason\n::warning file=x::on its own line' }),
    entry(2, { failure: 'a reason\r::notice::after a carriage return' }),
    entry(3, { failure: `a reason${String.fromCharCode(0x2028)}::error::after a line separator${String.fromCharCode(0x2029)}and a paragraph separator` })
  ]
  const { lines } = await watch({ [STATISTICS]: () => text('not here', 404), [RUNS]: () => record(runs) })
  const printed = lines.slice(2)
  assert.equal(printed.length, 4)
  for (const [i, line] of printed.entries()) {
    assert.equal(line[0], '{', `entry ${i}`)
    assert.doesNotMatch(line, LINE_BREAKS, `entry ${i}`)
    assert.deepEqual(JSON.parse(line), runs[i], `entry ${i}`)
  }
  assert.doesNotMatch(lines[0], LINE_BREAKS)
})

// Approved by the dispatcher (2026-11-25): a run record that cannot be read gets a line saying so, and the watch fails
// on the statistics file alone, as it would have
test('a run record that cannot be read is named on one line, and the watch still fails', async () => {
  const cases = [
    ['HTTP 404', () => text('not here', 404), 'answered HTTP 404'],
    ['not JSON', () => text('{"schemaVersion": 1,'), 'is not JSON'],
    ['runs not a list', () => json({ schemaVersion: 1, runs: {} }), 'holds no list of runs'],
    ['out of reach', () => { throw new TypeError('fetch failed') }, 'fetch failed']
  ]
  for (const [label, answer, reason] of cases) {
    const { code, lines } = await watch({ [STATISTICS]: () => text('upstream error', 500), [RUNS]: answer })
    assert.equal(code, 1, label)
    assert.deepEqual(lines.slice(1), [`The run record at ${RUNS} could not be read: ${reason}`], label)
  }
})

test('a watch without the download host fails and reads nothing', async () => {
  for (const env of [{}, { DOWNLOAD_HOST: '' }]) {
    const { code, lines, requested } = await watch({}, { env })
    assert.equal(code, 1)
    assert.deepEqual(lines, ['::error::DOWNLOAD_HOST is not set'])
    assert.deepEqual(requested, [])
  }
})

// The script as the workflow runs it: its exit code, its output, and the download host it is given
const SCRIPT = fileURLToPath(new URL('./download-count-watchdog.mjs', import.meta.url))
const runScript = (env) => new Promise((resolve) => {
  execFile(process.execPath, [SCRIPT], { env, encoding: 'utf8', timeout: 30_000 }, (error, stdout) => resolve({ code: error ? error.code : 0, stdout }))
})

test('the script exits 1 on a stale file, printing the error and the entries line by line, and 0 on a current one', async (t) => {
  let updatedAt
  const runs = [entry(0, { failure: 'a reason\n::error::injected' }), entry(1)]
  const server = createServer((request, response) => {
    const body = request.url === '/stats/downloads.json'
      ? JSON.stringify({ ...writtenFile(), updatedAt: updatedAt() })
      : request.url === '/stats/worker-runs.json' ? JSON.stringify({ schemaVersion: 1, runs }) : null
    response.writeHead(body === null ? 404 : 200, { 'content-type': 'application/json' })
    response.end(body ?? 'not here')
  })
  const port = await listening(server)
  t.after(() => server.close())
  const host = `http://127.0.0.1:${port}`

  updatedAt = () => '2026-01-01T00:00:00.000Z'
  const stale = await runScript({ DOWNLOAD_HOST: host })
  assert.equal(stale.code, 1)
  const lines = stale.stdout.split('\n')
  assert.match(lines[0], new RegExp(`^::error::The statistics file at ${host}/stats/downloads\\.json was last updated at 2026-01-01T00:00:00\\.000Z, more than 6 hours before `))
  assert.equal(lines[1], `The run record's newest 2 entries, oldest first, from ${host}/stats/worker-runs.json:`)
  assert.deepEqual(lines.slice(2, 4).map((line) => JSON.parse(line)), runs)
  assert.deepEqual(lines.slice(4), [''])

  updatedAt = () => new Date().toISOString()
  const current = await runScript({ DOWNLOAD_HOST: host })
  assert.equal(current.code, 0)
  assert.match(current.stdout, new RegExp(`^The statistics file at ${host}/stats/downloads\\.json was last updated at `))

  const unset = await runScript({})
  assert.equal(unset.code, 1)
  assert.equal(unset.stdout, '::error::DOWNLOAD_HOST is not set\n')
})
