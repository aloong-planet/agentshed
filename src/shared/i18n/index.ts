// The i18n layer core: the language set, dictionary access, system language resolution, and plurals.
//
// Pure data and pure functions, **depending on neither the DOM nor React** — the main process builds the
// application menu from the same modules.
// Each language's dictionary is a single-language file in this directory; the structural contract is in
// ./types.ts.
import { zh } from './zh'
import { en } from './en'
import { fr } from './fr'
import { es } from './es'
import { ru } from './ru'
import { ja } from './ja'
import type { Locale } from './types'

export type { Locale } from './types'

/** The supported UI languages. All left-to-right, with no RTL language (see ADR-0013) */
export const LANGUAGES = ['zh', 'en', 'fr', 'es', 'ru', 'ja'] as const
export type Language = (typeof LANGUAGES)[number]

/** The fallback when the system language is unsupported or detection fails */
export const FALLBACK_LANGUAGE: Language = 'en'

const DICTS: Record<Language, Locale> = { zh, en, fr, es, ru, ja }

export function dictOf(lang: Language): Locale {
  return DICTS[lang]
}

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v)
}

/**
 * The system's preferred language list → the effective language.
 *
 * The argument is what `app.getPreferredSystemLanguages()` returns: **a list in priority order**,
 * not a single locale. Two things are easy to get wrong as a result:
 *   1. **iterate the whole list** and take the first supported one — `['ko','fr','en']` must give French,
 *      not
 *      "the first entry is unsupported, so fall back to English". The two implementations agree on a
 *      single-element list and only
 *      a multi-element list can tell them apart, so the tests have to use multi-element input.
 *   2. a tag may carry a region or script subtag (`zh-Hans-CN`, `fr-CA`), so match on the **primary
 *      subtag**.
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
 * The language preference: the user's persisted choice.
 *
 * `'system'` is a **continuously applied policy, not a snapshot of the language at the moment of
 * selection** — if the system language changes later,
 * the UI changes with it. Storing the resolution as the preference would degrade it into a one-off
 * snapshot, and would also make it impossible to tell
 * "they chose follow system" from "they chose that language by hand".
 */
export type LanguagePreference = 'system' | Language
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system'

export function isLanguagePreference(v: unknown): v is LanguagePreference {
  return v === 'system' || isLanguage(v)
}

/** The language preference + the system's preferred language list → the effective language. When the
 * preference names a language, the system list plays no part at all */
export function effectiveLanguage(
  pref: LanguagePreference,
  systemPreferred: readonly string[] | null | undefined
): Language {
  return pref === 'system' ? resolveLanguage(systemPreferred) : pref
}

/**
 * Choose a word by the target language's plural rules.
 *
 * The rules come from the platform's built-in `Intl.PluralRules`, **never a hand-rolled rule table** —
 * the categories differ enormously between languages
 * (four forms in Russian, French using the singular for 0, no inflection in Japanese), so writing them by
 * hand is bound to be wrong and cannot be exhaustive.
 * The caller supplies whichever forms that language needs, and a missing form falls back to `other`.
 */
export function plural(
  lang: Language,
  n: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
): string {
  const rule = new Intl.PluralRules(dictOf(lang).htmlLang).select(n)
  // `other` is required by the type, so this fallback always finds a value — leaving no "if both are empty
  // return an empty string"
  // silent failure surface, where the UI goes blank and nothing reports it.
  return forms[rule] ?? forms.other
}
