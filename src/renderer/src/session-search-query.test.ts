// session-search-query: the query-layer wrapper around searchSessions (ADR-0028). A non-suspense
// query (see skill-files-query.ts's header comment) — the search box has its own in-place result
// list, and an empty needle disables the query entirely, matching the pre-migration early return.
import { describe, it, expect } from 'vitest'
import type { SearchResult } from '@shared/domain'
import { fetchSessionSearch, sessionSearchQueryKey } from './session-search-query'

const fixture = { groups: [], totalHits: 0, sessionCount: 0, folded: 0 } as unknown as SearchResult

describe('fetchSessionSearch (resolves to a result value rather than throwing)', () => {
  it('wraps a successful search as an ok result', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await -- see #196
    const r = await fetchSessionSearch({ path: '/p', needle: 'x', fullText: false }, async () => fixture)
    expect(r).toEqual({ ok: true, result: fixture })
  })

  it('wraps a rejecting search as an error result rather than throwing', async () => {
    const boom = new Error('bad needle')
    // eslint-disable-next-line @typescript-eslint/require-await -- see #196
    const r = await fetchSessionSearch({ path: '/p', needle: 'x', fullText: false }, async () => {
      throw boom
    })
    expect(r).toEqual({ ok: false, error: boom })
  })
})

describe('sessionSearchQueryKey (path, needle and fullText together determine the request)', () => {
  it('composes a key from all three', () => {
    expect(sessionSearchQueryKey('/p', 'x', false)).toEqual(['sessionSearch', '/p', 'x', false])
  })

  it('a different needle produces a different key', () => {
    expect(sessionSearchQueryKey('/p', 'x', false)).not.toEqual(sessionSearchQueryKey('/p', 'y', false))
  })

  it('toggling fullText produces a different key for the same needle', () => {
    expect(sessionSearchQueryKey('/p', 'x', false)).not.toEqual(sessionSearchQueryKey('/p', 'x', true))
  })
})
