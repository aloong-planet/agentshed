// A launch refused the single-instance lock because it cannot write its settings directory (docs/specs/i18n.md, The main
// process emits no natural language), through the real index.ts, which has no unit tests. refused-launch.test.ts covers
// the decision and the sentence.
//
// Gaps, by reading only: the dialog itself and a full disk. A modal dialog takes the foreground and waits for a click, so
// AGENTSHED_NO_FOREGROUND sends the sentence to stderr instead, on every platform.
import { spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { closeApp } from './close-app'

test.skip(process.getuid?.() === 0, 'a mode does not hold back root')

/** The electron package resolves its binary, honouring the quiet copy the global setup points it at */
const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string

interface Fixture { home: string; userData: string }

function fixture(): Fixture {
  // Resolved: the app names the directory as it reaches it, and macOS's temporary directory sits behind a link
  return { home: mkdtempSync(join(tmpdir(), 'agentshed-refused-home-')), userData: realpathSync(mkdtempSync(join(tmpdir(), 'agentshed-refused-data-'))) }
}
function cleanup(f: Fixture): void {
  chmodSync(f.userData, 0o755)
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}

/** Launched as Playwright launches the app: on Linux its launcher prepends --no-sandbox, without which Chromium's sandbox
 * kills the process before it ever reaches the lock */
function launchUntilExit(f: Fixture): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  const args = ['.', `--user-data-dir=${f.userData}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])]
  const env = { ...(process.env as Record<string, string>), NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: f.home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US' }
  return new Promise((resolve, reject) => {
    const app = spawn(ELECTRON, args, { env, stdio: ['ignore', 'ignore', 'pipe'] })
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

test('at mode 555 the app exits non-zero with the sentence naming the directory, in the system\'s language when none is stored', async () => {
  const f = fixture()
  try {
    chmodSync(f.userData, 0o555)
    const exit = await launchUntilExit(f)
    expect({ code: exit.code, signal: exit.signal }).toEqual({ code: 1, signal: null })
    expect(exit.stderr).toContain(`Agentshed can’t write to its settings directory, which may be read-only or on a full disk:\n\n${f.userData}`)
  } finally {
    cleanup(f)
  }
})

test('at mode 555 the sentence is in the stored language, over the system\'s', async () => {
  const f = fixture()
  try {
    writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ language: 'zh' }))
    chmodSync(f.userData, 0o555)
    const exit = await launchUntilExit(f)
    expect({ code: exit.code, signal: exit.signal }).toEqual({ code: 1, signal: null })
    expect(exit.stderr).toContain(`Agentshed 无法写入设置目录，这个目录可能是只读的，或所在磁盘已满：\n\n${f.userData}`)
  } finally {
    cleanup(f)
  }
})

test('with a first instance running and the directory gone unwritable, the launch still ends, and the first is told', async () => {
  const f = fixture()
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${f.userData}`],
    env: { ...(process.env as Record<string, string>), NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: f.home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US' }
  })
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
