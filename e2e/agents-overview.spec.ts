import { chmodSync, mkdtempSync, mkdirSync, utimesSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { MEASURED_TITLE, callRecord, encodeTrajectoryMetadata, settingsJson, writeConversation, writeSummaries, type UsageFixture } from '../src/main/testing/agy-fixture'
import { MEASURED_TRANSCRIPT, MEASURED_TRANSCRIPT_ID, writeTranscript } from '../src/main/testing/agy-transcript-fixture'
import { localDayOffset } from './support/dates'
import { mkUsageHome, mkAgyComponentsHome } from './support/homes'
import { launch, close, launchAppearance } from './support/launch'
import { effectiveDark } from './support/colors'

/** A day key (YYYY-MM-DD) in local time — the form a bar's data-day carries */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('cold start: the Agents page is the default landing, both summary cards render, and the main process reports no errors', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  // The rail holds the three dimensions plus settings — the global refresh control was removed
  // (2026-08-23), so scans are automatic only and ⌘R belongs to the platform reload again
  await expect(win.locator('.rail .ri')).toHaveCount(4)
  await expect(win.locator('.rail .ri.grfr')).toHaveCount(0)
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // One summary card per side (an undetected side shows "not detected", not an error): this home has no
  // Antigravity CLI data root, so that card reads not detected (agents-overview::REQ-003/AC-01)
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(4)
  const agCard = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.ag') })
  await expect(agCard.locator('.badge.ag')).toHaveText('ANTIGRAVITY')
  await expect(agCard.locator('.k')).toContainText('Not detected')
  await expect(win.locator('.badge.cc, .badge.cl').first()).toBeVisible()
  // #18: the packaged build's renderer page must run on app:// rather than file:// (falling back to file://
// silently loses
  // the "readable range locked to the build directory" protection, and only asserting the protocol catches it)
  expect(win.url()).toMatch(/^app:\/\//)
  expect(l.errors).toEqual([])
  await close(l)
})

test('all seven Agents page tabs render as they are switched through, with no errors', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  const tabs = win.locator('.pane-head .tabs .tab')
  // count() reads immediately, so wait for rendering to finish before counting
  await expect(tabs).toHaveCount(7)
  const n = await tabs.count()
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click()
    await expect(win.locator('.pane-body')).toBeVisible()
  }
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * agents-overview::REQ-006 and project-detail::REQ-004: the Instructions section's label and place. One launch per
 * language reads all three rows: the skeleton under the held first scan, the loaded agents page and a project's page.
 * The skeleton's locator is scoped to `.sk-page`, which goes when the page loads: unscoped, the retried read would wait
 * for the loaded page and pass on its row, whatever the skeleton had shown.
 */
for (const [system, instructions, overview, sessions, artifacts] of [
  ['en-US', 'Instructions', 'Overview', 'Sessions', 'Artifacts'],
  ['zh-Hans-CN', '指令', '概览', '会话', '产物']
]) {
  test(`the tabs' labels and order in ${system}, on the skeleton, the agents page and a project's page (agents-overview::REQ-006, project-detail::REQ-004, i18n::QR-001/AC-01)`, async () => {
    const l = await launch(undefined, mkUsageHome(), { AGENTSHED_SYSTEM_LANGUAGES: system, AGENTSHED_SCAN_DELAY_MS: '4000' })
    const win = await l.app.firstWindow()
    const agentsRow = ['Token', instructions, 'Skills', 'Subagents', 'Plugins', 'MCP', 'Memory']
    await expect(win.locator('.sk-page .pane-head .tabs .tab')).toHaveText(agentsRow)
    await expect(win.locator('.sk-page .pane-head .tabs .tab.on')).toHaveText('Token')

    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 15000 })
    const tabs = win.locator('.pane-head .tabs .tab')
    const selected = win.locator('.pane-head .tabs .tab.on')
    await expect(tabs).toHaveText(agentsRow)
    await expect(selected).toHaveText('Token')

    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row').first().click()
    await expect(tabs).toHaveText([overview, instructions, 'Skills', 'Subagents', 'Plugins', 'MCP', 'Memory', sessions, artifacts])
    await expect(selected).toHaveText(overview)
    // The row fits the default window. It does not wrap and the page clips what runs past it, so a pointer could not
    // reach a tab past the row's end
    const overrun = await win.locator('.pane-head .tabs').evaluate((row) =>
      Math.max(...[...row.children].map((tab) => tab.getBoundingClientRect().right)) - row.getBoundingClientRect().right)
    expect(overrun).toBeLessThanOrEqual(0)
    expect(l.errors).toEqual([])
    await close(l)
  })
}

/**
 * agents-overview::REQ-004 and project-detail::REQ-002/AC-02: a home holding the global CLAUDE.md, the three global
 * AGENTS.md at the locations measured with agy (research record §10.9), and what the section leaves out — agy's
 * GEMINI.md files and rules, and Grok's AGENTS.md — each with a marker; plus two projects, one with a CLAUDE.md
 * and an AGENTS.md that cannot be read (a directory at its path), one with neither.
 */
function mkInstructionsHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-instructions-'))
  const put = (rel: string, text: string): void => {
    mkdirSync(join(home, rel, '..'), { recursive: true })
    writeFileSync(join(home, rel), text)
  }
  const withFiles = join(home, 'instructions-proj')
  const bare = join(home, 'bare-proj')
  mkdirSync(withFiles, { recursive: true })
  mkdirSync(bare, { recursive: true })
  // The project key carries settings: the input that used to produce the settings summary
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [withFiles]: { allowedTools: ['Bash'] }, [bare]: {} } }))
  // Past the 200,000-character read cap, so the entry carries the truncation marker
  put(join('.claude', 'CLAUDE.md'), '# Global rules\nmarker-claude-global\n\n' + 'Filler line.\n'.repeat(16_000))
  put(join('.codex', 'AGENTS.md'), '# Codex global\nmarker-codex-agents\n\nSee [the guide](./guide.md).\n')
  // The input that used to produce the config.toml summary
  put(join('.codex', 'config.toml'), 'model = "gpt-5.5-codex"\n[mcp_servers.node_repl]\ncommand = "node"\n')
  put(join('.gemini', 'AGENTS.md'), '# Agent rules\nmarker-agy-root\n')
  put(join('.gemini', 'config', 'AGENTS.md'), '# Antigravity instructions\nmarker-agy-config\n')
  put(join('.gemini', 'GEMINI.md'), 'marker-gemini-root\n')
  put(join('.gemini', 'config', 'GEMINI.md'), 'marker-gemini-config\n')
  put(join('.gemini', 'config', 'rules', 'house-style.md'), 'marker-agy-rule\n')
  put(join('.gemini', 'antigravity-cli', 'rules', 'sample-cli-rule.md'), 'marker-agy-cli-rule\n')
  put(join('.grok', 'AGENTS.md'), 'marker-grok-agents\n')
  put(join('instructions-proj', 'CLAUDE.md'), '# Project conventions\nmarker-project-claude\n')
  mkdirSync(join(withFiles, 'AGENTS.md'))
  put(join('instructions-proj', 'GEMINI.md'), 'marker-project-gemini\n')
  return home
}

