import { describe, it, expect } from 'vitest'
import {
  APPEARANCE_MODES,
  APPEARANCE_SCHEMES,
  DEFAULT_MODE,
  DEFAULT_SCHEME,
  isAppearanceMode,
  isAppearanceScheme
} from './appearance'

describe('appearance scheme 契约', () => {
  it('默认方案为 purple', () => {
    expect(DEFAULT_SCHEME).toBe('purple')
  })

  it('枚举恰好三值', () => {
    expect([...APPEARANCE_SCHEMES]).toEqual(['purple', 'blue', 'amber'])
  })

  it('isAppearanceScheme 只认三值', () => {
    expect(isAppearanceScheme('purple')).toBe(true)
    expect(isAppearanceScheme('blue')).toBe(true)
    expect(isAppearanceScheme('amber')).toBe(true)
    expect(isAppearanceScheme('neon')).toBe(false)
    expect(isAppearanceScheme('')).toBe(false)
    expect(isAppearanceScheme(null)).toBe(false)
    expect(isAppearanceScheme(1)).toBe(false)
  })

  // parsePrefs 已随 Prefs 一起移入 shared/prefs.ts,其测试见 prefs.test.ts
})

describe('appearance mode 契约', () => {
  it('默认模式为跟随系统', () => {
    expect(DEFAULT_MODE).toBe('system')
  })

  it('枚举恰好三值', () => {
    expect([...APPEARANCE_MODES]).toEqual(['system', 'light', 'dark'])
  })

  it('isAppearanceMode 只认三值', () => {
    expect(isAppearanceMode('system')).toBe(true)
    expect(isAppearanceMode('light')).toBe(true)
    expect(isAppearanceMode('dark')).toBe(true)
    expect(isAppearanceMode('auto')).toBe(false)
    expect(isAppearanceMode('')).toBe(false)
    expect(isAppearanceMode(null)).toBe(false)
    expect(isAppearanceMode(1)).toBe(false)
  })
})
