// The query-layer wrapper around listSkillFiles (ADR-0028), shared by SkillExpandBlock and
// PluginSkillList — the same IPC call, two call sites. Unlike project-detail-query and
// session-page-query this is a non-suspense query: both call sites already render their own in-place
// loading/error state (a file table's own spinner), not a page-wide fallback, so useQuery — read on
// demand, gated by `enabled` — is the right tool rather than forcing a Suspense boundary per row.
import { useQuery } from '@tanstack/react-query'
import type { ListSkillFilesArgs, ListSkillFilesResult } from '@shared/ipc'

export type SkillFilesResult =
  | { ok: true; listing: ListSkillFilesResult }
  | { ok: false; error: unknown }

/** The query key: the full args object — side, name, scope and whichever of projectPath/pluginRoot
 * the scope requires — since any one of those fields distinguishes one package from another.
 * `null` (not expanded yet) is a legitimate key of its own, distinct from any real args value. */
export function skillFilesQueryKey(
  args: ListSkillFilesArgs | null
): readonly [string, ListSkillFilesArgs | null] {
  return ['skillFiles', args] as const
}

export async function fetchSkillFiles(
  args: ListSkillFilesArgs,
  list: (a: ListSkillFilesArgs) => Promise<ListSkillFilesResult> = (a) => window.agentshed.listSkillFiles(a)
): Promise<SkillFilesResult> {
  try {
    return { ok: true, listing: await list(args) }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * `args === null` means "not expanded yet" — the query is disabled, matching the existing
 * fetch-on-first-expand behaviour; re-expanding after a collapse hits the cache instead of always
 * refetching (the one behavioural improvement this migration makes across all six read sites).
 */
export function useSkillFilesQuery(args: ListSkillFilesArgs | null): {
  data: SkillFilesResult | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: skillFilesQueryKey(args),
    queryFn: () => fetchSkillFiles(args as ListSkillFilesArgs),
    enabled: args !== null
  })
  return { data, isLoading }
}
