// A turn's read (turn-read.ts, the engine module's `readTurn`): the question's text and the body's lines, read line by
// line in one pass that stops at the turn's end (session-view C2, #485). What it hands over is held to what the range
// read gives the same ranges, decoded by Node (`readRanges`), which the turn read replaced: the question's text the
// same, so that the revision tying a fetch to its question is unchanged, and the body's text split at its line feeds.
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readRanges, type ByteRange } from './range-read'
import { readColdRanges } from './cold-rollout'
import { readTurnLines } from './turn-read'
import { threadEngineModule } from '../engine-module'
import { TEST_ENGINE, type HoldSeam, type LineLimitSeam, type PanicSeam } from '../testing/engine'

const dir = mkdtempSync(join(tmpdir(), 'turn-read-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let files = 0

/** A Codex rollout holding `content`, under a cold rollout's name and as its zstd stream when `cold` */
function rolloutOf(content: Buffer, cold: boolean): string {
  const file = join(dir, `rollout-${files++}.jsonl${cold ? '.zst' : ''}`)
  writeFileSync(file, cold ? zstdCompressSync(content) : content)
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
      const read = await readTurnLines('codex', file, question, body)
      expect(read.question).toBe(texts[0])
      expect(read.lines).toEqual(split(texts[1]))
      handed.push(read.question, ...(read.lines ?? []))
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
  test.each([
    ['a body from inside a line to inside another', { start: 0, end: 10 }, { start: 10, end: at('two') + 1 }],
    ['a body starting and ending inside a character', { start: 0, end: han + 1 }, { start: han + 1, end: han + 4 }],
    ['a body starting at a line feed, ending right after one', { start: 0, end: nl(1) }, { start: nl(1), end: nl(3) + 1 }],
    ['an empty body inside a line', { start: 0, end: 7 }, { start: 7, end: 7 }],
    ['a question over several lines, a body to the stream\'s end', { start: 5, end: at('two') }, { start: at('two'), end: lines.length }]
  ])('%s: the pieces are the range\'s text split at its line feeds, plain and cold', async (_what, question, body) => {
    for (const cold of [false, true]) {
      const plain = rolloutOf(lines, false)
      const { texts } = await readRanges(plain, [question, body])
      const read = await readTurnLines('codex', rolloutOf(lines, cold), question, body)
      expect(read.question).toBe(texts[0])
      expect(read.lines).toEqual(split(texts[1]))
    }
  })

  // Lines longer than one read of the module (1 MiB), which it hands over as the buffer that assembled them rather than
  // a copy: one holding invalid bytes, a short line after it in the same read, and one the body ends inside of; and a
  // body that starts inside a long line
  const MiB = 1024 * 1024
  const long = (n: number, bytes: Buffer): Buffer => {
    const shaped = answer('y'.repeat(n) + 'MARK')
    const at = shaped.indexOf('MARK')
    return Buffer.concat([shaped.subarray(0, at), bytes, shaped.subarray(at + 4)])
  }
  const longs = rollout([
    { line: meta() },
    { line: ask('q'), question: true },
    { line: long(1.5 * MiB, INVALID[3]) },
    { line: answer('short, after a long line') },
    { line: long(2.5 * MiB, Buffer.from('z')) },
    { line: answer('the end') }
  ])
  const [{ question: q, body: b }] = longs.turns
  const intoSecond = longs.content.indexOf('z', b.start) - MiB
  test.each([
    ['the whole body', q, b],
    ['a body that ends inside a long line', q, { start: b.start, end: intoSecond }],
    ['a body that starts inside a long line', { start: q.start, end: b.start + 1000 }, { start: b.start + 1000, end: b.end }]
  ])('lines longer than a read, %s: the pieces are the range\'s text split at its line feeds, plain and cold', async (_what, question, body) => {
    expect(intoSecond - b.start).toBeGreaterThan(2.5 * MiB)
    for (const cold of [false, true]) {
      const { texts } = await readRanges(rolloutOf(longs.content, false), [question, body])
      const read = await readTurnLines('codex', rolloutOf(longs.content, cold), question, body)
      expect(read.question).toBe(texts[0])
      expect(read.lines).toEqual(split(texts[1]))
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
      expect((await readTurnLines('codex', rolloutOf(content, cold), question, body)).bytesRead).toBe(expected)
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
      const read = await readTurnLines('codex', file, turns[0].question, turns[0].body)
      expect(read.lines).toHaveLength(1)
    } finally {
      seam.seamLimitLinesOf(file, null)
    }
  })

  test.each([false, true])('with no body, as over the turn limit: the question alone is read, and no lines are handed over (cold %s)', async (cold) => {
    const { content, turns } = twoTurns(10)
    const { question } = turns[1]
    const read = await readTurnLines('codex', rolloutOf(content, cold), question, null)
    const { texts } = await readRanges(rolloutOf(content, false), [question])
    expect(read).toEqual({ question: texts[0], lines: null, bytesRead: cold ? question.end : question.end - question.start })
  })
})

describe('a turn read holds no allocation of the whole turn but a line of it (#485)', () => {
  // A turn of 64 MiB, the turn limit, in 1 MiB lines and in one line. The read hands over its text twice at its peak:
  // the module's lines, and the JavaScript strings made from them on the main thread, each line's freed as its string
  // is made, but the freed memory still counted in the process's resident size. Measured on 2026-11-17, under Node, the
  // peak grew by 132 MiB for the plain file in 1 MiB lines and 135 MiB for the cold rollout. The range read it
  // replaced, with the decode, the kept-lines call and the split the turn's assembly made (32936fa), grew it by 193 MiB
  // and 261 MiB: the body's bytes, its string, the module's copy of that string for the kept-lines rule, and for the
  // cold rollout the pieces and their join as well; by 193 MiB for the plain file in one line. So did the turn read as
  // first written (2fda292) for the one line, its line buffer grown by doubling and zeroed whole. The bound lies
  // between: the text twice and some MiB.
  const MiB = 1024 * 1024
  test.each([
    { shape: 'in 1 MiB lines', count: 64, size: MiB, cold: false },
    { shape: 'in 1 MiB lines', count: 64, size: MiB, cold: true },
    { shape: 'in one line', count: 1, size: 64 * MiB, cold: false },
    { shape: 'in one line', count: 1, size: 64 * MiB, cold: true }
  ])('a 64 MiB turn read $shape grows a fresh process\'s peak by the text twice and a few MiB (cold $cold)', ({ count, size, cold }) => {
    const line = Buffer.concat([Buffer.from('{"a":"'), Buffer.alloc(size - 9, 0x78), Buffer.from('"}')])
    const { content, turns } = rollout([{ line: ask('q'), question: true }, ...Array.from({ length: count }, () => ({ line }))])
    const [{ question, body }] = turns
    expect(body.end - body.start).toBe(64 * MiB)
    const file = rolloutOf(content, cold)
    // In a process of its own, so that the peak it reports is this read's alone
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const [file, q, b] = [process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4])]
      const before = process.resourceUsage().maxRSS
      module.exports.readTurn('codex', file, q, b).then((read) => {
        const grewKiB = process.resourceUsage().maxRSS - before
        console.log(JSON.stringify({ grewKiB, lines: read.lines.length, length: read.lines.reduce((n, l) => n + l.length, 0) }))
      })`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, file, JSON.stringify(question), JSON.stringify(body)], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    const { grewKiB, lines, length } = JSON.parse(run.stdout) as { grewKiB: number; lines: number; length: number }
    expect([lines, length]).toEqual([count, count * (size - 1)])
    expect(grewKiB * 1024).toBeLessThan(2 * 64 * MiB + 24 * MiB)
  })
})

describe('a turn read that fails', () => {
  test.each([false, true])('a panic while reading one session file rejects that read alone: a read of another, started with it, is served (cold %s)', async (cold) => {
    const shown = answer('a')
    const { content, turns } = rollout([{ line: ask('q'), question: true }, { line: shown }])
    const [{ question, body }] = turns
    const hit = rolloutOf(content, cold)
    const other = rolloutOf(content, cold)
    const seam = threadEngineModule() as PanicSeam
    seam.seamPanicWhileReading(hit)
    try {
      const [failed, spared] = await Promise.allSettled([readTurnLines('codex', hit, question, body), readTurnLines('codex', other, question, body)])
      expect(failed.status === 'rejected' && String(failed.reason)).toMatch(/reading .* panicked/)
      expect(spared.status === 'fulfilled' && spared.value.lines).toEqual([shown.toString('utf8')])
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
  const served = (outcomes: Array<PromiseSettledResult<{ lines: string[] | null }>>): unknown[] =>
    outcomes.map((o) => o.status === 'fulfilled' && o.value.lines)

  test('a cold rollout\'s turn read takes one of the four cold places its range reads take: a fifth cold read waits for one to be given up', async () => {
    const handed = watchHanded()
    const cold = Array.from({ length: 5 }, () => rolloutOf(content, true))
    held(cold)
    const reads = [readTurnLines('codex', cold[0], question, body), readTurnLines('codex', cold[1], question, body),
      readColdRanges(cold[2], [body]), readTurnLines('codex', cold[3], question, body)]
    const fifth = readTurnLines('codex', cold[4], question, body)
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
    const colds = cold.map((file) => readTurnLines('codex', file, question, body))
    const plains = plain.map((file) => readTurnLines('codex', file, question, body))
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
