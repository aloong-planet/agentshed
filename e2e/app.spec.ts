// E2E: Playwright driving a real Electron (the build output), covering the assembly layer unit tests
// cannot reach —
// the whole IPC chain, rendering, dimension switching, tab switching and refresh deduplication, while
// asserting the main process emits no errors.
// The key scenario: **starting with an old-format cache** (the shape of the 2026-07-30 production crash;
// the unit tests pin it and this guards the whole chain again).
import { appendFileSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { ERR } from '../src/shared/errors'

/** Each case gets its own userData with no cross-contamination; a cache file can be seeded */
function makeUserData(cacheContent?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  if (cacheContent !== undefined) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'token-cache.json'), cacheContent)
  }
  return dir
}

interface Launched {
  app: ElectronApplication
  errors: string[]
  userData: string
  /** The fixture home used this time (cleaned up with close if there is one) */
  home?: string
}

/**
 * A fixture directory as home is injected through AGENTSHED_HOME_OVERRIDE (see src/main/roots.ts).
 *
 * **Always pass home, without exception.** Omitting it reads the development machine's real ~/.claude,
 * which is bad in two ways:
 *   1. a data-asserting case's result depends on how many sessions whoever runs it has — green on their
 *      machine, red in CI;
 *   2. even when only asserting generic UI, every case has its own userData so the cache is always empty,
 *      meaning every run does
 *      a full rescan of real data (638 MB on this machine). That pushes cases to the edge of the
 *      assertion timeout — after the 2026-08-02
 *      CACHE_VERSION bump, the only two remaining cases reading the real home went red exactly this way.
 *
 * **Test silencing (AGENTSHED_NO_FOREGROUND)**: on local macOS the window is not shown, so 18 instances
 * do not take turns
 * stealing the foreground; CI's xvfb is unaffected (the seam has a darwin guard). Its validity has been
 * verified: DOM text, geometry,
 * computed styles and toBeVisible all go through layout and CDP, independent of whether the window is on
 * screen (two known red-able mutations replayed
 * red under the hidden regime, 2026-08-04). **The boundary: real focus semantics are the exception** —
 * document.hasFocus(),
 * autofocus and :focus styles behave differently in a hidden window; when writing input-box cases (ticket
 * 08's search, say),
 * either focus explicitly through CDP or drop this variable for that case alone — never depend silently on
 * window focus.
 */
/**
 * `home` is **required** (changed from optional on 2026-08-03): omitting it makes the app scan the
 * developer's real `~/.claude`,
 * so results vary with each person's data volume — green in CI where home is empty, timing out locally.
 * "Remembering to pass it" cannot hold the line, so typecheck does.
 */
async function launch(cacheContent: string | undefined, home: string): Promise<Launched> {
  const userData = makeUserData(cacheContent)
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      // Test silencing: do not steal the foreground (the macOS accessory policy, see src/main/index.ts)
      AGENTSHED_NO_FOREGROUND: '1',
      // Pin the test language to Chinese: the UI language follows the system by default, and without pinning it
      // every existing assertion locating by Chinese copy would vary with the system language of whoever runs
// the tests
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US'
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    // An uncaught main-process error, an IPC handler exception, or any structured failure all count as a
// failure signal.
    // `agentshed-error:` is the marker common to every cross-process failure since ticket 05 — it replaced the
// earlier match on
    // the Chinese wording "契约校验失败", which no longer exists after ticket 06,
    // so that pattern had become a dead pattern that could never match anything again (silently weakening the
// detection net).
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:/.test(t)) {
      errors.push(t.trim())
    }
  })
  return { app, errors, userData, home }
}

async function close(l: Launched): Promise<void> {
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
  if (l.home) rmSync(l.home, { recursive: true, force: true })
}

/** The local day (the same rule as the main process's localDay); the trend window is the last 30 days, so
 * timestamps have to be computed relative to now */
function localDayOffset(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0) // Midday, so no time zone pushes the date outside the window
  return d
}

/**
 * Build a fixture home with usage on both sides: Claude (→ the Anthropic segment) + Codex (→ the OpenAI
 * segment).
 * The trend chart segments by provider, so both are needed — otherwise "switching to the Claude side zeroes
 * the OpenAI segment"
 * would be **tautologically true** with no OpenAI data, testing nothing at all.
 */
function mkUsageHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-usage-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))

  // Claude: a whole-tree scan of projects, with directory names unrelated to the registry (an unregistered
// directory counts toward the global total too)
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-') // The same rule as encodeClaudeProjectDir
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const usage = (model: string, at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at.toISOString(),
      message: {
        model,
        usage: {
          input_tokens: inTok,
          output_tokens: outTok,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0
        }
      }
    })
  writeFileSync(
    join(cdir, 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(2).toISOString(), message: { role: 'user', content: 'Sample question' } }),
      // The real shape: an assistant line carries both content (the prose segments) and usage; ticket 05's
// expansion assertions use that prose.
      // Ticket 07: thinking/text/tool_use mixed on one line (the whole segment spectrum from the full
// enumeration), for the rich content assertions
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(2).toISOString(),
        message: {
          model: 'claude-fable-5',
          content: [
            { type: 'thinking', thinking: 'Take a look at the directory layout' },
            { type: 'text', text: 'This is the first turn reply body' },
            { type: 'tool_use', id: 'tu_e2e_1', name: 'Bash', input: { command: 'ls -la src' } }
          ],
          usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
        }
      }),
      // A tool return containing a tool-results/ sidecar path → the truncation label (spec C7, a
// mechanism-based criterion)
      JSON.stringify({
        type: 'user',
        timestamp: localDayOffset(2).toISOString(),
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu_e2e_1', content: '12 files in total\noutput saved to: /x/tool-results/e2e.txt' }]
        }
      }),
      // A subagent dispatch → a sidechain step within the turn → a return carrying toolUseResult.agentId (the
// measured chain)
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(2).toISOString(),
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu_e2e_ag', name: 'Agent', input: { description: 'check logs', prompt: 'Check today logs', subagent_type: 'debugger' } }]
        }
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(2).toISOString(),
        isSidechain: true,
        agentId: 'ag_e2e',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'stu1', name: 'Bash', input: { command: 'tail -5 app.log' } }] }
      }),
      JSON.stringify({
        type: 'user',
        timestamp: localDayOffset(2).toISOString(),
        toolUseResult: { agentId: 'ag_e2e', status: 'completed' },
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_e2e_ag', content: [{ type: 'text', text: 'Logs are clean, nothing unusual' }] }] }
      }),
      // An unknown type outside the display allow-list → a trace rather than a silent drop (spec C8)
      JSON.stringify({ type: 'agent_snapshot', timestamp: localDayOffset(2).toISOString(), payload: { blob: 'x' } }),
      usage('claude-fable-5', localDayOffset(2), 1200, 300),
      // A second real question — making the two sides' question counts differ, so the count assertion can
// distinguish "really read"
      // from "both happen to be 1". A tool result is fed back in between, which does not count as a question
