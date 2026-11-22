// The features section in a browser (landing-page::REQ-004), in each language. Scrolling, resizing and switching
// language go through the page itself (its own scrolling, the wheel, a resized window, a click on a link), the page
// computes the step, and a case waits for the step the page computes, not for a fixed time. Positions and sizes are
// measured in the run, against the header and the window, so the checks hold whatever fonts the machine renders with.
//
// The step shown is the one whose text and screenshot the browser draws (displayed, visible and not transparent),
// never the script's own marks. The point where the showcase pins is measured: the block's top on the page less the
// pinned part's top once it stands still under the header. A turn is 60% of the window's height
// (landing-page::REQ-004/AC-08).
//
// Every read fails: the page stays in the list state it is served in, so nothing above the showcase changes height
// while a case scrolls. A case that reads the step runs under reduced motion, where the switch is instant; the cases
// about the cross-fade, and about what the pointer and assistive technology meet once a step has faded in, run without.
import { afterAll, beforeAll, describe, inject, test, vi } from 'vitest'
import { LOCALES, PAGE_PATH } from '../src/i18n/ui'
import { launch, visit, type Answer, type Browser, type Page } from './support/browser'
import { COUNT_URL, POINTER_URL, RELEASES_API } from './support/stand-ins'

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

const READS: Record<string, Answer> = { [POINTER_URL]: 'fail', [RELEASES_API]: 'fail', [COUNT_URL]: 'fail' }

// A step, a scroll or a layout that has not landed by SETTLE fails the case, naming what the page shows; the case's
// own limit stays well past it, because the run's timeout names nothing
const SETTLE = 2_000
const CASE_LIMIT = 30_000

const STEPS = 6 // landing-page::US-003/AC-01

