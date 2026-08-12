import { describe, it, expect } from 'vitest'
import {
  APPEARANCE_MODES,
  APPEARANCE_THEMES,
  DEFAULT_MODE,
  DEFAULT_THEME,
  isAppearanceMode,
  isAppearanceTheme
} from './appearance'

describe('the appearance theme contract', () => {
  it('defaults to the purple theme', () => {
    expect(DEFAULT_THEME).toBe('purple')
  })

  it('the enum has exactly three values', () => {
    expect([...APPEARANCE_THEMES]).toEqual(['purple', 'blue', 'amber'])
  })

  it('isAppearanceTheme accepts only those three values', () => {
    expect(isAppearanceTheme('purple')).toBe(true)
    expect(isAppearanceTheme('blue')).toBe(true)
    expect(isAppearanceTheme('amber')).toBe(true)
    expect(isAppearanceTheme('neon')).toBe(false)
    expect(isAppearanceTheme('')).toBe(false)
    expect(isAppearanceTheme(null)).toBe(false)
    expect(isAppearanceTheme(1)).toBe(false)
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
