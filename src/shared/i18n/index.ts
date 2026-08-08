// i18n 层核心:语言集、字典取用、系统语言解析、复数。
//
// 纯数据 + 纯函数,**不依赖 DOM 与 React**——主进程构建应用菜单时用的是同一套。
// 各语言字典见同目录下的单语文件;结构契约见 ./types.ts。
import { zh } from './zh'
import { en } from './en'
import { fr } from './fr'
import { es } from './es'
import { ru } from './ru'
import { ja } from './ja'
import type { Locale } from './types'

export type { Locale } from './types'

/** 支持的界面语言。全部左起横排,不含 RTL 语言(见 ADR-0013) */
export const LANGUAGES = ['zh', 'en', 'fr', 'es', 'ru', 'ja'] as const
export type Language = (typeof LANGUAGES)[number]

/** 系统语言不受支持、或探测失败时的兜底 */
export const FALLBACK_LANGUAGE: Language = 'en'

const DICTS: Record<Language, Locale> = { zh, en, fr, es, ru, ja }

export function dictOf(lang: Language): Locale {
  return DICTS[lang]
}

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v)
}

/**
 * 系统偏好语言列表 → 生效语言。
 *
 * 入参是 `app.getPreferredSystemLanguages()` 的返回:一个**按优先级排序的列表**,
 * 不是单个 locale。据此有两条容易写错的地方:
 *   ① 必须**遍历整个列表**取首个受支持者——`['ko','fr','en']` 应得法语,而不是
 *      "首项不受支持就回退英文"。两种实现对单元素列表的输出相同,只有多元素
 *      列表能区分,故测试必须用多元素输入。
 *   ② 标签可能带地区或脚本子标签(`zh-Hans-CN`、`fr-CA`),按**主子标签**匹配。
 */
export function resolveLanguage(preferred: readonly string[] | null | undefined): Language {
  if (!preferred) return FALLBACK_LANGUAGE
  for (const tag of preferred) {
    if (typeof tag !== 'string') continue
    const primary = tag.split('-')[0]?.toLowerCase()
    if (primary && isLanguage(primary)) return primary
  }
  return FALLBACK_LANGUAGE
}

/**
 * 语言偏好:被持久化的用户选择。
 *
 * `'system'` 是一条**持续生效的策略,不是选中当刻的语言快照**——系统语言此后改变,
 * 界面随之改变。把解析结果直接存成偏好会让它退化成一次性快照,且再也分不清
 * "他当初选了跟随系统"与"他当初手选了这个语言"。
 */
export type LanguagePreference = 'system' | Language
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system'

export function isLanguagePreference(v: unknown): v is LanguagePreference {
  return v === 'system' || isLanguage(v)
}

/** 语言偏好 + 系统偏好语言列表 → 生效语言。偏好是具体语言时,系统列表完全不参与 */
export function effectiveLanguage(
  pref: LanguagePreference,
  systemPreferred: readonly string[] | null | undefined
): Language {
  return pref === 'system' ? resolveLanguage(systemPreferred) : pref
}

/**
 * 按目标语言的复数规则选词。
 *
 * 规则取自平台内建的 `Intl.PluralRules`,**不自造规则表**——各语言的分型差异很大
 * (俄语四型、法语 0 用单数、日语无变化),手写必错且无法穷举。
 * 调用方给出该语言用得到的那几型即可,缺型回落 `other`。
 */
export function plural(
  lang: Language,
  n: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
): string {
  const rule = new Intl.PluralRules(dictOf(lang).htmlLang).select(n)
  // other 由类型强制必填,故这里的回落一定取得到值——不留「两者皆空则返回空串」
  // 那种静默失败面:界面显示空白而没有任何东西会报错。
  return forms[rule] ?? forms.other
}
