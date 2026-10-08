import type {} from '../src/renderer/src/env'
// Real isolated profiles, real IPC and filesystem failures; no owned-module mocks.
// Real assistant/message/usage keys were inspected in a local Claude JSONL sample; values and dates
// below are synthetic. Delayed initial preference reads are tested at the public backfill seam.
// This suite does not force IPC acknowledgement reordering: replies are ignored by the span owner.
// If that changes, add an external transport-delay seam and exercise reversed replies here.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

function day(ago: number): string {
  const date = new Date()
  date.setDate(date.getDate() - ago)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fixture(): { home: string; userData: string; project: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-span-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-span-data-'))
  const project = join(home, 'alpha'), other = join(home, 'beta')
  mkdirSync(project); mkdirSync(other)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [project]: {}, [other]: {} } }))
  const add = (proj: string, records: [number, number, string][]) => {
    const dir = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
    mkdirSync(dir, { recursive: true })
    const source = join(dir, 'usage.jsonl')
    writeFileSync(source, records.map(([ago, input, model]) => JSON.stringify({
      type: 'assistant', timestamp: `${day(ago)}T12:00:00`,
      message: { model, usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } }
    })).join('\n') + '\n')
  }
  // Literal sums: alpha 16/42/78; beta 46/102/168; global 62/144/246.
  add(project, [[0, 10, 'claude-recent'], [45, 20, 'claude-middle'], [75, 30, 'claude-oldest']])
  add(other, [[2, 40, 'claude-recent'], [35, 50, 'claude-middle'], [65, 60, 'claude-oldest']])
  return { home, userData, project }
}

async function launch(f: ReturnType<typeof fixture>, env: Record<string, string> = {}): Promise<ElectronApplication> {
  return electron.launch({ args: ['.', `--user-data-dir=${f.userData}`], env: {
    ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: f.home,
    AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US', ...env
  } })
}
const choice = (win: Page, span: number) => win.locator('.trend-span-options').getByRole('button', { name: String(span), exact: true })
async function checkSpan(win: Page, span: number, total: string): Promise<void> {
  await expect(choice(win, span)).toHaveAttribute('aria-pressed', 'true')
  await expect(win.locator('.chart .col')).toHaveCount(span)
  await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText(`Last ${span} days`)
  await expect(win.locator('.tot-c').nth(3).locator('.v')).toHaveText(total)
}
function cleanup(f: ReturnType<typeof fixture>): void {
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}

test('global span defaults an older or invalid preference without resetting valid appearance and language', async () => {
  for (const trendSpan of [undefined, 45, '60']) {
    const f = fixture()
    writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ theme: 'blue', language: 'en', mode: 'dark', trendSpan }))
    const app = await launch(f, { AGENTSHED_SYSTEM_LANGUAGES: 'fr-FR' })
    try {
      const win = await app.firstWindow()
      // Let Electron's saved appearance drive media queries instead of Playwright's light default.
      await win.emulateMedia({ colorScheme: null })
      await checkSpan(win, 30, '62')
      await expect(win.locator('html')).toHaveAttribute('data-theme', 'blue')
      await expect.poll(() => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
      await win.locator('.rail .ri').nth(1).click()
      await win.locator('.side .row', { hasText: 'alpha' }).click()
      await checkSpan(win, 30, '16')
      await choice(win, 60).click()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- see #194
      await expect.poll(() => JSON.parse(readFileSync(join(f.userData, 'prefs.json'), 'utf8'))).toEqual({
        theme: 'blue', language: 'en', mode: 'dark', trendSpan: 60
      })
    } finally { await app.close(); cleanup(f) }
  }
})

