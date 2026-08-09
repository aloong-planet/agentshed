// Ticket 12: dates and numbers presented in the current UI language.
//
// **Expectations always come from measuring Intl, never from memory** — ticket 02 was already caught out
// once:
// Russian's plural categories are easy to get wrong from intuition, and if the implementation and the
// expectation are wrong together the test is still green.
// So assertions about "what it looks like" pin only **structural properties** (which number it contains,
// which characters it does not, that two languages differ),
// and never hard-code Intl's output string: that string changes with the ICU version, and pinning it
// would tie the test to a runtime version.
import { describe, it, expect } from 'vitest'
import { LANGUAGES } from './i18n'
import { relativeDays, dayLabel, formatCount, formatBytes, monthDay } from './format'

describe('relativeDays (relative time)', () => {
  it('today and yesterday have their own expressions rather than "0 days ago"', () => {
    // Every language has idiomatic words for today and yesterday; degrading to "0 days ago" reads like a
    // machine
    for (const lang of LANGUAGES) {
      const today = relativeDays(lang, 0)
      const yesterday = relativeDays(lang, 1)
      expect(today).not.toContain('0')
      expect(today).not.toBe(yesterday)
    }
  })

  it('N days ago and N months ago contain the corresponding number', () => {
    expect(relativeDays('zh', 5)).toContain('5')
    expect(relativeDays('en', 5)).toContain('5')
    expect(relativeDays('zh', 90)).toContain('3') // 90 days → 3 months
  })

  it('**different languages give different wording** — this guards against "Intl was wired up but the locale is hard-coded"', () => {
    // Asserting only "there is output" cannot distinguish real localisation from a hard-coded en;
    // languages have to be compared
    const zh = relativeDays('zh', 5)
    const ru = relativeDays('ru', 5)
    const ja = relativeDays('ja', 5)
    expect(new Set([zh, ru, ja]).size).toBe(3)
  })

  it('languages other than Chinese contain no Chinese characters', () => {
    for (const lang of LANGUAGES.filter((l) => l !== 'zh' && l !== 'ja')) {
      expect(relativeDays(lang, 5)).not.toMatch(/[一-龥]/)
    }
  })

  it('null and non-finite values degrade stably without displaying NaN', () => {
    expect(relativeDays('zh', null)).toBe('—')
    expect(relativeDays('zh', NaN)).toBe('—')
    expect(relativeDays('zh', Infinity)).toBe('—')
    expect(relativeDays('zh', -1)).toBe(relativeDays('zh', 0)) // A future time counts as today
  })
})

describe('dayLabel (the date group label)', () => {
  const D = Date.parse('2026-08-04T09:00:00') // A Tuesday

  it('contains the month and day, and changes with the language', () => {
    const zh = dayLabel('zh', D)
    const en = dayLabel('en', D)
    expect(zh).toContain('4')
    expect(en).toContain('4')
    expect(zh).not.toBe(en)
  })

  it('languages other than Chinese and Japanese contain no Chinese weekday characters', () => {
    for (const lang of LANGUAGES.filter((l) => l !== 'zh' && l !== 'ja')) {
      expect(dayLabel(lang, D)).not.toMatch(/周[日一二三四五六]/)
    }
  })

  it('the label is stable for the same day within one language (grouping uses it as the key)', () => {
    // dayGroups uses the label as the grouping key, and an unstable label would split one day into two
    // groups
    expect(dayLabel('fr', D)).toBe(dayLabel('fr', D + 1000))
  })
})

describe('formatCount (number grouping)', () => {
  it('the grouping separator changes with the language', () => {
    // English 1,234 / French a narrow space / Russian a space — only "they are not all the same" is
    // asserted
    const all = LANGUAGES.map((l) => formatCount(l, 1234567))
    expect(new Set(all).size).toBeGreaterThan(1)
  })

  it('every language\'s output contains each digit', () => {
    for (const lang of LANGUAGES) {
      const s = formatCount(lang, 1234567)
      expect(s.replace(/\D/g, '')).toBe('1234567')
    }
  })

  it('NaN, Infinity and negatives neither throw nor display NaN', () => {
    expect(formatCount('zh', NaN)).toBe('—')
    expect(formatCount('zh', Infinity)).toBe('—')
    expect(formatCount('zh', -5)).toContain('5')
  })
})

describe('formatBytes (byte sizes)', () => {
  it('the unit symbol is not translated while the number is formatted by language', () => {
    // The AC: unit symbols such as KB / MB are notation, common to every language, and do not enter the
    // dictionaries
    for (const lang of LANGUAGES) {
      expect(formatBytes(lang, 2 * 1024 * 1024)).toContain('MB')
      expect(formatBytes(lang, 2048)).toContain('KB')
      expect(formatBytes(lang, 512)).toContain('B')
    }
  })

  it('NaN and negatives degrade without displaying NaN', () => {
    expect(formatBytes('zh', NaN)).toBe('—')
    expect(formatBytes('zh', -1)).toBe('—')
  })
})

describe('monthDay (the axis label\'s month/day)', () => {
  it('the order changes with the language rather than being fixed to one country\'s', () => {
    // American 8/4 and continental 04/08 are **the same day in different orders** — asserting "it contains
    // 8 and 4" cannot tell them apart,
    // so different languages' outputs have to be compared for a real difference
    const en = monthDay('en', 8, 4)
    const fr = monthDay('fr', 8, 4)
    expect(en).not.toBe(fr)
  })

  it('the output contains only the month and day, with no year', () => {
    // The implementation fabricates a 2001 date purely to obtain the order; a year leaking into the output
    // would lengthen the axis label and crowd out its neighbours
    for (const lang of LANGUAGES) {
      expect(monthDay(lang, 8, 4)).not.toContain('2001')
    }
  })

  it('non-finite input degrades without displaying NaN', () => {
    expect(monthDay('zh', NaN, 4)).toBe('—')
  })
})
