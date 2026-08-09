// The i18n layer core: language resolution, plurals, and dictionary completeness.
// This file runs in a node environment (the global vitest configuration), so passing proves the i18n layer
// depends on neither the DOM nor React
// — the main process builds the application menu from the same modules.
import { describe, it, expect } from 'vitest'
import {
  LANGUAGES,
  resolveLanguage,
  effectiveLanguage,
  plural,
  dictOf,
  isLanguage
} from './index'

describe('resolveLanguage', () => {
  it('iterate the whole list for the first supported one rather than falling back when the first misses', () => {
    // The easiest thing to get wrong here: a wrong implementation looks only at the first entry and falls
    // back to English when it misses.
    // The two implementations agree exactly on a **single-element** list and only a multi-element one can
    // tell them apart,
    // so this has to use multi-element input or the assertion catches nothing.
    expect(resolveLanguage(['ko', 'fr', 'en'])).toBe('fr')
    expect(resolveLanguage(['pt-BR', 'ru', 'en'])).toBe('ru')
  })

  it('region and script variants match on the primary subtag', () => {
    expect(resolveLanguage(['zh-Hans-CN'])).toBe('zh')
    expect(resolveLanguage(['fr-CA'])).toBe('fr')
    expect(resolveLanguage(['es-419'])).toBe('es')
    expect(resolveLanguage(['EN-GB'])).toBe('en')
  })

  it('an empty list / nothing supported / a null value → fall back to English', () => {
    expect(resolveLanguage([])).toBe('en')
    expect(resolveLanguage(['ko'])).toBe('en')
    expect(resolveLanguage(['pt-BR'])).toBe('en')
    expect(resolveLanguage(null)).toBe('en')
    expect(resolveLanguage(undefined)).toBe('en')
  })

  it('a non-string element in the list is skipped without crashing', () => {
    // The argument comes from a platform API, and a type declaration is no runtime guarantee
    expect(resolveLanguage([null as unknown as string, 'fr'])).toBe('fr')
    expect(resolveLanguage([123 as unknown as string])).toBe('en')
  })
})

describe('effectiveLanguage (preference → effective language)', () => {
  it('a specific language preference locks it, with the system list playing no part', () => {
    // "Follow system" is a policy and a specific language is a lock — that distinction is the pivot of the
  // whole model.
    // If an implementation missed the branch and always resolved from the system, all three below go red.
    expect(effectiveLanguage('ja', ['fr-FR', 'en-US'])).toBe('ja')
    expect(effectiveLanguage('ja', [])).toBe('ja')
    expect(effectiveLanguage('ja', null)).toBe('ja')
  })

  it('a follow-system preference resolves against the system list', () => {
    expect(effectiveLanguage('system', ['ko-KR', 'fr-FR', 'en-US'])).toBe('fr')
    expect(effectiveLanguage('system', ['ko-KR'])).toBe('en')
    expect(effectiveLanguage('system', [])).toBe('en')
  })
})

describe('plural', () => {
  // The expectations come from **measuring** Intl.PluralRules (the categories are noted per case below),
  // not from memory — Russian putting 0 in many rather than other, and 21 in one rather than many,
  // are both easy to get backwards from intuition.
  // other is required (enforced by the type): Russian uses other for decimals, such as 1.5 сессии
  const ruForms = { one: 'сессия', few: 'сессии', many: 'сессий', other: 'сессии' }

  it('Russian has four forms: 1=one, 2=few, 5=many, 21=one, 0=many', () => {
    expect(plural('ru', 1, ruForms)).toBe('сессия')
    expect(plural('ru', 2, ruForms)).toBe('сессии')
    expect(plural('ru', 5, ruForms)).toBe('сессий')
    expect(plural('ru', 21, ruForms)).toBe('сессия')
    expect(plural('ru', 0, ruForms)).toBe('сессий')
  })

  it('French uses the singular for 0 and English the plural — the same 0 differs by language', () => {
    const fr = { one: 'session', other: 'sessions' }
    const en = { one: 'session', other: 'sessions' }
    expect(plural('fr', 0, fr)).toBe('session')
    expect(plural('en', 0, en)).toBe('sessions')
    // The two only mean something side by side: if an implementation hard-coded one rule, one of them goes red
    expect(plural('fr', 1, fr)).toBe('session')
    expect(plural('fr', 2, fr)).toBe('sessions')
  })

  it('Chinese and Japanese have no plural inflection and always use other', () => {
    expect(plural('zh', 1, { other: ' sessions' })).toBe(' sessions')
    expect(plural('zh', 5, { other: ' sessions' })).toBe(' sessions')
    expect(plural('ja', 5, { other: ' items' })).toBe(' items')
  })

  it('a form the caller did not supply falls back to other', () => {
    expect(plural('ru', 2, { other: 'x' })).toBe('x')
  })
})

describe('dictionary', () => {
  it('all six languages are present with distinct native names', () => {
    const names = LANGUAGES.map((l) => dictOf(l).languageName)
    expect(names).toHaveLength(6)
    // All distinct: copying one language file into another and forgetting to change languageName
    // does not go red at typecheck (the type only requires string) — only this case does
    expect(new Set(names).size).toBe(6)
  })

  it('every language has an htmlLang usable as an Intl locale', () => {
    for (const l of LANGUAGES) {
      const tag = dictOf(l).htmlLang
      expect(tag, `${l} has no htmlLang`).toBeTruthy()
      // Really construct an Intl object with it: htmlLang doubles as the locale tag for plurals,
      // so an invalid value makes plurals throw at runtime rather than quietly doing nothing
      expect(() => new Intl.PluralRules(tag)).not.toThrow()
    }
  })

  it('isLanguage accepts only the six languages, case-sensitively', () => {
    expect(isLanguage('fr')).toBe(true)
    expect(isLanguage('ko')).toBe(false)
    expect(isLanguage('FR')).toBe(false)
    expect(isLanguage('')).toBe(false)
    expect(isLanguage(null)).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
  })
})
