// In-app measurements for ADR-0034, under Electron (CONTEXT: main-process file I/O is measured under Electron):
// the built app on this machine's real agent data, with a copy of the real userData's own files so the startup
// shows the restored data and runs its scan. Prints timings and counts only — no question text is printed.
// usage: node measure.mjs <worktree>
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const worktree = process.argv[2]
const require = createRequire(join(worktree, 'package.json'))
const { _electron: electron } = require('@playwright/test')

const real = join(homedir(), 'Library', 'Application Support', 'agentshed')
const files = ['token-cache.json', 'display-cache.json', 'usage-archive.json', 'prefs.json']
const run = mkdtempSync(join(tmpdir(), 'agentshed-measure-run-'))
const pristine = mkdtempSync(join(tmpdir(), 'agentshed-measure-pristine-'))
for (const f of files) if (existsSync(join(real, f))) { copyFileSync(join(real, f), join(run, f)); copyFileSync(join(real, f), join(pristine, f)) }

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const t0 = Date.now()
const app = await electron.launch({
  args: ['.', `--user-data-dir=${run}`],
  cwd: worktree,
  env: { ...process.env, NODE_ENV: 'production', AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US', ...(process.env.MEASURE_RESCAN_MS ? { AGENTSHED_RESCAN_MS: process.env.MEASURE_RESCAN_MS } : {}) }
})
try {
  const win = await app.firstWindow()
  await win.locator('.rail .ri').first().waitFor()
  const scanAtOpen = await win.locator('.startup-display-hint').first().getAttribute('data-state')
  const tClick = Date.now()
  await win.locator('.rail .ri').nth(2).click()
  let tOn = null
  let tOff = null
  for (;;) {
    const on = (await win.locator('.gsearch .reading-hint').count()) > 0
    if (on && tOn === null) tOn = Date.now()
    if (!on && tOn !== null) { tOff = Date.now(); break }
    if (!on && tOn === null && Date.now() - tClick > 3000) break
    await new Promise((r) => setTimeout(r, 25))
  }
  const scanAtReadEnd = await win.locator('.gsearch .startup-display-hint').getAttribute('data-state')
  const placeholder = await win.locator('.gsearch .sbar input').getAttribute('placeholder')
  console.log(JSON.stringify({ launchToClickMs: tClick - t0, scanAtOpen, readingHintShownAfterMs: tOn && tOn - tClick, readingMs: tOn && tOff && tOff - tClick, scanAtReadEnd, placeholder }))
  // The scan finishes; the searches are timed from the renderer, IPC and validation included
  await win.locator('.gsearch .startup-display-hint[data-state="ready"]').waitFor({ state: 'attached', timeout: 600000 })
  console.log(JSON.stringify({ scanReadyAfterLaunchMs: Date.now() - t0 }))
  for (const k of ['a', 'e', 'the', 'notarize', '\u6743\u9650', 'zz-no-such-keyword']) {
    const runs = []
    let shape = null
    for (let n = 0; n < 7; n++) {
      const r = await win.evaluate(async (kw) => {
        const t = performance.now()
        const res = await window.agentshed.globalSearch(kw)
        return { ms: performance.now() - t, sessions: res.sessions.length, projects: new Set(res.sessions.map((s) => s.project.path)).size, hits: res.sessions.reduce((n, s) => n + s.hits.length, 0) }
      }, k)
      runs.push(r.ms)
      shape = r
    }
    console.log(JSON.stringify({ keywordLength: k.length, ascii: /^[\x00-\x7f]*$/.test(k), medianMs: Math.round(median(runs) * 10) / 10, maxMs: Math.round(Math.max(...runs) * 10) / 10, hits: shape.hits, sessions: shape.sessions, projects: shape.projects }))
  }
  // CON-001: texts of questions that are not a session's first (so not its title) — none may be found in a file
  // of the userData copy more often than in the pristine copy taken before the run
  const sample = await win.evaluate(async () => {
    const res = await window.agentshed.globalSearch('the')
    return res.sessions.flatMap((s) => s.hits.filter((h) => h.i > 1 && h.text.length > 40).map((h) => h.text.slice(0, 60))).slice(0, 25)
  })
  await app.close()
  const count = (dir, needle) => {
    let n = 0
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (!statSync(p).isFile()) continue
      const buf = readFileSync(p)
      const b = Buffer.from(needle, 'utf8')
      for (let i = buf.indexOf(b); i !== -1; i = buf.indexOf(b, i + 1)) n++
    }
    return n
  }
  const rows = sample.map((t, i) => ({ sample: i + 1, inRunCopy: count(run, t), inPristineCopy: count(pristine, t) }))
  console.log(JSON.stringify({ con001Samples: rows.length, filesInRunCopy: readdirSync(run).filter((f) => statSync(join(run, f)).isFile()), gained: rows.filter((r) => r.inRunCopy > r.inPristineCopy) }))
} finally {
  try { await app.close() } catch { /* closed above */ }
  rmSync(run, { recursive: true, force: true })
  rmSync(pristine, { recursive: true, force: true })
}
