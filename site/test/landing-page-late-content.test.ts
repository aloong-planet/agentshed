// What arrives after the landing page is shown, in a browser, in each language: the screenshots, the download count
// and the download state's reads. Each case holds the answers back (the harness's `hold`), measures the page, lets
// them land and measures it again, comparing the page with itself, so the checks hold whatever fonts the machine
// renders with. A hold that never held anything fails its case, so no case measures "before" on a page that already
// had its answer.
import { afterAll, beforeAll, describe, inject, test, vi } from 'vitest'
import { countText } from '../src/download-count'
import { LOCALES, PAGE_PATH, type Locale } from '../src/i18n/ui'
import { hold, launch, ORIGIN, visit, type Answer, type Browser, type Visit } from './support/browser'
import { COUNT_URL, POINTER_URL, RELEASES, RELEASES_API, statistics } from './support/stand-ins'

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

const open = (locale: Locale, width: number, reads: Record<string, Answer>): Visit => ({
  path: PAGE_PATH[locale],
  width,
  colorScheme: 'light',
  reads
})
// Every read unreachable: the page stays in the list state it was served in, its count's line empty, so nothing but
// what a case holds back changes the page
const UNREACHABLE: Record<string, Answer> = { [POINTER_URL]: 'fail', [RELEASES_API]: 'fail', [COUNT_URL]: 'fail' }

// A wait inside a case gives up well inside the case's own limit, because the run's timeout names nothing
const WAIT = 5_000
const CASE_LIMIT = WAIT * 3 + 10_000
// Subpixel layout: an edge this close counts as on the line
const TOLERANCE = 0.5

interface Box {
  name: string
  left: number
  top: number
  width: number
  height: number
}
/** Every element of the page, in document order, with its box in the document, from the one `from` picks (from the
 *  first if null); runs in the page */
function boxes(from: string | null): Box[] {
  const all = [...document.body.querySelectorAll('*')]
  const start = from ? all.findIndex((el) => el.matches(from)) : 0
  if (start < 0) throw new Error(`the page has no ${from}`)
  return all.slice(start).map((el, i) => {
    const r = el.getBoundingClientRect()
    const name = `#${start + i} ${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`
    return { name, left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height }
  })
}
/** What moved or changed size from one measurement to the other */
const moved = (before: Box[], after: Box[]): string[] =>
  before.flatMap((b, i) => {
    const a = after[i]
    if (!a || a.name !== b.name) return [`${b.name} is not where it was in the document`]
    const by = (['left', 'top', 'width', 'height'] as const).filter((k) => Math.abs(a[k] - b[k]) > TOLERANCE)
    return by.map((k) => `${b.name}: ${k} ${b[k].toFixed(1)} -> ${a[k].toFixed(1)}`)
  })

// landing-page::REQ-005/AC-03, landing-page Failure C4
describe("every screenshot's space is held before it loads, so nothing moves when the screenshots arrive", () => {
  const POSTER = `${ORIGIN}/media/agentshed-intro-poster.jpg`
  /** The screenshots on show (an image in a screenshot's frame that the page lays out), and how wide each has loaded */
  function screenshots(): { src: string; loaded: number }[] {
    return [...document.querySelectorAll<HTMLImageElement>('.shot img')]
      .filter((img) => img.getBoundingClientRect().width > 0)
      .map((img) => ({ src: img.src, loaded: img.naturalWidth }))
  }
  const cases = LOCALES.flatMap((locale) => [1280, 400].map((width) => ({ name: `${locale}/${width}`, locale, width })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width }, { expect }) => {
    const shots = hold('the screenshots', (url) => url.startsWith(`${ORIGIN}/shots/`) || url === POSTER)
    const { held, loaded } = await visit(browser, inject('builtSite'), { ...open(locale, width, UNREACHABLE), holds: [shots] }, async (page) => {
      await shots.reached(WAIT)
      // The stacked steps' screenshots are asked for only as they come near the view: bring each there, then go back
      await page.evaluate(async () => {
        for (const img of document.querySelectorAll('.m-shot img')) {
          if (!img.checkVisibility()) continue
          img.scrollIntoView({ behavior: 'instant' })
          await new Promise((frame) => requestAnimationFrame(frame))
        }
        scrollTo({ top: 0, behavior: 'instant' })
      })
      // Measured only once every screenshot on show has been asked for and is held
      await vi.waitFor(
        async () => {
          const waiting = (await page.evaluate(screenshots)).filter((s) => !shots.held.includes(s.src))
          if (waiting.length > 0) throw new Error(`screenshots not yet asked for: ${waiting.map((s) => s.src).join(', ')}`)
        },
        { timeout: WAIT }
      )
      const held = { shots: await page.evaluate(screenshots), boxes: await page.evaluate(boxes, null) }
      shots.release()
      await vi.waitFor(
        async () => {
          const waiting = (await page.evaluate(screenshots)).filter((s) => s.loaded === 0)
          if (waiting.length > 0) throw new Error(`screenshots not loaded after the release: ${waiting.map((s) => s.src).join(', ')}`)
        },
        { timeout: WAIT }
      )
      return { held, loaded: { shots: await page.evaluate(screenshots), boxes: await page.evaluate(boxes, null) } }
    })
    // The hero's poster and the six steps' screenshots (landing-page::US-003/AC-01), none loaded when measured
    expect(held.shots.map((s) => new URL(s.src).pathname), 'screenshots on show').toHaveLength(7)
    expect(held.shots.filter((s) => s.loaded > 0).map((s) => s.src), 'screenshots already loaded when measured held').toEqual([])
    expect(moved(held.boxes, loaded.boxes), 'what moved when the screenshots loaded').toEqual([])
  })
})

