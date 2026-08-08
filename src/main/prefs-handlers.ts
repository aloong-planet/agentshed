// 偏好类 IPC handler 的**逻辑**(issue #60)。
//
// 从 index.ts 抽出来的目的只有一个:让这些行为测得到。它们此前只由 index.ts 里的
// 语句次序保证,而 index.ts 是装配层、按 ADR-0002 刻意不单测——于是「先设 themeSource
// 再落盘」这种顺序性要求没有任何测试会红。抽成接受注入的工厂后,同一套行为可以在
// 不引 Electron 的前提下驱动(store 与 themeSource 目标都从参数进)。
//
// index.ts 那边只剩接线:把真的 prefsStore 与 nativeTheme 传进来,再挂到通道上。
import { isAppearanceMode, isAppearanceScheme } from '@shared/appearance'
import { isLanguagePreference } from '@shared/i18n'
import { DEFAULT_PREFS, type Prefs } from '@shared/prefs'
import { applyAppearanceMode, type ThemeSourceTarget } from './appearance-mode'
import type { PrefsStore } from './prefs-store'

export interface PrefsHandlerDeps {
  /**
   * **惰性取**:主进程的 prefsStore 是模块级变量,直到 `app.whenReady()` 才赋值,
   * 而 handler 在那之前就已注册。传实例会永远拿到 null,故传取值函数。
   */
  store: () => PrefsStore | null
  /** 真实现是 Electron 的 nativeTheme;测试传同形替身 */
  theme: ThemeSourceTarget
}

export interface PrefsHandlers {
  getPrefs: () => Prefs
  setScheme: (scheme: unknown) => Prefs
  setLanguage: (language: unknown) => Prefs
  setMode: (mode: unknown) => Prefs
}

export function createPrefsHandlers(deps: PrefsHandlerDeps): PrefsHandlers {
  /** 取存储;未就绪就抛——写类操作没有"先记在内存里回头补"的语义 */
  const required = (): PrefsStore => {
    const s = deps.store()
    if (!s) throw new Error('偏好存储未就绪')
    return s
  }

  return {
    // 读操作不抛:首帧可能早于 whenReady 的赋值,抛错会让渲染层一个偏好都拿不到
    getPrefs: () => deps.store()?.get() ?? { ...DEFAULT_PREFS },

    setScheme: (scheme) => {
      if (!isAppearanceScheme(scheme)) throw new Error('外观方案不合契约')
      return required().setScheme(scheme)
    },

    setLanguage: (language) => {
      if (!isLanguagePreference(language)) throw new Error('界面语言不合契约')
      return required().setLanguage(language)
    },

    setMode: (mode) => {
      if (!isAppearanceMode(mode)) throw new Error('外观模式不合契约')
      // 校验与就绪检查都在设 themeSource **之前**:非法值不得透给 themeSource,
      // 存储没就绪也不该"界面变了却什么都没记住"。
      const store = required()
      // **先生效再落盘**,与配色(spec 序列 A2)、语言同规矩。顺序要紧:反过来写的话,
      // 落盘失败(磁盘满/只读)会抛在设 themeSource 之前,于是渲染层已乐观勾上所选模式、
      // 界面却没变,提示说失败、界面也不动,双重挫败。现在的顺序下失败只丢持久化:
      // 本次有效,重启回到磁盘上的旧值。这条由 prefs-handlers.test.ts 钉住。
      applyAppearanceMode(deps.theme, mode)
      return store.setMode(mode)
    }
  }
}
