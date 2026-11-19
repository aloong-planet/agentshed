import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionMeta } from '@shared/domain'
import { TokenEngine } from './token-stats'
import { threadEngineModule } from '../engine-module'
import { TEST_ENGINE, type HoldSeam, type LineLimitSeam } from '../testing/engine'
import { searchProjectSessions } from './search-sessions'
import type { ScanRoots } from './types'
import { callRecord, encodeTrajectoryMetadata, settingsJson, writeConversation } from '../testing/agy-fixture'
import { MEASURED_TRANSCRIPT, MEASURED_TRANSCRIPT_ID, writeTranscript } from '../testing/agy-transcript-fixture'

// ─────────────────────────────────────────────────────────────────────────
// Searching this project's sessions (spec D1–D4).
// - Question mode: the engine module reads each question's range by the offsets and matches its text as global search
//   matches a question (D4, question-search.test.ts holds the rule); the stripped question set contains no fork replay
//   copies by construction (03b), so nothing needs folding.
// - Full-text mode: the engine module's byte matching over the stream, line by line (full-text.test.ts),
//   with hits mapped back to their turn by offset. Hits
//   outside the displayed range
//   (an already-stripped fork prefix / an abandoned branch / the noise before the first question) count as
//   folded rather than masquerading as reachable hits (D3).
// ─────────────────────────────────────────────────────────────────────────

let dir = ''
let proj = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-search-'))
  proj = join(dir, 'work', 'p1')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const roots = (): ScanRoots => ({
  claudeHome: join(dir, '.claude'),
  claudeConfigFile: join(dir, '.claude.json'),
  codexHome: join(dir, '.codex'),
  geminiHome: join(dir, '.gemini'),
  grokHome: join(dir, '.grok'),
  antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
  agentsSkillsDir: join(dir, '.agents', 'skills')
})

const enc = (): string => proj.replace(/[^a-zA-Z0-9]/g, '-')

function mkClaude(file: string, lines: string[]): string {
  const d = join(dir, '.claude', 'projects', enc())
  mkdirSync(d, { recursive: true })
  const f = join(d, file)
  writeFileSync(f, lines.join('\n') + '\n')
  return f
}

const TS = '2026-07-30T02:00:00.000Z'
const uL = (t: string): string =>
  JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: t } })
const aL = (t: string): string =>
  JSON.stringify({ type: 'assistant', timestamp: TS, message: { role: 'assistant', content: [{ type: 'text', text: t }] } })

async function run(
  needle: string,
  fullText: boolean
): Promise<Awaited<ReturnType<typeof searchProjectSessions>>> {
  const e = new TokenEngine(join(dir, 'cache'), TEST_ENGINE)
  const t = await e.build(roots(), [proj])
  const sessions: SessionMeta[] = t.perProject.get(proj.toLowerCase())?.sessions ?? []
  return searchProjectSessions(e, roots(), sessions, needle, fullText)
}

// A legacy Codex fork that replays its parent's one question and then asks its own: the replay is stripped
// (spec B2), and the fork is titled by the question it asked
function mkStrippedFork(): { PARENT: string; CHILD: string } {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  const q = (ts: string, m: string): string =>
    JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
  const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
  const PARENT = '019f0000-aaaa-7000-8000-000000000041'
  const CHILD = '019f0000-bbbb-7000-8000-000000000042'
  writeFileSync(
    join(d, `rollout-${PARENT}.jsonl`),
    [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'magicword in the parent session')].join('\n') + '\n'
  )
  writeFileSync(
    join(d, `rollout-${CHILD}.jsonl`),
    [
      meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
      q('2026-07-30T02:00:00Z', 'magicword in the parent session'), // A replay copy
      q('2026-07-30T02:00:05Z', 'child new question')
    ].join('\n') + '\n'
  )
  return { PARENT, CHILD }
}

