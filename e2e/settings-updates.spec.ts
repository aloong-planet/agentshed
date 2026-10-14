import type {} from '../src/renderer/src/env'
// The settings "Updates" section (docs/specs/app-update.md, REQ-003, REQ-004, US-002, US-003, US-005) through the
// real IPC chain and the real renderer, with the scripted update source the spec's Testing Decisions confirm
// (AGENTSHED_UPDATE_SCRIPT, read at every request, every request logged beside it; it also stands in for
// "packaged"). The post-update line is driven by seeding the version the previous run recorded in the isolated
// userData (Testing Decisions). A later automatic check is reached through the real wake path: the main
// process's clock is moved past the 24-hour period and the system's resume event is emitted.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

interface Fixture {
  home: string
  userData: string
  script: string
}

function fixture(): Fixture {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-settings-upd-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-settings-upd-data-'))
  return { home, userData, script: join(home, 'update.json') }
}
function cleanup(f: Fixture): void {
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}
function launch(f: Fixture, opts: { updates?: boolean; env?: Record<string, string> } = {}): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', `--user-data-dir=${f.userData}`],
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: f.home,
      AGENTSHED_NO_FOREGROUND: '1',
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
      // Without the seam the run is a development run: no update source at all (app-update::US-005)
      ...(opts.updates === false ? {} : { AGENTSHED_UPDATE_SCRIPT: f.script }),
      ...opts.env
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
/** The launch check has finished: the lifecycle is back at idle after the request */
async function launchCheckDone(win: Page, f: Fixture): Promise<void> {
  await expect.poll(() => requests(f).length).toBeGreaterThanOrEqual(1)
  await expect.poll(() => win.evaluate(() => window.agentshed.getUpdateState().then((s) => s.phase))).toBe('idle')
}
/** A later automatic check through the real wake path (app-update::REQ-006/AC-02) */
async function wakeAfterADay(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ powerMonitor }) => {
    const real = Date.now
    Date.now = () => real() + 25 * 60 * 60 * 1000
    powerMonitor.emit('resume')
    Date.now = real
  })
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
    await app.close()
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
    script(f, { check: 'upToDate', checkMs: 1500 })
    await action(win).click()
    await expect(line(win)).toHaveText('Checking…')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'true')
    // A click while its own check runs asks nothing more. Forced: Playwright waits for an aria-disabled
    // control to become available, which would land the click after the check
    await action(win).click({ force: true })
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
    await app.close()
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
    await app.close()
    cleanup(f)
  }
})

test('the download finishing turns the same button into "Install now"; it installs once, then stays unavailable while installing (REQ-003/AC-04, C10, C11, CON-004)', async () => {
  const f = fixture()
  script(f, { check: 'found', version: '9.9.0', steps: [0, 40, 80, 100], stepMs: 600, download: 'complete', install: 'hold' })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
    await expect(action(win)).toHaveText('Check now')
    await expect(action(win)).toHaveAttribute('aria-disabled', 'true')
    const button = await action(win).elementHandle()
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
    await app.close()
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
    await app.close()
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
    script(f, { check: 'found', version: '9.9.0', steps: [0, 20, 40], stepMs: 700, download: 'fail' })
    await wakeAfterADay(app)
    await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
    await expect(line(win)).toHaveText('', { timeout: 10_000 })
    await expect(win.getByTestId('update-slot')).toHaveCount(0)
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    expect(requests(f)).toEqual(['check', 'check', 'check'])
  } finally {
    await app.close()
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
    script(f, { check: 'upToDate', checkMs: 1500 })
    await action(win).click()
    await expect(line(win)).toHaveText('Checking…')
    await win.locator('.rail .ri').nth(0).click()
    await expect(win.getByTestId('updates-field')).toHaveCount(0)
    await expect.poll(() => win.evaluate(() => window.agentshed.getSettingsCheck())).toEqual({ checking: false, outcome: 'upToDate' })
    await openSettings(win)
    await expect(line(win)).toHaveText('You’re up to date')
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator('[data-lang="fr"]').click()
    await expect(win.locator('.settings-sec-t').nth(2)).toHaveText('Mises à jour')
    await expect(line(win)).toHaveText('Agentshed est à jour')
    await expect(action(win)).toHaveText('Vérifier maintenant')
    await app.close()
    app = await launch(f)
    win = await app.firstWindow()
    await openSettings(win)
    await launchCheckDone(win, f)
    await expect(line(win)).toHaveText('')
  } finally {
    await app.close()
    cleanup(f)
  }
})