// landing-page::REQ-011/AC-01 (the line's space held from the first render)
describe("the count's line holds its space: nothing from it on moves while its read is held, when it lands, or when it fails", () => {
  const LINE = '#download [data-download-count]'
  const COUNT = 1234567
  const cases = LOCALES.flatMap((locale) =>
    [1280, 400].flatMap((width) => (['lands', 'fails'] as const).map((read) => ({ name: `${locale}/${width}/${read}`, locale, width, read })))
  )
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width, read }, { expect }) => {
    const count = hold('the statistics read', (url) => url === COUNT_URL)
    const answer: Answer = read === 'lands' ? [200, statistics(COUNT + 0.75, COUNT, 0.75)] : 'fail'
    const { held, after } = await visit(browser, inject('builtSite'), { ...open(locale, width, { ...UNREACHABLE, [COUNT_URL]: answer }), holds: [count] }, async (page) => {
      const line = () => page.evaluate((selector) => (document.querySelector(selector)?.textContent ?? '').trim(), LINE)
      await count.reached(WAIT)
      const held = { text: await line(), boxes: await page.evaluate(boxes, LINE) }
      const failed = read === 'fails' ? page.waitForEvent('requestfailed', { predicate: (r) => r.url() === COUNT_URL, timeout: WAIT }) : null
      count.release()
      if (failed) {
        await failed
        // The page's own handling of the failure comes after the failed request: two frames on, it has had its turn
        await page.evaluate(() => new Promise((frame) => requestAnimationFrame(() => requestAnimationFrame(frame))))
      } else await vi.waitFor(async () => expect(await line()).not.toBe(''), { timeout: WAIT })
      return { held, after: { text: await line(), boxes: await page.evaluate(boxes, LINE) } }
    })
    expect(held.text, 'the line while its read is held').toBe('')
    expect(after.text, `the line once its read ${read === 'lands' ? 'landed' : 'failed'}`).toBe(read === 'lands' ? countText(COUNT, locale) : '')
    // The line itself, then what follows it
    expect(held.boxes.length, 'elements measured').toBeGreaterThan(1)
    expect(moved(held.boxes, after.boxes), `what moved when the read ${read === 'lands' ? 'landed' : 'failed'}`).toEqual([])
  })
})

