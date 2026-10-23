import type {} from '../src/renderer/src/env'
// "Check for Updates…" in the application menu (docs/specs/app-update.md, REQ-005, US-003/AC-01, AC-03–AC-05,
// Failures A6, B2, D4, G2, G6) through the real IPC chain and the real renderer, with the scripted update source
// (AGENTSHED_UPDATE_SCRIPT, which also stands in for "packaged"). The native menu cannot be clicked by
// Playwright: the item is taken from the application menu in the main process by its id and its own click is
// called, which runs the same handler a click does. What macOS draws is accepted by hand (a screenshot).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

interface Fixture {
  home: string
  userData: string
  script: string
}

function fixture(): Fixture {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-menu-upd-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-menu-upd-data-'))
  return { home, userData, script: join(home, 'update.json') }
}
function cleanup(f: Fixture): void {
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}
function launch(f: Fixture, opts: { updates?: boolean } = {}): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', `--user-data-dir=${f.userData}`],
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: f.home,
      AGENTSHED_NO_FOREGROUND: '1',
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
      ...(opts.updates === false ? {} : { AGENTSHED_UPDATE_SCRIPT: f.script })
    }
  })
}
function script(f: Fixture, s: object): void {
  writeFileSync(f.script, JSON.stringify(s))
}
/** Every request the scripted source received, in order: "check" or "install" */
function requests(f: Fixture): string[] {
  const log = `${f.script}.log`
  return existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
}

/** The application menu's first submenu as built: each item's role, id or type, label and enabled flag */
async function appMenu(app: ElectronApplication): Promise<Array<{ key: string; label: string; enabled: boolean }>> {
  return app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items[0]?.submenu?.items ?? []).map((i) => ({
      key: i.role ?? (i.id || i.type),
      label: i.label,
      enabled: i.enabled
    }))
  )
}
/** Clicks "Check for Updates…" the way the menu does: its own click handler, in the main process */
async function clickMenuCheck(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('checkForUpdates')
    if (!item) throw new Error('no "Check for Updates…" item in the application menu')
    // Electron types the item's click as a bare Function; it takes no argument the handler reads
    ;(item.click as () => void)()
  })
}
/** Records every toast that appears from now on, whatever its lifetime, as "kind: text" */
async function recordToasts(win: Page): Promise<() => Promise<string[]>> {
  // The host is the app's own, mounted with the window's first render
  await win.waitForSelector('.toasts', { state: 'attached' })
  await win.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { __toasts: string[] }).__toasts = seen
    const host = document.querySelector('.toasts')
    if (!host) throw new Error('no toast host')
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n instanceof HTMLElement && n.classList.contains('toast')) {
            seen.push(`${n.classList.contains('err') ? 'err' : 'ok'}: ${n.textContent ?? ''}`)
          }
        }
      }
    }).observe(host, { childList: true })
  })
  return () => win.evaluate(() => [...(window as unknown as { __toasts: string[] }).__toasts])
}
/** The launch check has finished: the lifecycle is idle again after its request */
async function launchCheckDone(win: Page, f: Fixture): Promise<void> {
  await expect.poll(() => requests(f).length).toBeGreaterThanOrEqual(1)
  await expect.poll(() => win.evaluate(() => window.agentshed.getUpdateState().then((s) => s.phase))).toBe('idle')
}

test('the item sits directly below "About" and reports up to date, a failure, and a malformed answer as a failure (REQ-005, US-003/AC-01, A6)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await launchCheckDone(win, f)
    const items = await appMenu(app)
    expect(items.slice(0, 3).map((i) => i.key)).toEqual(['about', 'checkForUpdates', 'separator'])
    expect(items[1]).toEqual({ key: 'checkForUpdates', label: 'Check for Updates…', enabled: true })
    const toasts = await recordToasts(win)
    const version = await app.evaluate(({ app }) => app.getVersion())

    await clickMenuCheck(app)
    await expect.poll(toasts).toEqual([`ok: Agentshed is up to date (${version})`])
    script(f, { check: 'fail' })
    await clickMenuCheck(app)
    await expect.poll(toasts).toEqual([`ok: Agentshed is up to date (${version})`, 'err: Couldn’t check for updates'])
    script(f, { check: 'found', version: 'v9.9.0', steps: [0], download: 'hold' })
    await clickMenuCheck(app)
    await expect.poll(async () => (await toasts()).at(-1)).toBe('err: Couldn’t check for updates')
    expect(await toasts()).toHaveLength(3)
    expect(requests(f)).toEqual(['check', 'check', 'check', 'check'])
    await expect(win.getByTestId('update-slot')).toHaveCount(0)
  } finally {
    await app.close()
    cleanup(f)
  }
})

