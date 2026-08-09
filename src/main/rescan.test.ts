// token-stats sequence E: the automatic refresh's pure function seam — the focus throttle judgement and
// parsing of injected parameters.
// The trigger wiring (timer and focus events) is in the assembly layer, driven by e2e with a short
// interval injected.
import { describe, it, expect } from 'vitest'
import { shouldRescanOnFocus, rescanIntervalMs } from './rescan'

describe('shouldRescanOnFocus (E1 throttling)', () => {
  it('never scanned → scan; less than the throttle window since the last → do not scan; at the window (inclusive) → scan', () => {
    expect(shouldRescanOnFocus(1000, null, 60_000)).toBe(true)
    expect(shouldRescanOnFocus(59_999, 0, 60_000)).toBe(false)
    expect(shouldRescanOnFocus(60_000, 0, 60_000)).toBe(true)
    expect(shouldRescanOnFocus(100_000, 90_000, 60_000)).toBe(false)
  })
})

describe('rescanIntervalMs (E5 parameter injection)', () => {
  it('a valid positive integer takes the injected value; missing, non-numeric, zero or negative → the default', () => {
    expect(rescanIntervalMs('2000', 300_000)).toBe(2000)
    expect(rescanIntervalMs(undefined, 300_000)).toBe(300_000)
    expect(rescanIntervalMs('abc', 300_000)).toBe(300_000)
    expect(rescanIntervalMs('0', 300_000)).toBe(300_000)
    expect(rescanIntervalMs('-5', 300_000)).toBe(300_000)
  })
})
