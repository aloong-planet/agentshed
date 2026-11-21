// Whether the snapshot lists a directory as a project: the decision of project-detail::CON-001/AC-01. The main process
// admits a project's detail by it, and the window refetches one on a new snapshot by it (project-detail::CON-001/AC-05).
import type { ProjectEntry } from './domain'

/** Whether the snapshot lists a directory as a project (project-detail::CON-001/AC-01) */
export function isListedProject(projects: readonly Pick<ProjectEntry, 'path'>[], dir: string): boolean {
  return projects.some((p) => p.path === dir)
}