test('a settings check during the launch check joins it: one request, its outcome reported (US-003/AC-05, D3)', async () => {
  const f = fixture()
  script(f, { check: 'upToDate', checkMs: 2500 })
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await openSettings(win)
    await expect.poll(() => requests(f).length).toBe(1)
    // The launch check is in flight: asking is available, and joins it
    await expect(action(win)).toHaveAttribute('aria-disabled', 'false')
    await action(win).click()
    await expect(line(win)).toHaveText('Checking…')
    await expect(line(win)).toHaveText('You’re up to date', { timeout: 10_000 })
    expect(requests(f)).toEqual(['check'])
  } finally {
    await app.close()
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
        await probe.close()
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
        await app.close()
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
      await app.close()
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
      await app.close()
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
    await app.close()
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
      await app.close()
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
      await app.close()
      cleanup(f)
    }
  })

  test('turning it off during a download neither cancels it nor discards the ready update (US-002/AC-03, B5)', async () => {
    const f = fixture()
    script(f, { check: 'found', version: '9.9.0', steps: [0, 30, 60, 100], stepMs: 600, download: 'complete', install: 'hold' })
    const app = await launch(f)
    try {
      const win = await app.firstWindow()
      await openSettings(win)
      await expect(line(win)).toHaveText('Version 9.9.0 is downloading')
      await option(win, 'off').click()
      await expect.poll(() => storedPrefs(f)['autoCheckUpdates']).toBe(false)
      await expect(line(win)).toHaveText('Version 9.9.0 is ready to install', { timeout: 10_000 })
      await expect(win.getByTestId('update-slot')).toHaveAttribute('aria-label', 'Update available')
    } finally {
      await app.close()
      cleanup(f)
    }
  })
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
    await app.close()
    seedRecordedVersion(f, JSON.stringify({ version: '0.0.1' }))
    // The scan is held back, so what shows is the restored display
    app = await launch(f, { env: { AGENTSHED_SCAN_DELAY_MS: '20000' } })
    win = await app.firstWindow()
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row', { hasText: 'g4-project' })).toBeVisible({ timeout: 3000 })
    await openSettings(win)
    await expect(line(win)).toHaveText('You’re up to date')
  } finally {
    await app.close()
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
  for (const language of ['zh', 'en', 'fr', 'es', 'ru', 'ja'] as const) {
    test(language, async () => {
      const f = fixture()
      writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ language }))
      script(f, { check: 'upToDate' })
      const app = await launch(f)
      try {
        const win = await app.firstWindow()
        await openSettings(win)
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

        script(f, { check: 'upToDate', checkMs: 1500 })
        await action(win).click()
        await expect.poll(settings).toEqual({ checking: true, outcome: null })
        await measure('checking')
        await expect.poll(settings).toEqual({ checking: false, outcome: 'upToDate' })
        await measure('upToDate')

        script(f, { check: 'fail' })
        await action(win).click()
        await expect.poll(settings).toEqual({ checking: false, outcome: 'failed' })
        await measure('failed')

        // A long but valid version, for the widest form of the two version lines
        script(f, { check: 'found', version: '10.10.10-beta.12', steps: [0, 50, 100], stepMs: 900, download: 'complete', install: 'hold' })
        await action(win).click()
        await expect.poll(phase).toBe('downloading')
        await measure('downloading')
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
        await app.close()
        cleanup(f)
      }
    })
  }
})
