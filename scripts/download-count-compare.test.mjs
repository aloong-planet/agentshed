// The shadow period's comparison (landing-page::REQ-011, Implementation Decisions "The shadow period"): the rules that
// compare the workflow's statistics file with the Worker's shadow file and keep the comparison record. The workflow's
// run that reads and writes the files is in download-count.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendComparison, compare, validateComparisons } from './download-count-compare.mjs'
import { DMG_KEY, writtenFile } from './testing/download-count-sources.mjs'

const WORKFLOW_CORE = 'a'.repeat(64)
const WORKER_CORE = 'b'.repeat(64)
const COMMIT = '247110db9f2a6c3f0b1e5d4c8a7b6e5f4d3c2b1a'
const ran = (scheduledTime, { coreSha256 = WORKFLOW_CORE, written = true, key = 'stats/downloads-shadow.json' } = {}) => ({
  scheduledTime,
  coreSha256,
  key,
  written,
  github: written ? 'ok' : 'rate-limited',
  analytics: written ? 'ok' : 'not-read',
  bucket: 'ok',
  failure: written ? null : 'page 1 of GitHub\'s releases answered HTTP 403 for its rate limit',
  r2Cursor: written ? '2026-11-22T09:00:00Z' : null
})
const SEED = { at: '2026-11-20T10:31:04.000Z', r2Cursor: '2026-11-20T10:00:00Z', r2Bytes: 1000 }
const RUNS = { schemaVersion: 1, seed: SEED, runs: [ran('2026-11-22T09:31:00.000Z')] }
const comparing = (change = {}) => ({
  at: '2026-11-22T09:52:40.000Z',
  workflowRunId: 45059518239,
  workflowCommit: COMMIT,
  workflowCoreSha256: WORKFLOW_CORE,
  statistics: writtenFile(),
  shadow: { ...writtenFile(), updatedAt: '2026-11-22T09:31:20.000Z' },
  runs: RUNS,
  ...change
})

test('files whose cursors differ, or a shadow file the bucket does not hold, are not compared further', () => {
  const cases = [
    ['an hour apart', { ...writtenFile(), r2Cursor: '2026-11-22T08:00:00Z', r2: { objects: { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 2000 } } } }, '2026-11-22T08:00:00Z'],
    ['no shadow file', null, null]
  ]
  for (const [label, shadow, cursor] of cases) {
    assert.deepEqual(compare(comparing({ shadow })), {
      at: '2026-11-22T09:52:40.000Z',
      workflowRunId: 45059518239,
      workflowCommit: COMMIT,
      workflowCoreSha256: WORKFLOW_CORE,
      workerScheduledTime: '2026-11-22T09:31:00.000Z',
      workerCoreSha256: WORKFLOW_CORE,
      r2Cursor: { statistics: '2026-11-22T09:00:00Z', shadow: cursor },
      status: 'cursors-differ',
      checks: null,
      // 2500 bytes in the statistics file, whatever the shadow file holds, and 1000 in the seed
      r2BytesSinceSeed: 1500
    }, label)
  }
})

test('files with the same cursor and counts, from the same core, are equal', () => {
  const comparison = compare(comparing())
  assert.deepEqual([comparison.status, comparison.checks], ['equal', { r2Bytes: true, githubAssets: true, core: true }])
})

test("the download host's bytes are equal only when every object has the same bytes and size in both files", () => {
  const other = 'releases/v0.2.1/Agentshed-0.2.1-mac-arm64.dmg'
  const withObjects = (objects) => ({ ...writtenFile(), updatedAt: '2026-11-22T09:31:20.000Z', r2: { objects } })
  const object = (size, bytes) => ({ name: 'Agentshed-0.2.0-mac-arm64.dmg', size, bytes })
  const cases = [
    ['bytes differ', withObjects({ [DMG_KEY]: object(1000, 2600) }), false],
    ['an object only the shadow file has, with bytes', withObjects({ [DMG_KEY]: object(1000, 2500), [other]: { name: 'Agentshed-0.2.1-mac-arm64.dmg', size: 900, bytes: 1 } }), false],
    ['an object only the statistics file has, with bytes', withObjects({}), false],
    ['sizes differ', withObjects({ [DMG_KEY]: object(1001, 2500) }), false],
    ['an object only the shadow file has, never served', withObjects({ [DMG_KEY]: object(1000, 2500), [other]: { name: 'Agentshed-0.2.1-mac-arm64.dmg', size: 900, bytes: 0 } }), true]
  ]
  for (const [label, shadow, equal] of cases) {
    const comparison = compare(comparing({ shadow }))
    assert.deepEqual([comparison.checks.r2Bytes, comparison.status], [equal, equal ? 'equal' : 'not-equal'], label)
  }
})