test('a menu check that finds an update starts the download, and a failed download adds no second toast (US-003/AC-03, B2)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await launchCheckDone(win, f)
    const toasts = await recordToasts(win)
    const failing = { check: 'found', version: '9.9.0', steps: [0, 20, 40], stepMs: 50, download: 'fail' }
    // Held at its first step until the progress bar has been seen
    script(f, { ...failing, holdFirstStep: true })
    await clickMenuCheck(app)
    await expect.poll(toasts).toEqual(['ok: Version 9.9.0 found — downloading in the background'])
    await expect(win.getByTestId('update-slot')).toHaveAttribute('role', 'progressbar')
    script(f, failing)
    // The download fails: the button goes, and nothing more is said. Notices reach the window in order, so any the
    // failure sent come before a later menu check's own
    await expect(win.getByTestId('update-slot')).toHaveCount(0, { timeout: 10_000 })
    const version = await app.evaluate(({ app }) => app.getVersion())
    script(f, { check: 'upToDate' })
    await clickMenuCheck(app)
    await expect.poll(toasts).toEqual(['ok: Version 9.9.0 found — downloading in the background', `ok: Agentshed is up to date (${version})`])
  } finally {
    await app.close()
    cleanup(f)
  }
})

test('a menu check while an update downloads, is ready or installs reports that state and makes no request (US-003/AC-04)', async () => {
  const f = fixture()
  const found = { check: 'found', version: '9.9.0', steps: [0, 40, 80, 100], stepMs: 50, download: 'complete', install: 'hold' }
  // Held at its first step until the menu check has asked while it downloads, however late the window shows
  script(f, { ...found, holdFirstStep: true })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(win.getByTestId('update-slot')).toHaveAttribute('role', 'progressbar')
    const toasts = await recordToasts(win)
    await clickMenuCheck(app)
    await expect.poll(toasts).toEqual(['ok: Version 9.9.0 found — downloading in the background'])
    script(f, found)
    await expect(win.getByTestId('update-slot')).toHaveAttribute('aria-label', 'Update available', { timeout: 10_000 })
    await clickMenuCheck(app)
    await expect.poll(async () => (await toasts()).at(-1)).toBe('ok: Version 9.9.0 is ready to install')
    await win.getByTestId('update-slot').click()
    await expect(win.locator('.upd-spin')).toHaveCount(1)
    await clickMenuCheck(app)
    await expect.poll(async () => (await toasts()).at(-1)).toBe('ok: Installing update…')
    // Only the launch check and the click's install reached the source
    expect(requests(f)).toEqual(['check', 'install'])
  } finally {
    await app.close()
    cleanup(f)
  }
})

test('menu and settings checks in quick succession join into one request, each surface reporting in its own form (D4, US-003/AC-05)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await launchCheckDone(win, f)
    await win.locator('.ri.set').click()
    const toasts = await recordToasts(win)
    const version = await app.evaluate(({ app }) => app.getVersion())

    // Settings first, then the menu; the check held in flight until the menu has asked (its click runs in the main
    // process, so it has asked once the evaluation returns)
    script(f, { check: 'upToDate', holdCheck: true })
    await win.getByTestId('version-action').click()
    await expect(win.getByTestId('update-line')).toHaveText('Checking…')
    await clickMenuCheck(app)
    script(f, { check: 'upToDate' })
    await expect(win.getByTestId('update-line')).toHaveText('You’re up to date')
    await expect.poll(toasts).toEqual([`ok: Agentshed is up to date (${version})`])
    expect(requests(f)).toEqual(['check', 'check'])

    // The menu first, then settings; the check held in flight until settings has asked. The window's requests reach
    // the main process in order, so once a later one is answered, the click's own has arrived
    script(f, { check: 'fail', holdCheck: true })
    await clickMenuCheck(app)
    await expect.poll(() => win.evaluate(() => window.agentshed.getUpdateState().then((s) => s.phase))).toBe('checking')
    await win.getByTestId('version-action').click()
    await win.evaluate(() => window.agentshed.getSettingsCheck())
    script(f, { check: 'fail' })
    await expect(win.getByTestId('update-line')).toHaveText('Couldn’t check for updates')
    await expect.poll(toasts).toEqual([`ok: Agentshed is up to date (${version})`, 'err: Couldn’t check for updates'])
    expect(requests(f)).toEqual(['check', 'check', 'check'])
  } finally {
    await app.close()
    cleanup(f)
  }
})

test('the item follows a language switch at once; a toast already shown keeps its language and stacks with the new one (G2, G6)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await launchCheckDone(win, f)
    await win.locator('.ri.set').click()
    const version = await app.evaluate(({ app }) => app.getVersion())
    await clickMenuCheck(app)
    await expect(win.locator('.toast.ok')).toHaveText(`Agentshed is up to date (${version})`)
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator('[data-lang="zh"]').click()
    await expect.poll(async () => (await appMenu(app))[1]?.label).toBe('检查更新…')
    // The update toast keeps its English; the language switch's own toast stacks under it
    await expect(win.locator('.toast')).toHaveCount(2)
    await expect(win.locator('.toast').first()).toHaveText(`Agentshed is up to date (${version})`)
  } finally {
    await app.close()
    cleanup(f)
  }
})

test('a development run disables the item, and a click on it reports nothing (US-005/AC-02)', async () => {
  const f = fixture()
  const app = await launch(f, { updates: false })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('.rail')
    const items = await appMenu(app)
    expect(items[1]).toEqual({ key: 'checkForUpdates', label: 'Check for Updates…', enabled: false })
    const toasts = await recordToasts(win)
    await clickMenuCheck(app)
    await win.waitForTimeout(800)
    expect(await toasts()).toEqual([])
  } finally {
    await app.close()
    cleanup(f)
  }
})
