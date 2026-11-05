// Known gaps, unreachable through the UI today and so not driven here: the session page's focus reset
// when its focus prop changes without a remount (the page is keyed by file, and a hit always opens it
// fresh), and the file drawer's mode reset when its file changes while open — for skill and memory files
// alike, since one component carries both (the drawer switches files only from preview mode, through a link
// in the preview, so "the new file opens in preview" holds without the reset ever being exercised). Add a
// case when a path to either appears — a hit list beside an open session, or a file switch from raw mode.
import { appendFileSync, chmodSync, mkdtempSync, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { zstdCompressSync } from 'node:zlib'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { ERR } from '../src/shared/errors'
import { MEASURED_TITLE, callRecord, encodeTrajectoryMetadata, settingsJson, writeConversation, writeSummaries } from '../src/main/testing/agy-fixture'
import { MEASURED_TRANSCRIPT, MEASURED_TRANSCRIPT_ID, transcriptFile, writeTranscript } from '../src/main/testing/agy-transcript-fixture'
import { localDayOffset } from './support/dates'
import { mkUsageHome, mkEmptyProjectHome, questionLine } from './support/homes'
import { launch, close } from './support/launch'

/**
 * Ticket 03b: the fixture home for a Codex fork.
 * **There are 0 real forks in this machine's real data** (of 244 sessions, all 9 with a parent are
 * subagents,
 * unlisted per A3), so this path can only be covered by construction — shaped by the fields codex.ts
 * actually reads:
 * payload.id / payload.forked_from_id / the top-level timestamp as the fork moment.
 */
function mkForkHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-fork-'))
  const proj = join(home, 'fork-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })

  const PARENT = '019fb0c0-aaaa-7af3-af7d-8505cedf1ec2'
  const q = (at: Date, message: string): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'event_msg', payload: { type: 'user_message', message } })
  const usage = (at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      timestamp: at.toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: inTok, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: outTok, total_tokens: inTok + outTok } }
      }
    })
  const meta = (at: Date, id: string, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'session_meta', payload: { cwd: proj, id, ...extra } })
  const ctx = (at: Date): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } })

  // The parent session: two questions
  writeFileSync(
    join(sdir, `rollout-${PARENT}.jsonl`),
    [meta(localDayOffset(4), PARENT), ctx(localDayOffset(4)), q(localDayOffset(4), 'Parent first question'), usage(localDayOffset(4), 500, 100), q(localDayOffset(3), 'Parent second question'), usage(localDayOffset(3), 300, 60)].join('\n') + '\n'
  )
  // The child: forked from the parent, replaying its two entries (with rewritten timestamps) plus one new
// one → 1 should remain, marked "fork"
  const CHILD = '019fb0c0-bbbb-7af3-af7d-8505cedf1ec2'
  writeFileSync(
    join(sdir, `rollout-${CHILD}.jsonl`),
    [meta(localDayOffset(2), CHILD, { forked_from_id: PARENT }), ctx(localDayOffset(2)), q(localDayOffset(2), 'Parent first question'), q(localDayOffset(2), 'Parent second question'), q(localDayOffset(2), 'Child new question'), usage(localDayOffset(2), 200, 40)].join('\n') + '\n'
  )
  // An orphan fork: the parent is not in the scan set → the heuristic only, marked "uncertain strip"
  const ORPHAN = '019fb0c0-cccc-7af3-af7d-8505cedf1ec2'
  writeFileSync(
    join(sdir, `rollout-${ORPHAN}.jsonl`),
    [meta(localDayOffset(1), ORPHAN, { forked_from_id: '019fb0c0-dead-7af3-af7d-8505cedf1ec2' }), ctx(localDayOffset(1)), q(localDayOffset(1), 'Orphan session question'), usage(localDayOffset(1), 100, 20)].join('\n') + '\n'
  )
  return home
}

// Ticket session-view/02: the sessions tab. The fixture home builds sessions on both sides plus a warmup
// session containing only a Warmup
// (spec A3a: not listed but its tokens still count), asserting the list, the sort, the accounting note
// and the empty state.
test('the sessions section: sessions are listed, the sort switches, and warmup sessions are not listed', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // The fixture has 2 on the Claude side (1 real + 1 warmup) and 1 on the Codex side → only 2 should be listed
  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(2)
  await expect(win.locator('.pane-body .grp-t')).toContainText('2 sessions')
  // The warmup session's title must not appear
  await expect(win.locator('.pane-body .card')).not.toContainText('Warmup')

  // The session count left the row with the side-count badge's arrival (#123, settled in the
  // project-list prototype): the row's trailing meta is the relative time alone. Pinned so the
  // count does not quietly return — the sessions tab above is where the number lives now.
  const meta = (await win.locator('.side .row .meta').first().innerText()).trim()
  expect(meta, `the row meta should carry the relative time only; actual: ${meta}`).not.toMatch(/\d\s*$/)

  // Newest first by default: the first row is the one with later activity
  const titleOf = async (i: number): Promise<string> =>
    (await rows.nth(i).locator('.t').innerText()).trim()
  // In the fixture the Claude side's last activity is today and the Codex side's is yesterday — what is
  // asserted is **which specific one comes first**,
  // not "the two differ". The latter also holds with identical timestamps and proves nothing about sorting
  // by time.
  expect(await titleOf(0)).toBe('Sample question')
  expect(await titleOf(1)).toBe('Codex side question')

  // Switching to oldest first → the order reverses and the count is unchanged
  await win.locator('.pane-body .seg button', { hasText: 'Oldest first' }).click()
  await expect(rows).toHaveCount(2)
  expect(await titleOf(0)).toBe('Codex side question')
  expect(await titleOf(1)).toBe('Sample question')
  await expect(win.locator('.pane-body .grp-t')).toContainText('Oldest first')

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket session-view/03a: the question count moves onto the row. The two sessions' counts are
// **deliberately unequal** — with both at 1,
// the assertion could not distinguish "really read per session" from "both happen to be the same".
test('the sessions section: each row shows that session\'s real question count', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(2)
  const countOf = async (i: number): Promise<string> =>
    (await rows.nth(i).locator('.n').innerText()).trim()

  // Newest first by default: row 0 is the Claude side (2 real questions; the tool_result in between does
  // not count),
  // and row 1 is the Codex side (1)
  expect(await rows.nth(0).locator('.t').innerText()).toBe('Sample question')
  expect(await countOf(0), 'two real questions on the Claude side; a tool result fed back does not count').toBe('2 questions')
  expect(await countOf(1), 'one real question on the Codex side').toBe('1 question')

  expect(l.errors).toEqual([])
  await close(l)
})

test('the sessions section: the sort choice is remembered after switching away', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .seg button', { hasText: 'Oldest first' }).click()
  await expect(win.locator('.pane-body .grp-t')).toContainText('Oldest first')

  // Switch away and back: the tabs are conditionally rendered, so the component unmounts and its own
  // useState cannot hold it
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .grp-t')).toContainText('Oldest first')
  await expect(
    win.locator('.pane-body .se .t').first(),
    'coming back should keep oldest-first, with the earlier one on the first row'
  ).toHaveText('Codex side question')

  expect(l.errors).toEqual([])
  await close(l)
})

