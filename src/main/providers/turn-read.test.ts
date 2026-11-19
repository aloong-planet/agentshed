// A turn's read (turn-read.ts, the engine module's `readTurn`): the question's text and the body's lines, read line by
// line in one pass that stops at the turn's end (session-view C2, #485). What it hands over is held to what the range
// read gives the same ranges, decoded by Node (`readRanges`), which the turn read replaced: the question's text the
// same, so that the revision tying a fetch to its question is unchanged, and the body's text split at its line feeds.
// A Codex turn's body, which the module assembles, is seen as the read kept it through the observed-reads seam
// (engine/src/seams.rs), but where a case reads the blocks.
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readRanges, type ByteRange } from './range-read'
import { readColdRanges } from './cold-rollout'
import { readTurn, type TurnRead } from './turn-read'
import { threadEngineModule } from '../engine-module'
import { TEST_ENGINE, type HoldSeam, type LineLimitSeam, type ObservedBody, type ObservedReadsSeam, type PanicSeam } from '../testing/engine'

const dir = mkdtempSync(join(tmpdir(), 'turn-read-'))
const observedReads = (): ObservedReadsSeam => threadEngineModule() as ObservedReadsSeam
const observed: string[] = []
afterAll(() => {
  for (const file of observed.splice(0)) observedReads().seamObserveTurnReadsOf(file, false)
  rmSync(dir, { recursive: true, force: true })
})
let files = 0

/** A Codex rollout holding `content`, under a cold rollout's name and as its zstd stream when `cold`. Its turn reads hand
 * over the lines they kept, through the observed-reads seam, or when `assembled` the blocks the module assembles. */
function rolloutOf(content: Buffer, cold: boolean, assembled = false): string {
  const file = join(dir, `rollout-${files++}.jsonl${cold ? '.zst' : ''}`)
  writeFileSync(file, cold ? zstdCompressSync(content) : content)
  if (!assembled) {
    observedReads().seamObserveTurnReadsOf(file, true)
    observed.push(file)
  }
  return file
}

// Lines shaped as a Codex rollout writes them (as full-text.test.ts samples them, 2026-11-17): every line an object of
// timestamp, ordinal, type and payload, the payload nested, a turn's question an event_msg user_message
const AT = '2026-11-12T09:36:03.436Z'
let ordinal = 0
const line = (type: string, payload: unknown): Buffer => Buffer.from(JSON.stringify({ timestamp: AT, ordinal: ordinal++, type, payload }))
const ask = (message: string): Buffer => line('event_msg', { type: 'user_message', message, images: [] })
const answer = (text: string): Buffer =>
  line('response_item', { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text }], phase: 'final' })
const meta = (): Buffer => line('session_meta', { session_id: 's1', id: 's1', timestamp: AT, cwd: '/work/p', runtime_workspace_roots: [] })

// Lines shaped as Claude Code writes them (as turn-content.test.ts builds them): a question a user's line of text, an
// answer an assistant's line of text segments, a call an assistant's tool_use segment, its return a user's tool_result
const claudeLine = (o: unknown): Buffer => Buffer.from(JSON.stringify(o))
const claudeAsk = (text: string): Buffer => claudeLine({ type: 'user', timestamp: AT, message: { role: 'user', content: text } })
const claudeSay = (text: string): Buffer => claudeLine({ type: 'assistant', timestamp: AT, message: { role: 'assistant', content: [{ type: 'text', text }] } })
const claudeCall = (id: string): Buffer =>
  claudeLine({ type: 'assistant', timestamp: AT, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'cat log' } }] } })
const claudeReturn = (id: string, content: string): Buffer =>
  claudeLine({ type: 'user', timestamp: AT, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] } })
/** A Claude Code session file holding `content` */
function claudeFile(content: Buffer): string {
  const file = join(dir, `claude-${files++}.jsonl`)
  writeFileSync(file, content)
  return file
}

/** Bytes that are not valid UTF-8, each a different case of the decoder's replacement: a lone continuation byte, a
 * sequence cut short, an overlong form, a surrogate's encoding */
const INVALID = [Buffer.from([0xff]), Buffer.from([0xe4, 0xb8]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80])]
/** A line of an answer with `bytes` inside its text, where the JSON string holds them as they are */
const holding = (bytes: Buffer): Buffer => {
  const shaped = answer('before MARK after')
  const at = shaped.indexOf('MARK')
  return Buffer.concat([shaped.subarray(0, at), bytes, shaped.subarray(at + 4)])
}

