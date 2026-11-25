// The download count's collection (download-count::REQ-011, Failures G1-G6, Implementation Decisions "The collection"
// and "The statistics file"): the core's pure rules that merge each source into the statistics file and plan the
// analytics ranges, and a run of the core driven through its seams, with the bucket, GitHub and Cloudflare's analytics
// standing in at the system boundary and the clock fixed.
//
// The core (download-count-core.mjs) awaits the bucket it is given, so the bucket standing in for it answers each
// call on a later turn of the event loop, as an asynchronous binding would: a call the core does not await has not
// happened when the run goes on.
//
// GitHub and the analytics stand in through scripts/testing/download-count-sources.mjs, whose header says what their
// answers are shaped from.
//
// Gaps: nothing here reaches R2, GitHub or Cloudflare; the Worker's runs are those checks (docs/ops/download-count.md).
// A global only Node has (`process`, `Buffer`), used by the core, would fail only in a runtime without Node; every case
// here runs the core in Node, so the first run of the core in such a runtime is that check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collect, isDmg, mergeGitHub, mergeR2, planRanges, reasonOf, summarize, validateStatistics } from './download-count-core.mjs'
import { imports } from './testing/module-imports.mjs'
import {
  copyOf, DAY, DMG_KEY, json, LIMITS, NOW, REAL_ASSETS, REAL_RELEASES, sources, text, writtenFile, zoneAnswer
} from './testing/download-count-sources.mjs'

test('a DMG is an asset or object with the packaged name, formal or pre-release, and nothing else is', () => {
  const counted = [
    'Agentshed-0.2.0-mac-arm64.dmg',
    'Agentshed-0.1.0-beta-mac-arm64.dmg',
    'Agentshed-0.1.0-beta.9-mac-arm64.dmg',
    'Agentshed-1.10.3-mac-x64.dmg',
    'Agentshed-1.0.0-mac-universal.dmg'
  ]
  const passed = [
    'Agentshed-0.1.0-beta.9-mac-arm64.zip',
    'Agentshed-0.1.0-beta.9-mac-arm64.zip.blockmap',
    'latest-mac.yml',
    'latest.json',
    'downloads.json',
    'Agentshed-0.2.0-mac-arm64.dmg.blockmap',
    'Agentshed-0.2.0-mac-arm64.dmg.notary-log.json',
    'Transfer-1.2.1-mac-arm64.dmg',
    'agentshed-0.2.0-mac-arm64.dmg',
    'Agentshed-0.2-mac-arm64.dmg',
    'Agentshed-0.2.0-arm64.dmg',
    'Agentshed-0.2.0-mac-.dmg',
    'Agentshed-0.2.0-mac-arm64.DMG',
    'releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'
  ]
  for (const name of counted) assert.equal(isDmg(name), true, name)
  for (const name of passed) assert.equal(isDmg(name), false, name)
})

test("GitHub's share is each published release's DMG count, formal or pre-release, and nothing of a draft or of the update files", () => {
  const answer = [
    copyOf('v0.2.0', { dmgDownloads: 5, idBase: 900000000 }),
    copyOf('v0.3.0', { draft: true, dmgDownloads: 7, idBase: 910000000 }),
    ...REAL_RELEASES
  ]
  assert.deepEqual(mergeGitHub({}, answer), {
    ...REAL_ASSETS,
    900000001: { name: 'Agentshed-0.2.0-mac-arm64.dmg', downloads: 5 }
  })
})

test('a DMG asset keeps the highest count read for it, and one deleted from GitHub keeps its last count', () => {
  const recorded = {
    ...REAL_ASSETS,
    771176132: { name: 'Agentshed-0.1.0-beta.9-mac-arm64.dmg', downloads: 1 },
    716218198: { name: 'Agentshed-0.1.0-beta.8-mac-arm64.dmg', downloads: 9 },
    600000001: { name: 'Agentshed-0.0.9-beta-mac-arm64.dmg', downloads: 4 }
  }
  assert.deepEqual(mergeGitHub(recorded, REAL_RELEASES), {
    ...REAL_ASSETS,
    716218198: { name: 'Agentshed-0.1.0-beta.8-mac-arm64.dmg', downloads: 9 },
    600000001: { name: 'Agentshed-0.0.9-beta-mac-arm64.dmg', downloads: 4 }
  })
})

// Failure G2: what GitHub answers is validated, never passed over, since a count passed over would go missing
test("an entry of GitHub's answer the run cannot read fails the merge", () => {
  const [release] = REAL_RELEASES
  const withDmg = (change) => ({ ...release, assets: [{ ...release.assets[0], ...change }] })
  const cases = [
    ['not an object', null],
    ['no draft flag', { ...release, draft: undefined }],
    ['assets not a list', { ...release, assets: {} }],
    ['an asset without a name', { ...release, assets: [{ id: 1, download_count: 1 }] }],
    ['a DMG whose ID is a string', withDmg({ id: '771176132' })],
    ['a DMG without a count', withDmg({ download_count: undefined })],
    ['a DMG with a negative count', withDmg({ download_count: -1 })],
    ['a DMG with a fractional count', withDmg({ download_count: 1.5 })]
  ]
  for (const [label, entry] of cases) assert.throws(() => mergeGitHub({}, [entry]), Error, label)
})

