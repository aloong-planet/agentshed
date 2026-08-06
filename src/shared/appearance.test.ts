import { describe, it, expect } from 'vitest'
import {
  APPEARANCE_SCHEMES,
  DEFAULT_SCHEME,
  isAppearanceScheme,
  parsePrefs
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

  it('parsePrefs 只收合法对象', () => {
    expect(parsePrefs({ scheme: 'blue' })).toEqual({ scheme: 'blue' })
    expect(parsePrefs({ scheme: 'purple', extra: 1 })).toEqual({ scheme: 'purple' })
    expect(parsePrefs({ scheme: 'neon' })).toBeNull()
    expect(parsePrefs({})).toBeNull()
    expect(parsePrefs(null)).toBeNull()
    expect(parsePrefs('purple')).toBeNull()
  })
})