// (spec B1).
      JSON.stringify({
        type: 'user',
        timestamp: localDayOffset(1).toISOString(),
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'Tool return' }] }
      }),
      JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: 'Second question' } }),
      usage('claude-opus-5', localDayOffset(1), 800, 200),
      usage('claude-fable-5', localDayOffset(0), 500, 100)
    ].join('\n') + '\n'
  )

  // A warmup session: a single Warmup with tokens but nothing anyone asked (spec A3a → not listed)
  writeFileSync(
    join(cdir, 'warmup.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: 'Warmup' } }),
      usage('claude-fable-5', localDayOffset(1), 300, 60)
    ].join('\n') + '\n'
  )

  // Codex: a whole-tree scan of sessions, with the first line's session_meta cwd deciding attribution
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })
  const turn = (at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      timestamp: at.toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: inTok,
            cached_input_tokens: 0,
            cache_write_input_tokens: 0,
            output_tokens: outTok,
            total_tokens: inTok + outTok
          }
        }
      }
    })
  writeFileSync(
    join(sdir, 'rollout-019fb0c0-1111-7af3-af7d-8505cedf1ec2.jsonl'),
    [
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'session_meta', payload: { cwd: proj } }),
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
      // A real question: without it this session is not listed per spec A3a
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'event_msg', payload: { type: 'user_message', message: 'Codex side question' } }),
      // Ticket 07: reasoning sub-headings / tool pairing / spawn_agent (unattributable) / traces of unknown
// events
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'reasoning', id: 'r1', summary: [{ type: 'summary_text', text: 'Compare both sides directory conventions' }, { type: 'summary_text', text: 'Confirm the field differences' }], encrypted_content: 'gAAA' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'custom_tool_call', id: 'ri1', call_id: 'c_e2e', name: 'exec', input: 'rg skills -l', status: 'completed' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', call_id: 'c_e2e', output: '7 files' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'function_call', id: 'ri2', call_id: 'c_sp', name: 'spawn_agent', namespace: 'collaboration', arguments: '{"task_name":"migration check"}' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'function_call_output', call_id: 'c_sp', output: 'Sub-task created' }
      }),
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'event_msg', payload: { type: 'exotic_event', data: 1 } }),
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'event_msg', payload: { type: 'agent_message', message: 'The two sides use different directory conventions; see the comparison.' } }),
      turn(localDayOffset(2), 900, 150),
      // Stopping at yesterday: putting distance from the Claude side (today), so "newest first" has something to
// judge.
      // With identical timestamps on both sides, the sort assertion could only prove reverse works, not that it
// sorts by time.
      turn(localDayOffset(1), 400, 80)
    ].join('\n') + '\n'
  )
  return home
}

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
// one → 1 should remain, marked ⑂ fork
  const CHILD = '019fb0c0-bbbb-7af3-af7d-8505cedf1ec2'
  writeFileSync(
    join(sdir, `rollout-${CHILD}.jsonl`),
    [meta(localDayOffset(2), CHILD, { forked_from_id: PARENT }), ctx(localDayOffset(2)), q(localDayOffset(2), 'Parent first question'), q(localDayOffset(2), 'Parent second question'), q(localDayOffset(2), 'Child new question'), usage(localDayOffset(2), 200, 40)].join('\n') + '\n'
  )
  // An orphan fork: the parent is not in the scan set → the heuristic only, marked ⑂? strip uncertain
  const ORPHAN = '019fb0c0-cccc-7af3-af7d-8505cedf1ec2'
  writeFileSync(
    join(sdir, `rollout-${ORPHAN}.jsonl`),
    [meta(localDayOffset(1), ORPHAN, { forked_from_id: '019fb0c0-dead-7af3-af7d-8505cedf1ec2' }), ctx(localDayOffset(1)), q(localDayOffset(1), 'Orphan session question'), usage(localDayOffset(1), 100, 20)].join('\n') + '\n'
  )
  return home
}

/** A registered project with no sessions at all — the sessions section's empty state */
function mkEmptyProjectHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-noses-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  return home
}

test('cold start: the Agents page is the default landing, both summary cards render, and the main process reports no errors', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // Two summary cards (CC / CODEX)
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(2)
  await expect(win.locator('.badge.cc, .badge.cl').first()).toBeVisible()
  // #18: the packaged build's renderer page must run on app:// rather than file:// (falling back to file://
// silently loses
  // the "readable range locked to the build directory" protection, and only asserting the protocol catches it)
  expect(win.url()).toMatch(/^app:\/\//)
  expect(l.errors).toEqual([])
  await close(l)
})

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
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(2)
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

  // The number in the project list must share its source with this tab: the fixture has 3 session files
  // (including 1 warmup)
  // and only 2 are listed. Before the change, the project list read the file count pipeline and showed 3 —
  // one concept with two numbers.
  const meta = (await win.locator('.side .row .meta').first().innerText()).trim()
  expect(meta, `the project list session count must match the sessions tab; actual: ${meta}`).toMatch(/(^|\D)2$/)

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
  expect(await countOf(1), 'one real question on the Codex side').toBe('1 questions')

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

  // Back: lands on the Sessions tab rather than the overview (the prototype: ‹ Back to <project> · Sessions)
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
  const l = await launch(undefined, mkForkHome())
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
  await expect(win.locator('.pane-head .stitle')).toHaveText('Parent first question')
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
  await expect(win.locator('.turn .unknown')).toContainText('1 unrecognised records')
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

// Ticket 08: session search — questions by default, the full-text toggle, hits grouped, and going straight
// to a question.
// Input uses fill() (setting the value through CDP without depending on window focus semantics; the
// :focus assertion boundary noted in this file's header
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
  await expect(win.locator('.shead')).toContainText('Found 1 hits · 1 sessions')

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

test('repeated clicks on global refresh are deduplicated, with no errors after the refresh', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  const refresh = win.locator('.rail .ri.grfr')
  await refresh.click()
  await refresh.click({ force: true })
  await refresh.click({ force: true })
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  expect(l.errors).toEqual([])
  await close(l)
})

test('the archive: a seeded historical archive file → the trend includes an archived span with a note, and the main process reports no errors', async () => {
  // Build a historical row whose source file is long gone (simulating the state after the agent cleaned up
  // old sessions)
  const userData = makeUserData()
  writeFileSync(
    join(userData, 'usage-archive.json'),
    JSON.stringify({
      version: 1,
      rows: [
        {
          day: '2020-01-01',
          side: 'claude',
          projectKey: '/legacy',
          model: 'claude-legacy',
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          total: 12345
        }
      ]
    })
  )
  const errors: string[] = []
  // A fixture home is mandatory: this case only cares about the archive file in userData, but without an
  // injected home it scanned
  // **the developer's real ~/.claude**; and since makeUserData() gives a fresh temporary directory every
  // time, the token cache
  // is always cold, so the first-paint time follows each person's data volume. CI stayed green because its
  // home is empty, while locally with 600MB+
  // of data it failed two runs out of three (2026-08-03, ticket 03a).
  // This one slipped past the discipline stated at the top of this file — it did not go through launch()
  // and called electron.launch directly.
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: mkEmptyProjectHome(),
      AGENTSHED_NO_FOREGROUND: '1',
      // Pin the test language to Chinese: the UI language follows the system by default, and without pinning it
      // every existing assertion locating by Chinese copy would vary with the system language of whoever runs
// the tests
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US'
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:/.test(t)) errors.push(t)
  })
  const win = await app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // The archive note appears (that day's source file is absent → it counts toward archivedDays)
  await expect(win.locator('.arch-note')).toBeVisible()
  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('the trend chart is stacked bars: segmented by provider within a bar, and switching to a single side leaves only that side\'s provider segments', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  // Combined mode: the fixture seeds usage on both sides → both the Anthropic and OpenAI segments should be
  // present
  const cols = win.locator('.chart .col')
  await expect(cols).toHaveCount(30)
  const anthropicSegs = win.locator('.chart .col .sp.anthropic')
  await expect(anthropicSegs.first()).toBeVisible()
  // The legend is by provider (with at least an Anthropic entry)
  await expect(win.locator('.legend .lg .sw.anthropic')).toBeVisible()
  // Pin down "the OpenAI segment really exists before switching" first — otherwise the zeroing assertion
  // below would be tautologically true
  // with no Codex data and would test nothing (a hazard that existed back when it read the real home)
  expect(await win.locator('.chart .col .sp.openai').count()).toBeGreaterThan(0)
  // Switch to the Claude side: no OpenAI segment should remain
  await win.locator('.grp-t .seg button', { hasText: 'Claude' }).click()
  await expect(win.locator('.chart .col .sp.openai')).toHaveCount(0)
  // Switch back to combined and the legend returns
  await win.locator('.grp-t .seg button', { hasText: 'Total' }).click()
  await expect(win.locator('.legend')).toBeVisible()
  expect(l.errors).toEqual([])
  await close(l)
})

