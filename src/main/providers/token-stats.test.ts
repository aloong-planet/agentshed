// Ticket 04 plus the correction round: the token aggregation engine (aligned with ccusage, 2026-07-30) —
// a whole-tree scan (independent of the registry), deduplication by message.id+requestId (with the
// sidechain fallback),
// all four fields summed into the total, synthetic staying out of the model buckets, bad lines skipped
// while streaming, and the incremental cache.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CACHE_VERSION, TokenEngine } from './token-stats'
import { encodeClaudeProjectDir } from './claude'
import { ERR, decodeAppError } from '@shared/errors'
import type { ScanRoots } from './types'

let dir: string
let proj: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}

interface UsageOpts {
  id?: string
  requestId?: string
  sidechain?: boolean
  cacheRead?: number
  cacheWrite?: number
}
/** A Claude usage line (the measured shape; id/requestId/sidechain serve the deduplication cases) */
function usageLine(model: string, tsIso: string, inTok: number, outTok: number, o: UsageOpts = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: tsIso,
    requestId: o.requestId,
    isSidechain: o.sidechain ?? false,
    message: {
      id: o.id,
      model,
      usage: {
        input_tokens: inTok,
        output_tokens: outTok,
        cache_read_input_tokens: o.cacheRead ?? 0,
        cache_creation_input_tokens: o.cacheWrite ?? 0
      }
    }
  })
}
function userLine(text: string, tsIso?: string): string {
  return JSON.stringify({ type: 'user', timestamp: tsIso, message: { role: 'user', content: text } })
}
/** Build a session file under projects/<encodedDir>/; encodedDir defaults to the real project path's
 * encoding */
function mkClaudeFile(rel: string, lines: string[], atSec = 1000, encodedDir?: string): string {
  const enc = encodedDir ?? encodeClaudeProjectDir(proj)
  const f = join(dir, '.claude', 'projects', enc, rel)
  mkdirSync(join(f, '..'), { recursive: true })
  writeFileSync(f, `${lines.join('\n')}\n`)
  utimesSync(f, atSec, atSec)
  return f
}
function mkCodexRollout(
  file: string,
  cwd: string,
  tsIso: string,
  model: string,
  /** Per-turn increments (last_token_usage), attributed to a day by their own timestamps */
  turns: Array<{ input: number; cached: number; output: number; at?: string }>,
  subagent = false,
  atSec = 2000,
  /** A real question; pass null to build a session nobody ever asked anything in (spec A3a) */
  userMsg: string | null = '示例提问'
): string {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  let acc = { input: 0, cached: 0, output: 0 }
  const lines = [
    JSON.stringify({
      timestamp: tsIso,
      type: 'session_meta',
      payload: subagent ? { cwd, thread_source: 'subagent' } : { cwd }
    }),
    JSON.stringify({ timestamp: tsIso, type: 'turn_context', payload: { model, cwd } }),
    ...(userMsg === null
      ? []
      : [JSON.stringify({ timestamp: tsIso, type: 'event_msg', payload: { type: 'user_message', message: userMsg } })]),
    // The real shape: top-level type=event_msg with the data in payload.info (payload.type=token_count)
    ...turns.map((t) => {
      acc = { input: acc.input + t.input, cached: acc.cached + t.cached, output: acc.output + t.output }
      return JSON.stringify({
        timestamp: t.at ?? tsIso,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: t.input,
              cached_input_tokens: t.cached,
              cache_write_input_tokens: 0,
              output_tokens: t.output,
              total_tokens: t.input + t.output
            },
            total_token_usage: {
              input_tokens: acc.input,
              cached_input_tokens: acc.cached,
              cache_write_input_tokens: 0,
              output_tokens: acc.output,
              total_tokens: acc.input + acc.output
            }
          }
        }
      })
    })
  ]
  const f = join(d, file)
  writeFileSync(f, `${lines.join('\n')}\n`)
  utimesSync(f, atSec, atSec)
  return f
}

/**
 * A fork session: session_meta carries id/forked_from_id, and the first line's timestamp = the replay
 * moment.
 * The shape was verified against real samples (2026-08-02, the two fork sessions in this machine's
 * ~/.codex): a top-level
 * timestamp/type/payload, with payload carrying id + forked_from_id + cwd. Real data also has
 * session_id / parent_thread_id / thread_source / base_instructions and other fields,
 * and this fixture keeps only the ones that are read (the others have their own existing coverage).
 */
function mkCodexFork(
  file: string,
  cwd: string,
  o: { id: string; parentId: string; forkedAtIso: string },
  model: string,
  turns: Array<{ input: number; cached: number; output: number; at?: string }>,
  atSec = 2000
): string {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  const lines = [
    JSON.stringify({
      timestamp: o.forkedAtIso,
      type: 'session_meta',
      payload: { cwd, id: o.id, forked_from_id: o.parentId }
    }),
    JSON.stringify({ timestamp: o.forkedAtIso, type: 'turn_context', payload: { model, cwd } }),
    JSON.stringify({
      timestamp: o.forkedAtIso,
      type: 'event_msg',
      payload: { type: 'user_message', message: 'fork 后的提问' }
    }),
    ...turns.map((t) =>
      JSON.stringify({
        timestamp: t.at ?? o.forkedAtIso,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: t.input,
              cached_input_tokens: t.cached,
              cache_write_input_tokens: 0,
              output_tokens: t.output,
              total_tokens: t.input + t.output
            }
          }
        }
      })
    )
  ]
  const f = join(d, file)
  writeFileSync(f, `${lines.join('\n')}\n`)
  utimesSync(f, atSec, atSec)
  return f
}

