import type {} from '../src/renderer/src/env'
// App updates (docs/specs/app-update.md) through the real IPC chain and the real renderer, with the
// scripted update source the spec's Testing Decisions confirm: AGENTSHED_UPDATE_SCRIPT names a JSON file the
// main process reads at every request and logs every request beside (`<script>.log`). The seam also stands
// in for "packaged", so the lifecycle runs in this unpackaged build. What it cannot reach is the real
// electron-updater ↔ GitHub ↔ system updater path and the restart itself: accepted by evidence once two
// releases exist.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
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
  const home = mkdtempSync(join(tmpdir(), 'agentshed-update-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-update-data-'))
  return { home, userData, script: join(home, 'update.json') }
}
function cleanup(f: Fixture): void {
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}
const launchEnv = (f: Fixture): Record<string, string> => ({
  ...(process.env as Record<string, string>),
  NODE_ENV: 'production',
  AGENTSHED_HOME_OVERRIDE: f.home,
  AGENTSHED_NO_FOREGROUND: '1',
  AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
  AGENTSHED_UPDATE_SCRIPT: f.script
})
/** `followAppearance`: Playwright pins prefers-color-scheme to light unless told not to, and then a mode
 *  switch never reaches the renderer (see launchAppearance in app.spec.ts) */
function launch(f: Fixture, opts: { followAppearance?: boolean } = {}): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', `--user-data-dir=${f.userData}`],
    env: launchEnv(f),
    ...(opts.followAppearance ? { colorScheme: null } : {})
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
    await app.close()

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
    await app.close()
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
    await app.close()
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
    await app.close()
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
    await app.close()
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
    await app.close()
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
    await app.close()
    cleanup(f)
  }
})

test('a failed automatic check and a failed background download show nothing (REQ-002/AC-01, AC-02)', async () => {
  const f = fixture()
  try {
    script(f, { check: 'fail' })
    let app = await launch(f)
    let win = await app.firstWindow()
    await expect.poll(() => requests(f)).toEqual(['check'])
    await win.waitForTimeout(500)
    await expect(slot(win)).toHaveCount(0)
    await expect(win.locator('.toast')).toHaveCount(0)
    await app.close()

    const failing = { check: 'found', version: '9.9.0', steps: [0, 30], stepMs: 100, download: 'fail' }
    // Held at its first step until the slot has been seen, however late the window shows
    script(f, { ...failing, holdFirstStep: true })
    app = await launch(f)
    win = await app.firstWindow()
    await expect(slot(win)).toBeVisible()
    script(f, failing)
    await expect(slot(win)).toHaveCount(0, { timeout: 5000 })
    await expect(win.locator('.toast')).toHaveCount(0)
    await app.close()
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
    await app.close()
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
    await app.close()
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
    await app.close()
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
    await app.close()
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
    await app.close()
    cleanup(f)
  }
})
