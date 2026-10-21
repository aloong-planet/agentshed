import { copyFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const worktree = process.argv[2], out = process.argv[3]
const require = createRequire(join(worktree, 'package.json'))
const { _electron: electron } = require('@playwright/test')
const real = join(homedir(), 'Library', 'Application Support', 'agentshed')
const run = mkdtempSync(join(tmpdir(), 'agentshed-narrow-'))
for (const f of ['token-cache.json', 'display-cache.json', 'usage-archive.json', 'prefs.json']) if (existsSync(join(real, f))) copyFileSync(join(real, f), join(run, f))
const app = await electron.launch({ args: ['.', `--user-data-dir=${run}`], cwd: worktree, env: { ...process.env, NODE_ENV: 'production', AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US' } })
const measure = (win) => win.evaluate(() => {
  const head = document.querySelector('.pane-head'), row = head.querySelector('.exits')
  const hr = head.getBoundingClientRect(), cs = getComputedStyle(head)
  const contentRight = hr.right - parseFloat(cs.paddingRight)
  return {
    paneHeadWidth: Math.round(hr.width),
    rowRight: Math.round(row.getBoundingClientRect().right), contentRight: Math.round(contentRight),
    rowHeight: Math.round(row.getBoundingClientRect().height),
    exits: [...row.querySelectorAll('.sback')].map((b) => { const s = b.querySelector('span'); return { buttonRight: Math.round(b.getBoundingClientRect().right), spanClient: s.clientWidth, spanScroll: s.scrollWidth, cut: s.scrollWidth > s.clientWidth, lines: (() => { const r = document.createRange(); r.selectNodeContents(s); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size })() } })
  }
})
try {
  const win = await app.firstWindow()
  await win.locator('.rail .ri').nth(2).click()
  await win.locator('.gsearch .sbar input').fill('e')
  await win.locator('.gsearch .hit').first().click({ timeout: 120000 })
  await win.locator('.pane-head .exits .sback').nth(1).waitFor({ timeout: 60000 })
  console.log('wide', JSON.stringify(await measure(win)))
  for (const w of [640, 560, 500]) {
    await app.evaluate(({ BrowserWindow }, w) => { const b = BrowserWindow.getAllWindows()[0]; b.setMinimumSize(200, 200); b.setSize(w, 800) }, w)
    await win.waitForTimeout(600)
    console.log('width', w, JSON.stringify(await measure(win)))
    await win.screenshot({ path: join(out, `narrow-${w}.png`) })
  }
} finally { await app.close(); rmSync(run, { recursive: true, force: true }) }
