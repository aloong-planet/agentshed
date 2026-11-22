// The page's layout in a browser (landing-page::QR-001/AC-01), in each language, appearance, download state and
// width: a state lands through the page's own script, the stand-ins answering its reads, and the run measures its own
// geometry, so the checks hold whatever fonts the machine renders with.
//
// A button is an element the page styles as one (`.btn`), or a `button` or `role="button"` element. Its card is the
// `.dl` or `.step` that holds it, measured inside the card's border and padding; the hero's button, which no card
// holds, is measured against the hero's column, the hero's box inside its padding.
//
// Not driven by any case here: a state that never lands. It fails the case through `land`'s wait; shown when this was
// written by pointing the page's pointer read at a URL no stand-in answers, and by removing the count's mark.
import { afterAll, beforeAll, describe, inject, test, vi } from 'vitest'
import { view, type DownloadState } from '../src/download'
import { countText } from '../src/download-count'
import { LOCALES, PAGE_PATH, type Locale } from '../src/i18n/ui'
import { launch, visit, type Answer, type Browser, type Page } from './support/browser'
import { COUNT_URL, POINTER, POINTER_URL, RELEASES, RELEASES_API, statistics } from './support/stand-ins'

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

const NOT_FOUND: Answer = [404, '<html></html>']
// Versions as long as the release line's: the test state's pre-release as 0.1.0-beta.9 rather than the fixture's own
const PRE_RELEASES = JSON.stringify(RELEASES.filter((r) => r.prerelease)).replaceAll('1.2.0-beta', '0.1.0-beta.9')
const STATES: { state: DownloadState; reads: Record<string, Answer> }[] = [
  {
    state: { kind: 'formal-r2', version: '0.2.0', url: 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg' },
    reads: { [POINTER_URL]: [200, POINTER] }
  },
  {
    state: { kind: 'formal-github', version: '1.2.1', dmg: true },
    reads: { [POINTER_URL]: NOT_FOUND, [RELEASES_API]: [200, JSON.stringify(RELEASES)] }
  },
  {
    state: { kind: 'test', version: '0.1.0-beta.9' },
    reads: { [POINTER_URL]: NOT_FOUND, [RELEASES_API]: [200, PRE_RELEASES] }
  },
  { state: { kind: 'list' }, reads: { [POINTER_URL]: 'fail', [RELEASES_API]: 'fail' } }
]
const COUNT = 1234567
const WIDTHS = [400, 900, 1280, 1440]
const SCHEMES = ['light', 'dark'] as const

const cases = STATES.flatMap(({ state, reads }) =>
  LOCALES.flatMap((locale) =>
    SCHEMES.flatMap((colorScheme) =>
      WIDTHS.map((width) => ({ name: `${state.kind}/${locale}/${colorScheme}/${width}`, state, reads, locale, colorScheme, width }))
    )
  )
)

// A state that has not landed by LANDING fails the case through the visit, whose error names every request the page
// made that no stand-in answers; the case's own limit stays well past it, because the run's timeout names nothing
const LANDING = 5_000
const CASE_LIMIT = LANDING + 10_000

/** Waits until the page shows the state and the count: the hero's button has the state's label, the count its line */
async function land(page: Page, state: DownloadState, locale: Locale): Promise<void> {
  const expected = JSON.stringify([view(state, locale).hero.label, countText(COUNT, locale)])
  await vi.waitFor(
    async () => {
      const now = JSON.stringify(await page.evaluate(shows))
      if (now !== expected) throw new Error(`The state never landed: the page shows ${now}, not ${expected}`)
    },
    { timeout: LANDING, interval: 50 }
  )
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}
interface Layout {
  scrollWidth: number
  clientWidth: number
  buttons: { name: string; box: Box; holder: { name: string; box: Box } | null }[]
  column: Box
  heroParts: { name: string; box: Box }[]
}

/** What the hero's button and the count's line say; runs in the page */
function shows(): string[] {
  return ['.hero .cta a.btn', '#download [data-download-count]'].map((selector) =>
    (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()
  )
}

/** The page's geometry as the browser laid it out; runs in the page */
function measure(): Layout {
  const label = (node: Node): string => {
    const el = node instanceof Element ? node : node.parentElement
    const tag = el ? `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}` : '?'
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    return node instanceof Element ? `${tag}${text ? ` "${text}"` : ''}` : `the text "${text}" in ${tag}`
  }
  const box = (r: DOMRect): Box => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
  const shown = (r: DOMRect): boolean => r.width > 0 && r.height > 0
  const inner = (el: Element): Box => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    const px = (v: string): number => parseFloat(v) || 0
    return {
      left: r.left + px(s.borderLeftWidth) + px(s.paddingLeft),
      right: r.right - px(s.borderRightWidth) - px(s.paddingRight),
      top: r.top + px(s.borderTopWidth) + px(s.paddingTop),
      bottom: r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom)
    }
  }
  const hero = document.querySelector('.hero')
  if (!hero) throw new Error('the page has no hero')
  const buttons = [...document.querySelectorAll('.btn, button, [role="button"]')]
    .filter((el) => shown(el.getBoundingClientRect()))
    .map((el) => {
      const holder = el.closest('.dl, .step, .hero')
      return {
        name: label(el),
        box: box(el.getBoundingClientRect()),
        holder: holder ? { name: holder === hero ? "the hero's column" : label(holder).split(' ')[0], box: inner(holder) } : null
      }
    })
  const heroParts: { name: string; box: Box }[] = []
  const walker = document.createTreeWalker(hero, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let rect: DOMRect
    if (node instanceof Element) rect = node.getBoundingClientRect()
    else {
      if (!node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      rect = range.getBoundingClientRect()
    }
    if (shown(rect)) heroParts.push({ name: label(node), box: box(rect) })
  }
  const root = document.documentElement
  return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, buttons, column: inner(hero), heroParts }
}

