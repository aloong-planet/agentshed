// global-search-query: the query-layer wrapper around the globalSearch channel, and the snapshot's
// invalidation reaching it (global-search REQ-003/AC-02, REQ-004/AC-01) and every other page payload, a project's detail
// only for a project the new snapshot lists (project-detail::CON-001/AC-05) — over a real QueryClient with a
// subscribed observer, which is what a mounted page holds.
import { describe, expect, it } from 'vitest'
import { QueryObserver } from '@tanstack/react-query'
import type { GlobalSearchResult } from '@shared/domain'
import { createQueryClient, invalidateOnSnapshot } from './query-client'
import { fetchGlobalSearch, globalSearchQueryKey, questionReadingQuery } from './global-search-query'
import { projectDetailQueryKey } from './project-detail-query'

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
    invalidateOnSnapshot(client, [])
    await expect.poll(w.calls).toBe(2)
    w.stop()
  })

  it('still refreshes every page payload it refreshed before', async () => {
    const client = createQueryClient()
    const names = ['projectDetail', 'sessionPage', 'turnContent', 'memoryContent', 'skillContent', 'skillFiles']
    const ws = await Promise.all(names.map((n) => watched(client, [n, 'x'], () => Promise.resolve({ ok: true }))))
    invalidateOnSnapshot(client, [{ path: 'x' }])
    for (const w of ws) await expect.poll(w.calls).toBe(2)
    for (const w of ws) w.stop()
  })

  const detail = (): Promise<{ ok: true }> => Promise.resolve({ ok: true })

  it('refetches the detail of a project the new snapshot lists, a stale one included', async () => {
    const client = createQueryClient()
    const w = await watched(client, projectDetailQueryKey('/p'), detail)
    const stale = { path: '/p', stale: true }
    invalidateOnSnapshot(client, [stale])
    await expect.poll(w.calls).toBe(2)
    w.stop()
  })

  it('marks the detail of a project the new snapshot no longer lists stale, and does not ask for it', async () => {
    const client = createQueryClient()
    const listed = await watched(client, projectDetailQueryKey('/p'), detail)
    const dropped = await watched(client, projectDetailQueryKey('/gone'), detail)
    invalidateOnSnapshot(client, [{ path: '/p' }])
    // By the time the listed project's refetch has run, the dropped one's would have too
    await expect.poll(listed.calls).toBe(2)
    expect(dropped.calls()).toBe(1)
    expect(client.getQueryState(projectDetailQueryKey('/gone'))?.isInvalidated).toBe(true)
    listed.stop()
    dropped.stop()
  })

  it('revalidates the detail of a project the snapshot dropped once its page is shown again', async () => {
    const client = createQueryClient()
    let asked = 0
    const counted = (): Promise<{ ok: true }> => { asked++; return detail() }
    const first = await watched(client, projectDetailQueryKey('/gone'), counted)
    invalidateOnSnapshot(client, [])
    first.stop()
    const again = await watched(client, projectDetailQueryKey('/gone'), counted)
    await expect.poll(() => asked).toBeGreaterThanOrEqual(2)
    await expect.poll(() => client.getQueryState(projectDetailQueryKey('/gone'))?.fetchStatus).toBe('idle')
    expect(asked, 'the drop asked for nothing, the page shown again asked once').toBe(2)
    again.stop()
  })
})

describe('questionReadingQuery: asking for the reading when the page is shown (REQ-002/AC-01, S15)', () => {
  /** A page shown: an observer mounted on the reading's query, until its fetch has settled */
  async function show(client: ReturnType<typeof createQueryClient>, read: () => Promise<void>): Promise<() => void> {
    const observer = new QueryObserver(client, questionReadingQuery(read))
    const stop = observer.subscribe(() => {})
    await expect.poll(() => observer.getCurrentResult().fetchStatus).toBe('idle')
    return stop
  }

  it('a finished reading is not asked for again when the page is shown again', async () => {
    const client = createQueryClient()
    let asked = 0
    const read = (): Promise<void> => { asked++; return Promise.resolve() }
    ;(await show(client, read))()
    ;(await show(client, read))()
    expect(asked).toBe(1)
  })

  it('a failed reading is asked for again the next time the page is shown', async () => {
    const client = createQueryClient()
    let asked = 0
    const read = (): Promise<void> => { asked++; return asked === 1 ? Promise.reject(new Error('failed')) : Promise.resolve() }
    ;(await show(client, read))()
    ;(await show(client, read))()
    ;(await show(client, read))()
    expect(asked).toBe(2)
  })
})
