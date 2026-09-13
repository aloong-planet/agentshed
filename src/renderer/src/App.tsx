import { Suspense, useEffect, useRef, useState, useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Snapshot } from '@shared/domain'
import type { Prefs } from '@shared/prefs'
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
import { SettingsPane } from './SettingsPane'
import { Toasts, toast } from './Toast'
import { Folder, MousePointerClick, RobotFace, Settings } from './icons'

type Dim = 'agents' | 'projects' | 'settings'

function applyTheme(theme: AppearanceTheme): void {
  document.documentElement.dataset.theme = theme
}

function applyLang(lang: Language): void {
  document.documentElement.lang = dictOf(lang).htmlLang
}

export function App(): JSX.Element {
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
  const [openSession, setOpenSession] = useState<string | null>(null)
  // Ticket 08: going straight to a search hit — which question to locate when the session page opens
  // (from 1; null = no locating)
  const [openFocusQ, setOpenFocusQ] = useState<number | null>(null)
  // Returning from a session page lands on the "Sessions" section (the pane header's back control, "Back
  // to <project> · Sessions") rather than the overview
  const [backToSessions, setBackToSessions] = useState(false)
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
  const t = dictOf(lang)
  // Preferences the user has already changed by hand: the echo of the getPrefs call made at mount must
  // not overwrite them (#61).
  // Recorded per field rather than as a single flag; the reasoning is in backfillPrefs.
  const touchedPrefs = useRef<Set<PrefKey>>(new Set())
  // A live mirror of the three preference states: the backfill happens inside an effect callback, and
  // that effect has an empty dependency list, so
  // its closure captured the values as of mount. The same use as cursorRef in LanguageSelect.
  const prefsRef = useRef<Prefs>({ theme, language: langPref, mode })
  prefsRef.current = { theme, language: langPref, mode }
  const selectProject = (p: string | null): void => {
    setSelected(p)
    startPaneTransition(() => {
      setShownProject(p)
      setOpenSession(null)
      setOpenFocusQ(null)
      setBackToSessions(false)
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
    })
    void window.agentshed.getSnapshot().then((s) => {
      if (alive) setSnap(s)
    })
    // A new snapshot (an automatic rescan) marks every cached project detail and session page stale
    // (project-detail T3, session-view P5): a page on screen refetches by transfusion, one not on
    // screen refetches on its next visit.
    const off = window.agentshed.onSnapshot((s) => {
      setSnap(s)
      void queryClient.invalidateQueries({ queryKey: ['projectDetail'] })
      void queryClient.invalidateQueries({ queryKey: ['sessionPage'] })
    })
    // The application menu's app entry point (ticket 13): it behaves exactly like the same-named
    // operation on the rail, going through the same state and functions rather than a second set
    const offSettings = window.agentshed.onMenuOpenSettings(() => setDim('settings'))
    return () => {
      alive = false
      off()
      offSettings()
    }
  }, [])

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
    // The notice is written in the language **after** the switch, or switching to French would pop up a
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
    <div className={`app dim-${dim}`}>
      <nav className="rail">
        <button
          className={`ri ${dim === 'agents' ? 'on' : ''}`}
          title={t.rail.agents}
          onClick={() => setDim('agents')}
        >
          <RobotFace size={17} />
        </button>
        <button
          className={`ri ${dim === 'projects' ? 'on' : ''}`}
          title={t.rail.projects}
          onClick={() => setDim('projects')}
        >
          <Folder size={17} />
        </button>
        <button
          className={`ri set ${dim === 'settings' ? 'on' : ''}`}
          title={t.rail.settings}
          onClick={() => setDim('settings')}
        >
          <Settings size={17} />
        </button>
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
            />
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
            detail={
              // The detail slot's one Suspense boundary (ADR-0028): the slot is already revealed when a
              // switch happens, so the Transition around `shownProject` holds this boundary's last
              // committed content instead of ever reaching the fallback (project-detail T1). The
              // fallback draws nothing and is reachable only by a key change made outside a Transition.
              <Suspense fallback={null}>
                {shownProject && openSession ? (
                  <SessionPane
                    file={openSession}
                    focusQ={openFocusQ}
                    projectName={snap.projects.find((p) => p.path === shownProject)?.name ?? shownProject}
                    now={snap.scannedAt}
                    onBack={() => {
                      startPaneTransition(() => {
                        setOpenSession(null)
                        setOpenFocusQ(null)
                        setBackToSessions(true)
                      })
                    }}
                    onOpenSession={(f) => {
                      startPaneTransition(() => {
                        setOpenSession(f)
                        setOpenFocusQ(null)
                      })
                    }}
                  />
                ) : shownProject ? (
                  <DetailPane
                    snap={snap}
                    path={shownProject}
                    initialTab={backToSessions ? 'sessions' : undefined}
                    onOpenSession={(f, q) => {
                      startPaneTransition(() => {
                        setOpenSession(f)
                        setOpenFocusQ(q ?? null)
                        setBackToSessions(false)
                      })
                    }}
                  />
                ) : (
                  <div className="empty">
                    <div className="big">
                      <MousePointerClick size={30} />
                    </div>
                    <div>{t.shell.pickProject}</div>
                  </div>
                )}
              </Suspense>
            }
          />
        )}
      </main>
      <Toasts />
    </div>
    </LanguageProvider>
  )
}