// One launch for every state: the files change on disk and the automatic rescan (a 250 ms interval) brings each
// state in, the page refreshing by transfusion with the selected entry kept.
test('the Instructions section: CLAUDE.md and AGENTS.md on both pages, each file under its path, unreadable and absent files, and nothing from GEMINI.md or rules (agents-overview::REQ-004, project-detail::REQ-002/AC-02)', async () => {
  const home = mkInstructionsHome()
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  const body = win.locator('.pane-body')
  const paths = body.locator('.instructions-path')
  const labels = (): Promise<string[]> => body.locator('.instructions-switch button').allTextContents()
  const unreadable = 'The file cannot be read (permissions or I/O error)'
  const codex = join(home, '.codex', 'AGENTS.md')
  const agyRoot = join(home, '.gemini', 'AGENTS.md')
  const agyConfig = join(home, '.gemini', 'config', 'AGENTS.md')
  const excluded = ['marker-gemini-root', 'marker-gemini-config', 'marker-agy-rule', 'marker-agy-cli-rule', 'marker-grok-agents', 'marker-project-gemini']

  // The agents page opens on CLAUDE.md: ~/.claude/CLAUDE.md under its path, truncated past the cap (AC-02, B5)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
  await expect(paths).toHaveText([join(home, '.claude', 'CLAUDE.md')])
  await expect(body.locator('.md')).toContainText('marker-claude-global')
  await expect(body.locator('.md')).toContainText('…(truncated)')
  // The card keeps the prototype's height (52% of the window) and scrolls inside: the oversized file would
  // otherwise make it thousands of pixels tall
  const card = await body.locator('.md').evaluate((e) => ({
    height: e.getBoundingClientRect().height, cap: window.innerHeight * 0.52, overflows: e.scrollHeight > e.clientHeight
  }))
  expect(card.height).toBeLessThanOrEqual(card.cap + 1)
  expect(card.overflows).toBe(true)
  // Two entries named by their files, not grouped by side, and no settings summary (AC-01, AC-04) — read once the
  // body above is in place
  expect(await labels()).toEqual(['CLAUDE.md', 'AGENTS.md'])
  expect(await body.locator('.badge').count()).toBe(0)

  // AGENTS.md: the three files one after another in the spec's order, each body under its own path (AC-03)
  await body.locator('.instructions-switch button', { hasText: 'AGENTS.md' }).click()
  await expect(paths).toHaveText([codex, agyRoot, agyConfig])
  const following = await paths.evaluateAll((els) => els.map((e) => e.nextElementSibling?.textContent ?? ''))
  expect(following[0]).toContain('marker-codex-agents')
  expect(following[1]).toContain('marker-agy-root')
  expect(following[2]).toContain('marker-agy-config')
  // AC-05: the pane shows file contents (the markers above) and nothing from GEMINI.md, rules or Grok's AGENTS.md
  const shown = (await body.textContent()) ?? ''
  for (const m of excluded) expect(shown, m).not.toContain(m)
  // The path line's form, from the prototype: monospace, 11px, the secondary text colour; a rule above every file
  // but the first
  const form = await paths.evaluateAll((els) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--text-2)'
    els[0].parentElement?.appendChild(probe)
    const text2 = getComputedStyle(probe).color
    probe.remove()
    return els.map((e) => {
      const s = getComputedStyle(e)
      return { mono: s.fontFamily.includes('monospace'), size: s.fontSize, secondary: s.color === text2, rule: s.borderTopWidth }
    })
  })
  expect(form).toEqual([
    { mono: true, size: '11px', secondary: true, rule: '0px' },
    { mono: true, size: '11px', secondary: true, rule: '1px' },
    { mono: true, size: '11px', secondary: true, rule: '1px' }
  ])
  // A relative link in a global file gets the out-of-scope notice and does not navigate the window (AGENTS.md: a link
  // inside rendered content never navigates the whole window)
  const urlBefore = win.url()
  await body.locator('.md a', { hasText: 'the guide' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url()).toBe(urlBefore)

  // agy's root file goes: Codex's and agy's config one remain, in order
  rmSync(agyRoot)
  await expect(paths).toHaveText([codex, agyConfig])
  // agy's config one cannot be read: it keeps its place under its path with the unreadable sentence, and Codex's
  // still renders
  rmSync(agyConfig)
  mkdirSync(agyConfig)
  await expect(body.locator('.md .none')).toHaveText(unreadable)
  await expect(paths).toHaveText([codex, agyConfig])
  expect(await body.locator('.md .none').evaluate((e) => e.previousElementSibling?.textContent)).toBe(agyConfig)
  await expect(body.locator('.md')).toContainText('marker-codex-agents')
  // None left, GEMINI.md and the rules still there: "None" (AC-03, AC-05) — inside the card, with no frame of its
  // own, as the prototype draws it
  rmSync(codex)
  rmSync(agyConfig, { recursive: true })
  await expect(body.locator('.md .none')).toHaveText(['None'])
  expect(await paths.count()).toBe(0)
  expect(await body.locator('.md .none').evaluate((e) => [
    getComputedStyle(e).borderTopWidth, getComputedStyle(e.parentElement as HTMLElement).borderTopWidth
  ])).toEqual(['0px', '1px'])

  // A project's page: its own CLAUDE.md under its path; its AGENTS.md cannot be read; two entries, no summary
  // (project-detail::REQ-002/AC-02)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'instructions-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
  await expect(paths).toHaveText([join(home, 'instructions-proj', 'CLAUDE.md')])
  await expect(body.locator('.md')).toContainText('marker-project-claude')
  expect(await labels()).toEqual(['CLAUDE.md', 'AGENTS.md'])
  await body.locator('.instructions-switch button', { hasText: 'AGENTS.md' }).click()
  await expect(paths).toHaveText([join(home, 'instructions-proj', 'AGENTS.md')])
  await expect(body.locator('.md .none')).toHaveText(unreadable)
  expect((await body.textContent()) ?? '').not.toContain('marker-project-gemini')
  // A project with neither file: "None" under each entry (A4)
  await win.locator('.side .row', { hasText: 'bare-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
  await expect(body.locator('.instructions-switch button.on')).toHaveText('CLAUDE.md')
  await expect(body.locator('.md .none')).toHaveText(['None'])
  await body.locator('.instructions-switch button', { hasText: 'AGENTS.md' }).click()
  await expect(body.locator('.instructions-switch button.on')).toHaveText('AGENTS.md')
  await expect(body.locator('.md .none')).toHaveText(['None'])

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Ticket antigravity-side/#322: a fixture home where agy trusts three folders — one only it registered, one Claude
 * registered too (with a Claude memory, so the Memory section has a row to read), and one whose directory is gone —
 * and one conversation in the first, last written three days ago (projects-list::REQ-001/AC-01, AC-04). A live folder
 * only Claude registered gives the side filter a row to remove.
 */
function mkAntigravityHome(): { home: string; agOnly: string; tri: string; ghost: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agy-'))
  const agOnly = join(home, 'ag-only')
  const tri = join(home, 'ag-and-claude')
  const ghost = join(home, 'ag-ghost')
  const claudeOnly = join(home, 'claude-only')
  mkdirSync(agOnly, { recursive: true })
  mkdirSync(tri, { recursive: true })
  mkdirSync(claudeOnly, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [tri]: {}, [claudeOnly]: {} } }))
  const mem = join(home, '.claude', 'projects', tri.replace(/[^A-Za-z0-9]/g, '-'), 'memory')
  mkdirSync(mem, { recursive: true })
  writeFileSync(join(mem, 'MEMORY.md'), '# Memory\n\n- a note\n')
  const agy = join(home, '.gemini', 'antigravity-cli')
  mkdirSync(join(agy, 'conversations'), { recursive: true })
  writeFileSync(join(agy, 'settings.json'), settingsJson([agOnly, tri, ghost]))
  const { file } = writeConversation(
    join(agy, 'conversations'),
    'c-ag-only',
    encodeTrajectoryMetadata({ folders: [agOnly], conversationId: 'c-ag-only' })
  )
  // Three days and an hour ago, so the relative time is "3 days ago" whatever the hour of the run
  const at = Date.now() / 1000 - 3 * 86_400 - 3_600
  utimesSync(file, at, at)
  return { home, agOnly, tri, ghost }
}

