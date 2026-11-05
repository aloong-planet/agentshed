// Also not driven: macOS privacy protection refusing a project under ~/Documents, ~/Desktop or ~/Downloads, which a test cannot
// arrange. What it does to `stat` is from knowledge, not measured. The cases use a parent at mode 000, and `isAbsent` answers
// alike for any refusal (read-utils.test.ts), so such a project is not stale if `stat` is refused, and was never stale if it
// is not (projects-list A6). Add a case when a machine can grant and refuse that access under test.
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { settingsJson } from '../src/main/testing/agy-fixture'
import { localDayOffset } from './support/dates'
import { mkUsageHome } from './support/homes'
import { launch, close, launchWithLangs, launchWindow, closeWindow } from './support/launch'
import { mkLinkHome, CLAUDE_LINE, card, countOf, toAgents, toProjects, dropdown, toggle, rows, chooseSide } from './support/side-link'

// This used to be one if/else: with real projects it took branch A, without them branch B. The
// consequence was **undefined coverage**
// — a development machine always took A and CI always took B, so no single machine ever exercised both;
// and branch B had never
// run, so its locator matched both the sidebar and the main area empty states (a strict mode violation)
// and was never exercised after being written. Split into two deterministic cases, each with its own
// seeded fixture home.
test('switching to Projects: rows appear when there are projects, and the detail tabs switch once one is selected', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  const rows = win.locator('.side .row')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  const tabs = win.locator('.pane-head .tabs .tab')
  await expect(tabs.first()).toBeVisible()
  const n = await tabs.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click()
    await expect(win.locator('.pane-body')).toBeVisible()
  }
  expect(l.errors).toEqual([])
  await close(l)
})

test('switching to Projects: the sidebar shows its empty state when there are no projects at all', async () => {
  const l = await launch(undefined, mkdtempSync(join(tmpdir(), 'agentshed-e2e-nohome-')))
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row')).toHaveCount(0)
  // Scoped to the sidebar: the main area has another .empty ("select a project to see its detail"), and
  // without scoping it matches both
  await expect(win.locator('.side .list-empty')).toBeVisible()
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Ticket grok-side/#123: a fixture home with one directory registered on all three sides and one on
 * Claude alone — the pair the side-count badge and its hover layer need (3 against 1, so an
 * assertion can tell "counted per row" from "always the same number").
 */
function mkThreeSideHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-tri-'))
  const tri = join(home, 'tri-proj')
  const solo = join(home, 'solo-proj')
  mkdirSync(tri, { recursive: true })
  mkdirSync(solo, { recursive: true })
  // The ghost never exists on disk: a stale row, so the "filtered N stale" counter renders — the
  // filter row's width has to be measured with every one of its occupants present
  const ghost = join(home, 'ghost-proj')
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ projects: { [tri]: {}, [solo]: {}, [ghost]: {} } })
  )
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${tri}"]\ntrust_level = "trusted"\n`)
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${tri}"]\ntrusted = true\n`)
  return home
}

