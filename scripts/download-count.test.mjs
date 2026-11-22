// The download count's collection (landing-page::REQ-011, Failures G1-G6, Implementation Decisions "The collection"
// and "The statistics file"): the pure rules that merge each source into the statistics file, the plan of the
// analytics ranges, and a run driven through its seams, with the bucket, GitHub and Cloudflare's analytics standing in
// at the system boundary and the clock fixed.
//
// GitHub's answer is the repository's real one (scripts/fixtures/github-releases.json: `gh api
// 'repos/aloong-planet/agentshed/releases?per_page=100'`, 2026-11-22, nine pre-releases, trimmed to the fields a
// release and an asset are read for); a draft and a formal release are added by copying its entries.
//
// Gaps: nothing here reaches R2, GitHub or Cloudflare. The analytics' answers are shaped from Cloudflare's documented
// schema and the query Transfer runs hourly on the same zone; aws-cli's output for a listing is shaped from its source
// (the JSON formatter applied to `--query '{objects: Contents}'`), since aws-cli could not run on the machine that
// wrote these tests. The workflow's first runs are those checks (docs/ops/download-count.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { awsBucket } from './lib/r2-bucket.mjs'
import { collect, main, isDmg, mergeGitHub, mergeR2, planRanges, summarize, validateStatistics } from './download-count.mjs'

const REAL_RELEASES = JSON.parse(readFileSync(new URL('./fixtures/github-releases.json', import.meta.url), 'utf8'))

/** The real answer's newest release, copied under another tag and other asset IDs */
function copyOf(tag, { draft = false, prerelease = false, dmgDownloads = 0, idBase }) {
  const [newest] = REAL_RELEASES
  const version = tag.slice(1)
  return {
    ...newest,
    id: idBase,
    tag_name: tag,
    draft,
    prerelease,
    assets: newest.assets.map((asset, i) => {
      const name = asset.name.replace('0.1.0-beta.9', version)
      return {
        ...asset,
        id: idBase + 1 + i,
        name,
        download_count: name.endsWith('.dmg') ? dmgDownloads : 40,
        browser_download_url: `https://github.com/aloong-planet/agentshed/releases/download/${tag}/${name}`
      }
    })
  }
}

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

