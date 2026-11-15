// Ticket 04 plus the correction round: the token aggregation engine (aligned with ccusage, 2026-07-30) —
// a whole-tree scan (independent of the registry), deduplication by message.id+requestId (with the
// sidechain fallback),
// all four fields summed into the total, synthetic staying out of the model buckets, bad lines skipped
// while streaming, and the incremental cache.
//
// Gap (#158): a file growing *while* it is being parsed is not driven here — that the cache signature
// is taken before the parse, so the growth shows as a change on the next scan, needs a writer racing
// the reader, which no test here controls. A read hook would let a test append mid-read: a seam in the engine
// module's reader (engine/src/read/), which reads every side's session files.
//
// Gap (#278): the session questions' re-title failing on the session's own line — they then keep the title
// it was parsed with — has no case of its own. It could have one: the cache signature is mtime and size, so a
// change that keeps both (the line rewritten in place at the same length with the mtime pinned, or read
// permission removed) fails that read while the signature still matches. It has none because the fallback is
// the expression the banner case whose parent's file is gone drives through the parent's call, and both ways
// in rest on a state the app does not build itself (a pinned mtime) or one in which the page fails as a whole
// (no read permission). The list's fallback is driven through a parse runner that removes the file. A case is
// due if the session's own call stops sharing that expression.
import { chmodSync, copyFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync, readdirSync, statSync, openSync, writeSync, closeSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CACHE_VERSION, RESUME_LIMIT, TokenEngine, projectStatsFromRows, rowsFromStoreSnapshot, runParseJob, wholeCombination, type ParseJob, type ParseResult, type ParseRunner, type TokenBuildResult } from './token-stats'
import { TEST_ENGINE, type PanicSeam, type StoreWriteSeam } from '../testing/engine'
import { STORE_FILE, onStore, openElsewhere, storeFileBytes, storedEntries, storedGroups, storePath, storeRows, storeVersion } from '../testing/token-store'
import { loadEngineModule } from '../engine-module'
import { compareScanOrder } from './scan-order'
import { spawn } from 'node:child_process'
import { constants as zstdConstants, zstdCompressSync } from 'node:zlib'
import { encodeClaudeProjectDir } from './claude'
import { sessionReadTarget } from '../security'
import { ERR, decodeAppError } from '@shared/errors'
import { mergeKey } from '@shared/path-key'
import type { ScanRoots } from './types'
import { walkSessions } from './scan'
import { AGENT_SIDES } from '@shared/validate'
import type { AgentSide } from '@shared/domain'
import { callRecord, encodeTrajectoryMetadata, writeConversation, writeSummaries, type UsageFixture } from '../testing/agy-fixture'
import { MEASURED_TRANSCRIPT, writeTranscript } from '../testing/agy-transcript-fixture'

let dir: string
let proj: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    geminiHome: join(dir, '.gemini'),
    grokHome: join(dir, '.grok'),
    antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
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
  /**
   * Per-turn increments (last_token_usage), attributed to a day by their own timestamps.
   * `cacheWrite` defaults to 0 because that is what real records carry (50791/50791 on this
   * machine); it is settable only so the "not collected" rule (B5) has a shape to be tested against.
   */
  turns: Array<{
    input: number
    cached: number
    output: number
    at?: string
    cacheWrite?: number
    /**
     * Emits this turn as a **re-report of the previous one**: the running `total_token_usage` does
     * not advance, which is how the side re-emits a turn it has already accounted for (spec B7).
     * The per-turn figures are still written, exactly as real records do.
     */
    repeat?: boolean
    /**
     * Overrides the record's own `total_tokens`. Real records normally satisfy
     * total == input + output, but 412 of this machine's 50791 carry an all-zero breakdown beside a
     * non-zero total — a shape that has to come from real data, since nobody would invent it (spec B6).
     */
    total?: number
    /**
     * Also writes this response's **usage record** (`token_usage_record`, ADR-0027) with the given
     * response id, a few milliseconds before the usage event — the order every paginated rollout on
     * this machine shows (1391 files enumerated 2026-09-10). The record's payload carries the one key
     * set observed (5029 of 5029 records): thread/turn/session/root-turn ids, the response id, its own
     * usage and the turn's and thread's running totals. A rollout with any record is paginated: the
     * parser's usage boundary is its first record line (spec B9).
     */
    record?: string
  }>,
  subagent = false,
  atSec = 2000,
  /** A real question; pass null to build a session nobody ever asked anything in (spec A3a) */
  userMsg: string | null = 'sample question',
  /** The session's own id and, for a subagent, the parent thread it was spawned from (the real
   * `source.subagent.thread_spawn.parent_thread_id` shape the parser reads) */
  ids?: { id: string; parentId?: string }
): string {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  let acc = { input: 0, cached: 0, output: 0 }
  /** The records' own running total: advances on every response, a re-reported event included */
  let recAcc = { input: 0, cached: 0, output: 0 }
  const running = (a: { input: number; cached: number; output: number }): Record<string, number> => ({
    input_tokens: a.input,
    cached_input_tokens: a.cached,
    cache_write_input_tokens: 0,
    output_tokens: a.output,
    reasoning_output_tokens: 0,
    total_tokens: a.input + a.output
  })
  const THREAD = '019f0000-0000-7000-8000-00000000f1de'
  const lines = [
    JSON.stringify({
      timestamp: tsIso,
      type: 'session_meta',
      payload: {
        cwd,
        ...(ids ? { id: ids.id } : {}),
        ...(subagent ? { thread_source: 'subagent' } : {}),
        ...(ids?.parentId ? { source: { subagent: { thread_spawn: { parent_thread_id: ids.parentId } } } } : {})
      }
    }),
    JSON.stringify({ timestamp: tsIso, type: 'turn_context', payload: { model, cwd } }),
    ...(userMsg === null
      ? []
      : [JSON.stringify({ timestamp: tsIso, type: 'event_msg', payload: { type: 'user_message', message: userMsg } })]),
    // The real shape: top-level type=event_msg with the data in payload.info (payload.type=token_count)
    ...turns.flatMap((t) => {
      // A re-report leaves the running cumulative where it was — that non-advance is the only thing
      // distinguishing it from a genuine turn, and is what spec B7's rule keys on
      if (t.repeat !== true) {
        acc = { input: acc.input + t.input, cached: acc.cached + t.cached, output: acc.output + t.output }
      }
      const event = JSON.stringify({
        timestamp: t.at ?? tsIso,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: t.input,
              cached_input_tokens: t.cached,
              cache_write_input_tokens: t.cacheWrite ?? 0,
              output_tokens: t.output,
              // Real records satisfy total == input + output with no write term (50379/50791; the
              // remainder carry an all-zero breakdown, spec B6) — the fixture keeps that identity
              // even when a write figure is present, which is what makes B5 testable
              total_tokens: t.total ?? t.input + t.output
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
      if (t.record === undefined) return [event]
      recAcc = { input: recAcc.input + t.input, cached: recAcc.cached + t.cached, output: recAcc.output + t.output }
      const record = JSON.stringify({
        timestamp: t.at ?? tsIso,
        type: 'token_usage_record',
        payload: {
          thread_id: THREAD,
          turn_id: `${THREAD}-turn`,
          session_id: THREAD,
          root_turn_id: `${THREAD}-turn`,
          response_id: t.record,
          usage: running({ input: t.input, cached: t.cached, output: t.output }),
          turn_token_usage: running(recAcc),
          thread_token_usage: running(recAcc)
        }
      })
      return [record, event]
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
      payload: { type: 'user_message', message: 'question after the fork' }
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

interface GrokTurnUsage {
  input: number
  cached?: number
  output: number
  cacheCreation?: number
  model?: string
  /** Override the modelUsage map (multi-model turns); null omits it entirely */
  modelUsage?: Record<string, { input: number; cached?: number; output: number; cacheCreation?: number }> | null
}
/**
 * A Grok turn_completed line (the measured shape, 2026-08-16): an epoch-**second** timestamp at the
 * top level, the usage under params.update, carrying costUsdTicks and a modelUsage map keyed by the
 * **billed** model name. The cost figure is deliberately present in every fixture line — F4 is
 * "neither read nor archived", which a fixture without the field could not test.
 */
function grokTurn(tsSec: number, u: GrokTurnUsage): string {
  const fields = (x: { input: number; cached?: number; output: number; cacheCreation?: number }): Record<string, number> => ({
    inputTokens: x.input,
    outputTokens: x.output,
    totalTokens: x.input + x.output,
    cachedReadTokens: x.cached ?? 0,
    cacheCreationTokens: x.cacheCreation ?? 0,
    reasoningTokens: 0,
    modelCalls: 1,
    apiDurationMs: 1000,
    costUsdTicks: 1761648000
  })
  const mu =
    u.modelUsage === null
      ? undefined
      : u.modelUsage
        ? Object.fromEntries(Object.entries(u.modelUsage).map(([m, x]) => [m, fields(x)]))
        : { [u.model ?? 'grok-4.5-build']: fields(u) }
  return JSON.stringify({
    timestamp: tsSec,
    method: '_x.ai/session/update',
    params: {
      sessionId: 's',
      update: {
        sessionUpdate: 'turn_completed',
        prompt_id: 'p',
        stop_reason: 'end_turn',
        usage: { ...fields(u), ...(mu ? { modelUsage: mu } : {}), numTurns: 1 }
      }
    }
  })
}
/** A Grok session directory (the real layout): summary.json names a summary-level model that is NOT
 * the billed name, so a per-model case can tell the two apart (F3) */
function mkGrokSession(
  cwd: string,
  id: string,
  lines: string[],
  opts: { subagent?: boolean; summaryTitle?: string } = {}
): string {
  const d = join(dir, '.grok', 'sessions', encodeURIComponent(cwd), id)
  mkdirSync(d, { recursive: true })
  const summary: Record<string, unknown> = { info: { id, cwd }, current_model_id: 'grok-4.5' }
  if (opts.subagent) summary['session_kind'] = 'subagent'
  if (opts.summaryTitle) summary['session_summary'] = opts.summaryTitle
  writeFileSync(join(d, 'summary.json'), JSON.stringify(summary))
  const f = join(d, 'updates.jsonl')
  writeFileSync(f, lines.join('\n') + '\n')
  return f
}
/** A Grok update record line (the measured envelope) */
function grokLine(tsSec: number, update: Record<string, unknown>): string {
  return JSON.stringify({
    timestamp: tsSec,
    method: '_x.ai/session/update',
    params: { sessionId: 's', update }
  })
}
/** A user question chunk; promptIndex ties the chunks of one question together (measured shape) */
function grokUser(tsSec: number, text: string, promptIndex: number): string {
  return grokLine(tsSec, {
    sessionUpdate: 'user_message_chunk',
    content: { type: 'text', text },
    _meta: { modelId: 'grok-4.5', promptIndex }
  })
}

/** An Antigravity CLI conversation in `cwd`, one call per entry (the step and generator record agy writes for each) */
function mkAgyConversation(id: string, cwd: string, calls: Array<{ usage: UsageFixture; at: number; model?: string }>): string {
  const d = join(dir, '.gemini', 'antigravity-cli', 'conversations')
  mkdirSync(d, { recursive: true })
  const rows = calls.map((c, i) =>
    callRecord({ conversationId: id, stepIdx: 1 + i * 2, genIdx: i, usage: c.usage, createdAt: c.at, completedAt: c.at, responseModel: c.model ?? 'gemini-3.6-flash' })
  )
  return writeConversation(d, id, encodeTrajectoryMetadata({ folders: [cwd], conversationId: id }), {
    steps: rows.map((r) => r.step),
    gens: rows.map((r) => r.gen)
  }).file
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
  return new TokenEngine(join(dir, 'cache'), TEST_ENGINE)
}

describe('Claude aggregation (the ccusage rules)', () => {
  it('all four fields sum into the total; cache is listed separately; model buckets use the same rules; the title comes from the first user message', async () => {
    mkClaudeFile('a.jsonl', [
      userLine('fix a layout bug for me, thanks'),
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
    expect(p?.sessions[0].title).toContain('fix a layout')
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
      userLine('a main session question'),
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
      userLine('first question'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      '{"type":"user","message":{"role":"user","content":"half a line written so f', // half a line, unparseable
      userLine('second question'),
      usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 10, 5)
    ])
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.file.endsWith('mid-bad.jsonl'))
    expect(s?.questionCount, 'a bad line must not swallow the questions around it').toBe(2)
    expect(s?.title).toBe('first question')
  })
})

describe('Codex aggregation (the ccusage rules)', () => {
  it('sums per-turn last_token_usage increments; sanitises input (subtracting cached) and lists cached separately; the model comes from turn_context and the title from session_index', async () => {
    const id = '019fa9a1-380e-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-2026-07-30T00-49-03-${id}.jsonl`, proj, '2026-07-30T00:49:03Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10 },
      { input: 400, cached: 320, output: 20 }
    ])
    writeIndex([{ id, name: 'migrate skills' }])
    const r = await engine().build(roots(), [proj])
    // Raw input totals 500 (including 400 cached) → net input 100, cacheRead 400, output 30; total across
    // all four = 530
    expect(r.global.bySide.codex).toMatchObject({ input: 100, output: 30, cacheRead: 400, total: 530 })
    const models = Object.fromEntries(r.global.byModel.map((m) => [`${m.side}:${m.model}`, m.total]))
    expect(models['codex:gpt-5.6-sol']).toBe(530)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.side === 'codex')?.title).toBe('migrate skills')
  })

  it('a turn re-reported without the cumulative advancing is counted once (B7)', async () => {
    // The shape comes from real data: on this machine 9 of the 17 days that disagreed with the
    // third-party meter disagreed by **exactly** the sum of such re-reports, to the token.
    mkCodexRollout('rollout-dup-019f006.jsonl', proj, '2026-07-30T05:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10 },
      { input: 100, cached: 80, output: 10, repeat: true },
      { input: 200, cached: 150, output: 20 }
    ])
    const r = await engine().build(roots(), [proj])
    const c = r.global.bySide.codex
    // 110 + 220. Counting the re-report as well would give 440.
    expect(c.total).toBe(330)
    expect(c.cacheRead).toBe(230) // 80 + 150, the re-report's 80 not counted again
    expect(c.input + c.output + c.cacheRead + c.cacheWrite).toBe(c.total)
  })

  it('two genuinely identical consecutive turns both count — the rule keys on the cumulative, not on the per-turn figure (B7)', async () => {
    // The case that separates the rule from the tempting shortcut. Both turns report the same
    // per-turn figures, so "drop a repeat of the previous per-turn figure" would silently discard
    // the second; the cumulative advances, so it is a real turn and must be kept. On the data
    // measured to date the two criteria select the same records, which is exactly why this case has
    // to exist — the agreement is a property of that data, not of the format.
    mkCodexRollout('rollout-twin-019f007.jsonl', proj, '2026-07-30T06:00:00Z', 'gpt-5.6-sol', [
      { input: 50, cached: 0, output: 5 },
      { input: 50, cached: 0, output: 5 }
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex.total).toBe(110)
  })

  it('a reported cache-write figure is not collected and does not enter the total (B5)', async () => {
    // 500 of cache creation — a shape real records never carry (50791/50791 read zero), written here
    // deliberately large so that collecting it would be unmistakable rather than a rounding-sized
    // difference. Collecting it would put the total at 610 while the record's own total_tokens says
    // 110; where those 500 actually sit is not observable, but disagreeing with the side's own
    // published total is (ADR-0023).
    mkCodexRollout('rollout-cw-019f004.jsonl', proj, '2026-07-30T02:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10, cacheWrite: 500 }
    ])
    const r = await engine().build(roots(), [proj])
    const c = r.global.bySide.codex
    // total = rawInput + output = 110, the figure this side reports for itself. Collecting the write
    // would give 610.
    expect(c.total).toBe(110)
    expect(c.input).toBe(20) // sanitised: 100 reported minus 80 cached
    expect(c.cacheRead).toBe(80)
    expect(c.output).toBe(10)
    expect(c.cacheWrite).toBe(0)
    // The invariant the composition view depends on: the four fields sum to the total, on every side
    expect(c.input + c.output + c.cacheRead + c.cacheWrite).toBe(c.total)
    // The per-model bucket is fed from the same total, so a leak there would survive the check above
    const models = Object.fromEntries(r.global.byModel.map((m) => [`${m.side}:${m.model}`, m.total]))
    expect(models['codex:gpt-5.6-sol']).toBe(110)
  })

  it('a record with an all-zero breakdown beside a non-zero total contributes nothing (B6, a known under-count)', async () => {
    // A shape taken from real data, not imagined: 412 of this machine's 50791 Codex usage records
    // look exactly like this — every field zero, `total_tokens` not. The total is derived from the
    // fields rather than read from the record, so such a record contributes nothing. That is a
    // deliberate under-count (spec B6): a total no field can account for could not be attributed to
    // a day, a model or a bucket, and admitting it would break the four-fields-sum-to-total
    // invariant this side now relies on.
    mkCodexRollout('rollout-b6-019f005.jsonl', proj, '2026-07-30T04:00:00Z', 'gpt-5.6-sol', [
      { input: 0, cached: 0, output: 0, total: 12908 },
      { input: 40, cached: 10, output: 5 }
    ])
    const r = await engine().build(roots(), [proj])
    const c = r.global.bySide.codex
    // Only the second turn counts: 40 + 5. Reading `total_tokens` instead would give 12953.
    expect(c.total).toBe(45)
    expect(c.input + c.output + c.cacheRead + c.cacheWrite).toBe(c.total)
  })

  it('a session spanning midnight is apportioned to its respective dates by event timestamp (no longer piled onto the first day)', async () => {
    // Two timestamps 24h apart, so it crosses a day boundary in any local time zone
    mkCodexRollout('rollout-cross-019f003.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 0, at: '2026-07-29T12:00:00Z' },
      { input: 200, cached: 0, output: 0, at: '2026-07-30T12:00:00Z' }
    ])
    const r = await engine().build(roots(), [proj])
    const byDay = Object.fromEntries(r.global.byDay.map((d) => [d.day, d.bySide.codex]))
    expect(Object.keys(byDay).length).toBe(2)
    expect(Object.values(byDay).reduce((a, b) => a + b, 0)).toBe(300)
  })

  it('a paginated rollout counts usage records once per response from the first record on — a response the cumulative rule drops is still counted (B1, B7, ADR-0027)', async () => {
    // The measured shape (17 of 345 dual-source rollouts on this machine, 2026-09-10): the second
    // response's usage event repeats the cumulative, so the legacy rule drops it, while its usage
    // record carries it under its own response id.
    mkCodexRollout('rollout-rec-019f010.jsonl', proj, '2026-07-30T07:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10, record: 'resp_a' },
      { input: 200, cached: 150, output: 20, record: 'resp_b', repeat: true }
    ])
    const r = await engine().build(roots(), [proj])
    const c = r.global.bySide.codex
    // 110 + 220 from the records; the legacy rule alone would give 110
    expect(c.total).toBe(330)
    expect(c.cacheRead).toBe(230)
    expect(c.input + c.output + c.cacheRead + c.cacheWrite).toBe(c.total)
  })

  it('the usage boundary is by line order: events before the first record count under B7, an event after it is ignored even with an earlier timestamp (B9)', async () => {
    // The two rollouts on this machine that carry events before their boundary hold 1.69 B tokens
    // between them: the span before the first record line is read by the legacy rule, repeats and all.
    mkCodexRollout('rollout-bnd-019f011.jsonl', proj, '2026-07-30T07:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10 },
      { input: 100, cached: 80, output: 10, repeat: true },
      { input: 50, cached: 0, output: 5, record: 'resp_c', at: '2026-07-30T07:10:00Z' },
      // After the boundary by line, before it by timestamp: ignored — the boundary is the line
      { input: 999, cached: 0, output: 99, at: '2026-07-30T07:05:00Z' }
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex.total).toBe(110 + 55)
  })

  it('two usage records with one response id are one response (B1)', async () => {
    mkCodexRollout('rollout-dupid-019f012.jsonl', proj, '2026-07-30T07:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 10, record: 'resp_same' },
      { input: 100, cached: 0, output: 10, record: 'resp_same' }
    ])
    const r = await engine().build(roots(), [proj])
    // Counting both records (or the two events after the boundary) would give 220
    expect(r.global.bySide.codex.total).toBe(110)
  })

  it('a paginated subagent child with usage records is counted from its own file only — nothing is stripped, even when its first responses look like a rewritten burst (B10)', async () => {
    // Codex copies neither usage records nor, in paginated mode, usage events into a child thread
    // (spawn.rs, 2026-09-09 tree), so a child rollout holds only its own usage. Its first responses
    // 300 ms apart would be a "rewritten burst" to the legacy heuristic; the boundary says otherwise.
    const PARENT = '019f0000-0000-7000-8000-0000000000aa'
    const CHILD = '019f0000-0000-7000-8000-0000000000bb'
    mkCodexRollout('rollout-parent-019f020.jsonl', proj, '2026-07-30T08:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 1, record: 'resp_p1' }
    ], false, 2000, 'sample question', { id: PARENT })
    mkCodexRollout(
      'rollout-child-019f021.jsonl',
      proj,
      '2026-07-30T08:00:10Z',
      'gpt-5.6-sol',
      [
        { input: 100, cached: 0, output: 10, record: 'resp_c1', at: '2026-07-30T08:00:10.000Z' },
        { input: 200, cached: 0, output: 20, record: 'resp_c2', at: '2026-07-30T08:00:10.300Z' },
        { input: 300, cached: 0, output: 30, record: 'resp_c3', at: '2026-07-30T08:00:20.000Z' }
      ],
      true,
      2000,
      'sample question',
      { id: CHILD, parentId: PARENT }
    )
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex.total).toBe(11 + 110 + 220 + 330)
  })

  it('a legacy fork child still has its replayed prefix stripped against the parent (B10)', async () => {
    const PARENT = '019f0000-0000-7000-8000-0000000000cc'
    const CHILD = '019f0000-0000-7000-8000-0000000000dd'
    mkCodexRollout('rollout-parent-019f022.jsonl', proj, '2026-07-30T08:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 10, at: '2026-07-30T08:00:00Z' },
      { input: 200, cached: 0, output: 20, at: '2026-07-30T08:01:00Z' }
    ], false, 2000, 'sample question', { id: PARENT })
    mkCodexFork('rollout-fork-019f023.jsonl', proj, { id: CHILD, parentId: PARENT, forkedAtIso: '2026-07-30T08:02:00Z' }, 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 10, at: '2026-07-30T08:02:00Z' }, // the parent's history, replayed
      { input: 200, cached: 0, output: 20, at: '2026-07-30T08:02:00Z' },
      { input: 50, cached: 0, output: 5, at: '2026-07-30T08:05:00Z' } // the fork's own turn
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex.total).toBe(110 + 220 + 55)
  })

  it('a compacted checkpoint carries no usage: it neither adds to the figures nor moves the boundary (B11)', async () => {
    // The real shape (479 compacted records on this machine, 2026-09-10): a summary message, the
    // replacement history of the window, window ids, and a null latest usage record. The usage of the
    // span it replaced is gone for good; the records on either side still count.
    const file = mkCodexRollout('rollout-comp-019f013.jsonl', proj, '2026-07-30T07:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 10, record: 'resp_a' }
    ])
    const compacted = JSON.stringify({
      timestamp: '2026-07-30T07:20:00Z',
      ordinal: 9,
      type: 'compacted',
      payload: {
        message: 'summary of the earlier turns',
        replacement_history: [
          { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'an earlier question' }], internal_chat_message_metadata_passthrough: { turn_id: 't1' } }
        ],
        window_number: 1,
        first_window_id: 'w1',
        previous_window_id: 'w1',
        window_id: 'w2',
        compaction_response_id: null,
        latest_token_usage_record: null
      }
    })
    const after = JSON.stringify({
      timestamp: '2026-07-30T07:30:00Z',
      type: 'token_usage_record',
      payload: {
        thread_id: 't', turn_id: 'u', session_id: 't', root_turn_id: 'u', response_id: 'resp_b',
        usage: { input_tokens: 200, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 0, total_tokens: 220 },
        turn_token_usage: { input_tokens: 300, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 330 },
        thread_token_usage: { input_tokens: 300, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 330 }
      }
    })
    appendFileSync(file, `${compacted}\n${after}\n`)
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex.total).toBe(110 + 220)
  })

  it('a cold rollout (.jsonl.zst) is scanned like its plain twin: the same rows, questions, title and listing, under its compressed path, which enters the read allow-list (B12, R1)', async () => {
    // Codex compresses a rollout untouched for seven days into <name>.jsonl.zst and deletes the plain
    // file (compression.rs); the twin here is the same bytes zstd-compressed, as the agent writes them
    const plain = mkCodexRollout('rollout-warm-019f040.jsonl', proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 20, output: 10, record: 'resp_w1' },
      { input: 200, cached: 40, output: 20, record: 'resp_w2' }
    ])
    const cold = join(dir, '.codex', 'sessions', '2026', '07', '30', 'rollout-cold-019f041.jsonl.zst')
    writeFileSync(cold, zstdCompressSync(readFileSync(plain)))
    const r = await engine().build(roots(), [proj])
    const sessions = r.perProject.get(proj.toLowerCase())?.sessions.filter((s) => s.side === 'codex') ?? []
    expect(sessions.map((s) => s.file).sort()).toEqual([plain, cold].sort())
    const [a, b] = [sessions.find((s) => s.file === plain), sessions.find((s) => s.file === cold)]
    expect(b?.title).toBe(a?.title)
    expect(b?.questionCount).toBe(a?.questionCount)
    expect(b?.tokens).toBe(a?.tokens)
    // Twice the plain rollout's figure: 110 + 220 = 330 each
    expect(r.global.bySide.codex.total).toBe(660)
    expect(r.sessionFiles.has(cold)).toBe(true)
    const q = await engine().sessionQuestions(roots(), cold)
    expect(q.questions).toHaveLength(1)
    // The day Codex compresses the plain twin it deletes it: the next scan's allow-list admits the compressed
    // path and refuses the vanished plain one (R1)
    rmSync(plain)
    const r2 = await engine().build(roots(), [proj])
    expect(sessionReadTarget(r2.sessionFiles, cold)).toBe(cold)
    expect(sessionReadTarget(r2.sessionFiles, plain)).toBeNull()
  })

  it('a cold rollout that is not zstd, is corrupt, or whose stream is cut inside a line, is skipped like an unreadable plain file without aborting its siblings, and one cut exactly at a line end reads as the shorter session (B12)', async () => {
    const plain = mkCodexRollout('rollout-warm-019f042.jsonl', proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 10, record: 'resp_t1' }
    ])
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    writeFileSync(join(d, 'rollout-garbage-019f043.jsonl.zst'), Buffer.from('{"type":"session_meta"}\nnot zstd at all\n'))
    // A truncated stream: the head decodes (the first line lies in the first block), the rest is cut off
    const big = mkCodexRollout('rollout-big-019f044.jsonl', proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol',
      Array.from({ length: 3000 }, (_, i) => ({ input: 1000 + i, cached: 0, output: 10, record: `resp_b${i}` })))
    const full = zstdCompressSync(readFileSync(big))
    rmSync(big)
    writeFileSync(join(d, 'rollout-trunc-019f045.jsonl.zst'), full.subarray(0, Math.floor(full.length / 2)))
    // A cut exactly at a line end: a whole frame of the first lines, then a frame cut inside its header, so the stream
    // decompressed ends with the first frame's last line feed. Whether the decoder reports the cut frame does not
    // decide: Node's reports it from version 26 and not in 24, Electron 43's.
    const shorter = mkCodexRollout('rollout-lineend-019f046.jsonl', proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol', [
      { input: 200, cached: 0, output: 20, record: 'resp_l1' }
    ])
    const lost = `${JSON.stringify({ timestamp: '2026-07-30T09:30:00Z', type: 'token_usage_record', payload: { response_id: 'resp_l2', usage: { input_tokens: 900, cached_input_tokens: 0, output_tokens: 90 } } })}\n`
    const cutAtLineEnd = Buffer.concat([zstdCompressSync(readFileSync(shorter)), zstdCompressSync(Buffer.from(lost)).subarray(0, 5)])
    rmSync(shorter)
    writeFileSync(`${shorter}.zst`, cutAtLineEnd)
    // The not-zstd file above is left out by the session walk, which cannot read its first line. These two are corrupt
    // past their first line, so the walk takes them and only the parse can skip them: a frame whose content checksum
    // fails, and a whole frame followed by bytes that are no frame. Each is long enough that the walk's first read of
    // it ends inside the frame.
    const bulky = (name: string, base: number): string =>
      mkCodexRollout(name, proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol',
        Array.from({ length: 3000 }, (_, i) => ({ input: base + i, cached: 0, output: 10, record: `resp-${name}-${(i * 2654435761) % 4294967296}` })))
    const badSum = bulky('rollout-badsum-019f047.jsonl', 5000)
    const checked = zstdCompressSync(readFileSync(badSum), { params: { [zstdConstants.ZSTD_c_checksumFlag]: 1 } })
    checked[checked.length - 1] ^= 0xff
    const trailed = bulky('rollout-trailing-019f048.jsonl', 9000)
    const withTrail = Buffer.concat([zstdCompressSync(readFileSync(trailed)), Buffer.from('not a zstd frame')])
    rmSync(badSum)
    rmSync(trailed)
    writeFileSync(`${badSum}.zst`, checked)
    writeFileSync(`${trailed}.zst`, withTrail)
    expect(walkSessions(roots()).codex.map((s) => s.file)).toEqual(expect.arrayContaining([`${badSum}.zst`, `${trailed}.zst`]))
    const r = await engine().build(roots(), [proj])
    const sessions = r.perProject.get(proj.toLowerCase())?.sessions.filter((s) => s.side === 'codex') ?? []
    expect(sessions.map((s) => s.file).sort()).toEqual([plain, `${shorter}.zst`].sort())
    expect(sessions.find((s) => s.file === `${shorter}.zst`)?.tokens).toBe(220)
    expect(r.global.bySide.codex.total).toBe(110 + 220)
  })

  it('a rollout that is paginated and cold at once — usage records, completed-item questions, compressed — yields the same usage, questions and title as its plain twin (the closeout of #163–#165)', async () => {
    // No single ticket owns this combination: the boundary and the records (#163), the completed-item
    // questions and the paginated flag (#164), the compressed path (#165) all act on one file here.
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const at = '2026-07-30T10:00:00Z'
    const running = (i: number, o: number): Record<string, number> => ({ input_tokens: i, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: o, reasoning_output_tokens: 0, total_tokens: i + o })
    const record = (id: string, i: number, o: number): string =>
      JSON.stringify({ timestamp: at, ordinal: 7, type: 'token_usage_record', payload: { thread_id: 't', turn_id: 'u', session_id: 't', root_turn_id: 'u', response_id: id, usage: running(i, o), turn_token_usage: running(i, o), thread_token_usage: running(i, o) } })
    const item = (type: string, extra: Record<string, unknown>): string =>
      JSON.stringify({ timestamp: at, ordinal: 9, type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type, id: 'i', ...extra }, started_at_ms: 1, completed_at_ms: 1 } })
    const lines = [
      JSON.stringify({ timestamp: at, ordinal: 0, type: 'session_meta', payload: { cwd: proj } }),
      JSON.stringify({ timestamp: at, ordinal: 1, type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
      item('UserMessage', { content: [{ type: 'text', text: 'combined question one', text_elements: [] }] }),
      record('resp_x1', 100, 10),
      // The legacy event after the boundary is ignored (B9); an all-injected item is not a question (B1)
      JSON.stringify({ timestamp: at, ordinal: 4, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: running(999, 99), total_token_usage: running(999, 99) } } }),
      item('UserMessage', { content: [{ type: 'text', text: '<task-notification>\n<task-id>x</task-id>', text_elements: [] }] }),
      item('AgentMessage', { content: [{ type: 'Text', text: 'first answer' }], phase: 'final_answer' }),
      item('UserMessage', { content: [{ type: 'text', text: 'combined question two', text_elements: [] }] }),
      record('resp_x2', 200, 20),
      record('resp_x2', 200, 20) // a duplicate response id counts once (B1)
    ]
    const plain = join(d, 'rollout-2026-07-30T10-00-00-019f0000-dddd-7000-8000-000000000061.jsonl')
    const cold = join(d, 'rollout-2026-07-30T10-00-00-019f0000-dddd-7000-8000-000000000062.jsonl.zst')
    writeFileSync(plain, lines.join('\n') + '\n')
    writeFileSync(cold, zstdCompressSync(readFileSync(plain)))
    const e = engine()
    const r = await e.build(roots(), [proj])
    const sessions = r.perProject.get(proj.toLowerCase())?.sessions.filter((s) => s.side === 'codex') ?? []
    const a = sessions.find((s) => s.file === plain)
    const b = sessions.find((s) => s.file === cold)
    expect(a?.title).toBe('combined question one')
    expect(b?.title).toBe(a?.title)
    expect(a?.questionCount).toBe(2)
    expect(b?.questionCount).toBe(2)
    expect(a?.tokens).toBe(330)
    expect(b?.tokens).toBe(330)
    expect(r.global.bySide.codex.total).toBe(660)
    const qa = await e.sessionQuestions(roots(), plain)
    const qb = await e.sessionQuestions(roots(), cold)
    expect(qb.questions).toEqual(qa.questions)
    expect(qb.forkState).toBe('none')
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
describe('Grok aggregation (sequence F)', () => {
  it('per-turn usage from the authoritative stream; the total follows the Codex shape, not the Claude one (F1/F2)', async () => {
    // Reported input 1000 ALREADY includes the 600 cached reads (measured on real data:
    // inputTokens ⊇ cachedReadTokens). The fixture also carries a non-zero cache-creation figure —
    // a shape never seen on real data (380/380 records read zero) — precisely so that the
    // "not collected" rule has something to be tested against.
    mkGrokSession(proj, '019f-f2', [
      grokTurn(1786088656, { input: 1000, cached: 600, output: 200, cacheCreation: 50 })
    ])
    const r = await engine().build(roots(), [proj])
    const g = r.global.bySide.grok
    // total = input + output, which is the figure this side reports for itself. Two mistakes turn
    // this case red: adding cacheRead (the Claude four-field sum) gives 1850 — a measured subset of
    // the reported input, counted twice — and adding cache creation gives 1250, which exceeds the
    // total this side publishes about itself (ADR-0023).
    expect(g.total).toBe(1200)
    expect(g.input).toBe(400) // sanitised: reported input minus cached
    expect(g.cacheRead).toBe(600)
    expect(g.output).toBe(200)
    // B5: the field is present in the record and deliberately not read — this side does not report
    // writes, and zero says so without asserting a quantity
    expect(g.cacheWrite).toBe(0)
    // The invariant the composition view depends on: the four fields sum to the total, on every side
    expect(g.input + g.output + g.cacheRead + g.cacheWrite).toBe(g.total)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.tokens.bySide.grok.total).toBe(1200)
  })
})

