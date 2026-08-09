import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eachJsonlLine } from './jsonl'
import { makeQuestionIndexer, type QuestionRec } from './question-index'
import { readRanges } from './range-read'
import { turnBlocksFromText } from './turn-content'
import type { TurnBlock } from '@shared/domain'

// ─────────────────────────────────────────────────────────────────────────
// Ticket 05 established the prose model and ticket 07 completed it (tool / thinking / reasoning /
// subagent / unknown trace).
//
// The rules are grounded in a full enumeration (prose on 2026-08-05, rich content on 2026-08-06; a
// CONTEXT invariant):
// - Claude, 2131 files: 18 top-level types in the whole spectrum; the assistant segment spectrum is
//   text/tool_use/thinking
//   (all 3312 main-chain thinking segments in the repository are empty, so the think block mechanism is
//   retained but current data produces none);
//   tool_result pairs by tool_use_id (19,711/19,711 all matched a tool_use already seen in the same file);
//   **subagent internal steps are not attributed**: all four candidate join keys were excluded by
//   measurement (two agentId formats,
//   0/225; promptId 0/202; outputFile pointing at a background task's output; prompt equality 0/1299),
//   and no grouping rule is written without a sample — the sub block is unified on both sides as
//   dispatch + return + an unattributed label;
//   the truncation criterion = the body contains a tool-results/ sidecar path (49 cases,
//   mechanism-based: the harness's sidecar directory;
//   the word "truncated" is too generic to be a criterion).
// - Codex, 296 files: 7 top-level types; 9 response_item types (calls carry input/arguments, and outputs
//   pair by
//   call_id, always present); 15 event_msg types; reasoning.summary = [{type:'summary_text',
//   text}] (an empty array 64% of the time); agent_reasoning (event_msg) is a mirror of reasoning and is
//   not rendered,
//   to avoid double counting; spawn_agent's output has no thread id → the sub-thread cannot be attributed
//   (the user ruled on 2026-08-06:
//   show the dispatch and the return with a label, rather than forcing a heuristic pairing).
// ─────────────────────────────────────────────────────────────────────────

const TS = '2026-08-01T10:00:00.000Z'
const AT = Date.parse(TS)

const blocks = (side: 'claude' | 'codex', objs: unknown[]): TurnBlock[] =>
  turnBlocksFromText(side, objs.map((o) => JSON.stringify(o)).join('\n') + '\n')

// ── Claude line builders ──
const cA = (content: unknown[], extra: Record<string, unknown> = {}): unknown => ({
  type: 'assistant',
  timestamp: TS,
  message: { role: 'assistant', content },
  ...extra
})
const cU = (content: unknown[], extra: Record<string, unknown> = {}): unknown => ({
  type: 'user',
  timestamp: TS,
  message: { role: 'user', content },
  ...extra
})

