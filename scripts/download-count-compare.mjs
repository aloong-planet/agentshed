// The shadow period's comparison (landing-page::REQ-011, Implementation Decisions "The shadow period"; ADR-0056): after
// each run in which it wrote the statistics file, the Download count workflow compares that file with the Worker's
// shadow file and appends the comparison to the comparison record, which it alone writes. The rules here read and
// write no file; the workflow's entry (download-count.mjs) reads the three files and writes the record.
import { hourOf, isUtc, shaped } from './download-count-core.mjs'
import { SHADOW_KEY } from './download-count-worker.mjs'

export const COMPARISONS_KEY = 'stats/shadow-comparisons.json'

const SHA256 = /^[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{40}$/
const FIELDS = ['at', 'workflowRunId', 'workflowCommit', 'workflowCoreSha256', 'workerScheduledTime', 'workerCoreSha256', 'r2Cursor', 'status', 'checks', 'r2BytesSinceSeed']
const CHECKS = ['r2Bytes', 'githubAssets', 'core']

const bytesOf = (file) => Object.values(file.r2.objects).reduce((sum, { bytes }) => sum + bytes, 0)

/** Whether every asset of `earlier` is in `later` with at least its downloads */
const kept = (earlier, later) => Object.entries(earlier.github.assets)
  .every(([id, { downloads }]) => later.github.assets[id] !== undefined && later.github.assets[id].downloads >= downloads)

/**
 * The comparison's checks of two files with the same cursor: `r2Bytes`, every key of either file's objects with the
 * same bytes in the other, a key one lacks counting as 0, and the same size where both have it; `githubAssets`, every
 * asset of the file with the earlier `updatedAt` in the other with at least its downloads, both ways when they were
 * written at the same instant; `core`, the two core hashes equal, which they are not when the Worker's is unknown
 */
function checksOf(statistics, shadow, workflowCoreSha256, workerCoreSha256) {
  const keys = new Set([...Object.keys(statistics.r2.objects), ...Object.keys(shadow.r2.objects)])
  const r2Bytes = [...keys].every((key) => {
    const ours = statistics.r2.objects[key]
    const theirs = shadow.r2.objects[key]
    return (ours?.bytes ?? 0) === (theirs?.bytes ?? 0) && (ours === undefined || theirs === undefined || ours.size === theirs.size)
  })
  const written = Date.parse(statistics.updatedAt) - Date.parse(shadow.updatedAt)
  const githubAssets = (written > 0 || kept(statistics, shadow)) && (written < 0 || kept(shadow, statistics))
  return { r2Bytes, githubAssets, core: workerCoreSha256 !== null && workflowCoreSha256 === workerCoreSha256 }
}

/**
 * One comparison (the comparison record's `comparisons[]`): the statistics file the workflow wrote against the shadow
 * file, null when the bucket holds none, with the Worker's newest run that wrote the shadow file and the seed taken
 * from the run record, null when the bucket holds none
 */
export function compare({ at, workflowRunId, workflowCommit, workflowCoreSha256, statistics, shadow, runs }) {
  const worker = runs?.runs.findLast((run) => run.key === SHADOW_KEY && run.written) ?? null
  const workerCoreSha256 = worker?.coreSha256 ?? null
  const r2Cursor = { statistics: statistics.r2Cursor, shadow: shadow?.r2Cursor ?? null }
  const checks = r2Cursor.statistics === r2Cursor.shadow ? checksOf(statistics, shadow, workflowCoreSha256, workerCoreSha256) : null
  return {
    at,
    workflowRunId,
    workflowCommit,
    workflowCoreSha256,
    workerScheduledTime: worker?.scheduledTime ?? null,
    workerCoreSha256,
    r2Cursor,
    status: checks === null ? 'cursors-differ' : Object.values(checks).every(Boolean) ? 'equal' : 'not-equal',
    checks,
    r2BytesSinceSeed: runs?.seed ? bytesOf(statistics) - runs.seed.r2Bytes : null
  }
}

/**
 * The comparison record, taken only when it has exactly the fields and types of the spec's table (Implementation
 * Decisions "The shadow period"); anything else is not one (Failure G9)
 */
export function validateComparisons(record) {
  const fail = (reason) => { throw new Error(`the comparison record ${reason}`) }
  if (!shaped(record, ['schemaVersion', 'comparisons'])) fail("does not have the comparison record's fields")
  if (record.schemaVersion !== 1) fail(`has schemaVersion ${JSON.stringify(record.schemaVersion)}, not 1`)
  if (!Array.isArray(record.comparisons)) fail('has comparisons that are not a list')
  const hourOrNull = (text) => text === null || hourOf(text) !== null
  for (const [i, c] of record.comparisons.entries()) {
    const differ = c?.status === 'cursors-differ'
    const holds = shaped(c, FIELDS) && isUtc(c.at) && Number.isSafeInteger(c.workflowRunId) && c.workflowRunId > 0 &&
      COMMIT.test(c.workflowCommit) && SHA256.test(c.workflowCoreSha256) &&
      (c.workerScheduledTime === null ? c.workerCoreSha256 === null : isUtc(c.workerScheduledTime) && SHA256.test(c.workerCoreSha256)) &&
      shaped(c.r2Cursor, ['statistics', 'shadow']) && hourOrNull(c.r2Cursor.statistics) && hourOrNull(c.r2Cursor.shadow) &&
      ['cursors-differ', 'equal', 'not-equal'].includes(c.status) &&
      (differ ? c.checks === null : shaped(c.checks, CHECKS) && CHECKS.every((check) => typeof c.checks[check] === 'boolean') &&
        (c.status === 'equal') === CHECKS.every((check) => c.checks[check])) &&
      (c.r2BytesSinceSeed === null || Number.isSafeInteger(c.r2BytesSinceSeed))
    if (!holds) fail(`has a comparison that is not one: entry ${i}`)
  }
  return record
}

/** The comparison record with one more comparison, started when the bucket holds none (`record` null) */
export function appendComparison(record, comparison) {
  return validateComparisons({ schemaVersion: 1, comparisons: [...(record?.comparisons ?? []), comparison] })
}
