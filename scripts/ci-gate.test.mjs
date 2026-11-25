// The final CI decision, independent of GitHub scheduling (ci-routing::REQ-003). The workflow tests
// cover its command/needs wiring; the PR run supplies evidence for the real runner and ruleset.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateFailures } from './ci-gate.mjs'

const outcomes = (app) => ({
  changes: { result: 'success', outputs: { app } },
  'repo-policy': { result: 'success' },
  'app-checks': { result: app === 'true' ? 'success' : 'skipped' },
  e2e: { result: app === 'true' ? 'success' : 'skipped' }
})

test('documentation and the application pass after their selected jobs succeed', () => {
  for (const app of ['false', 'true']) {
    assert.deepEqual(gateFailures(outcomes(app)), [])
  }
  const alreadyRan = outcomes('false')
  alreadyRan['app-checks'].result = 'success'
  assert.deepEqual(gateFailures(alreadyRan), [])
})

test('mandatory jobs fail closed on failure, cancellation, unexpected skips and missing results', () => {
  for (const id of ['changes', 'repo-policy', 'app-checks', 'e2e']) {
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      const needs = outcomes('true')
      needs[id].result = result
      assert.ok(gateFailures(needs).some((error) => error.includes(id)), `${id}: ${result}`)
    }
  }
  for (const id of ['app-checks', 'e2e']) {
    for (const result of ['failure', 'cancelled', undefined]) {
      const needs = outcomes('false')
      needs[id].result = result
      assert.ok(gateFailures(needs).some((error) => error.includes(id)), `${id}: ${result}`)
    }
  }
})

test('classification must provide exact boolean strings and all required results', () => {
  for (const value of ['', undefined, true, false, 'TRUE', 'unknown']) {
    const needs = outcomes('false')
    needs.changes.outputs.app = value
    assert.ok(gateFailures(needs).some((error) => error.includes('app')))
  }
  for (const needs of [null, [], {}, { changes: { result: 'success' } }]) assert.ok(gateFailures(needs).length > 0)
})
