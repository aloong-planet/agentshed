import { displayQuery } from './display-queries'
// The query-layer wrapper around getSessionPage (ADR-0028). Mirrors project-detail-query.ts: a
// suspense query resolves to a result value rather than throwing, so a failed open is a branch of
// the page (spec session-view P6) and no error boundary is needed above it.
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionPage } from '@shared/domain'

export type SessionPageResult =
  | { ok: true; page: SessionPage }
  | { ok: false; error: unknown }

/** The query key: the session file only — a snapshot update invalidates every key sharing the
 * 'sessionPage' prefix (P5). */
export function sessionPageQueryKey(file: string): readonly [string, string] {
  return ['sessionPage', file] as const
}

export async function fetchSessionPage(
  file: string,
  getPage: (f: string) => Promise<SessionPage> = (f) => window.agentshed.getSessionPage(f)
): Promise<SessionPageResult> {
  try {
    return { ok: true, page: await getPage(file) }
  } catch (error) {
    return { ok: false, error }
  }
}

export function useSessionPageQuery(file: string): SessionPageResult {
  const client = useQueryClient()
  const { data } = useSuspenseQuery({
    ...displayQuery(client, sessionPageQueryKey(file), () => fetchSessionPage(file))
  })
  return data
}
