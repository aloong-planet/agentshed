// project-detail-query: the query-layer wrapper around getProjectDetail (ADR-0028, spec project-detail
// T10). Only fetchProjectDetail and the query key are unit-tested here — useProjectDetailQuery itself
// wires useSuspenseQuery to window.agentshed and has no renderer component-test seam (ADR-0002).
import { describe, it, expect } from 'vitest'
import type { ProjectDetail } from '@shared/domain'
import { fetchProjectDetail, projectDetailQueryKey } from './project-detail-query'

const fixture = { path: '/p', name: 'p' } as unknown as ProjectDetail

describe('fetchProjectDetail (T10: a fetch failure resolves in-band rather than throwing)', () => {
  it('wraps a successful fetch as an ok result', async () => {
    const r = await fetchProjectDetail('/p', async () => fixture)
    expect(r).toEqual({ ok: true, detail: fixture })
  })

  it('wraps a rejecting fetch as an error result rather than throwing', async () => {
    const boom = new Error('boom')
    const r = await fetchProjectDetail('/p', async () => {
      throw boom
    })
    expect(r).toEqual({ ok: false, error: boom })
  })
})

describe('projectDetailQueryKey (Implementation Decisions: the query key is the project path only)', () => {
  it('composes a two-element key from the namespace and the path, and nothing else', () => {
    expect(projectDetailQueryKey('/a/b')).toEqual(['projectDetail', '/a/b'])
  })

  it('two different paths produce different keys', () => {
    expect(projectDetailQueryKey('/a')).not.toEqual(projectDetailQueryKey('/b'))
  })
})
