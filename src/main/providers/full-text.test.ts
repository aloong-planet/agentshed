import { afterAll, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { threadEngineModule } from '../engine-module'
import { TEST_ENGINE, type PanicSeam } from '../testing/engine'
import { searchFullText, type FullTextFound, type TurnBounds } from './full-text'
import { searchBytes } from './search-bytes'

const dir = mkdtempSync(join(tmpdir(), 'full-text-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let files = 0

/** A session file holding `content` */
function fileOf(content: Buffer | string, name = `f${files++}.jsonl`): string {
  const file = join(dir, name)
  writeFileSync(file, content)
  return file
}

/**
 * Every byte offset where the search finds `needle` in `content`: the file is cut into turns one byte wide, each
 * with an empty question, so every hit is the body hit of the turn at its offset, and the turn is the offset
 */
async function offsets(content: string, needle: string): Promise<number[]> {
  const bytes = Buffer.from(content, 'utf8')
  const turns = Array.from({ length: bytes.length }, (_, o) => ({ start: o, questionEnd: o, end: o + 1 }))
  const found = await searchFullText('claude', fileOf(bytes), needle, turns)
  expect(found.folded).toBe(0)
  return found.body.map((b) => b.turn)
}

// The byte rule a hit is found by, the one searchBytes holds for the question search (search-bytes.test.ts): each
// assertion of that file again, through the full-text search, which finds its hits by a matcher of its own
describe('the full-text search finds hits by the byte rule of the question search', () => {
  test('ASCII is case-insensitive: searching notarize hits Notarize/NOTARIZE/nOtArIzE', async () => {
    const text = 'first Notarize, then NOTARIZE, finally nOtArIzE'
    expect(await offsets(text, 'notarize')).toHaveLength(3)
    expect(await offsets(text, 'NOTARIZE')).toHaveLength(3)
  })

  test('multi-byte text matches verbatim by bytes, and the offsets are bytes rather than characters', async () => {
    const text = 'prefix →target→ suffix'
    const hits = await offsets(text, '→target→')
    expect(hits).toEqual([Buffer.byteLength('prefix ')])
  })

  test('a mixed needle: the letters fold and the multi-byte part matches exactly', async () => {
    expect(await offsets('mentions MAS →listing, and also mas →listing elsewhere', 'mas →listing')).toHaveLength(2)
  })

  test('overlapping hits each count, offsets ascending; no match and an empty needle find nothing', async () => {
    expect(await offsets('aaa', 'aa')).toEqual([0, 1])
    expect(await offsets('aaa', 'zzz')).toEqual([])
    expect(await offsets('aaa', '')).toEqual([])
  })

  test('a needle whose bytes would straddle two characters does not hit', async () => {
    expect(await offsets('→€', '€')).toHaveLength(1)
    expect(await offsets('→€', '→€')).toEqual([0])
  })

  test('an all-letter needle finds every case variant in a large text', async () => {
    expect(await offsets(`${'x'.repeat(1000)}Alpha${'y'.repeat(1000)}ALPHA${'z'.repeat(1000)}alpha`, 'alpha')).toHaveLength(3)
  })
})

// ── The whole-file search this one replaced, as search-sessions.ts ran it before #479 (fc20a2b), copied unchanged: the
// oracle each case holds the streaming search to, run over the file's whole stream in memory ──
const fold = (s: string): string => s.toLowerCase()
function extractSnippet(lineText: string, needle: string): string | null {
  let obj: unknown
  try {
    obj = JSON.parse(lineText)
  } catch {
    return null
  }
  const needleF = fold(needle)
  const walk = (v: unknown): string | null => {
    if (typeof v === 'string') {
      const idx = fold(v).indexOf(needleF)
      if (idx === -1) return null
      const from = Math.max(0, idx - 20)
      const to = Math.min(v.length, idx + needle.length + 60)
      return `${from > 0 ? '…' : ''}${v.slice(from, to)}${to < v.length ? '…' : ''}`
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = walk(x)
        if (r !== null) return r
      }
      return null
    }
    if (typeof v === 'object' && v !== null) {
      for (const x of Object.values(v)) {
        const r = walk(x)
        if (r !== null) return r
      }
    }
    return null
  }
  return walk(obj)
}
function turnIndexOf(recs: readonly TurnBounds[], off: number): number {
  let lo = 0
  let hi = recs.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (off < recs[mid].start) hi = mid - 1
    else if (off >= recs[mid].end) lo = mid + 1
    else return mid
  }
  return -1
}
function lineAround(buf: Buffer, off: number): string {
  const start = buf.lastIndexOf(0x0a, off) + 1
  let end = buf.indexOf(0x0a, off)
  if (end === -1) end = buf.length
  return buf.subarray(start, end).toString('utf8')
}
function wholeFileSearch(whole: Buffer, k: string, recs: readonly TurnBounds[]): FullTextFound {
  let folded = 0
  const bodyHit = new Set<number>()
  const bodySnippet = new Map<number, string | null>()
  for (const off of searchBytes(whole, k)) {
    const t = turnIndexOf(recs, off)
    if (t === -1) {
      folded++
      continue
    }
    if (off < recs[t].questionEnd) continue
    if (bodyHit.has(t)) continue
    bodyHit.add(t)
    bodySnippet.set(t, extractSnippet(lineAround(whole, off), k))
  }
  return { folded, body: [...bodyHit].sort((x, y) => x - y).map((turn) => ({ turn, snippet: bodySnippet.get(turn) ?? null })) }
}

/** A session file's lines, each a line's text or its raw bytes, every one ending with a line feed; and its turns, one
 * from each line `questions` names to the next one's start, its question that line, the last to the stream's end */
function session(lines: ReadonlyArray<string | Buffer>, questions: readonly number[]): { bytes: Buffer; turns: TurnBounds[] } {
  const parts = lines.map((l) => Buffer.concat([typeof l === 'string' ? Buffer.from(l, 'utf8') : l, Buffer.from('\n')]))
  const starts: number[] = []
  let at = 0
  for (const p of parts) {
    starts.push(at)
    at += p.length
  }
  const turns = questions.map((q, i) => ({
    start: starts[q],
    questionEnd: starts[q] + parts[q].length,
    end: i + 1 < questions.length ? starts[questions[i + 1]] : at
  }))
  return { bytes: Buffer.concat(parts), turns }
}

/** `bytes` as a cold rollout of `frames` zstd frames, cut at even shares of the stream */
function cold(bytes: Buffer, frames = 1): Buffer {
  const cuts = Array.from({ length: frames + 1 }, (_, i) => Math.round((bytes.length * i) / frames))
  return Buffer.concat(cuts.slice(1).map((end, i) => zstdCompressSync(bytes.subarray(cuts[i], end))))
}

/**
 * What the search finds in a session of `lines` for `needle`, held to the whole-file search over the same stream, the
 * file plain and as a cold rollout of one frame and of three
 */
async function same(lines: ReadonlyArray<string | Buffer>, questions: readonly number[], needle: string): Promise<FullTextFound> {
  const { bytes, turns } = session(lines, questions)
  const expected = wholeFileSearch(bytes, needle, turns)
  expect(await searchFullText('codex', fileOf(bytes), needle, turns)).toEqual(expected)
  expect(await searchFullText('codex', fileOf(cold(bytes), `f${files++}.jsonl.zst`), needle, turns)).toEqual(expected)
  expect(await searchFullText('codex', fileOf(cold(bytes, 3), `f${files++}.jsonl.zst`), needle, turns)).toEqual(expected)
  return expected
}

// Lines shaped as a Codex rollout writes them (sampled 2026-11-17): every line an object of timestamp, ordinal, type
// and payload, the payload nested, a turn's question an event_msg user_message
const AT = '2026-11-12T09:36:03.436Z'
let ordinal = 0
const line = (type: string, payload: unknown): string => JSON.stringify({ timestamp: AT, ordinal: ordinal++, type, payload })
const ask = (message: string): string => line('event_msg', { type: 'user_message', message, images: [] })
const answer = (text: string): string =>
  line('response_item', { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text }], phase: 'final' })
