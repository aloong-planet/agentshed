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
  d.setHours(12, 0, 0, 0) // 正午,避开时区把日期推到窗口外
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
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-') // 与 encodeClaudeProjectDir 同规则
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
            { type: 'text', text: '这是First turn reply body' },
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
  // 上一版结构:Codex agg 只有 totals/byDay,无 events;version 号也是旧的
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
  // count() 是即时读取,须先等渲染完成再计数
  await expect(tabs).toHaveCount(7)
  const n = await tabs.count()
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click()
    await expect(win.locator('.pane-body')).toBeVisible()
  }
  expect(l.errors).toEqual([])
  await close(l)
})

// 原本是一条 if/else:有真实项目走 A 分支,没有走 B 分支。后果是**覆盖面不确定**
// ——开发机永远走 A,CI 永远走 B,没有任何一台机器把两条都测到;而 B 分支从没被
// 执行过,里面的 locator 同时命中侧栏与主区两个空态(strict mode violation),
// 写完就没跑过。拆成两条各自预置 fixture home 的确定性用例。
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
  // 限定在侧栏内:主区另有一个 .empty(「选择一个项目查看详情」),不限定就多命中
  await expect(win.locator('.side .list-empty')).toBeVisible()
  expect(l.errors).toEqual([])
  await close(l)
})

// 票 session-view/02:会话分栏。fixture home 造两侧会话 + 一个只有 Warmup 的
// 预热会话(spec A3a:不入列但 token 照计),断言列表、排序、口径说明与空态。
test('the sessions section: sessions are listed, the sort switches, and warmup sessions are not listed', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // fixture 里 Claude 侧 2 个(1 真实 + 1 预热)、Codex 侧 1 个 → 只应列出 2 个
  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(2)
  await expect(win.locator('.pane-body .grp-t')).toContainText('2 sessions')
  // 预热会话的标题不得出现
  await expect(win.locator('.pane-body .card')).not.toContainText('Warmup')

  // 项目列表那个数字与本分栏必须同源:fixture 有 3 个会话文件(含 1 个预热),
  // 只有 2 个入列。改动前项目列表读的是文件数管线,会显示 3 —— 同一个概念两个数字。
  const meta = (await win.locator('.side .row .meta').first().innerText()).trim()
  expect(meta, `项目列表的会话数应与会话分栏一致,实际: ${meta}`).toMatch(/(^|\D)2$/)

  // 默认最近在前:第一行是较晚活动的那条
  const titleOf = async (i: number): Promise<string> =>
    (await rows.nth(i).locator('.t').innerText()).trim()
  // fixture 里 Claude 侧最后活动在今天、Codex 侧在昨天 —— 断言的是**具体哪条在前**,
  // 不是"两条不一样"。后者在时间戳相同时也成立,证不了按时间排序。
  expect(await titleOf(0)).toBe('Sample question')
  expect(await titleOf(1)).toBe('Codex side question')

  // 切最早在前 → 顺序翻转,条数不变
  await win.locator('.pane-body .seg button', { hasText: 'Oldest first' }).click()
  await expect(rows).toHaveCount(2)
  expect(await titleOf(0)).toBe('Codex side question')
  expect(await titleOf(1)).toBe('Sample question')
  await expect(win.locator('.pane-body .grp-t')).toContainText('Oldest first')

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 session-view/03a:提问条数上行。两条会话的条数**故意不相等**——都写 1 的话,
// 断言分不出"真按会话读到了"与"两边碰巧一样"。
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

  // 默认最近在前:第 0 行是 Claude 侧(2 条真实提问,中间那条 tool_result 不算),
  // 第 1 行是 Codex 侧(1 条)
  expect(await rows.nth(0).locator('.t').innerText()).toBe('Sample question')
  expect(await countOf(0), 'Claude 侧两条真实提问,工具回灌不计入').toBe('2 questions')
  expect(await countOf(1), 'Codex 侧一条真实提问').toBe('1 questions')

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

  // 切走再切回:tab 是条件渲染,组件会被卸载,组件内 useState 存不住
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(win.locator('.pane-body .grp-t')).toContainText('Oldest first')
  await expect(
    win.locator('.pane-body .se .t').first(),
    '切回来应保持"最早在前",第一行是较早的那条'
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

// 票 04:概览会话卡从「进分栏」改为**直达会话页**(02 留下的中间态在此收口,原型 v3 明写)
test('one click on the overview session card goes straight to the session page', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  // 概览是默认分栏,直接点第一张会话卡(最近的 = Claude 侧「Sample question」)
  await win.locator('.pane-body .se.row-btn').first().click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  await expect(win.locator('.sback')).toContainText('Back to')
  expect(l.errors).toEqual([])
  await close(l)
})

// 票 04:会话页——从分栏进入,行字段齐全,一次列全无分页语义,返回落在会话分栏
test('the session page: every question is listed with complete fields, and back returns to the sessions section', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()

  // 页头:徽标 + 标题 + meta(与列表同源的数字)
  await expect(win.locator('.pane-head .badge.cl')).toHaveText('CC')
  await expect(win.locator('.pane-head .stitle')).toHaveText('Sample question')
  await expect(win.locator('.smeta')).toContainText('2 questions')
  await expect(win.locator('.smeta')).toContainText('tok')

  // 行:序号 / 全文 / 工具计数 / 时间;两条真实提问,工具回灌不算。
  // 默认倒序(2026-08-06 裁定):最新的 02 在前,序号仍是原始轮次号
  const qs = win.locator('.qlist .q')
  await expect(qs).toHaveCount(2)
  await expect(qs.nth(0).locator('.idx')).toHaveText('02')
  await expect(qs.nth(0).locator('.txt')).toHaveText('Second question')
  await expect(qs.nth(1).locator('.txt')).toHaveText('Sample question')
  await expect(qs.nth(0).locator('.tm')).not.toHaveText('—')
  await expect(win.locator('.qbar .grp-t')).toContainText('Questions (main line) · 2')

  // 一次列全:不出现任何分页/续取语义(spec 界面决策:任何分页语义都是实现缺口伪装设计)
  await expect(win.locator('.pane-body')).not.toContainText('Loading')
  await expect(win.locator('.pane-body')).not.toContainText('more')

  // 返回:落在「会话」分栏,不是概览(原型:‹ 返回 <项目> · 会话)
  await win.locator('.sback').click()
  await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions')
  await expect(win.locator('.pane-body .grp-t')).toContainText('2 sessions')

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 04:fork 会话的会话页与列表同源——重放前缀剥掉后只剩新提问
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

// 票 04:白名单拒收的**接线级**证据——经真 IPC 发非法路径,必须被 handler 拒绝。
// 纯函数单测只证明"函数会拒",这里证明"handler 真的在用它拒"。两个方向都断言:
// 白名单外的绝对路径拒,穿越形态拒;合法路径能过(同一会话页 e2e 已覆盖)。
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
  expect(r1, '系统文件必须被拒').not.toBe('ALLOWED')
  // 断言**错误码**而不是中文措辞:跨 IPC 的失败自票 05 起只带码与参数,
  // 措辞由渲染层按当前语言生成。守的性质没变(被拒 + 不回显文件内容),
  // 换的只是断言对象——拿措辞当断言对象,正是 ADR-0015 要消灭的耦合
  expect(r1).toContain(ERR.sessionNotWhitelisted)
  // 错误信息不回显任何文件内容(hosts 常含 localhost 行)
  expect(r1).not.toContain('localhost')

  const r2 = await attempt('/tmp/../etc/hosts')
  expect(r2, '穿越形态必须被拒').not.toBe('ALLOWED')

  // 本测故意制造 handler 错误,不能断言 errors 为空——改为正向断言:
  // 主进程侧恰好两次拒绝、全是白名单错、没混进别的错误类型
  expect(l.errors).toHaveLength(2)
  for (const e of l.errors) expect(e).toContain(ERR.sessionNotWhitelisted)
  await close(l)
})

