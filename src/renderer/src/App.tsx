import type { StartupStatus } from '@shared/display-data'
import { StartupHint, StartupContext } from './StartupHint'
import { useDisplayClock } from './DisplayClock'
import { displayQuery, hydrateDisplayQueries } from './display-queries'
import { Suspense, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateOnSnapshot } from './query-client'
import type { Snapshot } from '@shared/domain'
import type { TrendSpan } from '@shared/trend'
import { TrendSpanContext } from './TrendSpan'
import { DEFAULT_PREFS, type Prefs } from '@shared/prefs'
import { backfillPrefs, type PrefKey } from './prefs-backfill'
import { errorText } from '@shared/error-text'
import { LanguageProvider } from './language'
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  type AppearanceMode,
  type AppearanceTheme
} from '@shared/appearance'
import { dictOf, effectiveLanguage, type Language, type LanguagePreference } from '@shared/i18n'
import { ProjectsPane } from './ProjectsPane'
import { AgentsPane } from './AgentsPane'
import { AgentsSkeleton, ProjectsSkeleton } from './StartupSkeleton'
import { DetailPane } from './DetailPane'
import { SessionPane } from './SessionPane'
import { GlobalSearchPane } from './GlobalSearchPane'
import { fetchSessionPage, sessionPageQueryKey } from './session-page-query'
import { SettingsPane } from './SettingsPane'
import { Toasts, toast } from './Toast'
import { UpdateSlot } from './UpdateSlot'
import { Folder, MousePointerClick, RobotFace, Search, Settings } from './icons'

type Dim = 'agents' | 'projects' | 'search' | 'settings'

/** The session on the project stage, with how it was opened: replacing or leaving it replaces both at once */
type OpenSession = {
  file: string
  /** Ticket 08: going straight to a search hit — which question to locate when the page opens (from 1; null =
   * no locating) */
  focusQ: number | null
  /** Opened directly from a global search hit, so its page offers the way back to the results and on into the
   * project (global-search US-003). A session reached any other way — the fork banner's parent, a session
   * opened inside a project — is a new value without it; the rail leaves the value alone, so leaving for the
   * search page and coming back keeps the session with its exits (J7) */
  fromSearch: boolean
}

function applyTheme(theme: AppearanceTheme): void {
  document.documentElement.dataset.theme = theme
}

function applyLang(lang: Language): void {
  document.documentElement.lang = dictOf(lang).htmlLang
}

