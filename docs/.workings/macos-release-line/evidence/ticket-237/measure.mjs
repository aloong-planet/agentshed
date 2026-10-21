// Browser measurement of the landing page for #237 (landing-page Testing Decisions: geometry and computed
// styles, not pixels). Run against a served build of site/:
//
//   pnpm --dir site build && pnpm --dir site exec astro preview --port 4399 --host 127.0.0.1
//   node docs/.workings/macos-release-line/evidence/ticket-237/measure.mjs
//
// Writes results.json (every measurement with its value and verdict) and the screenshots beside this file,
// and exits non-zero if any measurement fails. Expected colours are the app's purple values, copied from
// src/renderer/src/theme.css; expected copy is the confirmed prototype's own table, read from its page.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = process.env.SITE_URL ?? 'http://127.0.0.1:4399'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../../..')
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const results = []
function check(id, what, actual, pass) {
  results.push({ id, what, actual, pass: Boolean(pass) })
  if (!pass) console.log(`FAIL ${id} — ${what}: ${JSON.stringify(actual)}`)
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`
}
/** The app's purple palette (src/renderer/src/theme.css), the expected values */
const APP = {
  light: { bg: '#f7f8f9', text: '#37352f', text2: '#787774', line: '#e8eaed', lineStrong: '#d9dce0', accent: '#8a67ab' },
  dark: { bg: '#18191b', text: '#e6e6e5', text2: '#9b9a97', line: '#2a2c30', lineStrong: '#34373c', accent: '#a084c7' }
}
const PATH = { zh: '/', en: '/en/' }
const HEADER = 58

// The installed Google Chrome by default; BROWSER_CHANNEL= (empty) uses Playwright's own Chromium
const channel = process.env.BROWSER_CHANNEL ?? 'chrome'
const browser = await chromium.launch(channel ? { channel } : {})
console.log(`browser: ${channel || 'chromium'} ${browser.version()}`)

async function open(lang, { width = 1280, height = 900, colorScheme = 'light', reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion })
  // Nothing on the page reaches GitHub in this run: a GitHub page opened in a new tab is answered locally
  await context.route('https://github.com/**', (r) => r.fulfill({ status: 200, body: 'github stand-in' }))
  const page = await context.newPage()
  await page.goto(BASE + PATH[lang], { waitUntil: 'load' })
  return { context, page }
}

/** Wait until scrolling has stopped: the same scrollY over five animation frames */
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = -1
        let same = 0
        const tick = () => {
          if (scrollY === last) same++
          else same = 0
          last = scrollY
          if (same >= 5) resolve(scrollY)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )
const frames = (page, n = 3) =>
  page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

/** The features section's state: current step, shown screenshot, and the step nearest the frame's middle */
const featureState = (page) =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('.fs-item')]
    const panel = document.querySelector('.fs-panel')
    const pr = panel.getBoundingClientRect()
    const middle = pr.top + pr.height / 2
    const centres = items.map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height / 2 })
    const dist = centres.map((c) => Math.abs(c - middle))
    return {
      current: items.findIndex((b) => b.classList.contains('on')),
      shown: [...document.querySelectorAll('.fs-stack img')].findIndex((i) => i.classList.contains('on')),
      nearest: dist.indexOf(Math.min(...dist)),
      // A tie within a pixel cannot pick a side
      tie: [...dist].sort((a, b) => a - b)[1] - Math.min(...dist) < 1,
      panelTop: pr.top,
      panelMiddle: middle,
      panelHeight: pr.height,
      centres
    }
  })

// ── QR-001/AC-01 (list state), REQ-003 header, in both languages and appearances ─────────────────────
for (const lang of ['zh', 'en']) {
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [400, 900, 1280, 1440]) {
      const { context, page } = await open(lang, { width, colorScheme })
      const m = await page.evaluate(() => {
        const rect = (el) => el.getBoundingClientRect().toJSON()
        const de = document.documentElement
        const dl = document.querySelector('.dl')
        const dls = getComputedStyle(dl)
        const card = dl.getBoundingClientRect()
        const content = {
          left: card.left + parseFloat(dls.paddingLeft) + parseFloat(dls.borderLeftWidth),
          right: card.right - parseFloat(dls.paddingRight) - parseFloat(dls.borderRightWidth)
        }
        const hero = document.querySelector('.hero')
        const hs = getComputedStyle(hero)
        const hr = hero.getBoundingClientRect()
        const heroContent = { left: hr.left + parseFloat(hs.paddingLeft), right: hr.right - parseFloat(hs.paddingRight) }
        const heroParts = ['h1', '.lede', '.cta a.btn', '.cta .meta', '.shot'].map((s) => [s, rect(hero.querySelector(s))])
        const bar = document.querySelector('.bar')
        const bs = getComputedStyle(bar)
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          buttons: [...document.querySelectorAll('.dl-actions a')].map(rect),
          heroButton: rect(document.querySelector('.hero .cta a.btn')),
          content,
          heroContent,
          heroParts,
          navDisplay: getComputedStyle(document.querySelector('.nav-links')).display,
          lang: rect(document.querySelector('.lang')),
          barRight: bar.getBoundingClientRect().right - parseFloat(bs.paddingRight)
        }
      })
      const id = `${lang}/${colorScheme}/${width}`
      check(`QR-001 ${id}`, 'no sideways scroll (scrollWidth ≤ clientWidth)', [m.scrollWidth, m.clientWidth], m.scrollWidth <= m.clientWidth)
      check(
        `QR-001 ${id}`,
        'every download button inside the card’s content box',
        { buttons: m.buttons.map((b) => [b.left, b.right]), content: m.content },
        m.buttons.length > 0 && m.buttons.every((b) => b.left >= m.content.left - 0.5 && b.right <= m.content.right + 0.5)
      )
      check(
        `QR-001 ${id}`,
        'hero keeps its side gutters: every part inside the hero’s content box, gutter ≥ 24px',
        { heroContent: m.heroContent, parts: m.heroParts.map(([s, r]) => [s, r.left, r.right]) },
        m.heroContent.left >= 24 - 0.5 &&
          m.heroParts.every(([, r]) => r.left >= m.heroContent.left - 0.5 && r.right <= m.heroContent.right + 0.5)
      )
      check(`REQ-003 ${id}`, 'navigation hidden below 760px, shown above', m.navDisplay, width < 760 ? m.navDisplay === 'none' : m.navDisplay === 'flex')
      check(`REQ-003 ${id}`, 'toggle at the header’s right edge', [m.lang.right, m.barRight], Math.abs(m.lang.right - m.barRight) <= 1)
      await context.close()
    }
  }
}

// The sideways-scroll measurement can fire: a page made 2000px wide is caught
{
  const { context, page } = await open('en', { width: 400 })
  const caught = await page.evaluate(() => {
    const d = document.createElement('div')
    d.style.width = '2000px'
    d.style.height = '1px'
    document.querySelector('.dl').append(d)
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
  check('QR-001 control', 'an element wider than the viewport is detected as sideways scroll', caught, caught === true)
  await context.close()
}

// ── REQ-003: the header stays at the top while scrolling ─────────────────────────────────────────────
for (const lang of ['zh', 'en']) {
  const { context, page } = await open(lang)
  await page.evaluate(() => scrollTo({ top: 3000, behavior: 'instant' }))
  await settle(page)
  const top = await page.evaluate(() => [scrollY, document.querySelector('.site-header').getBoundingClientRect().top])
  check(`REQ-003 ${lang}`, 'header at the top after scrolling 3000px', top, top[0] > 2000 && top[1] === 0)
  await context.close()
}

// ── REQ-004 on a wide screen ──────────────────────────────────────────────────────────────────────────
for (const lang of ['zh', 'en']) {
  for (const width of [1280, 1440]) {
    const { context, page } = await open(lang, { width })
    const id = `${lang}/${width}`
    // AC-01 and Failure C1: scroll through the section in 60px steps
    const span = await page.evaluate(() => {
      const s = document.getElementById('features')
      return { top: s.offsetTop, bottom: s.offsetTop + s.offsetHeight }
    })
    const samples = []
    for (let y = span.top - 200; y <= span.bottom - 300; y += 60) {
      await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y)
      await frames(page)
      samples.push({ y, ...(await featureState(page)) })
    }
    // The frame's own sticky offset: where it sits whenever it is stuck
    const stickyTop = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.fs-panel')).top))
    const stuck = samples.filter((s) => Math.abs(s.panelTop - stickyTop) < 0.5)
    check(`REQ-004/AC-01 ${id}`, 'the frame shows the step nearest its middle at every sample', samples.filter((s) => !(s.current === s.nearest || s.tie) || s.shown !== s.current).map((s) => s.y), samples.every((s) => (s.current === s.nearest || s.tie) && s.shown === s.current))
    const order = samples.map((s) => s.current)
    check(`REQ-004/AC-01 ${id}`, 'scrolling down visits the steps in order', [...new Set(order)], order.every((c, i) => i === 0 || c >= order[i - 1]) && [0, 1, 2, 3].every((i) => order.includes(i)))
    const stuckTop = stuck[0]?.panelTop
    const viewportMiddle = (HEADER + 900) / 2
    check(`REQ-004/AC-01 ${id}`, 'the frame stays in place, under the header, centred in the space below it', { samples: samples.length, stuckSamples: stuck.length, stickyTop, top: stuckTop, middle: stuck[0]?.panelMiddle, spaceMiddle: viewportMiddle }, stuck.length >= 10 && stuckTop >= HEADER && Math.abs(stuck[0].panelMiddle - viewportMiddle) <= 12)

    // Put step 1 at the frame's middle for AC-02 and AC-03
    await page.click('.fs-item[data-i="1"]')
    await settle(page)
    await page.mouse.move(5, 5)
    const s1 = await featureState(page)
    const styles = await page.evaluate(() =>
      [...document.querySelectorAll('.fs-item')].map((b) => {
        const cs = getComputedStyle(b)
        return { bar: cs.borderLeftColor, barWidth: cs.borderLeftWidth, title: getComputedStyle(b.querySelector('.fs-h')).color }
      })
    )
    const L = APP.light
    check(`REQ-004/AC-02 ${id}`, 'current step: accent bar and darker title; others grey', { current: s1.current, styles }, s1.current === 1 && styles[1].bar === rgb(L.accent) && styles[1].barWidth === '3px' && styles[1].title === rgb(L.text) && [0, 2, 3].every((i) => styles[i].bar === rgb(L.line) && styles[i].title === rgb(L.text2)))
    const hover = async (i) => {
      const box = await page.locator(`.fs-item[data-i="${i}"]`).boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      return page.evaluate((i) => {
        const b = document.querySelector(`.fs-item[data-i="${i}"]`)
        return { bar: getComputedStyle(b).borderLeftColor, title: getComputedStyle(b.querySelector('.fs-h')).color }
      }, i)
    }
    const hovered = await hover(2)
    check(`REQ-004/AC-02 ${id}`, 'hovered step: stronger grey bar, darker title', hovered, hovered.bar === rgb(L.lineStrong) && hovered.title === rgb(L.text))
    const hoveredCurrent = await hover(1)
    check(`REQ-004/AC-02 ${id}`, 'the current step keeps its accent bar while hovered', hoveredCurrent, hoveredCurrent.bar === rgb(L.accent))
    await page.mouse.move(5, 5)

    // AC-03: each step about a third of a screen; the neighbours of the current one in view
    const a3 = await page.evaluate(() => ({
      heights: [...document.querySelectorAll('.fs-step')].map((s) => s.getBoundingClientRect().height / innerHeight),
      rects: [...document.querySelectorAll('.fs-item')].map((b) => { const r = b.getBoundingClientRect(); return [r.top, r.bottom] })
    }))
    check(`REQ-004/AC-03 ${id}`, 'each step about a third of a screen tall', a3.heights.map((h) => +h.toFixed(3)), a3.heights.every((h) => h >= 0.33 && h <= 0.45))
    check(`REQ-004/AC-03 ${id}`, 'with step 1 current, steps 0 and 2 at least partly in view below the header', [a3.rects[0], a3.rects[2]], a3.rects[0][1] > HEADER && a3.rects[2][0] < 900)

    // AC-04, every step: where a click leaves it relative to the frame's middle
    const offsets = []
    for (const i of [0, 1, 2, 3]) {
      await page.click(`.fs-item[data-i="${i}"]`)
      await settle(page)
      const s = await featureState(page)
      const edge = await page.evaluate(() => {
        const grid = document.querySelector('.fs').getBoundingClientRect()
        const panel = document.querySelector('.fs-panel').getBoundingClientRect()
        return { atStart: Math.abs(panel.top - grid.top) <= 1, atEnd: Math.abs(panel.bottom - grid.bottom) <= 1 }
      })
      offsets.push({ i, current: s.current, shown: s.shown, offset: +(s.centres[i] - s.panelMiddle).toFixed(1), panelTop: +s.panelTop.toFixed(1), ...edge })
    }
    check(`REQ-004/AC-04 ${id}`, 'a click on each step makes it current and shows its screenshot', offsets, offsets.every((o) => o.current === o.i && o.shown === o.i))
    check(`REQ-004/AC-04 ${id}`, 'a click on the middle two steps leaves them level with the frame’s middle (±2px)', offsets.slice(1, 3), offsets.slice(1, 3).every((o) => Math.abs(o.offset) <= 2))
    // The first and last steps (AC-04 as amended on 2026-10-18): the frame stops at the section's start and end,
    // so a click leaves them as close to its middle as the section allows — the frame then stands at the
    // section's start (first step) or end (last step), where no further scroll brings the two closer
    check(`REQ-004/AC-04 ${id}`, 'a click on the first and last steps: as close to the frame’s middle as the section allows (the frame at the section’s start or end)', [offsets[0], offsets[3]], offsets[0].atStart && offsets[0].offset < 0 && offsets[3].atEnd && offsets[3].offset > 0)
    await page.click('.fs-item[data-i="1"]')
    await settle(page)
    // AC-04: a click scrolls the step level with the frame's middle; Enter does the same; the focus ring
    await page.click('.fs-item[data-i="1"]')
    await settle(page)
    await page.click('.fs-item[data-i="2"]')
    await settle(page)
    const s2 = await featureState(page)
    check(`REQ-004/AC-04 ${id}`, 'click: the step level with the frame’s middle, the frame follows', { current: s2.current, shown: s2.shown, offset: s2.centres[2] - s2.panelMiddle }, s2.current === 2 && s2.shown === 2 && Math.abs(s2.centres[2] - s2.panelMiddle) <= 2)
    await page.keyboard.press('Shift+Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      const cs = getComputedStyle(el)
      return { i: el.dataset.i, visible: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset) }
    })
    check(`REQ-004/AC-04 ${id}`, 'keyboard focus (Shift+Tab to the previous step) shows a ring inside its own box (offset + width ≤ 0)', focused, focused.i === '1' && focused.visible && focused.style === 'solid' && focused.width === 2 && focused.offset + focused.width <= 0)
    await page.keyboard.press('Enter')
    await settle(page)
    const s3 = await featureState(page)
    check(`REQ-004/AC-04 ${id}`, 'Enter on the focused step: level with the frame’s middle, the frame follows', { current: s3.current, offset: s3.centres[1] - s3.panelMiddle }, s3.current === 1 && s3.shown === 1 && Math.abs(s3.centres[1] - s3.panelMiddle) <= 2)

    // AC-05: cross-fade; only the shown screenshot reachable by the pointer and by assistive technology
    await page.click('.fs-item[data-i="0"]')
    const mid = await page.evaluate(() => new Promise((r) => setTimeout(() => {
      const imgs = [...document.querySelectorAll('.fs-stack img')]
      r(imgs.map((i) => +getComputedStyle(i).opacity))
    }, 120)))
    await settle(page)
    await page.waitForTimeout(400)
    const a5 = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.fs-stack img')]
      const stack = document.querySelector('.fs-stack').getBoundingClientRect()
      const hit = document.elementFromPoint(stack.left + stack.width / 2, stack.top + stack.height / 2)
      return {
        transition: getComputedStyle(imgs[0]).transitionDuration,
        visibility: imgs.map((i) => getComputedStyle(i).visibility),
        opacity: imgs.map((i) => +getComputedStyle(i).opacity),
        hit: imgs.indexOf(hit)
      }
    })
    check(`REQ-004/AC-05 ${id}`, 'mid-switch both screenshots partly opaque (a cross-fade)', mid, mid.filter((o) => o > 0 && o < 1).length >= 1)
    check(`REQ-004/AC-05 ${id}`, 'after the switch: only the shown screenshot visible and hit by the pointer', a5, a5.visibility.filter((v) => v === 'visible').length === 1 && a5.visibility[0] === 'visible' && a5.hit === 0 && a5.opacity[0] === 1)
    const aria = await page.locator('.fs-panel').ariaSnapshot()
    const alts = (aria.match(/img "[^"]*"/g) ?? [])
    check(`REQ-004/AC-05 ${id}`, 'the accessibility tree of the frame holds the shown screenshot only', alts, alts.length === 1)

    // Failure C2: across 760px and back, no stale current step
    await page.click('.fs-item[data-i="2"]')
    await settle(page)
    await page.setViewportSize({ width: 600, height: 900 })
    await frames(page, 5)
    await page.setViewportSize({ width, height: 900 })
    await frames(page, 5)
    const c2 = await featureState(page)
    check(`Failure C2 ${id}`, 'after narrowing below 760px and widening again, the current step is the nearest', c2, c2.current === c2.nearest || c2.tie)

    // Failure C1: a jump to the download section and back
    const back = await page.evaluate(() => scrollY)
    await page.evaluate(() => scrollTo({ top: document.getElementById('download').offsetTop, behavior: 'instant' }))
    await frames(page)
    await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), back)
    await frames(page)
    const c1 = await featureState(page)
    check(`Failure C1 ${id}`, 'after a jump away and back, the frame shows the nearest step', c1, (c1.current === c1.nearest || c1.tie) && c1.shown === c1.current)
    // and a wheel scroll
    await page.mouse.move(300, 400)
    await page.mouse.wheel(0, 240)
    await settle(page)
    await frames(page)
    const wheel = await featureState(page)
    check(`Failure C1 ${id}`, 'after a wheel scroll, the frame shows the nearest step', wheel, (wheel.current === wheel.nearest || wheel.tie) && wheel.shown === wheel.current)
    await context.close()
  }
}

// AC-05 under reduced motion: the switch is immediate
{
  const { context, page } = await open('en', { reducedMotion: 'reduce' })
  await page.click('.fs-item[data-i="1"]')
  await settle(page)
  await frames(page, 2)
  const r = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.fs-stack img')]
    return { duration: imgs.map((i) => getComputedStyle(i).transitionDuration), opacity: imgs.map((i) => +getComputedStyle(i).opacity) }
  })
  check('REQ-004/AC-05 reduced motion', 'no transition; the shown screenshot fully opaque at once', r, r.duration.every((d) => d.split(',').every((x) => parseFloat(x) === 0)) && r.opacity[1] === 1 && r.opacity.filter((o) => o > 0).length === 1)
  await context.close()
}

// ── REQ-004/AC-06 below 760px ─────────────────────────────────────────────────────────────────────────
for (const lang of ['zh', 'en']) {
  const { context, page } = await open(lang, { width: 400 })
  const n = await page.evaluate(() => {
    const steps = [...document.querySelectorAll('.fs-step')]
    return {
      panel: getComputedStyle(document.querySelector('.fs-panel')).display,
      steps: steps.map((s) => {
        const item = s.querySelector('.fs-item').getBoundingClientRect()
        const shot = s.querySelector('.m-shot')
        const sr = shot.getBoundingClientRect()
        return { display: getComputedStyle(shot).display, itemBottom: item.bottom, shotTop: sr.top, shotBottom: sr.bottom, itemTop: item.top }
      })
    }
  })
  const gaps = n.steps.slice(1).map((s, i) => s.itemTop - n.steps[i].shotBottom)
  check(`REQ-004/AC-06 ${lang}`, 'no fixed frame; each screenshot under its text; a clear gap before the next title', { panel: n.panel, under: n.steps.map((s) => s.shotTop - s.itemBottom), gaps }, n.panel === 'none' && n.steps.every((s) => s.display !== 'none' && s.shotTop >= s.itemBottom) && gaps.every((g) => g >= 40))
  await context.close()
}

// ── REQ-004/AC-07: switching language keeps the step and the scroll position ─────────────────────────
for (const [from, to] of [['en', 'zh'], ['zh', 'en']]) {
  const { context, page } = await open(from)
  await page.click('.fs-item[data-i="2"]')
  await settle(page)
  const before = await page.evaluate(() => ({ current: [...document.querySelectorAll('.fs-item')].findIndex((b) => b.classList.contains('on')), top: document.querySelectorAll('.fs-step')[2].getBoundingClientRect().top, scrollY }))
  await Promise.all([page.waitForURL(BASE + PATH[to]), page.click('.lang a:not(.on)')])
  await page.waitForLoadState('load')
  await frames(page, 3)
  const after = await page.evaluate(() => ({ lang: document.documentElement.lang, current: [...document.querySelectorAll('.fs-item')].findIndex((b) => b.classList.contains('on')), top: document.querySelectorAll('.fs-step')[2].getBoundingClientRect().top, scrollY }))
  check(`REQ-004/AC-07 ${from}→${to}`, 'the same current step, the step at the same height', { before, after }, after.current === 2 && before.current === 2 && Math.abs(after.top - before.top) <= 1)

  // Elsewhere on the page: the install section
  await page.evaluate(() => scrollTo({ top: document.getElementById('install').offsetTop - 200, behavior: 'instant' }))
  await settle(page)
  const b2 = await page.evaluate(() => document.getElementById('install').getBoundingClientRect().top)
  await Promise.all([page.waitForURL(BASE + PATH[from]), page.click('.lang a:not(.on)')])
  await page.waitForLoadState('load')
  await frames(page, 3)
  const a2 = await page.evaluate(() => document.getElementById('install').getBoundingClientRect().top)
  check(`REQ-004/AC-07 ${to}→${from}`, 'scrolled to the install section: the section at the same height', [b2, a2], Math.abs(a2 - b2) <= 1)
  await context.close()
}
// Narrow: the step under the viewport's middle stays there
{
  const { context, page } = await open('en', { width: 400 })
  await page.evaluate(() => { const s = document.querySelectorAll('.fs-step')[1]; scrollTo({ top: s.getBoundingClientRect().top + scrollY - 300, behavior: 'instant' }) })
  await settle(page)
  const b = await page.evaluate(() => document.querySelectorAll('.fs-step')[1].getBoundingClientRect().top)
  await Promise.all([page.waitForURL(BASE + PATH.zh), page.click('.lang a:not(.on)')])
  await page.waitForLoadState('load')
  await frames(page, 3)
  const a = await page.evaluate(() => document.querySelectorAll('.fs-step')[1].getBoundingClientRect().top)
  check('REQ-004/AC-07 en→zh at 400px', 'the step under the viewport’s middle at the same height', [b, a], Math.abs(a - b) <= 1)
  await context.close()
}

// ── Failure C3: a short window ────────────────────────────────────────────────────────────────────────
{
  const { context, page } = await open('en', { width: 1280, height: 560 })
  await page.click('.fs-item[data-i="2"]')
  await settle(page)
  const r = await page.evaluate(() => { const p = document.querySelectorAll('.fs-item .fs-p')[2].getBoundingClientRect(); return [p.top, p.bottom, innerHeight] })
  check('Failure C3 en/1280×560', 'the current step’s text body visible below the header', r, r[0] >= 58 && r[1] <= r[2])
  await context.close()
}

// ── REQ-005/AC-03, Failure C4: space held before the screenshots load ────────────────────────────────
for (const lang of ['zh', 'en']) {
  for (const width of [400, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    let release
    const gate = new Promise((r) => (release = r))
    await page.route('**/shots/*.png', async (route) => { await gate; await route.continue() })
    await page.goto(BASE + PATH[lang], { waitUntil: 'domcontentloaded' })
    await frames(page, 2)
    const held = await page.evaluate(() =>
      [...document.querySelectorAll('.shot img')].filter((i) => i.getClientRects().length > 0).map((i) => {
        const r = i.getBoundingClientRect()
        return { complete: i.complete && i.naturalWidth > 0, height: r.height, expected: (r.width * Number(i.getAttribute('height'))) / Number(i.getAttribute('width')) }
      })
    )
    release()
    check(`REQ-005/AC-03 ${lang}/${width}`, 'every displayed screenshot holds its height before loading', held.map((h) => [h.complete, +h.height.toFixed(1), +h.expected.toFixed(1)]), held.length >= 2 && held.every((h) => !h.complete && Math.abs(h.height - h.expected) <= 1 && h.height > 50))
    await context.close()
  }
}

// ── REQ-006, Failure D1: the palette in light and dark, switched by the system appearance ────────────
for (const lang of ['zh', 'en']) {
  const { context, page } = await open(lang)
  const read = () => page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.querySelector('h1')).color,
    lede: getComputedStyle(document.querySelector('.lede')).color,
    button: getComputedStyle(document.querySelector('.hero .btn-primary')).backgroundColor,
    shotFilter: getComputedStyle(document.querySelector('.hero .shot img')).filter,
    iconFilter: getComputedStyle(document.querySelector('.hero .icon')).filter,
    iconBoxShadow: getComputedStyle(document.querySelector('.hero .icon')).boxShadow,
    shotOpacity: getComputedStyle(document.querySelector('.hero .shot img')).opacity
  }))
  const light = await read()
  await page.emulateMedia({ colorScheme: 'dark' })
  await frames(page, 2)
  const dark = await read()
  const L = APP.light
  const D = APP.dark
  check(`REQ-006 ${lang}`, 'light: the app’s purple light values', light, light.bg === rgb(L.bg) && light.text === rgb(L.text) && light.lede === rgb(L.text2) && light.button === rgb(L.accent))
  check(`Failure D1 ${lang}`, 'switching the system appearance recolours the page (no reload): the dark values', dark, dark.bg === rgb(D.bg) && dark.text === rgb(D.text) && dark.lede === rgb(D.text2) && dark.button === rgb(D.accent))
  // The hero icon's shadow follows its outline (the owner's call of 2026-10-18), per appearance
  check(`REQ-006 ${lang}`, 'the hero icon: a drop shadow on its outline, no box shadow, light and dark values', [light.iconFilter, dark.iconFilter, light.iconBoxShadow], light.iconFilter === 'drop-shadow(rgba(55, 53, 47, 0.18) 0px 18px 25px)' && dark.iconFilter === 'drop-shadow(rgba(0, 0, 0, 0.55) 0px 18px 25px)' && light.iconBoxShadow === 'none')
  check(`Failure D1 ${lang}`, 'the screenshots stay as taken (light) in dark: no filter, fully opaque', [dark.shotFilter, dark.shotOpacity], dark.shotFilter === 'none' && dark.shotOpacity === '1')
  await context.close()
}

// ── Failures B1, B2: languages and navigation ────────────────────────────────────────────────────────
{
  const { context, page } = await open('en')
  const b1 = await page.evaluate(() => ({ lang: document.documentElement.lang, on: document.querySelector('.lang a.on').textContent.trim(), current: document.querySelector('.lang a[aria-current="page"]').textContent.trim() }))
  check('Failure B1', 'a direct visit to /en/: English, the toggle on EN', b1, b1.lang === 'en' && b1.on === 'EN' && b1.current === 'EN')
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.nav-links a[href^="https://github.com"]')])
  check('Failure B2', 'the navigation’s GitHub link opens the repository in a new tab', popup.url(), popup.url() === 'https://github.com/aloong-planet/agentshed')
  await popup.close()
  await page.click('.nav-links a[href="#install"]')
  await settle(page)
  const b2 = await page.evaluate(() => ({ url: location.href, top: document.getElementById('install').getBoundingClientRect().top, atEnd: Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)) <= 1 }))
  // Scrolled to the section, or as far as the page goes when the section is near its end
  check('Failure B2', 'a section link scrolls within the page, to the section', b2, b2.url === `${BASE}/en/#install` && (Math.abs(b2.top) <= 1 || (b2.atEnd && b2.top >= 0)))
  await Promise.all([page.waitForURL(BASE + '/'), page.click('.lang a:not(.on)')])
  const zh = await page.evaluate(() => document.documentElement.lang)
  check('Failure B1', 'toggling goes to the other language’s page', [page.url(), zh], zh === 'zh-CN')
  await context.close()
}

