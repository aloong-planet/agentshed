// The page's colours in a browser, in each language (landing-page::REQ-006, Failure D1): what the page paints itself
// with in the light and the dark appearance, the page recolouring when the system appearance changes, the screenshots
// staying light, and the GitHub button beside Download. That the stylesheet's tokens are the app's is the palette
// test's (palette.test.ts); here the page must paint with them as the stylesheet declares them for the appearance the
// browser has: every colour of its text, grounds and drawn borders one token's value, the same token in both
// appearances, and the parts listed in ROLES their role's token.
//
// Not checked here: that the screenshots were taken in the light appearance, a fact of the files as retaken from the
// app rather than of the page. Nor is the showcase's screenshot drawn the same in both appearances: the showcase turns its
// steps as the page scrolls, so its screenshots are compared by source and filter, and by what is drawn only where
// the steps are stacked, below 760px. Nor are shadows (--shadow, --icon-shadow), which are not single colours, or the
// colours of parts only other download states put on the page, the GitHub button beside Download aside. A part added
// to the stylesheet later is held to the palette by the every-colour case, but to its role only once ROLES lists it.
import { afterAll, beforeAll, describe, inject, test, vi } from 'vitest'
import { LOCALES, PAGE_PATH, ui, type Locale } from '../src/i18n/ui'
import { FEATURE_SHOTS } from '../src/shots'
import { launch, ORIGIN, visit, type Answer, type Browser, type Page, type Visit } from './support/browser'
import { palette } from './support/palette'
import { COUNT_URL, POINTER, POINTER_URL, RELEASES_API, statistics } from './support/stand-ins'

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

const SCHEMES = ['light', 'dark'] as const
type Scheme = (typeof SCHEMES)[number]

