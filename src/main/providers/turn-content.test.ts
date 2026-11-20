import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { QuestionRec } from './question-index'
import { runParseJob } from './token-stats'
import { MEASURED_TRANSCRIPT, transcriptText } from '../testing/agy-transcript-fixture'
import { withIndexedTranscript } from '../testing/agy-transcript-index'
import { readRanges } from './range-read'
import { turnBlocks } from './turn-content'
import { readTurn as readTurnOf, type TurnRead } from './turn-read'
import type { TurnBlock } from '@shared/domain'

// ─────────────────────────────────────────────────────────────────────────
// Ticket 05 established the prose model and ticket 07 completed it (tool / thinking / reasoning /
// subagent / unknown trace).
//
// The rules are grounded in a full enumeration (prose on 2026-08-05, rich content on 2026-08-06; an
// AGENTS.md invariant):
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

/** The blocks a turn read handed over of a side whose turns the engine module assembles */
function blocksOf(read: TurnRead): TurnBlock[] {
  if (read.body === null || !('blocks' in read.body)) throw new Error('the read handed over no blocks')
  return read.body.blocks
}

/** A turn of `side`, a side whose turns the engine module assembles, whose body is `lines`, written as a session file of
 * its own and read whole by the engine module, which assembles its blocks, as the session page reads a turn */
const engineTurn = (side: 'claude' | 'codex' | 'grok', lines: string[]): Promise<TurnBlock[]> =>
  withFile(lines.map((l) => `${l}\n`).join(''), async (file) => blocksOf(await readTurnOf(side, file, { start: 0, end: 0 }, { start: 0, end: statSync(file).size })))

/** A Claude Code turn whose body is `lines` (`engineTurn`) */
const claudeTurn = (lines: string[]): Promise<TurnBlock[]> => engineTurn('claude', lines)

/** A Grok turn whose body is `lines` (`engineTurn`) */
const grokTurn = (lines: string[]): Promise<TurnBlock[]> => engineTurn('grok', lines)

/** `claudeTurn` of the lines `objs` written as JSON */
const claudeBlocks = (objs: unknown[]): Promise<TurnBlock[]> => claudeTurn(objs.map((o) => JSON.stringify(o)))

/** A Codex turn whose body is `lines` (`engineTurn`) */
const codexTurn = (lines: string[]): Promise<TurnBlock[]> => engineTurn('codex', lines)

