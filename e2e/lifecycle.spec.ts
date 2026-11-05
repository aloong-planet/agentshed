import type {} from '../src/renderer/src/env'
// E2E: Playwright driving a real Electron (the build output), covering the assembly layer unit tests
// cannot reach —
// the whole IPC chain, rendering, dimension switching, tab switching and refresh deduplication, while
// asserting the main process emits no errors.
// The key scenario: **starting with an old-format cache** (the shape of the 2026-07-30 production crash;
// the unit tests pin it and this guards the whole chain again).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, renameSync, statSync, symlinkSync, unlinkSync, chmodSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { mkUsageHome, questionLine } from './support/homes'
import { makeUserData, launch, close, startApp, failOnMainErrors } from './support/launch'
import { emptySnapshot } from '../src/shared/domain'

const mainErrors = failOnMainErrors()

test('an old-format cache does not crash at startup (a production crash regression): the snapshot still renders and the main process reports no errors', async () => {
  // The previous version's structure: the Codex agg has only totals/byDay and no events, and the version
  // number is old too
  const legacy = JSON.stringify({
    version: 2,
    files: {
      '/nonexistent/rollout.jsonl': {
        sig: '1:1',
        agg: {
          kind: 'codex',
          projectKey: '/x',
          listed: true,
          title: 'old format',
          at: 1,
          model: 'gpt-5.6-sol',
          totals: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
          byDay: { '2026-07-30': 2 }
        }
      }
    }
  })
  const l = await launch(legacy, mkUsageHome())
  const win = await l.app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(4)
  expect(l.errors).toEqual([])
  await close(l)
})

// The in-flight deduplication outlived the manual control that used to drive it (removed 2026-08-23):
// the timed backstop and the focus trigger can still coincide. Driving the interval far below a scan's
// own duration is what makes triggers overlap, so the guard is exercised rather than assumed.
test('overlapping automatic rescans are deduplicated: the page stays coherent and the main process reports no errors', async () => {
  const home = mkUsageHome()
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '60' })
  const win = await l.app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // Proof the rescans actually ran: a project added after launch shows up on the side card, which only
  // a completed scan can do
  await expect(win.locator('.pane-head .stats .stat').first()).toContainText('1 project')
  const extra = join(home, 'late-proj')
  mkdirSync(extra, { recursive: true })
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ projects: { [join(home, 'demo-proj')]: {}, [extra]: {} } })
  )
  await expect(win.locator('.pane-head .stats .stat').first()).toContainText('2 projects')
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(4)
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * token-stats sequence E: automatic snapshot refresh — a short interval injected (E5) drives the timed
 * backstop end to end:
 * appended session data appears without clicking refresh, and an open detail tab's local state survives the
 * transfusion (A3).
 * The focus trigger is not driven here (focus semantics are unreliable under the hidden-window regime, see
 * the file header),
 * its throttle judgement is pinned by the rescan unit tests, and it shares its scan entry point with the
 * timer.
 */