/** The tokens as the stylesheet declares them: the light appearance's, and the dark one's */
const DECLARED = palette(new URL('../src/styles/global.css', import.meta.url))
/** A token's value in an appearance; the colour tokens are all written as six-digit hex */
function declared(token: string, scheme: Scheme): string {
  const value = DECLARED[scheme].get(token)
  if (!value || !/^#[0-9a-f]{6}$/.test(value)) throw new Error(`the stylesheet's ${scheme} ${token} is ${value}, not a six-digit hex colour`)
  return value
}

/** A computed colour as hex, the form the stylesheet writes; any other form is given as it is, to show in the failure */
function hex(computed: string): string {
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(computed)
  return rgb ? `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : computed
}

// The page in the list state, its every read answered: no state's own colours come into these cases
const open = (locale: Locale, colorScheme: Scheme): Visit => ({
  path: PAGE_PATH[locale],
  width: 1280,
  colorScheme,
  reads: { [POINTER_URL]: 'fail', [RELEASES_API]: 'fail', [COUNT_URL]: [200, statistics(3, 3, 0)] }
})

// A wait that cannot end gives up well inside the case's own limit, because the run's timeout names nothing
const LANDING = 5_000
const WAIT = 2_000
const CASE_LIMIT = LANDING + WAIT * 2 + 10_000

/** The computed value of each property on every element a selector finds, in the page's order; runs in the page */
function computed(asked: { selector: string; properties: string[] }[]): string[][][] {
  return asked.map(({ selector, properties }) =>
    [...document.querySelectorAll(selector)].map((el) => {
      const style = getComputedStyle(el)
      return properties.map((property) => style.getPropertyValue(property))
    })
  )
}

const BORDER = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']
/** The parts the palette names by role, one or more of each: every element the selector finds has each property in
 * the token's colour */
const ROLES: { selector: string; properties: string[]; token: string }[] = [
  // The ground, the alternate sections and the cards on them
  { selector: 'body', properties: ['background-color'], token: '--bg' },
  { selector: '.section.soft', properties: ['background-color'], token: '--bg-soft' },
  { selector: '.dl', properties: ['background-color'], token: '--card' },
  { selector: '.step', properties: ['background-color'], token: '--card' },
  // Text, and the secondary text
  { selector: 'body', properties: ['color'], token: '--text' },
  { selector: '.hero h1', properties: ['color'], token: '--text' },
  { selector: '.sec-title', properties: ['color'], token: '--text' },
  { selector: '.hero .lede', properties: ['color'], token: '--text-2' },
  { selector: '.sec-sub', properties: ['color'], token: '--text-2' },
  { selector: '.step p', properties: ['color'], token: '--text-2' },
  { selector: '.nav-links', properties: ['color'], token: '--text-2' },
  { selector: '.site-footer', properties: ['color'], token: '--text-2' },
  // The lines
  { selector: '.site-header', properties: ['border-bottom-color'], token: '--line' },
  { selector: '.dl', properties: BORDER, token: '--line' },
  { selector: '.step', properties: BORDER, token: '--line' },
  { selector: '.site-footer', properties: ['border-top-color'], token: '--line' },
  { selector: '.shot', properties: BORDER, token: '--line-strong' },
  // The accent
  { selector: '.btn-primary', properties: ['background-color'], token: '--accent' },
  { selector: '.btn-primary', properties: ['color'], token: '--card' },
  { selector: '.step .n', properties: ['color'], token: '--accent' },
  { selector: '.lang a.on', properties: ['color'], token: '--accent' },
  { selector: '.step .n', properties: ['background-color'], token: '--accent-soft' },
  { selector: '.lang a.on', properties: ['background-color'], token: '--accent-soft' }
]

/** The colour tokens, those the stylesheet writes as six-digit hex in the light appearance */
const COLOUR_TOKENS = [...DECLARED.light].flatMap(([token, value]) => (/^#[0-9a-f]{6}$/.test(value) ? [token] : []))
/** Each colour token's light and dark values, as `light>dark`: what a colour drawn with a token is in the two appearances */
const PAIRS = new Map(COLOUR_TOKENS.map((token) => [`${declared(token, 'light')}>${declared(token, 'dark')}`, token]))

interface Painted {
  /** The element, as its tag, classes and place among the body's elements, and its ::before or ::after */
  part: string
  property: string
  /** The computed value */
  value: string
}
/** Every colour each element of the body paints itself with: its text, its ground and the colours of a gradient
 * ground, and each border side it draws; its ::before and ::after where they are drawn too; runs in the page */
function painted(): Painted[] {
  const found: Painted[] = []
  for (const [n, el] of [document.body, ...document.body.querySelectorAll('*')].entries()) {
    const name = `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} #${n}`
    for (const pseudo of [null, '::before', '::after']) {
      const style = getComputedStyle(el, pseudo)
      if (pseudo && (style.content === 'none' || style.content === 'normal')) continue
      const part = name + (pseudo ?? '')
      const read = (property: string, value: string) => found.push({ part, property, value })
      read('color', style.color)
      read('background-color', style.backgroundColor)
      for (const stop of style.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g) ?? []) read('background-image', stop)
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const drawn = style.getPropertyValue(`border-${side}-style`) !== 'none' && parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0
        if (drawn) read(`border-${side}-color`, style.getPropertyValue(`border-${side}-color`))
      }
    }
  }
  return found
}

type Colour = { hex: string; alpha: number } | 'nothing' | { unread: string }
/** A computed colour as six-digit hex and its alpha; nothing where it is fully transparent; any other form unread */
function colour(computed: string): Colour {
  const rgb = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(computed)
  const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(computed)
  const match = rgb ?? srgb
  if (!match) return { unread: computed }
  const alpha = Number(match[4] ?? 1)
  if (alpha === 0) return 'nothing'
  const channels = match.slice(1, 4).map((c) => (rgb ? Number(c) : Math.round(Number(c) * 255)))
  return { hex: `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`, alpha }
}
const said = (c: Colour) => (c === 'nothing' ? c : 'unread' in c ? c.unread : c.alpha === 1 ? c.hex : `${c.hex} at ${c.alpha}`)