describe('Grok aggregation (sequence F, continued)', () => {
  it('the per-model split uses the billed name from the usage record, not the summary name (F3)', async () => {
    // The fixture's summary.json names grok-4.5 (mkGrokSession writes current_model_id), matching
    // the real divergence measured 2026-08-16: the billed name is grok-4.5-build
    mkGrokSession(proj, '019f-f3', [
      grokTurn(1786088656, { input: 100, output: 10, model: 'grok-4.5-build' }),
      // A turn whose map bills two models → two buckets out of one turn
      grokTurn(1786088656, {
        input: 0,
        output: 0,
        modelUsage: {
          'grok-4.5-build': { input: 50, output: 5 },
          'grok-4.6-build': { input: 30, output: 3 }
        }
      })
    ])
    const r = await engine().build(roots(), [proj])
    const models = Object.fromEntries(
      r.global.byModel.filter((m) => m.side === 'grok').map((m) => [m.model, m.total])
    )
    expect(models['grok-4.5-build']).toBe(110 + 55)
    expect(models['grok-4.6-build']).toBe(33)
    expect(models['grok-4.5'], 'the summary name must never enter a bucket').toBeUndefined()
  })

  it('sessions spanning midnight are apportioned by each turn\'s own timestamp (F7)', async () => {
    const t0 = 1786088656
    mkGrokSession(proj, '019f-f7', [
      grokTurn(t0, { input: 100, output: 0 }),
      grokTurn(t0 + 86_400, { input: 200, output: 0 }) // 24h later crosses a boundary in any zone
    ])
    const r = await engine().build(roots(), [proj])
    const byDay = Object.fromEntries(r.global.byDay.map((d) => [d.day, d.bySide.grok]))
    expect(Object.keys(byDay).length).toBe(2)
    expect(Object.values(byDay).reduce((a, b) => a + b, 0)).toBe(300)
  })

  it('the cost figure is neither read nor archived (F4)', async () => {
    // Every grokTurn fixture line deliberately carries costUsdTicks — a fixture without the field
    // could not test that it is left behind
    mkGrokSession(proj, '019f-f4', [grokTurn(1786088656, { input: 100, output: 10 })])
    const r = await engine().build(roots(), [proj])
    expect(r.rows.length).toBeGreaterThan(0)
    for (const row of r.rows) {
      expect(Object.keys(row).some((k) => /cost/i.test(k))).toBe(false)
    }
    // The token store is the other archived form: the raw figure must not survive into it either
    const cacheRaw = JSON.stringify(storeRows(join(dir, 'cache')))
    expect(cacheRaw.includes('costUsdTicks')).toBe(false)
    expect(/cost/i.test(cacheRaw)).toBe(false)
  })

  it('a subagent session beside its parent counts toward statistics and produces no session entry (F5)', async () => {
    mkGrokSession(proj, '019f-par5', [grokTurn(1786088656, { input: 100, output: 0 })])
    mkGrokSession(proj, '019f-sub5', [grokTurn(1786088656, { input: 50, output: 0 })], {
      subagent: true
    })
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.grok.total).toBe(150)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.filter((s) => s.side === 'grok')).toEqual([])
  })

  it('a session directory missing its update stream contributes nothing and does not abort its siblings (F6)', async () => {
    mkGrokSession(proj, '019f-whole6', [grokTurn(1786088656, { input: 100, output: 0 })])
    mkdirSync(join(dir, '.grok', 'sessions', encodeURIComponent(proj), '019f-hollow6'), {
      recursive: true
    })
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.grok.total).toBe(100)
  })

  it('a session whose update stream cannot be read contributes nothing, keeps no entry, and counts once it can be read', async () => {
    mkGrokSession(proj, '019f-whole6b', [grokTurn(1786088656, { input: 100, output: 0 })])
    const locked = mkGrokSession(proj, '019f-locked6b', [grokTurn(1786088656, { input: 30, output: 0 })])
    chmodSync(locked, 0)
    try {
      expect((await engine().build(roots(), [proj])).global.bySide.grok.total).toBe(100)
    } finally {
      chmodSync(locked, 0o644)
    }
    // Its signature is unchanged, so an entry kept for it would stand: none was
    expect((await engine().build(roots(), [proj])).global.bySide.grok.total).toBe(130)
  })

  it('two sides with volume on the same day stay keyed apart (a per-side keying mistake is invisible while only one side has data)', async () => {
    mkCodexRollout('rollout-side9-019f902.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 0, at: '2026-07-29T12:00:00Z' }
    ])
    mkGrokSession(proj, '019f-sameday', [
      grokTurn(Date.parse('2026-07-29T12:00:00Z') / 1000, { input: 40, output: 0 })
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.byDay.length).toBe(1)
    expect(r.global.byDay[0].bySide.codex).toBe(100)
    expect(r.global.byDay[0].bySide.grok).toBe(40)
    expect(r.global.byDay[0].bySide.claude).toBe(0)
  })

  it('an empty usage and a usageIsIncomplete record are both tolerated (both measured in real data)', async () => {
    const line = (usage: Record<string, unknown>): string =>
      JSON.stringify({
        timestamp: 1786088656,
        method: '_x.ai/session/update',
        params: {
          sessionId: 's',
          update: { sessionUpdate: 'turn_completed', prompt_id: 'p', stop_reason: 'end_turn', usage }
        }
      })
    mkGrokSession(proj, '019f-variants', [
      grokTurn(1786088656, { input: 100, output: 10 }),
      line({}), // the empty-usage turn: contributes nothing, breaks nothing
      line({
        inputTokens: 20,
        outputTokens: 2,
        totalTokens: 22,
        cachedReadTokens: 0,
        cacheCreationTokens: 0,
        usageIsIncomplete: true,
        modelUsage: {
          'grok-4.5-build': { inputTokens: 20, outputTokens: 2, cachedReadTokens: 0, cacheCreationTokens: 0 }
        }
      })
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.grok.total).toBe(110 + 22)
  })
})