function writeIndex(entries: Array<{ id: string; name: string }>): void {
  mkdirSync(join(dir, '.codex'), { recursive: true })
  writeFileSync(
    join(dir, '.codex', 'session_index.jsonl'),
    entries.map((e) => JSON.stringify({ id: e.id, thread_name: e.name, updated_at: 'x' })).join('\n') + '\n'
  )
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-tok-'))
  proj = join(dir, 'work', 'p1')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function engine(): TokenEngine {
  return new TokenEngine(join(dir, 'cache'))
}

describe('Claude aggregation (the ccusage rules)', () => {
  it('all four fields sum into the total; cache is listed separately; model buckets use the same rules; the title comes from the first user message', async () => {
    mkClaudeFile('a.jsonl', [
      userLine('帮我修一个布局 bug,谢谢'),
      usageLine('claude-fable-5', '2026-07-29T10:00:00Z', 100, 50, { cacheRead: 7000, cacheWrite: 300 }),
      usageLine('claude-opus-5', '2026-07-30T02:00:00Z', 20, 10)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude).toMatchObject({
      input: 120,
      output: 60,
      cacheRead: 7000,
      cacheWrite: 300,
      total: 7480
    })
    const models = Object.fromEntries(r.global.byModel.map((m) => [m.model, m.total]))
    expect(models['claude-fable-5']).toBe(7450)
    expect(models['claude-opus-5']).toBe(30)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions[0].title).toContain('帮我修一个布局')
    expect(p?.sessions[0].tokens).toBe(7480)
  })

  it('a whole-tree scan: an unregistered project\'s encoded directory counts toward the global total too (no longer depending on the registry)', async () => {
    mkClaudeFile('x.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)], 1000, '-Users-ghost-unregistered')
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
    // An unregistered directory is attributed to no project
    expect(r.perProject.size).toBe(0)
  })

  it('duplicate lines with the same message.id+requestId count once, keeping the one with the more complete usage', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 5, { id: 'm1', requestId: 'r1' }),
      usageLine('claude-fable-5', '2026-07-30T02:00:01Z', 100, 50, { id: 'm1', requestId: 'r1' })
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(150)
  })

  it('a sidechain replay (same message.id, new requestId) deduplicates across files, keeping the non-sidechain one', async () => {
    mkClaudeFile('main.jsonl', [
      userLine('主会话的提问'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 50, { id: 'm1', requestId: 'r1' })
    ])
    mkClaudeFile('sess/subagents/agent-x.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 100, 50, { id: 'm1', requestId: 'r2', sidechain: true }),
      usageLine('claude-haiku-4-5', '2026-07-30T02:02:00Z', 1000, 200, { id: 'm2', requestId: 'r3', sidechain: true })
    ])
    const r = await engine().build(roots(), [proj])
    // m1 counts once (150) and m2 counts (1200); a nested file produces no session entry
    expect(r.global.bySide.claude.total).toBe(1350)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.tokens.bySide.claude.total).toBe(1350)
    expect(p?.sessions).toHaveLength(1)
  })

  it('lines with no message.id are not deduplicated (they sum as usual)', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(30)
  })

  it('a synthetic model: its tokens count toward the total but do not enter a model bucket', async () => {
    mkClaudeFile('a.jsonl', [usageLine('<synthetic>', '2026-07-30T02:00:00Z', 7, 3)])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(10)
    expect(r.global.byModel).toHaveLength(0)
  })

  it('the cache_creation breakdown takes priority: where an ephemeral breakdown exists, take the 5m+1h sum rather than the flat field', async () => {
    // Measured against real data (2026-07-13), some lines have a breakdown differing from the flat field,
    // and ccusage takes the breakdown
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-07-30T02:00:00Z',
      message: {
        id: 'm1',
        model: 'claude-fable-5',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 100,
          cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 507 }
        }
      }
    })
    mkClaudeFile('cc.jsonl', [line])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.cacheWrite).toBe(547)
    expect(r.global.bySide.claude.total).toBe(562)
  })

  it('a bad line is skipped without discarding the file', async () => {
    mkClaudeFile('b.jsonl', ['not json {{{', usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
  })

  // Ticket 03a: a bad line's degradation must **only hurt itself** — it must not affect the questions
  // before or after it in the same file.
  // An active session mid-write is exactly this shape, not a hypothetical.
  it('a bad line between questions: that line is skipped, the questions on either side remain, and the count is unaffected', async () => {
    mkClaudeFile('mid-bad.jsonl', [
      userLine('first one提问'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      '{"type":"user","message":{"role":"user","content":"半行写到一', // 半行,解析不出
      userLine('second one提问'),
      usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 10, 5)
    ])
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.file.endsWith('mid-bad.jsonl'))
    expect(s?.questionCount, '坏行不该吃掉它前后的提问').toBe(2)
    expect(s?.title).toBe('first one提问')
  })
})

