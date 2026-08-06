import { describe, it, expect } from 'vitest'
import { APPEARANCE_SCHEMES, DEFAULT_SCHEME, isAppearanceScheme } from './appearance'

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
})