test('the sessions section: a project with no sessions shows an empty state, and the overview session card clicks through to this section', async () => {
  const l = await launch(undefined, mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .none')).toContainText('No sessions')
  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 04: the overview session card changes from "go to the tab" to **going straight to the session
// page** (closing the interim state ticket 02 left, as the v3 prototype states)
test('one click on the overview session card goes straight to the session page', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  // The overview is the default tab, so click the first session card directly (the most recent = the Claude
  // side's "Sample question")
  await win.locator('.pane-body .se.row-btn').first().click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  await expect(win.locator('.sback')).toContainText('Back to')
  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 04: the session page — entered from the tab, with complete row fields, everything listed at once
// with no pagination semantics, and back landing on the sessions tab
test('the session page: every question is listed with complete fields, and back returns to the sessions section', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()

  // The page header: badge + title + meta (numbers sharing their source with the list)
  await expect(win.locator('.pane-head .badge.cl')).toHaveText('CC')
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  await expect(win.locator('.smeta')).toContainText('2 questions')
  await expect(win.locator('.smeta')).toContainText('tok')

  // A row: index / full text / tool count / time; two real questions, with the tool result not counting.
  // Descending by default (ruled 2026-08-06): the newest, 02, comes first, and the index is still the
  // original turn number
  const qs = win.locator('.qlist .q')
  await expect(qs).toHaveCount(2)
  await expect(qs.nth(0).locator('.idx')).toHaveText('02')
  await expect(qs.nth(0).locator('.txt')).toHaveText('Second question')
  await expect(qs.nth(1).locator('.txt')).toHaveText('Sample question')
  await expect(qs.nth(0).locator('.tm')).not.toHaveText('—')
  await expect(win.locator('.qbar .grp-t')).toContainText('Questions (main line) · 2')

  // Everything at once: no pagination or load-more semantics appear (the spec's UI decision: any pagination
  // semantics would be an implementation gap disguised as design)
  await expect(win.locator('.pane-body')).not.toContainText('Loading')
  await expect(win.locator('.pane-body')).not.toContainText('more')

  // Back: lands on the Sessions tab rather than the overview (the prototype: Back to <project> · Sessions)
  await win.locator('.sback').click()
  await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions')
  await expect(win.locator('.pane-body .grp-t')).toContainText('2 sessions')

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 04: a fork session's page shares its source with the list — once the replay prefix is stripped,
// only the new questions remain
test('the session page: a fork session shows only the questions left after stripping', async () => {
  const l = await launch(undefined, mkForkHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Child new question' }).click()
  const qs = win.locator('.qlist .q')
  await expect(qs).toHaveCount(1)
  await expect(qs.first().locator('.txt')).toHaveText('Child new question')
  // Its title is the list's: the first question left after the strip, not the parent's replayed one (#278)
  await expect(win.locator('.pane-head .stitle')).toHaveText('Child new question')
  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 04: **wiring-level** evidence that the allow-list refuses — an invalid path sent over real IPC
// must be refused by the handler.
// A pure function unit test only proves "the function refuses"; this proves "the handler really uses it to
// refuse". Both directions are asserted:
// an absolute path outside the allow-list is refused, a traversal form is refused, and a valid path passes
// (already covered by the session page e2e).
test('the IPC surface: a path outside the allow-list is refused over the real channel, and the error carries no file content', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()

  const attempt = (p: string): Promise<string> =>
    win.evaluate(async (path) => {
      try {
        await (window as unknown as { agentshed: { getSessionPage: (f: string) => Promise<unknown> } })
          .agentshed.getSessionPage(path)
        return 'ALLOWED'
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    }, p)

  const r1 = await attempt('/etc/hosts')
  expect(r1, 'a system file must be refused').not.toBe('ALLOWED')
  // Assert the **error code** rather than wording: a failure crossing IPC has carried only a code and
  // parameters since ticket 05,
  // with the renderer producing the wording in the current language. What is guarded is unchanged (refused,
  // and no file content echoed back),
  // and only the assertion target moved — asserting on wording is exactly the coupling ADR-0015 exists to
  // eliminate
  expect(r1).toContain(ERR.sessionNotWhitelisted)
  // The error message echoes no file content (hosts usually contains a localhost line)
  expect(r1).not.toContain('localhost')

  const r2 = await attempt('/tmp/../etc/hosts')
  expect(r2, 'a traversal form must be refused').not.toBe('ALLOWED')

  // This case deliberately provokes handler errors, so it cannot assert errors is empty — it asserts
  // positively instead:
  // exactly two refusals on the main process side, all allow-list errors, with no other error type mixed in
  expect(l.errors).toHaveLength(2)
  for (const e of l.errors) expect(e).toContain(ERR.sessionNotWhitelisted)
  await close(l)
})

// Ticket 04: the ellipsis is CSS display-layer truncation while the data side holds the full text (a
// corollary of spec D2a).
// Confirmed with a question longer than one line: the DOM text = the full text, and the render box is
// narrower than the text's natural width.
test('the session page: a long question\'s single-line truncation happens only in the display layer, with the full text in the DOM', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-long-'))
  const proj = join(home, 'long-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const LONG = 'This is a deliberately very long question, '.repeat(30) + 'TAILMARKXYZ'
  writeFileSync(
    join(cdir, 'long.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: LONG } }),
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(1).toISOString(),
        message: { model: 'claude-fable-5', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      })
    ].join('\n') + '\n'
  )
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se').first().click()
  const txt = win.locator('.qlist .q .txt').first()
  // The data layer: the full text is in the DOM
  await expect(txt).toHaveText(LONG)
  // The display layer: single-line truncation really happens (the content width overflows the render box)
  const clipped = await txt.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(clipped, 'long text should be truncated in the display layer (scrollWidth > clientWidth)').toBe(true)
  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 05: clicking a question expands the whole turn in place, fetched on demand; 0 expanded by default
// (pre-expanding would defeat "fetch on demand")
test('the session page: everything collapsed by default; clicking a question expands the whole turn with its fetch footnote, and clicking again collapses it', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()

  // 0 turns expanded by default
  await expect(win.locator('.qlist .q')).toHaveCount(2)
  await expect(win.locator('.turn')).toHaveCount(0)

  // Click 01 (descending by default, so 02 is the first row — located by text rather than betting on
  // position): the question row unfolds itself (.open,
  // with no separate restating block), and below it come the whole turn plus the fetch footnote
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.qlist .q.open .txt')).toHaveText('Sample question')
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])
  await expect(win.locator('.turn .fetched')).toContainText("read only this turn\u2019s byte range")

  // Expanding another does not affect the one already open (turns are independent); the second turn has no
  // prose and still gets its footnote (no fake placeholder)
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(win.locator('.qlist .q.open')).toHaveCount(2)
  await expect(win.locator('.turn')).toHaveCount(2)
  await expect(win.locator('.turn .ans')).toHaveCount(1)

  // Click 01 again: it collapses and nothing else moves
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn')).toHaveCount(1)
  await expect(win.locator('.qlist .q.open')).toHaveCount(1)

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 06: day grouping with collapse + ascending/descending + expansion surviving a sort change
test('the session page: day groups collapse; descending reverses both the groups and their contents while the numbers stay; expansion survives a sort change', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()

  // Two days, two groups, with each header carrying that day's count; qhead carries the day count
  await expect(win.locator('.daygrp')).toHaveCount(2)
  await expect(win.locator('.dayhd').first()).toContainText(' · 1')
  await expect(win.locator('.qbar .grp-t')).toContainText('2 days')

  // Descending by default (the user's ruling, 2026-08-06): the first row is the newest, 02
  await expect(win.locator('.qlist .q').first().locator('.idx'), 'descending by default, so the first row should be 02').toHaveText('02')
  // Expand 01, then switch to ascending: it stays expanded, the index is unchanged, and the group order and
  // their contents both reverse
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])
  await win.locator('.qbar .seg button', { hasText: 'Oldest first' }).click()
  await expect(win.locator('.qlist .q').first().locator('.idx'), 'after switching to ascending the first row should be the original 01').toHaveText('01')
  const openRow = win.locator('.qlist .q.open')
  await expect(openRow, 'an expanded turn survives a sort change').toHaveCount(1)
  await expect(openRow.locator('.idx'), 'the index is always the original turn number').toHaveText('01')
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])

  // Collapse the day 01 is on: that day's rows and the expanded turn are hidden together, and reopening
  // still shows it expanded.
  // After collapsing, .q.open no longer renders, so note the group header date first and relocate by date on
  // reopening
  const day01hd = win.locator('.daygrp', { has: win.locator('.q.open') }).locator('.dayhd')
  const dayLabel = (await day01hd.innerText()).split(' · ')[0].trim()
  await day01hd.click()
  await expect(win.locator('.q.open')).toHaveCount(0)
  await expect(win.locator('.turn')).toHaveCount(0)
  await win.locator('.dayhd', { hasText: dayLabel }).click()
  await expect(win.locator('.q.open')).toHaveCount(1)
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])

  // Collapse all → the label flips and every row hides; expand all restores it
  await win.locator('.qbar .lnk').click()
  await expect(win.locator('.qlist .q')).toHaveCount(0)
  await expect(win.locator('.qbar .lnk')).toHaveText('Expand all')
  await win.locator('.qbar .lnk').click()
  await expect(win.locator('.qlist .q')).toHaveCount(2)

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 06: the three tiers of top banner — stripped info (with the parent title clicking through to the
// parent session) and the orphan risk
test('the session page banner: a stripped fork gets info with the parent title clicking through; a missing parent gets risk and says to check against the source', async () => {
  // The delay (query layer, ADR-0028) makes the parent's fetch observably slow, which is what the
  // hold assertion below (session-view P2) needs to distinguish from an atomic switch.
  const l = await launch(undefined, mkForkHome(), { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // The child (already stripped): an info banner carrying the parent title, clicking through to the parent
  // session page
  await win.locator('.pane-body .card .se', { hasText: 'Child new question' }).click()
  const info = win.locator('.banner.info')
  await expect(info).toContainText('forked from')
  await expect(info).toContainText('Parent first question')
  await expect(info).toContainText('replayed prefix has been stripped')
  await info.locator('a').click()
  // Sampled inside the 600ms delay window, immediately after the click: the child page is still whole
  // (P2) — the banner link's target has not committed yet
  await expect(win.locator('.banner.info')).toContainText('Parent first question')
  await expect(win.locator('.pane-head .stitle')).toHaveText('Child new question')
  // The parent is not a fork: no banner at all
  await expect(win.locator('.banner')).toHaveCount(0)

  // An orphan fork: a risk banner saying outright it may have stripped too much or too little and to check
  // against the source — offering no false certainty
  await win.locator('.sback').click()
  await win.locator('.pane-body .card .se', { hasText: 'Orphan session question' }).click()
  const risk = win.locator('.banner.risk')
  await expect(risk).toContainText('outside the scan set')
  await expect(risk).toContainText('duplicates')
  await expect(risk).toContainText('Please check against the original')

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 05: a signature mismatch → rebuild only that file's index and show the content once rebuilt (no
// blank wait, no error).
// The interim copy is momentary and e2e does not bet on timing; what is asserted is that the chain
// produces the right result with no main-process error.
test('the session page: after the file is appended to (so the signature mismatches), clicking a question still fetches the correct whole turn', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const sess = join(home, '.claude', 'projects', enc, 'a.jsonl')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await expect(win.locator('.qlist .q')).toHaveCount(2)

  // The file is appended to after the page opens: the size changes → the signature mismatches, and the first
  // fetch goes through a single-file rebuild
  appendFileSync(
    sess,
    JSON.stringify({
      type: 'user',
      timestamp: localDayOffset(0).toISOString(),
      message: { role: 'user', content: 'Appended third question' }
    }) + '\n'
  )
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])
  await expect(win.locator('.turn .fetched')).toContainText("read only this turn\u2019s byte range")

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 07: in-turn rich content — tool blocks collapsing and expanding again, the thinking block,
// subagent attribution, the truncation label, and unknown traces
test('session page rich content (Claude): the thinking, tool and subagent blocks are collapsed by default and expand to the full text with their labels', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()

  // The prose plus three collapsed block headers (thinking / Bash / subagent), all collapsed by default
  // (.bb does not render)
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])
  await expect(win.locator('.turn .blk')).toHaveCount(3)
  await expect(win.locator('.turn .bb')).toHaveCount(0)

  // The thinking block: plaintext available
  const think = win.locator('.turn .blk.think')
  await expect(think.locator('.nm')).toHaveText('Thinking')
  await think.locator('.bh').click()
  await expect(think.locator('.bb')).toContainText('Take a look at the directory layout')

  // The tool block: expanding again shows the arguments and return; the truncation warning (the return
  // carries a tool-results/ sidecar path)
  const tool = win.locator('.turn .blk', { has: win.locator('.nm', { hasText: 'Bash' }) }).first()
  await expect(tool.locator('.sum')).toContainText('ls -la src')
  await tool.locator('.bh').click()
  await expect(tool.locator('pre').nth(0)).toContainText('ls -la src')
  await expect(tool.locator('pre').nth(1)).toContainText('12 files in total')
  await expect(tool.locator('.warn')).toContainText('only stored a truncated version')

  // The subagent block: the dispatch prompt and the return; the inner steps have no stable reference chain →
  // an explicit unattributed label
  // (measured 2026-08-06: all four candidate join keys were excluded, so no speculative pairing is made)
  const sub = win.locator('.turn .blk.sub')
  await expect(sub.locator('.nm')).toContainText('debugger')
  await sub.locator('.bh').click()
  await expect(sub.locator('pre').nth(0)).toContainText('Check today logs')
  await expect(sub.locator('.step')).toHaveCount(0)
  await expect(sub.locator('.warn')).toContainText('stable reference chain')
  await expect(sub.locator('pre').nth(1)).toContainText('Logs are clean')

  // Unknown types leave a trace: nothing is silently dropped
  await expect(win.locator('.turn .unknown')).toContainText('1 unrecognised record')
  await expect(win.locator('.turn .unknown')).toContainText('agent_snapshot')

  expect(l.errors).toEqual([])
  await close(l)
})

test('session page rich content (Codex): the encrypted-reasoning label, tool pairing, the unattributable spawn label, and traces of unknown events', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Codex side question' }).click()
  await win.locator('.qlist .q', { hasText: 'Codex side question' }).click()

  await expect(win.locator('.turn .ans')).toContainText('The two sides use different directory conventions')

  // The reasoning block: sub-headings only, with a warning saying outright the body is encrypted and
  // unobtainable
  const reason = win.locator('.turn .blk.think')
  await expect(reason.locator('.sum')).toContainText('only 2 headings')
  await reason.locator('.bh').click()
  await expect(reason.locator('.warn')).toContainText('encrypted_content')
  await expect(reason.locator('.rt')).toHaveCount(2)

  // The tool block: arguments and return paired by call_id
  const tool = win.locator('.turn .blk', { has: win.locator('.nm', { hasText: 'exec' }) }).first()
  await tool.locator('.bh').click()
  await expect(tool.locator('pre').nth(0)).toContainText('rg skills -l')
  await expect(tool.locator('pre').nth(1)).toContainText('7 files')

  // spawn_agent: a sub block whose sub-thread has no reference chain and is unattributed (ruled 2026-08-06)
  const sub = win.locator('.turn .blk.sub')
  await sub.locator('.bh').click()
  await expect(sub.locator('.warn')).toContainText('stable reference chain')
  await expect(sub.locator('pre').nth(1)).toContainText('Sub-task created')

  // An unknown event leaves a trace (one of the three allow-list layers)
  await expect(win.locator('.turn .unknown')).toContainText('event_msg/exotic_event')

  expect(l.errors).toEqual([])
  await close(l)
})

test('session page (Codex, paginated format): the session is listed by its completed-item question, opens, and its turn shows the agent-message prose with no unknown trace', async () => {
  // A rollout in the paginated format (spec session-view B1/C8): no user_message or agent_message events;
  // the question and the prose are completed-item events, the usage a record, and the item mirrors,
  // the usage record and the compacted checkpoint must leave no trace in the turn.
  const home = mkUsageHome()
  const proj = join(home, 'demo-proj')
  const sdir = join(home, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(sdir, { recursive: true })
  const at = localDayOffset(1).toISOString()
  const item = (type: string, extra: Record<string, unknown>): string =>
    JSON.stringify({ timestamp: at, ordinal: 9, type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type, id: 'i', ...extra }, started_at_ms: 1, completed_at_ms: 1 } })
  writeFileSync(
    join(sdir, 'rollout-019fb0c0-2222-7af3-af7d-8505cedf1ec2.jsonl'),
    [
      JSON.stringify({ timestamp: at, ordinal: 0, type: 'session_meta', payload: { cwd: proj, id: '019fb0c0-2222-7af3-af7d-8505cedf1ec2' } }),
      JSON.stringify({ timestamp: at, ordinal: 1, type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
      item('UserMessage', { content: [{ type: 'text', text: 'Paginated question', text_elements: [] }] }),
      item('Reasoning', { summary_text: [], raw_content: [] }),
      JSON.stringify({ timestamp: at, ordinal: 4, type: 'response_item', payload: { type: 'custom_tool_call', id: 'ri9', call_id: 'c_pg', name: 'exec', input: 'ls -la', status: 'completed' } }),
      item('CommandExecution', { command: 'ls -la', status: 'completed' }),
      JSON.stringify({ timestamp: at, ordinal: 6, type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'c_pg', output: '3 files' } }),
      JSON.stringify({ timestamp: at, ordinal: 7, type: 'token_usage_record', payload: { thread_id: 't', turn_id: 'u', session_id: 't', root_turn_id: 'u', response_id: 'resp_pg', usage: { input_tokens: 700, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 90, reasoning_output_tokens: 0, total_tokens: 790 }, turn_token_usage: { input_tokens: 700, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 90, reasoning_output_tokens: 0, total_tokens: 790 }, thread_token_usage: { input_tokens: 700, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 90, reasoning_output_tokens: 0, total_tokens: 790 } } }),
      item('AgentMessage', { content: [{ type: 'Text', text: 'Three files live in that directory.' }], phase: 'final_answer' }),
      JSON.stringify({ timestamp: at, ordinal: 9, type: 'compacted', payload: { message: '', replacement_history: [], window_number: 1, first_window_id: 'w', previous_window_id: 'w', window_id: 'w2', compaction_response_id: null, latest_token_usage_record: null } })
    ].join('\n') + '\n'
  )
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Paginated question' }).click()
  await win.locator('.qlist .q', { hasText: 'Paginated question' }).click()
  await expect(win.locator('.turn .ans')).toContainText('Three files live in that directory.')
  // The tool renders once (from the response_item record), not again from its completed-item mirror
  await expect(win.locator('.turn .blk', { has: win.locator('.nm', { hasText: 'exec' }) })).toHaveCount(1)
  await expect(win.locator('.turn .unknown')).toHaveCount(0)
  expect(l.errors).toEqual([])
  await close(l)
})

test('session page (Codex, cold rollout): a .jsonl.zst session is listed, counted, opens and expands like a plain one', async () => {
  // Codex compresses a rollout untouched for seven days and deletes the plain file (spec token-stats B12,
  // session-view C2): the fixture is the paginated rollout of the previous case, zstd-compressed.
  const home = mkUsageHome()
  const proj = join(home, 'demo-proj')
  const sdir = join(home, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(sdir, { recursive: true })
  const at = localDayOffset(1).toISOString()
  const item = (type: string, extra: Record<string, unknown>): string =>
    JSON.stringify({ timestamp: at, ordinal: 9, type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type, id: 'i', ...extra }, started_at_ms: 1, completed_at_ms: 1 } })
  const lines = [
    JSON.stringify({ timestamp: at, ordinal: 0, type: 'session_meta', payload: { cwd: proj, id: '019fb0c0-3333-7af3-af7d-8505cedf1ec2' } }),
    JSON.stringify({ timestamp: at, ordinal: 1, type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
    item('UserMessage', { content: [{ type: 'text', text: 'Cold question', text_elements: [] }] }),
    JSON.stringify({ timestamp: at, ordinal: 3, type: 'token_usage_record', payload: { thread_id: 't', turn_id: 'u', session_id: 't', root_turn_id: 'u', response_id: 'resp_cold', usage: { input_tokens: 500, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 550 }, turn_token_usage: { input_tokens: 500, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 550 }, thread_token_usage: { input_tokens: 500, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 550 } } }),
    item('AgentMessage', { content: [{ type: 'Text', text: 'Answered from the compressed file.' }], phase: 'final_answer' })
  ]
  writeFileSync(join(sdir, 'rollout-019fb0c0-3333-7af3-af7d-8505cedf1ec2.jsonl.zst'), zstdCompressSync(Buffer.from(lines.join('\n') + '\n')))
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Cold question' }).click()
  await win.locator('.qlist .q', { hasText: 'Cold question' }).click()
  await expect(win.locator('.turn .ans')).toContainText('Answered from the compressed file.')
  await expect(win.locator('.turn .unknown')).toHaveCount(0)
  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket 08: session search — questions by default, the full-text toggle, hits grouped, and going straight
// to a question.
// Input uses fill() (setting the value through CDP without depending on window focus semantics; the
// :focus assertion boundary noted on launch in support/launch.ts
// does not apply to this case).
test('session search: questions by default with hits grouped; a body word only hits after switching to full text; clicking a hit goes straight to that question', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // Questions by default: 1 hit, grouped with a session header; case-insensitive
  await win.locator('.sbar input').fill('Sample question')
  await expect(win.locator('.grp')).toHaveCount(1)
  // A regression guard: a hit group's button must reset the UA default styles (missing it exposes
  // black-on-white in dark mode)
  for (const sel of ['.grp .gh', '.grp .hit']) {
    const bg = await win.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg, `${sel} should have a transparent background rather than the UA buttonface`).toBe('rgba(0, 0, 0, 0)')
  }
  await expect(win.locator('.grp .gh .t')).toContainText('Sample question')
  await expect(win.locator('.grp .hit')).toHaveCount(1)
  await expect(win.locator('.grp .hit mark').first()).toContainText('Sample question')
  await expect(win.locator('.shead')).toContainText('Found 1 hit · 1 session')

  // A word in the body (the first turn reply body) does not hit in question mode → an actionable empty state
  await win.locator('.sbar input').fill('First turn reply body')
  await expect(win.locator('.shead')).toContainText('Only questions are searched by default')
  // Switch to full text: it hits and is marked as a body hit
  await win.locator('.scope span', { hasText: 'Full text' }).click()
  await expect(win.locator('.grp .hit')).toHaveCount(1)
  await expect(win.locator('.grp .hit .bd')).toHaveText('Body')

  // Clicking a hit goes straight to that question in that session (row 01 comes into view; under the default
  // descending order it is at the list's end).
  // The locating highlight (confirmed by the prototype on 2026-08-06): the located pulse plus the focused
  // bar;
  // clicking any question row clears the bar. The end of the 10s pulse is not waited for here (no betting on
  // timing).
  await win.locator('.grp .hit').click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  const row01 = win.locator('.qlist .q', { hasText: 'Sample question' })
  await expect(row01).toBeInViewport()
  await expect(row01).toHaveClass(/located/)
  await expect(row01).toHaveClass(/focused/)
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(row01).not.toHaveClass(/focused/)

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket grok-side/#125: the whole chain for a Grok session — listed with its title, questions
// indexed, a turn fetched on demand rendering through the shared block model, search hitting it,
// and the read allow-list refusing the unlisted subagent stream over the real channel.
test('a Grok session opens end to end: list, questions, an on-demand turn, search, and the allow-list boundary', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gksess-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gline = (tsSec: number, update: Record<string, unknown>): string =>
    JSON.stringify({ timestamp: tsSec, method: '_x.ai/session/update', params: { sessionId: 's', update } })
  const t0 = Math.floor(localDayOffset(1).getTime() / 1000)
  const mkSess = (id: string, lines: string[], subagent = false): string => {
    const d = join(home, '.grok', 'sessions', encodeURIComponent(proj), id)
    mkdirSync(d, { recursive: true })
    const summary: Record<string, unknown> = { info: { id, cwd: proj } }
    if (subagent) summary['session_kind'] = 'subagent'
    writeFileSync(join(d, 'summary.json'), JSON.stringify(summary))
    const f = join(d, 'updates.jsonl')
    writeFileSync(f, lines.join('\n') + '\n')
    return f
  }
  mkSess('019f-e2e-main', [
    gline(t0, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Grok side question' }, _meta: { promptIndex: 0 } }),
    gline(t0 + 5, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'think about it' } }),
    gline(t0 + 6, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'The grok reply body, part ' } }),
    gline(t0 + 6, { sessionUpdate: 'current_mode_update', currentModeId: 'code' }),
    gline(t0 + 6, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'one and two joined' } }),
    gline(t0 + 7, { sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'read_file', rawInput: { target_file: '/x/y.md' }, _meta: { 'x.ai/tool': { name: 'read_file' } } }),
    gline(t0 + 8, { sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: '42 lines' } }] }),
    gline(t0 + 9, { sessionUpdate: 'turn_completed', usage: { inputTokens: 900, outputTokens: 100, totalTokens: 1000, cachedReadTokens: 0, cacheCreationTokens: 0, costUsdTicks: 1, modelUsage: { 'grok-4.5-build': { inputTokens: 900, outputTokens: 100, cachedReadTokens: 0, cacheCreationTokens: 0 } } } }),
    gline(t0 + 10, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Second grok question' }, _meta: { promptIndex: 1 } }),
    gline(t0 + 11, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Second answer' } })
  ])
  const subFile = mkSess('019f-e2e-child', [
    gline(t0, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'child work' }, _meta: { promptIndex: 0 } })
  ], true)

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // Listed once (the subagent session is not a row), title = the first question fallback
  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('.t')).toHaveText('Grok side question')

  // The page: both questions, real counts; the turn fetches on demand and renders the block model
  await expect(rows.first().locator('.badge.gk')).toHaveText('GK')
  await rows.first().click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Grok side question')
  await expect(win.locator('.pane-head .badge.gk')).toHaveText('GK')
  await expect(win.locator('.smeta')).toContainText('2 questions')
  await win.locator('.qlist .q', { hasText: 'Grok side question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['The grok reply body, part one and two joined'])
  const think = win.locator('.turn .blk.think')
  await think.locator('.bh').click()
  await expect(think.locator('.bb')).toContainText('think about it')
  const tool = win.locator('.turn .blk', { has: win.locator('.nm', { hasText: 'read_file' }) }).first()
  await tool.locator('.bh').click()
  await expect(tool.locator('pre').nth(0)).toContainText('/x/y.md')
  await expect(tool.locator('pre').nth(1)).toContainText('42 lines')
  await expect(win.locator('.turn .fetched')).toContainText("read only this turn’s byte range")

  // Search hits the grok question
  await win.locator('.sback').click()
  await win.locator('.sbar input').fill('Second grok question')
  await expect(win.locator('.grp .hit')).toHaveCount(1)

  // The allow-list boundary: the unlisted subagent stream is refused over the real channel
  const refused = await win.evaluate(async (p) => {
    try {
      await (window as unknown as { agentshed: { getSessionPage: (f: string) => Promise<unknown> } })
        .agentshed.getSessionPage(p)
      return 'ALLOWED'
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, subFile)
  expect(refused).not.toBe('ALLOWED')
  expect(refused).toContain(ERR.sessionNotWhitelisted)

  // The refusal above is deliberate; assert exactly that error and nothing else
  expect(l.errors).toHaveLength(1)
  expect(l.errors[0]).toContain(ERR.sessionNotWhitelisted)
  await close(l)
})

// Ticket session-view/03b: the fork and uncertain-strip markers
test('the sessions section: a fork session has its replay prefix stripped and is marked "fork"; one with a missing parent is marked "uncertain strip"', async () => {
  const l = await launch(undefined, mkForkHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(3)

  const rowOf = (title: string): ReturnType<typeof win.locator> =>
    win.locator('.pane-body .card .se').filter({ hasText: title })

  // The parent: not a fork, two questions, no marker
  await expect(rowOf('Parent first question').locator('.n')).toHaveText('2 questions')
  await expect(rowOf('Parent first question').locator('.pill')).toHaveCount(0)

  // The child: the two replayed entries are stripped leaving only its own, marked as a fork
  const child = rowOf('Child new question')
  await expect(child.locator('.n'), 'it would read 3 questions if the replay prefix were not stripped').toHaveText('1 question')
  // The marker is an icon plus a word. Asserting the text alone would pass just as well with the icon
  // missing, so the icon is asserted as its own element (#51 turned it from a character into an SVG,
  // and a character would have been part of the text where an SVG is not).
  await expect(child.locator('.pill.fork')).toHaveText('fork')
  await expect(child.locator('.pill.fork svg')).toHaveCount(1)
  await expect(child.locator('.pill.forkq')).toHaveCount(0)

  // An orphan fork: its parent is outside the scan set, so it is marked uncertain rather than certain
  const orphan = rowOf('Orphan session question')
  await expect(orphan.locator('.pill.forkq')).toContainText('uncertain strip')
  // Same reason as its sibling above: the text alone would still pass with the icon gone. The two
  // pills deliberately share one glyph — what separates them is the dashed border and the risk colour,
  // so "uncertain" is carried by the pill rather than by a second icon (ADR-0018).
  await expect(orphan.locator('.pill.forkq svg')).toHaveCount(1)
  await expect(orphan.locator('.pill.fork')).toHaveCount(0)

  expect(l.errors).toEqual([])
  await close(l)
})

test('opening a session (query layer): the project page holds until the session page arrives, and reopening it is instant', async () => {
  const l = await launch(undefined, mkUsageHome(), { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .card .se', { hasText: 'Sample question' })).toBeVisible()

  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  // Sampled inside the 600ms delay window, immediately after the click: the sessions list is still on
  // screen (session-view P1) — no empty pane, no session header yet
  await expect(win.locator('.pane-body .card .se')).toHaveCount(2)
  await expect(win.locator('.pane-head .stitle')).toHaveCount(0)

  // After the delay, the session page shows whole in one frame
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  await expect(win.locator('.qlist .q')).toHaveCount(2)

  // Back to the sessions section (a cached visit of the project, per project-detail T9), then reopen
  // the same session: a cached visit (P4), well inside the delay window
  await win.locator('.sback').click()
  await expect(win.locator('.pane-body .card .se', { hasText: 'Sample question' })).toBeVisible()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question', { timeout: 200 })

  expect(l.errors).toEqual([])
  await close(l)
})

test('opening a session then returning to the project before it arrives (query layer): the project page stays, no error, and the interrupted fetch is cached', async () => {
  const l = await launch(undefined, mkUsageHome(), { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  const row = win.locator('.side .row').first()
  await row.click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .card .se', { hasText: 'Sample question' })).toBeVisible()

  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  // Before the 600ms delay can resolve, return attention to the project (session-view P8): the only
  // session-independent affordance available while the sessions list is held on screen is the still-
  // selected project row itself, which routes through the same pending-switch machinery as a project
  // switch (App.tsx's selectProject clears the pending session open in the same Transition)
  await row.click()

  // The project page stays: the sessions list is still there, no session header ever appeared
  await expect(win.locator('.pane-body .card .se')).toHaveCount(2)
  await expect(win.locator('.pane-head .stitle')).toHaveCount(0)
  await win.waitForTimeout(700) // past the delay: still no session page, and no error surfaced
  await expect(win.locator('.pane-head .stitle')).toHaveCount(0)

  // The interrupted fetch still completed and was cached: reopening the session now is instant
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question', { timeout: 200 })

  expect(l.errors).toEqual([])
  await close(l)
})

test('an automatic rescan refreshes an open session page by transfusion (query layer): the question list follows the file while expansion and sort survive', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const sess = join(home, '.claude', 'projects', enc, 'a.jsonl')
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await expect(win.locator('.qlist .q')).toHaveCount(2)

  // Expand a turn and change the sort — both are page-local state that must survive the transfusion
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])
  await win.locator('.seg button', { hasText: 'Oldest first' }).click()
  await expect(win.locator('.seg button.on')).toHaveText('Oldest first')

  // The file is appended to on the same day as the existing questions (day grouping is not this
  // test's concern): the automatic rescan invalidates the open page's query, and the new question
  // lands with no click of any kind
  appendFileSync(
    sess,
    JSON.stringify({
      type: 'user',
      timestamp: localDayOffset(2).toISOString(),
      message: { role: 'user', content: 'Appended third question' }
    }) + '\n'
  )
  await expect(win.locator('.qlist .q')).toHaveCount(3)
  await expect(win.locator('.qlist')).toContainText('Appended third question')

  // Expansion and sort survived the transfusion (the question list was replaced in place, not remounted)
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])
  await expect(win.locator('.seg button.on')).toHaveText('Oldest first')

  expect(l.errors).toEqual([])
  await close(l)
})

test('opening a session whose file was removed after the scan (query layer): the page shows its own error, no crash', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const sess = join(home, '.claude', 'projects', enc, 'a.jsonl')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .card .se', { hasText: 'Sample question' })).toBeVisible()

  // The file is gone by the time the page is opened, but the scan already listed it (allow-list still
  // admits the exact path): the fetch rejects, and the query layer resolves that in-band (P6) rather
  // than crashing the page. This case deliberately provokes a handler error (as the allow-list test
  // above does), so it asserts positively rather than asserting errors is empty.
  rmSync(sess, { force: true })
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await expect(win.locator('.pane-body .none')).toContainText('Cannot open this session')

  expect(l.errors).toHaveLength(1)
  expect(l.errors[0]).toContain(ERR.sessionFileUnreadable)
  await close(l)
})

test('a session file that exists and cannot be read: the page and a turn say so in a sentence in the current language, and the other turn stays (P6, in-turn fetch states)', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const claude = join(home, '.claude', 'projects', enc, 'a.jsonl')
  const codex = join(home, '.codex', 'sessions', '2026', '01', '01', 'rollout-019fb0c0-1111-7af3-af7d-8505cedf1ec2.jsonl')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])

  // The file exists and its index is good, so only the read fails: chmod changes neither its mtime nor its size
  chmodSync(claude, 0o000)
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(win.locator('.turn .tnote')).toHaveText('This turn could not be fetched: The session file can no longer be read (moved or deleted?)')
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])

  // A session that cannot be opened at all
  chmodSync(codex, 0o000)
  await win.locator('.sback').click()
  await win.locator('.pane-body .card .se', { hasText: 'Codex side question' }).click()
  await expect(win.locator('.pane-body .none')).toHaveText('Cannot open this session: The session file can no longer be read (moved or deleted?)')

  // Both in Chinese: the page re-renders from the code it holds, and the turn is fetched again under Chinese
  await win.locator('.ri.set').click()
  await win.locator('[data-testid="language-trigger"]').click()
  await win.locator('.lang-opt[data-lang="zh"]').click()
  await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.pane-body .none')).toHaveText('会话打不开:会话文件已不可读(被移动或删除?)')
  await win.locator('.sback').click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(win.locator('.turn .tnote')).toHaveText('这一轮取不回来:会话文件已不可读(被移动或删除?)')
  // The turn read earlier keeps what was read, whatever the file says now
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])

  // Clicking again retries: readable again, the turn comes
  chmodSync(claude, 0o644)
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(win.locator('.turn')).toHaveCount(1)
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(win.locator('.turn .tnote')).toHaveCount(0)
  await expect(win.locator('.turn .fetched')).toHaveCount(2)
  chmodSync(codex, 0o644)

  // The handler errors this case provokes on purpose carry the code and nothing else does
  expect(l.errors.length).toBeGreaterThan(0)
  for (const e of l.errors) expect(e.includes(ERR.sessionFileUnreadable), `a collected stderr chunk without the code:\n${e}`).toBe(true)
  await close(l)
})

