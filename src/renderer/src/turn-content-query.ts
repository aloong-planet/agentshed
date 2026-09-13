// The query-layer wrapper combining sessionFresh + getSessionTurn (ADR-0028, session-view C4). A
// non-suspense query (see skill-files-query.ts's header comment): each expanded question row owns
// its own query, mounted only while that row is open. Collapsing unmounts it; TanStack Query's cache
// (not local component state) is what makes reopening an already-fetched turn instant, replacing the
// old code's manual "already fetched, don't re-send" check — and, since staleTime is the library
// default (0), a reopen still revalidates quietly in the background instead of going stale forever.
import { useQuery } from '@tanstack/react-query'
import type { SessionTurn } from '@shared/domain'

export type TurnContentResult =
  | { ok: true; turn: SessionTurn; ms: number }
  | { ok: false; error: unknown }

export function turnContentQueryKey(file: string, i: number): readonly [string, string, number] {
  return ['turnContent', file, i] as const
}

/**
 * `onRebuilding` fires synchronously, mid-fetch, the moment the freshness check reports stale — the
 * caller uses it to show a "rebuilding the index for this file only" notice instead of a blank wait
 * (unchanged from the pre-migration behaviour). The elapsed-ms measurement is taken here and cached
 * alongside the turn, so a cache hit re-displays the time the *original* fetch actually took rather
 * than a misleading near-zero.
 */
export async function fetchTurnContent(
  file: string,
  i: number,
  onRebuilding: () => void,
  checkFresh: (f: string) => Promise<boolean> = (f) => window.agentshed.sessionFresh(f),
  getTurn: (a: { file: string; i: number }) => Promise<SessionTurn> = (a) =>
    window.agentshed.getSessionTurn(a)
): Promise<TurnContentResult> {
  try {
    const fresh = await checkFresh(file)
    if (!fresh) onRebuilding()
    const t0 = performance.now()
    const turn = await getTurn({ file, i })
    return { ok: true, turn, ms: Math.max(1, Math.round(performance.now() - t0)) }
  } catch (error) {
    return { ok: false, error }
  }
}

export function useTurnContentQuery(
  file: string,
  i: number,
  onRebuilding: () => void
): { data: TurnContentResult | undefined; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: turnContentQueryKey(file, i),
    queryFn: () => fetchTurnContent(file, i, onRebuilding)
  })
  return { data, isLoading }
}
