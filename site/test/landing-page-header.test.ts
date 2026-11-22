// The header in a browser, in each language: the parts of landing-page::REQ-003 and landing-page::REQ-012/AC-02, AC-03
// that need a layout. The header's markup and the trail's links are checked on the built pages (built-site.test.ts).
// The run measures its own boxes and computed styles and compares the elements with each other, so the checks hold
// whatever fonts the machine renders with.
import { afterAll, beforeAll, describe, inject, test } from 'vitest'
import { LOCALES, PAGE_PATH, type Locale } from '../src/i18n/ui'
import { launch, visit, type Browser, type Visit } from './support/browser'
import { COUNT_URL, POINTER_URL, RELEASES_API, statistics } from './support/stand-ins'

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

// The header is the same in every download state: the page in the list state, its every read answered
const open = (locale: Locale, width: number, colorScheme: Visit['colorScheme'] = 'light'): Visit => ({
  path: PAGE_PATH[locale],
  width,
  colorScheme,
  reads: { [POINTER_URL]: 'fail', [RELEASES_API]: 'fail', [COUNT_URL]: [200, statistics(3, 3, 0)] }
})

// A pointer action that cannot happen gives up well inside the case's own limit, because the run's timeout names nothing
const WAIT = 2_000
const CASE_LIMIT = WAIT * 2 + 10_000
// Subpixel layout: an edge this close counts as on the line
const TOLERANCE = 0.5

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}
type Look = Box & { fontSize: string; lineHeight: string; color: string; paddingRight: string }
/** Each element's box in the window, and its computed font size, line height, colour and right padding; runs in the page */
function looks(selectors: string[]): Look[] {
  return selectors.map((selector) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`the page has no ${selector}`)
    const { left, right, top, bottom } = el.getBoundingClientRect()
    const { fontSize, lineHeight, color, paddingRight } = getComputedStyle(el)
    return { left, right, top, bottom, fontSize, lineHeight, color, paddingRight }
  })
}

// landing-page::REQ-003
describe('the header stays at the top of the window at every scroll position down the page', () => {
  const cases = LOCALES.flatMap((locale) => [400, 1280].map((width) => ({ name: `${locale}/${width}`, locale, width })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width }, { expect }) => {
    const positions = await visit(browser, inject('builtSite'), open(locale, width), (page) =>
      page.evaluate(async () => {
        const header = document.querySelector('.site-header')
        if (!header) throw new Error('the page has no header')
        const end = document.documentElement.scrollHeight - innerHeight
        const seen: { asked: number; scrolled: number; top: number }[] = []
        // A window's height at a time, from the top to the end of the page
        for (let asked = 0; ; asked = Math.min(asked + innerHeight, end)) {
          scrollTo({ top: asked, behavior: 'instant' })
          await new Promise((frame) => requestAnimationFrame(frame))
          seen.push({ asked, scrolled: scrollY, top: header.getBoundingClientRect().top })
          if (asked === end) break
        }
        return seen
      })
    )
    // Down the whole page: more than a couple of windows, each position reached
    expect(positions.length, 'scroll positions measured').toBeGreaterThan(2)
    expect(positions.filter((p) => Math.abs(p.scrolled - p.asked) > TOLERANCE).map((p) => `asked ${p.asked}, at ${p.scrolled}`)).toEqual([])
    const off = positions.filter((p) => Math.abs(p.top) > TOLERANCE).map((p) => `at ${p.scrolled}px the header's top is at ${p.top.toFixed(1)}px`)
    expect(off, 'the header away from the top of the window').toEqual([])
  })
})

// landing-page::REQ-003 (the navigation hidden below 760px)
describe('the navigation is shown at 760px and wider, and hidden below', () => {
  const WIDTHS = [
    { width: 400, shown: false },
    { width: 759, shown: false },
    { width: 760, shown: true },
    { width: 900, shown: true },
    { width: 1280, shown: true },
    { width: 1440, shown: true }
  ]
  const cases = LOCALES.flatMap((locale) => WIDTHS.map(({ width, shown }) => ({ name: `${locale}/${width}`, locale, width, shown })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width, shown }, { expect }) => {
    const header = await visit(browser, inject('builtSite'), open(locale, width), (page) =>
      page.evaluate(() => ({
        links: [...document.querySelectorAll('.nav-links a')].map((a) => {
          const { left, right, top, bottom } = a.getBoundingClientRect()
          return { text: (a.textContent ?? '').trim(), visible: a.checkVisibility(), left, right, top, bottom }
        }),
        trail: document.querySelector('.crumbs')?.getBoundingClientRect().right ?? NaN,
        toggle: document.querySelector('.lang')?.getBoundingClientRect().left ?? NaN,
        windowWidth: document.documentElement.clientWidth
      }))
    )
    // Features, Install, Download and GitHub, there to show or hide
    expect(header.links.length, 'navigation links').toBe(4)
    const wrong = header.links.filter((link) => link.visible !== shown).map((link) => `"${link.text}" is ${link.visible ? 'shown' : 'hidden'}`)
    expect(wrong, `at ${width}px the navigation should be ${shown ? 'shown' : 'hidden'}`).toEqual([])
    if (!shown) return
    // Shown whole: inside the window, between the trail and the language toggle
    const stray = header.links.flatMap((link) => [
      ...(link.left < header.trail - TOLERANCE ? [`"${link.text}" starts ${(header.trail - link.left).toFixed(1)}px over the trail`] : []),
      ...(link.right > header.toggle + TOLERANCE ? [`"${link.text}" ends ${(link.right - header.toggle).toFixed(1)}px over the language toggle`] : []),
      ...(link.right > header.windowWidth + TOLERANCE ? [`"${link.text}" ends past the window's right edge`] : [])
    ])
    expect(stray, `at ${width}px the navigation`).toEqual([])
  })
})