// The real answer's DMG counts on 2026-11-22: 2 for beta.3 to beta.9, 3 for beta and beta.2
const REAL_ASSETS = {
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

const DMG_KEY = 'releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'

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

// The clock reads 09:47:12 UTC, the minute the schedule runs at: the last full hour ended at 09:00, 47 minutes
// before. A day of notOlderThan reaches back to 09:47:12 the day before, so the oldest full hour the analytics hold
// starts at 10:00.
const NOW = Date.UTC(2026, 10, 22, 9, 47, 12)
const DAY = 86400

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

// landing-page::REQ-011/AC-04: a run counts an hour once it ended at least half an hour before the run, whether
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

/** A statistics file with every field of the spec's table, its summary added by hand */
const writtenFile = () => ({
  schemaVersion: 1,
  updatedAt: '2026-11-22T09:47:12.000Z',
  r2Cursor: '2026-11-22T09:00:00Z',
  r2Gaps: [{ from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }],
  summary: { total: 7.5, sources: { github: 5, r2: 2.5 } },
  github: {
    assets: {
      682397225: { name: 'Agentshed-0.1.0-beta.2-mac-arm64.dmg', downloads: 3 },
      665347607: { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads: 2 }
    }
  },
  r2: { objects: { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 2500 } } }
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

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'
const RELEASES_PAGE = 'https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100&page='
const LIMITS = { enabled: true, notOlderThan: 31 * DAY, maxDuration: 3 * DAY, maxPageSize: 10000 }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * The run's world: the release bucket as objects by key, GitHub's releases answered 100 to a page, and Cloudflare's
 * analytics answering the settings and, for a range, the rows of each hour in it (`traffic`: hour -> [{ path, bytes }]).
 * `requests` records what was asked, in order.
 */
function world({ objects = {}, releases = REAL_RELEASES, limits = LIMITS, traffic = {}, answer = {} } = {}) {
  const bucket = new Map(Object.entries(objects))
  const requests = []
  const fetch = async (url, init = {}) => {
    if (url.startsWith(RELEASES_PAGE)) {
      const page = Number(url.slice(RELEASES_PAGE.length))
      requests.push({ to: 'github', page, headers: init.headers })
      return answer.github?.(page) ?? json(releases.slice((page - 1) * 100, page * 100))
    }
    if (url === GRAPHQL && init.method === 'POST') {
      const { query, variables } = JSON.parse(init.body)
      if (query.includes('settings')) {
        requests.push({ to: 'settings', headers: init.headers, variables })
        return answer.settings?.() ?? json({ data: { viewer: { zones: [{ settings: { httpRequestsAdaptiveGroups: limits } }] } }, errors: null })
      }
      const { filter } = variables
      requests.push({ to: 'traffic', headers: init.headers, query, variables })
      const groups = new Map()
      for (const [hour, rows] of Object.entries(traffic)) {
        if (hour < filter.datetime_geq || hour >= filter.datetime_lt) continue
        for (const { path, bytes } of rows) groups.set(path, (groups.get(path) ?? 0) + bytes)
      }
      const rows = [...groups].map(([path, bytes]) => ({ dimensions: { clientRequestPath: path }, sum: { edgeResponseBytes: bytes } }))
      return answer.traffic?.(filter) ?? json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: rows }] } }, errors: null })
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const store = {
    list: (prefix) => {
      requests.push({ to: 'list', prefix })
      return [...bucket].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, size: object.size ?? Buffer.byteLength(object.text) }))
    },
    getText: (key) => {
      requests.push({ to: 'get', key })
      if (answer.get) return answer.get(key)
      if (!bucket.has(key)) throw new Error(`aws s3api failed (exit 254)\nAn error occurred (NoSuchKey)`)
      return bucket.get(key).text
    },
    putText: (key, text, headers) => {
      requests.push({ to: 'put', key })
      bucket.set(key, { text, ...headers })
    }
  }
  return { bucket, store, fetch, requests }
}

const RUN = { repository: 'aloong-planet/agentshed', githubToken: 'gh-token', analyticsToken: 'cf-token', zone: 'zone-tag', host: 'dl.agentshed.aloongplanet.com', acceptGap: false }
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