const tool = (output: string): string => line('response_item', { type: 'function_call_output', call_id: 'call_1', output })
const meta = (): string => line('session_meta', { session_id: 's1', id: 's1', timestamp: AT, cwd: '/work/p', runtime_workspace_roots: [] })

describe('the full-text search gives what the whole-file search gave', () => {
  test('a turn is reported once, with the snippet of its first body hit; a hit on the question line is not a body hit', async () => {
    const found = await same(
      [meta(), ask('find the magicword'), answer('first magicword here'), tool('then MagicWord again'), ask('plain'), answer('no hit')],
      [1, 4],
      'magicword'
    )
    expect(found).toEqual({ folded: 0, body: [{ turn: 0, snippet: 'first magicword here' }] })
  })

  test('hits outside every turn are folded: the noise before the first question and a stripped fork prefix', async () => {
    const found = await same(
      [meta(), answer('replayed magicword'), tool('replayed MAGICWORD and magicword'), ask('q'), answer('magicword')],
      [3],
      'magicword'
    )
    expect(found.folded).toBe(3)
    expect(found.body).toEqual([{ turn: 0, snippet: 'magicword' }])
  })

  test('overlapping hits each count, inside turns and folded', async () => {
    const found = await same([answer('aaaa'), ask('q'), answer('aaaa')], [1], 'aa')
    // 'aaaa' holds three overlapping hits; the line's own JSON adds none
    expect(found.folded).toBe(3)
    expect(found.body).toEqual([{ turn: 0, snippet: 'aaaa' }])
  })

  test('ASCII letters fold, in the needle and in the file', async () => {
    const found = await same([ask('q'), answer('the MAGICWORD'), ask('q2'), answer('MagicWord')], [0, 2], 'MaGiCwOrD')
    expect(found.body.map((b) => b.turn)).toEqual([0, 1])
  })

  test.each([
    ['all letters', 'error'],
    ['no letters', String.fromCharCode(0x6d4b, 0x8bd5) + '42'],
    ['letters and others', 'mas →listing']
  ])('a needle of %s', async (_, needle) => {
    const hit = `before ${needle.toUpperCase()} after`
    const found = await same([meta(), tool(hit), ask('q'), answer(hit), tool(`${needle} twice ${needle}`), ask('q2'), answer('none')], [2, 5], needle)
    expect(found.folded).toBe(1)
    expect(found.body).toEqual([{ turn: 0, snippet: hit }])
  })

  test('a hit across the 1 MiB chunks the stream is read in, in a line longer than one', async () => {
    const MiB = 1024 * 1024
    const head = line('response_item', { type: 'function_call_output', call_id: 'call_1', output: '' })
    // The output string places the needle across the stream's first 1 MiB boundary
    const lead = 'x'.repeat(MiB - (Buffer.byteLength(ask('q')) + 1) - head.indexOf('""') - 1 - 4)
    const long = tool(`${lead}magicword${'y'.repeat(MiB)}`)
    const { bytes } = session([ask('q'), long], [0])
    const at = bytes.indexOf('magicword')
    expect(at).toBeLessThan(MiB)
    expect(at + 'magicword'.length).toBeGreaterThan(MiB)
    const found = await same([ask('q'), long], [0], 'magicword')
    expect(found.body).toEqual([{ turn: 0, snippet: `…${'x'.repeat(20)}magicword${'y'.repeat(60)}…` }])
  })

  test('a needle with a line feed hits across lines, and its snippet comes from the line the hit starts in', async () => {
    // A line of JSON holds no raw line feed, so no string of the line holds such a needle: the snippet is null, as it was
    const lines = [ask('q'), answer('ends with tail'), answer('next'), ask('q2'), answer('x')]
    const tail = `tail"}],"phase":"final"}}\n{"timestamp`
    expect(await same(lines, [0, 3], tail)).toEqual({ folded: 0, body: [{ turn: 0, snippet: null }] })
    // A needle that begins with its line feed hits at that line feed, whose line around it is empty; the second turn's
    // last line has no line after it
    expect(await same(lines, [0, 3], `\n{"timestamp":"${AT}","ordinal"`)).toEqual({ folded: 0, body: [{ turn: 0, snippet: null }] })
    // One that ends with it, and one with two
    expect((await same(lines, [0, 3], '"final"}}\n')).body.map((b) => b.turn)).toEqual([0, 1])
    expect((await same([ask('q'), 'a', 'b', 'a', 'b', 'c'], [0], 'a\nb\nc')).body).toEqual([{ turn: 0, snippet: null }])
  })
})