test("GitHub's assets hold when the later file has every asset of the earlier with at least its downloads", () => {
  const assets = (counts) => ({ github: { assets: Object.fromEntries(Object.entries(counts).map(([id, downloads]) => [id, { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads }])) } })
  const at = (updatedAt, counts) => ({ ...writtenFile(), updatedAt, ...assets(counts) })
  const earlier = '2026-11-22T09:31:20.000Z'
  const later = '2026-11-22T09:47:12.000Z'
  const cases = [
    ['the later statistics file higher', at(later, { 1: 4 }), at(earlier, { 1: 3 }), true, 'equal'],
    ['the later shadow file higher', at(earlier, { 1: 3 }), at(later, { 1: 4 }), true, 'equal'],
    ['the earlier statistics file higher', at(earlier, { 1: 4 }), at(later, { 1: 3 }), false, 'not-equal'],
    ['the earlier shadow file higher', at(later, { 1: 3 }), at(earlier, { 1: 4 }), false, 'not-equal'],
    ['an asset the later file lacks', at(later, { 1: 3 }), at(earlier, { 1: 3, 2: 1 }), false, 'not-equal'],
    ['an asset only the later file has', at(later, { 1: 3, 2: 1 }), at(earlier, { 1: 3 }), true, 'equal'],
    ['written at the same instant, one asset higher in the statistics file', at(later, { 1: 4 }), at(later, { 1: 3 }), false, 'not-equal'],
    ['written at the same instant, one asset higher in the shadow file', at(later, { 1: 3 }), at(later, { 1: 4 }), false, 'not-equal'],
    ['written at the same instant, the same', at(later, { 1: 3 }), at(later, { 1: 3 }), true, 'equal']
  ]
  // The download host's bytes and the core hold in every case, so the status follows GitHub's assets alone
  for (const [label, statistics, shadow, holds, status] of cases) {
    const comparison = compare(comparing({ statistics, shadow }))
    assert.deepEqual([comparison.checks.githubAssets, comparison.status], [holds, status], label)
  }
})

test("the core holds only when the Worker's newest run that wrote the shadow file used the workflow's core", () => {
  const runs = (...entries) => ({ ...RUNS, runs: entries })
  const cases = [
    ['the same core', runs(ran('2026-11-22T09:31:00.000Z')), '2026-11-22T09:31:00.000Z', WORKFLOW_CORE, true, 'equal'],
    ['another core', runs(ran('2026-11-22T09:31:00.000Z', { coreSha256: WORKER_CORE })), '2026-11-22T09:31:00.000Z', WORKER_CORE, false, 'not-equal'],
    ['the newest written run, past later runs that wrote nothing or wrote the statistics file',
      runs(ran('2026-11-22T07:31:00.000Z', { coreSha256: WORKER_CORE }), ran('2026-11-22T08:31:00.000Z'), ran('2026-11-22T09:31:00.000Z', { coreSha256: WORKER_CORE, written: false }), ran('2026-11-22T10:31:00.000Z', { coreSha256: WORKER_CORE, key: 'stats/downloads.json' })),
      '2026-11-22T08:31:00.000Z', WORKFLOW_CORE, true, 'equal'],
    ['no run that wrote the shadow file', runs(ran('2026-11-22T09:31:00.000Z', { written: false })), null, null, false, 'not-equal'],
    ['no run record', null, null, null, false, 'not-equal']
  ]
  // The download host's bytes and GitHub's assets hold in every case, so the status follows the core alone
  for (const [label, record, scheduledTime, coreSha256, holds, status] of cases) {
    const comparison = compare(comparing({ runs: record }))
    assert.deepEqual([comparison.workerScheduledTime, comparison.workerCoreSha256, comparison.checks.core, comparison.status], [scheduledTime, coreSha256, holds, status], label)
  }
})

test('the bytes since the seed are unknown without a seed', () => {
  assert.equal(compare(comparing({ runs: { ...RUNS, seed: null } })).r2BytesSinceSeed, null)
  assert.equal(compare(comparing({ runs: null })).r2BytesSinceSeed, null)
})

test("a comparison record is taken only when it matches the spec's fields exactly, and one more is appended to it", () => {
  const first = compare(comparing())
  const second = compare(comparing({ at: '2026-11-22T10:52:40.000Z', shadow: null }))
  const record = appendComparison(appendComparison(null, first), second)
  assert.deepEqual(record, { schemaVersion: 1, comparisons: [first, second] })
  assert.deepEqual(validateComparisons(structuredClone(record)), record)

  const entry = (r, i = 0) => r.comparisons[i]
  const mismatches = [
    ['not an object', () => []],
    ['schemaVersion 2', (r) => { r.schemaVersion = 2 }],
    ['a field the table does not have', (r) => { r.note = 'x' }],
    ['comparisons not a list', (r) => { r.comparisons = {} }],
    ['a comparison with another field', (r) => { entry(r).note = 'x' }],
    ['a time not UTC', (r) => { entry(r).at = '2026-11-22 09:52' }],
    ['a run ID as text', (r) => { entry(r).workflowRunId = '45059518239' }],
    ['a short commit', (r) => { entry(r).workflowCommit = '247110db' }],
    ["the workflow's core in capitals", (r) => { entry(r).workflowCoreSha256 = WORKFLOW_CORE.toUpperCase() }],
    ["the Worker's core without its run", (r) => { entry(r).workerScheduledTime = null }],
    ["the Worker's run without its core", (r) => { entry(r).workerCoreSha256 = null }],
    ['a cursor off the hour', (r) => { entry(r).r2Cursor.shadow = '2026-11-22T09:30:00Z' }],
    ['another status', (r) => { entry(r).status = 'same' }],
    ['checks for cursors that differ', (r) => { entry(r, 1).checks = { r2Bytes: true, githubAssets: true, core: true } }],
    ['no checks for cursors that are the same', (r) => { entry(r).checks = null }],
    ['equal with a check that failed', (r) => { entry(r).checks.core = false }],
    ['not-equal with every check holding', (r) => { entry(r).status = 'not-equal' }],
    ['a check as text', (r) => { entry(r).checks.r2Bytes = 'true' }],
    ['bytes since the seed as a fraction', (r) => { entry(r).r2BytesSinceSeed = 1.5 }]
  ]
  for (const [label, change] of mismatches) {
    const changed = structuredClone(record)
    assert.throws(() => validateComparisons(change(changed) ?? changed), /^Error: the comparison record /, label)
  }
  assert.throws(() => appendComparison(record, { ...second, workflowRunId: Number.NaN }), /the comparison record has a comparison that is not one: entry 2/)
})
