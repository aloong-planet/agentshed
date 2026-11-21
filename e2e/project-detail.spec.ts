// Not observable: that no file of a directory refused under project-detail::CON-001/AC-03 is read, as a read leaves nothing an
// e2e case can see. The admission case below shows that nothing of it reaches the page or the registrations, and the
// guard and the recheck run before the reader in index.ts. Add a check when a seam reports what the reader opened.
// Also not driven: the tab row over a failed detail fetch on a page drawn after a stale project's note (project-detail T10).
// The row draws before that branch and reads no fetch result. Add a case when a seam can make the project detail read fail:
// select a normal project from a note page on a tab other than Overview, and read that tab over an empty body.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { localDayOffset } from './support/dates'
import { mkUsageHome } from './support/homes'
import { closeApp } from './close-app'
import { launch, launchWindow, close, closeWindow, makeUserData, startApp, failOnMainErrors, type WindowLaunched } from './support/launch'
import { scansLanded } from './support/waits'
import { projectRow } from './support/project-row'
import { mkHome, box, exits, openHit, clickSearchSessions } from './support/search-home'

const mainErrors = failOnMainErrors()

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
    await projectRow(win, project).click()
    await expect(win.locator('.det-title h1')).toHaveText(project)
    await expect(win.locator('.stale-note')).toBeVisible()
  }

  // The first selection
  await projects.click()
  await projectRow(win, 'alpha').click()
  await pageIs('alpha', 'Overview')

  // Another project takes over the page on screen, its tab and Overview's window (token-stats G11). A click on the project's
  // own row first leaves the tab alone: the header's change orders the read behind both clicks, which that row alone could not
  await chooseWindow('Today')
  await select('Skills')
  await projectRow(win, 'alpha').click()
  await projectRow(win, 'beta').click()
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
  await projectRow(win, 'alpha').click()
  await pageIs('alpha', 'Skills')
  await select('Sessions')
  await toTheNote('ghost')
  await projectRow(win, 'beta').click()
  await pageIs('beta', 'Sessions')

  // Two such pages in a row change nothing
  await select('Memory')
  await toTheNote('ghost')
  await toTheNote('phantom')
  await projectRow(win, 'alpha').click()
  await pageIs('alpha', 'Memory')

  // Overview's window goes through such a page the same way (token-stats G11)
  await select('Overview')
  await chooseWindow('Today')
  await toTheNote('ghost')
  await projectRow(win, 'beta').click()
  await pageIs('beta', 'Overview')
  await expect(selectedWindow).toHaveText('Today')
  await projectRow(win, 'alpha').click()
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
    await projectRow(win, 'beta').click()
    await pageIs('beta', 'Overview')
    await expect(selectedWindow).toHaveText('Total · all history')
  }
  await projectRow(win, 'alpha').click()
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
  await projectRow(win, 'beta').click()
  await pageIs('beta', 'Sessions')
  await leaveByTheRailAndComeBack()
  await pageIs('beta', 'Overview')

  // A project selected in the list from a session page lands on Sessions, once. This one has none yet, and the tab says so.
  // With that page on screen another project keeps the tab, and leaving by the rail starts on Overview
  await projectRow(win, 'alpha').click()
  await expect(win.locator('.det-title h1')).toHaveText('alpha')
  await chooseWindow('Today')
  await openTheSession()
  await projectRow(win, 'beta').click()
  await pageIs('beta', 'Sessions')
  await expect(win.locator('.pane-body .none')).toHaveText(
    'No sessions in this project yet. They appear automatically once any agent side has a conversation in this directory.'
  )
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')
  await select('Sessions')
  await projectRow(win, 'alpha').click()
  await pageIs('alpha', 'Sessions')
  await leaveByTheRailAndComeBack()
  await pageIs('alpha', 'Overview')

  // So does the session's own project, its row clicked with the session on screen
  await openTheSession()
  await projectRow(win, 'alpha').click()
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
  await projectRow(win, 'beta').click()
  await pageIs('beta', 'Sessions')
  await projectRow(win, 'alpha').click()
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
  await projectRow(win, 'beta').click()
  await pageIs('beta', 'Sessions')
  await select('Overview')
  await chooseWindow('Today')
  await select('Skills')
  register(alpha, ghost, phantom)
  await expect(win.locator('.detail .empty')).toContainText('not in the snapshot')
  await projectRow(win, 'alpha').click()
  await pageIs('alpha', 'Skills')
  await expect(win.locator('.detail .empty')).toHaveCount(0)
  await select('Overview')
  await expect(selectedWindow).toHaveText('Today')

  // A note page whose project then leaves the snapshot is two such pages in a row
  await select('Instructions')
  await toTheNote('phantom')
  register(alpha, ghost)
  await expect(win.locator('.detail .empty')).toContainText('not in the snapshot')
  await projectRow(win, 'alpha').click()
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