describe('Claude prose and thinking (ticket 05 behaviour preserved + the think block)', () => {
  test('a text segment yields a prose block; several text segments on one line merge into one; whitespace yields nothing', () => {
    expect(blocks('claude', [cA([{ type: 'text', text: '答一' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: '答一' }
    ])
    expect(blocks('claude', [cA([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'A\nB' }
    ])
    expect(blocks('claude', [cA([{ type: 'text', text: '  ' }])])).toEqual([])
  })

  test('a thinking segment yields a think block, with the within-line order thinking → prose → tools', () => {
    const bs = blocks('claude', [
      cA([
        { type: 'thinking', thinking: '想一想' },
        { type: 'text', text: '答案' },
        { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }
      ])
    ])
    expect(bs.map((b) => b.kind)).toEqual(['think', 'text', 'tool'])
    expect(bs[0]).toEqual({ kind: 'think', at: AT, body: '想一想' })
  })
})

describe('Claude tool blocks (tool_use ↔ tool_result paired by id)', () => {
  test('pairs the arguments with the return; a one-line summary; an output never fed back is null', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls -la' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: '共 3 个文件' }]),
      cA([{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: '/a.ts' } }])
    ])
    expect(bs).toHaveLength(2)
    const [t1, t2] = bs as Array<Extract<TurnBlock, { kind: 'tool' }>>
    expect(t1.kind).toBe('tool')
    expect(t1.name).toBe('Bash')
    expect(t1.summary).toContain('ls -la')
    expect(t1.input).toContain('ls -la')
    expect(t1.output).toBe('共 3 个文件')
    expect(t1.truncated).toBe(false)
    expect(t2.output).toBeNull()
  })

  test('when tool_result content is an array of segments, the text segments are joined', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Grep', input: { pattern: 'x' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: '命中 1' }, { type: 'text', text: '命中 2' }] }])
    ])
    expect((bs[0] as Extract<TurnBlock, { kind: 'tool' }>).output).toBe('命中 1\n命中 2')
  })

  test('the truncation criterion: a return containing a tool-results/ sidecar path → truncated, without pretending it is complete', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'WebFetch', input: { url: 'https://x' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: 'output saved to: /Users/x/.claude/projects/-p/s/tool-results/abc.txt\n\nPreview (first 2KB): …' }])
    ])
    expect((bs[0] as Extract<TurnBlock, { kind: 'tool' }>).truncated).toBe(true)
  })
})

describe('Claude subagent blocks (dispatch + return + the unattributed label; no grouping without a sample)', () => {
  test('the dispatch name comes from subagent_type; prompt and result pair up; unlinked is always true (measured: no join key)', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { description: '查日志', prompt: '查一下日志', subagent_type: 'debugger' } }]),
      // A sidechain line within the turn: no stable reference chain to a dispatch, so it is neither
      // rendered nor grouped
      cA([{ type: 'text', text: '我先看日志文件' }], { isSidechain: true, agentId: 'a1b2c3d4e5f6a7b8c' }),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: '日志干净' }] }], {
        toolUseResult: { agentId: 'ac50856', status: 'completed', prompt: '查一下日志' }
      })
    ])
    expect(bs).toHaveLength(1)
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.kind).toBe('sub')
    expect(sub.name).toBe('debugger')
    expect(sub.prompt).toBe('查一下日志')
    expect(sub.result).toBe('日志干净')
    expect(sub.steps).toEqual([])
    expect(sub.unlinked).toBe(true)
  })

  test('with no subagent_type the dispatch name falls back to the tool name; with nothing fed back, result is null', () => {
    const bs = blocks('claude', [cA([{ type: 'tool_use', id: 'tu1', name: 'Task', input: { prompt: '干活' } }])])
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.name).toBe('Task')
    expect(sub.result).toBeNull()
  })

  test('a sidechain line yields no block and no unknown count — a known type whose full transcript is in the source or a nested file', () => {
    expect(blocks('claude', [cA([{ type: 'text', text: '子代理的话' }], { isSidechain: true, agentId: 'ag-x' })])).toEqual([])
  })
})

describe('the Claude display allow-list and unknown traces (the whole 18-type top-level spectrum)', () => {
  test('known noise is neither rendered nor traced: system / attachment / file-history-snapshot / mode and the rest', () => {
    expect(
      blocks('claude', [
        { type: 'system', subtype: 'compact_boundary', timestamp: TS },
        { type: 'attachment', attachment: { type: 'task_reminder' }, timestamp: TS },
        { type: 'file-history-snapshot', messageId: 'x', timestamp: TS },
        { type: 'mode', timestamp: TS },
        { type: 'queue-operation', timestamp: TS }
      ])
    ).toEqual([])
  })

  test('a new type outside the allow-list leaves a trace: the type name is named, the count accumulates, and it goes at the end of the block order', () => {
    const bs = blocks('claude', [
      cA([{ type: 'text', text: '正文' }]),
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'new_thing', timestamp: TS }
    ])
    expect(bs[0].kind).toBe('text')
    expect(bs[bs.length - 1]).toEqual({ kind: 'unknown', count: 3, types: ['agent_snapshot', 'new_thing'] })
  })
})