// Ticket grok-side/#123 (spec C6, stories 1/1a): the row carries how many sides use it as a single
// count, and the sides themselves are named in full on hover. The hover layer sits over the clipped,
// scrollable list, so its visibility is proved by hit-testing its own centre — a clipped layer
// reports the same bounding box and loses exactly that (the floating-layer invariant in AGENTS.md).
test('the project list row: a side-count badge, with hovering naming the sides in full', async () => {
  const l = await launch(undefined, mkThreeSideHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  const rows = win.locator('.side .row')
  await expect(rows).toHaveCount(2)

  // One count per row rather than one badge per side; the old two-letter badges are gone from rows
  const tri = win.locator('.side .row', { hasText: 'tri-proj' })
  const solo = win.locator('.side .row', { hasText: 'solo-proj' })
  await expect(tri.locator('.cnt-b')).toHaveText('3')
  await expect(solo.locator('.cnt-b')).toHaveText('1')
  await expect(win.locator('.side .row .badge')).toHaveCount(0)

  // The row reads name · time · count: the badge sits right of the relative time, at the row's edge
  const metaBox = await tri.locator('.meta').boundingBox()
  const cntBox = await tri.locator('.cnt-b').boundingBox()
  if (metaBox === null || cntBox === null) throw new Error('row meta/count not rendered')
  expect(cntBox.x, 'the side-count badge sits right of the time').toBeGreaterThan(
    metaBox.x + metaBox.width - 1
  )

  // Hovering the count opens the layer naming the sides in full — names, not abbreviations
  await tri.locator('.cnt-b').hover()
  const tip = win.locator('.sides-tip')
  await expect(tip).toHaveCount(1)
  await expect(tip.locator('.st')).toHaveCount(3)
  await expect(tip).toContainText('Claude Code')
  await expect(tip).toContainText('Codex')
  await expect(tip).toContainText('Grok')

  const geo = await win.evaluate(() => {
    const el = document.querySelector('.sides-tip') as HTMLElement
    const r = el.getBoundingClientRect()
    // pointer-events: none would let the hit test fall straight through, so lift it for the probe
    const saved = el.style.pointerEvents
    el.style.pointerEvents = 'auto'
    const atCentre = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    el.style.pointerEvents = saved
    const dot = document.querySelector('.sides-tip .dot.grok') as HTMLElement
    return {
      // The decisive check: a clipped layer reports this same rect but loses this
      centreBelongsToTip: atCentre !== null && el.contains(atCentre),
      insideViewport: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      position: getComputedStyle(el).position,
      pointerEvents: getComputedStyle(el).pointerEvents,
      // An unwired CSS variable resolves to transparent — the exact value differs by appearance,
      // but "has a colour at all" catches the wiring failure
      grokDot: dot === null ? null : getComputedStyle(dot).backgroundColor
    }
  })
  expect(geo.centreBelongsToTip).toBe(true)
  expect(geo.insideViewport).toBe(true)
  expect(geo.position).toBe('fixed') // what escapes the list's overflow clipping
  expect(geo.pointerEvents).toBe('none') // a glance layer must not swallow the row's clicks
  expect(geo.grokDot).not.toBeNull()
  expect(geo.grokDot).not.toBe('rgba(0, 0, 0, 0)')

  // The one-side row still explains itself on hover (a bare "1" is the case that needs the name most)
  await win.mouse.move(5, 5)
  await expect(tip).toHaveCount(0)
  await solo.locator('.cnt-b').hover()
  await expect(tip.locator('.st')).toHaveCount(1)
  await expect(tip).toContainText('Claude Code')

  // Glanced at rather than operated: any scroll but its own dismisses, and so does a resize.
  // Events are dispatched rather than performed for real — a real resize moves the row out from
  // under the pointer and the layer would close via mouseleave, passing whether or not the
  // listener under test was ever attached.
  const hoverTri = async (): Promise<void> => {
    await win.mouse.move(5, 5)
    await tri.locator('.cnt-b').hover()
    await expect(tip).toHaveCount(1)
  }
  await hoverTri()
  await win.locator('.side .list').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(tip).toHaveCount(0)
  await hoverTri()
  await win.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(tip).toHaveCount(0)

  expect(l.errors).toEqual([])
  await close(l)
})

// projects-list A6: stale is a directory that is really not there. Asking `existsSync` also called a project behind a
// directory that cannot be entered stale, and its note told the user to have the agent delete the records of a live project
test('a project behind a directory that cannot be entered keeps a normal row and page, and a deleted one is still stale', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-unreachable-'))
  const locked = join(home, 'locked')
  const proj = join(locked, 'blocked-proj')
  const gone = join(home, 'gone-proj') // registered, never created
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'CLAUDE.md'), '# Project conventions\n')
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {}, [gone]: {} } }))
  // Its sessions live on the agent's side, which the blocked directory does not touch
  const sessions = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
  const sessionId = '6b3f2a10-4c5d-4e6f-8a7b-9c0d1e2f3a4b'
  mkdirSync(sessions, { recursive: true })
  writeFileSync(
    join(sessions, `${sessionId}.jsonl`),
    JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: 'A question from the agent side' } }) + '\n'
  )
  const skill = join(home, '.claude', 'skills', 'alpha-skill')
  mkdirSync(skill, { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), '---\ndescription: alpha\n---\n\nbody\n')
  const plugins = join(home, '.claude', 'plugins')
  mkdirSync(plugins, { recursive: true })
  writeFileSync(
    join(plugins, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'demo@mp': [
          { scope: 'project', version: '1.0.0', installPath: join(home, 'cache', 'demo'), projectPath: proj },
          { scope: 'project', version: '1.0.0', installPath: join(home, 'cache', 'demo'), projectPath: gone }
        ]
      }
    })
  )
  chmodSync(locked, 0o000)
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const tab = (name: string) => win.locator('.pane-head .tabs .tab', { hasText: name })

  // The plugin section marks the deleted project's record alone (plugins-view E2)
  await tab('Plugins').click()
  await expect(win.locator('.pane-body .chip')).toHaveText(['project · blocked-proj', 'project · gone-proj(project stale)'])

  // The picker offers it, and the install is attempted and fails as a copy, not as a stale target (skill-install A5, A10)
  await tab('Skills').click()
  await win.locator('.sk-card > .rel', { has: win.locator('.nm', { hasText: /^alpha-skill$/ }) }).locator('.ins').click()
  const pick = (name: string) => win.locator('.pop .pop-p', { has: win.locator('.t', { hasText: new RegExp(`^${name}$`) }) })
  await expect(pick('gone-proj')).toBeDisabled()
  await expect(pick('blocked-proj')).toBeEnabled()
  await pick('blocked-proj').click()
  await expect(win.locator('.toast.err')).toHaveText('alpha-skill → blocked-proj (claude): Copy failed and was cleaned up')

  // In the list with the stale toggle off, the counter counts the deleted project alone
  await win.locator('.rail .ri').nth(1).click()
  const row = win.locator('.side .row', { hasText: 'blocked-proj' })
  await expect(row).toBeVisible()
  await expect(row.locator('.stale-tag')).toHaveCount(0)
  await expect(win.locator('.opts .cnt')).toHaveText('1 stale project filtered out')

  // Its page is the sectioned page, not the note: Instructions say they cannot be read, and the sessions still read
  await row.click()
  await expect(win.locator('.pane-head h1')).toHaveText('blocked-proj')
  await expect(win.locator('.pane-head .stale-tag')).toHaveCount(0)
  await expect(win.locator('.stale-note')).toHaveCount(0)
  await tab('Instructions').click()
  await expect(win.locator('.pane-body .instructions-path')).toHaveText([join(proj, 'CLAUDE.md')])
  await expect(win.locator('.pane-body .md .none')).toHaveText('The file cannot be read (permissions or I/O error)')
  await tab('Sessions').click()
  const session = win.locator('.pane-body .card .se')
  await expect(session).toHaveText([/A question from the agent side/])

  // The sections with nothing to read stay as they are, and each reads whole, so that nothing is drawn beside its words
  await tab('Skills').click()
  await expect(win.locator('.pane-body')).toHaveText('Global level · Claude(1)alpha-skillCCGlobal1 file · 33 B')
  await tab('Subagents').click()
  await expect(win.locator('.pane-body')).toHaveText('No subagent definitions at project or global level')
  await tab('MCP').click()
  await expect(win.locator('.pane-body')).toHaveText('Project level · .mcp.json (enabled/disabled comes from project settings)This project has no .mcp.json; see the Agents page for global MCP')
  await tab('Memory').click()
  await expect(win.locator('.pane-body')).toHaveText('No automatic memory in this project yet')
  await tab('Artifacts').click()
  await expect(win.locator('.pane-body')).toHaveText('AllCONTEXT.mdADRspecsprototypesfeaturespostmortemsNothing captured under the convention (not an eight-step project; not an error)')

  // Its resume command carries no warning: session-view::US-001/AC-08's is for a directory that is gone
  await tab('Sessions').click()
  await session.click()
  await win.locator('.pane-head .sact[data-act="resume"]').hover()
  const tip = win.locator('[data-testid="session-tip"]')
  await expect(tip.locator('.stip-cmd')).toHaveText(`cd '${proj}' && claude --resume ${sessionId}`)
  await expect(tip.locator('.stip-warn')).toHaveCount(0)
  await win.locator('.sback').click()

  // The deleted one is what it was
  await win.locator('.side input[type="checkbox"]').check()
  const goneRow = win.locator('.side .row', { hasText: 'gone-proj' })
  await expect(goneRow.locator('.stale-tag')).toHaveText('Stale')
  await goneRow.click()
  await expect(win.locator('.stale-note')).toBeVisible()

  chmodSync(locked, 0o755)
  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket grok-side/#123 (spec C5/C7): side filtering is a single-choice dropdown. Being operated
