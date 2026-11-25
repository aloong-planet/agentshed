// The download count's Worker (download-count::REQ-011, Failures G1 to G5, G9 and G10, Implementation Decisions "The
// collection" and "The run record"; ADR-0056): a run driven through the Worker's run(), with the bucket's binding
// (scripts/testing/r2-binding.mjs), GitHub and the analytics (scripts/testing/download-count-sources.mjs) standing in at
// the system boundary and the clock fixed.
//
// Gaps: nothing here runs in Cloudflare, and a run in production shows only its own case (docs/ops/download-count.md).
// - The real binding: whether put enforces etagMatches and If-None-Match: *, and how its listing cuts pages, come from
//   Cloudflare's docs only (the stand-in's header). The shadow period's first writes showed that put accepts
//   If-None-Match: *; a write refused by either condition, or a listing of more than one page, is seen only if one
//   happens.
// - workerd: the fetch the handler passes calls the runtime's own at call time, as its own case shows, but whether a
//   detached fetch would throw there cannot be seen in Node; a production run that reads its sources shows that the
//   passed one works. Whether Cloudflare's runtime loads the main module is seen at the deploy; here a case holds its
//   exports to the kinds the runtime takes.
// - Workers Free's 10 ms of CPU and 50 subrequests a run: the switched Worker's first run counts on from the statistics
//   file the workflow last wrote, over the hours since. The heaviest runs are seen only when they happen: one that
//   catches up over the analytics' whole hold, a range for every maxDuration of it besides GitHub's pages (and the
//   binding's calls, if Cloudflare counts them as subrequests), and one that rewrites a run record of 336 entries,
//   from fourteen days after the Worker's first run.
// - The Cron Trigger firing every hour (download-count::REQ-011/AC-04): the run record after the apply.
// - GitHub taking the real token, a fine-grained personal access token with public repositories read-only: the first
//   run after infra binds it, whose run record entry reads `github` `ok`, or `failed` with HTTP 401 if it is refused.
// - A refusal's reason: the refusals here are shaped from GitHub's and Cloudflare's answers to a made-up token
//   (2026-11-25); what either answers when it refuses the real token is seen only in a run it refuses.
// - A token across the 200-character cut of a release GitHub lists that is not one: the failure would quote the part
//   before the cut, which is not replaced. Not driven: it needs GitHub's answer to quote the caller's token.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r2Binding } from './testing/r2-binding.mjs'
import { copyOf, DMG_KEY, json, LIMITS, NOW, REAL_ASSETS, REAL_RELEASES, sources, text, writtenFile } from './testing/download-count-sources.mjs'
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
  RELEASES_READ_TOKEN: 'gh-releases-token',
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

/** A run record entry of the shadow period, as the shadow Worker wrote it: it wrote the shadow file */
const shadowRun = (scheduledTime, r2Cursor) => ({
  scheduledTime, coreSha256: CORE, key: 'stats/downloads-shadow.json', written: true, github: 'ok', analytics: 'ok', bucket: 'ok', failure: null, r2Cursor
})
/** A run record entry for a run that wrote the statistics file, at a scheduled time and cursor */
const wrote = (scheduledTime, r2Cursor) => ({
  scheduledTime, coreSha256: CORE, key: 'stats/downloads.json', written: true, github: 'ok', analytics: 'ok', bucket: 'ok', failure: null, r2Cursor
})
/** The same entry as an earlier Worker wrote it while it deleted the shadow file: with what it found of it */
const wroteDeleting = (scheduledTime, r2Cursor, shadowFile) => ({ ...wrote(scheduledTime, r2Cursor), shadowFile })