// ── Copy: the site's dictionaries against the confirmed prototype's table ────────────────────────────
{
  const { ui } = await import(pathToFileURL(join(ROOT, 'site/src/i18n/ui.ts')).href)
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(pathToFileURL(join(ROOT, 'docs/prototypes/landing-page/prototype-landing.html')).href)
  const T = await page.evaluate(() => JSON.parse(JSON.stringify(T, (k, v) => (typeof v === 'function' ? v('<v>') : v))))
  for (const lang of ['zh', 'en']) {
    const p = T[lang]
    const s = ui[lang]
    const pairs = [
      ['nav', p.nav, [s.nav.features, s.nav.install, s.nav.download, s.nav.github]],
      ['title', p.title, s.hero.title],
      ['lede', p.lede, s.hero.lede],
      ['platform', p.meta, s.hero.platform],
      ['hero shot', p.shotHero, s.hero.shotAlt],
      ['features title', p.featTitle, s.features.title],
      ['features subtitle', p.featSub, s.features.subtitle],
      ['features', p.feats.map(([h, b, , alt]) => [h, b, alt]), s.features.steps.map((f) => [f.title, f.body, f.alt])],
      ['install title', p.installTitle, s.install.title],
      ['install steps', p.steps, s.install.steps.map((x) => [x.title, x.body])],
      ['download title', p.dlTitle, s.download.title],
      ['download label', [p.dlLabel, p.dlLabelSub], [s.download.label, s.download.labelSub]],
      ['list state', [p.downloadGithub, p.dlSubUnknown, p.dlGithubAll], [s.download.list.hero, s.download.list.line, s.download.list.button]],
      ['footer', p.foot, [s.footer.github, s.footer.releases, s.footer.copyright]]
    ]
    for (const [what, proto, site] of pairs) {
      check(`copy ${lang}`, `${what}: the site’s copy equals the confirmed prototype’s`, JSON.stringify(proto) === JSON.stringify(site) ? 'equal' : { proto, site }, JSON.stringify(proto) === JSON.stringify(site))
    }
  }
  await context.close()
}