/** `codexTurn` of the lines `objs` written as JSON */
const codexBlocks = (objs: unknown[]): Promise<TurnBlock[]> => codexTurn(objs.map((o) => JSON.stringify(o)))

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
  test('a text segment yields a prose block; several text segments on one line merge into one; whitespace yields nothing', async () => {
    expect(await claudeBlocks([cA([{ type: 'text', text: 'answer one' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'answer one' }
    ])
    expect(await claudeBlocks([cA([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'A\nB' }
    ])
    expect(await claudeBlocks([cA([{ type: 'text', text: '  ' }])])).toEqual([])
  })

  test('a thinking segment yields a think block, with the within-line order thinking → prose → tools', async () => {
    const bs = await claudeBlocks([
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
  test('pairs the arguments with the return; a one-line summary; an output never fed back is null', async () => {
    const bs = await claudeBlocks([
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

  test('when tool_result content is an array of segments, the text segments are joined', async () => {
    const bs = await claudeBlocks([
      cA([{ type: 'tool_use', id: 'tu1', name: 'Grep', input: { pattern: 'x' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'hit 1' }, { type: 'text', text: 'hit 2' }] }])
    ])
    expect((bs[0] as Extract<TurnBlock, { kind: 'tool' }>).output).toBe('hit 1\nhit 2')
  })

  test('the truncation criterion: a return containing a tool-results/ sidecar path → truncated, without pretending it is complete', async () => {
    const bs = await claudeBlocks([
      cA([{ type: 'tool_use', id: 'tu1', name: 'WebFetch', input: { url: 'https://x' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: 'output saved to: /Users/x/.claude/projects/-p/s/tool-results/abc.txt\n\nPreview (first 2KB): …' }])
    ])
    expect((bs[0] as Extract<TurnBlock, { kind: 'tool' }>).truncated).toBe(true)
  })
})

describe('Claude subagent blocks (dispatch + return + the unattributed label; no grouping without a sample)', () => {
  test('the dispatch name comes from subagent_type; prompt and result pair up; unlinked is always true (measured: no join key)', async () => {
    const bs = await claudeBlocks([
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

  test('with no subagent_type the dispatch name falls back to the tool name; with nothing fed back, result is null', async () => {
    const bs = await claudeBlocks([cA([{ type: 'tool_use', id: 'tu1', name: 'Task', input: { prompt: 'do the work' } }])])
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.name).toBe('Task')
    expect(sub.result).toBeNull()
  })

  test('a sidechain line yields no block and no unknown count — a known type whose full transcript is in the source or a nested file', async () => {
    expect(await claudeBlocks([cA([{ type: 'text', text: 'what the subagent said' }], { isSidechain: true, agentId: 'ag-x' })])).toEqual([])
  })
})

describe('the Claude display allow-list and unknown traces (the whole 18-type top-level spectrum)', () => {
  test('known noise is neither rendered nor traced: system / attachment / file-history-snapshot / mode and the rest', async () => {
    expect(
      await claudeBlocks([
        { type: 'system', subtype: 'compact_boundary', timestamp: TS },
        { type: 'attachment', attachment: { type: 'task_reminder' }, timestamp: TS },
        { type: 'file-history-snapshot', messageId: 'x', timestamp: TS },
        { type: 'mode', timestamp: TS },
        { type: 'queue-operation', timestamp: TS }
      ])
    ).toEqual([])
  })

  test('a new type outside the allow-list leaves a trace: the type name is named, the count accumulates, and it goes at the end of the block order', async () => {
    const bs = await claudeBlocks([
      cA([{ type: 'text', text: 'body' }]),
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'new_thing', timestamp: TS }
    ])
    expect(bs[0].kind).toBe('text')
    expect(bs[bs.length - 1]).toEqual({ kind: 'unknown', count: 3, types: ['agent_snapshot', 'new_thing'] })
  })

  test('a non-string type is named by its JSON, not as [object Object]', async () => {
    expect(await claudeBlocks([{ type: { kind: 'x' }, timestamp: TS }])).toEqual([
      { kind: 'unknown', count: 1, types: ['{"kind":"x"}'] }
    ])
  })
})

// ── A Claude Code turn as the engine module reads its lines (#494): the forms a line can write a value in that the
// cases above do not, each held to what JSON.parse, JSON.stringify and Date.parse give the same line ──

/** A `\u` escape as JSON text writes it, of the code unit `hex` */
const esc = (hex: string): string => `${'\\'}u${hex}`
const unit = (u: number): string => String.fromCharCode(u)

/** An assistant's line, written as text, whose one segment is `segment`, itself text */
const assistantLine = (segment: string, at = `"${TS}"`): string =>
  `{"type":"assistant","timestamp":${at},"message":{"role":"assistant","content":[${segment}]}}`
/** A tool call whose input is `input`, written as text */
const callWith = (input: string, id = '"tu1"'): string => `{"type":"tool_use","id":${id},"name":"Bash","input":${input}}`
/** A user's line, written as text, returning `content` for the call `id` */
const returnLine = (content: string, id = '"tu1"'): string =>
  `{"type":"user","timestamp":"${TS}","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":${id},"content":${content}}]}}`

/** The one tool block of a turn */
async function toolOf(lines: string[]): Promise<Extract<TurnBlock, { kind: 'tool' }>> {
  const tools = (await claudeTurn(lines)).filter((b) => b.kind === 'tool')
  expect(tools).toHaveLength(1)
  return tools[0]
}

describe('a Claude Code tool\'s input is shown as JSON.stringify(value, null, 2) gives the value JSON.parse reads', () => {
  test.each([
    ['nested containers, empty ones among them', '{"command":"ls -la","options":{"all":true,"depth":2,"paths":["/a","/b"]},"empty":{},"none":[]}'],
    ['array index keys first, ascending; any other key in the order written', '{"b":1,"10":"ten","2":"two","a":[],"0":0,"01":"no index","4294967294":"the last index","4294967295":"no index","-1":"no index"}'],
    ['a repeated key: once, at its first place, with its last value', '{"a":1,"b":2,"a":{"c":3}}'],
    ['a repeated key written once with an escape', `{"a":1,"b":2,"${esc('0061')}":3}`],
    ['numbers as Number::toString writes the double', '[1.0,1e400,-1e400,-0,1e21,1e-7,0.1,0.000001,123456789012345678901234,5e-324,-1.5e-10,100,2.5E+3]'],
    ['string escapes, a lone surrogate among them', `{"s":"line\\nnext\\ttab \\"q\\" \\\\ \\/ ${esc('0000')} ${esc('001f')} ${esc('d800')} ${esc('dc00')}x ${esc('d83d')}${esc('de00')} ${esc('2028')} ${esc('00e9')}"}`],
    ['text outside ASCII, as written', `{"${unit(0xe9)}t${unit(0xe9)}":"${unit(0x2014)} ${String.fromCodePoint(0x1f600)}"}`],
    ['the key __proto__, an own member as JSON.parse makes it', '{"__proto__":{"x":1},"y":2}'],
    // A line feed would end the line
    ['white space between tokens', '{ "a" :\t[ 1 ,\r 2 ] , "b" : { } }'],
    ['containers nested', '[[[[{"a":[{}],"b":[[]]}]]]]'],
    ['an empty object', '{}'],
    ['an empty array', '[]'],
    ['a number', '42'],
    ['true', 'true'],
    ['false', 'false']
  ])('%s', async (_what, input) => {
    expect((await toolOf([assistantLine(callWith(input))])).input).toBe(JSON.stringify(JSON.parse(input), null, 2))
  })

  test.each([
    ['a string, as it is', '"cat a.txt"', 'cat a.txt'],
    ['a string\'s escapes decoded', `"a\\tb ${esc('d83d')}${esc('de00')}"`, `a\tb ${String.fromCodePoint(0x1f600)}`],
    ['null, as nothing', 'null', '']
  ])('%s', async (_what, input, shown) => {
    expect((await toolOf([assistantLine(callWith(input))])).input).toBe(shown)
  })

  test('no input, as nothing', async () => {
    expect((await toolOf([assistantLine('{"type":"tool_use","id":"tu1","name":"Bash"}')])).input).toBe('')
  })
})

/** Every code unit JavaScript's `/\s/` matches, each unit tried */
const JS_SPACE = Array.from({ length: 0x10000 }, (_, u) => u).filter((u) => /\s/.test(unit(u)))

describe('a Claude Code tool\'s one-line summary: its input\'s white space runs one space, its ends trimmed, past 88 code units clipped', () => {
  const x = (n: number): string => 'x'.repeat(n)
  const spaces = JS_SPACE.map((u) => esc(u.toString(16).padStart(4, '0')))
  const run = spaces.join('')
  test.each([
    // Letters apart by each unit alone, by a run of them all, and the ends runs of them all
    ['runs of white space, JavaScript\'s whole set', `"${run}x${spaces.join('x')}x${run}x${run}"`, Array(27).fill('x').join(' ')],
    ['units JavaScript does not take as white space, kept', `"a${esc('0085')}b${esc('200b')}c"`, `a${unit(0x85)}b${unit(0x200b)}c`],
    ['an input shown as JSON', '{"command":"ls"}', '{ "command": "ls" }'],
    ['88 code units, as they are', `"${x(88)}"`, x(88)],
    ['89 code units, clipped to 88 and an ellipsis', `"${x(89)}"`, `${x(88)}${unit(0x2026)}`],
    ['88 code units and trailing white space, trimmed rather than clipped', `"${x(88)}   "`, x(88)],
    ['a space at the clip, kept', `"${x(87)}  y"`, `${x(87)} ${unit(0x2026)}`],
    ['a surrogate pair cut at the clip, its high half kept as the clip cuts it', `"${x(87)}${String.fromCodePoint(0x1f600)}y"`, `${x(87)}${unit(0xd83d)}${unit(0x2026)}`],
    ['nothing but white space, nothing', '"  \\n "', '']
  ])('%s', async (_what, input, summary) => {
    expect((await toolOf([assistantLine(callWith(input))])).summary).toBe(summary)
  })
})

describe('a Claude Code tool\'s return: the text its content holds', () => {
  test.each([
    // The line's longest well formed string, so decoded in the line's own buffer: escapes of each length, one of them
    // in upper-case hex digits
    ['a string, its escapes decoded', `"x\\ny ${esc('001b')}[31m ${esc('00C9')} ${esc('d83d')}${esc('de00')} ${esc('2028')} end"`,
      `x\ny ${unit(0x1b)}[31m ${unit(0xc9)} ${String.fromCodePoint(0x1f600)} ${unit(0x2028)} end`],
    ['an array: the string text of each element that is an object, a line each',
      '[{"type":"text","text":"one"},"a string",{"type":"image","source":{}},{"text":5},[{"text":"in an array"}],{"type":"text","text":"two","text":"three"}]', 'one\nthree'],
    ['an empty array, nothing', '[]', ''],
    ['null, nothing', 'null', '']
  ])('%s', async (_what, content, shown) => {
    expect((await toolOf([assistantLine(callWith('{}')), returnLine(content)])).output).toBe(shown)
  })

  test.each([
    ['an object', '{"b":1,"a":[1,{"2":0,"1":0}]}'],
    ['a number', '3.0'],
    ['true', 'true']
  ])('any other value, as JSON.stringify(value, null, 2) gives it: %s', async (_what, content) => {
    expect((await toolOf([assistantLine(callWith('{}')), returnLine(content)])).output).toBe(JSON.stringify(JSON.parse(content), null, 2))
  })

  test('no content, nothing', async () => {
    const line = `{"type":"user","timestamp":"${TS}","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1"}]}}`
    expect((await toolOf([assistantLine(callWith('{}')), line])).output).toBe('')
  })
})

describe('the trace of a Claude Code turn\'s unknown types names each type as the line writes it', () => {
  test.each([
    ['a number', '{"type":5}', ['5']],
    ['null', '{"type":null}', ['null']],
    ['a boolean', '{"type":true}', ['true']],
    ['an array', '{"type":[1,"a"]}', ['[1,"a"]']],
    ['an object, its keys in the engine\'s order', '{"type":{"b":1,"1":0,"a":{"c":[]}}}', ['{"1":0,"b":1,"a":{"c":[]}}']],
    ['a string with escapes, decoded', `{"type":"new${esc('005f')}type"}`, ['new_type']],
    ['none', '{"timestamp":"x"}', ['undefined']],
    ['a line that is an array, which has none', '[{"type":"assistant"}]', ['undefined']],
    ['a repeated type: the last', '{"type":"assistant","type":"brand_new"}', ['brand_new']]
  ])('%s', async (_what, line, types) => {
    expect(await claudeTurn([line])).toEqual([{ kind: 'unknown', count: 1, types }])
  })

  test.each([
    ['a known type written last', '{"type":"brand_new","type":"system"}'],
    ['a string', '"a string"'],
    ['a number', '42'],
    ['null', 'null'],
    ['a line JSON.parse refuses', '{"type":"brand_new",}'],
    ['an empty line', '']
  ])('%s leaves no trace', async (_what, line) => {
    expect(await claudeTurn([line])).toEqual([])
  })

  test('types in the order first met, each once, and every line counted', async () => {
    const bs = await claudeTurn(['{"type":"b"}', '{"type":"a"}', '{"type":"b"}', '{"type":5}', '[]'])
    expect(bs).toEqual([{ kind: 'unknown', count: 5, types: ['b', 'a', '5', 'undefined'] }])
  })
})

describe('a Claude Code turn\'s text as JavaScript holds it: a lone surrogate kept, invalid UTF-8 replaced', () => {
  test('a lone surrogate escape in prose, thinking, a tool\'s name, input, return and id, and a type, each kept as that code unit', async () => {
    const lone = esc('d800')
    // In the prose: a high half before a letter, a low half alone, a high half before an escape that is no low half
    const prose = `a${lone}b${esc('dc00')}c${lone}${esc('0041')}`
    const bs = await claudeTurn([
      // A low half the first lone one in the thinking
      assistantLine(`{"type":"thinking","thinking":"t${esc('dc00')}"},{"type":"text","text":"${prose}"},{"type":"tool_use","id":"i${esc('dc00')}","name":"n${lone}","input":"in${lone}"}`),
      returnLine(`"out${lone} tool-results/x"`, `"i${esc('dc00')}"`),
      `{"type":"x${lone}"}`
    ])
    const l = unit(0xd800)
    expect(bs).toEqual([
      { kind: 'think', at: AT, body: `t${unit(0xdc00)}` },
      { kind: 'text', role: 'assistant', at: AT, body: `a${l}b${unit(0xdc00)}c${l}A` },
      { kind: 'tool', at: AT, name: `n${l}`, summary: `in${l}`, input: `in${l}`, output: `out${l} tool-results/x`, truncated: true },
      { kind: 'unknown', count: 1, types: [`x${l}`] }
    ])
  })

  test('bytes that are not UTF-8, inside a line\'s strings, each replaced as Buffer.toString replaces them', async () => {
    const bytes = [Buffer.from([0xff]), Buffer.from([0xe4, 0xb8]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80])]
    const [before, after] = assistantLine('{"type":"text","text":"aMARKb"}').split('MARK')
    const line = Buffer.concat([Buffer.from(before), ...bytes, Buffer.from(after)])
    const dir = mkdtempSync(join(tmpdir(), 'turn-'))
    try {
      const file = join(dir, 's.jsonl')
      writeFileSync(file, Buffer.concat([line, Buffer.from('\n')]))
      const read = await readTurnOf('claude', file, { start: 0, end: 0 }, { start: 0, end: statSync(file).size })
      const shown = (JSON.parse(line.toString('utf8')) as { message: { content: Array<{ text: string }> } }).message.content[0].text
      expect(blocksOf(read)).toEqual([{ kind: 'text', role: 'assistant', at: AT, body: shown }])
      expect(shown.split(unit(0xfffd)).length - 1).toBe(7)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('a Claude Code block\'s time is what Date.parse gives its line\'s timestamp', () => {
  test.each([
    '2026-08-01T10:00:00.000Z',
    '2026-08-01T10:00:00Z',
    '2026-08-01T10:00:00.000+08:00',
    '2026-08-01 10:00:00',
    'Aug 1, 2026',
    '2026-02-30T00:00:00Z',
    '2026-13-01T00:00:00.000Z',
    'not a date',
    ''
  ])('%j', async (timestamp) => {
    const [text] = await claudeTurn([assistantLine('{"type":"text","text":"a"}', JSON.stringify(timestamp))])
    const ms = Date.parse(timestamp)
    expect(text).toEqual({ kind: 'text', role: 'assistant', at: Number.isNaN(ms) ? null : ms, body: 'a' })
  })

  test.each([
    ['a number', '1754042400000'],
    ['null', 'null']
  ])('a timestamp that is %s, none', async (_what, timestamp) => {
    expect((await claudeTurn([assistantLine('{"type":"text","text":"a"}', timestamp)]))[0]).toMatchObject({ at: null })
  })
})

describe('a Claude Code return pairs with its call by id', () => {
  const outputs = (bs: TurnBlock[]): unknown[] => bs.map((b) => (b.kind === 'tool' ? ['tool', b.output] : b.kind === 'sub' ? ['sub', b.result] : [b.kind]))

  test('a second return for one id replaces the first', async () => {
    expect(outputs(await claudeTurn([assistantLine(callWith('{}')), returnLine('"one"'), returnLine('"two"')]))).toEqual([['tool', 'two']])
  })

  test('an id a later call takes again: each return goes to the call last made with it', async () => {
    const bs = await claudeTurn([assistantLine(callWith('{}')), returnLine('"one"'), assistantLine(callWith('{}')), returnLine('"two"')])
    expect(outputs(bs)).toEqual([['tool', 'one'], ['tool', 'two']])
  })

  test('an id a tool and a subagent\'s dispatch both took: the return is the tool\'s', async () => {
    const dispatch = '{"type":"tool_use","id":"tu1","name":"Agent","input":{"prompt":"p"}}'
    for (const lines of [[callWith('{}'), dispatch], [dispatch, callWith('{}')]]) {
      const bs = await claudeTurn([...lines.map((segment) => assistantLine(segment)), returnLine('"back"')])
      expect(outputs(bs)).toEqual(lines[0] === dispatch ? [['sub', null], ['tool', 'back']] : [['tool', 'back'], ['sub', null]])
    }
  })

  test('a return before its call, for an id no call made, or with an id that is no string, fills in nothing', async () => {
    const bs = await claudeTurn([returnLine('"early"'), assistantLine(callWith('{}')), returnLine('"other"', '"tu2"'), returnLine('"odd"', '1')])
    expect(outputs(bs)).toEqual([['tool', null]])
  })

  test('a call whose id is no string draws nothing; one whose name is no string names no tool', async () => {
    const bs = await claudeTurn([assistantLine(callWith('{}', '7')), assistantLine('{"type":"tool_use","id":"tu1","name":3,"input":{}}')])
    expect(bs).toEqual([{ kind: 'tool', at: AT, name: null, summary: '{}', input: '{}', output: null, truncated: false }])
  })
})

describe('a Claude Code subagent\'s dispatch: its name and its prompt', () => {
  test.each([
    ['a description when there is no prompt', '{"description":"d","subagent_type":"s"}', 's', 'd'],
    ['a description when the prompt is no string', '{"prompt":1,"description":"d"}', 'Agent', 'd'],
    ['nothing when there is neither', '{"subagent_type":2}', 'Agent', ''],
    ['the tool\'s name for an input that is an array', '["prompt","p"]', 'Agent', ''],
    ['the tool\'s name for an input that is a string', '"prompt"', 'Agent', ''],
    ['the last of a repeated field', '{"prompt":"a","prompt":"b","subagent_type":"x","subagent_type":"y"}', 'y', 'b']
  ])('%s', async (_what, input, name, prompt) => {
    const [sub] = await claudeTurn([assistantLine(`{"type":"tool_use","id":"tu1","name":"Agent","input":${input}}`)])
    expect(sub).toEqual({ kind: 'sub', at: AT, name, prompt, steps: [], result: null, unlinked: true })
  })
})

describe('the parts of a Claude Code line a turn draws', () => {
  test.each([
    ['thinking that is only white space', '{"type":"thinking","thinking":" \\n\\t"}'],
    ['thinking that is no string', '{"type":"thinking","thinking":["a"]}'],
    ['text that is no string', '{"type":"text","text":{"a":1}}'],
    ['a segment that is no object', '"text"'],
    ['a segment of a type it does not draw', '{"type":"image","source":{}}']
  ])('%s draws nothing', async (_what, segment) => {
    expect(await claudeTurn([assistantLine(segment)])).toEqual([])
  })

  test('texts joined by line feeds, an empty one among them', async () => {
    expect(await claudeTurn([assistantLine('{"type":"text","text":""},{"type":"text","text":"a"}')])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: '\na' }
    ])
  })

  test.each([
    ['content that is a string', `{"type":"assistant","timestamp":"${TS}","message":{"role":"assistant","content":"a"}}`],
    ['a message that is an array', `{"type":"assistant","message":[{"content":[{"type":"text","text":"a"}]}]}`],
    ['a repeated message, the last no object', `{"type":"assistant","message":{"content":[{"type":"text","text":"a"}]},"message":1}`],
    ['a repeated content, the last no array', `{"type":"assistant","message":{"content":[{"type":"text","text":"a"}],"content":{}}}`],
    ['a user\'s question', `{"type":"user","message":{"role":"user","content":"a question"}}`],
    ['a sidechain line, its flag repeated', `{"type":"assistant","isSidechain":false,"isSidechain":true,"message":{"content":[{"type":"text","text":"a"}]}}`]
  ])('%s: nothing drawn, nothing traced', async (_what, line) => {
    expect(await claudeTurn([line])).toEqual([])
  })

  test('a line whose sidechain flag is true and then false is drawn', async () => {
    const line = `{"type":"assistant","timestamp":"${TS}","isSidechain":true,"isSidechain":false,"message":{"content":[{"type":"text","text":"a"}]}}`
    expect(await claudeTurn([line])).toEqual([{ kind: 'text', role: 'assistant', at: AT, body: 'a' }])
  })
})

// ── Codex line builders ──
const xEvent = (payload: Record<string, unknown>): unknown => ({ type: 'event_msg', timestamp: TS, payload })
const xRI = (payload: Record<string, unknown>): unknown => ({ type: 'response_item', timestamp: TS, payload })

describe('Codex sub blocks', () => {
  test('spawn_agent yields a sub block: the unlinked label, with the sub-thread unattributed (ruled 2026-08-06)', async () => {
    const bs = await codexBlocks([
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
  test('event_msg/agent_reasoning is a mirror and yields no block (to avoid double counting)', async () => {
    expect(await codexBlocks([xEvent({ type: 'agent_reasoning', text: 'sub-heading' })])).toEqual([])
  })
})

describe('the Codex display allow-list and unknown traces', () => {
  test('known noise leaves no trace: token_count / task_started / turn_context / world_state / the double-write mirrors', async () => {
    expect(
      await codexBlocks([
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

  test('a paginated turn: prose comes from the completed-item agent message, the item mirrors and the paginated top-level types leave no block and no trace (spec C8)', async () => {
    // The item types come from the full enumeration of 2026-09-10 (60245 completed-item events); none but
    // the agent message yields a block — the tool renders once, from its response_item record, and the
    // MCP and web-search items render nothing on either format (a stated gap, spec C8)
    const bs = await codexBlocks([
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

  test('a non-string type is named by its JSON at every level, not as [object Object]', async () => {
    const bs = await codexBlocks([
      { type: { v: 1 }, timestamp: TS },
      xEvent({ type: ['e'] }),
      xEvent({ type: 'item_completed', item: { type: { i: 2 } } }),
      xRI({ type: 7 })
    ])
    expect(bs).toEqual([
      { kind: 'unknown', count: 4, types: ['{"v":1}', 'event_msg/["e"]', 'item_completed/{"i":2}', 'response_item/7'] }
    ])
  })

  test('unknown types at all three levels leave a trace: top level / the event_msg payload / the response_item payload', async () => {
    const bs = await codexBlocks([
      { type: 'brand_new_top', timestamp: TS },
      xEvent({ type: 'shiny_event' }),
      xRI({ type: 'shiny_item' })
    ])
    expect(bs).toEqual([
      { kind: 'unknown', count: 3, types: ['brand_new_top', 'event_msg/shiny_event', 'response_item/shiny_item'] }
    ])
  })
})

describe('what a Codex call shows', () => {
  const call = (fields: Record<string, unknown>): unknown => xRI({ type: 'function_call', name: 'exec', ...fields })

  test('its input, or its arguments when the input is null or absent: a string as written, any other value as indented JSON, none as nothing', async () => {
    const bs = await codexBlocks([
      call({ input: null, arguments: 'from the arguments' }),
      call({ arguments: 'no input' }),
      call({ input: false, arguments: 'not taken' }),
      call({ input: 0, arguments: 'not taken' }),
      call({ input: { cmd: 'ls', args: ['-l'] }, arguments: 'not taken' }),
      call({ arguments: { q: 1 } }),
      call({ input: null }),
      call({})
    ])
    expect(bs.map((b) => b.kind === 'tool' && [b.input, b.summary])).toEqual([
      ['from the arguments', 'from the arguments'],
      ['no input', 'no input'],
      ['false', 'false'],
      ['0', '0'],
      ['{\n  "cmd": "ls",\n  "args": [\n    "-l"\n  ]\n}', '{ "cmd": "ls", "args": [ "-l" ] }'],
      ['{\n  "q": 1\n}', '{ "q": 1 }'],
      ['', ''],
      ['', '']
    ])
  })

  test('the tool it names, or its type when it names none by a string', async () => {
    const bs = await codexBlocks([
      xRI({ type: 'custom_tool_call', input: 'i' }),
      xRI({ type: 'function_call', name: 7, arguments: 'a' }),
      xRI({ type: 'tool_search_call', name: null, arguments: 'q' })
    ])
    expect(bs.map((b) => b.kind === 'tool' && b.name)).toEqual(['custom_tool_call', 'function_call', 'tool_search_call'])
  })

  test('what it returned: the output of any of the three output types whose call_id is the one the call was last made with, an empty one being none, the last of them, shown as an input is', async () => {
    const out = (fields: Record<string, unknown>): unknown => xRI({ type: 'function_call_output', ...fields })
    const bs = await codexBlocks([
      out({ call_id: 'early', output: 'before its call' }),
      call({ name: 'a', call_id: 'early' }),
      call({ name: 'b', call_id: 'c1' }),
      xRI({ type: 'custom_tool_call_output', call_id: 'c1', output: { lines: 2 } }),
      call({ name: 'c', call_id: 'c2' }),
      out({ call_id: 'c2', output: 'first' }),
      out({ call_id: 'c2', output: 'second' }),
      call({ name: 'd', call_id: 'c3' }),
      call({ name: 'e', call_id: 'c3' }),
      out({ call_id: 'c3', output: 'to the call made last' }),
      call({ name: 'f' }),
      out({ output: 'no id' }),
      call({ name: 'g', call_id: 7 }),
      out({ call_id: 7, output: 'an id that is no string' }),
      // Codex writes an empty call_id on a call a Chat Completions provider gave no id, and on its output
      call({ name: 'k', call_id: '' }),
      out({ call_id: '', output: 'an empty id' }),
      out({ call_id: 'nobody', output: 'an id no call was made with' }),
      call({ name: 'h', call_id: 'c4' }),
      xRI({ type: 'tool_search_output', call_id: 'c4', output: null }),
      call({ name: 'i', call_id: 'c5' }),
      out({ call_id: 'c5' }),
      call({ name: 'j', call_id: 'c6' }),
      out({ call_id: 'c6', output: 42 }),
      xRI({ type: 'custom_tool_call', name: 'spawn_agent', call_id: 's1', input: 'the task' }),
      xRI({ type: 'custom_tool_call_output', call_id: 's1', output: { agent_id: 'x' } })
    ])
    expect(bs.map((b) => (b.kind === 'tool' ? [b.name, b.output] : b.kind === 'sub' ? [b.name, b.prompt, b.result] : b.kind))).toEqual([
      ['a', null],
      ['b', '{\n  "lines": 2\n}'],
      ['c', 'second'],
      ['d', null],
      ['e', 'to the call made last'],
      ['f', null],
      ['g', null],
      ['k', null],
      ['h', ''],
      ['i', ''],
      ['j', '42'],
      ['spawn_agent', 'the task', '{\n  "agent_id": "x"\n}']
    ])
  })

  test('a payload type every object answers to, __proto__ or constructor say, is no output type: it is traced, and fills in no call (spec C8)', async () => {
    const bs = await codexBlocks([
      call({ call_id: 'c1', arguments: 'ls' }),
      xRI({ type: '__proto__', call_id: 'c1', output: 'not an output' }),
      xRI({ type: 'constructor', call_id: 'c1', output: 'not an output' }),
      xRI({ type: 'toString' })
    ])
    expect(bs).toEqual([
      { kind: 'tool', at: AT, name: 'exec', summary: 'ls', input: 'ls', output: null, truncated: false },
      { kind: 'unknown', count: 3, types: ['response_item/__proto__', 'response_item/constructor', 'response_item/toString'] }
    ])
  })
})

describe('Codex prose and reasoning', () => {
  // White space as JavaScript's trim takes it, a byte order mark and an ideographic space among it
  const blank = String.fromCharCode(0x20, 0xfeff, 0x0a, 0x3000, 0xa0)

  test('an agent message is a text block as written, unless it is no string or only white space', async () => {
    const bs = await codexBlocks([
      xEvent({ type: 'agent_message', message: blank }),
      xEvent({ type: 'agent_message', message: 7 }),
      xEvent({ type: 'agent_message' }),
      xEvent({ type: 'agent_message', message: ' as written\n' })
    ])
    expect(bs).toEqual([{ kind: 'text', role: 'assistant', at: AT, body: ' as written\n' }])
  })

  test("a completed agent message is its content's texts joined by a blank line, but those only white space, no string, or no object's", async () => {
    const item = (content: unknown): string => JSON.stringify(xEvent({ type: 'item_completed', item: { type: 'AgentMessage', content } }))
    const bs = await codexTurn([
      item('no array'),
      item([{ type: 'Text', text: 'one' }, 'a string', ['text'], { text: 3 }, { text: blank }, { type: 'Text', text: 'two' }]),
      item([{ text: blank }]),
      `{"type":"event_msg","timestamp":"${TS}","payload":{"type":"item_completed","item":{"type":"AgentMessage","content":[{"text":"first","text":"last"}]}}}`
    ])
    expect(bs).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'one\n\ntwo' },
      { kind: 'text', role: 'assistant', at: AT, body: 'last' }
    ])
  })

  test("a reasoning's sub-headings are its summary's texts in order, but those only white space, no string, or no object's", async () => {
    const bs = await codexBlocks([
      xRI({ type: 'reasoning', summary: 'no array' }),
      // The body, encrypted_content, is never shown (session-view C6)
      xRI({ type: 'reasoning', summary: [{ text: 'first' }, 'a string', { text: null }, { text: blank }, { type: 'summary_text', text: 'second' }], encrypted_content: 'gAAA…' }),
      xRI({ type: 'reasoning', summary: [], encrypted_content: 'gAAA…' }),
      xRI({ type: 'reasoning', summary: [{ text: blank }] }),
      xRI({ type: 'reasoning' })
    ])
    expect(bs).toEqual([{ kind: 'reason', at: AT, titles: ['first', 'second'] }])
  })
})

describe('a Codex line as the turn reads it', () => {
  test('a payload or an item that is no object has no type, traced as undefined under what carries it, as a line that is an array is; of a repeated type the last counts', async () => {
    const bs = await codexTurn([
      JSON.stringify({ type: 'event_msg', timestamp: TS, payload: 'no object' }),
      JSON.stringify({ type: 'response_item', timestamp: TS }),
      JSON.stringify({ type: 'response_item', timestamp: TS, payload: [{ type: 'function_call', name: 'exec', arguments: 'ls' }] }),
      JSON.stringify(xEvent({ type: 'item_completed', item: ['AgentMessage'] })),
      JSON.stringify(['event_msg', { type: 'agent_message', message: 'in an array' }]),
      `{"type":"brand_new","type":"event_msg","timestamp":"${TS}","payload":{"type":"task_started"}}`,
      `{"type":"event_msg","type":"brand_new","timestamp":"${TS}"}`
    ])
    expect(bs).toEqual([
      { kind: 'unknown', count: 6, types: ['event_msg/undefined', 'response_item/undefined', 'item_completed/undefined', 'undefined', 'brand_new'] }
    ])
  })

  test('a line JSON.parse refuses, or one holding no object or array, gives nothing and leaves the others as they are', async () => {
    const bs = await codexTurn(['{ bad line', '"a string"', '42', 'null', 'true', '', '   ', JSON.stringify(xEvent({ type: 'agent_message', message: 'kept' }))])
    expect(bs).toEqual([{ kind: 'text', role: 'assistant', at: AT, body: 'kept' }])
  })

  test('of a repeated payload the last counts: one that is no object leaves the line none', async () => {
    const bs = await codexTurn([
      `{"type":"event_msg","timestamp":"${TS}","payload":{"type":"agent_message","message":"dropped"},"payload":"no object"}`,
      `{"type":"event_msg","timestamp":"${TS}","payload":"no object","payload":{"type":"agent_message","message":"kept"}}`
    ])
    expect(bs).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'kept' },
      { kind: 'unknown', count: 1, types: ['event_msg/undefined'] }
    ])
  })

  test("a block's time is its line's own timestamp, none when the line has no string one that reads as a date", async () => {
    const say = (line: Record<string, unknown>, message: string, payload: Record<string, unknown> = {}): string =>
      JSON.stringify({ type: 'event_msg', ...line, payload: { type: 'agent_message', message, ...payload } })
    const bs = await codexTurn([say({}, 'a payload timed', { timestamp: TS }), say({ timestamp: AT }, 'a number'), say({ timestamp: 'no date' }, 'no date'), say({ timestamp: TS }, 'timed')])
    expect(bs.map((b) => b.kind === 'text' && [b.body, b.at])).toEqual([['a payload timed', null], ['a number', null], ['no date', null], ['timed', AT]])
  })

  test('a text holding a lone surrogate keeps that code unit, and a call id holding one pairs by it', async () => {
    // JSON escapes of two lone surrogates, as a line writes them
    const lone = '\\' + 'ud800'
    const other = '\\' + 'ud801'
    const unit = String.fromCharCode(0xd800)
    const ri = (payload: string): string => `{"type":"response_item","timestamp":"${TS}","payload":${payload}}`
    const bs = await codexTurn([
      `{"type":"event_msg","timestamp":"${TS}","payload":{"type":"agent_message","message":"a${lone}b"}}`,
      ri(`{"type":"function_call","name":"exec","call_id":"c${lone}","arguments":"x${lone}"}`),
      ri(`{"type":"function_call","name":"other","call_id":"c${other}","arguments":"y"}`),
      ri(`{"type":"function_call_output","call_id":"c${lone}","output":"o${lone}"}`)
    ])
    expect(bs).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: `a${unit}b` },
      { kind: 'tool', at: AT, name: 'exec', summary: `x${unit}`, input: `x${unit}`, output: `o${unit}`, truncated: false },
      { kind: 'tool', at: AT, name: 'other', summary: 'y', input: 'y', output: null, truncated: false }
    ])
  })
})

describe('bad lines and side attribution (ticket 05 behaviour preserved)', () => {
  test('a bad line only hurts itself; the sides do not cross over', async () => {
    expect(await claudeTurn([JSON.stringify(cA([{ type: 'text', text: 'good line' }])), '{ bad line'])).toHaveLength(1)
    expect(await codexBlocks([cA([{ type: 'text', text: 'claude line' }])])).toEqual([{ kind: 'unknown', count: 1, types: ['assistant'] }])
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

/** The lines a turn read handed over of a side whose turns TypeScript assembles */
const linesHanded = (read: TurnRead): string[] => (read.body !== null && 'lines' in read.body ? read.body.lines : [])

/** A turn of `file`, a session file of `side`, by its question index record, read as the session page reads it */
async function readTurn(side: 'antigravity', file: string, rec: QuestionRec): Promise<{ lines: string[]; bytesRead: number }> {
  const read = await readTurnOf(side, file, { start: rec[0], end: rec[1] }, { start: rec[1], end: rec[2] })
  return { lines: linesHanded(read), bytesRead: read.bytesRead }
}

/** An Antigravity turn of `file`, a conversation's transcript, by its question index record, read as the session page
 * reads it: its blocks */
async function agyTurnOf(file: string, rec: QuestionRec): Promise<TurnBlock[]> {
  return turnBlocks('antigravity', (await readTurn('antigravity', file, rec)).lines)
}

/** A turn of `file`, a session file of `side`, a side whose turns the engine module assembles, by its question index
 * record, read as the session page reads it */
const engineTurnRead = (side: 'claude' | 'codex' | 'grok', file: string, rec: QuestionRec): Promise<TurnRead> =>
  readTurnOf(side, file, { start: rec[0], end: rec[1] }, { start: rec[1], end: rec[2] })

/** A Claude Code turn of `file` by its question index record (`engineTurnRead`): the blocks the engine module assembled */
async function claudeTurnOf(file: string, rec: QuestionRec): Promise<TurnBlock[]> {
  return blocksOf(await engineTurnRead('claude', file, rec))
}

/** The lines of a range's text as the whole file's read gives it, the empty piece after its last line feed left off */
const linesOf = (text: string): string[] => text.split('\n').filter((l, i, all) => i < all.length - 1 || l !== '')

/** The question index the scan gives a Claude Code session file, through the engine module */
async function indexFile(file: string): Promise<QuestionRec[]> {
  return (await runParseJob({ kind: 'claude', file, projectKey: '', listed: true }))?.agg.questions ?? []
}

/** The question index the scan gives a Codex rollout, through the engine module */
async function indexCodex(file: string): Promise<QuestionRec[]> {
  const meta = { subagent: false, sessionId: null, parentId: null, forkedAt: null, paginated: false }
  return (await runParseJob({ kind: 'codex', file, projectKey: '', meta, threadName: undefined }))?.agg.questions ?? []
}

/** A Codex turn of `file` by its question index record (`engineTurnRead`): the blocks the engine module assembled */
async function codexTurnOf(file: string, rec: QuestionRec): Promise<TurnBlock[]> {
  return blocksOf(await engineTurnRead('codex', file, rec))
}

const uLine = (t: string): string => JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: t } })
const aLine = (t: string): string => JSON.stringify(cA([{ type: 'text', text: t }]))

/** A line of a Grok update stream at `tsSec` seconds, its update `update` */
const gline = (tsSec: number, update: Record<string, unknown>): string =>
  JSON.stringify({ timestamp: tsSec, method: '_x.ai/session/update', params: { sessionId: 's', update } })

/** The question index the scan gives a Grok update stream, through the engine module */
async function indexGrokFile(file: string): Promise<QuestionRec[]> {
  return (await runParseJob({ kind: 'grok', file, projectKey: '', subagent: false }))?.agg.questions ?? []
}

// The question index counts a turn's subagents by the engine module's dispatch names, and the turn draws a sub block by
// the same names, which it takes from the module: for each tool name below, alone in a turn, the two take the call as
// the dispatch it is or is not — a name matches as written, its case and its spaces included.
describe('the question index and the turn take the same tool calls as subagent dispatches', () => {
  test('claude: a call is counted as a subagent exactly when its turn shows it as one', async () => {
    const NAMES: Array<[string, 'tool' | 'sub']> = [['Agent', 'sub'], ['Task', 'sub'], ['Bash', 'tool'], ['TaskCreate', 'tool'], ['agent', 'tool'], ['Agent ', 'tool'], ['', 'tool']]
    const judged: Array<{ name: string; counted: unknown; shown: unknown }> = []
    for (const [name] of NAMES) {
      const raw = [uLine('a question'), JSON.stringify(cA([{ type: 'tool_use', id: 'tu1', name, input: { prompt: 'p' } }]))].join('\n') + '\n'
      await withFile(raw, async (file) => {
        const [rec] = await indexFile(file)
        const kinds = (await claudeTurnOf(file, rec)).map((b) => b.kind)
        judged.push({ name, counted: [rec[4], rec[5]], shown: [kinds.filter((k) => k === 'tool').length, kinds.filter((k) => k === 'sub').length] })
      })
    }
    const each = (kind: 'tool' | 'sub'): number[] => (kind === 'sub' ? [0, 1] : [1, 0])
    expect(judged).toEqual(NAMES.map(([name, kind]) => ({ name, counted: each(kind), shown: each(kind) })))
  })

  test('codex: a call of any of the three call types is counted as a subagent exactly when its turn shows it as one', async () => {
    const CALLS: Array<[string, string | undefined, 'tool' | 'sub']> = [
      ['function_call', 'spawn_agent', 'sub'],
      ['custom_tool_call', 'spawn_agent', 'sub'],
      ['tool_search_call', 'spawn_agent', 'sub'],
      ['function_call', 'Spawn_agent', 'tool'],
      ['function_call', 'spawn_agent ', 'tool'],
      ['function_call', '', 'tool'],
      ['function_call', undefined, 'tool']
    ]
    const judged: Array<{ type: string; name: string | undefined; counted: unknown; shown: unknown }> = []
    for (const [type, name] of CALLS) {
      const raw = [xEvent({ type: 'user_message', message: 'a question' }), xRI({ type, name, call_id: 'c1', arguments: '{}' })].map((o) => JSON.stringify(o)).join('\n') + '\n'
      await withFile(raw, async (file) => {
        const [rec] = await indexCodex(file)
        const kinds = (await codexTurnOf(file, rec)).map((b) => b.kind)
        judged.push({ type, name, counted: [rec[4], rec[5]], shown: [kinds.filter((k) => k === 'tool').length, kinds.filter((k) => k === 'sub').length] })
      })
    }
    const each = (kind: 'tool' | 'sub'): number[] => (kind === 'sub' ? [0, 1] : [1, 0])
    expect(judged).toEqual(CALLS.map(([type, name, kind]) => ({ type, name, counted: each(kind), shown: each(kind) })))
  })

  test('grok: a call is counted as a subagent exactly when its turn shows it as one', async () => {
    const NAMES: Array<[string, 'tool' | 'sub']> = [['spawn_subagent', 'sub'], ['Spawn_subagent', 'tool'], ['spawn_subagent ', 'tool'], ['read_file', 'tool'], ['', 'tool']]
    const judged: Array<{ name: string; counted: unknown; shown: unknown }> = []
    for (const [name] of NAMES) {
      const raw = [
        gline(100, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'a question' }, _meta: { promptIndex: 0 } }),
        gline(100, { sessionUpdate: 'tool_call', toolCallId: 'c1', title: name, rawInput: { prompt: 'p' } })
      ].join('\n') + '\n'
      await withFile(raw, async (file) => {
        const [rec] = await indexGrokFile(file)
        const kinds = blocksOf(await engineTurnRead('grok', file, rec)).map((b) => b.kind)
        judged.push({ name, counted: [rec[4], rec[5]], shown: [kinds.filter((k) => k === 'tool').length, kinds.filter((k) => k === 'sub').length] })
      })
    }
    const each = (kind: 'tool' | 'sub'): number[] => (kind === 'sub' ? [0, 1] : [1, 0])
    expect(judged).toEqual(NAMES.map(([name, kind]) => ({ name, counted: each(kind), shown: each(kind) })))
  })

  test('antigravity: a call is counted as a subagent exactly when its turn shows it as one', async () => {
    const NAMES: Array<[string, 'tool' | 'sub']> = [['invoke_subagent', 'sub'], ['Invoke_subagent', 'tool'], ['invoke_subagent ', 'tool'], ['run_command', 'tool'], ['', 'tool']]
    const judged: Array<{ name: string; counted: unknown; shown: unknown }> = []
    for (const [name] of NAMES) {
      // A question and one response making the call, shaped as the measured transcripts' lines are
      const text = transcriptText([
        JSON.stringify({ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-10-28T08:09:56Z', content: '<USER_REQUEST>\na question\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-10-28T16:09:56+08:00.\n</ADDITIONAL_METADATA>' }),
        JSON.stringify({ step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-28T08:09:56Z', tool_calls: [{ name, args: { TypeName: 'self', Prompt: 'p' } }] })
      ])
      await withIndexedTranscript(text, async ({ questions: [rec], transcript }) => {
        const kinds = (await agyTurnOf(transcript, rec)).map((b) => b.kind)
        judged.push({ name, counted: [rec[4], rec[5]], shown: [kinds.filter((k) => k === 'tool').length, kinds.filter((k) => k === 'sub').length] })
      })
    }
    const each = (kind: 'tool' | 'sub'): number[] => (kind === 'sub' ? [0, 1] : [1, 0])
    expect(judged).toEqual(NAMES.map(([name, kind]) => ({ name, counted: each(kind), shown: each(kind) })))
  })
})

describe('a range fetch agrees with a full parse (the anchor)', () => {
  test('for every turn: the blocks from the turn read == the corresponding turn\'s blocks from the whole-file path', async () => {
    const raw = [
      uLine('question one'),
      aLine('answer one'),
      JSON.stringify(cA([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }])),
      JSON.stringify(cU([{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }])),
      uLine('question two'),
      aLine('answer two')
    ].join('\n') + '\n'
    await withFile(raw, async (file) => {
      const recs = await indexFile(file)
      expect(recs).toHaveLength(2)
      const whole = await readRanges(file, recs.map((r) => ({ start: r[1], end: r[2] })))
      for (let i = 0; i < recs.length; i++) {
        expect(await claudeTurnOf(file, recs[i])).toEqual(await claudeTurn(linesOf(whole.texts[i])))
      }
      // The first turn: the tool is already paired (its output is in place)
      const t = (await claudeTurn(linesOf(whole.texts[0]))).find((b) => b.kind === 'tool')
      expect(t && t.kind === 'tool' && t.output).toBe('ok')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Ticket #125: the Grok block model. Grounded in a full enumeration of this machine's update
// streams (17 sessionUpdate types, 2026-08-16). The load-bearing measured fact: one assistant
// message can be split across agent_message_chunk records MID-WORD with state records
// (current_mode_update) between the fragments — so adjacent same-kind chunks merge with no
// injected separator, and the enumerated state records must not break the merge.
describe('the Grok block model (ticket #125)', () => {

  test('prose fragments split mid-word merge raw across state records; thinking, tools and order survive', async () => {
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
    const blocks = await grokTurn(raw.split('\n'))
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

  test('Grok: the turn read == the whole-file path, and one turn\'s bytes read is far below the file size', async () => {
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
      // The question index the engine module gives the stream
      const recs = await indexGrokFile(file)
      expect(recs).toHaveLength(2)
      const whole = await readRanges(file, recs.map((r) => ({ start: r[1], end: r[2] })))
      const one = await engineTurnRead('grok', file, recs[0])
      expect(blocksOf(one)).toEqual(await grokTurn(linesOf(whole.texts[0])))
      expect((blocksOf(one)[0] as { body: string }).body).toBe('answer one')
      // Far below the file: the 2 MB padding turn is not touched by fetching turn one
      expect(one.bytesRead).toBeLessThan(2000)
      expect(statSync(file).size).toBeGreaterThan(2 * 1024 * 1024)
    })
  })

  test('a spawn dispatch is a sub block: name from subagent_spawned, result from the in-turn finished record, not its own tool update', async () => {
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
    const blocks = await grokTurn(raw.split('\n'))
    expect(blocks.map((b) => b.kind)).toEqual(['sub'])
    const sub = blocks[0] as { name: string | null; prompt: string; result: string | null; unlinked: boolean; steps: unknown[] }
    expect(sub.name).toBe('general-purpose')
    expect(sub.prompt).toBe('Investigate X thoroughly')
    expect(sub.result, 'the result is the finished record\'s output, never the "started in background" tool echo').toBe('The research result body')
    expect(sub.unlinked).toBe(true)
    expect(sub.steps).toEqual([])
  })

  test('a record without an update is named by its method; a non-string method by its JSON, a missing one as <no-update>', async () => {
    const raw = [
      JSON.stringify({ method: 'session/cancel', params: {} }),
      JSON.stringify({ method: 7, params: {} }),
      JSON.stringify({ method: { name: 'odd' }, params: {} }),
      JSON.stringify({ params: {} })
    ].join('\n')
    const blocks = await grokTurn(raw.split('\n'))
    expect(blocks).toEqual([{ kind: 'unknown', count: 4, types: ['session/cancel', '7', '{"name":"odd"}', '<no-update>'] }])
  })

  test('enumerated state records leave no trace; an unknown update type does; an injected user notice renders nothing', async () => {
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
    const blocks = await grokTurn(raw.split('\n'))
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'unknown'])
    const unknown = blocks[1] as { types: string[]; count: number }
    expect(unknown.types).toEqual(['update/brand_new_thing'])
    expect(unknown.count).toBe(1)
  })

  test('a chunk joins the open block of its kind, at the time of the chunk that opened it, until a chunk of the other kind or a call ends it', async () => {
    const say = (ts: number, text: unknown): string => gline(ts, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })
    const think = (ts: number, text: string): string => gline(ts, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text } })
    const call = (ts: number, id: string): string => gline(ts, { sessionUpdate: 'tool_call', toolCallId: id, title: 'read_file' })
    const blocks = await grokTurn([
      gline(98, { sessionUpdate: 'tool_call', toolCallId: 'd0', title: 'spawn_subagent', rawInput: { prompt: 'p' } }),
      call(99, 't0'),
      say(100, 'a'),
      // A record of every other kind between two chunks of prose: none ends the open block
      gline(101, { sessionUpdate: 'tool_call_update', toolCallId: 't0', content: [{ type: 'content', content: { type: 'text', text: 'out' } }] }),
      gline(101, { sessionUpdate: 'subagent_spawned', subagent_id: 's0', subagent_type: 'explore' }),
      gline(101, { sessionUpdate: 'subagent_finished', subagent_id: 's0', output: 'result' }),
      gline(101, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'a notice' }, _meta: { promptIndex: 1 } }),
      gline(101, { sessionUpdate: 'current_mode_update', currentModeId: 'code' }),
      gline(101, { sessionUpdate: 'brand_new_thing' }),
      JSON.stringify({ method: 'session/cancel', params: {} }),
      say(102, 'b'),
      think(103, 'c'),
      say(104, 'd'),
      think(105, 'e'),
      think(106, 'f'),
      call(107, 't1'),
      think(108, 'g'),
      call(109, 't2'),
      say(110, 'h'),
      call(111, 't3'),
      // A chunk with no text still opens a block, which the next chunk joins
      say(112, 7),
      gline(113, { sessionUpdate: 'agent_message_chunk', content: 'no record' }),
      say(114, 'i')
    ])
    const tool = (ts: number, output: string | null): TurnBlock =>
      ({ kind: 'tool', at: ts * 1000, name: 'read_file', summary: 'read_file', input: '', output, truncated: false })
    expect(blocks).toEqual([
      { kind: 'sub', at: 98_000, name: 'explore', prompt: 'p', steps: [], result: 'result', unlinked: true },
      tool(99, 'out'),
      { kind: 'text', role: 'assistant', at: 100_000, body: 'ab' },
      { kind: 'think', at: 103_000, body: 'c' },
      { kind: 'text', role: 'assistant', at: 104_000, body: 'd' },
      { kind: 'think', at: 105_000, body: 'ef' },
      tool(107, null),
      { kind: 'think', at: 108_000, body: 'g' },
      tool(109, null),
      { kind: 'text', role: 'assistant', at: 110_000, body: 'h' },
      tool(111, null),
      { kind: 'text', role: 'assistant', at: 112_000, body: 'i' },
      { kind: 'unknown', count: 2, types: ['update/brand_new_thing', 'session/cancel'] }
    ])
  })

  test('a tool is named by its tool meta, then its title; shows its input as written, any other value than a string as JSON; and is summed up by the first line of its name and input', async () => {
    const [NEL, BOM, LS, PS, CR] = [0x85, 0xfeff, 0x2028, 0x2029, 0x0d].map(unit)
    const call = (fields: Record<string, unknown>): string => gline(100, { sessionUpdate: 'tool_call', toolCallId: 'c', ...fields })
    const shown = (await grokTurn([
      call({ title: 'Run', _meta: { 'x.ai/tool': { name: 'run_terminal_cmd', label: 'Run' } }, rawInput: 'ls -la' }),
      call({ title: 'grep', _meta: { 'x.ai/tool': { label: 'Search' } }, rawInput: { pattern: 'x' } }),
      call({ _meta: { 'x.ai/tool': { name: 5 } }, rawInput: null }),
      // Only a line feed ends the first line; the white space at its ends is JavaScript's
      call({ title: 'sh', rawInput: `a${CR}b${LS}c${PS}d${PS}${LS}${CR}\ne` }),
      call({ rawInput: `${NEL} x ${NEL}${BOM}\nnext` }),
      call({ rawInput: '\n\n  first\nsecond' }),
      call({ title: 'sh', rawInput: 'a   \t b  ' }),
      // 88 code units, and past them
      call({ title: 'n', rawInput: 'x'.repeat(86) }),
      call({ title: 'n', rawInput: `${'x'.repeat(86)}${' '.repeat(10)}\ny` }),
      call({ title: 'n', rawInput: 'x'.repeat(87) }),
      call({ title: 'n', rawInput: `${'x'.repeat(85)}${String.fromCodePoint(0x1f600)}z` })
    ])).map((b) => (b.kind === 'tool' ? [b.name, b.input, b.summary] : b.kind))
    expect(shown).toEqual([
      ['run_terminal_cmd', 'ls -la', 'run_terminal_cmd ls -la'],
      ['grep', '{\n  "pattern": "x"\n}', 'grep {'],
      [null, '', ''],
      ['sh', `a${CR}b${LS}c${PS}d${PS}${LS}${CR}\ne`, `sh a${CR}b${LS}c${PS}d`],
      [null, `${NEL} x ${NEL}${BOM}\nnext`, `${NEL} x ${NEL}`],
      [null, '\n\n  first\nsecond', 'first'],
      ['sh', 'a   \t b  ', 'sh a   \t b'],
      ['n', 'x'.repeat(86), `n ${'x'.repeat(86)}`],
      ['n', `${'x'.repeat(86)}${' '.repeat(10)}\ny`, `n ${'x'.repeat(86)}`],
      ['n', 'x'.repeat(87), `n ${'x'.repeat(86)}…`],
      ['n', `${'x'.repeat(85)}${String.fromCodePoint(0x1f600)}z`, `n ${'x'.repeat(85)}${unit(0xd83d)}…`]
    ])
  })

  test('a tool\'s output is the texts of the last update for its call that has any, joined as written; no other update changes it', async () => {
    const call = (id: string): string => gline(100, { sessionUpdate: 'tool_call', toolCallId: id, title: 'read_file' })
    const update = (id: unknown, content: unknown): string => gline(100, { sessionUpdate: 'tool_call_update', toolCallId: id, status: 'completed', content })
    const text = (t: unknown): Record<string, unknown> => ({ type: 'content', content: { type: 'text', text: t } })
    const outputs = (await grokTurn([
      call('a'),
      update('a', [text('first')]),
      update('a', [text('sec'), 'x', null, 7, [text('in an array')], { type: 'content' }, { content: 'x' }, text(5), text('ond')]),
      update('a', []),
      update('a', [text('')]),
      update('a', 'not an array'),
      update('a', [{ type: 'content', content: { type: 'resource' } }]),
      update(7, [text('no id')]),
      update('nowhere', [text('no call')]),
      call('b'),
      update('b', [text('')]),
      call('c'),
      // Of two calls by one id, an update is the later one's
      call('d'),
      call('d'),
      update('d', [text('the later')]),
      // An id a dispatch was made with is the dispatch's, its updates its echo, whatever call takes the id
      gline(100, { sessionUpdate: 'tool_call', toolCallId: 'e', title: 'spawn_subagent', rawInput: { prompt: 'p' } }),
      call('e'),
      update('e', [text('echo')])
    ])).map((b) => (b.kind === 'tool' ? b.output : b.kind))
    expect(outputs).toEqual(['second', null, null, null, 'the later', 'sub', null])
  })

  test('spawned records name the dispatches in the order they were made, and a finished record gives its dispatch\'s result', async () => {
    const dispatch = (id: string, rawInput: unknown): string => gline(100, { sessionUpdate: 'tool_call', toolCallId: id, title: 'spawn_subagent', rawInput })
    const spawned = (id: string, type: unknown): string =>
      gline(100, { sessionUpdate: 'subagent_spawned', subagent_id: id, child_session_id: id, subagent_type: type })
    const finished = (id: string, fields: Record<string, unknown>): string =>
      gline(100, { sessionUpdate: 'subagent_finished', subagent_id: id, child_session_id: id, status: 'completed', ...fields })
    const subs = (await grokTurn([
      dispatch('d1', { description: 'One', prompt: 'Do one' }),
      dispatch('d2', { description: 'Two' }),
      dispatch('d3', { description: 'Three', prompt: 3 }),
      dispatch('d4', 'a string'),
      spawned('s1', 'explore'),
      spawned('s2', 'plan'),
      spawned('s3', ''),
      spawned('s4', 4),
      // No dispatch is left for it to name
      spawned('s5', 'late'),
      finished('s1', { output: '', error: 'it failed' }),
      finished('s2', { output: 'done' }),
      finished('s3', { output: 'early' }),
      finished('s3', { error: 3 }),
      finished('s5', { output: 'nobody' }),
      finished('s9', { output: 'nobody' })
    ])).map((b) => (b.kind === 'sub' ? [b.name, b.prompt, b.result] : b.kind))
    expect(subs).toEqual([
      ['explore', 'Do one', 'it failed'],
      ['plan', 'Two', 'done'],
      [null, 'Three', null],
      [null, '', null]
    ])
  })

  test('a line\'s time is its timestamp in seconds; a line with no update is named by its method; a line that is no record is passed over', async () => {
    const chunk = (kind: 'message' | 'thought', text: string): Record<string, unknown> => ({ sessionUpdate: `agent_${kind}_chunk`, content: { type: 'text', text } })
    const blocks = await grokTurn([
      gline(1.5, chunk('message', 'a')),
      JSON.stringify({ timestamp: '100', params: { update: chunk('thought', 'b') } }),
      JSON.stringify({ params: { update: chunk('message', 'c') } }),
      `{"timestamp":1e400,"params":{"update":${JSON.stringify(chunk('thought', 'd'))}}}`,
      // A time in range whose milliseconds are not
      gline(1e306, chunk('message', 'e')),
      JSON.stringify([{ method: 'in an array', params: { update: chunk('message', 'x') } }]),
      JSON.stringify({ method: 'params a string', params: 'x' }),
      JSON.stringify({ method: 'update an array', params: { update: [chunk('message', 'x')] } }),
      JSON.stringify({ method: 'a type that is no string', params: { update: { sessionUpdate: 5 } } }),
      JSON.stringify({ method: null, params: {} }),
      `{"method":"params last a number","params":{"update":${JSON.stringify(chunk('message', 'x'))}},"params":7}`,
      '"a string"',
      '42',
      '{ bad',
      '',
      '   ',
      // Of a repeated key, the last value
      '{"timestamp":1,"params":{"update":{"sessionUpdate":"plan","sessionUpdate":"agent_thought_chunk","content":{"text":"first"},"content":{"text":"last"}}},"timestamp":2}',
      '{"params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"text":"dropped"},"content":["no record"]}}}',
      '{"params":{"update":{"sessionUpdate":"tool_call","toolCallId":"r","title":"by title","_meta":{"x.ai/tool":{"name":"by meta"}},"_meta":7}}}',
      '{"params":{"update":{"sessionUpdate":"tool_call_update","toolCallId":"r","content":[{"content":{"text":"dropped"}}],"content":{"text":"no array"}}}}',
      '{"params":{"update":{"sessionUpdate":"tool_call","title":"by title too","_meta":{"x.ai/tool":{"name":"by meta"},"x.ai/tool":5}}}}'
    ])
    expect(blocks).toEqual([
      { kind: 'text', role: 'assistant', at: 1500, body: 'a' },
      { kind: 'think', at: null, body: 'b' },
      { kind: 'text', role: 'assistant', at: null, body: 'c' },
      { kind: 'think', at: null, body: 'd' },
      { kind: 'text', role: 'assistant', at: Infinity, body: 'e' },
      { kind: 'think', at: 2000, body: 'last' },
      { kind: 'text', role: 'assistant', at: null, body: '' },
      { kind: 'tool', at: null, name: 'by title', summary: 'by title', input: '', output: null, truncated: false },
      { kind: 'tool', at: null, name: 'by title too', summary: 'by title too', input: '', output: null, truncated: false },
      { kind: 'unknown', count: 6, types: ['<no-update>', 'params a string', 'update an array', 'a type that is no string', 'params last a number'] }
    ])
  })

  test('a string\'s escapes are decoded, and a lone surrogate ending one chunk joins its partner starting the next', async () => {
    const line = (update: string): string => `{"timestamp":100,"params":{"update":${update}}}`
    const chunk = (kind: 'message' | 'thought', text: string): string => line(`{"sessionUpdate":"agent_${kind}_chunk","content":{"text":"${text}"}}`)
    const blocks = await grokTurn([
      line('{"sessionUpdate":"tool_call","toolCallId":"t","title":"read_file"}'),
      // The longer text is made in the line's own buffer, the shorter copied
      line(`{"sessionUpdate":"tool_call_update","toolCallId":"t","content":[{"content":{"text":"x${esc('0041')}"}},{"content":{"text":"a${esc('0001')}b${esc('00E9')}c${esc('d83d')}${esc('de00')}d${esc('2028')}e, and more"}}]}`),
      chunk('message', 'hi '),
      chunk('message', esc('d83d')),
      chunk('message', `${esc('de00')} there`),
      chunk('thought', `${esc('dc00')} alone`),
      chunk('thought', ' it stays')
    ])
    expect(blocks.map((b) => (b.kind === 'tool' ? b.output : b.kind === 'text' || b.kind === 'think' ? b.body : b.kind))).toEqual([
      `xAa${unit(1)}b${unit(0xe9)}c${String.fromCodePoint(0x1f600)}d${unit(0x2028)}e, and more`,
      `hi ${String.fromCodePoint(0x1f600)} there`,
      `${unit(0xdc00)} alone it stays`
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Antigravity CLI (session-view::REQ-004): a turn's lines → blocks. The transcripts are agy's own
// (agy-transcript-fixture.ts, every transcript on the machine enumerated: five line types); a shape no transcript
// shows is marked derived.
describe('the Antigravity block model (session-view::REQ-004)', () => {
  const T = MEASURED_TRANSCRIPT
  /** A turn of these lines, as the session page reads it: written as a transcript, the whole of it the turn's body, read
   * through the turn read, which leaves out the lines a rewind undid */
  const read = (lines: readonly string[]): Promise<TurnBlock[]> =>
    withFile(transcriptText(lines), async (file) => {
      const body = { start: 0, end: statSync(file).size }
      return turnBlocks('antigravity', linesHanded(await readTurnOf('antigravity', file, { start: 0, end: 0 }, body)))
    })
  /** The turn of the lines after a question, `[from, to)` */
  const turn = (lines: readonly string[], from: number, to: number): Promise<TurnBlock[]> => read(lines.slice(from, to))
  const field = (line: string, key: string): unknown => (JSON.parse(line) as Record<string, unknown>)[key]
  const argsOf = (line: string): unknown => (field(line, 'tool_calls') as Array<{ args: unknown }>)[0].args

  test('prose, plain-text thinking, and each tool call paired in order with the result line after it — a denied one too (AC-04)', async () => {
    // The second question's turn of the measured main conversation: a server notice, three calls, the last denied
    const bs = await turn(T.main, 5, 12)
    expect(bs.map((b) => b.kind)).toEqual(['tool', 'tool', 'think', 'tool'])
    const tools = bs.filter((b): b is Extract<TurnBlock, { kind: 'tool' }> => b.kind === 'tool')
    expect(tools.map((b) => b.name)).toEqual(['run_command', 'read_file', 'edit_file'])
    expect(tools.map((b) => JSON.parse(b.input) as unknown)).toEqual([argsOf(T.main[6]), argsOf(T.main[8]), argsOf(T.main[10])])
    expect(tools.map((b) => b.output)).toEqual([field(T.main[7], 'content'), field(T.main[9], 'content'), field(T.main[11], 'content')])
    expect(tools[2].output).toContain('user denied permission for write_file')
    expect((bs[2] as { body: string }).body).toBe(field(T.main[10], 'thinking'))
    // The last turn: its notice renders nothing, its answer's thinking comes before its prose
    const last = await turn(T.main, 20, 22)
    expect(last.map((b) => b.kind)).toEqual(['think', 'text'])
    expect((last[1] as { body: string }).body).toBe(field(T.main[21], 'content'))
  })

  test('a subagent dispatch is a sub block whose return is the message its subagent sent back, never the creation echo (AC-05)', async () => {
    const bs = await turn(T.dispatch, 1, 7)
    expect(bs.map((b) => b.kind)).toEqual(['think', 'sub', 'think', 'tool', 'text'])
    const sub = bs[1] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.name).toBe('self')
    expect(sub.prompt).toBe('Please list the names of all functions defined in calc.py located in the workspace.')
    expect(sub.result).toBe('The functions defined in `calc.py` are:\n1. `add`\n2. `average`\n3. `percent`')
    expect([sub.steps, sub.unlinked]).toEqual([[], true])
    const tool = bs[3] as Extract<TurnBlock, { kind: 'tool' }>
    expect([tool.name, tool.output]).toEqual(['manage_subagents', field(T.dispatch[4], 'content')])
    expect((bs[4] as { body: string }).body).toBe('The functions defined in `calc.py` are `add`, `average`, and `percent`.')
  })

  test('a cancelled dispatch shows no return; a call still running shows its running result; a timer\'s message renders nothing (AC-04, AC-05, AC-06)', async () => {
    const bs = await turn(T.cancelledDispatch, 4, 20)
    expect(bs.map((b) => b.kind)).toEqual(['think', 'tool', 'think', 'sub', 'tool', 'text', 'think', 'tool', 'tool', 'tool', 'think', 'text'])
    const sub = bs[3] as Extract<TurnBlock, { kind: 'sub' }>
    expect([sub.name, sub.result]).toEqual(['research', null])
    const schedule = bs[4] as Extract<TurnBlock, { kind: 'tool' }>
    expect([schedule.name, schedule.output]).toEqual(['schedule', field(T.cancelledDispatch[9], 'content')])
    expect(schedule.output).toContain('Tool is running as a background task')
  })

  test('a failed model call\'s error line is prose; a line of another type leaves the unknown trace (AC-06)', async () => {
    expect(await turn(T.failedFirstCall, 1, 2)).toEqual([
      { kind: 'text', role: 'assistant', at: Date.parse('2026-10-28T07:54:02Z'), body: field(T.failedFirstCall[1], 'error') }
    ])
    // Derived: no measured line has another type
    const invented = JSON.stringify({ step_index: 2, source: 'MODEL', type: 'BRAND_NEW', status: 'DONE', created_at: '2026-10-28T07:54:03Z' })
    expect(await read([T.failedFirstCall[1], invented])).toEqual([
      { kind: 'text', role: 'assistant', at: Date.parse('2026-10-28T07:54:02Z'), body: field(T.failedFirstCall[1], 'error') },
      { kind: 'unknown', count: 1, types: ['BRAND_NEW'] }
    ])
  })

  test('a subagent that sends two messages within its dispatch\'s turn: the return holds both, in order (the "more than one message" failure mode)', async () => {
    // Derived: the measured message again, after the answer, with another body
    const first = JSON.parse(T.dispatch[5]) as { content: string }
    const body = 'The functions defined in `calc.py` are:\n1. `add`\n2. `average`\n3. `percent`'
    expect(first.content).toContain(`content=${body}\n</SYSTEM_MESSAGE>`)
    const second = JSON.stringify({ ...first, step_index: 8, content: first.content.replace(body, 'Also: `average` returns 0 for an empty list.') })
    const sub = (await read([...T.dispatch.slice(1, 7), second])).find((b) => b.kind === 'sub') as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.result).toBe(`${body}\n\nAlso: \`average\` returns 0 for an empty list.`)
  })

  test('a subagent\'s later message, in a turn of its own, renders nothing there (the "messaged again" failure mode)', async () => {
    // Derived: the measured message, arriving after the next question
    const again = JSON.stringify({ ...(JSON.parse(T.dispatch[5]) as Record<string, unknown>), step_index: 9 })
    expect(await read([again])).toEqual([])
  })

  // Derived position of the measured mechanism: the redo reuses the index of a call within the turn. The second row
  // puts a line that will not parse and an empty line before the undone result: which lines are undone is told per
  // line of the turn, as the turn read hands them over, so a line without a step must not shift the lines after it
  const rewound = (step: number, type: string, extra: Record<string, unknown>): string =>
    JSON.stringify({ step_index: step, source: 'MODEL', type, status: 'DONE', created_at: '2026-10-28T08:06:23Z', ...extra })
  test.each([
    { name: 'every line read', between: [] },
    { name: 'a bad line and an empty line before the undone result', between: ['{"step_index":', ''] }
  ])('a rewind inside a turn: the undone call and its result are not shown, the redo is, $name (AC-03)', async ({ between }) => {
    const bs = await read([
      rewound(1, 'PLANNER_RESPONSE', { tool_calls: [{ name: 'read_file', args: { Path: '/x' } }] }),
      ...between,
      rewound(2, 'GENERIC', { content: 'undone' }),
      rewound(1, 'PLANNER_RESPONSE', { tool_calls: [{ name: 'run_command', args: { CommandLine: 'ls' } }] }),
      rewound(2, 'GENERIC', { content: 'redone' })
    ])
    expect(bs.map((b) => b.kind === 'tool' && [b.name, b.output])).toEqual([['run_command', 'redone']])
  })

  // Derived lines, of shapes no measured transcript shows, each written as the measured lines are; every block they give
  // is at their time
  const DERIVED_AT = '2026-10-28T08:06:23Z'
  const at = Date.UTC(2026, 9, 28, 8, 6, 23)
  const line = (step: number, type: unknown, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ step_index: step, source: 'MODEL', type, status: 'DONE', created_at: DERIVED_AT, ...extra })
  const response = (step: number, extra: Record<string, unknown>): string => line(step, 'PLANNER_RESPONSE', extra)
  const result = (step: number, extra: Record<string, unknown>): string => line(step, 'GENERIC', extra)
  const message = (step: number, content: unknown): string => line(step, 'SYSTEM_MESSAGE', { source: 'SYSTEM', content })
  /** A system message's content as agy frames it (the measured dispatch's), from `sender` with `body` */
  const framed = (sender: string, body: string): string =>
    'The following is a <SYSTEM_MESSAGE> not actually sent by the user. It is provided by the system as important information to pay attention to.\n\n' +
    `<SYSTEM_MESSAGE>\n[Message] timestamp=2026-10-28T08:10:17Z sender=${sender} priority=MESSAGE_PRIORITY_HIGH content=${body}\n</SYSTEM_MESSAGE>`
  const dispatch = (step: number, args?: unknown): string => response(step, { tool_calls: [args === undefined ? { name: 'invoke_subagent' } : { name: 'invoke_subagent', args }] })
  /** A dispatch's result, echoing the conversation it created as `written` writes its id (the measured echo's shape) */
  const echo = (step: number, written: string): string =>
    result(step, { content: `Created At: 2026-10-28T16:10:00+08:00\nCompleted At: 2026-10-28T16:10:01+08:00\nCreated the following subagent:\n{\n  ${written},\n  "logAbsoluteUri":  "file:///x"\n}` })
  const textBlock = (body: string, when: number | null = at): TurnBlock => ({ kind: 'text', role: 'assistant', at: when, body })
  const thinkBlock = (body: string): TurnBlock => ({ kind: 'think', at, body })
  const toolBlock = (name: string | null, input: string, summary: string, output: string | null = null): TurnBlock =>
    ({ kind: 'tool', at, name, summary, input, output, truncated: false })
  const subBlock = (name: string, prompt: string, result: string | null = null): TurnBlock => ({ kind: 'sub', at, name, prompt, steps: [], result, unlinked: true })

  // A string a rule asks to be other than blank, or a value to be a string, each where the rule asks it: an empty one
  // and one only white space (JavaScript's `trim` set) are blank, and an empty string is a string
  test.each([
    { name: 'a thinking empty gives no think block', lines: [response(1, { thinking: '', content: 'a' })], blocks: [textBlock('a')] },
    { name: 'a thinking only white space gives none', lines: [response(1, { thinking: ' \n\t\u00a0\ufeff\u2028', content: 'a' })], blocks: [textBlock('a')] },
    { name: 'a prose empty gives no text block', lines: [response(1, { thinking: 't', content: '' })], blocks: [thinkBlock('t')] },
    { name: 'a prose only white space gives none', lines: [response(1, { thinking: 't', content: ' \r\n\u3000' })], blocks: [thinkBlock('t')] },
    { name: 'an error line whose error is empty gives nothing, its content not taken in its place', lines: [line(1, 'ERROR_MESSAGE', { error: '', content: 'boom' })], blocks: [] },
    { name: 'an error line whose error is only white space gives nothing', lines: [line(1, 'ERROR_MESSAGE', { error: ' \n', content: 'boom' })], blocks: [] },
    { name: 'an error line with no error and an empty content gives nothing', lines: [line(1, 'ERROR_MESSAGE', { content: '' })], blocks: [] },
    { name: 'an error line with no error gives its content', lines: [line(1, 'ERROR_MESSAGE', { content: 'boom' })], blocks: [textBlock('boom')] },
    { name: 'an error line whose error is no string gives its content', lines: [line(1, 'ERROR_MESSAGE', { error: 5, content: 'boom' })], blocks: [textBlock('boom')] },
    { name: 'an empty line and a line only white space among the lines give nothing and leave no trace', lines: [response(1, { content: 'a' }), '', ' \t ', response(2, { content: 'b' })], blocks: [textBlock('a'), textBlock('b')] }
  ])('blank or empty: $name', async ({ lines, blocks }) => {
    expect(await read(lines)).toEqual(blocks)
  })

  test.each([
    { name: 'a call that is no object is a tool naming none, its input nothing', lines: [response(1, { tool_calls: ['x', 5, null, ['a']] })], blocks: [toolBlock(null, '', ''), toolBlock(null, '', ''), toolBlock(null, '', ''), toolBlock(null, '', '')] },
    { name: 'a call\'s name that is no string names none', lines: [response(1, { tool_calls: [{ name: 5, args: { Path: '/x' } }] })], blocks: [toolBlock(null, '{\n  "Path": "/x"\n}', '{ "Path": "/x" }')] },
    { name: 'arguments that are a string are shown as written', lines: [response(1, { tool_calls: [{ name: 'run_command', args: 'ls  -la\n/tmp' }] })], blocks: [toolBlock('run_command', 'ls  -la\n/tmp', 'ls -la /tmp')] },
    { name: 'arguments null, or none, are nothing', lines: [response(1, { tool_calls: [{ name: 'run_command', args: null }, { name: 'read_file' }] })], blocks: [toolBlock('run_command', '', ''), toolBlock('read_file', '', '')] },
    { name: 'arguments that are an array are its JSON, two spaces deep', lines: [response(1, { tool_calls: [{ name: 'run_command', args: [1, { a: 'b' }] }] })], blocks: [toolBlock('run_command', '[\n  1,\n  {\n    "a": "b"\n  }\n]', '[ 1, { "a": "b" } ]')] },
    { name: 'a dispatch naming no type is named by its tool', lines: [dispatch(1, { Prompt: 'p' })], blocks: [subBlock('invoke_subagent', 'p')] },
    { name: 'a dispatch whose type and prompt are empty is named and asked by them', lines: [dispatch(1, { TypeName: '', Prompt: '' })], blocks: [subBlock('', '')] },
    { name: 'a dispatch whose prompt is no string is asked by its arguments as shown', lines: [dispatch(1, { TypeName: 'self', Prompt: 5 })], blocks: [subBlock('self', '{\n  "TypeName": "self",\n  "Prompt": 5\n}')] },
    { name: 'a dispatch whose arguments are a string is asked by them', lines: [dispatch(1, 'go')], blocks: [subBlock('invoke_subagent', 'go')] },
    { name: 'a dispatch with no arguments is asked nothing', lines: [dispatch(1)], blocks: [subBlock('invoke_subagent', '')] },
    { name: 'a result whose content is no string gives its error', lines: [response(1, { tool_calls: [{ name: 'run_command', args: {} }] }), result(2, { content: 5, error: 'boom' })], blocks: [toolBlock('run_command', '{}', '{}', 'boom')] },
    { name: 'a result whose content is empty gives it, not its error', lines: [response(1, { tool_calls: [{ name: 'run_command', args: {} }] }), result(2, { content: '', error: 'x' })], blocks: [toolBlock('run_command', '{}', '{}', '')] },
    { name: 'a result with neither gives nothing', lines: [response(1, { tool_calls: [{ name: 'run_command', args: {} }] }), result(2, {})], blocks: [toolBlock('run_command', '{}', '{}', '')] },
    { name: 'a result no call awaits gives nothing', lines: [result(1, { content: 'orphan' })], blocks: [] },
    { name: 'an echo writing its id after white space and a line feed pairs the message', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":\n\t "c1"'), message(3, framed('c1', 'hello'))], blocks: [subBlock('self', 'p', 'hello')] },
    { name: 'an echo writing an empty id, then the id, pairs by the id', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":"", "conversationId":  "c1"'), message(3, framed('c1', 'hello'))], blocks: [subBlock('self', 'p', 'hello')] },
    { name: 'a message from a conversation no echo created is no return', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, framed('c2', 'hello'))], blocks: [subBlock('self', 'p')] },
    { name: 'a message before its echo is no return', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), message(2, framed('c1', 'hello')), echo(3, '"conversationId":  "c1"')], blocks: [subBlock('self', 'p')] },
    { name: 'a sender written inside a word is none', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, '<SYSTEM_MESSAGE>\n[Message] timestamp=t xsender=c2 sender=c1 content=hello\n</SYSTEM_MESSAGE>')], blocks: [subBlock('self', 'p', 'hello')] },
    { name: 'an empty sender is passed over for the next', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, '<SYSTEM_MESSAGE>\n[Message] timestamp=t sender= sender=c1 content=hello\n</SYSTEM_MESSAGE>')], blocks: [subBlock('self', 'p', 'hello')] },
    { name: 'a message with no [Message] header returns its whole content', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, 'sender=c1 hello')], blocks: [subBlock('self', 'p', 'sender=c1 hello')] },
    { name: 'a content= written inside a word does not start the body', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, '<SYSTEM_MESSAGE>\n[Message] sender=c1 xcontent=no content=yes\n</SYSTEM_MESSAGE>')], blocks: [subBlock('self', 'p', 'yes')] },
    { name: 'the body runs from the header line\'s first content= to the first close', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, '<SYSTEM_MESSAGE>\n[Message] sender=c1 content=a content=b\nline 2\n</SYSTEM_MESSAGE>\n</SYSTEM_MESSAGE>')], blocks: [subBlock('self', 'p', 'a content=b\nline 2')] },
    { name: 'a message whose body is not closed returns its whole content', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, '<SYSTEM_MESSAGE>\n[Message] sender=c1 content=hello')], blocks: [subBlock('self', 'p', '<SYSTEM_MESSAGE>\n[Message] sender=c1 content=hello')] },
    { name: 'an empty body is a return, and a second joins it', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, framed('c1', '')), message(4, framed('c1', 'again'))], blocks: [subBlock('self', 'p', '\n\nagain')] },
    { name: 'a message whose content is no string is none', lines: [dispatch(1, { TypeName: 'self', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), message(3, 5)], blocks: [subBlock('self', 'p')] },
    { name: 'two dispatches echoing one conversation: the later takes its messages', lines: [dispatch(1, { TypeName: 'a', Prompt: 'p' }), echo(2, '"conversationId":  "c1"'), dispatch(3, { TypeName: 'b', Prompt: 'p' }), echo(4, '"conversationId":  "c1"'), message(5, framed('c1', 'hello'))], blocks: [subBlock('a', 'p'), subBlock('b', 'p', 'hello')] },
    { name: 'a type that is no string is traced by its JSON, each in the order first met', lines: [line(1, 5), line(2, null), line(3, { a: 1 }), line(4, true), line(5, 5)], blocks: [{ kind: 'unknown', count: 5, types: ['5', 'null', '{"a":1}', 'true'] }] },
    { name: 'a line with no type, and an array, are traced as undefined', lines: ['[1,2]', JSON.stringify({ step_index: 1, source: 'MODEL', status: 'DONE' })], blocks: [{ kind: 'unknown', count: 2, types: ['undefined'] }] },
    { name: 'a type written with an escape is that type', lines: ['{"step_index":1,"source":"MODEL","type":"PLANNER\\u005fRESPONSE","status":"DONE","created_at":"2026-10-28T08:06:23Z","content":"hi"}'], blocks: [textBlock('hi')] },
    { name: 'of a repeated key the last counts', lines: ['{"step_index":1,"source":"MODEL","type":"GENERIC","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-10-28T08:06:23Z","content":"hi","content":"there"}'], blocks: [textBlock('there')] },
    { name: 'a question\'s line gives nothing and leaves no trace', lines: [line(1, 'USER_INPUT', { source: 'USER_EXPLICIT', content: '<USER_REQUEST>\nq\n</USER_REQUEST>' })], blocks: [] },
    { name: 'a thinking or prose that is no string, and calls that are no array, give nothing', lines: [response(1, { thinking: 5, content: ['a'], tool_calls: { name: 'run_command' } })], blocks: [] },
    { name: 'a time that is no string, no date, or none is none', lines: [response(1, { created_at: 5, content: 'a' }), response(2, { created_at: 'soon', content: 'b' }), JSON.stringify({ step_index: 3, type: 'PLANNER_RESPONSE', content: 'c' })], blocks: [textBlock('a', null), textBlock('b', null), textBlock('c', null)] },
    { name: 'a date in a form JavaScript\'s Date.parse alone reads is read as it reads it', lines: [response(1, { created_at: 'Wed, 28 Oct 2026 08:06:23 GMT', content: 'a' })], blocks: [textBlock('a')] },
    { name: 'a lone surrogate is kept', lines: [response(1, { thinking: `${String.fromCharCode(0xdc00)}t`, content: `${String.fromCharCode(0xd800)}x` })], blocks: [thinkBlock(`${String.fromCharCode(0xdc00)}t`), textBlock(`${String.fromCharCode(0xd800)}x`)] }
  ])('derived: $name', async ({ lines, blocks }) => {
    expect(await read(lines)).toEqual(blocks)
  })

  test('the turn read == the whole-file path, and one turn reads far below the file (AC-02)', async () => {
    const pad = JSON.stringify({ step_index: 22, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-28T08:20:20Z', content: 'y'.repeat(2 * 1024 * 1024) })
    await withIndexedTranscript(transcriptText([...T.main, pad]), async ({ questions: recs, transcript: file }) => {
      expect(recs).toHaveLength(4)
      const whole = await readRanges(file, recs.map((r) => ({ start: r[1], end: r[2] })))
      for (let i = 0; i < recs.length; i++) {
        expect(turnBlocks('antigravity', (await readTurn('antigravity', file, recs[i])).lines)).toEqual(turnBlocks('antigravity', linesOf(whole.texts[i])))
      }
      expect(turnBlocks('antigravity', linesOf(whole.texts[0])).map((b) => b.kind)).toEqual(['tool', 'think', 'text'])
      const one = await readTurn('antigravity', file, recs[0])
      expect(one.bytesRead).toBeLessThan(20_000)
      expect(statSync(file).size).toBeGreaterThan(2 * 1024 * 1024)
    })
  })
})
