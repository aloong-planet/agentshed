// The query-layer wrappers around global search's two channels (ADR-0028). Non-suspense queries (see
// skill-files-query.ts's header comment): the page owns its states, and a search never holds the page.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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

/**
 * The search for a keyword (already debounced by the caller); an empty one searches nothing. While the next
 * keyword's search is answering, the previous results stay rather than the area emptying between
 * keystrokes — each result carries its own keyword, so it is highlighted with the keyword it answers.
 * `kept` is the page's last answer, held for the run so a return shows it at once and revalidates it.
 */
export function useGlobalSearchQuery(keyword: string, kept: GlobalSearchQueryResult | null): GlobalSearchQueryResult | undefined {
  const k = keyword.trim()
  const { data } = useQuery({
    queryKey: globalSearchQueryKey(k),
    queryFn: () => fetchGlobalSearch(k),
    enabled: k !== '',
    initialData: kept !== null && kept.keyword === k ? kept : undefined,
    placeholderData: keepPreviousData
  })
  return data
}

type ReadResult = { ok: true } | { ok: false; error: unknown }

/**
 * The reading's query: a finished reading is never asked for again in the run — the main process keeps the
 * texts up to date itself; a failed one is asked for again the next time the page is shown (S15).
 */
export function questionReadingQuery(
  read: () => Promise<void> = () => window.agentshed.readSearchQuestions()
): {
  queryKey: readonly [string]
  queryFn: () => Promise<ReadResult>
  staleTime: (q: { state: { data: ReadResult | undefined } }) => number
  gcTime: number
} {
  return {
    queryKey: ['searchQuestions'] as const,
    queryFn: () =>
      read().then(
        (): ReadResult => ({ ok: true }),
        (error: unknown): ReadResult => ({ ok: false, error })
      ),
    staleTime: (q) => (q.state.data?.ok ? Infinity : 0),
    gcTime: Infinity
  }
}

/**
 * Asks the main process to read the question texts when the page is shown (global-search REQ-002/AC-01), and
 * says whether that reading is still under way. Leaving the page does not stop it, and coming back joins it
 * (S16).
 */
export function useQuestionReading(): boolean {
  const { isFetching } = useQuery(questionReadingQuery())
  return isFetching
}
