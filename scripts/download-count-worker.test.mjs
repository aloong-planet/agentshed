// The download count's Worker in the shadow period (landing-page::REQ-011, Failures G1 to G5, G9 and G10,
// Implementation Decisions "The collection", "The run record" and "The shadow period"; ADR-0056): a run driven through
// the Worker's run(), with the bucket's binding (scripts/testing/r2-binding.mjs), GitHub and the analytics
// (scripts/testing/download-count-sources.mjs) standing in at the system boundary and the clock fixed.
//
// Gaps: nothing here runs in Cloudflare, and a run in production shows only its own case (docs/ops/download-count.md).
// - The real binding: whether put enforces etagMatches and If-None-Match: *, and how its listing cuts pages, come from
//   Cloudflare's docs only (the stand-in's header). The first shadow write shows that put accepts If-None-Match: *;
//   a write refused by either condition, or a listing of more than one page, is seen only if one happens.
// - workerd: the fetch the handler passes calls the runtime's own at call time, as its own case shows, but whether a
//   detached fetch would throw there cannot be seen in Node; a production run that reads its sources shows that the
//   passed one works.
// - Workers Free's 10 ms of CPU and 50 subrequests a run: the first runs, seeded from a recent statistics file, read
//   one range of traffic over a run record of a few entries. The heaviest runs are seen only when they happen: one
//   that catches up over the analytics' whole hold, a range for every maxDuration of it besides GitHub's pages (and
//   the binding's calls, if Cloudflare counts them as subrequests), and one that rewrites a run record of 336
//   entries, from about the shadow period's fourteenth day.
// - The Cron Trigger firing every hour (landing-page::REQ-011/AC-04): the run record after the apply.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r2Binding } from './testing/r2-binding.mjs'
import { copyOf, DMG_KEY, json, NOW, REAL_ASSETS, REAL_RELEASES, sources, text, writtenFile } from './testing/download-count-sources.mjs'
import worker, { run, validateRuns } from './download-count-worker.mjs'
import { imports } from './testing/module-imports.mjs'

const CORE = '0123456789abcdef'.repeat(4)
// The Cron Trigger fires at 09:47:00; the run reads its clock at 09:47:12
const SCHEDULED = Date.UTC(2026, 10, 22, 9, 47, 0)

const settings = (bucket) => ({
  BUCKET: bucket,
  CF_ANALYTICS_API_TOKEN: 'cf-token',
  CF_ZONE_ID: 'zone-tag',
  DOWNLOAD_HOST: 'https://dl.agentshed.aloongplanet.com',
  GITHUB_REPOSITORY: 'aloong-planet/agentshed',
  CORE_SHA256: CORE
})

const asText = (file) => `${JSON.stringify(file, null, 2)}\n`
const fileOf = (bucket, key) => JSON.parse(bucket.peek(key).text)

/** A run of the Worker on a bucket, with the sources' stand-ins; what it printed is in `lines` */
async function runOn(bucket, { env = {}, scheduledTime = SCHEDULED, now = NOW, ...world } = {}) {
  const requests = []
  const lines = []
  const deps = { fetch: sources({ ...world, requests }), now: () => now, log: (line) => lines.push(line), error: (line) => lines.push(line) }
  const settled = run({ scheduledTime, cron: '47 * * * *' }, { ...settings(bucket), ...env }, deps)
  return { settled, requests, lines }
}

