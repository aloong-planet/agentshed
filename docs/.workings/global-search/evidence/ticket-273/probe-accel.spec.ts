import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

for (const how of ['playwright-keyboard', 'sendInputEvent'] as const) {
  test(`probe: does ${how} reach the menu accelerator Cmd+,`, async () => {
    const home = mkdtempSync(join(tmpdir(), 'probe-home-'))
    const ud = mkdtempSync(join(tmpdir(), 'probe-ud-'))
    mkdirSync(join(home, 'p'), { recursive: true })
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [join(home, 'p')]: {} } }))
    const app = await electron.launch({ args: ['.', `--user-data-dir=${ud}`], env: { ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US' } })
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('.rail')
      await expect(win.locator('.app')).toHaveClass(/dim-agents/)
      if (how === 'playwright-keyboard') await win.keyboard.press('Meta+Comma')
      else await app.evaluate(({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0].webContents
        wc.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['meta'] })
        wc.sendInputEvent({ type: 'keyUp', keyCode: ',', modifiers: ['meta'] })
      })
      await win.waitForTimeout(1500)
      const cls = await win.locator('.app').getAttribute('class')
      console.log(`PROBE ${how}: ${cls}`)
    } finally {
      await app.close()
      rmSync(home, { recursive: true, force: true }); rmSync(ud, { recursive: true, force: true })
    }
  })
}
