// Compact notation for token counts.
//
// **Deliberately not localised** (the user's ruling, 2026-08-09): k / M / B are **notation** of the same
// kind as KB / MB / ms
// and are common to every language; switching to Intl's compact form would render other languages in
// their own myriad-based groupings, which is a separate product decision.
// So this file has nothing to do with language and only checks the tiers and their boundaries.
import { describe, it, expect } from 'vitest'
import { fmtTok } from './TokenViz'

describe('fmtTok', () => {
  it('below a thousand, unchanged', () => {
    expect(fmtTok(0)).toBe('0')
    expect(fmtTok(999)).toBe('999')
  })

  it('thousands use k and millions use M', () => {
    expect(fmtTok(1_000)).toBe('1k')
    expect(fmtTok(12_400)).toBe('12k')
    expect(fmtTok(1_200_000)).toBe('1.2M')
  })

  it('**billions use B** — otherwise 12.4B would display as 12400.0M', () => {
    // The tier added this round: at billion-scale totals, M grows to five digits and stops reading as a
    // magnitude
    expect(fmtTok(1_000_000_000)).toBe('1.0B')
    expect(fmtTok(12_400_000_000)).toBe('12.4B')
  })

  it('each tier carries over exactly at its lower boundary, neither early nor late', () => {
    // A wrong boundary would make 999_999 display as something like 1000k
    expect(fmtTok(999)).not.toContain('k')
    expect(fmtTok(999_999)).toContain('k')
    expect(fmtTok(1_000_000)).toContain('M')
    expect(fmtTok(999_999_999)).toContain('M')
    expect(fmtTok(1_000_000_000)).toContain('B')
  })
})