// "The shadow period": while the shadow file is absent the Worker starts from the statistics file, which it never
// writes, and records it as the seed
test('a first shadow run starts from the statistics file, writes the shadow file and records the seed and the run', async () => {
  const statistics = asText({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' })
  const bucket = r2Binding({ objects: { 'stats/downloads.json': statistics, [DMG_KEY]: { size: 1000 } } })
  const before = bucket.peek('stats/downloads.json')
  const { settled } = await runOn(bucket, { traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }] } })
  await settled

  const shadow = bucket.peek('stats/downloads-shadow.json')
  assert.deepEqual(shadow.httpMetadata, { contentType: 'application/json', cacheControl: 'public, max-age=300' })
  assert.deepEqual(JSON.parse(shadow.text), {
    schemaVersion: 1,
    updatedAt: '2026-11-22T09:47:12.000Z',
    r2Cursor: '2026-11-22T09:00:00Z',
    r2Gaps: [{ from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }],
    // GitHub's 20 (the real answer's counts, each above or equal to the file's) and 3500 bytes over 1000
    summary: { total: 23.5, sources: { github: 20, r2: 3.5 } },
    github: {
      assets: {
        771176132: { name: 'Agentshed-0.1.0-beta.9-mac-arm64.dmg', downloads: 2 },
        716218198: { name: 'Agentshed-0.1.0-beta.8-mac-arm64.dmg', downloads: 2 },
        714192334: { name: 'Agentshed-0.1.0-beta.7-mac-arm64.dmg', downloads: 2 },
        712587166: { name: 'Agentshed-0.1.0-beta.6-mac-arm64.dmg', downloads: 2 },
        711706094: { name: 'Agentshed-0.1.0-beta.5-mac-arm64.dmg', downloads: 2 },
        708189336: { name: 'Agentshed-0.1.0-beta.4-mac-arm64.dmg', downloads: 2 },
        691524290: { name: 'Agentshed-0.1.0-beta.3-mac-arm64.dmg', downloads: 2 },
        682397225: { name: 'Agentshed-0.1.0-beta.2-mac-arm64.dmg', downloads: 3 },
        665347607: { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads: 3 }
      }
    },
    r2: { objects: { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 3500 } } }
  })
  assert.equal(bucket.peek('stats/downloads.json'), before)

  const record = bucket.peek('stats/worker-runs.json')
  assert.deepEqual(record.httpMetadata, { contentType: 'application/json', cacheControl: 'public, max-age=300' })
  assert.deepEqual(JSON.parse(record.text), {
    schemaVersion: 1,
    seed: { at: '2026-11-22T09:47:12.000Z', r2Cursor: '2026-11-22T08:00:00Z', r2Bytes: 2500 },
    runs: [{
      scheduledTime: '2026-11-22T09:47:00.000Z',
      coreSha256: CORE,
      key: 'stats/downloads-shadow.json',
      written: true,
      github: 'ok',
      analytics: 'ok',
      bucket: 'ok',
      failure: null,
      r2Cursor: '2026-11-22T09:00:00Z'
    }]
  })
})

/** A run record entry for a run that wrote the shadow file, at a scheduled time and cursor */
const wrote = (scheduledTime, r2Cursor) => ({
  scheduledTime, coreSha256: CORE, key: 'stats/downloads-shadow.json', written: true, github: 'ok', analytics: 'ok', bucket: 'ok', failure: null, r2Cursor
})

// Failure G4 and Failure G1's start over: neither file in the bucket, nothing mirrored yet
test('a shadow run with neither file in the bucket starts the count over, with no seed and a download host share of zero', async () => {
  const bucket = r2Binding()
  const { settled } = await runOn(bucket)
  await settled
  const shadow = fileOf(bucket, 'stats/downloads-shadow.json')
  assert.deepEqual([shadow.r2Cursor, shadow.r2Gaps, shadow.r2.objects, shadow.summary], ['2026-11-22T09:00:00Z', [], {}, { total: 20, sources: { github: 20, r2: 0 } }])
  assert.deepEqual(shadow.github.assets, REAL_ASSETS)
  assert.equal(bucket.peek('stats/downloads.json'), undefined)
  const record = fileOf(bucket, 'stats/worker-runs.json')
  assert.equal(record.seed, null)
  assert.deepEqual(record.runs, [wrote('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z')])
})

