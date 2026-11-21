// The renderer's one QueryClient (ADR-0028), created once in main.tsx and never recreated — its cache
// is what makes a revisit instant across a project switch, a session opened and closed, or leaving and
// returning to the Projects dimension (spec project-detail T9, T11).
import { QueryClient } from '@tanstack/react-query'
import { keepTurnsWithin, releaseTurnsNotKept } from './display-queries'
import type { ProjectEntry } from '@shared/domain'
import { KEPT_TURNS_UNITS } from '@shared/kept-turns'
import { isListedProject } from '@shared/listed-project'

/** retry: false — a failed fetch surfaces at once rather than being retried silently (T10). No
 * override of staleTime (library default 0, which is exactly "every mount revalidates", T2) or
 * gcTime (the library default is the cache's collection window, T11).
 * refetchOnWindowFocus: false — the snapshot is the app's one refresh clock (T13). */
export const queryClientOptions = {
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false
    }
  }
} as const

/** `keptTurnsUnits` is the total limit on kept turns the main process applies (ADR-0053), passed at launch */
export function createQueryClient(keptTurnsUnits = KEPT_TURNS_UNITS): QueryClient {
  const client = new QueryClient(queryClientOptions)
  keepTurnsWithin(client, keptTurnsUnits)
  releaseTurnsNotKept(client)
  return client
}

/**
 * Every automatic rescan marks these stale, so a page on screen refreshes by transfusion and one revisited
 * later revalidates (the AGENTS.md invariant on page switches); global search's
 * results among them, which also retries a failed search (global-search REQ-003/AC-02, REQ-004/AC-01).
 * A project's detail is asked for again only while the new snapshot lists the project (project-detail::CON-001/AC-05):
 * the page of one it dropped is still mounted when this runs, so its detail is only marked stale.
 */
export function invalidateOnSnapshot(client: QueryClient, projects: readonly Pick<ProjectEntry, 'path'>[]): void {
  const listed = (key: readonly unknown[]): boolean => isListedProject(projects, key[1] as string)
  void client.invalidateQueries({ queryKey: ['projectDetail'], predicate: (q) => listed(q.queryKey) })
  void client.invalidateQueries({ queryKey: ['projectDetail'], predicate: (q) => !listed(q.queryKey), refetchType: 'none' })
  for (const name of ['sessionPage', 'turnContent', 'memoryContent', 'skillContent', 'skillFiles', 'globalSearch']) {
    void client.invalidateQueries({ queryKey: [name] })
  }
}
