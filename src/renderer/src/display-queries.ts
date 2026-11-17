// A successful display copy outlives query GC. Query freshness and navigation state remain separate.
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { decodeAppError, ERR } from '@shared/errors'
import type { SavedRead } from '@shared/display-data'
import type { SessionTurn } from '@shared/domain'
import { KEPT_TURNS_UNITS, keptTurnUnits, turnsToRelease } from '@shared/kept-turns'

type Result = { ok: true } | { ok: false; error: unknown }
const copies = new WeakMap<QueryClient, Map<string, Result>>()
function records(client: QueryClient): Map<string, Result> {
  let map = copies.get(client)
  if (!map) { map = new Map(); copies.set(client, map) }
  return map
}
/** The turns kept, each with its measure against the total limit, earliest fetched first (ADR-0053) */
const keptTurns = new WeakMap<QueryClient, { limit: number; turns: Map<string, number> }>()
function turnsKept(client: QueryClient): { limit: number; turns: Map<string, number> } {
  let kept = keptTurns.get(client)
  if (!kept) { kept = { limit: KEPT_TURNS_UNITS, turns: new Map() }; keptTurns.set(client, kept) }
  return kept
}
/** The total limit on this client's kept turns: the one the main process applies, passed at launch */
export function keepTurnsWithin(client: QueryClient, limit: number): void {
  turnsKept(client).limit = limit
}
/**
 * Keeps a fetched or restored turn under its key, or not: a turn over the keep size, marked by the main process, is
 * shown but not kept, and also retires a copy kept earlier under its key, one restored or kept before the turn grew, as
 * does a result with no turn (one grown past the turn limit).
 * One kept makes room under the total limit as the main process does, the earliest fetched leaving the copy first, and
 * the cache too while no row shows it (a row showing it keeps it until it closes, see releaseTurnsNotKept). Returns
 * whether it was kept
 */
function keepTurn(client: QueryClient, id: string, result: Result): boolean {
  const kept = turnsKept(client), map = records(client)
  map.delete(id)
  kept.turns.delete(id)
  const turn = (result as { turn?: SessionTurn }).turn
  if (turn === undefined || turn.unkept === true) return false
  const units = keptTurnUnits(turn)
  const released = turnsToRelease([...kept.turns], units, kept.limit)
  if (released === null) return false
  const cache = client.getQueryCache()
  for (const r of released) {
    map.delete(r)
    kept.turns.delete(r)
    const q = cache.get(r)
    if (q !== undefined && q.getObserversCount() === 0) cache.remove(q)
  }
  kept.turns.set(id, units)
  map.set(id, result)
  return true
}
export function displayQuery<T extends Result>(client: QueryClient, key: QueryKey, fetch: () => Promise<T>): {
  queryKey: QueryKey; initialData: () => T | undefined; queryFn: () => Promise<T>
} {
  const map = records(client), id = hashKey(key)
  return {
    queryKey: key,
    initialData: () => map.get(id) as T | undefined,
    queryFn: async () => {
      const result = await fetch()
      if (result.ok) { if (key[0] === 'turnContent') keepTurn(client, id, result); else map.set(id, result) }
      // A turn grown past the turn limit is shown with its reason, and a copy kept under its key leaves (no turn, not kept)
      else if (key[0] === 'turnContent' && decodeAppError(result.error)?.code === ERR.turnTooLong) keepTurn(client, id, result)
      else if (key[0] === 'sessionPage' && decodeAppError(result.error)?.code === ERR.sessionNotWhitelisted) map.delete(id)
      else return (map.get(id) as T | undefined) ?? result
      return result
    }
  }
}
/** A turn not kept — over the keep size, or released under the total limit — leaves the query cache as soon as no row
 * shows it: when its row closes, and when its fetch returns after its row closed (ADR-0053). Installed once on the
 * renderer's client, so a reopen fetches it again */
export function releaseTurnsNotKept(client: QueryClient): () => void {
  const cache = client.getQueryCache(), kept = turnsKept(client)
  return cache.subscribe((event) => {
    const q = event.query, data = q.state.data as Result | undefined
    if ((q.queryKey as QueryKey)[0] === 'turnContent' && q.getObserversCount() === 0 && data?.ok === true && !kept.turns.has(q.queryHash)) cache.remove(q)
  })
}
export function hydrateDisplayQueries(client: QueryClient, reads: SavedRead[]): void {
  for (const r of reads) {
    let key: QueryKey, result: Result
    switch (r.kind) {
      case 'projectDetail': key = [r.kind, r.path]; result = { ok: true, detail: r.data } as Result; break
      case 'sessionPage': key = [r.kind, r.file]; result = { ok: true, page: r.data } as Result; break
      case 'turnContent': key = [r.kind, r.file, r.i, r.revision]; result = { ok: true, turn: r.data, ms: r.ms } as Result; break
      case 'memoryContent': case 'skillContent': key = [r.kind, r.file]; result = { ok: true, text: r.data } as Result; break
      case 'skillFiles': key = [r.kind, r.args]; result = { ok: true, listing: r.data } as Result; break
    }
    // A live query may have completed while bootstrap was in flight; it owns the newer copy.
    if (client.getQueryData<Result>(key)?.ok !== true) {
      const id = hashKey(key)
      if (r.kind !== 'turnContent') records(client).set(id, result)
      else if (!keepTurn(client, id, result)) continue
      client.setQueryData(key, result, { updatedAt: 1 })
    }
  }
}