// Subpixel layout: an edge this close counts as on the line
const TOLERANCE = 0.5
const past = (inner: Box, outer: Box, vertical: boolean): string[] => {
  const over = [
    ['left', outer.left - inner.left],
    ['right', inner.right - outer.right],
    ...(vertical ? [['top', outer.top - inner.top], ['bottom', inner.bottom - outer.bottom]] : [])
  ] as [string, number][]
  return over.filter(([, by]) => by > TOLERANCE).map(([side, by]) => `${by.toFixed(1)}px past the ${side} edge`)
}

// landing-page::QR-001/AC-01
describe('the layout at each width, in each language, appearance and download state', () => {
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ state, reads, locale, colorScheme, width }, { expect }) => {
    const layout = await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width, colorScheme, reads: { ...reads, [COUNT_URL]: [200, statistics(COUNT + 0.75, COUNT, 0.75)] } },
      async (page) => {
        await land(page, state, locale)
        return page.evaluate(measure)
      }
    )

    expect.soft(layout.scrollWidth - layout.clientWidth, 'the page scrolls sideways by').toBeLessThanOrEqual(0)

    expect(layout.buttons.length, 'buttons measured').toBeGreaterThan(0)
    const strayButtons = layout.buttons.flatMap(({ name, box, holder }) =>
      holder ? past(box, holder.box, true).map((by) => `${name} runs ${by} of ${holder.name}`) : [`${name} is in no card`]
    )
    expect.soft(strayButtons, 'buttons outside their cards').toEqual([])

    expect(layout.heroParts.length, "the hero's parts measured").toBeGreaterThan(0)
    const gutters = [
      ...(layout.column.left > 0 ? [] : [`the hero's column starts at ${layout.column.left.toFixed(1)}px, on the window's left edge or past it`]),
      ...(layout.column.right < layout.clientWidth
        ? []
        : [`the hero's column ends at ${layout.column.right.toFixed(1)}px, on the window's right edge (${layout.clientWidth}px) or past it`]),
      ...layout.heroParts.flatMap(({ name, box }) => past(box, layout.column, false).map((by) => `${name} runs ${by} of the hero's column`))
    ]
    expect.soft(gutters, "the hero's content outside its gutters").toEqual([])
  })
})