// Implementation Decisions "The collection" and "The run record", and download-count::REQ-011/AC-04: a run starts from
// the statistics file in the bucket, writes it, and appends its entry to the run record after the shadow period's
test("a run counts on from the statistics file and appends its entry to the run record, after the shadow period's", async () => {
  const statistics = asText({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' })
  const shadowPeriod = [shadowRun('2026-11-22T07:47:00.000Z', '2026-11-22T07:00:00Z'), shadowRun('2026-11-22T08:47:00.000Z', '2026-11-22T08:00:00Z')]
  const bucket = r2Binding({
    objects: {
      'stats/downloads.json': statistics,
      'stats/worker-runs.json': asText({ schemaVersion: 1, runs: shadowPeriod }),
      [DMG_KEY]: { size: 1000 }
    }
  })
  const { settled, lines } = await runOn(bucket, { traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }] } })
  await settled

  const written = bucket.peek('stats/downloads.json')
  assert.deepEqual(written.httpMetadata, { contentType: 'application/json', cacheControl: 'public, max-age=300' })
  assert.deepEqual(JSON.parse(written.text), {
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

  const record = bucket.peek('stats/worker-runs.json')
  assert.deepEqual(record.httpMetadata, { contentType: 'application/json', cacheControl: 'public, max-age=300' })
  assert.deepEqual(JSON.parse(record.text), {
    schemaVersion: 1,
    runs: [...shadowPeriod, {
      scheduledTime: '2026-11-22T09:47:00.000Z',
      coreSha256: CORE,
      key: 'stats/downloads.json',
      written: true,
      github: 'ok',
      analytics: 'ok',
      bucket: 'ok',
      failure: null,
      r2Cursor: '2026-11-22T09:00:00Z'
    }]
  })
  assert.deepEqual(lines, ['[download-count] 23.5 downloads: 20 on GitHub, 3.5 from the download host, counted to 2026-11-22T09:00:00Z in stats/downloads.json'])
})

// Failure G4 and Failure G1's start over: an empty bucket, nothing mirrored yet and no run record, which the run starts
test('a run on an empty bucket starts the count over, with a download host share of zero, and starts the run record', async () => {
  const bucket = r2Binding()
  const { settled } = await runOn(bucket)
  await settled
  const statistics = fileOf(bucket, 'stats/downloads.json')
  assert.deepEqual([statistics.r2Cursor, statistics.r2Gaps, statistics.r2.objects, statistics.summary], ['2026-11-22T09:00:00Z', [], {}, { total: 20, sources: { github: 20, r2: 0 } }])
  assert.deepEqual(statistics.github.assets, REAL_ASSETS)
  assert.deepEqual(fileOf(bucket, 'stats/worker-runs.json'), { schemaVersion: 1, runs: [wrote('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z')] })
})

// An earlier Worker's entry, with what it found of the shadow file, stays in the record as it was written
test('a run with the statistics file in the bucket builds on it, with the analytics settings it is given', async () => {
  const earlier = wroteDeleting('2026-11-22T08:47:00.000Z', '2026-11-22T08:00:00Z', 'deleted')
  const bucket = r2Binding({
    objects: {
      'stats/downloads.json': asText({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' }),
      'stats/worker-runs.json': asText({ schemaVersion: 1, runs: [earlier] }),
      [DMG_KEY]: { size: 1000 }
    }
  })
  const { settled, requests } = await runOn(bucket, { traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }] } })
  await settled

  const statistics = fileOf(bucket, 'stats/downloads.json')
  assert.equal(statistics.r2Cursor, '2026-11-22T09:00:00Z')
  assert.deepEqual(statistics.r2.objects[DMG_KEY], { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 3500 })
  assert.deepEqual(requests.filter(({ to }) => to === 'traffic').map(({ variables }) => variables.filter.datetime_geq), ['2026-11-22T08:00:00Z'])
  // The Worker's settings reach the analytics: its token, its zone, and the download host's name as the traffic's host
  const analytics = requests.filter(({ to }) => to === 'settings' || to === 'traffic')
  assert.deepEqual(analytics.map(({ to, headers, variables }) => [to, headers.authorization, variables.zoneTag, variables.filter?.clientRequestHTTPHost]), [
    ['settings', 'Bearer cf-token', 'zone-tag', undefined],
    ['traffic', 'Bearer cf-token', 'zone-tag', 'dl.agentshed.aloongplanet.com']
  ])
  assert.deepEqual(fileOf(bucket, 'stats/worker-runs.json'), { schemaVersion: 1, runs: [earlier, wrote('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z')] })
})