test('a return overtaken while it is held on its fetch draws no page, so the next page starts on Overview, by each way out (project-detail::REQ-004/AC-02)', async () => {
  const { home } = mkHome()
  const l = await launchWindow(home, { AGENTSHED_FETCH_DELAY_MS: '1000' })
  const { win, app } = l
  // Each way uses a project not yet fetched, because a fetched one is not held
  const rail = (i: number) => win.locator('.rail .ri').nth(i)
  const toAgents = async (): Promise<void> => {
    await rail(0).click()
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  }
  const ways: { keyword: string; text: string; name: string; leave: () => Promise<void>; back: () => Promise<void> }[] = [
    {
      keyword: 'notarize',
      text: 'How do I notarize the app?',
      name: 'target-proj',
      leave: toAgents,
      back: () => rail(1).click()
    },
    {
      keyword: 'notarize',
      text: 'Child asks to notarize the fork',
      name: 'fork-proj',
      leave: async () => {
        await clickSearchSessions(app)
        await expect(box(win)).toBeVisible()
      },
      back: () => rail(1).click()
    },
    {
      keyword: 'notarize',
      text: 'twin asks to notarize',
      name: 'twin',
      back: () => rail(1).click(),
      leave: async () => {
        await app.evaluate(({ Menu }) => {
          const walk = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
            for (const i of items) {
              if (i.accelerator === 'CmdOrCtrl+,') return i
              const found = i.submenu ? walk(i.submenu.items) : null
              if (found) return found
            }
            return null
          }
          const item = walk(Menu.getApplicationMenu()?.items ?? [])
          if (!item) throw new Error('no Settings item in the application menu')
          ;(item.click as () => void)()
        })
        await expect(win.locator('.settings-sec-t').first()).toBeVisible()
      }
    },
    {
      // The card clears nothing itself: this is the way that needs the clear on leaving
      keyword: 'filler question 21',
      text: 'filler question 21',
      name: 'filler-21',
      leave: toAgents,
      back: () => win.locator('.pane-head .stats .stat', { has: win.locator('.badge.cl') }).locator('.s .stat-link').click()
    }
  ]
  try {
    for (const way of ways) {
      await openHit(win, way.keyword, way.text)
      // The exit holds the session page on its fetch
      await exits(win).nth(1).click()
      await expect(win.locator('.pane-head .stitle')).toBeVisible()
      await way.leave()
      // The held return lands with no page on the stage. Past the fetch delay; coming back sooner reads the same
      await win.waitForTimeout(1300)
      await way.back()
      await expect(win.locator('.pane-head h1')).toHaveText(way.name)
      await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Overview')
    }

    // The rail's own item is no way out: the return draws its page, on Sessions (T8)
    await openHit(win, 'filler question 22', 'filler question 22')
    await exits(win).nth(1).click()
    await expect(win.locator('.pane-head .stitle')).toBeVisible()
    await rail(1).click()
    await expect(win.locator('.pane-head h1')).toHaveText('filler-22')
    await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions')
  } finally {
    await closeWindow(l, home)
  }
})

