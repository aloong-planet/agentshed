import type {} from '../src/renderer/src/env'
// A usage archive that cannot be written or read, in the running app (token-stats C4, C8, agents-overview A4d). The real
// failures: the settings directory made read-only while the app runs, a directory where the archive goes from before
// launch, and the archive's own mode from before launch.
//
// Gap: a real change of window focus is not driven, because Playwright emulates focus. The cases shadow
// document.hasFocus and dispatch the event, which are the two facts a real window was measured to give.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { failOnMainErrors, startApp } from './support/launch'

const EN = 'Usage history can’t be saved right now because its file in the settings directory can’t be read or written.'
const ZH = '用量历史暂时无法保存，因为设置目录中的历史文件无法读取或写入。'
/** A mode on a directory does not hold back root */
const ROOT = process.getuid?.() === 0
/** Holds the first scan until the record is running, on a machine under load too */
const HOLD_MS = '3000'
/** A past day, so the archive's own rule treats the row as history */
const AT = new Date(Date.now() - 90_000_000).toISOString()

interface Fixture { home: string; proj: string; sessions: string; userData: string }

function session(f: Fixture, name: string): void {
  writeFileSync(join(f.sessions, `${name}.jsonl`), [
    JSON.stringify({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: `Question ${name}` }, uuid: `${name}-q`, timestamp: AT, cwd: f.proj, sessionId: name }),
    JSON.stringify({ parentUuid: `${name}-q`, isSidechain: false, type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, uuid: `${name}-a`, timestamp: AT, cwd: f.proj, sessionId: name })
  ].join('\n') + '\n')
}

function fixture(): Fixture {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-archive-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-archive-data-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const sessions = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(sessions, { recursive: true })
  const f = { home, proj, sessions, userData }
  session(f, 'first')
  return f
}

const mainErrors = failOnMainErrors()

async function start(f: Fixture, env: Record<string, string> = {}): Promise<{ app: ElectronApplication; win: Page; stderr: string[] }> {
  const { app, stderr } = await startApp({ userData: f.userData, home: f.home, errors: mainErrors.errors, env: { AGENTSHED_RESCAN_MS: '300', ...env } })
  const win = await app.firstWindow()
  await win.waitForSelector('.toasts', { state: 'attached' })
  return { app, win, stderr }
}

function cleanUp(f: Fixture): void {
  chmodSync(f.userData, 0o755)
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}

/** Records every toast as it is added and counts the snapshots from now on: a toast is gone in seconds, and "one toast
 * however many scans" reads nothing until scans have happened */
async function watch(win: Page): Promise<void> {
  await win.evaluate(() => {
    const w = window as unknown as { toastsSeen: string[]; snapshotsSeen: number; agentshed: { onSnapshot: (f: () => void) => void } }
    w.toastsSeen = []
    w.snapshotsSeen = 0
    w.agentshed.onSnapshot(() => { w.snapshotsSeen++ })
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('toast')) w.toastsSeen.push(n.textContent ?? '')
    }).observe(document.querySelector('.toasts') as Element, { childList: true })
  })
}
const toastsSeen = (win: Page): Promise<string[]> => win.evaluate(() => (window as unknown as { toastsSeen: string[] }).toastsSeen)
const snapshotsSeen = (win: Page): Promise<number> => win.evaluate(() => (window as unknown as { snapshotsSeen: number }).snapshotsSeen)
/** Waits for this many more scans to have gone out */
async function scansPass(win: Page, n = 5): Promise<void> {
  const from = await snapshotsSeen(win)
  await expect.poll(() => snapshotsSeen(win), { timeout: 15_000 }).toBeGreaterThanOrEqual(from + n)
}
/** What a failed write could leave in the directory */
const temporaries = (f: Fixture): string[] => readdirSync(f.userData).filter((n) => /^\.(usage-archive\.w|token-cache\.j)-/.test(n))
/** The all-history figure, the first totals card's */
const allHistory = (win: Page): ReturnType<Page['locator']> => win.locator('.pane-head .tot-row .tot-c').first().locator('.v')
const sessionRows = (win: Page): ReturnType<Page['locator']> => win.locator('.pane-body .card .se')
const openSessions = async (win: Page): Promise<void> => {
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(sessionRows(win)).toHaveCount(1, { timeout: 15_000 })
}