test('global span links exact totals and active breakdowns on both entries, and survives full restarts', async () => {
  const f = fixture()
  let app: ElectronApplication | undefined
  try {
    app = await launch(f)
    let win = await app.firstWindow()
    await checkSpan(win, 30, '62')
    const unchanged = await win.locator('.tot-c .v').allTextContents()
    for (const [span, total, uncached, output, cached] of [[60, '144', '132', '4', '8'], [90, '246', '228', '6', '12'], [30, '62', '56', '2', '4']] as const) {
      await choice(win, span).click()
      await checkSpan(win, span, total)
      expect((await win.locator('.tot-c .v').allTextContents()).slice(0, 3)).toEqual(unchanged.slice(0, 3))
      await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')
      await win.locator('.tot-c').nth(3).click()
      await expect(win.locator('.stats .stat').first().locator('.v')).toHaveText(total)
      await expect(win.locator('.comp-lg span').nth(0)).toHaveAttribute('title', `${cached} · input served from cache, never recomputed`)
      await expect(win.locator('.comp-lg span').nth(1)).toHaveAttribute('title', `${uncached} · cache writes included: everything the model read afresh this turn`)
      await expect(win.locator('.comp-lg span').nth(2)).toHaveAttribute('title', `${output} · tokens the model generated`)
      await expect(win.locator('.pane-body .grp-t').last()).toContainText(`Last ${span} days`)
      await expect(win.locator('.models .m')).toHaveCount(span / 30)
      await expect(win.locator('.chart .col.out')).toHaveCount(0)
      await win.locator('.tot-c').first().click()
    }
    // Keep the fourth card active across span changes; activation is identity, not a fixed 30-day range.
    await win.locator('.tot-c').nth(3).click()
    await choice(win, 60).click()
    await expect(win.locator('.tot-c').nth(3)).toHaveAttribute('aria-pressed', 'true')
    await expect(win.locator('.stats .stat').first().locator('.v')).toHaveText('144')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 60, '42')
    await win.locator('.tot-c').nth(3).click()
    await choice(win, 90).click()
    await checkSpan(win, 90, '78')
    await expect(win.locator('.tot-sides b').first()).toHaveText('78')
    await expect(win.locator('.models .num')).toHaveText(['36', '26', '16'])
    await win.locator('.side .row', { hasText: 'beta' }).click()
    await checkSpan(win, 90, '168')
    await win.locator('.rail .ri').first().click()
    await checkSpan(win, 90, '246')
    // Consecutive user events, followed by a real quit; the acknowledged final value is the persisted one.
    for (const span of [30, 90, 30, 60]) await choice(win, span).click()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- see #193, #194
    await expect.poll(() => JSON.parse(readFileSync(join(f.userData, 'prefs.json'), 'utf8')).trendSpan).toBe(60)
    await app.close()
    app = await launch(f, { AGENTSHED_SCAN_DELAY_MS: '3000' })
    win = await app.firstWindow()
    await checkSpan(win, 60, '144')
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
    await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'scanning')
    const before = await win.locator('.chart').boundingBox()
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready', { timeout: 8000 })
    expect((await win.locator('.chart').boundingBox())?.y).toBe(before?.y)
    await choice(win, 90).click()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- see #193, #194
    await expect.poll(() => JSON.parse(readFileSync(join(f.userData, 'prefs.json'), 'utf8')).trendSpan).toBe(90)
    await app.close()
    app = await launch(f, { AGENTSHED_SCAN_DELAY_MS: '3000' })
    win = await app.firstWindow()
    await checkSpan(win, 90, '246')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 90, '78')
  } finally {
    await app?.close().catch(() => {})
    cleanup(f)
  }
})

for (const [span, cache] of [[30, undefined], [60, 'broken'], [90, '{"version":-1,"data":{}}']] as const) {
  test(`global span ${span}: saved preference survives an unusable display cache and skeleton fill`, async () => {
    const f = fixture()
    writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ theme: 'blue', language: 'en', mode: 'dark', trendSpan: span }))
    if (cache) writeFileSync(join(f.userData, 'display-cache.json'), cache)
    const app = await launch(f, { AGENTSHED_SCAN_DELAY_MS: '3000' })
    try {
      const win = await app.firstWindow()
      const buttons = win.locator('.trend-span-choice')
      await expect(buttons).toHaveCount(3)
      for (const button of await buttons.all()) await expect(button).toBeDisabled()
      await expect(win.locator('.trend-span-choice[aria-pressed="true"]')).toHaveText(String(span))
      await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText(`Last ${span} days`)
      const before = await win.locator('.trend-span-options').boundingBox()
      await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 8000 })
      await checkSpan(win, span, span === 30 ? '62' : span === 60 ? '144' : '246')
      expect((await win.locator('.trend-span-options').boundingBox())?.y).toBe(before?.y)
      await expect(win.locator('html')).toHaveAttribute('data-theme', 'blue')
    } finally { await app.close(); cleanup(f) }
  })
}