test('a shadow run with the shadow file in the bucket builds on it, leaving the statistics file and the seed as they were', async () => {
  const seed = { at: '2026-11-21T10:47:12.000Z', r2Cursor: '2026-11-21T10:00:00Z', r2Bytes: 100 }
  const earlier = wrote('2026-11-22T08:47:00.000Z', '2026-11-22T08:00:00Z')
  const statistics = asText({
    ...writtenFile(),
    r2Cursor: '2026-11-22T07:00:00Z',
    summary: { total: 14, sources: { github: 5, r2: 9 } },
    r2: { objects: { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 9000 } } }
  })
  const bucket = r2Binding({
    objects: {
      'stats/downloads.json': statistics,
      'stats/downloads-shadow.json': asText({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' }),
      'stats/worker-runs.json': asText({ schemaVersion: 1, seed, runs: [earlier] }),
      [DMG_KEY]: { size: 1000 }
    }
  })
  const before = bucket.peek('stats/downloads.json')
  const { settled, requests } = await runOn(bucket, { traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }] } })
  await settled

  const shadow = fileOf(bucket, 'stats/downloads-shadow.json')
  assert.equal(shadow.r2Cursor, '2026-11-22T09:00:00Z')
  assert.deepEqual(shadow.r2.objects[DMG_KEY], { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 3500 })
  assert.deepEqual(requests.filter(({ to }) => to === 'traffic').map(({ variables }) => variables.filter.datetime_geq), ['2026-11-22T08:00:00Z'])
  // The Worker's settings reach the analytics: its token, its zone, and the download host's name as the traffic's host
  const analytics = requests.filter(({ to }) => to === 'settings' || to === 'traffic')
  assert.deepEqual(analytics.map(({ to, headers, variables }) => [to, headers.authorization, variables.zoneTag, variables.filter?.clientRequestHTTPHost]), [
    ['settings', 'Bearer cf-token', 'zone-tag', undefined],
    ['traffic', 'Bearer cf-token', 'zone-tag', 'dl.agentshed.aloongplanet.com']
  ])
  assert.equal(bucket.peek('stats/downloads.json'), before)
  assert.deepEqual(fileOf(bucket, 'stats/worker-runs.json'), { schemaVersion: 1, seed, runs: [earlier, wrote('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z')] })
})

// "The collection": GitHub's releases without a token and with a User-Agent, every page
test("a shadow run reads every page of GitHub's releases without a token and with the collection's User-Agent", async () => {
  const copies = Array.from({ length: 241 }, (_, i) => copyOf(`v0.2.${i}`, { dmgDownloads: 1, idBase: 800000000 + i * 10 }))
  const bucket = r2Binding()
  const { settled, requests } = await runOn(bucket, { releases: [...REAL_RELEASES, ...copies] })
  await settled
  const pages = requests.filter(({ to }) => to === 'github')
  assert.deepEqual(pages.map(({ page }) => page), [1, 2, 3])
  for (const { headers } of pages) {
    assert.equal('authorization' in headers, false)
    assert.equal(headers['user-agent'], 'agentshed-download-count')
  }
  assert.equal(fileOf(bucket, 'stats/downloads-shadow.json').summary.sources.github, 261)
})

