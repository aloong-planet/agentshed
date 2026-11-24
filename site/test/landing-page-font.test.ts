// The page's font (landing-page::REQ-006, The palette: the text set in the system font stack, no web font loaded).
// The stylesheet declares two families: the body's, which the page's text takes, and the feature steps' numbers'
// (`.deck-n`). Each is read from the stylesheet's source, as its top-level rule declares it, and held to the system
// stack it must begin with. In a browser, in the test state, the page must hold no @font-face rule and no face in
// `document.fonts`, ask for no font file, and set every text it holds in the family its rule declares, as read from
// the source: never a value the page resolved, which a fault would bend with it.
//
// A font file the page asks for fails the visit before these cases look, since the harness answers no font type; the
// cases' own check of the requests stays in case it ever does. Not checked here: which installed face the browser
// draws a family with (the computed family is the list as declared, whatever the machine has), and the text in the
// dark appearance, with reduced motion or without scripts: the cases read the light appearance with scripts, so a rule
// only those take is not read.
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { afterAll, beforeAll, describe, inject, test, vi } from 'vitest'
import { LOCALES, PAGE_PATH, ui } from '../src/i18n/ui'
import { launch, visit, type Answer, type Browser } from './support/browser'
import { COUNT_URL, POINTER_URL, RELEASES, RELEASES_API, statistics } from './support/stand-ins'

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

const STYLESHEET = new URL('../src/styles/global.css', import.meta.url)

/** A comma-separated list split at its top-level commas, each item trimmed; commas inside quotes or brackets stay */
function items(list: string): string[] {
  const found: string[] = []
  let item = ''
  let quote = ''
  let depth = 0
  for (const c of list) {
    if (quote) quote = c === quote ? '' : quote
    else if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      found.push(item.trim())
      item = ''
      continue
    }
    item += c
  }
  return [...found, item.trim()]
}

