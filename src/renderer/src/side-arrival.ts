import type { AgentSide, ProjectEntry } from '@shared/domain'

/** What the list needs to know when it is opened from a side card's project count (projects-list::REQ-002) */
export interface SideArrival {
  /** On when the side has a stale project, so the rows equal the card's count, which includes them (AC-02) */
  showStale: boolean
  /** Whether the selection stays: it does only for a project registered on that side (AC-04, AC-05) */
  keepSelection: boolean
}

export function sideArrival(
  projects: ReadonlyArray<Pick<ProjectEntry, 'path' | 'sides' | 'stale'>>,
  side: AgentSide,
  selected: string | null
): SideArrival {
  const onSide = projects.filter((p) => p.sides.includes(side))
  return {
    showStale: onSide.some((p) => p.stale),
    keepSelection: onSide.some((p) => p.path === selected)
  }
}