describe('Codex aggregation (the ccusage rules)', () => {
  it('sums per-turn last_token_usage increments; sanitises input (subtracting cached) and lists cached separately; the model comes from turn_context and the title from session_index', async () => {
    const id = '019fa9a1-380e-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-2026-07-30T00-49-03-${id}.jsonl`, proj, '2026-07-30T00:49:03Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10 },
      { input: 400, cached: 320, output: 20 }
    ])
    writeIndex([{ id, name: '迁移 skills' }])
    const r = await engine().build(roots(), [proj])
    // Raw input totals 500 (including 400 cached) → net input 100, cacheRead 400, output 30; total across
    // all four = 530
    expect(r.global.bySide.codex).toMatchObject({ input: 100, output: 30, cacheRead: 400, total: 530 })
    const models = Object.fromEntries(r.global.byModel.map((m) => [`${m.side}:${m.model}`, m.total]))
    expect(models['codex:gpt-5.6-sol']).toBe(530)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.side === 'codex')?.title).toBe('迁移 skills')
  })

  it('a session spanning midnight is apportioned to its respective dates by event timestamp (no longer piled onto the first day)', async () => {
    // Two timestamps 24h apart, so it crosses a day boundary in any local time zone
    mkCodexRollout('rollout-cross-019f003.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 0, at: '2026-07-29T12:00:00Z' },
      { input: 200, cached: 0, output: 0, at: '2026-07-30T12:00:00Z' }
    ])
    const r = await engine().build(roots(), [proj])
    const byDay = Object.fromEntries(r.global.byDay.map((d) => [d.day, d.codex]))
    expect(Object.keys(byDay).length).toBe(2)
    expect(Object.values(byDay).reduce((a, b) => a + b, 0)).toBe(300)
  })

  it('a subagent session\'s tokens count but it does not enter the session list', async () => {
    mkCodexRollout('rollout-main-019f001.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5 }
    ])
    mkCodexRollout(
      'rollout-sub-019f002.jsonl',
      proj,
      '2026-07-30T01:30:00Z',
      'codex-auto-review',
      [{ input: 1000, cached: 0, output: 100 }],
      true
    )
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex.total).toBe(1115)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.filter((s) => s.side === 'codex')).toHaveLength(1)
    expect(p?.tokens.bySide.codex.total).toBe(1115)
  })
})