test('automatic refresh: a new session appears on its own, and the detail page\'s expansion state survives it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  const gskills = join(home, '.claude', 'skills')
  mkdirSync(join(gskills, 'tdd'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'SKILL.md'), '---\ndescription: Red before green\n---\n\nState-keeping body F\n')
  const enc = demo.replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const usage = (at: Date, out: number): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at.toISOString(),
      message: {
        model: 'claude-fable-5',
        usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
      }
    })
  writeFileSync(join(cdir, 'a.jsonl'), usage(new Date(Date.now() - 3600e3), 111111) + '\n')

  const userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  const { app, errors } = await startApp({
    userData,
    home,
    env: { AGENTSHED_RESCAN_MS: '1500' } // The E5 test seam: a shortened backstop interval drives the whole chain
  })
  const win = await app.firstWindow()
  const total = win.locator('.stats .v').first()
  await expect(total).not.toHaveText(/^0(\s|$)/, { timeout: 15_000 })
  const t0 = await total.textContent()

  // Open detail Skills and expand a global-layer row — it will go through several automatic refreshes
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const tddRow = win.locator('.pane-body .sk', { hasText: 'tdd' })
  await tddRow.locator('.sk-head').click()
  await expect(tddRow.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()

  // Append "newly produced" session data; do not click refresh, and wait at least 2 backstop cycles
  writeFileSync(join(cdir, 'b.jsonl'), usage(new Date(), 555555) + '\n')
  await win.waitForTimeout(4000)
  // State survives the transfusion (A3): the expanded file table is still there after several automatic
  // refreshes, with no flash back to the loading state
  await expect(tddRow.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()
  await expect(win.locator('.pane-body .none', { hasText: 'Loading' })).toHaveCount(0)

  // The data appears on its own (E1's timed backstop): back on the Agents page the total has changed — with
  // refresh never clicked
  await win.locator('.rail .ri').nth(0).click()
  await expect
    .poll(async () => (await total.textContent()) !== t0, { timeout: 15_000, intervals: [500] })
    .toBe(true)

  expect(errors).toEqual([])
  await closeApp(app)
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

/**
 * Startup skeleton (spec agents-overview A4/A4a/A4b/A4c): before this launch's first snapshot the
 * agents page renders its real structure with placeholder blocks, refuses input, and fills in place.
 *
 * The scan-delay seam holds the first scan open so the skeleton is a stable state rather than a
 * race; 4s covers launch+mount comfortably while the fill assertion waits it out.
 *
 * Known gaps, deliberate:
 * - A4d (first-scan failure keeps the skeleton) is untested — there is no seam to make the first
 *   scan fail, and a fixture contrived to crash scan() would pin the crash, not the rule. Testable
 *   once a failure seam exists.
 * - Keyboard unreachability is not asserted: focus semantics differ in a hidden window (see the
 *   startApp note on AGENTSHED_NO_FOREGROUND), so a focus assertion here would be unreliable —
 *   the pointer side is covered by the hit-test below.
 * - A4c gets a weak assertion (no skeleton after a later scan completes): catching a scan mid-flight
 *   would race, so "never goes back mid-scan" rests on the render condition being "no snapshot yet",
 *   not on this case.
 */
test('startup skeleton: agents page shows placeholders, refuses input, fills in place', async () => {
  const home = mkUsageHome()
  const l = await launch(undefined, home, { AGENTSHED_SCAN_DELAY_MS: '4000', AGENTSHED_RESCAN_MS: '250' })
  try {
    const win = await l.app.firstWindow()
    // Skeleton up: real static structure (title, four window cards, one side card per side, seven tabs)
    // plus placeholder blocks and the inline scanning hint
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
    await expect(win.locator('.scan-hint')).toBeVisible()
    await expect(win.locator('.tot-row .tot-c')).toHaveCount(4)
    await expect(win.locator('.pane-head .stats .stat')).toHaveCount(4)
    await expect(win.locator('.pane-head .tabs .tab')).toHaveCount(7)
    expect(await win.locator('.sk-ph').count()).toBeGreaterThan(0)

    // A4: every side card's figure and third line hold a placeholder with a width. Read off the page's cards rather than
    // by side, so a card the widths miss cannot pass by not being named here
    const sideCards = await win.locator('.pane-head .stats .stat').evaluateAll((cards) =>
      cards.map((card) => ({
        side: card.querySelector('.badge')?.textContent,
        figure: card.querySelector('.v .sk-ph')?.getBoundingClientRect().width,
        line: card.querySelector('.s .sk-ph')?.getBoundingClientRect().width
      }))
    )
    expect(sideCards).toHaveLength(4)
    for (const { side, figure, line } of sideCards) {
      expect(figure, `the figure's placeholder on ${side}`).toBeGreaterThan(0)
      expect(line, `the third line's placeholder on ${side}`).toBeGreaterThan(0)
    }

    // Non-interactive (A4a): hit-test the first window card's centre — with pointer events off the
    // point must fall through to something outside the card. An attribute check cannot see this.
    const cardHit = await win.evaluate(() => {
      const c = document.querySelector('.tot-c')
      if (!c) return null
      const r = c.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return c.contains(el)
    })
    expect(cardHit, 'the window card must not be hit-testable under the skeleton').toBe(false)

    // Anchors before the fill (A4b): the fill must move nothing
    const readAnchors = (): Promise<Record<string, number>> =>
      win.evaluate(() => {
        const top = (s: string): number => {
          const el = document.querySelector(s)
          return el ? el.getBoundingClientRect().top : NaN
        }
        return {
          h1: top('.pane-head h1'),
          stats: top('.pane-head .stats'),
          tabs: top('.pane-head .tabs'),
          chart: top('.chart'),
          models: top('.models')
        }
      })
    const before = await readAnchors()
    await win.screenshot({ path: 'e2e-out/skeleton-agents.png' })

    // The fill: placeholders clear, the hint goes, real figures land
    await expect(win.locator('.sk-ph')).toHaveCount(0, { timeout: 20_000 })
    await expect(win.locator('.scan-hint')).not.toBeVisible()
    await expect(win.locator('.tot-row .tot-c .v').first()).not.toHaveText('')
    const after = await readAnchors()
    for (const k of Object.keys(before)) {
      expect(Math.abs(after[k] - before[k]), `anchor ${k} must not move on fill`).toBeLessThan(0.6)
    }
    await win.screenshot({ path: 'e2e-out/skeleton-agents-filled.png' })

    // A4c: later scans keep data on screen — the skeleton never comes back. The scan delay seam applies
    // to the **first** scan only, so the rescans driven here run at full speed; a newly registered
    // project proves one landed, and the placeholders stay gone across it
    const late = join(home, 'late-proj')
    mkdirSync(late, { recursive: true })
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({ projects: { [join(home, 'demo-proj')]: {}, [late]: {} } })
    )
    await expect(win.locator('.pane-head .stats .stat').first()).toContainText('2 projects')
    await expect(win.locator('.sk-ph')).toHaveCount(0)
    await expect(win.locator('.scan-hint')).not.toBeVisible()

    expect(l.errors).toEqual([])
  } finally {
    await close(l)
  }
})

/**
 * Startup skeleton, projects dimension (spec projects-list A10/A11/A12): the sidebar's real
 * structure over placeholder rows, the scanning hint centred in the detail area in place of the
 * pick-a-project guidance, no interaction, and an in-place fill. The rail stays live under the
 * skeleton (A11), which is what lets this case switch dimensions at all.
 */
test('startup skeleton: projects dimension shows placeholder rows and fills in place', async () => {
  const l = await launch(undefined, mkUsageHome(), { AGENTSHED_SCAN_DELAY_MS: '4000' })
  try {
    const win = await l.app.firstWindow()
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
    // The rail is live while the page refuses input (A11)
    await win.locator('.rail .ri').nth(1).click()
    // Sidebar: the real search field (disabled) and filter row, over placeholder rows
    await expect(win.locator('.side .sh input')).toBeDisabled()
    await expect(win.locator('.side .dd-trigger')).toBeVisible()
    const skRows = await win.locator('.side .list .row').count()
    expect(skRows, 'placeholder rows are on screen').toBeGreaterThan(0)
    expect(await win.locator('.side .list .row .sk-ph').count()).toBeGreaterThan(0)
    // The detail area carries the scanning hint, not the pick-a-project guidance (A10)
    await expect(win.locator('.detail .scan-hint')).toBeVisible()
    // Non-interactive (A11): a placeholder row's centre is not hit-testable
    const rowHit = await win.evaluate(() => {
      const r0 = document.querySelector('.side .list .row')
      if (!r0) return null
      const r = r0.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return r0.contains(el)
    })
    expect(rowHit, 'a placeholder row must not be hit-testable').toBe(false)
    // Row geometry before the fill (A12): the swap must not move the row grid
    const before = await win.evaluate(() => {
      const r = document.querySelector('.side .list .row')!.getBoundingClientRect()
      return { top: r.top, height: r.height }
    })
    await win.screenshot({ path: 'e2e-out/skeleton-projects.png' })

    // The fill: real rows land, the hint yields to the pick-a-project empty state
    await expect(win.locator('.side .list .row', { hasText: 'demo-proj' })).toBeVisible({
      timeout: 20_000
    })
    await expect(win.locator('.side .sk-ph')).toHaveCount(0)
    await expect(win.locator('.detail .scan-hint')).not.toBeVisible()
    await expect(win.locator('.detail .empty')).toBeVisible()
    await expect(win.locator('.side .sh input')).toBeEnabled()
    const after = await win.evaluate(() => {
      const r = document.querySelector('.side .list .row')!.getBoundingClientRect()
      return { top: r.top, height: r.height }
    })
    expect(Math.abs(after.top - before.top), 'first row top must not move').toBeLessThan(0.6)
    expect(Math.abs(after.height - before.height), 'row height must not change').toBeLessThan(0.6)

    expect(l.errors).toEqual([])
  } finally {
    await close(l)
  }
})

test('a failed token cache write during a scan: the scan still delivers its snapshot, and the failure is logged', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '300' })
  const stderr: string[] = []
  l.app.process().stderr?.on('data', (b: Buffer) => stderr.push(b.toString()))
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .card .se', { hasText: 'Sample question' })).toBeVisible()

  mkdirSync(join(l.userData, `.token-cache.j-${l.app.process().pid}`))
  writeFileSync(join(home, '.claude', 'projects', enc, 'after.jsonl'), questionLine('Question after the block') + '\n')
  // Only a delivered snapshot can list a session that came after the block
  await expect(win.locator('.pane-body .card .se', { hasText: 'Question after the block' })).toBeVisible({ timeout: 10000 })
  expect(stderr.join('')).toContain('[token-cache] save failed:')
  expect(stderr.join('')).not.toContain('scan failed')
  expect(l.errors).toEqual([])
  await close(l)
})

