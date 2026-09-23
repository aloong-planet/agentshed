// E2E: Playwright driving a real Electron (the build output), covering the assembly layer unit tests
// cannot reach —
// the whole IPC chain, rendering, dimension switching, tab switching and refresh deduplication, while
// asserting the main process emits no errors.
// The key scenario: **starting with an old-format cache** (the shape of the 2026-07-30 production crash;
// the unit tests pin it and this guards the whole chain again).
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { zstdCompressSync } from 'node:zlib'
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
async function launch(
  cacheContent: string | undefined,
  home: string,
  extraEnv?: Record<string, string>
): Promise<Launched> {
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
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
      // Per-case seams (e.g. AGENTSHED_SCAN_DELAY_MS for the startup-skeleton cases) ride on top
      ...extraEnv
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
  // The rail holds the two dimensions plus settings — the global refresh control was removed
  // (2026-08-23), so scans are automatic only and ⌘R belongs to the platform reload again
  await expect(win.locator('.rail .ri')).toHaveCount(3)
  await expect(win.locator('.rail .ri.grfr')).toHaveCount(0)
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // Three summary cards (CC / CODEX / GROK — an undetected side shows "not detected", not an error)
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(3)
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
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(3)
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
// reports the same bounding box and loses exactly that (CONTEXT's floating-layer invariant).
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
  await expect(opts).toHaveCount(4)
  await expect(opts.nth(0)).toContainText('All')
  await expect(opts.nth(1)).toContainText('Claude Code')
  await expect(opts.nth(2)).toContainText('Codex')
  await expect(opts.nth(3)).toContainText('Grok')
  // Dots mark the three sides, not "All"; the current choice carries the check
  await expect(pop.locator('.dd-opt .dot')).toHaveCount(3)
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
test('the side filter row stays inside the sidebar column in all six UI languages', async () => {
  const l = await launchWithLangs('zh-Hans-CN', mkThreeSideHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')

  for (const code of ['zh', 'en', 'fr', 'es', 'ru', 'ja']) {
    await win.locator('.ri.set').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    await expect(win.locator('.settings-h1')).not.toBeEmpty()

    await win.locator('.rail .ri').nth(1).click()
    // The widest trigger label is a side name: pick Claude Code before measuring
    await win.locator('.opts .dd-trigger').click()
    await win.locator('.side-pop .dd-opt').nth(1).click()
    await expect(win.locator('.opts .cnt'), 'the stale counter must be present while measuring').toBeVisible()

    // The prototype's width readout was blind to two of the row's three occupants (its toggle
    // label and counter were hard-coded Chinese), so this state overflowed the column in the
    // longer languages. Ruled 2026-08-16: the counter ellipsizes under squeeze, full sentence on
    // its title; the toggle label may still wrap onto a second text line in fr/ru (accepted).
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
    expect(m.overflow, `${code}: the filter row's content overflows the row box`).toBeLessThanOrEqual(1)
    expect(m.beyondColumn, `${code}: the filter row runs past the sidebar column`).toBeLessThanOrEqual(0)
    expect(m.cntWidth, `${code}: the counter was squeezed out entirely`).toBeGreaterThan(40)
    expect(m.cntTitle, `${code}: the full sentence must survive in the title`).toBe(m.cntText)

    // Back to all sides so the next language starts from the same state
    await win.locator('.opts .dd-trigger').click()
    await win.locator('.side-pop .dd-opt').nth(0).click()
  }

  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
  rmSync(l.home!, { recursive: true, force: true })
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
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(3)
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

test('the archive retains a past day whose live figure fell under the same stamp (ADR-0026): the retained figure shows on both pages, with no hatching, while the archived-only day still hatches', async () => {
  // The fixture home has Claude usage of 1500 tokens two days ago. The seeded v2 archive holds 5,000,000
  // for that (day, side) under the app's own accounting stamp, so the scan's lower live figure is a
  // same-stamp decrease on a past day: retained, drawn like any other day (spec C10, G15). The 2020 row
  // has no live counterpart at all: archived-only, hatched and counted in the note (spec C6, C9).
  const home = mkUsageHome()
  const proj = join(home, 'demo-proj')
  const d = localDayOffset(2)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  // The stamp the app composes: package.json version + the cache structure version. The cache version
  // is a literal here on purpose: a bump turns this case red (the seeded pair reads as another stamp and
  // the decrease is accepted) instead of silently passing — update it together with CACHE_VERSION.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
  const stamp = `${pkg.version}+c16`
  const retainedRow = {
    day,
    side: 'claude',
    projectKey: proj.toLowerCase(),
    model: 'claude-fable-5',
    input: 4_000_000,
    output: 1_000_000,
    cacheRead: 0,
    cacheWrite: 0,
    total: 5_000_000
  }
  const legacyRow = { day: '2020-01-01', side: 'claude', projectKey: '/legacy', model: 'claude-legacy', input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 12345 }
  const userData = makeUserData()
  writeFileSync(
    join(userData, 'usage-archive.json'),
    JSON.stringify({
      version: 2,
      rows: [legacyRow, retainedRow],
      stamps: { [`${day}\u0000claude`]: stamp, ['2020-01-01\u0000claude']: stamp },
      observed: {},
      superseded: []
    })
  )
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US' }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:/.test(t)) errors.push(t)
  })
  const win = await app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // Cross-project page: the retained day carries the archived figure and no hatching
  const bar = win.locator(`.chart .col[data-day="${day}"]`)
  await expect(bar).toHaveAttribute('data-tip', /Anthropic\s+5\.0M/)
  await expect(bar).not.toHaveClass(/\barch\b/)
  // The archived-only day still drives the note
  await expect(win.locator('.arch-note')).toBeVisible()
  // Project page: the same day derives from the same rows (spec G6)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  const projBar = win.locator(`.chart .col[data-day="${day}"]`)
  await expect(projBar).toHaveAttribute('data-tip', /Anthropic\s+5\.0M/)
  await expect(projBar).not.toHaveClass(/\barch\b/)
  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

test('the trend chart is stacked bars: segmented by provider within a bar, and switching to a single side leaves only that side\'s provider segments', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  // Combined mode: the fixture seeds usage on both sides → both the Anthropic and OpenAI segments should be
  // present
  const cols = win.locator('.chart .col')
  await expect(cols).toHaveCount(30)
  // Group titles render in sentence case, as written in the dictionary: innerText sees the rendered
  // (transformed) text, so an uppercase transform on .grp-t would turn this red
  await expect(win.getByRole('group', { name: 'Trend days' }).getByRole('button', { name: '30', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // The all-history card is the bare window label — no parenthetical note trails it
  await expect(win.locator('.tot-row .tot-c .k').first()).toHaveText('Total · all history')
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
 * The rendered-markdown heading ladder (spec appearance.md, sequence E): one ladder on every
 * markdown surface, probed as computed styles — the technique the light/dark cases already use,
 * not screenshot comparison. Sizes are the spec's em table × the 12.5px body both surfaces set.
 */
async function headingLadder(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<
  Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5', { size: number; color: string; bottomRule: string; leftBar: string }>
> {
  return win.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) throw new Error(`ladder probe: no node for ${sel}`)
    const pick = (h: string) => {
      const el = root.querySelector(h)
      if (!el) throw new Error(`ladder probe: no ${h} under ${sel}`)
      const cs = getComputedStyle(el)
      return {
        size: parseFloat(cs.fontSize),
        color: cs.color,
        bottomRule: cs.borderBottomWidth,
        leftBar: cs.borderLeftWidth
      }
    }
    return { h1: pick('h1'), h2: pick('h2'), h3: pick('h3'), h4: pick('h4'), h5: pick('h5') }
  }, scope)
}

function expectLadder(l: Awaited<ReturnType<typeof headingLadder>>, label: string): void {
  expect(l.h1.size, `${label}: h1 size`).toBeCloseTo(16.5, 1)
  expect(l.h2.size, `${label}: h2 size`).toBeCloseTo(14.5, 1)
  expect(l.h3.size, `${label}: h3 size`).toBeCloseTo(13.25, 1)
  expect(l.h4.size, `${label}: h4 size`).toBeCloseTo(11.875, 1)
  // Shape cues: the h1 bottom rule and the h2 left bar. Deliberately NOT asserted:
  // borderLeftColor === color — border-color's initial value is currentColor, so that comparison
  // holds even with no border rule at all (a constant-true assertion).
  expect(l.h1.bottomRule, `${label}: h1 bottom rule`).toBe('2px')
  expect(l.h2.leftBar, `${label}: h2 left bar`).toBe('3px')
  // Colour steps: h2 → h3 → h4 all differ, and h4 has left the accent family for the muted grey h5 uses
  expect(l.h3.color, `${label}: h3 differs from h2`).not.toBe(l.h2.color)
  expect(l.h4.color, `${label}: h4 differs from h3`).not.toBe(l.h3.color)
  expect(l.h4.color, `${label}: h4 shares the muted colour with h5`).toBe(l.h5.color)
}

/**
 * Rendered-markdown code styling (spec appearance.md, sequence E): inline code and fenced blocks
 * take the document card's paper style on every surface — a bordered inset for the fence, no inner
 * box on the code element inside it, a bordered pill for inline code.
 */
async function codeStyle(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<{ preBorder: string; preBg: string; hostBg: string; innerBorder: string; innerBg: string; inlineBorder: string }> {
  return win.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) throw new Error(`code probe: no node for ${sel}`)
    const pre = root.querySelector('pre')
    const preCode = root.querySelector('pre code')
    const inline = Array.from(root.querySelectorAll('code')).find((c) => !c.closest('pre'))
    if (!pre || !preCode || !inline) throw new Error(`code probe: pre/code missing under ${sel}`)
    return {
      preBorder: getComputedStyle(pre).borderTopWidth,
      preBg: getComputedStyle(pre).backgroundColor,
      hostBg: getComputedStyle(root).backgroundColor,
      innerBorder: getComputedStyle(preCode).borderTopWidth,
      innerBg: getComputedStyle(preCode).backgroundColor,
      inlineBorder: getComputedStyle(inline).borderTopWidth
    }
  }, scope)
}

/** Body line-height is part of the shared rule set too (spec appearance E7c, settled 2026-08-20 at
 * the document card's 1.75): probed on a paragraph, 1.75 × the 12.5px body = 21.875px. */
async function contentLineHeight(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<number> {
  return win.evaluate((sel) => {
    const p = document.querySelector(`${sel} p`)
    if (!p) throw new Error(`line-height probe: no p under ${sel}`)
    return parseFloat(getComputedStyle(p).lineHeight)
  }, scope)
}

/** Tables take the paper style too (spec appearance E7d, settled 2026-08-21): a bordered frame,
 * an accent-soft header with deep-accent text, bg-striped even rows, and GFM alignment
 * (:-: / --:) winning over the default left. */
async function tableStyle(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<{
  border: string
  thColor: string
  thNowrap: string
  thAlign: string
  colSep: string
  rowSep: string
  oddBg: string
  evenBg: string
  alignRight: string
  alignCenter: string
}> {
  return win.evaluate((sel) => {
    const table = document.querySelector(`${sel} table`)
    if (!table) throw new Error(`table probe: no table under ${sel}`)
    const th = table.querySelector('th')
    const rows = table.querySelectorAll('tbody tr')
    const oddTd = rows[0]?.querySelector('td')
    const evenTd = rows[1]?.querySelector('td')
    const rightTd = rows[0]?.querySelector('td:last-child')
    const centerTd = rows[0]?.querySelector('td:nth-child(2)')
    if (!th || !oddTd || !evenTd || !rightTd || !centerTd)
      throw new Error(`table probe: cells missing under ${sel}`)
    return {
      border: getComputedStyle(table).borderTopWidth,
      thColor: getComputedStyle(th).color,
      thNowrap: getComputedStyle(th).whiteSpace,
      thAlign: getComputedStyle(th).textAlign,
      colSep: getComputedStyle(oddTd).borderRightColor,
      rowSep: getComputedStyle(oddTd).borderBottomColor,
      oddBg: getComputedStyle(oddTd).backgroundColor,
      evenBg: getComputedStyle(evenTd).backgroundColor,
      alignRight: getComputedStyle(rightTd).textAlign,
      alignCenter: getComputedStyle(centerTd).textAlign
    }
  }, scope)
}

function expectTableStyle(
  tb: Awaited<ReturnType<typeof tableStyle>>,
  h1Color: string,
  label: string
): void {
  expect(tb.border, `${label}: table frame`).toBe('1px')
  expect(tb.thColor, `${label}: header text takes the deep accent (h1's colour)`).toBe(h1Color)
  expect(tb.thNowrap, `${label}: header cells never wrap`).toBe('nowrap')
  // Ruled 2026-08-21: headers are always centred; GFM alignment applies to body cells only —
  // the attribute lands on th too, and without this rule it drags the header along
  expect(tb.thAlign, `${label}: header text centred regardless of column alignment`).toBe('center')
  expect(tb.colSep, `${label}: column separators stronger than row separators`).not.toBe(tb.rowSep)
  expect(tb.evenBg, `${label}: striped even row`).not.toBe(tb.oddBg)
  expect(tb.alignRight, `${label}: GFM right alignment wins`).toBe('right')
  expect(tb.alignCenter, `${label}: GFM centre alignment wins`).toBe('center')
}

/** List indentation is part of the shared rule set (spec appearance E7c): 20px on every surface —
 * the drawer previously fell to the browser's 40px default. */
async function listIndent(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<string> {
  return win.evaluate((sel) => {
    const ul = document.querySelector(`${sel} ul`)
    if (!ul) throw new Error(`list probe: no ul under ${sel}`)
    return getComputedStyle(ul).paddingLeft
  }, scope)
}

function expectCodeStyle(c: Awaited<ReturnType<typeof codeStyle>>, label: string): void {
  expect(c.preBorder, `${label}: fenced block border`).toBe('1px')
  expect(c.preBg, `${label}: fenced block is a paper inset, not the host background`).not.toBe(c.hostBg)
  expect(c.innerBorder, `${label}: no inner box on the code element inside the fence`).toBe('0px')
  expect(c.innerBg, `${label}: inner code transparent`).toBe('rgba(0, 0, 0, 0)')
  expect(c.inlineBorder, `${label}: inline code pill border`).toBe('1px')
}

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
  // The demo project's artifact (CONTEXT.md) carries the full heading ladder for the reader overlay
  writeFileSync(
    join(demo, 'CONTEXT.md'),
    '# Context ladder\n\nIntro.\n\n## Ladder h2\n\n### Ladder h3\n#### Ladder h4\n\n##### Ladder h5\n'
  )
  // The demo project's CLAUDE.md links to a listed artifact and to a path outside the list
  writeFileSync(
    join(demo, 'CLAUDE.md'),
    '# Demo config\n\ncfg link probe: [open context](./CONTEXT.md) · [missing doc](./docs/none.md)\n'
  )
  // The demo project's memory
  const enc = demo.replace(/[^A-Za-z0-9]/g, '-')
  mkdirSync(join(home, '.claude', 'projects', enc, 'memory'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'projects', enc, 'memory', 'MEMORY.md'),
    '# Memory main file\n- Key point A\n- [Pitfalls](pitfalls.md) valid relative link\n- [Deleted entry](gone.md) broken target\n\n## Ladder h2\n\nInline `probe` code.\n\n```\nfenced probe\n```\n\n| L | C | R |\n|:--|:-:|--:|\n| a1 | b1 | c1 |\n| a2 | b2 | c2 |\n\n### Ladder h3\n#### Ladder h4\n\n##### Ladder h5\n'
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
  // (5) Detail Memory: MEMORY.md's body is rendered directly, with the shared heading ladder
  //     (spec appearance.md sequence E — the document-card side of "one ladder, every surface")
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('Key point A')
  const cardLadder = await headingLadder(win, '.pane-body .md')
  expectLadder(cardLadder, 'memory .md card')
  expectCodeStyle(await codeStyle(win, '.pane-body .md'), 'memory .md card')
  expectTableStyle(await tableStyle(win, '.pane-body .md'), cardLadder.h1.color, 'memory .md card')
  expect(await listIndent(win, '.pane-body .md'), 'memory .md card: list indent').toBe('20px')
  expect(await contentLineHeight(win, '.pane-body .md'), 'memory .md card: line-height').toBeCloseTo(21.875, 1)
  // Hover parity with the drawer (spec appearance E7c)
  const cardLink = win.locator('.pane-body .md a', { hasText: 'Pitfalls' })
  const cardRest = await cardLink.evaluate((el) => getComputedStyle(el).color)
  await cardLink.hover()
  expect(
    await cardLink.evaluate((el) => getComputedStyle(el).color),
    'memory .md card: link hover feedback'
  ).not.toBe(cardRest)

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

  // (6b) The artifact reader overlay is a markdown surface too, so it takes the same ladder — the
  //      regression this pins: the overlay's own title rule (.reader h2) used to out-cascade the
  //      ladder for every h2 inside the rendered body (same specificity, later in the file)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
  await win.locator('.it.ai', { hasText: 'Context ladder' }).click()
  await expect(win.locator('.reader .md')).toContainText('Ladder h2')
  expectLadder(await headingLadder(win, '.reader .md'), 'artifact reader')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (6d) Config-card links (project detail): a relative link to a listed artifact opens the same
  //      reader overlay; anything outside the artifact list keeps the explicit notice; neither
  //      navigates the window
  await win.locator('.pane-head .tabs .tab', { hasText: 'Config' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('cfg link probe')
  await win.locator('.pane-body .md a', { hasText: 'open context' }).click()
  await expect(win.locator('.reader .md')).toContainText('Ladder h2')
  expect(win.url(), 'artifact link from the config card must not navigate').toBe(urlBefore)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await expect(win.locator('.toast')).toHaveCount(0) // wait out any earlier toast, so the next one is fresh
  await win.locator('.pane-body .md a', { hasText: 'missing doc' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url(), 'out-of-scope config link must not navigate').toBe(urlBefore)

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
  writeFileSync(
    join(gskills, 'tdd', 'SKILL.md'),
    '---\ndescription: Red before green\n---\n\n# Ladder h1\n\nGlobal body A\n\n## Ladder h2\n\nInline `probe` code.\n\n```\nfenced probe\n```\n\n- Bullet probe A\n- Bullet probe B\n\n| L | C | R |\n|:--|:-:|--:|\n| a1 | b1 | c1 |\n| a2 | b2 | c2 |\n\n[Probe link](https://example.com/probe) · [run the script](./scripts/run.sh) · [missing link](./nope.md)\n\n### Ladder h3\n#### Ladder h4\n\n##### Ladder h5\n'
  )
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
  // The drawer side of "one ladder, every surface" (spec appearance.md sequence E): the same
  // computed ladder the memory .md card asserts
  const drawerLadder = await headingLadder(win, '.skill-drawer .md-preview-body.preview')
  expectLadder(drawerLadder, 'skill drawer preview')
  expectCodeStyle(await codeStyle(win, '.skill-drawer .md-preview-body.preview'), 'skill drawer preview')
  expectTableStyle(
    await tableStyle(win, '.skill-drawer .md-preview-body.preview'),
    drawerLadder.h1.color,
    'skill drawer preview'
  )
  expect(await listIndent(win, '.skill-drawer .md-preview-body.preview'), 'skill drawer preview: list indent').toBe('20px')
  // Link hover shares the card's semantics (spec appearance E7c): accent at rest, deep accent on
  // hover — the deep value cross-checked against h1, which the ladder pins to --accent-deep
  const probeLink = win.locator('.skill-drawer .md-preview-body a', { hasText: 'Probe link' })
  const restColor = await probeLink.evaluate((el) => getComputedStyle(el).color)
  await probeLink.hover()
  const hoverColor = await probeLink.evaluate((el) => getComputedStyle(el).color)
  expect(hoverColor, 'skill drawer preview: link hover feedback').not.toBe(restColor)
  expect(hoverColor, 'skill drawer preview: hover lands on the deep accent').toBe(drawerLadder.h1.color)
  expect(
    await contentLineHeight(win, '.skill-drawer .md-preview-body.preview'),
    'skill drawer preview: line-height'
  ).toBeCloseTo(21.875, 1)
  // Links inside the drawer preview (skills-view spec D3): an in-package relative link switches the
  // drawer to that file, an out-of-scope one gets an explicit notice, and neither navigates the window
  const urlBeforeLinks = win.url()
  await win.locator('.skill-drawer .md-preview-body a', { hasText: 'missing link' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url(), 'out-of-scope link must not navigate').toBe(urlBeforeLinks)
  await win.locator('.skill-drawer .md-preview-body a', { hasText: 'run the script' }).click()
  await expect(win.locator('.skill-drawer .md-preview-name')).toHaveText('scripts/run.sh')
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Unique script B')
  await expect(win.locator('.skill-drawer .md-preview-seg')).toHaveCount(0)
  expect(win.url(), 'internal link must not navigate').toBe(urlBeforeLinks)
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
  await expect(plug.locator('.sk-meta')).toContainText('1 file')
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
  await expect(detTdd.locator('.sk-meta')).toContainText('1 file')
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
 * Filtering the skills lists by name, and revealing a name the column truncated.
 *
 * The two traps this guards, both of which produce green tests that prove nothing:
 *
 *  - **A clipped element still reports a bounding box**, so `toBeVisible()` passes on a tooltip that is
 *    painted nowhere. The tooltip's visibility is asserted by hit-testing its own centre.
 *  - **"Nothing matched" and "nothing here" must be different sentences.** Asserting merely that *some*
 *    empty state appeared would pass if the code reused the "library is empty" copy, which would be a
 *    lie told to a user whose library is full.
 */
test('filtering the skills lists by name, and revealing a truncated name on hover', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  const gskills = join(home, '.claude', 'skills')
  // Two names sharing a fragment (`review`), one that shares nothing, and one long enough that the
  // 200px name column must truncate it — the hover reveal has nothing to show without that last one
  const LONG = 'chrome-devtools-mcp-an-absurdly-long-skill-directory-name-that-the-filesystem-allows'
  for (const n of ['review-code', 'review-tests', 'github-ops', LONG]) {
    mkdirSync(join(gskills, n), { recursive: true })
    writeFileSync(join(gskills, n, 'SKILL.md'), `---\ndescription: ${n}\n---\n\nbody\n`)
  }
  // A name that does not contain "zebra" while its description does — the only way to show that the
  // description is not searched (spec E2). Rows do not display it, so a hit explained by it would look
  // like a malfunction.
  mkdirSync(join(gskills, 'quiet-skill'), { recursive: true })
  writeFileSync(
    join(gskills, 'quiet-skill', 'SKILL.md'),
    '---\ndescription: zebra appears only in this description\n---\n\nbody\n'
  )
  // A project-level skill, so detail has more than one group and "an empty group disappears" is testable
  mkdirSync(join(demo, '.claude', 'skills', 'local-only'), { recursive: true })
  writeFileSync(
    join(demo, '.claude', 'skills', 'local-only', 'SKILL.md'),
    '---\ndescription: project level\n---\n\nbody\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()

  const globalRows = win.locator('.sk-card > .rel')
  const box = win.locator('.sbar.sk-search input')
  await expect(globalRows).toHaveCount(5)

  // (1) Narrowing, and recovering when the box is cleared
  await box.fill('review')
  await expect(globalRows).toHaveCount(2)
  await box.fill('REVIEW') // case-insensitive
  await expect(globalRows).toHaveCount(2)
  await box.fill('   ') // whitespace only filters nothing (spec E4)
  await expect(globalRows).toHaveCount(5)
  await box.fill('gwd') // a substring, not a subsequence — must not reach any name
  await expect(globalRows).toHaveCount(0)
  // Only the name is matched: `zebra` lives in quiet-skill's description and nowhere in any name
  await box.fill('zebra')
  await expect(globalRows).toHaveCount(0)

  // (2) "Nothing matched" is its own sentence, distinct from "the library is empty"
  const globalMiss = await win.locator('.pane-body .none').textContent()
  expect(globalMiss).toBe('No skill name matched')
  expect(globalMiss).not.toBe('Both global libraries are empty')
  await box.fill('')
  await expect(globalRows).toHaveCount(5)

  // (2b) Typing closes the install popover (spec E8). The popover must be opened on a row that
  // **survives** the keyword about to be typed: open it on a row the filter removes and the popover
  // disappears along with its row, which would pass whether or not anything closes it deliberately —
  // verified by mutation, an earlier version of this assertion did exactly that and stayed green with
  // the closing removed.
  const survivingRow = win.locator('.sk-card > .rel').filter({ hasText: 'review-code' })
  await survivingRow.locator('.ins').click()
  await expect(win.locator('.pop')).toHaveCount(1)
  await box.fill('review') // review-code still matches, so only the deliberate close can hide it
  await expect(survivingRow).toHaveCount(1)
  await expect(win.locator('.pop')).toHaveCount(0)
  await box.fill('')

  // (3) An expanded row survives filtering; one that left and came back is collapsed again
  const reviewCode = win.locator('.sk', { hasText: 'review-code' }).first()
  await reviewCode.locator('.sk-head').click()
  await expect(reviewCode).toHaveClass(/open/)
  await box.fill('review-code')
  await expect(win.locator('.sk', { hasText: 'review-code' }).first()).toHaveClass(/open/)
  await box.fill('zzz')
  await box.fill('review-code')
  await expect(win.locator('.sk', { hasText: 'review-code' }).first()).not.toHaveClass(/open/)
  await box.fill('')

  // (4) The hover reveal. Truncation is the trigger: a short name must stay quiet.
  const shortName = win.locator('.sk', { hasText: 'github-ops' }).first().locator('.nm')
  await shortName.hover()
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  const longName = win.locator('.sk', { hasText: 'absurdly-long' }).first().locator('.nm')
  const truncated = await longName.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(truncated).toBe(true) // otherwise the case below proves nothing
  await longName.hover()
  await expect(win.locator('.nm-tip')).toHaveCount(1)

  const tip = await win.evaluate(() => {
    const el = document.querySelector('.nm-tip') as HTMLElement
    const r = el.getBoundingClientRect()
    // pointer-events: none would let the hit test fall straight through, so lift it for the probe
    const saved = el.style.pointerEvents
    el.style.pointerEvents = 'auto'
    const atCentre = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    el.style.pointerEvents = saved
    return {
      text: el.textContent,
      width: Math.round(r.width),
      height: Math.round(r.height),
      insideViewport: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      // The decisive one: a clipped layer reports this same rect but loses this
      centreBelongsToTip: atCentre !== null && el.contains(atCentre),
      pointerEvents: getComputedStyle(el).pointerEvents,
      position: getComputedStyle(el).position
    }
  })
  expect(tip.text).toBe(LONG)
  expect(tip.centreBelongsToTip).toBe(true)
  expect(tip.insideViewport).toBe(true)
  expect(tip.width).toBeLessThanOrEqual(420) // bounded, so a long directory name cannot span the display
  expect(tip.height).toBeGreaterThan(24) // and wrapped rather than stretched onto one line
  expect(tip.pointerEvents).toBe('none') // must not swallow the click that expands the row
  // Pinning `fixed` deliberately, even though it is an implementation choice rather than a behaviour.
  // The check above cannot cover it: with no positioned ancestor in the row today, `absolute` resolves
  // against the initial containing block and behaves identically — verified by mutation, the hit test
  // stays green when this is switched to `absolute`. It only starts failing once someone gives a row
  // `position: relative`, which is an ordinary-looking change nobody would connect to this tooltip.
  // `fixed` is what makes that change harmless, so it is pinned here rather than left to be rediscovered.
  expect(tip.position).toBe('fixed')

  // Moving away removes it
  await win.mouse.move(5, 5)
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  // Anything that moves the anchor invalidates the coordinates measured from it, so all three dismiss.
  // These are the second of the floating layer's two obligations (CONTEXT's invariant) — the layer is
  // fixed, so without them it would hang in place over unrelated content.
  // Each of the three needs the pointer parked away first: `hover()` on an element the pointer already
  // sits on fires no `mouseenter`, so the tooltip would never reappear and the next assertion would pass
  // for the wrong reason.
  const hoverLongName = async (): Promise<void> => {
    await win.mouse.move(5, 5)
    await longName.hover()
    await expect(win.locator('.nm-tip')).toHaveCount(1)
  }

  // The events are dispatched directly rather than by actually resizing or scrolling. Doing it for real
  // moves the row out from under the pointer, so the tooltip would vanish via `mouseleave` and the
  // assertion would pass whether or not the listener was ever attached — which is precisely the thing
  // under test.
  await hoverLongName()
  await win.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  await hoverLongName()
  await win.locator('.pane-body').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  await hoverLongName()
  await box.fill('github') // filtering the anchor row away takes the tooltip with it
  await expect(win.locator('.nm-tip')).toHaveCount(0)
  await box.fill('')

  // (5) Project detail: one box narrows every group, headings count what survived, empty groups vanish
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const headings = win.locator('.pane-body .grp-t')
  const detailBox = win.locator('.sbar.sk-search input')
  await expect(headings).toHaveCount(2) // project level + global level

  await detailBox.fill('review')
  // The project-level group holds only `local-only`, so it disappears entirely — heading included
  await expect(headings).toHaveCount(1)
  await expect(headings.first()).toHaveText('Global level · Claude(2)') // the count follows the filter
  await detailBox.fill('local')
  await expect(headings).toHaveCount(1)
  await expect(headings.first()).toHaveText('Project level · .claude/skills(1)')

  await detailBox.fill('zzz')
  await expect(headings).toHaveCount(0)
  const detailMiss = await win.locator('.pane-body .none').textContent()
  expect(detailMiss).toBe('No skill name matched')
  expect(detailMiss).not.toBe('No skills in effect for this project')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * How long a filter keyword lives — the one gap from this feature's test review judged worth closing.
 *
 * The other four recorded gaps are guarded by structure (an empty library returns before the box is
 * rendered) or unreachable in the current layout. This one is not guarded by anything: the behaviour
 * follows entirely from **which component owns the state**, so it breaks the day someone lifts that
 * state to a parent — and it breaks *silently*. Coming back to a section and finding it filtered by a
 * keyword you no longer see typed anywhere reads as "my skills are gone", not as a bug.
 */
test('a filter keyword survives a refresh, and is cleared by leaving the section or switching project', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const alpha = join(home, 'alpha-proj')
  const beta = join(home, 'beta-proj')
  mkdirSync(alpha, { recursive: true })
  mkdirSync(beta, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [alpha]: {}, [beta]: {} } }))
  const gskills = join(home, '.claude', 'skills')
  for (const n of ['review-code', 'github-ops']) {
    mkdirSync(join(gskills, n), { recursive: true })
    writeFileSync(join(gskills, n, 'SKILL.md'), `---\ndescription: ${n}\n---\n\nbody\n`)
  }
  for (const p of [alpha, beta]) {
    mkdirSync(join(p, '.claude', 'skills', 'local-only'), { recursive: true })
    writeFileSync(join(p, '.claude', 'skills', 'local-only', 'SKILL.md'), '---\ndescription: x\n---\n\nbody\n')
  }

  // A brisk rescan interval: since the manual refresh was removed (2026-08-23) a snapshot update is
  // observed through the automatic scan
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  const box = win.locator('.sbar.sk-search input')

  // (1) A snapshot refresh keeps it. The section is re-rendered rather than remounted, so the keyword
  // survives — losing it here would silently undo the narrowing the user is in the middle of reading.
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await box.fill('review')
  await expect(win.locator('.sk-card > .rel')).toHaveCount(1)
  // Land a scan and **prove it landed** before asserting survival: a newly registered project bumps the
  // side card's project count, which only a completed scan can do — and it stays clear of the skills
  // list this test measures. Without that proof "the keyword survived" would also pass when no refresh
  // ever happened.
  const late = join(home, 'late-proj')
  mkdirSync(late, { recursive: true })
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ projects: { [alpha]: {}, [beta]: {}, [late]: {} } })
  )
  await expect(win.locator('.pane-head .stats .stat').first()).toContainText('3 projects')
  await expect(box).toHaveValue('review')
  await expect(win.locator('.sk-card > .rel')).toHaveCount(1)

  // (2) Leaving the section clears it. The keyword is a way of looking at one list, not a setting —
  // and a section that reopens already filtered, with the box scrolled out of sight, looks empty.
  await win.locator('.pane-head .tabs .tab', { hasText: 'Subagents' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await expect(box).toHaveValue('')
  await expect(win.locator('.sk-card > .rel')).toHaveCount(2)

  // (3) Switching project clears it too — otherwise a keyword typed for one project's skills would
  // quietly filter another's, and a populated project would look like it has nothing installed.
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'alpha-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await box.fill('local')
  await expect(win.locator('.pane-body .grp-t')).toHaveCount(1)

  await win.locator('.side .row', { hasText: 'beta-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await expect(box).toHaveValue('')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * The install-to popover is a **floating layer**: it has to appear next to the button that opened it, and
 * its targets have to be clickable.
 *
 * Why this cannot be asserted with `toBeVisible()` alone: an element clipped away by an ancestor's
 * `overflow` **still has a non-empty bounding box**, so `toBeVisible()` passes on a popover the user
 * cannot see or click. That is exactly "an attribute standing in for what the user sees". So this measures
 * geometry, hit-tests the popover's own centre, and finishes on the only judgement that matters — clicking
 * a target and getting a result.
 *
 * The regression it guards (found 2026-08-10): the popover is `position: absolute`, but the wrapper it is
 * meant to hang off carried a class that no rule defined, so it never became a containing block. The
 * popover fell back to the initial containing block and landed at the bottom edge of the viewport —
 * clicking "Install to…" looked like nothing happened.
 */
test('the install-to popover sits next to its button, and its targets can be clicked', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // Several skills, so the popover is opened from the **last** row: that is where the card's bottom edge
  // is right underfoot, the position most likely to be clipped
  const gskills = join(home, '.claude', 'skills')
  for (const n of ['alpha-skill', 'beta-skill', 'gamma-skill', 'delta-skill']) {
    mkdirSync(join(gskills, n), { recursive: true })
    writeFileSync(join(gskills, n, 'SKILL.md'), `---\ndescription: ${n}\n---\n\nbody\n`)
  }

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()

  const rows = win.locator('.sk-card > .rel')
  await expect(rows).toHaveCount(4)
  await rows.last().locator('.ins').click()

  const geo = await win.evaluate(() => {
    const pop = document.querySelector('.pop') as HTMLElement
    const buttons = [...document.querySelectorAll('.sk-card .ins')] as HTMLElement[]
    const btn = buttons[buttons.length - 1]
    const p = pop.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    // The decisive check: whatever is painted at the popover's own centre must belong to the popover.
    // A clipped popover reports a rect but loses this — the point resolves to whatever is behind it.
    const atCentre = document.elementFromPoint(p.x + p.width / 2, p.y + p.height / 2)
    return {
      // Measured on both sides, because the popover legitimately opens either way
      gapBelowButton: Math.round(p.top - b.bottom),
      gapAboveButton: Math.round(b.top - p.bottom),
      horizontalOffset: Math.round(Math.abs(p.right - b.right)),
      bottomWithinViewport: p.bottom <= innerHeight,
      centreBelongsToPopover: atCentre !== null && pop.contains(atCentre)
    }
  })
  // Hangs off the button that opened it, rather than off the document — on **either** side. The popover
  // opens downwards by default and flips upwards when the room below runs short, which is deliberate
  // (see popAt) and depends on where the row happens to sit. An earlier version of this assertion
  // required the downward case specifically, and went red the moment a search box pushed the list down
  // by forty pixels — it was pinning today's incidental layout, not the behaviour.
  const gapToButton = Math.min(Math.abs(geo.gapBelowButton), Math.abs(geo.gapAboveButton))
  expect(gapToButton).toBeLessThan(40)
  expect(geo.horizontalOffset).toBeLessThan(40)
  expect(geo.bottomWithinViewport).toBe(true)
  expect(geo.centreBelongsToPopover).toBe(true)

  // A resize **repositions** rather than closes: the user is part-way through choosing a target, and
  // resizing the window is not them changing their mind. The language dropdown always behaved this
  // way; the two are the same kind of layer and now agree.
  //
  // The event is dispatched rather than the window actually resized, for the same reason as elsewhere:
  // a real resize moves the row out from under the pointer, and the layer could then close via a
  // route that has nothing to do with the listener under test.
  await win.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(win.locator('.pop')).toHaveCount(1)
  const after = await win.evaluate(() => {
    const pop = document.querySelector('.pop') as HTMLElement
    const buttons = [...document.querySelectorAll('.sk-card .ins')] as HTMLElement[]
    const b = buttons[buttons.length - 1].getBoundingClientRect()
    const p = pop.getBoundingClientRect()
    return Math.min(Math.abs(p.top - b.bottom), Math.abs(b.top - p.bottom))
  })
  expect(after).toBeLessThan(40) // still anchored to its button after re-placing

  // Step clear of the resize before the scroll cases: a scroll hard on a resize's heels is
  // attributed to the browser's scrollTop clamp and deliberately ignored (#122), and the
  // assertions above can complete inside that window
  await win.waitForTimeout(250)

  // Scrolling the popover's **own** contents must not close it. It is scrollable (a long project list
  // exceeds its max height), so closing on its own scroll would make every target below the fold
  // unreachable: reaching for one dismisses the thing you were reaching into.
  //
  // This is not hypothetical — it is what a document-level capture listener does by default, since
  // scroll does not bubble but does pass through document on capture. The listener has to tell "the
  // anchor moved" from "the user is scrolling the layer itself".
  await win.locator('.pop').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(win.locator('.pop')).toHaveCount(1)

  // Scrolling anything *outside* it still dismisses — the anchor has moved out from under a
  // viewport-positioned layer, and no reading of that leaves the old coordinates true
  await win.locator('.pane-body').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(win.locator('.pop')).toHaveCount(0)

  // And the judgement that actually matters: the target is clickable and installing reports back
  const installedName = (await rows.last().locator('.nm').first().innerText()).trim()
  await rows.last().locator('.ins').click()
  await win.locator('.pop .pop-p').first().click()
  await expect(win.locator('.toast.ok')).toBeVisible()

  // The installed copy is visible with no refresh of any kind (pinned 2026-08-23, when the manual
  // control was removed and this was the case to be sure of): project detail — including its Skills
  // section — is fetched when the project is opened, so it never rides on the snapshot. The rescan
  // interval here is the five-minute default, so no scan can be what makes this pass.
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await expect(win.locator('.sk', { hasText: installedName })).toHaveCount(1)

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
  await expect(bRow.locator('.meta')).toContainText('1 file')
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

// Ticket grok-side/#124 (spec D1a): a side newly in use has volume only on recent days, and its
// share of a shared-scale bar is thin. Both single-side answers are asserted geometrically: the
// thin xAI segment measures a real height in combined mode rather than disappearing, and Grok mode
// labels only its own data days under D6.
test('a newly adopted side: the thin xAI segment survives, and Grok mode labels only its data days', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gktrend-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  // Claude: heavy volume on three days — the shared scale is what makes grok's segment thin
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const cUsage = (at: Date, inTok: number): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at.toISOString(),
      message: {
        model: 'claude-fable-5',
        usage: { input_tokens: inTok, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
      }
    })
  writeFileSync(
    join(cdir, 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(3).toISOString(), message: { role: 'user', content: 'Q' } }),
      cUsage(localDayOffset(3), 100_000),
      cUsage(localDayOffset(1), 100_000),
      cUsage(localDayOffset(0), 100_000)
    ].join('\n') + '\n'
  )
  // Grok: registered, with small turns on two of the days (the real update-stream shape)
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gdir = join(home, '.grok', 'sessions', encodeURIComponent(proj), '019f-e2e-trend')
  mkdirSync(gdir, { recursive: true })
  writeFileSync(join(gdir, 'summary.json'), JSON.stringify({ info: { id: '019f-e2e-trend', cwd: proj } }))
  const gTurn = (at: Date, input: number, output: number): string =>
    JSON.stringify({
      timestamp: Math.floor(at.getTime() / 1000),
      method: '_x.ai/session/update',
      params: {
        sessionId: '019f-e2e-trend',
        update: {
          sessionUpdate: 'turn_completed',
          prompt_id: 'p',
          stop_reason: 'end_turn',
          usage: {
            inputTokens: input,
            outputTokens: output,
            totalTokens: input + output,
            cachedReadTokens: 0,
            cacheCreationTokens: 0,
            costUsdTicks: 1234567,
            modelUsage: {
              'grok-4.5-build': { inputTokens: input, outputTokens: output, cachedReadTokens: 0, cacheCreationTokens: 0, costUsdTicks: 1234567 }
            }
          }
        }
      }
    })
  writeFileSync(
    join(gdir, 'updates.jsonl'),
    [gTurn(localDayOffset(2), 2000, 500), gTurn(localDayOffset(0), 1500, 300)].join('\n') + '\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  await expect(win.locator('.chart .col').first()).toBeVisible()

  // The cross-project totals include the newly adopted side. Its figure now lives in that side's own
  // card rather than in a subtitle listing all three, so the assertion reads the card — the claim is
  // unchanged, only where the answer is rendered.
  const gkCard = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.gk') })
  await expect(gkCard.locator('.v')).not.toHaveText('0')

  // Combined mode: the xAI segments exist on grok's two days and measure a real height at this
  // scale. The thinness is asserted too — a case where the segment happened to be tall would prove
  // nothing about the disappearing-thin-segment failure D1a names.
  const xaiHeights = await win
    .locator('.chart .sp.xai')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  expect(xaiHeights.length).toBe(2)
  for (const h of xaiHeights) expect(h).toBeGreaterThan(0)
  expect(Math.max(...xaiHeights), 'the fixture must actually produce the thin case').toBeLessThan(10)

  // The legend lists xAI only because it appears in the window
  await expect(win.locator('.legend')).toContainText('xAI')

  // Grok mode: only that side's volume, so only its two data days carry segments and axis labels
  await win.locator('.grp-t .seg button', { hasText: 'Grok' }).click()
  await expect(win.locator('.chart .col .sp')).toHaveCount(2)
  expect(await win.locator('.chart .col .sp.xai').count()).toBe(2)
  await expect(win.locator('.xaxis span')).toHaveCount(2)

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket grok-side/#127 (closeout): the combinations no single ticket owns — one day where all
// three sides have volume, and one project whose session list mixes all three sides by time.
// (The third combination — a count-3 row's hover naming all three sides — is already pinned by the
// #123 badge e2e over the three-side fixture.)
test('three sides on one day segment together, and one project mixes all three sides\' sessions by time', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-tri-combo-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  // Claude: one session, one question, volume today (newest)
  writeFileSync(
    join(cdir, 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(0).toISOString(), message: { role: 'user', content: 'Claude question' } }),
      JSON.stringify({ type: 'assistant', timestamp: localDayOffset(0).toISOString(), message: { model: 'claude-fable-5', usage: { input_tokens: 50_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
    ].join('\n') + '\n'
  )
  // Codex: one session, volume today (oldest of the three)
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })
  const at = (h: number): string => { const d = localDayOffset(0); d.setHours(h); return d.toISOString() }
  writeFileSync(
    join(sdir, 'rollout-019fb0c0-2222-7af3-af7d-8505cedf1ec2.jsonl'),
    [
      JSON.stringify({ timestamp: at(1), type: 'session_meta', payload: { cwd: proj } }),
      JSON.stringify({ timestamp: at(1), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
      JSON.stringify({ timestamp: at(1), type: 'event_msg', payload: { type: 'user_message', message: 'Codex question' } }),
      JSON.stringify({ timestamp: at(1), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 30_000, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, total_tokens: 30_050 } } } })
    ].join('\n') + '\n'
  )
  // Grok: one session, volume today (middle)
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gdir = join(home, '.grok', 'sessions', encodeURIComponent(proj), '019f-combo')
  mkdirSync(gdir, { recursive: true })
  writeFileSync(join(gdir, 'summary.json'), JSON.stringify({ info: { id: '019f-combo', cwd: proj } }))
  const gts = (h: number): number => { const d = localDayOffset(0); d.setHours(h); return Math.floor(d.getTime() / 1000) }
  writeFileSync(
    join(gdir, 'updates.jsonl'),
    [
      JSON.stringify({ timestamp: gts(6), method: '_x.ai/session/update', params: { sessionId: 's', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Grok question' }, _meta: { promptIndex: 0 } } } }),
      JSON.stringify({ timestamp: gts(6), method: '_x.ai/session/update', params: { sessionId: 's', update: { sessionUpdate: 'turn_completed', usage: { inputTokens: 10_000, outputTokens: 20, totalTokens: 10_020, cachedReadTokens: 0, cacheCreationTokens: 0, costUsdTicks: 1, modelUsage: { 'grok-4.5-build': { inputTokens: 10_000, outputTokens: 20, cachedReadTokens: 0, cacheCreationTokens: 0 } } } } } })
    ].join('\n') + '\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  // (1) The trend: today's bar carries all three providers' segments, each with a real height
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  const today = win.locator('.chart .col').last()
  for (const cls of ['anthropic', 'openai', 'xai']) {
    const h = await today.locator(`.sp.${cls}`).evaluate((el) => el.getBoundingClientRect().height)
    expect(h, `today's ${cls} segment must measure a real height`).toBeGreaterThan(0)
  }
  await expect(win.locator('.legend')).toContainText('xAI')

  // (2) The session list mixes all three sides, newest first: Claude (today late) → Grok (06:00) → Codex (01:00)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('.t')).toHaveText('Claude question')
  await expect(rows.nth(1).locator('.t')).toHaveText('Grok question')
  await expect(rows.nth(2).locator('.t')).toHaveText('Codex question')
  await expect(rows.nth(0).locator('.badge.cl')).toHaveText('CC')
  await expect(rows.nth(1).locator('.badge.gk')).toHaveText('GK')
  await expect(rows.nth(2).locator('.badge.cx')).toHaveText('CX')

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket grok-side/#126: Grok's own global skills list alongside the other sides', the borrowing
// copy is present, and the install popover names every side of a target project.
test('the Agents page shows Grok\'s own global skills with the borrowing line, and installs one into a project', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gkglobal-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gsk = join(home, '.grok', 'skills', 'grok-own-skill')
  mkdirSync(gsk, { recursive: true })
  writeFileSync(join(gsk, 'SKILL.md'), '---\ndescription: a grok-side skill\n---\n\nbody\n')
  // The borrowed direction: the same-named skill under Claude's root must list once, under Claude
  const csk = join(home, '.claude', 'skills', 'claude-own-skill')
  mkdirSync(csk, { recursive: true })
  writeFileSync(join(csk, 'SKILL.md'), '---\ndescription: a claude-side skill\n---\n\nbody\n')

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()

  // The Grok summary card is detected; the grok skill row carries its side; the borrowing line shows
  await expect(win.locator('.pane-head .stats .stat').nth(2)).toContainText('GROK')
  const row = win.locator('.sk', { hasText: 'grok-own-skill' })
  await expect(row).toHaveCount(1)
  // The row's own side strip: grok wears its GK badge in the third slot, not a second CX (the #125
  // ternary fall-through, recurred on this surface — the popover below was asserted, the row was not).
  // The two missing sides draw the shared Minus icon, not a text dash (#148)
  const strip = row.locator('.bdg .badge')
  await expect(strip).toHaveCount(3)
  await expect(strip.nth(0)).toHaveClass(/miss/)
  await expect(strip.nth(1)).toHaveClass(/miss/)
  await expect(strip.nth(2)).toHaveText('GK')
  await expect(strip.nth(2)).toHaveClass(/gk/)
  await expect(row.locator('.bdg .badge.miss svg')).toHaveCount(2)
  await expect(win.locator('.grp-t .hint2')).toContainText('borrowed components belong to the Claude side')
  // Install the grok skill into the project: the popover target names the project's sides in full
  await row.locator('.ins').click()
  await expect(win.locator('.pop .pop-p .badge.gk')).toHaveText('GK')
  await win.locator('.pop .pop-p').first().click()
  await expect(win.locator('.toast.ok')).toBeVisible()

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


// appearance ticket 02: the settings third dimension + the three appearance choices; data-theme applies
// immediately and entering and leaving settings does not lose the selection
test('settings: the three appearance choices change data-theme, and entering and leaving settings keeps the selected project', async () => {
  // The delay (query layer, ADR-0028) makes a fresh fetch observably slower than a cached visit,
  // which is what the return-to-Projects assertion below (project-detail T9) needs to distinguish.
  const l = await launch(undefined, mkEmptyProjectHome(), { AGENTSHED_FETCH_DELAY_MS: '500' })
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  // Purple by default (no prefs, or purple); html carries data-theme
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('purple')

  // Go to Projects and select the only project
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row').first()).toBeVisible()
  await win.locator('.side .row').first().click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)
  // Let the first visit's detail arrive before leaving — the assertion below is about the *return*
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible()

  // The settings dimension
  await win.getByTitle('Settings').click()
  await expect(win.locator('.settings-h1')).toHaveText('Settings')
  await expect(win.locator('.theme-card')).toHaveCount(3)
  // The settings page now has two footnotes (language / appearance), located by meaning rather than class
  // name — the class name is no longer unique
  await expect(win.getByTestId('appearance-foot')).toContainText('Follow')

  // Click mist blue → data-theme=blue
  await win.locator('[data-theme-option="blue"]').click()
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('blue')
  await expect(win.locator('[data-theme-option="blue"]')).toHaveAttribute('aria-checked', 'true')

  // Back to Projects: the selection is still there and the theme is still blue (app-wide). Leaving
  // the dimension unmounts the detail pane, but the query layer's cache survives it (project-detail
  // T9): the body is visible well inside the 500ms delay, proving this is a cached visit, not a
  // fresh fetch.
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible({ timeout: 200 })
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('blue')
  // Back on the Agents main area it is still blue
  await win.locator('.rail .ri').first().click()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('blue')

  expect(l.errors).toEqual([])
  await close(l)
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
    const badge = other.querySelector('.cnt-b') as HTMLElement | null
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

/** Each theme card's **paper sample** (the first swatch = --card), read back from the computed CSS */
async function paperSwatches(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<string[]> {
  return win.evaluate(() =>
    [...document.querySelectorAll('[data-theme-option]')].map((card) => {
      const sw = card.querySelector('.theme-sw')
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

test('appearance: one card with two rows (mode + theme); the theme cards keep only a swatch and a name', async () => {
  const l = await launch(undefined, mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  // One card with two rows: mode on top, theme below
  const field = win.getByTestId('appearance-field')
  await expect(field.locator('.frow')).toHaveCount(2)
  const rows = field.locator('.frow')
  await expect(rows.nth(0).getByTestId('mode-seg').locator('button')).toHaveCount(3)
  await expect(rows.nth(1).locator('[data-theme-option]')).toHaveCount(3)

  // The theme cards **carry no full-sentence description**: a card's visible text equals the theme name
  // exactly.
  // toHaveText for exact equality rather than "does not contain some sentence" — the latter can only rule
  // out the one sentence I happened to think of
  await expect(win.locator('[data-theme-option="purple"]')).toHaveText('Purple')
  await expect(win.locator('[data-theme-option="blue"]')).toHaveText('Mist Blue')
  await expect(win.locator('[data-theme-option="amber"]')).toHaveText('Amber Brown')

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

  // ── Why the swatches are polled rather than read once the media query has flipped ──
  // They are not CSS: SettingsPane picks them out of a table keyed on the effective light/dark, and that
  // key is React state fed by a matchMedia listener. So `matchMedia(...).matches` (what effectiveDark
  // reads) flips a render **before** the swatches do, and reading them right after it leaves a window in
  // which the previous mode's table is still on screen.
  //
  // That window is narrower than one CDP round-trip, so it almost never opens — it was seen once, as a
  // light-mode assertion receiving luminance 0.1286, which is exactly THEME_SWATCH.dark.purple[0]
  // (#1f2124) under the helper below. Polling the quantity actually asserted, rather than the signal
  // upstream of it, removes the window instead of making it less likely.
  //
  // Locking dark → the effective light/dark is dark
  await win.locator('[data-mode-option="dark"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(true)
  await expect(win.locator('[data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
  await expect
    .poll(async () => Math.max(...(await paperSwatches(win)).map(luminance)))
    .toBeLessThan(0.3)
  const dark = await paperSwatches(win)

  // Locking light → the effective light/dark is light
  await win.locator('[data-mode-option="light"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(false)
  await expect
    .poll(async () => Math.min(...(await paperSwatches(win)).map(luminance)))
    .toBeGreaterThan(0.9)
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

test('appearance: all six combinations of 3 themes × 2 effective light/dark hold', async () => {
  const l = await launchAppearance(mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  /**
   * The floating layers' shadow, sampled per state. It is checked by name because "every variable
   * resolves" cannot see the failure that matters for it: defined for light and forgotten for dark, it
   * would inherit the light value and stay resolvable while being visibly wrong — a shadow tuned for a
   * pale backdrop disappears against a dark one.
   *
   * Named rather than generalised to "every colour variable must differ between light and dark", because
   * four functional colours (danger, tip) deliberately do not — so that rule would need an exception list
   * to maintain. See the delivery notes for that trade-off.
   */
  const floatShadowByState = new Map<string, string>()

  for (const mode of ['light', 'dark'] as const) {
    await win.locator(`[data-mode-option="${mode}"]`).click()
    await expect.poll(async () => effectiveDark(win)).toBe(mode === 'dark')
    for (const theme of ['purple', 'blue', 'amber'] as const) {
      await win.locator(`[data-theme-option="${theme}"]`).click()
      await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe(theme)
      const vars = await win.evaluate(() => {
        // Enumerate the variables the **theme blocks** declare, rather than naming a few by hand. A
        // hand-written list only ever covers the variables someone thought of on the day, so a variable
        // added later and missed in one block goes unnoticed — the failure being that it silently falls
        // back to whatever it inherits, or to nothing at all.
        //
        // Scoped to `:root` and the palette blocks on purpose: a few variables belong to a component
        // instead (`--chrome-w` lives on the app shell), and those are not expected to resolve here.
        const declared = new Set<string>()
        const collect = (rules: CSSRuleList): void => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSMediaRule) collect(rule.cssRules)
            else if (rule instanceof CSSStyleRule) {
              // A theme block is the root element itself — no descendant combinator. Matching merely
              // "starts with :root" also catches rules like `:root[data-theme='dark'] .qlist .q`, whose
              // variables are scoped to a component and are correctly absent from the root.
              const sel = rule.selectorText
              if (/\s/.test(sel) || !/^(:root|html\[data-theme)/.test(sel)) continue
              for (const prop of Array.from(rule.style)) {
                if (prop.startsWith('--')) declared.add(prop)
              }
            }
          }
        }
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            collect(sheet.cssRules)
          } catch {
            // A cross-origin sheet cannot be read; there are none of ours, so nothing is lost
          }
        }
        const cs = getComputedStyle(document.documentElement)
        const body = getComputedStyle(document.body)
        return {
          declaredCount: declared.size,
          unresolved: [...declared].filter((n) => cs.getPropertyValue(n).trim() === ''),
          floatShadow: cs.getPropertyValue('--float-shadow').trim(),
          bodyBg: body.backgroundColor,
          bodyFg: body.color
        }
      })
      // Guard the set is non-empty first: an empty enumeration would make the next assertion pass for
      // free, which is the shape this whole check exists to prevent
      expect(vars.declaredCount).toBeGreaterThan(20)
      // Every theme variable resolves in this combination.
      //
      // **What this does and does not catch.** It catches a variable that resolves nowhere — typically a
      // new one nobody defined, or a renamed one whose users were not updated. It does **not** catch a
      // variable defined for light and forgotten for dark: custom properties inherit, so the dark state
      // silently picks up the light value. Resolving is therefore necessary, not sufficient. Verified by
      // mutation — deleting the dark definition of a variable leaves this green.
      expect(vars.unresolved).toEqual([])
      floatShadowByState.set(`${theme}/${mode}`, vars.floatShadow)
      // The foreground and background are distinguishable (otherwise this combination gives invisible text)
      expect(Math.abs(luminance(vars.bodyBg) - luminance(vars.bodyFg))).toBeGreaterThan(0.3)
    }
  }

  // The floating shadow must actually change with light/dark, and must not change with the palette —
  // it is a neutral shadow, so three palettes sharing one value is correct rather than an oversight
  expect(floatShadowByState.size).toBe(6)
  const lightShadows = new Set(
    [...floatShadowByState].filter(([k]) => k.endsWith('/light')).map(([, v]) => v)
  )
  const darkShadows = new Set(
    [...floatShadowByState].filter(([k]) => k.endsWith('/dark')).map(([, v]) => v)
  )
  expect(lightShadows.size).toBe(1)
  expect(darkShadows.size).toBe(1)
  expect([...lightShadows][0]).not.toBe([...darkShadows][0])
  expect([...lightShadows][0]).not.toBe('')

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
async function launchWithLangs(sysLangs: string, homeOverride?: string): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  const home = homeOverride ?? mkEmptyProjectHome()
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

test('i18n: no label in the project-detail tab row or the skills rows wraps to a second line', async () => {
  // The pre-existing overflow test covers the **settings page** only (`.settings`, `.field`,
  // `.settings-foot`). Two of the tightest rows were unguarded, and both hold copy that varies a lot in
  // width: the nine-tab row in project detail, and the `.sk-head` rows whose `.pill`s are `flex: none`.
  //
  // **What the failure actually looks like, measured rather than assumed.** The obvious guess — the row
  // bursts its container and the page scrolls sideways — is wrong here, and every check built on it is
  // vacuous:
  //   - `.tabs` is width-auto, so its `scrollWidth` always equals its `clientWidth`.
  //   - `body` is `overflow-x: hidden`, so `documentElement.scrollWidth > clientWidth` never fires.
  //   - `.tab` is `white-space: normal` with `flex: 0 1 auto`, so an over-long label does not clip or
  //     overflow its box. It **wraps and grows the row vertically** — measured at 34px → 268px for a label
  //     14× too long, with `.pane-head` going 98px → 332px.
  // So the property asserted is single-line-ness: in a healthy row every item is one line and therefore the
  // same height, and any item whose text wrapped is taller than its siblings. That is resolution- and
  // font-independent, and it is what actually changes when the copy gets too long.
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-ovf-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // A project-level skill and a symlinked global one: between them the rows render the widest pill sets.
  mkdirSync(join(demo, '.claude', 'skills', 'tdd'), { recursive: true })
  writeFileSync(join(demo, '.claude', 'skills', 'tdd', 'SKILL.md'), '---\ndescription: d\n---\nx\n')
  const linkTarget = join(home, 'repo', 'skills', 'linked-skill')
  mkdirSync(linkTarget, { recursive: true })
  writeFileSync(join(linkTarget, 'SKILL.md'), '---\ndescription: d\n---\nx\n')
  mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
  symlinkSync(linkTarget, join(home, '.claude', 'skills', 'linked-skill'))

  const l = await launchWithLangs('en-US', home)
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')

  // Japanese is checked alongside the three long-prose languages because full-width labels grow differently
  // from long words — the same reason the settings test covers both classes.
  for (const code of ['fr', 'es', 'ru', 'ja']) {
    await win.locator('.ri.set').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    await expect(win.locator('.settings-h1')).not.toBeEmpty()

    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'demo-proj' }).click()
    await expect(win.locator('.pane-head .tabs .tab').first()).toBeVisible()
    // "Skills" is a proper noun and is untranslated in every language, so this locator works throughout
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    await expect(win.locator('.pane-body .sk').first()).toBeVisible()

    const wrapped = await win.evaluate(() => {
      // Count **line boxes**, not heights. Comparing an item's height against its siblings' looks right and
      // is not: these rows are flex containers with the default `align-items: stretch`, so one wrapped label
      // grows every sibling to the same height and a height comparison reports nothing. A Range over the
      // element's contents yields one client rect per line box, which stretching does not affect.
      const wraps = (items: HTMLElement[]): string[] =>
        items
          .filter((e) => {
            const r = document.createRange()
            r.selectNodeContents(e)
            return r.getClientRects().length > 1
          })
          .map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 40))
      const q = (sel: string): HTMLElement[] => [...document.querySelectorAll(sel)] as HTMLElement[]
      return {
        tabs: wraps(q('.pane-head .tabs .tab')),
        pills: wraps(q('.pane-body .sk-head .pill'))
      }
    })
    expect(wrapped.tabs, `${code}: a tab label wrapped onto a second line`).toEqual([])
    expect(wrapped.pills, `${code}: a skills-row pill wrapped onto a second line`).toEqual([])
  }
  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

test('the time window drives all four regions at once: side figures, composition, model rows and the dimmed span', async () => {
  // The failure this guards against is **partial** propagation — some figures following the selection
  // and others staying on the previous window. Reading the four regions one at a time would pass on a
  // page that is internally inconsistent, so each snapshot takes all four in a single pass (spec G3).
  const home = mkUsageHome()
  // A brisk rescan interval for the G13 check at the end: the automatic scan is the only refresh path
  // since the manual control was removed (2026-08-23)
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  await expect(win.locator('.chart .col').first()).toBeVisible()

  const readAll = (): Promise<{
    sides: string[]
    comp: string[]
    models: string[]
    dimmed: number
    bars: number
    selected: string
    modelTitle: string
  }> =>
    win.evaluate(() => {
      const txt = (sel: string): string[] =>
        Array.from(document.querySelectorAll(sel)).map((e) => (e.textContent ?? '').trim())
      return {
        sides: txt('.pane-head .stats .stat .v'),
        comp: txt('.comp-lg b'),
        models: txt('.models .m .num'),
        dimmed: document.querySelectorAll('.chart .col.out').length,
        bars: document.querySelectorAll('.chart .col').length,
        selected: (document.querySelector('.tot-c.on .k')?.textContent ?? '').trim(),
        // The heading that belongs to the model rows, taken structurally: the first .grp-t in the
        // pane is the trend chart's title, so an ordinal selector reads the wrong element
        modelTitle: (document.querySelector('.models')?.previousElementSibling?.textContent ?? '').trim()
      }
    })

  const all = await readAll()
  expect(all.bars, 'the chart keeps its own 30-day span whatever is selected (D10)').toBe(30)
  // A bucket at exactly zero must draw nothing: the minimum width that keeps a tiny non-zero segment
  // visible would otherwise render a sliver of usage that does not exist
  const zeroSegments = await win.evaluate(() => {
    const legend = Array.from(document.querySelectorAll('.comp-lg > span'))
    const zeroClasses = legend
      .filter((s) => /(^|\s)0(\.0+)?%/.test(s.textContent ?? ''))
      .map((s) => s.querySelector('i')?.className ?? '')
    return zeroClasses.filter((c) => c && document.querySelector(`.comp > i.${c}`))
  })
  expect(zeroSegments, 'a 0% bucket has a legend entry but no segment on the bar').toEqual([])
  expect(all.dimmed, 'nothing is dimmed under "all history"').toBe(0)
  expect(all.sides.length).toBe(3)
  expect(all.comp.length, 'three buckets in the legend').toBe(3)
  expect(all.models.length, 'the fixture must have model rows, or the comparison below is vacuous')
    .toBeGreaterThan(0)

  // "Today" rather than a wider window, and by position rather than by label: this fixture's usage
  // sits within the last three days, so `all` and a 7-day window hold the *same* rows — comparing them
  // would assert inequality between two identical values and could never fail. Position also keeps the
  // selector independent of the interface language.
  const daysWithBars = await win.locator('.chart .col .sp').evaluateAll(
    (els) => new Set(els.map((e) => e.parentElement?.getAttribute('data-day'))).size
  )
  expect(daysWithBars, 'the fixture must span more than one day, or "today ⊂ all" is vacuous')
    .toBeGreaterThan(1)

  await win.locator('.tot-c').nth(1).click()
  await expect(win.locator('.chart .col.out').first()).toBeVisible()
  const d7 = await readAll()
  expect(d7.selected, 'the clicked card is the selected one').not.toBe(all.selected)
  expect(d7.dimmed, 'today dims the other 29 of the 30 bars').toBe(29)
  expect(d7.sides, 'each side figure follows the window').not.toEqual(all.sides)
  expect(d7.comp, 'the composition follows the window').not.toEqual(all.comp)
  expect(d7.models, 'the model rows follow the window').not.toEqual(all.models)
  expect(d7.modelTitle, 'the by-model heading names the selected window').toContain(d7.selected)

  // And the selection survives leaving and returning to the tab (G11) — the side figures are rendered
  // outside the tab, so they must still be on the selected window when it is not visible
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const onOtherTab = await win.locator('.pane-head .stats .stat .v').allTextContents()
  expect(onOtherTab.map((s) => s.trim()), 'the side cards stay on the selected window').toEqual(d7.sides)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  const back = await readAll()
  expect(back.selected).toBe(d7.selected)
  expect(back.dimmed).toBe(29)

  // The window and the chart's side filter are independent controls that compose (G12): narrowing to
  // one side changes what the bars count, while the window keeps deciding which of them are in scope.
  // Neither may reset the other — the failure worth guarding is one control quietly clearing the other.
  await win.locator('.seg button').nth(1).click()
  await expect(win.locator('.seg button.on')).toHaveCount(1)
  const composed = await readAll()
  expect(composed.dimmed, 'the window still scopes the chart under a single-side filter').toBe(29)
  expect(composed.selected, 'and the window itself is untouched by the side filter').toBe(d7.selected)
  expect(composed.sides, 'the figures above the chart stay across all sides — the filter is the chart’s')
    .toEqual(d7.sides)
  await win.locator('.seg button').nth(0).click()

  // A refresh must not drop the selection (G13). The automatic backstop fires on a timer the user did
  // not ask for, so losing the window on every scan is exactly the visible defect — and since the
  // manual control was removed it is also the only refresh path there is. A newly registered project
  // proves a scan actually landed; without that, "the selection survived" would pass on a page that
  // never refreshed at all.
  const late = join(home, 'late-proj')
  mkdirSync(late, { recursive: true })
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ projects: { [join(home, 'demo-proj')]: {}, [late]: {} } })
  )
  await expect(win.locator('.pane-head .stats .stat').first()).toContainText('2 projects')
  await expect(win.locator('.tot-c.on .k')).toHaveText(d7.selected)
  const afterRefresh = await readAll()
  expect(afterRefresh.dimmed, 'and the chart is still scoped to it').toBe(29)

  await win.screenshot({ path: 'e2e-out/token-window-today.png' })
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
 *   launch() note on AGENTSHED_NO_FOREGROUND), so a focus assertion here would be unreliable —
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
    // Skeleton up: real static structure (title, four window cards, three side cards, seven tabs)
    // plus placeholder blocks and the inline scanning hint
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
    await expect(win.locator('.scan-hint')).toBeVisible()
    await expect(win.locator('.tot-row .tot-c')).toHaveCount(4)
    await expect(win.locator('.pane-head .stats .stat')).toHaveCount(3)
    await expect(win.locator('.pane-head .tabs .tab')).toHaveCount(7)
    expect(await win.locator('.sk-ph').count()).toBeGreaterThan(0)

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
    expect(e.includes(ERR.sessionFileUnreadable) || e.includes(ERR.sessionNotWhitelisted)).toBe(true)
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

test('opening an artifact whose file was removed after the scan (query layer): a toast surfaces the failure, no overlay, no crash', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-artifact-fail-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const ctx = join(proj, 'CONTEXT.md')
  writeFileSync(ctx, '# Doomed\n\nGone before it opens.\n')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
  await expect(win.locator('.it.ai', { hasText: 'Doomed' })).toBeVisible()

  rmSync(ctx, { force: true })
  await win.locator('.it.ai', { hasText: 'Doomed' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  await expect(win.locator('.reader')).toHaveCount(0)

  await close(l)
})

test('reopening a skill file table (query layer): first expand is slow, reopening it is instant', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-skillcache-'))
  const gskills = join(home, '.claude', 'skills')
  mkdirSync(join(gskills, 'tdd'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'SKILL.md'), '---\ndescription: Red before green\n---\n\nbody\n')
  const l = await launch(undefined, home, { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const row = win.locator('.sk-head', { hasText: 'tdd' })
  await expect(row).toBeVisible()

  await row.click()
  // Sampled inside the 600ms delay window, immediately after the click: still the "listing" placeholder
  await expect(win.locator('.sk-body .files .empty')).toBeVisible()
  await expect(win.locator('.sk-body .files-card')).toBeVisible()

  await row.click() // collapse
  await row.click() // reopen — a cached visit, well inside the delay window
  await expect(win.locator('.sk-body .files-card')).toBeVisible({ timeout: 200 })

  expect(l.errors).toEqual([])
  await close(l)
})

test('reopening an artifact (query layer): first open is slow, reopening it is instant', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-artifactcache-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  writeFileSync(join(proj, 'CONTEXT.md'), '# Cached artifact\n\nbody\n')
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

  expect(l.errors).toEqual([])
  await close(l)
})

// Selectable-span coverage uses the existing fixture-home seam and both public page entries.
// The fixture assistant/usage shape is shared with mkUsageHome's source-derived records.
for (const mount of TREND_MOUNTS) {
  test(`selectable trend span [${mount.name}]: history, independent filters, tabs and refresh`, async () => {
    const home = mkUsageHome()
    const proj = join(home, 'demo-proj')
    const cdir = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
    const history = join(cdir, 'long-history.jsonl')
    const emptyProject = join(home, 'empty-project')
    mkdirSync(emptyProject, { recursive: true })
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {}, [emptyProject]: {} } }))
    const record = (ago: number, input: number) => JSON.stringify({
      type: 'assistant', timestamp: localDayOffset(ago).toISOString(),
      message: { model: 'claude-fable-5', usage: {
        input_tokens: input, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0
      } }
    })
    writeFileSync(history, Array.from({ length: 91 }, (_, ago) => record(ago, 100 + ago)).join('\n') + '\n')
    const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '1200' })
    try {
      const win = await l.app.firstWindow()
      await mount.goto(win)
      const selector = win.getByRole('group', { name: 'Trend days', exact: true })
      await expect(selector.locator('[aria-pressed=\"true\"]')).toHaveText('30')
      const dayKey = (ago: number) => {
        const d = localDayOffset(ago)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const oldBar = win.locator(`.chart .col[data-day="${dayKey(75)}"]`)
      await expect(oldBar).toHaveCount(0)
      const cards = await win.locator('.tot-c').allTextContents()
      for (const span of ['60', '90', '30', '90']) {
        await selector.getByRole('button', { name: span, exact: true }).click()
        await expect(win.locator('.chart .col')).toHaveCount(Number(span))
        await expect(win.locator('.chart .col').last()).toHaveAttribute('data-day', dayKey(0))
        expect((await win.locator('.tot-c').allTextContents()).slice(0, 3)).toEqual(cards.slice(0, 3))
        await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText(`Last ${span} days`)
      }
      await expect(oldBar).toHaveAttribute('data-tip', /185/)
      await expect(win.locator('.chart .col').first()).toHaveAttribute('data-day', dayKey(89))
      await win.locator('.seg button', { hasText: 'Codex' }).click()
      await expect(selector.locator('[aria-pressed=\"true\"]')).toHaveText('90')
      await expect(oldBar.locator('.sp')).toHaveCount(0)
      await win.locator('.tot-c').nth(2).click()
      await expect(win.locator('.chart .col.out')).toHaveCount(83)
      await selector.getByRole('button', { name: '60', exact: true }).click()
      await expect(win.locator('.chart .col.out')).toHaveCount(53)
      await expect(win.locator('.seg button.on')).toHaveText('Codex')
      await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
      await win.locator('.pane-head .tabs .tab', { hasText: mount.name.startsWith('Agents') ? 'Token' : 'Overview' }).click()
      await expect(selector.locator('[aria-pressed=\"true\"]')).toHaveText('60')
      await selector.getByRole('button', { name: '90', exact: true }).click()
      await win.locator('.seg button', { hasText: 'Total' }).click()
      await win.locator('.tot-c').first().click()
      await expect(win.locator('.chart .col.out')).toHaveCount(0)
      appendFileSync(history, record(75, 100) + '\n')
      await expect(oldBar).toHaveAttribute('data-tip', /total 295\n/, { timeout: 15000 })
      await expect(selector.locator('[aria-pressed=\"true\"]')).toHaveText('90')
      if (mount.name.startsWith('project')) {
        await win.locator('.side .row', { hasText: 'empty-project' }).click()
        await expect(selector.locator('[aria-pressed=\"true\"]')).toHaveText('90')
        await expect(win.locator('.chart .col')).toHaveCount(90)
        await expect(win.locator('.chart .sp')).toHaveCount(0)
        await win.locator('.side .row', { hasText: 'demo-proj' }).click()
        await expect(selector.locator('[aria-pressed=\"true\"]')).toHaveText('90')
        await expect(oldBar).toHaveAttribute('data-tip', /total 295\n/)
      }
      // Real geometry, nonempty dense data, at the application's minimum width.
      await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 700))
      await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(800)
      const readGeometry = () => win.evaluate(() => {
        const axis = document.querySelector('.xaxis')!.getBoundingClientRect()
        const labels = [...document.querySelectorAll('.xaxis span')].map(e => e.getBoundingClientRect())
        const bars = [...document.querySelectorAll('.chart .col')].map(e => e.getBoundingClientRect())
        const control = document.querySelector('.trend-span-options')!.getBoundingClientRect()
        return { labels: labels.length, overlap: labels.slice(1).some((r,i) => r.left < labels[i].right),
          outside: labels.some(r => r.left < axis.left || r.right > axis.right),
          overflow: labels.map(r => ({ left: axis.left - r.left, right: r.right - axis.right })),
          minBar: Math.min(...bars.map(r=>r.width)), controlVisible: control.left >= 0 && control.right <= window.innerWidth }
      })
      // ResizeObserver runs after the viewport resize; poll the labels themselves, not innerWidth.
      await expect.poll(readGeometry).toMatchObject({ outside: false, overlap: false, controlVisible: true })
      const geometry = await readGeometry()
      expect(geometry.labels).toBeGreaterThan(1)
      expect(geometry.overlap).toBe(false)
      expect(geometry.outside, JSON.stringify(geometry)).toBe(false)
      expect(geometry.minBar).toBeGreaterThan(0)
      expect(geometry.controlVisible).toBe(true)
      expect(l.errors).toEqual([])
    } finally {
      await close(l)
    }
  })
}

test('selectable trend span: localized controls fit both pages in light and dark at minimum width', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const l = await launchAppearance(mkUsageHome())
  try {
    const win = await l.app.firstWindow()
    await win.waitForSelector('.rail')
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 700))
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(800)
    const names = [
      ['zh', '趋势天数'], ['en', 'Trend days'], ['fr', 'Nombre de jours de la tendance'],
      ['es', 'Días de la tendencia'], ['ru', 'Количество дней на графике'], ['ja', '推移の日数']
    ]
    for (const [lang, name] of names) {
      for (const mode of ['light', 'dark']) {
        for (const theme of ['purple', 'blue', 'amber']) {
        await win.locator('.ri.set').click()
        await win.locator(`[data-theme-option="${theme}"]`).click()
        await win.getByTestId('language-trigger').click()
        await win.getByTestId('language-pop').locator(`[data-lang="${lang}"]`).click()
        await win.locator(`[data-mode-option="${mode}"]`).click()
        await expect.poll(() => effectiveDark(win)).toBe(mode === 'dark')
        for (const page of [0, 1]) {
          await win.locator('.rail .ri').nth(page).click()
          if (page === 1) await win.locator('.side .row', { hasText: 'demo-proj' }).click()
          await win.locator('.pane-head .tabs .tab').first().click()
          const selector = win.getByRole('group', { name, exact: true })
          await selector.getByRole('button', { name: '90', exact: true }).click()
          await expect(win.locator('.chart .col')).toHaveCount(90)
          const geometry = await win.locator('.trend-heading').evaluate((heading) => {
            const box = heading.getBoundingClientRect()
            const children = [...heading.children].map(e => e.getBoundingClientRect())
            const control = heading.querySelector('[aria-pressed="true"]')!
            const style = getComputedStyle(control)
            return {
              clipped: children.some(r => r.left < box.left || r.right > box.right || r.bottom > box.bottom),
              overlap: children.some((a, i) => children.slice(i + 1).some(b =>
                a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)),
              height: box.height, background: style.backgroundColor, color: style.color
            }
          })
          expect(geometry.clipped, `${lang}/${mode}/${page}`).toBe(false)
          expect(geometry.overlap, `${lang}/${mode}/${page}`).toBe(false)
          expect(geometry.height).toBeLessThan(100)
          expect(geometry.color).not.toBe(geometry.background)
          const selected = selector.getByRole('button', { name: '90', exact: true })
          const style = await selected.evaluate(el => {
            const reference = document.createElement('span')
            reference.style.color = 'var(--accent)'
            document.body.append(reference)
            const accent = getComputedStyle(reference).color
            reference.remove()
            return ({
            weight: getComputedStyle(el).fontWeight,
            color: getComputedStyle(el).color,
            accent,
            rects: [...el.parentElement!.querySelectorAll('button')].map(b => ({ left: b.getBoundingClientRect().left, right: b.getBoundingClientRect().right }))
          })})
          expect(style.weight).toBe('700')
          expect(style.rects[0].right).toBeLessThan(style.rects[1].left)
          expect(style.rects[1].right).toBeLessThan(style.rects[2].left)
          await expect(selected).toHaveCSS('color', style.accent)
          await expect(win.locator('.tot-c').nth(3).locator('.k')).not.toContainText('30')
          if (theme === 'purple' && (lang === 'zh' || lang === 'ru')) {
            await expect(win.locator('.toast')).toHaveCount(0)
            await win.screenshot({ path: testInfo.outputPath(`trend-${lang}-${mode}-${page}.png`) })
          }
        }
      }
    }
    }
    expect(l.errors).toEqual([])
  } finally {
    await close(l)
  }
})
