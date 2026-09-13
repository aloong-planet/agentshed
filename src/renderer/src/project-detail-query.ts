import { displayQuery } from './display-queries'
// The query-layer wrapper around getProjectDetail (ADR-0028). A suspense query resolves to a result
// value rather than throwing, so a fetch failure is a branch of the page (spec project-detail T10)
// and no error boundary is needed above it.
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectDetail } from '@shared/domain'

export type ProjectDetailResult =
  | { ok: true; detail: ProjectDetail }
  | { ok: false; error: unknown }

/** The query key: the project path only (T12) — a snapshot update invalidates every key sharing the
 * 'projectDetail' prefix, and a page-local change (a skill uninstall) invalidates one exact key. */
export function projectDetailQueryKey(path: string): readonly [string, string] {
  return ['projectDetail', path] as const
}

export async function fetchProjectDetail(
  path: string,
  getDetail: (p: string) => Promise<ProjectDetail> = (p) => window.agentshed.getProjectDetail(p)
): Promise<ProjectDetailResult> {
  try {
    return { ok: true, detail: await getDetail(path) }
  } catch (error) {
    return { ok: false, error }
  }
}

export function useProjectDetailQuery(path: string): ProjectDetailResult {
  const client = useQueryClient()
  const { data } = useSuspenseQuery({
    ...displayQuery(client, projectDetailQueryKey(path), () => fetchProjectDetail(path))
  })
  return data
}