// Ticket session-view/01: the two sides' `at` semantics were originally opposite (Claude took the maximum,
// Codex the first),
// and were unified to "the largest timestamp in the file" = last activity. The Codex side especially — a
// fork session's first
// timestamp is the replay moment, which as an activity time is neither the start nor the end.
describe('a session\'s at = the largest timestamp in the file (the same meaning on both sides)', () => {
  it('a Codex session spanning midnight takes the last turn\'s timestamp, not the first line\'s', async () => {
    mkCodexRollout('rollout-at-019fb01.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5, at: '2026-07-29T12:00:00Z' },
      { input: 20, cached: 0, output: 5, at: '2026-07-30T18:30:00Z' }
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'codex')
    expect(s?.at).toBe(Date.parse('2026-07-30T18:30:00Z'))
  })

  it('a Codex fork session\'s at is its own last activity rather than the replay moment', async () => {
    const parentId = '019fa9a1-380e-7af3-af7d-8505cedf1ec2'
    const childId = '019fb0b0-1111-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-parent-${parentId}.jsonl`, proj, '2026-07-28T09:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 10, at: '2026-07-28T09:00:00Z' }
    ])
    // The child forked on 07-29: the first line's timestamp is the replay moment, while the real new
    // activity happened on 07-31
    mkCodexFork(
      `rollout-child-${childId}.jsonl`,
      proj,
      { id: childId, parentId, forkedAtIso: '2026-07-29T09:00:00Z' },
      'gpt-5.6-sol',
      [
        { input: 100, cached: 0, output: 10, at: '2026-07-29T09:00:00Z' }, // 重放父历史
        { input: 50, cached: 0, output: 5, at: '2026-07-31T20:00:00Z' } // 本次新内容
      ]
    )
    const r = await engine().build(roots(), [proj])
    const child = r.perProject
      .get(proj.toLowerCase())
      ?.sessions.filter((x) => x.side === 'codex')
      .find((x) => x.at === Date.parse('2026-07-31T20:00:00Z'))
    expect(child, 'fork 子会话的 at 应为 07-31 最后活动,而非 07-29 重放时刻').toBeDefined()
  })

  it('every session carries its source file back (on both sides), pointing at a file that really exists', async () => {
    const cl = mkClaudeFile('ident.jsonl', [
      userLine('提问一'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const cx = mkCodexRollout('rollout-ident-019fb02.jsonl', proj, '2026-07-30T03:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5 }
    ])
    const sessions = (await engine().build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    expect(sessions.map((s) => s.file).sort()).toEqual([cl, cx].sort())
    for (const s of sessions) expect(existsSync(s.file), `${s.file} 应存在`).toBe(true)
  })

  it('subagent and nested files are not listed, so they bring no extra identities with them', async () => {
    mkClaudeFile('main.jsonl', [userLine('主会话的提问'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    mkClaudeFile('sess/subagents/agent-x.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 20, 5, { sidechain: true })
    ])
    const sessions = (await engine().build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    expect(sessions).toHaveLength(1)
    expect(sessions[0].file.endsWith('main.jsonl')).toBe(true)
  })

  // Found by measurement at review (2026-08-02): sampling 118 real Claude sessions, 53 (45%) have a
  // last-line timestamp later than the last usage line, with a maximum gap of 203 seconds. The root cause
  // is that **a user message has no
  // usage field** — so the last thing the user asked is invisible under a "usage lines only" rule.
  it('Claude: when the file ends on a user message (with no usage), at takes it rather than the previous assistant reply', async () => {
    mkClaudeFile('trailing-user.jsonl', [
      userLine('第一问', '2026-07-30T10:00:00Z'),
      usageLine('claude-fable-5', '2026-07-30T10:00:30Z', 10, 5),
      userLine('追问,然后我就走了', '2026-07-30T10:03:53Z')
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'claude')
    expect(s?.at, 'at 应为最后一条用户消息的时间,不是最后一条 usage 行').toBe(
      Date.parse('2026-07-30T10:03:53Z')
    )
  })

  it('Claude: a session with no usage line at all still takes the largest timestamp in the file rather than falling back to mtime', async () => {
    mkClaudeFile('no-usage.jsonl', [userLine('只问了一句就崩了', '2026-07-30T11:22:33Z')], 1000)
    const r = await engine().build(roots(), [proj])
    // That file produces no tokens but is still a session
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => (x.title ?? '').includes('崩了'))
    expect(s?.at, 'mtime 是 1000 秒(1970),文件内有真实时间戳就不该退回它').toBe(
      Date.parse('2026-07-30T11:22:33Z')
    )
  })

  it('the Claude side keeps the largest-timestamp semantics (a regression guard)', async () => {
    mkClaudeFile('a.jsonl', [
      userLine('第一问'),
      usageLine('claude-fable-5', '2026-07-29T10:00:00Z', 10, 5),
      usageLine('claude-fable-5', '2026-07-31T22:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'claude')
    expect(s?.at).toBe(Date.parse('2026-07-31T22:00:00Z'))
  })
})

describe('cache version migration (a real bug regression)', () => {
  it('an old-format cache (a Codex agg with no events field) does not crash and is recomputed into the new structure', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const rollout = mkCodexRollout('rollout-old-019f900.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
      { input: 30, cached: 0, output: 5 }
    ])
    // A hand-written cache in the previous version's structure: the Codex entry has only totals/byDay and
    // no events
    mkdirSync(join(dir, 'cache'), { recursive: true })
    const st = statSync(rollout)
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        version: 2,
        files: {
          [rollout]: {
            sig: `${st.mtimeMs}:${st.size}`,
            agg: {
              kind: 'codex',
              projectKey: proj.toLowerCase(),
              listed: true,
              title: '旧格式',
              at: 1,
              model: 'gpt-5.6-sol',
              totals: { input: 999, output: 0, cacheRead: 0, cacheWrite: 0, total: 999 },
              byDay: { '2026-07-30': 999 }
            }
          }
        }
      })
    )
    const r = await engine().build(roots(), [proj])
    // No crash, and the number comes from the recomputation (35) rather than the old cache (999)
    expect(r.global.bySide.codex.total).toBe(35)
    expect(r.global.bySide.claude.total).toBe(15)
  })

  // A defence against a false green: when what changed is "how a field is computed" rather than the
  // structure, the signature still hits and the shape is still valid,
  // and the old value flows all the way to the UI. Fixtures with a fresh cache always pass, and existing
  // users never see the fix.
  //
  // ⚠️ This case tests **the version invalidation mechanism itself** (a previous version's cache is
  //    refused), not "the author remembered to bump".
  //    No unit test can cover the latter: a missed bump **leaves no trace whatsoever** in the code under
  //    test, and the fixture writes
  //    `CACHE_VERSION - 1`, which is one notch below the current value whatever it is and never matches.
  //    Confirmed by measurement: rolling CACHE_VERSION back from 6 to 5 (simulating a missed bump) leaves
  //    this case green.
  //    The shape-change half is backstopped by the field-set fingerprint below; the algorithm-change half
  //    relies on process alone (see the spec).
  it('a value in the immediately previous version\'s cache, structurally valid but computed by an outdated algorithm, must not be reused', async () => {
    const rollout = mkCodexRollout('rollout-staleat-019f901.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5, at: '2026-07-29T12:00:00Z' },
      { input: 20, cached: 0, output: 5, at: '2026-07-30T18:30:00Z' }
    ])
    const st = statSync(rollout)
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        // A relative version number rather than a literal: hard-coding 3 would, once the version reached
        // 6 or 7, degrade this into
        // the neighbouring "a very old version is refused" case, leaving "the immediately previous version
        // is refused" untested — and a missed bump uncaught all the same.
        version: CACHE_VERSION - 1,
        files: {
          [rollout]: {
            sig: `${st.mtimeMs}:${st.size}`,
            // **Everything but the version number is valid** — `file` especially must be present:
            // isWellFormedAgg would judge it invalid on the missing field
            // and recompute, which would leave this case green even with the version check deleted
            // entirely,
            // so the version mechanism itself would go untested.
            agg: {
              kind: 'codex',
              file: rollout,
              projectKey: proj.toLowerCase(),
              listed: true,
              title: 'stale',
              at: Date.parse('2026-07-29T12:00:00Z'),
              model: 'gpt-5.6-sol',
              sessionId: null,
              parentId: null,
              forkedAt: null,
              events: [
                [Date.parse('2026-07-29T12:00:00Z'), 10, 0, 5, 0],
                [Date.parse('2026-07-30T18:30:00Z'), 20, 0, 5, 0]
              ]
            }
          }
        }
      })
    )
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.side === 'codex')
    expect(s?.at, '版本号必须随算法变更一起升,否则旧值被沿用').toBe(Date.parse('2026-07-30T18:30:00Z'))
  })

  // Found at review: isWellFormedAgg is the guard rail for corruption and drift **within one version**,
  // and `file` was added without being added to it.
  // The escape surface is upward — a cache entry missing `file` makes SessionMeta.file undefined,
  // contract validation throws, and the whole of getProjectDetail dies (skills, memory, plugins and
  // artifacts all gone).
  // After the fix the escape surface drops to self-harm: that one file is recomputed.
  // The version must be CACHE_VERSION itself rather than a hard-coded literal: the moment it is hard-coded
  // it equals the current version,
  // and after the next bump loadCache would discard the whole cache on the version mismatch and recompute
  // that file anyway — turning the case into
  // a **vacuous pass** that never exercises isWellFormedAgg again. (This case originally hard-coded 5, and
  // had already gone vacuous by version 7.)
  it.each([
    // Each row is missing only its target field with the rest complete (forkPoints included) — a fixture
    // missing two fields would let
    // the guard go red even while checking one fewer, so the target check would go untested
    ['file', { projectKey: 'X', listed: true, title: '缓存里的陈旧标题', at: 1, questions: [], forkPoints: 0 }],
    ['questions', { file: 'X', projectKey: 'X', listed: true, title: '缓存里的陈旧标题', at: 1, forkPoints: 0 }],
    ['forkPoints(票 06 横幅信号)', { file: 'X', projectKey: 'X', listed: true, title: '缓存里的陈旧标题', at: 1, questions: [] }],
    // Ticket 03b: the record's arity went from 6 to 7 (adding the content fingerprint). An old record's
    // 7th element reads back as undefined,
    // and undefined === undefined makes Codex's replay fingerprint check always true and strips blindly.
    [
      'questions 记录少一位(旧元数)',
      {
        file: 'X',
        projectKey: 'X',
        listed: true,
        title: '缓存里的陈旧标题',
        at: 1,
        forkPoints: 0,
        questions: [[0, 10, 20, 1, 0, 0]]
      }
    ]
  ])('同版本缓存里条目缺 %s → 只重算该文件,不污染整份详情', async (_missing, partial) => {
    const cl = mkClaudeFile('wellformed.jsonl', [
      userLine('x'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const st = statSync(cl)
    mkdirSync(join(dir, 'cache'), { recursive: true })
    const agg = { kind: 'claude', ...partial, entries: [[null, null, 0, 10, 5, 0, 0, 'claude-fable-5', '2026-07-30']] }
    if ('file' in agg) agg.file = cl
    if ('projectKey' in agg) agg.projectKey = proj.toLowerCase()
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        version: CACHE_VERSION, // 同版本:版本号拦不住它,只能靠 isWellFormedAgg
        files: { [cl]: { sig: `${st.mtimeMs}:${st.size}`, agg } }
      })
    )
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.side === 'claude')
    expect(s?.file, '缺字段的缓存条目必须被判不合格并重算,不能把 undefined 放行到契约层').toBe(cl)
    // Assert the recomputation really happened: the cache holds a sentinel title while a real parse yields
    // the content of userLine.
    // Without this, "the entry was judged invalid" and "the cache never hit at all" are indistinguishable
    // in the result.
    expect(s?.title, '必须是重新解析出的标题,不是缓存里那个').toBe('x')
  })

  // The only automated defence against a missed bump on a shape change: this goes red when the field set
  // changes, forcing the author to think about the version number.
  // The assertion targets **the persisted cache** — the very thing the version number protects, not a
  // side channel.
  // Coverage stated explicitly: it covers adding and removing fields only, not a change to how a field is
  // computed (that leaves the field set, and the fingerprint, unchanged).
  it('a change to FileAgg\'s field set must be noticed (a shape change is the only half of a missed bump that is testable)', async () => {
    mkClaudeFile('shape.jsonl', [
      userLine('提问'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    mkCodexRollout('rollout-shape-019fd01.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5 }
    ])
    await engine().build(roots(), [proj])
    const cache = JSON.parse(readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')) as {
      files: Record<string, { agg: Record<string, unknown> }>
    }
    const keysOf = (kind: string): string[] => {
      const hit = Object.values(cache.files).find((f) => f.agg['kind'] === kind)
      expect(hit, `缓存里应有 ${kind} 条目`).toBeDefined()
      return Object.keys((hit as { agg: Record<string, unknown> }).agg).sort()
    }
    expect(keysOf('claude')).toEqual([
      'at', 'entries', 'file', 'forkPoints', 'kind', 'listed', 'projectKey', 'questions', 'title'
    ])
    expect(keysOf('codex')).toEqual([
      'at', 'events', 'file', 'forkedAt', 'kind', 'listed', 'model', 'parentId', 'projectKey', 'questions', 'sessionId', 'title', 'titleFromThread'
    ])
  })

  // Ticket 03a's founding premise (spec D2a): the index **stores offsets only, not even a truncated
  // preview**.
  // The reason: in a cache read at every startup across the whole repository, question text is about 9.5%
  // of the whole, a megabyte-scale burden.
  // Without this assertion, a later "might as well store a preview to help search" would not go red — and
  // that is exactly what this decision exists to prevent.
  it('the cache contains no question text at all (offsets only)', async () => {
    const uniq = '独一无二的提问文本CANARY7391'
    mkClaudeFile('notext.jsonl', [
      userLine(uniq),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    await engine().build(roots(), [proj])
    const raw = readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')
    const cache = JSON.parse(raw) as { files: Record<string, { agg: Record<string, unknown> }> }
    const hit = Object.values(cache.files).find((f) => String(f.agg['file']).endsWith('notext.jsonl'))
    // First prove this really entered the cache, or the "no text found" below is a vacuous pass
    expect(hit, '该文件应在缓存里').toBeDefined()
    expect((hit as { agg: Record<string, unknown> }).agg['questions']).toHaveLength(1)
    // The title is stored by design (the session list displays it) while the question **body** is not;
    // the judgement uses a string that appears only in a question and can be nothing but its title.
    const questionsJson = JSON.stringify((hit as { agg: Record<string, unknown> }).agg['questions'])
    expect(questionsJson, 'Index里出现了提问文本').not.toContain('CANARY')
    expect(questionsJson, 'Index应当只有数字与 null').toMatch(/^\[\[[\d,\s.enull-]*\]\]$/)
  })

  it('a cache file full of garbage does not crash and triggers a full recomputation', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(join(dir, 'cache', 'token-cache.json'), '{"version":3,"files":{"x":{"sig":"1:1","agg":{"kind":"claude"}}}}')
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
  })
})

describe('the incremental cache', () => {
  it('a second build gives the same result (idempotent); the cache file is valid JSON and lands atomically', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const e = engine()
    const r1 = await e.build(roots(), [proj])
    const r2 = await new TokenEngine(join(dir, 'cache')).build(roots(), [proj])
    expect(r2.global).toEqual(r1.global)
    expect(existsSync(join(dir, 'cache', 'token-cache.json'))).toBe(true)
    expect(readdirSync(join(dir, 'cache')).filter((f) => f.includes('tmp'))).toHaveLength(0)
  })

  it('a changed source file (mtime or size) → recomputed to reflect the new content', async () => {
    const f = mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)], 1000)
    await engine().build(roots(), [proj])
    writeFileSync(
      f,
      [
        usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
        usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50)
      ].join('\n') + '\n'
    )
    utimesSync(f, 2000, 2000)
    const r2 = await new TokenEngine(join(dir, 'cache')).build(roots(), [proj])
    expect(r2.global.bySide.claude.total).toBe(165)
  })

  it('cross-file deduplication still applies on a cache hit (deduplication is in the aggregation layer, not the cache layer)', async () => {
    mkClaudeFile('main.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 50, { id: 'm1', requestId: 'r1' })
    ])
    mkClaudeFile('sess/subagents/agent-x.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 100, 50, { id: 'm1', requestId: 'r2', sidechain: true })
    ])
    await engine().build(roots(), [proj])
    const r2 = await new TokenEngine(join(dir, 'cache')).build(roots(), [proj])
    expect(r2.global.bySide.claude.total).toBe(150)
  })
})