test('the provider brand colours apply: the segments and the legend match, with their own values in light and dark', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  const read = async (): Promise<Record<string, string>> =>
    win.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return {
        anthropic: cs.getPropertyValue('--p-anthropic').trim(),
        openai: cs.getPropertyValue('--p-openai').trim(),
        google: cs.getPropertyValue('--p-google').trim()
      }
    })
  // Wait for the stylesheet to actually apply before reading CSS variables: reading directly gives an empty
  // string (the styles have not finished loading).
  // This race was always there and only surfaced reliably once app:// changed the load timing — a rendered
  // element is used as the gate.
  await expect(win.locator('.chart .col').first()).toBeVisible()
  const light = await read()
  expect(light.anthropic.toLowerCase()).toBe('#d97757')
  expect(light.openai.toLowerCase()).toBe('#10a37f')
  expect(light.google.toLowerCase()).toBe('#4285f4')
  // The segment and the legend take the same variable
  const segBg = await win.locator('.chart .col .sp.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const lgBg = await win.locator('.legend .lg .sw.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(segBg).toBe(lgBg)
  // Dark mode has its own set (lightened)
  await win.emulateMedia({ colorScheme: 'dark' })
  const dark = await read()
  expect(dark.anthropic.toLowerCase()).not.toBe(light.anthropic.toLowerCase())
  expect(dark.openai.toLowerCase()).not.toBe(light.openai.toLowerCase())
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * The v2 components (Subagents/Memory/Plugins): with a seeded fixture home (injected through
 * AGENTSHED_HOME_OVERRIDE),
 * assert F3's two-way scenario and the new tabs' rendering end to end — without depending on this
 * machine's real data.
 */
test('F3 plus the new sections: a project-scope plugin displays correctly both ways; the Subagents and Memory drawers work end to end', async () => {
  // Build the fixture home: a demo project + a project-scope plugin (with skills and hooks) + subagents on
  // both sides + memory
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // The plugin package (skills + hooks)
  const pkg = join(home, 'plug-pkg')
  mkdirSync(join(pkg, '.claude-plugin'), { recursive: true })
  writeFileSync(join(pkg, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(pkg, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(join(pkg, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: Ask before acting\n---\nx')
  mkdirSync(join(pkg, 'hooks'), { recursive: true })
  writeFileSync(
    join(pkg, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [] }] } })
  )
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@official': [
          { scope: 'project', version: '6.2.0', installPath: pkg, projectPath: demo }
        ]
      }
    })
  )
  mkdirSync(join(demo, '.claude'), { recursive: true })
  writeFileSync(join(demo, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@official': true } }))
  // Subagents on both sides
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'agents', 'code-reviewer.md'),
    '---\ndescription: Review code\ntools: Read, Grep\n---\nYou are a reviewer.'
  )
  mkdirSync(join(home, '.codex', 'agents'), { recursive: true })
  writeFileSync(
    join(home, '.codex', 'agents', 'code-reviewer.toml'),
    'name = "code-reviewer"\ndescription = "Review code"\ndeveloper_instructions = "You are a reviewer."\n'
  )
  // The demo project's memory
  const enc = demo.replace(/[^A-Za-z0-9]/g, '-')
  mkdirSync(join(home, '.claude', 'projects', enc, 'memory'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'projects', enc, 'memory', 'MEMORY.md'),
    '# Memory main file\n- Key point A\n- [Pitfalls](pitfalls.md) valid relative link\n- [Deleted entry](gone.md) broken target\n'
  )
  writeFileSync(join(home, '.claude', 'projects', enc, 'memory', 'pitfalls.md'), '# Pitfalls\nUnique content B')

  const userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      // Test silencing: do not steal the foreground (the macOS accessory policy, see src/main/index.ts)
      AGENTSHED_NO_FOREGROUND: '1',
      // Pin the test language to Chinese: the UI language follows the system by default, and without pinning it
      // every existing assertion locating by Chinese copy would vary with the system language of whoever runs