test("the download host's share counts the listing's DMGs only, adding each counted request's bytes to its object", () => {
  const listing = [
    { key: DMG_KEY, size: 1000 },
    { key: 'releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg.notary-log.json', size: 300 },
    { key: 'releases/v0.2.0/Agentshed-0.2.0-mac-arm64.zip', size: 900 }
  ]
  const rows = [
    { path: `/${DMG_KEY}`, bytes: 2000 },
    { path: `/${DMG_KEY}`, bytes: 500 },
    { path: '/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.zip', bytes: 900 },
    { path: '/releases/v0.1.0/Agentshed-0.1.0-mac-arm64.dmg', bytes: 7000 },
    { path: '/releases/v0.2.0/', bytes: 10 }
  ]
  assert.deepEqual(mergeR2({}, listing, rows), {
    [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 2500 }
  })
})

test('a DMG removed from the bucket keeps the bytes it was served, and still takes the requests its cached copy serves', () => {
  const recorded = { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 4000 } }
  assert.deepEqual(mergeR2(recorded, [], [{ path: `/${DMG_KEY}`, bytes: 500 }]), {
    [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 4500 }
  })
})

// Failure G5: bytes served at one size and divided by another would be a wrong count
test('a mirrored DMG whose size in the bucket differs from the recorded size fails the merge', () => {
  const recorded = { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 4000 } }
  assert.throws(() => mergeR2(recorded, [{ key: DMG_KEY, size: 1001 }], []), new RegExp(`${DMG_KEY.replaceAll('.', '\\.')} is 1001 bytes in the bucket, not the 1000 recorded`))
  assert.throws(() => mergeR2({}, [{ key: DMG_KEY, size: 0 }], []), /is empty/)
})

test('the summary adds the shares unrounded: downloads on GitHub, and bytes over size on the download host', () => {
  const assets = { 1: { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads: 2 }, 2: { name: 'Agentshed-0.1.0-beta.2-mac-arm64.dmg', downloads: 3 } }
  const objects = {
    [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 2500 },
    'releases/v0.3.0/Agentshed-0.3.0-mac-arm64.dmg': { name: 'Agentshed-0.3.0-mac-arm64.dmg', size: 4, bytes: 3 }
  }
  assert.deepEqual(summarize(assets, objects), { total: 8.25, sources: { github: 5, r2: 3.25 } })
  assert.deepEqual(summarize({}, {}), { total: 0, sources: { github: 0, r2: 0 } })
})

// NOW (the shared stand-ins) reads 09:47:12 UTC: the last full hour ended at 09:00, and a day of notOlderThan holds
// from 10:00 the day before
test('the traffic is read from the cursor to the last full hour, in ranges no wider than maxDuration', () => {
  assert.deepEqual(planRanges({ cursor: '2026-11-22T08:00:00Z', now: NOW, notOlderThan: 31 * DAY, maxDuration: 3 * DAY, acceptGap: false }), {
    ranges: [{ from: '2026-11-22T08:00:00Z', to: '2026-11-22T09:00:00Z' }],
    cursor: '2026-11-22T09:00:00Z',
    gap: null
  })
  const fromThreeDaysBack = { cursor: '2026-11-19T05:00:00Z', now: NOW, notOlderThan: 31 * DAY, acceptGap: false }
  assert.deepEqual(planRanges({ ...fromThreeDaysBack, maxDuration: DAY }).ranges, [
    { from: '2026-11-19T05:00:00Z', to: '2026-11-20T05:00:00Z' },
    { from: '2026-11-20T05:00:00Z', to: '2026-11-21T05:00:00Z' },
    { from: '2026-11-21T05:00:00Z', to: '2026-11-22T05:00:00Z' },
    { from: '2026-11-22T05:00:00Z', to: '2026-11-22T09:00:00Z' }
  ])
  assert.deepEqual(planRanges({ ...fromThreeDaysBack, maxDuration: 3 * DAY }).ranges, [
    { from: '2026-11-19T05:00:00Z', to: '2026-11-22T05:00:00Z' },
    { from: '2026-11-22T05:00:00Z', to: '2026-11-22T09:00:00Z' }
  ])
  // A width that is not whole hours is narrowed to them: ranges stay on the hour
  assert.deepEqual(planRanges({ ...fromThreeDaysBack, cursor: '2026-11-22T06:00:00Z', maxDuration: 5400 }).ranges, [
    { from: '2026-11-22T06:00:00Z', to: '2026-11-22T07:00:00Z' },
    { from: '2026-11-22T07:00:00Z', to: '2026-11-22T08:00:00Z' },
    { from: '2026-11-22T08:00:00Z', to: '2026-11-22T09:00:00Z' }
  ])
})