/** A Codex rollout of real shape (a question event, a prose event, a usage event) and its compressed twin */
function mkCodexTwins(question = 'where is the zebra kept'): { plain: string; cold: string } {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  const at = '2026-07-30T02:00:00Z'
  const lines = [
    JSON.stringify({ timestamp: at, type: 'session_meta', payload: { cwd: proj } }),
    JSON.stringify({ timestamp: at, type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
    JSON.stringify({ timestamp: at, type: 'event_msg', payload: { type: 'user_message', message: question } }),
    JSON.stringify({ timestamp: at, type: 'event_msg', payload: { type: 'agent_message', message: 'In the savannah enclosure, past the giraffes.' } }),
    JSON.stringify({ timestamp: at, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 5, total_tokens: 15 }, total_token_usage: { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 5, total_tokens: 15 } } } })
  ]
  const plain = join(d, 'rollout-2026-07-30T02-00-00-019f0000-cccc-7000-8000-000000000051.jsonl')
  const cold = join(d, 'rollout-2026-07-30T02-00-00-019f0000-cccc-7000-8000-000000000052.jsonl.zst')
  writeFileSync(plain, lines.join('\n') + '\n')
  writeFileSync(cold, zstdCompressSync(readFileSync(plain)))
  return { plain, cold }
}

// An Antigravity conversation: its identity the database, its questions read from its transcript, by default the
// measured fork, rewound once (session-view::REQ-004)
function mkAgyFork(lines: readonly string[] = MEASURED_TRANSCRIPT.forkRewound): string {
  const home = roots().antigravityHome
  mkdirSync(join(home, 'conversations'), { recursive: true })
  writeFileSync(join(home, 'settings.json'), settingsJson([proj]))
  const id = MEASURED_TRANSCRIPT_ID.forkRewound
  const { step, gen } = callRecord({ conversationId: id, stepIdx: 22, genIdx: 0, usage: { messageId: 'm-f', input: 10, output: 1 }, createdAt: Date.parse(TS), completedAt: Date.parse(TS) })
  writeConversation(join(home, 'conversations'), id, encodeTrajectoryMetadata({ folders: [proj], conversationId: id }), { steps: [step], gens: [gen] })
  writeTranscript(home, id, lines)
  return join(home, 'conversations', `${id}.db`)
}

/** A line of an agy transcript, as the measured ones are written */
const agyLine = (step: number, type: string, extra: Record<string, unknown>, at = '2026-10-28T08:06:23Z'): string =>
  JSON.stringify({ step_index: step, source: type === 'USER_INPUT' ? 'USER_EXPLICIT' : 'MODEL', type, status: 'DONE', created_at: at, ...extra })

/** A Grok session directory in the real layout (as question-corpus.test.ts writes one), its question a
 * user_message_chunk; its updates' timestamps are epoch seconds */
function mkGrok(id: string, question: string): string {
  const d = join(dir, '.grok', 'sessions', encodeURIComponent(proj), id)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'summary.json'), JSON.stringify({ info: { id, cwd: proj }, current_model_id: 'grok-4.5' }))
  const f = join(d, 'updates.jsonl')
  const line = (update: Record<string, unknown>): string => JSON.stringify({ timestamp: 1790000000, method: '_x.ai/session/update', params: { sessionId: 's', update } })
  writeFileSync(f, [
    line({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: question }, _meta: { modelId: 'grok-4.5', promptIndex: 0 } }),
    line({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Noted.' } })
  ].join('\n') + '\n')
  return f
}