// The file changed since the index, so the rebuild path runs and fails on the read: that used to say it failed to parse
test('a session file that changed since the index and cannot be read: the page and a turn say it cannot be read (P6, in-turn fetch states)', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const dir = join(home, '.claude', 'projects', enc)
  const claude = join(dir, 'a.jsonl')
  const other = join(dir, 'b.jsonl')
  writeFileSync(other, JSON.stringify({ type: 'user', timestamp: localDayOffset(3).toISOString(), message: { role: 'user', content: 'Locked question' } }) + '\n')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  const row = (question: string) => win.locator('.pane-body .card .se', { hasText: question })
  await expect(row('Locked question')).toBeVisible()
  const spoil = (file: string): void => {
    appendFileSync(file, '\n')
    chmodSync(file, 0o000)
  }

  // The page, on its first open
  spoil(other)
  await row('Locked question').click()
  await expect(win.locator('.pane-body .none')).toHaveText('Cannot open this session: The session file can no longer be read (moved or deleted?)')

  // A turn, with another already open
  await win.locator('.sback').click()
  await row('Sample question').click()
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])
  spoil(claude)
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(win.locator('.turn .tnote')).toHaveText('This turn could not be fetched: The session file can no longer be read (moved or deleted?)')
  await expect(win.locator('.turn .ans')).toHaveText(['This is the first turn reply body'])

  // Codex's rebuild reads the metadata first, and a file that cannot be read says the same there
  const codex = join(home, '.codex', 'sessions', '2026', '01', '01', 'rollout-019fb0c0-1111-7af3-af7d-8505cedf1ec2.jsonl')
  spoil(codex)
  await win.locator('.sback').click()
  await row('Codex side question').click()
  await expect(win.locator('.pane-body .none')).toHaveText('Cannot open this session: The session file can no longer be read (moved or deleted?)')

  chmodSync(claude, 0o644)
  chmodSync(other, 0o644)
  chmodSync(codex, 0o644)

  // The handler errors this case provokes on purpose carry the code and nothing else does
  expect(l.errors.length).toBeGreaterThan(0)
  for (const e of l.errors) expect(e.includes(ERR.sessionFileUnreadable), `a collected stderr chunk without the code:\n${e}`).toBe(true)
  await close(l)
})

