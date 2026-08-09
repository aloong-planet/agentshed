// Cross-process contract validation for the preferences. Note this has different semantics from
// PrefsStore's file-read degradation:
// here anything not meeting the contract is refused wholesale (the protocol is broken), while there one
// bad field degrades only itself (see prefs-store.test.ts).
import { describe, it, expect } from 'vitest'
import { parsePrefs, DEFAULT_PREFS } from './prefs'

describe('parsePrefs (cross-process entry validation)', () => {
  it('the defaults: purple + follow the system language + follow the system appearance', () => {
    expect(DEFAULT_PREFS).toEqual({ scheme: 'purple', language: 'system', mode: 'system' })
  })

  it('accepts a valid object and drops extra fields', () => {
    expect(parsePrefs({ scheme: 'blue', language: 'fr', mode: 'dark' })).toEqual({
      scheme: 'blue',
      language: 'fr',
      mode: 'dark'
    })
    expect(parsePrefs({ scheme: 'purple', language: 'system', mode: 'system', extra: 1 })).toEqual({
      scheme: 'purple',
      language: 'system',
      mode: 'system'
    })
  })

  it('"follow system" is a valid language preference value', () => {
    // It is not a language but a policy — the validator has to admit it,
    // or a user following the system would be judged a contract violation on every launch
    expect(parsePrefs({ scheme: 'purple', language: 'system', mode: 'system' })?.language).toBe(
      'system'
    )
  })

  it('"follow system" is likewise a valid appearance mode value', () => {
    // Structurally identical to language: mode stores the policy, not the light/dark resolved at that
    // moment
    expect(parsePrefs({ scheme: 'purple', language: 'zh', mode: 'system' })?.mode).toBe('system')
  })

  it('one field failing the contract refuses the whole thing', () => {
    expect(parsePrefs({ scheme: 'neon', language: 'fr', mode: 'dark' })).toBeNull()
    expect(parsePrefs({ scheme: 'blue', language: 'ko', mode: 'dark' })).toBeNull()
    expect(parsePrefs({ scheme: 'blue', language: 'fr', mode: 'auto' })).toBeNull()
    expect(parsePrefs({ scheme: 'blue', language: 'fr' })).toBeNull()
    expect(parsePrefs({ scheme: 'blue' })).toBeNull()
    expect(parsePrefs({ language: 'fr' })).toBeNull()
    expect(parsePrefs({})).toBeNull()
    expect(parsePrefs(null)).toBeNull()
    expect(parsePrefs('purple')).toBeNull()
  })
})
