// The i18n layer core: language resolution, plurals, and dictionary completeness.
// This file runs in a node environment (the global vitest configuration), so passing proves the i18n layer
// depends on neither the DOM nor React
// — the main process builds the application menu from the same modules.
import { describe, it, expect } from 'vitest'
import { LANGUAGES, resolveLanguage, effectiveLanguage, dictOf, isLanguage } from './index'

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

// `plural()` itself is tested in ./plural.test.ts, which deliberately avoids importing this module.

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
      // Really construct an Intl object with it: an invalid value would make Intl throw at runtime rather
      // than quietly doing nothing
      expect(() => new Intl.PluralRules(tag)).not.toThrow()
    }
  })

  it('htmlLang and the language code select the same plural category for every language', () => {
    // `plural()` uses the bare language code as its locale tag, because reading `htmlLang` would mean
    // importing the dictionaries and making the module circular (see ./plural.ts). The two agree today
    // because CLDR keys plural rules off the primary subtag — `zh` vs `zh-CN` is the only pair that even
    // differs in text. This pins that agreement instead of leaving it to hold by luck: give some future
    // language an htmlLang whose region actually changes its plural rules, and this goes red rather than
    // silently pluralising that language by a different rule than its own `<html lang>` advertises.
    const ns = [0, 1, 1.5, 2, 3, 5, 11, 21, 22, 25, 100, 101, 111]
    for (const l of LANGUAGES) {
      const byTag = new Intl.PluralRules(dictOf(l).htmlLang)
      const byCode = new Intl.PluralRules(l)
      for (const n of ns) {
        expect(byCode.select(n), `${l} disagrees with its htmlLang at n=${n}`).toBe(byTag.select(n))
      }
    }
  })

  it('every language quotes a parent session title the same way in both places it appears', () => {
    // The fork banner and the uncertain-strip warning both name the parent session, and a user can see both
    // on the same screen. The quotation marks are part of the copy, so they belong to the language: `“ ”`
    // in English, `« »` in French, `『 』` in Japanese. They were hard-coded as CJK `《 》` in SessionPane,
    // which put Chinese book-title marks into all six UIs — and left Japanese quoting the *same* title two
    // different ways, since ja.ts already used `『 』` in the warning.
    //
    // Comparing the two entries against each other rather than against a hard-coded table is what makes
    // this survive: it stays correct for a language added later, and it goes red on the drift itself.
    const TITLE = 'QQXZQQ'
    for (const l of LANGUAGES) {
      const d = dictOf(l)
      const banner = d.session.parentTitle(TITLE)
      const at = banner.indexOf(TITLE)
      expect(at, `${l}: parentTitle does not contain the title`).toBeGreaterThanOrEqual(0)
      const open = banner.slice(0, at)
      const close = banner.slice(at + TITLE.length)
      expect(open, `${l}: parentTitle adds no opening mark`).not.toBe('')
      expect(close, `${l}: parentTitle adds no closing mark`).not.toBe('')
      expect(
        d.session.stripUncertainMismatch(TITLE),
        `${l}: the fork banner quotes the parent title as ${open}…${close}, but the uncertain-strip warning does not`
      ).toContain(open + TITLE + close)
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
