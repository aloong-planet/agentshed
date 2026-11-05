// Also not driven: the tab row over a failed detail fetch on a page drawn after a stale project's note (project-detail T10).
// The row draws before that branch and reads no fetch result. Add a case when a seam can make the project detail read fail:
// select a normal project from a note page on a tab other than Overview, and read that tab over an empty body.
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { localDayOffset } from './support/dates'
import { mkUsageHome } from './support/homes'
import { launch, close } from './support/launch'
import { scansLanded, errorToastsAdded } from './support/waits'

// A project only Grok registered still opens a working detail page: every section reads
// Claude/Codex-shaped locations that simply do not exist there, and each degrades to its empty
// state rather than throwing — the row must not be a dead end for the one side that put it there.
test('a Grok-only project opens its detail page without errors', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gonly-'))
  const proj = join(home, 'grok-only-proj')
  mkdirSync(proj, { recursive: true })
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  const row = win.locator('.side .row', { hasText: 'grok-only-proj' })
  await expect(row.locator('.cnt-b')).toHaveText('1')
  await row.click()
  const tabs = win.locator('.pane-head .tabs .tab')
  await expect(tabs.first()).toBeVisible()
  // The header names the recording sides as the full-name chips, derived from the side Record — a
  // grok-only project wears exactly one GROK chip (the hardcoded pair used to omit grok entirely)
  await expect(win.locator('.det-title .badge')).toHaveCount(1)
  await expect(win.locator('.det-title .badge.gk')).toHaveText('GROK')
  const n = await tabs.count()
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click()
    await expect(win.locator('.pane-body')).toBeVisible()
  }
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Sequence S (spec project-detail): a stale project opens as the note page — the shell plus one note
 * card, no section tabs, no detail fetch and no loading state; the full-name chips follow exactly
 * the recording sides; the prompt line copies with visible feedback; staleness follows the snapshot
 * both ways, and an entry that vanishes while selected falls back to the empty state.
 */
test('a stale project opens as the note page: card only, chips per recording side, copy feedback, and both staleness flips', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-stale-'))
  const triGhost = join(home, 'tri-ghost')
  const soloGhost = join(home, 'solo-ghost')
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ projects: { [triGhost]: {}, [soloGhost]: {} } })
  )
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${triGhost}"]\ntrust_level = "trusted"\n`)
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${triGhost}"]\ntrusted = true\n`)

  // A brisk rescan interval: the staleness flips below are observed through the automatic scan, the
  // only path left since the manual refresh was removed
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side input[type="checkbox"]').check()

  // (S1/S6) The tri-side ghost: the card, no tabs, and no loading state ever shown
  await win.locator('.side .row', { hasText: 'tri-ghost' }).click()
  const note = win.locator('.stale-note')
  await expect(note).toBeVisible()
  await expect(win.locator('.pane-head .tabs .tab')).toHaveCount(0)
  await expect(win.locator('.pane-body .none')).toHaveCount(0)
  // (S3) Full-name chips in both the cause and the send line — 3 sides × 2 slots
  await expect(note.locator('.badge')).toHaveCount(6)
  await expect(note.locator('.badge.gk')).toHaveText(['GROK', 'GROK'])
  await expect(note.locator('.badge.cl').first()).toHaveText('CLAUDE CODE')
  // (S2) The prompt embeds the absolute path, in the UI language
  await expect(note.locator('.code')).toContainText(triGhost)
  await expect(note.locator('.code')).toContainText('is stale')
  // (S5) The prompt pill stays inside the card
  const cardBox = await note.boundingBox()
  const pillBox = await note.locator('.code').boundingBox()
  if (cardBox === null || pillBox === null) throw new Error('note or pill not rendered')
  expect(pillBox.x + pillBox.width, 'the prompt pill must not overflow the card').toBeLessThanOrEqual(
    cardBox.x + cardBox.width + 1
  )
  // (S4) Copying shows the transient confirmation
  await note.locator('.cpy').click()
  await expect(note.locator('.copied.on')).toBeVisible()

  // (S3/S5) The claude-only ghost: a single chip in each slot
  await win.locator('.side .row', { hasText: 'solo-ghost' }).click()
  await expect(win.locator('.stale-note .badge')).toHaveCount(2)
  await expect(win.locator('.stale-note .badge.cl')).toHaveText(['CLAUDE CODE', 'CLAUDE CODE'])

  // (S6) stale → false: the directory reappears and the next automatic scan returns the sectioned page.
  // The page changing **is** the proof the scan landed — there is no manual trigger since 2026-08-23
  mkdirSync(soloGhost, { recursive: true })
  await expect(win.locator('.pane-head .tabs .tab').first()).toBeVisible()
  await expect(win.locator('.stale-note')).toHaveCount(0)

  // (S7) The selected entry vanishes from the registries → the empty state, not a ghost selection
  rmSync(soloGhost, { recursive: true, force: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [triGhost]: {} } }))
  await expect(win.locator('.empty')).toContainText('not in the snapshot')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * project-detail::REQ-004/AC-02: which tab a project's page shows, read from the ways into it that the criterion names. Every
 * step reads the header first: a switch holds the old page until the new one is ready, so the tab alone could be the old
 * project's.
 */
