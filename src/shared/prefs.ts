// app 自有偏好的契约(落地在 userData,**绝不写 agent 配置**)。
//
// 各偏好项自身的类型定义在各自的领域模块(外观方案见 ./appearance,界面语言见 ./i18n),
// 本文件只负责把它们组装成一份偏好并守住跨进程入口。偏好项会持续增加,故独立成文件——
// 放在某个领域模块里会让那个模块名不副实。
import { DEFAULT_SCHEME, isAppearanceScheme, type AppearanceScheme } from './appearance'
import { DEFAULT_LANGUAGE_PREFERENCE, isLanguagePreference, type LanguagePreference } from './i18n'

export interface Prefs {
  scheme: AppearanceScheme
  /** 持久化的是**偏好**(可为「跟随系统」),不是解析出的生效语言 */
  language: LanguagePreference
}

export const DEFAULT_PREFS: Prefs = {
  scheme: DEFAULT_SCHEME,
  language: DEFAULT_LANGUAGE_PREFERENCE
}

/**
 * IPC / preload 入口:把 unknown 收成 Prefs;不合契约返回 null(不抛,由调用方决定文案)。
 *
 * 这里是**契约校验**,与读取本地文件时的降级是两回事:跨进程收到不合契约的值意味着
 * 协议被破坏,应当整体拒绝;而文件里某个字段坏掉只该降级该字段、不牵连其他偏好
 * (见 PrefsStore 的读取逻辑,以及「降级只准自伤」不变量)。
 */
export function parsePrefs(raw: unknown): Prefs | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const scheme = r['scheme']
  const language = r['language']
  if (!isAppearanceScheme(scheme)) return null
  if (!isLanguagePreference(language)) return null
  return { scheme, language }
}