describe('Grok session list (ticket #125)', () => {
  it('a Grok session enters the list with title, time and tokens; the summary name wins and the first question is the fallback', async () => {
    mkGrokSession(
      proj,
      '019f-list1',
      [
        grokUser(1786088656, 'first grok question', 0),
        grokTurn(1786088700, { input: 100, output: 10 })
      ],
      { summaryTitle: 'A summary-named session' }
    )
    mkGrokSession(proj, '019f-list2', [
      grokUser(1786088800, 'fallback title question', 0),
      grokTurn(1786088900, { input: 50, output: 5 })
    ])
    const r = await engine().build(roots(), [proj])
    const sessions = r.perProject.get(proj.toLowerCase())?.sessions.filter((s) => s.side === 'grok')
    expect(sessions?.length).toBe(2)
    const byTitle = new Map((sessions ?? []).map((s) => [s.title, s]))
    expect(byTitle.get('A summary-named session')?.tokens).toBe(110)
    expect(byTitle.get('A summary-named session')?.questionCount).toBe(1)
    // The fallback: no summary name → the title IS the first indexed question (same source)
    expect(byTitle.get('fallback title question')?.tokens).toBe(55)
    // at = the largest timestamp in the file, epoch-second records included (ms in the contract)
    expect(byTitle.get('fallback title question')?.at).toBe(1786088900 * 1000)
    expect(byTitle.get('fallback title question')?.forkState).toBe('none')
  })

  it('a session whose only prompt is an injected system-reminder is not listed, and its tokens still count (A3a analogue)', async () => {
    mkGrokSession(proj, '019f-warm', [
      grokUser(1786088656, '<system-reminder>\nBackground task "call-x" finished.\n</system-reminder>', 0),
      grokTurn(1786088700, { input: 300, output: 60 })
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.filter((s) => s.side === 'grok')).toEqual([])
    expect(r.global.bySide.grok.total).toBe(360)
  })

  it('a multi-chunk question indexes once, and a subagent session stays unlisted even with real questions', async () => {
    mkGrokSession(proj, '019f-chunks', [
      grokUser(1786088656, 'part one of a long pasted question, ', 0),
      grokUser(1786088656, 'part two completing it', 0),
      grokTurn(1786088700, { input: 10, output: 1 })
    ])
    mkGrokSession(
      proj,
      '019f-subq',
      [grokUser(1786088656, 'child question', 0), grokTurn(1786088700, { input: 20, output: 2 })],
      { subagent: true }
    )
    const r = await engine().build(roots(), [proj])
    const sessions = r.perProject.get(proj.toLowerCase())?.sessions.filter((s) => s.side === 'grok')
    expect(sessions?.length).toBe(1)
    expect(sessions?.[0].questionCount).toBe(1)
    expect(sessions?.[0].title).toBe('part one of a long pasted question, part two completing it')
  })
})

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
        { input: 100, cached: 0, output: 10, at: '2026-07-29T09:00:00Z' }, // replays the parent's history
        { input: 50, cached: 0, output: 5, at: '2026-07-31T20:00:00Z' } // new content this time
      ]
    )
    const r = await engine().build(roots(), [proj])
    const child = r.perProject
      .get(proj.toLowerCase())
      ?.sessions.filter((x) => x.side === 'codex')
      .find((x) => x.at === Date.parse('2026-07-31T20:00:00Z'))
    expect(child, 'a fork child at should be its 07-31 last activity, not the 07-29 replay moment').toBeDefined()
  })

  it('every session carries its source file back (on both sides), pointing at a file that really exists', async () => {
    const cl = mkClaudeFile('ident.jsonl', [
      userLine('question one'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const cx = mkCodexRollout('rollout-ident-019fb02.jsonl', proj, '2026-07-30T03:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5 }
    ])
    const sessions = (await engine().build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    expect(sessions.map((s) => s.file).sort()).toEqual([cl, cx].sort())
    for (const s of sessions) expect(existsSync(s.file), `${s.file} should exist`).toBe(true)
  })

  it('subagent and nested files are not listed, so they bring no extra identities with them', async () => {
    mkClaudeFile('main.jsonl', [userLine('a main session question'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
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
      userLine('first question', '2026-07-30T10:00:00Z'),
      usageLine('claude-fable-5', '2026-07-30T10:00:30Z', 10, 5),
      userLine('a follow-up, then I left', '2026-07-30T10:03:53Z')
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'claude')
    expect(s?.at, 'at should be the last user message time, not the last usage line').toBe(
      Date.parse('2026-07-30T10:03:53Z')
    )
  })

  it('Claude: a session with no usage line at all still takes the largest timestamp in the file rather than falling back to mtime', async () => {
    mkClaudeFile('no-usage.jsonl', [userLine('asked one thing then it crashed', '2026-07-30T11:22:33Z')], 1000)
    const r = await engine().build(roots(), [proj])
    // That file produces no tokens but is still a session
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => (x.title ?? '').includes('crashed'))
    expect(s?.at, 'the mtime is 1000s (1970); with a real timestamp inside the file it must not fall back to it').toBe(
      Date.parse('2026-07-30T11:22:33Z')
    )
  })

  it('the Claude side keeps the largest-timestamp semantics (a regression guard)', async () => {
    mkClaudeFile('a.jsonl', [
      userLine('first question'),
      usageLine('claude-fable-5', '2026-07-29T10:00:00Z', 10, 5),
      usageLine('claude-fable-5', '2026-07-31T22:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'claude')
    expect(s?.at).toBe(Date.parse('2026-07-31T22:00:00Z'))
  })
})

// The token store (ADR-0044) as a launch finds it and as a build leaves it. Each case reads and changes the store from
// outside the engine — as another process, a disk or a hand would (testing/token-store.ts) — and judges the engine by
// which files a launch parses and by the figures it gives.
const cacheDir = (): string => join(dir, 'cache')

/** A runner that parses as usual and keeps every job it was handed */
function recording(): { runner: ParseRunner; jobs: Array<Parameters<ParseRunner['run']>[0]> } {
  const jobs: Array<Parameters<ParseRunner['run']>[0]> = []
  return {
    jobs,
    runner: {
      concurrency: 1,
      run: (job) => {
        jobs.push(job)
        return runParseJob(job)
      }
    }
  }
}

/** A new launch's first build against the store as it is: what it gives, and the files it parsed */
async function relaunch(): Promise<{ result: TokenBuildResult; parsed: string[] }> {
  const { runner, jobs } = recording()
  const result = await new TokenEngine(cacheDir(), TEST_ENGINE, runner).build(roots(), [proj])
  return { result, parsed: jobs.map((j) => j.file) }
}

/** The files a new launch parses against the store as it is: none when it holds a current entry for each */
async function parsedOnRelaunch(): Promise<string[]> {
  return (await relaunch()).parsed
}

type Side = 'claude' | 'codex' | 'grok' | 'antigravity'

/** A session on every side, stored by a build that the launch after it finds complete; each file by its side */
async function storedSides(into = cacheDir()): Promise<Record<Side, string>> {
  const files = {
    claude: mkClaudeFile('field.jsonl', [userLine('a question'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)]),
    codex: mkCodexRollout('rollout-field-019fd13.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10, record: 'resp_f1' }]),
    grok: mkGrokSession(proj, 'field-1', [grokUser(1785369500, 'a grok question', 0), grokTurn(1785369600, { input: 50, output: 5 })]),
    antigravity: mkAgyConversation('agy-field', proj, [{ usage: { messageId: 'm-field', input: 10, output: 5 }, at: Date.parse('2026-07-30T02:00:00Z') }])
  }
  await new TokenEngine(into, TEST_ENGINE).build(roots(), [proj])
  if (into === cacheDir()) {
    // The control: every entry as the build wrote it is a hit
    expect(await parsedOnRelaunch()).toEqual([])
  }
  return files
}

/** Rewrites one file's stored aggregate, as a hand editing the store would; the row keeps its signature */
function changeStored(file: string, change: (agg: Record<string, unknown>) => void): void {
  const agg = storedEntries(cacheDir()).get(file)?.agg
  if (!agg) throw new Error('the build stored no aggregate for the file')
  change(agg)
  onStore(cacheDir(), 'UPDATE entries SET agg = ? WHERE path = ?', JSON.stringify(agg), file)
}

const storeBytes = (): string[] => storeFileBytes(cacheDir())

/** Makes the next write to a token store fail after this many of its statements (engine/src/seams.rs) */
const cutStoreWriteAfter = (statements: number | null): void => (loadEngineModule(TEST_ENGINE) as StoreWriteSeam).seamCutStoreWriteAfter(statements)

describe('the store a launch finds (token-stats C1, C2)', () => {
  // The version a store records is all that tells its structure; one of another version, older or newer, is replaced
  // and not read. A value this build would read differently is planted first, and the control shows it read while the
  // version is this one, so that a store a launch took as it is shows in the figures as well as in the parses.
  it.each([
    ['an older', -1],
    ['a newer', 1]
  ])('a store of %s structure version is replaced by an empty store of this version, and every file is parsed (C1)', async (_what, step) => {
    const files = await storedSides()
    changeStored(files.codex, (agg) => {
      agg['title'] = 'a title from the replaced store'
    })
    const titleOf = (r: TokenBuildResult): string | null | undefined =>
      r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.file === files.codex)?.title
    const kept = await relaunch()
    expect(kept.parsed, 'the control: a store of this version is read as it is').toEqual([])
    expect(titleOf(kept.result)).toBe('a title from the replaced store')

    onStore(cacheDir(), `PRAGMA user_version = ${CACHE_VERSION + step}`)
    const replaced = await relaunch()
    expect([...replaced.parsed].sort()).toEqual(Object.values(files).sort())
    expect(titleOf(replaced.result)).not.toBe('a title from the replaced store')
    expect(storeVersion(cacheDir())).toBe(CACHE_VERSION)
    expect(await parsedOnRelaunch(), 'and the store it made is the next launch\'s').toEqual([])
  })

  it.each([
    ['a zero-byte file', (): void => writeFileSync(storePath(cacheDir()), '')],
    ['a text file', (): void => writeFileSync(storePath(cacheDir()), 'not a database at all')],
    ['a database of this version without its table', (): void => {
        onStore(cacheDir(), 'DROP TABLE entries')
      }]
  ])('%s at the store\'s path is replaced, and every file is parsed (C2)', async (_what, plant) => {
    const files = await storedSides()
    plant()
    expect([...(await parsedOnRelaunch())].sort()).toEqual(Object.values(files).sort())
    expect(storeVersion(cacheDir())).toBe(CACHE_VERSION)
    expect(await parsedOnRelaunch()).toEqual([])
  })

  it('a run that finds no store makes an empty one of this version before its first scan, a home with no session file included', async () => {
    await engine().build(roots(), [proj])
    expect(storeVersion(cacheDir())).toBe(CACHE_VERSION)
    expect(storeRows(cacheDir())).toEqual([])
  })

  // A store that cannot be opened nor replaced is no store: nothing is read from it or written to it, and it fails no
  // build. The next build tries again, and once the store can be made it is the store from then on.
  it('a store that cannot be made — a directory at its path — fails no build and no page: every file is parsed, the figures go out, a page is served, and the failure is logged', async () => {
    const f = mkClaudeFile('a.jsonl', [userLine('the one question'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    mkdirSync(join(storePath(cacheDir()), 'x'), { recursive: true })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { runner, jobs } = recording()
      const e = new TokenEngine(cacheDir(), TEST_ENGINE, runner)
      const r = await e.build(roots(), [proj])
      expect(r.global.bySide.claude.total).toBe(15)
      expect(r.sessionFiles.has(f)).toBe(true)
      expect(logged).toHaveBeenCalledWith('[token-store] open failed:', expect.stringContaining('cannot be removed'))
      // The session the list shows opens: its index rebuilt for the page, with nothing to keep it in (session-view C4)
      expect((await e.sessionQuestions(roots(), f)).questions).toHaveLength(1)
      expect((await e.build(roots(), [proj])).global.bySide.claude.total).toBe(15)
      expect(jobs.map((j) => j.file), 'with no store each build parses again').toEqual([f, f])
      rmSync(storePath(cacheDir()), { recursive: true })
      await e.build(roots(), [proj])
      expect(await parsedOnRelaunch(), 'the build after the path is free makes the store and fills it').toEqual([])
    } finally {
      logged.mockRestore()
    }
  })
})

// A store that stops reading under an engine that has it open — its table taken away by another connection, as a hand
// would — fails no page: the read that fails is logged, and the page rebuilds its file's index (session-view C4)
describe('a store whose read fails', () => {
  it('fails no page: the session opens, and the failure is logged', async () => {
    const f = mkClaudeFile('a.jsonl', [userLine('the one question'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const e = engine()
    await e.build(roots(), [proj])
    onStore(cacheDir(), 'DROP TABLE entries')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await e.sessionQuestions(roots(), f)).questions).toHaveLength(1)
      expect(logged).toHaveBeenCalledWith('[token-store] read failed:', expect.anything())
    } finally {
      logged.mockRestore()
    }
  })
})

// C2: within a store of this version, an entry that is not well formed is a miss, and only its file is parsed again.
// The cases drive a corrupt row through a build, through the session pages and through the resume.
describe('a stored entry that is not well formed is no entry (C2)', () => {
  // One row for each field of the Claude, Codex and Grok aggregates beside `file`, `questions` and `forkPoints`, which
  // the cases below take away, each starting from the entry a build wrote, so that every other field is there. The
  // Antigravity side has such a row for each of its fields in antigravity.test.ts.
  //
  // Each rule is judged twice, and each case asks both: by TypeScript's own read of an entry (`isWellFormedAgg`, which
  // the session page's freshness check takes), and by the engine module's, which reads a stored entry as its group is
  // combined again. A new launch is a run of its own, which combines every group again, so its parse of the file is the
  // module turning the entry away; the row the hand changed still carries what the module read of it when it was
  // written.
  it.each([
    ['claude', 'projectKey'],
    ['claude', 'listed'],
    ['claude', 'title'],
    ['claude', 'at'],
    ['claude', 'entries'],
    ['claude', 'file'],
    ['claude', 'questions'],
    ['claude', 'forkPoints'],
    ['codex', 'projectKey'],
    ['codex', 'listed'],
    ['codex', 'title'],
    ['codex', 'at'],
    ['codex', 'model'],
    ['codex', 'sessionId'],
    ['codex', 'parentId'],
    ['codex', 'forkedAt'],
    ['codex', 'events'],
    ['codex', 'titleFromThread'],
    ['codex', 'boundary'],
    ['codex', 'paginated'],
    ['grok', 'projectKey'],
    ['grok', 'title'],
    ['grok', 'at'],
    ['grok', 'events'],
    ['grok', 'subagent']
  ] as const)('a %s aggregate that lost %s is parsed again, that file alone, and stored repaired', async (side, field) => {
    const files = await storedSides()
    changeStored(files[side], (agg) => {
      if (!(field in agg)) throw new Error(`the build stored no ${field} for the ${side} file`)
      delete agg[field]
    })
    expect(engine().isFresh(files[side]), 'TypeScript turns the entry away').toBe(false)
    expect(await parsedOnRelaunch(), 'the entry is a miss').toEqual([files[side]])
    expect(await parsedOnRelaunch(), 'and the launch after it finds it repaired').toEqual([])
  })

  // The fields that may be null are asked for their type too, as are the others: a value of another type is no
  // more the field than none (the Antigravity case for a title that is not a string drives `title`)
  it.each([
    ['claude', 'projectKey', 7],
    ['claude', 'listed', 'yes'],
    ['claude', 'title', 7],
    ['claude', 'at', 'yesterday'],
    ['claude', 'file', ''],
    ['claude', 'kind', 'claude-code'],
    ['codex', 'model', 7],
    ['codex', 'sessionId', 7],
    ['codex', 'parentId', 7],
    ['codex', 'forkedAt', 'yesterday']
  ] as const)('a %s aggregate whose %s is %j is parsed again, that file alone', async (side, field, value) => {
    const files = await storedSides()
    changeStored(files[side], (agg) => {
      agg[field] = value
    })
    expect(engine().isFresh(files[side]), 'TypeScript turns the entry away').toBe(false)
    expect(await parsedOnRelaunch()).toEqual([files[side]])
  })

  // What the row holds rather than what its aggregate says: a column a disk or a hand left as no JSON, as JSON that is
  // no aggregate, or as no text at all. The Codex row is the one taken, as its resume check reads the entry it finds.
  it.each([
    ['an aggregate that is no JSON', "UPDATE entries SET agg = 'not json' WHERE path = ?"],
    ['an aggregate that is JSON null', "UPDATE entries SET agg = 'null' WHERE path = ?"],
    ['an aggregate that is no text', "UPDATE entries SET agg = X'7b7d' WHERE path = ?"],
    ['a signature that is no text', "UPDATE entries SET sig = X'31' WHERE path = ?"]
  ])('a row holding %s is parsed again, that file alone, and every other file is a hit', async (_what, sql) => {
    const files = await storedSides()
    onStore(cacheDir(), sql, files.codex)
    expect(engine().isFresh(files.codex), 'TypeScript turns the entry away').toBe(false)
    expect(await parsedOnRelaunch()).toEqual([files.codex])
    expect(await parsedOnRelaunch()).toEqual([])
  })

  // Every list an aggregate holds, row by row: a row as its type has it, written by hand, is added first and the
  // entry is still a hit, so what turns the entry away after it is the one thing wrong with the row
  const QUESTION = [0, 10, 20, null, 0, 0, 1]
  // `textAt`: a column of text, where one there is
  describe.each([
    ['claude', 'questions', QUESTION, 0, null],
    ['claude', 'entries', [null, null, 0, 10, 5, 0, 0, 'claude-fable-5', '2026-07-30'], 3, 7],
    ['codex', 'questions', QUESTION, 0, null],
    ['codex', 'events', [null, 10, 0, 5, 0], 1, null],
    ['grok', 'questions', QUESTION, 0, null],
    ['grok', 'events', [null, 10, 0, 5, 0, null], 1, 5],
    ['antigravity', 'questions', QUESTION, 0, null],
    ['antigravity', 'calls', [null, null, 10, 5, 0, 0, null], 2, 0]
  ] as const)('a %s aggregate\'s %s', (side, field, row, numberAt, textAt) => {
    const cases: Array<[string, unknown]> = [
      ['a null among its rows', null],
      ['a row one element short', row.slice(0, -1)],
      ['a row one element long', [...row, 0]],
      ['a row with text where a number belongs', row.map((x, i) => (i === numberAt ? '1000' : x))],
      ['a row with null where a number belongs', row.map((x, i) => (i === numberAt ? null : x))],
      ...(textAt === null ? [] : [['a row with a number where text belongs', row.map((x, i) => (i === textAt ? 1000 : x))] as [string, unknown]])
    ]
    it.each(cases)('with %s is parsed again, that file alone', async (_what, bad) => {
      const files = await storedSides()
      const add = (extra: unknown): void =>
        changeStored(files[side], (agg) => {
          const rows = agg[field]
          if (!Array.isArray(rows)) throw new Error(`the build stored no ${field} for the ${side} file`)
          rows.push(extra)
        })
      add([...row])
      expect(await parsedOnRelaunch(), 'a row of the right shape leaves the entry a hit').toEqual([])
      add(bad)
      expect(engine().isFresh(files[side]), 'TypeScript turns the entry away').toBe(false)
      expect(await parsedOnRelaunch()).toEqual([files[side]])
    })
  })

  it('a Claude session whose aggregate is gone null: its page is served before the first build, and that build still credits it to its project', async () => {
    const cl = mkClaudeFile('page.jsonl', [userLine('the one question'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    await engine().build(roots(), [proj])
    onStore(cacheDir(), "UPDATE entries SET agg = 'null' WHERE path = ?", cl)
    // A new engine opens the store, as at startup, and serves the page before any build has run
    const e = engine()
    expect((await e.sessionQuestions(roots(), cl)).questions).toHaveLength(1)
    // The project a Claude session is credited to comes from the registry, which the page does not read: an index
    // kept from that page under no project would be a hit for this build, and the session would leave its project
    const r = await e.build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.map((s) => s.file)).toEqual([cl])
    expect(r.sessionFiles.has(cl)).toBe(true)
  })

  it('a row gone null elsewhere in the store does not break a Codex fork\'s session page before the first scan', async () => {
    const parent = mkCodexFork('rollout-p-019fd03.jsonl', proj, { id: 'p-1', parentId: 'none', forkedAtIso: '2026-07-30T01:00:00Z' }, 'gpt-5.6-sol', [{ input: 10, cached: 0, output: 1 }])
    const child = mkCodexFork('rollout-c-019fd04.jsonl', proj, { id: 'c-1', parentId: 'p-1', forkedAtIso: '2026-07-30T02:00:00Z' }, 'gpt-5.6-sol', [{ input: 20, cached: 0, output: 2 }])
    await engine().build(roots(), [proj])
    onStore(cacheDir(), "INSERT INTO entries (path, sig, agg) VALUES (?, '1:1', 'null')", join(dir, 'gone.jsonl'))
    // A new engine opens the store, as at startup, and serves the page before any build has run
    const page = await engine().sessionQuestions(roots(), child)
    expect(page.forkParentFile).toBe(parent)
  })

  describe('a Codex rollout\'s entry', () => {
    /** A rollout a build has stored with its resume state, then grown by one response */
    async function grown(): Promise<string> {
      const f = mkCodexRollout('rollout-entry-019fd10.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10, record: 'resp_e1' }])
      await engine().build(roots(), [proj])
      const u = { input_tokens: 200, cached_input_tokens: 0, output_tokens: 20, total_tokens: 220 }
      appendFileSync(f, JSON.stringify({ timestamp: '2026-07-30T01:10:00Z', type: 'token_usage_record', payload: { response_id: 'resp_e2', usage: u, turn_token_usage: u, thread_token_usage: u } }) + '\n')
      return f
    }
    const resumeOf = (f: string): Record<string, unknown> => {
      const resume = storedEntries(cacheDir()).get(f)?.resume
      if (typeof resume !== 'object' || resume === null) throw new Error('the build stored no resume state for the rollout')
      return resume as Record<string, unknown>
    }

    it.each([
      // The control: the grown rollout does resume from an entry left as the build wrote it
      { name: 'left as written is resumed from', change: (): void => {}, resumed: true },
      { name: 'whose signature is no text is not resumed from', change: (f: string): void => {
        onStore(cacheDir(), "UPDATE entries SET sig = X'37' WHERE path = ?", f)
      }, resumed: false },
      {
        name: 'whose resume state is not well formed is not resumed from',
        change: (f: string): void => {
          const resume = resumeOf(f)
          resume['cursor'] = 'not a number'
          onStore(cacheDir(), 'UPDATE entries SET resume = ? WHERE path = ?', JSON.stringify(resume), f)
        },
        resumed: false
      },
      { name: 'whose resume state is no JSON is not resumed from', change: (f: string): void => {
        onStore(cacheDir(), "UPDATE entries SET resume = 'not json' WHERE path = ?", f)
      }, resumed: false }
    ])('an entry $name, and the figures are the grown rollout\'s', async ({ change, resumed }) => {
      const f = await grown()
      change(f)
      const { runner, jobs } = recording()
      const r = await new TokenEngine(cacheDir(), TEST_ENGINE, runner).build(roots(), [proj])
      expect(jobs.map((j) => (j.kind === 'codex' ? j.from !== undefined : null))).toEqual([resumed])
      expect(r.global.bySide.codex.total).toBe(330)
    })

    // What makes an entry does not include its resume state: a state the resume check turns down costs the
    // rollout its resume and nothing else. Were it part of the entry, a parse leaving such a state would make
    // its rollout a miss at every scan, and every scan would write it.
    it('an entry whose resume state is not well formed is still a hit under the rollout\'s unchanged signature', async () => {
      const f = mkCodexRollout('rollout-entry-019fd11.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10, record: 'resp_e1' }])
      await engine().build(roots(), [proj])
      const resume = resumeOf(f)
      resume['prevTotal'] = 110
      onStore(cacheDir(), 'UPDATE entries SET resume = ? WHERE path = ?', JSON.stringify(resume), f)
      expect(await parsedOnRelaunch()).toEqual([])
    })
  })
})

// C26: the first launch after the upgrade finds the JSON cache the earlier builds kept. Its entries are built here the
// way they were kept — a store's entries are v19's per-file aggregates, unchanged — in a file shaped as this machine's
// own v19 file is: `{ version, files: { <path>: { sig, agg, resume? } } }`.
describe('upgrading from the JSON cache (token-stats C26)', () => {
  const jsonFile = (): string => join(cacheDir(), 'token-cache.json')
  /** Every file's entry as a v19 JSON file keeps it, taken from a store a build made elsewhere */
  async function v19Files(): Promise<{ files: Record<Side, string>; entries: Record<string, Record<string, unknown>> }> {
    const scratch = join(dir, 'scratch-cache')
    const files = await storedSides(scratch)
    const entries: Record<string, Record<string, unknown>> = {}
    for (const [path, e] of storedEntries(scratch)) entries[path] = e.resume === null ? { sig: e.sig, agg: e.agg } : { sig: e.sig, agg: e.agg, resume: e.resume }
    rmSync(scratch, { recursive: true })
    return { files, entries }
  }
  const writeJson = (text: string): void => {
    mkdirSync(cacheDir(), { recursive: true })
    writeFileSync(jsonFile(), text)
  }

  it('a v19 file: its well-formed entries are imported and hit at the first scan, the one that is not is parsed, and the file is gone', async () => {
    const { files, entries } = await v19Files()
    delete (entries[files.claude]['agg'] as Record<string, unknown>)['listed']
    writeJson(JSON.stringify({ version: 19, files: entries }))
    // The store as the import left it, before any scan: the freshness check opens it, and the first scan would parse
    // the file whose entry is not well formed and store it repaired, whether or not it was imported
    expect(new TokenEngine(cacheDir(), TEST_ENGINE).isFresh(files.claude)).toBe(false)
    expect(storeRows(cacheDir()).map((r) => r.path).sort()).toEqual([files.codex, files.grok, files.antigravity].sort())
    const first = await relaunch()
    expect(first.parsed).toEqual([files.claude])
    expect(existsSync(jsonFile())).toBe(false)
    expect(first.result.global.bySide.codex.total).toBe(110)
    expect(await parsedOnRelaunch()).toEqual([])
  })

  // The store records each entry's keys as it takes the entry, the import's included: the first scan after it groups
  // the imported entries as a scan's own, and parses nothing
  it('a v19 file\'s entries are imported with their de-duplication keys: the first scan groups them, parsing nothing', async () => {
    const scratch = join(dir, 'scratch-cache')
    const chain = linkedChain()
    await new TokenEngine(scratch, TEST_ENGINE).build(roots(), [proj])
    const entries: Record<string, unknown> = {}
    for (const [path, e] of storedEntries(scratch)) entries[path] = { sig: e.sig, agg: e.agg }
    rmSync(scratch, { recursive: true })
    writeJson(JSON.stringify({ version: 19, files: entries }))
    const first = await relaunch()
    expect(first.parsed).toEqual([])
    expect(storedGroups(cacheDir())).toEqual([[chain.a, chain.b, chain.c]])
    await expectOneCombination(first.result)
  })

  it.each([
    ['of version 18', (e: unknown): string => JSON.stringify({ version: 18, files: e })],
    ['of version 2, the Codex aggregate before its events', (): string => JSON.stringify({ version: 2, files: {} })],
    ['that does not parse', (): string => '{"version":19,"files":'],
    ['whose files are null', (): string => '{"version":19,"files":null}'],
    ['whose files are an array', (): string => '{"version":19,"files":[]}'],
    ['whose files are text', (): string => '{"version":19,"files":"none"}']
  ])('a file %s is deleted without an import, and the first scan parses every file', async (_what, text) => {
    const { files, entries } = await v19Files()
    writeJson(text(entries))
    expect([...(await parsedOnRelaunch())].sort()).toEqual(Object.values(files).sort())
    expect(existsSync(jsonFile())).toBe(false)
  })

  // A build from before the store, run since, left a JSON file of its own beside the store: the store's signatures
  // decide what is current, so the file is not read. Its entries here hold another title under each file's own
  // signature, which an import would have taken.
  it('a v19 file beside a usable store is deleted unread, and the store\'s entries are used', async () => {
    await storedSides()
    const entries: Record<string, unknown> = {}
    for (const [path, e] of storedEntries(cacheDir())) entries[path] = { sig: e.sig, agg: { ...e.agg, title: 'a title from the JSON file' } }
    writeJson(JSON.stringify({ version: 19, files: entries }))
    const { parsed, result } = await relaunch()
    expect(parsed).toEqual([])
    expect(existsSync(jsonFile())).toBe(false)
    const titles = [...result.perProject.values()].flatMap((p) => p.sessions.map((s) => s.title))
    expect(titles.length).toBeGreaterThan(0)
    expect(titles).not.toContain('a title from the JSON file')
  })

  it('an import that fails lands nothing: the first scan parses every file, and the next launch deletes the file', async () => {
    const { files, entries } = await v19Files()
    writeJson(JSON.stringify({ version: 19, files: entries }))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // The import is the store's first write: it is cut short before its second statement
      cutStoreWriteAfter(1)
      expect([...(await parsedOnRelaunch())].sort()).toEqual(Object.values(files).sort())
      expect(logged).toHaveBeenCalledWith('[token-store] write failed:', expect.stringContaining('store-write seam'))
      expect(existsSync(jsonFile()), 'the file is left for a later launch').toBe(true)
    } finally {
      cutStoreWriteAfter(null)
      logged.mockRestore()
    }
    expect(await parsedOnRelaunch(), 'the first scan landed what it parsed').toEqual([])
    expect(existsSync(jsonFile())).toBe(false)
  })

  // Skipped as root, which ignores the directory's mode
  it.skipIf(process.getuid?.() === 0)('a deletion that fails is logged, and a later launch deletes the file', async () => {
    await storedSides()
    writeJson(JSON.stringify({ version: 19, files: {} }))
    // Another process connected to the store keeps its log and shared-memory files there while the directory takes no
    // new file
    const held = await openElsewhere(cacheDir(), { lock: false })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    chmodSync(cacheDir(), 0o555)
    try {
      expect(await parsedOnRelaunch()).toEqual([])
      expect(logged).toHaveBeenCalledWith('[token-store] token-cache.json could not be deleted:', expect.anything())
      expect(existsSync(jsonFile())).toBe(true)
    } finally {
      chmodSync(cacheDir(), 0o755)
      logged.mockRestore()
      await held.release()
    }
    expect(await parsedOnRelaunch()).toEqual([])
    expect(existsSync(jsonFile())).toBe(false)
  })
})

// The only automated defence against a missed bump on a shape change: this goes red when the field set changes,
// forcing the author to think about the version number. The assertion targets the stored aggregates — the very thing
// the version number protects, not a side channel. Coverage stated explicitly: it covers adding and removing fields
// only, not a change to how a field is computed (that leaves the field set, and the fingerprint, unchanged).
describe('the cache structure version (token-stats C10)', () => {
  it('a change to FileAgg\'s field set must be noticed (a shape change is the only half of a missed bump that is testable)', async () => {
    mkClaudeFile('shape.jsonl', [
      userLine('question'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    mkCodexRollout('rollout-shape-019fd01.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5 }
    ])
    mkAgyConversation('agy-shape', proj, [{ usage: { messageId: 'm-shape', input: 10, output: 5 }, at: Date.parse('2026-07-30T02:00:00Z') }])
    mkGrokSession(proj, 'grok-shape', [grokUser(1785369500, 'a grok question', 0), grokTurn(1785369600, { input: 50, output: 5 })])
    await engine().build(roots(), [proj])
    const stored = [...storedEntries(cacheDir()).values()]
    const keysOf = (kind: string): string[] => {
      const hit = stored.find((e) => e.agg['kind'] === kind)
      expect(hit, `the store should hold a ${kind} entry`).toBeDefined()
      return Object.keys((hit as { agg: Record<string, unknown> }).agg).sort()
    }
    expect(keysOf('claude')).toEqual([
      'at', 'entries', 'file', 'forkPoints', 'kind', 'listed', 'projectKey', 'questions', 'title'
    ])
    expect(keysOf('codex')).toEqual([
      'at', 'boundary', 'events', 'file', 'forkedAt', 'kind', 'listed', 'model', 'paginated', 'parentId', 'projectKey', 'questions', 'sessionId', 'title', 'titleFromThread'
    ])
    expect(keysOf('antigravity')).toEqual([
      'at', 'calls', 'conversationId', 'file', 'forkOf', 'kind', 'listed', 'projectKey', 'questions', 'subagent', 'title', 'unreadable'
    ])
    expect(keysOf('grok')).toEqual([
      'at', 'events', 'file', 'kind', 'listed', 'projectKey', 'questions', 'subagent', 'title'
    ])
  })
})

describe('the incremental cache', () => {
  it('a second build gives the same result (idempotent)', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const e = engine()
    const r1 = await e.build(roots(), [proj])
    const r2 = await new TokenEngine(cacheDir(), TEST_ENGINE).build(roots(), [proj])
    expect(r2.global).toEqual(r1.global)
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
    const r2 = await new TokenEngine(cacheDir(), TEST_ENGINE).build(roots(), [proj])
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
    const r2 = await new TokenEngine(cacheDir(), TEST_ENGINE).build(roots(), [proj])
    expect(r2.global.bySide.claude.total).toBe(150)
  })
})

// A build writes to the store only what it changed (token-stats::QR-002/AC-02), all of it in one transaction (C3).
describe('what a build writes to the store (token-stats::QR-002/AC-02, C3)', () => {
  /** A session on every side, so that a side whose files never hit the store would show as a write */
  function everySide(): { claude: string; codex: string; grok: string; agy: string } {
    return {
      claude: mkClaudeFile('a.jsonl', [userLine('first'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)]),
      codex: mkCodexRollout('rollout-w-019f400.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10, record: 'resp_w1' }]),
      grok: mkGrokSession(proj, 'gw1', [grokUser(1785369500, 'a grok question', 0), grokTurn(1785369600, { input: 50, output: 5 })]),
      agy: mkAgyConversation('agy-w1', proj, [{ usage: { messageId: 'm-w1', input: 10, output: 5 }, at: Date.parse('2026-07-30T02:00:00Z') }])
    }
  }
  const storedFiles = (): string[] => storeRows(cacheDir()).map((r) => String(r.path)).sort()

  it('a build that changed nothing writes nothing: the store and its log are as the build before left them', async () => {
    const s = everySide()
    const e = engine()
    const r1 = await e.build(roots(), [proj])
    expect(storedFiles()).toEqual([s.claude, s.codex, s.grok, s.agy].sort())
    // And a result for each file's group, which the build after it leaves unwritten (token-stats, Implementation
    // Decisions, Cache: a scan with no input changed combines no group)
    expect(storedGroups(cacheDir())).toHaveLength(4)
    const first = storeBytes()
    const r2 = await e.build(roots(), [proj])
    expect(storeBytes()).toEqual(first)
    expect(r2.global).toEqual(r1.global)
  })

  it('a file that no build can parse does not make an unchanged build write', async () => {
    const s = everySide()
    const locked = mkClaudeFile('locked.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    chmodSync(locked, 0o000)
    try {
      const e = engine()
      await e.build(roots(), [proj])
      expect(storedFiles(), 'the file that cannot be read has no entry').toEqual([s.claude, s.codex, s.grok, s.agy].sort())
      const first = storeBytes()
      await e.build(roots(), [proj])
      expect(storeBytes()).toEqual(first)
    } finally {
      chmodSync(locked, 0o644)
    }
  })

  it.each([
    {
      name: 'a session file changed',
      change: (s: ReturnType<typeof everySide>): string[] => {
        appendFileSync(s.claude, usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50) + '\n')
        return [s.claude, s.codex, s.grok, s.agy]
      },
      claudeTotal: 165
    },
    {
      name: 'a session file joined the scan set',
      change: (s: ReturnType<typeof everySide>): string[] => {
        const joined = mkClaudeFile('b.jsonl', [usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50)])
        return [s.claude, s.codex, s.grok, s.agy, joined]
      },
      claudeTotal: 165
    },
    {
      name: 'a session file left the scan set',
      change: (s: ReturnType<typeof everySide>): string[] => {
        rmSync(s.claude)
        return [s.codex, s.grok, s.agy]
      },
      claudeTotal: 0
    },
    {
      // Still in the scan set, and the entry the store held for it is gone all the same
      name: 'a session file changed into one that cannot be read',
      change: (s: ReturnType<typeof everySide>): string[] => {
        appendFileSync(s.claude, usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50) + '\n')
        chmodSync(s.claude, 0o000)
        return [s.codex, s.grok, s.agy]
      },
      claudeTotal: 0,
      // It has no entry to hit, so a launch tries it again
      triedAgain: 1
    }
  ])('a build after $name writes the store, which then holds every file that gives an entry', async ({ change, claudeTotal, triedAgain = 0 }) => {
    const s = everySide()
    const e = engine()
    await e.build(roots(), [proj])
    const first = storeBytes()
    const now = change(s)
    try {
      const r2 = await e.build(roots(), [proj])
      expect(r2.global.bySide.claude.total).toBe(claudeTotal)
      expect(storeBytes()).not.toEqual(first)
      expect(storedFiles()).toEqual([...now].sort())
      expect((await parsedOnRelaunch()).length, 'a new launch parses only a file the store has no entry for').toBe(triedAgain)
    } finally {
      if (existsSync(s.claude)) chmodSync(s.claude, 0o644)
    }
  })

  // What a build writes is the entries it parsed, never the ones it found current. SQLite leaves a row rewritten with
  // the content it holds as it was, so a build that held every entry again shows only where the store moved under it:
  // another process landed a newer entry for a file this build had found current (token-stats C27), and this build
  // would write its older one back over it.
  it('a build after one file changed writes that file\'s entry alone: an entry another engine landed meanwhile stays (C27)', async () => {
    const x = mkClaudeFile('x.jsonl', [userLine('x'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const y = mkClaudeFile('y.jsonl', [userLine('y'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 20, 5)])
    await engine().build(roots(), [proj])
    appendFileSync(y, usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50) + '\n')
    const other = engine()
    let landed = false
    const b = new TokenEngine(cacheDir(), TEST_ENGINE, {
      concurrency: 1,
      run: async (job) => {
        // This build has read the store and found x current; while it parses y, x grows and the other engine lands it
        if (!landed) {
          landed = true
          appendFileSync(x, usageLine('claude-fable-5', '2026-07-30T04:00:00Z', 1000, 500) + '\n')
          await other.build(roots(), [proj])
        }
        return runParseJob(job)
      }
    })
    await b.build(roots(), [proj])
    expect(landed, 'the build parsed y').toBe(true)
    const after = await relaunch()
    expect(after.parsed, 'the store holds the other engine\'s entry for x and this build\'s for y').toEqual([])
    expect(after.result.global.bySide.claude.total).toBe(15 + 25 + 150 + 1500)
  })

  // A write that cannot get the store within its wait fails, and so does one a full disk stops: either way it lands
  // nothing, fails no build and no page, and is logged. The store is then taken as it is: the next build parses again
  // what did not land, and lands it. Another connection holding the write lock is what makes it fail here; it is let
  // go once the failure is in.
  it.each([
    {
      name: 'a build',
      fail: async (e: TokenEngine, s: ReturnType<typeof everySide>): Promise<void> => {
        appendFileSync(s.claude, usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50) + '\n')
        expect((await e.build(roots(), [proj])).global.bySide.claude.total).toBe(165)
      }
    },
    {
      name: 'a session page',
      fail: async (e: TokenEngine, s: ReturnType<typeof everySide>): Promise<void> => {
        appendFileSync(s.claude, userLine('second') + '\n')
        expect((await e.sessionQuestions(roots(), s.claude)).questions).toHaveLength(2)
      }
    }
  ])('a write that fails on $name lands nothing and fails nothing, and the next build parses what it held and lands it (C3, C27)', async ({ fail }) => {
    const s = everySide()
    const e = engine()
    await e.build(roots(), [proj])
    const before = storeRows(cacheDir())
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hold = await openElsewhere(cacheDir(), { lock: true })
    try {
      await fail(e, s)
      expect(logged).toHaveBeenCalledWith('[token-store] write failed:', expect.stringContaining('locked'))
    } finally {
      await hold.release()
      logged.mockRestore()
    }
    expect(storeRows(cacheDir()), 'the failed write left the store as it was').toEqual(before)
    expect(await parsedOnRelaunch(), 'the store still lacks what the write held').toEqual([s.claude])
    expect(await parsedOnRelaunch(), 'and the build that parsed it landed it').toEqual([])
  }, 20_000)

  it('a write cut short between two of its statements leaves the store as the build before it left it (C3)', async () => {
    const s = everySide()
    const e = engine()
    await e.build(roots(), [proj])
    const before = storeRows(cacheDir())
    appendFileSync(s.claude, usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50) + '\n')
    mkClaudeFile('b.jsonl', [usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50)])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      cutStoreWriteAfter(1)
      await e.build(roots(), [proj])
      expect(logged).toHaveBeenCalledWith('[token-store] write failed:', expect.stringContaining('store-write seam'))
    } finally {
      cutStoreWriteAfter(null)
      logged.mockRestore()
    }
    expect(storeRows(cacheDir())).toEqual(before)
  })
})

// C27: a development run and the installed copy share one store. Two engines here are two processes' worth of
// connections to it.
describe('two processes on one store (token-stats C27)', () => {
  it('what one writes the other reads at its next scan and its next page, and the other\'s own write keeps it', async () => {
    const claude = mkClaudeFile('a.jsonl', [userLine('first'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const grok = mkGrokSession(proj, 'gw2', [grokUser(1785369500, 'a grok question', 0), grokTurn(1785369600, { input: 50, output: 5 })])
    const a = engine()
    const other = recording()
    const b = new TokenEngine(cacheDir(), TEST_ENGINE, other.runner)
    await a.build(roots(), [proj])
    await b.build(roots(), [proj])
    expect(other.jobs, 'the second engine hits what the first stored').toEqual([])

    appendFileSync(claude, userLine('second') + '\n' + usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50) + '\n')
    await a.build(roots(), [proj])
    expect(b.isFresh(claude), 'the other engine\'s page sees the entry the first wrote').toBe(true)
    expect((await b.sessionQuestions(roots(), claude)).questions).toHaveLength(2)
    expect((await b.build(roots(), [proj])).global.bySide.claude.total).toBe(165)
    expect(other.jobs, 'and its scan parses nothing').toEqual([])

    appendFileSync(grok, grokTurn(1785369700, { input: 50, output: 5 }) + '\n')
    await b.build(roots(), [proj])
    expect(other.jobs.map((j) => j.file)).toEqual([grok])
    const after = await relaunch()
    expect(after.parsed, 'the other engine\'s write kept the first one\'s entry').toEqual([])
    expect(after.result.global.bySide.claude.total).toBe(165)
  })

  it('a fork\'s parent the other engine stored is found by this one\'s page', async () => {
    const child = mkCodexFork('rollout-c-019fd24.jsonl', proj, { id: 'c-2', parentId: 'p-2', forkedAtIso: '2026-07-30T02:00:00Z' }, 'gpt-5.6-sol', [{ input: 20, cached: 0, output: 2 }])
    const b = engine()
    await b.build(roots(), [proj])
    expect((await b.sessionQuestions(roots(), child)).forkParentFile, 'an orphan while its parent is not there').toBeNull()
    const parent = mkCodexFork('rollout-p-019fd23.jsonl', proj, { id: 'p-2', parentId: 'none', forkedAtIso: '2026-07-30T01:00:00Z' }, 'gpt-5.6-sol', [{ input: 10, cached: 0, output: 1 }])
    await engine().build(roots(), [proj])
    expect((await b.sessionQuestions(roots(), child)).forkParentFile).toBe(parent)
  })

  // The other process holds the store for one write and lets it go; the write waits for it rather than fail
  it('a write that finds the store held by the other waits for it, and lands once it is let go', async () => {
    const claude = mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(claude, usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50) + '\n')
    const holder = spawn(process.execPath, [
      '-e',
      "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); " +
        "console.log('held'); setTimeout(() => { db.exec('ROLLBACK'); db.close() }, 1000)",
      storePath(cacheDir())
    ])
    await new Promise<void>((resolve, reject) => {
      holder.stdout.on('data', (b: Buffer) => b.toString().includes('held') && resolve())
      holder.on('exit', () => reject(new Error('the holder exited before it held the store')))
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await e.build(roots(), [proj])
      expect(logged).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
      holder.kill()
    }
    expect(await parsedOnRelaunch()).toEqual([])
  }, 20_000)
})

// Combining by group (token-stats::CON-003): what a scan derives from the token cache is exactly what one combination
// over every file of the scan set, in scan order, gives from the same entries. Each case builds its scan set, scans it
// with the engine module's grouped combination, and compares every output field with the whole combination over the
// entries the scan stored, put in scan order.
/** What a build derives from the token cache, each list in its order: the usage rows, each project's figures and
 * sessions, the stripped forks titled by their first question left, and the unreadable conversations */
function figures(r: TokenBuildResult): unknown {
  return {
    global: r.global,
    perProject: [...r.perProject],
    rows: r.rows,
    retitle: r.retitle.map(({ session, file, start, end }) => ({ session, file, start, end })),
    antigravityUnreadable: r.antigravityUnreadable
  }
}

/** One combination over every entry the store holds, in scan order, with agy's titles as `titles` */
async function oneCombination(titles = new Map<string, string>()): Promise<TokenBuildResult> {
  const order = compareScanOrder(roots())
  const entries = [...storedEntries(cacheDir())].sort(([a], [b]) => order(a, b))
  return wholeCombination(
    entries.map(([, e]) => e.agg),
    titles
  )
}

/** The scan's figures are one combination's over the scan set */
async function expectOneCombination(r: TokenBuildResult, titles?: Map<string, string>): Promise<void> {
  expect(figures(r)).toStrictEqual(figures(await oneCombination(titles)))
}

/**
 * A Claude Code assistant line with the keys Claude Code writes (an assistant line on this machine, 2026-11-15): one
 * content block of a message, under the usage the message had when the block was written, whose output grows as the
 * message streams. The input, cache read and cache write figures are fixed: 6, 18000 and 1200.
 */
function realAssistantLine(o: { uuid: string; parent: string; id: string; requestId: string; at: string; block: 'thinking' | 'text'; output: number; session: string }): string {
  const cache = { ephemeral_1h_input_tokens: 1200, ephemeral_5m_input_tokens: 0 }
  return JSON.stringify({
    parentUuid: o.parent,
    isSidechain: false,
    message: {
      model: 'claude-fable-5',
      id: o.id,
      type: 'message',
      role: 'assistant',
      content: [o.block === 'thinking' ? { type: 'thinking', thinking: '', signature: 'EsQBCkYIBxgCKkB' } : { type: 'text', text: 'Done.' }],
      container: null,
      stop_reason: o.block === 'text' ? 'end_turn' : null,
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: 6,
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 18000,
        output_tokens: o.output,
        output_tokens_details: { thinking_tokens: 0 },
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        service_tier: 'standard',
        cache_creation: cache,
        inference_geo: 'not_available',
        iterations: [{ input_tokens: 6, output_tokens: o.output, cache_read_input_tokens: 18000, cache_creation_input_tokens: 1200, cache_creation: cache, type: 'message' }],
        speed: 'standard',
        fallback_credit: null
      },
      input_transformations: [],
      diagnostics: null,
      context_management: null
    },
    requestId: o.requestId,
    type: 'assistant',
    uuid: o.uuid,
    timestamp: o.at,
    userType: 'external',
    entrypoint: 'cli',
    cwd: proj,
    sessionId: o.session,
    version: '2.1.140',
    gitBranch: 'main'
  })
}

/** A Claude Code user line with the keys Claude Code writes, beside realAssistantLine */
function realUserLine(o: { uuid: string; parent: string | null; text: string; at: string; session: string }): string {
  return JSON.stringify({
    parentUuid: o.parent,
    isSidechain: false,
    userType: 'external',
    entrypoint: 'cli',
    cwd: proj,
    sessionId: o.session,
    version: '2.1.140',
    gitBranch: 'main',
    type: 'user',
    message: { role: 'user', content: o.text },
    uuid: o.uuid,
    timestamp: o.at
  })
}

/**
 * Three Claude sessions of one project, A–B–C, linked by two message ids: B shares one with A and another with C. The
 * figures differ by file, so which copy of a message is kept shows: B's copy of m1 is the larger, so it replaces A's;
 * C's copy of m2 is a sidechain's under another request id, so it matches B's by the id alone and B's is kept (A4).
 */
function linkedChain(): { a: string; b: string; c: string } {
  const a = mkClaudeFile('a.jsonl', [userLine('first question', '2026-07-01T09:00:00Z'), usageLine('claude-fable-5', '2026-07-01T10:00:00Z', 100, 10, { id: 'm1', requestId: 'r1' })])
  const b = mkClaudeFile('b.jsonl', [
    userLine('second question', '2026-07-01T10:30:00Z'),
    usageLine('claude-fable-5', '2026-07-01T11:00:00Z', 150, 10, { id: 'm1', requestId: 'r1' }),
    usageLine('claude-opus-5-5', '2026-07-02T09:00:00Z', 40, 4, { id: 'm2', requestId: 'r2' })
  ])
  const c = mkClaudeFile('c.jsonl', [
    userLine('third question', '2026-07-02T08:00:00Z'),
    usageLine('claude-opus-5-5', '2026-07-02T09:30:00Z', 400, 40, { id: 'm2', requestId: 'r9', sidechain: true })
  ])
  return { a, b, c }
}

describe('combining by group gives the figures of one combination (token-stats::CON-003)', () => {
  it('a file that links two otherwise separate groups: the three are combined as one', async () => {
    const { a, b, c } = linkedChain()
    const r = await engine().build(roots(), [proj])
    await expectOneCombination(r)
    // The control that the link decided something: B kept both messages, A and C none
    const tokens = new Map(r.perProject.get(mergeKey(proj))?.sessions.map((s) => [s.file, s.tokens]))
    expect(Object.fromEntries([a, b, c].map((f) => [f, tokens.get(f)]))).toEqual({ [a]: 0, [b]: 204, [c]: 0 })
  })

  it('a Claude message repeated across files, the more complete usage in the later one (A3; real-shaped lines)', async () => {
    // A session resumed into a new file carries its history over: the first file holds message m1 as streamed when
    // it stopped, the resumed one the same message with its usage complete, and a message of its own
    const first = mkClaudeFile('1f0c-first.jsonl', [
      realUserLine({ uuid: 'u1', parent: null, text: 'add a retry to the uploader', at: '2026-07-01T09:00:00.000Z', session: 's-1' }),
      realAssistantLine({ uuid: 'a1', parent: 'u1', id: 'msg_01m1', requestId: 'req_01r1', at: '2026-07-01T09:00:05.000Z', block: 'thinking', output: 8, session: 's-1' }),
      realAssistantLine({ uuid: 'a2', parent: 'a1', id: 'msg_01m1', requestId: 'req_01r1', at: '2026-07-01T09:00:09.000Z', block: 'text', output: 8, session: 's-1' })
    ])
    const resumed = mkClaudeFile('7a2e-resumed.jsonl', [
      realUserLine({ uuid: 'u1', parent: null, text: 'add a retry to the uploader', at: '2026-07-01T09:00:00.000Z', session: 's-2' }),
      realAssistantLine({ uuid: 'a1', parent: 'u1', id: 'msg_01m1', requestId: 'req_01r1', at: '2026-07-01T09:00:05.000Z', block: 'thinking', output: 8, session: 's-2' }),
      realAssistantLine({ uuid: 'a2', parent: 'a1', id: 'msg_01m1', requestId: 'req_01r1', at: '2026-07-01T09:00:40.000Z', block: 'text', output: 412, session: 's-2' }),
      realUserLine({ uuid: 'u2', parent: 'a2', text: 'and log each attempt', at: '2026-07-02T10:00:00.000Z', session: 's-2' }),
      realAssistantLine({ uuid: 'a3', parent: 'u2', id: 'msg_01m2', requestId: 'req_01r2', at: '2026-07-02T10:00:30.000Z', block: 'text', output: 90, session: 's-2' })
    ])
    const r = await engine().build(roots(), [proj])
    await expectOneCombination(r)
    const tokens = new Map(r.perProject.get(mergeKey(proj))?.sessions.map((s) => [s.file, s.tokens]))
    // m1 once, with the resumed file's complete usage: 6 + 412 + 18000 + 1200, then m2's
    expect([tokens.get(first), tokens.get(resumed)]).toEqual([0, 19618 + 19296])
  })

  it('a sidechain replay across files, under a request id other than the original\'s (A4)', async () => {
    // A subagent's transcript sits in its session's directory, which comes before the session's own file in scan order:
    // its replay of m1 is met first and the session's own copy replaces it
    const sub = mkClaudeFile(join('9b1d', 'subagents', 'agent-a1.jsonl'), [
      usageLine('claude-fable-5', '2026-07-03T08:00:01Z', 300, 30, { id: 'm1', requestId: 'r-sub', sidechain: true }),
      usageLine('claude-fable-5', '2026-07-03T08:00:02Z', 50, 5, { id: 'm-sub', requestId: 'r-sub', sidechain: true })
    ])
    const own = mkClaudeFile('9b1d.jsonl', [userLine('dispatch a reviewer', '2026-07-03T07:59:00Z'), usageLine('claude-fable-5', '2026-07-03T08:00:00Z', 120, 12, { id: 'm1', requestId: 'r-own' })])
    const r = await engine().build(roots(), [proj])
    await expectOneCombination(r)
    expect(r.global.bySide.claude.total, 'm1 counted once, as the session\'s own copy, beside the subagent\'s own message').toBe(132 + 55)
    expect(r.sessionFiles).toEqual(new Set([own, sub]))
  })

  it('a legacy Codex fork whose parent sits later in scan order (B10)', async () => {
    const turns = [
      { input: 100, cached: 20, output: 10, at: '2026-07-30T01:10:00Z' },
      { input: 200, cached: 50, output: 20, at: '2026-07-30T01:20:00Z' }
    ]
    mkCodexFork('rollout-a-019fd10.jsonl', proj, { id: 'c-10', parentId: 'p-10', forkedAtIso: '2026-07-30T05:00:00Z' }, 'gpt-5.6-sol', [
      ...turns.map((t) => ({ ...t, at: '2026-07-30T05:00:00Z' })),
      { input: 300, cached: 0, output: 30, at: '2026-07-30T05:30:00Z' }
    ])
    mkCodexRollout('rollout-z-019fd11.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', turns, false, 2000, 'sample question', { id: 'p-10' })
    const r = await engine().build(roots(), [proj])
    await expectOneCombination(r)
    expect(r.global.bySide.codex.total, 'the fork\'s replay of its parent stripped: the parent\'s two turns once, the fork\'s own one').toBe(110 + 220 + 330)
  })

  it('an Antigravity call recorded in two databases (token-stats::REQ-003/AC-01)', async () => {
    mkAgyConversation('agy-a', proj, [{ usage: { messageId: 'm-shared', input: 40, output: 4 }, at: Date.parse('2026-07-30T02:00:00Z') }])
    mkAgyConversation('agy-b', proj, [
      { usage: { messageId: 'm-shared', input: 40, output: 4 }, at: Date.parse('2026-07-30T02:00:00Z') },
      { usage: { messageId: 'm-own', input: 7, output: 1 }, at: Date.parse('2026-07-31T02:00:00Z') }
    ])
    const r = await engine().build(roots(), [proj])
    await expectOneCombination(r)
    expect(r.global.bySide.antigravity.total).toBe(44 + 8)
  })

  it('two sessions of different groups with the same time keep their scan order', async () => {
    const at = '2026-07-30T03:00:00Z'
    mkClaudeFile('b.jsonl', [userLine('second', at), usageLine('claude-fable-5', at, 10, 1, { id: 'mb' })])
    mkClaudeFile('a.jsonl', [userLine('first', at), usageLine('claude-fable-5', at, 20, 2, { id: 'ma' })])
    mkCodexRollout('rollout-t-019fd12.jsonl', proj, at, 'gpt-5.6-sol', [{ input: 30, cached: 0, output: 3, at }], false, 2000, 'sample question', { id: 't-12' })
    mkClaudeFile('c.jsonl', [userLine('later', '2026-07-30T04:00:00Z'), usageLine('claude-fable-5', '2026-07-30T04:00:00Z', 5, 1, { id: 'mc' })])
    const r = await engine().build(roots(), [proj])
    await expectOneCombination(r)
    expect(r.perProject.get(mergeKey(proj))?.sessions.map((s) => s.title)).toEqual(['later', 'first', 'second', 'sample question'])
  })

  it('a file with no key is a group alone', async () => {
    const keyless = mkClaudeFile('k.jsonl', [userLine('no ids here', '2026-07-30T03:00:00Z'), usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 10, 1)])
    const keyed = mkClaudeFile('m.jsonl', [userLine('ids here', '2026-07-30T03:30:00Z'), usageLine('claude-fable-5', '2026-07-30T03:30:00Z', 10, 1, { id: 'mk' })])
    const grok = mkGrokSession(proj, 'gk', [grokUser(1785369500, 'a grok question', 0), grokTurn(1785369600, { input: 50, output: 5 })])
    const r = await engine().build(roots(), [proj])
    await expectOneCombination(r)
    expect(storedGroups(cacheDir()).sort()).toEqual([[keyless], [keyed], [grok]].sort())
  })

  it('a sequence of scans over one home: after each, the summed stored results are one combination over the scan set', async () => {
    const e = engine()
    const scan = async (): Promise<void> => expectOneCombination(await e.build(roots(), [proj]))
    const day = (d: number, h = 10): string => `2026-07-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`
    const aLines = [userLine('a question', day(1)), usageLine('claude-fable-5', day(1), 10, 1, { id: 'm1' })]
    const a = mkClaudeFile('a.jsonl', aLines)
    const b = mkClaudeFile('b.jsonl', [userLine('b question', day(2)), usageLine('claude-fable-5', day(2), 20, 2, { id: 'm2' })])
    const rollout = 'rollout-s-019fd20.jsonl'
    mkCodexRollout(rollout, proj, day(1), 'gpt-5.6-sol', [{ input: 100, cached: 10, output: 10, at: day(1) }], false, 2000, 'sample question', { id: 's-20' })
    mkGrokSession(proj, 'gs', [grokUser(1785369500, 'a grok question', 0), grokTurn(1785369600, { input: 50, output: 5 })])
    const x = mkAgyConversation('agy-x', proj, [{ usage: { messageId: 'c1', input: 40, output: 4 }, at: Date.parse(day(3)) }])
    await scan()
    // Added: c shares m2 with b, and y shares the call c1 with x — two groups gain a file each
    const c = mkClaudeFile('c.jsonl', [userLine('c question', day(4)), usageLine('claude-fable-5', day(4), 30, 3, { id: 'm2' })])
    const y = mkAgyConversation('agy-y', proj, [
      { usage: { messageId: 'c1', input: 40, output: 4 }, at: Date.parse(day(3)) },
      { usage: { messageId: 'c2', input: 9, output: 1 }, at: Date.parse(day(5)) }
    ])
    await scan()
    // Grown: a and the rollout gain a turn each
    appendFileSync(a, usageLine('claude-fable-5', day(6), 5, 1, { id: 'm3' }) + '\n')
    mkCodexRollout(rollout, proj, day(1), 'gpt-5.6-sol', [{ input: 100, cached: 10, output: 10, at: day(1) }, { input: 60, cached: 0, output: 6, at: day(6) }], false, 3000, 'sample question', { id: 's-20' })
    await scan()
    // Removed: b, which c shared m2 with
    rmSync(b)
    await scan()
    // Moved: y takes a place before x, so it is the conversation that keeps c1
    renameSync(y, join(dirname(y), 'agy-0.db'))
    await scan()
    // Two groups join: a gains a copy of m2, which only c holds now
    mkClaudeFile('a.jsonl', [...aLines, usageLine('claude-fable-5', day(6), 5, 1, { id: 'm3' }), usageLine('claude-fable-5', day(7), 30, 3, { id: 'm2' })], 4000)
    await scan()
    expect(storedGroups(cacheDir()).find((g) => g.includes(a))).toEqual([a, c])
    // And split again
    mkClaudeFile('a.jsonl', [...aLines, usageLine('claude-fable-5', day(6), 5, 1, { id: 'm3' })], 5000)
    await scan()
    expect(storedGroups(cacheDir()).find((g) => g.includes(a))).toEqual([a])
    expect(storedGroups(cacheDir()).find((g) => g.includes(x))?.length, 'the moved conversation still shares its group').toBe(2)
  })
})

describe('a group (token-stats, Implementation Decisions, Cache)', () => {
  it('a chain linked by two different keys is one group, and removing the middle file\'s keys splits it', async () => {
    const { a, b, c } = linkedChain()
    const e = engine()
    await e.build(roots(), [proj])
    expect(storedGroups(cacheDir())).toEqual([[a, b, c]])
    // B's usage lines lose their message ids: nothing links A, B and C any more
    mkClaudeFile('b.jsonl', [userLine('second question', '2026-07-01T10:30:00Z'), usageLine('claude-fable-5', '2026-07-01T11:00:00Z', 150, 10), usageLine('claude-opus-5-5', '2026-07-02T09:00:00Z', 40, 4)], 2000)
    await expectOneCombination(await e.build(roots(), [proj]))
    expect(storedGroups(cacheDir()).sort()).toEqual([[a], [b], [c]].sort())
  })
})

// A group's input: each file in scan order, its entry and what the scan adds to it (token-stats, Implementation
// Decisions, Cache). Each case changes one thing the scan adds, the entries unchanged, and the scan after it gives what
// one combination over the scan set gives, with nothing parsed.
describe('a group whose input differs is combined again (token-stats, Implementation Decisions, Cache)', () => {
  /** An engine of one combination whose parses are recorded */
  function recorded(): { e: TokenEngine; parsed: () => string[] } {
    const { runner, jobs } = recording()
    const e = new TokenEngine(cacheDir(), TEST_ENGINE, runner, undefined, '1.0.0')
    return { e, parsed: () => jobs.splice(0).map((j) => j.file) }
  }

  it('a file moved in the scan order inside its group: the copy kept is the one now first', async () => {
    // Two copies of one message with equal figures: the first in scan order is kept, and the session it is in counts it
    const line = usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 1, { id: 'm-eq', requestId: 'r-eq' })
    const first = mkClaudeFile('b.jsonl', [userLine('b question', '2026-07-30T01:00:00Z'), line])
    const other = mkClaudeFile('c.jsonl', [userLine('c question', '2026-07-30T01:30:00Z'), line])
    const { e, parsed } = recorded()
    const tokens = (r: TokenBuildResult): Record<string, number | undefined> =>
      Object.fromEntries((r.perProject.get(mergeKey(proj))?.sessions ?? []).map((s) => [s.title ?? '', s.tokens]))
    expect(tokens(await e.build(roots(), [proj]))).toEqual({ 'b question': 11, 'c question': 0 })
    parsed()
    const moved = join(dirname(first), 'd.jsonl')
    renameSync(first, moved)
    const r = await e.build(roots(), [proj])
    await expectOneCombination(r)
    expect(tokens(r)).toEqual({ 'b question': 0, 'c question': 11 })
    expect(parsed(), 'the moved file alone is new to the store').toEqual([moved])
    expect(other).toBeTruthy()
  })

  it('a project registered for a Codex session\'s folder admits the session to the read allow-list', async () => {
    const rollout = mkCodexRollout('rollout-r-019fd30.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10 }], false, 2000, 'sample question', { id: 'r-30' })
    const { e, parsed } = recorded()
    expect((await e.build(roots(), [], new Set())).sessionFiles.has(rollout)).toBe(false)
    parsed()
    const r = await e.build(roots(), [], new Set([mergeKey(proj)]))
    expect(r.sessionFiles.has(rollout)).toBe(true)
    expect(parsed()).toEqual([])
    await expectOneCombination(r)
  })

  it('a Claude project registered admits its subagent\'s transcript to the read allow-list', async () => {
    const own = mkClaudeFile('5c1e.jsonl', [userLine('dispatch a helper', '2026-07-30T01:00:00Z'), usageLine('claude-fable-5', '2026-07-30T01:00:00Z', 10, 1, { id: 'm-own' })])
    const sub = mkClaudeFile(join('5c1e', 'subagents', 'agent-h.jsonl'), [usageLine('claude-fable-5', '2026-07-30T01:00:05Z', 30, 3, { id: 'm-sub', sidechain: true })])
    const { e, parsed } = recorded()
    expect((await e.build(roots(), [proj], new Set())).sessionFiles).toEqual(new Set())
    parsed()
    const r = await e.build(roots(), [proj], new Set([mergeKey(proj)]))
    expect(r.sessionFiles).toEqual(new Set([own, sub]))
    expect(parsed()).toEqual([])
    await expectOneCombination(r)
  })

  it('an Antigravity title changed in agy\'s titles database titles the session', async () => {
    const agyHome = roots().antigravityHome
    mkAgyConversation('agy-t', proj, [{ usage: { messageId: 'm-t', input: 40, output: 4 }, at: Date.parse('2026-07-30T02:00:00Z') }])
    writeTranscript(agyHome, 'agy-t', [MEASURED_TRANSCRIPT.main[0]])
    const titles = (t: string): void => {
      for (const suffix of ['', '-wal', '-shm']) rmSync(join(agyHome, `conversation_summaries.db${suffix}`), { force: true })
      writeSummaries(agyHome, [{ id: 'agy-t', title: t }])
    }
    titles('Explaining Calc.py')
    const { e, parsed } = recorded()
    const titleOf = (r: TokenBuildResult): Array<string | null> => (r.perProject.get(mergeKey(proj))?.sessions ?? []).map((s) => s.title)
    expect(titleOf(await e.build(roots(), [proj]))).toEqual(['Explaining Calc.py'])
    parsed()
    titles('Calc.py, renamed')
    const r = await e.build(roots(), [proj])
    expect(titleOf(r)).toEqual(['Calc.py, renamed'])
    expect(parsed()).toEqual([])
    await expectOneCombination(r, new Map([['agy-t', 'Calc.py, renamed']]))
  })

  // A Codex session's name is read from the session index when its rollout is parsed (session-view B4): renamed there
  // alone, the session keeps the name its entry holds, and takes the new one when its rollout is next written. This
  // machine's index, 2026-11-15: 19 of 669 ids carry more than one name, and every one of their rollouts was written at or
  // after its last rename.
  it('a Codex title changed in the session index shows once the rollout is next written (B4)', async () => {
    const id = '019f0000-0000-7000-8000-00000000c0de'
    const file = `rollout-2026-07-30T01-00-00-${id}.jsonl`
    writeIndex([{ id, name: 'first name' }])
    mkCodexRollout(file, proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10 }], false, 2000, 'sample question', { id })
    const { e, parsed } = recorded()
    const titleOf = (r: TokenBuildResult): Array<string | null> => (r.perProject.get(mergeKey(proj))?.sessions ?? []).map((s) => s.title)
    expect(titleOf(await e.build(roots(), [proj]))).toEqual(['first name'])
    parsed()
    writeIndex([{ id, name: 'first name' }, { id, name: 'renamed' }])
    const unchanged = await e.build(roots(), [proj])
    expect(titleOf(unchanged)).toEqual(['first name'])
    expect(parsed()).toEqual([])
    await expectOneCombination(unchanged)
    mkCodexRollout(file, proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10 }, { input: 50, cached: 0, output: 5 }], false, 3000, 'sample question', { id })
    expect(titleOf(await e.build(roots(), [proj]))).toEqual(['renamed'])
  })
})

// A group's stored result (token-stats C2; Implementation Decisions, Cache; QR-002/AC-02): read back and summed while its
// input and its combination are the ones it came from, combined again from the stored entries otherwise, with nothing
// parsed.
describe('a group\'s stored result', () => {
  /** The store's group rows, each column as text */
  const resultRows = (): string[][] => onStore(cacheDir(), 'SELECT id, members, input, combination, result FROM results ORDER BY id').map((row) => row.map(String))
  /** Builds under `combination`: the result, and the files it parsed */
  async function launch(combination?: string): Promise<{ result: TokenBuildResult; parsed: string[] }> {
    const { runner, jobs } = recording()
    const result = await new TokenEngine(cacheDir(), TEST_ENGINE, runner, undefined, combination).build(roots(), [proj])
    return { result, parsed: jobs.map((j) => j.file) }
  }
  /** The linked chain and a lone file, the file each is in */
  function twoGroups(): { chain: ReturnType<typeof linkedChain>; lone: string } {
    const chain = linkedChain()
    const lone = mkClaudeFile('d.jsonl', [userLine('a lone question', '2026-07-03T09:00:00Z'), usageLine('claude-fable-5', '2026-07-03T09:00:00Z', 7, 1, { id: 'md' })])
    return { chain, lone }
  }

  it.each([
    ['a result that is no blob', "UPDATE results SET result = 'none' WHERE id = ?"],
    ['a result cut short', 'UPDATE results SET result = substr(result, 1, length(result) - 3) WHERE id = ?'],
    ['a member list naming a file another group names', 'UPDATE results SET members = members || (SELECT members FROM results WHERE id <> ?1) WHERE id = ?1'],
    ['a member list naming a file the store does not hold', "UPDATE results SET members = members || X'ffffffffffffff7f' WHERE id = ?"],
    ['a member list out of scan order', 'UPDATE results SET members = substr(members, 17, 8) || substr(members, 9, 8) || substr(members, 1, 8) WHERE id = ?']
  ])('%s is combined again from its files\' entries, with nothing parsed (C2)', async (_what, sql) => {
    const { chain } = twoGroups()
    await launch('1.0.0')
    const [chainGroup] = onStore(cacheDir(), 'SELECT id FROM results WHERE length(members) = 24')
    onStore(cacheDir(), sql, chainGroup[0])
    const again = await launch('1.0.0')
    expect(again.parsed).toEqual([])
    await expectOneCombination(again.result)
    expect(storedGroups(cacheDir()).find((g) => g.includes(chain.a))).toEqual([chain.a, chain.b, chain.c])
  })

  it('a second launch of one version, after one file changed, rewrites that file\'s entry and its group\'s result alone (QR-002/AC-02)', async () => {
    const { lone } = twoGroups()
    await launch('1.0.0')
    expect((await launch('1.0.0')).parsed, 'the control: a launch with nothing changed parses nothing').toEqual([])
    const before = { entries: storeRows(cacheDir()), results: resultRows() }
    mkClaudeFile('d.jsonl', [userLine('a lone question', '2026-07-03T09:00:00Z'), usageLine('claude-fable-5', '2026-07-03T09:00:00Z', 7, 1, { id: 'md' }), usageLine('claude-fable-5', '2026-07-03T10:00:00Z', 9, 1, { id: 'md2' })], 3000)
    const after = await launch('1.0.0')
    expect(after.parsed).toEqual([lone])
    await expectOneCombination(after.result)
    const entries = storeRows(cacheDir())
    expect(entries.filter((r) => r.path !== lone)).toEqual(before.entries.filter((r) => r.path !== lone))
    expect(entries.find((r) => r.path === lone)).not.toEqual(before.entries.find((r) => r.path === lone))
    // The chain's row is the one it was; the lone file's row is a new one
    const results = resultRows()
    expect(results.filter((r) => before.results.some((b) => b.join() === r.join())).length).toBe(1)
    expect(results).toHaveLength(2)
  })

  it.each([
    ['another application version', '0.9.0', '1.0.0'],
    ['an unpackaged run, whose next run is a combination of its own', undefined, undefined]
  ])('results stored under %s are every one combined again at the next scan, with nothing parsed', async (_what, first, next) => {
    twoGroups()
    await launch(first)
    const before = resultRows()
    const again = await launch(next)
    expect(again.parsed).toEqual([])
    await expectOneCombination(again.result)
    // Each row records the combination it came from (a row's number is reused once every row is gone)
    const earlier = new Set(before.map((r) => r[3]))
    expect(resultRows().filter((r) => earlier.has(r[3])), 'no row is one the earlier combination wrote').toEqual([])
    expect(resultRows()).toHaveLength(2)
  })

  // The time zone a scan runs in is part of the combination: Codex, Grok and Antigravity usage is filed under its day as
  // the groups are combined. A Claude Code entry's days are cut when its file is parsed, so after a change they stay in
  // the zone of that parse until the file is parsed again (Implementation Decisions, Cache).
  it('the same store scanned in another time zone: every group combined again, nothing parsed, the days in the new zone', async () => {
    const at = '2026-07-30T20:00:00Z'
    mkClaudeFile('z.jsonl', [userLine('a late question', at), usageLine('claude-fable-5', at, 10, 1, { id: 'mz' })])
    mkCodexRollout('rollout-z-019fd40.jsonl', proj, at, 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10, at }], false, 2000, 'sample question', { id: 'z-40' })
    mkGrokSession(proj, 'gz', [grokUser(Date.parse(at) / 1000 - 60, 'a grok question', 0), grokTurn(Date.parse(at) / 1000, { input: 50, output: 5 })])
    mkAgyConversation('agy-z', proj, [{ usage: { messageId: 'm-z', input: 40, output: 4 }, at: Date.parse(at) }])
    const zone = process.env['TZ']
    const days = (r: TokenBuildResult): Record<string, string> => Object.fromEntries(r.rows.map((row) => [row.side, row.day]))
    try {
      process.env['TZ'] = 'UTC'
      const utc = await launch('1.0.0')
      expect(days(utc.result)).toEqual({ claude: '2026-07-30', codex: '2026-07-30', grok: '2026-07-30', antigravity: '2026-07-30' })
      const before = resultRows()
      process.env['TZ'] = 'Asia/Tokyo'
      const tokyo = await launch('1.0.0')
      expect(tokyo.parsed).toEqual([])
      expect(days(tokyo.result)).toEqual({ claude: '2026-07-30', codex: '2026-07-31', grok: '2026-07-31', antigravity: '2026-07-31' })
      await expectOneCombination(tokyo.result)
      const earlier = new Set(before.map((r) => r[3]))
      expect(resultRows().filter((r) => earlier.has(r[3])), 'no row is one the earlier zone\'s combination wrote').toEqual([])
    } finally {
      if (zone === undefined) delete process.env['TZ']
      else process.env['TZ'] = zone
    }
  })

  it('an entry the session page rebuilt between two scans is a changed file for the next: its figures are in that scan', async () => {
    const f = mkClaudeFile('p.jsonl', [userLine('first', '2026-07-30T01:00:00Z'), usageLine('claude-fable-5', '2026-07-30T01:00:00Z', 10, 1, { id: 'mp1' })])
    const { runner, jobs } = recording()
    const e = new TokenEngine(cacheDir(), TEST_ENGINE, runner, undefined, '1.0.0')
    await e.build(roots(), [proj])
    jobs.length = 0
    appendFileSync(f, userLine('second', '2026-07-30T02:00:00Z') + '\n' + usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 10, { id: 'mp2' }) + '\n')
    expect((await e.sessionQuestions(roots(), f)).questions, 'the page rebuilt and stored the entry').toHaveLength(2)
    const r = await e.build(roots(), [proj])
    expect(jobs, 'the scan finds the page\'s entry current').toEqual([])
    expect(r.global.bySide.claude.total).toBe(11 + 110)
    await expectOneCombination(r)
  })
})

describe('the archive row output (for UsageArchive to persist)', () => {
  it('build produces day × side × project × model rows agreeing with the byDay totals', async () => {
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
      userLine('take a look at this bug'),
      usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.map((s) => s.title)).toEqual(['take a look at this bug'])
    // A warmup session's tokens are counted in full (the same rule as subagents)
    expect(p?.tokens.bySide.claude.total).toBe(165)
    expect(r.global.bySide.claude.total).toBe(165)
  })

  it('Claude: with several noise messages in a row it keeps walking forward, taking the first real question as the title', async () => {
    mkClaudeFile('noisy.jsonl', [
      userLine('<local-command-caveat>Caveat: …</local-command-caveat>'),
      userLine('<command-name>/clear</command-name> <command-message>clear</command-message> <command-args></command-args>'),
      userLine('continue the session view feature: read the spec'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions[0].title).toBe('continue the session view feature: read the spec')
  })

  it('Claude: a cron session is listed, with the real instruction after the bracket as its title', async () => {
    mkClaudeFile('cron.jsonl', [
      userLine('[cron:95a214a4-0021-44ea-a831-f5c851b11d77 hackernews-daily-top5] fetch today top 5 topics'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions[0].title).toBe('fetch today top 5 topics')
  })

  /** The paginated format's human message as a rollout line (the one shape seen in 8285 items, 2026-09-11) */
  const itemUserLine = (text: string, at = '2026-07-30T01:00:05Z'): string =>
    JSON.stringify({
      timestamp: at,
      ordinal: 9,
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        thread_id: '019f0000-0000-7000-8000-000000000001',
        turn_id: '019f0000-0000-7000-8000-000000000002',
        item: { type: 'UserMessage', id: '019f0000-0000-7000-8000-000000000003', content: [{ type: 'text', text, text_elements: [] }] },
        started_at_ms: 1,
        completed_at_ms: 1
      }
    })

  it('Codex: a paginated rollout with no user_message event is listed, titled by its first completed-item user message (spec B1)', async () => {
    const file = mkCodexRollout('rollout-pag-019f030.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 10, cached: 0, output: 5, record: 'resp_q1' }], false, 2000, null)
    appendFileSync(file, itemUserLine('The following is the Codex agent history whose request action you are assessing.') + '\n' + itemUserLine('paginated question') + '\n')
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'codex')
    expect(s?.title).toBe('paginated question')
    expect(s?.questionCount).toBe(1)
  })

  it('Codex: a paginated rollout whose only user-side message is an injected response-item message has no question — not listed, tokens still count (spec B1)', async () => {
    // The shape of all 29 such rollouts on this machine (2026-09-11): one response_item user message whose
    // parts are AGENTS.md instructions, the environment context and the plugin recommendations
    const file = mkCodexRollout('rollout-inj-019f031.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 10, cached: 0, output: 5, record: 'resp_i1' }], false, 2000, null)
    appendFileSync(
      file,
      JSON.stringify({
        timestamp: '2026-07-30T01:00:01Z',
        ordinal: 3,
        type: 'response_item',
        payload: {
          type: 'message',
          id: 'msg_1',
          role: 'user',
          content: [
            { type: 'input_text', text: '# AGENTS.md instructions for /Users/x/proj\n\n<INSTRUCTIONS>…' },
            { type: 'input_text', text: '<environment_context>\n  <cwd>/Users/x/proj</cwd>\n</environment_context>' }
          ],
          internal_chat_message_metadata_passthrough: { turn_id: 't1', content_item_kinds: ['agents_md.instructions', 'environments.environment_context'] }
        }
      }) + '\n'
    )
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.filter((x) => x.side === 'codex')).toHaveLength(0)
    expect(r.global.bySide.codex.total).toBe(15)
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
      [{ input: 10, cached: 0, output: 5 }], false, 2000, 'the first question as written')
    writeIndex([{ id, name: 'thread name' }])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.side === 'codex')?.title).toBe('thread name')
  })

  it('Codex: with no thread_name it falls back to the first real question (noise stripped the same way)', async () => {
    mkCodexRollout('rollout-unnamed-019fc03.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000,
      '[cron:abc daily] run the regression once a day')
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.side === 'codex')?.title).toBe('run the regression once a day')
  })

  // Ticket 03's retrospective review R1: a retitle should only happen when the original title came from
  // the first question;
  // thread_name's priority (spec A4) is not invalidated by stripping.
  it('Codex: a prefix-stripped legacy fork with no thread_name is retitled to its first surviving question (the replayed first question must not title it)', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000031'
    const CHILD = '019f0000-bbbb-7000-8000-000000000032'
    writeFileSync(join(d, `rollout-${PARENT}.jsonl`), [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'parent question one')].join('\n') + '\n')
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(childFile, [meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }), q('2026-07-30T02:00:00Z', 'parent question one'), q('2026-07-30T02:00:05Z', 'child new question')].join('\n') + '\n')
    const e = engine()
    const r = await e.build(roots(), [proj])
    const child = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.file === childFile)
    expect(child?.forkState).toBe('stripped')
    expect(child?.title).toBe('child new question')
    // The session page and the project search take the title from here: the same one the list shows (#278)
    expect((await e.sessionQuestions(roots(), childFile)).title).toBe('child new question')
  })

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
      [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'parent question one')].join('\n') + '\n'
    )
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', 'parent question one'), // a replay (timestamps rewritten, content identical)
        q('2026-07-30T02:00:05Z', 'child new question')
      ].join('\n') + '\n'
    )
    writeIndex([{ id: CHILD, name: 'fork thread name' }])
    const e = engine()
    const r = await e.build(roots(), [proj])
    const child = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.forkState === 'stripped')
    expect(child, 'a stripped child should be listed (it still has surviving questions)').toBeDefined()
    expect(child?.title, 'thread_name takes priority (A4) and a retitle must not displace it').toBe('fork thread name')
    // The session page and the project search keep it too
    expect((await e.sessionQuestions(roots(), childFile)).title).toBe('fork thread name')
  })

  it('Codex: when the line a stripped fork is retitled from cannot be read back during the build, the list keeps the title it was parsed with', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000071'
    const CHILD = '019f0000-bbbb-7000-8000-000000000072'
    writeFileSync(join(d, `rollout-${PARENT}.jsonl`), [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'parent question one')].join('\n') + '\n')
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(childFile, [meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }), q('2026-07-30T02:00:00Z', 'parent question one'), q('2026-07-30T02:00:05Z', 'child new question')].join('\n') + '\n')
    // The fork's rollout goes (deleted, or compressed by Codex) after it is parsed and before the list is retitled
    const removing: ParseRunner = {
      concurrency: 1,
      run: async (job) => {
        const result = await runParseJob(job)
        if (job.file === childFile) rmSync(childFile)
        return result
      }
    }
    const r = await new TokenEngine(join(dir, 'cache'), TEST_ENGINE, removing).build(roots(), [proj])
    const child = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.file === childFile)
    expect([child?.forkState, child?.questionCount, child?.title]).toEqual(['stripped', 1, 'parent question one'])
  })

  // The uncertain tier strips too — here the burst heuristic, with the parent missing — and the re-title
  // follows the strip whatever the state (spec B2)
  it('Codex: an orphan fork whose opening burst is stripped is retitled to its first surviving question, on the list and on its page', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const ORPHAN = '019f0000-cccc-7000-8000-000000000061'
    const orphanFile = join(d, `rollout-${ORPHAN}.jsonl`)
    writeFileSync(
      orphanFile,
      [
        JSON.stringify({ timestamp: '2026-07-30T03:00:00Z', type: 'session_meta', payload: { cwd: proj, id: ORPHAN, forked_from_id: '019f0000-dead-7000-8000-000000000099' } }),
        q('2026-07-30T03:00:00.000Z', 'replayed question one'), // written in one go: a burst
        q('2026-07-30T03:00:00.300Z', 'replayed question two'),
        q('2026-07-30T03:00:30.000Z', 'orphan new question') // a human's pace
      ].join('\n') + '\n'
    )
    const e = engine()
    const r = await e.build(roots(), [proj])
    const listed = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.file === orphanFile)
    expect([listed?.forkState, listed?.questionCount, listed?.title]).toEqual(['uncertain', 1, 'orphan new question'])
    const page = await e.sessionQuestions(roots(), orphanFile)
    expect([page.forkState, page.questions.length, page.title]).toEqual(['uncertain', 1, 'orphan new question'])
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
      [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'parent question one')].join('\n') + '\n'
    )
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', 'parent question one'), // every question is a replay; the fork produced nothing new
        usage('2026-07-30T02:00:01Z', 100, 20)
      ].join('\n') + '\n'
    )
    const e = engine()
    const r = await e.build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.file === childFile), 'a fork stripped empty should not be listed').toBeUndefined()
    expect(p?.sessions.filter((s) => s.side === 'codex'), 'the parent session is listed as usual').toHaveLength(1)
    expect(p?.tokens.bySide.codex.total, 'not being listed does not mean the tokens are not counted').toBe(120)
    // Its file stays readable (the allow-list follows the pre-strip rule): its session questions resolve
    // with nothing left, and with no question left to re-title it from, it keeps the title it was parsed with
    expect(r.sessionFiles.has(childFile)).toBe(true)
    const page = await e.sessionQuestions(roots(), childFile)
    expect([page.forkState, page.questions.length, page.title]).toEqual(['stripped', 0, 'parent question one'])
  })
})

