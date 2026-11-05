// A launch refused the single-instance lock because it cannot write its settings directory (docs/specs/i18n.md, The main
// process emits no natural language), through the real index.ts, which has no unit tests. refused-launch.test.ts covers
// the decision and the sentence.
//
// Gaps, by reading only: the dialog itself and a full disk. A modal dialog takes the foreground and waits for a click, so
// AGENTSHED_NO_FOREGROUND sends the sentence to stderr instead, on every platform.
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp } from './close-app'
import { startApp } from './support/launch'

test.skip(process.getuid?.() === 0, 'a mode does not hold back root')

/** The electron package resolves its binary, honouring the quiet copy the global setup points it at */
const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string

interface Fixture { home: string; userData: string; script: string }

function fixture(): Fixture {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-refused-home-'))
  const script = join(home, 'update.json')
  // An update check logs itself beside this file: a launch that started up, with automatic checks on, leaves that log
  writeFileSync(script, JSON.stringify({ check: 'upToDate' }))
  // Resolved: the app names the directory as it reaches it, and macOS's temporary directory sits behind a link
  return { home, script, userData: realpathSync(mkdtempSync(join(tmpdir(), 'agentshed-refused-data-'))) }
}
function cleanup(f: Fixture): void {
  chmodSync(f.userData, 0o755)
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}
const launchEnv = (f: Fixture, systemLanguages = 'en-US'): Record<string, string> => ({
  ...(process.env as Record<string, string>),
  NODE_ENV: 'production',
  AGENTSHED_HOME_OVERRIDE: f.home,
  AGENTSHED_NO_FOREGROUND: '1',
  AGENTSHED_SYSTEM_LANGUAGES: systemLanguages,
  AGENTSHED_UPDATE_SCRIPT: f.script
})

/** Launched as Playwright launches the app: on Linux its launcher prepends --no-sandbox, without which Chromium's sandbox
 * kills the process before it ever reaches the lock */
function launchUntilExit(f: Fixture, systemLanguages?: string): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  const args = ['.', `--user-data-dir=${f.userData}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])]
  return new Promise((resolve, reject) => {
    const app = spawn(ELECTRON, args, { env: launchEnv(f, systemLanguages), stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    app.stderr.on('data', (b: Buffer) => { stderr += b.toString() })
    const timer = setTimeout(() => {
      app.kill()
      reject(new Error('the launch did not exit'))
    }, 20_000)
    app.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stderr })
    })
  })
}

test('at mode 555 the app exits non-zero with the sentence naming the directory, in the system\'s language when none is stored, and starts nothing', async () => {
  const f = fixture()
  try {
    chmodSync(f.userData, 0o555)
    const exit = await launchUntilExit(f, 'zh-CN')
    expect({ code: exit.code, signal: exit.signal }).toEqual({ code: 1, signal: null })
    expect(exit.stderr).toContain(`Agentshed 无法写入设置目录，这个目录可能是只读的，或所在磁盘已满：\n\n${f.userData}`)
    // Shown once the event loop runs, not while the module loads, where it is missing from the accessibility tree
    expect(exit.stderr).toContain('ready: true')
    // settings-updates' case on a file that cannot be read is the control: its readable launch logs a check here
    expect(existsSync(`${f.script}.log`)).toBe(false)
  } finally {
    cleanup(f)
  }
})

test('at mode 555 the sentence is in the stored language, over the system\'s', async () => {
  const f = fixture()
  try {
    writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ theme: 'blue', language: 'en', mode: 'dark', trendSpan: 90, autoCheckUpdates: true }))
    chmodSync(f.userData, 0o555)
    const exit = await launchUntilExit(f, 'zh-CN')
    expect({ code: exit.code, signal: exit.signal }).toEqual({ code: 1, signal: null })
    expect(exit.stderr).toContain(`Agentshed can’t write to its settings directory, which may be read-only or on a full disk:\n\n${f.userData}`)
  } finally {
    cleanup(f)
  }
})

test('with a first instance running and the directory gone unwritable, the launch still ends, and the first is told', async () => {
  const f = fixture()
  const { app } = await startApp({ userData: f.userData, home: f.home, env: { AGENTSHED_UPDATE_SCRIPT: f.script } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('.rail .ri')
    await app.evaluate(({ app: running }) => {
      const seen = globalThis as unknown as { secondInstances: number }
      seen.secondInstances = 0
      running.on('second-instance', () => { seen.secondInstances++ })
    })
    chmodSync(f.userData, 0o555)
    // On macOS ready never arrives in this launch, so without its bound it would run on with nothing on screen
    const exit = await launchUntilExit(f)
    expect({ code: exit.code, signal: exit.signal }).toEqual({ code: 1, signal: null })
    expect(exit.stderr).toContain(`Agentshed can’t write to its settings directory, which may be read-only or on a full disk:\n\n${f.userData}`)
    expect(await app.evaluate(() => (globalThis as unknown as { secondInstances: number }).secondInstances)).toBe(1)
    await expect(win.locator('.rail .ri').first()).toBeVisible()
    chmodSync(f.userData, 0o755)
  } finally {
    chmodSync(f.userData, 0o755)
    await closeApp(app)
    cleanup(f)
  }
})