// The snippet, worked out in the engine module as extractSnippet worked it out, quirk for quirk. Each character here
// lowers the same in every Unicode version since 15, so the oracle gives the same answer under any Node the tests run
// on; the mapping of every code point is held to the app's own JavaScript below.
describe("a turn's snippet is cut as the whole-file search cut it", () => {
  const ELLIPSIS = String.fromCharCode(0x2026)
  const REPLACEMENT = String.fromCharCode(0xfffd)
  /** The snippet the one body line `body` gives for `needle`, in a turn of its own */
  const snippetOf = async (body: string | Buffer, needle: string): Promise<string | null> => {
    const found = await same([ask('q'), body], [0], needle)
    expect(found.body).toHaveLength(1)
    return found.body[0].snippet
  }

  test('an invalid UTF-8 sequence reads as U+FFFD, one for each maximal subpart', async () => {
    // A three-byte sequence cut after two bytes is one subpart; F0 80 80 is three, as F0 never takes 80 after it
    const body = Buffer.concat([Buffer.from('{"t":"a'), Buffer.from([0xe2, 0x82]), Buffer.from('b'), Buffer.from([0xf0, 0x80, 0x80]), Buffer.from(' magic"}')])
    expect(await snippetOf(body, 'magic')).toBe(`a${REPLACEMENT}b${REPLACEMENT.repeat(3)} magic`)
  })

  test("an object's array-index keys come first, ascending, then its other keys in the order written", async () => {
    expect(await snippetOf('{"b":"magic b","2":"magic 2","1":"magic 1"}', 'magic')).toBe('magic 1')
    // 2^32 - 2 is an array index, 2^32 - 1 and a leading zero are not
    expect(await snippetOf('{"b":"magic b","4294967295":"magic max","01":"magic 01","4294967294":"magic index"}', 'magic')).toBe('magic index')
    expect(await snippetOf('{"b":"magic b","4294967295":"magic max","01":"magic 01"}', 'magic')).toBe('magic b')
  })

  test('a repeated key keeps its first place and its last value', async () => {
    expect(await snippetOf('{"a":"magic first","b":"magic b","a":"none"}', 'magic')).toBe('magic b')
    expect(await snippetOf('{"a":"none","b":"magic b","a":"magic last"}', 'magic')).toBe('magic last')
  })

  test('the first string holding the needle once lowered, which may hold it only by toLowerCase', async () => {
    // The Kelvin sign lowers to k: the byte hit is in the second string, the snippet the first
    expect(await snippetOf(`{"a":"5 ${String.fromCharCode(0x212a)}m","b":"km"}`, 'km')).toBe(`5 ${String.fromCharCode(0x212a)}m`)
    // A final sigma lowers to the final form, which the needle's lowered sigma is not
    const SIGMA = String.fromCharCode(0x3a3)
    const word = String.fromCharCode(0x39f, 0x394, 0x39f) + SIGMA
    expect(await snippetOf(`{"a":"${word}","b":"${SIGMA}${String.fromCharCode(0x391)}"}`, SIGMA)).toBe(SIGMA + String.fromCharCode(0x391))
  })

  test('a lone surrogate escape stays that code unit', async () => {
    expect(await snippetOf('{"t":"\\ud800 magic"}', 'magic')).toBe(`${String.fromCharCode(0xd800)} magic`)
  })

  test('the cut is made in the string at the offset found in the lowered one: a character that lowers longer moves it', async () => {
    // U+0130 lowers to two code units, so each one before the hit moves the cut one unit to the right
    const dotted = String.fromCharCode(0x130)
    const v = `${dotted.repeat(30)}magic${'z'.repeat(100)}`
    const snippet = await snippetOf(JSON.stringify({ t: v }), 'magic')
    expect(snippet).toBe(`${ELLIPSIS}${v.slice(40, 125)}${ELLIPSIS}`)
  })

  test('an ellipsis marks each side cut, and none a side left whole', async () => {
    const v = `${'a'.repeat(21)}magic${'b'.repeat(61)}`
    expect(await snippetOf(JSON.stringify({ t: v }), 'magic')).toBe(`${ELLIPSIS}${'a'.repeat(20)}magic${'b'.repeat(60)}${ELLIPSIS}`)
    const whole = `${'a'.repeat(20)}magic${'b'.repeat(60)}`
    expect(await snippetOf(JSON.stringify({ t: whole }), 'magic')).toBe(whole)
  })

  test('a line JSON.parse refuses, or whose strings hold the needle only escaped, gives no snippet', async () => {
    expect(await snippetOf('{"t":"magic"', 'magic')).toBeNull()
    expect(await snippetOf('{"t":"magic"} trailing', 'magic')).toBeNull()
    // The byte hit is on the escape's letters, which the string does not hold
    expect(await snippetOf('{"t":"\\u006dagic", "u": "nmagic"}', 'nmagic')).toBe('nmagic')
    expect(await snippetOf('{"t":"x\\nmagic"}', 'nmagic')).toBeNull()
  })

  test('values of every kind, nested, are read in order', async () => {
    const deep = `${'['.repeat(100)}"magic deep"${']'.repeat(100)}`
    expect(await snippetOf(`{"n":1,"t":true,"f":false,"z":null,"o":{"a":[{"x":"magic nested"}]},"d":${deep}}`, 'magic')).toBe('magic nested')
    expect(await snippetOf(`{"n":1,"e":[],"o":{},"d":${deep}}`, 'magic')).toBe('magic deep')
  })

  test('a line nested deeper than any stack still gives its snippet, where the whole-file search threw', async () => {
    const deep = `{"d":${'['.repeat(200_000)}"magic deep"${']'.repeat(200_000)}}`
    const { bytes, turns } = session([ask('q'), deep], [0])
    expect(() => wholeFileSearch(bytes, 'magic', turns)).toThrow(RangeError)
    expect(await searchFullText('codex', fileOf(bytes), 'magic', turns)).toEqual({ folded: 0, body: [{ turn: 0, snippet: 'magic deep' }] })
  })
})

