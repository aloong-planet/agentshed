// The update contract's entry checks (ADR-0001: validated at both ends). A version from the release feed is
// external content, so these are also the line that keeps a malformed one out of the renderer (Failures A6, H1).
import { describe, expect, it } from 'vitest'
import { isReleaseVersion, parseCheckOutcome, parseSettingsCheck, parseUpdateNotice, parseUpdateState } from './update'

describe('isReleaseVersion', () => {
  it('accepts the versions the release line tags', () => {
    for (const v of ['0.1.0', '0.1.0-beta', '0.1.0-beta.2', '1.10.0', '2.0.0-rc.1']) expect(isReleaseVersion(v), v).toBe(true)
  })
  it('rejects anything else the feed could carry', () => {
    for (const v of ['v0.1.0', '0.1', '01.2.3', '0.1.0+build.1', '0.1.0-', '0.1.0-beta..2', ' 0.1.0', '<b>0.1.0</b>', '1.0.0-' + 'x'.repeat(60), '', 1, null]) {
      expect(isReleaseVersion(v), String(v)).toBe(false)
    }
  })
})

describe('parseUpdateState', () => {
  it('accepts every lifecycle state in its own shape', () => {
    const states = [
      { phase: 'idle', version: null, progress: 0 },
      { phase: 'checking', version: null, progress: 0 },
      { phase: 'downloading', version: '0.2.0', progress: 37 },
      { phase: 'ready', version: '0.2.0', progress: 100 },
      { phase: 'installing', version: '0.2.0-beta.1', progress: 100 }
    ]
    for (const s of states) expect(parseUpdateState(s), s.phase).toEqual(s)
  })

  it('refuses a payload that breaks the contract', () => {
    const bad: unknown[] = [
      null,
      'ready',
      { phase: 'failed', version: null, progress: 0 },
      { phase: 'downloading', version: null, progress: 10 },
      { phase: 'idle', version: '0.2.0', progress: 0 },
      { phase: 'ready', version: 'v0.2.0', progress: 100 },
      { phase: 'downloading', version: '0.2.0', progress: 101 },
      { phase: 'downloading', version: '0.2.0', progress: 12.5 },
      { phase: 'downloading', version: '0.2.0' }
    ]
    for (const b of bad) expect(parseUpdateState(b), JSON.stringify(b)).toBeNull()
  })
})

describe('parseUpdateNotice', () => {
  it('knows only the install-failed notice', () => {
    expect(parseUpdateNotice({ code: 'installFailed' })).toEqual({ code: 'installFailed' })
    expect(parseUpdateNotice({ code: 'downloadFailed' })).toBeNull()
    expect(parseUpdateNotice('installFailed')).toBeNull()
  })
})

describe('parseSettingsCheck', () => {
  it('accepts settings\' check record in its own shape', () => {
    for (const c of [
      { checking: false, outcome: null },
      { checking: true, outcome: null },
      { checking: true, outcome: 'upToDate' },
      { checking: false, outcome: 'failed' }
    ]) expect(parseSettingsCheck(c), JSON.stringify(c)).toEqual(c)
  })
  it('refuses anything else', () => {
    for (const b of [null, {}, { checking: 'no', outcome: null }, { checking: false, outcome: 'found' }, { checking: false }]) {
      expect(parseSettingsCheck(b), JSON.stringify(b)).toBeNull()
    }
  })
})

describe('parseCheckOutcome', () => {
  it('accepts every outcome in its own shape', () => {
    for (const o of [
      { kind: 'upToDate' },
      { kind: 'failed' },
      { kind: 'found', version: '0.2.0-beta.2' },
      { kind: 'inFlight', state: { phase: 'ready', version: '0.2.0', progress: 100 } },
      { kind: 'unavailable' }
    ]) expect(parseCheckOutcome(o), JSON.stringify(o)).toEqual(o)
  })
  it('refuses a malformed version, a state that is not in flight, and unknown kinds (A6, H1)', () => {
    for (const b of [
      null,
      { kind: 'found' },
      { kind: 'found', version: 'v0.2.0' },
      { kind: 'found', version: '<b>0.2.0</b>' },
      { kind: 'inFlight', state: { phase: 'idle', version: null, progress: 0 } },
      { kind: 'inFlight', state: { phase: 'ready', version: '0.2.0', progress: 140 } },
      { kind: 'downloading' }
    ]) expect(parseCheckOutcome(b), JSON.stringify(b)).toBeNull()
  })
})