describe('question mode (the default): searches questions only, with hits grouped by session', () => {
  it('hit groups, indices and text; a session with no hits gets no group; case-insensitive', async () => {
    mkClaude('a.jsonl', [uL('check the Notarize config for me'), aL('sure'), uL('a second, unrelated question')])
    mkClaude('b.jsonl', [uL('another topic')])
    const r = await run('notarize', false)
    expect(r.sessionCount).toBe(1)
    expect(r.totalHits).toBe(1)
    expect(r.folded).toBe(0)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].hits[0]).toMatchObject({ i: 1, inBody: false })
    expect(r.groups[0].hits[0].text).toContain('Notarize config')
  })

  it('a session file that cannot be read is left out and the others\' hits stay, in both modes: a failure on one entry stays there', async () => {
    const asked = (at: string, text: string): string =>
      JSON.stringify({ type: 'user', timestamp: at, message: { role: 'user', content: text } })
    const newest = mkClaude('newest.jsonl', [asked('2026-07-30T03:00:00.000Z', 'needle in the newest session')])
    const locked = mkClaude('locked.jsonl', [asked('2026-07-30T02:00:00.000Z', 'needle in the locked session')])
    const oldest = mkClaude('oldest.jsonl', [asked('2026-07-30T01:00:00.000Z', 'needle in the oldest session')])
    const e = new TokenEngine(join(dir, 'cache'), TEST_ENGINE)
    const sessions = (await e.build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    // Read newest first, so a session comes after the failing one: a failure that ended the search there would lose it
    expect(sessions.map((s) => s.file)).toEqual([newest, locked, oldest])
    // chmod changes neither the mtime nor the size, so the index still answers and the range read is what fails
    chmodSync(locked, 0o000)
    try {
      for (const fullText of [false, true]) {
        const r = await searchProjectSessions(e, roots(), sessions, 'needle', fullText)
        expect(r.sessionCount, `fullText ${fullText}`).toBe(2)
        expect(r.totalHits, `fullText ${fullText}`).toBe(2)
        expect(r.groups.map((g) => g.hits[0].text), `fullText ${fullText}`).toEqual(['needle in the newest session', 'needle in the oldest session'])
      }
    } finally {
      chmodSync(locked, 0o644)
    }
  })

  it('a needle that differs from a question only in a non-ASCII letter\'s case finds it on every side, a cold rollout too, with its text and time (D4)', async () => {
    const claude = mkClaude('a.jsonl', [uL('Über den Plan von Claude'), aL('sure')])
    const { plain, cold } = mkCodexTwins('Über den Plan von Codex')
    const grok = mkGrok('019f-grok-1', 'Über den Plan von Grok')
    const agy = mkAgyFork([
      agyLine(0, 'USER_INPUT', { content: '<USER_REQUEST>\nÜber den Plan von agy\n</USER_REQUEST>' }, '2026-10-28T08:06:23Z'),
      agyLine(1, 'PLANNER_RESPONSE', { tool_calls: [{ name: 'run_command', args: { CommandLine: 'ls' } }] })
    ])
    const r = await run('über den plan', false)
    const rows = r.groups.map((g) => [g.file, g.side, g.hits.map((h) => [h.i, h.text, h.at, h.inBody])])
    const byFile = (x: unknown[], y: unknown[]): number => String(x[0]).localeCompare(String(y[0]))
    expect(rows.sort(byFile)).toEqual([
      [claude, 'claude', [[1, 'Über den Plan von Claude', Date.parse(TS), false]]],
      [plain, 'codex', [[1, 'Über den Plan von Codex', Date.parse('2026-07-30T02:00:00Z'), false]]],
      [cold, 'codex', [[1, 'Über den Plan von Codex', Date.parse('2026-07-30T02:00:00Z'), false]]],
      [grok, 'grok', [[1, 'Über den Plan von Grok', 1790000000 * 1000, false]]],
      [agy, 'antigravity', [[1, 'Über den Plan von agy', Date.parse('2026-10-28T08:06:23Z'), false]]]
    ].sort(byFile))
  })

  it('a word in the body does not hit in question mode (questions only by default)', async () => {
    mkClaude('a.jsonl', [uL('a question'), aL('the answer contains the word notarize')])
    const r = await run('notarize', false)
    expect(r.totalHits).toBe(0)
    expect(r.groups).toHaveLength(0)
  })

  it('an empty needle returns an empty result without erroring', async () => {
    mkClaude('a.jsonl', [uL('question')])
    const r = await run('  ', false)
    expect(r.totalHits).toBe(0)
  })

  it('a stripped Codex fork\'s card carries its own title — the first question left, as the list shows it — not the parent\'s replayed first question (#278)', async () => {
    const { CHILD } = mkStrippedFork()
    const r = await run('child new', false)
    expect(r.groups.map((g) => [g.file.includes(CHILD), g.title])).toEqual([[true, 'child new question']])
  })
})