// ── Codex line builders ──
const xEvent = (payload: Record<string, unknown>): unknown => ({ type: 'event_msg', timestamp: TS, payload })
const xRI = (payload: Record<string, unknown>): unknown => ({ type: 'response_item', timestamp: TS, payload })

describe('Codex tool blocks (paired by call_id; both the input and arguments fields)', () => {
  test('both custom_tool_call.input and function_call.arguments are honoured; outputs pair by call_id', () => {
    const bs = blocks('codex', [
      xRI({ type: 'custom_tool_call', id: 'r1', call_id: 'c1', name: 'exec', input: 'ls -la', status: 'completed' }),
      xRI({ type: 'custom_tool_call_output', call_id: 'c1', output: '3 files' }),
      xRI({ type: 'function_call', id: 'r2', call_id: 'c2', name: 'wait', arguments: '{"ms":100}' }),
      xRI({ type: 'function_call_output', call_id: 'c2', output: 'ok' }),
      xRI({ type: 'tool_search_call', id: 'r3', call_id: 'c3', arguments: '{"q":"read"}', status: 'completed' })
    ])
    expect(bs.map((b) => b.kind)).toEqual(['tool', 'tool', 'tool'])
    const [t1, t2, t3] = bs as Array<Extract<TurnBlock, { kind: 'tool' }>>
    expect(t1.name).toBe('exec')
    expect(t1.input).toBe('ls -la')
    expect(t1.output).toBe('3 files')
    expect(t2.input).toBe('{"ms":100}')
    expect(t2.output).toBe('ok')
    expect(t3.name).toBe('tool_search_call')
    expect(t3.output).toBeNull()
  })

  test('spawn_agent yields a sub block: the unlinked label, with the sub-thread unattributed (ruled 2026-08-06)', () => {
    const bs = blocks('codex', [
      xRI({ type: 'function_call', id: 'r1', call_id: 'c1', name: 'spawn_agent', namespace: 'collaboration', arguments: '{"task_name":"t1"}' }),
      xRI({ type: 'function_call_output', call_id: 'c1', output: '{"agent_id":"x"}' })
    ])
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.kind).toBe('sub')
    expect(sub.name).toBe('spawn_agent')
    expect(sub.prompt).toBe('{"task_name":"t1"}')
    expect(sub.result).toBe('{"agent_id":"x"}')
    expect(sub.steps).toEqual([])
    expect(sub.unlinked).toBe(true)
  })
})

describe('Codex reasoning blocks (reasoning.summary is a plaintext sub-heading; the body is encrypted and unobtainable)', () => {
  test('a non-empty summary yields a reason block; an empty array yields none (64% are empty in the full enumeration)', () => {
    const bs = blocks('codex', [
      xRI({ type: 'reasoning', id: 'r1', summary: [{ type: 'summary_text', text: '**先对比目录**' }, { type: 'summary_text', text: '再看差异' }], encrypted_content: 'gAAA…' }),
      xRI({ type: 'reasoning', id: 'r2', summary: [], encrypted_content: 'gAAA…' })
    ])
    expect(bs).toEqual([{ kind: 'reason', at: AT, titles: ['**先对比目录**', '再看差异'] }])
  })

  test('event_msg/agent_reasoning is a mirror and yields no block (to avoid double counting)', () => {
    expect(blocks('codex', [xEvent({ type: 'agent_reasoning', text: '小标题' })])).toEqual([])
  })
})