// ── Ticket 04: sessionQuestions (the session page service: signature validation / single-file rebuild /
// stripping sharing its source) ──
import { appendFileSync } from 'node:fs'

describe('sessionQuestions (the session page service)', () => {
  it('a matching signature: the cached index is used directly, giving the side, the count and forkState', async () => {
    const cl = mkClaudeFile('sq.jsonl', [
      userLine('question one', '2026-07-30T02:00:00Z'),
      usageLine('claude-fable-5', '2026-07-30T02:00:10Z', 10, 5),
      userLine('question two', '2026-07-30T03:00:00Z')
    ])
    const e = engine()
    await e.build(roots(), [proj])
    const r = await e.sessionQuestions(roots(), cl)
    expect(r.side).toBe('claude')
    expect(r.questions).toHaveLength(2)
    expect(r.forkState).toBe('none')
  })

  it('a changed signature: only that file\'s index is rebuilt, and the new index is written back to the store', async () => {
    const cl = mkClaudeFile('sq2.jsonl', [userLine('question one', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(cl, userLine('question two', '2026-07-30T04:00:00Z') + '\n') // the size changes → the signature mismatches
    const r = await e.sessionQuestions(roots(), cl)
    expect(r.questions, 'after the rebuild the appended question should be visible').toHaveLength(2)
    // The write-back assertion: that file's index and signature in the store are both updated — the evidence
    // for "no rebuild needed next time"
    const stored = storedEntries(join(dir, 'cache')).get(cl)
    expect(stored?.agg['questions']).toHaveLength(2)
    const st = statSync(cl)
    expect(stored?.sig).toBe(`${st.mtimeMs}:${st.size}`)
  })

  // The project a Claude session is credited to comes from the registry, which the page does not read: the
  // rebuild keeps the project its entry held (C4). Kept under no project the index would be the next build's hit,
  // and the session would leave its project's list and figures while its usage stayed in the total.
  it('a changed signature on a Claude session: the rebuilt index keeps its project, and the next build takes it as it is', async () => {
    const cl = mkClaudeFile('sq-project.jsonl', [userLine('question one', '2026-07-30T02:00:00Z'), usageLine('claude-fable-5', '2026-07-30T02:00:10Z', 10, 5)])
    const parsed: string[] = []
    const e = new TokenEngine(join(dir, 'cache'), TEST_ENGINE, {
      concurrency: 1,
      run: (job) => {
        parsed.push(job.file)
        return runParseJob(job)
      }
    })
    await e.build(roots(), [proj])
    appendFileSync(cl, userLine('question two', '2026-07-30T04:00:00Z') + '\n')
    expect((await e.sessionQuestions(roots(), cl)).questions).toHaveLength(2)
    parsed.length = 0
    const r = await e.build(roots(), [proj])
    expect(parsed, 'the page\'s index is that build\'s hit').toEqual([])
    const project = r.perProject.get(proj.toLowerCase())
    expect(project?.sessions.map((s) => s.file)).toEqual([cl])
    expect(project?.tokens.bySide.claude.total).toBe(15)
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
    writeFileSync(parentFile, [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'parent question one')].join('\n') + '\n')
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', 'parent question one'), // a replay (timestamps rewritten, content identical)
        q('2026-07-30T02:00:05Z', 'child new question')
      ].join('\n') + '\n'
    )
    const e = engine()
    await e.build(roots(), [proj])
    const r = await e.sessionQuestions(roots(), childFile)
    expect(r.side).toBe('codex')
    expect(r.forkState).toBe('stripped')
    expect(r.questions).toHaveLength(1)
  })

  it('a paginated codex fork: nothing is replayed into it, so nothing is stripped, the state is none and all of its own questions are listed (spec B2)', async () => {
    // Codex copies no completed-item events into a paginated child (spawn.rs, 2026-09-09 tree): the child's
    // first question is its own, and a fingerprint check against the parent would misread it as an
    // unmatched replay and flag the session uncertain.
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const meta = (ts: string, ordinal: number, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, ordinal, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const qi = (ts: string, m: string): string =>
      JSON.stringify({
        timestamp: ts,
        ordinal: 5,
        type: 'event_msg',
        payload: { type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'UserMessage', id: 'i', content: [{ type: 'text', text: m, text_elements: [] }] }, started_at_ms: 1, completed_at_ms: 1 }
      })
    const PARENT = '019f0000-aaaa-7000-8000-000000000021'
    const CHILD = '019f0000-bbbb-7000-8000-000000000022'
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(join(d, `rollout-${PARENT}.jsonl`), [meta('2026-07-30T01:00:00Z', 0, PARENT), qi('2026-07-30T01:00:01Z', 'parent question one')].join('\n') + '\n')
    writeFileSync(childFile, [meta('2026-07-30T02:00:00Z', 0, CHILD, { forked_from_id: PARENT }), qi('2026-07-30T02:00:05Z', 'child new question')].join('\n') + '\n')
    const e = engine()
    const r0 = await e.build(roots(), [proj])
    const listed = r0.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.file === childFile)
    expect(listed?.forkState).toBe('none')
    expect(listed?.title).toBe('child new question')
    const r = await e.sessionQuestions(roots(), childFile)
    expect(r.forkState).toBe('none')
    expect(r.questions).toHaveLength(1)
  })

  // Ticket 05: isFresh is the renderer's criterion for "should the rebuilding interim state be shown"
  // (a read-only predicate that triggers no rebuild)
  it('isFresh: true after a build; false once the file is appended to; false for an unknown or deleted file', async () => {
    const cl = mkClaudeFile('fresh.jsonl', [userLine('q', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    expect(e.isFresh(cl)).toBe(true)
    appendFileSync(cl, userLine('another question', '2026-07-30T03:00:00Z') + '\n')
    expect(e.isFresh(cl), 'after appending the signature mismatches, so false').toBe(false)
    expect(e.isFresh(join(dir, 'nope.jsonl')), 'a file not in the index is false').toBe(false)
    const gone = mkClaudeFile('fresh-gone.jsonl', [userLine('q', '2026-07-30T02:00:00Z')])
    await e.build(roots(), [proj])
    rmSync(gone)
    expect(e.isFresh(gone), 'a deleted file is false').toBe(false)
  })

  // Ticket 06: the banner's data — Claude's branch point count, and for a stripped Codex fork the parent
  // title and file
  it('a branching Claude session: sessionQuestions gives forkPoints; a linear session gives 0', async () => {
    const q = (u: string, p: string | null, t: string): string =>
      JSON.stringify({ type: 'user', uuid: u, parentUuid: p, timestamp: '2026-07-30T02:00:00Z', message: { role: 'user', content: t } })
    const a = (u: string, p: string): string =>
      JSON.stringify({ type: 'assistant', uuid: u, parentUuid: p, timestamp: '2026-07-30T02:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } })
    const forked = mkClaudeFile('forked.jsonl', [q('u1', null, 'question one'), a('a1', 'u1'), q('u2b', 'a1', 'branched off'), q('u2', 'a1', 'question two')])
    const linear = mkClaudeFile('linear.jsonl', [q('v1', null, 'question one'), a('b1', 'v1'), q('v2', 'b1', 'question two')])
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
    writeFileSync(parentFile, [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'parent question one')].join('\n') + '\n')
    writeFileSync(
      childFile,
      [meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }), q('2026-07-30T02:00:00Z', 'parent question one'), q('2026-07-30T02:00:05Z', 'child new question')].join('\n') + '\n'
    )
    writeFileSync(
      orphanFile,
      [meta('2026-07-30T03:00:00Z', ORPHAN, { forked_from_id: '019f0000-dead-7000-8000-000000000099' }), q('2026-07-30T03:00:00Z', 'orphan question')].join('\n') + '\n'
    )
    const e = engine()
    await e.build(roots(), [proj])
    const child = await e.sessionQuestions(roots(), childFile)
    expect(child.forkState).toBe('stripped')
    expect(child.forkParentTitle).toBe('parent question one')
    expect(child.forkParentFile).toBe(parentFile)
    const orphan = await e.sessionQuestions(roots(), orphanFile)
    expect(orphan.forkState).toBe('uncertain')
    expect(orphan.forkParentTitle).toBeNull()
    expect(orphan.forkParentFile).toBeNull()
    // The Claude side has no parent concept and is always null; forkPoints is always 0 for Codex
    expect(child.forkPoints).toBe(0)
  })

  // Three legacy generations with no thread_name: the parent is itself a stripped fork, titled by its first
  // question left ("parent new question") rather than the one it replayed ("grandparent question")
  function mkStrippedForkChain(): { parentFile: string; childFile: string } {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const GRAND = '019f0000-aaaa-7000-8000-000000000051'
    const PARENT = '019f0000-bbbb-7000-8000-000000000052'
    const CHILD = '019f0000-cccc-7000-8000-000000000053'
    const parentFile = join(d, `rollout-${PARENT}.jsonl`)
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(join(d, `rollout-${GRAND}.jsonl`), [meta('2026-07-30T01:00:00Z', GRAND), q('2026-07-30T01:00:01Z', 'grandparent question')].join('\n') + '\n')
    writeFileSync(
      parentFile,
      [meta('2026-07-30T02:00:00Z', PARENT, { forked_from_id: GRAND }), q('2026-07-30T02:00:00Z', 'grandparent question'), q('2026-07-30T02:00:05Z', 'parent new question')].join('\n') + '\n'
    )
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T03:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T03:00:00Z', 'grandparent question'), // both replayed from the parent
        q('2026-07-30T03:00:00Z', 'parent new question'),
        q('2026-07-30T03:00:05Z', 'child new question')
      ].join('\n') + '\n'
    )
    return { parentFile, childFile }
  }

  it('a fork of a stripped fork: the banner names the parent by the title the list gives it, not by its replayed first question (#278)', async () => {
    const { parentFile, childFile } = mkStrippedForkChain()
    const e = engine()
    const r = await e.build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.file === parentFile)?.title).toBe('parent new question')
    const child = await e.sessionQuestions(roots(), childFile)
    expect(child.forkState).toBe('stripped')
    expect(child.forkParentFile).toBe(parentFile)
    expect(child.forkParentTitle).toBe('parent new question')
  })

  it('a fork of a stripped fork whose parent\'s line cannot be read back: the banner keeps the title the parent was parsed with, and the page still opens', async () => {
    const { parentFile, childFile } = mkStrippedForkChain()
    const e = engine()
    await e.build(roots(), [proj])
    // Gone after the scan: the child's page still finds the parent in the index, but the re-title read fails
    rmSync(parentFile)
    const child = await e.sessionQuestions(roots(), childFile)
    expect([child.forkState, child.forkParentFile, child.forkParentTitle]).toEqual(['stripped', parentFile, 'grandparent question'])
  })

  it('present in the cache but the file has been deleted: an explicit error rather than a silent empty list (a spec failure path)', async () => {
    const cl = mkClaudeFile('gone.jsonl', [userLine('q'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    const e = engine()
    await e.build(roots(), [proj])
    rmSync(cl)
    // Assert the **error code** rather than wording: the wording is produced by the renderer per language
    // (ADR-0015)
    await expect(e.sessionQuestions(roots(), cl)).rejects.toSatisfy(
      (err: unknown) => decodeAppError(err)?.code === ERR.sessionFileUnreadable
    )
  })

  it.skipIf(process.getuid?.() === 0)('changed since the index and its file cannot be read: says the file cannot be read, not that it failed to parse (session-view P6)', async () => {
    const cl = mkClaudeFile('locked.jsonl', [userLine('q'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(cl, userLine('second') + '\n')
    chmodSync(cl, 0o000)
    try {
      const code = await e.sessionQuestions(roots(), cl).catch((err: unknown) => decodeAppError(err)?.code)
      expect(code).toBe(ERR.sessionFileUnreadable)
    } finally {
      chmodSync(cl, 0o644)
    }
  })

  it.skipIf(process.getuid?.() === 0)('a Codex rollout changed since the index that cannot be read: says the file cannot be read, not that its metadata is unreadable (session-view P6)', async () => {
    const rollout = mkCodexRollout('rollout-locked-019f050.jsonl', proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10, record: 'resp_l1' }])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(rollout, '\n')
    chmodSync(rollout, 0o000)
    try {
      const code = await e.sessionQuestions(roots(), rollout).catch((err: unknown) => decodeAppError(err)?.code)
      expect(code).toBe(ERR.sessionFileUnreadable)
    } finally {
      chmodSync(rollout, 0o644)
    }
  })

  it('a readable Codex rollout whose first line gives no metadata says that, and only that', async () => {
    const rollout = mkCodexRollout('rollout-headless-019f051.jsonl', proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10, record: 'resp_h1' }])
    const e = engine()
    await e.build(roots(), [proj])
    writeFileSync(rollout, `not json\n${readFileSync(rollout, 'utf8')}`)
    const code = await e.sessionQuestions(roots(), rollout).catch((err: unknown) => decodeAppError(err)?.code)
    expect(code).toBe(ERR.sessionMetaUnreadable)
  })

  it('a cold rollout cut short after the scan listed it whole: its head reads, its parse does not, and it says the file cannot be read (session-view P6)', async () => {
    const big = mkCodexRollout('rollout-cut-019f052.jsonl', proj, '2026-07-30T09:00:00Z', 'gpt-5.6-sol',
      Array.from({ length: 3000 }, (_, i) => ({ input: 1000 + i, cached: 0, output: 10, record: `resp_c${i}` })))
    const full = zstdCompressSync(readFileSync(big))
    rmSync(big)
    const cold = `${big}.zst`
    writeFileSync(cold, full)
    const e = engine()
    await e.build(roots(), [proj])
    writeFileSync(cold, full.subarray(0, Math.floor(full.length / 2)))
    const code = await e.sessionQuestions(roots(), cold).catch((err: unknown) => decodeAppError(err)?.code)
    expect(code).toBe(ERR.sessionFileUnreadable)
  })

  it('a file not in the cache: refused (with the caller guiding a refresh) rather than a silent empty list', async () => {
    const e = engine()
    await e.build(roots(), [proj])
    await expect(e.sessionQuestions(roots(), join(dir, 'nope.jsonl'))).rejects.toThrow()
  })

  it('build also produces the session read allow-list: listed sessions and subagent/nested files are in it, nothing else is', async () => {
    const cl = mkClaudeFile('wl.jsonl', [userLine('q'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
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
      userLine('a question in an unregistered project'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)
    ], 1000, '-Users-nobody-unregistered')
    const orphanNested = mkClaudeFile('sub/agent-o.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)
    ], 1000, '-Users-nobody-unregistered')
    const e = engine()
    const t = await e.build(roots(), [proj])
    expect(t.sessionFiles.has(orphan), 'a listed session of an unregistered project must not be readable').toBe(false)
    expect(t.sessionFiles.has(orphanNested), 'a nested transcript of an unregistered project must not be readable either').toBe(false)
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
    expect(t2.sessionFiles.has(cxOrphan), 'a codex session with an unregistered cwd must not be readable').toBe(false)
  })
})

