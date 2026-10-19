// The global search page (global-search spec): the questions of every listed session in every project,
// searched as the user types, the hits grouped by project and then by session. The frame is the Agents page's
// — a header holding the title, its hint slot and the search box, over a scrolling body.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Snapshot } from '@shared/domain'
import { StartupHint } from './StartupHint'
import { useDisplayClock } from './DisplayClock'
import { useDict, useLanguage } from './language'
import { fmtAgo } from './ProjectsPane'
import { Highlight } from './DetailPane'
import { RichText } from './RichText'
import { SIDE_BADGE } from './side-badge'
import { Folder, GitFork, Inbox, RefreshCw, Search } from './icons'
import { groupByProject, resultsArea, type SearchOrder } from './global-search-groups'
import { useGlobalSearchQuery, useQuestionReading, type GlobalSearchQueryResult } from './global-search-query'

/**
 * The page as the user left it, for the rest of the run (global-search US-003/AC-05): the keyword, the sort,
 * the scroll position and the last answer. A module-level holder for the reason DetailPane's
 * `sessionsRecentFirst` is one: the page unmounts whenever another page is shown, and none of this is
 * persisted — a restart starts the page empty (CON-001).
 */
const page: { keyword: string; order: SearchOrder; scrollTop: number; kept: GlobalSearchQueryResult | null } = {
  keyword: '',
  order: 'desc',
  scrollTop: 0,
  kept: null
}

export function GlobalSearchPane({
  snap,
  onOpen
}: {
  /** null before the first snapshot of a first run: nothing is known to search yet */
  snap: Snapshot | null
  /** Open a hit's session inside its project; `q` locates a question, null opens the session without one */
  onOpen: (project: string, file: string, q: number | null) => void
}): JSX.Element {
  const t = useDict()
  const [keyword, setKeyword] = useState(page.keyword)
  // Searching as the user types, once typing pauses (US-001/AC-02); a return to the page searches at once
  const [debounced, setDebounced] = useState(page.keyword)
  const [order, setOrder] = useState<SearchOrder>(page.order)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = setTimeout(() => setDebounced(keyword), 200)
    return () => clearTimeout(h)
  }, [keyword])
  const reading = useQuestionReading()
  const data = useGlobalSearchQuery(debounced, page.kept)
  useEffect(() => {
    if (data !== undefined && data.keyword === debounced.trim()) page.kept = data
  }, [data, debounced])
  // Back where it was left: the kept answer is drawn on the first frame, so its scroll position applies to it
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = page.scrollTop
  }, [])

  const projects = snap?.projects ?? []
  const sessions = projects.reduce((n, p) => n + p.sessionCount, 0)
  const searched = projects.filter((p) => p.sessionCount > 0).length
  const area = resultsArea({ searchable: sessions > 0, keyword, reading, data })

  return (
    <div className="pane gsearch">
      <header className="pane-head">
        <div className="h1-row">
          <h1>{t.search.title}</h1>
          {/* The hint slot: reading the question texts takes it over the startup scan's hint (REQ-002/AC-02) */}
          {reading ? (
            <span className="scan-hint reading-hint" title={t.search.reading} role="status">
              <RefreshCw size={12} />
              <span>{t.search.reading}</span>
            </span>
          ) : (
            <StartupHint />
          )}
        </div>
        <div className="sbar">
          <input
            autoFocus
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              page.keyword = e.target.value
            }}
            placeholder={sessions > 0 ? t.search.placeholder(searched, sessions) : t.search.placeholderNone}
          />
        </div>
      </header>
      <div
        className="pane-body"
        ref={body}
        onScroll={(e) => {
          page.scrollTop = e.currentTarget.scrollTop
        }}
      >
        {area === 'noSessions' && (
          <div className="gs-note">
            <div className="big">
              <Inbox size={30} />
            </div>
            {t.search.noSessions}
            <br />
            <span className="sub">{t.search.noSessionsSub}</span>
          </div>
        )}
        {area === 'idle' && (
          <div className="gs-note">
            <div className="big">
              <Search size={30} />
            </div>
            {t.search.idle}
            <br />
            <span className="sub">{t.search.idleSub}</span>
          </div>
        )}
        {area === 'failed' && (
          <div className="shead">
            <span>{t.search.failed}</span>
          </div>
        )}
        {area === 'noHits' && (
          <div className="shead">
            <span>{t.search.noHits(t.detail.tabSessions, t.detail.scopeFullText)}</span>
          </div>
        )}
        {area === 'hits' && data?.ok && (
          <Results
            data={data}
            order={order}
            onOrder={(o) => {
              setOrder(o)
              page.order = o
            }}
            onOpen={onOpen}
          />
        )}
      </div>
    </div>
  )
}

/** The header line, then each project's heading over its session cards (US-001/AC-04–AC-07) */
function Results({
  data,
  order,
  onOrder,
  onOpen
}: {
  data: Extract<GlobalSearchQueryResult, { ok: true }>
  order: SearchOrder
  onOrder: (o: SearchOrder) => void
  onOpen: (project: string, file: string, q: number | null) => void
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const now = useDisplayClock()
  const g = groupByProject(data.result.sessions, order)
  return (
    <>
      <div className="shead">
        <span>
          <RichText text={t.search.hitsFound(g.hits, g.sessions, g.groups.length)} />
        </span>
        <span className="seg">
          <button className={order === 'desc' ? 'on' : ''} onClick={() => onOrder('desc')}>
            {t.detail.recentFirst}
          </button>
          <button className={order === 'asc' ? 'on' : ''} onClick={() => onOrder('asc')}>
            {t.detail.oldestFirst}
          </button>
        </span>
      </div>
      {g.groups.map((gr) => (
        <Fragment key={gr.project.path}>
          {/* The path is the tooltip: projects can share a name (S14) */}
          <div className={`ph${gr.project.stale ? ' stale' : ''}`} title={gr.project.path}>
            <Folder size={13} />
            <span className="pn">{gr.project.name}</span>
            {gr.project.stale && <span className="stale-tag">{t.detail.staleTag}</span>}
            <span className="pc">{t.search.projectCounts(gr.sessions.length, gr.hits)}</span>
          </div>
          {gr.sessions.map((s) => (
            <div className="grp" key={s.file}>
              <button className="gh row-btn" onClick={() => onOpen(gr.project.path, s.file, null)}>
                <span className={`badge ${SIDE_BADGE[s.side].cls}`}>{SIDE_BADGE[s.side].label}</span>
                <span className="t">{s.title ?? t.placeholder.untitledSession}</span>
                {s.forkState === 'stripped' && (
                  <span className="pill fork">
                    <GitFork size={10} /> fork
                  </span>
                )}
                {s.forkState === 'uncertain' && (
                  <span className="pill forkq">
                    <GitFork size={10} /> {t.detail.forkUncertain}
                  </span>
                )}
                <span className="d">{t.detail.hitCount(s.hits.length)}</span>
              </button>
              {s.hits.map((h) => (
                <button className="hit row-btn" key={h.i} onClick={() => onOpen(gr.project.path, s.file, h.i)}>
                  <span className="idx">{String(h.i).padStart(2, '0')}</span>
                  <span className="t">
                    <Highlight text={h.text} needle={data.keyword} />
                  </span>
                  <span className="d">{fmtAgo(lang, h.at, now)}</span>
                </button>
              ))}
            </div>
          ))}
        </Fragment>
      ))}
    </>
  )
}