test('a failed token cache write on the first scan: the app comes up with its data rather than staying on the placeholder, and the failure is logged', async () => {
  const home = mkUsageHome()
  const userData = makeUserData()
  // A non-empty directory where the cache file goes: the temporary file writes and the rename fails
  mkdirSync(join(userData, 'token-cache.json', 'x'), { recursive: true })
  const { app, errors, stderr } = await startApp({ userData, home })
  const win = await app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  // Only the first scan's snapshot can list the session
  await expect(win.locator('.pane-body .card .se', { hasText: 'Sample question' })).toBeVisible({ timeout: 15000 })
  expect(stderr.join('')).toContain('[token-cache] save failed:')
  expect(stderr.join('')).not.toContain('scan failed')
  expect(errors).toEqual([])
  await close({ app, errors, userData, home })
})

// Real Electron lifecycle: the display is earned by reading, then restored independently of indexing.

test('restart restores viewed project, questions and read answer before a new scan finishes', async () => {
  // Its refused reads, and the skill file it deletes and recreates
  mainErrors.allow(/artifact-not-whitelisted/)
  mainErrors.allow(/session-not-whitelisted/)
  mainErrors.allow(/session-not-indexed/)
  mainErrors.allow(/skill-file-unreadable/)
  const home = mkdtempSync(join(tmpdir(), 'agentshed-restore-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-restore-data-'))
  const proj = join(home, 'restore-project')
  mkdirSync(proj)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const cdir = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(cdir, { recursive: true })
  const timestamp = new Date().toISOString()
  writeFileSync(join(cdir, 'saved.jsonl'), [
    { type: 'user', timestamp, message: { role: 'user', content: 'Saved question' } },
    { type: 'assistant', timestamp, message: { model: 'claude-fable-5', content: [{ type: 'text', text: 'Saved answer' }], usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: 'user', timestamp, message: { role: 'user', content: 'Unread question' } },
    { type: 'assistant', timestamp, message: { content: [{ type: 'text', text: 'Unread answer' }] } }
  ].map(x => JSON.stringify(x)).join('\n') + '\n')
  mkdirSync(join(cdir, 'memory'))
  writeFileSync(join(cdir, 'memory', 'topic.md'), 'Saved memory body')
  const skill = join(proj, '.claude', 'skills', 'restore-skill')
  mkdirSync(skill, { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), '---\ndescription: Restore fixture\n---\nSaved skill body')
  mkdirSync(join(proj, 'docs'), { recursive: true })
  writeFileSync(join(proj, 'docs', 'CONTEXT.md'), '# Saved artifact\nSaved artifact body')
  async function previews(win: Page, timeout = 5000): Promise<void> {
    await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
    await win.locator('.it.row-btn', { hasText: 'topic.md' }).click()
    // A restored body opens in the memory file drawer's preview like a fresh read (memory-view E1)
    await expect(win.locator('.file-drawer .md-preview-body.preview')).toContainText('Saved memory body', { timeout })
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
    await win.locator('.it.ai', { hasText: 'Saved artifact' }).click()
    await expect(win.locator('.reader .md')).toContainText('Saved artifact body', { timeout })
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    const row = win.locator('.sk', { hasText: 'restore-skill' })
    await row.locator('.sk-head').click()
    await expect(row.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible({ timeout })
    await row.locator('.files button', { hasText: 'SKILL.md' }).click()
    await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Saved skill body', { timeout })
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  }
  let app: ElectronApplication | undefined
  const launch = () => startApp({
    userData, home, errors: mainErrors.errors,
    env: app ? { AGENTSHED_SCAN_DELAY_MS: '20000', AGENTSHED_FETCH_DELAY_MS: '1000' } : {}
  }).then((started) => started.app)
  try {
    app = await launch()
    let win = await app.firstWindow()
    win.on('pageerror', e => console.error('RENDERER', e))
    win.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()) })
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'restore-project' }).click()
    await previews(win)
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.se', { hasText: 'Saved question' }).click()
    await win.locator('.qlist .q', { hasText: 'Saved question' }).click()
    await expect(win.locator('.turn .ans')).toHaveText(['Saved answer'])
    await win.locator('.rail .ri').nth(0).click()
    await expect(win.locator('.tot-c').nth(1)).toContainText('2k')
    await win.locator('.trend-span-options').getByRole('button', { name: '90', exact: true }).click()
    await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText('Last 90 days')
    const observedAt = await win.evaluate(() => window.agentshed.getSnapshot().then(s => s.scannedAt))
    await win.clock.install({ time: new Date('2030-01-01T00:30:00Z') })
    await win.clock.fastForward(61_000)
    // The display clock's once-a-second timer was set before this fake clock, so it keeps real time: the card turns
    // at its next real tick, up to a second after the jump, and then renders. Only the display clock reads the wall
    // clock and no scan comes within the window, so the card can only turn through it.
    await expect(win.locator('.tot-c').nth(1).locator('.v')).toHaveText('0')
    const cdp = await win.context().newCDPSession(win)
    await win.locator('.tot-c').nth(1).click()
    for (const [timezoneId, day] of [['Pacific/Honolulu', '2029-12-31'], ['Asia/Shanghai', '2030-01-01']]) {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId })
      await win.clock.fastForward(1000)
      await expect(win.locator('.chart .col').last()).toHaveAttribute('data-day', day)
      await expect(win.locator('.chart .col:not(.out)')).toHaveCount(1)
      await expect(win.locator('.chart .col:not(.out)')).toHaveAttribute('data-day', day)
      await expect(win.locator('.tot-c').nth(1).locator('.v')).toHaveText('0')
      await expect(win.locator('.tot-c').nth(3).locator('.v')).toHaveText('0')
      await expect(win.locator('.chart .col')).toHaveCount(90)
    }
    expect(await win.evaluate(() => window.agentshed.getSnapshot().then(s => s.scannedAt))).toBe(observedAt)
    await cdp.detach()
    await closeApp(app)
    writeFileSync(join(userData, 'token-cache.json'), JSON.stringify({ version: -1 }))
    const skillBody = readFileSync(join(skill, 'SKILL.md'), 'utf8')
    unlinkSync(join(skill, 'SKILL.md'))
    app = await launch()
    win = await app.firstWindow()
    await expect(win.locator('.pane-head h1')).toHaveText('Agents', { timeout: 5000 })
    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 1000 })
    await expect(win.locator('.trend-span-choice[aria-pressed="true"]')).toHaveText('90')
    await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'restore-project' }).click()
    await expect(win.locator('.det-title h1')).toHaveText('restore-project', { timeout: 1000 })
    await previews(win, 500)
    writeFileSync(join(skill, 'SKILL.md'), skillBody)
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.se', { hasText: 'Saved question' }).click()
    await expect(win.locator('.qlist .q', { hasText: 'Saved question' })).toBeVisible({ timeout: 1000 })
    await expect(win.locator('.turn')).toHaveCount(0)
    await win.locator('.qlist .q', { hasText: 'Saved question' }).click()
    await expect(win.locator('.turn .ans')).toHaveText(['Saved answer'], { timeout: 500 })
    const reads = await win.evaluate(() => window.agentshed.getStartup().then(r => r.display.reads))
    expect(reads.filter(r => r.kind === 'turnContent')).toHaveLength(1)
    await win.screenshot({ path: 'docs/.workings/startup-restore/session-restored.png' })
    // A restored registration never authorizes an arbitrary path or a substituted symlink.
    const artifact = join(proj, 'docs', 'CONTEXT.md'), outside = join(home, 'outside.md')
    writeFileSync(outside, 'Unregistered secret')
    const denied = (file: string) => win.evaluate(async f => {
      try { await window.agentshed.readArtifact(f); return false } catch { return true }
    }, file)
    expect(await denied(outside)).toBe(true)
    const original = readFileSync(artifact, 'utf8')
    unlinkSync(artifact)
    symlinkSync(outside, artifact)
    expect(await denied(artifact)).toBe(true)
    unlinkSync(artifact)
    writeFileSync(artifact, original)
    // Showing a session's record file in Finder before the first scan (session-view::US-001/AC-07): the allow-list is
    // still the restored one, whose entries are shown only while they are regular files. Finder's call is recorded
    // at the process boundary, so the run opens no Finder; the startup state, read before and after, proves the scan
    // is still held.
    if (!app) throw new Error('the second launch is not running')
    const running = app
    const hint = win.locator('.startup-display-hint')
    expect(await hint.getAttribute('data-state')).not.toBe('ready')
    await running.evaluate(({ shell }) => {
      const g = globalThis as unknown as { __revealed: string[] }
      g.__revealed = []
      shell.showItemInFolder = (p: string) => {
        g.__revealed.push(p)
      }
    })
    const revealed = (): Promise<string[]> => running.evaluate(() => (globalThis as unknown as { __revealed: string[] }).__revealed)
    const reveal = (file: string) => win.evaluate(async f => {
      try { await window.agentshed.revealSessionFile(f); return 'shown' } catch { return 'refused' }
    }, file)
    // The file is moved aside and back by rename, so it keeps its inode: the case's later steps, the in-place rewrite
    // among them, run on the setup they had before this check.
    const session = join(cdir, 'saved.jsonl'), aside = join(home, 'saved-aside.jsonl')
    const inode = statSync(session).ino
    renameSync(session, aside)
    symlinkSync(aside, session)
    expect(await reveal(session)).toBe('refused')
    expect(await revealed()).toEqual([])
    unlinkSync(session)
    renameSync(aside, session)
    expect(statSync(session).ino, 'the session file is back under its own inode').toBe(inode)
    expect(await reveal(session)).toBe('shown')
    expect(await revealed()).toEqual([session])
    // An old question never shows a new answer after an in-place rewrite (session-view::REQ-001/AC-04). When the held
    // scan completes, its snapshot refetches the open turn with the saved page's question identity while the page
    // itself waits out the fetch delay, so for that second the list shows the saved question over whatever the turn
    // channel accepts. The rewrite keeps the question line's length, so its byte range is the same and only its text
    // tells it from the saved one. An observer, installed while the scan is still held, records every question row
    // the list shows with its open turn's answer.
    await win.evaluate(() => {
      const g = globalThis as unknown as { __pairs: string[] }
      g.__pairs = []
      const record = (): void => {
        for (const row of document.querySelectorAll('.qlist .q')) {
          const turn = row.nextElementSibling
          if (!turn?.classList.contains('turn')) continue
          const answer = [...turn.querySelectorAll('.ans')].map((a) => a.textContent).join(' | ')
          const pair = `${row.querySelector('.txt')?.textContent ?? ''} → ${answer}`
          if (!g.__pairs.includes(pair)) g.__pairs.push(pair)
        }
      }
      record()
      new MutationObserver(record).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    expect(await hint.getAttribute('data-state')).not.toBe('ready')
    const source = join(cdir, 'saved.jsonl')
    writeFileSync(source, readFileSync(source, 'utf8').replaceAll('Saved question', 'Fresh question').replaceAll('Saved answer', 'Fresh answer'))
    // The complete saved page remains usable until a current mapping arrives.
    await expect(win.locator('.turn .ans')).toHaveText(['Saved answer'])
    await expect(win.locator('.stitle')).toHaveText('Fresh question', { timeout: 25000 })
    await expect(win.locator('.turn .ans')).toHaveText(['Fresh answer'])
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
    const pairs = await win.evaluate(() => (globalThis as unknown as { __pairs: string[] }).__pairs)
    expect(pairs, 'the observer read the saved page').toContain('Saved question → Saved answer')
    expect(pairs, 'the observer read the rewritten page').toContain('Fresh question → Fresh answer')
    expect(pairs, 'the saved question never shows the rewritten answer').not.toContain('Saved question → Fresh answer')
    await win.screenshot({ path: 'docs/.workings/startup-restore/session-refreshed.png' })
    // A question moved without changing its line (one line put before it, a record shape seen before the first
    // question of a real Claude Code file) changes the question mapping, so the identity read before the move is
    // refused (session-view::REQ-001, opening restored content). Asserted at the turn channel: on screen the moved
    // question would show its own answer either way. The page re-read after the move gives an identity the channel
    // accepts, so the refusal is the identity's.
    const turn = (revision: string): Promise<string> => win.evaluate(async ([file, r]) => {
      try { return JSON.stringify((await window.agentshed.getSessionTurn({ file, i: 0, revision: r })).blocks) } catch (e) { return String((e as Error).message) }
    }, [source, revision] as const)
    const first = (p: { questions: { revision?: string }[] }): string => {
      const revision = p.questions[0]?.revision
      if (revision === undefined) throw new Error('the page gives its first question no identity')
      return revision
    }
    const current = await win.evaluate(f => window.agentshed.getSessionPage(f), source)
    writeFileSync(source, JSON.stringify({ type: 'permission-mode', permissionMode: 'default', sessionId: 'restore-session' }) + '\n' + readFileSync(source, 'utf8'))
    expect(await turn(first(current))).toContain('session-not-indexed')
    const moved = await win.evaluate(f => window.agentshed.getSessionPage(f), source)
    expect(moved.questions.map(q => q.text)).toEqual(['Fresh question', 'Unread question'])
    expect(await turn(first(moved))).toContain('Fresh answer')
    // Remove Playwright's default light emulation before testing Electron's appearance preference.
    await win.emulateMedia({ colorScheme: null })
    await win.evaluate(() => window.agentshed.setMode('dark'))
    await expect.poll(() => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
    await win.screenshot({ path: 'docs/.workings/startup-restore/session-dark.png' })

  } finally {
    if (app) await closeApp(app).catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})

// project-detail::REQ-003 across the update: a display cache written before CONTEXT.md moved under docs/ lists and
// registers the project's root CONTEXT.md. The cache here is the one this build writes, with that one path put back where
// the previous build wrote it, and the project in the layout of a repository not yet moved. The detail channel waits for
// the first live scan, so the current listing always comes after it; after that scan, with no project opened, the
// registration restored from the saved page still admits the root file. The current detail no longer lists it, and its
// listing retires that admission while the file is still on disk (R1; a restore authorizes no read the current rules
// would refuse).
test('a root CONTEXT.md registered by a page saved before it moved under docs/ is refused after the current detail', async () => {
  mainErrors.allow(/artifact-not-whitelisted/)
  const home = mkdtempSync(join(tmpdir(), 'agentshed-ctx-move-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-ctx-move-data-'))
  const proj = join(home, 'moved-project')
  mkdirSync(join(proj, 'docs', 'adr'), { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const adr = join(proj, 'docs', 'adr', '0001-first.md')
  writeFileSync(adr, '# ADR-0001 settle the architecture\n')
  const docsContext = join(proj, 'docs', 'CONTEXT.md'), rootContext = join(proj, 'CONTEXT.md')
  writeFileSync(docsContext, '# Glossary\nGlossary body')
  let app: ElectronApplication | undefined
  const launch = () => startApp({ userData, home, errors: mainErrors.errors }).then((started) => started.app)
  try {
    app = await launch()
    let win = await app.firstWindow()
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'moved-project' }).click()
    await win.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
    await expect(win.locator('.it.ai', { hasText: 'Glossary' })).toBeVisible()
    // Leave the detail before closing, so the restart mounts no detail query before the first read
    await win.locator('.rail .ri').nth(0).click()
    await closeApp(app)
    app = undefined
    const cacheFile = join(userData, 'display-cache.json')
    const written = readFileSync(cacheFile, 'utf8')
    const inJson = (p: string): string => JSON.stringify(p).slice(1, -1)
    expect(written.split(inJson(docsContext)).length - 1, 'the saved detail lists and registers docs/CONTEXT.md').toBeGreaterThanOrEqual(2)
    writeFileSync(cacheFile, written.split(inJson(docsContext)).join(inJson(rootContext)))
    renameSync(docsContext, rootContext)

    app = await launch()
    win = await app.firstWindow()
    await expect(win.locator('.pane-head h1')).toHaveText('Agents', { timeout: 5000 })
    await expect.poll(() => win.evaluate(() => window.agentshed.getStartup().then(r => r.status)), { timeout: 15000 }).toBe('ready')
    const read = (file: string) => win.evaluate(async f => {
      try { return (await window.agentshed.readArtifact(f)).text } catch (e) { return `refused: ${(e as Error).message}` }
    }, file)
    expect(await read(rootContext), 'the registration restored from the saved page survives the scan').toContain('Glossary body')
    const detail = await win.evaluate(p => window.agentshed.getProjectDetail(p), proj)
    expect(detail.artifacts.map(a => a.file)).toEqual([adr])
    expect(await read(rootContext)).toContain('artifact-not-whitelisted')
    expect(statSync(rootContext).isFile(), 'the refused file is still on disk').toBe(true)
  } finally {
    if (app) await closeApp(app).catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})

// agents-overview::REQ-004 across an update: a display cache written by the version before instruction entries
// carried their paths — its snapshot's global layer as this machine's cache held it on 2026-10-29, `claudeGlobalMd` and
// `codexAgentsMd` as contents beside a `codexConfigSummary` — restores before the first scan, each file under the path
// the main process knows it by. The scan is held, so the saved copy is the only source of what the section shows.
test('a snapshot saved before instruction entries carried their paths restores with them, before the first scan', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-instructions-restore-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-instructions-restore-data-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '# Live rules\n')
  const current = emptySnapshot(1)
  current.sides.claude.detected = true
  current.sides.codex.detected = true
  const global: Record<string, unknown> = {
    ...current.global,
    claudeGlobalMd: { text: '# Saved rules\n', truncated: false },
    codexAgentsMd: { text: '# Saved codex notes\n', truncated: false },
    codexConfigSummary: { model: 'gpt-5.5-codex', projectCount: 0, mcpCount: 0 }
  }
  delete global.claudeMd
  delete global.agentsMd
  writeFileSync(join(userData, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    snapshot: { ...current, global }, stats: [], sessionFiles: [], registrations: [], reads: []
  } }))
  let app: ElectronApplication | undefined
  try {
    app = (await startApp({ userData, home, errors: mainErrors.errors, env: { AGENTSHED_SCAN_DELAY_MS: '20000' } })).app
    const win = await app.firstWindow()
    const paths = win.locator('.pane-body .instructions-path')
    await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
    await expect(paths).toHaveText([join(home, '.claude', 'CLAUDE.md')], { timeout: 5000 })
    await expect(win.locator('.pane-body .md')).toContainText('Saved rules')
    await win.locator('.pane-body .instructions-switch button', { hasText: 'AGENTS.md' }).click()
    await expect(paths).toHaveText([join(home, '.codex', 'AGENTS.md')])
    await expect(win.locator('.pane-body .md')).toContainText('Saved codex notes')
    expect(await win.locator('.startup-display-hint').getAttribute('data-state'), 'the first scan is still held').not.toBe('ready')
  } finally {
    if (app) await closeApp(app).catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})

