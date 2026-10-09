// Ticket 04 plus the correction round: the token aggregation engine (aligned with ccusage, 2026-07-30) —
// a whole-tree scan (independent of the registry), deduplication by message.id+requestId (with the
// sidechain fallback),
// all four fields summed into the total, synthetic staying out of the model buckets, bad lines skipped
// while streaming, and the incremental cache.
//
// Gap (#158): a file growing *while* it is being parsed is not driven here — that the cache signature
// is taken before the parse, so the growth shows as a change on the next scan, needs a writer racing
// the reader, which no test here controls. A read hook in eachJsonlLine would let a test append mid-read.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync, readdirSync, statSync, openSync, writeSync, closeSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CACHE_VERSION, RESUME_LIMIT, TokenEngine, projectStatsFromRows, rowsFromCacheFile, runParseJob, type ParseRunner } from './token-stats'
import { emptyTokenStats } from '@shared/domain'
import { zstdCompressSync } from 'node:zlib'
import { encodeClaudeProjectDir } from './claude'
import { sessionReadTarget } from '../security'
import { ERR, decodeAppError } from '@shared/errors'
import type { ScanRoots } from './types'
import { walkSessions } from './scan'

let dir: string
let proj: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    grokHome: join(dir, '.grok'),
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

  it('a cold rollout that cannot be decompressed — not zstd, or truncated — is skipped like an unreadable plain file, without aborting its siblings (B12)', async () => {
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
    const r = await engine().build(roots(), [proj])
    const sessions = r.perProject.get(proj.toLowerCase())?.sessions.filter((s) => s.side === 'codex') ?? []
    expect(sessions.map((s) => s.file)).toEqual([plain])
    expect(r.global.bySide.codex.total).toBe(110)
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
    // The per-file cache is the other archived form: the raw figure must not survive into it either
    const cacheRaw = readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')
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
              title: 'old format',
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

  it('a previous version\'s stale non-zero cacheWrite is recomputed to 0, and the four fields still sum to the total', async () => {
    // ⚠️ **This does not catch a missed CACHE_VERSION bump** — same limitation as the neighbouring
    //    "outdated algorithm" case, and for the same reason: the fixture writes `CACHE_VERSION - 1`,
    //    one notch below the current value whatever it is, so it never matches and always recomputes.
    //    Measured 2026-08-18: rolling CACHE_VERSION back 13 → 12 (simulating the missed bump that
    //    ADR-0023's implementation actually made) leaves this case **green**.
    //    The algorithm-change half of the rule relies on process, not on any unit test.
    //
    // What it does assert: once recomputation happens, the ADR-0023 field comes back as 0 rather than
    // inheriting the parsed value, and the invariant the composition view depends on still holds.
    // Both would have been violated by a stale entry flowing through unrecomputed.
    const rollout = mkCodexRollout('rollout-stale-019f901.jsonl', proj, '2026-07-30T03:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10 }
    ])
    mkdirSync(join(dir, 'cache'), { recursive: true })
    const st = statSync(rollout)
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        // Deliberately the immediately previous version rather than a literal, so the guard keeps
        // meaning as the version grows (the convention CACHE_VERSION's own comment sets out)
        version: CACHE_VERSION - 1,
        files: {
          [rollout]: {
            sig: `${st.mtimeMs}:${st.size}`,
            agg: {
              kind: 'codex',
              file: rollout,
              projectKey: proj.toLowerCase(),
              listed: true,
              title: 'stale cache-write',
              at: Date.parse('2026-07-30T03:00:00Z'),
              model: 'gpt-5.6-sol',
              titleFromThread: false,
              sessionId: null,
              parentId: null,
              forkedAt: null,
              questions: [],
              // The stale part: a non-zero cache-write parsed under the old rule
              events: [[Date.parse('2026-07-30T03:00:00Z'), 100, 80, 10, 500]]
            }
          }
        }
      })
    )
    const r = await engine().build(roots(), [proj])
    const c = r.global.bySide.codex
    expect(c.cacheWrite, 'the stale 500 must not survive into the recomputed result').toBe(0)
    expect(c.total).toBe(110)
    expect(c.input + c.output + c.cacheRead + c.cacheWrite).toBe(c.total)
  })

  it('an old cache predating the grok variant does not crash, and grok data on disk is computed fresh', async () => {
    // The cache below has no idea grok exists (its version predates the variant); the session on
    // disk must still be metered — the extension of the case above to the new shape (#124)
    mkGrokSession(proj, '019f-oldcache', [grokTurn(1786088656, { input: 100, output: 10 })])
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({ version: CACHE_VERSION - 1, files: {} })
    )
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.grok.total).toBe(110)
  })

  it('a same-version grok entry missing subagent → recompute that file only (isWellFormedAgg)', async () => {
    const f = mkGrokSession(proj, '019f-guard', [grokTurn(1786088656, { input: 100, output: 10 })])
    const st = statSync(f)
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        version: CACHE_VERSION, // same version: only the shape guard can catch it
        files: {
          [f]: {
            sig: `${st.mtimeMs}:${st.size}`,
            // Everything else valid; only subagent missing — an undefined subagent would silently
            // list a subagent session once the session-view ticket starts reading it
            agg: { kind: 'grok', file: f, projectKey: proj.toLowerCase(), questions: [], events: [[1786088656000, 999, 0, 0, 0, 'grok-4.5-build']] }
          }
        }
      })
    )
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.grok.total, 'the malformed entry must be recomputed, not reused').toBe(110)
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
    expect(s?.at, 'the version must be bumped with an algorithm change, or the old value is reused').toBe(Date.parse('2026-07-30T18:30:00Z'))
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
    ['file', { projectKey: 'X', listed: true, title: 'a stale title from the cache', at: 1, questions: [], forkPoints: 0 }],
    ['questions', { file: 'X', projectKey: 'X', listed: true, title: 'a stale title from the cache', at: 1, forkPoints: 0 }],
    ['forkPoints (ticket 06 banner signal)', { file: 'X', projectKey: 'X', listed: true, title: 'a stale title from the cache', at: 1, questions: [] }],
    // Ticket 03b: the record's arity went from 6 to 7 (adding the content fingerprint). An old record's
    // 7th element reads back as undefined,
    // and undefined === undefined makes Codex's replay fingerprint check always true and strips blindly.
    [
      'a questions record one element short (the old arity)',
      {
        file: 'X',
        projectKey: 'X',
        listed: true,
        title: 'a stale title from the cache',
        at: 1,
        forkPoints: 0,
        questions: [[0, 10, 20, 1, 0, 0]]
      }
    ]
  ])('an entry missing %s in a same-version cache → recompute that file only, without polluting the whole detail', async (_missing, partial) => {
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
        version: CACHE_VERSION, // Same version: the version number cannot catch it and only isWellFormedAgg can
        files: { [cl]: { sig: `${st.mtimeMs}:${st.size}`, agg } }
      })
    )
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.side === 'claude')
    expect(s?.file, 'a cache entry with a missing field must be judged invalid and recomputed, never letting undefined through to the contract layer').toBe(cl)
    // Assert the recomputation really happened: the cache holds a sentinel title while a real parse yields
    // the content of userLine.
    // Without this, "the entry was judged invalid" and "the cache never hit at all" are indistinguishable
    // in the result.
    expect(s?.title, 'it must be the freshly parsed title, not the cached one').toBe('x')
  })

  // The only automated defence against a missed bump on a shape change: this goes red when the field set
  // changes, forcing the author to think about the version number.
  // The assertion targets **the persisted cache** — the very thing the version number protects, not a
  // side channel.
  // Coverage stated explicitly: it covers adding and removing fields only, not a change to how a field is
  // computed (that leaves the field set, and the fingerprint, unchanged).
  it('a change to FileAgg\'s field set must be noticed (a shape change is the only half of a missed bump that is testable)', async () => {
    mkClaudeFile('shape.jsonl', [
      userLine('question'),
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
      expect(hit, `the cache should hold a ${kind} entry`).toBeDefined()
      return Object.keys((hit as { agg: Record<string, unknown> }).agg).sort()
    }
    expect(keysOf('claude')).toEqual([
      'at', 'entries', 'file', 'forkPoints', 'kind', 'listed', 'projectKey', 'questions', 'title'
    ])
    expect(keysOf('codex')).toEqual([
      'at', 'boundary', 'events', 'file', 'forkedAt', 'kind', 'listed', 'model', 'paginated', 'parentId', 'projectKey', 'questions', 'sessionId', 'title', 'titleFromThread'
    ])
  })

  // Ticket 03a's founding premise (spec D2a): the index **stores offsets only, not even a truncated
  // preview**.
  // The reason: in a cache read at every startup across the whole repository, question text is about 9.5%
  // of the whole, a megabyte-scale burden.
  // Without this assertion, a later "might as well store a preview to help search" would not go red — and
  // that is exactly what this decision exists to prevent.
  it('the cache contains no question text at all (offsets only)', async () => {
    const uniq = 'a unique question text CANARY7391'
    mkClaudeFile('notext.jsonl', [
      userLine(uniq),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    await engine().build(roots(), [proj])
    const raw = readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')
    const cache = JSON.parse(raw) as { files: Record<string, { agg: Record<string, unknown> }> }
    const hit = Object.values(cache.files).find((f) => String(f.agg['file']).endsWith('notext.jsonl'))
    // First prove this really entered the cache, or the "no text found" below is a vacuous pass
    expect(hit, 'that file should be in the cache').toBeDefined()
    expect((hit as { agg: Record<string, unknown> }).agg['questions']).toHaveLength(1)
    // The title is stored by design (the session list displays it) while the question **body** is not;
    // the judgement uses a string that appears only in a question and can be nothing but its title.
    const questionsJson = JSON.stringify((hit as { agg: Record<string, unknown> }).agg['questions'])
    expect(questionsJson, 'question text appeared in the index').not.toContain('CANARY')
    expect(questionsJson, 'the index should hold only numbers and null').toMatch(/^\[\[[\d,\s.enull-]*\]\]$/)
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
    const r = await engine().build(roots(), [proj])
    const child = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.file === childFile)
    expect(child?.forkState).toBe('stripped')
    expect(child?.title).toBe('child new question')
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
    writeFileSync(
      join(d, `rollout-${CHILD}.jsonl`),
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', 'parent question one'), // a replay (timestamps rewritten, content identical)
        q('2026-07-30T02:00:05Z', 'child new question')
      ].join('\n') + '\n'
    )
    writeIndex([{ id: CHILD, name: 'fork thread name' }])
    const r = await engine().build(roots(), [proj])
    const child = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.forkState === 'stripped')
    expect(child, 'a stripped child should be listed (it still has surviving questions)').toBeDefined()
    expect(child?.title, 'thread_name takes priority (A4) and a retitle must not displace it').toBe('fork thread name')
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
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.file === childFile), 'a fork stripped empty should not be listed').toBeUndefined()
    expect(p?.sessions.filter((s) => s.side === 'codex'), 'the parent session is listed as usual').toHaveLength(1)
    expect(p?.tokens.bySide.codex.total, 'not being listed does not mean the tokens are not counted').toBe(120)
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

  it('a changed signature: only that file\'s index is rebuilt, and the new index is written back to the cache (visible on disk)', async () => {
    const cl = mkClaudeFile('sq2.jsonl', [userLine('question one', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(cl, userLine('question two', '2026-07-30T04:00:00Z') + '\n') // the size changes → the signature mismatches
    const r = await e.sessionQuestions(roots(), cl)
    expect(r.questions, 'after the rebuild the appended question should be visible').toHaveLength(2)
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
    for (const side of ['claude', 'codex', 'grok'] as const) {
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
    // The three cross-side comparable buckets sum **exactly** to the total (CONTEXT.md's invariant).
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
      for (const side of ['claude', 'codex', 'grok'] as const) {
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

  it('three sides, several days: every projection equals the rows', async () => {
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
    const r = await engine().build(roots(), [proj])
    reconcile(r)
    expect(r.rows.length, 'the fixture must actually produce rows on all three sides').toBeGreaterThan(3)
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
  it('rowsFromCacheFile: a snapshot of the current cache version yields exactly the rows a build of that data produces', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      usageLine('claude-opus-5', '2026-07-31T03:00:00Z', 20, 10)
    ])
    mkCodexRollout('rollout-r-019f100.jsonl', proj, '2026-07-30T04:00:00Z', 'gpt-5.6-sol', [
      { input: 40, cached: 0, output: 0 }
    ])
    const built = await engine().build(roots(), [proj])
    const fromFile = rowsFromCacheFile(join(dir, 'cache', 'token-cache.json'))
    const key = (r: { day: string; side: string; projectKey: string; model: string }): string => `${r.day}|${r.side}|${r.projectKey}|${r.model}`
    const sorted = (rows: typeof built.rows): typeof built.rows => [...rows].sort((a, b) => (key(a) < key(b) ? -1 : 1))
    expect(sorted(fromFile)).toEqual(sorted(built.rows))
    expect(fromFile.length).toBeGreaterThan(1)
  })

  it('rowsFromCacheFile: a snapshot of another cache version is refused rather than misread', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    await engine().build(roots(), [proj])
    const file = join(dir, 'cache', 'token-cache.json')
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version: number }
    raw.version = CACHE_VERSION - 1
    writeFileSync(file, JSON.stringify(raw))
    expect(() => rowsFromCacheFile(file)).toThrow(/version/)
  })

  it('projectStatsFromRows: a project\'s figures come from the rows it owns in the effective set, its sessions stay, and a project present only in the archive gets an entry with none', () => {
    const base = new Map([
      ['/live', { tokens: emptyTokenStats(), sessions: [{ side: 'claude', title: 't', at: 1, tokens: 5, file: '/f', questionCount: 1, forkState: 'none' }] }]
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
    return shape(await new TokenEngine(join(dir, `cache-cold-${Math.random()}`)).build(roots(), [proj]))
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

  it('wherever the file is cut, scanning the first part and then the grown file gives the cold result', async () => {
    const text = rolloutText()
    const cuts = new Set<number>()
    for (let i = 0; i < text.length; i++) {
      if (text[i] === 0x0a) {
        cuts.add(i + 1)
        cuts.add(i - 7) // mid-line: a line still being written when the first scan ran
      }
    }
    cuts.delete(text.length)
    const f = rolloutPath()
    for (const cut of cuts) {
      const cacheDir = join(dir, `cache-resume-${cut}`)
      writeFileSync(f, text.subarray(0, cut))
      await new TokenEngine(cacheDir).build(roots(), [proj])
      appendFileSync(f, text.subarray(cut))
      const resumed = shape(await new TokenEngine(cacheDir).build(roots(), [proj]))
      expect(resumed, `cut at byte ${cut}`).toEqual(await cold())
    }
  })

  it('reads only the appended part: a change before the old end stays unseen until a full parse', async () => {
    const text = rolloutText()
    const f = rolloutPath()
    const cut = text.indexOf('second question')
    writeFileSync(f, text.subarray(0, cut))
    const cacheDir = join(dir, 'cache-resume')
    const first = await new TokenEngine(cacheDir).build(roots(), [proj])
    // 100 → 900 in the first usage event, already parsed
    overwrite(f, text.indexOf('"input_tokens":100'), '"input_tokens":900')
    appendFileSync(f, text.subarray(cut))
    const resumed = await new TokenEngine(cacheDir).build(roots(), [proj])
    const coldTotal = (await new TokenEngine(join(dir, 'cache-cold')).build(roots(), [proj])).global.bySide.codex.total
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
    await new TokenEngine(cacheDir).build(roots(), [proj])
    const staged = `${f}.staged`
    writeFileSync(staged, Buffer.from(text.toString('utf8').replace('"input_tokens":100', '"input_tokens":900')))
    renameSync(staged, f)
    expect(shape(await new TokenEngine(cacheDir).build(roots(), [proj]))).toEqual(await cold())
  })

  it('a rollout that shrank in place is parsed whole', async () => {
    const text = rolloutText()
    const f = rolloutPath()
    writeFileSync(f, text)
    const cacheDir = join(dir, 'cache-resume')
    await new TokenEngine(cacheDir).build(roots(), [proj])
    writeFileSync(f, text.subarray(0, text.indexOf('second question')))
    expect(shape(await new TokenEngine(cacheDir).build(roots(), [proj]))).toEqual(await cold())
  })

  it(`after ${RESUME_LIMIT} resumes the next growth is parsed whole, bounding an edit no cheap check sees`, async () => {
    const text = rolloutText()
    const f = rolloutPath()
    writeFileSync(f, text)
    const cacheDir = join(dir, 'cache-resume')
    await new TokenEngine(cacheDir).build(roots(), [proj])
    overwrite(f, text.indexOf('"input_tokens":100'), '"input_tokens":900')
    const coldNow = async (): Promise<number> =>
      (await new TokenEngine(join(dir, `cache-cold-${Math.random()}`)).build(roots(), [proj])).global.bySide.codex.total
    for (let i = 0; i < RESUME_LIMIT; i++) {
      appendFileSync(f, JSON.stringify(record(`grow-${i}`, '2026-07-31T03:00:00Z', 1, 0)) + '\n')
      const total = (await new TokenEngine(cacheDir).build(roots(), [proj])).global.bySide.codex.total
      expect(total, `resume ${i + 1}`).toBe((await coldNow()) - 800)
    }
    appendFileSync(f, JSON.stringify(record('grow-last', '2026-07-31T03:00:00Z', 1, 0)) + '\n')
    const total = (await new TokenEngine(cacheDir).build(roots(), [proj])).global.bySide.codex.total
    expect(total).toBe(await coldNow())
  })

  it('the session page rebuilds a grown rollout to the same index a cold scan gives', async () => {
    const text = rolloutText()
    const f = rolloutPath()
    const cut = text.indexOf('second question')
    writeFileSync(f, text.subarray(0, cut))
    const e = new TokenEngine(join(dir, 'cache-resume'))
    await e.build(roots(), [proj])
    appendFileSync(f, text.subarray(cut))
    const page = await e.sessionQuestions(roots(), f)
    const fresh = new TokenEngine(join(dir, 'cache-cold'))
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
    const pooled = await new TokenEngine(join(dir, 'cache-pooled'), reversing).build(roots(), [proj, proj2])
    const inline = await new TokenEngine(join(dir, 'cache-inline')).build(roots(), [proj, proj2])
    expect(started).toBe(5)
    expect(shape(pooled)).toEqual(shape(inline))
    // And the pooled cache is the inline cache, entry by entry
    const cacheOf = (d: string): unknown => (JSON.parse(readFileSync(join(dir, d, 'token-cache.json'), 'utf8')) as { files: unknown }).files
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
    const fresh = new TokenEngine(join(dir, 'cache-cold'))
    await fresh.build(roots(), [proj])
    expect(page).toEqual(await fresh.sessionQuestions(roots(), f))
    expect(page.side).toBe('grok')
    expect(page.questions).toHaveLength(2)
    // The rebuild is kept: opening the page again does not rebuild (nor show the rebuilding state) again
    expect(e.isFresh(f)).toBe(true)
  })
})
