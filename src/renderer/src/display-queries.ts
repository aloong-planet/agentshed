// A successful display copy outlives query GC. Query freshness and navigation state remain separate.
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { decodeAppError, ERR } from '@shared/errors'
import type { SavedRead } from '@shared/display-data'

type Result = { ok: true } | { ok: false; error: unknown }
const copies = new WeakMap<QueryClient, Map<string, Result>>()
function records(client: QueryClient): Map<string, Result> {
  let map = copies.get(client)
  if (!map) { map = new Map(); copies.set(client, map) }
  return map
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
      if (result.ok) map.set(id, result)
      else if (key[0] === 'sessionPage' && decodeAppError(result.error)?.code === ERR.sessionNotWhitelisted) map.delete(id)
      else return (map.get(id) as T | undefined) ?? result
      return result
    }
  }
}
export function hydrateDisplayQueries(client: QueryClient, reads: SavedRead[]): void {
  for (const r of reads) {
    let key: QueryKey, result: Result
    switch (r.kind) {
      case 'projectDetail': key = [r.kind, r.path]; result = { ok: true, detail: r.data } as Result; break
      case 'sessionPage': key = [r.kind, r.file]; result = { ok: true, page: r.data } as Result; break
      case 'turnContent': key = [r.kind, r.file, r.i, r.revision]; result = { ok: true, turn: r.data, ms: r.ms } as Result; break
      case 'artifactContent': case 'skillContent': key = [r.kind, r.file]; result = { ok: true, text: r.data } as Result; break
      case 'skillFiles': key = [r.kind, r.args]; result = { ok: true, listing: r.data } as Result; break
    }
    // A live query may have completed while bootstrap was in flight; it owns the newer copy.
    if (client.getQueryData<Result>(key)?.ok !== true) {
      records(client).set(hashKey(key), result)
      client.setQueryData(key, result, { updatedAt: 1 })
    }
  }
}