// rather than glanced at, it answers a resize by repositioning — and the resize answer is where
// #122 lives: a resize makes the browser clamp a scrolled container's scrollTop and dispatch a
// scroll for it, which a capture-phase listener cannot tell from the user scrolling. The fix
// attributes by ordering, so both halves are pinned: a scroll hard on a resize's heels is ignored,
// a later one dismisses.
test('the side filter dropdown: narrows to one side, dismisses on scroll, and survives a resize', async () => {
  const l = await launch(undefined, mkThreeSideHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row')).toHaveCount(2)

  // The old one-button-per-side row is gone; the trigger sits in the filter row showing "All"
  await expect(win.locator('.fseg')).toHaveCount(0)
  const trig = win.locator('.opts .dd-trigger')
  await expect(trig).toHaveText(/All/)
  await expect(trig).toHaveAttribute('aria-expanded', 'false')

  await trig.click()
  const pop = win.locator('.side-pop')
  await expect(pop).toHaveCount(1)
  await expect(trig).toHaveAttribute('aria-expanded', 'true')
  const opts = pop.locator('.dd-opt')
  await expect(opts).toHaveCount(5)
  await expect(opts.nth(0)).toContainText('All')
  await expect(opts.nth(1)).toContainText('Claude Code')
  await expect(opts.nth(2)).toContainText('Codex')
  await expect(opts.nth(3)).toContainText('Grok')
  await expect(opts.nth(4)).toContainText('Antigravity')
  // Dots mark the sides, not "All"; the current choice carries the check
  await expect(pop.locator('.dd-opt .dot')).toHaveCount(4)
  await expect(opts.nth(0)).toHaveAttribute('aria-selected', 'true')

  // The layer over the clipped list: its own centre must resolve to it (a clipped layer reports
  // the same bounding box and loses exactly this)
  const geo = await win.evaluate(() => {
    const el = document.querySelector('.side-pop') as HTMLElement
    const r = el.getBoundingClientRect()
    const atCentre = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return {
      centreBelongsToPop: atCentre !== null && el.contains(atCentre),
      position: getComputedStyle(el).position
    }
  })
  expect(geo.centreBelongsToPop).toBe(true)
  expect(geo.position).toBe('fixed')

  // Picking Grok narrows the list to the one Grok-registered directory and relabels the trigger
  await opts.nth(3).click()
  await expect(pop).toHaveCount(0)
  await expect(win.locator('.side .row')).toHaveCount(1)
  await expect(win.locator('.side .row .nm')).toHaveText('tri-proj')
  await expect(trig).toHaveText(/Grok/)

  // Back to all sides — filters stack with the stale toggle rather than overriding it (C1)
  await trig.click()
  await win.locator('.side-pop .dd-opt').nth(0).click()
  await expect(win.locator('.side .row')).toHaveCount(2)

  // Scroll outside the layer dismisses (an anchored layer whose anchor moved must not lie)
  await trig.click()
  await expect(pop).toHaveCount(1)
  await win.locator('.side .list').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(pop).toHaveCount(0)

  // A resize repositions rather than closes — including when the browser's clamp-scroll arrives on
  // its heels (#122). Both events go out in ONE evaluate: two round trips could space them beyond
  // the attribution window and the case would flake.
  await trig.click()
  await expect(pop).toHaveCount(1)
  await win.evaluate(() => {
    window.dispatchEvent(new Event('resize'))
    document.querySelector('.side .list')?.dispatchEvent(new Event('scroll'))
  })
  await expect(pop, 'open after a resize plus its clamp-scroll — the reposition choice must survive').toHaveCount(1)
  const anchored = await win.evaluate(() => {
    const p = (document.querySelector('.side-pop') as HTMLElement).getBoundingClientRect()
    const t = (document.querySelector('.opts .dd-trigger') as HTMLElement).getBoundingClientRect()
    return Math.abs(p.top - t.bottom)
  })
  expect(anchored).toBeLessThan(20) // still hanging off its trigger after re-placing

  // A scroll clear of any resize still dismisses — the attribution window must not eat real scrolls
  await win.waitForTimeout(400)
  await win.locator('.side .list').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(pop).toHaveCount(0)

  expect(l.errors).toEqual([])
  await close(l)
})

// The honest reproduction of #122: a real window resize, with the list genuinely scrolled, so the
// browser itself emits the clamp-scroll. The synthetic pair above pins the mechanism; this pins
// the phenomenon (the issue notes it had never been reproduced against the running app).
test('a real window resize with a scrolled list does not close the side dropdown (#122)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-many-'))
  const projects: Record<string, object> = {}
  for (let i = 0; i < 40; i++) {
    const p = join(home, `proj-${String(i).padStart(2, '0')}`)
    mkdirSync(p, { recursive: true })
    projects[p] = {}
  }
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects }))

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.setViewportSize({ width: 1000, height: 600 })
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row')).toHaveCount(40)

  // Scroll the list to the bottom, then grow the window: the taller list clamps scrollTop back
  // into range and dispatches a scroll nobody performed
  const scrolled = await win
    .locator('.side .list')
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight
      return el.scrollTop
    })
  expect(scrolled, 'the list must actually be scrolled or this case proves nothing').toBeGreaterThan(0)

  await win.locator('.opts .dd-trigger').click()
  await expect(win.locator('.side-pop')).toHaveCount(1)
  await win.setViewportSize({ width: 1000, height: 900 })
  await expect(
    win.locator('.side-pop'),
    'the dropdown must survive the resize (#122: the clamp-scroll used to dismiss it)'
  ).toHaveCount(1)

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket grok-side/#123 (spec C5): in the narrowest supported sidebar the filter row must hold its
// longest occupants in every UI language — the longest side name on the trigger, the stale toggle,
// and the "filtered N stale" counter all at once.
test('the side filter row stays inside the sidebar column in both UI languages', async () => {
  const home = mkThreeSideHome()
  // The stale ghost is recorded by Antigravity CLI too, so the counter is present with either long side name selected
  mkdirSync(join(home, '.gemini', 'antigravity-cli'), { recursive: true })
  writeFileSync(join(home, '.gemini', 'antigravity-cli', 'settings.json'), settingsJson([join(home, 'ghost-proj')]))
  const l = await launchWithLangs('zh-Hans-CN', home)
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')

  // The widest trigger label is a side name: the two longest, Claude Code and Antigravity, are each measured
  for (const [code, option] of [['zh', 1], ['zh', 4], ['en', 1], ['en', 4]] as const) {
    await win.locator('.ri.set').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    await expect(win.locator('.settings-h1')).not.toBeEmpty()

    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.opts .dd-trigger').click()
    await win.locator('.side-pop .dd-opt').nth(option).click()
    await expect(win.locator('.opts .dd-trigger')).toHaveText(option === 1 ? 'Claude Code' : 'Antigravity')
    await expect(win.locator('.opts .cnt'), 'the stale counter must be present while measuring').toBeVisible()

    // The prototype's width readout was blind to two of the row's three occupants (its toggle
    // label and counter were hard-coded Chinese), so this state overflowed the column in the
    // longer languages. Ruled 2026-08-16: the counter ellipsizes under squeeze, full sentence on
    // its title; the toggle label may still wrap onto a second text line (accepted).
    // Pinned here: no horizontal overflow, nothing past the column edge, and the counter still
    // present — squeezed, not squeezed out — with the whole sentence in the title.
    const m = await win.evaluate(() => {
      const opts = document.querySelector('.opts') as HTMLElement
      const side = document.querySelector('.side') as HTMLElement
      const cnt = document.querySelector('.opts .cnt') as HTMLElement
      const or = opts.getBoundingClientRect()
      const sr = side.getBoundingClientRect()
      return {
        overflow: opts.scrollWidth - opts.clientWidth,
        beyondColumn: Math.round(or.right - sr.right),
        cntWidth: Math.round(cnt.getBoundingClientRect().width),
        cntTitle: cnt.title,
        cntText: cnt.textContent ?? ''
      }
    })
    expect(m.overflow, `${code} · ${option}: the filter row's content overflows the row box`).toBeLessThanOrEqual(1)
    expect(m.beyondColumn, `${code} · ${option}: the filter row runs past the sidebar column`).toBeLessThanOrEqual(0)
    expect(m.cntWidth, `${code} · ${option}: the counter was squeezed out entirely`).toBeGreaterThan(40)
    expect(m.cntTitle, `${code} · ${option}: the full sentence must survive in the title`).toBe(m.cntText)

    // Back to all sides so the next round starts from the same state
    await win.locator('.opts .dd-trigger').click()
    await win.locator('.side-pop .dd-opt').nth(0).click()
  }

  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
  rmSync(l.home!, { recursive: true, force: true })
})