// landing-page::REQ-006 (the app's palette, in light and dark, following the system appearance), Failure D1 (light and
// dark both carry the palette)
describe('the page paints with the palette as the stylesheet declares it for the system appearance', () => {
  test('every colour token is declared apart in the two appearances, so that no colour written once passes for one', ({ expect }) => {
    expect(COLOUR_TOKENS, "the colour tokens, the roles' among them").toEqual(expect.arrayContaining([...new Set(ROLES.map((r) => r.token))]))
    const same = COLOUR_TOKENS.filter((token) => declared(token, 'light') === declared(token, 'dark'))
    expect(same, 'tokens with one value in both appearances').toEqual([])
  })

  // Read in two visits, one in each appearance, so that no transition is caught half way
  test.for(LOCALES.map((locale) => ({ name: locale, locale })))('every colour on the page, light and dark: $name', { timeout: CASE_LIMIT }, async ({ locale }, { expect }) => {
    const [light, dark] = await Promise.all(SCHEMES.map((colorScheme) => visit(browser, inject('builtSite'), open(locale, colorScheme), (page) => page.evaluate(painted))))
    const where = (p: Painted) => `${p.part} ${p.property}`
    expect(dark.map(where), 'the parts and what they paint, dark against light').toEqual(light.map(where))
    // One line for each pair of colours outside the palette, naming the first parts that paint it
    const outside = new Map<string, string[]>()
    let tokens = 0
    for (const [i, p] of light.entries()) {
      const [l, d] = [colour(p.value), colour(dark[i].value)]
      if (l === 'nothing' && d === 'nothing') continue
      const token = l !== 'nothing' && d !== 'nothing' && 'hex' in l && 'hex' in d && l.alpha === d.alpha && PAIRS.get(`${l.hex}>${d.hex}`)
      if (token) {
        tokens++
        continue
      }
      const pair = `light ${said(l)}, dark ${said(d)}`
      outside.set(pair, [...(outside.get(pair) ?? []), where(p)])
    }
    expect(tokens, 'colours painted with a token').toBeGreaterThan(0)
    const wrong = [...outside].map(([pair, parts]) => `${pair}: ${parts.slice(0, 3).join('; ')}${parts.length > 3 ? ` and ${parts.length - 3} more` : ''}`)
    expect(wrong, "colours that are no token's in both appearances").toEqual([])
  })

  const cases = LOCALES.flatMap((locale) => SCHEMES.map((colorScheme) => ({ name: `${locale}/${colorScheme}`, locale, colorScheme })))
  test.for(cases)('the parts by role: $name', { timeout: CASE_LIMIT }, async ({ locale, colorScheme }, { expect }) => {
    const found = await visit(browser, inject('builtSite'), open(locale, colorScheme), (page) => page.evaluate(computed, ROLES))
    const wrong = ROLES.flatMap(({ selector, properties, token }, i) => {
      const elements = found[i]
      if (elements.length === 0) return [`the page has no ${selector}`]
      const expected = declared(token, colorScheme)
      return elements.flatMap((values, n) =>
        values.flatMap((value, p) =>
          hex(value) === expected ? [] : [`${selector} #${n + 1} ${properties[p]} is ${hex(value)}, not ${token} ${expected}`]
        )
      )
    })
    expect(wrong, `in the ${colorScheme} appearance`).toEqual([])
  })
})

/** What the page shows once it has drawn two frames: its ground's and its text's computed colour, and whether this is
 * still the window the case marked, with no navigation started from it; runs in the page */
async function look(): Promise<{ ground: string[]; mark: boolean; navigated: boolean }> {
  await new Promise((frame) => requestAnimationFrame(frame))
  await new Promise((frame) => requestAnimationFrame(frame))
  const { backgroundColor, color } = getComputedStyle(document.body)
  const { appearanceMark, navigated } = window as { appearanceMark?: boolean; navigated?: boolean }
  return { ground: [backgroundColor, color], mark: appearanceMark === true, navigated: navigated === true }
}

