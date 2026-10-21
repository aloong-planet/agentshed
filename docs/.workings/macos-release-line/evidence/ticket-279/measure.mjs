// Browser measurement of the landing page's pinned features section for #279 (landing-page Testing Decisions:
// geometry and computed styles, not pixels). The rows M1–M8 are the test design table's in ticket-279-review-tests.md.
// The download's two reads fail in the browser, so the page stays in the list state and nothing reaches the network:
//
//   pnpm --dir site build && pnpm --dir site exec astro preview --port 4399 --host 127.0.0.1
//   node docs/.workings/macos-release-line/evidence/ticket-279/measure.mjs
//
// Writes results.json and the screenshots beside this file; exits non-zero if any measurement fails. Expected
// colours are the app's (src/renderer/src/theme.css); expected steps are written out per scroll position, in units
// of a turn (60% of the window's height, landing-page::REQ-004/AC-08).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = process.env.SITE_URL ?? 'http://127.0.0.1:4399'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const PATH = { zh: '/', en: '/en/' }
const OTHER = { zh: 'en', en: 'zh' }
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` }
const APP = { light: { text: '#37352f', text2: '#787774' }, dark: { text: '#e6e6e5', text2: '#9b9a97' } }

const results = []
function check(id, what, actual, pass) {
  results.push({ id, what, actual, pass: Boolean(pass) })
  if (!pass) console.log(`FAIL ${id} — ${what}: ${JSON.stringify(actual)}`)
}

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome' })
console.log(`browser: ${browser.version()}`)

async function open(lang, { width = 1280, height = 800, colorScheme = 'light', reducedMotion = 'no-preference', javaScriptEnabled = true, noStorage = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion, javaScriptEnabled })
  if (noStorage) await context.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked') } }) })
  await context.route('https://dl.agentshed.aloongplanet.com/**', (r) => r.abort('failed'))
  await context.route('https://api.github.com/**', (r) => r.abort('failed'))
  const page = await context.newPage()
  await page.goto(BASE + PATH[lang], { waitUntil: 'load' })
  return { context, page }
}

const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)
const settle = async (page) => { await frames(page); await page.waitForTimeout(400); await frames(page) }

/** The showcase's geometry, measured once at the top of the page: where its block starts in the document */
const geometry = (page) => page.evaluate(() => {
  const deck = document.querySelector('.deck')
  return { deckDocTop: deck.getBoundingClientRect().top + scrollY, header: document.querySelector('.site-header').getBoundingClientRect().bottom, innerHeight }
})
/** The scroll position k turns past the point where the showcase pins, by the spec's rule: a turn is 60% of the window */
const at = (g, k) => Math.round(g.deckDocTop - 58 + k * 0.6 * g.innerHeight)

const current = (page) => page.evaluate(() => {
  const texts = [...document.querySelectorAll('.deck-text')]
  const shots = [...document.querySelectorAll('.deck-shot')]
  return { text: texts.findIndex((t) => t.classList.contains('on')), shot: shots.findIndex((s) => s.classList.contains('on')), count: texts.length, shots: shots.length, label: (texts.find((t) => t.classList.contains('on'))?.querySelector('.deck-n')?.textContent ?? '').trim() }
})
const scrollToY = async (page, y) => { await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y); await settle(page) }

for (const lang of ['zh', 'en']) {
  // ── M1: the pinned showcase, at a full and a short window ──
  for (const height of [800, 560]) {
    const { context, page } = await open(lang, { height })
    const g = await geometry(page)
    for (const k of [0, 2.5, 5]) {
      await scrollToY(page, at(g, k))
      const m = await page.evaluate(() => {
        const pin = document.querySelector('.deck-pin')
        const copy = document.querySelector('.deck-copy').getBoundingClientRect()
        const stage = document.querySelector('.deck-stage').getBoundingClientRect()
        const firstLine = document.querySelector('.deck-text.on .deck-n').getBoundingClientRect().top
        return { pinTop: pin.getBoundingClientRect().top, children: [...pin.children].map((c) => c.className), copyW: copy.width, stageW: stage.width, stageTop: stage.top, stageBottom: stage.bottom, firstLine, innerHeight }
      })
      // The pin point is the header's 58px bar; the header's 1px border below it overlaps the showcase's empty top edge
      check(`M1-${lang}-${height}-pinned-${k}`, `at ${k} turns the showcase is pinned at the header`, [m.pinTop, g.header], Math.abs(m.pinTop - 58) < 0.5 && g.header - m.pinTop <= 1)
      check(`M1-${lang}-${height}-children-${k}`, 'the showcase holds the text column and the screenshot stage, nothing else', m.children, JSON.stringify(m.children) === '["deck-copy","deck-stage"]')
      check(`M1-${lang}-${height}-narrow-${k}`, 'the text column is narrower than half the screenshot', [m.copyW, m.stageW], m.copyW < m.stageW / 2)
      check(`M1-${lang}-${height}-whole-${k}`, 'the screenshot and the text are whole below the header', [m.stageTop, m.firstLine, m.stageBottom, g.header, m.innerHeight], m.stageTop >= g.header && m.firstLine >= g.header && m.stageBottom <= m.innerHeight)
    }
    await scrollToY(page, at(g, 2))
    const c = await current(page)
    check(`M1-${lang}-${height}-count`, 'the third step carries "03 / 06"', c, c.count === 6 && c.shots === 6 && c.label === '03 / 06')
    await context.close()
  }

  // ── M2: natural scrolling turns the steps; a jump; the wheel ──
  {
    const { context, page } = await open(lang)
    const g = await geometry(page)
    // [turns past the pin point, the step expected there]
    const positions = [[-1.5, 0], [-0.4, 0], [0, 0], [0.4, 0], [0.6, 1], [1, 1], [1.4, 1], [1.6, 2], [2, 2], [2.4, 2], [2.6, 3], [3, 3], [3.4, 3], [3.6, 4], [4, 4], [4.4, 4], [4.6, 5], [5, 5], [5.4, 5], [6, 5], [8, 5]]
    for (const [k, expected] of positions) {
      await scrollToY(page, at(g, k))
      const c = await current(page)
      check(`M2-${lang}-${k}`, `at ${k} turns the step is ${expected + 1}, text and screenshot together`, c, c.text === expected && c.shot === expected)
    }
    // A jump to the download section, then straight back into the showcase
    await page.evaluate(() => document.getElementById('download').scrollIntoView({ behavior: 'instant' }))
    await settle(page)
    const down = await current(page)
    check(`M2-${lang}-jump-down`, 'past the showcase, the last step', down, down.text === 5)
    await scrollToY(page, at(g, 1))
    const back = await current(page)
    check(`M2-${lang}-jump-back`, 'jumping back to one turn shows the second step, nothing left over', back, back.text === 1 && back.shot === 1)
    // A real wheel over the screenshot moves the page by its delta: nothing captures it
    await scrollToY(page, at(g, 1))
    const box = await page.locator('.deck-stage').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const before = await page.evaluate(() => scrollY)
    await page.mouse.wheel(0, 300)
    await page.waitForFunction((b) => scrollY > b, before, { timeout: 3000 }).catch(() => null)
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => scrollY)
    check(`M2-${lang}-wheel`, 'a 300px wheel over the showcase scrolls the page by 300px', [before, after], Math.abs(after - before - 300) <= 2)
    await context.close()
  }

  // ── M3: a turn cross-fades in place; only the current step is reachable ──
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { context, page } = await open(lang, { reducedMotion })
    const g = await geometry(page)
    const read = () => page.evaluate(() => {
      const on = document.querySelector('.deck-text.on')
      const stage = document.querySelector('.deck-stage').getBoundingClientRect()
      const centre = document.elementFromPoint(stage.left + stage.width / 2, stage.top + stage.height / 2)
      const hidden = [...document.querySelectorAll('.deck-text:not(.on), .deck-shot:not(.on)')].map((e) => getComputedStyle(e).visibility)
      return {
        n: on.querySelector('.deck-n').getBoundingClientRect().top,
        h: on.querySelector('h3').getBoundingClientRect().top,
        stage: [stage.left, stage.top, stage.width, stage.height],
        centreIsCurrent: centre?.closest('.deck-shot')?.classList.contains('on') ?? false,
        hidden,
        transition: [getComputedStyle(on).transitionDuration, getComputedStyle(document.querySelector('.deck-shot.on')).transitionDuration]
      }
    })
    let prev = null
    for (let k = 0; k <= 5; k++) {
      await scrollToY(page, at(g, k))
      const r = await read()
      if (reducedMotion === 'no-preference') {
        if (prev) {
          check(`M3-${lang}-place-${k}`, `turning to step ${k + 1}: the count, the title and the screenshot stay where they were`, [prev, r], Math.abs(r.n - prev.n) < 0.5 && Math.abs(r.h - prev.h) < 0.5 && r.stage.every((v, i) => Math.abs(v - prev.stage[i]) < 0.5))
        }
        check(`M3-${lang}-hidden-${k}`, 'the five other texts and five other screenshots are hidden', r.hidden, r.hidden.length === 10 && r.hidden.every((v) => v === 'hidden'))
        check(`M3-${lang}-pointer-${k}`, 'the pointer at the stage reaches the current screenshot', r.centreIsCurrent, r.centreIsCurrent)
        check(`M3-${lang}-fade-${k}`, 'the text and the screenshot fade over 0.3s', r.transition, r.transition.every((t) => t.split(',')[0].trim() === '0.3s'))
      } else {
        check(`M3-${lang}-reduced-${k}`, 'under reduced motion the switch is instant', r.transition, r.transition.every((t) => t.split(',').every((d) => d.trim() === '0s')))
      }
      prev = r
    }
    await context.close()
  }

  // ── M4: phones get the stacked steps ──
  {
    const { context, page } = await open(lang, { width: 400, height: 800 })
    const m = await page.evaluate(() => {
      const steps = [...document.querySelectorAll('.fs-list .fs-step')]
      const gaps = steps.slice(1).map((s, i) => s.querySelector('.fs-h').getBoundingClientRect().top - steps[i].querySelector('.m-shot').getBoundingClientRect().bottom)
      return { deck: getComputedStyle(document.querySelector('.deck')).display, list: getComputedStyle(document.querySelector('.fs-list')).display, steps: steps.length, shots: steps.map((s) => getComputedStyle(s.querySelector('.m-shot')).display), gaps }
    })
    check(`M4-${lang}-layout`, 'no showcase; six stacked steps, each with its screenshot', m, m.deck === 'none' && m.list === 'flex' && m.steps === 6 && m.shots.every((d) => d === 'flex'))
    check(`M4-${lang}-gaps`, 'at least 44px between a screenshot and the next title', m.gaps, m.gaps.length === 5 && m.gaps.every((g) => g >= 43.5))
    await page.screenshot({ path: join(SHOTS, `phone-features-${lang}.png`), fullPage: true })
    await context.close()
  }

  // ── M5: switching language keeps the step; the control without storage loses it ──
  for (let k = 0; k <= 5; k++) {
    const { context, page } = await open(lang)
    const g = await geometry(page)
    await scrollToY(page, at(g, k) + Math.round(0.1 * 0.6 * g.innerHeight))
    const before = await page.evaluate(() => document.querySelector('.deck').getBoundingClientRect().top)
    await page.click('header .lang a[data-switch-language]')
    await page.waitForURL(BASE + PATH[OTHER[lang]])
    await page.waitForLoadState('load')
    await settle(page)
    const after = await page.evaluate(() => document.querySelector('.deck').getBoundingClientRect().top)
    const c = await current(page)
    check(`M5-${lang}-${k}`, `switching to ${OTHER[lang]} at step ${k + 1} keeps the step and the showcase's place`, { before, after, c }, c.text === k && c.shot === k && Math.abs(after - before) <= 1)
    await context.close()
  }
  {
    const { context, page } = await open(lang, { noStorage: true })
    const g = await geometry(page)
    await scrollToY(page, at(g, 3) + Math.round(0.06 * g.innerHeight))
    await page.click('header .lang a[data-switch-language]')
    await page.waitForURL(BASE + PATH[OTHER[lang]])
    await settle(page)
    const c = await current(page)
    check(`M5-${lang}-control`, 'control: with session storage blocked the place is not kept, so the measurement above can fail', c, c.text !== 3)
    await context.close()
  }

  // ── M6: resizing leaves no stale step ──
  {
    const { context, page } = await open(lang)
    const g = await geometry(page)
    await scrollToY(page, at(g, 3))
    const expectedStep = () => page.evaluate((deckDocTop) => {
      // The spec's rule, written independently of the script: the distance past the pin point over 60% of the window
      const docTop = document.querySelector('.deck').getBoundingClientRect().top + scrollY
      return Math.min(5, Math.max(0, Math.round((scrollY - (docTop - 58)) / (0.6 * innerHeight))))
    }, g.deckDocTop)
    await page.setViewportSize({ width: 700, height: 800 })
    await settle(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await settle(page)
    const c1 = await current(page)
    const e1 = await expectedStep()
    check(`M6-${lang}-narrow-and-back`, 'after 1280 → 700 → 1280 the step is the one the position gives', { c1, e1 }, c1.text === e1 && c1.shot === e1)
    await scrollToY(page, at(g, 3))
    await page.setViewportSize({ width: 1280, height: 600 })
    await settle(page)
    const c2 = await current(page)
    const e2 = await expectedStep()
    check(`M6-${lang}-height`, 'after 800 → 600 tall the step is the one the position gives under the new height', { c2, e2 }, c2.text === e2 && c2.shot === e2 && e2 !== 3)
    await context.close()
  }

  // ── M7: without scripts, the stacked steps at every width ──
  {
    const { context, page } = await open(lang, { javaScriptEnabled: false })
    const deckVisible = await page.locator('.deck').isVisible()
    const listVisible = await page.locator('.fs-list').isVisible()
    const shotsVisible = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => page.locator('.fs-list .fs-step .m-shot').nth(i).isVisible()))
    check(`M7-${lang}`, 'at 1280 without scripts the showcase is hidden and the six stacked steps show with their screenshots', { deckVisible, listVisible, shotsVisible }, !deckVisible && listVisible && shotsVisible.every(Boolean))
    await context.close()
  }

  // ── M8: widths and appearances ──
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [400, 900, 1280, 1440]) {
      const { context, page } = await open(lang, { width, height: 800, colorScheme })
      const m = await page.evaluate(() => {
        const root = document.documentElement
        const lede = document.querySelector('.hero .lede').getBoundingClientRect()
        const wide = getComputedStyle(document.querySelector('.deck')).display !== 'none'
        const h = wide ? document.querySelector('.deck-text.on h3') : document.querySelector('.fs-step .fs-h')
        const p = wide ? document.querySelector('.deck-text.on p') : document.querySelector('.fs-step .fs-p')
        return { scrollW: root.scrollWidth, clientW: root.clientWidth, ledeLeft: lede.left, ledeRight: root.clientWidth - lede.right, h: getComputedStyle(h).color, p: getComputedStyle(p).color, wide }
      })
      check(`M8-${lang}-${colorScheme}-${width}-sideways`, 'no sideways scroll', [m.scrollW, m.clientW], m.scrollW <= m.clientW)
      check(`M8-${lang}-${colorScheme}-${width}-gutters`, 'the hero keeps its side gutters', [m.ledeLeft, m.ledeRight], m.ledeLeft >= 24 && m.ledeRight >= 24)
      check(`M8-${lang}-${colorScheme}-${width}-colours`, 'the steps’ title and text in the palette’s text colours', m, m.h === rgb(APP[colorScheme].text) && m.p === rgb(APP[colorScheme].text2) && m.wide === width > 760)
      if (width === 1280) {
        const g = await geometry(page)
        for (const k of [0, 2]) {
          await scrollToY(page, at(g, k))
          await page.screenshot({ path: join(SHOTS, `features-${lang}-${colorScheme}-step${k + 1}.png`) })
        }
      }
      await context.close()
    }
  }
}

await browser.close()
const failed = results.filter((r) => !r.pass)
const escape = (s) => s.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
writeFileSync(join(HERE, 'results.json'), escape(JSON.stringify({ base: BASE, total: results.length, failed: failed.length, results }, null, 1)) + '\n')
console.log(`${results.length} measurements, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