describe('full-text mode: match the whole stream, map hits to turns, fold anything outside the displayed range', () => {
  it('a body hit maps to its turn: the inBody marker plus a snippet containing the keyword', async () => {
    mkClaude('a.jsonl', [uL('question one'), aL('the answer body hides the word magicword'), uL('question two'), aL('unrelated')])
    const r = await run('magicword', true)
    expect(r.totalHits).toBe(1)
    const hit = r.groups[0].hits[0]
    expect(hit.i).toBe(1)
    expect(hit.inBody).toBe(true)
    expect(hit.text).toContain('question one')
    expect(hit.snippet).toContain('magicword')
  })

  // D4: the question hits are question mode's, and a body hit is a line's bytes holding the needle's, ASCII letters'
  // case folded; a hit before the first question counts as folded
  it.each([
    ['a question hit follows question mode\'s rule', 'über den plan', [[1, false]], 0],
    ['a non-ASCII letter\'s other case, only in a body, is not found', 'ärger', [], 0]
  ])('%s', async (_, needle, hits, folded) => {
    mkClaude('a.jsonl', [aL('noise before the first question: NOTARIZE'), uL('Über den Plan'), aL('ÄRGER only in the body, and NOTARIZE too'), uL('a second question')])
    const r = await run(needle, true)
    expect([r.groups.flatMap((g) => g.hits.map((h) => [h.i, h.inBody])), r.folded]).toEqual([hits, folded])
  })

  it('one question hit and one body hit within a turn; several body hits in one turn are reported once', async () => {
    mkClaude('a.jsonl', [uL('magicword in the question'), aL('the body has magicword too'), aL('magicword once more')])
    const r = await run('magicword', true)
    expect(r.groups[0].hits).toHaveLength(2)
    expect(r.groups[0].hits.map((h) => h.inBody).sort()).toEqual([false, true])
  })

  it('a session whose full-text search fails keeps its question hits and loses its body hits and folded count alone; the other sessions keep theirs', async () => {
    const failing = mkClaude('a.jsonl', [aL('noise magicword before the first question'), uL('magicword in the question'), aL('magicword in the body')])
    const spared = mkClaude('b.jsonl', [uL('another question'), aL('magicword in the body of b')])
    const hitsOf = (r: Awaited<ReturnType<typeof run>>): Array<[string, boolean[]]> =>
      r.groups.map((g) => [g.file, g.hits.map((h) => h.inBody)] as [string, boolean[]]).sort(([x], [y]) => x.localeCompare(y))
    const e = new TokenEngine(join(dir, 'cache'), TEST_ENGINE)
    const sessions = (await e.build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    const search = (): ReturnType<typeof run> => searchProjectSessions(e, roots(), sessions, 'magicword', true)
    // Searched whole, the failing session has a folded hit, a question hit and a body hit
    const whole = await search()
    expect(hitsOf(whole)).toEqual([[failing, [false, true]], [spared, [true]]])
    expect(whole.folded).toBe(1)
    // Every line of the failing session past the line limit: its full-text search, which reads it line by line, fails
    // (token-stats A10), and the question search, which reads each question's range where it lies, does not
    const seam = threadEngineModule() as LineLimitSeam
    seam.seamLimitLinesOf(failing, 10)
    try {
      const r = await search()
      expect(hitsOf(r)).toEqual([[failing, [false]], [spared, [true]]])
      expect(r.folded).toBe(0)
      expect(r.totalHits).toBe(2)
    } finally {
      seam.seamLimitLinesOf(failing, null)
    }
  })

  it('a session file gone once its questions were read loses its full-text part alone, and its question hits stay (D3)', async () => {
    const gone = mkClaude('a.jsonl', [uL('magicword in the question'), aL('magicword in the body')])
    const e = new TokenEngine(join(dir, 'cache'), TEST_ENGINE)
    const sessions = (await e.build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    const seam = threadEngineModule() as HoldSeam
    const AT_THE_GATE = { timeout: 4000 }
    // The search's first read of the file is let through at the hold seam's gate, and the file deleted while its second
    // waits there (engine/src/seams.rs)
    seam.seamHoldReadsOf(gone)
    try {
      const search = searchProjectSessions(e, roots(), sessions, 'magicword', true)
      await expect.poll(() => seam.seamReadsHeld(), AT_THE_GATE).toEqual([gone])
      seam.seamReleaseReadsOf(gone)
      seam.seamHoldReadsOf(gone)
      await expect.poll(() => seam.seamReadsHeld(), AT_THE_GATE).toEqual([gone])
      rmSync(gone)
      seam.seamReleaseReadsOf(gone)
      const r = await search
      expect(r.groups.map((g) => [g.file, g.hits.map((h) => [h.i, h.text, h.inBody])])).toEqual([[gone, [[1, 'magicword in the question', false]]]])
      expect([r.totalHits, r.folded]).toEqual([1, 0])
    } finally {
      seam.seamReleaseReadsOf(null)
    }
  })

  it('hits inside an already-stripped Codex fork prefix count as folded rather than masquerading as reachable hits (D3)', async () => {
    const { PARENT } = mkStrippedFork()
    const r = await run('magicword', true)
    // The parent session hits 1 real question; the child's replay copy is folded — the same sentence is not
    // reported once per generation of the fork chain
    expect(r.totalHits).toBe(1)
    expect(r.folded).toBe(1)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].file).toContain(PARENT)
  })
})

