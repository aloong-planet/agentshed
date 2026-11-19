// A project's question search over one session file (question-search.ts, the engine module's `searchQuestions`,
// session-view D2, D4): a question hits when its text, as the question list shows it, holds the needle once both are
// lowered by `toLowerCase`, as global search matches a question (global-search S6). The ranges are a question's line
// and its line feed, as the question index records a Claude question's (turn-read.test.ts builds them the same way).
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { threadEngineModule } from '../engine-module'
import type { HoldSeam, PanicSeam } from '../testing/engine'
import { readColdRanges } from './cold-rollout'
import { searchFullText } from './full-text'
import { readRangeBuffers, type ByteRange } from './range-read'
import { searchQuestions } from './question-search'

const dir = mkdtempSync(join(tmpdir(), 'question-search-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let files = 0

const AT = '2026-07-30T02:00:00.000Z'
/** A Claude question's line, as search-sessions.test.ts writes one */
const asked = (text: string): string => JSON.stringify({ type: 'user', timestamp: AT, message: { role: 'user', content: text } })
/** An answer's line */
const answered = (text: string): string =>
  JSON.stringify({ type: 'assistant', timestamp: AT, message: { role: 'assistant', content: [{ type: 'text', text }] } })

type Line = { line: string; question?: true }

/** `lines`, each ended by a line feed, and the range of each line marked a question */
function laid(lines: readonly Line[]): { bytes: Buffer; questions: ByteRange[] } {
  const questions: ByteRange[] = []
  let at = 0
  for (const { line, question } of lines) {
    const end = at + Buffer.byteLength(line) + 1
    if (question) questions.push({ start: at, end })
    at = end
  }
  return { bytes: Buffer.from(lines.map(({ line }) => `${line}\n`).join('')), questions }
}

/** A Claude session file of `lines` and the range of each question */
function session(lines: readonly Line[]): { file: string; questions: ByteRange[] } {
  const { bytes, questions } = laid(lines)
  const file = join(dir, `s${files++}.jsonl`)
  writeFileSync(file, bytes)
  return { file, questions }
}

describe('a question hits when its text as the question list shows it holds the needle, both lowered (session-view D4)', () => {
  const { file, questions } = session([
    { line: asked('Énergie du plan'), question: true },
    { line: answered('sure') },
    { line: asked('Ärger mit dem Build'), question: true },
    { line: asked('say "hi" to them'), question: true },
    { line: asked('C:\\work\\notes'), question: true },
    { line: asked('alpha\nbeta'), question: true }
  ])

  test.each([
    ['a non-ASCII letter of the other case', 'énergie', [[0, 'Énergie du plan']]],
    ['every letter of the other case', 'ÉNERGIE', [[0, 'Énergie du plan']]],
    ['quotes as written', '"hi"', [[2, 'say "hi" to them']]],
    ['a backslash as written', 'C:\\work', [[3, 'C:\\work\\notes']]],
    ['the words either side of a line break, with a space between them', 'alpha beta', [[4, 'alpha beta']]],
    ['not a quote in its escaped form', '\\"hi', []],
    ['not a line break in its escaped form', 'alpha\\nbeta', []],
    ['an empty needle, which every text holds, as `includes` holds it', '', [[0, 'Énergie du plan'], [1, 'Ärger mit dem Build'], [2, 'say "hi" to them'], [3, 'C:\\work\\notes'], [4, 'alpha beta']]]
  ])('%s: %j', async (_, needle, hits) => {
    const found = await searchQuestions('claude', file, needle, questions)
    expect(found.map((q) => [q.question, q.text, q.hit])).toEqual(hits.map(([i, text]) => [i, text, true]))
  })

  test('asked for every question, it gives back each, hit or not, ascending, and a range that holds no question with no text', async () => {
    // The answer's line where a question's range would be: what a range of a file rewritten since its index reads
    const answer = { start: questions[0].end, end: questions[1].start }
    const found = await searchQuestions('claude', file, 'BUILD', [...questions, answer], true)
    expect(found).toEqual([
      { question: 0, text: 'Énergie du plan', hit: false },
      { question: 1, text: 'Ärger mit dem Build', hit: true },
      { question: 2, text: 'say "hi" to them', hit: false },
      { question: 3, text: 'C:\\work\\notes', hit: false },
      { question: 4, text: 'alpha beta', hit: false },
      { question: 5, text: null, hit: false }
    ])
  })
})

// A Codex rollout's lines, shaped as turn-read.test.ts samples them: a turn's question an event_msg user_message
let ordinal = 0
const codexLine = (type: string, payload: unknown): string => JSON.stringify({ timestamp: AT, ordinal: ordinal++, type, payload })
const CODEX = laid([
  { line: codexLine('session_meta', { session_id: 's1', id: 's1', timestamp: AT, cwd: '/work/p', runtime_workspace_roots: [] }) },
  { line: codexLine('event_msg', { type: 'user_message', message: 'where is the Zebra kept', images: [] }), question: true },
  { line: codexLine('response_item', { type: 'message', id: 'm1', role: 'assistant', content: [{ type: 'output_text', text: 'past the giraffes' }], phase: 'final' }) }
])
const ZEBRA = [{ question: 0, text: 'where is the Zebra kept', hit: true }]

/** A Codex rollout holding `bytes`, under a cold rollout's name and as its zstd stream when `cold` */
function rollout(cold: boolean, bytes: Buffer = CODEX.bytes): string {
  const file = join(dir, `rollout-${files++}.jsonl${cold ? '.zst' : ''}`)
  writeFileSync(file, cold ? zstdCompressSync(bytes) : bytes)
  return file
}

describe('a question search that fails rejects, and a search of another file started with it is served', () => {
  test.each([
    ['a missing plain file', () => join(dir, 'missing.jsonl'), false, /could not be read as far as its questions go/],
    ['a missing cold rollout', () => join(dir, 'missing.jsonl.zst'), true, /could not be read as far as its questions go/],
    // Cut inside the question's line: a read that stops once its last range has passed does not see a cut past it
    ['a cold rollout cut inside a question\'s line', () => rollout(true, CODEX.bytes.subarray(0, CODEX.questions[0].end - 5)), true, /could not be read as far as its questions go/],
    ['a cold rollout that is not zstd', () => { const file = join(dir, `rollout-${files++}.jsonl.zst`); writeFileSync(file, CODEX.bytes); return file }, true, /could not be read as far as its questions go/]
  ])('%s', async (_, failing, cold, reason) => {
    const [failed, spared] = await Promise.allSettled([
      searchQuestions('codex', failing(), 'zebra', CODEX.questions),
      searchQuestions('codex', rollout(cold), 'zebra', CODEX.questions)
    ])
    expect(failed.status === 'rejected' && String(failed.reason)).toMatch(reason)
    expect(spared.status === 'fulfilled' && spared.value).toEqual(ZEBRA)
  })

  test.each([false, true])('a panic while searching one file (cold %s)', async (cold) => {
    const hit = rollout(cold)
    const seam = threadEngineModule() as PanicSeam
    seam.seamPanicWhileReading(hit)
    try {
      const [failed, spared] = await Promise.allSettled([searchQuestions('codex', hit, 'zebra', CODEX.questions), searchQuestions('codex', rollout(cold), 'zebra', CODEX.questions)])
      expect(failed.status === 'rejected' && String(failed.reason)).toMatch(/searching .* panicked/)
      expect(spared.status === 'fulfilled' && spared.value).toEqual(ZEBRA)
    } finally {
      seam.seamPanicWhileReading(null)
    }
  })
})

// The order reads run in is decided at the hold seam's gate (engine/src/seams.rs), where each read waits on its own
// thread before it opens its file until the case releases it, never by how long a read takes. That a read waits is
// seen by its not settling while what it waits for is held: a read let through settles in a few milliseconds.
describe('the places a question search takes (session-view C2, D2b)', () => {
  const seam = (): HoldSeam => threadEngineModule() as HoldSeam
  /** Each case's held reads, as they settle: a case that fails still lets its reads go, and waits for them, so that none
   * of them holds a place in the next case */
  const asked: Array<Promise<unknown>> = []
  afterEach(async () => {
    seam().seamReleaseReadsOf(null)
    await Promise.all(asked.splice(0))
  })
  /** Long enough for a read that panics at the seam's five-second valve, four times over, with a case's own steps */
  const HELD_CASE = 30_000
  /** Under the valve: a read not at the gate by then never came to it */
  const AT_THE_GATE = { timeout: 4000 }
  /** Long past what a read let through takes */
  const A_WHILE = 300
  const held = (files: string[]): void => {
    for (const file of files) seam().seamHoldReadsOf(file)
  }
  /** Whether `read` settles within `A_WHILE` */
  async function settlesSoon(read: Promise<unknown>): Promise<boolean> {
    let settled = false
    asked.push(read.then(() => (settled = true), () => (settled = true)))
    await new Promise((go) => setTimeout(go, A_WHILE))
    return settled
  }

  test('a cold rollout\'s question search takes one of the four cold places its range reads, turn reads and full-text searches take, and waits for one when none is free', async () => {
    const cold = Array.from({ length: 4 }, () => rollout(true))
    held(cold)
    // Two question searches, a range read and a full-text search: every place held
    const reads = [searchQuestions('codex', cold[0], 'zebra', CODEX.questions), searchQuestions('codex', cold[1], 'zebra', CODEX.questions),
      readColdRanges(cold[2], CODEX.questions), searchFullText('codex', cold[3], 'zebra', [])]
    asked.push(Promise.allSettled(reads))
    await expect.poll(() => seam().seamReadsHeld().sort(), AT_THE_GATE).toEqual([...cold].sort())
    // A fifth, of a file the gate lets through: it waits for a place
    const fifth = searchQuestions('codex', rollout(true), 'zebra', CODEX.questions)
    expect(await settlesSoon(fifth)).toBe(false)
    seam().seamReleaseReadsOf(cold[2])
    expect(await fifth).toEqual(ZEBRA)
    seam().seamReleaseReadsOf(null)
    expect(await Promise.all(reads.filter((_, k) => k !== 2 && k !== 3))).toEqual([ZEBRA, ZEBRA])
  }, HELD_CASE)

  test('a plain file\'s question search never waits for a cold place, and runs on the thread pool the main process\'s reads of plain files run on: while four hold it, a file read waits (D2b)', async () => {
    const cold = Array.from({ length: 4 }, () => rollout(true))
    const plain = Array.from({ length: 4 }, () => rollout(false))
    held([...cold, ...plain])
    // Every cold place held, and every thread of the pool
    const colds = cold.map((file) => readRangeBuffers(file, CODEX.questions))
    const plains = plain.map((file) => searchQuestions('codex', file, 'zebra', CODEX.questions))
    asked.push(Promise.allSettled([...colds, ...plains]))
    await expect.poll(() => seam().seamReadsHeld().sort(), AT_THE_GATE).toEqual([...cold, ...plain].sort())
    // A file read of the main process's own waits for a thread of the pool
    const other = readFile(plain[0])
    expect(await settlesSoon(other)).toBe(false)
    seam().seamReleaseReadsOf(plain[0])
    expect(await other).toEqual(CODEX.bytes)
    seam().seamReleaseReadsOf(null)
    expect(await Promise.all(plains)).toEqual(Array(4).fill(ZEBRA))
  }, HELD_CASE)
})