test('the tab a project opens on: another project keeps it, through a page with no tabs too; coming back by the rail or a side card starts on Overview; and leaving a session starts on Sessions, once', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-tabs-'))
  const alpha = join(home, 'alpha')
  const beta = join(home, 'beta')
  const ghost = join(home, 'ghost')
  const phantom = join(home, 'phantom')
  mkdirSync(alpha)
  mkdirSync(beta)
  const register = (...paths: string[]): void =>
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: Object.fromEntries(paths.map((p) => [p, {}])) }))
  register(alpha, beta, ghost, phantom)
  const sessionDir = join(home, '.claude', 'projects', alpha.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(sessionDir, { recursive: true })
  const at = localDayOffset(1).toISOString()
  writeFileSync(
    join(sessionDir, 'a.jsonl'),
    [
      { type: 'user', timestamp: at, message: { role: 'user', content: 'Sample question' } },
      { type: 'assistant', timestamp: at, message: { model: 'claude-fable-5', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
    ].map((line) => JSON.stringify(line)).join('\n') + '\n'
  )

  // A brisk rescan, for the steps a scan drives: a record going or coming back reaches the page through the automatic scan
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  const agents = win.locator('.rail .ri').nth(0)
  const projects = win.locator('.rail .ri').nth(1)
  const row = (name: string) => win.locator('.side .row', { hasText: name })
  const selected = win.locator('.pane-head .tabs .tab.on')
  const select = async (tab: string): Promise<void> => {
    await win.locator('.pane-head .tabs .tab', { hasText: tab }).click()
    await expect(selected).toHaveText(tab)
  }
  const pageIs = async (project: string, tab: string): Promise<void> => {
    await expect(win.locator('.det-title h1')).toHaveText(project)
    await expect(selected).toHaveText(tab)
  }
  const leaveByTheRailAndComeBack = async (): Promise<void> => {
    await agents.click()
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
    await projects.click()
  }
  const throughTheSideCard = async (): Promise<void> => {
    await agents.click()
    await win.locator('.pane-head .stats .stat', { has: win.locator('.badge.cl') }).locator('.s .stat-link').click()
  }
  const openTheSession = async (): Promise<void> => {
    await select('Sessions')
    await win.locator('.pane-body .se', { hasText: 'Sample question' }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  }
  const selectedWindow = win.locator('.tot-c.on .k')
  const chooseWindow = async (label: string): Promise<void> => {
    await win.locator('.tot-c', { hasText: label }).click()
    await expect(selectedWindow).toHaveText(label)
  }
  const toTheNote = async (project: string): Promise<void> => {
    await win.locator('.side input[type="checkbox"]').check()
    await row(project).click()
    await expect(win.locator('.det-title h1')).toHaveText(project)
    await expect(win.locator('.stale-note')).toBeVisible()
  }

  // The first selection
  await projects.click()
  await row('alpha').click()
  await pageIs('alpha', 'Overview')

  // Another project takes over the page on screen, its tab and Overview's window (token-stats G11). A click on the project's
  // own row first leaves the tab alone: the header's change orders the read behind both clicks, which that row alone could not
  await chooseWindow('Today')
  await select('Skills')
  await row('alpha').click()
  await row('beta').click()
  await pageIs('beta', 'Skills')
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')

  // Leaving by the rail takes the page off the stage, so coming back draws a new one, on the default window
  await select('Skills')
  await leaveByTheRailAndComeBack()
  await pageIs('beta', 'Overview')
  await expect(selectedWindow).toHaveText('Total · all history')

  // So does a side card's project count that keeps the selection
  await chooseWindow('Today')
  await select('Skills')
  await throughTheSideCard()
  await pageIs('beta', 'Overview')
  await expect(selectedWindow).toHaveText('Total · all history')

  // A stale project's note page has no tabs, so it neither changes nor uses the tab: the next project opens on the one from
  // before it
  await select('Skills')
  await toTheNote('ghost')
  await row('alpha').click()
  await pageIs('alpha', 'Skills')
  await select('Sessions')
  await toTheNote('ghost')
  await row('beta').click()
  await pageIs('beta', 'Sessions')

  // Two such pages in a row change nothing
  await select('Memory')
  await toTheNote('ghost')
  await toTheNote('phantom')
  await row('alpha').click()
  await pageIs('alpha', 'Memory')

  // Overview's window goes through such a page the same way (token-stats G11)
  await select('Overview')
  await chooseWindow('Today')
  await toTheNote('ghost')
  await row('beta').click()
  await pageIs('beta', 'Overview')
  await expect(selectedWindow).toHaveText('Today')
  await row('alpha').click()
  await pageIs('alpha', 'Overview')

  // Leaving by the rail or a side card's project count while on a note page: coming back is not switching projects, so the
  // next project opens on Overview and the default window
  for (const comeBack of [leaveByTheRailAndComeBack, throughTheSideCard]) {
    await select('Overview')
    await chooseWindow('Today')
    await select('Skills')
    await toTheNote('ghost')
    await comeBack()
    await expect(win.locator('.stale-note')).toBeVisible()
    await row('beta').click()
    await pageIs('beta', 'Overview')
    await expect(selectedWindow).toHaveText('Total · all history')
  }
  await row('alpha').click()
  await pageIs('alpha', 'Overview')

  // Coming back from a session lands on Sessions (T8), once: leaving by the rail or by a side card's project count and
  // coming back starts on Overview, whichever tab was on screen when leaving
  const backFromTheSession = async (): Promise<void> => {
    await openTheSession()
    await win.locator('.sback').click()
    await pageIs('alpha', 'Sessions')
  }
  await backFromTheSession()
  await leaveByTheRailAndComeBack()
  await pageIs('alpha', 'Overview')
  await backFromTheSession()
  await select('Skills')
  await leaveByTheRailAndComeBack()
  await pageIs('alpha', 'Overview')
  await backFromTheSession()
  await throughTheSideCard()
  await pageIs('alpha', 'Overview')
  await backFromTheSession()
  await select('Skills')
  await throughTheSideCard()
  await pageIs('alpha', 'Overview')

  // A scan turning the page into a stale project's note and back, or taking the project out of the snapshot and back, draws
  // it on the remembered tab. Read on tabs other than Sessions, which could not tell that from the landing
  await backFromTheSession()
  await select('Overview')
  await chooseWindow('Today')
  await select('Skills')
  rmSync(alpha, { recursive: true })
  await expect(win.locator('.stale-note')).toBeVisible()
  mkdirSync(alpha)
  await pageIs('alpha', 'Skills')
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')
  // A session page takes the pane off the stage, but not the window: it is held while you stay in Projects
  await backFromTheSession()
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')
  await select('Memory')
  register(beta, ghost, phantom)
  await expect(win.locator('.detail .empty')).toContainText('not in the snapshot')
  register(alpha, beta, ghost, phantom)
  await pageIs('alpha', 'Memory')

  // With the landed page on screen another project takes it over, and its tab; leaving by the rail starts on Overview
  await backFromTheSession()
  await row('beta').click()
  await pageIs('beta', 'Sessions')
  await leaveByTheRailAndComeBack()
  await pageIs('beta', 'Overview')

  // A project selected in the list from a session page lands on Sessions, once. This one has none yet, and the tab says so.
  // With that page on screen another project keeps the tab, and leaving by the rail starts on Overview
  await row('alpha').click()
  await expect(win.locator('.det-title h1')).toHaveText('alpha')
  await chooseWindow('Today')
  await openTheSession()
  await row('beta').click()
  await pageIs('beta', 'Sessions')
  await expect(win.locator('.pane-body .none')).toHaveText(
    'No sessions in this project yet. They appear automatically once any agent side has a conversation in this directory.'
  )
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')
  await select('Sessions')
  await row('alpha').click()
  await pageIs('alpha', 'Sessions')
  await leaveByTheRailAndComeBack()
  await pageIs('alpha', 'Overview')

  // So does the session's own project, its row clicked with the session on screen
  await openTheSession()
  await row('alpha').click()
  await pageIs('alpha', 'Sessions')
  await expect(win.locator('.pane-head .stitle')).toHaveCount(0)
  await throughTheSideCard()
  await pageIs('alpha', 'Overview')

  // With a session on screen the rail's own item is no way out, so the window stays; leaving Projects resets it
  await chooseWindow('Today')
  await openTheSession()
  await projects.click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  await win.locator('.sback').click()
  await pageIs('alpha', 'Sessions')
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')
  await openTheSession()
  await leaveByTheRailAndComeBack()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  await win.locator('.sback').click()
  await pageIs('alpha', 'Sessions')
  await select('Overview')
  await expect(selectedWindow).toHaveText('Total · all history')

  // Whichever way the session was entered: from Overview's session card, then another project or the back control
  const openFromTheCard = async (): Promise<void> => {
    await win.locator('.pane-body .se', { hasText: 'Sample question' }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  }
  await openFromTheCard()
  await row('beta').click()
  await pageIs('beta', 'Sessions')
  await row('alpha').click()
  await pageIs('alpha', 'Sessions')
  await select('Overview')
  await openFromTheCard()
  await win.locator('.sback').click()
  await pageIs('alpha', 'Sessions')

  // A session left onto a stale project's note keeps the landing: the project a scan brings back opens on Sessions
  await openTheSession()
  await toTheNote('ghost')
  mkdirSync(ghost)
  await pageIs('ghost', 'Sessions')

  // The project on screen leaves the snapshot (S7): that state has no tabs either, so selecting another project clears the
  // message and opens on the tab from before it
  await row('beta').click()
  await pageIs('beta', 'Sessions')
  await select('Overview')
  await chooseWindow('Today')
  await select('Skills')
  register(alpha, ghost, phantom)
  await expect(win.locator('.detail .empty')).toContainText('not in the snapshot')
  await row('alpha').click()
  await pageIs('alpha', 'Skills')
  await expect(win.locator('.detail .empty')).toHaveCount(0)
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')

  // A note page whose project then leaves the snapshot is two such pages in a row
  await select('Instructions')
  await toTheNote('phantom')
  register(alpha, ghost)
  await expect(win.locator('.detail .empty')).toContainText('not in the snapshot')
  await row('alpha').click()
  await pageIs('alpha', 'Instructions')

  expect(l.errors).toEqual([])

  // A session left onto the not-in-snapshot state keeps the landing too. Last, and past the check above, because the main
  // process refuses the open session's reads once its project has gone
  await openTheSession()
  register(ghost)
  await scansLanded(win, 2)
  await win.locator('.sback').click()
  await expect(win.locator('.detail .empty')).toContainText('not in the snapshot')
  register(alpha, ghost)
  await pageIs('alpha', 'Sessions')

  await close(l)

  // A first selection that goes through a note page has no earlier tab, so the next project opens on Overview. A window of
  // its own, because a first selection happens once in a window's life
  const freshHome = mkdtempSync(join(tmpdir(), 'agentshed-e2e-tabs-fresh-'))
  const freshAlpha = join(freshHome, 'alpha')
  mkdirSync(freshAlpha)
  writeFileSync(join(freshHome, '.claude.json'), JSON.stringify({ projects: { [freshAlpha]: {}, [join(freshHome, 'ghost')]: {} } }))
  const fresh = await launch(undefined, freshHome)
  const freshWin = await fresh.app.firstWindow()
  await freshWin.locator('.rail .ri').nth(1).click()
  await freshWin.locator('.side input[type="checkbox"]').check()
  await freshWin.locator('.side .row', { hasText: 'ghost' }).click()
  await expect(freshWin.locator('.stale-note')).toBeVisible()
  await freshWin.locator('.side .row', { hasText: 'alpha' }).click()
  await expect(freshWin.locator('.det-title h1')).toHaveText('alpha')
  await expect(freshWin.locator('.pane-head .tabs .tab.on')).toHaveText('Overview')
  expect(fresh.errors).toEqual([])
  await close(fresh)
})

/**
 * Query layer (ADR-0028): three plain projects with no data, used only to switch between — content
 * volume is irrelevant here, only which project's page is on screen.
 */
function mkThreeProjectHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-qlayer-'))
  const names = ['proj-a', 'proj-b', 'proj-c']
  const projects: Record<string, object> = {}
  for (const n of names) {
    mkdirSync(join(home, n), { recursive: true })
    projects[join(home, n)] = {}
  }
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects }))
  return home
}