export function App(): JSX.Element {
  const now = useDisplayClock()
  const [startup, setStartup] = useState<StartupStatus>('scanning')
  const [dim, setDim] = useState<Dim>('agents')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const queryClient = useQueryClient()
  // `selected` drives the projects list highlight and updates immediately on a click. `shownProject`
  // drives what the detail slot actually renders and is updated inside a Transition (ADR-0028,
  // project-detail T1): while the next project's detail is suspended, React keeps showing the pane
  // built from the last-committed `shownProject`, so the previous project's page stays on screen and
  // only the highlight moves at once. The same Transition wraps opening, jumping and leaving a
  // session (session-view P1, P2, P8) — one function for every update that can change what the
  // detail slot's Suspense boundary renders.
  const [selected, setSelected] = useState<string | null>(null)
  const [shownProject, setShownProject] = useState<string | null>(null)
  const [, startPaneTransition] = useTransition()
  // Session page view state (ticket 04): when non-empty, the project detail area is replaced wholesale
  // by the session page; switching project exits it
  const [openSession, setOpenSession] = useState<OpenSession | null>(null)
  // Returning from a session page lands on the "Sessions" section (the pane header's back control, "Back
  // to <project> · Sessions") rather than the overview
  const [backToSessions, setBackToSessions] = useState(false)
  // A project selected from a global search hit has its row scrolled into view in the project list
  // (projects-list C8); a one-shot request the list clears once it has done it
  const [revealSelected, setRevealSelected] = useState(false)
  // The pending jump from a global search hit: a later click, or leaving the search page, supersedes it
  const jumpSeq = useRef(0)
  // The application menu's "Search Sessions…" asks the search page's box for the focus: a request the page
  // answers whether it mounts now or is already on screen (global-search US-004/AC-01)
  const [searchFocus, setSearchFocus] = useState(0)
  const [theme, setTheme] = useState<AppearanceTheme>(DEFAULT_THEME)
  // The mode is only used to render the segmented control's selected state: the effective light/dark is
  // decided by the main process's themeSource,
  // and the renderer writes no DOM attribute from it (see the implementation decisions in
  // docs/specs/appearance.md)
  const [mode, setMode] = useState<AppearanceMode>(DEFAULT_MODE)
  // The effective language is computed by the main process at window creation and passed in through the
  // launch arguments, so it is **correct on the first frame** —
  // fetching it asynchronously after mount would make the first frame the default language and then jump
  // the whole page once.
  const [lang, setLang] = useState<Language>(window.agentshed.initialLanguage)
  // The language preference (which may be "follow system") is only needed by the selector, so fetching it
  // asynchronously is fine and does not affect the first frame
  const [langPref, setLangPref] = useState<LanguagePreference>('system')
  const [trendSpan, setTrendSpan] = useState<TrendSpan>(window.agentshed.initialTrendSpan)
  // The automatic update checks switch (app-update::US-002); the main process reads the stored value itself
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean>(DEFAULT_PREFS.autoCheckUpdates)
  const t = dictOf(lang)
  // Preferences the user has already changed by hand: the echo of the getPrefs call made at mount must
  // not overwrite them (#61).
  // Recorded per field rather than as a single flag; the reasoning is in backfillPrefs.
  const touchedPrefs = useRef<Set<PrefKey>>(new Set())
  // A live mirror of the preference states: the backfill happens inside an effect callback, and
  // that effect has an empty dependency list, so
  // its closure captured the values as of mount. The same use as cursorRef in LanguageSelect.
  const prefsRef = useRef<Prefs>({ theme, language: langPref, mode, trendSpan, autoCheckUpdates })
  useLayoutEffect(() => {
    prefsRef.current = { theme, language: langPref, mode, trendSpan, autoCheckUpdates }
  })
  /** A rail entry (or the application menu's equivalent): drops a pending jump from a search hit */
  const navigate = (d: Dim): void => {
    jumpSeq.current++
    setDim(d)
  }

  /**
   * Going from a global search hit to its session inside its project (global-search US-002): one
   * transitioned update switches to Projects, selects the project and opens the session at the hit's
   * question. The session page is fetched first, so the search page stays on screen until that page can be
   * drawn whole; a session with a saved or cached page opens at once (US-002/AC-03, session-view P1, P4).
   */
  const openFromSearch = (project: string, file: string, q: number | null): void => {
    const seq = ++jumpSeq.current
    const go = (): void => {
      if (seq !== jumpSeq.current) return // a later click won; its page is kept in the cache (P8)
      startPaneTransition(() => {
        setDim('projects')
        setSelected(project)
        setShownProject(project)
        setOpenSession({ file, focusQ: q, fromSearch: true })
        setBackToSessions(false)
        setRevealSelected(true)
      })
    }
    const page = displayQuery(queryClient, sessionPageQueryKey(file), () => fetchSessionPage(file))
    if (queryClient.getQueryData(page.queryKey) !== undefined || page.initialData() !== undefined) go()
    else void queryClient.fetchQuery(page).then(go, go)
  }

  const selectProject = (p: string | null): void => {
    setSelected(p)
    startPaneTransition(() => {
      setShownProject(p)
      setOpenSession(null)
      setBackToSessions(false)
    })
  }

  /** Leaving the session page for its project's Sessions tab: the back control, and the way on into the
   * project from a session opened from global search (global-search US-003/AC-03) */
  const backToProject = (): void => {
    startPaneTransition(() => {
      setOpenSession(null)
      setBackToSessions(true)
    })
  }

  useEffect(() => {
    applyTheme(DEFAULT_THEME)
    applyLang(window.agentshed.initialLanguage)
    let alive = true
    void window.agentshed.getPrefs().then((p) => {
      if (!alive) return
      // This echo reflects the disk state **at the moment the request was made**; if the user changed a
      // field before it resolved,
      // that field keeps the local value while the rest still take the echo (#61)
      const next = backfillPrefs(prefsRef.current, p, touchedPrefs.current)
      setTheme(next.theme)
      applyTheme(next.theme)
      setLangPref(next.language)
      setMode(next.mode)
      setTrendSpan(next.trendSpan)
      setAutoCheckUpdates(next.autoCheckUpdates)
    })
    let liveSnapshot = 0
    let liveStatus = false
    const offStatus = window.agentshed.onStartupStatus((status) => { liveStatus = true; setStartup(status) })
    const off = window.agentshed.onSnapshot((s) => {
      liveSnapshot++
      setStartup('ready')
      setSnap(s)
      invalidateOnSnapshot(queryClient)
    })
    async function restore(): Promise<void> {
      const generation = liveSnapshot
      try {
        const { display, status } = await window.agentshed.getStartup()
        if (!alive) return
        // A scan can finish between request and response. Request its authoritative bootstrap rather
        // than hydrating obsolete sessions or throwing away all the unrelated saved page contents.
        if (generation !== liveSnapshot) { await restore(); return }
        if (!liveStatus) setStartup(status)
        hydrateDisplayQueries(queryClient, display.reads)
        if (!liveSnapshot && display.snapshot) setSnap(display.snapshot)
        else if (!display.snapshot) {
          const s = await window.agentshed.getSnapshot()
          if (alive && !liveSnapshot) setSnap(s)
        }
      } catch {
        if (!alive) return
        void window.agentshed.getSnapshot().then((s) => {
          if (alive && !liveSnapshot) setSnap(s)
        }).catch(() => {})
      }
    }
    void restore()
    // The application menu's entry points into the app (ticket 13; global-search US-004): each behaves exactly
    // like the same-named operation on the rail, going through the same state and functions rather than a
    // second set; "Search Sessions…" also asks the search page's box for the focus
    const offSettings = window.agentshed.onMenuOpenSettings(() => {
      jumpSeq.current++
      setDim('settings')
    })
    const offSearch = window.agentshed.onMenuOpenSearch(() => {
      jumpSeq.current++
      setDim('search')
      setSearchFocus((n) => n + 1)
    })
    return () => {
      alive = false
      off()
      offStatus()
      offSettings()
      offSearch()
    }
  }, [queryClient])

  // The project on the project stage, for its session page's name and stale flag
  const shown = snap?.projects.find((p) => p.path === shownProject)

  async function onTrendSpan(span: TrendSpan): Promise<void> {
    touchedPrefs.current.add('trendSpan')
    prefsRef.current = { ...prefsRef.current, trendSpan: span }
    setTrendSpan(span)
    try {
      // Main-process writes are synchronous and ordered. Responses are acknowledgements only:
      // an earlier response must never replace a more recent user choice.
      await window.agentshed.setTrendSpan(span)
    } catch (e) {
      toast('err', `${t.toast.saveTrendSpanFailed}:${errorText(lang, e)}`)
    }
  }

  async function onTheme(s: AppearanceTheme): Promise<void> {
    // Apply locally first, then persist: there is no intermediate state where only the settings page is
    // reskinned; on failure, re-read or toast
    touchedPrefs.current.add('theme')
    setTheme(s)
    applyTheme(s)
    try {
      const p = await window.agentshed.setTheme(s)
      setTheme(p.theme)
      applyTheme(p.theme)
    } catch (e) {
      toast('err', `${t.toast.saveThemeFailed}:${errorText(lang, e)}`)
    }
  }

  async function onMode(m: AppearanceMode): Promise<void> {
    // Unlike the theme: light/dark takes effect when the main process sets themeSource, so the
    // renderer has nowhere to "apply locally first".
    // So the selected state is updated optimistically and the persistence result then wins
    touchedPrefs.current.add('mode')
    setMode(m)
    try {
      const p = await window.agentshed.setMode(m)
      setMode(p.mode)
    } catch (e) {
      toast('err', `${t.toast.saveModeFailed}:${errorText(lang, e)}`)
    }
  }

  async function onAutoCheckUpdates(on: boolean): Promise<void> {
    // Takes effect at once, with no save button (app-update::REQ-003/AC-03): the main process reads the
    // stored value at each automatic check. Optimistic, and the stored result then wins, as for the mode
    touchedPrefs.current.add('autoCheckUpdates')
    setAutoCheckUpdates(on)
    try {
      const p = await window.agentshed.setAutoCheckUpdates(on)
      setAutoCheckUpdates(p.autoCheckUpdates)
    } catch (e) {
      toast('err', `${t.toast.saveAutoCheckUpdatesFailed}:${errorText(lang, e)}`)
    }
  }

  async function onLanguage(next: LanguagePreference): Promise<void> {
    // The effective language can be computed locally (the system language list arrives with the window),
    // so it is applied immediately and then persisted,
    // the same rule as the theme: no intermediate state where the settings page changed and
    // nothing else did
    const eff = effectiveLanguage(next, window.agentshed.systemLanguages)
    touchedPrefs.current.add('language')
    setLangPref(next)
    setLang(eff)
    applyLang(eff)
    // The notice is written in the language **after** the switch, or switching to English would pop up a
    // sentence in the previous language
    const nt = dictOf(eff)
    toast(
      'ok',
      next === 'system'
        ? nt.toast.languageFollowSystem(nt.languageName)
        : nt.toast.languageSwitched(nt.languageName)
    )
    try {
      const p = await window.agentshed.setLanguage(next)
      setLangPref(p.language)
    } catch (e) {
      toast('err', `${t.toast.saveLanguageFailed}:${errorText(lang, e)}`)
    }
  }

  return (
    <LanguageProvider lang={lang}>
    <StartupContext.Provider value={startup}>
    <TrendSpanContext.Provider value={{ span: trendSpan, onSpan: (span) => void onTrendSpan(span) }}>
    <div className={`app dim-${dim}`}>
      <nav className="rail">
        <button
          className={`ri ${dim === 'agents' ? 'on' : ''}`}
          title={t.rail.agents}
          onClick={() => navigate('agents')}
        >
          <RobotFace size={17} />
        </button>
        <button
          className={`ri ${dim === 'projects' ? 'on' : ''}`}
          title={t.rail.projects}
          onClick={() => navigate('projects')}
        >
          <Folder size={17} />
        </button>
        <button
          className={`ri ${dim === 'search' ? 'on' : ''}`}
          title={t.rail.search}
          onClick={() => navigate('search')}
        >
          <Search size={17} />
        </button>
        <div className="rail-bottom">
          <UpdateSlot />
          <button
            className={`ri set ${dim === 'settings' ? 'on' : ''}`}
            title={t.rail.settings}
            onClick={() => navigate('settings')}
          >
            <Settings size={17} />
          </button>
        </div>
      </nav>
      <main className="stage">
        {dim === 'settings' ? (
          <SettingsPane
              theme={theme}
              onTheme={(s) => void onTheme(s)}
              mode={mode}
              onMode={(m) => void onMode(m)}
              language={langPref}
              onLanguage={(l) => void onLanguage(l)}
              autoCheckUpdates={autoCheckUpdates}
              onAutoCheckUpdates={(on) => void onAutoCheckUpdates(on)}
            />
        ) : dim === 'search' ? (
          <GlobalSearchPane snap={snap} onOpen={openFromSearch} focusRequest={searchFocus} />
        ) : dim === 'agents' ? (
          snap === null ? (
            <AgentsSkeleton />
          ) : (
            <AgentsPane snap={snap} />
          )
        ) : snap === null ? (
          <ProjectsSkeleton />
        ) : (
          <ProjectsPane
            snap={snap}
            selected={selected}
            onSelect={selectProject}
            revealSelected={revealSelected}
            onRevealed={() => setRevealSelected(false)}
            detail={
              // The detail slot's one Suspense boundary (ADR-0028): the slot is already revealed when a
              // switch happens, so the Transition around `shownProject` holds this boundary's last
              // committed content instead of ever reaching the fallback (project-detail T1). The
              // fallback draws nothing and is reachable only by a key change made outside a Transition.
              <Suspense fallback={null}>
                {shownProject && openSession ? (
                  <SessionPane
                    file={openSession.file}
                    focusQ={openSession.focusQ}
                    projectName={shown?.name ?? shownProject}
                    projectDir={shownProject}
                    stale={shown?.stale ?? false}
                    now={now}
                    onBack={backToProject}
                    onOpenSession={(f) => {
                      startPaneTransition(() => {
                        setOpenSession({ file: f, focusQ: null, fromSearch: false })
                      })
                    }}
                    exits={
                      openSession.fromSearch
                        ? { stale: shown?.stale ?? false, onBackToSearch: () => navigate('search'), onGoToProject: backToProject }
                        : undefined
                    }
                  />
                ) : shownProject ? (
                  <DetailPane
                    snap={snap}
                    path={shownProject}
                    initialTab={backToSessions ? 'sessions' : undefined}
                    onOpenSession={(f, q) => {
                      startPaneTransition(() => {
                        setOpenSession({ file: f, focusQ: q ?? null, fromSearch: false })
                        setBackToSessions(false)
                      })
                    }}
                  />
                ) : (
                  <div className="startup-project-placeholder">
                    <div className="startup-project-heading"><b>Agentshed</b><StartupHint /></div>
                    <div className="empty">
                      <div className="big"><MousePointerClick size={30} /></div>
                      <div>{t.shell.pickProject}</div>
                    </div>
                  </div>
                )}
              </Suspense>
            }
          />
        )}
      </main>
      <Toasts />
    </div>
    </TrendSpanContext.Provider>
    </StartupContext.Provider>
    </LanguageProvider>
  )
}