test('global span save failure keeps live views consistent and reopens the last successful value', async () => {
  const f = fixture()
  let app: ElectronApplication | undefined
  try {
    app = await launch(f)
    let win = await app.firstWindow()
    await choice(win, 60).click()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- see #193, #194
    await expect.poll(() => JSON.parse(readFileSync(join(f.userData, 'prefs.json'), 'utf8')).trendSpan).toBe(60)
    const archiveBefore = readFileSync(join(f.userData, 'usage-archive.json'), 'utf8')
    const configBefore = readFileSync(join(f.home, '.claude.json'), 'utf8')
    const pid = app.process().pid
    const blocked = join(f.userData, `.prefs.json.tmp-${pid}`)
    mkdirSync(blocked)
    await choice(win, 90).click()
    await expect(win.locator('.toast')).toContainText('Failed to save the trend span')
    await checkSpan(win, 90, '246')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 90, '78')
    expect(readFileSync(join(f.userData, 'usage-archive.json'), 'utf8')).toBe(archiveBefore)
    expect(readFileSync(join(f.home, '.claude.json'), 'utf8')).toBe(configBefore)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- see #193
    expect(JSON.parse(readFileSync(join(f.userData, 'prefs.json'), 'utf8')).trendSpan).toBe(60)
    rmSync(blocked, { recursive: true })
    await app.close()
    app = await launch(f)
    win = await app.firstWindow()
    await checkSpan(win, 60, '144')
  } finally { await app?.close().catch(() => {}); cleanup(f) }
})

test('global span includes archived and retained older rows in both charts and fourth cards', async () => {
  const f = fixture()
  const beta = join(f.home, 'beta')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- see #193
  const stamp = `${JSON.parse(readFileSync('package.json', 'utf8')).version}+c16`
  writeFileSync(join(f.userData, 'usage-archive.json'), JSON.stringify({
    version: 2, rows: [
      { day: day(75), side: 'claude', projectKey: f.project.toLowerCase(), model: 'claude-oldest', input: 90, output: 5, cacheRead: 2, cacheWrite: 3, total: 100 },
      { day: day(85), side: 'claude', projectKey: beta.toLowerCase(), model: 'claude-archived', input: 90, output: 10, cacheRead: 0, cacheWrite: 0, total: 100 }
    ], stamps: { [`${day(75)}\u0000claude`]: stamp, [`${day(85)}\u0000claude`]: stamp }, observed: {}, superseded: []
  }))
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    await checkSpan(win, 30, '62')
    await choice(win, 90).click()
    await checkSpan(win, 90, '410')
    await expect(win.locator(`.col[data-day="${day(75)}"]`)).not.toHaveClass(/\barch\b/)
    await expect(win.locator(`.col[data-day="${day(75)}"]`)).toHaveAttribute('data-tip', /total 100\n/)
    await expect(win.locator(`.col[data-day="${day(85)}"]`)).toHaveClass(/\barch\b/)
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 90, '142')
    await win.locator('.side .row', { hasText: 'beta' }).click()
    await checkSpan(win, 90, '268')
    await expect(win.locator(`.col[data-day="${day(85)}"] .sp`)).toHaveCSS('background-image', /repeating-linear-gradient/)
  } finally { await app.close(); cleanup(f) }
})

test('global span numeric choices support keyboard activation and retain every card and side identity', async () => {
  const f = fixture()
  const app = await launch(f)
  try {
    const win = await app.firstWindow()
    // CDP enables real focus in the hidden Electron window; no synthetic click/key events.
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    for (const entry of [0, 1]) {
      await win.locator('.rail .ri').nth(entry).click()
      if (entry) await win.locator('.side .row', { hasText: 'alpha' }).click()
      await choice(win, 30).focus()
      await win.keyboard.press('Tab')
      await expect(choice(win, 60)).toBeFocused()
      await expect(choice(win, 60)).toHaveCSS('outline-style', 'solid')
      await expect(choice(win, 60)).toHaveCSS('outline-offset', '-2px')
      await win.keyboard.press('Space')
      await checkSpan(win, 60, entry ? '42' : '144')
      await win.keyboard.press('Tab')
      await win.keyboard.press('Enter')
      await checkSpan(win, 90, entry ? '78' : '246')
      for (let card = 0; card < 4; card++) {
        await win.locator('.tot-c').nth(card).click()
        const unchangedModels = await win.locator('.models').textContent()
        for (const side of ['Total', 'Claude', 'Codex', 'Grok']) {
          await win.locator('.seg button', { hasText: side }).click()
          for (const span of [30, 60, 90]) {
            await choice(win, span).click()
            await expect(win.locator('.tot-c').nth(card)).toHaveAttribute('aria-pressed', 'true')
            await expect(win.locator('.seg button.on')).toHaveText(side)
            await expect(win.locator('.chart .col.out')).toHaveCount(card === 1 ? span - 1 : card === 2 ? span - 7 : 0)
            if (card < 3) expect(await win.locator('.models').textContent()).toBe(unchangedModels)
          }
        }
      }
    }
    await cdp.detach()
  } finally { await app.close(); cleanup(f) }
})