// "The collection" (the listing under releases/, every page of it) and landing-page::REQ-011/AC-03: a binding that
// answers one object a page, and leaves a recorded DMG out of its listing
test('a shadow run counts the DMGs on every page of the listing, and a recorded DMG left out of it keeps its bytes', async () => {
  const dmg = (version) => `releases/v${version}/Agentshed-${version}-mac-arm64.dmg`
  const name = (version) => `Agentshed-${version}-mac-arm64.dmg`
  const shadow = {
    ...writtenFile(),
    r2Cursor: '2026-11-22T08:00:00Z',
    r2Gaps: [],
    summary: { total: 4, sources: { github: 0, r2: 4 } },
    github: { assets: {} },
    r2: { objects: { [dmg('0.1.9')]: { name: name('0.1.9'), size: 1000, bytes: 4000 } } }
  }
  const bucket = r2Binding({
    objects: {
      'stats/downloads-shadow.json': asText(shadow),
      [dmg('0.1.9')]: { size: 1000 },
      [dmg('0.2.0')]: { size: 1000 },
      [dmg('0.2.1')]: { size: 1000 },
      [dmg('0.2.2')]: { size: 1000 }
    },
    pageSize: 1,
    unlisted: [dmg('0.1.9')]
  })
  const rows = [['0.1.9', 500], ['0.2.0', 1000], ['0.2.1', 2000], ['0.2.2', 3000]].map(([version, bytes]) => ({ path: `/${dmg(version)}`, bytes }))
  const { settled } = await runOn(bucket, { traffic: { '2026-11-22T08:00:00Z': rows } })
  await settled
  const written = fileOf(bucket, 'stats/downloads-shadow.json')
  assert.deepEqual(written.r2.objects, {
    [dmg('0.1.9')]: { name: name('0.1.9'), size: 1000, bytes: 4500 },
    [dmg('0.2.0')]: { name: name('0.2.0'), size: 1000, bytes: 1000 },
    [dmg('0.2.1')]: { name: name('0.2.1'), size: 1000, bytes: 2000 },
    [dmg('0.2.2')]: { name: name('0.2.2'), size: 1000, bytes: 3000 }
  })
  assert.deepEqual(written.summary, { total: 30.5, sources: { github: 20, r2: 10.5 } })
})

