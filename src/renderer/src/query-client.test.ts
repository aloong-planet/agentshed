// query-client: the renderer's one QueryClient (ADR-0028). Pinning the options as data, not behaviour,
// since there is no renderer component-test seam to observe refetch timing directly (ADR-0002).
import { describe, it, expect } from 'vitest'
import { queryClientOptions } from './query-client'

describe('queryClientOptions (T11-T13)', () => {
  const q = queryClientOptions.defaultOptions.queries

  it('never retries a failed fetch (Implementation Decisions: a failure surfaces at once rather than being retried, T10)', () => {
    expect(q.retry).toBe(false)
  })

  it('never refetches on window focus (T13: the snapshot is the one refresh clock)', () => {
    expect(q.refetchOnWindowFocus).toBe(false)
  })

  it('leaves staleTime and gcTime at the library default (T2 revalidate-on-mount, T11 default collection window)', () => {
    expect(q).not.toHaveProperty('staleTime')
    expect(q).not.toHaveProperty('gcTime')
  })
})