// Subpixel layout: an edge this close counts as on the line
const TOLERANCE = 0.5

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Waits for the page to draw two frames; gives up after SETTLE, naming the wait */
async function frames(page: Page): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the page drew no two frames within ${SETTLE}ms`)), SETTLE)
  })
  try {
    await Promise.race([
      page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))),
      late
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** The steps, from 1, whose text and whose screenshot the browser draws; runs in the page */
function drawn(): { texts: number[]; shots: number[] } {
  const on = (selector: string): number[] =>
    [...document.querySelectorAll(selector)].flatMap((el, i) => {
      const style = getComputedStyle(el)
      return el.getClientRects().length > 0 && style.visibility === 'visible' && parseFloat(style.opacity) > 0 ? [i + 1] : []
    })
  return { texts: on('.deck-text'), shots: on('.deck-shot') }
}

const steps = (list: number[]): string => (list.length > 0 ? list.join(' and ') : 'none')

/** Waits until the showcase shows `step` alone, its text and its screenshot, and checks it still does two frames on */
async function showsStep(page: Page, step: number, where: string): Promise<void> {
  const want = JSON.stringify({ texts: [step], shots: [step] })
  const check = async (): Promise<void> => {
    const now = await page.evaluate(drawn)
    if (JSON.stringify(now) !== want) {
      throw new Error(`${where}: the showcase shows the text of step ${steps(now.texts)} and the screenshot of step ${steps(now.shots)}, not step ${step}`)
    }
  }
  await vi.waitFor(check, { timeout: SETTLE, interval: 50 })
  await frames(page)
  await check()
}

interface Showcase {
  /** The scroll position at which the showcase pins */
  pinPoint: number
  /** The pinned part's top in the window while it is pinned */
  pinnedTop: number
  /** 60% of the window's height */
  turn: number
  /** The page's last scroll position */
  end: number
}

/** Where the showcase pins, measured by scrolling to the block's top, where the pinned part stands under the header;
 *  runs in the page, and leaves it scrolled there */
function measureShowcase(): Showcase {
  const deck = document.querySelector('.deck')
  const pin = deck?.querySelector('.deck-pin')
  if (!deck || !pin) throw new Error('the page has no showcase')
  if (getComputedStyle(deck).display === 'none') throw new Error(`the showcase is not displayed at ${innerWidth}×${innerHeight}`)
  const top = deck.getBoundingClientRect().top + scrollY
  scrollTo({ top, behavior: 'instant' })
  return {
    pinPoint: top - pin.getBoundingClientRect().top,
    pinnedTop: pin.getBoundingClientRect().top,
    turn: 0.6 * innerHeight,
    end: document.documentElement.scrollHeight - innerHeight
  }
}

/** Scrolls the page with its own scrolling, as a visitor's scroll does, to the whole pixel at or past `y`; gives the
 *  position it landed at */
const scrollToY = (page: Page, y: number): Promise<number> =>
  page.evaluate((top) => {
    scrollTo({ top, behavior: 'instant' })
    return scrollY
  }, Math.ceil(y))

// The step at each distance past the pin point, in turns, by hand from the spec: the first at the pin, the next each
// turn on, switching half-way (landing-page Implementation Decisions, "The features section": rounded), the last
// once past
const POSITIONS: [turns: number, step: number][] = [
  [0, 1],
  [0.4, 1],
  [0.6, 2],
  [1, 2],
  [1.4, 2],
  [1.6, 3],
  [2, 3],
  [2.4, 3],
  [2.6, 4],
  [3, 4],
  [3.4, 4],
  [3.6, 5],
  [4, 5],
  [4.4, 5],
  [4.6, 6],
  [5, 6],
  [5.5, 6]
]

// landing-page::REQ-004/AC-08
describe('the step the scroll position gives', () => {
  test.for(LOCALES)('%s: first before and at the pin, the next each turn, back on the way back, last once past; the wheel scrolls the page', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 1280, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
      async (page) => {
        const { pinPoint, turn, end } = await page.evaluate(measureShowcase)
        const at = async (y: number, step: number, where: string): Promise<void> => {
          const landed = await scrollToY(page, y)
          expect(Math.abs(landed - Math.ceil(y)), `${where}: the page scrolled to ${landed}, not ${Math.ceil(y)}`).toBeLessThanOrEqual(1)
          await showsStep(page, step, where)
        }
        // A wheel turn over the screenshot scrolls the page by its own amount, and nothing cancels it
        const wheelTurn = async (): Promise<void> => {
          const from = await page.evaluate(() => scrollY)
          const stage = await page.evaluate(() => {
            const r = document.querySelector('.deck-stage')!.getBoundingClientRect()
            const seen: boolean[] = []
            Object.assign(window, { wheels: seen })
            addEventListener('wheel', (e) => seen.push(e.defaultPrevented), { passive: true })
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          })
          await page.mouse.move(stage.x, stage.y)
          await page.mouse.wheel(0, 120)
          await vi.waitFor(
            async () => {
              const now = await page.evaluate(() => scrollY)
              if (now === from) throw new Error(`a wheel turn of 120px over the screenshot left the page at ${now}`)
            },
            { timeout: SETTLE, interval: 50 }
          )
          await frames(page)
          expect(await page.evaluate(() => scrollY), 'where a wheel turn of 120px from 2 turns took the page').toBe(from + 120)
          expect(await page.evaluate(() => (window as unknown as { wheels: boolean[] }).wheels), 'the wheel turn, cancelled').toEqual([false])
          await showsStep(page, 3, 'a wheel turn on from 2 turns')
        }

        // One step at a time, forward and back: a jump of several steps is Failure C1's case
        await at(0, 1, 'at the top of the page')
        await at(pinPoint - turn / 2, 1, 'half a turn before the pin point')
        for (const [turns, step] of POSITIONS) {
          await at(pinPoint + turns * turn, step, `${turns} turns past the pin point`)
          if (turns === 2) await wheelTurn()
        }
        await at(end, 6, 'at the end of the page')
        for (const [turns, step] of [...POSITIONS].reverse()) await at(pinPoint + turns * turn, step, `back at ${turns} turns`)
        await at(pinPoint - turn / 2, 1, 'back half a turn before the pin point')
      }
    )
  })
})

/** Waits until the page's scroll position stops at `y` (within 1px), and gives where it stopped */
async function scrolledTo(page: Page, y: number, what: string): Promise<number> {
  let now = NaN
  await vi.waitFor(
    async () => {
      now = await page.evaluate(() => scrollY)
      if (Math.abs(now - y) > 1) throw new Error(`${what}: the page is at ${now}, not ${Math.round(y)}`)
    },
    { timeout: SETTLE, interval: 50 }
  )
  return now
}

/** Wheel events over the screenshot, `by` pixels in all, sent one after another without waiting for the page to scroll */
async function wheelBurst(page: Page, by: number, events: number): Promise<void> {
  const stage = await page.evaluate(() => {
    const r = document.querySelector('.deck-stage')!.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.move(stage.x, stage.y)
  for (let i = 0; i < events; i++) await page.mouse.wheel(0, by / events)
}

// landing-page Failure C1
describe('a jump away and back, and a fast scroll, show the step of where the page is', () => {
  test.for(LOCALES)('%s', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 1280, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
      async (page) => {
        const { pinPoint, turn } = await page.evaluate(measureShowcase)
        // Into the showcase a step at a time, so that the jump to the download section is the first of several steps
        await scrollToY(page, pinPoint + turn)
        await showsStep(page, 2, 'at 1 turn')
        const start = await scrollToY(page, pinPoint + 2.2 * turn)
        await showsStep(page, 3, 'at 2.2 turns')

        // The header's link to the download section, which lies past the showcase's block
        await page.click('.nav-links a[href="#download"]', { timeout: SETTLE })
        await vi.waitFor(
          async () => {
            if ((await page.evaluate(() => location.hash)) !== '#download') throw new Error('the download link did not navigate')
          },
          { timeout: SETTLE, interval: 50 }
        )
        const there = await page.evaluate(() => scrollY)
        expect((there - pinPoint) / turn, 'turns past the pin point at the download section').toBeGreaterThan(5.5)
        await showsStep(page, 6, 'at the download section')
        await page.evaluate(() => history.back())
        await scrolledTo(page, start, 'back from the download section')
        await showsStep(page, 3, 'back at 2.2 turns from the download section')

        // A fast scroll: from the pin point, eight wheel events to 3.7 turns, then six back to 0.8
        const pinned = await scrollToY(page, pinPoint)
        await showsStep(page, 1, 'at the pin point')
        await wheelBurst(page, Math.round(3.7 * turn), 8)
        const forward = await scrolledTo(page, pinned + Math.round(3.7 * turn), 'after a fast scroll of 3.7 turns')
        await showsStep(page, 5, `after a fast scroll to ${((forward - pinPoint) / turn).toFixed(2)} turns`)
        await wheelBurst(page, -Math.round(2.9 * turn), 6)
        const back = await scrolledTo(page, forward - Math.round(2.9 * turn), 'after a fast scroll back of 2.9 turns')
        await showsStep(page, 2, `after a fast scroll back to ${((back - pinPoint) / turn).toFixed(2)} turns`)
      }
    )
  })
})

/**
 * The step at `turns` past the pin point, for a position a case cannot choose (after a resize, which lays the page out
 * anew): the spec's rule (landing-page Implementation Decisions, "The features section": in turns, rounded and kept
 * within the steps). A position within 2px of a half turn is refused, so that rounding the measurement cannot decide it.
 */
function stepAt(turns: number, turn: number): number {
  if (Math.abs(turns - Math.floor(turns) - 0.5) * turn < 2) {
    throw new Error(`${turns.toFixed(3)} turns past the pin point is within 2px of a half turn: the case cannot tell which step it gives`)
  }
  return Math.min(STEPS, Math.max(1, Math.round(turns) + 1))
}

/** How far past the pin point the page is, in turns, given the pinned part's top; runs in the page */
function turnsPast(pinnedTop: number): number {
  return (pinnedTop - document.querySelector('.deck')!.getBoundingClientRect().top) / (0.6 * innerHeight)
}

/** Which of the two forms the section shows: the pinned showcase, the stacked steps; runs in the page */
function forms(): { showcase: boolean; stacked: boolean } {
  const displayed = (selector: string): boolean => (document.querySelector(selector)?.getClientRects().length ?? 0) > 0
  return { showcase: displayed('.deck'), stacked: displayed('.fs-list') }
}

/** Resizes the window and waits until the section shows the form the new width gives */
async function resize(page: Page, width: number, height: number, form: 'showcase' | 'stacked'): Promise<void> {
  await page.setViewportSize({ width, height })
  const want = JSON.stringify({ showcase: form === 'showcase', stacked: form === 'stacked' })
  await vi.waitFor(
    async () => {
      const now = await page.evaluate(forms)
      if (JSON.stringify(now) !== want) {
        throw new Error(`at ${width}×${height} the section shows ${now.showcase ? 'the showcase' : 'no showcase'} and ${now.stacked ? 'the stacked steps' : 'no stacked steps'}, not only the ${form === 'showcase' ? 'showcase' : 'stacked steps'}`)
      }
    },
    { timeout: SETTLE, interval: 50 }
  )
}

// landing-page Failure C2
describe('a resize shows the form the width gives and the step of where the page is', () => {
  test.for(LOCALES)('%s: across 760px and back', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 760, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
      async (page) => {
        const { pinPoint, pinnedTop, turn } = await page.evaluate(measureShowcase)
        await scrollToY(page, pinPoint + turn)
        await showsStep(page, 2, 'at 1 turn, 760px wide')
        await scrollToY(page, pinPoint + 2.2 * turn)
        await showsStep(page, 3, 'at 2.2 turns, 760px wide')

        await resize(page, 759, 800, 'stacked')
        // Scrolled on while the steps are stacked, so that the showcase, back, is somewhere else
        await page.evaluate((by) => scrollBy({ top: by, behavior: 'instant' }), Math.round(2 * turn))
        await frames(page)
        await resize(page, 760, 800, 'showcase')
        const turns = await page.evaluate(turnsPast, pinnedTop)
        const step = stepAt(turns, turn)
        expect(step, `the step at ${turns.toFixed(2)} turns, back at 760px: the case needs one other than the step before`).not.toBe(3)
        await showsStep(page, step, `back at 760px, ${turns.toFixed(2)} turns past the pin point`)
      }
    )
  })

  test.for(LOCALES)('%s: a shorter window, then a taller one', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 1280, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
      async (page) => {
        const { pinPoint, pinnedTop, turn } = await page.evaluate(measureShowcase)
        await scrollToY(page, pinPoint + turn)
        await showsStep(page, 2, 'at 1 turn')
        await scrollToY(page, pinPoint + 2.1 * turn)
        await showsStep(page, 3, 'at 2.1 turns')
        let before = 3
        for (const height of [600, 1000]) {
          await resize(page, 1280, height, 'showcase')
          const turns = await page.evaluate(turnsPast, pinnedTop)
          const step = stepAt(turns, 0.6 * height)
          expect(step, `the step at ${turns.toFixed(2)} turns, ${height}px tall: the case needs one other than the step before`).not.toBe(before)
          await showsStep(page, step, `${height}px tall, ${turns.toFixed(2)} turns past the pin point`)
          before = step
        }
      }
    )
  })
})

const OTHER = { en: 'zh', zh: 'en' } as const

/** Clicks the header's language link and waits until the other language's page has loaded */
async function switchLanguage(page: Page, to: keyof typeof OTHER): Promise<void> {
  await Promise.all([page.waitForURL(`**${PAGE_PATH[to]}`, { timeout: SETTLE }), page.click('a[data-switch-language]', { timeout: SETTLE })])
}

// landing-page::REQ-004/AC-07, Failure C5
describe('a language switch keeps the step and the place', () => {
  test.for(LOCALES)('%s first: from the pinned showcase, each way', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 1280, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
      async (page) => {
        const { pinPoint, pinnedTop, turn } = await page.evaluate(measureShowcase)
        // Two places in the pinned showcase, one on each page: 1.25 turns (step 2) and 3.75 turns (step 5)
        const legs = [
          { from: locale, to: OTHER[locale], turns: 1.25, step: 2 },
          { from: OTHER[locale], to: locale, turns: 3.75, step: 5 }
        ]
        let start = pinPoint
        for (const { from, to, turns, step } of legs) {
          // Into the showcase a step at a time, from wherever the page is
          for (let t = Math.round((await page.evaluate(turnsPast, pinnedTop)) + 1); t < turns; t++) {
            await scrollToY(page, start + t * turn)
            await showsStep(page, t + 1, `on the ${from} page at ${t} turns`)
          }
          await scrollToY(page, start + turns * turn)
          await showsStep(page, step, `on the ${from} page at ${turns} turns`)
          const before = await page.evaluate(turnsPast, pinnedTop)

          await switchLanguage(page, to)
          await vi.waitFor(
            async () => {
              const after = await page.evaluate(turnsPast, pinnedTop)
              if (Math.abs(after - before) * turn > 1) {
                throw new Error(`the ${to} page is ${(after * turn).toFixed(1)}px past the pin point, not ${(before * turn).toFixed(1)}px as on the ${from} page`)
              }
            },
            { timeout: SETTLE, interval: 50 }
          )
          await showsStep(page, step, `switched from the ${from} page at ${turns} turns`)
          // The other page's pin point, for the next leg: where the page is, less how far past the pin point it is
          start = (await page.evaluate(() => scrollY)) - before * turn
        }
        expect(page.url()).toMatch(new RegExp(`${PAGE_PATH[locale]}$`))
      }
    )
  })

  test.for(LOCALES)('%s first: from the stacked steps', { timeout: CASE_LIMIT }, async (locale) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 400, colorScheme: 'light', reads: READS },
      async (page) => {
        // The third step across the middle of the window, where the visitor's eye is
        const top = await page.evaluate(() => {
          const step = document.querySelectorAll('.fs-step')[2]
          const r = step.getBoundingClientRect()
          scrollTo({ top: scrollY + r.top - (innerHeight - r.height) / 2, behavior: 'instant' })
          return step.getBoundingClientRect().top
        })
        await switchLanguage(page, OTHER[locale])
        await vi.waitFor(
          async () => {
            const now = await page.evaluate(() => document.querySelectorAll('.fs-step')[2].getBoundingClientRect().top)
            if (Math.abs(now - top) > 1) {
              throw new Error(`on the ${OTHER[locale]} page the third step is ${now.toFixed(1)}px from the top, not ${top.toFixed(1)}px as on the ${locale} page`)
            }
          },
          { timeout: SETTLE, interval: 50 }
        )
      }
    )
  })
})

/** The stacked steps as the browser lays them out: each step's title, text and screenshot; runs in the page */
function stackedSteps(): { title: Box | null; text: Box | null; shot: Box | null }[] {
  const box = (el: Element | null): Box | null => {
    const r = el?.getBoundingClientRect()
    return r && r.width > 0 && r.height > 0 ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null
  }
  return [...document.querySelectorAll('#features .fs-step')].map((step) => ({
    title: box(step.querySelector('.fs-h')),
    text: box(step.querySelector('.fs-p')),
    shot: box(step.querySelector('.m-shot'))
  }))
}

/** Where on the page each element the section shows lies, by its place among the section's elements; runs in the page */
function places(): Record<string, string> {
  const shown: Record<string, string> = {}
  document.querySelectorAll('#features *').forEach((el, i) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    if (getComputedStyle(el).visibility !== 'visible') return
    const tag = `${i}:${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`
    shown[tag] = `${(r.left + scrollX).toFixed(1)},${(r.top + scrollY).toFixed(1)}`
  })
  return shown
}

const STACKED = [
  { width: 400, scripts: true },
  { width: 759, scripts: true },
  ...[400, 900, 1280, 1440].map((width) => ({ width, scripts: false }))
]
const stackedCases = LOCALES.flatMap((locale) =>
  STACKED.map((s) => ({ ...s, locale, name: `${locale}/${s.width}/${s.scripts ? 'scripts on' : 'scripts off'}` }))
)

// landing-page::REQ-004/AC-06, Failure C7
describe('the stacked steps below 760px, and at every width without scripts', () => {
  test.for(stackedCases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width, scripts }, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width, colorScheme: 'light', reads: READS, scripts },
      async (page) => {
        expect(await page.evaluate(forms), 'the forms the section shows').toEqual({ showcase: false, stacked: true })

        const layout = await page.evaluate(stackedSteps)
        expect(layout.length, 'stacked steps').toBe(STEPS)
        const wrong = layout.flatMap(({ title, text, shot }, i) => {
          const n = i + 1
          if (!title || !text || !shot) return [`step ${n} shows ${[!title && 'no title', !text && 'no text', !shot && 'no screenshot'].filter(Boolean).join(', ')}`]
          const below = shot.top - Math.max(title.bottom, text.bottom)
          const next = layout[i + 1]?.title
          return [
            ...(below < -TOLERANCE ? [`step ${n}'s screenshot starts ${(-below).toFixed(1)}px above the end of its text`] : []),
            ...(next && next.top - shot.bottom <= TOLERANCE ? [`step ${n + 1}'s title starts ${(shot.bottom - next.top).toFixed(1)}px into step ${n}'s screenshot, or right under it`] : [])
          ]
        })
        expect.soft(wrong, "the stacked steps' screenshots and titles out of place").toEqual([])

        // Scrolled through the section, from where it comes into view to where it leaves: every element it shows
        // stays where it lies on the page
        const span = await page.evaluate(() => {
          const r = document.querySelector('#features')!.getBoundingClientRect()
          return { from: r.top + scrollY - innerHeight, to: r.bottom + scrollY, end: document.documentElement.scrollHeight - innerHeight }
        })
        const first = await page.evaluate(places)
        expect(Object.keys(first).length, 'elements the section shows').toBeGreaterThan(0)
        const moved: string[] = []
        for (let k = 0; k <= 8; k++) {
          const y = Math.min(span.end, Math.max(0, span.from + ((span.to - span.from) * k) / 8))
          // Read at once: the layout is the browser's as soon as it has scrolled, and with scripts off no frame callback runs
          await scrollToY(page, y)
          const now = await page.evaluate(places)
          for (const [el, at] of Object.entries(first)) {
            if (now[el] !== at) moved.push(`${el} lies at ${now[el] ?? 'nowhere'} at scroll ${Math.round(y)}, not ${at}`)
          }
          for (const el of Object.keys(now)) if (!(el in first)) moved.push(`${el} shows at scroll ${Math.round(y)} only`)
        }
        expect.soft(moved, 'elements that keep their place in the window, or come and go, as the page scrolls').toEqual([])
      }
    )
  })
})