// The snippet lowers each string by the case mapping of the Unicode version Rust's standard library carries, where the
// whole-file search lowered it by JavaScript's toLowerCase, which takes ICU's. The two are held to each other over every
// code point, alone and on each side of a capital sigma, whose final form turns on what is cased and case-ignorable
// around it, and over every lone surrogate. The JavaScript is the app's own: the Electron the app runs on, run as Node,
// as vitest's Node may carry another Unicode version.
test('the snippet lowers text as the JavaScript of the Electron the app runs on does, over every code point', () => {
  const electronDir = fileURLToPath(new URL('../../../node_modules/electron/', import.meta.url))
  const electron = join(electronDir, 'dist', readFileSync(join(electronDir, 'path.txt'), 'utf8'))
  const script = join(dir, 'lower.cjs')
  writeFileSync(
    script,
    `const m = { exports: {} }
process.dlopen(m, ${JSON.stringify(TEST_ENGINE.path)})
const lower = m.exports.seamToLowerCase
const A = String.fromCharCode(0x391), S = String.fromCharCode(0x3a3)
const texts = []
for (let cp = 0; cp <= 0x10ffff; cp++) {
  const c = cp >= 0xd800 && cp <= 0xdfff ? String.fromCharCode(cp) : String.fromCodePoint(cp)
  texts.push(c, A + c + S, A + S + c, A + S + c + A, c + S, c + A + S)
}
const differ = []
// A space is neither cased nor case-ignorable, so texts joined by one lower each on its own
for (let i = 0; i < texts.length; i += 6000) {
  const batch = texts.slice(i, i + 6000)
  if (lower(batch.join(' ')) === batch.join(' ').toLowerCase()) continue
  for (const t of batch) if (lower(t) !== t.toLowerCase()) differ.push([...t].map((c) => c.codePointAt(0).toString(16)).join(' '))
}
process.stdout.write(JSON.stringify({ unicode: process.versions.unicode, texts: texts.length, differ: differ.slice(0, 20) }))
`
  )
  const run = spawnSync(electron, [script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', maxBuffer: 1 << 24 })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  const out = JSON.parse(run.stdout) as { unicode: string; texts: number; differ: string[] }
  expect(out.differ).toEqual([])
  expect(out.texts).toBe(0x110000 * 6)
}, 120_000)

// A file the search cannot read to its end gives nothing it found, never a part (token-stats B12): its caller keeps the
// session's question hits alone (search-sessions.test.ts)
describe('a file that cannot be searched to its end', () => {
  const lines = [meta(), ask('q'), answer('magicword one'), tool('magicword two'), ask('q2'), answer('magicword three')]
  const { bytes, turns } = session(lines, [1, 4])
  const lastLine = bytes.lastIndexOf(0x0a, bytes.length - 2) + 1
  /** Inside the last line, just past its hit */
  const insideLast = bytes.indexOf('magicword three') + 'magicword three'.length

  test('a cold rollout cut inside a line rejects, hits before the cut and all', async () => {
    // The stream ends inside its last line, after every turn's first hit
    const cut = zstdCompressSync(bytes.subarray(0, insideLast))
    expect(insideLast).toBeGreaterThan(lastLine)
    await expect(searchFullText('codex', fileOf(cut, `f${files++}.jsonl.zst`), 'magicword', turns)).rejects.toThrow(/could not be searched to its end/)
  })

  test('a cold rollout cut exactly at a line end reads as the shorter stream: a whole first frame, then a frame cut inside its header', async () => {
    const first = bytes.subarray(0, lastLine)
    const cut = Buffer.concat([zstdCompressSync(first), zstdCompressSync(bytes.subarray(lastLine)).subarray(0, 5)])
    const found = await searchFullText('codex', fileOf(cut, `f${files++}.jsonl.zst`), 'magicword', turns)
    expect(found).toEqual(wholeFileSearch(first, 'magicword', turns))
    expect(found.body).toEqual([{ turn: 0, snippet: 'magicword one' }])
  })

  test('a plain file whose last line has no line feed is searched to its end, that line included', async () => {
    const found = await searchFullText('codex', fileOf(bytes.subarray(0, insideLast)), 'magicword', turns)
    expect(found.body.map((b) => b.turn)).toEqual([0, 1])
  })

  test.each([
    ['a cold rollout that is not zstd', () => fileOf(Buffer.from('{"type":"session_meta"}\nnot zstd at all\n'), `f${files++}.jsonl.zst`)],
    ['a missing cold rollout', () => join(dir, 'missing.jsonl.zst')],
    ['a missing plain file', () => join(dir, 'missing.jsonl')]
  ])('%s rejects', async (_, file) => {
    await expect(searchFullText('codex', file(), 'magicword', turns)).rejects.toThrow(/could not be searched to its end/)
  })

  test('a panic while searching one file rejects that search alone: a search of another, started with it, is served', async () => {
    const hit = fileOf(bytes)
    const other = fileOf(bytes)
    const seam = threadEngineModule() as PanicSeam
    seam.seamPanicWhileReading(hit)
    try {
      const [failed, spared] = await Promise.allSettled([searchFullText('codex', hit, 'magicword', turns), searchFullText('codex', other, 'magicword', turns)])
      expect(failed.status === 'rejected' && String(failed.reason)).toMatch(/searching .* panicked/)
      expect(spared.status === 'fulfilled' && spared.value).toEqual(wholeFileSearch(bytes, 'magicword', turns))
    } finally {
      seam.seamPanicWhileReading(null)
    }
  })
})

// A long cold rollout: one frame of rollout-shaped lines written 128 times over, a stream of more than 300 MiB, a hit of
// the needle in every hundredth line
describe('a long search holds neither the main process\'s thread nor its memory (spec session-view C2)', () => {
  const MiB = 1024 * 1024
  const COPIES = 128
  const content = Buffer.from(
    Array.from({ length: 24000 }, (_, i) => `${i % 100 === 0 ? answer(`line ${i} magicword`) : answer(`line ${i} ${'x'.repeat(i % 97)}`)}\n`).join('')
  )
  let long = ''
  const turns = [{ start: 0, questionEnd: 0, end: COPIES * content.length }]

  test('a timer set before four long searches fires, and a file read asked after them settles, before any of them', async () => {
    long = fileOf(Buffer.concat(Array.from({ length: COPIES }, () => zstdCompressSync(content))), 'long.jsonl.zst')
    const small = fileOf('{"i":0}\n')
    const settled: string[] = []
    const after: Record<string, number> = {}
    const start = performance.now()
    const ask = (name: string, read: Promise<unknown>): Promise<void> =>
      read.then(() => {
        settled.push(name)
        after[name] = performance.now() - start
      })
    const timer = ask('timer', new Promise((go) => setTimeout(go, 0)))
    const searches = [1, 2, 3, 4].map((n) => ask(`search ${n}`, searchFullText('codex', long, 'magicword', turns)))
    await Promise.all([timer, ...searches, ask('file', readFile(small))])
    expect(settled.slice(0, 2).sort()).toEqual(['file', 'timer'])
    expect(after.timer).toBeLessThan(Math.min(...[1, 2, 3, 4].map((n) => after[`search ${n}`])) / 4)
  }, 60_000)

  test("memory follows the line in flight, never the stream: searching all of it grows a fresh process's peak by a few MiB", () => {
    expect(COPIES * content.length).toBeGreaterThan(300 * MiB)
    // In a process of its own, so that the peak it reports is this search's alone
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const before = process.resourceUsage().maxRSS
      module.exports.searchFullText('codex', process.argv[2], 'magicword', JSON.parse(process.argv[3])).then((found) => {
        const grewKiB = process.resourceUsage().maxRSS - before
        console.log(JSON.stringify({ grewKiB, found }))
      })`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, long, JSON.stringify(turns)], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    const { grewKiB, found } = JSON.parse(run.stdout) as { grewKiB: number; found: FullTextFound }
    expect(found).toEqual({ folded: 0, body: [{ turn: 0, snippet: 'line 0 magicword' }] })
    // A search that held the stream, as the whole-file search did, would grow it by more than 300 MiB
    expect(grewKiB * 1024).toBeLessThan(32 * MiB)
  }, 60_000)
})
