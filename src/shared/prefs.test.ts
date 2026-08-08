// 偏好的跨进程契约校验。注意与 PrefsStore 的文件读取降级是两套语义:
// 这里不合契约就整体拒绝(协议被破坏),那里单字段坏只降级该字段(见 prefs-store.test.ts)。
import { describe, it, expect } from 'vitest'
import { parsePrefs, DEFAULT_PREFS } from './prefs'

describe('parsePrefs(跨进程入口校验)', () => {
  it('默认偏好:紫 + 跟随系统语言 + 跟随系统明暗', () => {
    expect(DEFAULT_PREFS).toEqual({ scheme: 'purple', language: 'system', mode: 'system' })
  })

  it('收合法对象,丢弃多余字段', () => {
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

  it('「跟随系统」是合法的语言偏好值', () => {
    // 它不是某种语言,而是一条策略——校验器必须放行它,
    // 否则跟随系统的用户每次启动都会被判为契约破坏
    expect(parsePrefs({ scheme: 'purple', language: 'system', mode: 'system' })?.language).toBe(
      'system'
    )
  })

  it('「跟随系统」同样是合法的外观模式值', () => {
    // 与语言同构:mode 存的是策略,不是当刻解析出的明暗
    expect(parsePrefs({ scheme: 'purple', language: 'zh', mode: 'system' })?.mode).toBe('system')
  })

  it('任一字段不合契约即整体拒绝', () => {
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