describe('the archive row output (for UsageArchive to persist)', () => {
  it('build produces day × side × project × model rows agreeing with the byDay totals; liveDays holds the days visible this time', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      usageLine('claude-opus-5', '2026-07-30T03:00:00Z', 20, 10)
    ])
    mkCodexRollout('rollout-r-019f100.jsonl', proj, '2026-07-30T04:00:00Z', 'gpt-5.6-sol', [
      { input: 40, cached: 0, output: 0 }
    ])
    const r = await engine().build(roots(), [proj])
    // The rows cover both sides and two Claude models
    const sides = new Set(r.rows.map((x) => x.side))
    expect(sides).toEqual(new Set(['claude', 'codex']))
    const models = new Set(r.rows.filter((x) => x.side === 'claude').map((x) => x.model))
    expect(models).toEqual(new Set(['claude-fable-5', 'claude-opus-5']))
    // The row total == the global total
    const rowTotal = r.rows.reduce((s, x) => s + x.total, 0)
    expect(rowTotal).toBe(r.global.bySide.claude.total + r.global.bySide.codex.total)
    // The project attribution is carried
    expect(r.rows.every((x) => x.projectKey === proj.toLowerCase())).toBe(true)
    // liveDays is non-empty and contains the rows' days
    expect(r.liveDays.size).toBeGreaterThan(0)
    for (const x of r.rows) expect(r.liveDays.has(x.day)).toBe(true)
  })
})