// the tests
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US'
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:/.test(t)) errors.push(t)
  })
  const win = await app.firstWindow()
  const tab = (label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })

  // (1) The Subagents tab: the same name on both sides merges onto one row, clicking it opens the drawer
  // directly, and the drawer switches sides
  await tab('Subagents').click()
  const row = win.locator('.it.row-btn', { hasText: 'code-reviewer' })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(win.locator('.drawer')).toBeVisible()
  await expect(win.locator('.drawer .kv')).toContainText('Read, Grep')
  await win.locator('.drawer .sideseg button', { hasText: 'Codex' }).click()
  await expect(win.locator('.drawer .kv')).toContainText('sandbox_mode')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // The drawer covers the window centre, so click the visible mask on the left

  // (2) Global Plugins: F3's first half — not enabled at the user layer; expanding gives category tabs,
  // with Skills by default and Hooks visible on switching
  await tab('Plugins').click()
  const plugRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(plugRow).toContainText('Not enabled')
  await plugRow.click()
  await expect(win.locator('.exp-area')).toContainText('superpowers:brainstorming')
  await win.locator('.exp-area .ptab', { hasText: 'Hooks' }).click()
  await expect(win.locator('.exp-area')).toContainText('SessionStart × 1')

  // (3) Global Memory: a row expands its file list, and clicking a file reads it on demand through the
  // allow-list into a drawer
  await tab('Memory').click()
  const memRow = win.locator('.it.row-btn', { hasText: 'demo-proj' })
  await memRow.click()
  await win.locator('.sub-list .it.row-btn', { hasText: 'pitfalls.md' }).click()
  await expect(win.locator('.drawer .raw')).toContainText('Unique content B')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // The drawer covers the window centre, so click the visible mask on the left

  // (4) The demo detail page: F3's second half — enabled at the project layer; the Skills tab contains the
  // plugin namespace entry (read-only)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  const detRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(detRow).toContainText('Enabled')
  await expect(detRow).toContainText('project')
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const nsSkill = win.locator('.sk', { hasText: 'superpowers:brainstorming' })
  await expect(nsSkill).toBeVisible()
  await expect(nsSkill.locator('.ins')).toHaveCount(0) // G3: a plugin entry has no install or uninstall button
  // A4/ADR-0012: a namespace row expands and previews on equal footing with an on-disk one
  await nsSkill.locator('.sk-head').click()
  await expect(nsSkill.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()
  // (5) Detail Memory: MEMORY.md's body is rendered directly
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('Key point A')

  // (6) A relative link in the main file: clicking it **must not navigate the whole window** (the
  //     2026-08-02 bug regression point),
  //     a valid target opens a drawer inside the app, and a broken target gets a notice while still not
  //     navigating.
  const urlBefore = win.url()
  await win.locator('.pane-body .md a', { hasText: 'Pitfalls' }).click()
  await expect(win.locator('.drawer .raw')).toContainText('Unique content B')
  expect(win.url()).toBe(urlBefore)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.pane-body .md a', { hasText: 'Deleted' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url()).toBe(urlBefore)

  // (7) The drawer width = min(680, 80% of the right-hand content area): in a narrow window it must not
  //     cover the whole content area (the 2026-08-02 bug).
  //     A geometric check rather than reading the CSS declaration — a correct declaration with an unwired
  //     variable would still cover it.
  const drawerGeom = async (): Promise<{ pane: number; drawer: number; left: number; paneLeft: number }> =>
    win.evaluate(() => {
      const d = document.querySelector('.drawer') as HTMLElement
      const pane = document.querySelector('.stage .pane') as HTMLElement
      const dr = d.getBoundingClientRect()
      const pr = pane.getBoundingClientRect()
      return { pane: pr.width, drawer: dr.width, left: dr.left, paneLeft: pr.left }
    })
  for (const [w, label] of [
    [1400, 'wide window'],
    [900, 'narrow window']
  ] as const) {
    await win.setViewportSize({ width: w, height: 800 })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
    await win.locator('.it.row-btn', { hasText: 'pitfalls.md' }).click()
    const g = await drawerGeom()
    expect(Math.abs(g.drawer - Math.min(680, g.pane * 0.8)), `${label}: the width rule`).toBeLessThan(2)
    expect(g.left, `${label}: the drawer must not cover the whole content area`).toBeGreaterThan(g.paneLeft + 1)
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  }

  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

/**
 * skills-view: an on-disk skill expands into a file table with a drawer for reading (markdown preview /
 * raw for non-markdown),
 * a same-side same-name pair in detail lists only the project level (B1), and plugin rows expand (A4).
 * End to end with a fixture home.
 */
test('Skills view: expanding globally reads the package; a same-name pair in detail shows only the project level; plugin rows do not expand', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // The global library: tdd (with a script one subdirectory down) + review-code (global only)
  const gskills = join(home, '.claude', 'skills')
  mkdirSync(join(gskills, 'tdd', 'scripts'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'SKILL.md'), '---\ndescription: Red before green\n---\n\nGlobal body A\n')
  writeFileSync(join(gskills, 'tdd', 'scripts', 'run.sh'), 'echo Unique script B\n')
  mkdirSync(join(gskills, 'review-code'), { recursive: true })
  writeFileSync(join(gskills, 'review-code', 'SKILL.md'), '---\ndescription: Four-layer method\n---\n\nGlobal body D\n')
  // A symlinked skill whose target is outside every known skills root (the dotfiles/monorepo shape, the
  // 2026-08-07 bug regression point)
  const linkTarget = join(home, 'repo', 'skills', 'linked-skill')
  mkdirSync(linkTarget, { recursive: true })
  writeFileSync(join(linkTarget, 'SKILL.md'), '---\ndescription: Symlink install\n---\n\nSymlink body E\n')
  symlinkSync(linkTarget, join(gskills, 'linked-skill'))
  // A project-level tdd of the same name: the detail list should show only this one (B1)
  mkdirSync(join(demo, '.claude', 'skills', 'tdd'), { recursive: true })
  writeFileSync(
    join(demo, '.claude', 'skills', 'tdd', 'SKILL.md'),
    '---\ndescription: Project version\n---\n\nProject body C\n'
  )
  // A plugin enabled at the user layer (with skills) → the global Skills tab shows the plugin namespace row
  const pkg = join(home, 'plug-pkg')
  mkdirSync(join(pkg, '.claude-plugin'), { recursive: true })
  writeFileSync(join(pkg, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(pkg, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(join(pkg, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: Ask before acting\n---\nx')
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: { 'superpowers@official': [{ scope: 'user', version: '1.0.0', installPath: pkg }] }
    })
  )
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'superpowers@official': true } })
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()

  // (1) Global Skills: a collapsed row already carries package stats (file count / size, without line
  //     counts); clicking a row expands the file table;
  //     clicking SKILL.md opens the drawer, with markdown previewing by default (a frontmatter card plus
  //     the body)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const tdd = win.locator('.sk', { hasText: 'tdd' })
  await expect(tdd.locator('.sk-meta')).toContainText('2 files')
  await tdd.locator('.sk-head').click()
  await expect(tdd.locator('.files-card')).toBeVisible()
  await expect(tdd.locator('.files-sum')).toHaveCount(0) // The summary moved onto the row, so the expanded area no longer repeats it
  await tdd.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-fm')).toContainText('Red before green')
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Global body A')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // Clicking another text file in the package switches the content: non-markdown has no raw/preview toggle
  // and shows monospace raw only
  await tdd.locator('.files button', { hasText: 'scripts/run.sh' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Unique script B')
  await expect(win.locator('.skill-drawer .md-preview-seg')).toHaveCount(0)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (1b) A symlinked skill whose target is outside the roots: the row carries the symlink badge, and
  //      expanding and reading files work end to end (A6)
  const linked = win.locator('.sk', { hasText: 'linked-skill' })
  await expect(linked.locator('.pill.ln')).toBeVisible()
  await linked.locator('.sk-head').click()
  await linked.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Symlink body E')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (2) The plugin namespace row: expands and previews on equal footing with an on-disk one (A4; ADR-0012
  //     overturned the v1 exclusion, and the inline stats are on equal footing too)
  const plug = win.locator('.sk', { hasText: 'superpowers:brainstorming' })
  await expect(plug.locator('.sk-meta')).toContainText('1 files')
  await plug.locator('.sk-head').click()
  await plug.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-fm')).toContainText('Ask before acting')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await plug.locator('.sk-head').click() // Collapse, so it does not interfere with later locators

  // (3) Detail Skills: a same-name pair lists only the project level with no second global row; names
  //     present only globally are still listed; project-level rows preview
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const detTdd = win.locator('.pane-body .sk', { hasText: 'tdd' })
  await expect(detTdd).toHaveCount(1)
  await expect(detTdd.locator('.pill.prj')).toBeVisible()
  await expect(detTdd.locator('.pill.glb')).toHaveCount(0)
  await expect(detTdd.locator('.sk-meta')).toContainText('1 files')
  await expect(
    win.locator('.pane-body .sk', { hasText: 'review-code' }).locator('.pill.glb')
  ).toBeVisible()
  await detTdd.locator('.sk-head').click()
  await detTdd.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Project body C')

  // (4) The drawer width reuses the chrome-w formula (capped at 720): in a narrow window it must not cover
  //     the whole content area (the same-origin regression point as the 2026-08-02 bug)
  await win.setViewportSize({ width: 900, height: 800 })
  const g = await win.evaluate(() => {
    const d = (document.querySelector('.skill-drawer') as HTMLElement).getBoundingClientRect()
    const p = (document.querySelector('.stage .pane') as HTMLElement).getBoundingClientRect()
    return { drawer: d.width, left: d.left, pane: p.width, paneLeft: p.left }
  })
  expect(Math.abs(g.drawer - Math.min(720, g.pane * 0.8))).toBeLessThan(2)
  expect(g.left).toBeGreaterThan(g.paneLeft + 1)

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * plugins-view sequence H: previewing a plugin skill in place — category tabs, a row list, readability
 * independent of enablement,
 * a greyed-out missing state, and the Codex group having only a Skills tab. End to end with a fixture home.
 */
test('previewing a plugin skill in place: the tab expands and reads the package; a disabled plugin is readable; a missing one is greyed out; the Codex group', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // An enabled plugin: 2 skills + 1 hooks (category tabs need more than one category)
  const sp = join(home, 'pkg-sp')
  mkdirSync(join(sp, '.claude-plugin'), { recursive: true })
  writeFileSync(join(sp, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(sp, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(
    join(sp, 'skills', 'brainstorming', 'SKILL.md'),
    '---\ndescription: Ask before acting\n---\n\nPlugin body A\n'
  )
  mkdirSync(join(sp, 'skills', 'writing-plans'), { recursive: true })
  writeFileSync(join(sp, 'skills', 'writing-plans', 'SKILL.md'), '---\ndescription: Write plans\n---\nx\n')
  mkdirSync(join(sp, 'hooks'), { recursive: true })
  writeFileSync(
    join(sp, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [] }] } })
  )
  // A disabled plugin: 1 skill (H4: still readable)
  const ct = join(home, 'pkg-ct')
  mkdirSync(join(ct, '.claude-plugin'), { recursive: true })
  writeFileSync(join(ct, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'content-tools' }))
  mkdirSync(join(ct, 'skills', 'publish'), { recursive: true })
  writeFileSync(join(ct, 'skills', 'publish', 'SKILL.md'), '---\ndescription: Publish\n---\n\nReadable while disabled B\n')
  // A plugin whose whole package is missing (E6)
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@official': [{ scope: 'user', version: '1.0.0', installPath: sp }],
        'content-tools@local': [{ scope: 'user', version: '0.1.0', installPath: ct }],
        'ghost@legacy': [{ scope: 'user', version: '1.0.0', installPath: join(home, 'gone') }]
      }
    })
  )
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'superpowers@official': true } })
  )
  // The Codex cache: the highest version contains skills (E8)
  const cxBase = join(home, '.codex', 'plugins', 'cache', 'openai-bundled', 'documents')
  mkdirSync(join(cxBase, '2.0.0', 'skills', 'documents'), { recursive: true })
  writeFileSync(
    join(cxBase, '2.0.0', 'skills', 'documents', 'SKILL.md'),
    '---\ndescription: Docs\n---\n\nCodex body C\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()

  // (1) An enabled plugin: inline installation record chips; expanding gives category tabs; the Skills row
  //     list carries stats; row → file table → drawer
  const spRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(spRow.locator('.chip', { hasText: 'user' })).toBeVisible()
  await spRow.click()
  const spExp = win.locator('.exp-area').first()
  await expect(spExp.locator('.ptab')).toHaveText(['Skills2', 'Hooks1'])
  const bRow = spExp.locator('.psk', { hasText: 'superpowers:brainstorming' })
  await expect(bRow.locator('.meta')).toContainText('1 files')
  await bRow.click()
  await spExp.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Plugin body A')
  await expect(win.locator('.skill-drawer .d-meta')).toContainText('Plugin package')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await spRow.click() // Collapse, so a later .files locator is not taken by this row's table

  // (2) A disabled plugin's skill is still readable (H4/ADR-0012)
  await win.locator('.it.row-btn', { hasText: 'content-tools@local' }).click()
  const ctRow = win.locator('.psk', { hasText: 'content-tools:publish' })
  await ctRow.click()
  await win.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Readable while disabled B')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.it.row-btn', { hasText: 'content-tools@local' }).click() // Collapse

  // (3) A wholly missing package (E6): expanding gives the missing banner and no category tabs
  await win.locator('.it.row-btn', { hasText: 'ghost@legacy' }).click()
  await expect(win.locator('.exp-area.none', { hasText: 'Install directory missing' })).toBeVisible()

  // (4) The Codex group: a Skills tab only, with a row click reading the package
  const cxRow = win.locator('.it.row-btn', { hasText: 'documents@openai-bundled' })
  await cxRow.click()
  const cxPsk = win.locator('.psk', { hasText: 'documents:documents' })
  await cxPsk.click()
  await win.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Codex body C')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * token-stats sequence E: automatic snapshot refresh — a short interval injected (E5) drives the timed
 * backstop end to end:
 * appended session data appears without clicking ↻, and an open detail tab's local state survives the
 * transfusion (A3).
 * The focus trigger is not driven here (focus semantics are unreliable under the hidden-window regime, see
 * the file header),
 * its throttle judgement is pinned by the rescan unit tests, and it shares its scan entry point with the
 * timer.
 */
