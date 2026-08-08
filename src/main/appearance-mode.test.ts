// 票 04:外观模式偏好 → nativeTheme.themeSource。
//
// **测的是什么、不测什么**(责任边界,见 .scratch/i18n/issues/04):本票的实现责任
// 到"把 themeSource 设对"为止;设对之后系统外观变化能否传导到界面是 Electron 与
// Chromium 的责任。故这里只断言赋值本身,不写"改 themeSource 后界面跟着变"那种
// 用例——那是拿我们刚设的值去证明我们设对了,循环论证,在 CI 里只会是一条恒绿断言。
// 传导效果归证据档(人工切系统外观 + 截图)。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { APPEARANCE_MODES } from '@shared/appearance'
import { applyAppearanceMode, type ThemeSourceTarget } from './appearance-mode'
import { PrefsStore } from './prefs-store'

/** nativeTheme 的替身:只需一个可写的 themeSource,与真对象同形 */
function fakeNativeTheme(): ThemeSourceTarget {
  return { themeSource: 'system' }
}

describe('applyAppearanceMode', () => {
  it('三种偏好各自映射到 themeSource 的对应取值', () => {
    // 三态逐一断言,而不是只测一个:只测一态分不出"映射正确"与"恒赋某个值"
    for (const mode of APPEARANCE_MODES) {
      const nt = fakeNativeTheme()
      // 先置成与期望不同的值,否则 'system' 那一轮的初值恰好等于期望,
      // "没赋值"与"赋对了"结果相同,断言分不出对错
      nt.themeSource = mode === 'dark' ? 'light' : 'dark'
      applyAppearanceMode(nt, mode)
      expect(nt.themeSource).toBe(mode)
    }
  })
})

describe('偏好 → themeSource 的完整路径', () => {
  let dir: string
  const withStore = (fn: (dir: string) => void): void => {
    dir = mkdtempSync(join(tmpdir(), 'appearance-mode-'))
    try {
      fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('无偏好文件时落「跟随系统」', () => {
    withStore((d) => {
      const nt = fakeNativeTheme()
      nt.themeSource = 'dark'
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('system')
    })
  })

  it('锁定的偏好读回后仍是锁定值', () => {
    withStore((d) => {
      const s = new PrefsStore(d)
      s.setMode('dark')
      const nt = fakeNativeTheme()
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('dark')
    })
  })

  it('mode 非法时降级为跟随系统,而不是把非法值透给 themeSource', () => {
    withStore((d) => {
      writeFileSync(
        join(d, 'prefs.json'),
        JSON.stringify({ scheme: 'purple', language: 'zh', mode: 'auto' })
      )
      const nt = fakeNativeTheme()
      nt.themeSource = 'light'
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('system')
    })
  })

  it('改语言偏好不改动 themeSource', () => {
    // AC:语言与明暗两个「跟随系统」互不干扰。偏好层的独立性已在 prefs-store 测过,
    // 这条在 AC 指名的那一层(themeSource)再观察一次——若 setLanguage 顺手把 mode
    // 顶回默认,这里会从 'dark' 变成 'system'
    withStore((d) => {
      const s = new PrefsStore(d)
      s.setMode('dark')
      s.setLanguage('ja')
      const nt = fakeNativeTheme()
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('dark')
    })
  })
})