// agents-overview::CON-004, agents-overview::REQ-003/AC-01, agents-overview::REQ-003/AC-03,
// projects-list::REQ-001/AC-01, project-detail::REQ-002/AC-01, project-detail::REQ-002/AC-04: the side seen from
// every surface this ticket gives it, in one launch.
test('an Antigravity-registered project: its card, its row and hover name, the filter, the header and stale chips, and Memory', async () => {
  const { home } = mkAntigravityHome()
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()

  // The side card: the ANTIGRAVITY chip, detected, and the three projects it registers (the stale one included, as
  // on every side's card); this home holds no Antigravity skill or subagent
  const card = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.ag') })
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(4)
  await expect(card.locator('.badge.ag')).toHaveText('ANTIGRAVITY')
  await expect(card.locator('.k')).toContainText('Detected')
  await expect(card.locator('.s')).toHaveText('3 projects · 0 global skills · 0 subagents')

  // Memory: the Claude row is there, and nothing of Antigravity's — read once the list has rendered, since a retried
  // "none" would pass before it did
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .it', { hasText: 'ag-and-claude' })).toBeVisible()
  expect(await win.locator('.pane-body .badge.ag').count()).toBe(0)

  // #325: agy detected with no plugin and no MCP file — each group drawn, saying it is empty
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  await expect(win.locator('.pane-body .grp-t:has(.badge.ag) + .none')).toHaveText('No plugins installed')
  await win.locator('.pane-head .tabs .tab', { hasText: 'MCP' }).click()
  await expect(win.locator('.pane-body .grp-t:has(.badge.ag) + .none')).toHaveText(
    'No MCP servers (none in mcp_config.json, and no enabled plugin brings any)'
  )

  // The project list: the conversation's time on its folder, the side counted, and the side named on hover with its
  // Google-blue dot (the light --p-google)
  await win.locator('.rail .ri').nth(1).click()
  const agRow = win.locator('.side .row', { hasText: 'ag-only' })
  const triRow = win.locator('.side .row', { hasText: 'ag-and-claude' })
  await expect(agRow.locator('.meta')).toHaveText('3 days ago')
  await expect(agRow.locator('.cnt-b')).toHaveText('1')
  await expect(triRow.locator('.cnt-b')).toHaveText('2')
  await triRow.locator('.cnt-b').hover()
  const tip = win.locator('.sides-tip')
  await expect(tip.locator('.st')).toHaveText(['Claude Code', 'Antigravity'])
  expect(await tip.locator('.dot.antigravity').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(66, 133, 244)')
  await win.mouse.move(5, 5)

  // The side filter's fifth option names the side and narrows the list to its live folders: the Claude-only folder
  // leaves, and the stale one stays hidden by the stale filter (C1)
  await expect(win.locator('.side .row .nm')).toHaveText(['ag-only', 'ag-and-claude', 'claude-only'])
  await win.locator('.opts .dd-trigger').click()
  const opts = win.locator('.side-pop .dd-opt')
  await expect(opts).toHaveCount(5)
  await expect(opts.nth(4)).toHaveText('Antigravity')
  await expect(opts.nth(4).locator('.dot.antigravity')).toHaveCount(1)
  await opts.nth(4).click()
  await expect(win.locator('.side .row .nm')).toHaveText(['ag-only', 'ag-and-claude'])
  await expect(win.locator('.opts .dd-trigger')).toHaveText('Antigravity')

  // The project page: one ANTIGRAVITY chip; Memory shows the empty state of a project no Claude side records (D4)
  await agRow.click()
  await expect(win.locator('.det-title .badge')).toHaveCount(1)
  await expect(win.locator('.det-title .badge.ag')).toHaveText('ANTIGRAVITY')
  // #325: on a project's page agy's MCP group appears only with servers — read after the page's own MCP heading
  await win.locator('.pane-head .tabs .tab', { hasText: 'MCP' }).click()
  await expect(win.locator('.pane-body .grp-t').first()).toHaveText('Project level · .mcp.json (enabled/disabled comes from project settings)')
  expect(await win.locator('.pane-body .badge.ag').count()).toBe(0)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .none')).toHaveText(
    'Memory is a Claude-side mechanism (Codex memory is global — see the Memory tab on the global page)'
  )
  await triRow.click()
  await expect(win.locator('.det-title .badge')).toHaveText(['CLAUDE CODE', 'ANTIGRAVITY'])

  // The stale note names the recording side with its chip, in the cause and in the send line
  await win.locator('.side input[type="checkbox"]').check()
  await win.locator('.side .row', { hasText: 'ag-ghost' }).click()
  await expect(win.locator('.stale-note .badge')).toHaveText(['ANTIGRAVITY', 'ANTIGRAVITY'])
  await expect(win.locator('.stale-note .badge.ag')).toHaveCount(2)

  expect(l.errors).toEqual([])
  await close(l)
})

