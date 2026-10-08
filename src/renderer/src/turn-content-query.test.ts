// turn-content-query: the query-layer wrapper combining sessionFresh + getSessionTurn (ADR-0028,
// session-view C4). A non-suspense query (see skill-files-query.ts's header comment): each expanded
// question row owns its own query, mounted only while that row is open — collapsing unmounts it, and
// TanStack Query's cache (not local component state) is what makes reopening an already-fetched turn
// instant, replacing the old code's manual "already fetched, don't re-send" check.
import { describe, it, expect, vi } from 'vitest'
import type { SessionTurn } from '@shared/domain'
import { fetchTurnContent, turnContentQueryKey } from './turn-content-query'

const fixture = { blocks: [], bytesRead: 10 } as unknown as SessionTurn

describe('fetchTurnContent (resolves to a result value rather than throwing)', () => {
  it('wraps a successful fetch as an ok result carrying the measured elapsed time', async () => {
    const r = await fetchTurnContent(
      '/s.jsonl',
      0,
      () => {},
      () => Promise.resolve(true),
      () => Promise.resolve(fixture)
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.turn).toBe(fixture)
      expect(r.ms).toBeGreaterThanOrEqual(1)
    }
  })

  it('calls onRebuilding when the freshness check reports stale, before fetching the turn', async () => {
    const order: string[] = []
    const onRebuilding = vi.fn(() => order.push('rebuilding'))
    await fetchTurnContent(
      '/s.jsonl',
      0,
      onRebuilding,
      () => Promise.resolve(false),
      () => {
        order.push('fetched')
        return Promise.resolve(fixture)
      }
    )
    expect(onRebuilding).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['rebuilding', 'fetched'])
  })

  it('does not call onRebuilding when the freshness check reports fresh', async () => {
    const onRebuilding = vi.fn()
    await fetchTurnContent('/s.jsonl', 0, onRebuilding, () => Promise.resolve(true), () => Promise.resolve(fixture))
    expect(onRebuilding).not.toHaveBeenCalled()
  })

  it('wraps a rejecting freshness check as an error result rather than throwing', async () => {
    const boom = new Error('stat failed')
    const r = await fetchTurnContent(
      '/s.jsonl',
      0,
      () => {},
      () => Promise.reject(boom),
      () => Promise.resolve(fixture)
    )
    expect(r).toEqual({ ok: false, error: boom })
  })

  it('wraps a rejecting turn fetch as an error result rather than throwing', async () => {
    const boom = new Error('range read failed')
    const r = await fetchTurnContent(
      '/s.jsonl',
      0,
      () => {},
      () => Promise.resolve(true),
      () => Promise.reject(boom)
    )
    expect(r).toEqual({ ok: false, error: boom })
  })
})

describe('turnContentQueryKey (file + turn index together determine the request)', () => {
  it('composes a key from the file and the index', () => {
    expect(turnContentQueryKey('/s.jsonl', 3)).toEqual(['turnContent', '/s.jsonl', 3])
  })

  it('a different index produces a different key for the same file', () => {
    expect(turnContentQueryKey('/s.jsonl', 3)).not.toEqual(turnContentQueryKey('/s.jsonl', 4))
  })
})
