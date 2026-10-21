// Global search's presentation (global-search US-001/AC-04, AC-07): the payload's sessions grouped by
// project and put in order, and what the results area shows. Pure functions, so the order is tested
// without the page.
import type { GlobalSearchResult, GlobalSearchSession } from '@shared/domain'

export type SearchOrder = 'desc' | 'asc'

export interface ProjectGroup {
  project: GlobalSearchSession['project']
  sessions: GlobalSearchSession[]
  hits: number
}

export interface GroupedResults {
  groups: ProjectGroup[]
  hits: number
  sessions: number
}

/**
 * Newest first: the sessions by their own last activity (a session with none last; equal times keep the
 * payload's order), gathered under their projects in that order — so a project ranks by its most recently
 * active matching session. Oldest first is that whole order reversed, both layers, rather than a second
 * comparator (the same rule as a project's own Sessions tab). Hits keep their question order either way.
 */
export function groupByProject(sessions: readonly GlobalSearchSession[], order: SearchOrder): GroupedResults {
  const rank = (at: number | null): number => at ?? -Infinity
  const byActivity = [...sessions].sort((x, y) => rank(y.at) - rank(x.at))
  const groups = new Map<string, ProjectGroup>()
  for (const s of byActivity) {
    let g = groups.get(s.project.path)
    if (!g) {
      g = { project: s.project, sessions: [], hits: 0 }
      groups.set(s.project.path, g)
    }
    g.sessions.push(s)
    g.hits += s.hits.length
  }
  let list = [...groups.values()]
  if (order === 'asc') list = list.reverse().map((g) => ({ ...g, sessions: [...g.sessions].reverse() }))
  return { groups: list, hits: list.reduce((n, g) => n + g.hits, 0), sessions: sessions.length }
}

/** What the results area shows, in the order the prototype decides it */
export type ResultsArea = 'noSessions' | 'idle' | 'blank' | 'failed' | 'noHits' | 'hits'

export function resultsArea(s: {
  /** At least one session is searched */
  searchable: boolean
  /** The keyword as typed */
  keyword: string
  /** The question texts are still being read */
  reading: boolean
  /** The search for the keyword, once it has answered */
  data: { ok: true; result: GlobalSearchResult } | { ok: false } | undefined
}): ResultsArea {
  if (!s.searchable) return 'noSessions'
  if (s.keyword.trim() === '') return 'idle'
  // While the texts are being read, and until the search answers, the area shows nothing — no "searching" state
  if (s.reading || s.data === undefined) return 'blank'
  if (!s.data.ok) return 'failed'
  return s.data.result.sessions.length === 0 ? 'noHits' : 'hits'
}