/** A rollout's lines, each ended by a line feed, and each turn's question and body ranges: a turn runs from its
 * question's line to the next question's, the last to the end of the stream */
function rollout(lines: Array<{ line: Buffer; question?: true }>): { content: Buffer; turns: Array<{ question: ByteRange; body: ByteRange }> } {
  const starts: number[] = []
  let at = 0
  for (const { line } of lines) {
    starts.push(at)
    at += line.length + 1
  }
  const asked = lines.flatMap((l, i) => (l.question ? [i] : []))
  const turns = asked.map((i, k) => ({
    question: { start: starts[i], end: starts[i] + lines[i].line.length + 1 },
    body: { start: starts[i] + lines[i].line.length + 1, end: k + 1 < asked.length ? starts[asked[k + 1]] : at }
  }))
  return { content: Buffer.concat(lines.flatMap(({ line }) => [line, Buffer.from('\n')])), turns }
}

/** The lines of the body a turn read kept, as the observed-reads seam hands them over */
const linesOf = (read: TurnRead): string[] | null => {
  const body: object | null = read.body
  return body !== null && 'keptLines' in body ? (body as ObservedBody).keptLines : null
}

/** The range read's text of a body split at its line feeds, the empty piece after a last line feed left off */
const split = (text: string): string[] => {
  const pieces = text.split('\n')
  if (pieces[pieces.length - 1] === '') pieces.pop()
  return pieces
}

describe('a turn read hands over what the range read gives the same ranges, plain and cold (session-view C2)', () => {
  const { content, turns } = rollout([
    { line: meta() },
    { line: ask('the first question'), question: true },
    { line: answer('one') },
    { line: holding(INVALID[0]) },
    { line: Buffer.alloc(0) },
    { line: holding(INVALID[1]) },
    { line: Buffer.concat([ask('a question holding '), INVALID[2]]), question: true },
    { line: holding(INVALID[3]) },
    { line: answer('three') },
    { line: ask('the last question'), question: true },
    { line: answer('the last answer') }
  ])

  test.each([false, true])('every turn of a rollout: the question\'s text and the body\'s lines (cold %s)', async (cold) => {
    const file = rolloutOf(content, cold)
    const plain = rolloutOf(content, false)
    expect(turns).toHaveLength(3)
    const handed: string[] = []
    for (const { question, body } of turns) {
      const { texts } = await readRanges(plain, [question, body])
      const read = await readTurn('codex', file, question, body)
      expect(read.question).toBe(texts[0])
      expect(linesOf(read)).toEqual(split(texts[1]))
      handed.push(read.question, ...(linesOf(read) ?? []))
    }
    // The invalid bytes are inside the turns read, each replaced as the WHATWG decoder replaces it: one U+FFFD for the
    // lone byte, one for the cut sequence, two for the overlong form, three for the surrogate
    expect(handed.join('').split(String.fromCharCode(0xfffd)).length - 1).toBe(7)
  })

  // Ranges the index never records, so that each line the read meets is cut by them somewhere: a body starting inside
  // a line, inside a character, at a line feed; ending inside a line, inside a character, right after a line feed; an
  // empty body; a question that runs over several lines, as a Grok question does
  const lines = rollout([
    { line: meta() },
    { line: answer('one' + String.fromCharCode(0x4e2d, 0x6587)) },
    { line: Buffer.alloc(0) },
    { line: answer('two') },
    { line: answer('three') }
  ]).content
  const at = (needle: string | Buffer, from = 0): number => lines.indexOf(needle, from)
  const han = at(Buffer.from(String.fromCharCode(0x4e2d)))
  const nl = (k: number): number => {
    let i = -1
    for (let n = 0; n <= k; n++) i = lines.indexOf(0x0a, i + 1)
    return i
  }
  // And lines longer than one read of the module (1 MiB). One of nine reads is taken over as the buffer that assembled
  // it rather than copied: one holds invalid bytes, a short line follows it in the same read, and a body ends inside
  // another, or starts inside the first. One of a read and a half is copied out, its buffer kept, and holds invalid bytes
  const MiB = 1024 * 1024
  const long = (n: number, bytes: Buffer): Buffer => {
    const shaped = answer('y'.repeat(n) + 'MARK')
    const at = shaped.indexOf('MARK')
    return Buffer.concat([shaped.subarray(0, at), bytes, shaped.subarray(at + 4)])
  }
  const [first, short, copied, last] = [long(9 * MiB, INVALID[3]), answer('short, after a long line'), long(1.5 * MiB, INVALID[0]), long(9 * MiB, Buffer.from('z'))]
  const longs = rollout([{ line: meta() }, { line: ask('q'), question: true }, { line: first }, { line: short }, { line: copied }, { line: last }, { line: answer('the end') }])
  const [{ question: q, body: b }] = longs.turns
  const intoLast = b.start + first.length + 1 + short.length + 1 + copied.length + 1 + 4 * MiB
  test.each([
    ['a body from inside a line to inside another', lines, { start: 0, end: 10 }, { start: 10, end: at('two') + 1 }],
    ['a body starting and ending inside a character', lines, { start: 0, end: han + 1 }, { start: han + 1, end: han + 4 }],
    ['a body starting at a line feed, ending right after one', lines, { start: 0, end: nl(1) }, { start: nl(1), end: nl(3) + 1 }],
    ['an empty body inside a line', lines, { start: 0, end: 7 }, { start: 7, end: 7 }],
    ['a question over several lines, a body to the stream\'s end', lines, { start: 5, end: at('two') }, { start: at('two'), end: lines.length }],
    ['lines longer than a read, the whole body', longs.content, q, b],
    ['lines longer than a read, a body that ends inside one', longs.content, q, { start: b.start, end: intoLast }],
    ['lines longer than a read, a body that starts inside one', longs.content, { start: q.start, end: b.start + 1000 }, { start: b.start + 1000, end: b.end }]
  ])('%s: the pieces are the range\'s text split at its line feeds, plain and cold', async (_what, content, question, body) => {
    for (const cold of [false, true]) {
      const { texts } = await readRanges(rolloutOf(content, false), [question, body])
      const read = await readTurn('codex', rolloutOf(content, cold), question, body)
      expect(read.question).toBe(texts[0])
      expect(linesOf(read)).toEqual(split(texts[1]))
    }
  })
})