test('a return onto a stale project\'s note keeps the landing: the next project, or that one when a scan brings it back, opens on Sessions, by the back control and by a selection in the list (project-detail::REQ-004/AC-02, session-view P3)', async () => {
  const { home } = mkHome()
  const l = await launchWindow(home, { AGENTSHED_RESCAN_MS: '250' })
  const { win } = l
  const header = win.locator('.pane-head h1')
  const note = win.locator('.stale-note')
  const dirOf = (n: number): string => join(home, 'work', `filler-${n}`)
  // Each round takes a filler project of its own, so none waits on a scan to undo the round before
  const waysOntoTheNote = [
    // A hit's way on into its project, which reads "Go to <project>" for a stale one
    async (n: number): Promise<void> => {
      rmSync(dirOf(n), { recursive: true })
      await openHit(win, `filler question ${n}`, `filler question ${n}`)
      await expect(exits(win)).toHaveText(['Back to search results', `Go to filler-${n}`])
      await exits(win).nth(1).click()
    },
    // The back control, with the project gone stale under the session: the list hiding its row says the scan has arrived
    async (n: number): Promise<void> => {
      await win.locator('.rail .ri').nth(1).click()
      await projectRow(win, `filler-${n}`).click()
      await expect(header).toHaveText(`filler-${n}`)
      await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
      await win.locator('.pane-body .card .se', { hasText: `filler question ${n}` }).click()
      await expect(win.locator('.pane-head .stitle')).toHaveText(`filler question ${n}`)
      rmSync(dirOf(n), { recursive: true })
      await expect(projectRow(win, `filler-${n}`)).toHaveCount(0)
      await win.locator('.pane-head .sback').click()
    },
    // A selection in the list, from another project's session
    async (n: number): Promise<void> => {
      rmSync(dirOf(n), { recursive: true })
      await openHit(win, 'notarize', 'How do I notarize the app?')
      await expect(projectRow(win, `filler-${n}`)).toHaveCount(0)
      await win.locator('.side input[type="checkbox"]').check()
      await projectRow(win, `filler-${n}`).click()
    }
  ]
  try {
    let n = 11
    for (const ontoTheNote of waysOntoTheNote) {
      for (const scanBringsItBack of [false, true]) {
        await ontoTheNote(n)
        await expect(header).toHaveText(`filler-${n}`)
        await expect(note).toBeVisible()
        if (scanBringsItBack) mkdirSync(dirOf(n))
        else await projectRow(win, 'target-proj').click()
        await expect(header).toHaveText(scanBringsItBack ? `filler-${n}` : 'target-proj')
        await expect(note).toHaveCount(0)
        await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions')
        n++
      }
    }
    expect(l.errors).toEqual([])
  } finally {
    await closeWindow(l, home)
  }
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

// project-detail R1 and R3 (#402): a project's documents are neither listed nor read. A relative link to one in the
// project's instructions shows the out-of-scope notice and does not navigate the window; a read of it over the real
// channel is refused once the page has registered what it reads, while a memory topic the same page lists still reads:
// one written after the scan has landed, so that only the page's own read registration admits it (the Implementation
// Decisions' allow-list).
test('a project document is not readable: its link in the instructions shows the notice, and a read of it is refused while a memory topic reads', async () => {
  mainErrors.allow(/memory-file-not-whitelisted/)
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-docs-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(join(proj, 'docs'), { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const context = join(proj, 'docs', 'CONTEXT.md')
  writeFileSync(context, '# Glossary\n\nGlossary body\n')
  writeFileSync(join(proj, 'CLAUDE.md'), '# Demo instructions\n\nSee [the glossary](./docs/CONTEXT.md).\n')
  const memDir = join(home, '.claude', 'projects', proj.replace(/[^A-Za-z0-9]/g, '-'), 'memory')
  mkdirSync(memDir, { recursive: true })
  const topic = join(memDir, 'topic.md')
  const userData = makeUserData()
  const { app } = await startApp({ userData, home, errors: mainErrors.errors })
  try {
    const win = await app.firstWindow()
    await win.locator('.rail .ri').nth(1).click()
    // The row is the scan's: its registration of memory files has been made, without the topic
    const row = win.locator('.side .row', { hasText: 'demo-proj' })
    await expect(row).toBeVisible()
    writeFileSync(topic, 'Topic body\n')
    await row.click()
    await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
    const urlBefore = win.url()
    await win.locator('.pane-body .md a', { hasText: 'the glossary' }).click()
    await expect(win.locator('.toast.err')).toHaveText('The link target is outside the readable scope')
    await expect(win.locator('.reader, .file-drawer')).toHaveCount(0)
    expect(win.url(), 'a link to a project document must not navigate').toBe(urlBefore)

    const read = (file: string) => win.evaluate(async (f) => {
      try { return (await window.agentshed.readMemoryFile(f)).text } catch (e) { return `refused: ${(e as Error).message}` }
    }, file)
    expect(await read(topic), 'the page registered its memory topic').toBe('Topic body\n')
    expect(await read(context)).toContain('memory-file-not-whitelisted')
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

// project-detail::CON-001/AC-02, AC-03 over the real channel. The first launch saves A's and B's pages; the second, its first scan held,
// restores a snapshot listing both and then scans one listing only A. A directory neither lists is refused while the
// scan is still held, so by the guard against the restored snapshot; A and B, asked for before the scan, pass that guard
// and wait for it, and only A is answered, as the recheck judges against the scan's snapshot. B's memory topic, read
// through its page's registration in the first launch, is not readable after its refusal: no registration was made.
// A's skill package, listed in the first launch, still reads after the scan and A's page: neither retires the listing of
// a project still listed whose page still shows the skill (agents-overview::CON-002/AC-03). A listing, unlike a memory
// topic, is registered by no scan, so only its restored registration admits it.
test('a project\'s detail is answered only for a directory the snapshot of that moment lists, the restored one until the first scan and the scan\'s after it, and nothing of a refused one reaches the page or the registrations, while the listed one keeps its package listing', async () => {
  mainErrors.allow(/project-not-listed/)
  mainErrors.allow(/memory-file-not-whitelisted/)
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-admission-'))
  const [a, b, stray] = ['proj-a', 'proj-b', 'stray'].map((name) => join(home, name))
  for (const [dir, text] of [[a, 'A instructions'], [b, 'B instructions'], [stray, 'Stray instructions']]) {
    mkdirSync(dir)
    writeFileSync(join(dir, 'CLAUDE.md'), `# ${text}\n`)
  }
  mkdirSync(join(a, '.claude', 'skills', 'tidy'), { recursive: true })
  writeFileSync(join(a, '.claude', 'skills', 'tidy', 'SKILL.md'), '---\ndescription: tidy\n---\nA skill body\n')
  const memDir = join(home, '.claude', 'projects', b.replace(/[^A-Za-z0-9]/g, '-'), 'memory')
  mkdirSync(memDir, { recursive: true })
  const topic = join(memDir, 'topic.md')
  writeFileSync(topic, 'B topic\n')
  const registry = join(home, '.claude.json')
  writeFileSync(registry, JSON.stringify({ projects: { [a]: {}, [b]: {} } }))
  const userData = makeUserData()
  let app: ElectronApplication | undefined
  const detail = (win: Page, dir: string): Promise<string> => win.evaluate(async (p) => {
    try { return JSON.stringify(await window.agentshed.getProjectDetail(p)) } catch (e) { return `refused: ${(e as Error).message}` }
  }, dir)
  const readTopic = (win: Page): Promise<string> => win.evaluate(async (f) => {
    try { return (await window.agentshed.readMemoryFile(f)).text } catch (e) { return `refused: ${(e as Error).message}` }
  }, topic)
  const status = (win: Page): Promise<string> => win.evaluate(async () => (await window.agentshed.getStartup()).status)
  const readSkillFile = (win: Page, file: string): Promise<string> => win.evaluate(async (f) => {
    try { return (await window.agentshed.readSkillFile({ absPath: f })).text } catch (e) { return `refused: ${(e as Error).message}` }
  }, file)
  try {
    app = (await startApp({ userData, home, errors: mainErrors.errors })).app
    let win = await app.firstWindow()
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
    expect(await detail(win, a)).toContain('A instructions')
    const listed = await win.evaluate(async (p) => (await window.agentshed.listSkillFiles({ side: 'claude', name: 'tidy', scope: 'project', projectPath: p })).files.map(f => f.absPath), a)
    expect(listed).toHaveLength(1)
    const [skillFile] = listed
    expect(await detail(win, b)).toContain('B instructions')
    expect(await readTopic(win), 'B\'s page registered its memory topic').toBe('B topic\n')
    await closeApp(app)
    app = undefined

    writeFileSync(registry, JSON.stringify({ projects: { [a]: {} } }))
    app = (await startApp({ userData, home, errors: mainErrors.errors, env: { AGENTSHED_SCAN_DELAY_MS: '8000' } })).app
    win = await app.firstWindow()
    expect(await status(win), 'the first scan is held').not.toBe('ready')
    const answers = [detail(win, a), detail(win, b)]
    const refused = await detail(win, stray)
    expect(refused).toContain('project-not-listed')
    expect(refused).not.toContain('Stray instructions')
    expect(await status(win), 'refused before the first scan completed, so by the guard').not.toBe('ready')
    const [ofA, ofB] = await Promise.all(answers)
    expect(ofA).toContain('A instructions')
    expect(ofB).toContain('project-not-listed')
    expect(ofB).not.toContain('B instructions')
    expect(await readTopic(win)).toContain('memory-file-not-whitelisted')
    expect(await readSkillFile(win, skillFile), 'the scan and A\'s page keep A\'s listing').toContain('A skill body')
  } finally {
    if (app) await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

// agents-overview::CON-002/AC-03, skills-view C8: a project page's read is the authoritative enumeration of that
// project's skills, so its pass retires the listing of a skill the page no longer shows, and only that one. No scan
// would: the project is still listed. The removed skill's file is refused by the guard; a listing still registered
// would instead let the read through to fail on the missing file.
test('a project page read again retires the listing of a skill it no longer shows and keeps the other\'s: the removed skill\'s file is refused, the kept one\'s still reads', async () => {
  mainErrors.allow(/skill-file-not-whitelisted/)
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-page-pass-'))
  const proj = join(home, 'demo-proj')
  const skills = join(proj, '.claude', 'skills')
  for (const name of ['kept', 'removed']) {
    mkdirSync(join(skills, name), { recursive: true })
    writeFileSync(join(skills, name, 'SKILL.md'), `---\ndescription: ${name}\n---\n${name} body\n`)
  }
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const userData = makeUserData()
  const { app } = await startApp({ userData, home, errors: mainErrors.errors })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
    const shown = (): Promise<string[]> => win.evaluate(async (p) =>
      (await window.agentshed.getProjectDetail(p)).skills.filter(s => s.level === 'project').map(s => s.name), proj)
    const list = (name: string): Promise<string[]> => win.evaluate(async ([n, p]) =>
      (await window.agentshed.listSkillFiles({ side: 'claude', name: n, scope: 'project', projectPath: p })).files.map(f => f.absPath), [name, proj])
    const read = (file: string): Promise<string> => win.evaluate(async (f) => {
      try { return (await window.agentshed.readSkillFile({ absPath: f })).text } catch (e) { return `refused: ${(e as Error).message}` }
    }, file)
    expect(await shown()).toEqual(['kept', 'removed'])
    const [kept, removed] = [await list('kept'), await list('removed')]
    expect(kept).toHaveLength(1)
    expect(removed).toHaveLength(1)
    expect(await read(removed[0])).toContain('removed body')

    rmSync(join(skills, 'removed'), { recursive: true })
    expect(await shown(), 'the page read again').toEqual(['kept'])
    expect(await read(removed[0])).toContain('skill-file-not-whitelisted')
    expect(await read(kept[0]), 'the page still shows it').toContain('kept body')
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

// ── A page drawn from its copy shows the latest scan's figures (project-detail::REQ-005) ──
//
// Every case holds the detail fetch open, so that what the page shows inside the hold can only have come from the
// figures a scan sent to the window or from the page's copy, never from the page's own refetch. The rescan interval
// stays well above the hold: a rescan landing before the last one's refetch has resolved restarts that refetch.
const FIGURES_HOLD_MS = 2500
const FIGURES_ENV = { AGENTSHED_FETCH_DELAY_MS: String(FIGURES_HOLD_MS), AGENTSHED_RESCAN_MS: '5000' }
/** Well inside the hold, and above what a repaint takes */
const AT_ONCE = { timeout: 400 }

/** One Claude session's lines: one question, and one call of `tokens` input tokens, `daysAgo` days back */
const figuresSession = (question: string, tokens: number, daysAgo: number): string => {
  const timestamp = localDayOffset(daysAgo).toISOString()
  return [
    { type: 'user', timestamp, message: { role: 'user', content: question } },
    { type: 'assistant', timestamp, message: { id: `m-${question}`, model: 'claude-fable-5', usage: { input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  ].map((line) => JSON.stringify(line)).join('\n') + '\n'
}

/**
 * Two registered projects with one session each, `daysAgo` days back: proj-a's of 120 tokens and proj-b's of 50. The
 * all-time totals stay under a thousand, where the card shows the figure itself.
 */
function mkFiguresHome(daysAgo = 2): { home: string; projA: string; sessionsA: string; firstA: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-figures-'))
  const projects: Record<string, object> = {}
  const dirs: Record<string, string> = {}
  for (const name of ['proj-a', 'proj-b']) {
    const proj = join(home, name)
    mkdirSync(proj, { recursive: true })
    projects[proj] = {}
    dirs[name] = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
    mkdirSync(dirs[name], { recursive: true })
  }
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects }))
  const firstA = join(dirs['proj-a'], 'first.jsonl')
  writeFileSync(firstA, figuresSession('First question in A', 120, daysAgo))
  writeFileSync(join(dirs['proj-b'], 'only.jsonl'), figuresSession('Only question in B', 50, daysAgo))
  return { home, projA: join(home, 'proj-a'), sessionsA: dirs['proj-a'], firstA }
}

const paneTotal = (win: Page) => win.locator('.pane-body .tot-c.on .v')
const paneHeader = (win: Page) => win.locator('.pane-head h1')

/**
 * Opens proj-a and then proj-b, each until its page is whole, so both have a copy and proj-b is on screen. Then, under a
 * held fetch, waits one hold: a rescan landing while proj-a was still on screen began a refetch of it, which reads the
 * project a hold later, and a case that changed the project before that would find the change in proj-a's copy.
 */
async function visitAThenB(win: Page, holdMs = FIGURES_HOLD_MS): Promise<void> {
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'proj-a' }).click()
  await expect(paneHeader(win)).toHaveText('proj-a')
  await expect(paneTotal(win)).toHaveText('120')
  await win.locator('.side .row', { hasText: 'proj-b' }).click()
  await expect(paneHeader(win)).toHaveText('proj-b')
  await expect(paneTotal(win)).toHaveText('50')
  if (holdMs > 0) await win.waitForTimeout(holdMs)
}

/**
 * From now on, every pair of the pane's header and its selected total that is on screen together, in order; a pane with
 * no total on it (another section, a session page) adds nothing. A MutationObserver's callback runs after each change
 * to the page and before it is painted, so a pair that was drawn for one frame is in the list.
 */
async function recordPaneTotals(win: Page): Promise<() => Promise<string[]>> {
  await win.evaluate(() => {
    const w = window as unknown as { paneTotals: string[] }
    w.paneTotals = []
    const read = (): void => {
      const total = document.querySelector('.pane-body .tot-c.on .v')
      if (!total) return
      const pair = `${document.querySelector('.pane-head h1')?.textContent ?? ''}|${total.textContent ?? ''}`
      if (w.paneTotals[w.paneTotals.length - 1] !== pair) w.paneTotals.push(pair)
    }
    read()
    new MutationObserver(read).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  return () => win.evaluate(() => (window as unknown as { paneTotals: string[] }).paneTotals)
}

test('a cached visit shows the latest scan\'s total and sessions from its first frame, the copy\'s other sections until its refetch, and a session listed that way opens', async () => {
  const { home, projA, sessionsA } = mkFiguresHome()
  writeFileSync(join(projA, 'CLAUDE.md'), '# Old conventions\n')
  const l = await launch(undefined, home, FIGURES_ENV)
  const win = await l.app.firstWindow()
  await visitAThenB(win)

  // With proj-b on screen, proj-a gains a session with usage and its CLAUDE.md changes. A scan feeds the first to the
  // window; the second is only in the page's own detail
  writeFileSync(join(sessionsA, 'second.jsonl'), figuresSession('Second question in A', 350, 1))
  writeFileSync(join(projA, 'CLAUDE.md'), '# New conventions\n')
  await scansLanded(win, 2)

  const totals = await recordPaneTotals(win)
  await win.locator('.side .row', { hasText: 'proj-a' }).click()
  await expect(paneHeader(win)).toHaveText('proj-a', AT_ONCE)
  await expect(paneTotal(win)).toHaveText('470', AT_ONCE)
  const added = win.locator('.pane-body .card .se', { hasText: 'Second question in A' })
  await expect(added).toBeVisible(AT_ONCE)
  // The Instructions section is still the copy's: the change the scan does not feed is not shown yet
  await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
  const instructions = win.locator('.pane-body .instructions-files')
  await expect(instructions).toContainText('Old conventions', AT_ONCE)
  await expect(instructions).not.toContainText('New conventions')
  await win.locator('.pane-head .tabs .tab', { hasText: 'Overview' }).click()
  // From the click on, proj-a's page never showed the total its copy was saved with
  const seen = await totals()
  expect(seen[0]).toBe('proj-b|50')
  expect(seen).toContain('proj-a|470')
  expect(seen.filter((pair) => pair.startsWith('proj-a|') && pair !== 'proj-a|470')).toEqual([])

  // The session the scan listed opens: the main process admits sessions from the same scan
  await added.click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Second question in A')
  // And the refetch does bring the change, so its absence above was the copy's
  await win.locator('.sback').click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
  await expect(instructions).toContainText('New conventions')

  expect(l.errors).toEqual([])
  await close(l)
})

test('the page on screen takes a scan\'s figures with the snapshot, before its own refetch resolves', async () => {
  const { home, sessionsA } = mkFiguresHome()
  const l = await launch(undefined, home, FIGURES_ENV)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'proj-a' }).click()
  await expect(paneTotal(win)).toHaveText('120')

  // When each snapshot arrived, and when the new session's row was first on the page
  await win.evaluate(() => {
    const w = window as unknown as { snapshotsAt: number[]; rowAt: number | null; agentshed: { onSnapshot: (cb: () => void) => void } }
    w.snapshotsAt = []
    w.rowAt = null
    w.agentshed.onSnapshot(() => { w.snapshotsAt.push(performance.now()) })
    new MutationObserver(() => {
      if (w.rowAt === null && [...document.querySelectorAll('.pane-body .card .se')].some((row) => row.textContent?.includes('Second question in A'))) w.rowAt = performance.now()
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  writeFileSync(join(sessionsA, 'second.jsonl'), figuresSession('Second question in A', 350, 1))
  await expect(win.locator('.pane-body .card .se', { hasText: 'Second question in A' })).toBeVisible({ timeout: 20_000 })
  await expect(paneTotal(win)).toHaveText('470')

  const { snapshotsAt, rowAt } = await win.evaluate(() => {
    const w = window as unknown as { snapshotsAt: number[]; rowAt: number | null }
    return { snapshotsAt: w.snapshotsAt, rowAt: w.rowAt }
  })
  // The row came with a snapshot: a refetch would have brought it a whole hold after one
  const before = snapshotsAt.filter((at) => at <= (rowAt ?? 0))
  expect(before.length).toBeGreaterThan(0)
  expect((rowAt ?? 0) - before[before.length - 1]).toBeLessThan(FIGURES_HOLD_MS / 5)

  expect(l.errors).toEqual([])
  await close(l)
})

test('once a scan holds nothing for a project, a cached visit shows zeros and no sessions, not its copy\'s figures', async () => {
  // Both projects' usage is the scan day's own, on one side. The archive rewrites that day's figure from the scan while
  // the side still has usage on it (proj-b's), so no archived row keeps proj-a's figures (ADR-0026)
  const { home, firstA } = mkFiguresHome(0)
  const l = await launch(undefined, home, FIGURES_ENV)
  const win = await l.app.firstWindow()
  await visitAThenB(win)

  rmSync(firstA)
  await scansLanded(win, 2)

  const totals = await recordPaneTotals(win)
  await win.locator('.side .row', { hasText: 'proj-a' }).click()
  await expect(paneHeader(win)).toHaveText('proj-a', AT_ONCE)
  await expect(paneTotal(win)).toHaveText('0', AT_ONCE)
  await expect(win.locator('.pane-body .none', { hasText: 'No sessions in this project yet' })).toBeVisible(AT_ONCE)
  await expect(win.locator('.pane-body .card .se')).toHaveCount(0)
  const seen = await totals()
  expect(seen[0]).toBe('proj-b|50')
  expect(seen.filter((pair) => pair.startsWith('proj-a|') && pair !== 'proj-a|0')).toEqual([])

  expect(l.errors).toEqual([])
  await close(l)
})

test('a window reloaded after a scan shows that scan\'s figures on a cached visit, before any scan reaches it: zeros for a project the scan holds nothing for, and another project\'s own', async () => {
  const { home, firstA } = mkFiguresHome(0)
  const l = await launch(undefined, home, FIGURES_ENV)
  const win = await l.app.firstWindow()
  await visitAThenB(win)

  rmSync(firstA)
  await scansLanded(win, 2)

  // The application menu's Reload: a new document in a run whose scan has completed. What it holds comes from the
  // startup answer, and the count below shows that no scan reached it before the page was read
  await win.reload()
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row', { hasText: 'proj-a' })).toBeVisible()
  await win.evaluate(() => {
    const w = window as unknown as { snapshotsSinceReload: number; agentshed: { onSnapshot: (cb: () => void) => void } }
    w.snapshotsSinceReload = 0
    w.agentshed.onSnapshot(() => { w.snapshotsSinceReload++ })
  })

  const totals = await recordPaneTotals(win)
  await win.locator('.side .row', { hasText: 'proj-a' }).click()
  await expect(paneHeader(win)).toHaveText('proj-a', AT_ONCE)
  await expect(paneTotal(win)).toHaveText('0', AT_ONCE)
  await expect(win.locator('.pane-body .none', { hasText: 'No sessions in this project yet' })).toBeVisible(AT_ONCE)
  await expect(win.locator('.pane-body .card .se')).toHaveCount(0)
  expect((await totals()).filter((pair) => pair.startsWith('proj-a|') && pair !== 'proj-a|0')).toEqual([])
  // And a project that scan has figures for shows them: a window handed no figures, with the scan marked completed,
  // would show zeros here as well, and proj-a's zeros alone would not tell
  await win.locator('.side .row', { hasText: 'proj-b' }).click()
  await expect(paneHeader(win)).toHaveText('proj-b', AT_ONCE)
  await expect(paneTotal(win)).toHaveText('50', AT_ONCE)
  expect(await win.evaluate(() => (window as unknown as { snapshotsSinceReload: number }).snapshotsSinceReload)).toBe(0)

  expect(l.errors).toEqual([])
  await close(l)
})

test('a page restored at launch shows the figures saved with the snapshot until the first scan, and its copy\'s when its saved figures are unusable', async () => {
  const { home, sessionsA } = mkFiguresHome()
  const userData = makeUserData()
  const held = { AGENTSHED_SCAN_DELAY_MS: '60000' }
  let open: WindowLaunched | null = null
  const start = async (env: Record<string, string>): Promise<Page> => {
    open = await launchWindow(home, env, userData)
    return open.win
  }
  const stop = async (): Promise<void> => {
    const l = open
    open = null
    if (!l) return
    expect(l.errors).toEqual([])
    await closeApp(l.app)
  }
  try {
    // First run: proj-a's page is saved at 120 tokens; then a scan finds its second session while proj-b is on
    // screen, so the figures saved with the snapshot are newer than proj-a's saved page
    let win = await start({ AGENTSHED_RESCAN_MS: '800' })
    await visitAThenB(win, 0)
    writeFileSync(join(sessionsA, 'second.jsonl'), figuresSession('Second question in A', 350, 1))
    await scansLanded(win, 2)
    await stop()

    // Second run, its first scan held: the restored page shows the saved figures
    win = await start(held)
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'proj-a' }).click()
    await expect(paneHeader(win)).toHaveText('proj-a')
    await expect(paneTotal(win)).toHaveText('470')
    await expect(win.locator('.pane-body .card .se', { hasText: 'Second question in A' })).toBeVisible()
    await stop()

    // proj-a's saved figures are damaged, so the saved data restores without them (entries degrade one by one)
    const file = join(userData, 'display-cache.json')
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { data: { stats: [string, { sessions: unknown }][] } }
    const ofA = saved.data.stats.filter(([key]) => key.endsWith('/proj-a'))
    expect(ofA).toHaveLength(1)
    ofA[0][1].sessions = 'damaged'
    writeFileSync(file, JSON.stringify(saved))

    // Third run, its first scan held: proj-a's page shows what its copy carries, and proj-b's its own saved figures
    win = await start(held)
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'proj-a' }).click()
    await expect(paneHeader(win)).toHaveText('proj-a')
    await expect(paneTotal(win)).toHaveText('120')
    await expect(win.locator('.pane-body .card .se')).toHaveCount(1)
    await expect(win.locator('.pane-body .card .se', { hasText: 'First question in A' })).toBeVisible()
    await win.locator('.side .row', { hasText: 'proj-b' }).click()
    await expect(paneHeader(win)).toHaveText('proj-b')
    await expect(paneTotal(win)).toHaveText('50')
    await stop()
  } finally {
    const left = open as WindowLaunched | null
    if (left) await closeApp(left.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})