describe('usage rows are the one source the projections derive from (ADR-0025)', () => {
  /**
   * Sum the rows by hand and compare against the projections. **Not a tautology even though the
   * production code derives them from the same rows**: this re-derivation is written independently,
   * so it still catches summing the wrong field, dropping a side, or losing a row on the way out.
   * What it cannot catch is a shared misreading of the rows themselves — that is what the ccusage
   * reconciliation is for.
   */
  function reconcile(r: Awaited<ReturnType<TokenEngine['build']>>): void {
    for (const side of AGENT_SIDES as ReadonlySet<AgentSide>) {
      const mine = r.rows.filter((x) => x.side === side)
      const sum = (f: 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'total'): number =>
        mine.reduce((a, x) => a + x[f], 0)
      expect(r.global.bySide[side], `${side}: bySide must equal the rows it is derived from`).toEqual({
        input: sum('input'),
        output: sum('output'),
        cacheRead: sum('cacheRead'),
        cacheWrite: sum('cacheWrite'),
        total: sum('total')
      })
    }
    // The three cross-side comparable buckets sum **exactly** to the total (the AGENTS.md invariant).
    // Asserted over whatever fixture is supplied rather than for one hand-picked case: a rounding
    // rule that only drifts on lopsided data would survive a per-case assertion.
    const b = r.rows.reduce(
      (a, x) => ({
        uncached: a.uncached + x.input + x.cacheWrite,
        output: a.output + x.output,
        cacheRead: a.cacheRead + x.cacheRead
      }),
      { uncached: 0, output: 0, cacheRead: 0 }
    )
    const rowTotal = r.rows.reduce((a, x) => a + x.total, 0)
    expect(b.uncached + b.output + b.cacheRead, 'the three buckets must sum to the total').toBe(rowTotal)
    // Every day the projection knows about must be a day the rows know about, and with the same value
    for (const d of r.global.byDay) {
      for (const side of AGENT_SIDES as ReadonlySet<AgentSide>) {
        const fromRows = r.rows.filter((x) => x.day === d.day && x.side === side).reduce((a, x) => a + x.total, 0)
        expect(d.bySide[side], `byDay ${d.day}/${side}`).toBe(fromRows)
      }
    }
    const models = new Map<string, number>()
    for (const x of r.rows) {
      if (!x.model) continue
      const k = `${x.side}:${x.model}`
      models.set(k, (models.get(k) ?? 0) + x.total)
    }
    expect(
      Object.fromEntries(r.global.byModel.map((m) => [`${m.side}:${m.model}`, m.total])),
      'byModel must equal the rows it is derived from'
    ).toEqual(Object.fromEntries(models))
  }

  it('every side, several days, two sides on one day: every projection equals the rows', async () => {
    mkClaudeFile('a.jsonl', [
      userLine('a claude question'),
      usageLine('claude-fable-5', '2026-07-29T10:00:00Z', 100, 50, { cacheRead: 7000, cacheWrite: 300 }),
      usageLine('claude-opus-5', '2026-07-30T02:00:00Z', 20, 10)
    ])
    mkCodexRollout('rollout-2026-07-30T01-00-00-019f0000-aaaa-7000-8000-000000000001.jsonl', proj,
      '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
        // 24h apart, so it crosses a day boundary in any local time zone (the existing convention here)
        { input: 1000, cached: 900, output: 10, at: '2026-07-29T12:00:00Z' },
        { input: 100, cached: 0, output: 500, at: '2026-07-30T12:00:00Z' }
      ])
    mkGrokSession(proj, 'g1', [
      grokUser(1753900000, 'a grok question', 0),
      grokTurn(1753900000, { input: 200, cached: 150, output: 40, model: 'grok-4.6-build' })
    ])
    // At the very instant of the first Claude call, so the two land on one local day in any time zone
    mkAgyConversation('agy-1', proj, [
      { usage: { messageId: 'm-a1', input: 300, output: 30, cacheRead: 900 }, at: Date.parse('2026-07-29T10:00:00Z') },
      { usage: { messageId: 'm-a2', input: 50, output: 5 }, at: Date.parse('2026-07-30T12:00:00Z'), model: 'gemini-3.8-flash-n' }
    ])
    const r = await engine().build(roots(), [proj])
    reconcile(r)
    expect(new Set(r.rows.map((x) => x.side)), 'the fixture must actually produce rows on every side').toEqual(new Set(AGENT_SIDES))
    // A per-side keying mistake is invisible while only one side has data on a day (Testing Decisions)
    const shared = r.global.byDay.find((d) => d.day === r.rows.find((x) => x.side === 'antigravity' && x.total === 1230)?.day)
    expect(shared?.bySide.antigravity).toBe(1230)
    expect(shared?.bySide.claude).toBeGreaterThan(0)
  })

  it("a session spanning midnight splits its four fields by what each day measured, not by that day's share of the total (B8)", async () => {
    // The two days are deliberately lopsided: day one is almost all cache reads, day two almost all
    // output. Apportioning by share of the total would smear each day's mix across both, and the two
    // rules only agree when a session's days happen to be proportionally alike — which is exactly what
    // a casually written fixture produces, so the asymmetry here is the point.
    // 24h apart, so the split is a real one in any local time zone; the day keys are read back from
    // the result rather than written into the assertion, which would only hold in one zone
    mkCodexRollout('rollout-2026-07-30T01-00-00-019f0000-bbbb-7000-8000-000000000002.jsonl', proj,
      '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
        { input: 1000, cached: 900, output: 10, at: '2026-07-29T12:00:00Z' },
        { input: 100, cached: 0, output: 500, at: '2026-07-30T12:00:00Z' }
      ])
    const r = await engine().build(roots(), [proj])
    const rows = r.rows.filter((x) => x.side === 'codex').sort((a, b) => (a.day < b.day ? -1 : 1))
    expect(rows.length, 'the fixture must actually land on two days').toBe(2)
    expect(rows[0], 'the cache-heavy day keeps its own cache reads').toMatchObject({
      input: 100, cacheRead: 900, output: 10, total: 1010
    })
    expect(rows[1], 'the output-heavy day keeps its own output').toMatchObject({
      input: 100, cacheRead: 0, output: 500, total: 600
    })
  })
})

