// issue #60:偏好类 IPC handler 抽成可注入 seam 后,那些原先只由 index.ts 语句次序
// 保证的行为终于测得到——尤其**「先设 themeSource 再落盘」的顺序**。
//
// 这里不测"设了 themeSource 之后系统外观能否传导到界面":那是 Electron 的责任,
// 且用 themeSource 模拟系统变化是循环论证(见 appearance-mode.test.ts 的同款说明)。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEFAULT_PREFS } from '@shared/prefs'
import { ERR, decodeAppError } from '@shared/errors'
import { PrefsStore } from './prefs-store'
import type { ThemeSourceTarget } from './appearance-mode'
import { createPrefsHandlers } from './prefs-handlers'

/**
 * 取抛出错误的结构化码。断言码而非措辞:措辞已经交给渲染层按语言生成,
 * 拿它当断言对象等于把 UI 文案钉进主进程测试(ADR-0015 要消灭的正是这种耦合)。
 */
function codeOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (e) {
    return decodeAppError(e)?.code ?? null
  }
}

describe('偏好 handler', () => {
  let dir: string
  let store: PrefsStore
  let theme: ThemeSourceTarget

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prefs-handlers-'))
    store = new PrefsStore(dir)
    theme = { themeSource: 'system' }
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const handlers = (): ReturnType<typeof createPrefsHandlers> =>
    createPrefsHandlers({ store: () => store, theme })

  it('setMode:合法值落盘并即刻设 themeSource', () => {
    expect(handlers().setMode('dark')).toEqual({ ...DEFAULT_PREFS, mode: 'dark' })
    expect(theme.themeSource).toBe('dark')
    expect(new PrefsStore(dir).get().mode).toBe('dark')
  })

  it('setMode:**落盘失败时 themeSource 仍已被设置**', () => {
    // 这条就是 #60 的靶心:顺序反过来写(先落盘再设 themeSource)时,异常会抛在设
    // themeSource 之前,于是渲染层已乐观勾上「深色」、界面却没变——提示说失败、
    // 界面也不动,双重挫败。正确顺序下失败只丢持久化:本次有效,重启回到旧值。
    //
    // 用**真** PrefsStore 制造真实的落盘失败:把存储目录指到"父级是个文件"的路径,
    // persist() 里的 mkdirSync 必然抛 ENOTDIR。不打桩,走的是真实失败路径。
    const asFile = join(dir, 'not-a-dir')
    writeFileSync(asFile, 'x')
    const blocked = new PrefsStore(join(asFile, 'sub'))
    const h = createPrefsHandlers({ store: () => blocked, theme })

    // 断言错误来自**落盘**而不是别处:裸 toThrow() 无法区分"persist 抛了"与
    // "校验或就绪检查抢先抛了",后两者下 themeSource 本就不该被设置,
    // 那样这条用例会绿得毫无意义
    expect(() => h.setMode('dark')).toThrow(/ENOTDIR|ENOENT/)
    expect(theme.themeSource).toBe('dark')
  })

  it('setMode:非法值抛错,且**不得把非法值透给 themeSource**', () => {
    expect(codeOf(() => handlers().setMode('auto'))).toBe(ERR.invalidPref)
    expect(theme.themeSource).toBe('system')
  })

  it('setMode:偏好存储未就绪时抛错,且不碰 themeSource', () => {
    // 校验顺序要紧:存储没就绪就设了 themeSource,等于界面变了却什么都没记住
    const h = createPrefsHandlers({ store: () => null, theme })
    expect(codeOf(() => h.setMode('dark'))).toBe(ERR.prefsStoreNotReady)
    expect(theme.themeSource).toBe('system')
  })

  it('setScheme / setLanguage:合法值落盘,非法值抛错', () => {
    expect(handlers().setScheme('blue').scheme).toBe('blue')
    expect(handlers().setLanguage('ja').language).toBe('ja')
    expect(codeOf(() => handlers().setScheme('neon'))).toBe(ERR.invalidPref)
    expect(codeOf(() => handlers().setLanguage('ko'))).toBe(ERR.invalidPref)
    // 非法调用不得留下痕迹
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'blue', language: 'ja', mode: 'system' })
  })

  it('setScheme / setLanguage 都不碰 themeSource', () => {
    // 「语言与明暗互不干扰」在 handler 这一层的落地
    handlers().setScheme('amber')
    handlers().setLanguage('ru')
    expect(theme.themeSource).toBe('system')
  })

  it('getPrefs:存储未就绪时给默认值而不是抛错', () => {
    // 首帧可能早于 whenReady 里的赋值,这里抛错会让渲染层拿不到任何偏好
    expect(createPrefsHandlers({ store: () => null, theme }).getPrefs()).toEqual(DEFAULT_PREFS)
  })
})
