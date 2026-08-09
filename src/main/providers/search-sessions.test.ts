import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionMeta } from '@shared/domain'
import { TokenEngine } from './token-stats'
import { searchProjectSessions } from './search-sessions'
import type { ScanRoots } from './types'

// ─────────────────────────────────────────────────────────────────────────
// Ticket 08: searching this project's sessions (spec D1–D4).
// - Question mode: a coarse pass over raw bytes read range by range from the offsets, decoding and parsing
//   only the matching ranges (D2);
//   the stripped question set contains no fork replay copies by construction (03b), so nothing needs
//   folding.
// - Full-text mode: read whole + byte matching, with hits mapped back to their turn by offset. Hits
//   outside the displayed range
//   (an already-stripped fork prefix / an abandoned branch / the noise before the first question) count as
//   folded rather than masquerading as reachable hits (D3).
// - Case: searchBytes folds at the byte level (never decode + toLowerCase over everything); after a hit,
//   the parsed
//   text re-verifies it, guarding against byte-level false hits from JSON escape sequences.
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
  const e = new TokenEngine(join(dir, 'cache'))
  const t = await e.build(roots(), [proj])
  const sessions: SessionMeta[] = t.perProject.get(proj.toLowerCase())?.sessions ?? []
  return searchProjectSessions(e, roots(), sessions, needle, fullText)
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
})

describe('full-text mode: read whole and match, map hits to turns, fold anything outside the displayed range', () => {
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

  it('one question hit and one body hit within a turn; several body hits in one turn are reported once', async () => {
    mkClaude('a.jsonl', [uL('magicword in the question'), aL('the body has magicword too'), aL('magicword once more')])
    const r = await run('magicword', true)
    expect(r.groups[0].hits).toHaveLength(2)
    expect(r.groups[0].hits.map((h) => h.inBody).sort()).toEqual([false, true])
  })

  it('hits inside an already-stripped Codex fork prefix count as folded rather than masquerading as reachable hits (D3)', async () => {
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
    const r = await run('magicword', true)
    // The parent session hits 1 real question; the child's replay copy is folded — the same sentence is not
    // reported once per generation of the fork chain
    expect(r.totalHits).toBe(1)
    expect(r.folded).toBe(1)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].file).toContain(PARENT)
  })
})
