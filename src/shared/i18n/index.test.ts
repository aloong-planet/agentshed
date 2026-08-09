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
  it('遍历整个List取首个受支持者,而非首项不中就回退', () => {
    // 这是本函数最易写错的一条:错误实现只看首项,不中就回退英文。
    // 两种实现对**单元素**List的输出完全相同,只有多元素List能区分它们,
    // 所以这里必须用多元素输入,否则这条断言抓不到任何东西。
    expect(resolveLanguage(['ko', 'fr', 'en'])).toBe('fr')
    expect(resolveLanguage(['pt-BR', 'ru', 'en'])).toBe('ru')
  })

  it('region and script variants match on the primary subtag', () => {
    expect(resolveLanguage(['zh-Hans-CN'])).toBe('zh')
    expect(resolveLanguage(['fr-CA'])).toBe('fr')
    expect(resolveLanguage(['es-419'])).toBe('es')
    expect(resolveLanguage(['EN-GB'])).toBe('en')
  })

  it('空List / 全不受支持 / 空值 → 回退英文', () => {
    expect(resolveLanguage([])).toBe('en')
    expect(resolveLanguage(['ko'])).toBe('en')
    expect(resolveLanguage(['pt-BR'])).toBe('en')
    expect(resolveLanguage(null)).toBe('en')
    expect(resolveLanguage(undefined)).toBe('en')
  })

  it('List混入非字符串元素时跳过该项,不崩', () => {
    // 入参来自平台 API,类型声明不构成运行时保证
    expect(resolveLanguage([null as unknown as string, 'fr'])).toBe('fr')
    expect(resolveLanguage([123 as unknown as string])).toBe('en')
  })
})

describe('effectiveLanguage (preference → effective language)', () => {
  it('偏好为具体语言时锁定,系统List完全不参与', () => {
    // 「跟随系统」是策略、具体语言是锁定——这条区分是整个模型的支点。
    // 若实现漏掉分支、无条件走系统解析,下面三条都会红。
    expect(effectiveLanguage('ja', ['fr-FR', 'en-US'])).toBe('ja')
    expect(effectiveLanguage('ja', [])).toBe('ja')
    expect(effectiveLanguage('ja', null)).toBe('ja')
  })

  it('偏好为跟随系统时,按系统List解析', () => {
    expect(effectiveLanguage('system', ['ko-KR', 'fr-FR', 'en-US'])).toBe('fr')
    expect(effectiveLanguage('system', ['ko-KR'])).toBe('en')
    expect(effectiveLanguage('system', [])).toBe('en')
  })
})

describe('plural', () => {
  // 期望值取自对 Intl.PluralRules 的**实测**(见下方各条注释标注的分型),
  // 不是照记忆写的——俄语 0 归 many 而非 other、21 归 one 而非 many,
  // 都是凭直觉容易写反的地方。
  // other 是必填项(类型强制):俄语的 other 用于小数,如 1.5 сессии
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
    // 两条并列才有意义:若实现把规则写死成某一种,必有一条会红
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
    // 互不相同:复制某个单语文件改成另一种语言时忘改 languageName,
    // typecheck 不会红(类型只要求 string),只有这条会红
    expect(new Set(names).size).toBe(6)
  })

  it('every language has an htmlLang usable as an Intl locale', () => {
    for (const l of LANGUAGES) {
      const tag = dictOf(l).htmlLang
      expect(tag, `${l} 缺 htmlLang`).toBeTruthy()
      // 拿它真去构造一次 Intl 对象:htmlLang 同时被 plural 用作 locale tag,
      // 写成非法值会让复数在运行期抛错,而不是安静地不生效
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
