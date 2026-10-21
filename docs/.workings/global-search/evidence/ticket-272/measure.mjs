// The session page's exits row, measured against the confirmed session page prototype: computed styles of the
// row and of each exit, at rest and hovered, in light and dark. The app runs built, on a copy of this machine's
// real userData files and its real agent data; a session is opened from the first global search hit. Prints style
// values only — no question text.
// usage: node measure.mjs <worktree>
import { copyFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const worktree = process.argv[2]
const require = createRequire(join(worktree, 'package.json'))
const { _electron: electron, chromium } = require('@playwright/test')

const PROPS = ['display', 'gap', 'fontSize', 'color', 'backgroundColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius', 'whiteSpace', 'marginBottom', 'alignItems']
const read = (loc) => loc.evaluate((el, props) => { const cs = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, cs[p]])) }, PROPS)
// The app follows the system's colour scheme; a prototype takes it from the prototypes' settings, which set
// html[data-demo-mode] (it does not follow the system), so each side is switched its own way
async function measure(page, row, exits, scheme, prototype = false) {
  if (prototype) await page.evaluate((m) => document.documentElement.setAttribute('data-demo-mode', m), scheme)
  else await page.emulateMedia({ colorScheme: scheme })
  await page.mouse.move(0, 0)
  const out = { row: await read(row), exits: [] }
  for (let i = 0; i < (await exits.count()); i++) {
    const e = exits.nth(i)
    const rest = await read(e)
    await e.hover()
    const hover = await read(e)
    const icon = await e.locator('svg').evaluate((s) => ({ w: s.getAttribute('width'), d: s.querySelector('path')?.getAttribute('d') }))
    out.exits.push({ rest, hover: { color: hover.color, backgroundColor: hover.backgroundColor }, icon })
    await page.mouse.move(0, 0)
  }
  return out
}

const real = join(homedir(), 'Library', 'Application Support', 'agentshed')
const run = mkdtempSync(join(tmpdir(), 'agentshed-measure-run-'))
for (const f of ['token-cache.json', 'display-cache.json', 'usage-archive.json', 'prefs.json']) if (existsSync(join(real, f))) copyFileSync(join(real, f), join(run, f))
const app = await electron.launch({ args: ['.', `--user-data-dir=${run}`], cwd: worktree, env: { ...process.env, NODE_ENV: 'production', AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US' } })
const result = {}
try {
  const win = await app.firstWindow()
  await win.locator('.rail .ri').nth(2).click()
  await win.locator('.gsearch .sbar input').fill('e')
  await win.locator('.gsearch .hit').first().click({ timeout: 120000 })
  await win.locator('.pane-head .exits .sback').nth(1).waitFor({ timeout: 60000 })
  for (const scheme of ['light', 'dark']) result[`app-${scheme}`] = await measure(win, win.locator('.pane-head .exits'), win.locator('.pane-head .exits .sback'), scheme)
} finally {
  await app.close()
  rmSync(run, { recursive: true, force: true })
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(pathToFileURL(join(worktree, 'docs/prototypes/session-view/prototype-session.html')).href)
  await page.locator('button[data-origin="search"]').click()
  await page.locator('#backSearch').waitFor()
  const exits = page.locator('.exits .back:visible')
  for (const scheme of ['light', 'dark']) result[`prototype-${scheme}`] = await measure(page, page.locator('.exits'), exits, scheme, true)
} finally {
  await browser.close()
}
console.log(JSON.stringify(result, null, 1))