// agents-overview::CON-004: the AG badge's pair varies with the appearance and not with the colour scheme, like the
// other side colours — read off the side card's chip in each appearance under each theme
test('the Antigravity badge takes its own pair in light and in dark, the same under every theme', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agy-colour-'))
  mkdirSync(join(home, '.gemini', 'antigravity-cli'), { recursive: true })
  const l = await launchAppearance(home)
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  const read = (): Promise<[string, string]> =>
    win.locator('.pane-head .stats .badge.ag').evaluate((el) => {
      const cs = getComputedStyle(el)
      return [cs.backgroundColor, cs.color] as [string, string]
    })
  const want = { light: ['rgb(221, 231, 251)', 'rgb(53, 99, 181)'], dark: ['rgb(31, 46, 73)', 'rgb(150, 185, 243)'] }
  const seen: string[] = []
  for (const mode of ['light', 'dark'] as const) {
    for (const theme of ['purple', 'blue', 'amber'] as const) {
      await win.getByTitle('Settings').click()
      await win.locator(`[data-mode-option="${mode}"]`).click()
      await win.locator(`[data-theme-option="${theme}"]`).click()
      await expect.poll(async () => effectiveDark(win)).toBe(mode === 'dark')
      await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe(theme)
      await win.locator('.rail .ri').nth(0).click()
      expect(await read(), `${mode} · ${theme}`).toEqual(want[mode])
      seen.push(`${mode}-${theme}`)
    }
  }
  expect(seen).toHaveLength(6)
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Ticket antigravity-side/#323: a folder Claude Code registers and agy trusts. Claude made one call two days ago (1k);
 * agy made 3k today (gemini-3.8-flash-n), 4k two days ago — the same day as Claude's, with cache reads in it — 10k
 * twenty days ago and 20k forty-five days ago; a fifth agy conversation is at user version 2, a format the app does not
 * read, holding 50k that must count nowhere. The windows then read 37k / 3k / 7k / 17k on the Antigravity card.
 */
function mkAntigravityUsageHome(): { home: string; both: string; conversations: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agyuse-'))
  const both = join(home, 'both-sides')
  mkdirSync(both, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [both]: {} } }))
  const cdir = join(home, '.claude', 'projects', both.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(cdir, { recursive: true })
  writeFileSync(
    join(cdir, 'c.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(2).toISOString(), message: { role: 'user', content: 'A Claude question' } }),
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(2).toISOString(),
        message: { id: 'msg-c1', model: 'claude-fable-5', usage: { input_tokens: 800, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      })
    ].join('\n') + '\n'
  )
  const agy = join(home, '.gemini', 'antigravity-cli')
  const conversations = join(agy, 'conversations')
  mkdirSync(conversations, { recursive: true })
  writeFileSync(join(agy, 'settings.json'), settingsJson([both]))
  const conversation = (id: string, usage: UsageFixture, at: Date, model: string, userVersion?: number): void => {
    const { step, gen } = callRecord({ conversationId: id, stepIdx: 1, genIdx: 0, usage, createdAt: at.getTime() - 5_000, completedAt: at.getTime(), responseModel: model })
    writeConversation(conversations, id, encodeTrajectoryMetadata({ folders: [both], conversationId: id }), { steps: [step], gens: [gen], userVersion })
  }
  conversation('c-today', { messageId: 'e-today', input: 2800, output: 200 }, localDayOffset(0), 'gemini-3.8-flash-n')
  conversation('c-recent', { messageId: 'e-recent', input: 600, output: 400, cacheRead: 3000 }, localDayOffset(2), 'gemini-3.6-flash')
  conversation('c-month', { messageId: 'e-month', input: 9000, output: 1000 }, localDayOffset(20), 'gemini-3.6-flash')
  conversation('c-old', { messageId: 'e-old', input: 18000, output: 2000 }, localDayOffset(45), 'gemini-3.6-flash')
  conversation('c-new-format', { messageId: 'e-bad', input: 50000 }, localDayOffset(1), 'gemini-3.6-flash', 2)
  return { home, both, conversations }
}

// agents-overview::REQ-003/AC-01 (the figure), agents-overview::REQ-003/AC-02, token-stats::REQ-004/AC-02,
// project-detail::REQ-002/AC-04 (the Overview's part), token-stats::REQ-003 along the user's path: the side's usage on
// its card in every window, the unreadable notice and its return to the usual line, and a project's Overview with two
// sides on one day
test('Antigravity usage: the card in every window, the unreadable notice, and a project Overview with two sides on one day', async () => {
  const { home, conversations } = mkAntigravityUsageHome()
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  const card = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.ag') })
  const windows = win.locator('.pane-head .tot-row .tot-c')

  // The card's figure follows the selected window: all history, today, the last 7 days, the last 30 — the
  // conversation in the new format counting in none of them
  await expect(card.locator('.v')).toHaveText('37k')
  for (const [i, want] of [[1, '3k'], [2, '7k'], [3, '17k'], [0, '37k']] as const) {
    await windows.nth(i).click()
    await expect(card.locator('.v')).toHaveText(want)
  }

  // The third line counts the conversation that could not be read, in the warning colour, with its reason on hover
  const line = card.locator('.s')
  await expect(line).toHaveText('1 conversation couldn’t be read')
  await expect(line).toHaveAttribute('title', 'agy may have changed its conversation format in an update; their usage is not counted')
  expect(await line.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(179, 85, 47)')

  // The project's Overview: each side's figure, a day both sides used — stacked in the combined chart, Google's
  // alone in the Antigravity mode — and Antigravity's models as agy records them
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'both-sides' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Overview' }).click()
  await win.locator('.pane-body .tot-row .tot-c').first().click()
  const sideFigure = (cls: string): ReturnType<typeof win.locator> =>
    win.locator('.pane-body .tot-sides > span', { has: win.locator(`.badge.${cls}`) }).locator('b')
  await expect(sideFigure('ag')).toHaveText('37k')
  await expect(sideFigure('cl')).toHaveText('1k')
  const shared = win.locator(`.pane-body .chart .col[data-day="${dayKey(localDayOffset(2))}"]`)
  await expect(shared.locator('.sp.anthropic')).toHaveCount(1)
  await expect(shared.locator('.sp.google')).toHaveCount(1)
  await win.locator('.pane-body .grp-t .seg button', { hasText: 'Antigravity' }).click()
  await expect(shared.locator('.sp')).toHaveCount(1)
  await expect(shared.locator('.sp.google')).toHaveCount(1)
  await expect(shared).toHaveAttribute('data-tip', /Google\s+4k/)
  await expect(win.locator('.pane-body .models .m .nm2')).toHaveText(['gemini-3.6-flash', 'gemini-3.8-flash-n', 'claude-fable-5'])

  // agy rewrites the conversation in the supported format: at the next automatic scan the usual line returns, and
  // the figure stays
  await win.locator('.rail .ri').nth(0).click()
  rmSync(join(conversations, 'c-new-format.db'))
  writeConversation(conversations, 'c-new-format', encodeTrajectoryMetadata({ folders: [join(home, 'both-sides')], conversationId: 'c-new-format' }))
  await expect(line).toHaveText('1 project · 0 global skills · 0 subagents')
  await expect(card.locator('.side-warn')).toHaveCount(0)
  await expect(card.locator('.v')).toHaveText('37k')

  expect(l.errors).toEqual([])
  await close(l)
})

// agents-overview::REQ-003/AC-02 and its failure mode "the side's settings file is corrupt (A3) while conversations were
// left unread": the card's third line explains the error, and the count shows once the error is gone
test('Antigravity usage: a corrupt settings file on the card comes before the unreadable count, which shows once it is repaired', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agyerr-'))
  const agy = join(home, '.gemini', 'antigravity-cli')
  const conversations = join(agy, 'conversations')
  mkdirSync(conversations, { recursive: true })
  writeFileSync(join(agy, 'settings.json'), '{ not json')
  const conversation = (id: string, usage: UsageFixture, userVersion?: number): void => {
    const at = localDayOffset(0).getTime()
    const { step, gen } = callRecord({ conversationId: id, stepIdx: 1, genIdx: 0, usage, createdAt: at - 5_000, completedAt: at, responseModel: 'gemini-3.6-flash' })
    writeConversation(conversations, id, encodeTrajectoryMetadata({ folders: [home], conversationId: id }), { steps: [step], gens: [gen], userVersion })
  }
  conversation('c-read', { messageId: 'e-read', input: 2800, output: 200 })
  conversation('c-new-format', { messageId: 'e-bad', input: 50000 }, 2)
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  const card = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.ag') })

  // The figure shows the build that also counted the unreadable conversation; the third line is the error, not the count
  await expect(card.locator('.v')).toHaveText('3k')
  await expect(card.locator('.stat-err')).toHaveText(`The registry is corrupt: ${join(agy, 'settings.json')}`)
  await expect(card.locator('.side-warn')).toHaveCount(0)

  // The settings repaired: at the next automatic scan the error goes and the count shows, the figure staying
  writeFileSync(join(agy, 'settings.json'), settingsJson([]))
  await expect(card.locator('.stat-err')).toHaveCount(0)
  await expect(card.locator('.side-warn')).toHaveText('1 conversation couldn’t be read')
  await expect(card.locator('.v')).toHaveText('3k')

  expect(l.errors).toEqual([])
  await close(l)
})

