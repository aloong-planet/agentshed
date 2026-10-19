// global-search-query: the query-layer wrapper around the globalSearch channel, and the snapshot's
// invalidation reaching it (global-search REQ-003/AC-02, REQ-004/AC-01) — over a real QueryClient with a
// subscribed observer, which is what a mounted page holds.
import { describe, expect, it } from 'vitest'
import { QueryObserver } from '@tanstack/react-query'
import type { GlobalSearchResult } from '@shared/domain'
import { createQueryClient, invalidateOnSnapshot } from './query-client'
import { fetchGlobalSearch, globalSearchQueryKey } from './global-search-query'

const result = { sessions: [] } as GlobalSearchResult

describe('fetchGlobalSearch (resolves to a result value carrying its keyword, never throws)', () => {
  it('wraps a search that answers, and one that fails', async () => {
    expect(await fetchGlobalSearch('kiwi', () => Promise.resolve(result))).toEqual({ ok: true, result, keyword: 'kiwi' })
    const boom = new Error('refused')
    expect(await fetchGlobalSearch('kiwi', () => Promise.reject(boom))).toEqual({ ok: false, error: boom, keyword: 'kiwi' })
  })

  it('a different keyword is a different query, so changing it searches again', () => {
    expect(globalSearchQueryKey('kiwi')).toEqual(['globalSearch', 'kiwi'])
    expect(globalSearchQueryKey('kiwi')).not.toEqual(globalSearchQueryKey('kiwis'))
  })
})

describe('invalidateOnSnapshot (every automatic rescan)', () => {
  /** A subscribed observer on `key`, counting its fetches; resolves once the first fetch has landed */
  async function watched(client: ReturnType<typeof createQueryClient>, key: readonly unknown[], fn: () => Promise<unknown>): Promise<{ calls: () => number; stop: () => void }> {
    let n = 0
    const observer = new QueryObserver(client, { queryKey: key, queryFn: () => { n++; return fn() } })
    const stop = observer.subscribe(() => {})
    await expect.poll(() => observer.getCurrentResult().status).toBe('success')
    return { calls: () => n, stop }
  }

  it('searches a failed global search again', async () => {
    const client = createQueryClient()
    const w = await watched(client, globalSearchQueryKey('kiwi'), () => fetchGlobalSearch('kiwi', () => Promise.reject(new Error('refused'))))
    expect(w.calls()).toBe(1)
    invalidateOnSnapshot(client)
    await expect.poll(w.calls).toBe(2)
    w.stop()
  })

  it('still refreshes every page payload it refreshed before', async () => {
    const client = createQueryClient()
    const names = ['projectDetail', 'sessionPage', 'turnContent', 'artifactContent', 'skillContent', 'skillFiles']
    const ws = await Promise.all(names.map((n) => watched(client, [n, 'x'], () => Promise.resolve({ ok: true }))))
    invalidateOnSnapshot(client)
    for (const w of ws) await expect.poll(w.calls).toBe(2)
    for (const w of ws) w.stop()
  })
})