describe('a turn read stops at the turn\'s end (session-view C2)', () => {
  const MiB = 1024 * 1024
  /** A rollout of two turns, the second's answer `after` bytes long */
  const twoTurns = (after: number): ReturnType<typeof rollout> =>
    rollout([{ line: meta() }, { line: ask('one'), question: true }, { line: answer('first') },
      { line: ask('two'), question: true }, { line: answer('x'.repeat(after)) }])

  test.each([false, true])('what it read is the question and the body in a plain file, the stream up to the body\'s end in a cold rollout, whatever follows (cold %s)', async (cold) => {
    const small = twoTurns(10)
    const big = twoTurns(5 * MiB)
    const [{ question, body }] = small.turns
    expect(big.turns[0]).toEqual(small.turns[0])
    const expected = cold ? body.end : body.end - question.start
    for (const { content } of [small, big]) {
      expect((await readTurn('codex', rolloutOf(content, cold), question, body)).bytesRead).toBe(expected)
    }
  })

  test.each([false, true])('a line after the turn longer than the line limit is not read: the turn is (cold %s)', async (cold) => {
    const { content, turns } = twoTurns(4096)
    const file = rolloutOf(content, cold)
    const seam = threadEngineModule() as LineLimitSeam
    seam.seamLimitLinesOf(file, 1024)
    try {
      // The limit is passed by the line after the first turn only: a read that went on to it would fail
      expect(() => seam.seamEachLine(file, cold)).toThrow(/could not be read to its end/)
      const read = await readTurn('codex', file, turns[0].question, turns[0].body)
      expect(linesOf(read)).toHaveLength(1)
    } finally {
      seam.seamLimitLinesOf(file, null)
    }
  })

  test.each([false, true])('with no body, as over the turn limit: the question alone is read, and no lines are handed over (cold %s)', async (cold) => {
    const { content, turns } = twoTurns(10)
    const { question } = turns[1]
    const read = await readTurn('codex', rolloutOf(content, cold), question, null)
    const { texts } = await readRanges(rolloutOf(content, false), [question])
    expect(read).toEqual({ question: texts[0], body: null, bytesRead: cold ? question.end : question.end - question.start })
  })
})