// agents-overview A3: a registry that cannot be read is not a corrupt one, and the card says which, with the file and
// without the system's words. The exact text is what keeps EACCES out
// agents-overview REQ-004, project-detail REQ-002: a directory that cannot be entered must not make a file read as absent,
// on either page. Before the fix both slots read "None"
test('an instruction file inside a directory that cannot be entered shows the read error in its slot, not None', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-instrblock-'))
  const proj = join(home, 'blocked-proj')
  mkdirSync(proj)
  writeFileSync(join(proj, 'CLAUDE.md'), '# Project conventions\n')
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const codex = join(home, '.codex')
  mkdirSync(codex)
  writeFileSync(join(codex, 'AGENTS.md'), '# Codex global\n')
  chmodSync(codex, 0o000)
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const body = win.locator('.pane-body')
  const unreadable = 'The file cannot be read (permissions or I/O error)'
  const tab = win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' })

  await tab.click()
  await body.locator('.instructions-switch button', { hasText: 'AGENTS.md' }).click()
  await expect(body.locator('.instructions-path')).toHaveText([join(codex, 'AGENTS.md')])
  await expect(body.locator('.md .none')).toHaveText(unreadable)

  await win.locator('.rail .ri').nth(1).click()
  const row = win.locator('.side .row', { hasText: 'blocked-proj' })
  await expect(row).toBeVisible()
  chmodSync(proj, 0o000)
  await row.click()
  await tab.click()
  await expect(body.locator('.instructions-path')).toHaveText([join(proj, 'CLAUDE.md')])
  await expect(body.locator('.md .none')).toHaveText(unreadable)

  chmodSync(proj, 0o755)
  chmodSync(codex, 0o755)
  expect(l.errors).toEqual([])
  await close(l)
})

test('a side whose registry cannot be read says so on its card, naming the file', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-regread-'))
  const config = join(home, '.claude.json')
  writeFileSync(config, JSON.stringify({ projects: {} }))
  chmodSync(config, 0o000)
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const card = win.locator('.pane-head .stats .stat', { hasText: 'CLAUDE CODE' })
  await expect(card.locator('.stat-err')).toHaveText(`The registry cannot be read: ${config}`)
  chmodSync(config, 0o644)
  expect(l.errors).toEqual([])
  await close(l)
})