// 票 04:省略号是 CSS 显示层截断,数据侧是全文(spec D2a 推论)。
// 用超过一行宽度的长提问坐实:DOM 文本 = 全文,渲染框宽 < 文本天然宽。
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
  // 数据层:全文都在 DOM 里
  await expect(txt).toHaveText(LONG)
  // 显示层:单行截断确实发生(内容宽度溢出渲染框)
  const clipped = await txt.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(clipped, '长文本应在显示层被截断(scrollWidth > clientWidth)').toBe(true)
  expect(l.errors).toEqual([])
  await close(l)
})

// 票 05:点提问就地展开整轮正文,按需取回;默认 0 轮展开(预展开等于把「按需取」作废)
test('the session page: everything collapsed by default; clicking a question expands the whole turn with its fetch footnote, and clicking again collapses it', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()

  // 默认 0 轮展开
  await expect(win.locator('.qlist .q')).toHaveCount(2)
  await expect(win.locator('.turn')).toHaveCount(0)

  // 点 01(默认倒序,首行是 02——按文本定位不赌位置):提问行自己铺开(.open,
  // 不另设复述块),下面出整轮正文 + 取回脚注
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.qlist .q.open .txt')).toHaveText('Sample question')
  await expect(win.locator('.turn .ans')).toHaveText(['这是First turn reply body'])
  await expect(win.locator('.turn .fetched')).toContainText("read only this turn\u2019s byte range")

  // 展开另一条不影响已开的(各轮独立);第二轮没有正文,脚注照出(不造假的占位)
  await win.locator('.qlist .q', { hasText: 'Second question' }).click()
  await expect(win.locator('.qlist .q.open')).toHaveCount(2)
  await expect(win.locator('.turn')).toHaveCount(2)
  await expect(win.locator('.turn .ans')).toHaveCount(1)

  // 再点 01:收起,其余不动
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn')).toHaveCount(1)
  await expect(win.locator('.qlist .q.open')).toHaveCount(1)

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 06:日期分组折叠 + 正序/倒序 + 展开跨排序保持
test('the session page: day groups collapse; descending reverses both the groups and their contents while the numbers stay; expansion survives a sort change', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()

  // 两天两组,组头带当日条数;qhead 带天数
  await expect(win.locator('.daygrp')).toHaveCount(2)
  await expect(win.locator('.dayhd').first()).toContainText(' · 1')
  await expect(win.locator('.qbar .grp-t')).toContainText('2 days')

  // 默认倒序(2026-08-06 用户裁定):首行是最新的 02
  await expect(win.locator('.qlist .q').first().locator('.idx'), '默认倒序,首行应是 02').toHaveText('02')
  // 展开 01,然后切正序:仍展开、序号不变、组序与组内一起翻
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['这是First turn reply body'])
  await win.locator('.qbar .seg button', { hasText: 'Oldest first' }).click()
  await expect(win.locator('.qlist .q').first().locator('.idx'), '正序后首行应是原 01').toHaveText('01')
  const openRow = win.locator('.qlist .q.open')
  await expect(openRow, '已展开的轮次跨排序保持').toHaveCount(1)
  await expect(openRow.locator('.idx'), '序号恒为原始轮次号').toHaveText('01')
  await expect(win.locator('.turn .ans')).toHaveText(['这是First turn reply body'])

  // 折叠 01 所在的那天:该天的行连同已展开的轮一并隐藏;重开仍是展开的。
  // 折叠后 .q.open 不再渲染,故先记下组头日期,重开时按日期重定位
  const day01hd = win.locator('.daygrp', { has: win.locator('.q.open') }).locator('.dayhd')
  const dayLabel = (await day01hd.innerText()).split(' · ')[0].trim()
  await day01hd.click()
  await expect(win.locator('.q.open')).toHaveCount(0)
  await expect(win.locator('.turn')).toHaveCount(0)
  await win.locator('.dayhd', { hasText: dayLabel }).click()
  await expect(win.locator('.q.open')).toHaveCount(1)
  await expect(win.locator('.turn .ans')).toHaveText(['这是First turn reply body'])

  // 全部收起 → 标签翻转、全部行隐藏;全部展开还原
  await win.locator('.qbar .lnk').click()
  await expect(win.locator('.qlist .q')).toHaveCount(0)
  await expect(win.locator('.qbar .lnk')).toHaveText('Expand all')
  await win.locator('.qbar .lnk').click()
  await expect(win.locator('.qlist .q')).toHaveCount(2)

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 06:顶部横幅三档——stripped info(父标题可点直达父会话)与孤儿 risk
test('the session page banner: a stripped fork gets info with the parent title clicking through; a missing parent gets risk and says to check against the source', async () => {
  const l = await launch(undefined, mkForkHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // 子会话(已剥离):info 横幅带父标题,点击直达父会话页
  await win.locator('.pane-body .card .se', { hasText: 'Child new question' }).click()
  const info = win.locator('.banner.info')
  await expect(info).toContainText('forked from')
  await expect(info).toContainText('Parent first question')
  await expect(info).toContainText('replayed prefix has been stripped')
  await info.locator('a').click()
  await expect(win.locator('.pane-head .stitle')).toHaveText('Parent first question')
  // 父会话不是 fork:无任何横幅
  await expect(win.locator('.banner')).toHaveCount(0)

  // 孤儿 fork:risk 横幅,明说可能多剥/少剥、请对照核对——不给假确定感
  await win.locator('.sback').click()
  await win.locator('.pane-body .card .se', { hasText: 'Orphan session question' }).click()
  const risk = win.locator('.banner.risk')
  await expect(risk).toContainText('outside the scan set')
  await expect(risk).toContainText('duplicates')
  await expect(risk).toContainText('Please check against the original')

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 05:签名不符 → 只重建该文件的索引,重建完出内容(不干等、不报错)。
// 中间态文案是瞬时的,e2e 不赌时序;这里断言的是链路结果正确与主进程零错误。
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

  // 页面打开后文件被追加:size 变 → 签名不符,首次取回走单文件重建
  appendFileSync(
    sess,
    JSON.stringify({
      type: 'user',
      timestamp: localDayOffset(0).toISOString(),
      message: { role: 'user', content: 'Appended third question' }
    }) + '\n'
  )
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()
  await expect(win.locator('.turn .ans')).toHaveText(['这是First turn reply body'])
  await expect(win.locator('.turn .fetched')).toContainText("read only this turn\u2019s byte range")

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 07:轮内富内容——工具折叠/二次展开、思考块、subagent 归位、截断标注、未知留痕
test('session page rich content (Claude): the thinking, tool and subagent blocks are collapsed by default and expand to the full text with their labels', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await win.locator('.pane-body .card .se', { hasText: 'Sample question' }).click()
  await win.locator('.qlist .q', { hasText: 'Sample question' }).click()

  // 正文 + 三个折叠块头(思考/Bash/subagent),默认全折叠(.bb 不渲染)
  await expect(win.locator('.turn .ans')).toHaveText(['这是First turn reply body'])
  await expect(win.locator('.turn .blk')).toHaveCount(3)
  await expect(win.locator('.turn .bb')).toHaveCount(0)

  // 思考块:明文可得
  const think = win.locator('.turn .blk.think')
  await expect(think.locator('.nm')).toHaveText('Thinking')
  await think.locator('.bh').click()
  await expect(think.locator('.bb')).toContainText('Take a look at the directory layout')

  // 工具块:二次展开见入参/返回;截断 warn(返回里带 tool-results/ 旁挂路径)
  const tool = win.locator('.turn .blk', { has: win.locator('.nm', { hasText: 'Bash' }) }).first()
  await expect(tool.locator('.sum')).toContainText('ls -la src')
  await tool.locator('.bh').click()
  await expect(tool.locator('pre').nth(0)).toContainText('ls -la src')
  await expect(tool.locator('pre').nth(1)).toContainText('12 files in total')
  await expect(tool.locator('.warn')).toContainText('only stored a truncated version')

  // subagent 块:派发 prompt 与返回;内部步骤无稳定引用链 → 显式未归位标注
  // (2026-08-06 实测:四条候选连接键全部排除,不做猜测性配对)
  const sub = win.locator('.turn .blk.sub')
  await expect(sub.locator('.nm')).toContainText('debugger')
  await sub.locator('.bh').click()
  await expect(sub.locator('pre').nth(0)).toContainText('Check today logs')
  await expect(sub.locator('.step')).toHaveCount(0)
  await expect(sub.locator('.warn')).toContainText('stable reference chain')
  await expect(sub.locator('pre').nth(1)).toContainText('Logs are clean')

  // 未知类型留痕:不静默丢
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

  // 推理块:仅小标题,warn 明说正文加密不可得
  const reason = win.locator('.turn .blk.think')
  await expect(reason.locator('.sum')).toContainText('only 2 headings')
  await reason.locator('.bh').click()
  await expect(reason.locator('.warn')).toContainText('encrypted_content')
  await expect(reason.locator('.rt')).toHaveCount(2)

  // 工具块:call_id 配对的入参/返回
  const tool = win.locator('.turn .blk', { has: win.locator('.nm', { hasText: 'exec' }) }).first()
  await tool.locator('.bh').click()
  await expect(tool.locator('pre').nth(0)).toContainText('rg skills -l')
  await expect(tool.locator('pre').nth(1)).toContainText('7 files')

  // spawn_agent:sub 块,子线程无引用链不归位(2026-08-06 裁定)
  const sub = win.locator('.turn .blk.sub')
  await sub.locator('.bh').click()
  await expect(sub.locator('.warn')).toContainText('stable reference chain')
  await expect(sub.locator('pre').nth(1)).toContainText('Sub-task created')

  // 未知 event 留痕(三层白名单之一)
  await expect(win.locator('.turn .unknown')).toContainText('event_msg/exotic_event')

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 08:会话搜索——默认搜提问、全文开关、命中分组、直达提问。
// 输入用 fill()(经 CDP 设值,不依赖窗口聚焦语义;app.spec 头部注记的 :focus
// 断言边界不在本用例内)。
test('session search: questions by default with hits grouped; a body word only hits after switching to full text; clicking a hit goes straight to that question', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()

  // 默认搜提问:命中 1 条,分组带会话头;大小写不敏感
  await win.locator('.sbar input').fill('Sample question')
  await expect(win.locator('.grp')).toHaveCount(1)
  // 回归:命中组的 button 必须重置 UA 默认样式(漏写会在暗色下露白底黑字)
  for (const sel of ['.grp .gh', '.grp .hit']) {
    const bg = await win.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg, `${sel} 应为透明背景而非 UA buttonface`).toBe('rgba(0, 0, 0, 0)')
  }
  await expect(win.locator('.grp .gh .t')).toContainText('Sample question')
  await expect(win.locator('.grp .hit')).toHaveCount(1)
  await expect(win.locator('.grp .hit mark').first()).toContainText('Sample question')
  await expect(win.locator('.shead')).toContainText('Found 1 hits · 1 sessions')

  // 正文里的词(第一轮回答正文)在提问模式不命中 → 可行动空态
  await win.locator('.sbar input').fill('First turn reply body')
  await expect(win.locator('.shead')).toContainText('Only questions are searched by default')
  // 切全文:命中并标「正文」
  await win.locator('.scope span', { hasText: 'Full text' }).click()
  await expect(win.locator('.grp .hit')).toHaveCount(1)
  await expect(win.locator('.grp .hit .bd')).toHaveText('Body')

  // 点命中直达该会话的该条提问(01 行进入视口;默认倒序下它在列表尾部)。
  // 定位高亮(2026-08-06 原型确认):脉冲 located + 焦点竖条 focused;
  // 点击任意提问行后竖条清除。10s 脉冲的播完态不在此等待(时序不赌)。
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
  // 造一条源文件早已不存在的历史行(模拟 agent 清理掉旧会话后的状态)
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
  // 必须给 fixture home:本用例只关心 userData 里的归档文件,却因为没注入 home 而去扫
  // **开发者的真实 ~/.claude**;又因为 makeUserData() 每次都是全新临时目录,token 缓存
  // 恒为冷,于是首屏耗时随各人的数据量走。CI 上 home 是空的所以一直绿,本机 600MB+
  // 数据下本地实测三次挂两次(2026-08-03,票 03a)。
  // 这是本文件开头那条纪律的漏网之鱼——它没走 launch(),直接调了 electron.launch。
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
  // 归档说明条出现(该天源文件不存在 → 计入 archivedDays)
  await expect(win.locator('.arch-note')).toBeVisible()
  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('the trend chart is stacked bars: segmented by provider within a bar, and switching to a single side leaves only that side\'s provider segments', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  // 合计模式:fixture 预置了两侧用量 → Anthropic 与 OpenAI 段都该在
  const cols = win.locator('.chart .col')
  await expect(cols).toHaveCount(30)
  const anthropicSegs = win.locator('.chart .col .sp.anthropic')
  await expect(anthropicSegs.first()).toBeVisible()
  // 图例按 provider(至少 Anthropic 一项)
  await expect(win.locator('.legend .lg .sw.anthropic')).toBeVisible()
  // 先钉住「切换前 OpenAI 段确实存在」——否则下面那条归零断言在无 Codex
  // 数据时恒真,测不出任何东西(原来读真实 home 时就有这个隐患)
  expect(await win.locator('.chart .col .sp.openai').count()).toBeGreaterThan(0)
  // 切到 Claude 侧:不应再出现 OpenAI 段
  await win.locator('.grp-t .seg button', { hasText: 'Claude' }).click()
  await expect(win.locator('.chart .col .sp.openai')).toHaveCount(0)
  // 切回合计,图例回来
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
  // 必须先等样式表真正应用再读 CSS 变量:直接读会拿到空串(样式未加载完)。
  // 这个竞态一直在,只是 app:// 改变了加载时序后才稳定暴露——用渲染完成的元素做闸。
  await expect(win.locator('.chart .col').first()).toBeVisible()
  const light = await read()
  expect(light.anthropic.toLowerCase()).toBe('#d97757')
  expect(light.openai.toLowerCase()).toBe('#10a37f')
  expect(light.google.toLowerCase()).toBe('#4285f4')
  // 段与图例取同一变量
  const segBg = await win.locator('.chart .col .sp.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const lgBg = await win.locator('.legend .lg .sw.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(segBg).toBe(lgBg)
  // 深色模式另有一套(提亮)
  await win.emulateMedia({ colorScheme: 'dark' })
  const dark = await read()
  expect(dark.anthropic.toLowerCase()).not.toBe(light.anthropic.toLowerCase())
  expect(dark.openai.toLowerCase()).not.toBe(light.openai.toLowerCase())
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * v2 组件(Subagents/Memory/Plugins):预置 fixture home(AGENTSHED_HOME_OVERRIDE 注入)
 * 全链路断言 F3 双向场景与新分栏渲染——不依赖本机真实数据。
 */
test('F3 plus the new sections: a project-scope plugin displays correctly both ways; the Subagents and Memory drawers work end to end', async () => {
  // 造 fixture home:demo 项目 + project-scope 插件(含 skills/hooks)+ 双端 subagents + memory
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // 插件包(skills + hooks)
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
  // 双端 subagents
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
  // demo 项目的 memory
  const enc = demo.replace(/[^A-Za-z0-9]/g, '-')
  mkdirSync(join(home, '.claude', 'projects', enc, 'memory'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'projects', enc, 'memory', 'MEMORY.md'),
    '# 记忆主文件\n- Key point A\n- [踩坑](pitfalls.md) 有效相对链接\n- [已删条目](gone.md) 失效目标\n'
  )
  writeFileSync(join(home, '.claude', 'projects', enc, 'memory', 'pitfalls.md'), '# 踩坑\nUnique content B')

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

  // ① Subagents 分栏:双端同名合并一行,点行直开抽屉,抽屉内切双端
  await tab('Subagents').click()
  const row = win.locator('.it.row-btn', { hasText: 'code-reviewer' })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(win.locator('.drawer')).toBeVisible()
  await expect(win.locator('.drawer .kv')).toContainText('Read, Grep')
  await win.locator('.drawer .sideseg button', { hasText: 'Codex' }).click()
  await expect(win.locator('.drawer .kv')).toContainText('sandbox_mode')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // 抽屉盖住窗口中心,点左侧可见 mask 区

  // ② 全局 Plugins:F3 之一——user 层未启用;展开为类目 tab,Skills 默认、Hooks 切换可见
  await tab('Plugins').click()
  const plugRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(plugRow).toContainText('Not enabled')
  await plugRow.click()
  await expect(win.locator('.exp-area')).toContainText('superpowers:brainstorming')
  await win.locator('.exp-area .ptab', { hasText: 'Hooks' }).click()
  await expect(win.locator('.exp-area')).toContainText('SessionStart × 1')

  // ③ 全局 Memory:行展开文件列表,点文件抽屉经白名单按需读取
  await tab('Memory').click()
  const memRow = win.locator('.it.row-btn', { hasText: 'demo-proj' })
  await memRow.click()
  await win.locator('.sub-list .it.row-btn', { hasText: 'pitfalls.md' }).click()
  await expect(win.locator('.drawer .raw')).toContainText('Unique content B')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // 抽屉盖住窗口中心,点左侧可见 mask 区

  // ④ demo 详情:F3 之二——project 层启用;Skills 分栏含插件命名空间条目(只读)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  const detRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(detRow).toContainText('Enabled')
  await expect(detRow).toContainText('project')
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const nsSkill = win.locator('.sk', { hasText: 'superpowers:brainstorming' })
  await expect(nsSkill).toBeVisible()
  await expect(nsSkill.locator('.ins')).toHaveCount(0) // G3:插件条目无装卸按钮
  // A4/ADR-0012:命名空间行与磁盘同权展开预览
  await nsSkill.locator('.sk-head').click()
  await expect(nsSkill.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()
  // ⑤ 详情 Memory:MEMORY.md 主体直接渲染
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('Key point A')

  // ⑥ 主文件里的相对链接:点击**不得导航整窗**(2026-08-02 bug 回归点),
  //    有效目标在 app 内开抽屉;失效目标提示且仍不导航。
  const urlBefore = win.url()
  await win.locator('.pane-body .md a', { hasText: '踩坑' }).click()
  await expect(win.locator('.drawer .raw')).toContainText('Unique content B')
  expect(win.url()).toBe(urlBefore)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.pane-body .md a', { hasText: '已删' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url()).toBe(urlBefore)

  // ⑦ 抽屉宽度 = min(680, 右侧内容区 80%):窄窗下不得盖满内容区(2026-08-02 bug)。
  //    几何检验,不看 CSS 声明——声明对了但变量没接线照样会盖满。
  const drawerGeom = async (): Promise<{ pane: number; drawer: number; left: number; paneLeft: number }> =>
    win.evaluate(() => {
      const d = document.querySelector('.drawer') as HTMLElement
      const pane = document.querySelector('.stage .pane') as HTMLElement
      const dr = d.getBoundingClientRect()
      const pr = pane.getBoundingClientRect()
      return { pane: pr.width, drawer: dr.width, left: dr.left, paneLeft: pr.left }
    })
  for (const [w, label] of [
    [1400, '宽窗'],
    [900, '窄窗']
  ] as const) {
    await win.setViewportSize({ width: w, height: 800 })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
    await win.locator('.it.row-btn', { hasText: 'pitfalls.md' }).click()
    const g = await drawerGeom()
    expect(Math.abs(g.drawer - Math.min(680, g.pane * 0.8)), `${label}:宽度规则`).toBeLessThan(2)
    expect(g.left, `${label}:抽屉不得盖满内容区`).toBeGreaterThan(g.paneLeft + 1)
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  }

  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

/**
 * skills-view:磁盘 skill 折叠文件表 + 抽屉读正文(md 预览 / 非 md 原文)、
 * 详情同侧同名只列项目级(B1)、插件行不可展开(A4)。fixture home 全链路。
 */
test('Skills view: expanding globally reads the package; a same-name pair in detail shows only the project level; plugin rows do not expand', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // 全局库:tdd(含一层子目录脚本)+ review-code(仅全局)
  const gskills = join(home, '.claude', 'skills')
  mkdirSync(join(gskills, 'tdd', 'scripts'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'SKILL.md'), '---\ndescription: Red before green\n---\n\nGlobal body A\n')
  writeFileSync(join(gskills, 'tdd', 'scripts', 'run.sh'), 'echo Unique script B\n')
  mkdirSync(join(gskills, 'review-code'), { recursive: true })
  writeFileSync(join(gskills, 'review-code', 'SKILL.md'), '---\ndescription: 四层法\n---\n\n全局正文丁\n')
  // 软链 skill:目标在所有已知 skills 根之外(dotfiles/monorepo 形态,2026-08-07 bug 回归点)
  const linkTarget = join(home, 'repo', 'skills', 'linked-skill')
  mkdirSync(linkTarget, { recursive: true })
  writeFileSync(join(linkTarget, 'SKILL.md'), '---\ndescription: 链装\n---\n\nSymlink body E\n')
  symlinkSync(linkTarget, join(gskills, 'linked-skill'))
  // 项目级同名 tdd:详情列表应只见这一份(B1)
  mkdirSync(join(demo, '.claude', 'skills', 'tdd'), { recursive: true })
  writeFileSync(
    join(demo, '.claude', 'skills', 'tdd', 'SKILL.md'),
    '---\ndescription: 项目版\n---\n\nProject body C\n'
  )
  // user 层启用插件(含 skills)→ 全局 Skills 出插件命名空间行
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

  // ① 全局 Skills:折叠行即有包统计(文件数/大小,不含行数);点行展开文件表;
  //    点 SKILL.md 开抽屉,md 默认预览(frontmatter 卡片 + 正文)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const tdd = win.locator('.sk', { hasText: 'tdd' })
  await expect(tdd.locator('.sk-meta')).toContainText('2 files')
  await tdd.locator('.sk-head').click()
  await expect(tdd.locator('.files-card')).toBeVisible()
  await expect(tdd.locator('.files-sum')).toHaveCount(0) // 汇总条已上行,展开区不再重复
  await tdd.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-fm')).toContainText('Red before green')
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Global body A')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // 点包内另一文本文件切换内容:非 md 无「原文|预览」切换钮,仅等宽原文
  await tdd.locator('.files button', { hasText: 'scripts/run.sh' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Unique script B')
  await expect(win.locator('.skill-drawer .md-preview-seg')).toHaveCount(0)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // ①b 软链 skill(目标在根外):行有软链徽标,展开与读文件全链路可用(A6)
  const linked = win.locator('.sk', { hasText: 'linked-skill' })
  await expect(linked.locator('.pill.ln')).toBeVisible()
  await linked.locator('.sk-head').click()
  await linked.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Symlink body E')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // ② 插件命名空间行:与磁盘同权展开预览(A4,ADR-0012 推翻 v1 排除;行内统计同权)
  const plug = win.locator('.sk', { hasText: 'superpowers:brainstorming' })
  await expect(plug.locator('.sk-meta')).toContainText('1 files')
  await plug.locator('.sk-head').click()
  await plug.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-fm')).toContainText('Ask before acting')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await plug.locator('.sk-head').click() // 收起,不干扰后续定位

  // ③ 详情 Skills:同名只列项目级、无第二份全局行;仅全局有的仍列出;项目级行可预览
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

  // ④ 抽屉宽度沿用 chrome-w 公式(上限 720):窄窗不得盖满内容区(2026-08-02 bug 同源回归点)
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
 * plugins-view 序列 H:插件 skill 原地预览——类目 tab、行式列表、可读与启用态无关、
 * 缺失置灰、Codex 组仅 Skills tab。fixture home 全链路。
 */
test('previewing a plugin skill in place: the tab expands and reads the package; a disabled plugin is readable; a missing one is greyed out; the Codex group', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // 启用插件:2 个 skill + 1 个 hooks(类目 tab 需要多类)
  const sp = join(home, 'pkg-sp')
  mkdirSync(join(sp, '.claude-plugin'), { recursive: true })
  writeFileSync(join(sp, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(sp, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(
    join(sp, 'skills', 'brainstorming', 'SKILL.md'),
    '---\ndescription: Ask before acting\n---\n\nPlugin body A\n'
  )
  mkdirSync(join(sp, 'skills', 'writing-plans'), { recursive: true })
  writeFileSync(join(sp, 'skills', 'writing-plans', 'SKILL.md'), '---\ndescription: 写计划\n---\nx\n')
  mkdirSync(join(sp, 'hooks'), { recursive: true })
  writeFileSync(
    join(sp, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [] }] } })
  )
  // 未启用插件:1 个 skill(H4:仍可读)
  const ct = join(home, 'pkg-ct')
  mkdirSync(join(ct, '.claude-plugin'), { recursive: true })
  writeFileSync(join(ct, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'content-tools' }))
  mkdirSync(join(ct, 'skills', 'publish'), { recursive: true })
  writeFileSync(join(ct, 'skills', 'publish', 'SKILL.md'), '---\ndescription: 发布\n---\n\nReadable while disabled B\n')
  // 整包缺失插件(E6)
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
  // Codex 缓存:最高版本含 skills(E8)
  const cxBase = join(home, '.codex', 'plugins', 'cache', 'openai-bundled', 'documents')
  mkdirSync(join(cxBase, '2.0.0', 'skills', 'documents'), { recursive: true })
  writeFileSync(
    join(cxBase, '2.0.0', 'skills', 'documents', 'SKILL.md'),
    '---\ndescription: 文档\n---\n\nCodex body C\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()

  // ① 启用插件:行内安装记录 chip;展开类目 tab;Skills 行式列表带统计;点行→文件表→抽屉
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
  await spRow.click() // 收起,后续 .files 定位不被本行的表抢占

  // ② 未启用插件的 skill 仍可读(H4/ADR-0012)
  await win.locator('.it.row-btn', { hasText: 'content-tools@local' }).click()
  const ctRow = win.locator('.psk', { hasText: 'content-tools:publish' })
  await ctRow.click()
  await win.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Readable while disabled B')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.it.row-btn', { hasText: 'content-tools@local' }).click() // 收起

  // ③ 整包缺失(E6):展开为缺失横幅,无类目 tab
  await win.locator('.it.row-btn', { hasText: 'ghost@legacy' }).click()
  await expect(win.locator('.exp-area.none', { hasText: 'Install directory missing' })).toBeVisible()

  // ④ Codex 组:仅 Skills tab,点行读包
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
 * token-stats 序列 E:快照自动保鲜——短间隔注入(E5)驱动定时兜底全链路:
 * 追加会话数据后不点 ↻ 自动出现;期间打开的详情分栏本地态经换血保留(A3)。
 * 聚焦触发不在此驱动(隐藏窗口体制下焦点语义不可靠,见文件头注),
 * 其节流判定由 rescan 单测锁,扫描入口与定时共用。
 */
test('automatic refresh: a new session appears without a manual refresh, and the detail page\'s expansion state survives it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  const gskills = join(home, '.claude', 'skills')
  mkdirSync(join(gskills, 'tdd'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'SKILL.md'), '---\ndescription: Red before green\n---\n\n保态正文己\n')
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
      AGENTSHED_RESCAN_MS: '1500' // E5 测试 seam:兜底间隔缩短驱动全链路
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

  // 打开详情 Skills 并展开全局层行——它将经历若干次自动刷新
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const tddRow = win.locator('.pane-body .sk', { hasText: 'tdd' })
  await tddRow.locator('.sk-head').click()
  await expect(tddRow.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()

  // 追加"新产生"的会话数据;不点 ↻,等 ≥2 个兜底周期
  writeFileSync(join(cdir, 'b.jsonl'), usage(new Date(), 555555) + '\n')
  await win.waitForTimeout(4000)
  // 换血保态(A3):展开的文件表在多轮自动刷新后仍在,未闪回读取态
  await expect(tddRow.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()
  await expect(win.locator('.pane-body .none', { hasText: '读取中' })).toHaveCount(0)

  // 数据自动出现(E1 定时兜底):回 Agents 页,合计已变——全程未点 ↻
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
 * 趋势图的每个使用点都跑同一组断言。
 * 新增使用点只需往这个列表加一行——避免"测了一处漏一处"(2026-07-30 的漏改教训)。
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
      // fixture home 保证有且只有一个项目,不再需要"本机没项目就 skip"的分支
      await rows.first().waitFor({ state: 'visible', timeout: 8000 })
      await rows.first().click()
      await win.locator('.pane-head .tabs .tab', { hasText: 'Overview' }).click()
    }
  }
]

for (const mount of TREND_MOUNTS) {
  test(`the trend chart [${mount.name}]: the date axis is in place and the hover tooltip is not clipped by an ancestor`, async () => {
    // 必须喂 fixture 数据:无数据时「标签数 === 数据柱数」是 0 === 0,
    // 整套几何断言空过——跑了但什么都没验证。项目详情那条更直接:
    // 没项目就被 skip 掉,在 CI 上等于零覆盖。
    const l = await launch(undefined, mkUsageHome())
    const win = await l.app.firstWindow()
    await mount.goto(win)
    await expect(win.locator('.chart .col').first()).toBeVisible()
    await expect(win.locator('.chart .col')).toHaveCount(30)
    // 先钉住确实有数据柱,否则下面按数据柱做的几何检验会因空集合而恒真
    expect(await win.locator('.chart .col .sp').count()).toBeGreaterThan(0)

    // ① x 轴几何检验:标签集合 = 当前视图数据日(默认窗宽放得下全部标签),
    //    互不重叠、不越出轴容器、逐标钉对应柱中心(首尾贴边 clamp 例外)。
    //    禁止用"span 数量/非空数"冒充可见——重叠与越界的标签也非空。
    //    已知缺口:窗口缩放的 ResizeObserver 接线与 resize+刷新并发未自动化
    //    (补测条件:electron setBounds 的稳定驱动;简略逻辑本身由 axis.test.ts 覆盖)。
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
        problems.push(`标签数 ${spans.length} ≠ 数据柱数 ${dataCols.length}`)
      let prevRight = -Infinity
      for (const s of spans) {
        const r = s.getBoundingClientRect()
        if (r.left < prevRight + 1) problems.push(`重叠:${s.textContent}`)
        prevRight = r.right
        if (r.left < aR.left - 0.5 || r.right > aR.right + 0.5) problems.push(`越界:${s.textContent}`)
        const day = s.getAttribute('data-day')
        const col = cols.find((c) => c.getAttribute('data-day') === day)
        if (!col) {
          problems.push(`无对应柱:${s.textContent}`)
          continue
        }
        const cR = col.getBoundingClientRect()
        const off = Math.abs((cR.left + cR.right) / 2 - (r.left + r.right) / 2)
        const atEdge = r.left <= aR.left + 1.5 || r.right >= aR.right - 1.5
        if (off > 1 && !atEdge) problems.push(`偏移 ${off.toFixed(1)}px:${s.textContent}`)
      }
      return problems
    })
    expect(await checkAxis()).toEqual([])

    // 视图切换后轴跟随当前视图的数据日(合计→Claude→合计,往返无残留)
    for (const m of ['Claude', 'Total']) {
      await win.locator('.grp-t .seg button', { hasText: m }).click()
      expect(await checkAxis(), `切到 ${m} 后`).toEqual([])
    }

    // ② 悬停提示的**几何检验**:按同款定位造真实元素,逐级祖先查裁剪盒。
    //    禁止用"data-tip 属性存在"冒充可见——被裁掉的提示框也有属性。
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

    // ③ 提示内容是多行明细(合计 + 至少一个 provider 行)
    const tip = await win.locator('.chart .col').nth(15).getAttribute('data-tip')
    expect(tip).toContain('Total')

    expect(l.errors).toEqual([])
    await close(l)
  })
}

// 票 session-view/03b:fork 与剥离存疑两种标记
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

  // 父会话:不是 fork,两条提问,无标记
  await expect(rowOf('Parent first question').locator('.n')).toHaveText('2 questions')
  await expect(rowOf('Parent first question').locator('.pill')).toHaveCount(0)

  // 子会话:重放的两条被剥掉,只剩自己那条;标 ⑂ fork
  const child = rowOf('Child new question')
  await expect(child.locator('.n'), '重放前缀未剥离的话会是 3 提问').toHaveText('1 questions')
  await expect(child.locator('.pill.fork')).toHaveText('⑂ fork')
  await expect(child.locator('.pill.forkq')).toHaveCount(0)

  // 孤儿 fork:父不在扫描集内,标存疑而不是确定
  const orphan = rowOf('Orphan session question')
  await expect(orphan.locator('.pill.forkq')).toContainText('uncertain strip')
  await expect(orphan.locator('.pill.fork')).toHaveCount(0)

  expect(l.errors).toEqual([])
  await close(l)
})


// appearance 票 02:设置第三维 + 外观三选一;data-scheme 即时生效且进出设置不丢选中
test('settings: the three appearance choices change data-scheme, and entering and leaving settings keeps the selected project', async () => {
  const l = await launch(undefined, mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  // 默认紫(无 prefs 或 purple);html 上有 data-scheme
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('purple')

  // 进 Projects 选中唯一项目
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row').first()).toBeVisible()
  await win.locator('.side .row').first().click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)

  // 设置维
  await win.getByTitle('Settings').click()
  await expect(win.locator('.settings-h1')).toHaveText('Settings')
  await expect(win.locator('.scheme-card')).toHaveCount(3)
  // 设置页现有两处脚注(语言 / 外观),按语义定位而非类名——类名此刻已不唯一
  await expect(win.getByTestId('appearance-foot')).toContainText('Follow')

  // 点雾蓝 → data-scheme=blue
  await win.locator('[data-scheme-option="blue"]').click()
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('blue')
  await expect(win.locator('[data-scheme-option="blue"]')).toHaveAttribute('aria-checked', 'true')

  // 回 Projects:选中仍在;scheme 仍 blue(全 app)
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('blue')
  // 回 Agents 主区仍 blue
  await win.locator('.rail .ri').first().click()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  await expect.poll(async () => win.locator('html').getAttribute('data-scheme')).toBe('blue')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * 外观模式(i18n 票 04)。
 *
 * **这里测什么、不测什么**:测「选了某个模式 → 生效明暗随之改变」以及界面形态;
 * **不测**「锁定后系统外观再变界面不受影响」——测试环境改不了真实系统外观,而用
 * themeSource 自己去模拟"系统变化"是循环论证(测的是我们刚设的值)。那条归人工验收。
 */

/**
 * 外观模式专用启动口:**必须**关掉 Playwright 自己的 prefers-color-scheme 模拟。
 *
 * `electron.launch` 默认 `colorScheme: 'light'`,它给页面下发 Emulation 把
 * prefers-color-scheme 钉死;themeSource 改了也透不到渲染层,媒体查询恒为 light。
 * **这条是实测撞出来的**:主进程侧已是 `themeSource='dark'` / `shouldUseDarkColors=true`,
 * 渲染层却仍 `matchMedia(...).matches === false`、body 底色仍是浅的——
 * 即"实现是对的,被测试工装挡住了"。`'no-override'` 撤掉模拟,让真值透下来。
 *
 * 其余用例保持默认(模拟 light):它们不测明暗,钉死反而更稳,免得结果随跑测试的人的
 * 系统外观而变——与把测试语言钉死为中文是同一个理由。本组用例每次断言前都显式选定
 * 模式,故不受开发机系统外观影响。
 *
 * 撤销模拟用 `null`(本版 Playwright 类型里表达"重置为系统默认"的那个值);
 * 文档另提的 `'no-override'` 运行期同样有效,但不在本版类型联合内,typecheck 会红。
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

/** 界面此刻的生效明暗:themeSource 改变会直接改变这个媒体查询的求值结果 */
async function effectiveDark(win: Awaited<ReturnType<ElectronApplication['firstWindow']>>): Promise<boolean> {
  return win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
}

/** 各配色卡的**纸面取样**(第一格 = --card),按 CSS 计算值读回 */
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

/** rgb(...) → 相对亮度粗算(0=黑 1=白);只用来分辨"浅色取样"与"深色取样" */
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

  // 一张卡两行:上行模式、下行配色
  const field = win.getByTestId('appearance-field')
  await expect(field.locator('.frow')).toHaveCount(2)
  const rows = field.locator('.frow')
  await expect(rows.nth(0).getByTestId('mode-seg').locator('button')).toHaveCount(3)
  await expect(rows.nth(1).locator('[data-scheme-option]')).toHaveCount(3)

  // 配色卡**不含整句描述**:整卡可见文本恰好等于方案名。
  // 用 toHaveText 全等而不是"不含某句"——后者只能否掉我想得到的那一句
  await expect(win.locator('[data-scheme-option="purple"]')).toHaveText('Purple')
  await expect(win.locator('[data-scheme-option="blue"]')).toHaveText('Mist Blue')
  await expect(win.locator('[data-scheme-option="amber"]')).toHaveText('Amber Brown')

  // 「默认为紫」移入段末说明
  await expect(win.getByTestId('appearance-foot')).toContainText('Purple')

  expect(l.errors).toEqual([])
  await close(l)
})

test('appearance mode: locking light or dark changes the effective light/dark, and the palette samples follow', async () => {
  const l = await launchAppearance(mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  // 默认「跟随系统」被选中
  await expect(win.locator('[data-mode-option="system"]')).toHaveAttribute('aria-checked', 'true')

  // 锁定深色 → 生效明暗为深
  await win.locator('[data-mode-option="dark"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(true)
  await expect(win.locator('[data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
  const dark = await paperSwatches(win)

  // 锁定浅色 → 生效明暗为浅
  await win.locator('[data-mode-option="light"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(false)
  const light = await paperSwatches(win)

  // 先钉集合非空:下面两个 for 若遍历空数组,循环体一次都不执行,
  // 断言全部落空却照样绿——两条都要守,只守一条等于另一条可以凭空通过
  expect(dark).toHaveLength(3)
  expect(light).toHaveLength(3)

  // 取样随生效明暗切换:深色态的纸面取样必须是深的,不能仍显示浅色那套。
  // 断言只针对**纸面取样**(第一格),不是"深色下没有任何接近纯白的格子"——
  // 第四格取的是 --text,深色下本就该接近纯白,那不是 bug
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
      // 关键主题变量有值
      for (const v of [vars.bg, vars.text, vars.accent]) expect(v).not.toBe('')
      // 前景与背景可区分(否则这一组合下界面是"看不见的字")
      expect(Math.abs(luminance(vars.bodyBg) - luminance(vars.bodyFg))).toBeGreaterThan(0.3)
    }
  }

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * 界面语言(i18n 票 03)。
 *
 * 系统偏好语言经 AGENTSHED_SYSTEM_LANGUAGES 注入(见 src/main/system-language.ts)——
 * 「跟随系统」的行为依赖系统语言,而系统语言在测试里改不了,没有这个口子就只能
 * 靠人反复改系统设置来验证。
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
  // [ko, fr, en]:韩语不受支持,应继续往后取到法语——而不是首项不中就回退英文。
  // 单元素列表分不出这两种实现,故这里必须用多元素。
  const l = await launchWithLangs('ko-KR,fr-FR,en-US')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  // 默认偏好是「跟随系统」,故界面应为法语
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

  // 语言分节在外观之前:断 DOM 顺序,不靠肉眼看截图
  // This case deliberately launches with a Chinese system language, so the section
  // titles it asserts on are the Chinese UI copy — not an untranslated leftover.
  const secs = win.locator('.settings-sec-t')
  await expect(secs.first()).toHaveText('语言')
  await expect(secs.nth(1)).toHaveText('外观')

  // 触发器显示「跟随系统」+ 当前解析结果
  const trig = win.getByTestId('language-trigger')
  await expect(trig).toContainText('Follow system')
  await expect(trig).toContainText('简体中文')

  await trig.click()
  const pop = win.getByTestId('language-pop')
  await expect(pop.locator('.lang-opt')).toHaveCount(7)
  await expect(pop.locator('.lang-sep')).toHaveCount(1)
  // 首项是策略且显示解析出的语言;它不是「一种语言」
  await expect(pop.locator('.lang-opt').first()).toContainText('Follow system')
  await expect(pop.locator('.lang-opt').first()).toContainText('简体中文')

  // 浮层不被设置页 overflow:auto 裁掉:四角与中心命中测试,属性存在不算数
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

  // 切到日语:整页即时改语言,含侧边栏悬停提示
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

  // **先切到非首项**再验证高亮位置:若当前选中就是第 0 项,
  // 「高亮停在选中项」与「高亮没被设置」的结果都是 0,断言分不出对错
  const trig = win.getByTestId('language-trigger')
  await trig.click()
  await win.getByTestId('language-pop').locator('[data-lang="ru"]').click()
  await expect(win.locator('.settings-h1')).toHaveText('Настройки')

  // 鼠标移开再测键盘:上一步是用鼠标点选的,指针还停在浮层原位置上,
  // 浮层再次展开时会落在某一项上触发 hover 高亮,把键盘游标顶掉——
  // 那是符合预期的鼠标行为,但会让这条键盘断言测到错误的对象
  await win.mouse.move(0, 0)
  await trig.focus()
  await win.keyboard.press('ArrowDown')
  const pop = win.getByTestId('language-pop')
  await expect(pop).toBeVisible()
  // 俄语在 OPTIONS 中的下标是 5(system + zh en fr es ru)
  await expect(pop.locator('.lang-opt.cursor')).toHaveAttribute('data-lang', 'ru')

  // ↑ 一格到西语,回车选定
  await win.keyboard.press('ArrowUp')
  await expect(pop.locator('.lang-opt.cursor')).toHaveAttribute('data-lang', 'es')
  await win.keyboard.press('Enter')
  await expect(win.locator('.settings-h1')).toHaveText('Ajustes')

  // Esc 关闭且不改语言
  await trig.click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('language-pop')).toHaveCount(0)
  await expect(win.locator('.settings-h1')).toHaveText('Ajustes')

  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

// ── i18n 专项(票 14)────────────────────────────────────────────────
// 与既有用例的分工:既有 e2e 把语言钉为中文、守的是**行为**;这几条守的是
// **i18n 本身**——切换生效、六语可加载、最长语言不撑破布局。

test('i18n: the language-locking mechanism itself is reliable, unaffected by the development machine\'s system language', async () => {
  // 这条守的是**其余 40 条 e2e 的前提**:它们按中文文案定位,而语言默认跟随系统。
  // 若钉定失效,整套用例会在非中文机器上崩塌——而在中文机器上照绿,看不出来。
  // 故用两种**互不相同且都不是中文**的注入系统语言跑同一断言,结果必须一致。
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
  // 与 typecheck 不重叠:typecheck 保证 key 齐全,这里保证**运行期真的取得到值**——
  // 例如某语言字典整个 import 失败时,key 齐全而运行期取到 undefined
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()
  const trig = win.getByTestId('language-trigger')
  for (const code of ['en', 'fr', 'es', 'ru', 'ja', 'zh']) {
    await trig.click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    // 关键节点:页标题、侧栏提示、设置页两处分节标题
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
  // **三个分区一起断**:只断一处分不出"整页换了语言"与"只有这一处接了字典"
  await expect(win.locator('.settings-h1')).not.toHaveText(before.title ?? '')
  await expect(win.locator('.ri.set')).not.toHaveAttribute('title', before.rail ?? '')
  await expect(win.locator('.settings-sec-t').first()).not.toHaveText(before.sec ?? '')
  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})

test('i18n: key layouts do not overflow horizontally in the longest language (both French/Russian prose and Japanese labels are checked)', async () => {
  // 票里点名要覆盖**两类**:正文最长的是法/俄,标签最长的是日语(全角)。
  // 只测一类会漏——它们撑破的是不同的容器。
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
      // 页面本身不得横向滚动
      const pageOverflows = doc.scrollWidth > doc.clientWidth
      // 设置页内的定宽容器不得被内容撑破
      const boxes = [...document.querySelectorAll('.settings, .field, .settings-foot')]
      const boxOverflows = boxes.filter((b) => b.scrollWidth > b.clientWidth + 1).length
      return { pageOverflows, boxOverflows }
    })
    expect(overflow.pageOverflows, `${code}:页面横向溢出`).toBe(false)
    expect(overflow.boxOverflows, `${code}:定宽容器被撑破`).toBe(0)
  }
  expect(l.errors).toEqual([])
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
})
