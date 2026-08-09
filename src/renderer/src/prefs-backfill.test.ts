// issue #61: getPrefs's echo must not overwrite a choice the user made first.
import { describe, it, expect } from 'vitest'
import type { Prefs } from '@shared/prefs'
import { backfillPrefs, type PrefKey } from './prefs-backfill'

const DEFAULTS: Prefs = { scheme: 'purple', language: 'system', mode: 'system' }
/** The values on disk (what the getPrefs call at mount read) */
const ON_DISK: Prefs = { scheme: 'blue', language: 'fr', mode: 'light' }
const touched = (...keys: PrefKey[]): ReadonlySet<PrefKey> => new Set(keys)

describe('backfillPrefs', () => {
  it('with no field touched by the user, the whole echo is taken', () => {
    expect(backfillPrefs(DEFAULTS, ON_DISK, touched())).toEqual(ON_DISK)
  })

  it('a field the user changed keeps its local value and is not overwritten by the echo', () => {
    // The race itself: the getPrefs issued at mount reads the disk state **before the click**,
    // so if it resolves after the user's write, an unconditional backfill pushes the new choice back to
    // the old value
    const local: Prefs = { ...DEFAULTS, mode: 'dark' }
    expect(backfillPrefs(local, ON_DISK, touched('mode')).mode).toBe('dark')
  })

  it('**only the touched field is skipped**, with the rest still taking the echo', () => {
    // This case is why this function exists. If the implementation degraded to "any touched field skips
    // everything",
    // the colour scheme and language would stay at their defaults. The trigger condition is identical to
    // having no guard (the user has to click before the echo either way),
    // and the difference is the blast radius: no guard gets 1 field wrong (the one just clicked), while
    // coarse-grained gets 2 wrong
    // (the two untouched fields revert to their defaults). Saving one at the cost of two is strictly worse,
    // not a different trade-off
    const local: Prefs = { ...DEFAULTS, mode: 'dark' }
    expect(backfillPrefs(local, ON_DISK, touched('mode'))).toEqual({
      scheme: 'blue',
      language: 'fr',
      mode: 'dark'
    })
  })

  it('with all three fields touched, none of the echo is taken', () => {
    const local: Prefs = { scheme: 'amber', language: 'ja', mode: 'dark' }
    expect(backfillPrefs(local, ON_DISK, touched('scheme', 'language', 'mode'))).toEqual(local)
  })

  it('the fields are independent: touching the colour scheme does not affect the language or mode backfill', () => {
    const local: Prefs = { ...DEFAULTS, scheme: 'amber' }
    expect(backfillPrefs(local, ON_DISK, touched('scheme'))).toEqual({
      scheme: 'amber',
      language: 'fr',
      mode: 'light'
    })
  })

  it('when the echo matches the local value the result is unchanged (clicking the same field twice causes no churn)', () => {
    expect(backfillPrefs(ON_DISK, ON_DISK, touched('mode'))).toEqual(ON_DISK)
  })
})