// Failure D1 (switching the system appearance recolours the page), landing-page::REQ-006 (following the visitor's system
// appearance)
describe('switching the system appearance recolours the open page, which does not load again', () => {
  const cases = LOCALES.flatMap((locale) =>
    SCHEMES.map((from) => ({ locale, from, to: from === 'light' ? ('dark' as const) : ('light' as const) })).map((c) => ({ name: `${locale}/${c.from}-to-${c.to}`, ...c }))
  )
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, from, to }, { expect }) => {
    const requests: string[] = []
    const seen = await visit(browser, inject('builtSite'), { ...open(locale, from), requests }, async (page) => {
      // A load of the page drops this window's mark; one the page has only started fires its navigate event here, at once
      await page.evaluate(() => {
        Object.assign(window, { appearanceMark: true, navigated: false })
        // The Navigation API, which the DOM types the lint reads do not declare
        const { navigation } = window as unknown as { navigation: EventTarget }
        navigation.addEventListener('navigate', () => Object.assign(window, { navigated: true }))
      })
      const before = await page.evaluate(look)
      await page.emulateMedia({ colorScheme: to })
      // A page that loads again can lose the window while this reads it: the reason it gives is what the case shows
      const after = await page.evaluate(look).catch((error: unknown) => ({ lost: String(error) }))
      return { before, after }
    })
    expect(seen.after, 'once switched: the page as opened, with no navigation started').toMatchObject({ mark: true, navigated: false })
    expect(requests.filter((url) => url === ORIGIN + PAGE_PATH[locale]), "the page's own document, requested").toHaveLength(1)
    expect(seen.before.ground.map(hex), `the ground and the text in the ${from} appearance`).toEqual([declared('--bg', from), declared('--text', from)])
    const after = 'ground' in seen.after ? seen.after.ground.map(hex) : []
    expect(after, `the ground and the text once switched to ${to}`).toEqual([declared('--bg', to), declared('--text', to)])
  })
})

/** The features section's screenshots; those shown at a width are the showcase's, or the stacked steps' below 760px */
const SHOTS = '#features .shot img'
// A drawn screenshot is compared inside this margin: its frame's rounded corners let the ground show through
const INSET = 16

