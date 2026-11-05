import type {} from '../src/renderer/src/env'
// App updates (docs/specs/app-update.md) through the real IPC chain and the real renderer, with the
// scripted update source the spec's Testing Decisions confirm: AGENTSHED_UPDATE_SCRIPT names a JSON file the
// main process reads at every request and logs every request beside (`<script>.log`). The seam also stands
// in for "packaged", so the lifecycle runs in this unpackaged build. What it cannot reach is the real
// electron-updater ↔ GitHub ↔ system updater path and the restart itself: accepted by evidence once two
// releases exist.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { failOnMainErrors, startApp } from './support/launch'

interface Fixture {
  home: string
  userData: string
  script: string
}

function fixture(): Fixture {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-update-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-update-data-'))
  return { home, userData, script: join(home, 'update.json') }
}
function cleanup(f: Fixture): void {
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}
const mainErrors = failOnMainErrors()
/** For the second instance a case spawns itself, which Playwright does not drive */
const launchEnv = (f: Fixture): Record<string, string> => ({
  ...(process.env as Record<string, string>),
  NODE_ENV: 'production',
  AGENTSHED_HOME_OVERRIDE: f.home,
  AGENTSHED_NO_FOREGROUND: '1',
  AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
  AGENTSHED_UPDATE_SCRIPT: f.script
})
/** `followAppearance`: Playwright pins prefers-color-scheme to light unless told not to, and then a mode
 *  switch never reaches the renderer (see launchAppearance in support/launch.ts) */
function launch(f: Fixture, opts: { followAppearance?: boolean; updates?: boolean; env?: Record<string, string> } = {}): Promise<ElectronApplication> {
  return startApp({
    userData: f.userData,
    home: f.home,
    errors: mainErrors.errors,
    env: {
      // Without the seam the run is a development run: no update source at all (app-update::US-005)
      ...(opts.updates === false ? {} : { AGENTSHED_UPDATE_SCRIPT: f.script }),
      ...opts.env
    },
    ...(opts.followAppearance ? { colorScheme: null } : {})
  }).then((started) => started.app)
}
function script(f: Fixture, s: object): void {
  writeFileSync(f.script, JSON.stringify(s))
}
/** Every request the scripted source received, in order: "check" or "install" */
function requests(f: Fixture): string[] {
  const log = `${f.script}.log`
  return existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
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

const FOUND_HOLDING = { check: 'found', version: '9.9.0', steps: [0, 35], stepMs: 50, download: 'hold' }
const FOUND_READY = { check: 'found', version: '9.9.0', steps: [0, 60, 100], stepMs: 30, download: 'complete', install: 'hold' }

const slot = (win: Page) => win.getByTestId('update-slot')
const tip = (win: Page) => win.getByTestId('update-tip')
/** A bottom-anchored entry's place: its size, its x, and how far its top sits above the window's bottom */
const anchored = async (win: Page, selector: string) =>
  win.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, fromBottom: window.innerHeight - r.y, width: r.width, height: r.height }
  })
const box = async (win: Page, selector: string) =>
  win.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })

