// session-page-query: the query-layer wrapper around getSessionPage (ADR-0028, spec session-view P6).
// Mirrors project-detail-query.test.ts; useSessionPageQuery itself has no renderer component-test
// seam (ADR-0002).
import { describe, it, expect } from 'vitest'
import type { SessionPage } from '@shared/domain'
import { fetchSessionPage, sessionPageQueryKey } from './session-page-query'

const fixture = { file: '/s.jsonl', title: 'hi' } as unknown as SessionPage

describe('fetchSessionPage (P6: a fetch failure resolves in-band rather than throwing)', () => {
  it('wraps a successful fetch as an ok result', async () => {
    const r = await fetchSessionPage('/s.jsonl', async () => fixture)
    expect(r).toEqual({ ok: true, page: fixture })
  })

  it('wraps a rejecting fetch as an error result rather than throwing', async () => {
    const boom = new Error('gone')
    const r = await fetchSessionPage('/s.jsonl', async () => {
      throw boom
    })
    expect(r).toEqual({ ok: false, error: boom })
  })
})

describe('sessionPageQueryKey (the query key is the session file only)', () => {
  it('composes a two-element key from the namespace and the file', () => {
    expect(sessionPageQueryKey('/a.jsonl')).toEqual(['sessionPage', '/a.jsonl'])
  })

  it('two different files produce different keys', () => {
    expect(sessionPageQueryKey('/a.jsonl')).not.toEqual(sessionPageQueryKey('/b.jsonl'))
  })
})