describe('the archive restore path (spec C16) and project figures from the effective rows (spec G6)', () => {
  /** A copy of the store, taken as a developer takes one: the store's own file, with the application not writing. It
   * is put under the store's name in a directory of its own, so that a case can change it as a store */
  const snapshot = (): string => {
    const copy = join(dir, 'snapshot', STORE_FILE)
    mkdirSync(dirname(copy), { recursive: true })
    copyFileSync(storePath(join(dir, 'cache')), copy)
    return copy
  }
  const dirOf = dirname

  it('rowsFromStoreSnapshot: a copy of the store yields exactly the rows a build of that data produces', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      usageLine('claude-opus-5', '2026-07-31T03:00:00Z', 20, 10)
    ])
    mkCodexRollout('rollout-r-019f100.jsonl', proj, '2026-07-30T04:00:00Z', 'gpt-5.6-sol', [
      { input: 40, cached: 0, output: 0 }
    ])
    const built = await engine().build(roots(), [proj])
    const fromFile = rowsFromStoreSnapshot(snapshot(), TEST_ENGINE, roots())
    const key = (r: { day: string; side: string; projectKey: string; model: string }): string => `${r.day}|${r.side}|${r.projectKey}|${r.model}`
    const sorted = (rows: typeof built.rows): typeof built.rows => [...rows].sort((a, b) => (key(a) < key(b) ? -1 : 1))
    expect(sorted(fromFile)).toEqual(sorted(built.rows))
    expect(fromFile.length).toBeGreaterThan(1)
  })

  // Where several files share a key, the combination keeps the first: the copy of a message a scan meets first, the
  // first file of a session id as a fork's parent, the first conversation holding a call. The store holds its rows in
  // the order it first held them, and each case here makes that another order than the walk's — the file the walk
  // meets second stored by an earlier scan — so that only taking the rows in scan order gives the scan's rows (C16).
  describe('in scan order, whatever order the store holds its rows in (C16)', () => {
    const proj2 = (): string => join(dir, 'work', 'p2')
    const twoProjects = (): void => {
      mkdirSync(proj2(), { recursive: true })
      writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {}, [proj2()]: {} } }))
    }
    const sortedRows = (rows: TokenBuildResult['rows']): string[] =>
      rows.map((r) => JSON.stringify([r.day, r.side, r.projectKey, r.model, r.input, r.output, r.cacheRead, r.cacheWrite, r.total])).sort()
    const storedOrder = (): string[] => storeRows(cacheDir()).map((r) => String(r.path))

    it('a Claude message held with equal figures in the files of two projects: credited to the file the walk meets first', async () => {
      twoProjects()
      const tied = usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5, { id: 'm1', requestId: 'r1' })
      const second = mkClaudeFile('in-p2.jsonl', [tied], 1000, encodeClaudeProjectDir(proj2()))
      await engine().build(roots(), [proj, proj2()])
      const first = mkClaudeFile('in-p1.jsonl', [tied])
      const built = await engine().build(roots(), [proj, proj2()])
      expect(storedOrder(), 'the store holds the second-walked file first').toEqual([second, first])
      expect(built.rows.map((r) => [r.projectKey, r.total])).toEqual([[proj.toLowerCase(), 15]])
      expect(sortedRows(rowsFromStoreSnapshot(snapshot(), TEST_ENGINE, roots()))).toEqual(sortedRows(built.rows))
    })

    // A Codex thread continued in a new rollout: the continuation's first line carries the thread's own id, as this
    // machine's continuations do (`rollout-<time>-<thread>_<new>.jsonl`). A fork of the thread replays the original's
    // question and two turns before its own, and is stripped against the first file holding the thread's id.
    const THREAD = '019f0000-0000-7000-8000-00000000aaaa'
    type Turn = [string, number, number]
    function rollout(name: string, first: Record<string, unknown>, at: string, questions: Array<[string, string]>, turns: Turn[], cumulative: boolean): string {
      const d = join(dir, '.codex', 'sessions', '2026', '07', '29')
      mkdirSync(d, { recursive: true })
      let sum = { input: 0, output: 0 }
      const usage = (input: number, output: number): Record<string, number> =>
        ({ input_tokens: input, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: output, total_tokens: input + output })
      const lines = [
        { timestamp: at, type: 'session_meta', payload: { cwd: proj, ...first } },
        { timestamp: at, type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } },
        ...questions.map(([t, text]) => ({ timestamp: t, type: 'event_msg', payload: { type: 'user_message', message: text } })),
        ...turns.map(([t, input, output]) => {
          sum = { input: sum.input + input, output: sum.output + output }
          const info: Record<string, unknown> = { last_token_usage: usage(input, output) }
          if (cumulative) info['total_token_usage'] = usage(sum.input, sum.output)
          return { timestamp: t, type: 'event_msg', payload: { type: 'token_count', info } }
        })
      ]
      const file = join(d, name)
      writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
      utimesSync(file, 2000, 2000)
      return file
    }
    /** The continuation stored first, by a scan before the original and the fork were there */
    async function continuedThread(): Promise<{ original: string; continuation: string; fork: string; built: TokenBuildResult; builder: TokenEngine }> {
      const continuation = rollout(`rollout-2026-07-29T02-00-00-${THREAD}_019f0000-0000-7000-8000-00000000bbbb.jsonl`, { id: THREAD }, '2026-07-29T02:00:00Z',
        [['2026-07-29T02:00:00Z', 'a continuation question']], [['2026-07-29T02:00:00Z', 30, 3]], true)
      await engine().build(roots(), [proj])
      const original = rollout(`rollout-2026-07-29T01-00-00-${THREAD}.jsonl`, { id: THREAD }, '2026-07-29T01:00:00Z',
        [['2026-07-29T01:00:00Z', 'the parent question']], [['2026-07-29T01:00:00Z', 10, 1], ['2026-07-29T01:00:10Z', 20, 2]], true)
      const fork = rollout('rollout-2026-07-29T01-30-00-019f0000-0000-7000-8000-00000000cccc.jsonl',
        { id: '019f0000-0000-7000-8000-00000000cccc', forked_from_id: THREAD }, '2026-07-29T01:30:00Z',
        [['2026-07-29T01:30:00Z', 'the parent question'], ['2026-07-29T01:31:00Z', 'a question after the fork']],
        [['2026-07-29T01:00:00Z', 10, 1], ['2026-07-29T01:00:10Z', 20, 2], ['2026-07-29T01:31:00Z', 5, 5]], false)
      const builder = engine()
      const built = await builder.build(roots(), [proj])
      expect(storedOrder()[0], 'the store holds the continuation first').toBe(continuation)
      return { original, continuation, fork, built, builder }
    }

    it('a Codex fork of a continued thread: stripped against the file the walk meets first', async () => {
      const { built } = await continuedThread()
      // 33 the original, 33 the continuation, 10 the fork's own turn: its replayed two are stripped
      expect(built.global.bySide.codex.total).toBe(76)
      const restored = rowsFromStoreSnapshot(snapshot(), TEST_ENGINE, roots())
      expect(restored.filter((r) => r.side === 'codex').reduce((n, r) => n + r.total, 0)).toBe(76)
      expect(sortedRows(restored)).toEqual(sortedRows(built.rows))
    })

    // The page's parent lookup takes the store's rows again once the other process wrote (C27), and takes them in scan
    // order, so the page strips the fork against the parent the list stripped it against (session-view C4)
    it('a Codex fork of a continued thread: its page, after the other process wrote, names the parent the list was stripped against', async () => {
      const { original, fork, built, builder } = await continuedThread()
      const listed = [...built.perProject.values()].flatMap((p) => p.sessions).find((x) => x.file === fork)
      expect(listed?.forkState).toBe('stripped')
      mkClaudeFile('another.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
      await engine().build(roots(), [proj])
      const page = await builder.sessionQuestions(roots(), fork)
      expect([page.forkState, page.forkParentFile, page.questions.length]).toEqual(['stripped', original, 1])
    })

    it('an Antigravity call held by two conversations of two projects: credited to the conversation the walk meets first', async () => {
      twoProjects()
      const call = [{ usage: { messageId: 'm-shared', input: 100, output: 10 }, at: Date.parse('2026-07-30T02:00:00Z') }]
      const second = mkAgyConversation('conv-b', proj2(), call)
      await engine().build(roots(), [proj, proj2()])
      const first = mkAgyConversation('conv-a', proj, call)
      const built = await engine().build(roots(), [proj, proj2()])
      expect(storedOrder(), 'the store holds the second-walked conversation first').toEqual([second, first])
      expect(built.rows.filter((r) => r.side === 'antigravity').map((r) => [r.projectKey, r.total])).toEqual([[mergeKey(proj), 110]])
      expect(sortedRows(rowsFromStoreSnapshot(snapshot(), TEST_ENGINE, roots()))).toEqual(sortedRows(built.rows))
    })
  })

  // The snapshot is read without anything written to it or beside it, and it is a store or it is refused: its version
  // is all a store of another structure is known by, and a JSON cache file is no store (C16)
  it.each([
    ['of another cache version', (file: string): void => {
        onStore(dirOf(file), `PRAGMA user_version = ${CACHE_VERSION - 1}`)
      }, `cache snapshot is version ${CACHE_VERSION - 1}, this build reads version ${CACHE_VERSION}`],
    ['that is a JSON cache file', (file: string): void => writeFileSync(file, JSON.stringify({ version: CACHE_VERSION, files: {} })), `cache snapshot is version none, this build reads version ${CACHE_VERSION}`]
  ])('rowsFromStoreSnapshot refuses a snapshot %s rather than misread it', async (_what, plant, refusal) => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    await engine().build(roots(), [proj])
    const file = snapshot()
    plant(file)
    expect(() => rowsFromStoreSnapshot(file, TEST_ENGINE, roots())).toThrow(refusal)
  })

  // A scan parses again the file of an entry that is not well formed. A restore has no file to parse: the rows of
  // the other entries alone would write the day's figure short of that entry's usage, as an accepted change (C16)
  it.each([
    ['an aggregate gone null', "UPDATE entries SET agg = 'null' WHERE path = ?"],
    ['an aggregate that is no JSON', "UPDATE entries SET agg = 'not json' WHERE path = ?"],
    // Short of a field no row reads: its rows would be right, and the entry is still not one this build wrote
    ['an aggregate that lost listed', "UPDATE entries SET agg = json_remove(agg, '$.listed') WHERE path = ?"]
  ])('rowsFromStoreSnapshot refuses a snapshot holding %s rather than give the rows of its other entries (C16)', async (_what, sql) => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const codex = mkCodexRollout('rollout-snap-019fd12.jsonl', proj, '2026-07-30T04:00:00Z', 'gpt-5.6-sol', [{ input: 40, cached: 0, output: 0 }])
    await engine().build(roots(), [proj])
    const file = snapshot()
    expect(rowsFromStoreSnapshot(file, TEST_ENGINE, roots()).map((r) => [r.side, r.total]).sort()).toEqual([['claude', 15], ['codex', 40]])
    onStore(dirOf(file), sql, codex)
    expect(() => rowsFromStoreSnapshot(file, TEST_ENGINE, roots())).toThrow('cache snapshot holds 1 of 2 entries that are not well formed')
  })

  it('rowsFromStoreSnapshot leaves the snapshot byte for byte as it was, with no log or shared-memory file beside it (C16)', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    await engine().build(roots(), [proj])
    const copyDir = join(dir, 'snapshot-dir')
    mkdirSync(copyDir)
    const file = join(copyDir, 'snapshot.sqlite')
    copyFileSync(storePath(join(dir, 'cache')), file)
    const bytes = readFileSync(file)
    expect(rowsFromStoreSnapshot(file, TEST_ENGINE, roots()).map((r) => r.total)).toEqual([15])
    expect(readFileSync(file).equals(bytes)).toBe(true)
    expect(readdirSync(copyDir)).toEqual(['snapshot.sqlite'])
  })

  it('projectStatsFromRows: a project\'s figures come from the rows it owns in the effective set, its sessions stay, and a project present only in the archive gets an entry with none', () => {
    const base = new Map([
      ['/live', [{ side: 'claude', title: 't', at: 1, tokens: 5, file: '/f', questionCount: 1, forkState: 'none' }]]
    ] as const)
    const rows = [
      { day: '2026-07-01', side: 'claude', projectKey: '/live', model: 'm', input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 300 },
      { day: '2026-07-02', side: 'codex', projectKey: '/archived-only', model: 'g', input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 700 },
      { day: '', side: 'claude', projectKey: '', model: 'm', input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 9 }
    ] as const
    const out = projectStatsFromRows(new Map(base as never), [...rows] as never)
    expect(out.get('/live')?.tokens.bySide.claude.total).toBe(300)
    expect(out.get('/live')?.sessions).toHaveLength(1)
    expect(out.get('/archived-only')?.tokens.bySide.codex.total).toBe(700)
    expect(out.get('/archived-only')?.sessions).toEqual([])
    expect(out.has('')).toBe(false)
  })
})

// Scan order (token-stats, Implementation Decisions, Scan order): the order the build takes every side's files in, as
// its parses are handed out one at a time, is the files sorted by the one comparator (scan-order.ts) — over names that
// JavaScript's string order and a whole-path order each get wrong, nested directories, and Codex's archived sessions
describe('scan order', () => {
  it('every side\'s walk gives its files in scan order', async () => {
    const names = ['Mike', '_x', 'a', 'a-b', 'a.d', '9', '10', '\u00e9']
    for (const name of names) {
      mkClaudeFile('one.jsonl', [userLine('q'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)], 1000, name)
      mkClaudeFile(join('one', 'subagents', 'agent.jsonl'), [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)], 1000, name)
    }
    const codex = join(dir, '.codex')
    for (const [i, to] of [['1', join(codex, 'sessions', '2026', '07', '9')], ['2', join(codex, 'sessions', '2026', '07', '10')], ['3', join(codex, 'archived_sessions')], ['4', join(codex, 'sessions', '2026', '07', 'a-b')], ['5', join(codex, 'sessions', '2026', '07', 'a.d')]]) {
      const made = mkCodexRollout(`rollout-2026-07-30T01-00-0${i}-019f0000-0000-7000-8000-00000000000${i}.jsonl`, proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 1, cached: 0, output: 1 }])
      mkdirSync(to, { recursive: true })
      renameSync(made, join(to, made.slice(made.lastIndexOf('/') + 1)))
    }
    for (const name of ['Mike', '_x', 'a', 'a-b', 'a.d', '\u00e9']) mkGrokSession(join(proj, name), name, [grokTurn(1785369600, { input: 1, output: 1 })])
    for (const name of ['Mike', '_x', 'a', 'a-b', 'a.d', '\u00e9']) mkAgyConversation(name, proj, [{ usage: { messageId: `m-${name}`, input: 1, output: 1 }, at: Date.parse('2026-07-30T02:00:00Z') }])
    const { runner, jobs } = recording()
    await new TokenEngine(cacheDir(), TEST_ENGINE, runner).build(roots(), [proj])
    const walked = jobs.map((j) => j.file)
    expect(walked, 'every file of every side was handed out').toHaveLength(names.length * 2 + 5 + 6 + 6)
    expect(new Set(jobs.map((j) => j.kind))).toEqual(new Set(['claude', 'codex', 'grok', 'antigravity']))
    expect(walked).toEqual([...walked].sort(compareScanOrder(roots())))
  })
})

// One walk of the session trees per scan (#160): build() reads the supplied walk instead of walking
// again, so a session written after the walk is outside this build — the same set scan() saw.
describe('the shared session walk', () => {
  it('build() aggregates the sessions of the supplied walk, not ones that appeared after it', async () => {
    mkCodexRollout('rollout-a-019f100.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 100, cached: 0, output: 10 }])
    mkGrokSession(proj, 'g1', [grokTurn(1785369600, { input: 50, output: 5 })])
    const walked = walkSessions(roots())
    mkCodexRollout('rollout-b-019f101.jsonl', proj, '2026-07-30T02:00:00Z', 'gpt-5.6-sol', [{ input: 1000, cached: 0, output: 100 }])
    mkGrokSession(proj, 'g2', [grokTurn(1785373200, { input: 500, output: 50 })])
    const r = await engine().build(roots(), [proj], undefined, walked)
    expect(r.global.bySide.codex.total).toBe(110)
    expect(r.global.bySide.grok.total).toBe(55)
  })
})

// Resuming a grown Codex rollout (#158). Codex's writer only appends to a rollout or replaces it whole by
// renaming a staged copy over the path, so a file whose inode is unchanged and whose size grew is parsed
// from where the last parse stopped. The contract: a resumed result is exactly what a cold parse of the
// whole file gives, and a file that was replaced, shrank, or has been resumed RESUME_LIMIT times is
// parsed whole.
describe('resuming a grown Codex rollout', () => {
  const ROLLOUT = 'rollout-grow-019f300.jsonl'
  /** A rollout carrying every piece of state a resume has to hand on: a re-reported event (the
   * cumulative rule, B7), the first usage record (the boundary, B9), a record id seen twice (B1), a
   * model switch, and a second question — wherever the file is cut, some of it straddles the cut. */
  function rolloutText(): Buffer {
    const f = mkCodexRollout(ROLLOUT, proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 20, output: 10, at: '2026-07-30T01:01:00Z' },
      { input: 100, cached: 20, output: 10, at: '2026-07-30T01:02:00Z', repeat: true },
      { input: 300, cached: 50, output: 30, at: '2026-07-30T01:03:00Z', record: 'resp-1' },
      { input: 300, cached: 50, output: 30, at: '2026-07-30T01:04:00Z', record: 'resp-1' },
      { input: 500, cached: 0, output: 50, at: '2026-07-30T01:05:00Z', record: 'resp-2' }
    ])
    const extra = [
      { timestamp: '2026-07-31T02:00:00Z', type: 'turn_context', payload: { model: 'gpt-5.7', cwd: proj } },
      { timestamp: '2026-07-31T02:00:01Z', type: 'event_msg', payload: { type: 'user_message', message: 'second question' } },
      record('resp-3', '2026-07-31T02:01:00Z', 700, 70),
      record('resp-2', '2026-07-31T02:02:00Z', 500, 50)
    ]
    const text = Buffer.concat([readFileSync(f), Buffer.from(extra.map((l) => JSON.stringify(l)).join('\n') + '\n')])
    rmSync(f)
    return text
  }
  function record(id: string, at: string, input: number, output: number): Record<string, unknown> {
    const u = { input_tokens: input, cached_input_tokens: 0, output_tokens: output, total_tokens: input + output }
    return { timestamp: at, type: 'token_usage_record', payload: { response_id: id, usage: u, turn_token_usage: u, thread_token_usage: u } }
  }
  function rolloutPath(): string {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    return join(d, ROLLOUT)
  }
  /** Everything a build hands on, in a comparable form */
  function shape(r: Awaited<ReturnType<TokenEngine['build']>>): unknown {
    return {
      global: r.global,
      rows: r.rows,
      perProject: Object.fromEntries([...r.perProject].sort(([a], [b]) => a.localeCompare(b))),
      sessionFiles: [...r.sessionFiles].sort()
    }
  }
  async function cold(): Promise<unknown> {
    return shape(await new TokenEngine(join(dir, `cache-cold-${Math.random()}`), TEST_ENGINE).build(roots(), [proj]))
  }
  /** Overwrite bytes in place: same inode, same size — invisible to the resume check by design */
  function overwrite(file: string, at: number, bytes: string): void {
    const fd = openSync(file, 'r+')
    try {
      writeSync(fd, bytes, at)
    } finally {
      closeSync(fd)
    }
  }

  /** The rollout's entry in a cache directory's store, its resume state included */
  function entryIn(cacheDir: string, file: string): { resume: Record<string, unknown> } & Record<string, unknown> {
    return storedEntries(cacheDir).get(file) as { resume: Record<string, unknown> } & Record<string, unknown>
  }

  it('wherever the file is cut, scanning the first part and then the grown file gives the cold result, and the rollout the entry a whole parse gives', async () => {
    const text = rolloutText()
    const cuts = new Set<number>()
    for (let i = 0; i < text.length; i++) {
      if (text[i] === 0x0a) {
        cuts.add(i + 1)
        // A line still being written when the first scan ran: its JSON whole but its line feed not yet written, and
        // cut in the middle
        cuts.add(i)
        cuts.add(i - 7)
      }
    }
    cuts.delete(text.length)
    const f = rolloutPath()
    for (const cut of cuts) {
      const cacheDir = join(dir, `cache-resume-${cut}`)
      writeFileSync(f, text.subarray(0, cut))
      await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])
      // A cut inside the first line leaves no session to keep an entry for, and the grown file is parsed whole
      const resumes = entryIn(cacheDir, f) === undefined ? 0 : 1
      appendFileSync(f, text.subarray(cut))
      const resumed = shape(await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj]))
      const coldDir = join(dir, `cache-cold-${cut}`)
      expect(resumed, `cut at byte ${cut}`).toEqual(shape(await new TokenEngine(coldDir, TEST_ENGINE).build(roots(), [proj])))
      // The entry, the state the next resume starts from included, but for the count of resumes since a whole parse
      const whole = entryIn(coldDir, f)
      expect(entryIn(cacheDir, f), `cut at byte ${cut}`).toEqual({ ...whole, resume: { ...whole.resume, resumes } })
    }
    expect(cuts.size).toBeGreaterThan(10)
  })

  it('a cold rollout that grew in place, under the same inode, is parsed whole: its stream reads from its start only', async () => {
    const text = rolloutText()
    const f = `${rolloutPath()}.zst`
    // A cold rollout ends with a line feed (B12): the first part ends at a line's end
    const cut = text.lastIndexOf(0x0a, text.indexOf('second question')) + 1
    writeFileSync(f, zstdCompressSync(text.subarray(0, cut)))
    const cacheDir = join(dir, 'cache-resume')
    await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])
    const before = statSync(f)
    writeFileSync(f, zstdCompressSync(text))
    const after = statSync(f)
    // What would make a plain rollout resume: the same inode, a larger size
    expect(after.ino).toBe(before.ino)
    expect(after.size).toBeGreaterThan(before.size)
    expect(shape(await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj]))).toEqual(await cold())
    expect(entryIn(cacheDir, f).resume['resumes']).toBe(0)
  })

  it('reads only the appended part: a change before the old end stays unseen until a full parse', async () => {
    const text = rolloutText()
    const f = rolloutPath()
    const cut = text.indexOf('second question')
    writeFileSync(f, text.subarray(0, cut))
    const cacheDir = join(dir, 'cache-resume')
    const first = await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])
    // 100 → 900 in the first usage event, already parsed
    overwrite(f, text.indexOf('"input_tokens":100'), '"input_tokens":900')
    appendFileSync(f, text.subarray(cut))
    const resumed = await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])
    const coldTotal = (await new TokenEngine(join(dir, 'cache-cold'), TEST_ENGINE).build(roots(), [proj])).global.bySide.codex.total
    // The appended part adds resp-3 (770); resp-2 repeats and counts once
    expect(resumed.global.bySide.codex.total).toBe(first.global.bySide.codex.total + 770)
    expect(coldTotal).toBe(resumed.global.bySide.codex.total + 800)
  })

  it('a rollout replaced by a rename (a new inode) is parsed whole', async () => {
    const text = rolloutText()
    const f = rolloutPath()
    const cut = text.indexOf('second question')
    writeFileSync(f, text.subarray(0, cut))
    const cacheDir = join(dir, 'cache-resume')
    await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])
    const staged = `${f}.staged`
    writeFileSync(staged, Buffer.from(text.toString('utf8').replace('"input_tokens":100', '"input_tokens":900')))
    renameSync(staged, f)
    expect(shape(await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj]))).toEqual(await cold())
  })

  it('a rollout that shrank in place is parsed whole', async () => {
    const text = rolloutText()
    const f = rolloutPath()
    writeFileSync(f, text)
    const cacheDir = join(dir, 'cache-resume')
    await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])
    writeFileSync(f, text.subarray(0, text.indexOf('second question')))
    expect(shape(await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj]))).toEqual(await cold())
  })

  it(`after ${RESUME_LIMIT} resumes the next growth is parsed whole, bounding an edit no cheap check sees`, async () => {
    const text = rolloutText()
    const f = rolloutPath()
    writeFileSync(f, text)
    const cacheDir = join(dir, 'cache-resume')
    await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])
    overwrite(f, text.indexOf('"input_tokens":100'), '"input_tokens":900')
    const coldNow = async (): Promise<number> =>
      (await new TokenEngine(join(dir, `cache-cold-${Math.random()}`), TEST_ENGINE).build(roots(), [proj])).global.bySide.codex.total
    for (let i = 0; i < RESUME_LIMIT; i++) {
      appendFileSync(f, JSON.stringify(record(`grow-${i}`, '2026-07-31T03:00:00Z', 1, 0)) + '\n')
      const total = (await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])).global.bySide.codex.total
      expect(total, `resume ${i + 1}`).toBe((await coldNow()) - 800)
    }
    appendFileSync(f, JSON.stringify(record('grow-last', '2026-07-31T03:00:00Z', 1, 0)) + '\n')
    const total = (await new TokenEngine(cacheDir, TEST_ENGINE).build(roots(), [proj])).global.bySide.codex.total
    expect(total).toBe(await coldNow())
  })

  it('the session page rebuilds a grown rollout to the same index a cold scan gives', async () => {
    const text = rolloutText()
    const f = rolloutPath()
    const cut = text.indexOf('second question')
    writeFileSync(f, text.subarray(0, cut))
    const e = new TokenEngine(join(dir, 'cache-resume'), TEST_ENGINE)
    await e.build(roots(), [proj])
    appendFileSync(f, text.subarray(cut))
    const page = await e.sessionQuestions(roots(), f)
    const fresh = new TokenEngine(join(dir, 'cache-cold'), TEST_ENGINE)
    await fresh.build(roots(), [proj])
    expect(page).toEqual(await fresh.sessionQuestions(roots(), f))
    expect(page.questions).toHaveLength(2)
  })
})

// Parses run on a pool of workers (#159), several at once, finishing in any order. The build must take
// them in scan order all the same: the cross-file dedupe keeps the first copy of a message, so which
// project a duplicated message counts toward depends on that order.
describe('a parse runner that finishes out of order', () => {
  it('gives the result of parsing one file at a time', async () => {
    const proj2 = join(dir, 'work', 'p2')
    mkdirSync(proj2, { recursive: true })
    // The same message (id and request id) in a session of each project
    const shared = usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 10, { id: 'msg-shared', requestId: 'req-shared' })
    mkClaudeFile('a.jsonl', [userLine('first project question'), shared])
    mkClaudeFile('b.jsonl', [userLine('second project question'), shared], 1000, encodeClaudeProjectDir(proj2))
    mkClaudeFile('c.jsonl', [userLine('third'), usageLine('claude-opus-5', '2026-07-30T03:00:00Z', 7, 3)])
    mkCodexRollout('rollout-order-019f400.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 50, cached: 0, output: 5 }])
    mkGrokSession(proj, 'g-order', [grokTurn(1785369600, { input: 30, output: 3 })])
    // The first job started finishes last, the next one second to last, and so on
    let started = 0
    const reversing: ParseRunner = {
      concurrency: 4,
      run: async (job) => {
        const k = started++
        await new Promise((r) => setTimeout(r, (10 - k) * 15))
        return runParseJob(job)
      }
    }
    const shape = (r: Awaited<ReturnType<TokenEngine['build']>>): unknown => ({
      global: r.global,
      rows: r.rows,
      perProject: Object.fromEntries([...r.perProject].sort(([a], [b]) => a.localeCompare(b))),
      sessionFiles: [...r.sessionFiles].sort()
    })
    const pooled = await new TokenEngine(join(dir, 'cache-pooled'), TEST_ENGINE, reversing).build(roots(), [proj, proj2])
    const inline = await new TokenEngine(join(dir, 'cache-inline'), TEST_ENGINE).build(roots(), [proj, proj2])
    expect(started).toBe(5)
    expect(shape(pooled)).toEqual(shape(inline))
    // And the pooled store is the inline store, entry by entry
    const cacheOf = (d: string): unknown => Object.fromEntries([...storedEntries(join(dir, d))].sort(([a], [b]) => a.localeCompare(b)))
    expect(cacheOf('cache-pooled')).toEqual(cacheOf('cache-inline'))
  })
})

// The session page rebuilds a file that changed since the scan, routing by the data root it lives under
// (#217): a Grok stream used to fall through to the Codex branch, whose meta reader cannot read it.
describe('the session page of a Grok session whose stream grew', () => {
  it('rebuilds through the Grok parse and matches a cold scan of the grown stream', async () => {
    const f = mkGrokSession(proj, 'g-grow', [grokUser(1786088600, 'first grok question', 0), grokTurn(1786088610, { input: 10, output: 1 })])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(f, grokUser(1786088700, 'second grok question', 1) + '\n')
    const page = await e.sessionQuestions(roots(), f)
    const fresh = new TokenEngine(join(dir, 'cache-cold'), TEST_ENGINE)
    await fresh.build(roots(), [proj])
    expect(page).toEqual(await fresh.sessionQuestions(roots(), f))
    expect(page.side).toBe('grok')
    expect(page.questions).toHaveLength(2)
    // The rebuild is kept: opening the page again does not rebuild (nor show the rebuilding state) again
    expect(e.isFresh(f)).toBe(true)
  })
})

// session-view::US-001/AC-01, AC-09: the session page carries the ID the session's own agent side resumes it by
describe('the session ID on the session page', () => {
  it('a Claude Code session: the session file\'s name without its extension', async () => {
    const id = '6b3f2a10-4c5d-4e6f-8a7b-9c0d1e2f3a4b'
    const f = mkClaudeFile(`${id}.jsonl`, [userLine('what is this session called', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), f)).sessionId).toBe(id)
  })

  it('a Codex session: the id its record\'s session metadata carries, which its file name need not hold', async () => {
    const id = '019f0000-eeee-7000-8000-000000000071'
    const f = mkCodexRollout('rollout-main-019f071.jsonl', proj, '2026-07-30T03:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000, 'a codex question', { id })
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), f)).sessionId).toBe(id)
  })

  it('a Codex thread written in segments: the thread its metadata names, not the segment its file name ends with', async () => {
    // The real shape (a segment on this machine, 2026-10-26): the name is rollout-<time>-<thread>_<segment>,
    // the first line carries an ordinal and names the previous segment as its history base, and its id is the thread
    const d = join(dir, '.codex', 'sessions', '2026', '10', '26')
    mkdirSync(d, { recursive: true })
    const THREAD = '01a1250a-7662-7e30-a170-62f43cb935cc'
    const SEGMENT = '01a176d2-c733-7413-84b4-aea4e669827b'
    const at = '2026-10-26T06:08:07.476Z'
    const f = join(d, `rollout-2026-10-26T14-08-07-${THREAD}_${SEGMENT}.jsonl`)
    writeFileSync(f, [
      JSON.stringify({ timestamp: at, ordinal: 18569, type: 'session_meta', payload: {
        session_id: THREAD, id: THREAD, timestamp: at, cwd: proj, source: 'vscode', thread_source: 'user', history_mode: 'paginated',
        history_base: { thread_id: '01a138bf-4f23-7311-a898-d0b667e66cfa', end_ordinal_exclusive: 18569, end_byte_offset: 3344192094 }
      } }),
      JSON.stringify({ timestamp: at, ordinal: 18570, type: 'event_msg', payload: { type: 'item_completed', thread_id: THREAD, turn_id: 'u',
        item: { type: 'UserMessage', id: 'i', content: [{ type: 'text', text: 'a question in a later segment', text_elements: [] }] },
        started_at_ms: 1, completed_at_ms: 1 } })
    ].join('\n') + '\n')
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), f)).sessionId).toBe(THREAD)
  })

  it('a cold rollout: the same id as its plain twin, read from the compressed record', async () => {
    const id = '019f0000-eeee-7000-8000-000000000072'
    const plain = mkCodexRollout('rollout-warm-019f072.jsonl', proj, '2026-07-30T03:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000, 'a cold question', { id })
    const cold = join(dir, '.codex', 'sessions', '2026', '07', '30', 'rollout-cold-019f073.jsonl.zst')
    writeFileSync(cold, zstdCompressSync(readFileSync(plain)))
    rmSync(plain)
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), cold)).sessionId).toBe(id)
  })

  it('a Codex record whose session metadata carries no id: no session ID (US-001/AC-09)', async () => {
    const f = mkCodexRollout('rollout-noid-019f074.jsonl', proj, '2026-07-30T03:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000, 'a question with no id')
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), f)).sessionId).toBeNull()
  })

  it('a Grok session: the name of the session\'s directory', async () => {
    const id = '019fd1e2-1042-7c12-94e9-15b9d0ad23ec'
    mkdirSync(join(dir, '.grok'), { recursive: true })
    writeFileSync(join(dir, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
    const f = mkGrokSession(proj, id, [grokUser(1785400000, 'a grok question', 0)])
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), f)).sessionId).toBe(id)
  })
})