test('token-stats C4: the settings directory read-only after launch — a new session arrives, one toast in the run, and the file catches up', async () => {
  test.skip(ROOT, 'root ignores the directory mode')
  const f = fixture()
  const { app, win, stderr } = await start(f)
  try {
    await openSessions(win)
    await watch(win)
    chmodSync(f.userData, 0o555)
    session(f, 'second')
    await expect(sessionRows(win)).toHaveCount(2, { timeout: 15_000 })
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
    expect(temporaries(f)).toEqual([])
    expect(stderr.join('')).toContain('[usage-archive] save failed:')
    // The application menu's reload is a new document in the same run: it is not told again
    await win.reload()
    await win.waitForSelector('.toasts', { state: 'attached' })
    await watch(win)
    // A toast from the mount may have landed before the record began, and would still be on screen
    expect(await win.locator('.toast').count()).toBe(0)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    // Writable again, with no restart: the next scan writes both sessions
    chmodSync(f.userData, 0o755)
    await expect.poll(() => {
      const file = JSON.parse(readFileSync(join(f.userData, 'usage-archive.json'), 'utf8')) as { rows: Array<{ total: number }> }
      return file.rows.reduce((sum, r) => sum + r.total, 0)
    }, { timeout: 15_000 }).toBe(4)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    // A second failure in the same run: once told is once
    chmodSync(f.userData, 0o555)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
  } finally {
    chmodSync(f.userData, 0o755)
    await closeApp(app)
    cleanUp(f)
  }
})

for (const [language, sentence] of [['en-US', EN], ['zh-CN', ZH]] as const) {
  test(`agents-overview A4d, token-stats C4: the archive's rename blocked from launch — the first scan leaves the placeholder, and the toast is told in ${language}`, async () => {
    const f = fixture()
    // A non-empty directory where the archive goes: the temporary file writes and the rename fails
    mkdirSync(join(f.userData, 'usage-archive.json', 'x'), { recursive: true })
    // The first scan held, so the record starts before the toast
    const { app, win, stderr } = await start(f, { AGENTSHED_SYSTEM_LANGUAGES: language, AGENTSHED_SCAN_DELAY_MS: HOLD_MS })
    try {
      await watch(win)
      await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 15_000 })
      await expect(allHistory(win)).toHaveText('2')
      await expect(win.locator('.toast.err')).toHaveText(sentence)
      await scansPass(win)
      expect(await toastsSeen(win)).toEqual([sentence])
      expect(temporaries(f)).toEqual([])
      expect(stderr.join('')).toContain('[usage-archive] save failed:')
      expect(stderr.join('')).not.toContain('[startup] scan failed')
    } finally {
      await closeApp(app)
      cleanUp(f)
    }
  })
}

test('token-stats C8: the archive unreadable from launch — the figures are the live rows, nothing is written, and its history returns once it can be read', async () => {
  test.skip(ROOT, 'root ignores the file mode')
  const f = fixture()
  const file = join(f.userData, 'usage-archive.json')
  const seeded = { day: '2020-01-02', side: 'claude', projectKey: '/legacy', model: 'claude-fable-5', input: 12_000, output: 0, cacheRead: 0, cacheWrite: 0, total: 12_000 }
  writeFileSync(file, JSON.stringify({ version: 2, rows: [seeded], stamps: {}, observed: {}, superseded: [] }))
  const before = statSync(file)
  chmodSync(file, 0o000)
  const { app, win, stderr } = await start(f, { AGENTSHED_SCAN_DELAY_MS: HOLD_MS })
  try {
    await watch(win)
    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 15_000 })
    await expect(allHistory(win)).toHaveText('2')
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
    expect([statSync(file).mtimeMs, statSync(file).size]).toEqual([before.mtimeMs, before.size])
    expect(temporaries(f)).toEqual([])
    expect(stderr.join('')).toContain('[usage-archive] read failed:')
    // Readable again, with no restart and no change to the file's signature
    chmodSync(file, 0o644)
    await expect(allHistory(win)).toHaveText('12k', { timeout: 15_000 })
    await expect.poll(() => (JSON.parse(readFileSync(file, 'utf8')) as { rows: Array<{ day: string }> }).rows.some((r) => r.day === seeded.day && r.day !== ''), { timeout: 15_000 }).toBe(true)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    chmodSync(file, 0o644)
    await closeApp(app)
    cleanUp(f)
  }
})

