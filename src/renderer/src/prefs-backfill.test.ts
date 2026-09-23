// issue #61: getPrefs's echo must not overwrite a choice the user made first.
import { describe, it, expect } from 'vitest'
import type { Prefs } from '@shared/prefs'
import { backfillPrefs, type PrefKey } from './prefs-backfill'

const DEFAULTS: Prefs = { theme: 'purple', language: 'system', mode: 'system', trendSpan: 30 }
/** The values on disk (what the getPrefs call at mount read) */
const ON_DISK: Prefs = { theme: 'blue', language: 'fr', mode: 'light', trendSpan: 60 }
const touched = (...keys: PrefKey[]): ReadonlySet<PrefKey> => new Set(keys)

describe('backfillPrefs', () => {
  it('a late initial read preserves a newer span and backfills unrelated preferences', () => {
    expect(backfillPrefs({ ...DEFAULTS, trendSpan: 90 }, ON_DISK, touched('trendSpan'))).toEqual({
      theme: 'blue', language: 'fr', mode: 'light', trendSpan: 90
    })
  })

  it('with no field touched by the user, the whole echo is taken', () => {
    expect(backfillPrefs(DEFAULTS, ON_DISK, touched())).toEqual(ON_DISK)
  })

  it('a field the user changed keeps its local value and is not overwritten by the echo', () => {
    // The race itself: the getPrefs issued at mount reads the disk state **before the click**,
    // so if it resolves after the user's write, an unconditional backfill pushes the new choice back to
    // the old value
    const local: Prefs = { ...DEFAULTS, mode: 'dark', trendSpan: 90 }
    expect(backfillPrefs(local, ON_DISK, touched('mode')).mode).toBe('dark')
  })

  it('**only the touched field is skipped**, with the rest still taking the echo', () => {
    // This case is why this function exists. If the implementation degraded to "any touched field skips
    // everything",
    // the theme and language would stay at their defaults. The trigger condition is identical to
    // having no guard (the user has to click before the echo either way),
    // and the difference is the blast radius: no guard gets 1 field wrong (the one just clicked), while
    // coarse-grained gets 2 wrong
    // (the two untouched fields revert to their defaults). Saving one at the cost of two is strictly worse,
    // not a different trade-off
    const local: Prefs = { ...DEFAULTS, mode: 'dark', trendSpan: 90 }
    expect(backfillPrefs(local, ON_DISK, touched('mode'))).toEqual({
      theme: 'blue',
      language: 'fr',
      mode: 'dark', trendSpan: 60
    })
  })

  it('with all fields touched, none of the echo is taken', () => {
    const local: Prefs = { theme: 'amber', language: 'ja', mode: 'dark', trendSpan: 90 }
    expect(backfillPrefs(local, ON_DISK, touched('theme', 'language', 'mode', 'trendSpan'))).toEqual(local)
  })

  it('the fields are independent: touching the theme does not affect the language or mode backfill', () => {
    const local: Prefs = { ...DEFAULTS, theme: 'amber' }
    expect(backfillPrefs(local, ON_DISK, touched('theme'))).toEqual({
      theme: 'amber',
      language: 'fr',
      mode: 'light', trendSpan: 60
    })
  })

  it('when the echo matches the local value the result is unchanged (clicking the same field twice causes no churn)', () => {
    expect(backfillPrefs(ON_DISK, ON_DISK, touched('mode'))).toEqual(ON_DISK)
  })
})