describe('a turn read holds no allocation of the whole turn but a line of it (#485)', () => {
  // A turn of up to 64 MiB, the turn limit, in lines of several lengths: of a read of the module (1 MiB) exactly, of a
  // read and a little more, of two reads and a little more, of four and a fifth, and one line of it all or of half and a
  // little more. The read hands
  // over its text twice at its peak: the module's lines, and the JavaScript strings made from them on the main thread,
  // each line's freed as its string is made, but the freed memory still counted in the process's resident size.
  // Measured on 2026-11-17, under Node, the peak grew by 130 to 134 MiB for each of these shapes, plain. The range read
  // it replaced, with the decode, the kept-lines call and the split the turn's assembly made (32936fa), grew it by 188
  // to 193 MiB, plain, and by 261 MiB for the cold rollout in 1 MiB lines. So did the turn read as first written
  // (2fda292) for one line, its line buffer copied out while held, and as first fixed (e346a13) for lines a little past
  // one or two reads, the buffers that assembled them handed over at about twice their length. The bound lies between:
  // the text twice and some MiB.
  const MiB = 1024 * 1024
  const shapes = [
    { shape: 'in lines of a read', count: 64, size: MiB },
    { shape: 'in lines a little past a read', count: 63, size: MiB + 10_240 },
    { shape: 'in lines a little past two reads', count: 31, size: 2 * MiB + 10_240 },
    { shape: 'in lines of four reads and a fifth', count: 15, size: 4 * MiB + 200_000 },
    { shape: 'in one line', count: 1, size: 64 * MiB },
    { shape: 'in one line of half the limit and a little more', count: 1, size: 32 * MiB + MiB / 2 }
  ]
  test.each(shapes.flatMap((s) => [false, true].map((cold) => ({ ...s, cold }))))('a turn read $shape grows a fresh process\'s peak by the text twice and a few MiB (cold $cold)', ({ count, size, cold }) => {
    const line = Buffer.concat([Buffer.from('{"a":"'), Buffer.alloc(size - 9, 0x78), Buffer.from('"}')])
    const { content, turns } = rollout([{ line: ask('q'), question: true }, ...Array.from({ length: count }, () => ({ line }))])
    const [{ question, body }] = turns
    const bodyBytes = body.end - body.start
    expect(bodyBytes).toBe(count * size)
    expect(bodyBytes).toBeLessThanOrEqual(64 * MiB)
    const file = rolloutOf(content, cold)
    // In a process of its own, so that the peak it reports is this read's alone
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const [file, q, b] = [process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4])]
      module.exports.seamObserveTurnReadsOf(file, true)
      const before = process.resourceUsage().maxRSS
      module.exports.readTurn('codex', file, q, b).then((read) => {
        const grewKiB = process.resourceUsage().maxRSS - before
        console.log(JSON.stringify({ grewKiB, lines: read.keptLines.length, length: read.keptLines.reduce((n, l) => n + l.length, 0) }))
      })`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, file, JSON.stringify(question), JSON.stringify(body)], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    const { grewKiB, lines, length } = JSON.parse(run.stdout) as { grewKiB: number; lines: number; length: number }
    expect([lines, length]).toEqual([count, count * (size - 1)])
    expect(grewKiB * 1024).toBeLessThan(2 * bodyBytes + 24 * MiB)
  })
})

describe('a Claude Code turn read, its blocks assembled, holds no allocation of the whole turn but a line of it and its blocks (#494)', () => {
  // The module holds the turn's lines and, as each line is read and let go, the blocks made of it; the main thread then
  // makes JavaScript's strings of the blocks, each block's let go as its strings are made. The bound is the Codex
  // read's, the text twice and some MiB: for these shapes the blocks hold nearly all of the text.
  const MiB = 1024 * 1024
  /** A return line of `size` bytes for the call `id` */
  const returnOf = (id: string, size: number): Buffer => {
    const empty = claudeReturn(id, '').length
    return claudeReturn(id, 'x'.repeat(size - empty))
  }
  const shapes = [
    { shape: 'of tool results in lines a little past a read', lines: Array.from({ length: 62 }, (_, i) => [claudeCall(`t${i}`), returnOf(`t${i}`, MiB + 10_240)]).flat() },
    { shape: 'of one answer in a line of half the limit and a little more', lines: [claudeSay('x'.repeat(32 * MiB + MiB / 2))] }
  ]
  test.each(shapes)('a turn $shape grows a fresh process\'s peak by the text twice and a few MiB', ({ lines }) => {
    const { content, turns } = rollout([{ line: claudeAsk('q'), question: true }, ...lines.map((line) => ({ line }))])
    const [{ question, body }] = turns
    const bodyBytes = body.end - body.start
    expect(bodyBytes).toBeGreaterThan(32 * MiB)
    expect(bodyBytes).toBeLessThanOrEqual(64 * MiB)
    const file = claudeFile(content)
    // In a process of its own, so that the peak it reports is this read's alone
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const [file, q, b] = [process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4])]
      const before = process.resourceUsage().maxRSS
      module.exports.readTurn('claude', file, q, b).then((read) => {
        const grewKiB = process.resourceUsage().maxRSS - before
        const shown = read.blocks.reduce((n, b) => n + (b.kind === 'tool' ? b.output.length : b.body.length), 0)
        console.log(JSON.stringify({ grewKiB, blocks: read.blocks.length, shown }))
      })`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, file, JSON.stringify(question), JSON.stringify(body)], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    const { grewKiB, blocks, shown } = JSON.parse(run.stdout) as { grewKiB: number; blocks: number; shown: number }
    // Each return's text is its line less the line's shape around it, whose call ids differ in length
    const returns = lines.length === 1 ? [] : Array.from({ length: lines.length / 2 }, (_, i) => MiB + 10_240 - claudeReturn(`t${i}`, '').length)
    const expected = lines.length === 1 ? [1, 32 * MiB + MiB / 2] : [returns.length, returns.reduce((n, l) => n + l, 0)]
    expect([blocks, shown]).toEqual(expected)
    expect(grewKiB * 1024).toBeLessThan(2 * bodyBytes + 24 * MiB)
  })
})