// skills-view::REQ-001/AC-01…AC-05, subagents-view::REQ-001/AC-01…AC-04 and AC-06, plugins-view::REQ-001/AC-01…AC-04
// and AC-06, agents-overview::REQ-003/AC-01 (the counts), AC-03 and AC-04: the agents page with Antigravity CLI's
// components, ending with a plugin agy disabled leaving the Skills and MCP sections at the next scan.
test('the agents page with Antigravity\'s components: card counts, Skills, Subagents, Plugins, MCP, and a plugin disabled', async () => {
  const { home } = mkAgyComponentsHome()
  // A brisk rescan interval, for the last step only: disabling a plugin reaches the page through the automatic scan
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '500' })
  const win = await l.app.firstWindow()
  const tab = (label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })

  // The card: two projects; three global skills — agy's three directories' names, the built-in and the plugin's not
  // counted (skills-view::REQ-001/AC-05); three subagents — the plugin's not among them (subagents-view AC-06)
  const card = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.ag') })
  await expect(card.locator('.s')).toHaveText('2 projects · 3 global skills · 3 subagents')

  // Skills: one row per name, the copy agy uses
  await tab('Skills').click()
  const row = (name: string) => win.locator('.sk-card > .rel', { has: win.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
  await expect(row('release-notes')).toHaveCount(1)
  // The list is on screen, so a built-in row would be too: one read, not a retried absence
  expect(await row('agy-customizations').count()).toBe(0)
  expect(await row('gdocs:draft-doc').count()).toBe(0)
  // The badge slots: tdd on Claude's and Antigravity's, release-notes on Antigravity's alone
  const slots = (name: string) => row(name).locator('.bdg .badge')
  await expect(slots('tdd')).toHaveText(['CC', '', '', 'AG'])
  await expect(slots('release-notes').nth(3)).toHaveText('AG')
  await expect(slots('release-notes').nth(0)).toHaveClass(/miss/)
  // The preview opens the copy agy uses: the CLI directory's, of the three
  await row('release-notes').locator('.sk-head').click()
  await row('release-notes').locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Release notes, the CLI copy')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // The drawer's side switch includes Antigravity, and switching reads agy's package
  await row('tdd').locator('.sk-head').click()
  await expect(row('tdd').locator('.sk-sides button')).toHaveText(['Claude', 'Antigravity'])
  await row('tdd').locator('.sk-sides button', { hasText: 'Antigravity' }).click()
  await row('tdd').locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('TDD, the Antigravity copy')
  await expect(win.locator('.file-drawer .d-meta')).toContainText('Antigravity')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // The enabled plugin's skill: namespaced as agy names it, with the AG and plugin badges; previewable
  const plug = row('flutter:dart-add-unit-test')
  await expect(plug.locator('.bdg .badge').nth(3)).toHaveText('AG')
  await expect(plug.locator('.pill.plg')).toBeVisible()
  await expect(plug.locator('.ins')).toHaveCount(0)
  await plug.locator('.sk-head').click()
  await plug.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Dart unit tests, the plugin copy')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // Subagents: CC CX AG slots; the name Claude defines too is one row with both badges, its drawer switching sides
  await tab('Subagents').click()
  const sub = (name: string) => win.locator('.it.row-btn', { has: win.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
  await expect(sub('sample-flat')).toHaveCount(1)
  await expect(sub('code-reviewer').locator('.bdg .badge')).toHaveText(['CC', '', 'AG'])
  // The plugin's bundled agent shows inside the plugin only (AC-06): the list is on screen, so one read
  expect(await sub('flutter_a11y_agent').count()).toBe(0)
  await sub('code-reviewer').click()
  await expect(win.locator('.drawer .sideseg button')).toHaveText(['Claude(.md)', 'Antigravity(.md)'])
  await win.locator('.drawer .sideseg button', { hasText: 'Antigravity' }).click()
  // agy's four keys as written, "—" where the definition has none: an absent model claims no inherited default
  await expect(win.locator('.drawer .kv > span')).toHaveText(['tools', 'view_file, grep_search', 'subagent', '—', 'mainAgent', '—', 'model', '—'])
  await expect(win.locator('.drawer .raw')).toContainText('Antigravity reviewer persona.')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // A definition not usable as a main agent is listed, and says so (AC-03)
  await sub('sample-reviewer').click()
  await expect(win.locator('.drawer .kv')).toContainText('mainAgent')
  await expect(win.locator('.drawer .kv')).toContainText('false')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // Plugins: the Antigravity group — version, enablement, marketplace; the disabled one still readable
  await tab('Plugins').click()
  const agPlugin = (name: string) => win.locator('.it.row-btn', { has: win.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
  await expect(agPlugin('flutter')).toContainText('v1.0.6')
  await expect(agPlugin('flutter').locator('.pill')).toHaveText('Enabled')
  await expect(agPlugin('flutter').locator('.ds')).toHaveText('From antigravity-plugins-official')
  await expect(agPlugin('gdocs').locator('.pill')).toHaveText('Not enabled')
  await agPlugin('flutter').click()
  const exp = win.locator('.exp-area').first()
  // Skills, subagents and MCP — no rules, no hooks (plugins-view::REQ-001/AC-03)
  await expect(exp.locator('.ptab')).toHaveText(['Skills1', 'Subagents1', 'MCP1'])
  await exp.locator('.ptab', { hasText: 'Subagents' }).click()
  await expect(exp.locator('.chip')).toHaveText(['flutter_a11y_agent'])
  await exp.locator('.ptab', { hasText: 'MCP' }).click()
  await expect(exp.locator('.chip')).toHaveText(['flutter_dart-mcp-server'])
  await exp.locator('.ptab', { hasText: 'Skills' }).click()
  await exp.locator('.psk', { hasText: 'flutter:dart-add-unit-test' }).click()
  await exp.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Dart unit tests, the plugin copy')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await agPlugin('flutter').click() // Collapse, so the next expansion is the first .exp-area
  await agPlugin('gdocs').click()
  await win.locator('.psk', { hasText: 'gdocs:draft-doc' }).click()
  await win.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Draft doc, readable while disabled')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // MCP: the global file's servers (the disabled one marked), the enabled plugin's under agy's name and from that
  // plugin; neither the disabled plugin's server nor a project's own MCP file anywhere
  await tab('MCP').click()
  const mcp = (name: string) => win.locator('.it', { has: win.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
  await expect(mcp('sqlite-explorer').locator('.src')).toHaveText('mcp_config.json')
  await expect(mcp('sqlite-explorer').locator('.pill')).toHaveCount(0)
  await expect(mcp('github').locator('.pill.off')).toHaveText('Disabled')
  await expect(mcp('flutter_dart-mcp-server').locator('.ds')).toHaveText('From the flutter plugin')
  expect(await mcp('gdocs_docs').count()).toBe(0)
  expect(await mcp('demo-stdio').count()).toBe(0)

  // agy disables flutter: at the next scan its skill leaves the Skills section and its server the MCP section
  // (plugins-view::REQ-001/AC-04, G1). The plugin row turning "Not enabled" is the proof the scan landed
  writeFileSync(
    join(home, '.gemini', 'config', 'config.json'),
    JSON.stringify({ plugins: { flutter: { enabled: false }, gdocs: { enabled: false } } })
  )
  await tab('Plugins').click()
  await expect(agPlugin('flutter').locator('.pill')).toHaveText('Not enabled')
  await tab('MCP').click()
  await expect(mcp('sqlite-explorer')).toHaveCount(1)
  expect(await mcp('flutter_dart-mcp-server').count()).toBe(0)
  await tab('Skills').click()
  await expect(row('release-notes')).toHaveCount(1)
  expect(await row('flutter:dart-add-unit-test').count()).toBe(0)

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Ticket antigravity-side/#327 (the closeout): one home where every part of the Antigravity CLI side holds data at once.
 * `all-sides` is registered by Claude Code, Codex, Grok and agy, with one session of each side today — Claude 1k at
 * 12:00, agy 5k at 09:00 (the measured four-question transcript, under agy's own title), Grok 3k at 06:00, Codex 2k at
 * 01:00 — a shared-directory skill, a project-level agy subagent and a Claude memory file. `agy-solo` is trusted by agy
 * alone, with a 7k conversation two days ago that asks nothing. agy's components: one name in two of its global skills
 * directories and two more names, a built-in skill, five global subagents in both forms — one of them named like the
 * project's own —, the `flutter` plugin with a skill, an agent and a server, and the global MCP file. Claude holds one
 * global skill and one global subagent; Codex one global skill.
 */
function mkAntigravityCloseoutHome(): { home: string; all: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agyall-'))
  const all = join(home, 'all-sides')
  const solo = join(home, 'agy-solo')
  mkdirSync(all, { recursive: true })
  mkdirSync(solo, { recursive: true })
  const file = (path: string, text: string): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  const skill = (base: string, name: string, description: string): void =>
    file(join(base, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${description}\n`)
  const today = (h: number): Date => {
    const d = localDayOffset(0)
    d.setHours(h)
    return d
  }

  // Claude Code: the registration, one session today at 12:00 (1k), a memory file, a global skill and subagent
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [all]: {} } }))
  const cdir = join(home, '.claude', 'projects', all.replace(/[^a-zA-Z0-9]/g, '-'))
  file(
    join(cdir, 'c.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: today(12).toISOString(), message: { role: 'user', content: 'Claude question' } }),
      JSON.stringify({
        type: 'assistant',
        timestamp: today(12).toISOString(),
        message: { id: 'msg-c1', model: 'claude-fable-5', usage: { input_tokens: 800, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      })
    ].join('\n') + '\n'
  )
  file(join(cdir, 'memory', 'MEMORY.md'), '# Memory\n\n- the all-sides note\n')
  skill(join(home, '.claude', 'skills'), 'claude-helper', 'A Claude global skill')
  file(join(home, '.claude', 'agents', 'claude-reviewer.md'), '---\ndescription: Claude global reviewer\n---\nClaude persona.\n')

  // Codex: the registration, one session today at 01:00 (2k), a global skill
  file(join(home, '.codex', 'config.toml'), `[projects."${all}"]\ntrust_level = "trusted"\n`)
  file(
    join(home, '.codex', 'sessions', '2026', '01', '01', 'rollout-019fb0c0-3333-7af3-af7d-8505cedf1ec3.jsonl'),
    [
      JSON.stringify({ timestamp: today(1).toISOString(), type: 'session_meta', payload: { cwd: all } }),
      JSON.stringify({ timestamp: today(1).toISOString(), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: all } }),
      JSON.stringify({ timestamp: today(1).toISOString(), type: 'event_msg', payload: { type: 'user_message', message: 'Codex question' } }),
      JSON.stringify({ timestamp: today(1).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1500, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 500, total_tokens: 2000 } } } })
    ].join('\n') + '\n'
  )
  skill(join(home, '.agents', 'skills'), 'codex-helper', 'A Codex global skill')

  // Grok: the registration, one session today at 06:00 (3k)
  file(join(home, '.grok', 'trusted_folders.toml'), `[folders."${all}"]\ntrusted = true\n`)
  const gdir = join(home, '.grok', 'sessions', encodeURIComponent(all), '019f-closeout')
  file(join(gdir, 'summary.json'), JSON.stringify({ info: { id: '019f-closeout', cwd: all } }))
  const gts = Math.floor(today(6).getTime() / 1000)
  file(
    join(gdir, 'updates.jsonl'),
    [
      JSON.stringify({ timestamp: gts, method: '_x.ai/session/update', params: { sessionId: 's', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Grok question' }, _meta: { promptIndex: 0 } } } }),
      JSON.stringify({ timestamp: gts, method: '_x.ai/session/update', params: { sessionId: 's', update: { sessionUpdate: 'turn_completed', usage: { inputTokens: 2500, outputTokens: 500, totalTokens: 3000, cachedReadTokens: 0, cacheCreationTokens: 0, costUsdTicks: 1, modelUsage: { 'grok-4.5-build': { inputTokens: 2500, outputTokens: 500, cachedReadTokens: 0, cacheCreationTokens: 0 } } } } } })
    ].join('\n') + '\n'
  )

  // Antigravity CLI: both folders trusted; the measured conversation in all-sides today at 09:00 (5k), under agy's
  // title; a conversation in agy-solo two days ago (7k) that asks nothing
  const agy = join(home, '.gemini', 'antigravity-cli')
  const cfg = join(home, '.gemini', 'config')
  const conversations = join(agy, 'conversations')
  mkdirSync(conversations, { recursive: true })
  writeFileSync(join(agy, 'settings.json'), settingsJson([all, solo]))
  const ID = MEASURED_TRANSCRIPT_ID.main
  const allCall = callRecord({ conversationId: ID, stepIdx: 1, genIdx: 0, usage: { messageId: 'e-all', input: 4000, output: 1000 }, createdAt: today(9).getTime() - 5_000, completedAt: today(9).getTime(), responseModel: 'gemini-3.6-flash' })
  writeConversation(conversations, ID, encodeTrajectoryMetadata({ folders: [all], conversationId: ID }), { steps: [allCall.step], gens: [allCall.gen] })
  writeTranscript(agy, ID, MEASURED_TRANSCRIPT.main)
  writeSummaries(agy, [{ id: ID, title: MEASURED_TITLE[ID] }])
  const soloAt = localDayOffset(2).getTime()
  const soloCall = callRecord({ conversationId: 'c-agy-solo', stepIdx: 1, genIdx: 0, usage: { messageId: 'e-solo', input: 6000, output: 1000 }, createdAt: soloAt - 5_000, completedAt: soloAt, responseModel: 'gemini-3.6-flash' })
  writeConversation(conversations, 'c-agy-solo', encodeTrajectoryMetadata({ folders: [solo], conversationId: 'c-agy-solo' }), { steps: [soloCall.step], gens: [soloCall.gen] })
  // agy's three global skills directories: release-notes in the first two (one name), commit-style, root-notes; a
  // built-in skill
  skill(join(agy, 'skills'), 'release-notes', 'Release notes, the CLI copy')
  skill(join(cfg, 'skills'), 'release-notes', 'Release notes, the config copy')
  skill(join(cfg, 'skills'), 'commit-style', 'The global commit style')
  skill(join(home, '.gemini', 'skills'), 'root-notes', 'Notes from the root directory')
  skill(join(agy, 'builtin', 'skills'), 'agy-customizations', 'Built in')
  // Five global subagents, in both forms; proj-agent shares its name with the project's own definition below
  file(join(cfg, 'agents', 'proj-agent.md'), '---\nname: proj-agent\ndescription: The global definition of that name.\n---\nGlobal persona.\n')
  file(join(cfg, 'agents', 'flat-one.md'), '---\nname: flat-one\ndescription: First flat definition.\n---\nOne.\n')
  file(join(cfg, 'agents', 'flat-two.md'), '---\nname: flat-two\ndescription: Second flat definition.\n---\nTwo.\n')
  file(join(cfg, 'agents', 'dir-one', 'agent.md'), '---\nname: dir-one\ndescription: First directory definition.\nsubagent: true\nmainAgent: false\n---\nThree.\n')
  file(join(cfg, 'agents', 'dir-two', 'agent.md'), '---\nname: dir-two\ndescription: Second directory definition.\n---\nFour.\n')
  // The official flutter plugin, as agy installed it (no enabled key), with its skill, agent and server
  const flutter = join(cfg, 'plugins', 'flutter')
  file(join(flutter, 'plugin.json'), JSON.stringify({ name: 'flutter', displayName: 'Dart and Flutter', version: '1.0.6' }))
  skill(join(flutter, 'skills'), 'dart-add-unit-test', 'Write and organize unit tests')
  file(join(flutter, 'agents', 'a11y_agent.md'), '---\nname: flutter_a11y_agent\ndescription: "Audits Flutter code for accessibility."\n---\n\n# Persona\n')
  file(join(flutter, 'mcp_config.json'), JSON.stringify({ mcpServers: { 'dart-mcp-server': { command: 'dart', args: ['mcp-server'] } } }))
  file(join(cfg, 'config.json'), JSON.stringify({ plugins: { flutter: { installedFrom: { id: 'antigravity-plugins-official/plugin/flutter', marketplace: 'antigravity-plugins-official', version: '1.0.6' } } } }))
  file(join(cfg, 'mcp_config.json'), JSON.stringify({ mcpServers: { 'sqlite-explorer': { command: 'node' } } }))
  // all-sides' own: a skill in the shared skills directory and a project-level agy subagent
  skill(join(all, '.agents', 'skills'), 'changelog-entry', 'Add a changelog entry')
  file(join(all, '.agents', 'agents', 'proj-agent', 'agent.md'), '---\nname: proj-agent\ndescription: Project-level agy subagent.\n---\nProject persona.\n')
  return { home, all }
}

// agents-overview::REQ-003/AC-01 (the side card whole: detection, the usage figure, the project, global skill and
// subagent counts — #322's, #323's and #325's parts together) and project-detail::REQ-002/AC-04 (a project's page
// showing the side in Overview, Sessions, Skills, Subagents, Plugins and Memory at once — #322's to #325's parts), with
// project-detail::REQ-002/AC-01 (the header chips) and AC-03 (MCP) on the same page. The closeout's combination case:
// each ticket's own cases read their part alone.
test('the Antigravity side whole: its card read in one pass, and a project every side registers, section by section', async () => {
  const { home } = mkAntigravityCloseoutHome()
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const tab = (label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })

  // The card, read whole in one DOM read, so its four parts are true of one render: the chip, detected, the figure
  // for all history (5k + 7k), two trusted folders, three library names (release-notes once; the built-in and the
  // plugin's skill not counted) and five subagents (the plugin's agent not counted)
  const card = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.ag') })
  await expect
    .poll(() =>
      card.evaluate((el) => [
        el.querySelector('.badge')?.textContent ?? '',
        el.querySelector('.k')?.textContent?.replace(el.querySelector('.badge')?.textContent ?? '', '') ?? '',
        el.querySelector('.v')?.textContent ?? '',
        el.querySelector('.s')?.textContent ?? ''
      ])
    )
    .toEqual(['ANTIGRAVITY', 'Detected', '12k', '2 projects · 3 global skills · 5 subagents'])

  // The project every side registers: the four chips
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'all-sides' }).click()
  await expect(win.locator('.det-title .badge')).toHaveText(['CLAUDE CODE', 'CODEX', 'GROK', 'ANTIGRAVITY'])

  // Overview: each side's figure, today's bar stacking the four providers, the Antigravity mode leaving Google's alone,
  // and a model row for every side's model, agy's as it records it (read as a set: no spec orders the rows)
  await tab('Overview').click()
  const sideFigure = (cls: string): ReturnType<typeof win.locator> =>
    win.locator('.pane-body .tot-sides > span', { has: win.locator(`.badge.${cls}`) }).locator('b')
  await expect(sideFigure('cl')).toHaveText('1k')
  await expect(sideFigure('cx')).toHaveText('2k')
  await expect(sideFigure('gk')).toHaveText('3k')
  await expect(sideFigure('ag')).toHaveText('5k')
  const bar = win.locator(`.pane-body .chart .col[data-day="${dayKey(localDayOffset(0))}"]`)
  for (const provider of ['anthropic', 'openai', 'xai', 'google']) await expect(bar.locator(`.sp.${provider}`)).toHaveCount(1)
  await expect(win.locator('.pane-body .models .m .nm2')).toHaveCount(4)
  expect((await win.locator('.pane-body .models .m .nm2').allTextContents()).sort()).toEqual(['claude-fable-5', 'gemini-3.6-flash', 'gpt-5.6-sol', 'grok-4.5-build'])
  await win.locator('.pane-body .grp-t .seg button', { hasText: 'Antigravity' }).click()
  await expect(bar.locator('.sp')).toHaveCount(1)
  await expect(bar.locator('.sp.google')).toHaveCount(1)

  // Sessions: one row per side, newest first, each with its side's badge; agy's under its own title. Read first by
  // the question counts, which the Overview's recent-sessions card (the same rows' titles and badges) does not draw
  await tab('Sessions').click()
  const rows = win.locator('.pane-body .card .se')
  await expect(rows.locator('.n')).toHaveText(['1 question', '4 questions', '1 question', '1 question'])
  await expect(rows.locator('.t')).toHaveText(['Claude question', 'Explaining Calc.py Functionality', 'Grok question', 'Codex question'])
  await expect(rows.locator('.badge')).toHaveText(['CC', 'AG', 'GK', 'CX'])

  // Skills: Claude's and Codex's global groups, the shared directory headed by both its loaders, Antigravity's global
  // group after it, then the plugin group with the AG row
  await tab('Skills').click()
  const headings = win.locator('.pane-body .grp-t')
  await expect(headings).toHaveCount(5)
  await expect(headings.nth(0)).toHaveText('Global level · Claude(1)')
  await expect(headings.nth(1)).toHaveText('Global level · Codex(1)')
  await expect(headings.nth(2)).toContainText('Shared · .agents/skills')
  await expect(headings.nth(2).locator('.badge')).toHaveText(['CX', 'AG'])
  await expect(headings.nth(2)).toContainText('(1)')
  await expect(headings.nth(3)).toHaveText('Global level · Antigravity(3)')
  await expect(headings.nth(4)).toContainText('Bundled in plugins')
  const plugRow = win.locator('.pane-body .sk', { has: win.locator('.nm', { hasText: /^flutter:dart-add-unit-test$/ }) })
  await expect(plugRow.locator('.bdg .badge').nth(3)).toHaveText('AG')
  // The row's four side slots stand 3px apart, as the skills-view prototype draws them (.bdg)
  const slotGaps = await plugRow.locator('.bdg .badge').evaluateAll((els) =>
    els.slice(1).map((el, i) => Math.round(el.getBoundingClientRect().left - els[i].getBoundingClientRect().right))
  )
  expect(slotGaps).toEqual([3, 3, 3])

  // Subagents: the project-level .agents/agents group, then each side's global group. proj-agent is listed in both
  // agy groups, and neither row is marked as shadowing or shadowed (subagents-view::REQ-001/AC-05), as a Claude or
  // Codex pair of one name would be
  await tab('Subagents').click()
  await expect(headings).toHaveText([
    'Effective view · project level shadows on both Claude and Codex · click a row for the full definition',
    'Project level · .agents/agents(1)',
    'Global level · Claude(1)',
    'Global level · Antigravity(5)'
  ])
  await expect(win.locator('.pane-body .it.row-btn', { has: win.locator('.badge.ag') })).toHaveCount(6)
  await expect(win.locator('.pane-body .it.row-btn', { has: win.locator('.nm', { hasText: /^proj-agent$/ }) })).toHaveCount(2)
  expect(await win.locator('.pane-body .it.row-btn .pill.shadow').count()).toBe(0)

  // Plugins: agy's plugin, in effect globally, naming its marketplace
  await tab('Plugins').click()
  await expect(win.locator('.pane-body .it.row-btn', { hasText: 'flutter' }).locator('.ds')).toHaveText(
    'In effect globally · from antigravity-plugins-official'
  )

  // MCP: agy's global server and its plugin's, under the name agy gives it
  await tab('MCP').click()
  await expect(win.locator('.pane-body .it .nm')).toHaveText(['sqlite-explorer', 'flutter_dart-mcp-server'])

  // Memory: Claude's memory file, and nothing of Antigravity's — read once the file has rendered
  await tab('Memory').click()
  await expect(win.locator('.pane-body .md')).toContainText('the all-sides note')
  expect(await win.locator('.pane-body .badge.ag').count()).toBe(0)

  expect(l.errors).toEqual([])
  await close(l)
})