describe('a cold rollout (.jsonl.zst) is searched in question mode and full-text mode alike (spec D3)', () => {
  it('question mode: the cold twin hits exactly like the plain one', async () => {
    const { plain, cold } = mkCodexTwins()
    const r = await run('zebra', false)
    const byFile = new Map(r.groups.map((g) => [g.file, g.hits]))
    expect(byFile.get(cold)).toEqual(byFile.get(plain))
    expect(byFile.get(cold)?.[0]?.text).toBe('where is the zebra kept')
  })

  it('full-text mode: a body word hits in the cold twin with the same snippet as in the plain one', async () => {
    const { plain, cold } = mkCodexTwins()
    const r = await run('giraffes', true)
    const byFile = new Map(r.groups.map((g) => [g.file, g.hits]))
    expect(byFile.get(cold)).toEqual(byFile.get(plain))
    expect(byFile.get(cold)?.[0]?.inBody).toBe(true)
  })
})

// An Antigravity conversation (session-view::REQ-004): its questions are read from its transcript — the measured fork,
// rewound once — while its identity is the database. The question a rewind undid is neither a hit nor reachable.
describe('an Antigravity conversation is searched in its transcript', () => {
  it('question mode hits the kept question; the undone one is not a hit, and in full text it is folded', async () => {
    const file = mkAgyFork()
    const q = await run('simplest', false)
    expect(q.groups.map((g) => [g.file, g.side, g.hits.map((h) => [h.i, h.text])])).toEqual([
      [file, 'antigravity', [[1, 'In one short sentence, which function in calc.py is the simplest?']]]
    ])
    expect((await run('exactly one word', false)).groups).toEqual([])
    const full = await run('exactly one word', true)
    expect([full.groups, full.folded]).toEqual([[], 1])
  })

  it('a hit in lines a rewind undid inside a turn: no question hit, and in full text a hit of that turn (the in-turn rewind failure mode)', async () => {
    // Derived position of the measured mechanism: the redo reuses the index of a call within the first turn
    const file = mkAgyFork([
      agyLine(0, 'USER_INPUT', { content: '<USER_REQUEST>\nfirst question\n</USER_REQUEST>' }),
      agyLine(1, 'PLANNER_RESPONSE', { tool_calls: [{ name: 'read_file', args: { Path: '/x' } }] }),
      agyLine(2, 'GENERIC', { content: 'an undone result naming a zebra' }),
      agyLine(1, 'PLANNER_RESPONSE', { tool_calls: [{ name: 'run_command', args: { CommandLine: 'ls' } }] }),
      agyLine(2, 'GENERIC', { content: 'the redone result' }),
      agyLine(3, 'USER_INPUT', { content: '<USER_REQUEST>\nsecond question\n</USER_REQUEST>' })
    ])
    expect((await run('zebra', false)).groups).toEqual([])
    const full = await run('zebra', true)
    expect([full.groups.map((g) => [g.file, g.hits.map((h) => [h.i, h.inBody])]), full.folded]).toEqual([[[file, [[1, true]]]], 0])
  })
})