/**
 * projects-list: the selected row is told apart by a deeper wash, not a ring (settled 2026-08-21).
 * The old ring was an outline, which paints outside the border box and rode on the neighbour's
 * hover background; the wash must also stay one step deeper than the accent-soft that hover and
 * the side-count badge use, and adjacent rows keep a 1px gap so two washed rows never merge.
 */
test('project list: selection is a deeper wash with no ring, and adjacent rows keep a 1px gap', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const alpha = join(home, 'alpha-proj')
  const beta = join(home, 'beta-proj')
  mkdirSync(alpha, { recursive: true })
  mkdirSync(beta, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [alpha]: {}, [beta]: {} } }))
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'alpha-proj' }).click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)
  const s = await win.evaluate(() => {
    const sel = document.querySelector('.side .row.sel') as HTMLElement
    const other = document.querySelector('.side .row:not(.sel)') as HTMLElement
    const badge = other.querySelector<HTMLElement>('.cnt-b')
    const second = document.querySelectorAll('.side .row')[1] as HTMLElement
    return {
      outline: getComputedStyle(sel).outlineStyle,
      selBg: getComputedStyle(sel).backgroundColor,
      softRef: badge ? getComputedStyle(badge).backgroundColor : null,
      gap: getComputedStyle(second).marginTop
    }
  })
  expect(s.outline, 'no selection ring').toBe('none')
  expect(s.softRef, 'accent-soft reference (an unselected badge) present').not.toBeNull()
  expect(s.selBg, 'selected wash one step deeper than accent-soft').not.toBe(s.softRef)
  expect(s.gap, '1px breathing between adjacent rows').toBe('1px')
  expect(l.errors).toEqual([])
  await close(l)
})