test('a project search with one session file that cannot be read shows the other sessions\' hits and leaves that one out (a failure on one entry stays there)', async () => {
  const home = mkUsageHome()
  const claude = join(home, '.claude', 'projects', join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-'), 'a.jsonl')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.sbar input').fill('question')
  await expect(win.locator('.shead')).toContainText('Found 3 hits · 2 sessions')

  // Claude's session is read first, being the newest, so the Codex hit comes after the failure. And another needle: the
  // same one is answered from the query's cache, and reads nothing
  chmodSync(claude, 0o000)
  await win.locator('.sbar input').fill('ques')
  await expect(win.locator('.shead')).toContainText('Found 1 hit · 1 session')
  await expect(win.locator('.grp .hit')).toHaveCount(1)
  await expect(win.locator('.grp .hit')).toContainText('Codex side question')
  chmodSync(claude, 0o644)
  expect(l.errors).toEqual([])
  await close(l)
})

test('a failed token cache write on a session page: a session whose index has to be rebuilt opens, with no raw error, and the failure is logged (P6, C4)', async () => {
  const home = mkUsageHome()
  const enc = join(home, 'demo-proj').replace(/[^a-zA-Z0-9]/g, '-')
  const l = await launch(undefined, home)
  const stderr: string[] = []
  l.app.process().stderr?.on('data', (b: Buffer) => stderr.push(b.toString()))
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .card .se', { hasText: 'Sample question' })).toBeVisible()

  mkdirSync(join(l.userData, `.token-cache.j-${l.app.process().pid}`))
  appendFileSync(join(home, '.claude', 'projects', enc, 'a.jsonl'), questionLine('Third question') + '\n')
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  // Only a rebuild knows the third question
  await expect(win.locator('.qlist .q')).toHaveCount(3)
  await expect(win.locator('.qlist .q', { hasText: 'Third question' })).toBeVisible()
  await expect(win.locator('.pane-body .none')).toHaveCount(0)
  await expect.poll(() => stderr.join('')).toContain('[token-cache] save failed:')
  expect(l.errors).toEqual([])
  await close(l)
})