// download-count::REQ-011/AC-04: a run counts an hour once it ended at least half an hour before the run, whether
// the run is on time, delayed by GitHub into the next hour, or started by hand
test('an hour is counted once it ended half an hour before the run, so a run early in an hour stops an hour sooner', () => {
  const run = { cursor: '2026-11-22T07:00:00Z', notOlderThan: 31 * DAY, maxDuration: 3 * DAY, acceptGap: false }
  const counted = (now) => planRanges({ ...run, now })
  assert.deepEqual(counted(Date.UTC(2026, 10, 22, 10, 5, 0)), {
    ranges: [{ from: '2026-11-22T07:00:00Z', to: '2026-11-22T09:00:00Z' }],
    cursor: '2026-11-22T09:00:00Z',
    gap: null
  })
  assert.equal(counted(Date.UTC(2026, 10, 22, 10, 29, 59, 999)).cursor, '2026-11-22T09:00:00Z')
  assert.deepEqual(counted(Date.UTC(2026, 10, 22, 10, 30, 0)), {
    ranges: [{ from: '2026-11-22T07:00:00Z', to: '2026-11-22T10:00:00Z' }],
    cursor: '2026-11-22T10:00:00Z',
    gap: null
  })
  assert.equal(counted(Date.UTC(2026, 10, 22, 10, 47, 12)).cursor, '2026-11-22T10:00:00Z')
})

test('a first run starts at the oldest full hour notOlderThan allows', () => {
  assert.deepEqual(planRanges({ cursor: null, now: NOW, notOlderThan: DAY, maxDuration: 36000, acceptGap: false }), {
    ranges: [
      { from: '2026-11-21T10:00:00Z', to: '2026-11-21T20:00:00Z' },
      { from: '2026-11-21T20:00:00Z', to: '2026-11-22T06:00:00Z' },
      { from: '2026-11-22T06:00:00Z', to: '2026-11-22T09:00:00Z' }
    ],
    cursor: '2026-11-22T09:00:00Z',
    gap: null
  })
  assert.equal(planRanges({ cursor: null, now: NOW, notOlderThan: DAY, maxDuration: 3 * DAY, acceptGap: true }).gap, null)
})

// Failure G3
test('a cursor older than the analytics hold fails the run, unless the run accepts the gap and resumes from the oldest full hour', () => {
  const stale = { cursor: '2026-11-20T00:00:00Z', now: NOW, notOlderThan: DAY, maxDuration: 3 * DAY }
  assert.throws(
    () => planRanges({ ...stale, acceptGap: false }),
    /the cursor 2026-11-20T00:00:00Z is older than 2026-11-21T10:00:00Z, the oldest full hour the analytics hold/
  )
  assert.deepEqual(planRanges({ ...stale, acceptGap: true }), {
    ranges: [{ from: '2026-11-21T10:00:00Z', to: '2026-11-22T09:00:00Z' }],
    cursor: '2026-11-22T09:00:00Z',
    gap: { from: '2026-11-20T00:00:00Z', to: '2026-11-21T10:00:00Z' }
  })
  // The oldest full hour held is read; the hour before it began before 09:47:12, so not all of it is held
  assert.deepEqual(planRanges({ ...stale, cursor: '2026-11-21T10:00:00Z', acceptGap: false }).gap, null)
  assert.throws(() => planRanges({ ...stale, cursor: '2026-11-21T09:00:00Z', acceptGap: false }), /is older than 2026-11-21T10:00:00Z/)
})

test('a cursor at the last full hour reads nothing, and one after it or off the hour fails the run', () => {
  const limits = { now: NOW, notOlderThan: 31 * DAY, maxDuration: 3 * DAY, acceptGap: false }
  assert.deepEqual(planRanges({ ...limits, cursor: '2026-11-22T09:00:00Z' }), { ranges: [], cursor: '2026-11-22T09:00:00Z', gap: null })
  assert.throws(() => planRanges({ ...limits, cursor: '2026-11-22T10:00:00Z' }), /the cursor 2026-11-22T10:00:00Z is after 2026-11-22T09:00:00Z, the end of the hours this run may count/)
  assert.throws(() => planRanges({ ...limits, cursor: '2026-11-22T08:30:00Z' }), /the cursor 2026-11-22T08:30:00Z is not on the hour/)
  assert.throws(() => planRanges({ ...limits, cursor: '2026-11-22T08:00:00.000Z' }), /is not on the hour/)
  assert.throws(() => planRanges({ ...limits, cursor: null, notOlderThan: 600 }), /the analytics hold no full hour/)
  assert.throws(() => planRanges({ ...limits, cursor: '2026-11-22T08:00:00Z', maxDuration: 1800 }), /maxDuration 1800 is narrower than an hour/)
})

