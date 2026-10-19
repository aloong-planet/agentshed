import { describe, expect, it } from 'vitest'
import type { GlobalSearchSession } from '@shared/domain'
import { groupByProject, resultsArea } from './global-search-groups'

const P = {
  a: { path: '/w/a', name: 'a', stale: false },
  b: { path: '/w/b', name: 'b', stale: true },
  c: { path: '/w/c', name: 'c', stale: false }
}
const s = (file: string, project: GlobalSearchSession['project'], at: number | null, hits: number[]): GlobalSearchSession => ({
  project,
  file,
  title: file,
  side: 'claude',
  forkState: 'none',
  at,
  hits: hits.map((i) => ({ i, text: `q${i}`, at: null }))
})

// Shuffled against every expected order: project c holds the newest session (90), b the next (70), a the oldest
// newest session (50); inside each project the payload order is not the activity order
const PAYLOAD = [
  s('a-old', P.a, 10, [2]),
  s('b-mid', P.b, 40, [1, 4]),
  s('c-new', P.c, 90, [3]),
  s('a-new', P.a, 50, [1, 5, 9]),
  s('b-new', P.b, 70, [6]),
  s('c-old', P.c, 20, [1, 2])
]
const shape = (r: ReturnType<typeof groupByProject>): Array<[string, number, number, string[]]> =>
  r.groups.map((g) => [g.project.name, g.sessions.length, g.hits, g.sessions.map((x) => x.file)])

describe('groupByProject (US-001/AC-04, AC-07)', () => {
  it('newest first: projects by their most recently active session, sessions by their own activity, hits in question order', () => {
    const r = groupByProject(PAYLOAD, 'desc')
    expect(shape(r)).toEqual([
      ['c', 2, 3, ['c-new', 'c-old']],
      ['b', 2, 3, ['b-new', 'b-mid']],
      ['a', 2, 4, ['a-new', 'a-old']]
    ])
    expect(r.groups[2].sessions[0].hits.map((h) => h.i)).toEqual([1, 5, 9])
    expect(r.groups[1].project).toEqual({ path: '/w/b', name: 'b', stale: true })
    expect([r.hits, r.sessions]).toEqual([10, 6])
  })

  it('oldest first reverses that whole order, both layers; hits stay in question order', () => {
    const r = groupByProject(PAYLOAD, 'asc')
    expect(shape(r)).toEqual([
      ['a', 2, 4, ['a-old', 'a-new']],
      ['b', 2, 3, ['b-mid', 'b-new']],
      ['c', 2, 3, ['c-old', 'c-new']]
    ])
    expect(r.groups[0].sessions[1].hits.map((h) => h.i)).toEqual([1, 5, 9])
  })

  it('a session with no activity time sorts last when newest first; equal times keep the payload order', () => {
    const r = groupByProject([s('a-none', P.a, null, [1]), s('b-tie1', P.b, 30, [1]), s('a-tie2', P.a, 30, [1]), s('c-x', P.c, 5, [1])], 'desc')
    expect(shape(r)).toEqual([
      ['b', 1, 1, ['b-tie1']],
      ['a', 2, 2, ['a-tie2', 'a-none']],
      ['c', 1, 1, ['c-x']]
    ])
  })
})

describe('resultsArea: what the results area shows (REQ-002/AC-02, REQ-003/AC-01, REQ-006, US-001/AC-02, AC-08)', () => {
  const hit = { ok: true as const, result: { sessions: PAYLOAD } }
  const none = { ok: true as const, result: { sessions: [] } }
  const base = { searchable: true, keyword: 'kiwi', reading: false, data: hit }
  it('takes the prototype order: nothing to search, empty keyword, reading or no answer yet, failure, no hit, hits', () => {
    expect(resultsArea({ ...base, searchable: false })).toBe('noSessions')
    expect(resultsArea({ ...base, searchable: false, keyword: '' })).toBe('noSessions')
    expect(resultsArea({ ...base, keyword: '' })).toBe('idle')
    expect(resultsArea({ ...base, keyword: '   ' })).toBe('idle')
    expect(resultsArea({ ...base, keyword: '', reading: true })).toBe('idle')
    expect(resultsArea({ ...base, reading: true })).toBe('blank')
    expect(resultsArea({ ...base, reading: true, data: { ok: false } })).toBe('blank')
    expect(resultsArea({ ...base, data: undefined })).toBe('blank')
    expect(resultsArea({ ...base, data: { ok: false } })).toBe('failed')
    expect(resultsArea({ ...base, data: none })).toBe('noHits')
    expect(resultsArea(base)).toBe('hits')
  })
})