test("GitHub's releases are read page after page with the workflow's token, until a page holds fewer than a hundred", async () => {
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

const text = (body, status = 200) => new Response(body, { status })
const zoneAnswer = (zone) => json({ data: { viewer: { zones: [zone] } }, errors: null })

// Failures G1, G2 and G5 through a run: each read that fails or answers what the run cannot validate fails the run
// before anything is written, the previous file and its cursor untouched
test('a run in which any read fails, or answers what the run cannot validate, writes nothing', async () => {
  // Its cursor an hour before the last full hour, so that the run has one range of traffic to read
  const previousFile = { text: `${JSON.stringify({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' }, null, 2)}\n` }
  const mirrored = { 'stats/downloads.json': previousFile, [DMG_KEY]: { size: 1000 } }
  const cases = [
    ['the statistics file that cannot be read', { answer: { get: () => { throw new Error('aws s3api failed (exit 255)\nAccessDenied') } } }, /AccessDenied/],
    ['the statistics file that is not JSON', { objects: { ...mirrored, 'stats/downloads.json': { text: '{"schemaVersion": 1,' } } }, /the statistics file in the bucket is not JSON/],
    ['the statistics file of another schema', { objects: { ...mirrored, 'stats/downloads.json': { text: JSON.stringify({ ...writtenFile(), schemaVersion: 2 }) } } }, /has schemaVersion 2, not 1/],
    ['a mirrored DMG at another size than recorded', { objects: { ...mirrored, [DMG_KEY]: { size: 999 } } }, /is 999 bytes in the bucket, not the 1000 recorded/],
    ["GitHub's first page failing", { answer: { github: () => json({ message: 'Server Error' }, 500) } }, /page 1 of GitHub's releases answered HTTP 500/],
    ["GitHub's second page failing", { releases: [...REAL_RELEASES, ...Array.from({ length: 91 }, (_, i) => copyOf(`v0.3.${i}`, { idBase: 700000000 + i * 10 }))], answer: { github: (page) => (page === 2 ? json({ message: 'rate limited' }, 403) : undefined) } }, /page 2 of GitHub's releases answered HTTP 403/],
    ["GitHub's page that is not JSON", { answer: { github: () => text('<html>') } }, /page 1 of GitHub's releases answered with a body that is not JSON/],
    ["GitHub's page that is not a list", { answer: { github: () => json({ message: 'Bad credentials' }) } }, /page 1 of GitHub's releases is not a list/],
    ["GitHub's entry that is not a release", { releases: [{ ...REAL_RELEASES[0], assets: null }] }, /GitHub listed a release that is not one/],
    ['the limits answered with HTTP 403', { answer: { settings: () => json({ success: false }, 403) } }, /Cloudflare's analytics answered HTTP 403/],
    ['the limits answered with errors at HTTP 200', { answer: { settings: () => json({ data: null, errors: [{ message: 'not authorized for that zone' }] }) } }, /answered with errors: not authorized for that zone/],
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

// Failures G1 and G2 through the bucket's two listings, read through the aws-cli adapter: one that fails, or answers
// what the adapter cannot read, fails the run. Neither reads as an empty bucket, which would start the count over (the
// statistics file's listing) or drop the DMGs not yet recorded (the listing under releases/)
test('a run whose bucket listing fails, or answers what cannot be read, writes nothing, whichever listing it is', async () => {
  const previousFile = { text: `${JSON.stringify({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' }, null, 2)}\n` }
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const answers = [
    ['fails', () => { throw new Error('aws s3api failed (exit 255)\nAn error occurred (InternalError)') }, () => /InternalError/],
    ['prints nothing', () => ({ stdout: '' }), (prefix) => new RegExp(escaped(`aws listed ${prefix} as "", not a listing`))],
    ['prints no listing', () => ({ stdout: '{}' }), (prefix) => new RegExp(escaped(`aws listed ${prefix} as "{}", not a listing`))]
  ]
  for (const prefix of ['stats/downloads.json', 'releases/']) {
    for (const [label, answer, reason] of answers) {
      const w = world({ objects: { 'stats/downloads.json': previousFile, [DMG_KEY]: { size: 1000 } } })
      const aws = awsOf(w)
      const listsPrefix = (args) => args[1] === 'list-objects-v2' && args[args.indexOf('--prefix') + 1] === prefix
      const run = (args) => (listsPrefix(args) ? answer() : aws.run(args))
      const bucket = awsBucket({ bucket: 'agentshed-releases', endpoint: 'https://acct.r2.cloudflarestorage.com', run })
      const before = w.bucket.get('stats/downloads.json')
      await assert.rejects(collect({ ...RUN, bucket, fetch: w.fetch, now: NOW }), reason(prefix), `${prefix} ${label}`)
      assert.equal(w.requests.some(({ to }) => to === 'put'), false, `${prefix} ${label}`)
      assert.equal(w.bucket.get('stats/downloads.json'), before, `${prefix} ${label}`)
    }
  }
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
// 14 November 10:00. Each stall fails the scheduled run and is resumed by a manual run that accepts it.
test('a stalled count fails every scheduled run, and a manual run that accepts the gap resumes it, recording the gap and keeping the counts', async () => {
  const limits = { ...LIMITS, notOlderThan: 8 * DAY }
  const objects = { [DMG_KEY]: { size: 1000 } }
  const traffic = {
    '2026-09-10T00:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 9000 }],
    '2026-09-30T12:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 2000 }],
    '2026-10-15T00:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 9000 }],
    '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }]
  }
  const runAt = async (now, previous, acceptGap) => {
    const w = world({ objects: { ...objects, ...(previous ? { 'stats/downloads.json': previous } : {}) }, limits, traffic })
    await collect({ ...RUN, bucket: w.store, fetch: w.fetch, now, acceptGap })
    return w.bucket.get('stats/downloads.json')
  }
  const september = await runAt(Date.UTC(2026, 8, 1, 0, 47, 12), null, false)
  await assert.rejects(runAt(Date.UTC(2026, 9, 1, 0, 47, 12), september, false), /the cursor 2026-09-01T00:00:00Z is older than 2026-09-23T01:00:00Z/)
  const october = await runAt(Date.UTC(2026, 9, 1, 0, 47, 12), september, true)
  await assert.rejects(runAt(NOW, october, false), /the cursor 2026-10-01T00:00:00Z is older than 2026-11-14T10:00:00Z/)
  const file = JSON.parse((await runAt(NOW, october, true)).text)

  assert.deepEqual(file.r2Gaps, [
    { from: '2026-09-01T00:00:00Z', to: '2026-09-23T01:00:00Z' },
    { from: '2026-10-01T00:00:00Z', to: '2026-11-14T10:00:00Z' }
  ])
  assert.equal(file.r2Cursor, '2026-11-22T09:00:00Z')
  assert.deepEqual(file.r2.objects[DMG_KEY], { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 3000 })
  assert.deepEqual(file.github.assets, REAL_ASSETS)
  assert.deepEqual(file.summary, { total: 23, sources: { github: 20, r2: 3 } })
})

// The arguments are the contract with aws-cli. With --query, aws-cli applies the expression to the whole paginated
// listing and prints {"objects": null} when nothing matches (its JSON formatter prints nothing at all for an empty
// result, which a bare listing would be)
test('the aws-cli adapter lists a prefix on the R2 endpoint, and reads an object back into text', () => {
  const calls = []
  const answers = [
    JSON.stringify({ objects: [{ Key: DMG_KEY, LastModified: '2026-11-22T09:00:00+00:00', ETag: '"abc"', Size: 129601307, StorageClass: 'STANDARD' }] }),
    '{\n    "objects": null\n}\n'
  ]
  const run = (args) => {
    calls.push(args)
    if (args[1] === 'get-object') {
      writeFileSync(args.at(-1), '{"schemaVersion":1}\n')
      return { stdout: JSON.stringify({ ContentLength: 20, ContentType: 'application/json' }) }
    }
    return { stdout: answers.shift() }
  }
  const bucket = awsBucket({ bucket: 'agentshed-releases', endpoint: 'https://acct.r2.cloudflarestorage.com', run })
  const target = ['--endpoint-url', 'https://acct.r2.cloudflarestorage.com', '--region', 'auto']

  assert.deepEqual(bucket.list('releases/'), [{ key: DMG_KEY, size: 129601307 }])
  assert.deepEqual(calls[0], ['s3api', 'list-objects-v2', '--bucket', 'agentshed-releases', '--prefix', 'releases/', ...target, '--output', 'json', '--query', '{objects: Contents}'])
  assert.deepEqual(bucket.list('stats/downloads.json'), [])
  assert.equal(bucket.getText('stats/downloads.json'), '{"schemaVersion":1}\n')
  assert.deepEqual(calls[2].slice(0, -1), ['s3api', 'get-object', '--bucket', 'agentshed-releases', '--key', 'stats/downloads.json', ...target])
  assert.throws(() => readFileSync(calls[2].at(-1)), /ENOENT/)
})

test('a listing the adapter cannot read fails rather than reads as empty', () => {
  for (const stdout of ['', 'not json', '{}', '{"objects": {}}', '{"objects": [{"Key": "releases/a.dmg"}]}', '{"objects": [{"Key": 7, "Size": 1}]}', '{"objects": [{"Key": "releases/a.dmg", "Size": -1}]}']) {
    const bucket = awsBucket({ bucket: 'b', endpoint: 'https://acct.r2.cloudflarestorage.com', run: () => ({ stdout }) })
    assert.throws(() => bucket.list('releases/'), /aws listed releases\/ as/, JSON.stringify(stdout))
  }
})

const ENV = {
  R2_ACCOUNT_ID: 'acct',
  R2_BUCKET: 'agentshed-releases',
  AWS_ACCESS_KEY_ID: 'r2-key',
  AWS_SECRET_ACCESS_KEY: 'r2-secret',
  CF_ANALYTICS_API_TOKEN: 'cf-token',
  CF_ZONE_ID: 'zone-tag',
  GITHUB_TOKEN: 'gh-token',
  GITHUB_REPOSITORY: 'aloong-planet/agentshed',
  DOWNLOAD_HOST: 'https://dl.agentshed.aloongplanet.com'
}

/** aws-cli as the entry point drives it, answering from a world's bucket */
function awsOf({ store }) {
  const calls = []
  const run = (args) => {
    calls.push(args)
    const prefix = args[args.indexOf('--prefix') + 1]
    if (args[1] === 'list-objects-v2') {
      const objects = store.list(prefix).map(({ key, size }) => ({ Key: key, Size: size }))
      return { stdout: JSON.stringify({ objects: objects.length ? objects : null }) }
    }
    if (args[1] === 'get-object') {
      writeFileSync(args.at(-1), store.getText(args[args.indexOf('--key') + 1]))
      return { stdout: '{}' }
    }
    store.putText(args[3].slice('s3://agentshed-releases/'.length), readFileSync(args[2], 'utf8'), {
      cacheControl: args[args.indexOf('--cache-control') + 1],
      contentType: args[args.indexOf('--content-type') + 1]
    })
    return { stdout: '' }
  }
  return { calls, run }
}

// The collection's credentials: a run without any of them fails before it reads anything
test('the entry point refuses a missing setting before any read', async () => {
  const deps = { run: () => { throw new Error('aws was called') }, fetch: async () => { throw new Error('the network was used') }, now: () => NOW, log: () => {} }
  assert.equal(Object.keys(ENV).length, 9)
  for (const name of Object.keys(ENV)) {
    const without = Object.fromEntries(Object.entries(ENV).filter(([key]) => key !== name))
    await assert.rejects(main(without, deps), new RegExp(`${name} is not set`), name)
  }
})

test('the entry point counts on the account endpoint with each credential where it belongs, and accepts a gap only when told to', async () => {
  const stale = { ...writtenFile(), r2Cursor: '2026-10-01T00:00:00Z', r2Gaps: [] }
  const setup = () => world({ objects: { [DMG_KEY]: { size: 1000 }, 'stats/downloads.json': { text: JSON.stringify(stale) } }, traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 500 }] } })
  const lines = []
  for (const value of [undefined, 'false', 'yes']) {
    const w = setup()
    await assert.rejects(main({ ...ENV, ACCEPT_GAP: value }, { ...awsOf(w), fetch: w.fetch, now: () => NOW, log: () => {} }), /is older than/, String(value))
  }
  const w = setup()
  const aws = awsOf(w)
  await main({ ...ENV, ACCEPT_GAP: 'true' }, { run: aws.run, fetch: w.fetch, now: () => NOW, log: (line) => lines.push(line) })

  for (const args of aws.calls) assert.deepEqual(args.slice(args.indexOf('--endpoint-url'), args.indexOf('--endpoint-url') + 2), ['--endpoint-url', 'https://acct.r2.cloudflarestorage.com'])
  assert.equal(w.requests.find(({ to }) => to === 'github').headers.authorization, 'Bearer gh-token')
  for (const { headers, variables } of w.requests.filter(({ to }) => to === 'settings' || to === 'traffic')) {
    assert.equal(headers.authorization, 'Bearer cf-token')
    assert.equal(variables.zoneTag, 'zone-tag')
  }
  assert.equal(w.requests.find(({ to }) => to === 'traffic').variables.filter.clientRequestHTTPHost, 'dl.agentshed.aloongplanet.com')
  const file = published(w.bucket)
  assert.deepEqual(file.r2Gaps, [{ from: '2026-10-01T00:00:00Z', to: '2026-10-22T10:00:00Z' }])
  assert.equal(file.r2.objects[DMG_KEY].bytes, 3000)
  assert.equal(w.bucket.get('stats/downloads.json').contentType, 'application/json')
  assert.deepEqual(lines, ['[download-count] 23 downloads: 20 on GitHub, 3 from the download host, counted to 2026-11-22T09:00:00Z'])
  for (const secret of ['r2-key', 'r2-secret', 'cf-token', 'gh-token']) assert.equal(lines.join('\n').includes(secret), false, secret)
})

test('the script run as a process exits with a failure when it cannot count', () => {
  const result = spawnSync(process.execPath, [new URL('./download-count.mjs', import.meta.url).pathname], { env: {}, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /\[download-count\] R2_ACCOUNT_ID is not set/)
})