describe('a Codex turn read, its blocks assembled, holds no allocation of the whole turn but a line of it and its blocks (#496)', () => {
  // As a Claude Code turn's (#494): the module holds the turn's lines and the blocks made of each as it is read and let
  // go, and the main thread makes JavaScript's strings of the blocks. For these shapes the blocks hold nearly all of
  // the text.
  const MiB = 1024 * 1024
  /** A line of a Codex rollout as `line` shapes it, but for the ordinal, so that its length is that of its fields */
  const shaped = (type: string, payload: unknown): Buffer => Buffer.from(JSON.stringify({ timestamp: AT, type, payload }))
  const call = (id: string): Buffer => shaped('response_item', { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"cat log"}', call_id: id })
  const output = (id: string, text: string): Buffer => shaped('response_item', { type: 'function_call_output', call_id: id, output: text })
  /** The length of an output's text in a line of `size` bytes for the call `id`: the line less its shape around the text */
  const textIn = (id: string, size: number): number => size - output(id, '').length
  /** An output line of `size` bytes for the call `id` */
  const outputOf = (id: string, size: number): Buffer => output(id, 'x'.repeat(textIn(id, size)))
  const outputs = Array.from({ length: 62 }, (_, i) => [call(`call_${i}`), outputOf(`call_${i}`, MiB + 10_240)]).flat()
  const shapes = [
    {
      shape: 'of call outputs in lines a little past a read',
      lines: outputs,
      // The call ids differ in length, and so do the shapes around the texts
      expected: [62, Array.from({ length: 62 }, (_, i) => textIn(`call_${i}`, MiB + 10_240)).reduce((n, l) => n + l, 0)]
    },
    {
      shape: 'of one answer in a line of half the limit and a little more',
      lines: [shaped('event_msg', { type: 'agent_message', message: 'x'.repeat(32 * MiB + MiB / 2) })],
      expected: [1, 32 * MiB + MiB / 2]
    }
  ]
  test.each(shapes.flatMap((s) => [false, true].map((cold) => ({ ...s, cold }))))('a turn $shape grows a fresh process\'s peak by the text twice and a few MiB (cold $cold)', ({ lines, expected, cold }) => {
    const { content, turns } = rollout([{ line: ask('q'), question: true }, ...lines.map((line) => ({ line }))])
    const [{ question, body }] = turns
    const bodyBytes = body.end - body.start
    expect(bodyBytes).toBeGreaterThan(32 * MiB)
    expect(bodyBytes).toBeLessThanOrEqual(64 * MiB)
    const file = rolloutOf(content, cold, true)
    // In a process of its own, so that the peak it reports is this read's alone
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const [file, q, b] = [process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4])]
      const before = process.resourceUsage().maxRSS
      module.exports.readTurn('codex', file, q, b).then((read) => {
        const grewKiB = process.resourceUsage().maxRSS - before
        const shown = read.blocks.reduce((n, b) => n + (b.kind === 'tool' ? b.output.length : b.body.length), 0)
        console.log(JSON.stringify({ grewKiB, blocks: read.blocks.length, shown }))
      })`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, file, JSON.stringify(question), JSON.stringify(body)], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    const { grewKiB, blocks, shown } = JSON.parse(run.stdout) as { grewKiB: number; blocks: number; shown: number }
    expect([blocks, shown]).toEqual(expected)
    expect(grewKiB * 1024).toBeLessThan(2 * bodyBytes + 24 * MiB)
  })
})

describe('a turn read that fails', () => {
  test('a panic while assembling the blocks of one Claude Code turn rejects that read alone: a read of another, started with it, is served', async () => {
    const { content, turns } = rollout([{ line: claudeAsk('q'), question: true }, { line: claudeSay('a') }])
    const [{ question, body }] = turns
    const hit = claudeFile(content)
    const other = claudeFile(content)
    const seam = threadEngineModule() as PanicSeam
    seam.seamPanicWhileAssembling(hit)
    try {
      const [failed, spared] = await Promise.allSettled([readTurn('claude', hit, question, body), readTurn('claude', other, question, body)])
      expect(failed.status === 'rejected' && String(failed.reason)).toMatch(/reading .* panicked/)
      expect(spared.status === 'fulfilled' && spared.value.body).toEqual({ blocks: [{ kind: 'text', role: 'assistant', at: Date.parse(AT), body: 'a' }] })
    } finally {
      seam.seamPanicWhileAssembling(null)
    }
  })

  test.each([false, true])('a panic while assembling the blocks of one Codex turn rejects that read alone: a read of another, started with it, is served (cold %s)', async (cold) => {
    const { content, turns } = rollout([{ line: ask('q'), question: true }, { line: line('event_msg', { type: 'agent_message', message: 'a' }) }])
    const [{ question, body }] = turns
    const hit = rolloutOf(content, cold, true)
    const other = rolloutOf(content, cold, true)
    const seam = threadEngineModule() as PanicSeam
    seam.seamPanicWhileAssembling(hit)
    try {
      const [failed, spared] = await Promise.allSettled([readTurn('codex', hit, question, body), readTurn('codex', other, question, body)])
      expect(failed.status === 'rejected' && String(failed.reason)).toMatch(/reading .* panicked/)
      expect(spared.status === 'fulfilled' && spared.value.body).toEqual({ blocks: [{ kind: 'text', role: 'assistant', at: Date.parse(AT), body: 'a' }] })
    } finally {
      seam.seamPanicWhileAssembling(null)
    }
  })

  test.each([false, true])('a panic while reading one session file rejects that read alone: a read of another, started with it, is served (cold %s)', async (cold) => {
    const shown = answer('a')
    const { content, turns } = rollout([{ line: ask('q'), question: true }, { line: shown }])
    const [{ question, body }] = turns
    const hit = rolloutOf(content, cold)
    const other = rolloutOf(content, cold)
    const seam = threadEngineModule() as PanicSeam
    seam.seamPanicWhileReading(hit)
    try {
      const [failed, spared] = await Promise.allSettled([readTurn('codex', hit, question, body), readTurn('codex', other, question, body)])
      expect(failed.status === 'rejected' && String(failed.reason)).toMatch(/reading .* panicked/)
      expect(spared.status === 'fulfilled' && linesOf(spared.value)).toEqual([shown.toString('utf8')])
    } finally {
      seam.seamPanicWhileReading(null)
    }
  })
})

// The order reads run in is decided at the hold seam's gate (engine/src/seams.rs), where each read waits on its own
// thread before it opens its file until the case releases it, never by how long a read takes
describe('the places turn reads take (session-view C2)', () => {
  const seam = (): HoldSeam => threadEngineModule() as HoldSeam
  /** Each case's held reads, as they settle: a case that fails still lets its reads go, and waits for them, so that none
   * of them holds a place in the next case */
  const asked: Array<Promise<unknown>> = []
  afterEach(async () => {
    seam().seamReleaseReadsOf(null)
    await Promise.all(asked.splice(0))
    vi.restoreAllMocks()
  })
  /** Long enough for a read that panics at the seam's five-second valve, four times over, with a case's own steps */
  const HELD_CASE = 30_000
  /** Under the valve: a read not at the gate by then never came to it */
  const AT_THE_GATE = { timeout: 4000 }
  /** Once the turns a settled read handed out have run */
  const quiet = (): Promise<void> => new Promise((go) => setImmediate(go))

  const { content, turns } = rollout([{ line: ask('q'), question: true }, { line: Buffer.from('{"a":1}') }])
  const [{ question, body }] = turns
  /** Each read handed to the engine module from now on, a turn's or a range read's, by the file it reads, in order */
  function watchHanded(): string[] {
    const engine = threadEngineModule()
    const handed: string[] = []
    const turn = engine.readTurn.bind(engine)
    const ranges = engine.readRanges.bind(engine)
    vi.spyOn(engine, 'readTurn').mockImplementation((kind, file, q, b) => {
      handed.push(file)
      return turn(kind, file, q, b)
    })
    vi.spyOn(engine, 'readRanges').mockImplementation((kind, file, r) => {
      handed.push(file)
      return ranges(kind, file, r)
    })
    return handed
  }
  const held = (files: string[]): void => {
    for (const file of files) seam().seamHoldReadsOf(file)
  }
  const served = (outcomes: Array<PromiseSettledResult<TurnRead>>): unknown[] =>
    outcomes.map((o) => o.status === 'fulfilled' && linesOf(o.value))

  test('a cold rollout\'s turn read takes one of the four cold places its range reads take: a fifth cold read waits for one to be given up', async () => {
    const handed = watchHanded()
    const cold = Array.from({ length: 5 }, () => rolloutOf(content, true))
    held(cold)
    const reads = [readTurn('codex', cold[0], question, body), readTurn('codex', cold[1], question, body),
      readColdRanges(cold[2], [body]), readTurn('codex', cold[3], question, body)]
    const fifth = readTurn('codex', cold[4], question, body)
    const outcomes = Promise.allSettled([...reads, fifth])
    asked.push(outcomes)
    expect(handed).toEqual(cold.slice(0, 4))
    await expect.poll(() => seam().seamReadsHeld().sort(), AT_THE_GATE).toEqual(cold.slice(0, 4).sort())
    seam().seamReleaseReadsOf(cold[0])
    await reads[0]
    await quiet()
    expect(handed).toEqual(cold)
    seam().seamReleaseReadsOf(null)
    expect((await outcomes).every((o) => o.status === 'fulfilled')).toBe(true)
  }, HELD_CASE)

  test('a plain file\'s turn read never waits for a cold place, and runs on the thread pool the main process\'s reads of plain files run on: while four hold it, a file read waits (D2b)', async () => {
    const handed = watchHanded()
    const cold = Array.from({ length: 4 }, () => rolloutOf(content, true))
    const plain = Array.from({ length: 4 }, () => rolloutOf(content, false))
    held([...cold, ...plain])
    // Every cold place held, and every thread of the pool
    const colds = cold.map((file) => readTurn('codex', file, question, body))
    const plains = plain.map((file) => readTurn('codex', file, question, body))
    const outcomes = Promise.allSettled([...colds, ...plains])
    asked.push(outcomes)
    expect(handed).toEqual([...cold, ...plain])
    await expect.poll(() => seam().seamReadsHeld().sort(), AT_THE_GATE).toEqual([...cold, ...plain].sort())
    // A file read of the main process's own waits for a thread of the pool: a read that took none would be done in a
    // few milliseconds
    let done = false
    const other = readFile(plain[0]).then(() => {
      done = true
    })
    asked.push(other)
    await new Promise((go) => setTimeout(go, 300))
    expect(done).toBe(false)
    seam().seamReleaseReadsOf(plain[0])
    await other
    seam().seamReleaseReadsOf(null)
    expect(served(await outcomes)).toEqual(Array(8).fill(['{"a":1}']))
  }, HELD_CASE)
})