test('project switch (query layer): the highlight moves at once and the pane holds the previous project until the next detail arrives', async () => {
  const l = await launch(undefined, mkThreeProjectHome(), { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  const rowA = win.locator('.side .row', { hasText: 'proj-a' })
  const rowB = win.locator('.side .row', { hasText: 'proj-b' })
  const header = win.locator('.pane-head h1')

  // First visit: the empty picker holds until A's detail arrives, then A shows whole
  await rowA.click()
  await expect(header).toHaveText('proj-a')
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible()

  await rowB.click()
  // The highlight moves at once
  await expect(rowB).toHaveClass(/sel/)
  await expect(rowA).not.toHaveClass(/sel/)
  // Sampled inside the 600ms delay window, immediately after the click: A's page is still whole —
  // header and a non-empty body, not an empty pane under a new header (project-detail T1)
  await expect(header).toHaveText('proj-a')
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible()

  // After the delay, the pane switches to B in one frame
  await expect(header).toHaveText('proj-b')
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible()

  // Revisiting A is a cached visit (T2): well inside the delay window, proving it drew from cache
  // rather than waiting on a fresh fetch
  await rowA.click()
  await expect(header).toHaveText('proj-a', { timeout: 200 })
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible({ timeout: 200 })

  expect(l.errors).toEqual([])
  await close(l)
})

test('project switch (query layer): rapid A → B → C never shows B, and B is still cached afterwards', async () => {
  const l = await launch(undefined, mkThreeProjectHome(), { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  const rowA = win.locator('.side .row', { hasText: 'proj-a' })
  const rowB = win.locator('.side .row', { hasText: 'proj-b' })
  const rowC = win.locator('.side .row', { hasText: 'proj-c' })
  const header = win.locator('.pane-head h1')

  await rowA.click()
  await expect(header).toHaveText('proj-a')
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible()

  // B, then C before B's 600ms delay can elapse: the pending switch to B is interrupted and B's
  // page is never committed (project-detail T5)
  await rowB.click()
  await rowC.click()
  await expect(rowC).toHaveClass(/sel/)
  // Immediately after interrupting: still on A (neither B nor C has committed yet)
  await expect(header).toHaveText('proj-a')

  // C eventually lands
  await expect(header).toHaveText('proj-c')
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible()

  // B's fetch still completed and was cached even though its page never showed: revisiting it now
  // is a cached visit, well inside the delay window
  await rowB.click()
  await expect(header).toHaveText('proj-b', { timeout: 200 })

  expect(l.errors).toEqual([])
  await close(l)
})

test('leaving a project for a session page and coming back (query layer closeout): the project page is a cached visit landing on Sessions, then revalidates by transfusion', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  // The rescan interval must stay comfortably above the fetch delay: a rescan firing before the
  // previous invalidation's refetch completes would keep resetting it, and the query would never
  // settle (found while building this test — measured, not assumed).
  const l = await launch(undefined, home, { AGENTSHED_FETCH_DELAY_MS: '500', AGENTSHED_RESCAN_MS: '1500' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  // mkUsageHome's project has a session on each side (Claude's a.jsonl, Codex's rollout)
  await expect(win.locator('.pane-body .card .se')).toHaveCount(2)

  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')

  // A second session file lands on this project while its detail is off screen (behind the session
  // page) — the sessions list held in cache does not yet know about it
  writeFileSync(
    join(cdir, 'b.jsonl'),
    JSON.stringify({
      type: 'user',
      timestamp: localDayOffset(1).toISOString(),
      message: { role: 'user', content: 'Second session question' }
    }) + '\n'
  )

  // Back to the project: a cached visit (project-detail T9-family), landing on Sessions at once —
  // well inside the 500ms delay window, proving it drew from cache rather than a fresh fetch
  await win.locator('.sback').click()
  await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions', { timeout: 200 })
  await expect(win.locator('.pane-body .card .se').first()).toBeVisible({ timeout: 200 })

  // It then revalidates by transfusion: the automatic rescan updates the cached list in place — the
  // new session appears with no blank frame or remount in between
  await expect(win.locator('.pane-body .card .se')).toHaveCount(3)
  await expect(win.locator('.pane-body .card .se', { hasText: 'Second session question' })).toBeVisible()

  expect(l.errors).toEqual([])
  await close(l)
})

test('opening an artifact whose file was removed after the scan (query layer): one toast for each click, no overlay, no crash', async () => {
  // The file that goes is a link's target. A plain file removed leaves the list at the next read of the list, which is the next
  // scan or a revalidation (project-detail T2), so a click on its row would race them. `collectMd` lists a link by name, and
  // its read fails whatever lands
  const mkHome = (): { home: string; target: string; link: string } => {
    const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-artifact-fail-'))
    const proj = join(home, 'demo-proj')
    mkdirSync(join(proj, 'docs', 'specs'), { recursive: true })
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
    const target = join(proj, 'moved.md')
    const link = join(proj, 'docs', 'specs', 'doomed.md')
    writeFileSync(target, '# Doomed\n\nGone before it opens.\n')
    symlinkSync(target, link)
    writeFileSync(join(proj, 'docs', 'specs', 'fine.md'), '# Fine\n\nThis one reads.\n')
    return { home, target, link }
  }
  const { home, target: doomedTarget, link: doomedLink } = mkHome()
  const openTheArtifacts = async (w: Page): Promise<void> => {
    await w.locator('.rail .ri').nth(1).click()
    await w.locator('.side .row').first().click()
    await w.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
  }
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const added = await errorToastsAdded(win)
  await openTheArtifacts(win)
  // By its path: its name falls back from the heading to the file name once the target is gone
  const doomed = win.locator(`.it.ai[title="${doomedLink}"]`)
  await expect(doomed).toBeVisible()

  rmSync(doomedTarget, { force: true })
  await doomed.click()
  await expect(win.locator('.toast.err')).toHaveText('This file can no longer be read (moved or deleted?)')
  await expect(win.locator('.reader')).toHaveCount(0)
  expect(await added()).toBe(1)

  // Each click on it is a new attempt: one toast, not silence (B9), and not two from the cached failure and the new one
  await doomed.click()
  expect(await added()).toBe(1)
  await win.locator('.it.ai', { hasText: 'Fine' }).click()
  await expect(win.locator('.reader')).toBeVisible()
  await win.locator('.mask').click()
  await expect(win.locator('.reader')).toHaveCount(0)
  expect(await added()).toBe(0)
  await doomed.click()
  expect(await added()).toBe(1)
  await expect(win.locator('.reader')).toHaveCount(0)

  // The toast states the failure in the current UI language
  await win.locator('.rail .ri.set').click()
  await win.locator('[data-testid="language-trigger"]').click()
  await win.locator('.lang-opt[data-lang="zh"]').click()
  await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.pane-head .tabs .tab', { hasText: '产物' }).click()
  await doomed.click()
  await expect(win.locator('.toast.err').last()).toHaveText('该文件已不可读(被移动或删除?)')
  expect(await added()).toBe(1)

  // The file back: the click reads it again and opens it, with no toast from the failure it remembers
  writeFileSync(doomedTarget, '# Doomed\n\nBack again.\n')
  await doomed.click()
  await expect(win.locator('.reader')).toContainText('Back again.')
  expect(await added()).toBe(0)

  // Removed again, now that it has been read: the click shows what was kept, with no toast (ADR-0029)
  await win.locator('.mask').click()
  await expect(win.locator('.reader')).toHaveCount(0)
  rmSync(doomedTarget, { force: true })
  await doomed.click()
  await expect(win.locator('.reader')).toContainText('Back again.')
  expect(await added()).toBe(0)
  await expect(win.locator('.reader')).toContainText('Back again.')
  await close(l)

  // A failing read overtaken by a click on another file: its toast, and the other file opens and stays
  const third = mkHome()
  const l3 = await launch(undefined, third.home, { AGENTSHED_FETCH_DELAY_MS: '500' })
  const win3 = await l3.app.firstWindow()
  const added3 = await errorToastsAdded(win3)
  await openTheArtifacts(win3)
  const doomed3 = win3.locator(`.it.ai[title="${third.link}"]`)
  await expect(doomed3).toBeVisible()
  rmSync(third.target, { force: true })
  await doomed3.click()
  await win3.locator('.it.ai', { hasText: 'Fine' }).click()
  await expect(win3.locator('.reader')).toContainText('This one reads.')
  expect(await added3()).toBe(1)
  await expect(win3.locator('.reader')).toContainText('This one reads.')
  await close(l3)

  // A read that fails through scans, with scans landing
  const home2 = mkdtempSync(join(tmpdir(), 'agentshed-e2e-artifact-fail-'))
  const proj2 = join(home2, 'demo-proj')
  mkdirSync(join(proj2, 'docs', 'specs'), { recursive: true })
  writeFileSync(join(home2, '.claude.json'), JSON.stringify({ projects: { [proj2]: {} } }))
  const target = join(proj2, 'moved.md')
  const link = join(proj2, 'docs', 'specs', 'dangling.md')
  symlinkSync(target, link)
  const l2 = await launch(undefined, home2, { AGENTSHED_RESCAN_MS: '250' })
  const win2 = await l2.app.firstWindow()
  const added2 = await errorToastsAdded(win2)
  await openTheArtifacts(win2)
  const dangling = win2.locator(`.it.ai[title="${link}"]`)
  await expect(dangling).toBeVisible()
  await dangling.click()
  expect(await added2()).toBe(1)
  await scansLanded(win2, 2)
  await expect(dangling).toBeVisible()
  expect(await added2()).toBe(0)
  await dangling.click()
  expect(await added2()).toBe(1)
  await scansLanded(win2, 2)
  expect(await added2()).toBe(0)

  // The target arriving opens nothing by itself: nothing is open any more. The next click opens it
  writeFileSync(target, '# Arrived\n\nThe link reads now.\n')
  await scansLanded(win2, 2)
  await expect(win2.locator('.reader')).toHaveCount(0)
  await dangling.click()
  await expect(win2.locator('.reader')).toContainText('The link reads now.')
  expect(await added2()).toBe(0)
  await close(l2)
})

test('reopening an artifact (query layer): first open is slow, reopening it is instant', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-artifactcache-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(proj, 'docs'), { recursive: true })
  writeFileSync(join(proj, 'docs', 'CONTEXT.md'), '# Cached artifact\n\nbody\n')
  // A memory topic read through the same delayed channel (memory-view::US-001/AC-07, the loading state)
  const memDir = join(home, '.claude', 'projects', proj.replace(/[^A-Za-z0-9]/g, '-'), 'memory')
  mkdirSync(memDir, { recursive: true })
  writeFileSync(join(memDir, 'slow.md'), '---\nname: slow\n---\n\nSlow topic body\n')
  const l = await launch(undefined, home, { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
  await expect(win.locator('.it.ai', { hasText: 'Cached artifact' })).toBeVisible()

  await win.locator('.it.ai', { hasText: 'Cached artifact' }).click()
  // Sampled inside the 600ms delay window, immediately after the click: no overlay yet
  await expect(win.locator('.reader')).toHaveCount(0)
  await expect(win.locator('.reader .md')).toContainText('body')

  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.it.ai', { hasText: 'Cached artifact' }).click() // reopen — a cached visit
  await expect(win.locator('.reader .md')).toContainText('body', { timeout: 200 })
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // The memory file drawer while its file is read: "Loading…" inside the frame, the bar and switch already in
  // place, then the preview (memory-view::US-001/AC-07)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await win.locator('.it.row-btn', { hasText: 'slow.md' }).click()
  const fd = win.locator('.file-drawer')
  await expect(fd.locator('.md-preview-body')).toHaveText('Loading…', { timeout: 300 })
  await expect(fd.locator('.md-preview-name')).toHaveText('slow.md')
  await expect(fd.locator('.md-preview-seg')).toBeVisible()
  await expect(fd.locator('.md-preview-body')).toContainText('Slow topic body')
  await expect(fd.locator('.md-fm')).toContainText('slow')

  expect(l.errors).toEqual([])
  await close(l)
})
