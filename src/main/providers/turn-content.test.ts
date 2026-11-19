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

const blocks = (side: 'codex', objs: unknown[]): TurnBlock[] =>
  turnBlocks(side, objs.map((o) => JSON.stringify(o)))

/** The blocks a turn read handed over of a side whose turns the engine module assembles */
function blocksOf(read: TurnRead): TurnBlock[] {
  if (read.body === null || !('blocks' in read.body)) throw new Error('the read handed over no blocks')
  return read.body.blocks
}

/** A Claude Code turn whose body is `lines`, written as a session file of its own and read whole by the engine module,
 * which assembles its blocks, as the session page reads a turn */
const claudeTurn = (lines: string[]): Promise<TurnBlock[]> =>
  withFile(lines.map((l) => `${l}\n`).join(''), async (file) => blocksOf(await readTurnOf('claude', file, { start: 0, end: 0 }, { start: 0, end: statSync(file).size })))

/** `claudeTurn` of the lines `objs` written as JSON */
const claudeBlocks = (objs: unknown[]): Promise<TurnBlock[]> => claudeTurn(objs.map((o) => JSON.stringify(o)))

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
  test('a bad line only hurts itself; the sides do not cross over', async () => {
    expect(await claudeTurn([JSON.stringify(cA([{ type: 'text', text: 'good line' }])), '{ bad line'])).toHaveLength(1)
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

/** The lines a turn read handed over of a side whose turns TypeScript assembles */
const linesHanded = (read: TurnRead): string[] => (read.body !== null && 'lines' in read.body ? read.body.lines : [])

/** A turn of `file`, a session file of `side`, by its question index record, read as the session page reads it */
async function readTurn(side: 'grok' | 'antigravity', file: string, rec: QuestionRec): Promise<{ lines: string[]; bytesRead: number }> {
  const read = await readTurnOf(side, file, { start: rec[0], end: rec[1] }, { start: rec[1], end: rec[2] })
  return { lines: linesHanded(read), bytesRead: read.bytesRead }
}

/** A Claude Code turn of `file` by its question index record, read as the session page reads it: the blocks the engine
 * module assembled */
async function claudeTurnOf(file: string, rec: QuestionRec): Promise<TurnBlock[]> {
  return blocksOf(await readTurnOf('claude', file, { start: rec[0], end: rec[1] }, { start: rec[1], end: rec[2] }))
}

/** The lines of a range's text as the whole file's read gives it, the empty piece after its last line feed left off */
const linesOf = (text: string): string[] => text.split('\n').filter((l, i, all) => i < all.length - 1 || l !== '')

/** The question index the scan gives a Claude Code session file, through the engine module */
async function indexFile(file: string): Promise<QuestionRec[]> {
  return (await runParseJob({ kind: 'claude', file, projectKey: '', listed: true }))?.agg.questions ?? []
}

const uLine = (t: string): string => JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: t } })
const aLine = (t: string): string => JSON.stringify(cA([{ type: 'text', text: t }]))

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
    const blocks = turnBlocks('grok', raw.split('\n'))
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
      const recs = (await runParseJob({ kind: 'grok', file, projectKey: '', subagent: false }))?.agg.questions ?? []
      expect(recs).toHaveLength(2)
      const whole = await readRanges(file, recs.map((r) => ({ start: r[1], end: r[2] })))
      const one = await readTurn('grok', file, recs[0])
      expect(turnBlocks('grok', one.lines)).toEqual(turnBlocks('grok', linesOf(whole.texts[0])))
      expect((turnBlocks('grok', one.lines)[0] as { body: string }).body).toBe('answer one')
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
    const blocks = turnBlocks('grok', raw.split('\n'))
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
    const blocks = turnBlocks('grok', raw.split('\n'))
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
    const blocks = turnBlocks('grok', raw.split('\n'))
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'unknown'])
    const unknown = blocks[1] as { types: string[]; count: number }
    expect(unknown.types).toEqual(['update/brand_new_thing'])
    expect(unknown.count).toBe(1)
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