// Failure G1: a file the run cannot take as the spec's statistics file fails the run rather than start the count over
test("a statistics file is taken only when it matches the spec's fields exactly", () => {
  assert.deepEqual(validateStatistics(writtenFile()), writtenFile())
  const tolerated = writtenFile()
  tolerated.summary.total = 7.5000005
  assert.equal(validateStatistics(tolerated).summary.total, 7.5000005)
  // Near 2^53 a whole download is about the spacing of doubles: the total is the shares' sum as written, which
  // subtracting the shares one by one from it would put 0.3 off
  const large = writtenFile()
  large.github.assets = { 682397225: { name: 'Agentshed-0.1.0-beta.2-mac-arm64.dmg', downloads: 9007199254740000 } }
  large.r2.objects[DMG_KEY] = { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 10, bytes: 3 }
  large.summary = { total: 9007199254740000, sources: { github: 9007199254740000, r2: 0.3 } }
  assert.equal(validateStatistics(large).summary.total, 9007199254740000)
  const asset = (file) => file.github.assets[682397225]
  const object = (file) => file.r2.objects[DMG_KEY]
  const mismatches = [
    ['not an object', () => []],
    ['schemaVersion 2', (f) => { f.schemaVersion = 2 }],
    ['schemaVersion as text', (f) => { f.schemaVersion = '1' }],
    ['no schemaVersion', (f) => { delete f.schemaVersion }],
    ['a field the table does not have', (f) => { f.note = 'hi' }],
    ['no r2Gaps', (f) => { delete f.r2Gaps }],
    ['updatedAt not a time', (f) => { f.updatedAt = 'yesterday' }],
    ['updatedAt not UTC', (f) => { f.updatedAt = '2026-11-22T17:47:12+08:00' }],
    ['r2Cursor off the hour', (f) => { f.r2Cursor = '2026-11-22T09:30:00Z' }],
    ['r2Cursor not a date', (f) => { f.r2Cursor = '2026-13-22T09:00:00Z' }],
    ['r2Gaps not a list', (f) => { f.r2Gaps = {} }],
    ['a gap that ends before it starts', (f) => { f.r2Gaps = [{ from: '2026-11-02T00:00:00Z', to: '2026-11-01T00:00:00Z' }] }],
    ['a gap off the hour', (f) => { f.r2Gaps = [{ from: '2026-11-01T00:30:00Z', to: '2026-11-02T00:00:00Z' }] }],
    ['a gap after the cursor', (f) => { f.r2Gaps = [{ from: '2026-11-22T09:00:00Z', to: '2026-11-22T10:00:00Z' }] }],
    ['a gap with another field', (f) => { f.r2Gaps[0].reason = 'outage' }],
    ['github with another field', (f) => { f.github.releases = [] }],
    ['an asset keyed by something other than an ID', (f) => { f.github.assets.abc = asset(f) }],
    ['an asset that is not a DMG', (f) => { asset(f).name = 'Agentshed-0.1.0-beta.2-mac-arm64.zip' }],
    ['an asset with a negative count', (f) => { asset(f).downloads = -3; f.summary = { total: 1.5, sources: { github: -1, r2: 2.5 } } }],
    ['an asset with a fractional count', (f) => { asset(f).downloads = 2.5; f.summary = { total: 7, sources: { github: 4.5, r2: 2.5 } } }],
    ['an asset with another field', (f) => { asset(f).size = 1 }],
    ['an object whose key names another file', (f) => { f.r2.objects['releases/v0.2.0/Agentshed-0.2.1-mac-arm64.dmg'] = object(f); delete f.r2.objects[DMG_KEY] }],
    ['an object outside releases/', (f) => { f.r2.objects['Agentshed-0.2.0-mac-arm64.dmg'] = object(f); delete f.r2.objects[DMG_KEY] }],
    ['an object of size 0', (f) => { object(f).size = 0 }],
    ['an object with negative bytes', (f) => { object(f).bytes = -2500; f.summary = { total: 2.5, sources: { github: 5, r2: -2.5 } } }],
    ['an object with another field', (f) => { object(f).sha256 = 'x' }],
    ["GitHub's share not the sum of its assets", (f) => { f.summary = { total: 8.5, sources: { github: 6, r2: 2.5 } } }],
    ["the download host's share not the sum of its objects", (f) => { f.summary = { total: 7.6, sources: { github: 5, r2: 2.6 } } }],
    ['a total off the shares by 0.000002', (f) => { f.summary.total = 7.500002 }],
    ['a total as text', (f) => { f.summary.total = '7.5' }],
    ['a summary with another field', (f) => { f.summary.rounded = 7 }]
  ]
  for (const [label, change] of mismatches) {
    const file = writtenFile()
    const changed = change(file) ?? file
    assert.throws(() => validateStatistics(changed), /the statistics file/, label)
  }
})

/**
 * The run's world: the release bucket as objects by key, and GitHub and the analytics as the shared stand-ins answer
 * them (scripts/testing/download-count-sources.mjs). `answer` replaces an answer, or throws for a call that fails;
 * `requests` records what was asked, in order. The bucket is `store`, as the core is given it.
 */
function world({ objects = {}, releases, limits, traffic, answer = {} } = {}) {
  const bucket = new Map(Object.entries(objects))
  const requests = []
  const fetch = sources({ releases, limits, traffic, answer, requests })
  const syncStore = {
    list: (prefix) => {
      requests.push({ to: 'list', prefix })
      return answer.list?.(prefix) ??
        [...bucket].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, size: object.size ?? Buffer.byteLength(object.text) }))
    },
    getText: (key) => {
      requests.push({ to: 'get', key })
      if (answer.get) return answer.get(key)
      if (!bucket.has(key)) throw new Error(`aws s3api failed (exit 254)\nAn error occurred (NoSuchKey)`)
      return bucket.get(key).text
    },
    putText: (key, text, headers) => {
      requests.push({ to: 'put', key })
      answer.put?.(key)
      bucket.set(key, { text, ...headers })
    }
  }
  // Each call settles on a later macrotask: one queued as a microtask would still run before the core's next step,
  // awaited or not
  const later = (call) => (...args) => new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(call(...args))
      } catch (error) {
        reject(error)
      }
    })
  })
  const store = { list: later(syncStore.list), getText: later(syncStore.getText), putText: later(syncStore.putText) }
  return { bucket, store, fetch, requests }
}