// The list a side card's project count opens (projects-list::REQ-002), under the built Electron app, over a fixture home.
// The count itself is in agents-overview.spec.ts.
//
// Known gap, recorded rather than faked:
//   - The arrival's own supersede of a pending search jump (projects-list::REQ-002) has no reachable state today: the
//     rail, the only way from the search page to the agents page, has already superseded it. The search spec's case
//     goes red only when both are gone. Re-test when another way reaches the agents page with a jump pending.

const CODEX_LINE = '1 project · 0 global skills · 0 subagents'

const search = (win: Page): Locator => win.locator('.sh-field input')

const counter = (win: Page): Locator => win.locator('.opts .cnt')

const selectedRow = (win: Page): Locator => win.locator('.side .row.sel .nm')

const guidance = (win: Page): Locator => win.locator('.startup-project-placeholder .empty')

// agents-overview::REQ-007/AC-01 (pointer), B2 and its boundaries for coming back and the time window;
// projects-list::REQ-002/AC-01, AC-02, AC-03, AC-07 and its boundaries for another side and for unticking.
test('a side card\'s count opens that side\'s projects, the controls work from there, and the rail opens all sides', async () => {
  const { home } = mkLinkHome()
  const l = await launchWindow(home)
  const { win } = l
  try {
    await expect(card(win, 'cl').locator('.s')).toHaveText(CLAUDE_LINE)
    await expect(card(win, 'cx').locator('.s')).toHaveText(CODEX_LINE)

    // An earlier visit leaves a search behind
    await toProjects(win)
    await search(win).fill('zzz')
    await expect(rows(win)).toHaveCount(0)
    await toAgents(win)

    // A window and a tab of the page's own: the count depends on neither, and neither survives the switch
    await win.locator('.tot-c').nth(1).click()
    await expect(win.locator('.tot-c').nth(1)).toHaveAttribute('aria-pressed', 'true')
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    await expect(card(win, 'cl').locator('.s')).toHaveText(CLAUDE_LINE)

    // A side with a stale project: its rows are every project the card counts, so the toggle is on with no counter
    await countOf(win, 'cl').click()
    await expect(win.locator('.app')).toHaveClass(/dim-projects/)
    await expect(dropdown(win)).toHaveText('Claude Code')
    await expect(rows(win)).toHaveText(['live-a', 'live-b', 'ghost-a'])
    await expect(toggle(win)).toBeChecked()
    await expect(search(win)).toHaveValue('')
    await expect(counter(win)).toHaveCount(0)

    // From there: another side keeps the toggle as it is
    await chooseSide(win, 'Codex')
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(toggle(win)).toBeChecked()
    await chooseSide(win, 'Claude Code')
    await expect(rows(win)).toHaveText(['live-a', 'live-b', 'ghost-a'])
    // Unticking hides the stale project and C9's counter shows it
    await toggle(win).uncheck()
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(counter(win)).toHaveText('1 stale project filtered out')
    // The side, the toggle and search stack (C1)
    await search(win).fill('live-b')
    await expect(rows(win)).toHaveText(['live-b'])
    await expect(dropdown(win)).toHaveText('Claude Code')

    // Back on the agents page: Token and the all-history window, as after any departure
    await toAgents(win)
    await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Token')
    await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')

    // A side with no stale project: the toggle is off and there is nothing for a counter to count
    await countOf(win, 'cx').click()
    await expect(dropdown(win)).toHaveText('Codex')
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(toggle(win)).not.toBeChecked()
    await expect(search(win)).toHaveValue('')
    await expect(counter(win)).toHaveCount(0)

    // Judged on arrival only: another side with a stale project leaves the toggle off, and C9 counts it
    await chooseSide(win, 'Claude Code')
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(toggle(win)).not.toBeChecked()
    await expect(counter(win)).toHaveText('1 stale project filtered out')

    // Leaving and coming back by the rail: all sides with the toggle off
    await toAgents(win)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(toggle(win)).not.toBeChecked()
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(counter(win)).toHaveText('1 stale project filtered out')

    // The count activated and another dimension chosen before that update lands: the list never mounted, and its next
    // way in still opens on all sides. Two click events dispatched in one task, which is what puts the rail's update first.
    await toAgents(win)
    await expect(countOf(win, 'cx')).toBeVisible()
    await win.evaluate(() => {
      document.querySelector<HTMLElement>('.pane-head .stats .stat:has(.badge.cx) .stat-link')?.click()
      document.querySelectorAll<HTMLElement>('.rail .ri')[2]?.click()
    })
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(toggle(win)).not.toBeChecked()

    expect(l.errors).toEqual([])
  } finally {
    await closeWindow(l, home)
  }
})