describe('the Codex display allow-list and unknown traces', () => {
  test('known noise leaves no trace: token_count / task_started / turn_context / world_state / the double-write mirrors', () => {
    expect(
      blocks('codex', [
        xEvent({ type: 'token_count', info: {} }),
        xEvent({ type: 'task_started' }),
        xEvent({ type: 'thread_settings_applied' }),
        { type: 'turn_context', timestamp: TS, payload: { model: 'x' } },
        { type: 'world_state', timestamp: TS },
        xRI({ type: 'message', role: 'assistant', content: [] }),
        xRI({ type: 'agent_message', message: '镜像' })
      ])
    ).toEqual([])
  })

  test('unknown types at all three levels leave a trace: top level / the event_msg payload / the response_item payload', () => {
    const bs = blocks('codex', [
      { type: 'brand_new_top', timestamp: TS },
      xEvent({ type: 'shiny_event' }),
      xRI({ type: 'shiny_item' })
    ])
    expect(bs).toEqual([
      { kind: 'unknown', count: 3, types: ['brand_new_top', 'event_msg/shiny_event', 'response_item/shiny_item'] }
    ])
  })
})

describe('bad lines and side attribution (ticket 05 behaviour preserved)', () => {
  test('a bad line only hurts itself; the sides do not cross over', () => {
    const raw = [JSON.stringify(cA([{ type: 'text', text: '好行' }])), '{ 坏行'].join('\n')
    expect(turnBlocksFromText('claude', raw)).toHaveLength(1)
    expect(blocks('codex', [cA([{ type: 'text', text: 'claude 行' }])])).toEqual([{ kind: 'unknown', count: 1, types: ['assistant'] }])
  })
})

// ── The anchor test (ticket 05's acceptance, preserved): a whole turn fetched by offset == the
// corresponding turn from a full parse of the file ──

function withFile<T>(text: string, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'turn-'))
  const file = join(dir, 's.jsonl')
  writeFileSync(file, text)
  return fn(file).finally(() => rmSync(dir, { recursive: true, force: true }))
}

async function indexFile(file: string, side: 'claude' | 'codex'): Promise<QuestionRec[]> {
  const idx = makeQuestionIndexer(side)
  let fileEnd = 0
  await eachJsonlLine(file, (obj, start, end) => {
    idx.line(obj, start, end)
    fileEnd = end
  })
  return idx.done(fileEnd)
}

const uLine = (t: string): string => JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: t } })
const aLine = (t: string): string => JSON.stringify(cA([{ type: 'text', text: t }]))

describe('a range fetch agrees with a full parse (the anchor)', () => {
  test('for every turn: the blocks from the offset path == the corresponding turn\'s blocks from the whole-file path', async () => {
    const raw = [
      uLine('问一'),
      aLine('答一'),
      JSON.stringify(cA([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }])),
      JSON.stringify(cU([{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }])),
      uLine('问二'),
      aLine('答二')
    ].join('\n') + '\n'
    await withFile(raw, async (file) => {
      const recs = await indexFile(file, 'claude')
      expect(recs).toHaveLength(2)
      const whole = await readRanges(file, recs.map((r) => ({ start: r[1], end: r[2] })))
      for (let i = 0; i < recs.length; i++) {
        const { texts } = await readRanges(file, [{ start: recs[i][1], end: recs[i][2] }])
        expect(turnBlocksFromText('claude', texts[0])).toEqual(turnBlocksFromText('claude', whole.texts[i]))
      }
      // The first turn: the tool is already paired (its output is in place)
      const t = turnBlocksFromText('claude', whole.texts[0]).find((b) => b.kind === 'tool')
      expect(t && t.kind === 'tool' && t.output).toBe('ok')
    })
  })

  test('a single turn\'s bytes read is independent of the total file size (no wall clock, as ticket 05 established)', async () => {
    const turn1 = [uLine('问一'), aLine('答一')].join('\n') + '\n'
    const small = turn1 + [uLine('问二'), aLine('答二')].join('\n') + '\n'
    const big = turn1 + [uLine('问二'), aLine('大'.repeat((5 * 1024 * 1024) / 3))].join('\n') + '\n'
    const bytesOfTurn1 = async (text: string): Promise<number> =>
      withFile(text, async (file) => {
        const recs = await indexFile(file, 'claude')
        const { bytesRead } = await readRanges(file, [{ start: recs[0][1], end: recs[0][2] }])
        return bytesRead
      })
    expect(await bytesOfTurn1(small)).toBe(await bytesOfTurn1(big))
  })
})
