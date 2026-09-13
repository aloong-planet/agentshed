// The query-layer wrapper around searchSessions (ADR-0028). A non-suspense query (see
// skill-files-query.ts's header comment): the search box renders its own in-place result list, and
// an empty needle disables the query — matching the pre-migration early return. Debouncing stays the
// caller's concern (SessionsTab), the same way it always was; this module only wraps the fetch.
import { useQuery } from '@tanstack/react-query'
import type { SearchResult } from '@shared/domain'
import type { SearchSessionsArgs } from '@shared/ipc'

export type SessionSearchQueryResult =
  | { ok: true; result: SearchResult }
  | { ok: false; error: unknown }

export function sessionSearchQueryKey(
  path: string,
  needle: string,
  fullText: boolean
): readonly [string, string, string, boolean] {
  return ['sessionSearch', path, needle, fullText] as const
}

export async function fetchSessionSearch(
  args: SearchSessionsArgs,
  search: (a: SearchSessionsArgs) => Promise<SearchResult> = (a) => window.agentshed.searchSessions(a)
): Promise<SessionSearchQueryResult> {
  try {
    return { ok: true, result: await search(args) }
  } catch (error) {
    return { ok: false, error }
  }
}

/** `needle` already debounced by the caller; an empty (trimmed) needle disables the query. */
export function useSessionSearchQuery(
  path: string,
  needle: string,
  fullText: boolean
): { data: SessionSearchQueryResult | undefined; isLoading: boolean } {
  const trimmed = needle.trim()
  const { data, isLoading } = useQuery({
    queryKey: sessionSearchQueryKey(path, trimmed, fullText),
    queryFn: () => fetchSessionSearch({ path, needle: trimmed, fullText }),
    enabled: trimmed !== ''
  })
  return { data, isLoading }
}