const RUN = { repository: 'aloong-planet/agentshed', githubToken: 'gh-token', analyticsToken: 'cf-token', zone: 'zone-tag', host: 'dl.agentshed.aloongplanet.com' }
const published = (bucket) => JSON.parse(bucket.get('stats/downloads.json').text)

// Failure G4 and the first run of "The collection": no statistics file, nothing mirrored yet
test("a first run publishes the statistics file with GitHub's count, a download host share of zero, and the cursor at the last full hour", async () => {
  const { bucket, store, fetch, requests } = world({ limits: { ...LIMITS, notOlderThan: DAY } })
  await collect({ ...RUN, bucket: store, fetch, now: NOW })

  const file = bucket.get('stats/downloads.json')
  assert.equal(file.contentType, 'application/json')
  assert.equal(file.cacheControl, 'public, max-age=300')
  assert.deepEqual(JSON.parse(file.text), {
    schemaVersion: 1,
    updatedAt: '2026-11-22T09:47:12.000Z',
    r2Cursor: '2026-11-22T09:00:00Z',
    r2Gaps: [],
    summary: { total: 20, sources: { github: 20, r2: 0 } },
    github: { assets: REAL_ASSETS },
    r2: { objects: {} }
  })
  const order = requests.map(({ to }) => to)
  assert.deepEqual(order, ['list', 'github', 'list', 'settings', 'traffic', 'put'])
  assert.deepEqual(requests.filter(({ to }) => to === 'list').map(({ prefix }) => prefix), ['stats/downloads.json', 'releases/'])
  assert.deepEqual(requests.filter(({ to }) => to === 'traffic').map(({ variables }) => [variables.filter.datetime_geq, variables.filter.datetime_lt]), [['2026-11-21T10:00:00Z', '2026-11-22T09:00:00Z']])
})

test("the next run takes the previous file, adds the hour since its cursor, and moves the cursor on", async () => {
  const first = world({ objects: { [DMG_KEY]: { size: 1000 } }, traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 3000 }] } })
  await collect({ ...RUN, bucket: first.store, fetch: first.fetch, now: NOW })
  assert.equal(published(first.bucket).summary.total, 23)

  const next = world({
    objects: { [DMG_KEY]: { size: 1000 }, 'stats/downloads.json': first.bucket.get('stats/downloads.json') },
    traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 3000 }], '2026-11-22T09:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1500 }] }
  })
  await collect({ ...RUN, bucket: next.store, fetch: next.fetch, now: NOW + 3_600_000 })
  const file = published(next.bucket)
  assert.equal(file.r2Cursor, '2026-11-22T10:00:00Z')
  assert.equal(file.updatedAt, '2026-11-22T10:47:12.000Z')
  assert.deepEqual(file.r2.objects, { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 4500 } })
  assert.deepEqual(file.summary, { total: 24.5, sources: { github: 20, r2: 4.5 } })
  assert.deepEqual(next.requests.filter(({ to }) => to === 'traffic').map(({ variables }) => [variables.filter.datetime_geq, variables.filter.datetime_lt]), [['2026-11-22T09:00:00Z', '2026-11-22T10:00:00Z']])
})

// Failure G6 and "The collection": the filter is the spec's, with no exclusion of any client, the project's own reads
// included
test("the analytics are asked, with their own token, for the download host's successful visitor GETs under /releases/, summed by path", async () => {
  const { store, fetch, requests } = world()
  await collect({ ...RUN, bucket: store, fetch, now: NOW })
  const [settings, ...traffic] = requests.filter(({ to }) => to === 'settings' || to === 'traffic')
  assert.equal(settings.to, 'settings')
  assert.equal(traffic.length, 11)
  for (const request of [settings, ...traffic]) {
    assert.equal(request.headers.authorization, 'Bearer cf-token')
    assert.equal(request.variables.zoneTag, 'zone-tag')
  }
  const [first] = traffic
  assert.deepEqual(first.variables.filter, {
    datetime_geq: '2026-10-22T10:00:00Z',
    datetime_lt: '2026-10-25T10:00:00Z',
    clientRequestHTTPHost: 'dl.agentshed.aloongplanet.com',
    clientRequestHTTPMethodName: 'GET',
    clientRequestPath_like: '/releases/%',
    edgeResponseStatus_in: [200, 206],
    requestSource: 'eyeball'
  })
  assert.match(first.query, /httpRequestsAdaptiveGroups\(limit: 10000, filter: \$filter\) \{\s*dimensions \{ clientRequestPath \}\s*sum \{ edgeResponseBytes \}\s*\}/)
  assert.deepEqual(traffic.at(-1).variables.filter.datetime_lt, '2026-11-22T09:00:00Z')
})