test('a failed startup scan keeps the saved display and retries automatically with a stopped status', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-retry-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-retry-data-'))
  const first = join(home, 'first-project'), second = join(home, 'second-project')
  mkdirSync(first)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [first]: {} } }))
  let app: ElectronApplication | undefined
  const launch = (env: Record<string, string> = {}) => startApp({ userData, home, errors: mainErrors.errors, env }).then((started) => started.app)
  try {
    app = await launch()
    let win = await app.firstWindow()
    await win.locator('.trend-span-options').getByRole('button', { name: '60', exact: true }).click()
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row')).toHaveCount(1)
    await closeApp(app)
    app = await launch({ AGENTSHED_SCAN_FAILURES: '2', AGENTSHED_SCAN_DELAY_MS: '500', AGENTSHED_RESCAN_MS: '4000' })
    win = await app.firstWindow()
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'waiting', { timeout: 2000 })
    await expect(win.locator('.startup-display-hint')).toContainText('Showing previous data')
    await expect(win.locator('.trend-span-choice[aria-pressed="true"]')).toHaveText('60')
    await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText('Last 60 days')
    expect(await win.locator('.startup-display-hint svg').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row')).toHaveCount(1)
    mkdirSync(second)
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [first]: {}, [second]: {} } }))
    await expect(win.locator('.side .row')).toHaveCount(2, { timeout: 12000 })
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
  } finally {
    if (app) await closeApp(app).catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})