// Ticket session-view/02: titles strip noise, and a session with no real question is not listed
// (spec A3a/A4).
// The noise shapes come from real sampling (297 sessions: Warmup 188, cron 92, caveat 13, slash 2),
// not from the research-phase list.
describe('session titles and the listing rules', () => {
  it('Claude: a session containing only a Warmup is not listed, but its tokens still count', async () => {
    mkClaudeFile('warm.jsonl', [
      userLine('Warmup'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 50)
    ])
    mkClaudeFile('real.jsonl', [
      userLine('帮我看下这个 bug'),
      usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.map((s) => s.title)).toEqual(['帮我看下这个 bug'])
    // A warmup session's tokens are counted in full (the same rule as subagents)
    expect(p?.tokens.bySide.claude.total).toBe(165)
    expect(r.global.bySide.claude.total).toBe(165)
  })

  it('Claude: with several noise messages in a row it keeps walking forward, taking the first real question as the title', async () => {
    mkClaudeFile('noisy.jsonl', [
      userLine('<local-command-caveat>Caveat: …</local-command-caveat>'),
      userLine('<command-name>/clear</command-name> <command-message>clear</command-message> <command-args></command-args>'),
      userLine('继续会话查看功能:读 spec'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions[0].title).toBe('继续会话查看功能:读 spec')
  })

  it('Claude: a cron session is listed, with the real instruction after the bracket as its title', async () => {
    mkClaudeFile('cron.jsonl', [
      userLine('[cron:95a214a4-0021-44ea-a831-f5c851b11d77 hackernews-daily-top5] 取今日最热门的 5 个话题'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions[0].title).toBe('取今日最热门的 5 个话题')
  })

  it('Codex: a session with no user_message is not listed, and its tokens still count', async () => {
    mkCodexRollout('rollout-nouser-019fc01.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol',
      [{ input: 100, cached: 0, output: 20 }], false, 2000, null)
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.filter((s) => s.side === 'codex')).toHaveLength(0)
    expect(p?.tokens.bySide.codex.total).toBe(120)
  })

  it('Codex: thread_name takes priority over the first question', async () => {
    const id = '019fc0a2-380e-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-named-${id}.jsonl`, proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000, '首条提问原文')
    writeIndex([{ id, name: '线程名' }])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.side === 'codex')?.title).toBe('线程名')
  })

  it('Codex: with no thread_name it falls back to the first real question (noise stripped the same way)', async () => {
    mkCodexRollout('rollout-unnamed-019fc03.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000,
      '[cron:abc daily] 每天跑一遍回归')
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.side === 'codex')?.title).toBe('每天跑一遍回归')
  })

  // Ticket 03's retrospective review R1: a retitle should only happen when the original title came from
  // the first question;
  // thread_name's priority (spec A4) is not invalidated by stripping.
  it('Codex: a prefix-stripped fork with a thread_name keeps the thread_name as its title, not displaced by the first surviving question', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000011'
    const CHILD = '019f0000-bbbb-7000-8000-000000000012'
    writeFileSync(
      join(d, `rollout-${PARENT}.jsonl`),
      [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n'
    )
    writeFileSync(
      join(d, `rollout-${CHILD}.jsonl`),
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', '父问一'), // 重放(时间戳被改写,内容相同)
        q('2026-07-30T02:00:05Z', '子的新问')
      ].join('\n') + '\n'
    )
    writeIndex([{ id: CHILD, name: 'fork 线程名' }])
    const r = await engine().build(roots(), [proj])
    const child = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.forkState === 'stripped')
    expect(child, '剥离过的子会话应在列(还有存活提问)').toBeDefined()
    expect(child?.title, 'thread_name 优先(A4),retitle 不得顶掉它').toBe('fork 线程名')
  })

  // Ticket 03's retrospective review R3 (the user's ruling, 2026-08-05): a fork verified to have been
  // stripped empty (a pure replay, fingerprints matching across the span,
  // no new question) is not listed and its tokens still count — structurally identical to A3a's "no
  // question to find means not listed".
  // Stripping empty can only come from the fingerprint path: the heuristic never strips empty, and a child
  // with no questions already has listed=false from parse time.
  it('Codex: a pure-replay fork (verified as stripped empty) is not listed, and its tokens still count', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const usage = (ts: string, input: number, output: number): string =>
      JSON.stringify({
        timestamp: ts,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: { input_tokens: input, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: output, total_tokens: input + output } }
        }
      })
    const PARENT = '019f0000-aaaa-7000-8000-000000000021'
    const CHILD = '019f0000-bbbb-7000-8000-000000000022'
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(
      join(d, `rollout-${PARENT}.jsonl`),
      [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n'
    )
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', '父问一'), // 全部提问都是重放,fork 后没产生新提问
        usage('2026-07-30T02:00:01Z', 100, 20)
      ].join('\n') + '\n'
    )
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.file === childFile), '剥空的 fork 不该入列').toBeUndefined()
    expect(p?.sessions.filter((s) => s.side === 'codex'), '父会话照常在列').toHaveLength(1)
    expect(p?.tokens.bySide.codex.total, '不入列不等于不计 token').toBe(120)
  })
})

