// The walkthrough's activation on fresh built HTML: in jsdom, the player that replaces the poster, its address and
// focus, and a modified click left alone; in a browser (the cases after it), what the page asks for before
// activation, as it loads and with the poster pointed at and focused, and the frame's geometry and focus after a click
// or Enter and through a resize. YouTube is never reached: a stand-in answers the player's address, so YouTube's own
// playback is not checked here.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest'
import { LOCALES, PAGE_PATH, ui, type Locale } from '../src/i18n/ui'
import { initHeroVideo } from '../src/scripts/hero-video'
import { launch, ORIGIN, visit, type Answer, type Browser, type Visit } from './support/browser'
import { COUNT_URL, POINTER_URL, RELEASES_API, statistics } from './support/stand-ins'

const outDir = inject('builtSite')

test.each(['en', 'zh'] as const)('%s: the walkthrough loads only when its poster is activated', (locale) => {
  const dom = new JSDOM(readFileSync(join(outDir, locale === 'en' ? 'index.html' : 'zh/index.html'), 'utf8'))
  const doc = dom.window.document
  initHeroVideo(doc)
  expect(doc.querySelector('iframe')).toBeNull()
  const play = doc.querySelector<HTMLAnchorElement>('.hero-video-play')
  const videoId = locale === 'zh' ? 'TpCgkGiVqlk' : 'lQ-Bg8nXJKM'
  expect(play).not.toBeNull()
  const modified = new dom.window.MouseEvent('click', { ctrlKey: true, cancelable: true })
  // Prevent JSDOM from attempting navigation, after observing whether our handler allowed it.
  let intercepted = true
  play!.addEventListener('click', (event) => { intercepted = event.defaultPrevented; event.preventDefault() }, { once: true })
  play!.dispatchEvent(modified)
  expect(intercepted).toBe(false)
  expect(doc.querySelector('iframe')).toBeNull()
  play!.click()
  const frames = doc.querySelectorAll('iframe')
  expect(frames).toHaveLength(1)
  expect(frames[0].src).toBe(`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`)
  expect(frames[0].title).toBe(ui[locale].hero.videoLabel)
  expect(frames[0].allow).toContain('autoplay')
  expect(frames[0].allowFullscreen).toBe(true)
  expect(frames[0].referrerPolicy).toBe('strict-origin-when-cross-origin')
  expect(doc.activeElement).toBe(frames[0])
  expect(doc.querySelector('.hero-video-play')).toBeNull()
  expect(doc.querySelector('.hero-video-fallback')?.getAttribute('href')).toBe(`https://www.youtube.com/watch?v=${videoId}`)
  dom.window.close()
})

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

const VIDEO_ID: Record<Locale, string> = { en: 'lQ-Bg8nXJKM', zh: 'TpCgkGiVqlk' }
const player = (locale: Locale): string => `https://www.youtube-nocookie.com/embed/${VIDEO_ID[locale]}?autoplay=1&playsinline=1&rel=0`
// The page in the list state, its reads answered, and the player's address answered by a stand-in: a request to it is
// then recorded rather than refused, so a case's own checks see it
const open = (locale: Locale, width: number): Visit => ({
  path: PAGE_PATH[locale],
  width,
  colorScheme: 'light',
  reads: {
    [POINTER_URL]: 'fail',
    [RELEASES_API]: 'fail',
    [COUNT_URL]: [200, statistics(3, 3, 0)],
    [player(locale)]: [200, '<!doctype html><title>player</title>'] satisfies Answer
  }
})
// A wait inside a case gives up well inside the case's own limit, because the run's timeout names nothing
const WAIT = 5_000
const CASE_LIMIT = WAIT * 2 + 10_000
// Subpixel layout: an edge this close counts as on the line
const TOLERANCE = 0.5
/** YouTube's hosts: its sites, the privacy-enhanced player's, its thumbnails', its video stream's and its images' */
const YOUTUBE = ['youtube.com', 'youtube-nocookie.com', 'youtu.be', 'ytimg.com', 'googlevideo.com', 'ggpht.com']
const atYouTube = (url: string): boolean => {
  const host = new URL(url).hostname
  return YOUTUBE.some((h) => host === h || host.endsWith(`.${h}`))
}