// projects-list::REQ-002/AC-04, AC-05 and the boundaries for a kept stale project and a cleared open session.
test('a selection registered on that side stays on the stage, and one that is not is cleared', async () => {
  const { home } = mkLinkHome()
  const l = await launchWindow(home)
  const { win } = l
  const title = win.locator('.det-title h1')
  const sessionTitle = win.locator('.pane-head .stitle')
  const openSession = async (question: string): Promise<void> => {
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.pane-body .card .se', { hasText: question }).click()
    await expect(sessionTitle).toHaveText(question)
  }
  try {
    // Kept: its project page
    await toProjects(win)
    await win.locator('.side .row', { hasText: 'live-b' }).click()
    await expect(title).toHaveText('live-b')
    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(dropdown(win)).toHaveText('Claude Code')
    await expect(selectedRow(win)).toHaveText('live-b')
    await expect(title).toHaveText('live-b')
    await expect(guidance(win)).toHaveCount(0)

    // Kept: its open session page
    await openSession('Question in live-b')
    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(selectedRow(win)).toHaveText('live-b')
    await expect(sessionTitle).toHaveText('Question in live-b')

    // Kept, and stale: the side has a stale project, so the toggle is on and its row and note page show
    await win.locator('.side .row', { hasText: 'ghost-a' }).click()
    await expect(win.locator('.stale-note')).toBeVisible()
    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(toggle(win)).toBeChecked()
    await expect(selectedRow(win)).toHaveText('ghost-a')
    await expect(win.locator('.stale-note')).toBeVisible()

    // Cleared: not registered on that side. No row is selected and the guidance shows, as with no selection at all
    await toAgents(win)
    await countOf(win, 'cx').click()
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(guidance(win)).toHaveText('Select a project to see its details')
    await expect(selectedRow(win)).toHaveCount(0)
    await expect(win.locator('.stale-note')).toHaveCount(0)

    // It stays cleared: the rail back to the list shows the guidance over all sides
    await toAgents(win)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(guidance(win)).toBeVisible()
    await expect(selectedRow(win)).toHaveCount(0)

    // Cleared with its open session page
    await win.locator('.side .row', { hasText: 'live-b' }).click()
    await openSession('Question in live-b')
    await toAgents(win)
    await countOf(win, 'cx').click()
    await expect(guidance(win)).toHaveText('Select a project to see its details')
    await expect(sessionTitle).toHaveCount(0)
    await expect(selectedRow(win)).toHaveCount(0)

    expect(l.errors).toEqual([])
  } finally {
    await closeWindow(l, home)
  }
})