interface ShowcaseLayout {
  header: { bottom: number; inner: number }
  window: { width: number; height: number }
  pin: number
  copy: Box | null
  count: { text: string; box: Box | null }
  title: Box | null
  text: Box | null
  shot: Box | null
  /** What else the section shows: elements, text, and content drawn before or after an element */
  extras: string[]
}

/** The showcase as the browser draws it: the shown step's parts, the header, the window, and anything else the section
 *  shows besides its title, its subtitle and the shown step's text and screenshot; runs in the page */
function showcaseLayout(): ShowcaseLayout {
  const box = (el: Element | null | undefined): Box | null => {
    const r = el?.getBoundingClientRect()
    return r && r.width > 0 && r.height > 0 ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null
  }
  const drawnEl = (el: Element): boolean => {
    const style = getComputedStyle(el)
    return box(el) !== null && style.visibility === 'visible' && parseFloat(style.opacity) > 0
  }
  const label = (el: Element): string => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`
  const section = document.querySelector('#features')!
  const text = [...section.querySelectorAll('.deck-text')].find(drawnEl)
  const shot = [...section.querySelectorAll('.deck-shot')].find(drawnEl)
  // The section's own parts: its title and subtitle, the shown step's text and screenshot, and the empty blocks that
  // hold them
  const parts = [section.querySelector('.sec-title'), section.querySelector('.sec-sub'), text, shot].filter((el) => el != null)
  const holders = ['.wrap', '.deck', '.deck-pin', '.deck-copy', '.deck-stage', '.deck-turn', '.fs-list']
  const allowed = (el: Element): boolean => parts.some((p) => p.contains(el)) || el === section || holders.some((h) => el.matches(h))
  const extras: string[] = []
  for (const el of [section, ...section.querySelectorAll('*')]) {
    if (!allowed(el) && drawnEl(el)) extras.push(label(el))
    if (!parts.some((p) => p.contains(el)) && box(el)) {
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(el, pseudo).content
        if (content !== 'none' && content !== 'normal') extras.push(`${label(el)}${pseudo} (content ${content})`)
      }
    }
  }
  const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if (!node.textContent?.trim() || !parent || parts.some((p) => p.contains(parent)) || !drawnEl(parent)) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    if (range.getBoundingClientRect().width > 0) extras.push(`the text "${node.textContent.trim()}" in ${label(parent)}`)
  }
  const header = document.querySelector('.site-header')!
  const headerBox = header.getBoundingClientRect()
  return {
    header: { bottom: headerBox.bottom, inner: headerBox.bottom - parseFloat(getComputedStyle(header).borderBottomWidth) },
    window: { width: document.documentElement.clientWidth, height: innerHeight },
    pin: document.querySelector('.deck-pin')!.getBoundingClientRect().top,
    copy: box(section.querySelector('.deck-copy')),
    count: { text: (text?.querySelector('.deck-n')?.textContent ?? '').trim(), box: box(text?.querySelector('.deck-n')) },
    title: box(text?.querySelector('h3')),
    text: box(text?.querySelector('p')),
    shot: box(shot),
    extras
  }
}

/** How the screenshot misses the space under the header and inside the window */
const outside = (shot: Box, layout: ShowcaseLayout): string[] =>
  (
    [
      ['top', layout.header.bottom - shot.top, 'under the header'],
      ['bottom', shot.bottom - layout.window.height, "past the window's bottom"],
      ['left', -shot.left, "past the window's left edge"],
      ['right', shot.right - layout.window.width, "past the window's right edge"]
    ] as [string, number, string][]
  )
    .filter(([, by]) => by > TOLERANCE)
    .map(([edge, by, where]) => `the screenshot's ${edge} edge is ${by.toFixed(1)}px ${where}`)

const twoDigits = (n: number): string => String(n).padStart(2, '0')

const pinnedCases = LOCALES.flatMap((locale) => [760, 900, 1280, 1440].map((width) => ({ locale, width, name: `${locale}/${width}` })))

// landing-page::REQ-004/AC-01
describe('the pinned showcase on a wide window', () => {
  test.for(pinnedCases)('$name: pinned under the header, the count, title and text left of the whole screenshot, nothing else', { timeout: CASE_LIMIT }, async ({ locale, width }, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
      async (page) => {
        const { pinPoint, pinnedTop, turn } = await page.evaluate(measureShowcase)
        const pins: number[] = []
        for (let k = 0; k < STEPS; k++) {
          const step = k + 1
          // Each step at its own turn; the last a little before, since at 5 turns the showcase starts to scroll away
          const turns = Math.min(k, STEPS - 1.1)
          await scrollToY(page, pinPoint + turns * turn)
          await showsStep(page, step, `at ${turns} turns`)
          const layout = await page.evaluate(showcaseLayout)
          pins.push(layout.pin)
          const at = `step ${step}, at ${turns} turns`
          expect.soft(layout.count.text, `${at}: the count`).toBe(`${twoDigits(step)} / ${twoDigits(STEPS)}`)
          const count = layout.count.box
          const { title, text, shot, copy } = layout
          expect([count, title, text, shot, copy].map((b) => b !== null), `${at}: the count, title, text, screenshot and column drawn`).toEqual([true, true, true, true, true])
          const right = [
            ['count', count!],
            ['title', title!],
            ['text', text!]
          ] as [string, Box][]
          const crossing = right.filter(([, b]) => b.right > shot!.left + TOLERANCE).map(([name, b]) => `the ${name} ends ${(b.right - shot!.left).toFixed(1)}px past the screenshot's left edge`)
          expect.soft(crossing, `${at}: the column left of the screenshot`).toEqual([])
          expect.soft(shot!.right - shot!.left, `${at}: the screenshot's width, against the column's (${(copy!.right - copy!.left).toFixed(1)}px)`).toBeGreaterThan(copy!.right - copy!.left)
          expect.soft(outside(shot!, layout), `${at}: the screenshot outside the space under the header`).toEqual([])
          expect.soft(layout.extras, `${at}: what else the section shows`).toEqual([])
          if (k === 0) {
            const under = layout.pin >= layout.header.inner - TOLERANCE && layout.pin <= layout.header.bottom + TOLERANCE
            expect(under, `the pinned part's top (${layout.pin.toFixed(1)}px) against the header's bottom (${layout.header.inner.toFixed(1)}–${layout.header.bottom.toFixed(1)}px)`).toBe(true)
          }
        }
        const moved = pins.flatMap((p, k) => (Math.abs(p - pinnedTop) > TOLERANCE ? [`at step ${k + 1} its top is ${p.toFixed(1)}px, not ${pinnedTop.toFixed(1)}px`] : []))
        expect(moved, 'the pinned part, away from its place under the header').toEqual([])
      }
    )
  })

  // landing-page Failure C3
  test.for(LOCALES)('%s: in a short window the screenshot is smaller and still whole under the header', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    const shotAt = (height: number): Promise<ShowcaseLayout> =>
      visit(
        browser,
        inject('builtSite'),
        { path: PAGE_PATH[locale], width: 1280, height, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
        async (page) => {
          await page.evaluate(measureShowcase)
          await showsStep(page, 1, `at the pin point, ${height}px tall`)
          return page.evaluate(showcaseLayout)
        }
      )
    const [tall, short] = [await shotAt(800), await shotAt(500)]
    expect(tall.shot && short.shot, 'the screenshot drawn in both windows').toBeTruthy()
    expect(short.shot!.bottom - short.shot!.top, `the screenshot's height 500px tall, against 800px tall (${(tall.shot!.bottom - tall.shot!.top).toFixed(1)}px)`).toBeLessThan(tall.shot!.bottom - tall.shot!.top)
    expect(outside(short.shot!, short), 'the screenshot outside the space under the header, 500px tall').toEqual([])
  })
})