// token-stats, Scans and the window, failure modes: "A panic in the engine module is caught where it crosses into the
// application. One raised while a file is parsed is that file's failed read, under the rule its side has for a read
// that fails ... and the scan goes on." Driven through the panic seam, which the tests' module is built with.
describe('a panic in the engine module while a session file is parsed', () => {
  const seam = (): PanicSeam => loadEngineModule(TEST_ENGINE) as PanicSeam
  const shape = (r: TokenBuildResult): unknown => ({ global: r.global, rows: r.rows, perProject: [...r.perProject], sessionFiles: [...r.sessionFiles] })
  afterEach(() => {
    seam().seamPanicWhileParsing(null)
  })

  it('is that Claude Code session\'s failed read: it is skipped as an unreadable one is, every other file is parsed, and the scan delivers its figures', async () => {
    const named = mkClaudeFile('panic.jsonl', [userLine('a question in the file that panics'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 40, 4, { id: 'mp', requestId: 'rp' })])
    mkClaudeFile('other.jsonl', [userLine('a question in the other file'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 70, 7, { id: 'mo', requestId: 'ro' })])
    seam().seamPanicWhileParsing(named)
    const panicked = await new TokenEngine(join(dir, 'cache-panic'), TEST_ENGINE).build(roots(), [proj])
    seam().seamPanicWhileParsing(null)
    expect(panicked.global.bySide.claude.total).toBe(77)
    chmodSync(named, 0)
    try {
      expect(shape(panicked)).toEqual(shape(await new TokenEngine(join(dir, 'cache-unreadable'), TEST_ENGINE).build(roots(), [proj])))
    } finally {
      chmodSync(named, 0o644)
    }
    // As for an unreadable file, nothing is kept for it: the next build parses it
    expect((await new TokenEngine(join(dir, 'cache-panic'), TEST_ENGINE).build(roots(), [proj])).global.bySide.claude.total).toBe(77 + 44)
  })

  it('is that rollout\'s failed read: it is skipped as an unreadable one is, every other rollout is parsed, and the scan delivers its figures', async () => {
    const named = mkCodexRollout('rollout-panic-019f500.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 40, cached: 0, output: 4 }])
    mkCodexRollout('rollout-other-019f501.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [{ input: 70, cached: 0, output: 7 }])
    seam().seamPanicWhileParsing(named)
    const panicked = await new TokenEngine(join(dir, 'cache-panic'), TEST_ENGINE).build(roots(), [proj])
    seam().seamPanicWhileParsing(null)
    expect(panicked.global.bySide.codex.total).toBe(77)
    chmodSync(named, 0)
    try {
      expect(shape(panicked)).toEqual(shape(await new TokenEngine(join(dir, 'cache-unreadable'), TEST_ENGINE).build(roots(), [proj])))
    } finally {
      chmodSync(named, 0o644)
    }
    // As for an unreadable file, nothing is kept for it: the next build parses it
    expect((await new TokenEngine(join(dir, 'cache-panic'), TEST_ENGINE).build(roots(), [proj])).global.bySide.codex.total).toBe(77 + 44)
  })
})

describe('a panic in the engine module while a Grok session is parsed', () => {
  const seam = (): PanicSeam => loadEngineModule(TEST_ENGINE) as PanicSeam
  afterEach(() => {
    seam().seamPanicWhileParsing(null)
  })

  it('is that session\'s failed read: it contributes nothing, as a session missing its update stream does (F6), every other session is parsed, and the scan delivers its figures', async () => {
    mkdirSync(join(dir, '.grok'), { recursive: true })
    writeFileSync(join(dir, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
    const named = mkGrokSession(proj, '019f-panic', [grokUser(1786088600, 'the named question', 0), grokTurn(1786088610, { input: 40, output: 4 })])
    mkGrokSession(proj, '019f-other', [grokUser(1786088600, 'the other question', 0), grokTurn(1786088610, { input: 70, output: 7 })])
    const shape = (r: TokenBuildResult): unknown => ({ global: r.global, rows: r.rows, perProject: [...r.perProject], sessionFiles: [...r.sessionFiles] })
    seam().seamPanicWhileParsing(named)
    const panicked = await new TokenEngine(join(dir, 'cache-panic'), TEST_ENGINE).build(roots(), [proj])
    seam().seamPanicWhileParsing(null)
    expect(panicked.global.bySide.grok.total).toBe(77)
    expect(panicked.perProject.get(proj.toLowerCase())?.sessions.map((x) => x.title)).toEqual(['the other question'])
    const aside = join(dir, 'aside.jsonl')
    renameSync(named, aside)
    try {
      expect(shape(panicked)).toEqual(shape(await new TokenEngine(join(dir, 'cache-missing'), TEST_ENGINE).build(roots(), [proj])))
    } finally {
      renameSync(aside, named)
    }
    // Nothing is kept for it: the next build parses it
    expect((await new TokenEngine(join(dir, 'cache-panic'), TEST_ENGINE).build(roots(), [proj])).global.bySide.grok.total).toBe(77 + 44)
  })
})

// token-stats, Implementation Decisions, The engine module: "A line is decoded as UTF-8, an invalid sequence becoming
// U+FFFD, and read by the grammar of ECMAScript's JSON.parse, with its results". One rollout per clause, parsed through
// the module. Until the TypeScript Codex parser was removed (#427), the cases for the clauses and for timestamps were
// also held, field for field, to the entry it gave for the same file, and the values they expect are the ones both
// gave. The case across the module's reads came after; its last line follows the module's own rule, that a rollout line
// counts once its line feed is written (Implementation Decisions, Cache), where the TypeScript parser counted it.
describe('how a rollout line is read', () => {
  const AT = '2026-07-30T10:00:00.000Z'
  const REPLACEMENT = String.fromCharCode(0xfffd)
  /** A usage record as Codex writes one, its usage the response's own */
  const record = (id: string, input: number | string, output: number, extra: Record<string, unknown> = {}): string =>
    `{"timestamp":"${AT}","type":"token_usage_record","payload":{"response_id":"${id}","usage":{"input_tokens":${input},"cached_input_tokens":0,"output_tokens":${output}}${Object.entries(extra).map(([k, v]) => `,"${k}":${JSON.stringify(v)}`).join('')}}}`
  const question = (message: string): string => JSON.stringify({ timestamp: AT, type: 'event_msg', payload: { type: 'user_message', message } })

  /** A rollout of `lines`, each a line's text or its raw bytes, every one ending with a line feed */
  function rollout(lines: Array<string | Buffer>): string {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const f = join(d, 'rollout-2026-07-30T10-00-00-019f0000-eeee-7000-8000-000000000001.jsonl')
    writeFileSync(f, Buffer.concat(lines.flatMap((l) => [typeof l === 'string' ? Buffer.from(l) : l, Buffer.from('\n')])))
    return f
  }

  /** The entry a parse gives the rollout */
  async function entryOf(file: string): Promise<NonNullable<ParseResult>> {
    const job: ParseJob = {
      kind: 'codex',
      file,
      projectKey: 'p',
      meta: { subagent: false, sessionId: 'sid', parentId: null, forkedAt: null, paginated: true },
      threadName: undefined
    }
    const parsed = await runParseJob(job)
    if (parsed?.agg.kind !== 'codex') throw new Error('no Codex entry')
    return parsed
  }
  const eventsOf = (r: NonNullable<ParseResult>): unknown => (r.agg.kind === 'codex' ? r.agg.events : null)

  it('as UTF-8 with U+FFFD for each maximal invalid subpart, a line with an invalid byte outside a string being a bad line', async () => {
    const bytes = (...b: number[]): Buffer => Buffer.from(b)
    const [head, tail] = record('r1', 100, 10).split('"usage"')
    const f = rollout([
      // c FF a E2 82 b C0 80 c ED A0 80 d F4 90 80 80 e: one, one, two, three and four replacements
      Buffer.concat([
        Buffer.from(`{"timestamp":"${AT}","type":"event_msg","payload":{"type":"user_message","message":"c`),
        bytes(0xff), Buffer.from('a'), bytes(0xe2, 0x82), Buffer.from('b'), bytes(0xc0, 0x80), Buffer.from('c'),
        bytes(0xed, 0xa0, 0x80), Buffer.from('d'), bytes(0xf4, 0x90, 0x80, 0x80), Buffer.from('e"}}')
      ]),
      // Invalid bytes in a value no rule reads leave the line readable
      Buffer.concat([Buffer.from(`${head}"note":"`), bytes(0xff, 0xfe), Buffer.from(`","usage"${tail}`)]),
      // Outside a string a replacement character is no token, and the line is refused
      Buffer.concat([Buffer.from(`{"timestamp":"${AT}",`), bytes(0xff), Buffer.from(record('r2', 999, 9).slice(1))])
    ])
    const entry = await entryOf(f)
    const R = REPLACEMENT
    expect(entry.agg.title).toBe(`c${R}a${R}b${R}${R}c${R}${R}${R}d${R}${R}${R}${R}e`)
    expect(entry.agg.questions).toHaveLength(1)
    expect(eventsOf(entry)).toEqual([[Date.UTC(2026, 6, 30, 10), 100, 0, 10, 0]])
  })

  it('by JSON.parse\'s grammar: a line it refuses is a bad line (A8), and a line it takes counts however unusual, nested deeper than any fixed limit included', async () => {
    const BS = String.fromCharCode(0x5c)
    const at = Date.UTC(2026, 6, 30, 10)
    const good = [
      // 5,000 levels deep in a value no rule reads
      record('v1', 7, 1).replace('"usage"', `"deep":${'['.repeat(5000)}${']'.repeat(5000)},"usage"`),
      // Tabs, spaces and a carriage return between tokens; numbers in exponent form
      `{ "timestamp" :\t"${AT}" , "type" : "token_usage_record" , "payload" : { "response_id" : "v2" , "usage" : { "input_tokens" : 1E2 , "cached_input_tokens" : 0.5e1 , "output_tokens" : 3 } } }\r`,
      // A key and a value spelled with escapes
      record('v3', 2, 2).replace('"type":"token_usage_record"', `"t${BS}u0079pe":"token_usage_r${BS}u0065cord"`),
      // A raw U+2028 in a string, and an id spelled with an escaped solidus, which is the same id as the next line's
      record(`a${BS}/b`, 4, 4, { note: `x${String.fromCharCode(0x2028)}y` }),
      record('a/b', 50, 50)
    ]
    // Each carries usage that must not count
    const refused = [
      record('b1', 1001, 1).replace('"output_tokens":1}', '"output_tokens":1,}'),
      record(`b2${String.fromCharCode(9)}tab`, 1002, 1),
      record('b3', 1003, 1, { note: 'x' }).replace('"x"', `"${BS}x41"`),
      `${String.fromCharCode(0xfeff)}${record('b4', 1004, 1)}`,
      `${record('b5', 1005, 1)} x`,
      record('b6', '01', 1),
      record('b7', '+1', 1),
      record('b8', '1.', 1),
      record('b9', '.5', 1),
      record('b10', 'NaN', 1),
      record('b11', 1011, 1).replace('"b11"', `"${BS}ud8"`),
      record('b12', 1012, 1).replace('"response_id"', '\'response_id\''),
      record('b13', 1013, 1).slice(0, -1)
    ]
    const lines = [...good, ...refused]
    const f = rollout(lines)
    const entry = await entryOf(f)
    expect(eventsOf(entry)).toEqual([
      [at, 7, 0, 1, 0],
      [at, 100, 5, 3, 0],
      [at, 2, 0, 2, 0],
      [at, 4, 0, 4, 0]
    ])
    // The parse stopped at the end of the last line that parsed: what the refused lines hold is read again next time
    expect(entry.state?.cursor).toBe(Buffer.byteLength(good.map((l) => `${l}\n`).join('')))
  })

  it('with a repeated key keeping its last value, at the place the key first held', async () => {
    const usage = '{"input_tokens":10,"cached_input_tokens":0,"output_tokens":1}'
    const f = rollout([
      `{"timestamp":"${AT}","type":"event_msg","type":"turn_context","payload":{"model":"first","model":"second"}}`,
      `{"timestamp":"${AT}","type":"event_msg","payload":{"type":"user_message","message":"lost"},"payload":{"type":"user_message","message":"kept question"}}`,
      `{"timestamp":"${AT}","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":${usage},"total_token_usage":{"output_tokens":9,"input_tokens":1,"input_tokens":10,"cached_input_tokens":0,"total_tokens":11,"output_tokens":1}}}}`,
      // The second payload replaces the first whole: no usage is left to count
      `{"timestamp":"${AT}","type":"token_usage_record","payload":{"response_id":"d1","usage":${usage}},"payload":{"response_id":"d2"}}`,
      `{"timestamp":"${AT}","type":"token_usage_record","payload":{"response_id":"d3","usage":{"input_tokens":1,"input_tokens":30,"cached_input_tokens":0,"output_tokens":3}}}`
    ])
    const entry = await entryOf(f)
    const at = Date.UTC(2026, 6, 30, 10)
    if (entry.agg.kind !== 'codex') throw new Error('no Codex entry')
    expect(entry.agg.model).toBe('second')
    expect(entry.agg.title).toBe('kept question')
    expect(entry.agg.events).toEqual([[at, 10, 0, 1, 0], [at, 30, 0, 3, 0]])
    expect(entry.state?.seenResponses).toEqual(['d2', 'd3'])
    const total = entry.state?.prevTotal
    expect(total).toEqual({ output_tokens: 1, input_tokens: 10, cached_input_tokens: 0, total_tokens: 11 })
    expect(Object.keys(total ?? {})).toEqual(['output_tokens', 'input_tokens', 'cached_input_tokens', 'total_tokens'])
    expect(entry.state?.prevTotalKey).toBe('10|0|1|11')
  })

  it('with a number beyond the double range infinite and so no finite count, and a negative zero kept', async () => {
    const event = (info: string): string => `{"timestamp":"${AT}","type":"event_msg","payload":{"type":"token_count","info":${info}}}`
    const f = rollout([
      event('{"last_token_usage":{"input_tokens":1e400,"cached_input_tokens":0,"output_tokens":5},"total_token_usage":{"input_tokens":1e400,"cached_input_tokens":-0,"output_tokens":5,"total_tokens":5}}'),
      // No per-turn figure: the increment is the difference of the running totals, an infinite one counting as 0
      event('{"total_token_usage":{"input_tokens":100,"cached_input_tokens":1e-7,"output_tokens":1e-400,"total_tokens":1e21}}'),
      record('n1', '-0', 7),
      record('n2', '1e400', 0)
    ])
    const entry = await entryOf(f)
    const at = Date.UTC(2026, 6, 30, 10)
    expect(eventsOf(entry)).toEqual([[at, 0, 0, 5, 0], [at, 100, 1e-7, 0, 0], [at, -0, 0, 7, 0]])
    expect(entry.state?.prevTotal).toEqual({ input_tokens: 100, cached_input_tokens: 1e-7, output_tokens: 0, total_tokens: 1e21 })
    // String() of each running field, as JavaScript writes the number
    expect(entry.state?.prevTotalKey).toBe('100|1e-7|0|1e+21')
  })

  it('with a lone surrogate escape staying that code unit, in text, in a model and in a response id', async () => {
    const [high, low] = [String.fromCharCode(0xd800), String.fromCharCode(0xdc00)]
    const f = rollout([
      JSON.stringify({ timestamp: AT, type: 'turn_context', payload: { model: `gpt${low}` } }),
      // 59 letters, the lone surrogate, then two more: the title is clipped after the surrogate, a code point of its own
      question(`${'a'.repeat(59)}${high}bc`),
      JSON.stringify({ timestamp: AT, type: 'token_usage_record', payload: { response_id: high, usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } } }),
      JSON.stringify({ timestamp: AT, type: 'token_usage_record', payload: { response_id: high, usage: { input_tokens: 9, cached_input_tokens: 0, output_tokens: 9 } } }),
      JSON.stringify({ timestamp: AT, type: 'token_usage_record', payload: { response_id: `${high}${low}`, usage: { input_tokens: 2, cached_input_tokens: 0, output_tokens: 2 } } })
    ])
    const entry = await entryOf(f)
    if (entry.agg.kind !== 'codex') throw new Error('no Codex entry')
    expect(entry.agg.model).toBe(`gpt${low}`)
    expect(entry.agg.title).toBe(`${'a'.repeat(59)}${high}${String.fromCharCode(0x2026)}`)
    expect(entry.state?.seenResponses).toEqual([high, `${high}${low}`])
    expect(entry.agg.events.map((e) => e[1])).toEqual([1, 2])
  })

  it('across the module\'s 1 MB reads: a line several reads long, lines and multibyte text across a read\'s end, a bad line, lines that are no object, and a last line not read until its line feed is written', async () => {
    const MB = 1024 * 1024
    const lines: string[] = []
    /** Where the next line starts */
    let size = 0
    const add = (line: string): number => {
      const start = size
      lines.push(line)
      size += Buffer.byteLength(line) + 1
      return start
    }
    let responses = 0
    /** A usage record whose input is its place among the records, with `pad` in a value no rule reads */
    const padded = (pad: string): string => record(`r${responses + 1}`, ++responses, 1, { pad })
    // Three-byte characters, written by code point as the working language asks (ADR-0017): U+4E2D, and the question's
    // first, second and pair-opening characters
    const [han, first, second, pairOpening] = [0x4e2d, 0x554f, 0x984c, 0x8cea].map((c) => String.fromCharCode(c))
    const pair = `${pairOpening}${first}`
    // Lines of many lengths before the first read's end, three- and four-byte characters among them
    for (let k = 0; size < MB - 8000; k++) add(padded(`${han}${String.fromCodePoint(0x1f600)}a`.repeat(40 + ((k * 37) % 600))))
    // One line placed to end just before the question, so that the first read ends one byte into the question's first
    // character, a three-byte one
    const text = `${first}${second} ${String.fromCodePoint(0x1f600)} ${pair.repeat(30)}`
    const questionLine = question(text)
    const into = Buffer.byteLength(questionLine.slice(0, questionLine.indexOf(first))) + 1
    const fillerStart = size
    const bare = Buffer.byteLength(record(`r${responses + 1}`, responses + 1, 1, { pad: '' }))
    add(padded('x'.repeat(MB - into - fillerStart - 1 - bare)))
    const qStart = add(questionLine)
    const qEnd = size
    // A line several reads long
    const longStart = add(padded('y'.repeat(2 * MB + MB / 2)))
    const longEnd = size
    add(`{"timestamp":"${AT}","type":"token_usage_record","payload":{"response_id":"bad","usage":{"input_tokens":999999`)
    add('[1,2,3]')
    add('42')
    for (let k = 0; k < 400; k++) add(padded('é'.repeat(100 + ((k * 53) % 900))))
    const last = padded('end')
    lines.push(last)
    const total = size + Buffer.byteLength(last)
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const f = join(d, 'rollout-2026-07-30T10-00-00-019f0000-eeee-7000-8000-000000000002.jsonl')
    writeFileSync(f, lines.join('\n'))
    // The premises: the first read ends inside the question's first character, a byte that continues it, and one line
    // is longer than two reads
    const bytes = readFileSync(f)
    expect(qStart + into).toBe(MB)
    expect([bytes[MB - 1] >= 0xe0, bytes[MB] >= 0x80 && bytes[MB] < 0xc0]).toEqual([true, true])
    expect(longEnd - longStart).toBeGreaterThan(2 * MB)
    expect(bytes.length).toBe(total)

    const entry = await entryOf(f)
    if (entry.agg.kind !== 'codex') throw new Error('no Codex entry')
    const at = Date.UTC(2026, 6, 30, 10)
    // Every record but the last, whose line feed is not written yet: Codex ends every line with one (B12), so that line
    // is still being written, and the parse stops before it to read it whole next time
    expect(entry.agg.events).toEqual(Array.from({ length: responses - 1 }, (_, i) => [at, i + 1, 0, 1, 0]))
    expect(entry.agg.questions.map((q) => [q[0], q[1], q[2]])).toEqual([[qStart, qEnd, size]])
    // 60 code points: the question's first five (two characters, a space, the emoji and a space), then 27 pairs and one
    // more, the emoji's surrogate pair counting once
    expect(entry.agg.title).toBe(`${first}${second} ${String.fromCodePoint(0x1f600)} ${pair.repeat(27)}${pairOpening}${String.fromCharCode(0x2026)}`)
    expect(entry.state?.cursor).toBe(size)
    // With its line feed written the line counts, and the parse ends at the end of the file
    appendFileSync(f, '\n')
    const whole = await entryOf(f)
    expect(whole.agg.kind === 'codex' && whole.agg.events.length).toBe(responses)
    expect(whole.state?.cursor).toBe(total + 1)
  })

  it('with a timestamp outside the form Codex writes read as Date.parse reads it', async () => {
    const at = (timestamp: string, id: string): string => JSON.stringify({ timestamp, type: 'token_usage_record', payload: { response_id: id, usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } } })
    const f = rollout([
      at('2026-07-30T10:00:00+08:00', 't1'),
      at('2026-07-30', 't2'),
      at('2026-07-30T10:00:00.123456Z', 't3'),
      // Read by V8 as the second of March
      at('2026-02-30T00:00:00.000Z', 't4'),
      at('not a time', 't5')
    ])
    const entry = await entryOf(f)
    expect((eventsOf(entry) as unknown[][]).map((e) => e[0])).toEqual([1785376800000, 1785369600000, 1785405600123, 1772409600000, null])
    expect(entry.agg.at).toBe(1785405600123)
  })
})

// The same clauses for a Claude Code session file (#428), one file per clause, parsed through the module, and the
// rules a Claude line adds: a value of another kind than a rule takes, a last line without its line feed, the time
// taken from the file when no line has one, and the local day a usage line is filed under. Until the TypeScript Claude
// parser was removed (#428), each case also held the module's entry to the one that parser gave for the same file,
// field for field, and the values they expect are the ones both gave; the local days were held in every time zone the
// case sets.
describe('how a Claude Code session line is read', () => {
  const AT = '2026-07-30T10:00:00.000Z'
  const REPLACEMENT = String.fromCharCode(0xfffd)
  /** A usage line with the keys the rules read, in the order Claude Code writes them, its uuid chain left out: no case
   * here reads the walk-back. The whole shape Claude Code writes now is the case on its iterations. */
  const usage = (id: string, input: number | string, output: number, extra: Record<string, unknown> = {}): string =>
    `{"isSidechain":false,"message":{"model":"claude-opus-5","id":"${id}","type":"message","role":"assistant","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":${input},"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":${output}}},"requestId":"req_${id}","type":"assistant","timestamp":"${AT}"${Object.entries(extra).map(([k, v]) => `,"${k}":${JSON.stringify(v)}`).join('')}}`
  const question = (content: unknown): string => JSON.stringify({ isSidechain: false, type: 'user', message: { role: 'user', content }, timestamp: AT })
  /** A line of `fields`, an assistant's unless they say otherwise */
  const line = (fields: Record<string, unknown>): string => JSON.stringify({ type: 'assistant', timestamp: AT, ...fields })

  /** A session file of `lines`, each a line's text or its raw bytes, every one ending with a line feed */
  function session(lines: Array<string | Buffer>): string {
    const f = join(dir, '.claude', 'projects', encodeClaudeProjectDir(proj), 'line-cases.jsonl')
    mkdirSync(join(f, '..'), { recursive: true })
    writeFileSync(f, Buffer.concat(lines.flatMap((l) => [typeof l === 'string' ? Buffer.from(l) : l, Buffer.from('\n')])))
    return f
  }

  type ClaudeAgg = Extract<NonNullable<ParseResult>['agg'], { kind: 'claude' }>
  /** The entry a parse gives the file */
  async function entryOf(file: string): Promise<ClaudeAgg> {
    const parsed = await runParseJob({ kind: 'claude', file, projectKey: 'p', listed: true })
    if (parsed?.agg.kind !== 'claude') throw new Error('no Claude entry')
    return parsed.agg
  }
  /** Each entry without its day, which is the time zone's: the case on local days holds it */
  const figures = (a: ClaudeAgg): unknown[] => a.entries.map((e) => e.slice(0, 8))

  it('takes a usage line in the shape Claude Code writes now by its own figures, never by the iterations it lists, which repeat their names (A9)', async () => {
    // The shape of a real line (2026-11-15), its values changed: of 322,852 usage lines on this machine 269,590 carry an
    // iterations array, its elements repeating the line's figure names (773 a model too), and on 61 the last iteration's
    // figures are not the line's own. The first line is one of those 61: zeros at the top, its cache write in the
    // breakdown alone
    const real = (id: string, top: Record<string, unknown>, iterations: Array<Record<string, unknown>>): string =>
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        message: {
          model: 'claude-opus-5',
          id,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          stop_details: null,
          usage: {
            ...top,
            server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
            service_tier: 'standard',
            inference_geo: 'not_available',
            iterations,
            speed: 'standard'
          },
          diagnostics: null
        },
        requestId: `req_${id}`,
        type: 'assistant',
        uuid: `u-${id}`,
        timestamp: AT,
        sessionId: 's',
        version: '2.1.0',
        gitBranch: 'main'
      })
    const figure = (input: number, output: number, read: number, flat: number, fiveMinutes: number, oneHour: number): Record<string, unknown> => ({
      input_tokens: input,
      cache_creation_input_tokens: flat,
      cache_read_input_tokens: read,
      output_tokens: output,
      cache_creation: { ephemeral_1h_input_tokens: oneHour, ephemeral_5m_input_tokens: fiveMinutes }
    })
    const f = session([
      real('r1', figure(0, 0, 0, 0, 0, 447), [{ ...figure(175, 401, 999027, 447, 0, 447), type: 'message' }]),
      real('r2', { ...figure(12, 34, 56, 78, 0, 0), output_tokens_details: { thinking_tokens: 9 } }, [
        { ...figure(1, 2, 3, 4, 5, 6), type: 'message', model: 'claude-haiku-5' },
        { ...figure(7, 8, 9, 10, 11, 12), type: 'message', model: 'claude-haiku-5' }
      ])
    ])
    const a = await entryOf(f)
    expect(figures(a)).toEqual([
      ['r1', 'req_r1', 0, 0, 0, 0, 447, 'claude-opus-5'],
      ['r2', 'req_r2', 0, 12, 34, 56, 0, 'claude-opus-5']
    ])
  })

  it('as UTF-8 with U+FFFD for each maximal invalid subpart, a line with an invalid byte outside a string being a bad line', async () => {
    const bytes = (...b: number[]): Buffer => Buffer.from(b)
    const [head, tail] = usage('m1', 100, 10).split('"usage"')
    const f = session([
      // c FF a E2 82 b C0 80 c ED A0 80 d F4 90 80 80 e: one, one, two, three and four replacements
      Buffer.concat([
        Buffer.from('{"isSidechain":false,"type":"user","message":{"role":"user","content":"c'),
        bytes(0xff), Buffer.from('a'), bytes(0xe2, 0x82), Buffer.from('b'), bytes(0xc0, 0x80), Buffer.from('c'),
        bytes(0xed, 0xa0, 0x80), Buffer.from('d'), bytes(0xf4, 0x90, 0x80, 0x80), Buffer.from(`e"},"timestamp":"${AT}"}`)
      ]),
      // Invalid bytes in a value no rule reads leave the line readable
      Buffer.concat([Buffer.from(`${head}"note":"`), bytes(0xff, 0xfe), Buffer.from(`","usage"${tail}`)]),
      // Outside a string a replacement character is no token, and the line is refused
      Buffer.concat([Buffer.from('{"isSidechain":false,'), bytes(0xff), Buffer.from(usage('m2', 999, 9).slice(1))])
    ])
    const a = await entryOf(f)
    const R = REPLACEMENT
    expect(a.title).toBe(`c${R}a${R}b${R}${R}c${R}${R}${R}d${R}${R}${R}${R}e`)
    expect(a.questions).toHaveLength(1)
    expect(figures(a)).toEqual([['m1', 'req_m1', 0, 100, 10, 0, 0, 'claude-opus-5']])
  })

  it('by JSON.parse\'s grammar: a line it refuses is a bad line (A8), and a line it takes counts however unusual, nested deeper than any fixed limit included', async () => {
    const BS = String.fromCharCode(0x5c)
    const good = [
      // 5,000 levels deep in a value no rule reads
      usage('v1', 7, 1).replace('"requestId"', `"deep":${'['.repeat(5000)}${']'.repeat(5000)},"requestId"`),
      // Tabs, spaces and a carriage return between tokens; numbers in exponent form; no request id and no model
      `{ "isSidechain" : false , "message" : { "id" : "v2" , "usage" : { "input_tokens" : 1E2 , "cache_read_input_tokens" : 0.5e1 , "output_tokens" : 3 } } , "type" :\t"assistant" , "timestamp" : "${AT}" }\r`,
      // A key and a value spelled with escapes
      usage('v3', 2, 2).replace('"message"', `"m${BS}u0065ssage"`).replace('"id":"v3"', `"id":"v${BS}u0033"`),
      // A raw U+2028 in a string, and an id spelled with an escaped solidus
      usage(`a${BS}/b`, 4, 4, { note: `x${String.fromCharCode(0x2028)}y` })
    ]
    // Each carries usage that must not count
    const refused = [
      usage('b1', 1001, 1).replace('"output_tokens":1}', '"output_tokens":1,}'),
      usage(`b2${String.fromCharCode(9)}tab`, 1002, 1),
      usage('b3', 1003, 1, { note: 'x' }).replace('"x"', `"${BS}x41"`),
      `${String.fromCharCode(0xfeff)}${usage('b4', 1004, 1)}`,
      `${usage('b5', 1005, 1)} x`,
      usage('b6', '01', 1),
      usage('b7', '+1', 1),
      usage('b8', '1.', 1),
      usage('b9', '.5', 1),
      usage('b10', 'NaN', 1),
      usage('b11', 1011, 1).replace('"id":"b11"', `"id":"${BS}ud8"`),
      usage('b12', 1012, 1).replace('"requestId"', '\'requestId\''),
      usage('b13', 1013, 1).slice(0, -1)
    ]
    // An array is a line that parsed, and its bytes join the last turn; a number is no line the parse is given
    const lines = [question('a question over unusual lines'), ...good, ...refused, '[1,2,3]', '42']
    const f = session(lines)
    const a = await entryOf(f)
    expect(figures(a)).toEqual([
      ['v1', 'req_v1', 0, 7, 1, 0, 0, 'claude-opus-5'],
      ['v2', null, 0, 100, 3, 5, 0, null],
      ['v3', 'req_v3', 0, 2, 2, 0, 0, 'claude-opus-5'],
      ['a/b', 'req_a/b', 0, 4, 4, 0, 0, 'claude-opus-5']
    ])
    expect(a.questions.map((q) => q[2])).toEqual([statSync(f).size - Buffer.byteLength('42\n')])
  })

  it('with a repeated key keeping its last value', async () => {
    const f = session([
      `{"type":"assistant","type":"user","isSidechain":true,"isSidechain":false,"message":{"role":"user","content":"lost"},"message":{"role":"user","content":"kept question"},"timestamp":"${AT}"}`,
      // The second message replaces the first whole: no usage is left to count
      `{"type":"assistant","message":{"id":"d1","usage":{"input_tokens":10,"output_tokens":1}},"message":{"id":"d2"},"timestamp":"${AT}"}`,
      `{"type":"assistant","isSidechain":true,"isSidechain":false,"requestId":"r1","requestId":"r2","message":{"model":"first","model":"second","id":"d3","id":"d4","usage":{"input_tokens":1,"input_tokens":30,"output_tokens":3,"cache_creation":{"ephemeral_5m_input_tokens":4,"ephemeral_1h_input_tokens":5},"cache_creation":null,"cache_creation_input_tokens":6}},"timestamp":"${AT}"}`,
      `{"type":"assistant","isSidechain":false,"isSidechain":true,"message":{"id":"d5","usage":{"input_tokens":1,"output_tokens":1,"cache_creation_input_tokens":99,"cache_creation":{"ephemeral_5m_input_tokens":4,"ephemeral_5m_input_tokens":40,"ephemeral_1h_input_tokens":2}}},"timestamp":"${AT}"}`
    ])
    const a = await entryOf(f)
    expect(a.title).toBe('kept question')
    expect(figures(a)).toEqual([
      ['d4', 'r2', 0, 30, 3, 0, 6, 'second'],
      ['d5', null, 1, 1, 1, 0, 42, null]
    ])
  })

  it('with a number beyond the double range infinite and so no finite count, and a negative zero kept', async () => {
    const f = session([
      line({ message: { id: 'n1', usage: {} } }).replace('"usage":{}', '"usage":{"input_tokens":1e400,"output_tokens":-0,"cache_read_input_tokens":1e-400,"cache_creation_input_tokens":1e21}'),
      line({ message: { id: 'n2', usage: {} } }).replace('"usage":{}', '"usage":{"input_tokens":-1e400,"output_tokens":5,"cache_creation":{"ephemeral_5m_input_tokens":1e400,"ephemeral_1h_input_tokens":7}}'),
      line({ message: { id: 'n3', usage: {} } }).replace('"usage":{}', '"usage":{"input_tokens":-0,"output_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":-0,"ephemeral_1h_input_tokens":-0}}')
    ])
    const a = await entryOf(f)
    expect(figures(a)).toEqual([
      ['n1', null, 0, 0, -0, 0, 1e21, null],
      ['n2', null, 0, 0, 5, 0, 7, null],
      ['n3', null, 0, -0, 0, 0, -0, null]
    ])
  })

  it('with a lone surrogate escape staying that code unit, in text, in a model and in the ids', async () => {
    const [high, low] = [String.fromCharCode(0xd800), String.fromCharCode(0xdc00)]
    const f = session([
      // 59 letters, the lone surrogate, then two more: the title is clipped after the surrogate, a code point of its own
      question(`${'a'.repeat(59)}${high}bc`),
      line({ requestId: `${high}${low}`, message: { id: high, model: `claude${low}`, usage: { input_tokens: 1, output_tokens: 1 } } }),
      line({ requestId: low, message: { id: `${high}${low}`, usage: { input_tokens: 2, output_tokens: 2 } } })
    ])
    const a = await entryOf(f)
    expect(a.title).toBe(`${'a'.repeat(59)}${high}${String.fromCharCode(0x2026)}`)
    expect(figures(a)).toEqual([
      [high, `${high}${low}`, 0, 1, 1, 0, 0, `claude${low}`],
      [`${high}${low}`, low, 0, 2, 2, 0, 0, null]
    ])
  })

  it('with a value of another kind than a rule takes read as JavaScript reads it: undefined to the rule, and an array has none of an object\'s fields', async () => {
    const f = session([
      // A truthy usage that is no object counts, with no figure; a falsy one is no usage
      ...[5, 'x', [], true, {}].map((u, i) => line({ message: { id: `t${i}`, usage: u } })),
      ...[0, '', null, false].map((u, i) => line({ message: { id: `f${i}`, usage: u } })),
      // A message that is no object holds neither usage nor content
      line({ message: 'not a record' }),
      line({ message: [{ id: 'in an array', usage: { input_tokens: 9 } }] }),
      // A cache_creation that is an array is a breakdown with neither figure; one of another kind leaves the flat field
      line({ message: { id: 'c1', usage: { input_tokens: 1, cache_creation_input_tokens: 50, cache_creation: [] } } }),
      line({ message: { id: 'c2', usage: { input_tokens: 1, cache_creation_input_tokens: 50, cache_creation: 'x' } } }),
      line({ message: { id: 'c3', usage: { input_tokens: 1, cache_creation_input_tokens: 50, cache_creation: 0 } } }),
      // Ids, a model, a figure and the sidechain flag of another kind; an empty model is a model
      line({ isSidechain: 'true', requestId: 7, message: { id: 5, model: 9, usage: { output_tokens: '3', input_tokens: 2 } } }),
      line({ isSidechain: 1, message: { id: 's1', model: '', usage: { input_tokens: 1 } } }),
      // A timestamp that is no string gives no time and no day
      line({ timestamp: 1785405600000, message: { id: 'ts', usage: { input_tokens: 1 } } }),
      // Questions: content that is an object is none; an array's text segments, strings only, joined by a space
      line({ type: 'user', message: { content: { text: 'not a question' } } }),
      line({ type: 'user', message: { content: ['str', 1, null, ['text'], { type: 'text', text: 5 }, { text: '' }, { type: 'text', text: 'real' }, { type: 'image', text: 'question' }] } }),
      line({ type: 'user', message: [{ content: 'an array message' }] }),
      // A tool_use whose name is no string is a tool; a segment that is no object, or not a tool_use, is nothing
      line({ message: { content: [{ type: 'tool_use', name: 5 }, { type: 'tool_use', name: 'Agent' }, { type: 'tool_use' }, 'tool_use', { type: 'text', name: 'Task' }] } })
    ])
    const a = await entryOf(f)
    const zeros = (id: string): unknown[] => [id, null, 0, 0, 0, 0, 0, null]
    expect(figures(a)).toEqual([
      ...['t0', 't1', 't2', 't3', 't4'].map(zeros),
      ['c1', null, 0, 1, 0, 0, 0, null],
      ['c2', null, 0, 1, 0, 0, 50, null],
      ['c3', null, 0, 1, 0, 0, 50, null],
      [null, null, 0, 2, 0, 0, 0, null],
      ['s1', null, 0, 1, 0, 0, 0, ''],
      ['ts', null, 0, 1, 0, 0, 0, null]
    ])
    expect(a.entries.find((e) => e[0] === 'ts')?.[8]).toBeNull()
    expect(a.title).toBe('real question')
    expect(a.questions.map((q) => [q[4], q[5]])).toEqual([[2, 1]])
  })

  it('with a timestamp outside the form Claude Code writes read as Date.parse reads it', async () => {
    const stamped = (timestamp: string, id: string): string => line({ timestamp, message: { id, usage: { input_tokens: 1, output_tokens: 1 } } })
    const f = session([
      stamped('2026-07-30T10:00:00+08:00', 't1'),
      stamped('2026-07-30', 't2'),
      stamped('2026-07-30T10:00:00.123456Z', 't3'),
      // Read by V8 as the second of March
      stamped('2026-02-30T00:00:00.000Z', 't4'),
      stamped('not a time', 't5')
    ])
    const a = await entryOf(f)
    expect(a.at).toBe(1785405600123)
    expect(a.entries.map((e) => e[8] === null)).toEqual([false, false, false, false, true])
  })

  it('files a usage line under its local day, in the time zone the app runs in, the year written as String writes it', async () => {
    const f = session(
      ['2026-07-29T16:30:00.000Z', '0005-07-01T12:00:00.000Z', '+012345-03-04T12:00:00.000Z', '-000001-12-31T12:00:00.000Z'].map((timestamp, i) =>
        line({ timestamp, message: { id: `z${i}`, usage: { input_tokens: 1 } } })
      )
    )
    const days = async (tz: string): Promise<unknown[]> => {
      process.env['TZ'] = tz
      return (await entryOf(f)).entries.map((e) => e[8])
    }
    const was = process.env['TZ']
    try {
      expect(await days('UTC')).toEqual(['2026-07-29', '5-07-01', '12345-03-04', '-1-12-31'])
      expect((await days('Asia/Shanghai'))[0]).toBe('2026-07-30')
      expect((await days('America/Los_Angeles'))[0]).toBe('2026-07-29')
    } finally {
      if (was === undefined) delete process.env['TZ']
      else process.env['TZ'] = was
    }
  })

  it('reads a last line no line feed ends, as a Claude Code session is parsed whole and a line that parses counts', async () => {
    const f = session([question('the first question')])
    appendFileSync(f, usage('m1', 10, 1))
    const a = await entryOf(f)
    expect(figures(a)).toEqual([['m1', 'req_m1', 0, 10, 1, 0, 0, 'claude-opus-5']])
    expect(a.questions.map((q) => q[2])).toEqual([statSync(f).size])
  })

  it('with no timestamp in the file, takes the file\'s modification time, to the fraction of a millisecond Node reads it to', async () => {
    const f = session([JSON.stringify({ type: 'user', message: { content: 'a question with no time' } })])
    utimesSync(f, 1000.25, 1785405600.123456)
    const a = await entryOf(f)
    expect(a.at).toBe(statSync(f).mtimeMs)
    expect(Number.isInteger(a.at)).toBe(false)
  })
})