/** A statistics file whose cursor is 08:00: a run counts the hour after it */
const STATISTICS_AT_EIGHT = asText({ ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z' })

// "The collection": GitHub's releases with the read-only token and a User-Agent, every page; the token goes to GitHub
// only (any other address fails the stand-in, and so the run)
test("a run reads every page of GitHub's releases with the read-only token and the collection's User-Agent, and sends the token nowhere else", async () => {
  const copies = Array.from({ length: 241 }, (_, i) => copyOf(`v0.2.${i}`, { dmgDownloads: 1, idBase: 800000000 + i * 10 }))
  const bucket = r2Binding()
  const { settled, requests } = await runOn(bucket, { releases: [...REAL_RELEASES, ...copies] })
  await settled
  const pages = requests.filter(({ to }) => to === 'github')
  assert.deepEqual(pages.map(({ page }) => page), [1, 2, 3])
  for (const { headers } of pages) {
    assert.equal(headers.authorization, 'Bearer gh-releases-token')
    assert.equal(headers['user-agent'], 'agentshed-download-count')
  }
  const analytics = requests.filter(({ to }) => to !== 'github')
  assert.ok(analytics.length > 0)
  for (const request of analytics) {
    assert.equal(request.headers.authorization, 'Bearer cf-token')
    assert.equal(JSON.stringify(request).includes('gh-releases-token'), false)
  }
  assert.equal(fileOf(bucket, 'stats/downloads.json').summary.sources.github, 261)
})

// "The collection" (the listing under releases/, every page of it) and download-count::REQ-011/AC-03: a binding that
// answers one object a page, and leaves a recorded DMG out of its listing
test('a run counts the DMGs on every page of the listing, and a recorded DMG left out of it keeps its bytes', async () => {
  const dmg = (version) => `releases/v${version}/Agentshed-${version}-mac-arm64.dmg`
  const name = (version) => `Agentshed-${version}-mac-arm64.dmg`
  const recorded = {
    ...writtenFile(),
    r2Cursor: '2026-11-22T08:00:00Z',
    r2Gaps: [],
    summary: { total: 4, sources: { github: 0, r2: 4 } },
    github: { assets: {} },
    r2: { objects: { [dmg('0.1.9')]: { name: name('0.1.9'), size: 1000, bytes: 4000 } } }
  }
  const bucket = r2Binding({
    objects: {
      'stats/downloads.json': asText(recorded),
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
  const written = fileOf(bucket, 'stats/downloads.json')
  assert.deepEqual(written.r2.objects, {
    [dmg('0.1.9')]: { name: name('0.1.9'), size: 1000, bytes: 4500 },
    [dmg('0.2.0')]: { name: name('0.2.0'), size: 1000, bytes: 1000 },
    [dmg('0.2.1')]: { name: name('0.2.1'), size: 1000, bytes: 2000 },
    [dmg('0.2.2')]: { name: name('0.2.2'), size: 1000, bytes: 3000 }
  })
  assert.deepEqual(written.summary, { total: 30.5, sources: { github: 20, r2: 10.5 } })
})

const failedEntry = (outcomes) => ({
  scheduledTime: '2026-11-22T09:47:00.000Z', coreSha256: CORE, key: 'stats/downloads.json', written: false, ...outcomes, r2Cursor: null
})
const NOT_READ = { github: 'not-read', analytics: 'not-read', bucket: 'not-read' }
// GitHub answering `response` to a read with the Worker's token, and as usual to one without it: a run that read
// again without the token, after any of GitHub's failures, would succeed
const githubAnswers = (response) => ({
  answer: { github: (page, { headers }) => (headers.authorization === 'Bearer gh-releases-token' ? response() : undefined) }
})
// An answer whose body cannot be read, as when the connection drops after its status and headers
const unreadable = (status, headers) =>
  new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('terminated')) } }), { status, headers })