// landing-page::REQ-012/AC-02 (the wide window)
describe("on a wide window the trail takes the navigation links' size, grey and hover colour, 10px apart", () => {
  const cases = LOCALES.flatMap((locale) => (['light', 'dark'] as const).map((colorScheme) => ({ name: `${locale}/${colorScheme}`, locale, colorScheme })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, colorScheme }, { expect }) => {
    const trail = await visit(browser, inject('builtSite'), open(locale, 1280, colorScheme), async (page) => {
      const [home, sep, brand, link] = await page.evaluate(looks, ['.crumbs-home', '.crumbs-sep', '.brand', '.nav-links a'])
      const colour = async (selector: string) => {
        await page.hover(selector, { timeout: WAIT })
        return (await page.evaluate(looks, [selector]))[0].color
      }
      const linkHover = await colour('.nav-links a')
      const homeHover = await colour('.crumbs-home')
      return { home, sep, brand, link, linkHover, homeHover }
    })
    const { home, sep, brand, link } = trail
    expect.soft([home.fontSize, sep.fontSize], 'the font size of "aloong planet" and "/"').toEqual([link.fontSize, link.fontSize])
    expect.soft([home.color, sep.color], 'the colour of "aloong planet" and "/"').toEqual([link.color, link.color])
    expect.soft(sep.left - home.right, 'between "aloong planet" and "/"').toBeCloseTo(10, 0)
    expect.soft(brand.left - sep.right, 'between "/" and the brand').toBeCloseTo(10, 0)
    // A hover colour that is the link's own grey would make the next check hold for any colour the trail kept
    expect(trail.linkHover, "a navigation link's hover colour").not.toBe(link.color)
    expect(trail.homeHover, 'the colour of "aloong planet" on hover').toBe(trail.linkHover)
  })
})

// landing-page::REQ-012/AC-02 (the narrow window), landing-page::REQ-012/AC-03
describe('in a window 400px wide or narrower the trail goes small on its own line, in the same header', () => {
  const cases = LOCALES.flatMap((locale) => [400, 320].map((width) => ({ name: `${locale}/${width}`, locale, width })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width }, { expect }) => {
    const SELECTORS = ['.crumbs-home', '.crumbs-sep', '.crumbs-up', '.crumbs li:has(.brand)', '.site-header', '.bar', '.lang']
    const { narrow, wide } = await visit(browser, inject('builtSite'), open(locale, width), async (page) => {
      const narrow = await page.evaluate(looks, SELECTORS)
      // The same page in a wide window, to compare the header with
      await page.setViewportSize({ width: 1280, height: 800 })
      return { narrow, wide: await page.evaluate(looks, SELECTORS) }
    })
    const [home, sep, trailLine, brandLine, header, bar, toggle] = narrow
    const [, , , , wideHeader, wideBar, wideToggle] = wide
    const px = (value: string): number => parseFloat(value)
    // landing-page::REQ-012/AC-02
    expect.soft(sep.left - home.right, 'between "aloong planet" and "/"').toBeCloseTo(4, 0)
    // landing-page::REQ-012/AC-03
    expect.soft([px(home.fontSize), px(sep.fontSize)], 'the font size of "aloong planet" and "/"').toEqual([11, 11])
    expect.soft(px(home.lineHeight) / px(home.fontSize), 'the line height of "aloong planet", to its size').toBeCloseTo(1.3, 2)
    expect.soft(brandLine.top - trailLine.bottom, "from the trail's line to the brand's").toBeCloseTo(1, 0)
    expect.soft(header.bottom - header.top, "the header's height").toBeCloseTo(wideHeader.bottom - wideHeader.top, 0)
    // The toggle at the right: as far from the end of the bar's content as in the wide window
    const fromEnd = (b: Look, t: Look): number => b.right - px(b.paddingRight) - t.right
    expect.soft(fromEnd(bar, toggle), "the language toggle's distance from the header's right edge").toBeCloseTo(fromEnd(wideBar, wideToggle), 0)
  })
})
