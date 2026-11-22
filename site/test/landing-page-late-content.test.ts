// What arrives after the landing page is shown, in a browser, in each language: the screenshots, the download count
// and the download state's reads. Each case holds the answers back (the harness's `hold`), measures the page, lets
// them land and measures it again, comparing the page with itself, so the checks hold whatever fonts the machine
// renders with. A hold that never held anything fails its case, so no case measures "before" on a page that already
// had its answer.
import { afterAll, beforeAll, describe, inject, test, vi } from 'vitest'
import { countText } from '../src/download-count'
import { LOCALES, PAGE_PATH, type Locale } from '../src/i18n/ui'
import { hold, launch, ORIGIN, visit, type Answer, type Browser, type Visit } from './support/browser'
import { COUNT_URL, POINTER_URL, RELEASES_API, statistics } from './support/stand-ins'

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