// A launch refused the single-instance lock because it cannot write its settings directory (docs/specs/i18n.md, The main
// process emits no natural language), through the real index.ts, which has no unit tests. refused-launch.test.ts covers
// the decision and the sentence.
//
// Gaps, by reading only: the dialog itself and a full disk. A modal dialog takes the foreground and waits for a click, so
// AGENTSHED_NO_FOREGROUND sends the sentence to stderr instead, on every platform.

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

// An untitled group, so the skip reaches these three cases alone and their names stay as they were
test.describe(() => {
  test.skip(process.getuid?.() === 0, 'a mode does not hold back root')

  test('at mode 555 the app exits non-zero with the sentence naming the directory, in the system\'s language when none is stored, and starts nothing', async () => {
    const f = fixture()
    try {
      chmodSync(f.userData, 0o555)
      const exit = await launchUntilExit(f, 'zh-CN')
      expect({ code: exit.code, signal: exit.signal }).toEqual({ code: 1, signal: null })
      expect(exit.stderr).toContain(`Agentshed 无法写入设置目录，这个目录可能是只读的，或所在磁盘已满：\n\n${f.userData}`)
      // Shown once the event loop runs, not while the module loads, where it is missing from the accessibility tree
      expect(exit.stderr).toContain('ready: true')
      // app-update's case on a file that cannot be read is the control: its readable launch logs a check here
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
    const { app } = await startApp({ userData: f.userData, home: f.home, errors: mainErrors.errors, env: { AGENTSHED_UPDATE_SCRIPT: f.script } })
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
})
