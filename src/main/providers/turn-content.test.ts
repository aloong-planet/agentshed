import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eachJsonlLine } from './jsonl'
import { makeGrokQuestionIndexer, makeQuestionIndexer, type QuestionRec } from './question-index'
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
    expect(blocks('claude', [cA([{ type: 'text', text: 'answer one' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'answer one' }
    ])
    expect(blocks('claude', [cA([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'A\nB' }
    ])
    expect(blocks('claude', [cA([{ type: 'text', text: '  ' }])])).toEqual([])
  })

  test('a thinking segment yields a think block, with the within-line order thinking → prose → tools', () => {
    const bs = blocks('claude', [
      cA([
        { type: 'thinking', thinking: 'thinking it over' },
        { type: 'text', text: 'the answer' },
        { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }
      ])
    ])
    expect(bs.map((b) => b.kind)).toEqual(['think', 'text', 'tool'])
    expect(bs[0]).toEqual({ kind: 'think', at: AT, body: 'thinking it over' })
  })
})

describe('Claude tool blocks (tool_use ↔ tool_result paired by id)', () => {
  test('pairs the arguments with the return; a one-line summary; an output never fed back is null', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls -la' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: '3 files in total' }]),
      cA([{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: '/a.ts' } }])
    ])
    expect(bs).toHaveLength(2)
    const [t1, t2] = bs as Array<Extract<TurnBlock, { kind: 'tool' }>>
    expect(t1.kind).toBe('tool')
    expect(t1.name).toBe('Bash')
    expect(t1.summary).toContain('ls -la')
    expect(t1.input).toContain('ls -la')
    expect(t1.output).toBe('3 files in total')
    expect(t1.truncated).toBe(false)
    expect(t2.output).toBeNull()
  })

  test('when tool_result content is an array of segments, the text segments are joined', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Grep', input: { pattern: 'x' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'hit 1' }, { type: 'text', text: 'hit 2' }] }])
    ])
    expect((bs[0] as Extract<TurnBlock, { kind: 'tool' }>).output).toBe('hit 1\nhit 2')
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
      cA([{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { description: 'check logs', prompt: 'check the logs', subagent_type: 'debugger' } }]),
      // A sidechain line within the turn: no stable reference chain to a dispatch, so it is neither
      // rendered nor grouped
      cA([{ type: 'text', text: 'let me look at the log file first' }], { isSidechain: true, agentId: 'a1b2c3d4e5f6a7b8c' }),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'logs are clean' }] }], {
        toolUseResult: { agentId: 'ac50856', status: 'completed', prompt: 'check the logs' }
      })
    ])
    expect(bs).toHaveLength(1)
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.kind).toBe('sub')
    expect(sub.name).toBe('debugger')
    expect(sub.prompt).toBe('check the logs')
    expect(sub.result).toBe('logs are clean')
    expect(sub.steps).toEqual([])
    expect(sub.unlinked).toBe(true)
  })

  test('with no subagent_type the dispatch name falls back to the tool name; with nothing fed back, result is null', () => {
    const bs = blocks('claude', [cA([{ type: 'tool_use', id: 'tu1', name: 'Task', input: { prompt: 'do the work' } }])])
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.name).toBe('Task')
    expect(sub.result).toBeNull()
  })

  test('a sidechain line yields no block and no unknown count — a known type whose full transcript is in the source or a nested file', () => {
    expect(blocks('claude', [cA([{ type: 'text', text: 'what the subagent said' }], { isSidechain: true, agentId: 'ag-x' })])).toEqual([])
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
      cA([{ type: 'text', text: 'body' }]),
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'new_thing', timestamp: TS }
    ])
    expect(bs[0].kind).toBe('text')
    expect(bs[bs.length - 1]).toEqual({ kind: 'unknown', count: 3, types: ['agent_snapshot', 'new_thing'] })
  })

  test('a non-string type is named by its JSON, not as [object Object]', () => {
    expect(blocks('claude', [{ type: { kind: 'x' }, timestamp: TS }])).toEqual([
      { kind: 'unknown', count: 1, types: ['{"kind":"x"}'] }
    ])
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
      xRI({ type: 'reasoning', id: 'r1', summary: [{ type: 'summary_text', text: '**compare the directories first**' }, { type: 'summary_text', text: 'then look at the differences' }], encrypted_content: 'gAAA…' }),
      xRI({ type: 'reasoning', id: 'r2', summary: [], encrypted_content: 'gAAA…' })
    ])
    expect(bs).toEqual([{ kind: 'reason', at: AT, titles: ['**compare the directories first**', 'then look at the differences'] }])
  })

  test('event_msg/agent_reasoning is a mirror and yields no block (to avoid double counting)', () => {
    expect(blocks('codex', [xEvent({ type: 'agent_reasoning', text: 'sub-heading' })])).toEqual([])
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
        xRI({ type: 'agent_message', message: 'mirror' })
      ])
    ).toEqual([])
  })

  test('a paginated turn: prose comes from the completed-item agent message, the item mirrors and the paginated top-level types leave no block and no trace (spec C8)', () => {
    // The item types come from the full enumeration of 2026-09-10 (60245 completed-item events); none but
    // the agent message yields a block — the tool renders once, from its response_item record, and the
    // MCP and web-search items render nothing on either format (a stated gap, spec C8)
    const bs = blocks('codex', [
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'Reasoning', id: 'i', summary_text: [], raw_content: [] }, started_at_ms: 1, completed_at_ms: 1 }),
      xRI({ type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'ls' }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'CommandExecution', id: 'i', command: 'ls', status: 'completed' }, started_at_ms: 1, completed_at_ms: 1 }),
      xRI({ type: 'custom_tool_call_output', call_id: 'c1', output: 'ok' }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'FileChange', id: 'i', changes: [] }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'McpToolCall', id: 'i', server: 's', tool: 't' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'WebSearch', id: 'i', query: 'q' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'DynamicToolCall', id: 'i', namespace: 'files', tool: 'find', arguments: {}, status: 'completed' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'CollabAgentToolCall', id: 'i', tool: 'spawn_agent' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'ImageView', id: 'i', path: 'x.png' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'Extension', id: 'i', name: 'e' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'SubAgentActivity', id: 'i', activity: 'x' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'ContextCompaction', id: 'i' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'UserMessage', id: 'i', content: [{ type: 'text', text: '<task-notification>…', text_elements: [] }] }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'AgentMessage', id: 'i', content: [{ type: 'Text', text: '' }], phase: 'commentary' }, started_at_ms: 1, completed_at_ms: 1 }),
      xEvent({ type: 'item_completed', thread_id: 't', turn_id: 'u', item: { type: 'AgentMessage', id: 'i', content: [{ type: 'Text', text: 'The answer.' }], phase: 'final_answer' }, started_at_ms: 1, completed_at_ms: 1 }),
      { type: 'token_usage_record', timestamp: TS, payload: { response_id: 'r', usage: {} } },
      { type: 'compacted', timestamp: TS, payload: { message: '', replacement_history: [] } },
      xRI({ type: 'compaction', id: 'cmp_1', encrypted_content: 'gAAA' })
    ])
    expect(bs).toEqual([
      { kind: 'tool', at: Date.parse(TS), name: 'exec', summary: 'ls', input: 'ls', output: 'ok', truncated: false },
      { kind: 'text', role: 'assistant', at: Date.parse(TS), body: 'The answer.' }
    ])
  })

  test('a non-string type is named by its JSON at every level, not as [object Object]', () => {
    const bs = blocks('codex', [
      { type: { v: 1 }, timestamp: TS },
      xEvent({ type: ['e'] }),
      xEvent({ type: 'item_completed', item: { type: { i: 2 } } }),
      xRI({ type: 7 })
    ])
    expect(bs).toEqual([
      { kind: 'unknown', count: 4, types: ['{"v":1}', 'event_msg/["e"]', 'item_completed/{"i":2}', 'response_item/7'] }
    ])
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
    const raw = [JSON.stringify(cA([{ type: 'text', text: 'good line' }])), '{ bad line'].join('\n')
    expect(turnBlocksFromText('claude', raw)).toHaveLength(1)
    expect(blocks('codex', [cA([{ type: 'text', text: 'claude line' }])])).toEqual([{ kind: 'unknown', count: 1, types: ['assistant'] }])
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
      uLine('question one'),
      aLine('answer one'),
      JSON.stringify(cA([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }])),
      JSON.stringify(cU([{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }])),
      uLine('question two'),
      aLine('answer two')
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
    const turn1 = [uLine('question one'), aLine('answer one')].join('\n') + '\n'
    const small = turn1 + [uLine('question two'), aLine('answer two')].join('\n') + '\n'
    const big = turn1 + [uLine('question two'), aLine('x'.repeat((5 * 1024 * 1024) / 3))].join('\n') + '\n'
    const bytesOfTurn1 = async (text: string): Promise<number> =>
      withFile(text, async (file) => {
        const recs = await indexFile(file, 'claude')
        const { bytesRead } = await readRanges(file, [{ start: recs[0][1], end: recs[0][2] }])
        return bytesRead
      })
    expect(await bytesOfTurn1(small)).toBe(await bytesOfTurn1(big))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Ticket #125: the Grok block model. Grounded in a full enumeration of this machine's update
// streams (17 sessionUpdate types, 2026-08-16). The load-bearing measured fact: one assistant
// message can be split across agent_message_chunk records MID-WORD with state records
// (current_mode_update) between the fragments — so adjacent same-kind chunks merge with no
// injected separator, and the enumerated state records must not break the merge.
describe('the Grok block model (ticket #125)', () => {
  const gline = (tsSec: number, update: Record<string, unknown>): string =>
    JSON.stringify({ timestamp: tsSec, method: '_x.ai/session/update', params: { sessionId: 's', update } })

  test('prose fragments split mid-word merge raw across state records; thinking, tools and order survive', () => {
    const raw = [
      gline(100, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'plan the table' } }),
      gline(100, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'A tracker:\n\n| # | Block' } }),
      gline(100, { sessionUpdate: 'current_mode_update', currentModeId: 'code' }),
      gline(100, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ed by |\n|---|---|' } }),
      gline(101, {
        sessionUpdate: 'tool_call',
        toolCallId: 'c1',
        title: 'read_file',
        rawInput: { target_file: '/x/y.md' },
        _meta: { 'x.ai/tool': { name: 'read_file', label: 'Read' } }
      }),
      gline(101, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'c1',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'file body here' } }]
      }),
      gline(102, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done reading.' } })
    ].join('\n')
    const blocks = turnBlocksFromText('grok', raw)
    expect(blocks.map((b) => b.kind)).toEqual(['think', 'text', 'tool', 'text'])
    expect((blocks[0] as { body: string }).body).toBe('plan the table')
    // The decisive assertion: "Block" + "ed by" reunite with no separator injected
    expect((blocks[1] as { body: string }).body).toBe('A tracker:\n\n| # | Blocked by |\n|---|---|')
    const tool = blocks[2] as { name: string | null; input: string; output: string | null; summary: string }
    expect(tool.name).toBe('read_file')
    expect(tool.input).toContain('/x/y.md')
    expect(tool.output).toBe('file body here')
    expect((blocks[3] as { body: string }).body).toBe('Done reading.')
  })

  test('Grok: the offset path == the whole-file path, and one turn\'s bytes read is far below the file size', async () => {
    const gU = (pi: number, text: string): string =>
      gline(100, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text }, _meta: { promptIndex: pi } })
    const raw =
      [
        gU(0, 'question one'),
        gline(100, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'answer one' } }),
        gU(1, 'question two'),
        gline(101, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'y'.repeat(2 * 1024 * 1024) } })
      ].join('\n') + '\n'
    await withFile(raw, async (file) => {
      const idx = makeGrokQuestionIndexer()
      let fileEnd = 0
      await eachJsonlLine(file, (obj, start, end) => {
        idx.line(obj, start, end)
        fileEnd = end
      })
      const recs = idx.done(fileEnd)
      expect(recs).toHaveLength(2)
      const whole = await readRanges(file, recs.map((r) => ({ start: r[1], end: r[2] })))
      const one = await readRanges(file, [{ start: recs[0][1], end: recs[0][2] }])
      expect(turnBlocksFromText('grok', one.texts[0])).toEqual(turnBlocksFromText('grok', whole.texts[0]))
      expect((turnBlocksFromText('grok', one.texts[0])[0] as { body: string }).body).toBe('answer one')
      // Far below the file: the 2 MB padding turn is not touched by fetching turn one
      expect(one.bytesRead).toBeLessThan(2000)
      expect(statSync(file).size).toBeGreaterThan(2 * 1024 * 1024)
    })
  })

  test('a spawn dispatch is a sub block: name from subagent_spawned, result from the in-turn finished record, not its own tool update', () => {
    const raw = [
      gline(100, {
        sessionUpdate: 'tool_call',
        toolCallId: 'sp1',
        title: 'spawn_subagent',
        rawInput: { description: 'Research task', prompt: 'Investigate X thoroughly' }
      }),
      gline(100, {
        sessionUpdate: 'subagent_spawned',
        subagent_id: 'child-1',
        child_session_id: 'child-1',
        subagent_type: 'general-purpose',
        description: 'Research task'
      }),
      gline(100, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'sp1',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'Subagent started in background.\nsubagent_id: child-1' } }]
      }),
      gline(300, {
        sessionUpdate: 'subagent_finished',
        subagent_id: 'child-1',
        child_session_id: 'child-1',
        status: 'completed',
        tool_calls: 7,
        turns: 1,
        output: 'The research result body'
      })
    ].join('\n')
    const blocks = turnBlocksFromText('grok', raw)
    expect(blocks.map((b) => b.kind)).toEqual(['sub'])
    const sub = blocks[0] as { name: string | null; prompt: string; result: string | null; unlinked: boolean; steps: unknown[] }
    expect(sub.name).toBe('general-purpose')
    expect(sub.prompt).toBe('Investigate X thoroughly')
    expect(sub.result, 'the result is the finished record\'s output, never the "started in background" tool echo').toBe('The research result body')
    expect(sub.unlinked).toBe(true)
    expect(sub.steps).toEqual([])
  })

  test('a record without an update is named by its method; a non-string method by its JSON, a missing one as <no-update>', () => {
    const raw = [
      JSON.stringify({ method: 'session/cancel', params: {} }),
      JSON.stringify({ method: 7, params: {} }),
      JSON.stringify({ method: { name: 'odd' }, params: {} }),
      JSON.stringify({ params: {} })
    ].join('\n')
    const blocks = turnBlocksFromText('grok', raw)
    expect(blocks).toEqual([{ kind: 'unknown', count: 4, types: ['session/cancel', '7', '{"name":"odd"}', '<no-update>'] }])
  })

  test('enumerated state records leave no trace; an unknown update type does; an injected user notice renders nothing', () => {
    const raw = [
      gline(100, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' } }),
      gline(100, { sessionUpdate: 'plan', entries: [] }),
      gline(100, { sessionUpdate: 'session_recap', text: 'x' }),
      gline(100, { sessionUpdate: 'retry_state', attempt: 1 }),
      gline(100, { sessionUpdate: 'task_completed', id: 't' }),
      gline(100, { sessionUpdate: 'task_backgrounded', id: 't' }),
      gline(100, { sessionUpdate: 'auto_compact_started' }),
      gline(100, { sessionUpdate: 'auto_compact_completed' }),
      gline(100, { sessionUpdate: 'compaction_checkpoint' }),
      gline(100, { sessionUpdate: 'turn_completed', usage: {} }),
      gline(100, {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: '<system-reminder>\nBackground task finished.\n</system-reminder>' },
        _meta: { promptIndex: 3 }
      }),
      gline(100, { sessionUpdate: 'brand_new_thing', payload: 1 })
    ].join('\n')
    const blocks = turnBlocksFromText('grok', raw)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'unknown'])
    const unknown = blocks[1] as { types: string[]; count: number }
    expect(unknown.types).toEqual(['update/brand_new_thing'])
    expect(unknown.count).toBe(1)
  })
})