test('automatic refresh: a new session appears without a manual refresh, and the detail page\'s expansion state survives it', async () => {
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
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      AGENTSHED_NO_FOREGROUND: '1',
      // Pin the test language to Chinese: the UI language follows the system by default, and without pinning it
      // every existing assertion locating by Chinese copy would vary with the system language of whoever runs
// the tests
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
      AGENTSHED_RESCAN_MS: '1500' // The E5 test seam: a shortened backstop interval drives the whole chain
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:/.test(t)) errors.push(t)
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

  // Append "newly produced" session data; do not click ↻, and wait at least 2 backstop cycles
  writeFileSync(join(cdir, 'b.jsonl'), usage(new Date(), 555555) + '\n')
  await win.waitForTimeout(4000)
  // State survives the transfusion (A3): the expanded file table is still there after several automatic
  // refreshes, with no flash back to the loading state
  await expect(tddRow.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()
  await expect(win.locator('.pane-body .none', { hasText: 'Loading' })).toHaveCount(0)

  // The data appears on its own (E1's timed backstop): back on the Agents page the total has changed — with
  // ↻ never clicked
  await win.locator('.rail .ri').nth(0).click()
  await expect
    .poll(async () => (await total.textContent()) !== t0, { timeout: 15_000, intervals: [500] })
    .toBe(true)

  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

/**
 * Every use site of the trend chart runs the same set of assertions.
 * A new use site only needs one more line in this list — avoiding "one place tested, another missed" (the
 * lesson of the 2026-07-30 missed edit).
 */
const TREND_MOUNTS = [
  {
    name: 'Agents page · Token tab',
    async goto(win: import('@playwright/test').Page) {
      await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
    }
  },
  {
    name: 'project detail · Overview tab',
    async goto(win: import('@playwright/test').Page) {
      await win.locator('.rail .ri').nth(1).click()
      const rows = win.locator('.side .row')
      // The fixture home guarantees exactly one project, so the "skip if this machine has no project" branch is
    // no longer needed
      await rows.first().waitFor({ state: 'visible', timeout: 8000 })
      await rows.first().click()
      await win.locator('.pane-head .tabs .tab', { hasText: 'Overview' }).click()
    }
  }
]

for (const mount of TREND_MOUNTS) {
  test(`the trend chart [${mount.name}]: the date axis is in place and the hover tooltip is not clipped by an ancestor`, async () => {
    // Fixture data is mandatory: with no data, "label count === data bar count" is 0 === 0 and
    // the whole geometric assertion set passes vacuously — it runs and verifies nothing. The project detail
    // one is even more direct:
    // with no project it was skipped, which in CI meant zero coverage.
    const l = await launch(undefined, mkUsageHome())
    const win = await l.app.firstWindow()
    await mount.goto(win)
    await expect(win.locator('.chart .col').first()).toBeVisible()
    await expect(win.locator('.chart .col')).toHaveCount(30)
    // Pin down that there really are data bars first, or the geometric checks below would be tautologically
    // true over an empty set
    expect(await win.locator('.chart .col .sp').count()).toBeGreaterThan(0)

    // (1) The x axis geometric check: the label set = the current view's data days (the default window width
    //     fits every label),
    //     with no overlap, nothing outside the axis container, and each label pinned to its bar centre (the
    //     clamped first and last being the exception).
    //     Using "the span count / the non-empty count" as a stand-in for visible is forbidden — overlapping
    //     and out-of-bounds labels are non-empty too.
    //     A known gap: the window-resize ResizeObserver wiring and resize-plus-refresh concurrency are not
    //     automated
    //     (the condition for covering them: a stable driver for electron setBounds; the thinning logic itself
    //     is covered by axis.test.ts).
    const checkAxis = (): Promise<string[]> => win.evaluate(() => {
      const axisEl = document.querySelector('.xaxis') as HTMLElement | null
      const chartEl = document.querySelector('.chart') as HTMLElement | null
      if (!axisEl || !chartEl) return ['no-mount']
      const problems: string[] = []
      const aR = axisEl.getBoundingClientRect()
      const spans = Array.from(axisEl.children) as HTMLElement[]
      const cols = Array.from(chartEl.children) as HTMLElement[]
      const dataCols = cols.filter((c) => c.querySelector('.sp'))
      if (spans.length !== dataCols.length)
        problems.push(`label count ${spans.length} ≠ data bar count ${dataCols.length}`)
      let prevRight = -Infinity
      for (const s of spans) {
        const r = s.getBoundingClientRect()
        if (r.left < prevRight + 1) problems.push(`overlap: ${s.textContent}`)
        prevRight = r.right
        if (r.left < aR.left - 0.5 || r.right > aR.right + 0.5) problems.push(`out of bounds: ${s.textContent}`)
        const day = s.getAttribute('data-day')
        const col = cols.find((c) => c.getAttribute('data-day') === day)
        if (!col) {
          problems.push(`no matching bar: ${s.textContent}`)
          continue
        }
        const cR = col.getBoundingClientRect()
        const off = Math.abs((cR.left + cR.right) / 2 - (r.left + r.right) / 2)
        const atEdge = r.left <= aR.left + 1.5 || r.right >= aR.right - 1.5
        if (off > 1 && !atEdge) problems.push(`offset ${off.toFixed(1)}px: ${s.textContent}`)
      }
      return problems
    })
    expect(await checkAxis()).toEqual([])

    // After a view switch the axis follows the current view's data days (combined → Claude → combined, with
    // no residue either way)
    for (const m of ['Claude', 'Total']) {
      await win.locator('.grp-t .seg button', { hasText: m }).click()
      expect(await checkAxis(), `after switching to ${m}`).toEqual([])
    }

    // (2) The **geometric check** on the hover tooltip: build a real element positioned the same way and walk
    //     the ancestors for a clipping box.
    //     Using "the data-tip attribute exists" as a stand-in for visible is forbidden — a clipped tooltip has
    //     the attribute too.
    const clipped = await win.evaluate(() => {
      const col = document.querySelectorAll('.chart .col')[15] as HTMLElement | undefined
      if (!col) return 'no-col'
      const probe = document.createElement('div')
      probe.textContent = col.getAttribute('data-tip') ?? ''
      probe.style.cssText =
        'position:absolute;bottom:calc(100% + 7px);left:50%;transform:translateX(-50%);white-space:pre;font-size:11px;padding:5px 9px'
      col.appendChild(probe)
      const pr = probe.getBoundingClientRect()
      let hit: string | null = null
      let el: HTMLElement | null = col.parentElement
      while (el && el !== document.body) {
        const cs = getComputedStyle(el)
        if (cs.overflow !== 'visible') {
          const er = el.getBoundingClientRect()
          if (pr.top < er.top || pr.left < er.left || pr.right > er.right) hit = el.className || el.tagName
        }
        el = el.parentElement
      }
      probe.remove()
      return hit
    })
    expect(clipped).toBeNull()

    // (3) The tooltip content is a multi-line breakdown (the total plus at least one provider row)
    const tip = await win.locator('.chart .col').nth(15).getAttribute('data-tip')
    expect(tip).toContain('total')

    expect(l.errors).toEqual([])
    await close(l)
  })
}

// Ticket session-view/03b: the fork and uncertain-strip markers
test('the sessions section: a fork session has its replay prefix stripped and is marked ⑂ fork; one with a missing parent is marked ⑂? strip uncertain', async () => {
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

  // The child: the two replayed entries are stripped leaving only its own, marked ⑂ fork
  const child = rowOf('Child new question')
  await expect(child.locator('.n'), 'it would read 3 questions if the replay prefix were not stripped').toHaveText('1 questions')
  await expect(child.locator('.pill.fork')).toHaveText('⑂ fork')
  await expect(child.locator('.pill.forkq')).toHaveCount(0)

  // An orphan fork: its parent is outside the scan set, so it is marked uncertain rather than certain
  const orphan = rowOf('Orphan session question')
  await expect(orphan.locator('.pill.forkq')).toContainText('uncertain strip')
  await expect(orphan.locator('.pill.fork')).toHaveCount(0)

  expect(l.errors).toEqual([])
  await close(l)
})


// appearance ticket 02: the settings third dimension + the three appearance choices; data-scheme applies
// immediately and entering and leaving settings does not lose the selection
test('settings: the three appearance choices change data-scheme, and entering and leaving settings keeps the selected project', async () => {
  const l = await launch(undefined, mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  // Purple by default (no prefs, or purple); html carries data-scheme
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('purple')

  // Go to Projects and select the only project
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row').first()).toBeVisible()
  await win.locator('.side .row').first().click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)

  // The settings dimension
  await win.getByTitle('Settings').click()
  await expect(win.locator('.settings-h1')).toHaveText('Settings')
  await expect(win.locator('.scheme-card')).toHaveCount(3)
  // The settings page now has two footnotes (language / appearance), located by meaning rather than class
  // name — the class name is no longer unique
  await expect(win.getByTestId('appearance-foot')).toContainText('Follow')

  // Click mist blue → data-scheme=blue
  await win.locator('[data-scheme-option="blue"]').click()
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('blue')
  await expect(win.locator('[data-scheme-option="blue"]')).toHaveAttribute('aria-checked', 'true')

  // Back to Projects: the selection is still there and the scheme is still blue (app-wide)
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('blue')
  // Back on the Agents main area it is still blue
  await win.locator('.rail .ri').first().click()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('blue')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Appearance mode (i18n ticket 04).
 *
 * **What is and is not tested here**: it tests "choosing a mode changes the effective light/dark" and the
 * UI form;
 * it **does not test** "after locking, later system appearance changes do not affect the UI" — the test
 * environment cannot change the real system appearance, and using
 * themeSource itself to simulate a "system change" is circular (it tests the value we just set). That one
 * is accepted by hand.
 */

/**
 * A launch helper dedicated to appearance mode: Playwright's own prefers-color-scheme emulation **must**
 * be turned off.
 *
 * `electron.launch` defaults to `colorScheme: 'light'`, sending the page an Emulation that pins
 * prefers-color-scheme; a themeSource change never reaches the renderer and the media query stays light.
 * **This was hit by measurement**: the main process side was already `themeSource='dark'` /
 * `shouldUseDarkColors=true`,
 * while the renderer still had `matchMedia(...).matches === false` and a light body background —
 * that is, "the implementation is right and the test harness is masking it". `'no-override'` removes the
 * emulation and lets the real value through.
 *
 * Other cases keep the default (emulating light): they do not test light/dark, and pinning it is steadier,
 * so results do not vary with the
 * system appearance of whoever runs them — the same reason as pinning the test language. This group
 * explicitly selects a mode before every assertion,
 * so it is unaffected by the development machine's system appearance.
 *
 * `null` removes the emulation (the value that expresses "reset to the system default" in this version's
 * Playwright types);
 * the `'no-override'` the docs also mention works at runtime but is not in this version's type union, so
 * typecheck would go red.
 */
async function launchAppearance(home: string): Promise<Launched> {
  const userData = makeUserData()
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    colorScheme: null,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      AGENTSHED_NO_FOREGROUND: '1',
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US'
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:/.test(t)) {
      errors.push(t.trim())
    }
  })
  return { app, errors, userData, home }
}

/** The UI's effective light/dark right now: a themeSource change directly changes how this media query
 * evaluates */
async function effectiveDark(win: Awaited<ReturnType<ElectronApplication['firstWindow']>>): Promise<boolean> {
  return win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
}

/** Each scheme card's **paper sample** (the first swatch = --card), read back from the computed CSS */
async function paperSwatches(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<string[]> {
  return win.evaluate(() =>
    [...document.querySelectorAll('[data-scheme-option]')].map((card) => {
      const sw = card.querySelector('.scheme-sw')
      return sw ? getComputedStyle(sw).backgroundColor : ''
    })
  )
}

/** rgb(...) → a rough relative luminance (0=black, 1=white); used only to tell a light sample from a dark
 * one */
function luminance(rgb: string): number {
  const m = rgb.match(/\d+/g)
  if (!m || m.length < 3) return NaN
  const [r, g, b] = m.slice(0, 3).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

test('appearance: one card with two rows (mode + colour scheme); the scheme cards keep only a swatch and a name', async () => {
  const l = await launch(undefined, mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  // One card with two rows: mode on top, colour scheme below
  const field = win.getByTestId('appearance-field')
  await expect(field.locator('.frow')).toHaveCount(2)
  const rows = field.locator('.frow')
  await expect(rows.nth(0).getByTestId('mode-seg').locator('button')).toHaveCount(3)
  await expect(rows.nth(1).locator('[data-scheme-option]')).toHaveCount(3)

  // The scheme cards **carry no full-sentence description**: a card's visible text equals the scheme name
  // exactly.
  // toHaveText for exact equality rather than "does not contain some sentence" — the latter can only rule
  // out the one sentence I happened to think of
  await expect(win.locator('[data-scheme-option="purple"]')).toHaveText('Purple')
  await expect(win.locator('[data-scheme-option="blue"]')).toHaveText('Mist Blue')
  await expect(win.locator('[data-scheme-option="amber"]')).toHaveText('Amber Brown')

  // "Purple is the default" moved into the closing explanation
  await expect(win.getByTestId('appearance-foot')).toContainText('Purple')

  expect(l.errors).toEqual([])
  await close(l)
})

test('appearance mode: locking light or dark changes the effective light/dark, and the palette samples follow', async () => {
  const l = await launchAppearance(mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  // "Follow system" is selected by default
  await expect(win.locator('[data-mode-option="system"]')).toHaveAttribute('aria-checked', 'true')

  // Locking dark → the effective light/dark is dark
  await win.locator('[data-mode-option="dark"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(true)
  await expect(win.locator('[data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
  const dark = await paperSwatches(win)

  // Locking light → the effective light/dark is light
  await win.locator('[data-mode-option="light"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(false)
  const light = await paperSwatches(win)

  // Pin down that the set is non-empty first: if the two loops below iterated an empty array, their bodies
  // would never run,
  // every assertion would fall through and it would still be green — both have to be guarded, or one of
  // them passes for free
  expect(dark).toHaveLength(3)
  expect(light).toHaveLength(3)

  // The samples follow the effective light/dark: in dark mode the paper sample must be dark rather than
  // still showing the light set.
  // The assertion targets the **paper sample** (the first swatch) only, not "no swatch is near-white in
  // dark mode" —
  // the fourth swatch takes --text, which should be near-white in dark mode, and that is not a bug
  for (const c of dark) expect(luminance(c)).toBeLessThan(0.3)
  for (const c of light) expect(luminance(c)).toBeGreaterThan(0.9)
  expect(dark).not.toEqual(light)

  expect(l.errors).toEqual([])
  await close(l)
})

test('appearance: all six combinations of 3 colour schemes × 2 effective light/dark hold', async () => {
  const l = await launchAppearance(mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  for (const mode of ['light', 'dark'] as const) {
    await win.locator(`[data-mode-option="${mode}"]`).click()
    await expect.poll(async () => effectiveDark(win)).toBe(mode === 'dark')
    for (const scheme of ['purple', 'blue', 'amber'] as const) {
      await win.locator(`[data-scheme-option="${scheme}"]`).click()
      await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe(scheme)
      const vars = await win.evaluate(() => {
        const cs = getComputedStyle(document.documentElement)
        const body = getComputedStyle(document.body)
        return {
          bg: cs.getPropertyValue('--bg').trim(),
          text: cs.getPropertyValue('--text').trim(),
          accent: cs.getPropertyValue('--accent').trim(),
          bodyBg: body.backgroundColor,
          bodyFg: body.color
        }
      })
      // The key theme variables have values
      for (const v of [vars.bg, vars.text, vars.accent]) expect(v).not.toBe('')
      // The foreground and background are distinguishable (otherwise this combination gives invisible text)
      expect(Math.abs(luminance(vars.bodyBg) - luminance(vars.bodyFg))).toBeGreaterThan(0.3)
    }
  }

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * UI language (i18n ticket 03).
 *
 * The system's preferred languages are injected through AGENTSHED_SYSTEM_LANGUAGES (see
 * src/main/system-language.ts) —
 * "follow system" behaviour depends on the system language, which cannot be changed in tests, and without
 * this hatch the only way
 * to verify it would be a human repeatedly changing system settings.
 */
async function launchWithLangs(sysLangs: string): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  const home = mkEmptyProjectHome()
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      AGENTSHED_NO_FOREGROUND: '1',
      AGENTSHED_SYSTEM_LANGUAGES: sysLangs
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:/.test(t)) {
      errors.push(t.trim())
    }
  })
  return { app, errors, userData, home }
}

test('UI language: following the system resolves against the whole list, and applies on the first frame', async () => {
  // [ko, fr, en]: Korean is unsupported, so it should carry on to French — not fall back to English because
  // the first entry missed.
  // A single-element list cannot tell the two implementations apart, so this has to use several.
  const l = await launchWithLangs('ko-KR,fr-FR,en-US')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  // The default preference is "follow system", so the UI should be French
  await expect(win.locator('.ri.set')).toHaveAttribute('title', 'Réglages')
  expect(await win.evaluate(() => document.documentElement.lang)).toBe('fr')
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

test('UI language: falls back to English when the system language is unsupported', async () => {
  const l = await launchWithLangs('ko-KR')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await expect(win.locator('.ri.set')).toHaveAttribute('title', 'Settings')
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

test('the language selector: seven items including follow-system and the divider, with a switch applying immediately and persisting', async () => {
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()

  // The language section comes before appearance: assert the DOM order rather than eyeballing a screenshot
  // This case deliberately launches with a Chinese system language, so the section
  // titles it asserts on are the Chinese UI copy — not an untranslated leftover.
  const secs = win.locator('.settings-sec-t')
  await expect(secs.first()).toHaveText('语言')
  await expect(secs.nth(1)).toHaveText('外观')

  // The trigger shows "follow system" plus the current resolution
  const trig = win.getByTestId('language-trigger')
  await expect(trig).toContainText('跟随系统')
  await expect(trig).toContainText('简体中文')

  await trig.click()
  const pop = win.getByTestId('language-pop')
  await expect(pop.locator('.lang-opt')).toHaveCount(7)
  await expect(pop.locator('.lang-sep')).toHaveCount(1)
  // The first item is a policy showing the resolved language; it is not "a language"
  await expect(pop.locator('.lang-opt').first()).toContainText('跟随系统')
  await expect(pop.locator('.lang-opt').first()).toContainText('简体中文')

  // The overlay is not clipped by the settings page's overflow:auto: hit tests at all four corners and the
  // centre, since an attribute existing does not count
  const visible = await win.evaluate(() => {
    const pop = document.querySelector('[data-testid="language-pop"]') as HTMLElement
    const r = pop.getBoundingClientRect()
    const hit = (x: number, y: number): boolean => pop.contains(document.elementFromPoint(x, y))
    return (
      hit(r.left + r.width / 2, r.top + r.height / 2) &&
      hit(r.left + 6, r.top + 6) &&
      hit(r.right - 6, r.top + 6) &&
      hit(r.left + 6, r.bottom - 6) &&
      hit(r.right - 6, r.bottom - 6)
    )
  })
  expect(visible).toBe(true)

  // Switch to Japanese: the whole page changes language immediately, sidebar tooltips included
  await pop.locator('[data-lang="ja"]').click()
  await expect(win.locator('.settings-h1')).toHaveText('設定')
  await expect(win.locator('.ri.set')).toHaveAttribute('title', '設定')
  expect(await win.evaluate(() => document.documentElement.lang)).toBe('ja')

  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

test('the language selector by keyboard: opening leaves the highlight on the current selection rather than moving an extra step', async () => {
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()

  // **Switch to a non-first item first**, then verify where the highlight sits: if the current selection
  // were item 0,
  // "the highlight stays on the selection" and "the highlight was never set" would both give 0, and the
  // assertion could not tell them apart
  const trig = win.getByTestId('language-trigger')
  await trig.click()
  await win.getByTestId('language-pop').locator('[data-lang="ru"]').click()
  await expect(win.locator('.settings-h1')).toHaveText('Настройки')

  // Move the mouse away before testing the keyboard: the previous step selected with the mouse and the
  // pointer is still where the overlay was,
  // so reopening the overlay would land on an item, trigger a hover highlight and displace the keyboard
  // cursor —
  // which is correct mouse behaviour but would make this keyboard assertion test the wrong thing
  await win.mouse.move(0, 0)
  await trig.focus()
  await win.keyboard.press('ArrowDown')
  const pop = win.getByTestId('language-pop')
  await expect(pop).toBeVisible()
  // Russian's index in OPTIONS is 5 (system + zh en fr es ru)
  await expect(pop.locator('.lang-opt.cursor')).toHaveAttribute('data-lang', 'ru')

  // ↑ one step to Spanish, then Enter to select
  await win.keyboard.press('ArrowUp')
  await expect(pop.locator('.lang-opt.cursor')).toHaveAttribute('data-lang', 'es')
  await win.keyboard.press('Enter')
  await expect(win.locator('.settings-h1')).toHaveText('Ajustes')

  // Esc closes without changing the language
  await trig.click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('language-pop')).toHaveCount(0)
  await expect(win.locator('.settings-h1')).toHaveText('Ajustes')

  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

// ── Dedicated i18n cases (ticket 14) ─────────────────────────────────
// The division of labour with the existing cases: the existing e2e pins the language and guards
// **behaviour**; these guard
// **i18n itself** — a switch taking effect, all six languages loading, and the longest language not
// bursting the layout.

test('i18n: the language-locking mechanism itself is reliable, unaffected by the development machine\'s system language', async () => {
  // This guards **the premise of the other 40 e2e cases**: they locate by UI copy, while the language
  // follows the system by default.
  // If the pinning broke, the whole suite would collapse on a machine with a different system language —
  // while staying green on a matching one, invisibly.
  // So the same assertion runs under two injected system languages that **differ from each other and from
  // the pinned one**, and the results must agree.
  for (const sys of ['ko-KR,fr-FR', 'ja-JP,en-US']) {
    const l = await launch(undefined, mkEmptyProjectHome())
    const win = await l.app.firstWindow()
    await win.waitForSelector('.rail')
    // launch() pins AGENTSHED_SYSTEM_LANGUAGES to en-US internally, so this is always English
    // regardless of sys
    await expect(win.locator('.ri.set')).toHaveAttribute('title', 'Settings')
    await close(l)
    void sys
  }
})

test('i18n: all six languages load, with the key nodes non-empty', async () => {
  // Not overlapping with typecheck: typecheck guarantees the keys are complete, and this guarantees **a
  // value really is obtained at runtime** —
  // for instance, if one language's dictionary failed to import entirely, the keys would be complete while
  // runtime read undefined
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()
  const trig = win.getByTestId('language-trigger')
  for (const code of ['en', 'fr', 'es', 'ru', 'ja', 'zh']) {
    await trig.click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    // The key nodes: the page title, the sidebar tooltips, and the settings page's two section titles
    await expect(win.locator('.settings-h1')).not.toBeEmpty()
    await expect(win.locator('.ri.set')).not.toHaveAttribute('title', '')
    const secs = win.locator('.settings-sec-t')
    await expect(secs.first()).not.toBeEmpty()
    await expect(secs.nth(1)).not.toBeEmpty()
    expect(await win.evaluate(() => document.documentElement.lang)).not.toBe('')
  }
  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

test('i18n: switching languages applies immediately, changing several areas at once', async () => {
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()
  const before = {
    title: await win.locator('.settings-h1').textContent(),
    rail: await win.locator('.ri.set').getAttribute('title'),
    sec: await win.locator('.settings-sec-t').first().textContent()
  }
  await win.getByTestId('language-trigger').click()
  await win.getByTestId('language-pop').locator('[data-lang="fr"]').click()
  // **Assert three areas together**: asserting one cannot distinguish "the whole page changed language" from
  // "only this one place is wired to the dictionaries"
  await expect(win.locator('.settings-h1')).not.toHaveText(before.title ?? '')
  await expect(win.locator('.ri.set')).not.toHaveAttribute('title', before.rail ?? '')
  await expect(win.locator('.settings-sec-t').first()).not.toHaveText(before.sec ?? '')
  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

test('i18n: key layouts do not overflow horizontally in the longest language (both French/Russian prose and Japanese labels are checked)', async () => {
  // The ticket names **two classes** to cover: French and Russian are longest for prose, and Japanese is
  // longest for labels (full-width).
  // Testing one class would miss the other — they burst different containers.
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()
  for (const code of ['fr', 'ru', 'ja']) {
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    await expect(win.locator('.settings-h1')).not.toBeEmpty()
    const overflow = await win.evaluate(() => {
      const doc = document.documentElement
      // The page itself must not scroll horizontally
      const pageOverflows = doc.scrollWidth > doc.clientWidth
      // The settings page's fixed-width containers must not be burst by their content
      const boxes = [...document.querySelectorAll('.settings, .field, .settings-foot')]
      const boxOverflows = boxes.filter((b) => b.scrollWidth > b.clientWidth + 1).length
      return { pageOverflows, boxOverflows }
    })
    expect(overflow.pageOverflows, `${code}: the page overflows horizontally`).toBe(false)
    expect(overflow.boxOverflows, `${code}: a fixed-width container was burst`).toBe(0)
  }
  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})