// Failures G1, G2 and G5, and "The run record": a run that fails writes no statistics file and records which source
// failed it, and how, with what failed it
test('a run in which any read fails writes nothing, and records each source as it stood and what failed it', async () => {
  const cases = [
    ['GitHub refusing for its rate limit, no request left', githubAnswers(() => json({ message: 'API rate limit exceeded for 203.0.113.7.' }, 403, { 'x-ratelimit-remaining': '0' })),
      { github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }, /^page 1 of GitHub's releases answered HTTP 403 for its rate limit: API rate limit exceeded for 203\.0\.113\.7\.$/],
    ['GitHub answering 429, no request left', githubAnswers(() => json({ message: 'Too many requests' }, 429, { 'x-ratelimit-remaining': '0' })),
      { github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }, /answered HTTP 429 for its rate limit: Too many requests$/],
    ['GitHub naming a secondary rate limit', githubAnswers(() => json({ message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' }, 403, { 'x-ratelimit-remaining': '41' })),
      { github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }, /answered HTTP 403 for its rate limit: You have exceeded a secondary rate limit\. Please wait a few minutes before you try again\.$/],
    // A body that cannot be read gives no reason; the refusal is still one for the rate limit, by its header
    ['GitHub refusing for its rate limit with a body that cannot be read', githubAnswers(() => unreadable(403, { 'x-ratelimit-remaining': '0' })),
      { github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }, /^page 1 of GitHub's releases answered HTTP 403 for its rate limit$/],
    // A refusal for anything else quotes GitHub's reason, in the shape of GitHub's own answer to a token it does not take
    // (a request with a made-up token, 2026-11-25)
    ['GitHub refusing for anything else', githubAnswers(() => json({ message: 'Resource not accessible by personal access token', documentation_url: 'https://docs.github.com/rest', status: '403' }, 403, { 'x-ratelimit-remaining': '41' })),
      { github: 'failed', analytics: 'not-read', bucket: 'ok' }, /^page 1 of GitHub's releases answered HTTP 403: Resource not accessible by personal access token$/],
    ['GitHub out of reach', githubAnswers(() => { throw new TypeError('fetch failed') }),
      { github: 'failed', analytics: 'not-read', bucket: 'ok' }, /^fetch failed$/],
    ["the analytics' traffic answering 500", { answer: { traffic: () => text('upstream error', 500) } },
      { github: 'ok', analytics: 'failed', bucket: 'ok' }, /^Cloudflare's analytics answered HTTP 500$/],
    // Cloudflare's own answer to a token it does not take (a request with a made-up token, 2026-11-25)
    ['the analytics refusing the token', { answer: { settings: () => json({ success: false, errors: [{ code: 9106, message: 'Authentication failed (status: 400)' }], messages: [], result: null }, 400) } },
      { github: 'ok', analytics: 'failed', bucket: 'ok' }, /^Cloudflare's analytics answered HTTP 400: Authentication failed \(status: 400\)$/],
    ['the statistics file that cannot be read', { failing: { get: (key) => (key === 'stats/downloads.json' ? new Error('R2 get failed: InternalError') : undefined) } },
      { github: 'not-read', analytics: 'not-read', bucket: 'failed' }, /^R2 get failed: InternalError$/],
    ['the listing under releases/ failing', { failing: { list: (prefix) => (prefix === 'releases/' ? new Error('R2 list failed: InternalError') : undefined) } },
      { github: 'ok', analytics: 'not-read', bucket: 'failed' }, /^R2 list failed: InternalError$/],
    // A file the run cannot take is named by its key
    ['the statistics file that is not JSON', { objects: { 'stats/downloads.json': '{"schemaVersion": 1,' } },
      { github: 'not-read', analytics: 'not-read', bucket: 'failed' }, /^stats\/downloads\.json in the bucket is not JSON$/],
    ['the statistics file of another schema', { objects: { 'stats/downloads.json': asText({ ...writtenFile(), schemaVersion: 2 }) } },
      { github: 'not-read', analytics: 'not-read', bucket: 'failed' }, /^stats\/downloads\.json has schemaVersion 2, not 1$/],
    // An answer the run cannot use fails the source it came from, though the run finds it out after the read: the
    // analytics' limits leaving no hour to read, the previous file's cursor after the hours the run may count, and the
    // listing's object that the new file cannot hold
    ["the analytics' limits with a widest range under an hour", { limits: { ...LIMITS, maxDuration: 1800 } },
      { github: 'ok', analytics: 'failed', bucket: 'ok' }, /^the analytics' maxDuration 1800 is narrower than an hour$/],
    ["the analytics' limits holding no full hour", { limits: { ...LIMITS, notOlderThan: 1800 } },
      { github: 'ok', analytics: 'failed', bucket: 'ok' }, /^the analytics hold no full hour: notOlderThan is 1800 seconds$/],
    ['the statistics file with a cursor after the hours the run may count', { objects: { 'stats/downloads.json': asText({ ...writtenFile(), r2Cursor: '2026-11-22T10:00:00Z' }) } },
      { github: 'ok', analytics: 'ok', bucket: 'failed' }, /^the cursor 2026-11-22T10:00:00Z is after 2026-11-22T09:00:00Z, the end of the hours this run may count$/],
    ['a DMG listed at a size that is not a whole number of bytes', { objects: { 'releases/v0.2.1/Agentshed-0.2.1-mac-arm64.dmg': { size: 1.5 } } },
      { github: 'ok', analytics: 'ok', bucket: 'failed' }, /^the new stats\/downloads\.json has an object that is not a DMG's bytes: releases\/v0\.2\.1\/Agentshed-0\.2\.1-mac-arm64\.dmg$/],
    ['a mirrored DMG at another size than recorded', { objects: { [DMG_KEY]: { size: 999 } } },
      { github: 'ok', analytics: 'ok', bucket: 'failed' }, /is 999 bytes in the bucket, not the 1000 recorded$/],
    ['the write of the statistics file failing', { failing: { put: (key) => (key === 'stats/downloads.json' ? new Error('R2 put failed: InternalError') : undefined) } },
      { github: 'ok', analytics: 'ok', bucket: 'failed' }, /^R2 put failed: InternalError$/],
    ['a setting missing', { env: { CF_ZONE_ID: undefined } }, NOT_READ, /^CF_ZONE_ID is not set$/],
    // "A run without its credentials fails": without the GitHub token the run reads nothing, GitHub included
    ['the GitHub token missing', { env: { RELEASES_READ_TOKEN: undefined } }, NOT_READ, /^RELEASES_READ_TOKEN is not set$/],
    ['the GitHub token empty', { env: { RELEASES_READ_TOKEN: '' } }, NOT_READ, /^RELEASES_READ_TOKEN is not set$/]
  ]
  for (const [label, { objects = {}, failing, ...world }, outcomes, reason] of cases) {
    const held = { 'stats/downloads.json': STATISTICS_AT_EIGHT, [DMG_KEY]: { size: 1000 }, ...objects }
    const bucket = r2Binding({ objects: held, failing })
    const before = bucket.peek('stats/downloads.json')
    const { settled, lines } = await runOn(bucket, { traffic: { '2026-11-22T08:00:00Z': [{ path: `/${DMG_KEY}`, bytes: 1000 }] }, ...world })
    await assert.rejects(settled, (error) => reason.test(error.message), label)
    assert.equal(bucket.peek('stats/downloads.json'), before, label)
    const [entry] = fileOf(bucket, 'stats/worker-runs.json').runs
    const { failure, ...fields } = entry
    assert.deepEqual(fields, failedEntry(outcomes), label)
    assert.match(failure, reason, label)
    assert.deepEqual(lines, [`[download-count] ${failure}`], label)
  }
})

// Failure G10: a write only replaces the object the run read, and creates one only where there was none
test('a run that finds the statistics file changed or created since it read the bucket writes nothing over it', async () => {
  const theirs = asText({ ...writtenFile(), updatedAt: '2026-11-22T09:47:30.000Z' })
  const another = (only) => (key, bucket) => { if (key === only) bucket.write(key, theirs) }
  const cases = [
    ['the statistics file changed since the run read it', { 'stats/downloads.json': STATISTICS_AT_EIGHT }, another('stats/downloads.json')],
    ['the statistics file created since the run found none', {}, another('stats/downloads.json')]
  ]
  for (const [label, objects, beforePut] of cases) {
    const bucket = r2Binding({ objects: { ...objects, [DMG_KEY]: { size: 1000 } }, beforePut })
    const { settled } = await runOn(bucket)
    await assert.rejects(settled, /^Error: stats\/downloads\.json changed in the bucket since the run read it$/, label)
    assert.equal(bucket.peek('stats/downloads.json').text, theirs, label)
    const { runs: [entry] } = fileOf(bucket, 'stats/worker-runs.json')
    assert.deepEqual([entry.written, entry.github, entry.analytics, entry.bucket], [false, 'ok', 'ok', 'failed'], label)
  }

  const record = asText({ schemaVersion: 1, runs: [] })
  const bucket = r2Binding({ objects: { 'stats/downloads.json': STATISTICS_AT_EIGHT, [DMG_KEY]: { size: 1000 } }, beforePut: (key, b) => { if (key === 'stats/worker-runs.json') b.write(key, record) } })
  const { settled } = await runOn(bucket)
  await assert.rejects(settled, /^Error: the run's entry was not appended to stats\/worker-runs\.json: stats\/worker-runs\.json changed in the bucket since the run read it$/)
  assert.equal(bucket.peek('stats/worker-runs.json').text, record)
  assert.equal(fileOf(bucket, 'stats/downloads.json').r2Cursor, '2026-11-22T09:00:00Z')
})

// Failure G3: the Worker's ACCEPT_GAP_FROM accepts the gap of the run whose cursor equals it, and of no other
test('a run accepts a stale cursor only when ACCEPT_GAP_FROM is that cursor', async () => {
  const stale = asText({ ...writtenFile(), r2Cursor: '2026-10-01T00:00:00Z', r2Gaps: [] })
  const cases = [
    ['the cursor', '2026-10-01T00:00:00Z', null],
    // The remedy it names is one the Worker has: a run that accepts the gap, not a manual run
    ['another hour', '2026-10-02T00:00:00Z',
      /^Error: the cursor 2026-10-01T00:00:00Z is older than 2026-10-22T10:00:00Z, the oldest full hour the analytics hold; a run that accepts the gap resumes from there \(docs\/ops\/download-count\.md\)$/],
    ['empty', '', /is older than/],
    ['unset', undefined, /is older than/]
  ]
  for (const [label, from, refused] of cases) {
    const bucket = r2Binding({ objects: { 'stats/downloads.json': stale, [DMG_KEY]: { size: 1000 } } })
    const { settled } = await runOn(bucket, { env: { ACCEPT_GAP_FROM: from } })
    if (refused) {
      await assert.rejects(settled, refused, label)
      assert.equal(bucket.peek('stats/downloads.json').text, stale, label)
      // A refused gap fails no read: every source answered
      const [entry] = fileOf(bucket, 'stats/worker-runs.json').runs
      assert.deepEqual([entry.written, entry.github, entry.analytics, entry.bucket], [false, 'ok', 'ok', 'ok'], label)
      continue
    }
    await settled
    const statistics = fileOf(bucket, 'stats/downloads.json')
    assert.deepEqual(statistics.r2Gaps, [{ from: '2026-10-01T00:00:00Z', to: '2026-10-22T10:00:00Z' }], label)
    assert.equal(statistics.r2Cursor, '2026-11-22T09:00:00Z', label)
  }
})

// Failure G9: a run record that cannot be read, or is not one, is left as it is; the statistics file is still written
test('a run record that cannot be read or is not one is left as it is, while the statistics file is written and the run fails', async () => {
  const { coreSha256, ...missingField } = wrote('2026-11-22T08:47:00.000Z', '2026-11-22T08:00:00Z')
  const cases = [
    ['cannot be read', null, /: R2 get failed: InternalError$/],
    ['not JSON', '{"schemaVersion": 1,', /: the run record is not JSON$/],
    ['schemaVersion 2', asText({ schemaVersion: 2, runs: [] }), /: the run record has schemaVersion 2, not 1$/],
    ['an entry missing a field', asText({ schemaVersion: 1, runs: [missingField] }), /: the run record has a run that is not one: entry 0$/]
  ]
  assert.equal(coreSha256, CORE)
  for (const [label, record, reason] of cases) {
    const failing = record === null ? { get: (key) => (key === 'stats/worker-runs.json' ? new Error('R2 get failed: InternalError') : undefined) } : {}
    const objects = { 'stats/downloads.json': STATISTICS_AT_EIGHT, [DMG_KEY]: { size: 1000 }, ...(record === null ? { 'stats/worker-runs.json': '{}' } : { 'stats/worker-runs.json': record }) }
    const bucket = r2Binding({ objects, failing })
    const before = bucket.peek('stats/worker-runs.json')
    const { settled } = await runOn(bucket)
    await assert.rejects(settled, (error) => error.message.startsWith("the run's entry was not appended to stats/worker-runs.json") && reason.test(error.message), label)
    assert.equal(bucket.peek('stats/worker-runs.json'), before, label)
    assert.equal(fileOf(bucket, 'stats/downloads.json').r2Cursor, '2026-11-22T09:00:00Z', label)
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
    const bucket = r2Binding({ objects: { 'stats/downloads.json': STATISTICS_AT_EIGHT } })
    const before = bucket.peek('stats/downloads.json')
    const { settled, requests } = await runOn(bucket, { env })
    await assert.rejects(settled, (error) => reason.test(error.message), label)
    assert.deepEqual(requests, [], label)
    assert.equal(bucket.peek('stats/downloads.json'), before, label)
    assert.equal(bucket.peek('stats/worker-runs.json'), undefined, label)
  }
})

// "The run record": the newest 336 runs
test('a run appended to a full run record drops the oldest run', async () => {
  const hour = (i) => new Date(Date.UTC(2026, 10, 8, 9, 47) + i * 3_600_000).toISOString()
  const runs = Array.from({ length: 336 }, (_, i) => wroteDeleting(hour(i), new Date(Date.UTC(2026, 10, 8, 9) + i * 3_600_000).toISOString().replace('.000Z', 'Z'), 'deleted'))
  const bucket = r2Binding({ objects: { 'stats/downloads.json': STATISTICS_AT_EIGHT, 'stats/worker-runs.json': asText({ schemaVersion: 1, runs }) } })
  const { settled } = await runOn(bucket)
  await settled
  const record = fileOf(bucket, 'stats/worker-runs.json')
  assert.equal(record.runs.length, 336)
  assert.equal(record.runs[0].scheduledTime, '2026-11-08T10:47:00.000Z')
  assert.equal(record.runs.at(-2).scheduledTime, '2026-11-22T08:47:00.000Z')
  assert.deepEqual(record.runs.at(-1), wrote('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z'))
})

// "The run record": a failure is never a credential, even where an answer quotes a token whole
test('a failure that quotes either token whole is recorded, printed and thrown without it', async () => {
  const analyticsToken = 'cf-0123456789-secret'
  const githubToken = 'github_pat_0123456789_secret'
  const cases = [
    ['the analytics token', { settings: () => json({ data: null, errors: [{ message: `the token ${analyticsToken} is not authorized for zone-tag; ${analyticsToken}` }] }) },
      "Cloudflare's analytics answered with errors: the token [the analytics token] is not authorized for zone-tag; [the analytics token]"],
    ['the GitHub token', { github: () => json([{ note: `the token ${githubToken}; ${githubToken}` }]) },
      'GitHub listed a release that is not one: {"note":"the token [the GitHub token]; [the GitHub token]"}'],
    ["the GitHub token in a refusal's reason",
      { github: () => json({ message: `the token ${githubToken} is not accepted; ${githubToken}`, documentation_url: 'https://docs.github.com/rest', status: '403' }, 403) },
      "page 1 of GitHub's releases answered HTTP 403: the token [the GitHub token] is not accepted; [the GitHub token]"]
  ]
  for (const [label, answer, expected] of cases) {
    const bucket = r2Binding({ objects: { 'stats/downloads.json': STATISTICS_AT_EIGHT } })
    const { settled, lines } = await runOn(bucket, { env: { CF_ANALYTICS_API_TOKEN: analyticsToken, RELEASES_READ_TOKEN: githubToken }, answer })
    const error = await settled.then(() => null, (rejection) => rejection)
    const record = bucket.peek('stats/worker-runs.json').text
    const { failure } = JSON.parse(record).runs[0]
    assert.equal(failure, expected, label)
    assert.equal(error.message, failure, label)
    assert.deepEqual(lines, [`[download-count] ${failure}`], label)
    for (const token of [analyticsToken, githubToken]) assert.equal(record.includes(token), false, label)
  }
})

test("a run record is taken only when it matches the spec's fields exactly, earlier Workers' entries included", () => {
  // The record as runs write it now: the shadow period's entries, then those of the runs that deleted the shadow file,
  // then the runs' since
  const current = () => ({
    schemaVersion: 1,
    runs: [
      shadowRun('2026-11-22T07:47:00.000Z', '2026-11-22T07:00:00Z'),
      { ...shadowRun('2026-11-22T08:47:00.000Z', null), written: false, github: 'rate-limited', analytics: 'not-read', failure: 'page 1 answered HTTP 403 for its rate limit' },
      wroteDeleting('2026-11-22T09:47:00.000Z', '2026-11-22T09:00:00Z', 'deleted'),
      { ...failedEntry({ github: 'rate-limited', analytics: 'not-read', bucket: 'ok' }), shadowFile: 'failed', scheduledTime: '2026-11-22T10:47:00.000Z', failure: 'page 1 answered HTTP 403 for its rate limit' },
      wroteDeleting('2026-11-22T11:47:00.000Z', '2026-11-22T11:00:00Z', 'absent'),
      wrote('2026-11-22T12:47:00.000Z', '2026-11-22T12:00:00Z'),
      { ...failedEntry({ github: 'ok', analytics: 'failed', bucket: 'ok' }), scheduledTime: '2026-11-22T13:47:00.000Z', failure: "Cloudflare's analytics answered HTTP 500" }
    ]
  })
  for (const record of [current(), { schemaVersion: 1, runs: [] }]) {
    assert.deepEqual(validateRuns(structuredClone(record)), record)
  }
  const entry = (record, i) => record.runs[i]
  const mismatches = [
    ['not an object', current, () => []],
    ['schemaVersion 2', current, (r) => { r.schemaVersion = 2 }],
    ['a field the table does not have', current, (r) => { r.note = 'hi' }],
    ['no runs', current, (r) => { delete r.runs }],
    // The shadow period's seed, which the runs that deleted the shadow file dropped
    ['a seed', current, (r) => { r.seed = { at: '2026-11-22T09:47:12.000Z', r2Cursor: '2026-11-22T08:00:00Z', r2Bytes: 2500 } }],
    ['a seed of null', current, (r) => { r.seed = null }],
    ['runs not a list', current, (r) => { r.runs = {} }],
    ['337 runs', current, (r) => { r.runs = Array.from({ length: 337 }, () => entry(r, 2)) }],
    ['a run with another field', current, (r) => { entry(r, 2).note = 'x' }],
    ['a shadow period run with another field', current, (r) => { entry(r, 0).note = 'x' }],
    ['a scheduled time not UTC', current, (r) => { entry(r, 2).scheduledTime = '2026-11-22T17:47:00+08:00' }],
    ['a core hash in capitals', current, (r) => { entry(r, 2).coreSha256 = CORE.toUpperCase() }],
    ['another key', current, (r) => { entry(r, 5).key = 'stats/other.json' }],
    ['written as text', current, (r) => { entry(r, 2).written = 'true' }],
    ['GitHub in another state', current, (r) => { entry(r, 2).github = 'skipped' }],
    ['the analytics rate-limited', current, (r) => { entry(r, 2).analytics = 'rate-limited' }],
    ['the bucket rate-limited', current, (r) => { entry(r, 2).bucket = 'rate-limited' }],
    ['a written run with a failure', current, (r) => { entry(r, 2).failure = 'x' }],
    ['a written run without a cursor', current, (r) => { entry(r, 2).r2Cursor = null }],
    ['a failed run without a failure', current, (r) => { entry(r, 3).failure = null }],
    ['a failed run with a cursor', current, (r) => { entry(r, 3).r2Cursor = '2026-11-22T09:00:00Z' }],
    ['a failed shadow period run with a cursor', current, (r) => { entry(r, 1).r2Cursor = '2026-11-22T08:00:00Z' }],
    ['a shadow period run with shadowFile', current, (r) => { entry(r, 0).shadowFile = 'absent' }],
    ['shadowFile of another value', current, (r) => { entry(r, 4).shadowFile = 'kept' }]
  ]
  for (const [label, base, change] of mismatches) {
    const record = base()
    assert.throws(() => validateRuns(change(record) ?? record), /^Error: the run record /, label)
  }
})

// The runtime takes every export of a Worker's main module for a handler or an entrypoint, and refuses to load a main
// module with any other: workerd 1.20261101.1 answers "Incorrect type for map entry 'X': the provided value is not of
// type 'function or ExportedHandler'" for a string, and runs nothing. Only the handlers object and functions are
// exported here; the files' keys and forms are the core's
test("the Worker's main module exports its handlers and functions only", async () => {
  const main = await import('./download-count-worker.mjs')
  const exported = Object.entries(main)
  assert.ok(exported.length > 1)
  for (const [name, value] of exported) {
    const loads = name === 'default' ? typeof value?.scheduled === 'function' : typeof value === 'function'
    assert.ok(loads, `${name} is exported as ${typeof value}`)
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