test('a session whose file Codex compresses while cached (query layer): the open page errors after the next scan, and it reappears under its compressed identity', async () => {
  const home = mkUsageHome()
  const proj = join(home, 'demo-proj')
  const sdir = join(home, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(sdir, { recursive: true })
  const at = localDayOffset(1).toISOString()
  const item = (type: string, extra: Record<string, unknown>): string =>
    JSON.stringify({ timestamp: at, ordinal: 9, type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type, id: 'i', ...extra }, started_at_ms: 1, completed_at_ms: 1 } })
  const lines = [
    JSON.stringify({ timestamp: at, ordinal: 0, type: 'session_meta', payload: { cwd: proj, id: '019fb0c0-4444-7af3-af7d-8505cedf1ec2' } }),
    JSON.stringify({ timestamp: at, ordinal: 1, type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
    item('UserMessage', { content: [{ type: 'text', text: 'Soon compressed question', text_elements: [] }] }),
    JSON.stringify({ timestamp: at, ordinal: 3, type: 'token_usage_record', payload: { thread_id: 't', turn_id: 'u', session_id: 't', root_turn_id: 'u', response_id: 'resp_sc', usage: { input_tokens: 400, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 40, reasoning_output_tokens: 0, total_tokens: 440 }, turn_token_usage: { input_tokens: 400, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 40, reasoning_output_tokens: 0, total_tokens: 440 }, thread_token_usage: { input_tokens: 400, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 40, reasoning_output_tokens: 0, total_tokens: 440 } } }),
    item('AgentMessage', { content: [{ type: 'Text', text: 'Answered before compression.' }], phase: 'final_answer' })
  ]
  const plain = join(sdir, 'rollout-019fb0c0-4444-7af3-af7d-8505cedf1ec2.jsonl')
  writeFileSync(plain, lines.join('\n') + '\n')

  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Soon compressed question' }).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Soon compressed question')

  // Codex compresses the rollout and deletes the plain file while this page is still open
  writeFileSync(plain + '.zst', zstdCompressSync(Buffer.from(lines.join('\n') + '\n')))
  rmSync(plain, { force: true })

  // The automatic rescan invalidates the open page's query; the refetch for the now-gone plain path
  // fails, and the page shows its own error state rather than crashing or freezing on stale content
  // (P7). This deliberately provokes a handler error, so it asserts positively rather than empty.
  await expect(win.locator('.pane-body .none')).toContainText('Cannot open this session')
  expect(l.errors.length).toBeGreaterThan(0)
  for (const e of l.errors) {
    // The chunk itself is the message: a failure says which line broke it
    expect(e.includes(ERR.sessionFileUnreadable) || e.includes(ERR.sessionNotWhitelisted), `a collected stderr chunk carries neither code:\n${e}`).toBe(true)
  }

  // The session reappears in the list under its compressed identity (same title, a new file) and
  // opens correctly
  await win.locator('.sback').click()
  await expect(win.locator('.pane-body .card .se', { hasText: 'Soon compressed question' })).toHaveCount(1)
  await win.locator('.pane-body .card .se', { hasText: 'Soon compressed question' }).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Soon compressed question')
  await win.locator('.qlist .q', { hasText: 'Soon compressed question' }).click()
  await expect(win.locator('.turn .ans')).toContainText('Answered before compression.')

  await close(l)
})

