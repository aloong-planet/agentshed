// memory-content-query: the query-layer wrapper around readMemoryFile (ADR-0028). A non-suspense query (see
// skill-files-query.ts's header comment): the memory drawer renders its own loading and error state, and a revisit
// of an already-read file is cached.
import { describe, it, expect } from 'vitest'
import type { CappedText } from '@shared/domain'
import { fetchMemoryContent, memoryContentQueryKey } from './memory-content-query'

const fixture: CappedText = { text: 'body', truncated: false }

describe('fetchMemoryContent (resolves to a result value rather than throwing)', () => {
  it('wraps a successful read as an ok result', async () => {
    const r = await fetchMemoryContent('/a.md', () => Promise.resolve(fixture))
    expect(r).toEqual({ ok: true, text: fixture })
  })

  it('wraps a rejecting read as an error result rather than throwing', async () => {
    const boom = new Error('not on the allow-list')
    const r = await fetchMemoryContent('/a.md', () => Promise.reject(boom))
    expect(r).toEqual({ ok: false, error: boom })
  })
})

describe('memoryContentQueryKey (the file path is the whole identity)', () => {
  it('composes a key from the file path, under the kind its saved read restores to', () => {
    expect(memoryContentQueryKey('/a.md')).toEqual(['memoryContent', '/a.md'])
  })
})
