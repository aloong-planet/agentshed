// Browser measurement of the landing page's download states for #238 (landing-page Testing Decisions: geometry and
// computed styles, not pixels). The two reads are answered by the test fixtures (the pointer as the release
// script writes it, GitHub's real-shaped list), routed in the browser, so nothing reaches the network:
//
//   pnpm --dir site build && pnpm --dir site exec astro preview --port 4399 --host 127.0.0.1
//   node docs/.workings/macos-release-line/evidence/ticket-238/measure.mjs
//
// Writes results.json and the screenshots beside this file; exits non-zero if any measurement fails. Chinese is
// written as \u escapes in results.json (ADR-0017). Expected colours are the app's (src/renderer/src/theme.css).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = process.env.SITE_URL ?? 'http://127.0.0.1:4399'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../../..')
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const POINTER_URL = 'https://dl.agentshed.aloongplanet.com/latest.json'
const RELEASES_API = 'https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100'
const POINTER = readFileSync(join(ROOT, 'site/test/fixtures/pointer.json'), 'utf8')
const RELEASES = JSON.parse(readFileSync(join(ROOT, 'site/test/fixtures/github-releases.json'), 'utf8'))
const ONLY_PRE = JSON.stringify(RELEASES.filter((r) => r.prerelease))
const PATH = { zh: '/', en: '/en/' }
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` }
const APP = { light: { warnBg: '#fdecdc', warnFg: '#b3552f', accent: '#8a67ab', card: '#ffffff' }, dark: { warnBg: '#3c2417', warnFg: '#f0a884', accent: '#a084c7', card: '#1f2124' } }

/** How each state's two reads are answered */
const STATES = {
  'formal-r2': { pointer: [200, POINTER], github: [200, JSON.stringify(RELEASES)] },
  'formal-github': { pointer: [404, '<html><body>Not Found</body></html>', 'text/html'], github: [200, JSON.stringify(RELEASES)] },
  test: { pointer: [404, '<html><body>Not Found</body></html>', 'text/html'], github: [200, ONLY_PRE] },
  list: { pointer: 'fail', github: 'fail' }
}

const results = []
function check(id, what, actual, pass) {
  results.push({ id, what, actual, pass: Boolean(pass) })
  if (!pass) console.log(`FAIL ${id} — ${what}: ${JSON.stringify(actual)}`)
}

const channel = process.env.BROWSER_CHANNEL ?? 'chrome'
const browser = await chromium.launch(channel ? { channel } : {})
console.log(`browser: ${channel || 'chromium'} ${browser.version()}`)

/** A page whose two reads are answered as the state says, after an optional delay; every request is recorded */
async function open(lang, state, { width = 1280, height = 900, colorScheme = 'light', delayMs = 0, anchoring = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme })
  // Without the browser's scroll anchoring, as in a browser that has none
  if (!anchoring) await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html{overflow-anchor:none}'; document.head.append(s) }))
  const requests = []
  context.on('request', (r) => requests.push(r.url()))
  const answer = (spec) => async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    if (spec === 'fail') return route.abort('failed')
    const [status, body, type = 'application/json'] = spec
    return route.fulfill({ status, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } })
  }
  await context.route(POINTER_URL, answer(STATES[state].pointer))
  await context.route(RELEASES_API, answer(STATES[state].github))
  await context.route('https://github.com/**', (r) => r.fulfill({ status: 200, body: 'github stand-in' }))
  const page = await context.newPage()
  await page.goto(BASE + PATH[lang], { waitUntil: 'load' })
  return { context, page, requests }
}

/** Waits until the hero's button has left the list state, or the given time has passed */
const landed = (page, ms = 3000) =>
  page.waitForFunction(() => !/GitHub/.test(document.querySelector('.hero .cta a.btn').textContent) || document.querySelector('.hero .cta .alt, .hero .cta .beta-note'), null, { timeout: ms }).catch(() => null)
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

const readPage = (page) =>
  page.evaluate(() => {
    const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cta = document.querySelector('.hero .cta')
    const link = (a) => a && { text: t(a), href: a.getAttribute('href'), target: a.getAttribute('target') }
    return {
      hero: link(cta.querySelector('a.btn')),
      pill: t(cta.querySelector('.meta .pill')) || null,
      note: t(cta.querySelector('.beta-note')) || null,
      every: link(cta.querySelector('.alt a')),
      line: t(document.querySelector('#download h2 + p')),
      buttons: [...document.querySelectorAll('#download .dl-actions a')].map((a) => ({ ...link(a), ghost: a.classList.contains('btn-ghost') }))
    }
  })

// ── Each state renders as the spec says (English literals), and the page asks for nothing else (CON-003) ──
const EXPECT = {
  'formal-r2': { hero: 'Download Agentshed 0.2.0', target: null, every: true, pill: null, line: 'Current version 0.2.0', buttons: ['Download', 'GitHub'] },
  'formal-github': { hero: 'Download Agentshed 1.2.1', target: '_blank', every: true, pill: null, line: 'Current version 1.2.1', buttons: ['Download'] },
  test: { hero: 'Download test version 1.2.0-beta', target: '_blank', every: false, pill: 'Test version', line: 'Test version Only a test version so far: 1.2.0-beta', buttons: ['Download the test version from GitHub'] },
  list: { hero: 'Download Agentshed from GitHub', target: '_blank', every: false, pill: null, line: 'Version details can’t be loaded right now — download from GitHub', buttons: ['Download from GitHub'] }
}
for (const state of Object.keys(STATES)) {
  const { context, page, requests } = await open('en', state)
  if (state !== 'list') await landed(page)
  else await page.waitForTimeout(800)
  const got = await readPage(page)
  const e = EXPECT[state]
  check(`REQ-002 ${state}`, 'the hero, the pill, the link, the line and the buttons as the spec says', got,
    got.hero.text === e.hero && got.hero.target === e.target && Boolean(got.every) === e.every && got.pill === e.pill && got.line === e.line &&
      JSON.stringify(got.buttons.map((b) => b.text)) === JSON.stringify(e.buttons))
  const outside = requests.filter((u) => !u.startsWith(BASE + '/'))
  const expectedReads = state === 'formal-r2' ? [POINTER_URL] : [POINTER_URL, RELEASES_API]
  check(`CON-003 ${state}`, 'requests leaving the page: the pointer, then GitHub only when the pointer offers nothing', outside, JSON.stringify(outside) === JSON.stringify(expectedReads))
  await context.close()
}

// ── QR-001/AC-01 for every state, both languages and appearances; the pill's colours ────────────────────
for (const state of ['formal-r2', 'formal-github', 'test']) {
  for (const lang of ['zh', 'en']) {
    for (const colorScheme of ['light', 'dark']) {
      for (const width of [400, 900, 1280, 1440]) {
        const { context, page } = await open(lang, state, { width, colorScheme })
        await landed(page)
        const m = await page.evaluate(() => {
          const rect = (el) => el.getBoundingClientRect().toJSON()
          const de = document.documentElement
          const dl = document.querySelector('.dl')
          const s = getComputedStyle(dl)
          const card = dl.getBoundingClientRect()
          const content = { left: card.left + parseFloat(s.paddingLeft) + 1, right: card.right - parseFloat(s.paddingRight) - 1 }
          const hero = document.querySelector('.hero')
          const hs = getComputedStyle(hero)
          const hr = hero.getBoundingClientRect()
          const heroContent = { left: hr.left + parseFloat(hs.paddingLeft), right: hr.right - parseFloat(hs.paddingRight) }
          const parts = [...hero.querySelectorAll('h1, .lede, .cta > *, .shot')].map((el) => [el.className || el.tagName, rect(el)])
          const pill = document.querySelector('.cta .pill')
          return {
            scroll: [de.scrollWidth, de.clientWidth],
            buttons: [...document.querySelectorAll('.dl-actions a')].map(rect),
            content,
            heroContent,
            parts,
            pill: pill && { bg: getComputedStyle(pill).backgroundColor, fg: getComputedStyle(pill).color },
            note: document.querySelector('.cta .beta-note') && getComputedStyle(document.querySelector('.cta .beta-note')).color
          }
        })
        const id = `${state}/${lang}/${colorScheme}/${width}`
        check(`QR-001 ${id}`, 'no sideways scroll', m.scroll, m.scroll[0] <= m.scroll[1])
        check(`QR-001 ${id}`, 'every download button inside the card’s content box', { buttons: m.buttons.map((b) => [b.left, b.right]), content: m.content },
          m.buttons.length > 0 && m.buttons.every((b) => b.left >= m.content.left - 0.5 && b.right <= m.content.right + 0.5))
        check(`QR-001 ${id}`, 'the hero’s parts inside its gutters', { heroContent: m.heroContent, parts: m.parts.map(([c, r]) => [c, r.left, r.right]) },
          m.heroContent.left >= 23.5 && m.parts.every(([, r]) => r.left >= m.heroContent.left - 0.5 && r.right <= m.heroContent.right + 0.5))
        if (state === 'test') {
          const A = APP[colorScheme]
          check(`REQ-006 ${id}`, 'the pill and the note in the app’s warning colours', m, m.pill?.bg === rgb(A.warnBg) && m.pill?.fg === rgb(A.warnFg) && m.note === rgb(A.warnFg))
        }
        if (width === 1280 && (lang === 'en' ? colorScheme === 'light' : colorScheme === 'dark')) {
          const box = await page.locator('.hero .cta').boundingBox()
          await page.screenshot({ path: join(SHOTS, `${state}-${lang}-${colorScheme}-hero.jpg`), type: 'jpeg', quality: 80, clip: { x: 0, y: Math.max(0, box.y - 260), width: 1280, height: Math.min(560, box.height + 360) } })
          await page.evaluate(() => scrollTo({ top: document.getElementById('download').offsetTop - 58, behavior: 'instant' }))
          await frames(page)
          await page.screenshot({ path: join(SHOTS, `${state}-${lang}-${colorScheme}-download.jpg`), type: 'jpeg', quality: 80 })
        }
        if (width === 400 && lang === 'en' && colorScheme === 'light') {
          await page.evaluate(() => scrollTo({ top: document.getElementById('download').offsetTop - 58, behavior: 'instant' }))
          await frames(page)
          await page.screenshot({ path: join(SHOTS, `${state}-en-light-400-download.jpg`), type: 'jpeg', quality: 80 })
        }
        await context.close()
      }
    }
  }
}

// ── The GitHub button's hover (light): the app's accent border on the soft accent ground ──────────────
{
  const { context, page } = await open('en', 'formal-r2')
  await landed(page)
  const ghost = page.locator('#download .dl-actions a.btn-ghost')
  await ghost.scrollIntoViewIfNeeded()
  const rest = await ghost.evaluate((a) => ({ border: getComputedStyle(a).borderColor, bg: getComputedStyle(a).backgroundColor }))
  await ghost.hover()
  const hover = await ghost.evaluate((a) => ({ border: getComputedStyle(a).borderColor, bg: getComputedStyle(a).backgroundColor }))
  check('REQ-002/AC-01 ghost', 'the GitHub button: card ground at rest, the accent border on hover', { rest, hover }, rest.bg === 'rgb(255, 255, 255)' && hover.border === rgb(APP.light.accent) && hover.bg === 'rgb(240, 235, 246)')
  await context.close()
}

// ── Failure A7: a read resolving after the page is shown updates it in place ───────────────────────────
{
  const { context, page } = await open('en', 'test', { delayMs: 1500 })
  const early = (await readPage(page)).hero.text
  await landed(page, 6000)
  const late = await readPage(page)
  const reloads = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  check('Failure A7', 'the list state while the reads are out, the test state when they land, the page not reloaded', { early, late: late.hero.text, reloads }, early === 'Download Agentshed from GitHub' && late.hero.text === 'Download test version 1.2.0-beta' && reloads === 1)
  await context.close()
}

// ── REQ-004/AC-07 with a state landing late: the language switch still keeps the step and the place ──────
for (const [from, to] of [['en', 'zh'], ['zh', 'en']]) {
  const { context, page } = await open(from, 'test', { delayMs: 700 })
  await landed(page, 6000)
  await page.click('.fs-item[data-i="2"]')
  await page.waitForTimeout(1200)
  const before = await page.evaluate(() => ({ current: [...document.querySelectorAll('.fs-item')].findIndex((b) => b.classList.contains('on')), top: document.querySelectorAll('.fs-step')[2].getBoundingClientRect().top }))
  await Promise.all([page.waitForURL(BASE + PATH[to]), page.click('.lang a:not(.on)')])
  await page.waitForLoadState('load')
  await frames(page, 3)
  const restored = await page.evaluate(() => document.querySelectorAll('.fs-step')[2].getBoundingClientRect().top)
  await landed(page, 6000)
  await frames(page, 3)
  const after = await page.evaluate(() => ({ current: [...document.querySelectorAll('.fs-item')].findIndex((b) => b.classList.contains('on')), top: document.querySelectorAll('.fs-step')[2].getBoundingClientRect().top, pill: !!document.querySelector('.cta .pill') }))
  check(`REQ-004/AC-07 ${from}→${to} with a late state`, 'after the state lands: the same step, at the same height', { before, restored, after }, after.pill && after.current === 2 && Math.abs(after.top - before.top) <= 1)
  await context.close()
}

// ── Failure A5 in a browser: a pointer read that never answers is given up at the time limit (5s), and the page
// goes on to GitHub; until then it stays in the list state ─────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route(POINTER_URL, () => new Promise(() => {}))
  await context.route(RELEASES_API, (route) => route.fulfill({ status: 200, body: ONLY_PRE, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }))
  const page = await context.newPage()
  const started = Date.now()
  await page.goto(BASE + PATH.en, { waitUntil: 'load' })
  await page.waitForTimeout(Math.max(0, 4000 - (Date.now() - started)))
  const at4s = (await readPage(page)).hero.text
  await landed(page, 10000)
  const elapsed = Date.now() - started
  const late = (await readPage(page)).hero.text
  check('Failure A5 time limit', 'the list state at 4s; the test state from GitHub once the pointer read is given up at 5s', { at4s, late, elapsed },
    at4s === 'Download Agentshed from GitHub' && late === 'Download test version 1.2.0-beta' && elapsed >= 5000 && elapsed < 8000)
  await context.close()
}

// ── Failure A7 and REQ-004/AC-07: a state landing while the hero's download block is above the view (under the
// header included) keeps what the visitor sees in place, with or without scroll anchoring; while the block is in
// view, it changes in view and the page does not scroll ─────────────────────────────────────────────────────────
const branches = new Set()
for (const anchoring of [true, false]) {
  // Where the hero's bottom sits in the window before the switch; the header is 58px tall
  for (const heroBottom of [-40, 0, 20, 57, 120, 400, 760, 806, 900]) {
    const { context, page } = await open('en', 'test', { delayMs: 700, anchoring })
    await landed(page, 6000)
    await page.evaluate((b) => scrollTo({ top: document.getElementById('top').getBoundingClientRect().bottom + scrollY - b, behavior: 'instant' }), heroBottom)
    await frames(page, 3)
    await Promise.all([page.waitForURL(BASE + PATH.zh), page.click('.lang a:not(.on)')])
    await page.waitForLoadState('load')
    await frames(page, 3)
    const probe = () => page.evaluate(() => ({ block: document.querySelector('.hero .cta').getBoundingClientRect().bottom, title: document.querySelector('#features h2').getBoundingClientRect().top, y: scrollY }))
    const restored = await probe()
    await landed(page, 6000)
    await frames(page, 3)
    const after = await probe()
    const id = `Failure A7 hero bottom ${heroBottom}, anchoring ${anchoring ? 'on' : 'off'}`
    branches.add(restored.block <= 58 ? 'above' : 'in view')
    if (restored.block <= 58) check(id, 'the block above the view: the features title stays where it was', { restored, after }, Math.abs(after.title - restored.title) <= 1)
    else check(id, 'the block in view: it changes in view, and the page does not scroll', { restored, after }, after.y === restored.y && after.title - restored.title > 10)
    await context.close()
  }
}
check('Failure A7 positions', 'the positions reach both branches: the block above the view, and in view', [...branches], branches.size === 2)

// ── Copy: the state copy against the confirmed prototype's table ─────────────────────────────────────
{
  const { ui } = await import(pathToFileURL(join(ROOT, 'site/src/i18n/ui.ts')).href)
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(pathToFileURL(join(ROOT, 'docs/prototypes/landing-page/prototype-landing.html')).href)
  const T = await page.evaluate(() => JSON.parse(JSON.stringify(T, (k, v) => (typeof v === 'function' ? v('<v>') : v))))
  for (const lang of ['zh', 'en']) {
    const p = T[lang]
    const f = ui[lang].download.formal
    const t = ui[lang].download.test
    const v = (s) => s.replace('{version}', '<v>')
    const pairs = [
      ['formal hero', p.download, v(f.hero)], ['every version', p.allVersions, f.every], ['formal line', p.dlSub, v(f.line)],
      ['download', p.dlPrimary, f.download], ['github', p.dlGithub, f.github],
      ['test hero', p.downloadBeta, v(t.hero)], ['pill', p.testPill, t.pill], ['note', p.betaNote, t.note],
      ['test line', p.dlSubBeta, v(t.line)], ['test button', p.dlBeta, t.button]
    ]
    for (const [what, proto, site] of pairs) check(`copy ${lang}`, `${what}: the site’s copy equals the confirmed prototype’s`, proto === site ? 'equal' : { proto, site }, proto === site)
  }
  await context.close()
}

await browser.close()
const escapeCjk = (text) => text.replace(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
writeFileSync(join(HERE, 'results.json'), escapeCjk(JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2)) + '\n')
const failed = results.filter((r) => !r.pass)
console.log(`${results.length} measurements, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