// projects-list::REQ-002, the kept row below the fold and a side with only stale projects.
test('a kept row below the fold leaves the list at its top, and a side with only stale projects shows them all', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-link-many-'))
  const projects: Record<string, object> = {}
  for (let i = 0; i < 40; i++) {
    const p = join(home, `proj-${String(i).padStart(2, '0')}`)
    mkdirSync(p)
    projects[p] = {}
  }
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects }))
  mkdirSync(join(home, '.grok'))
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${join(home, 'grok-ghost')}"]\ntrusted = true\n`)
  const l = await launchWindow(home)
  const { win } = l
  const list = win.locator('.side .list')
  const scrollTop = (): Promise<number> => list.evaluate((el) => el.scrollTop)
  try {
    await toProjects(win)
    await expect(win.locator('.side .row')).toHaveCount(40)
    await win.locator('.side .row').last().click()
    const kept = await selectedRow(win).innerText()
    expect(await scrollTop(), 'the row was reached by scrolling').toBeGreaterThan(0)

    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(dropdown(win)).toHaveText('Claude Code')
    await expect(selectedRow(win)).toHaveText(kept)
    expect(await scrollTop()).toBe(0)
    await expect(win.locator('.side .row.sel')).not.toBeInViewport()

    // A side with only stale projects: the card's count, every row struck through, the toggle on and no counter
    await toAgents(win)
    await expect(countOf(win, 'gk')).toHaveText('1 project')
    await countOf(win, 'gk').click()
    await expect(rows(win)).toHaveText(['grok-ghost'])
    expect(await rows(win).evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('line-through')
    await expect(toggle(win)).toBeChecked()
    await expect(counter(win)).toHaveCount(0)

    expect(l.errors).toEqual([])
  } finally {
    await closeWindow(l, home)
  }
})

/** Everything an arrival must get right, read off the page */
interface Frame {
  dim: string | undefined
  side: string | null
  stale: boolean | null
  rows: number
  selected: string | null
  stage: 'note' | 'session' | 'project' | 'guidance' | 'none'
}

/**
 * Starts recording a frame on every change to the page, replacing any earlier recording. "No frame shows all sides" is
 * a claim over every moment, so it is recorded in the page and read afterwards rather than polled.
 */
const startRecording = (win: Page): Promise<void> =>
  win.evaluate(() => {
    const g = globalThis as unknown as { __frames: string[]; __recorder?: MutationObserver }
    g.__recorder?.disconnect()
    g.__frames = []
    const read = (): void => {
      const frame: Frame = {
        dim: [...(document.querySelector('.app')?.classList ?? [])].find((c) => c.startsWith('dim-')),
        side: document.querySelector('.opts .dd-trigger')?.textContent ?? null,
        stale: document.querySelector<HTMLInputElement>('.side input[type="checkbox"]')?.checked ?? null,
        rows: document.querySelectorAll('.side .row').length,
        selected: document.querySelector('.side .row.sel .nm')?.textContent ?? null,
        stage: document.querySelector('.stale-note') ? 'note'
          : document.querySelector('.pane-head .stitle') ? 'session'
          : document.querySelector('.det-title') ? 'project'
          : document.querySelector('.startup-project-placeholder') ? 'guidance'
          : 'none'
      }
      g.__frames.push(JSON.stringify(frame))
    }
    g.__recorder = new MutationObserver(read)
    g.__recorder.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
  })