/** A font-family list as its families, each without its quotes and with its spaces collapsed, in order */
const families = (list: string): string[] => items(list).map((family) => family.replace(/^(["'])(.*)\1$/, '$2').replace(/\s+/g, ' '))

// The font shorthand's size, which the family follows: a length or percentage, or a size keyword, with any line height
const SIZE = /^(?:[\d.]+(?:[a-z]+|%)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|math)(?:\/\S*)?$/
const WIDE = ['inherit', 'initial', 'unset', 'revert', 'revert-layer']

/** The family a declaration gives, from `font-family` or from the `font` shorthand; throws on one it cannot read */
function familyOf(prop: string, value: string): string[] {
  if (WIDE.includes(value.trim().toLowerCase())) throw new Error(`${prop}: ${value} names no family`)
  if (prop === 'font-family') return families(value)
  // The shorthand: [style variant weight stretch] size[/line-height] family, the family's first item in the first part
  const [first, ...rest] = items(value)
  const words = first.split(/\s+/)
  const size = words.findIndex((word) => SIZE.test(word))
  if (size < 0) throw new Error(`font: ${value} has no size the family follows`)
  let start = size + 1
  // A line height written apart from the size: `15px / 1.6`, or `15px /1.6`
  if (words[start] === '/') start += 2
  else if (words[start]?.startsWith('/')) start += 1
  const head = words.slice(start).join(' ')
  if (!head) throw new Error(`font: ${value} has no family`)
  return families([head, ...rest].join(', '))
}

/**
 * The family a selector's rule declares: the stylesheet's top-level rule whose selector list holds the selector and
 * that declares a family, the last of its `font` and `font-family` declarations. Throws unless exactly one such rule
 * does, naming the rules found.
 */
function declaredFamily(selector: string): string[] {
  const rules: { line: number; family: string[] }[] = []
  postcss.parse(readFileSync(STYLESHEET, 'utf8')).each((node) => {
    if (node.type !== 'rule' || !node.selectors.includes(selector)) return
    const last = node.nodes.flatMap((d) => (d.type === 'decl' && (d.prop === 'font' || d.prop === 'font-family') ? [d] : [])).at(-1)
    if (last) rules.push({ line: node.source?.start?.line ?? 0, family: familyOf(last.prop, last.value) })
  })
  if (rules.length !== 1) {
    throw new Error(`the stylesheet's top-level rules for ${selector} that declare a family: ${rules.length} (lines ${rules.map((r) => r.line).join(', ') || 'none'}), not one`)
  }
  return rules[0].family
}

// landing-page::REQ-006 (The palette: the text set in the system font stack)
describe("the stylesheet's two families begin with the system stack", () => {
  const RULES = [
    { name: "the body's", selector: 'body', begins: ['-apple-system', 'system-ui'] },
    { name: "the feature steps' numbers'", selector: '.deck-n', begins: ['ui-monospace'] }
  ]
  test.for(RULES)('$name', ({ selector, begins }, { expect }) => {
    const family = declaredFamily(selector)
    expect(begins, `the first family of ${selector}'s ${family.join(', ')}`).toContain(family[0])
  })
})

// The test state: no pointer, and a GitHub answer that lists only pre-releases
const TESTING: Record<string, Answer> = {
  [POINTER_URL]: [404, '<html></html>'],
  [RELEASES_API]: [200, JSON.stringify(RELEASES.filter((r) => r.prerelease))],
  [COUNT_URL]: [200, statistics(3, 3, 0)]
}
// A wait that cannot end gives up well inside the case's own limit, because the run's timeout names nothing
const LANDING = 5_000
const CASE_LIMIT = LANDING + 10_000

/** The font files a page can ask for, by their extension */
const FONT_FILE = /\.(?:woff2?|ttf|otf|eot|ttc)$/i

interface Fonts {
  /** Each @font-face rule in the page's stylesheets, as its sheet and its text */
  faceRules: string[]
  /** Each stylesheet whose rules could not be read, and why */
  unread: string[]
  /** How many rules were read, in every stylesheet and every rule holding rules */
  rules: number
  /** Each face in `document.fonts`, as its family and its status */
  faces: string[]
  /** Each element of the body that holds text of its own, and its ::before or ::after that does, with its computed family */
  texts: { part: string; family: string; stepNumber: boolean }[]
}
/** The page's font faces, as its stylesheets declare them and as `document.fonts` holds them, and the family of every
 * text it shows; runs in the page */
function fonts(): Fonts {
  const seen: Fonts = { faceRules: [], unread: [], rules: 0, faces: [], texts: [] }
  const walk = (list: CSSRuleList, sheet: string) => {
    for (const rule of list) {
      seen.rules++
      if (rule instanceof CSSFontFaceRule) seen.faceRules.push(`${sheet}: ${rule.cssText}`)
      if (rule instanceof CSSImportRule && rule.styleSheet) read(rule.styleSheet)
      // A grouping rule (@media, @supports, @layer, @container) and a style rule with rules nested in it
      if ('cssRules' in rule) walk(rule.cssRules as CSSRuleList, sheet)
    }
  }
  const read = (sheet: CSSStyleSheet) => {
    const name = sheet.href ?? 'a <style> in the page'
    let list: CSSRuleList
    try {
      list = sheet.cssRules
    } catch (error) {
      seen.unread.push(`${name}: ${String(error)}`)
      return
    }
    walk(list, name)
  }
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) read(sheet)
  seen.faces = [...document.fonts].map((face) => `${face.family} (${face.status})`)
  for (const [n, el] of [document.body, ...document.body.querySelectorAll('*')].entries()) {
    const name = `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} #${n}`
    const stepNumber = el.matches('.deck-n')
    if ([...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && /\S/.test(node.textContent ?? ''))) {
      seen.texts.push({ part: name, family: getComputedStyle(el).fontFamily, stepNumber })
    }
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(el, pseudo)
      if (!['none', 'normal', '""'].includes(style.content)) seen.texts.push({ part: name + pseudo, family: style.fontFamily, stepNumber })
    }
  }
  return seen
}

// landing-page::REQ-006 (The palette: the text set in the system font stack; the page loads no web font). Narrow as
// well as wide: the rules only a narrow window takes, and the stacked feature steps, are read at 400px.
describe("in the test state the page loads no font, and its text is set in the stylesheet's two families", () => {
  const WIDTHS = [1280, 400]
  const cases = LOCALES.flatMap((locale) => WIDTHS.map((width) => ({ name: `${locale}/${width}`, locale, width })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width }, { expect }) => {
    const body = declaredFamily('body')
    const stepNumbers = declaredFamily('.deck-n')
    const { pill, note } = ui[locale].download.test
    const requests: string[] = []
    const seen = await visit(browser, inject('builtSite'), { path: PAGE_PATH[locale], width, colorScheme: 'light', reads: TESTING, requests }, async (page) => {
      const landed = JSON.stringify([pill, note])
      await vi.waitFor(
        async () => {
          const now = JSON.stringify(await page.$$eval('.hero .cta .meta .pill, .hero .cta .beta-note', (els) => els.map((el) => (el.textContent ?? '').trim())))
          if (now !== landed) throw new Error(`The test state never landed: the hero's pill and note show ${now}, not ${landed}`)
        },
        { timeout: LANDING, interval: 50 }
      )
      return page.evaluate(fonts)
    })
    expect.soft(seen.unread, 'stylesheets whose rules could not be read').toEqual([])
    expect.soft(seen.rules, 'rules read in the stylesheets').toBeGreaterThan(0)
    expect.soft(seen.faceRules, '@font-face rules in the stylesheets').toEqual([])
    expect.soft(seen.faces, 'faces in document.fonts').toEqual([])
    expect.soft(requests.filter((url) => FONT_FILE.test(new URL(url).pathname)), 'font files the page asked for').toEqual([])
    expect.soft(seen.texts.filter((t) => t.stepNumber).length, 'step numbers holding text').toBeGreaterThan(0)
    const wrong = seen.texts.flatMap(({ part, family, stepNumber }) => {
      const [expected, whose] = stepNumber ? [stepNumbers, '.deck-n'] : [body, 'body']
      return families(family).join(', ') === expected.join(', ') ? [] : [`${part} is set in ${family}, not ${whose}'s ${expected.join(', ')}`]
    })
    expect.soft(seen.texts.length, 'parts holding text').toBeGreaterThan(0)
    expect.soft(wrong, 'parts holding text set in a family other than the stylesheet declares for them').toEqual([])
  })
})