// "The collection": a range's answer is taken whole below a full page, whatever page size the analytics allow; 200,000
// rows are more than a call takes as arguments
test('a range whose answer holds 200,000 rows is counted whole', async () => {
  const rows = Array.from({ length: 200_000 }, (_, i) => ({ path: `/releases/v0.2.0/part-${i}`, bytes: 1 }))
  const { bucket, store, fetch } = world({
    objects: { [DMG_KEY]: { size: 1000 } },
    limits: { ...LIMITS, notOlderThan: DAY, maxPageSize: 250_000 },
    traffic: { '2026-11-22T08:00:00Z': [...rows, { path: `/${DMG_KEY}`, bytes: 1500 }] }
  })
  await collect({ ...RUN, bucket: store, fetch, now: NOW })
  assert.deepEqual(published(bucket).r2.objects, { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 1500 } })
})

test("GitHub's releases are read page after page with the token the run is given, until a page holds fewer than a hundred", async () => {
  const copies = Array.from({ length: 241 }, (_, i) => copyOf(`v0.2.${i}`, { dmgDownloads: 1, idBase: 800000000 + i * 10 }))
  const { bucket, store, fetch, requests } = world({ releases: [...REAL_RELEASES, ...copies] })
  await collect({ ...RUN, bucket: store, fetch, now: NOW })
  const pages = requests.filter(({ to }) => to === 'github')
  assert.deepEqual(pages.map(({ page }) => page), [1, 2, 3])
  for (const { headers } of pages) {
    assert.equal(headers.authorization, 'Bearer gh-token')
    assert.equal(headers['x-github-api-version'], '2022-11-28')
  }
  assert.equal(published(bucket).summary.sources.github, 261)
})

// "The collection": a run without its credentials fails, and "The run record": a source with no read started is
// `not-read`. No request goes out, so none carries a token that is not set
test('a run given no GitHub token reads nothing and fails, with every source not read', async () => {
  for (const githubToken of [undefined, '']) {
    const { store, fetch, requests } = world()
    const error = await collect({ ...RUN, githubToken, bucket: store, fetch, now: NOW }).then(() => null, (failure) => failure)
    assert.equal(error?.message, 'the GitHub token is not set', String(githubToken))
    assert.deepEqual(error.outcomes, { github: 'not-read', analytics: 'not-read', bucket: 'not-read' }, String(githubToken))
    assert.deepEqual(requests, [], String(githubToken))
  }
})

// "The run record": a read answered with another status than HTTP 200 quotes the reason its answer gives, whole. The
// first two are GitHub's and Cloudflare's own answers to a token they do not take (requests with a made-up token,
// 2026-11-25), GitHub's as it prints it
test("a refused read's reason is its answer's message, or else each of its errors' messages, and none when it gives neither", () => {
  const cases = [
    ['{\n  "message": "Bad credentials",\n  "documentation_url": "https://docs.github.com/rest",\n  "status": "401"\n}', 'Bad credentials'],
    ['{"success":false,"errors":[{"code":9106,"message":"Authentication failed (status: 400)"}],"messages":[],"result":null}', 'Authentication failed (status: 400)'],
    ['{"success":false,"errors":[{"code":9106,"message":"Authentication failed (status: 400)"},{"code":10000,"message":"Authentication error"}],"messages":[],"result":null}',
      'Authentication failed (status: 400); Authentication error'],
    ['{"message":"Validation Failed","errors":[{"resource":"Release","code":"invalid","message":"tag_name is not valid"}]}', 'Validation Failed'],
    ['upstream error', null],
    ['null', null],
    ['{"success":false}', null],
    ['{"message":"  ","errors":[{"code":10000,"message":"Authentication error"}]}', 'Authentication error'],
    ['{"message":403,"errors":[{"code":10000,"message":"Authentication error"}]}', 'Authentication error'],
    ['{"errors":[{"code":9106,"message":{"en":"Authentication failed"}}]}', null],
    ['{"errors":[{"code":9106}]}', null]
  ]
  for (const [answer, reason] of cases) assert.equal(reasonOf(answer), reason, answer)
})

/** A bucket whose listing of one prefix fails; the listing of any other is the bucket's */
const failingList = (failed) => (prefix) => {
  if (prefix === failed) throw new Error(`the listing of ${prefix} failed: InternalError`)
}