// landing-page Failure A7
describe('a download state that lands after the page is shown leaves what the visitor looks at in place', () => {
  // The test state: no pointer, and only pre-releases on GitHub. Its download block is taller than the list state's
  // the page was served in, so the block changes height when it lands
  const READS: Record<string, Answer> = {
    [POINTER_URL]: 'fail',
    [RELEASES_API]: [200, JSON.stringify(RELEASES.filter((r) => r.prerelease))],
    [COUNT_URL]: 'fail'
  }
  /** Where the visitor is when the state lands, relative to the hero's download block: scrolled past it, scrolled
   *  until it is under the header, put past it by a language switch, or with it in view */
  const PLACES = {
    'past it': 'past',
    'under the header': 'under',
    'switched past it': 'switch',
    'in view': 'in view'
  } as const
  type Place = (typeof PLACES)[keyof typeof PLACES]
  // Scroll anchoring can keep the place on its own, hiding a page that does not: each place also runs without it
  const ANCHORING = ['on', 'off'] as const
  const NO_ANCHORING = '* { overflow-anchor: none !important; }'
  const cases = LOCALES.flatMap((locale) =>
    Object.entries(PLACES).flatMap(([where, place]) =>
      ANCHORING.map((anchoring) => ({ name: `${locale}/${where}/anchoring ${anchoring}`, locale, place, anchoring }))
    )
  )

  interface Look {
    scrollY: number
    /** The header's bottom: the visitor's view starts below it */
    viewTop: number
    block: { top: number; bottom: number }
    label: string
    /** The elements after the block that were in view when the first look was taken, and their tops in the window */
    inView: { name: string; top: number }[]
  }
  /** The block, the view and what is in it; the first look notes the elements in view, later looks find them again;
   *  runs in the page */
  function look(first: boolean): Look {
    const page = globalThis as unknown as { inView?: Element[] }
    const block = document.querySelector('.hero .cta')
    const header = document.querySelector('.site-header')
    if (!block || !header) throw new Error('the page has no hero download block or no header')
    const viewTop = header.getBoundingClientRect().bottom
    if (first) {
      page.inView = [...document.body.querySelectorAll('*')].filter((el) => {
        if (block.contains(el) || !(block.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.bottom > viewTop && r.top < innerHeight
      })
    }
    const { top, bottom } = block.getBoundingClientRect()
    return {
      scrollY,
      viewTop,
      block: { top, bottom },
      label: (block.querySelector('a.btn')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      inView: (page.inView ?? []).map((el, i) => ({
        name: `#${i} ${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`,
        top: el.getBoundingClientRect().top
      }))
    }
  }
  /** Scrolls the page to the place, the block's bottom 10px above the window or 20px under the header's bottom */
  function goTo(place: Place): void {
    const block = document.querySelector('.hero .cta')
    const header = document.querySelector('.site-header')
    if (!block || !header) throw new Error('the page has no hero download block or no header')
    const bottom = block.getBoundingClientRect().bottom + scrollY
    const top = place === 'past' ? bottom + 10 : place === 'under' ? bottom - header.getBoundingClientRect().bottom + 20 : 0
    scrollTo({ top, behavior: 'instant' })
  }

  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, place, anchoring }, { expect }) => {
    const pointer = hold('the pointer read', (url) => url === POINTER_URL)
    const other = LOCALES.find((l) => l !== locale) ?? locale
    const start = place === 'switch' ? other : locale
    const { before, after } = await visit(browser, inject('builtSite'), { ...open(start, 1280, READS), holds: [pointer] }, async (page) => {
      await pointer.reached(WAIT)
      if (place === 'switch') {
        // On the other language's page, the install section across the middle of the view, then the toggle
        await page.evaluate(() => {
          const install = document.getElementById('install')
          if (!install) throw new Error('the page has no install section')
          scrollTo({ top: scrollY + install.getBoundingClientRect().top - innerHeight * 0.3, behavior: 'instant' })
        })
        await Promise.all([
          page.waitForURL(ORIGIN + PAGE_PATH[locale], { waitUntil: 'domcontentloaded', timeout: WAIT }),
          page.click('a[data-switch-language]', { timeout: WAIT })
        ])
        // The new page's own read is held too
        await vi.waitFor(() => expect(pointer.held).toHaveLength(2), { timeout: WAIT })
      } else await page.evaluate(goTo, place)
      if (anchoring === 'off') await page.addStyleTag({ content: NO_ANCHORING })
      const before = await page.evaluate(look, true)
      pointer.release()
      await vi.waitFor(async () => expect((await page.evaluate(look, false)).label).not.toBe(before.label), { timeout: WAIT })
      return { before, after: await page.evaluate(look, false) }
    })
    // The state landed, and changed the block's height
    expect(Math.abs(after.block.bottom - after.block.top - (before.block.bottom - before.block.top)), "the change of the block's height").toBeGreaterThan(1)
    if (place === 'in view') {
      expect(before.block.bottom, "the block's bottom, below the view's top").toBeGreaterThan(before.viewTop)
      expect(after.scrollY, 'the scroll position').toBe(before.scrollY)
      expect(after.block.top, "the block's top").toBeCloseTo(before.block.top, 0)
      return
    }
    expect(before.block.bottom, "the block's bottom, at or above the view's top").toBeLessThanOrEqual(before.viewTop)
    if (place === 'under') expect(before.block.bottom, "the block's bottom, inside the window under the header").toBeGreaterThan(0)
    expect(before.inView.length, 'elements in view').toBeGreaterThan(0)
    const shifted = before.inView.flatMap((b, i) => {
      const a = after.inView[i]
      return a && Math.abs(a.top - b.top) <= TOLERANCE ? [] : [`${b.name}: top ${b.top.toFixed(1)} -> ${a?.top.toFixed(1)}`]
    })
    expect(shifted, 'what moved in the view when the state landed').toEqual([])
  })
})
