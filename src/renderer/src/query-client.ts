// The renderer's one QueryClient (ADR-0028), created once in main.tsx and never recreated — its cache
// is what makes a revisit instant across a project switch, a session opened and closed, or leaving and
// returning to the Projects dimension (spec project-detail T9, T11).
import { QueryClient } from '@tanstack/react-query'

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

export function createQueryClient(): QueryClient {
  return new QueryClient(queryClientOptions)
}

/**
 * Every automatic rescan marks these stale, so a page on screen refreshes by transfusion and one revisited
 * later revalidates (the CONTEXT invariant "a page switch is atomic and a revisit is instant"); global search's
 * results among them, which also retries a failed search (global-search REQ-003/AC-02, REQ-004/AC-01).
 */
export function invalidateOnSnapshot(client: QueryClient): void {
  for (const name of ['projectDetail', 'sessionPage', 'turnContent', 'artifactContent', 'skillContent', 'skillFiles', 'globalSearch']) {
    void client.invalidateQueries({ queryKey: [name] })
  }
}