/** WCAG relative-luminance contrast of two `rgb(r, g, b)` colours */
function contrast(a: string, b: string): number {
  const lum = (c: string): number => {
    const [r, g, bl] = (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('with no update in flight the slot takes no space; an update in flight sits directly above Settings, which keeps its place (REQ-001/AC-01, US-001/AC-06, appearance D4)', async () => {
  const f = fixture()
  try {
    script(f, { check: 'upToDate' })
    let app = await launch(f)
    let win = await app.firstWindow()
    await expect.poll(() => requests(f)).toEqual(['check'])
    await expect(win.locator('.rail .ri')).toHaveCount(4)
    await expect(slot(win)).toHaveCount(0)
    const idle = { agents: await box(win, '.rail .ri >> nth=0'), projects: await box(win, '.rail .ri >> nth=1'), search: await box(win, '.rail .ri >> nth=2'), settings: await anchored(win, '.ri.set') }
    await closeApp(app)

    script(f, FOUND_HOLDING)
    app = await launch(f)
    win = await app.firstWindow()
    await expect(slot(win)).toBeVisible()
    await expect(win.locator('.rail .ri')).toHaveCount(5)
    // The other entries do not move, and Settings stays at its bottom anchor. Settings is compared by its
    // distance from the window's bottom: on Linux under xvfb two launches can get windows of different inner
    // heights (seen on CI, 27px apart), which moves a bottom-anchored entry by exactly that much
    expect(await box(win, '.rail .ri >> nth=0')).toEqual(idle.agents)
    expect(await box(win, '.rail .ri >> nth=1')).toEqual(idle.projects)
    expect(await box(win, '.rail .ri >> nth=2')).toEqual(idle.search)
    expect(await anchored(win, '.ri.set')).toEqual(idle.settings)
    // Directly above Settings, in a 36px slot, one rail gap apart
    const s = await box(win, '[data-testid="update-slot"]')
    const settings = await box(win, '.ri.set')
    expect([s.width, s.height]).toEqual([36, 36])
    expect(s.x).toBe(settings.x)
    expect(settings.y - (s.y + s.height)).toBe(6)
    await closeApp(app)
  } finally {
    cleanup(f)
  }
})

test('a launch check that finds an update shows the download in the rail at once, with no dialog; the slot cannot be clicked while downloading (US-001/AC-01, REQ-001/AC-02–AC-04)', async () => {
  const f = fixture()
  script(f, FOUND_HOLDING)
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-valuenow', '35')
    expect(await slot(win).evaluate((el) => el.tagName)).toBe('SPAN')
    await expect(slot(win)).toHaveAttribute('role', 'progressbar')
    await expect(slot(win)).toHaveAttribute('aria-label', 'Downloading update 35%')
    await expect(slot(win).locator('.upd-ring')).toBeVisible()
    // Nothing interrupts: one window, and the page the app opened on is still there
    expect(app.windows()).toHaveLength(1)
    await expect(win.locator('.app')).toHaveClass(/dim-agents/)
    // The filled circle
    const dot = await box(win, '[data-testid="update-slot"] .upd-dot')
    expect([dot.width, dot.height]).toEqual([24, 24])
    // The instant message, to the right of the slot and centred on it
    await slot(win).hover()
    await expect(tip(win)).toHaveText('Downloading update 35%')
    const s = await box(win, '[data-testid="update-slot"]')
    const tp = await tip(win).evaluate((el) => {
      const r = (el.parentElement as HTMLElement).getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, bg: getComputedStyle(el.parentElement as HTMLElement).backgroundColor }
    })
    expect(tp.x - (s.x + s.width)).toBe(8)
    expect(Math.abs(tp.y + tp.height / 2 - (s.y + s.height / 2))).toBeLessThanOrEqual(1)
    expect(tp.bg).toBe('rgb(27, 27, 31)')
    // A click while downloading installs nothing
    await slot(win).click()
    await win.waitForTimeout(300)
    expect(requests(f)).toEqual(['check'])
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('an open message follows the progress of the download and stays anchored to the slot (REQ-001/AC-04)', async () => {
  const f = fixture()
  const download = { check: 'found', version: '9.9.0', steps: [0, 20, 40, 60], stepMs: 100, download: 'hold' }
  // Held at 0 until the message is open, however late the window shows
  script(f, { ...download, holdFirstStep: true })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-valuenow', '0')
    await slot(win).hover()
    await expect(tip(win)).toHaveText('Downloading update 0%')
    const where = async () => tip(win).evaluate((el) => {
      const r = (el.parentElement as HTMLElement).getBoundingClientRect()
      return { x: r.x, centre: r.y + r.height / 2 }
    })
    const first = await where()
    // Still open, the message moves on with the download, in the same place
    script(f, download)
    await expect(tip(win)).toHaveText('Downloading update 60%', { timeout: 5000 })
    expect(await where()).toEqual(first)
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('the finished download becomes the ready button; clicking it installs once and shows the spinner (US-001/AC-03, AC-04, REQ-001/AC-03, Failure C10)', async () => {
  const f = fixture()
  script(f, FOUND_READY)
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-label', 'Update available')
    expect(await slot(win).evaluate((el) => el.tagName)).toBe('BUTTON')
    // The download icon (Lucide download's arrow stem) inside the circle
    await expect(slot(win).locator('.upd-dot svg path').first()).toHaveAttribute('d', 'M12 15V3')
    // Focus shows the message as hovering does
    await slot(win).focus()
    await expect(tip(win)).toHaveText('Update available')
    await slot(win).click()
    await expect(slot(win)).toHaveAttribute('aria-label', 'Installing update…')
    await expect(slot(win).locator('.upd-spin')).toBeVisible()
    expect(await slot(win).evaluate((el) => el.tagName)).toBe('SPAN')
    // The spinner cannot be clicked: a second click starts no second install
    await slot(win).click({ force: true })
    await win.waitForTimeout(300)
    expect(requests(f)).toEqual(['check', 'install'])
    await slot(win).hover()
    await expect(tip(win)).toHaveText('Installing update…')
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('a failed install after the click shows the error toast, stacked with any other, and the button goes (REQ-002/AC-03, Failure G6)', async () => {
  const f = fixture()
  script(f, { ...FOUND_READY, install: 'fail' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-label', 'Update available')
    // Another toast on screen first: switching the language announces itself
    await win.getByTitle('Settings').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator('[data-lang="en"]').click()
    await expect(win.locator('.toast.ok')).toHaveCount(1)
    await slot(win).click()
    await expect(win.locator('.toast.err')).toHaveText('Couldn’t install the update')
    // The two stack rather than replace each other
    await expect(win.locator('.toast')).toHaveCount(2)
    await expect(slot(win)).toHaveCount(0)
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('an open message goes with the button, so the button comes back without it (REQ-001/AC-04)', async () => {
  const f = fixture()
  script(f, { ...FOUND_READY, install: 'fail' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-label', 'Update available')
    await slot(win).hover()
    await expect(tip(win)).toHaveText('Update available')
    // The install fails under the pointer: the button goes with its message open
    await slot(win).click()
    await expect(slot(win)).toHaveCount(0)
    await win.mouse.move(600, 400)
    // A second check in the same run, on the same page: a scroll or a resize would close the message
    // anyway, so the button comes back through the real wake path (the main process's clock moved past
    // the period, then the system's resume event)
    script(f, FOUND_HOLDING)
    await app.evaluate(({ powerMonitor }) => {
      const real = Date.now
      Date.now = () => real() + 25 * 60 * 60 * 1000
      powerMonitor.emit('resume')
      Date.now = real
    })
    await expect(slot(win)).toHaveAttribute('role', 'progressbar')
    await expect(tip(win)).toHaveCount(0)
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('a failed automatic check and a failed background download show nothing (REQ-002/AC-01, AC-02)', async () => {
  const f = fixture()
  try {
    // Notices reach the window in order, so any a failure sent come before a later menu check's own: that one alone
    // means the failure said nothing. A retried "no toast" would wait out a toast's 3.2 s and pass
    const saidNothing = async (app: ElectronApplication, toasts: () => Promise<string[]>): Promise<void> => {
      const version = await app.evaluate(({ app }) => app.getVersion())
      script(f, { check: 'upToDate' })
      await clickMenuCheck(app)
      await expect.poll(toasts).toEqual([`ok: Agentshed is up to date (${version})`])
    }

    // Held in flight until the window listens: a launch check that answered at once would be answered before it
    // does, and a notice it sent would never show
    script(f, { check: 'fail', holdCheck: true })
    let app = await launch(f)
    let win = await app.firstWindow()
    let toasts = await recordToasts(win)
    // The request is made and held; once let go it fails, and the lifecycle is idle again
    await expect.poll(() => requests(f)).toEqual(['check'])
    script(f, { check: 'fail' })
    await expect.poll(() => win.evaluate(() => window.agentshed.getUpdateState().then((s) => s.phase))).toBe('idle')
    await expect(slot(win)).toHaveCount(0)
    await saidNothing(app, toasts)
    await closeApp(app)

    const failing = { check: 'found', version: '9.9.0', steps: [0, 30], stepMs: 100, download: 'fail' }
    // Held at its first step until the slot has been seen, however late the window shows
    script(f, { ...failing, holdFirstStep: true })
    app = await launch(f)
    win = await app.firstWindow()
    toasts = await recordToasts(win)
    await expect(slot(win)).toBeVisible()
    script(f, failing)
    await expect(slot(win)).toHaveCount(0, { timeout: 5000 })
    await saidNothing(app, toasts)
    await closeApp(app)
  } finally {
    cleanup(f)
  }
})

test('the circle, its glyph and the message stay distinguishable in every theme, light and dark, and recolour with a switch (REQ-001/AC-05, Failure G3)', async () => {
  const f = fixture()
  script(f, FOUND_READY)
  const app = await launch(f, { followAppearance: true })
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-label', 'Update available')
    await win.getByTitle('Settings').click()
    const accents = new Set<string>()
    for (const mode of ['light', 'dark']) {
      await win.locator(`[data-mode-option="${mode}"]`).click()
      await expect.poll(() => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(mode === 'dark')
      for (const theme of ['purple', 'blue', 'amber']) {
        await win.locator(`[data-theme-option="${theme}"]`).click()
        await expect(win.locator('html')).toHaveAttribute('data-theme', theme)
        await slot(win).hover()
        await expect(tip(win)).toBeVisible()
        const c = await win.evaluate(() => {
          const probe = document.createElement('div')
          document.body.append(probe)
          const resolve = (v: string): string => {
            probe.style.color = `var(${v})`
            return getComputedStyle(probe).color
          }
          const out = {
            accent: resolve('--accent'),
            card: resolve('--card'),
            dot: getComputedStyle(document.querySelector('[data-testid="update-slot"] .upd-dot') as Element).backgroundColor,
            glyph: getComputedStyle(document.querySelector('[data-testid="update-slot"] .upd-dot') as Element).color,
            tipBg: getComputedStyle(document.querySelector('[data-testid="update-tip"]')?.parentElement as Element).backgroundColor,
            tipFg: getComputedStyle(document.querySelector('[data-testid="update-tip"]') as Element).color
          }
          probe.remove()
          return out
        })
        const where = `${theme}/${mode}`
        expect(c.dot, where).toBe(c.accent)
        expect(c.glyph, where).toBe(c.card)
        // The glyph on the circle, and the circle on the rail (card), are both accent against card
        expect(contrast(c.dot, c.glyph), where).toBeGreaterThanOrEqual(3)
        expect(contrast(c.tipBg, c.tipFg), where).toBeGreaterThanOrEqual(7)
        accents.add(c.accent)
        await win.mouse.move(600, 400)
      }
    }
    // Six theme states, six different accents: the circle recoloured with every switch
    expect(accents.size).toBe(6)
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('the installing loader spins, and stands still under reduced motion (REQ-001/AC-02)', async () => {
  const f = fixture()
  script(f, FOUND_READY)
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-label', 'Update available')
    await slot(win).click()
    const spin = slot(win).locator('.upd-spin')
    await expect(spin).toBeVisible()
    expect(await spin.evaluate((el) => getComputedStyle(el).animationName)).toBe('upd-spin')
    await win.emulateMedia({ reducedMotion: 'reduce' })
    expect(await spin.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('an open message follows a language switch at once (Failure G2)', async () => {
  const f = fixture()
  script(f, FOUND_HOLDING)
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-valuenow', '35')
    await win.getByTitle('Settings').click()
    await win.getByTestId('language-trigger').click()
    const pop = win.getByTestId('language-pop')
    await expect(pop).toBeVisible()
    // The pointer rests on the slot while the keyboard picks Chinese in the open list
    await slot(win).hover()
    await expect(tip(win)).toHaveText('Downloading update 35%')
    for (let i = 0; i < 8 && (await pop.locator('.lang-opt.cursor').getAttribute('data-lang')) !== 'zh'; i++) {
      await win.keyboard.press('ArrowDown')
    }
    await win.keyboard.press('Enter')
    await expect(tip(win)).toHaveText('正在下载更新 35%')
    await expect(slot(win)).toHaveAttribute('aria-label', '正在下载更新 35%')
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('with automatic checks turned off the launch makes no request (US-002/AC-01)', async () => {
  const f = fixture()
  writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ theme: 'purple', language: 'en', mode: 'light', trendSpan: 30, autoCheckUpdates: false }))
  script(f, FOUND_READY)
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.rail')).toBeVisible()
    await win.waitForTimeout(1500)
    expect(requests(f)).toEqual([])
    await expect(slot(win)).toHaveCount(0)
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('a second instance launched while an update is ready exits, and the running one keeps the update (Failure G5)', async () => {
  const f = fixture()
  script(f, FOUND_READY)
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await expect(slot(win)).toHaveAttribute('aria-label', 'Update available')
    // The electron package resolves its binary, honouring the quiet copy the global setup points it at
    const bin = createRequire(import.meta.url)('electron') as unknown as string
    // Launched as Playwright launches the first one: on Linux its launcher prepends --no-sandbox, without which
    // Chromium's sandbox kills the process before it ever reaches the single-instance lock
    const args = ['.', `--user-data-dir=${f.userData}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])]
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const second = spawn(bin, args, { env: launchEnv(f), stdio: 'ignore' })
      const timer = setTimeout(() => {
        second.kill()
        reject(new Error('the second instance did not exit'))
      }, 20_000)
      second.on('exit', (code, signal) => {
        clearTimeout(timer)
        resolve({ code, signal })
      })
    })
    expect(exit).toEqual({ code: 0, signal: null })
    await expect(slot(win)).toHaveAttribute('aria-label', 'Update available')
    expect(requests(f)).toEqual(['check'])
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

// "Check for Updates…" in the application menu (docs/specs/app-update.md, REQ-005, US-003/AC-01, AC-03–AC-05,
// Failures A6, B2, D4, G2, G6) through the real IPC chain and the real renderer, with the scripted update source
// (AGENTSHED_UPDATE_SCRIPT, which also stands in for "packaged"). The native menu cannot be clicked by
// Playwright: the item is taken from the application menu in the main process by its id and its own click is
// called, which runs the same handler a click does. What macOS draws is accepted by hand (a screenshot).

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
    await closeApp(app)
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
    await closeApp(app)
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
    await closeApp(app)
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
    await closeApp(app)
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
    await closeApp(app)
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
    await closeApp(app)
    cleanup(f)
  }
})

// The settings "Updates" section (docs/specs/app-update.md, REQ-003, REQ-004, US-002, US-003, US-005) through the
// real IPC chain and the real renderer, with the scripted update source the spec's Testing Decisions confirm
// (AGENTSHED_UPDATE_SCRIPT, read at every request, every request logged beside it; it also stands in for
// "packaged"). The post-update line is driven by seeding the version the previous run recorded in the isolated
// userData (Testing Decisions). A later automatic check is reached through the real wake path: the main
// process's clock is moved past the 24-hour period and the system's resume event is emitted.

function seedRecordedVersion(f: Fixture, content: string): void {
  writeFileSync(join(f.userData, 'last-run-version.json'), content)
}
function storedPrefs(f: Fixture): Record<string, unknown> {
  return JSON.parse(readFileSync(join(f.userData, 'prefs.json'), 'utf8')) as Record<string, unknown>
}

const line = (win: Page) => win.getByTestId('update-line')
const action = (win: Page) => win.getByTestId('version-action')
const option = (win: Page, which: 'on' | 'off') => win.getByTestId('auto-check-seg').locator(`[data-auto-option="${which}"]`)

async function openSettings(win: Page): Promise<void> {
  await win.locator('.ri.set').click()
  await expect(win.getByTestId('updates-field')).toBeVisible()
}
/** A later automatic check through the real wake path (app-update::REQ-006/AC-02) */
async function wakeAfterADay(app: ElectronApplication, hours = 25): Promise<void> {
  await app.evaluate(({ powerMonitor }, ahead) => {
    const real = Date.now
    Date.now = () => real() + ahead * 60 * 60 * 1000
    powerMonitor.emit('resume')
    Date.now = real
  }, hours)
}

test('settings gains "Updates" third, one card with the switch and the version row, and its footnote (REQ-003/AC-01, AC-02, US-002/AC-02)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await expect(win.locator('.settings-sec-t')).toHaveText(['Language', 'Appearance', 'Updates'])
    const rows = win.getByTestId('updates-field').locator('.frow')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('.flabel')).toHaveText('Check for updates automatically')
    await expect(win.getByTestId('auto-check-seg').getByRole('radio')).toHaveText(['On', 'Off'])
    // On in a fresh installation
    await expect(option(win, 'on')).toHaveAttribute('aria-checked', 'true')
    const version = await app.evaluate(({ app }) => app.getVersion())
    await expect(rows.nth(1).locator('.flabel')).toHaveText(`Current version ${version}`)
    await expect(action(win)).toHaveText('Check now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    // The automatic launch check reports nothing here: the line is the settings check's
    await launchCheckDone(win, f)
    await expect(line(win)).toHaveText('')
    await expect(win.getByTestId('updates-foot')).toHaveText(
      'New versions download in the background. When one is ready, click the update button at the bottom left to install it and restart; otherwise it installs when you quit.'
    )
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('"Check now" shows checking with the button unavailable, then up to date or the failure; a malformed answer is a failure (US-003/AC-02, D2, A6)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await launchCheckDone(win, f)
    // Held in flight until the click below has been made
    script(f, { check: 'upToDate', holdCheck: true })
    await action(win).click()
    await expect(line(win)).toHaveText('Checking…')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'true')
    // A click while its own check runs asks nothing more. Forced: Playwright waits for an aria-disabled
    // control to become available, which would land the click after the check
    await action(win).click({ force: true })
    script(f, { check: 'upToDate' })
    await expect(line(win)).toHaveText('You’re up to date')
    await expect(line(win)).toHaveClass(/\bok\b/)
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    expect(requests(f)).toEqual(['check', 'check'])

    script(f, { check: 'fail' })
    await action(win).click()
    await expect(line(win)).toHaveText('Couldn’t check for updates')
    await expect(line(win)).toHaveClass(/\berr\b/)

    script(f, { check: 'found', version: 'v9.9.0', steps: [0], download: 'hold' })
    await action(win).click()
    await expect.poll(() => requests(f).length).toBe(4)
    await expect(line(win)).toHaveText('Couldn’t check for updates')
    await expect(win.getByTestId('update-slot')).toHaveCount(0)
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('a settings check that finds an update starts the download: the line and the rail follow it, and "Check now" is unavailable (US-003/AC-02, AC-03, REQ-004/AC-01)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await launchCheckDone(win, f)
    script(f, { check: 'found', version: '9.9.0', steps: [0, 35], stepMs: 50, download: 'hold' })
    await action(win).click()
    await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
    await expect(win.getByTestId('update-slot')).toHaveAttribute('role', 'progressbar')
    await expect(action(win)).toHaveText('Check now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'true')
    await action(win).click({ force: true })
    await win.waitForTimeout(500)
    expect(requests(f)).toEqual(['check', 'check'])
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('the download finishing turns the same button into "Install now"; it installs once, then stays unavailable while installing (REQ-003/AC-04, C10, C11, CON-004)', async () => {
  const f = fixture()
  const found = { check: 'found', version: '9.9.0', steps: [0, 40, 80, 100], stepMs: 50, download: 'complete', install: 'hold' }
  // Held at its first step until the downloading button has been taken, however late the window shows
  script(f, { ...found, holdFirstStep: true })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
    await expect(action(win)).toHaveText('Check now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'true')
    const button = await action(win).elementHandle()
    script(f, found)
    await expect(line(win)).toHaveText('Version 9.9.0 is ready to install', { timeout: 10_000 })
    await expect(line(win)).toHaveClass(/\bok\b/)
    await expect(action(win)).toHaveText('Install now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    // Relabelled where it stands: the same element
    expect(await button?.evaluate((el) => el.isConnected && el.textContent)).toBe('Install now')
    // Nothing installs without the click
    expect(requests(f)).toEqual(['check'])
    await action(win).click()
    await expect(line(win)).toHaveText('Installing update…')
    await expect(action(win)).toHaveText('Install now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'true')
    await expect(win.locator('.upd-spin')).toHaveCount(1)
    await action(win).click({ force: true })
    await win.getByTestId('update-slot').click({ force: true })
    await expect.poll(() => requests(f)).toEqual(['check', 'install'])
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('an install from "Install now" that fails: the error toast, "Check now" available again and an empty line (REQ-002/AC-03, C11)', async () => {
  const f = fixture()
  script(f, { check: 'found', version: '9.9.0', steps: [0, 100], stepMs: 30, download: 'complete', install: 'fail' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await expect(action(win)).toHaveText('Install now')
    await action(win).click()
    await expect(win.locator('.toast.err')).toHaveText('Couldn’t install the update')
    await expect(action(win)).toHaveText('Check now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    await expect(line(win)).toHaveText('')
    await expect(win.getByTestId('update-slot')).toHaveCount(0)
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('a settings "up to date", then an automatic check finds an update: the line follows it, and after a failed download it is empty (REQ-004/AC-02, D5, B2)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await launchCheckDone(win, f)
    await action(win).click()
    await expect(line(win)).toHaveText('You’re up to date')
    const failing = { check: 'found', version: '9.9.0', steps: [0, 20, 40], stepMs: 50, download: 'fail' }
    // Held at its first step until the line has shown the download
    script(f, { ...failing, holdFirstStep: true })
    await wakeAfterADay(app)
    await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
    script(f, failing)
    await expect(line(win)).toHaveText('', { timeout: 10_000 })
    await expect(win.getByTestId('update-slot')).toHaveCount(0)
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    expect(requests(f)).toEqual(['check', 'check', 'check'])
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('the line survives leaving settings mid-check and follows a language switch; a restart starts empty (REQ-004/AC-03, D6, G2)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  let app = await launch(f)
  try {
    let win = await app.firstWindow()
    await openSettings(win)
    await launchCheckDone(win, f)
    // Held in flight until settings has been left
    script(f, { check: 'upToDate', holdCheck: true })
    await action(win).click()
    await expect(line(win)).toHaveText('Checking…')
    await win.locator('.rail .ri').nth(0).click()
    await expect(win.getByTestId('updates-field')).toHaveCount(0)
    script(f, { check: 'upToDate' })
    await expect.poll(() => win.evaluate(() => window.agentshed.getSettingsCheck())).toEqual({ checking: false, outcome: 'upToDate' })
    await openSettings(win)
    await expect(line(win)).toHaveText('You’re up to date')
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator('[data-lang="zh"]').click()
    await expect(win.locator('.settings-sec-t').nth(2)).toHaveText('更新')
    await expect(line(win)).toHaveText('已是最新版本')
    await expect(action(win)).toHaveText('立即检查')
    await closeApp(app)
    app = await launch(f)
    win = await app.firstWindow()
    await openSettings(win)
    await launchCheckDone(win, f)
    await expect(line(win)).toHaveText('')
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test('a settings check during the launch check joins it: one request, its outcome reported (US-003/AC-05, D3)', async () => {
  const f = fixture()
  // The launch check held in flight until the settings check has joined it, however late the window shows
  script(f, { check: 'upToDate', holdCheck: true })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await expect.poll(() => requests(f).length).toBe(1)
    // The launch check is in flight: asking is available, and joins it
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    await action(win).click()
    await expect(line(win)).toHaveText('Checking…')
    script(f, { check: 'upToDate' })
    await expect(line(win)).toHaveText('You’re up to date', { timeout: 10_000 })
    expect(requests(f)).toEqual(['check'])
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test.describe('the first run after the version went up (REQ-004/AC-04, C7–C9)', () => {
  for (const [name, content, expected] of [
    ['an older recorded version', JSON.stringify({ version: '0.0.1' }), 'You’re up to date'],
    ['the same version', null, ''],
    ['a newer recorded version (the version went down)', JSON.stringify({ version: '99.0.0' }), ''],
    ['no record (a fresh installation)', undefined, ''],
    ['an unreadable record', '{"version":', '']
  ] as const) {
    test(name, async () => {
      const f = fixture()
      script(f, { check: 'upToDate' })
      if (content === null) {
        const probe = await launch(f)
        const running = await probe.evaluate(({ app }) => app.getVersion())
        await closeApp(probe)
        seedRecordedVersion(f, JSON.stringify({ version: running }))
      } else if (content !== undefined) seedRecordedVersion(f, content)
      const app = await launch(f)
      try {
        const win = await app.firstWindow()
        await openSettings(win)
        await launchCheckDone(win, f)
        const running = await app.evaluate(({ app }) => app.getVersion())
        await expect(win.getByTestId('app-version')).toHaveText(running)
        await expect(line(win)).toHaveText(expected)
        if (expected) await expect(line(win)).toHaveClass(/\bok\b/)
        // The run records its own version for the next
        expect(JSON.parse(readFileSync(join(f.userData, 'last-run-version.json'), 'utf8'))).toEqual({ version: running })
      } finally {
        await closeApp(app)
        cleanup(f)
      }
    })
  }

  test('a still newer release found at that launch shows its download instead, and a settings check replaces the line (C7)', async () => {
    const f = fixture()
    seedRecordedVersion(f, JSON.stringify({ version: '0.0.1' }))
    script(f, { check: 'found', version: '9.9.0', steps: [0, 30], stepMs: 50, download: 'hold' })
    let app = await launch(f)
    try {
      let win = await app.firstWindow()
      await openSettings(win)
      await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
      await closeApp(app)
      seedRecordedVersion(f, JSON.stringify({ version: '0.0.1' }))
      script(f, { check: 'upToDate' })
      app = await launch(f)
      win = await app.firstWindow()
      await openSettings(win)
      await launchCheckDone(win, f)
      await expect(line(win)).toHaveText('You’re up to date')
      script(f, { check: 'fail' })
      await action(win).click()
      await expect(line(win)).toHaveText('Couldn’t check for updates')
    } finally {
      await closeApp(app)
      cleanup(f)
    }
  })
})

test('a development run: the switch and the button are unavailable, the footnote says why, and nothing is asked (US-005/AC-02)', async () => {
  const f = fixture()
  // A recorded older version too: a development run neither reads nor writes the record
  seedRecordedVersion(f, JSON.stringify({ version: '0.0.1' }))
  const app = await launch(f, { updates: false })
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    for (const which of ['on', 'off'] as const) await expect(option(win, which)).toHaveAttribute('aria-disabled', 'true')
    await expect(action(win)).toHaveText('Check now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('updates-foot')).toHaveText('Updates are not checked in a development run (the app is not packaged).')
    await option(win, 'off').click({ force: true })
    await action(win).click({ force: true })
    await win.waitForTimeout(500)
    await expect(option(win, 'on')).toHaveAttribute('aria-checked', 'true')
    await expect(line(win)).toHaveText('')
    expect(existsSync(join(f.userData, 'prefs.json')) ? storedPrefs(f)['autoCheckUpdates'] : true).toBe(true)
    expect(JSON.parse(readFileSync(join(f.userData, 'last-run-version.json'), 'utf8'))).toEqual({ version: '0.0.1' })
    expect(requests(f)).toEqual([])
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

test.describe('the automatic-checks switch (US-002, REQ-003/AC-03)', () => {
  test('a change is stored at once and survives a restart; with it off the launch makes no request', async () => {
    const f = fixture()
    script(f, { check: 'upToDate' })
    let app = await launch(f)
    try {
      let win = await app.firstWindow()
      await openSettings(win)
      await launchCheckDone(win, f)
      await option(win, 'off').click()
      await expect(option(win, 'off')).toHaveAttribute('aria-checked', 'true')
      await expect.poll(() => storedPrefs(f)['autoCheckUpdates']).toBe(false)
      await closeApp(app)
      app = await launch(f)
      win = await app.firstWindow()
      await openSettings(win)
      await expect(option(win, 'off')).toHaveAttribute('aria-checked', 'true')
      // Give a launch check every chance to happen
      await win.waitForTimeout(1500)
      expect(requests(f)).toEqual(['check'])
      // Turning it on starts no check (US-002/AC-04)
      await option(win, 'on').click()
      await expect.poll(() => storedPrefs(f)['autoCheckUpdates']).toBe(true)
      await win.waitForTimeout(1500)
      expect(requests(f)).toEqual(['check'])
    } finally {
      await closeApp(app)
      cleanup(f)
    }
  })

  test('turning it off during a download neither cancels it nor discards the ready update (US-002/AC-03, B5)', async () => {
    const f = fixture()
    const found = { check: 'found', version: '9.9.0', steps: [0, 30, 60, 100], stepMs: 50, download: 'complete', install: 'hold' }
    // Held at its first step until the switch is off, so it is turned off during the download
    script(f, { ...found, holdFirstStep: true })
    const app = await launch(f)
    try {
      const win = await app.firstWindow()
      await openSettings(win)
      await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
      await option(win, 'off').click()
      await expect.poll(() => storedPrefs(f)['autoCheckUpdates']).toBe(false)
      script(f, found)
      await expect(line(win)).toHaveText('Version 9.9.0 is ready to install', { timeout: 10_000 })
      await expect(win.getByTestId('update-slot')).toHaveAttribute('aria-label', 'Update available')
    } finally {
      await closeApp(app)
      cleanup(f)
    }
  })
})

test('a preference file that cannot be read: no automatic check, a check asked for runs, a save fails and leaves the file, and the next launch reads it (#367)', async () => {
  test.skip(process.getuid?.() === 0, 'a mode does not hold back root')
  mainErrors.allow(/prefs-write-failed/)
  const f = fixture()
  script(f, { check: 'upToDate' })
  const file = join(f.userData, 'prefs.json')
  // Stored on, so the switch reading off below comes from the failure and not from the file
  const saved = JSON.stringify({ theme: 'blue', language: 'zh', mode: 'dark', trendSpan: 90, autoCheckUpdates: true })
  writeFileSync(file, saved)
  chmodSync(file, 0o000)
  let app = await launch(f)
  try {
    let win = await app.firstWindow()
    await openSettings(win)
    // The defaults: the system's language and the purple theme, with the switch off and saying so
    await expect(win.locator('html')).toHaveAttribute('lang', 'en')
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'purple')
    await expect(option(win, 'off')).toHaveAttribute('aria-checked', 'true')
    // Give a launch check every chance to happen, and a later one too
    await win.waitForTimeout(1500)
    await wakeAfterADay(app)
    await win.waitForTimeout(500)
    expect(requests(f)).toEqual([])

    // A check the user asks for runs
    await action(win).click()
    await expect(line(win)).toHaveText('You’re up to date')
    expect(requests(f)).toEqual(['check'])

    // A save fails with the existing toast, and the choice is in effect
    await win.locator('[data-theme-option="amber"]').click()
    await expect(win.locator('.toast.err')).toHaveText('Couldn’t save the theme. It stays in effect until the app restarts, then goes back.')
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'amber')

    // Turning the switch on is the user asking: it fails to save, and automatic checks then run this run
    await option(win, 'on').click()
    await expect(win.locator('.toast.err').filter({ hasText: 'automatic update check' })).toHaveText('Couldn’t save the automatic update check setting. It stays in effect until the app restarts, then goes back.')
    await expect(option(win, 'on')).toHaveAttribute('aria-checked', 'true')
    await wakeAfterADay(app, 50)
    await expect.poll(() => requests(f)).toEqual(['check', 'check'])

    await closeApp(app)
    chmodSync(file, 0o644)
    expect(readFileSync(file, 'utf8')).toBe(saved)

    // Readable again: the next launch uses it, and the launch check it allows runs
    app = await launch(f)
    win = await app.firstWindow()
    await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'blue')
    await win.locator('.ri.set').click()
    await expect(win.locator('[data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => requests(f)).toEqual(['check', 'check', 'check'])
  } finally {
    await closeApp(app)
    chmodSync(file, 0o644)
    cleanup(f)
  }
})

test('the first launch after an update restores the saved display like any other launch (G4)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate' })
  const proj = join(f.home, 'g4-project')
  mkdirSync(proj)
  writeFileSync(join(f.home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  let app = await launch(f)
  try {
    let win = await app.firstWindow()
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row', { hasText: 'g4-project' })).toBeVisible()
    await closeApp(app)
    seedRecordedVersion(f, JSON.stringify({ version: '0.0.1' }))
    // The scan is held back, so what shows is the restored display
    app = await launch(f, { env: { AGENTSHED_SCAN_DELAY_MS: '20000' } })
    win = await app.firstWindow()
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row', { hasText: 'g4-project' })).toBeVisible({ timeout: 3000 })
    await openSettings(win)
    await expect(line(win)).toHaveText('You’re up to date')
  } finally {
    await closeApp(app)
    cleanup(f)
  }
})

/**
 * Line counts of the version card's texts, by the line boxes their text occupies, and whether a row's content
 * spills past the card. The appearance footnote is the control: it wraps in every language (the updates
 * footnote does not in Chinese), so a count that cannot see a wrap fails there.
 */
async function layout(win: Page): Promise<{ labels: number[]; line: number; button: number; overflow: boolean[]; foot: number }> {
  return win.evaluate(() => {
    const lines = (el: Element | null): number => {
      if (!el) return -1
      const range = document.createRange()
      range.selectNodeContents(el)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top)
      let count = 0
      let bottom = -Infinity
      for (const r of rects) {
        if (r.top >= bottom - 1) {
          count++
          bottom = r.bottom
        } else bottom = Math.max(bottom, r.bottom)
      }
      return count
    }
    const field = document.querySelector('[data-testid="updates-field"]')
    const rows = [...(field?.querySelectorAll('.frow') ?? [])] as HTMLElement[]
    return {
      labels: [...(field?.querySelectorAll('.flabel') ?? [])].map(lines),
      line: lines(document.querySelector('[data-testid="update-line"]')),
      button: lines(document.querySelector('[data-testid="version-action"]')),
      overflow: rows.map((r) => r.scrollWidth > r.clientWidth),
      foot: lines(document.querySelector('[data-testid="appearance-foot"]'))
    }
  })
}

test.describe('the labels and the result line stay on one line in every UI language and every state of the line (QR-001/AC-02)', () => {
  for (const language of ['zh', 'en'] as const) {
    test(language, async () => {
      const f = fixture()
      writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ language }))
      script(f, { check: 'upToDate' })
      const app = await launch(f)
      try {
        const win = await app.firstWindow()
        await openSettings(win)
        // The seeded language is the one measured: were the seed ignored, this run would measure English
        expect(await win.evaluate(() => document.documentElement.lang)).toBe(language === 'zh' ? 'zh-CN' : 'en')
        await launchCheckDone(win, f)
        const settings = () => win.evaluate(() => window.agentshed.getSettingsCheck())
        const phase = () => win.evaluate(() => window.agentshed.getUpdateState().then((s) => s.phase))
        const measured: Record<string, Awaited<ReturnType<typeof layout>> & { text: string }> = {}
        let previous = ''
        /** Measures once the line shows the new state's own text: the main process's state leads the render */
        const measure = async (state: string): Promise<void> => {
          if (state !== 'empty') await expect(line(win)).not.toHaveText(previous)
          const text = (await line(win).textContent()) ?? ''
          measured[state] = { ...(await layout(win)), text }
          previous = text
        }
        await measure('empty')

        // Each passing state held until it is measured
        script(f, { check: 'upToDate', holdCheck: true })
        await action(win).click()
        await expect.poll(settings).toEqual({ checking: true, outcome: null })
        await measure('checking')
        script(f, { check: 'upToDate' })
        await expect.poll(settings).toEqual({ checking: false, outcome: 'upToDate' })
        await measure('upToDate')

        script(f, { check: 'fail' })
        await action(win).click()
        await expect.poll(settings).toEqual({ checking: false, outcome: 'failed' })
        await measure('failed')

        // A long but valid version, for the widest form of the two version lines
        const found = { check: 'found', version: '10.10.10-beta.12', steps: [0, 50, 100], stepMs: 50, download: 'complete', install: 'hold' }
        script(f, { ...found, holdFirstStep: true })
        await action(win).click()
        await expect.poll(phase).toBe('downloading')
        await measure('downloading')
        script(f, found)
        await expect.poll(phase, { timeout: 10_000 }).toBe('ready')
        await measure('ready')
        await action(win).click()
        await expect.poll(phase).toBe('installing')
        await measure('installing')

        // Each measurement saw its own state: seven different texts, only the first empty
        expect(new Set(Object.values(measured).map((m) => m.text)).size).toBe(7)
        for (const [state, m] of Object.entries(measured)) {
          expect(m.labels, `${language} ${state}: row labels`).toEqual([1, 1])
          expect(m.line, `${language} ${state}: result line`).toBe(state === 'empty' ? 0 : 1)
          expect(m.button, `${language} ${state}: button`).toBe(1)
          expect(m.overflow, `${language} ${state}: rows spill`).toEqual([false, false])
          expect(m.foot, `${language} ${state}: the control (appearance footnote) wraps`).toBeGreaterThan(1)
        }
      } finally {
        await closeApp(app)
        cleanup(f)
      }
    })
  }
})