// ── Ticket 04: sessionQuestions (the session page service: signature validation / single-file rebuild /
// stripping sharing its source) ──
import { appendFileSync } from 'node:fs'

describe('sessionQuestions (the session page service)', () => {
  it('a matching signature: the cached index is used directly, giving the side, the count and forkState', async () => {
    const cl = mkClaudeFile('sq.jsonl', [
      userLine('问一', '2026-07-30T02:00:00Z'),
      usageLine('claude-fable-5', '2026-07-30T02:00:10Z', 10, 5),
      userLine('问二', '2026-07-30T03:00:00Z')
    ])
    const e = engine()
    await e.build(roots(), [proj])
    const r = await e.sessionQuestions(roots(), cl)
    expect(r.side).toBe('claude')
    expect(r.questions).toHaveLength(2)
    expect(r.forkState).toBe('none')
  })

  it('a changed signature: only that file\'s index is rebuilt, and the new index is written back to the cache (visible on disk)', async () => {
    const cl = mkClaudeFile('sq2.jsonl', [userLine('问一', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(cl, userLine('问二', '2026-07-30T04:00:00Z') + '\n') // size 变 → 签名不符
    const r = await e.sessionQuestions(roots(), cl)
    expect(r.questions, '重建后应看到追加的提问').toHaveLength(2)
    // The write-back assertion: that file's index and signature in the persisted cache are both updated —
    // the evidence for "no rebuild needed next time"
    const cache = JSON.parse(readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')) as {
      files: Record<string, { sig: string; agg: { questions: unknown[] } }>
    }
    expect(cache.files[cl].agg.questions).toHaveLength(2)
    const st = statSync(cl)
    expect(cache.files[cl].sig).toBe(`${st.mtimeMs}:${st.size}`)
  })

  it('a codex fork: the stripping shares its source with the list (stripped, leaving only the new questions)', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000001'
    const CHILD = '019f0000-bbbb-7000-8000-000000000002'
    const parentFile = join(d, `rollout-${PARENT}.jsonl`)
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(parentFile, [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n')
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', '父问一'), // 重放(时间戳被改写,内容相同)
        q('2026-07-30T02:00:05Z', '子的新问')
      ].join('\n') + '\n'
    )
    const e = engine()
    await e.build(roots(), [proj])
    const r = await e.sessionQuestions(roots(), childFile)
    expect(r.side).toBe('codex')
    expect(r.forkState).toBe('stripped')
    expect(r.questions).toHaveLength(1)
  })

  // Ticket 05: isFresh is the renderer's criterion for "should the rebuilding interim state be shown"
  // (a read-only predicate that triggers no rebuild)
  it('isFresh: true after a build; false once the file is appended to; false for an unknown or deleted file', async () => {
    const cl = mkClaudeFile('fresh.jsonl', [userLine('问', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    expect(e.isFresh(cl)).toBe(true)
    appendFileSync(cl, userLine('又一问', '2026-07-30T03:00:00Z') + '\n')
    expect(e.isFresh(cl), '追加后签名不符,应为假').toBe(false)
    expect(e.isFresh(join(dir, 'nope.jsonl')), '不在Index中的文件为假').toBe(false)
    const gone = mkClaudeFile('fresh-gone.jsonl', [userLine('问', '2026-07-30T02:00:00Z')])
    await e.build(roots(), [proj])
    rmSync(gone)
    expect(e.isFresh(gone), '文件已删为假').toBe(false)
  })

  // Ticket 06: the banner's data — Claude's branch point count, and for a stripped Codex fork the parent
  // title and file
  it('a branching Claude session: sessionQuestions gives forkPoints; a linear session gives 0', async () => {
    const q = (u: string, p: string | null, t: string): string =>
      JSON.stringify({ type: 'user', uuid: u, parentUuid: p, timestamp: '2026-07-30T02:00:00Z', message: { role: 'user', content: t } })
    const a = (u: string, p: string): string =>
      JSON.stringify({ type: 'assistant', uuid: u, parentUuid: p, timestamp: '2026-07-30T02:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } })
    const forked = mkClaudeFile('forked.jsonl', [q('u1', null, '问一'), a('a1', 'u1'), q('u2b', 'a1', '走岔的'), q('u2', 'a1', '问二')])
    const linear = mkClaudeFile('linear.jsonl', [q('v1', null, '问一'), a('b1', 'v1'), q('v2', 'b1', '问二')])
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), forked)).forkPoints).toBe(1)
    expect((await e.sessionQuestions(roots(), linear)).forkPoints).toBe(0)
  })

  it('a stripped codex fork: carries the parent session\'s title and file; an orphan fork has both null', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000031'
    const CHILD = '019f0000-bbbb-7000-8000-000000000032'
    const ORPHAN = '019f0000-cccc-7000-8000-000000000033'
    const parentFile = join(d, `rollout-${PARENT}.jsonl`)
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    const orphanFile = join(d, `rollout-${ORPHAN}.jsonl`)
    writeFileSync(parentFile, [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n')
    writeFileSync(
      childFile,
      [meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }), q('2026-07-30T02:00:00Z', '父问一'), q('2026-07-30T02:00:05Z', '子的新问')].join('\n') + '\n'
    )
    writeFileSync(
      orphanFile,
      [meta('2026-07-30T03:00:00Z', ORPHAN, { forked_from_id: '019f0000-dead-7000-8000-000000000099' }), q('2026-07-30T03:00:00Z', '孤儿的问')].join('\n') + '\n'
    )
    const e = engine()
    await e.build(roots(), [proj])
    const child = await e.sessionQuestions(roots(), childFile)
    expect(child.forkState).toBe('stripped')
    expect(child.forkParentTitle).toBe('父问一')
    expect(child.forkParentFile).toBe(parentFile)
    const orphan = await e.sessionQuestions(roots(), orphanFile)
    expect(orphan.forkState).toBe('uncertain')
    expect(orphan.forkParentTitle).toBeNull()
    expect(orphan.forkParentFile).toBeNull()
    // The Claude side has no parent concept and is always null; forkPoints is always 0 for Codex
    expect(child.forkPoints).toBe(0)
  })

  it('present in the cache but the file has been deleted: an explicit error rather than a silent empty list (a spec failure path)', async () => {
    const cl = mkClaudeFile('gone.jsonl', [userLine('问'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    const e = engine()
    await e.build(roots(), [proj])
    rmSync(cl)
    // Assert the **error code** rather than wording: the wording is produced by the renderer per language
    // (ADR-0015)
    await expect(e.sessionQuestions(roots(), cl)).rejects.toSatisfy(
      (err: unknown) => decodeAppError(err)?.code === ERR.sessionFileUnreadable
    )
  })

  it('a file not in the cache: refused (with the caller guiding a refresh) rather than a silent empty list', async () => {
    const e = engine()
    await e.build(roots(), [proj])
    await expect(e.sessionQuestions(roots(), join(dir, 'nope.jsonl'))).rejects.toThrow()
  })

  it('build also produces the session read allow-list: listed sessions and subagent/nested files are in it, nothing else is', async () => {
    const cl = mkClaudeFile('wl.jsonl', [userLine('问'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    // A nested file (a subagent transcript): listed=false, but 07 needs to expand it → it must be in the
    // allow-list
    const nested = mkClaudeFile('sub/agent-x.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    const e = engine()
    const t = await e.build(roots(), [proj])
    expect(t.sessionFiles.has(cl)).toBe(true)
    expect(t.sessionFiles.has(nested)).toBe(true)
  })

  it('an unregistered project\'s sessions do not enter the allow-list — the read side is no wider than what the UI can reach (spec A2)', async () => {
    // Unregistered: the encoded directory is not in the claudePaths mapping → projectKey=''
    const orphan = mkClaudeFile('orphan.jsonl', [
      userLine('未注册项目里的提问'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)
    ], 1000, '-Users-nobody-unregistered')
    const orphanNested = mkClaudeFile('sub/agent-o.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)
    ], 1000, '-Users-nobody-unregistered')
    const e = engine()
    const t = await e.build(roots(), [proj])
    expect(t.sessionFiles.has(orphan), '未注册项目的入列会话不该可读').toBe(false)
    expect(t.sessionFiles.has(orphanNested), '未注册项目的嵌套转写同样不该可读').toBe(false)
    // On the Codex side "unregistered" does not show up in projectKey (it is computed straight from cwd
    // and is never empty) —
    // so it has to be filtered against the explicit registered set; Claude's ''-emptiness criterion is a
    // false guard on this side
    const cxOrphan = mkCodexRollout(
      'rollout-orphan-019f9999-aaaa-7000-8000-000000000009.jsonl',
      join(dir, 'not-registered-proj'),
      '2026-07-30T01:00:00Z',
      'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }]
    )
    const t2 = await engine().build(roots(), [proj], new Set([proj.toLowerCase()]))
    expect(t2.sessionFiles.has(cxOrphan), '未注册 cwd 的 codex 会话不该可读').toBe(false)
  })
})