const SHADOW_AT_EIGHT = asText({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' })
const failedEntry = (outcomes) => ({
  scheduledTime: '2026-11-22T09:47:00.000Z', coreSha256: CORE, key: 'stats/downloads-shadow.json', written: false, ...outcomes, r2Cursor: null
})
const NOT_READ = { github: 'not-read', analytics: 'not-read', bucket: 'not-read' }
const githubAnswers = (response) => ({ answer: { github: () => response() } })

// Failures G1, G2 and G5 through a shadow run, and "The run record": a run that fails writes no shadow file and
// records which source failed it, and how, with what failed it
test('a shadow run in which any read fails writes nothing, and records each source as it stood and what failed it', async () => {
  const cases = [
    ['GitHub refusing for its rate limit, no request left', githubAnswers(() => json({ message: 'API rate limit exceeded for 203.0.113.7.' }, 403, { 'x-ratelimit-remaining': '0' })),
      { github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }, /^page 1 of GitHub's releases answered HTTP 403 for its rate limit$/],
    ['GitHub answering 429, no request left', githubAnswers(() => json({ message: 'Too many requests' }, 429, { 'x-ratelimit-remaining': '0' })),
      { github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }, /answered HTTP 429 for its rate limit$/],
    ['GitHub naming a secondary rate limit', githubAnswers(() => json({ message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' }, 403, { 'x-ratelimit-remaining': '41' })),
      { github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }, /answered HTTP 403 for its rate limit$/],
    ['GitHub refusing for anything else', githubAnswers(() => json({ message: 'Resource not accessible' }, 403, { 'x-ratelimit-remaining': '41' })),
      { github: 'failed', analytics: 'not-read', bucket: 'ok' }, /^page 1 of GitHub's releases answered HTTP 403$/],
    ['GitHub answering 500', githubAnswers(() => json({ message: 'Server Error' }, 500)),
      { github: 'failed', analytics: 'not-read', bucket: 'ok' }, /^page 1 of GitHub's releases answered HTTP 500$/],
    ['GitHub out of reach', githubAnswers(() => { throw new TypeError('fetch failed') }),
      { github: 'failed', analytics: 'not-read', bucket: 'ok' }, /^fetch failed$/],
    ["the analytics' traffic answering 500", { answer: { traffic: () => text('upstream error', 500) } },
      { github: 'ok', analytics: 'failed', bucket: 'ok' }, /^Cloudflare's analytics answered HTTP 500$/],
    ['the shadow file that cannot be read', { failing: { get: (key) => (key === 'stats/downloads-shadow.json' ? new Error('R2 get failed: InternalError') : undefined) } },
      { github: 'not-read', analytics: 'not-read', bucket: 'failed' }, /^R2 get failed: InternalError$/],
    ['the listing under releases/ failing', { failing: { list: (prefix) => (prefix === 'releases/' ? new Error('R2 list failed: InternalError') : undefined) } },
      { github: 'ok', analytics: 'not-read', bucket: 'failed' }, /^R2 list failed: InternalError$/],
    ['the shadow file that is not JSON', { objects: { 'stats/downloads-shadow.json': '{"schemaVersion": 1,' } },
      { github: 'not-read', analytics: 'not-read', bucket: 'failed' }, /is not JSON$/],
    ['the statistics file of another schema while the shadow file is absent',
      { objects: { 'stats/downloads-shadow.json': undefined, 'stats/downloads.json': asText({ ...writtenFile(), schemaVersion: 2 }) } },
      { github: 'not-read', analytics: 'not-read', bucket: 'failed' }, /has schemaVersion 2, not 1$/],
    ['a mirrored DMG at another size than recorded', { objects: { [DMG_KEY]: { size: 999 } } },
      { github: 'ok', analytics: 'ok', bucket: 'failed' }, /is 999 bytes in the bucket, not the 1000 recorded$/],
    ['the write of the shadow file failing', { failing: { put: (key) => (key === 'stats/downloads-shadow.json' ? new Error('R2 put failed: InternalError') : undefined) } },
      { github: 'ok', analytics: 'ok', bucket: 'failed' }, /^R2 put failed: InternalError$/],
    ['a setting missing', { env: { CF_ZONE_ID: undefined } }, NOT_READ, /^CF_ZONE_ID is not set$/]
  ]
  for (const [label, { objects = {}, failing, ...world }, outcomes, reason] of cases) {
    const held = Object.fromEntries(Object.entries({ 'stats/downloads-shadow.json': SHADOW_AT_EIGHT, [DMG_KEY]: { size: 1000 }, ...objects }).filter(([, value]) => value !== undefined))
    const bucket = r2Binding({ objects: held, failing })
    const before = bucket.peek('stats/downloads-shadow.json')
    const { settled, lines } = await runOn(bucket, { traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }] }, ...world })
    await assert.rejects(settled, (error) => reason.test(error.message), label)
    assert.equal(bucket.peek('stats/downloads-shadow.json'), before, label)
    const [entry] = fileOf(bucket, 'stats/worker-runs.json').runs
    const { failure, ...fields } = entry
    assert.deepEqual(fields, failedEntry(outcomes), label)
    assert.match(failure, reason, label)
    assert.deepEqual(lines, [`[download-count] ${failure}`], label)
  }
})

// Failure G10: a write only replaces the object the run read, and creates one only where there was none
test('a shadow run that finds its file changed or created since it read the bucket writes nothing over it', async () => {
  const theirs = asText({ ...writtenFile(), updatedAt: '2026-11-22T09:47:30.000Z' })
  const another = (only) => (key, bucket) => { if (key === only) bucket.write(key, theirs) }
  const cases = [
    ['the shadow file changed since the run read it', { 'stats/downloads-shadow.json': SHADOW_AT_EIGHT }, another('stats/downloads-shadow.json')],
    ['the shadow file created since the run found none', { 'stats/downloads.json': SHADOW_AT_EIGHT }, another('stats/downloads-shadow.json')]
  ]
  for (const [label, objects, beforePut] of cases) {
    const bucket = r2Binding({ objects: { ...objects, [DMG_KEY]: { size: 1000 } }, beforePut })
    const { settled } = await runOn(bucket)
    await assert.rejects(settled, /^Error: stats\/downloads-shadow\.json changed in the bucket since the run read it$/, label)
    assert.equal(bucket.peek('stats/downloads-shadow.json').text, theirs, label)
    const { runs: [entry] } = fileOf(bucket, 'stats/worker-runs.json')
    assert.deepEqual([entry.written, entry.github, entry.analytics, entry.bucket], [false, 'ok', 'ok', 'failed'], label)
  }

  const record = asText({ schemaVersion: 1, seed: null, runs: [] })
  const bucket = r2Binding({ objects: { 'stats/downloads-shadow.json': SHADOW_AT_EIGHT, [DMG_KEY]: { size: 1000 } }, beforePut: (key, b) => { if (key === 'stats/worker-runs.json') b.write(key, record) } })
  const { settled } = await runOn(bucket)
  await assert.rejects(settled, /^Error: the run's entry was not appended to stats\/worker-runs\.json: stats\/worker-runs\.json changed in the bucket since the run read it$/)
  assert.equal(bucket.peek('stats/worker-runs.json').text, record)
  assert.equal(fileOf(bucket, 'stats/downloads-shadow.json').r2Cursor, '2026-11-22T09:00:00Z')
})

// Failure G3: the Worker's ACCEPT_GAP_FROM accepts the gap of the run whose cursor equals it, and of no other
test('a shadow run accepts a stale cursor only when ACCEPT_GAP_FROM is that cursor', async () => {
  const stale = asText({ ...writtenFile(), r2Cursor: '2026-10-01T00:00:00Z', r2Gaps: [] })
  const cases = [
    ['the cursor', '2026-10-01T00:00:00Z', null],
    ['another hour', '2026-10-02T00:00:00Z', /the cursor 2026-10-01T00:00:00Z is older than 2026-10-22T10:00:00Z/],
    ['empty', '', /is older than/],
    ['unset', undefined, /is older than/]
  ]
  for (const [label, from, refused] of cases) {
    const bucket = r2Binding({ objects: { 'stats/downloads-shadow.json': stale, [DMG_KEY]: { size: 1000 } } })
    const { settled } = await runOn(bucket, { env: { ACCEPT_GAP_FROM: from } })
    if (refused) {
      await assert.rejects(settled, refused, label)
      assert.equal(bucket.peek('stats/downloads-shadow.json').text, stale, label)
      // A refused gap fails no read: every source answered
      const [entry] = fileOf(bucket, 'stats/worker-runs.json').runs
      assert.deepEqual([entry.written, entry.github, entry.analytics, entry.bucket], [false, 'ok', 'ok', 'ok'], label)
      continue
    }
    await settled
    const shadow = fileOf(bucket, 'stats/downloads-shadow.json')
    assert.deepEqual(shadow.r2Gaps, [{ from: '2026-10-01T00:00:00Z', to: '2026-10-22T10:00:00Z' }], label)
    assert.equal(shadow.r2Cursor, '2026-11-22T09:00:00Z', label)
  }
})

// Failure G9: a run record that cannot be read, or is not one, is left as it is; the shadow file is still written
test('a run record that cannot be read or is not one is left as it is, while the shadow file is written and the run fails', async () => {
  const { coreSha256, ...missingField } = wrote('2026-11-22T08:47:00.000Z', '2026-11-22T08:00:00Z')
  const cases = [
    ['cannot be read', null, /: R2 get failed: InternalError$/],
    ['not JSON', '{"schemaVersion": 1,', /: the run record is not JSON$/],
    ['schemaVersion 2', asText({ schemaVersion: 2, seed: null, runs: [] }), /: the run record has schemaVersion 2, not 1$/],
    ['an entry missing a field', asText({ schemaVersion: 1, seed: null, runs: [missingField] }), /: the run record has a run that is not one: entry 0$/]
  ]
  assert.equal(coreSha256, CORE)
  for (const [label, record, reason] of cases) {
    const failing = record === null ? { get: (key) => (key === 'stats/worker-runs.json' ? new Error('R2 get failed: InternalError') : undefined) } : {}
    const objects = { 'stats/downloads-shadow.json': SHADOW_AT_EIGHT, [DMG_KEY]: { size: 1000 }, ...(record === null ? { 'stats/worker-runs.json': '{}' } : { 'stats/worker-runs.json': record }) }
    const bucket = r2Binding({ objects, failing })
    const before = bucket.peek('stats/worker-runs.json')
    const { settled } = await runOn(bucket)
    await assert.rejects(settled, (error) => error.message.startsWith("the run's entry was not appended to stats/worker-runs.json") && reason.test(error.message), label)
    assert.equal(bucket.peek('stats/worker-runs.json'), before, label)
    assert.equal(fileOf(bucket, 'stats/downloads-shadow.json').r2Cursor, '2026-11-22T09:00:00Z', label)
  }
})

test('a Worker without its pinned core hash or its bucket reads and writes nothing, and fails', async () => {
  const cases = [
    ['a hash in capitals', { CORE_SHA256: CORE.toUpperCase() }, /^CORE_SHA256 is not 64 lowercase hex digits$/],
    ['a hash one digit short', { CORE_SHA256: CORE.slice(1) }, /^CORE_SHA256 is not 64 lowercase hex digits$/],
    ['no hash', { CORE_SHA256: undefined }, /^CORE_SHA256 is not 64 lowercase hex digits$/],
    ['no bucket', { BUCKET: undefined }, /^BUCKET is not bound$/]
  ]
  for (const [label, env, reason] of cases) {
    const bucket = r2Binding({ objects: { 'stats/downloads-shadow.json': SHADOW_AT_EIGHT } })
    const before = bucket.peek('stats/downloads-shadow.json')
    const { settled, requests } = await runOn(bucket, { env })
    await assert.rejects(settled, (error) => reason.test(error.message), label)
    assert.deepEqual(requests, [], label)
    assert.equal(bucket.peek('stats/downloads-shadow.json'), before, label)
    assert.equal(bucket.peek('stats/worker-runs.json'), undefined, label)
  }
})

// "The run record": the newest 336 runs
test('a run appended to a full run record drops the oldest run', async () => {
  const hour = (i) => new Date(Date.UTC(2026, 10, 8, 9, 47) + i * 3_600_000).toISOString()
  const runs = Array.from({ length: 336 }, (_, i) => ({ ...wrote(hour(i), '2026-11-22T08:00:00Z'), r2Cursor: new Date(Date.UTC(2026, 10, 8, 9) + i * 3_600_000).toISOString().replace('.000Z', 'Z') }))
  const bucket = r2Binding({ objects: { 'stats/downloads-shadow.json': SHADOW_AT_EIGHT, 'stats/worker-runs.json': asText({ schemaVersion: 1, seed: null, runs }) } })
  const { settled } = await runOn(bucket)
  await settled
  const record = fileOf(bucket, 'stats/worker-runs.json')
  assert.equal(record.runs.length, 336)
  assert.equal(record.runs[0].scheduledTime, '2026-11-08T10:47:00.000Z')
  assert.equal(record.runs.at(-2).scheduledTime, '2026-11-22T08:47:00.000Z')
  assert.deepEqual(record.runs.at(-1), wrote('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z'))
})

// "The run record": a failure is never a credential, even where an answer quotes the token
test("a failure that quotes the analytics token is recorded, printed and thrown without it", async () => {
  const token = 'cf-0123456789-secret'
  const bucket = r2Binding({ objects: { 'stats/downloads-shadow.json': SHADOW_AT_EIGHT } })
  const echo = () => json({ data: null, errors: [{ message: `the token ${token} is not authorized for zone-tag; ${token}` }] })
  const { settled, lines } = await runOn(bucket, { env: { CF_ANALYTICS_API_TOKEN: token }, answer: { settings: echo } })
  const error = await settled.then(() => null, (rejection) => rejection)
  const { failure } = fileOf(bucket, 'stats/worker-runs.json').runs[0]
  assert.equal(failure, "Cloudflare's analytics answered with errors: the token [the analytics token] is not authorized for zone-tag; [the analytics token]")
  assert.equal(error.message, failure)
  assert.deepEqual(lines, [`[download-count] ${failure}`])
})

test("a run record is taken only when it matches the spec's fields exactly", () => {
  const valid = () => ({
    schemaVersion: 1,
    seed: { at: '2026-11-22T09:47:12.000Z', r2Cursor: '2026-11-22T08:00:00Z', r2Bytes: 2500 },
    runs: [
      wrote('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z'),
      { ...failedEntry({ github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }), failure: 'page 1 answered HTTP 403 for its rate limit' },
      { ...wrote('2026-11-22T11:47:00.000Z', '2026-11-22T11:00:00Z'), key: 'stats/downloads.json' }
    ]
  })
  assert.deepEqual(validateRuns(valid()), valid())
  assert.deepEqual(validateRuns({ schemaVersion: 1, seed: null, runs: [] }), { schemaVersion: 1, seed: null, runs: [] })
  const entry = (record, i = 0) => record.runs[i]
  const mismatches = [
    ['not an object', () => []],
    ['schemaVersion 2', (r) => { r.schemaVersion = 2 }],
    ['a field the table does not have', (r) => { r.note = 'hi' }],
    ['no seed', (r) => { delete r.seed }],
    ['a seed with another field', (r) => { r.seed.key = 'stats/downloads.json' }],
    ['a seed read at no time', (r) => { r.seed.at = 'yesterday' }],
    ['a seed cursor off the hour', (r) => { r.seed.r2Cursor = '2026-11-22T08:30:00Z' }],
    ['a seed of negative bytes', (r) => { r.seed.r2Bytes = -1 }],
    ['runs not a list', (r) => { r.runs = {} }],
    ['337 runs', (r) => { r.runs = Array.from({ length: 337 }, () => entry(r)) }],
    ['a run with another field', (r) => { entry(r).note = 'x' }],
    ['a scheduled time not UTC', (r) => { entry(r).scheduledTime = '2026-11-22T17:47:00+08:00' }],
    ['a core hash in capitals', (r) => { entry(r).coreSha256 = CORE.toUpperCase() }],
    ['another key', (r) => { entry(r).key = 'stats/other.json' }],
    ['written as text', (r) => { entry(r).written = 'true' }],
    ['GitHub in another state', (r) => { entry(r).github = 'skipped' }],
    ['the analytics rate-limited', (r) => { entry(r).analytics = 'rate-limited' }],
    ['the bucket rate-limited', (r) => { entry(r).bucket = 'rate-limited' }],
    ['a written run with a failure', (r) => { entry(r).failure = 'x' }],
    ['a written run without a cursor', (r) => { entry(r).r2Cursor = null }],
    ['a failed run without a failure', (r) => { entry(r, 1).failure = null }],
    ['a failed run with a cursor', (r) => { entry(r, 1).r2Cursor = '2026-11-22T09:00:00Z' }]
  ]
  for (const [label, change] of mismatches) {
    const record = valid()
    assert.throws(() => validateRuns(change(record) ?? record), /^Error: the run record /, label)
  }
})

// The Worker is deployed as two modules, itself and the core (Implementation Decisions "The collection")
test('the Worker imports the core and nothing else', () => {
  assert.deepEqual(imports(readFileSync(new URL('./download-count-worker.mjs', import.meta.url), 'utf8')), ['./download-count-core.mjs'])
})

test("the Cron Trigger's handler runs the Worker with the runtime's own fetch, called plainly at each call", async () => {
  // The handler reads the real clock, so the bucket holds no file whose cursor the clock could leave behind (Failure G3)
  const bucket = r2Binding()
  const answer = sources()
  const calls = []
  const runtime = globalThis.fetch
  globalThis.fetch = function (url, init) {
    calls.push({ url, receiver: this })
    return answer(url, init)
  }
  try {
    await worker.scheduled({ scheduledTime: SCHEDULED, cron: '47 * * * *' }, settings(bucket))
  } finally {
    globalThis.fetch = runtime
  }
  assert.ok(calls.length >= 3)
  assert.equal(calls[0].url, 'https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100&page=1')
  for (const { receiver } of calls) assert.equal(receiver, undefined)
  assert.equal(fileOf(bucket, 'stats/worker-runs.json').runs[0].scheduledTime, '2026-11-22T09:47:00.000Z')
})