// token-stats Sequence F and session-view G1–G2 through the engine module, and the clauses of token-stats,
// Implementation Decisions, The engine module ("read by the grammar of ECMAScript's JSON.parse, with its results"), one
// Grok stream per clause. Until the TypeScript Grok parser was removed (#429), each entry was also held, field for field,
// to the one it gave for the same file (`firstDifference`), and the values every case expects are the ones both gave.
describe('how a Grok stream line is read', () => {
  /** A session directory holding `lines`, each a line's text or its raw bytes, joined by line feeds and ended by `end` */
  function stream(id: string, lines: Array<string | Buffer>, o: { end?: string; summary?: string | Buffer } = {}): string {
    const d = join(dir, '.grok', 'sessions', encodeURIComponent(proj), id)
    mkdirSync(d, { recursive: true })
    if (o.summary !== undefined) writeFileSync(join(d, 'summary.json'), o.summary)
    const f = join(d, 'updates.jsonl')
    const parts = lines.flatMap((l, i) => [i > 0 ? Buffer.from('\n') : Buffer.alloc(0), typeof l === 'string' ? Buffer.from(l) : l])
    writeFileSync(f, Buffer.concat([...parts, Buffer.from(o.end ?? '\n')]))
    return f
  }

  /** The entry a parse gives the stream */
  async function entryOf(file: string): Promise<Extract<NonNullable<ParseResult>['agg'], { kind: 'grok' }>> {
    const parsed = await runParseJob({ kind: 'grok', file, projectKey: 'p', subagent: false })
    if (parsed?.agg.kind !== 'grok') throw new Error('no Grok entry')
    return parsed.agg
  }

  it('gives a turn one event per billed model, and a turn without the per-model map its top-level figures, with epoch seconds as milliseconds (F1, F3)', async () => {
    const question = grokUser(1786088600, 'what does this do', 0)
    const lines = [
      question,
      grokLine(1786088610, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'it does' } }),
      grokTurn(1786088620, {
        input: 0,
        output: 0,
        modelUsage: { 'grok-4.5-build': { input: 50, cached: 20, output: 5 }, 'grok-code-fast': { input: 30, output: 3 } }
      }),
      grokTurn(1786088630, { input: 100, cached: 40, output: 10, modelUsage: null }),
      grokLine(1786088640, { sessionUpdate: 'turn_completed', usage: {} }),
      // An earlier time on a later line: the session's time is the largest (session-view A1)
      grokLine(1786088500, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'late' } })
    ]
    const f = stream('019f-read1', lines)
    const size = Buffer.byteLength(lines.join('\n') + '\n')
    expect(await entryOf(f)).toEqual({
      kind: 'grok',
      file: f,
      projectKey: 'p',
      subagent: false,
      title: 'what does this do',
      at: 1786088640000,
      listed: true,
      questions: [[0, Buffer.byteLength(question) + 1, size, 1786088600000, 0, 0, 2768285197]],
      events: [
        [1786088620000, 50, 20, 5, 0, 'grok-4.5-build'],
        [1786088620000, 30, 0, 3, 0, 'grok-code-fast'],
        [1786088630000, 100, 40, 10, 0, null],
        [1786088640000, 0, 0, 0, 0, null]
      ]
    })
  })

  const AT = 1786088600
  const MS = AT * 1000
  /** A completed turn as Grok writes one, its usage given as JSON text; no per-model map unless the usage holds one */
  const turn = (usage: string, at: number | string = AT): string =>
    `{"timestamp":${at},"method":"_x.ai/session/update","params":{"sessionId":"s","update":{"sessionUpdate":"turn_completed","usage":${usage}}}}`
  const figures = (input: number | string, output: number | string, extra = ''): string =>
    `{"inputTokens":${input},"cachedReadTokens":0,"outputTokens":${output}${extra}}`
  const eventsOf = async (f: string): Promise<unknown> => (await entryOf(f)).events

  it('as UTF-8 with U+FFFD for each maximal invalid subpart, a line with an invalid byte outside a string being a bad line', async () => {
    const bytes = (...b: number[]): Buffer => Buffer.from(b)
    const f = stream('019f-utf8', [
      // c FF a E2 82 b C0 80 c ED A0 80 d F4 90 80 80 e: one, one, two, three and four replacements
      Buffer.concat([
        Buffer.from(`{"timestamp":${AT},"params":{"update":{"sessionUpdate":"user_message_chunk","content":{"type":"text","text":"c`),
        bytes(0xff), Buffer.from('a'), bytes(0xe2, 0x82), Buffer.from('b'), bytes(0xc0, 0x80), Buffer.from('c'),
        bytes(0xed, 0xa0, 0x80), Buffer.from('d'), bytes(0xf4, 0x90, 0x80, 0x80), Buffer.from('e"},"_meta":{"promptIndex":0}}}}')
      ]),
      // Invalid bytes in a value no rule reads leave the line readable
      Buffer.concat([Buffer.from(turn(figures(100, 10, ',"note":"')).replace(/}}}}$/, '')), bytes(0xff, 0xfe), Buffer.from('"}}}}')]),
      // Outside a string a replacement character is no token, and the line is refused
      Buffer.concat([Buffer.from(`{"timestamp":${AT},`), bytes(0xff), Buffer.from(turn(figures(999, 9)).slice(1))])
    ])
    const entry = await entryOf(f)
    const R = String.fromCharCode(0xfffd)
    expect(entry.title).toBe(`c${R}a${R}b${R}${R}c${R}${R}${R}d${R}${R}${R}${R}e`)
    expect(entry.questions).toHaveLength(1)
    expect(entry.events).toEqual([[MS, 100, 0, 10, 0, null]])
  })

  it('by JSON.parse\'s grammar: a line it refuses is a bad line (A8), and a line it takes counts however unusual, nested deeper than any fixed limit included', async () => {
    const BS = String.fromCharCode(0x5c)
    const good = [
      // 5,000 levels deep in a value no rule reads
      turn(figures(7, 1)).replace('"sessionId":"s"', `"sessionId":"s","deep":${'['.repeat(5000)}${']'.repeat(5000)}`),
      // Tabs, spaces and a carriage return between tokens; numbers in exponent form
      `{ "timestamp" :\t${AT} , "params" : { "update" : { "sessionUpdate" : "turn_completed" , "usage" : { "inputTokens" : 1E2 , "cachedReadTokens" : 0.5e1 , "outputTokens" : 3 } } } }\r`,
      // A key and a value spelled with escapes
      turn(figures(2, 2)).replace('"sessionUpdate":"turn_completed"', `"sessionUpd${BS}u0061te":"turn_c${BS}u006fmpleted"`),
      // A raw U+2028 in a string
      turn(figures(4, 4, `,"note":"x${String.fromCharCode(0x2028)}y"`))
    ]
    // Each carries usage that must not count
    const refused = [
      turn(figures(1001, 1)).replace('"outputTokens":1}', '"outputTokens":1,}'),
      turn(figures(1002, 1, `,"note":"a${String.fromCharCode(9)}b"`)),
      turn(figures(1003, 1, `,"note":"${BS}x41"`)),
      `${String.fromCharCode(0xfeff)}${turn(figures(1004, 1))}`,
      `${turn(figures(1005, 1))} x`,
      turn(figures('01', 1)),
      turn(figures('+1', 1)),
      turn(figures('1.', 1)),
      turn(figures('.5', 1)),
      turn(figures('NaN', 1)),
      turn(figures(1011, 1, `,"note":"${BS}ud8"`)),
      turn(figures(1012, 1)).replace('"sessionId"', '\'sessionId\''),
      turn(figures(1013, 1)).slice(0, -1)
    ]
    expect(await eventsOf(stream('019f-grammar', [...good, ...refused]))).toEqual([
      [MS, 7, 0, 1, 0, null],
      [MS, 100, 5, 3, 0, null],
      [MS, 2, 0, 2, 0, null],
      [MS, 4, 0, 4, 0, null]
    ])
  })

  it('with an array line counted as a line that parsed, its bytes joining the open turn, and a number no line the parse is given', async () => {
    // An array has none of an object's fields, so it holds no turn and no question
    const f = stream('019f-array', [grokUser(AT, 'a question over unusual lines', 0), '[1,2,3]', '42'])
    const entry = await entryOf(f)
    expect(entry.events).toEqual([])
    expect(entry.questions.map((q) => q[2])).toEqual([statSync(f).size - Buffer.byteLength('42\n')])
  })

  it('with a repeated key keeping its last value, at the place the key first held, and a per-model map\'s entries in the order Object.entries gives them', async () => {
    const m = (input: number): string => figures(input, 0)
    const f = stream('019f-repeated', [
      // The index keys first, ascending, then the others where they were first written, b keeping its first place;
      // the second timestamp counts
      turn(`{"inputTokens":0,"outputTokens":0,"modelUsage":{"b":${m(2)},"a":${m(3)},"b":${m(4)},"7":${m(5)},"02":${m(6)},"4294967295":${m(7)},"4294967294":${m(8)}}}`, `1,"timestamp":${AT + 1}`),
      // The second params replaces the first whole: no turn is left
      `{"timestamp":${AT},"params":{"update":{"sessionUpdate":"turn_completed","usage":${figures(900, 9)}}},"params":{"update":{"sessionUpdate":"agent_message_chunk"}}}`,
      // A second usage replaces the first: an empty one, a turn of zeros
      turn(`${figures(901, 9)},"usage":{}`),
      // A second map replaces the first: an empty one, so the turn's own figures count, its repeated input the last
      turn(`{"inputTokens":1,"cachedReadTokens":5,"outputTokens":2,"modelUsage":{"x":${m(902)}},"inputTokens":20,"modelUsage":{}}`),
      // A second type replaces the first: no turn
      turn(figures(903, 9)).replace('"sessionUpdate":"turn_completed"', '"sessionUpdate":"turn_completed","sessionUpdate":"agent_message_chunk"')
    ])
    expect(await eventsOf(f)).toEqual([
      [MS + 1000, 5, 0, 0, 0, '7'],
      [MS + 1000, 8, 0, 0, 0, '4294967294'],
      [MS + 1000, 4, 0, 0, 0, 'b'],
      [MS + 1000, 3, 0, 0, 0, 'a'],
      [MS + 1000, 6, 0, 0, 0, '02'],
      [MS + 1000, 7, 0, 0, 0, '4294967295'],
      [MS, 0, 0, 0, 0, null],
      [MS, 20, 5, 2, 0, null]
    ])
  })

  it('with a number beyond the double range infinite and so no finite count or time, and a negative zero kept', async () => {
    const f = stream('019f-numbers', [
      // An infinite count is 0; a number too small for a double is 0; a negative zero stays one
      turn('{"inputTokens":1e400,"cachedReadTokens":-0,"outputTokens":1e-400}'),
      // An infinite time is no time; a finite one whose milliseconds overflow is an infinite time, the latest
      turn(figures(1, 0), '1e400'),
      turn(figures(2, 0), '1e306')
    ])
    const entry = await entryOf(f)
    expect(entry.events).toEqual([[MS, 0, -0, 0, 0, null], [null, 1, 0, 0, 0, null], [Infinity, 2, 0, 0, 0, null]])
    expect(Object.is(entry.events[0][2], -0)).toBe(true)
    expect(entry.at).toBe(Infinity)
    // Of a negative and a positive zero the session's time is the positive one, whichever comes first
    for (const [id, times] of [['019f-zero1', ['-0', '0']], ['019f-zero2', ['0', '-0']]] as const) {
      const at = (await entryOf(stream(id, times.map((t) => turn(figures(1, 0), t))))).at
      expect(Object.is(at, 0)).toBe(true)
    }
  })

  it('with a lone surrogate escape staying that code unit, in a billed model\'s name and in a question', async () => {
    const [high, low] = [String.fromCharCode(0xd800), String.fromCharCode(0xdc00)]
    const f = stream('019f-surrogate', [
      // 59 letters, the lone surrogate, then two more: the title is clipped after the surrogate, a code point of its own
      grokUser(AT, `${'a'.repeat(59)}${high}bc`, 0),
      turn(`{"modelUsage":{"grok${low}":${figures(3, 1)},"grok${high}${low}":${figures(4, 1)}}}`.replace(low, '\\udc00'))
    ])
    const entry = await entryOf(f)
    expect(entry.title).toBe(`${'a'.repeat(59)}${high}${String.fromCharCode(0x2026)}`)
    expect(entry.events.map((e) => e[5])).toEqual([`grok${low}`, `grok${high}${low}`])
  })

  it('the way the TypeScript parser read a usage that is no object, or a per-model entry that is null', async () => {
    const f = stream('019f-values', [
      // A null entry ended the line: reading its figures threw, and the line was skipped from there
      turn(`{"modelUsage":{"m1":${figures(1, 0)},"m2":null,"m3":${figures(3, 0)}}}`),
      // A truthy usage that is no object is a turn of zeros under no model; a falsy one is no turn
      ...['5', '"x"', 'true', '[]', '0', '""', 'false', 'null'].map((u) => turn(u)),
      // An array map's entries are named by index, and an entry that is no object counts zeros
      turn(`{"modelUsage":[${figures(7, 0)},3]}`),
      // An empty map, an empty array or a map of another kind falls back to the turn's own figures
      ...['{}', '[]', '"m"', 'null'].map((mu, i) => turn(`{"inputTokens":${10 + i},"outputTokens":0,"modelUsage":${mu}}`)),
      // A params or an update of another kind holds no turn
      `{"timestamp":${AT},"params":"turn_completed"}`,
      `{"timestamp":${AT},"params":{"update":[{"sessionUpdate":"turn_completed","usage":${figures(99, 0)}}]}}`
    ])
    expect(await eventsOf(f)).toEqual([
      [MS, 1, 0, 0, 0, 'm1'],
      ...Array.from({ length: 4 }, () => [MS, 0, 0, 0, 0, null]),
      [MS, 7, 0, 0, 0, '0'],
      [MS, 0, 0, 0, 0, '1'],
      [MS, 10, 0, 0, 0, null],
      [MS, 11, 0, 0, 0, null],
      [MS, 12, 0, 0, 0, null],
      [MS, 13, 0, 0, 0, null]
    ])
  })

  it('with a last line counted though no line feed ends it, and the last turn ending at the end of the last line that parsed', async () => {
    const lines = [grokUser(AT, 'q', 0), turn(figures(5, 1), AT + 9)]
    const f = stream('019f-last', lines, { end: '' })
    const size = Buffer.byteLength(lines.join('\n'))
    const entry = await entryOf(f)
    expect(entry.events).toEqual([[MS + 9000, 5, 0, 1, 0, null]])
    expect(entry.at).toBe(MS + 9000)
    expect(entry.questions).toEqual([[0, Buffer.byteLength(lines[0]) + 1, size, MS, 0, 0, 4094444124]])
    // A half-written last line does not parse: the turn stops before it, and its time is not the session's
    // (session-view, Implementation Decisions, the offset index)
    const half = stream('019f-half', [...lines, `{"timestamp":${AT + 20},"params":{"upd`], { end: '' })
    const cut = await entryOf(half)
    expect(cut.questions).toEqual([[0, Buffer.byteLength(lines[0]) + 1, size + 1, MS, 0, 0, 4094444124]])
    expect(cut.at).toBe(MS + 9000)
    expect(cut.events).toEqual(entry.events)
  })

  it('titled by the summary\'s own name, session_summary ?? generated_title, then the first question clipped, then the session directory\'s name (session-view G2)', async () => {
    const question = grokUser(AT, 'the first question', 0)
    const titleOf = async (id: string, summary: string | Buffer | undefined, lines = [question]): Promise<string | null> =>
      (await entryOf(stream(id, lines, { summary }))).title
    expect(await titleOf('019f-t1', '{"session_summary":"named","generated_title":"generated"}')).toBe('named')
    expect(await titleOf('019f-t2', '{"generated_title":"generated"}')).toBe('generated')
    expect(await titleOf('019f-t3', '{"session_summary":null,"generated_title":"generated"}')).toBe('generated')
    // The last of a repeated key
    expect(await titleOf('019f-t4', '{"session_summary":"named","session_summary":"renamed"}')).toBe('renamed')
    // An empty or a non-string name does not fall through to generated_title: no name, so the first question
    for (const [id, summary] of [
      ['019f-t5', '{"session_summary":"","generated_title":"generated"}'],
      ['019f-t6', '{"session_summary":5,"generated_title":"generated"}'],
      ['019f-t7', '[{"session_summary":"named"}]'],
      ['019f-t8', '{"session_summary":"named"'],
      ['019f-t9', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"session_summary":"named"}')])],
      ['019f-t10', undefined]
    ] as const) {
      expect(await titleOf(id, summary)).toBe('the first question')
    }
    // A summary that cannot be read as a file
    const d = join(dir, '.grok', 'sessions', encodeURIComponent(proj), '019f-t11')
    mkdirSync(join(d, 'summary.json'), { recursive: true })
    expect(await titleOf('019f-t11', undefined)).toBe('the first question')
    // Clipped at 60 code points
    expect(await titleOf('019f-t12', undefined, [grokUser(AT, 'x'.repeat(70), 0)])).toBe(`${'x'.repeat(60)}${String.fromCharCode(0x2026)}`)
    // No question: the session directory's name
    expect(await titleOf('019f-t13', '{}', [turn(figures(1, 1))])).toBe('019f-t13')
  })
})