interface Part {
  kind: 'text' | 'shot'
  step: number
  visible: boolean
  opacity: number
  box: Box
}

/**
 * Scrolls to `y` and records the showcase's texts and screenshots at every frame until the step has turned and every
 * transition has ended; gives up after `limit` ms. Runs in the page
 */
function recordTurn([y, limit]: [number, number]): Promise<Part[][]> {
  const parts = [...document.querySelectorAll('.deck-text'), ...document.querySelectorAll('.deck-shot')]
  const sample = (): Part[] =>
    parts.map((el) => {
      const style = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const kind = el.classList.contains('deck-text') ? 'text' : 'shot'
      return {
        kind,
        step: [...document.querySelectorAll(kind === 'text' ? '.deck-text' : '.deck-shot')].indexOf(el) + 1,
        visible: style.visibility === 'visible',
        opacity: parseFloat(style.opacity),
        box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }
    })
  const before = sample().filter((p) => p.visible).map((p) => `${p.kind}${p.step}`).join()
  return new Promise((resolve, reject) => {
    const frames: Part[][] = []
    const started = performance.now()
    const tick = (): void => {
      const now = sample()
      frames.push(now)
      const turned = now.filter((p) => p.visible && p.opacity > 0).map((p) => `${p.kind}${p.step}`).join() !== before
      if (turned && document.getAnimations().length === 0) return resolve(frames)
      if (performance.now() - started > limit) {
        return reject(new Error(`the step had ${turned ? 'turned, but its transitions had not ended' : 'not turned'} ${limit}ms after the scroll`))
      }
      requestAnimationFrame(tick)
    }
    scrollTo({ top: Math.ceil(y), behavior: 'instant' })
    requestAnimationFrame(tick)
  })
}