// ── Screenshots: the hero (US-001/AC-01), the features (US-003/AC-01), both appearances, a phone ────
for (const lang of ['zh', 'en']) {
  for (const colorScheme of ['light', 'dark']) {
    const { context, page } = await open(lang, { colorScheme })
    await page.screenshot({ path: join(SHOTS, `${lang}-${colorScheme}-hero.jpg`), type: 'jpeg', quality: 80 })
    await page.click('.fs-item[data-i="2"]')
    await settle(page)
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(SHOTS, `${lang}-${colorScheme}-features.jpg`), type: 'jpeg', quality: 80 })
    await page.evaluate(() => scrollTo({ top: document.getElementById('install').offsetTop - 58, behavior: 'instant' }))
    await settle(page)
    await page.screenshot({ path: join(SHOTS, `${lang}-${colorScheme}-install-download.jpg`), type: 'jpeg', quality: 80 })
    await context.close()
  }
  const { context, page } = await open(lang, { width: 400, height: 860 })
  await page.screenshot({ path: join(SHOTS, `${lang}-light-400-full.jpg`), type: 'jpeg', quality: 70, fullPage: true })
  await context.close()
}

await browser.close()
// The record quotes the Chinese page's copy. The repository's working language is English (ADR-0017), so
// Chinese characters are written as JSON \u escapes: the same strings, readable by any JSON parser
const escapeCjk = (text) => text.replace(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
writeFileSync(join(HERE, 'results.json'), escapeCjk(JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2)) + '\n')
const failed = results.filter((r) => !r.pass)
console.log(`${results.length} measurements, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
