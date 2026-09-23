// Cross-process contract validation for the preferences. Note this has different semantics from
// PrefsStore's file-read degradation:
// here anything not meeting the contract is refused wholesale (the protocol is broken), while there one
// bad field degrades only itself (see prefs-store.test.ts).
import { describe, it, expect } from 'vitest'
import { parsePrefs, DEFAULT_PREFS } from './prefs'

describe('parsePrefs (cross-process entry validation)', () => {
  it('the defaults: purple + follow the system language + follow the system appearance', () => {
    expect(DEFAULT_PREFS).toEqual({ theme: 'purple', language: 'system', mode: 'system', trendSpan: 30 })
  })

  it('accepts a valid object and drops extra fields', () => {
    expect(parsePrefs({ theme: 'blue', language: 'fr', mode: 'dark', trendSpan: 30 })).toEqual({
      theme: 'blue',
      language: 'fr',
      mode: 'dark', trendSpan: 30
    })
    expect(parsePrefs({ theme: 'purple', language: 'system', mode: 'system', trendSpan: 30, extra: 1 })).toEqual({
      theme: 'purple',
      language: 'system',
      mode: 'system', trendSpan: 30
    })
  })

  it('"follow system" is a valid language preference value', () => {
    // It is not a language but a policy — the validator has to admit it,
    // or a user following the system would be judged a contract violation on every launch
    expect(parsePrefs({ theme: 'purple', language: 'system', mode: 'system', trendSpan: 30 })?.language).toBe(
      'system'
    )
  })

  it('"follow system" is likewise a valid appearance mode value', () => {
    // Structurally identical to language: mode stores the policy, not the light/dark resolved at that
    // moment
    expect(parsePrefs({ theme: 'purple', language: 'zh', mode: 'system', trendSpan: 30 })?.mode).toBe('system')
  })

  it.each([undefined, null, '60', 45])('rejects an invalid IPC span %s', (trendSpan) => {
    expect(parsePrefs({ theme: 'blue', language: 'fr', mode: 'dark', trendSpan })).toBeNull()
  })

  it('one field failing the contract refuses the whole thing', () => {
    expect(parsePrefs({ theme: 'neon', language: 'fr', mode: 'dark', trendSpan: 30 })).toBeNull()
    expect(parsePrefs({ theme: 'blue', language: 'ko', mode: 'dark', trendSpan: 30 })).toBeNull()
    expect(parsePrefs({ theme: 'blue', language: 'fr', mode: 'auto', trendSpan: 30 })).toBeNull()
    expect(parsePrefs({ theme: 'blue', language: 'fr' })).toBeNull()
    expect(parsePrefs({ theme: 'blue' })).toBeNull()
    expect(parsePrefs({ language: 'fr' })).toBeNull()
    expect(parsePrefs({})).toBeNull()
    expect(parsePrefs(null)).toBeNull()
    expect(parsePrefs('purple')).toBeNull()
  })
})