// landing-page::REQ-004/AC-05
describe('a step turns in place', () => {
  test.for(LOCALES)('%s: its text and screenshot cross-fade together, nothing moves, every text starts on one line', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 1280, colorScheme: 'light', reads: READS },
      async (page) => {
        const { pinPoint, turn } = await page.evaluate(measureShowcase)
        await showsStep(page, 1, 'at the pin point')
        const textTops = new Map<number, number>()
        for (let k = 1; k < STEPS; k++) {
          const turning = `turning from step ${k} to step ${k + 1}`
          const recorded = await page.evaluate(recordTurn, [pinPoint + Math.min(k, STEPS - 1.1) * turn, SETTLE] as [number, number])
          expect(recorded.length, `${turning}: frames recorded`).toBeGreaterThan(0)
          const moved = new Set<string>()
          let crossFade = { text: false, shot: false }
          const apart = new Set<string>()
          for (const frame of recorded) {
            const shown = frame.filter((p) => p.visible && p.opacity > 0)
            // In place: every shown text starts where the others do, and every shown screenshot covers the same box
            for (const kind of ['text', 'shot'] as const) {
              const of = shown.filter((p) => p.kind === kind)
              const [first] = of
              for (const p of of) {
                const off = kind === 'text' ? [p.box.top - first.box.top, p.box.left - first.box.left] : [p.box.top - first.box.top, p.box.left - first.box.left, p.box.bottom - first.box.bottom, p.box.right - first.box.right]
                if (off.some((d) => Math.abs(d) > TOLERANCE)) moved.add(`step ${p.step}'s ${kind} is not where step ${first.step}'s is`)
              }
              const fading = of.filter((p) => p.opacity < 1)
              if (fading.some((p) => p.step === k) && fading.some((p) => p.step === k + 1)) crossFade = { ...crossFade, [kind]: true }
            }
            // Together: a step's text and screenshot at one opacity in every frame
            for (const text of frame.filter((p) => p.kind === 'text')) {
              const shot = frame.find((p) => p.kind === 'shot' && p.step === text.step)!
              if (Math.abs(text.opacity - shot.opacity) > 0.05 || text.visible !== shot.visible) {
                apart.add(`step ${text.step}'s text at ${text.opacity.toFixed(2)}${text.visible ? '' : ' (hidden)'}, its screenshot at ${shot.opacity.toFixed(2)}${shot.visible ? '' : ' (hidden)'}`)
              }
            }
            for (const p of shown) {
              if (p.kind === 'text') {
                const top = textTops.get(p.step)
                if (top === undefined) textTops.set(p.step, p.box.top)
                else if (Math.abs(top - p.box.top) > TOLERANCE) moved.add(`step ${p.step}'s text moved from ${top.toFixed(1)}px to ${p.box.top.toFixed(1)}px`)
              }
            }
          }
          expect.soft([...moved], `${turning}: what moves`).toEqual([])
          expect.soft([...apart], `${turning}: text and screenshot apart`).toEqual([])
          expect.soft(crossFade, `${turning}: both steps' text, and both steps' screenshots, part-faded in one frame`).toEqual({ text: true, shot: true })
        }
        const tops = [...textTops.values()]
        expect(tops.length, 'steps whose text was seen').toBe(STEPS)
        expect(tops.map((t) => (t - tops[0]).toFixed(1)), "each step's text top, from the first step's").toEqual(tops.map(() => '0.0'))
      }
    )
  })

  test.for(LOCALES)('%s: under reduced motion the next step shows at once, with no transition', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 1280, colorScheme: 'light', reads: READS, reducedMotion: 'reduce' },
      async (page) => {
        const { pinPoint, turn } = await page.evaluate(measureShowcase)
        await showsStep(page, 1, 'at the pin point')
        for (let k = 1; k < STEPS; k++) {
          // Read in the same task as the switch, before the browser draws a frame
          const state = await page.evaluate(
            ([y, limit]) =>
              new Promise<string[]>((resolve, reject) => {
                const parts = [...document.querySelectorAll('.deck-text'), ...document.querySelectorAll('.deck-shot')]
                const observer = new MutationObserver(() => {
                  observer.disconnect()
                  clearTimeout(timer)
                  resolve(
                    parts.map((el) => {
                      const style = getComputedStyle(el)
                      const kind = el.classList.contains('deck-text') ? 'text' : 'screenshot'
                      const step = [...document.querySelectorAll(kind === 'text' ? '.deck-text' : '.deck-shot')].indexOf(el) + 1
                      return `${kind} ${step}: ${style.visibility}, opacity ${style.opacity}${el.getAnimations().length > 0 ? ', in transition' : ''}`
                    })
                  )
                })
                const timer = setTimeout(() => {
                  observer.disconnect()
                  reject(new Error(`the step did not switch within ${limit}ms of the scroll`))
                }, limit)
                observer.observe(document.querySelector('.deck')!, { subtree: true, attributes: true, attributeFilter: ['class'] })
                scrollTo({ top: Math.ceil(y), behavior: 'instant' })
              }),
            [pinPoint + Math.min(k, STEPS - 1.1) * turn, SETTLE] as [number, number]
          )
          const want = ['text', 'screenshot'].flatMap((kind) =>
            Array.from({ length: STEPS }, (_, i) => `${kind} ${i + 1}: ${i === k ? 'visible, opacity 1' : 'hidden, opacity 0'}`)
          )
          expect.soft(state, `at the switch from step ${k} to step ${k + 1}`).toEqual(want)
        }
      }
    )
  })

  // landing-page Failure C6
  test.for(LOCALES)('%s: the pointer and assistive technology meet the current step only', { timeout: CASE_LIMIT }, async (locale, { expect }) => {
    await visit(
      browser,
      inject('builtSite'),
      { path: PAGE_PATH[locale], width: 1280, colorScheme: 'light', reads: READS },
      async (page) => {
        const { pinPoint, turn } = await page.evaluate(measureShowcase)
        const content = await page.evaluate(() =>
          [...document.querySelectorAll('.deck-text')].map((text, i) => ({
            title: (text.querySelector('h3')?.textContent ?? '').trim(),
            body: (text.querySelector('p')?.textContent ?? '').trim(),
            alt: document.querySelectorAll('.deck-shot img')[i]?.getAttribute('alt') ?? ''
          }))
        )
        expect(content.length, 'steps').toBe(STEPS)
        const cdp = await page.context().newCDPSession(page)
        for (let k = 0; k < STEPS; k++) {
          const step = k + 1
          await scrollToY(page, pinPoint + Math.min(k, STEPS - 1.1) * turn)
          // Without reduced motion the step before fades out first; this waits until it has
          await showsStep(page, step, `at step ${step}`)
          const hits = await page.evaluate((n) => {
            const text = document.querySelectorAll('.deck-text')[n - 1]
            const shot = document.querySelectorAll('.deck-shot')[n - 1]
            const at = (el: Element): string => {
              const r = el.getBoundingClientRect()
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
              if (hit && el.contains(hit)) return 'its own'
              const other = hit?.closest('.deck-text, .deck-shot')
              const of = other ? [...document.querySelectorAll(other.matches('.deck-text') ? '.deck-text' : '.deck-shot')].indexOf(other) + 1 : 0
              return `${hit ? hit.tagName.toLowerCase() : 'nothing'}${of > 0 ? ` in step ${of}` : ''}`
            }
            return { text: at(text), shot: at(shot) }
          }, step)
          expect.soft(hits, `step ${step}: what the pointer meets at the centre of the text and of the screenshot`).toEqual({ text: 'its own', shot: 'its own' })

          // What assistive technology reads in the section: the names of the nodes it does not ignore
          const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
          const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#features' })
          const { node } = await cdp.send('DOM.describeNode', { nodeId })
          const { nodes } = await cdp.send('Accessibility.getFullAXTree')
          const byId = new Map(nodes.map((n) => [n.nodeId, n]))
          const queue = nodes.filter((n) => n.backendDOMNodeId === node.backendNodeId)
          expect(queue.length, "the section's node in the accessibility tree").toBe(1)
          const names = new Set<string>()
          while (queue.length > 0) {
            const n = queue.shift()!
            if (!n.ignored && typeof n.name?.value === 'string') names.add(n.name.value.trim())
            for (const id of n.childIds ?? []) {
              const child = byId.get(id)
              if (child) queue.push(child)
            }
          }
          const read = content.map(({ title, body, alt }) => [title, body, alt].map((name) => names.has(name)))
          expect.soft(read, `step ${step}: which steps' title, text and screenshot assistive technology reads`).toEqual(content.map((_, i) => (i === k ? [true, true, true] : [false, false, false])))
        }
      }
    )
  })
})
