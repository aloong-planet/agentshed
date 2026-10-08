// artifact-content-query: the query-layer wrapper around readArtifact (ADR-0028). A non-suspense
// query gated by `enabled` (see skill-files-query.ts's header comment): the reader overlay renders
// nothing until content arrives, matching the pre-migration behaviour, and a revisit of an
// already-read file is now cached.
import { describe, it, expect } from 'vitest'
import type { CappedText } from '@shared/domain'
import { fetchArtifactContent, artifactContentQueryKey } from './artifact-content-query'

const fixture: CappedText = { text: 'body', truncated: false }

describe('fetchArtifactContent (resolves to a result value rather than throwing)', () => {
  it('wraps a successful read as an ok result', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await -- see #196
    const r = await fetchArtifactContent('/a.md', async () => fixture)
    expect(r).toEqual({ ok: true, text: fixture })
  })

  it('wraps a rejecting read as an error result rather than throwing', async () => {
    const boom = new Error('not on the allow-list')
    // eslint-disable-next-line @typescript-eslint/require-await -- see #196
    const r = await fetchArtifactContent('/a.md', async () => {
      throw boom
    })
    expect(r).toEqual({ ok: false, error: boom })
  })
})

describe('artifactContentQueryKey (the file path is the whole identity)', () => {
  it('composes a key from the file path', () => {
    expect(artifactContentQueryKey('/a.md')).toEqual(['artifactContent', '/a.md'])
  })

  it('null (no reader open) is a key of its own', () => {
    expect(artifactContentQueryKey(null)).toEqual(['artifactContent', null])
    expect(artifactContentQueryKey(null)).not.toEqual(artifactContentQueryKey('/a.md'))
  })
})