// Failures G1, G2 and G5 through a run: each read that fails or answers what the run cannot validate fails the run
// before anything is written, the previous file and its cursor untouched. A listing that fails reads as no listing,
// never as an empty bucket, which would start the count over or drop the DMGs not yet recorded
test('a run in which any read fails, or answers what the run cannot validate, writes nothing', async () => {
  // Its cursor an hour before the last full hour, so that the run has one range of traffic to read
  const previousFile = { text: `${JSON.stringify({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' }, null, 2)}\n` }
  const mirrored = { 'stats/downloads.json': previousFile, [DMG_KEY]: { size: 1000 } }
  const cases = [
    ['the listing of the statistics file failing', { answer: { list: failingList('stats/downloads.json') } }, /the listing of stats\/downloads\.json failed/],
    ['the listing under releases/ failing', { answer: { list: failingList('releases/') } }, /the listing of releases\/ failed/],
    ['the statistics file that cannot be read', { answer: { get: () => { throw new Error('aws s3api failed (exit 255)\nAccessDenied') } } }, /AccessDenied/],
    ['the statistics file that is not JSON', { objects: { ...mirrored, 'stats/downloads.json': { text: '{"schemaVersion": 1,' } } }, /^Error: stats\/downloads\.json in the bucket is not JSON$/],
    ['the statistics file of another schema', { objects: { ...mirrored, 'stats/downloads.json': { text: JSON.stringify({ ...writtenFile(), schemaVersion: 2 }) } } }, /^Error: stats\/downloads\.json has schemaVersion 2, not 1$/],
    ['a mirrored DMG at another size than recorded', { objects: { ...mirrored, [DMG_KEY]: { size: 999 } } }, /is 999 bytes in the bucket, not the 1000 recorded/],
    ["GitHub's first page failing", { answer: { github: () => json({ message: 'Server Error' }, 500) } }, /page 1 of GitHub's releases answered HTTP 500/],
    ["GitHub's second page failing", { releases: [...REAL_RELEASES, ...Array.from({ length: 91 }, (_, i) => copyOf(`v0.3.${i}`, { idBase: 700000000 + i * 10 }))], answer: { github: (page) => (page === 2 ? json({ message: 'rate limited' }, 403) : undefined) } }, /page 2 of GitHub's releases answered HTTP 403/],
    ["GitHub's page that is not JSON", { answer: { github: () => text('<html>') } }, /page 1 of GitHub's releases answered with a body that is not JSON/],
    ["GitHub's page that is not a list", { answer: { github: () => json({ message: 'Bad credentials' }) } }, /page 1 of GitHub's releases is not a list/],
    ["GitHub's entry that is not a release", { releases: [{ ...REAL_RELEASES[0], assets: null }] }, /GitHub listed a release that is not one/],
    ['the limits answered with HTTP 403', { answer: { settings: () => json({ success: false }, 403) } }, /Cloudflare's analytics answered HTTP 403/],
    // The errors' messages as for a refused read ("The run record"): an entry without one is left out
    ['the limits answered with errors at HTTP 200', { answer: { settings: () => json({ data: null, errors: [{ code: 9106 }, { message: 'not authorized for that zone' }] }) } }, /answered with errors: not authorized for that zone$/],
    ['the limits answered with errors that say nothing at HTTP 200', { answer: { settings: () => json({ data: null, errors: [{ code: 9106 }] }) } }, /^Error: Cloudflare's analytics answered with errors$/],
    ['the limits answered with errors that are not a list at HTTP 200', { answer: { settings: () => json({ data: null, errors: 'denied' }) } }, /^Error: Cloudflare's analytics answered with errors: \{"data":null,"errors":"denied"\}$/],
    ['the limits for no zone', { answer: { settings: () => json({ data: { viewer: { zones: [] } }, errors: null }) } }, /did not answer for exactly one zone/],
    ['the dataset disabled', { limits: { ...LIMITS, enabled: false } }, /limits the run cannot use/],
    ['no notOlderThan', { limits: { ...LIMITS, notOlderThan: undefined } }, /limits the run cannot use/],
    ['a maxDuration of zero', { limits: { ...LIMITS, maxDuration: 0 } }, /limits the run cannot use/],
    ['a page size as text', { limits: { ...LIMITS, maxPageSize: '10000' } }, /limits the run cannot use/],
    ['the traffic answered with HTTP 500', { answer: { traffic: () => text('upstream error', 500) } }, /Cloudflare's analytics answered HTTP 500/],
    ['the traffic answered with errors at HTTP 200', { answer: { traffic: () => json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [] }] } }, errors: [{ message: 'time range too large' }] }) } }, /answered with errors: time range too large/],
    ['the traffic without groups', { answer: { traffic: () => zoneAnswer({ httpRequestsAdaptiveGroups: null }) } }, /answered no traffic for/],
    ['a full page of traffic', { limits: { ...LIMITS, maxPageSize: 2 }, traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1 }, { path: '/releases/v0.2.0/', bytes: 1 }] } }, /a full page for 2026-11-22T08:00:00Z to 2026-11-22T09:00:00Z, which may leave rows out/],
    ['a traffic row with its bytes as text', { answer: { traffic: () => zoneAnswer({ httpRequestsAdaptiveGroups: [{ dimensions: { clientRequestPath: `/${DMG_KEY}` }, sum: { edgeResponseBytes: '1000' } }] }) } }, /a row the run cannot read/],
    ['a traffic row without a path', { answer: { traffic: () => zoneAnswer({ httpRequestsAdaptiveGroups: [{ dimensions: {}, sum: { edgeResponseBytes: 1000 } }] }) } }, /a row the run cannot read/]
  ]
  for (const [label, setting, reason] of cases) {
    const { bucket, store, fetch, requests } = world({ objects: mirrored, ...setting })
    const before = bucket.get('stats/downloads.json')
    await assert.rejects(collect({ ...RUN, bucket: store, fetch, now: NOW }), reason, label)
    assert.equal(requests.some(({ to }) => to === 'put'), false, label)
    assert.equal(bucket.get('stats/downloads.json'), before, label)
  }
})