test('agents-overview REQ-002, token-stats C4: a relaunch over a saved display with the rename blocked — the saved figure shows, the scan replaces it, and the toast is told', async () => {
  const f = fixture()
  const first = await start(f)
  await expect(allHistory(first.win)).toHaveText('2', { timeout: 15_000 })
  await closeApp(first.app)
  session(f, 'second')
  const file = join(f.userData, 'usage-archive.json')
  rmSync(file)
  mkdirSync(join(file, 'x'), { recursive: true })
  const { app, win } = await start(f, { AGENTSHED_SCAN_DELAY_MS: HOLD_MS })
  try {
    await watch(win)
    await expect(allHistory(win)).toHaveText('2')
    await expect(win.locator('.scan-hint')).toBeVisible()
    await expect(allHistory(win)).toHaveText('4', { timeout: 15_000 })
    await expect(win.locator('.scan-hint')).not.toBeVisible()
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    await closeApp(app)
    cleanUp(f)
  }
})

const loseFocus = (win: Page): Promise<void> => win.evaluate(() => { document.hasFocus = () => false })
const regainFocus = (win: Page): Promise<void> => win.evaluate(() => {
  delete (document as unknown as { hasFocus?: unknown }).hasFocus
  window.dispatchEvent(new Event('focus'))
})

/**
 * The launch where one ask alone can take the notice: the archive's rename blocked, the first scan held until the window has
 * no focus, and no other scan for ten minutes. So the one snapshot's ask is withheld, and what tells the user next is whichever
 * ask the case then makes possible, with no timed scan to do it instead.
 */
async function oneWithheldScan(f: Fixture): Promise<{ app: ElectronApplication; win: Page }> {
  mkdirSync(join(f.userData, 'usage-archive.json', 'x'), { recursive: true })
  const { app, win } = await start(f, { AGENTSHED_SCAN_DELAY_MS: HOLD_MS, AGENTSHED_RESCAN_MS: '600000' })
  await watch(win)
  await loseFocus(win)
  await expect.poll(() => snapshotsSeen(win), { timeout: 15_000 }).toBe(1)
  expect(await toastsSeen(win)).toEqual([])
  return { app, win }
}

test('token-stats C4: the window getting focus tells a waiting notice, with no scan to do it', async () => {
  const f = fixture()
  const { app, win } = await oneWithheldScan(f)
  try {
    await regainFocus(win)
    await expect(win.locator('.toast.err')).toHaveText(EN)
    expect(await snapshotsSeen(win)).toBe(1)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    await closeApp(app)
    cleanUp(f)
  }
})

test('token-stats C4: a failure while the window has no focus waits for it, and is told in the language on screen then', async () => {
  test.skip(ROOT, 'root ignores the directory mode')
  const f = fixture()
  const { app, win } = await start(f)
  try {
    // Switched after the window's language was read at launch; the switch's own toast waited out, so the next is fresh
    await win.locator('.rail .ri.set').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator('[data-lang="zh"]').click()
    await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(win.locator('.toast.ok')).toBeVisible()
    await expect(win.locator('.toast.ok')).toHaveCount(0)
    await watch(win)
    await loseFocus(win)
    chmodSync(f.userData, 0o555)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    await regainFocus(win)
    await expect(win.locator('.toast.err')).toHaveText(ZH)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([ZH])
  } finally {
    chmodSync(f.userData, 0o755)
    await closeApp(app)
    cleanUp(f)
  }
})

test('token-stats C4: a failure that clears before the window has focus tells nothing, and a later one still tells', async () => {
  test.skip(ROOT, 'root ignores the directory mode')
  const f = fixture()
  const { app, win } = await start(f)
  try {
    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 15_000 })
    await watch(win)
    await loseFocus(win)
    chmodSync(f.userData, 0o555)
    await scansPass(win)
    chmodSync(f.userData, 0o755)
    // Past any scan already under way, so the last one here wrote
    await scansPass(win)
    await regainFocus(win)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    chmodSync(f.userData, 0o555)
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    chmodSync(f.userData, 0o755)
    await closeApp(app)
    cleanUp(f)
  }
})

test('token-stats C4: a window that subscribed after the failure is told when it mounts, with no scan to do it', async () => {
  const f = fixture()
  const { app, win } = await oneWithheldScan(f)
  try {
    // A new document: its focus is the emulated one again, and it missed the snapshot that came with the failure
    await win.reload()
    await expect(win.locator('.toast.err')).toHaveText(EN)
  } finally {
    await closeApp(app)
    cleanUp(f)
  }
})
