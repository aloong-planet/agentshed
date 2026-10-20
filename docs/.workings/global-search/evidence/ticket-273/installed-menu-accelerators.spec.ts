// Probe, run 2026-10-20 from e2e/ (then removed) against the build of the branch's tree before 2843aaf, whose
// application code is 2882abc's: every item of the installed application menu, submenus included, with its
// accelerator ("-" for none). Its output is installed-menu-accelerators.txt beside it.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, _electron as electron } from '@playwright/test'
test('probe: the installed menu accelerators', async () => {
  const home = mkdtempSync(join(tmpdir(), 'probe-home-')); const ud = mkdtempSync(join(tmpdir(), 'probe-ud-'))
  mkdirSync(join(home, 'p'), { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [join(home, 'p')]: {} } }))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${ud}`], env: { ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US' } })
  try {
    const win = await app.firstWindow(); await win.waitForSelector('.rail')
    const all = await app.evaluate(({ Menu }) => { const out: string[] = []; const walk = (items: Electron.MenuItem[]): void => { for (const i of items) { out.push(`${i.id || i.role || i.label} | ${i.accelerator ?? '-'}`); if (i.submenu) walk(i.submenu.items) } }; walk(Menu.getApplicationMenu()?.items ?? []); return out })
    console.log('PROBE ' + JSON.stringify(all))
  } finally { await app.close(); rmSync(home, { recursive: true, force: true }); rmSync(ud, { recursive: true, force: true }) }
})
