// Settings' own update checks and the outcome its result line shows when no update is in flight
// (app-update::US-003/AC-02, REQ-004/AC-02–AC-04, Failures D5, D6, C7). Driven through the public surface
// with a fake check standing for the update controller's, and the lifecycle states the controller pushes.
import { describe, expect, it } from 'vitest'
import { SettingsChecks } from './settings-check'
import type { CheckOutcome, SettingsCheck, UpdateState } from '@shared/update'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function harness(firstRunAfterUpdate = false) {
  const published: SettingsCheck[] = []
  let answer = deferred<CheckOutcome>()
  const checks = new SettingsChecks({
    check: () => answer.promise,
    publish: (s) => published.push(s),
    firstRunAfterUpdate
  })
  return {
    checks,
    published,
    answer: (outcome: CheckOutcome) => {
      answer.resolve(outcome)
      answer = deferred<CheckOutcome>()
    }
  }
}

const DOWNLOADING: UpdateState = { phase: 'downloading', version: '0.2.0', progress: 0 }
const IDLE: UpdateState = { phase: 'idle', version: null, progress: 0 }

describe('SettingsChecks', () => {
  it('a settings check shows checking while it runs, then up to date (US-003/AC-02, D2)', async () => {
    const h = harness()
    const asked = h.checks.check()
    expect(h.checks.state()).toEqual({ checking: true, outcome: null })
    h.answer({ kind: 'upToDate' })
    expect(await asked).toEqual({ kind: 'upToDate' })
    expect(h.checks.state()).toEqual({ checking: false, outcome: 'upToDate' })
    expect(h.published).toEqual([
      { checking: true, outcome: null },
      { checking: false, outcome: 'upToDate' }
    ])
  })

  it('a failed settings check leaves "failed" in the line (US-003/AC-02, A6)', async () => {
    const h = harness()
    const asked = h.checks.check()
    h.answer({ kind: 'failed' })
    expect(await asked).toEqual({ kind: 'failed' })
    expect(h.checks.state()).toEqual({ checking: false, outcome: 'failed' })
  })

  it('an update a settings check finds leaves no outcome: the line follows the update (REQ-004/AC-01)', async () => {
    const h = harness()
    const asked = h.checks.check()
    h.answer({ kind: 'found', version: '0.2.0' })
    expect(await asked).toEqual({ kind: 'found', version: '0.2.0' })
    expect(h.checks.state()).toEqual({ checking: false, outcome: null })
  })

  it('the first run after an update starts with "up to date"; a settings check replaces it (REQ-004/AC-04, C7)', async () => {
    const h = harness(true)
    expect(h.checks.state()).toEqual({ checking: false, outcome: 'upToDate' })
    const asked = h.checks.check()
    h.answer({ kind: 'failed' })
    await asked
    expect(h.checks.state()).toEqual({ checking: false, outcome: 'failed' })
  })

  it('an update found by any check clears the outcome, so a failed download leaves the line empty (REQ-004/AC-02, D5)', async () => {
    const h = harness()
    const asked = h.checks.check()
    h.answer({ kind: 'upToDate' })
    await asked
    // An automatic check finds an update: the controller pushes the download, then its failure
    h.checks.onUpdateState(DOWNLOADING)
    expect(h.checks.state()).toEqual({ checking: false, outcome: null })
    h.checks.onUpdateState(IDLE)
    expect(h.checks.state()).toEqual({ checking: false, outcome: null })
  })

  it('the post-update line goes too when a still newer release is found (C7)', () => {
    const h = harness(true)
    h.checks.onUpdateState(DOWNLOADING)
    h.checks.onUpdateState(IDLE)
    expect(h.checks.state()).toEqual({ checking: false, outcome: null })
  })

  it('a settings check that joins one in flight stays "checking" through the update it finds (US-003/AC-05)', async () => {
    // Starting from an outcome, so the update found has one to clear while the check still runs
    const h = harness(true)
    const asked = h.checks.check()
    expect(h.checks.state()).toEqual({ checking: true, outcome: 'upToDate' })
    h.checks.onUpdateState(DOWNLOADING)
    expect(h.checks.state()).toEqual({ checking: true, outcome: null })
    h.answer({ kind: 'found', version: '0.2.0' })
    await asked
    expect(h.checks.state()).toEqual({ checking: false, outcome: null })
  })

  it.each<CheckOutcome>([
    { kind: 'inFlight', state: { phase: 'ready', version: '0.2.0', progress: 100 } },
    { kind: 'unavailable' }
  ])('an answer that is not an outcome leaves none: %j', async (outcome) => {
    const h = harness(true)
    const asked = h.checks.check()
    h.answer(outcome)
    await asked
    expect(h.checks.state()).toEqual({ checking: false, outcome: null })
  })

  it('a check that rejects still ends its "checking", so "Check now" is not left unavailable for the run', async () => {
    const failing = new SettingsChecks({
      check: () => Promise.reject(new Error('the controller broke its contract')),
      publish: () => {},
      firstRunAfterUpdate: true
    })
    await expect(failing.check()).rejects.toThrow('the controller broke its contract')
    expect(failing.state()).toEqual({ checking: false, outcome: 'upToDate' })
  })
})
