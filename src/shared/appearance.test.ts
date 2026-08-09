import { describe, it, expect } from 'vitest'
import {
  APPEARANCE_MODES,
  APPEARANCE_SCHEMES,
  DEFAULT_MODE,
  DEFAULT_SCHEME,
  isAppearanceMode,
  isAppearanceScheme
} from './appearance'

describe('the appearance scheme contract', () => {
  it('defaults to the purple scheme', () => {
    expect(DEFAULT_SCHEME).toBe('purple')
  })

  it('the enum has exactly three values', () => {
    expect([...APPEARANCE_SCHEMES]).toEqual(['purple', 'blue', 'amber'])
  })

  it('isAppearanceScheme accepts only those three values', () => {
    expect(isAppearanceScheme('purple')).toBe(true)
    expect(isAppearanceScheme('blue')).toBe(true)
    expect(isAppearanceScheme('amber')).toBe(true)
    expect(isAppearanceScheme('neon')).toBe(false)
    expect(isAppearanceScheme('')).toBe(false)
    expect(isAppearanceScheme(null)).toBe(false)
    expect(isAppearanceScheme(1)).toBe(false)
  })

  // parsePrefs moved into shared/prefs.ts along with Prefs; its tests are in prefs.test.ts
})

describe('the appearance mode contract', () => {
  it('defaults to following the system', () => {
    expect(DEFAULT_MODE).toBe('system')
  })

  it('the enum has exactly three values', () => {
    expect([...APPEARANCE_MODES]).toEqual(['system', 'light', 'dark'])
  })

  it('isAppearanceMode accepts only those three values', () => {
    expect(isAppearanceMode('system')).toBe(true)
    expect(isAppearanceMode('light')).toBe(true)
    expect(isAppearanceMode('dark')).toBe(true)
    expect(isAppearanceMode('auto')).toBe(false)
    expect(isAppearanceMode('')).toBe(false)
    expect(isAppearanceMode(null)).toBe(false)
    expect(isAppearanceMode(1)).toBe(false)
  })
})