// A write that fails fails the run, which is then reported, never taken for a count published
test("a run whose write of the statistics file fails fails with the bucket's error", async () => {
  const { store, fetch } = world({ answer: { put: () => { throw new Error('the write of stats/downloads.json failed: AccessDenied') } } })
  await assert.rejects(collect({ ...RUN, bucket: store, fetch, now: NOW }), /the write of stats\/downloads\.json failed: AccessDenied/)
})

test('after a failed run, the next run counts the hours the failed one missed', async () => {
  const objects = { [DMG_KEY]: { size: 1000 } }
  const traffic = { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }], '2026-11-22T09:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 2000 }] }
  const first = world({ objects, traffic })
  await collect({ ...RUN, bucket: first.store, fetch: first.fetch, now: NOW - 3_600_000 })
  assert.equal(published(first.bucket).r2Cursor, '2026-11-22T08:00:00Z')
  const counted = { ...objects, 'stats/downloads.json': first.bucket.get('stats/downloads.json') }

  const failed = world({ objects: counted, traffic, answer: { traffic: () => text('upstream error', 500) } })
  await assert.rejects(collect({ ...RUN, bucket: failed.store, fetch: failed.fetch, now: NOW }))
  assert.equal(published(failed.bucket).r2Cursor, '2026-11-22T08:00:00Z')

  const repaired = world({ objects: { ...objects, 'stats/downloads.json': failed.bucket.get('stats/downloads.json') }, traffic })
  await collect({ ...RUN, bucket: repaired.store, fetch: repaired.fetch, now: NOW + 3_600_000 })
  const file = published(repaired.bucket)
  assert.equal(file.r2Cursor, '2026-11-22T10:00:00Z')
  assert.equal(file.r2.objects[DMG_KEY].bytes, 3000)
  assert.deepEqual(repaired.requests.filter(({ to }) => to === 'traffic').map(({ variables }) => [variables.filter.datetime_geq, variables.filter.datetime_lt]), [['2026-11-22T08:00:00Z', '2026-11-22T10:00:00Z']])
})

// Failure G3: eight days of notOlderThan. A run on 1 September, then nothing until 1 October, when the oldest full
// hour held is 23 September 01:00 (the first after 00:47:12 eight days back); then nothing until now, when it is
// 14 November 10:00. Each stall fails every run until one is given the stale cursor to accept the gap from.
test('a stalled count fails every run, and a run told to accept the gap from its cursor resumes it, recording the gap and keeping the counts', async () => {
  const limits = { ...LIMITS, notOlderThan: 8 * DAY }
  const objects = { [DMG_KEY]: { size: 1000 } }
  const traffic = {
    '2026-09-10T00:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 9000 }],
    '2026-09-30T12:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 2000 }],
    '2026-10-15T00:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 9000 }],
    '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }]
  }
  const runAt = async (now, previous, acceptGapFrom = null) => {
    const w = world({ objects: { ...objects, ...(previous ? { 'stats/downloads.json': previous } : {}) }, limits, traffic })
    await collect({ ...RUN, bucket: w.store, fetch: w.fetch, now, acceptGapFrom })
    return w.bucket.get('stats/downloads.json')
  }
  const september = await runAt(Date.UTC(2026, 8, 1, 0, 47, 12), null)
  await assert.rejects(runAt(Date.UTC(2026, 9, 1, 0, 47, 12), september), /the cursor 2026-09-01T00:00:00Z is older than 2026-09-23T01:00:00Z/)
  const october = await runAt(Date.UTC(2026, 9, 1, 0, 47, 12), september, '2026-09-01T00:00:00Z')
  await assert.rejects(runAt(NOW, october, '2026-09-01T00:00:00Z'), /the cursor 2026-10-01T00:00:00Z is older than 2026-11-14T10:00:00Z/)
  const file = JSON.parse((await runAt(NOW, october, '2026-10-01T00:00:00Z')).text)

  assert.deepEqual(file.r2Gaps, [
    { from: '2026-09-01T00:00:00Z', to: '2026-09-23T01:00:00Z' },
    { from: '2026-10-01T00:00:00Z', to: '2026-11-14T10:00:00Z' }
  ])
  assert.equal(file.r2Cursor, '2026-11-22T09:00:00Z')
  assert.deepEqual(file.r2.objects[DMG_KEY], { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 3000 })
  assert.deepEqual(file.github.assets, REAL_ASSETS)
  assert.deepEqual(file.summary, { total: 23, sources: { github: 20, r2: 3 } })
})

// The core runs where neither Node's modules nor the files beside it are (the walk and its sample:
// scripts/testing/module-imports.mjs)
test('the core imports nothing, neither a module of Node nor a file', () => {
  assert.deepEqual(imports(readFileSync(new URL('./download-count-core.mjs', import.meta.url), 'utf8')), [])
})
