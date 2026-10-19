// The query-layer wrappers around global search's two channels (ADR-0028).
import type { GlobalSearchResult } from '@shared/domain'

export type GlobalSearchQueryResult =
  | { ok: true; result: GlobalSearchResult; keyword: string }
  | { ok: false; error: unknown; keyword: string }

export function globalSearchQueryKey(keyword: string): readonly [string, string] {
  return ['globalSearch', keyword] as const
}

export async function fetchGlobalSearch(
  keyword: string,
  search: (k: string) => Promise<GlobalSearchResult> = (k) => window.agentshed.globalSearch(k)
): Promise<GlobalSearchQueryResult> {
  try {
    return { ok: true, result: await search(keyword), keyword }
  } catch (error) {
    return { ok: false, error, keyword }
  }
}