// landing-page::REQ-009/AC-02, landing-page Failure F1
describe('before the walkthrough is activated, the page asks YouTube for nothing and points nothing at it', () => {
  /** The page's elements that load from a YouTube host: a link (preconnect and its kind included), a script, a frame or
   *  an image; runs in the page */
  function pointedAtYouTube(hosts: string[]): string[] {
    const at = (url: string): boolean => {
      try {
        const host = new URL(url, location.href).hostname
        return hosts.some((h) => host === h || host.endsWith(`.${h}`))
      } catch {
        return false
      }
    }
    const urls = (el: Element): string[] => [
      ...['href', 'src'].map((name) => el.getAttribute(name) ?? '').filter(Boolean),
      ...(el.getAttribute('srcset') ?? '').split(',').map((part) => part.trim().split(/\s+/)[0] ?? '').filter(Boolean)
    ]
    return [...document.querySelectorAll('link, script, iframe, img')].flatMap((el) =>
      urls(el).filter(at).map((url) => `<${el.tagName.toLowerCase()}${el.getAttribute('rel') ? ` rel="${el.getAttribute('rel')}"` : ''}> ${url}`)
    )
  }
  const cases = LOCALES.flatMap((locale) => [400, 1440].map((width) => ({ name: `${locale}/${width}`, locale, width })))
  // A read the case makes itself, last: requests reach the harness in the order the page makes them, so once it is
  // answered, what the page asked for before it is in the log
  const SETTLED = 'https://stand-in.invalid/settled.json'
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width }, { expect }) => {
    const requests: string[] = []
    const visiting = open(locale, width)
    const reads = { ...visiting.reads, [SETTLED]: [200, '"settled"'] } as Visit['reads']
    const pointed = await visit(browser, inject('builtSite'), { ...visiting, reads, requests }, async (page) => {
      // Until the page has gone quiet, so that a request it makes late is in the log too
      await page.waitForLoadState('networkidle', { timeout: WAIT })
      const loaded = await page.evaluate(pointedAtYouTube, YOUTUBE)
      // Pointed at, then focused, and not activated: a page can reach out to YouTube on either, ahead of a click
      await page.hover('.hero-video-play', { timeout: WAIT })
      await page.focus('.hero-video-play', { timeout: WAIT })
      await page.evaluate((url) => fetch(url).then((r) => r.json()), SETTLED)
      return { loaded, approached: await page.evaluate(pointedAtYouTube, YOUTUBE) }
    })
    // The page loaded, its poster among what it asked for, so the log has the page's own requests
    expect(requests, 'what the page asked for').toContain(`${ORIGIN}/media/agentshed-intro-poster.jpg`)
    // Each on its own: a preconnect is no request the harness sees, and a request can come from no element
    expect.soft(requests.filter(atYouTube), 'requests to YouTube before activation').toEqual([])
    expect.soft(pointed.loaded, 'elements loading from YouTube once the page has loaded').toEqual([])
    expect.soft(pointed.approached, 'elements loading from YouTube once the poster is pointed at and focused').toEqual([])
  })
})

// landing-page::REQ-009/AC-02, landing-page Failure F2, F5
describe("activated by a click or Enter, the player takes the poster's 16:9 box inside the window, and the focus; a resize keeps it 16:9 inside the window", () => {
  // Each width once by a click and once by Enter, across the two languages
  const cases = LOCALES.flatMap((locale, i) =>
    [400, 900, 1280, 1440].map((width, j) => {
      const by = (i + j) % 2 === 0 ? ('click' as const) : ('Enter' as const)
      return { name: `${locale}/${width}/${by}`, locale, width, by }
    })
  )
  interface Box {
    left: number
    right: number
    top: number
    bottom: number
  }
  /** The frame, the poster and the players in it, in the document's coordinates, and the page's width; runs in the page */
  function frame(): { frame: Box; poster: Box | null; players: Box[]; focused: boolean; scrollWidth: number; clientWidth: number } {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY }
    }
    const holder = document.querySelector('.hero-video-frame')
    if (!holder) throw new Error('the page has no walkthrough frame')
    const players = [...document.querySelectorAll('iframe')]
    const poster = holder.querySelector('.hero-video-play')
    return {
      frame: box(holder),
      poster: poster ? box(poster) : null,
      players: players.map(box),
      focused: players.length > 0 && document.activeElement === players[0],
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }
  }
  const notSixteenNine = (what: string, b: Box): string[] => {
    const width = b.right - b.left
    const height = b.bottom - b.top
    return Math.abs(height - (width * 9) / 16) > TOLERANCE ? [`${what} is ${width.toFixed(1)} x ${height.toFixed(1)}, not 16:9`] : []
  }
  const faults = (look: ReturnType<typeof frame>): string[] => {
    const { frame: f, clientWidth } = look
    return [
      ...notSixteenNine('the frame', f),
      ...look.players.flatMap((p) => notSixteenNine('the player', p)),
      ...(f.left < -TOLERANCE || f.right > clientWidth + TOLERANCE ? [`the frame runs from ${f.left.toFixed(1)} to ${f.right.toFixed(1)}, outside the window's ${clientWidth}px`] : []),
      ...(look.scrollWidth > clientWidth ? [`the page scrolls sideways by ${look.scrollWidth - clientWidth}px`] : [])
    ]
  }
  const differs = (a: Box, b: Box): boolean => (['left', 'right', 'top', 'bottom'] as const).some((k) => Math.abs(a[k] - b[k]) > TOLERANCE)

  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width, by }, { expect }) => {
    // landing-page Failure F5: then the window changes, narrow to wide or wide to narrow
    const resizedTo = width === 400 ? 1280 : 400
    const { before, after, resized } = await visit(browser, inject('builtSite'), open(locale, width), async (page) => {
      const before = await page.evaluate(frame)
      if (by === 'click') await page.click('.hero-video-play', { timeout: WAIT })
      else {
        await page.focus('.hero-video-play', { timeout: WAIT })
        await page.keyboard.press('Enter')
      }
      await page.waitForSelector('.hero-video-frame iframe', { timeout: WAIT })
      const after = await page.evaluate(frame)
      await page.setViewportSize({ width: resizedTo, height: 800 })
      return { before, after, resized: await page.evaluate(frame) }
    })
    expect(faults(before), 'before activation').toEqual([])
    expect(before.poster, 'the poster before activation').not.toBeNull()
    expect(before.players, 'players before activation').toEqual([])
    expect(faults(after), 'after activation').toEqual([])
    expect(after.poster, 'the poster after activation').toBeNull()
    expect(after.players, 'players after activation').toHaveLength(1)
    const [played] = after.players
    expect(played && before.poster && !differs(played, before.poster), `the player in the poster's box: ${JSON.stringify(played)} against ${JSON.stringify(before.poster)}`).toBe(true)
    expect(after.focused, 'the focus on the player').toBe(true)
    expect(resized.players, `players after a resize to ${resizedTo}px`).toHaveLength(1)
    expect(faults(resized), `after a resize to ${resizedTo}px`).toEqual([])
  })
})
