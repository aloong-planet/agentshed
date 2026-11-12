// The projects' statistics the window holds beside its snapshot, and which of them a project's page shows
// (project-detail::REQ-005). A page drawn from its copy would otherwise show figures as old as its last visit.
import type { ProjectFigures, ProjectStats } from '@shared/domain'
import { mergeKey } from '@shared/path-key'

export interface WindowFigures {
  /** By merge key, as the main process keys them */
  byProject: ReadonlyMap<string, ProjectStats>
  /** These are a scan's of this run. Otherwise they are the ones saved with the restored snapshot, or none */
  scanned: boolean
}

/** Nothing saved, and no scan completed yet */
export const NO_FIGURES: WindowFigures = { byProject: new Map(), scanned: false }

export function windowFigures(figures: ProjectFigures, scanned: boolean): WindowFigures {
  return { byProject: new Map(figures), scanned }
}

/**
 * The statistics a project's page shows: the window's for that project; without them, none once a scan of this run
 * has completed, since that scan found nothing for it, as its own refetch would answer (token-stats G17); and
 * before that the page copy's, because saved figures can lack a project whose page was saved.
 */
export function figuresFor(held: WindowFigures, path: string, copy: ProjectStats | null): ProjectStats | null {
  const own = held.byProject.get(mergeKey(path))
  if (own) return own
  return held.scanned ? null : copy
}
