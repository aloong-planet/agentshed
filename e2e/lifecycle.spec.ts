// E2E: Playwright driving a real Electron (the build output), covering the assembly layer unit tests
// cannot reach —
// the whole IPC chain, rendering, dimension switching, tab switching and refresh deduplication, while
// asserting the main process emits no errors.
// The key scenario: **starting with an old-format cache** (the shape of the 2026-07-30 production crash;
// the unit tests pin it and this guards the whole chain again).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp } from './close-app'
import { mkUsageHome, questionLine } from './support/homes'
import { makeUserData, launch, close, startApp } from './support/launch'

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