interface Shots {
  /** Each screenshot's source as loaded */
  sources: string[]
  /** Each filter on a screenshot or on what holds it, other than none */
  filters: string[]
  /** Each screenshot as drawn in the window, inside INSET; taken where the steps are stacked */
  pictures: Buffer[]
}
/** Every screenshot shown, each scrolled into the window's middle and loaded (the stacked steps' load lazily) */
async function shots(page: Page, pictures: boolean): Promise<Shots> {
  const count = await page.evaluate((shots) => [...document.querySelectorAll(shots)].filter((img) => img.checkVisibility()).length, SHOTS)
  const seen: Shots = { sources: [], filters: [], pictures: [] }
  for (let i = 0; i < count; i++) {
    const shot = await page.evaluate(
      async ([shots, i, inset]) => {
        const img = [...document.querySelectorAll<HTMLImageElement>(shots)].filter((img) => img.checkVisibility())[i]
        img.scrollIntoView({ block: 'center', behavior: 'instant' })
        await img.decode()
        const filters: string[] = []
        for (let el: Element | null = img; el; el = el.parentElement) {
          const { filter } = getComputedStyle(el)
          if (filter !== 'none') filters.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}: ${filter}`)
        }
        const { left, top, width, height } = img.getBoundingClientRect()
        return { source: img.currentSrc, filters, clip: { x: left + inset, y: top + inset, width: width - 2 * inset, height: height - 2 * inset } }
      },
      [SHOTS, i, INSET] as const
    )
    seen.sources.push(shot.source)
    seen.filters.push(...shot.filters)
    if (pictures) seen.pictures.push(await page.screenshot({ clip: shot.clip }))
  }
  return seen
}

// Failure D1 (screenshots taken in the light appearance stay light in both)
describe('in the dark appearance the screenshots are the light ones, as the light appearance shows them', () => {
  const WHERE = [
    { where: 'showcase', width: 1280, pictures: false },
    { where: 'stacked', width: 400, pictures: true }
  ]
  const cases = LOCALES.flatMap((locale) => WHERE.map((w) => ({ name: `${locale}/${w.where}`, locale, ...w })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, width, pictures }, { expect }) => {
    const [light, dark] = await Promise.all(
      SCHEMES.map((colorScheme) => visit(browser, inject('builtSite'), { ...open(locale, colorScheme), width }, (page) => shots(page, pictures)))
    )
    expect(light.sources, 'the screenshots in the light appearance').toHaveLength(FEATURE_SHOTS.length)
    expect(dark.sources, 'the screenshots in the dark appearance').toEqual(light.sources)
    expect([...light.filters, ...dark.filters], 'filters over the screenshots').toEqual([])
    const drawn = light.pictures.flatMap((picture, i) => (picture.equals(dark.pictures[i]) ? [] : [`${light.sources[i]} is drawn otherwise in dark`]))
    expect(dark.pictures, 'the screenshots as drawn').toHaveLength(pictures ? FEATURE_SHOTS.length : 0)
    expect(drawn, 'the screenshots as drawn, dark against light').toEqual([])
  })
})

// The download row once the pointer's release has landed: Download, and GitHub beside it
const ROW = '#download .dl-actions'
const RELEASED: Record<string, Answer> = { [POINTER_URL]: [200, POINTER], [COUNT_URL]: [200, statistics(3, 3, 0)] }

/** An element's ground and its border's top, right, bottom and left colours; runs in the page */
function paint(el: Element): string[] {
  const style = getComputedStyle(el)
  return ['background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'].map((p) => style.getPropertyValue(p))
}

// landing-page::REQ-006 (The palette: the GitHub button beside Download is a secondary button, the card ground with the
// strong line, and the accent border on the soft accent ground on hover)
describe('the GitHub button beside Download has the card ground and the strong line, and on hover the accent border on the soft accent ground', () => {
  const cases = LOCALES.flatMap((locale) => SCHEMES.map((colorScheme) => ({ name: `${locale}/${colorScheme}`, locale, colorScheme })))
  test.for(cases)('$name', { timeout: CASE_LIMIT }, async ({ locale, colorScheme }, { expect }) => {
    const { download, github } = ui[locale].download.formal
    const sides = (token: string) => Array<string>(4).fill(declared(token, colorScheme))
    await visit(browser, inject('builtSite'), { ...open(locale, colorScheme), reads: RELEASED }, async (page) => {
      const labels = JSON.stringify([download, github])
      await vi.waitFor(
        async () => {
          const now = JSON.stringify(await page.$$eval(`${ROW} a`, (row) => row.map((a) => (a.textContent ?? '').trim())))
          if (now !== labels) throw new Error(`The release never landed: the download row shows ${now}, not ${labels}`)
        },
        { timeout: LANDING, interval: 50 }
      )
      const button = page.locator(ROW).getByRole('link', { name: github, exact: true })
      const atRest = (await button.evaluate(paint)).map(hex)
      expect(atRest, 'at rest: its ground, then its border').toEqual([declared('--card', colorScheme), ...sides('--line-strong')])
      await button.hover({ timeout: WAIT })
      expect(await button.evaluate((el) => el.matches(':hover')), 'the pointer on the button').toBe(true)
      // Polled, so that a fade added to the button later does not fail a page that gets there
      await expect
        .poll(async () => (await button.evaluate(paint)).map(hex), { timeout: WAIT, interval: 50, message: 'on hover: its ground, then its border' })
        .toEqual([declared('--accent-soft', colorScheme), ...sides('--accent')])
    })
  })
})