// session-view::US-001 (AC-01 to AC-10) and CON-002 end to end, on the session page as a user reaches it. One
// home: a project whose directory name holds a space and a single quote, with a Claude Code session named by a
// UUID, a Codex rollout with an id, one without, and a Grok session; and a stale project (registered in Codex's
// config, never created) holding a Codex parent and its fork, reached from global search. The main process's
// clipboard write and Finder call are replaced at the Electron boundary with recorders, so a run neither
// overwrites the user's clipboard nor opens Finder. Each command below is spelled out, its quoting included.
// Gaps, not driven here:
// - the header on a cached revisit or a restored page: the same render as a first open, from the same page data (the
//   restore of that data is display-store.test.ts's). A case is due if the header stops being drawn from the page.
// - a transfusion while a tooltip is open: the tooltip is drawn from the current page on every render. A case is due
//   if the tooltip keeps a copy of the page's data of its own.
// - a language switch while a tooltip is open: the language changes only on the settings page, which no session
//   page survives. A case is due when the language can change with a session page open (from a menu, say).
// - the overview card's route: it opens the page through the same shell call as the Sessions tab, from the same
//   project entry. A case is due if that route stops passing the project entry.
// - agent text drawn as text: the ID and the path reach the page only as React text nodes. A case is due if either
//   is ever rendered as markup.
test('the session page header: the session ID, copying it and the resume command, and showing the record file (session-view::US-001)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-resume-'))
  const proj = join(home, "it's demo")
  const stale = join(home, 'gone-proj') // registered, never created
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${stale}"]\ntrust_level = "trusted"\n`)
  const at = (d: number): string => localDayOffset(d).toISOString()
  const usage = (ts: string): string =>
    JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 50, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 9, total_tokens: 59 } } } })
  const q = (ts: string, message: string): string => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message } })

  const CLAUDE_ID = '6b3f2a10-4c5d-4e6f-8a7b-9c0d1e2f3a4b'
  const cdir = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(cdir, { recursive: true })
  const claudeFile = join(cdir, `${CLAUDE_ID}.jsonl`)
  writeFileSync(claudeFile, [
    JSON.stringify({ type: 'user', timestamp: at(1), message: { role: 'user', content: 'Claude resume question' } }),
    JSON.stringify({ type: 'assistant', timestamp: at(1), message: { model: 'claude-fable-5', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
  ].join('\n') + '\n')

  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })
  const CODEX_ID = '019fb0c0-1111-7af3-af7d-8505cedf1ec2'
  const codexFile = join(sdir, `rollout-2026-01-01T09-00-00-${CODEX_ID}.jsonl`)
  writeFileSync(codexFile, [JSON.stringify({ timestamp: at(2), type: 'session_meta', payload: { cwd: proj, id: CODEX_ID } }), q(at(2), 'Codex resume question'), usage(at(2))].join('\n') + '\n')
  const noIdFile = join(sdir, 'rollout-2026-01-01T10-00-00-noid.jsonl')
  writeFileSync(noIdFile, [JSON.stringify({ timestamp: at(3), type: 'session_meta', payload: { cwd: proj } }), q(at(3), 'Codex question with no id'), usage(at(3))].join('\n') + '\n')

  const GROK_ID = '019fd1e2-1042-7c12-94e9-15b9d0ad23ec'
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gdir = join(home, '.grok', 'sessions', encodeURIComponent(proj), GROK_ID)
  mkdirSync(gdir, { recursive: true })
  writeFileSync(join(gdir, 'summary.json'), JSON.stringify({ info: { id: GROK_ID, cwd: proj } }))
  const grokFile = join(gdir, 'updates.jsonl')
  const gts = Math.floor(localDayOffset(4).getTime() / 1000)
  writeFileSync(grokFile, JSON.stringify({ timestamp: gts, method: '_x.ai/session/update', params: { sessionId: 's', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Grok resume question' }, _meta: { promptIndex: 0 } } } }) + '\n')

  // The stale project: a parent and its fork replaying the parent's question (global-search.spec.ts's shape)
  const PARENT = '019fb0c0-aaaa-7af3-af7d-8505cedf1ec3'
  const CHILD = '019fb0c0-bbbb-7af3-af7d-8505cedf1ec3'
  const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: stale, id, ...extra } })
  writeFileSync(join(sdir, `rollout-${PARENT}.jsonl`), [meta(at(6), PARENT), q(at(6), 'Parent question in the gone project'), usage(at(6))].join('\n') + '\n')
  writeFileSync(join(sdir, `rollout-${CHILD}.jsonl`), [meta(at(5), CHILD, { forked_from_id: PARENT }), q(at(5), 'Parent question in the gone project'), q(at(5), 'Resume the stale fork please'), usage(at(5))].join('\n') + '\n')

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await l.app.evaluate(({ clipboard, shell }) => {
    const g = globalThis as unknown as { __copied: string[]; __revealed: string[]; __refuse: boolean }
    g.__copied = []
    g.__revealed = []
    g.__refuse = false
    clipboard.writeText = (text: string) => {
      if (g.__refuse) throw new Error('the clipboard refused it')
      g.__copied.push(text)
    }
    shell.showItemInFolder = (p: string) => {
      g.__revealed.push(p)
    }
  })
  const copied = (): Promise<string[]> => l.app.evaluate(() => (globalThis as unknown as { __copied: string[] }).__copied)
  const revealed = (): Promise<string[]> => l.app.evaluate(() => (globalThis as unknown as { __revealed: string[] }).__revealed)
  const btn = (act: string) => win.locator(`.pane-head .sact[data-act="${act}"]`)
  const tip = win.locator('[data-testid="session-tip"]')
  const away = (): Promise<void> => win.mouse.move(5, 5)
  const openRow = async (title: string): Promise<void> => {
    await win.locator('.pane-body .card .se', { hasText: title }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText(title)
  }
  const backToSessions = async (): Promise<void> => {
    await win.locator('.pane-head .sback').click()
    await expect(win.locator('.pane-body .card .se').first()).toBeVisible()
  }
  const quotedProj = `'${home}/it'\\''s demo'`

  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: "it's demo" }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // ── Claude Code: the ID in the meta line, the three buttons at the title row's right end (AC-01, AC-02) ──
  await openRow('Claude resume question')
  await expect(win.locator('.pane-head .smeta .sid-v')).toHaveText(CLAUDE_ID)
  await expect(win.locator('.pane-head .smeta')).toHaveText(new RegExp(`· Session ID ${CLAUDE_ID}$`))
  await expect(win.locator('.pane-head .sact')).toHaveCount(3)
  expect(await win.locator('.pane-head .sact').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label'))))
    .toEqual(['Copy session ID', 'Show the record file in Finder', 'Copy resume command'])
  const rowBox = await win.locator('.pane-head .det-title').boundingBox()
  const groupBox = await win.locator('.pane-head .sacts').boundingBox()
  if (rowBox === null || groupBox === null) throw new Error('title row or button group not rendered')
  expect(Math.abs(rowBox.x + rowBox.width - (groupBox.x + groupBox.width)), 'the buttons end at the title row\'s right').toBeLessThanOrEqual(1)

  // Each tooltip names its action on hover, and goes when the pointer leaves (AC-02)
  // "At once": within 500 ms, well under the native title's delay of about a second
  for (const [act, name] of [['id', 'Copy session ID'], ['reveal', 'Show the record file in Finder']] as const) {
    await btn(act).hover()
    await expect(tip).toHaveText(name, { timeout: 500 })
    await away()
    await expect(tip).toHaveCount(0)
  }
  // …and on keyboard focus: the case's window is not shown, so focus is emulated through the DevTools protocol
  const cdp = await win.context().newCDPSession(win)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await btn('reveal').focus()
  await expect(tip).toHaveText('Show the record file in Finder', { timeout: 500 })
  await btn('reveal').blur()
  await expect(tip).toHaveCount(0)

  // Copying the ID: exactly the ID, a check and "Copied" (AC-03, AC-06)
  await btn('id').hover()
  await btn('id').click()
  await expect.poll(copied).toEqual([CLAUDE_ID])
  await expect(btn('id')).toHaveClass(/\bdone\b/)
  await expect(tip).toHaveText('Copied')
  // The icon itself becomes the check (Lucide's check glyph) in place of the copy glyph (its rect)
  await expect(btn('id').locator('svg path')).toHaveAttribute('d', 'M20 6 9 17l-5-5')
  await expect(btn('id').locator('svg rect')).toHaveCount(0)
  // The check changes the icon and its colour only: with the pointer gone, its border is the resting one (the prototype)
  await away()
  const borders = await win.locator('.pane-head .sact').evaluateAll((bs) => bs.map((b) => getComputedStyle(b).borderTopColor))
  expect(borders[0], 'a copied button keeps the resting border').toBe(borders[1])
  await btn('id').hover()
  // A second copy within 1.5 s starts the 1.5 s again: timed in the page, the check outlives the first copy's
  // window (about 500 ms after the second click without a restart, about 1500 ms with one)
  await win.waitForTimeout(1000)
  await btn('id').click()
  const second = await win.evaluate(() => performance.now())
  const gone = await (await win.waitForFunction(
    () => !document.querySelector('.pane-head .sact[data-act="id"]')?.classList.contains('done') && performance.now(),
    null, { polling: 50, timeout: 5000 })).jsonValue()
  expect(Number(gone) - second, 'the check is held 1.5 s from the second copy').toBeGreaterThan(1000)
  await expect(btn('id').locator('svg rect')).toHaveCount(1)
  await expect(tip).toHaveText('Copy session ID')
  await expect.poll(copied).toEqual([CLAUDE_ID, CLAUDE_ID])

  // The resume command: in the tooltip in full, copied as it reads; no stale warning here (AC-04, AC-05, CON-002)
  const claudeCmd = `cd ${quotedProj} && claude --resume ${CLAUDE_ID}`
  await btn('resume').hover()
  await expect(tip.locator('.stip-cmd')).toHaveText(claudeCmd, { timeout: 500 })
  await expect(tip).toContainText('Copy resume command')
  await expect(tip.locator('.stip-warn')).toHaveCount(0)
  // Visible where it is, not only present: its own centre hit-tests to it (the floating-layer invariant in AGENTS.md)
  expect(await tip.evaluate((el) => {
    const box = el.parentElement as HTMLElement
    const r = box.getBoundingClientRect()
    box.style.pointerEvents = 'auto'
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    box.style.pointerEvents = 'none'
    return hit !== null && box.contains(hit) && r.right <= window.innerWidth && r.left >= 0
  })).toBe(true)
  await btn('resume').click()
  await expect.poll(copied).toEqual([CLAUDE_ID, CLAUDE_ID, claudeCmd])

  // Showing the record file hands Finder the session file (AC-07)
  await btn('reveal').click()
  await expect.poll(revealed).toEqual([claudeFile])
  await away()

  // ── Codex and Grok: their own IDs, commands and record files ──
  await backToSessions()
  await openRow('Codex resume question')
  await expect(win.locator('.pane-head .smeta .sid-v')).toHaveText(CODEX_ID)
  await btn('resume').hover()
  await expect(tip.locator('.stip-cmd')).toHaveText(`cd ${quotedProj} && codex resume ${CODEX_ID}`)
  await btn('reveal').click()
  await expect.poll(revealed).toEqual([claudeFile, codexFile])
  await away()

  await backToSessions()
  await openRow('Grok resume question')
  await expect(win.locator('.pane-head .smeta .sid-v')).toHaveText(GROK_ID)
  await btn('resume').hover()
  await expect(tip.locator('.stip-cmd')).toHaveText(`cd ${quotedProj} && grok --resume ${GROK_ID}`)
  await btn('reveal').click()
  await expect.poll(revealed).toEqual([claudeFile, codexFile, grokFile])
  await away()

  // ── A Codex record without an id: unavailable, the two buttons disabled with the reason, Finder still works (AC-09) ──
  await backToSessions()
  await openRow('Codex question with no id')
  await expect(win.locator('.pane-head .smeta')).toContainText('Session ID unavailable')
  await expect(win.locator('.pane-head .smeta .sid-v')).toHaveCount(0)
  await expect(btn('id')).toHaveAttribute('aria-disabled', 'true')
  await expect(btn('resume')).toHaveAttribute('aria-disabled', 'true')
  await expect(btn('reveal')).not.toHaveAttribute('aria-disabled', 'true')
  await btn('resume').hover()
  await expect(tip).toHaveText('This session’s ID could not be read')
  const before = (await copied()).length
  await btn('id').click({ force: true })
  await btn('resume').click({ force: true })
  // Finder's call comes after the two clicks on the same renderer, so once it is recorded no copy is still on its way
  await btn('reveal').click()
  await expect.poll(revealed).toEqual([claudeFile, codexFile, grokFile, noIdFile])
  expect(await copied()).toHaveLength(before)
  await away()

  // ── Failures: a refused clipboard and a vanished file, each the error toast (AC-10) ──
  await backToSessions()
  await openRow('Codex resume question')
  await l.app.evaluate(() => { (globalThis as unknown as { __refuse: boolean }).__refuse = true })
  const refusedAt = Date.now()
  await btn('id').click()
  await expect(win.locator('.toast.err', { hasText: 'Copy failed: the clipboard refused it' })).toBeVisible()
  // Read once, inside the 1.5 s a wrongly shown check would last: a retried "not" passes once such a check has gone
  const refusedClass = await btn('id').getAttribute('class')
  if (Date.now() - refusedAt >= 1500) throw new Error('the toast arrived after a check would have gone: this read proves nothing')
  expect(refusedClass, 'a refused copy shows no check').not.toMatch(/\bdone\b/)
  await l.app.evaluate(() => { (globalThis as unknown as { __refuse: boolean }).__refuse = false })
  rmSync(codexFile)
  await btn('reveal').click()
  await expect(win.locator('.toast.err', { hasText: 'Cannot show it in Finder: The session file can no longer be read' })).toBeVisible()
  expect(await revealed()).toHaveLength(4)
  await away()

  // ── A stale project from global search, and the fork parent reached from it: copied, with the cd warning (AC-08) ──
  await win.locator('.rail .ri').nth(2).click()
  await win.locator('.gsearch .sbar input').fill('stale fork')
  await win.locator('.gsearch .pane-body .hit', { hasText: 'Resume the stale fork please' }).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Resume the stale fork please', { timeout: 10000 })
  const staleWarning = 'The project directory no longer exists, so this command’s cd will fail'
  await btn('resume').hover()
  await expect(tip.locator('.stip-cmd')).toHaveText(`cd '${stale}' && codex resume ${CHILD}`)
  await expect(tip.locator('.stip-warn')).toHaveText(staleWarning)
  // A copy here does not follow the jump to the parent: its check belongs to this page's button (AC-06). Read once,
  // inside the check's 1.5 s, since a retried "not" would pass anyway once the check has gone by itself
  await btn('resume').click()
  await expect(btn('resume')).toHaveClass(/\bdone\b/)
  const copiedAt = Date.now()
  await away()
  await win.locator('.pane-body .banner a').click()
  await expect(win.locator('.pane-head .smeta .sid-v')).toHaveText(PARENT)
  const parentClass = await btn('resume').getAttribute('class')
  if (Date.now() - copiedAt >= 1500) throw new Error('the parent page arrived after the check would have gone: this read proves nothing')
  expect(parentClass, 'the parent page\'s button carries no check from the child page').not.toMatch(/\bdone\b/)
  await btn('resume').hover()
  await expect(tip.locator('.stip-warn')).toHaveText(staleWarning)
  await btn('resume').click()
  await expect.poll(async () => (await copied()).at(-1)).toBe(`cd '${stale}' && codex resume ${PARENT}`)

  // The two handler errors this case provokes on purpose, and nothing else
  expect(l.errors).toHaveLength(2)
  expect(l.errors.some((e) => e.includes('the clipboard refused it'))).toBe(true)
  expect(l.errors.some((e) => e.includes(ERR.sessionFileUnreadable))).toBe(true)
  await close(l)
})

/**
 * Ticket antigravity-side/#324: a folder agy trusts, holding the measured conversations (agy-transcript-fixture.ts) —
 * a conversation of four questions; a fork of it, rewound once, whose database holds the parent's steps copied (their
 * source naming the parent, as agy writes them) and a call of its own; a fork whose source conversation is gone; a
 * dispatching conversation and its subagent; and the conversation agy creates when opened and left. Titles from agy's
 * summaries for the first and the dispatcher; the forks have none.
 */
function mkAntigravitySessionsHome(): { home: string; proj: string; parent: string; fork: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agysess-'))
  const proj = join(home, 'agy-sessions')
  mkdirSync(proj, { recursive: true })
  const agy = join(home, '.gemini', 'antigravity-cli')
  const conversations = join(agy, 'conversations')
  mkdirSync(conversations, { recursive: true })
  writeFileSync(join(agy, 'settings.json'), settingsJson([proj]))
  const ID = MEASURED_TRANSCRIPT_ID
  const record = (id: string, extra: Partial<Parameters<typeof encodeTrajectoryMetadata>[0]> = {}): Uint8Array =>
    encodeTrajectoryMetadata({ folders: [proj], conversationId: id, ...extra })
  const callOf = (conversationId: string, stepIdx: number, genIdx: number, messageId: string, daysAgo: number): ReturnType<typeof callRecord> =>
    callRecord({
      conversationId,
      stepIdx,
      genIdx,
      usage: { messageId, input: 1000, output: 100 },
      createdAt: localDayOffset(daysAgo).getTime() - 5_000,
      completedAt: localDayOffset(daysAgo).getTime(),
      responseModel: 'gemini-3.6-flash'
    })
  const copied = [callOf(ID.main, 1, 0, 'e-p1', 3), callOf(ID.main, 3, 1, 'e-p2', 3)]
  const write = (id: string, rec: Uint8Array, calls: Array<ReturnType<typeof callRecord>>, lines?: readonly string[]): string => {
    const { file } = writeConversation(conversations, id, rec, { steps: calls.map((c) => c.step), gens: calls.map((c) => c.gen) })
    if (lines) writeTranscript(agy, id, lines)
    return file
  }
  const parent = write(ID.main, record(ID.main), copied, MEASURED_TRANSCRIPT.main)
  const fork = write(ID.forkRewound, record(ID.forkRewound), [...copied, callOf(ID.forkRewound, 19, 2, 'e-f1', 1)], MEASURED_TRANSCRIPT.forkRewound)
  // A fork whose source conversation is no longer here: its copied steps name a database that does not exist
  const gone = 'a7c3e9f1-0b2d-4e6f-8a1c-3d5e7f9b1c2a'
  const goneSource = 'f0e1d2c3-b4a5-4968-8776-655443322110'
  const question = JSON.stringify({ step_index: 19, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-10-28T08:30:00Z', content: '<USER_REQUEST>\nWhat does percent(1, 4) return now?\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-10-28T16:30:00+08:00.\n</ADDITIONAL_METADATA>' })
  const answer = JSON.stringify({ step_index: 20, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-28T08:30:05Z', input_tokens: 1000, cache_read_tokens: 0, output_tokens: 100, content: 'It returns `25.0`.' })
  write(gone, record(gone), [callOf(goneSource, 1, 0, 'e-g0', 2), callOf(gone, 19, 1, 'e-g1', 2)], [question, answer])
  write(ID.dispatch, record(ID.dispatch), [callOf(ID.dispatch, 1, 0, 'e-d1', 4)], MEASURED_TRANSCRIPT.dispatch)
  write(ID.subagent, record(ID.subagent, { parentConversationId: ID.dispatch, nestingDepth: 1, subagentSpec: true }), [callOf(ID.subagent, 1, 0, 'e-s1', 4)], MEASURED_TRANSCRIPT.subagent)
  write('438a6b76-5f66-490d-8506-613ed88f6d68', record('438a6b76-5f66-490d-8506-613ed88f6d68'), [])
  writeSummaries(agy, [
    { id: ID.main, title: MEASURED_TITLE[ID.main] },
    { id: ID.dispatch, title: MEASURED_TITLE[ID.dispatch] },
    { id: ID.forkRewound, title: '' }
  ])
  return { home, proj, parent, fork }
}

// session-view::REQ-003/AC-06, REQ-004/AC-04, REQ-005/AC-01, AC-04, AC-05, US-001/AC-01, AC-04, AC-07 (the Antigravity
// clauses), project-detail::REQ-002/AC-04 (Sessions), global-search::REQ-001: an Antigravity user's sessions along the
// user's path, in one launch. Finder's call and the clipboard are intercepted at the main process's Electron boundary,
// as the session header case does, so the run neither opens Finder nor overwrites the clipboard.
test('Antigravity sessions: AG rows and forks, a fork\'s page with its banner, header and turn, its parent, a gone source, and global search', async () => {
  const { home, proj, parent, fork } = mkAntigravitySessionsHome()
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await l.app.evaluate(({ clipboard, shell }) => {
    const g = globalThis as unknown as { __copied: string[]; __revealed: string[] }
    g.__copied = []
    g.__revealed = []
    clipboard.writeText = (text: string) => {
      g.__copied.push(text)
    }
    shell.showItemInFolder = (p: string) => {
      g.__revealed.push(p)
    }
  })
  const copied = (): Promise<string[]> => l.app.evaluate(() => (globalThis as unknown as { __copied: string[] }).__copied)
  const revealed = (): Promise<string[]> => l.app.evaluate(() => (globalThis as unknown as { __revealed: string[] }).__revealed)
  const btn = (act: string) => win.locator(`.pane-head .sact[data-act="${act}"]`)
  const tip = win.locator('[data-testid="session-tip"]')
  const forkTitle = 'In one short sentence, which function in calc.py is the simp…'
  const FORK_ID = MEASURED_TRANSCRIPT_ID.forkRewound

  // The Sessions tab: four AG rows, newest first — the subagent and the opened-and-left conversation have none; the
  // two forks carry the fork pill, whose tooltip names the copied history
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'agy-sessions' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  const rows = win.locator('.pane-body .card .se')
  await expect(rows.locator('.t')).toHaveText([forkTitle, 'What does percent(1, 4) return now?', 'Explaining Calc.py Functionality', 'List Calc.py Function Names'])
  await expect(rows.locator('.badge.ag')).toHaveText(['AG', 'AG', 'AG', 'AG'])
  await expect(rows.locator('.n')).toHaveText(['1 question', '1 question', '4 questions', '1 question'])
  await expect(rows.nth(0).locator('.pill.fork')).toHaveAttribute('title', 'This session was forked from another; the copied history has been stripped')
  await expect(rows.nth(1).locator('.pill.fork')).toHaveCount(1)
  expect(await rows.locator('.pill.fork').count()).toBe(2)

  // The fork's page: its banner names its parent, linked; the meta line and the conversation ID
  await rows.nth(0).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText(forkTitle)
  await expect(win.locator('.pane-head .det-title .badge.ag')).toHaveText('AG')
  await expect(win.locator('.pane-head .smeta')).toContainText('Antigravity · 1 question ·')
  await expect(win.locator('.pane-head .smeta .sid-v')).toHaveText(FORK_ID)
  // The byte figure is the fork's database's size — the record file Finder shows — not its transcript's: each written
  // as the meta line writes a size in KB, and the two told apart
  const kb = (file: string): string => `${(statSync(file).size / 1024).toFixed(1)} KB`
  const forkTranscript = transcriptFile(join(home, '.gemini', 'antigravity-cli'), FORK_ID)
  expect(kb(fork)).not.toBe(kb(forkTranscript))
  await expect(win.locator('.pane-head .smeta')).toContainText(` tok · ${kb(fork)} · last active`)
  const banner = win.locator('.pane-body .banner.info')
  await expect(banner).toHaveText(
    'This session was forked from “Explaining Calc.py Functionality”— the copied history has been stripped, so only what follows this fork is shown below. See that session for the earlier history.'
  )
  await expect(banner.locator('a')).toHaveText('“Explaining Calc.py Functionality”')

  // Its one question — the rewind's undone question takes no row — and its turn: the thinking block and the prose,
  // whose markdown link to a workspace file is plain text
  const q = win.locator('.pane-body .q')
  await expect(q.locator('.txt')).toHaveText(['In one short sentence, which function in calc.py is the simplest?'])
  await q.first().click()
  const turn = win.locator('.pane-body .turn')
  await expect(turn.locator('.blk.think .nm')).toHaveText('Thinking')
  await expect(turn.locator('.ans')).toContainText('[`calc.py`](file:///Users/sample/work/agy-fixture-project-x12/calc.py)')
  expect(await turn.locator('.ans a').count()).toBe(0)

  // The header: the conversation ID copied, the agy resume command copied, and Finder handed the database
  await btn('id').click()
  await expect.poll(copied).toEqual([FORK_ID])
  await btn('resume').hover()
  const cmd = `cd '${proj}' && agy --conversation ${FORK_ID}`
  await expect(tip.locator('.stip-cmd')).toHaveText(cmd)
  await btn('resume').click()
  await expect.poll(copied).toEqual([FORK_ID, cmd])
  await btn('reveal').click()
  await expect.poll(revealed).toEqual([fork])
  await win.mouse.move(5, 5)

  // The banner's link opens the parent: its first turn shows a tool call and thinking
  await banner.locator('a').click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Explaining Calc.py Functionality')
  await expect(win.locator('.pane-head .smeta .sid-v')).toHaveText(MEASURED_TRANSCRIPT_ID.main)
  await expect(win.locator('.pane-body .banner')).toHaveCount(0)
  await win.locator('.pane-body .q', { hasText: 'In one sentence, what does calc.py in this folder do?' }).click()
  await expect(win.locator('.pane-body .turn .blk .nm')).toHaveText(['read_file', 'Thinking'])
  await btn('reveal').click()
  await expect.poll(revealed).toEqual([fork, parent])

  // The fork whose source is gone: the banner says so, with nothing to follow
  await win.locator('.pane-head .sback').click()
  await rows.nth(1).click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('What does percent(1, 4) return now?')
  await expect(win.locator('.pane-body .banner.info')).toHaveText(
    'This session was forked from a session that is no longer on this machine — the copied history has been stripped, so only what follows this fork is shown below.'
  )
  expect(await win.locator('.pane-body .banner a').count()).toBe(0)

  // Global search: the fork's group wears AG and the fork pill; the parent's question hits too
  await win.locator('.rail .ri').nth(2).click()
  await win.locator('.gsearch .sbar input').fill('simplest')
  const card = (title: string) => win.locator('.gsearch .grp', { has: win.locator('.gh .t', { hasText: title }) })
  await expect(card(forkTitle).locator('.hit')).toHaveCount(1)
  await expect(card(forkTitle).locator('.gh .badge.ag')).toHaveText('AG')
  await expect(card(forkTitle).locator('.gh .pill.fork')).toHaveCount(1)
  await expect(card('Explaining Calc.py Functionality').locator('.hit')).toHaveText(/In one short sentence, which test in test_calc\.py is the simplest\?/)
  await expect(card('Explaining Calc.py Functionality').locator('.gh .pill')).toHaveCount(0)
  // The rewind's undone question is not searched: the no-hit line, read once it has replaced the results
  await win.locator('.gsearch .sbar input').fill('exactly one word')
  await expect(win.locator('.gsearch .pane-body .shead')).toContainText('No hits.')
  expect(await win.locator('.gsearch .grp').count()).toBe(0)

  expect(l.errors).toEqual([])
  await close(l)
})