/** The distinct frames recorded under the Projects dimension, in order */
const projectFrames = async (win: Page): Promise<Frame[]> => {
  const all = await win.evaluate(() => (globalThis as unknown as { __frames: string[] }).__frames)
  return [...new Set(all)].map((f) => JSON.parse(f) as Frame).filter((f) => f.dim === 'dim-projects')
}

// projects-list::REQ-002/AC-06 and its technical prerequisite: the first frame is already the filtered list, and the
// dimension, the list and the detail area change in one update. The rail's run is the positive case: it does draw all
// sides and a project's page, so the recording can see what the arrivals must never show. The list is long on purpose:
// over three rows, a filter set in an effect after mounting stayed green here, and over this one it goes red (measured
// 2026-11-03, the first implementation's review).
test('arriving is one update: no frame shows all sides or the wrong stage, recorded over every moment', async () => {
  const { home } = mkLinkHome(400)
  const l = await launchWindow(home)
  const { win } = l
  const arrive = async (badge: 'cl' | 'cx'): Promise<Frame[]> => {
    await toAgents(win)
    await expect(countOf(win, badge)).toBeVisible()
    await startRecording(win)
    await countOf(win, badge).click()
    await expect(dropdown(win)).toHaveText(badge === 'cl' ? 'Claude Code' : 'Codex')
    const frames = await projectFrames(win)
    expect(frames.length).toBeGreaterThan(0)
    return frames
  }
  try {
    await toProjects(win)
    await win.locator('.side .row', { hasText: 'live-b' }).click()
    await expect(win.locator('.det-title h1')).toHaveText('live-b')

    // A selection on that side: the filtered list and its project page from the first frame
    for (const f of await arrive('cl')) {
      expect(f).toEqual({ dim: 'dim-projects', side: 'Claude Code', stale: true, rows: 403, selected: 'live-b', stage: 'project' })
    }

    // The positive case: the rail's way in does show all sides and that page, and the recording sees them
    await toAgents(win)
    await expect(countOf(win, 'cl')).toBeVisible()
    await startRecording(win)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(win.locator('.det-title h1')).toHaveText('live-b')
    expect(await projectFrames(win)).toContainEqual({ dim: 'dim-projects', side: 'All', stale: false, rows: 402, selected: 'live-b', stage: 'project' })

    // The same with its session page open
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.pane-body .card .se', { hasText: 'Question in live-b' }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('Question in live-b')
    for (const f of await arrive('cl')) {
      expect(f).toEqual({ dim: 'dim-projects', side: 'Claude Code', stale: true, rows: 403, selected: 'live-b', stage: 'session' })
    }

    // A selection off that side: the filtered list and the guidance from the first frame, never the old session page
    for (const f of await arrive('cx')) {
      expect(f).toEqual({ dim: 'dim-projects', side: 'Codex', stale: false, rows: 1, selected: null, stage: 'guidance' })
    }

    expect(l.errors).toEqual([])
  } finally {
    await closeWindow(l, home)
  }
})

// projects-list::REQ-002 and agents-overview::REQ-007, a scan landing: rows update in place, the dropdown and the toggle
// stay, and a side gaining its first stale project shows it through C9. Afterwards the card and a new arrival agree.
test('a scan landing while the list is open keeps its filters, and the card and the rows agree afterwards', async () => {
  const { home, liveA, liveB } = mkLinkHome()
  const l = await launchWindow(home, { AGENTSHED_RESCAN_MS: '250' })
  const { win } = l
  try {
    await countOf(win, 'cx').click()
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(toggle(win)).not.toBeChecked()

    // The side's registry gains a project: the row arrives in place
    writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${liveA}"]\ntrust_level = "trusted"\n[projects."${liveB}"]\ntrust_level = "trusted"\n`)
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(dropdown(win)).toHaveText('Codex')
    await expect(toggle(win)).not.toBeChecked()

    // The side's first stale project does not turn the toggle on: C9's counter shows it
    rmSync(liveA, { recursive: true, force: true })
    await expect(counter(win)).toHaveText('1 stale project filtered out')
    await expect(rows(win)).toHaveText(['live-b'])
    await expect(dropdown(win)).toHaveText('Codex')
    await expect(toggle(win)).not.toBeChecked()

    // The card reads the scan's count, and a new arrival is judged afresh, so its rows equal that count
    await toAgents(win)
    await expect(card(win, 'cx').locator('.s')).toHaveText('2 projects · 0 global skills · 0 subagents')
    await countOf(win, 'cx').click()
    await expect(toggle(win)).toBeChecked()
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(counter(win)).toHaveCount(0)

    expect(l.errors).toEqual([])
  } finally {
    await closeWindow(l, home)
  }
})
