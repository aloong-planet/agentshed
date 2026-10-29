import { parseDisplayData, type StartupData, type StartupStatus } from '@shared/display-data'
import { contextBridge, ipcRenderer } from 'electron'
import {
  CMD,
  EVT,
  type SearchSessionsArgs,
  type SessionTurnArgs,
  type SkillOpArgs,
  type SkillOpResult,
  type SkillInstallArgs,
  type SkillLandingResult,
  type SkillHoldings,
  type Prefs,
  type AppearanceMode,
  type AppearanceTheme,
  type LanguagePreference,
  type ListSkillFilesArgs,
  type ListSkillFilesResult,
  type ReadSkillFileArgs
} from '@shared/ipc'
import type { CappedText, GlobalSearchResult, ProjectDetail, SearchResult, SessionPage, SessionTurn, Snapshot } from '@shared/domain'
import {
  contractError,
  validateSnapshot,
  validateProjectDetail,
  validateSessionPage,
  validateSessionTurn,
  validateSearchResult,
  validateGlobalSearchResult
} from '@shared/validate'
import { parsePrefs } from '@shared/prefs'
import {
  isReleaseVersion,
  parseCheckOutcome,
  parseSettingsCheck,
  parseUpdateNotice,
  parseUpdateState,
  type CheckOutcome,
  type SettingsCheck,
  type UpdateNotice,
  type UpdateState
} from '@shared/update'
import { ERR, appError } from '@shared/errors'
import { FALLBACK_LANGUAGE, isLanguage, type Language } from '@shared/i18n'
import { isTrendSpan, TREND_WINDOW_DAYS, type TrendSpan } from '@shared/trend'
import { APP_VERSION_ARG, LANG_ARG, SYS_LANGS_ARG, TREND_SPAN_ARG, UPDATES_ARG } from '@shared/ipc'

// Contract validation at the renderer's entry: a snapshot from the main process that does not meet the
// contract throws rather than silently rendering undefined
function checked(snap: unknown): Snapshot {
  const r = validateSnapshot(snap)
  if (!r.ok) throw contractError('snapshot', r.failure)
  return snap as Snapshot
}

/** The picker's holdings: project path → directory names. Anything else is a broken contract, not "nothing held" */
function checkedHoldings(raw: unknown): SkillHoldings {
  const ok =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) &&
    Object.values(raw).every((dirs) => Array.isArray(dirs) && dirs.every((d) => typeof d === 'string'))
  if (!ok) throw appError(ERR.contractType, { path: 'skillHoldings', expect: 'Record<string,string[]>' })
  return raw as SkillHoldings
}

function checkedPrefs(raw: unknown): Prefs {
  const p = parsePrefs(raw)
  if (!p) throw appError(ERR.contractType, { path: 'prefs', expect: 'Prefs' })
  return p
}

function checkedUpdate(raw: unknown): UpdateState {
  const s = parseUpdateState(raw)
  if (!s) throw appError(ERR.contractType, { path: 'updateState', expect: 'UpdateState' })
  return s
}

function checkedSettingsCheck(raw: unknown): SettingsCheck {
  const c = parseSettingsCheck(raw)
  if (!c) throw appError(ERR.contractType, { path: 'settingsCheck', expect: 'SettingsCheck' })
  return c
}

function checkedOutcome(raw: unknown): CheckOutcome {
  const o = parseCheckOutcome(raw)
  if (!o) throw appError(ERR.contractType, { path: 'checkOutcome', expect: 'CheckOutcome' })
  return o
}


/**
 * The effective language: the main process passes it in through the launch arguments at window creation,
 * so it is **available synchronously**.
 * This path rather than IPC is what gives the renderer the correct language on its first frame —
 * fetching it asynchronously would make the first frame the default
 * language and then jump the whole page once. A missing or invalid argument falls back to English, the
 * same rule as the resolution layer.
 */
function initialLanguage(): Language {
  const arg = process.argv.find((a) => a.startsWith(LANG_ARG))
  const v = arg?.slice(LANG_ARG.length)
  return isLanguage(v) ? v : FALLBACK_LANGUAGE
}

function systemLanguages(): string[] {
  const arg = process.argv.find((a) => a.startsWith(SYS_LANGS_ARG))
  return (arg?.slice(SYS_LANGS_ARG.length) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** The running version for settings' "Current version"; empty if the argument is missing or malformed */
function appVersion(): string {
  const v = process.argv.find((a) => a.startsWith(APP_VERSION_ARG))?.slice(APP_VERSION_ARG.length)
  return isReleaseVersion(v) ? v : ''
}

function initialTrendSpan(): TrendSpan {
  const value = Number(process.argv.find((a) => a.startsWith(TREND_SPAN_ARG))?.slice(TREND_SPAN_ARG.length))
  return isTrendSpan(value) ? value : TREND_WINDOW_DAYS
}

const api = {
  initialTrendSpan: initialTrendSpan(),
  /** The effective language, available on the first frame (not the preference — that goes through getPrefs) */
  initialLanguage: initialLanguage(),
  /** The system's preferred language list at startup: the renderer computes the effective language
   * locally from it when "follow system" is selected */
  systemLanguages: systemLanguages(),
  /** The running version (app-update::REQ-003/AC-01) */
  appVersion: appVersion(),
  /** This run checks for app updates; false in a development run, where settings' controls are unavailable */
  updatesAvailable: process.argv.includes(`${UPDATES_ARG}1`),
  getSnapshot: async (): Promise<Snapshot> => checked(await ipcRenderer.invoke(CMD.getSnapshot)),
  getStartup: async (): Promise<StartupData> => {
    const raw: unknown = await ipcRenderer.invoke(CMD.getStartup)
    if (typeof raw !== 'object' || raw === null || !('display' in raw) || !('status' in raw) ||
      !['scanning', 'waiting', 'ready'].includes(String(raw.status))) throw appError(ERR.contractType, { path: 'startup', expect: 'StartupData' })
    return { display: parseDisplayData(raw.display), status: raw.status as StartupStatus }
  },
  onStartupStatus: (cb: (status: StartupStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: unknown): void => {
      if (status === 'scanning' || status === 'waiting' || status === 'ready') cb(status)
    }
    ipcRenderer.on(EVT.startupStatus, listener)
    return () => ipcRenderer.removeListener(EVT.startupStatus, listener)
  },
  // The same rule as the snapshot: validated once at each end. The main process's pass catches "we
  // generated it wrong", this one catches the losses of
  // IPC transport itself — structured clone drops undefined properties, so the main process sees it as
  // correct while the renderer receives
  // a missing field, which only this entry side can see.
  getProjectDetail: async (path: string): Promise<ProjectDetail> => {
    const d: unknown = await ipcRenderer.invoke(CMD.getProjectDetail, path)
    const r = validateProjectDetail(d)
    if (!r.ok) throw contractError('projectDetail', r.failure)
    return d as ProjectDetail
  },
  // The session page: the same rule as the snapshot and detail, validated at each end (this side catches
  // structured clone's losses)
  getSessionPage: async (file: string): Promise<SessionPage> => {
    const p: unknown = await ipcRenderer.invoke(CMD.getSessionPage, file)
    const r = validateSessionPage(p)
    if (!r.ok) throw contractError('sessionPage', r.failure)
    return p as SessionPage
  },
  // Ticket 05: fetching a turn on demand. `fresh` is a read-only predicate (whether to show "rebuilding"
  // first), while the fetch itself does
  // the signature check and any single-file rebuild on the main process side
  sessionFresh: (file: string): Promise<boolean> =>
    ipcRenderer.invoke(CMD.sessionFresh, file) as Promise<boolean>,
  getSessionTurn: async (args: SessionTurnArgs): Promise<SessionTurn> => {
    const t: unknown = await ipcRenderer.invoke(CMD.getSessionTurn, args)
    const r = validateSessionTurn(t)
    if (!r.ok) throw contractError('sessionTurn', r.failure)
    return t as SessionTurn
  },
  // Ticket 08: project session search (validated at each end, the same rule as the snapshot)
  searchSessions: async (args: SearchSessionsArgs): Promise<SearchResult> => {
    const r: unknown = await ipcRenderer.invoke(CMD.searchSessions, args)
    const v = validateSearchResult(r)
    if (!v.ok) throw contractError('searchResult', v.failure)
    return r as SearchResult
  },
  // Global search (the same rule: validated at each end)
  readSearchQuestions: async (): Promise<void> => {
    await ipcRenderer.invoke(CMD.readSearchQuestions)
  },
  globalSearch: async (needle: string): Promise<GlobalSearchResult> => {
    const r: unknown = await ipcRenderer.invoke(CMD.globalSearch, needle)
    const v = validateGlobalSearchResult(r)
    if (!v.ok) throw contractError('globalSearchResult', v.failure)
    return r as GlobalSearchResult
  },
  readArtifact: (file: string): Promise<CappedText> =>
    ipcRenderer.invoke(CMD.readArtifact, file) as Promise<CappedText>,
  openArtifact: (file: string): Promise<void> => ipcRenderer.invoke(CMD.openArtifact, file),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke(CMD.copyText, text),
  revealSessionFile: (file: string): Promise<void> => ipcRenderer.invoke(CMD.revealSessionFile, file),
  installSkill: (args: SkillInstallArgs): Promise<SkillLandingResult[]> =>
    ipcRenderer.invoke(CMD.installSkill, args) as Promise<SkillLandingResult[]>,
  skillHoldings: async (skillName: string): Promise<SkillHoldings> =>
    checkedHoldings(await ipcRenderer.invoke(CMD.skillHoldings, skillName)),
  uninstallSkill: (args: SkillOpArgs): Promise<SkillOpResult> =>
    ipcRenderer.invoke(CMD.uninstallSkill, args) as Promise<SkillOpResult>,
  listSkillFiles: (args: ListSkillFilesArgs): Promise<ListSkillFilesResult> =>
    ipcRenderer.invoke(CMD.listSkillFiles, args) as Promise<ListSkillFilesResult>,
  readSkillFile: (args: ReadSkillFileArgs): Promise<CappedText> =>
    ipcRenderer.invoke(CMD.readSkillFile, args) as Promise<CappedText>,
  // The same rule as the heavy payloads: the preload validates again, catching structured clone losses
  // and shape drift
  getPrefs: async (): Promise<Prefs> => checkedPrefs(await ipcRenderer.invoke(CMD.getPrefs)),
  setTheme: async (theme: AppearanceTheme): Promise<Prefs> =>
    checkedPrefs(await ipcRenderer.invoke(CMD.setTheme, theme)),
  setLanguage: async (language: LanguagePreference): Promise<Prefs> =>
    checkedPrefs(await ipcRenderer.invoke(CMD.setLanguage, language)),
  setTrendSpan: async (span: TrendSpan): Promise<Prefs> =>
    checkedPrefs(await ipcRenderer.invoke(CMD.setTrendSpan, span)),
  setMode: async (mode: AppearanceMode): Promise<Prefs> =>
    checkedPrefs(await ipcRenderer.invoke(CMD.setMode, mode)),
  setAutoCheckUpdates: async (on: boolean): Promise<Prefs> =>
    checkedPrefs(await ipcRenderer.invoke(CMD.setAutoCheckUpdates, on)),
  /** The application menu's entry points into the app (ticket 13; global-search US-004): they behave
   * identically to the same-named operations in the UI */
  onMenuOpenSettings: (cb: () => void): (() => void) => {
    const l = (): void => cb()
    ipcRenderer.on(EVT.menuOpenSettings, l)
    return () => ipcRenderer.removeListener(EVT.menuOpenSettings, l)
  },
  onMenuOpenSearch: (cb: () => void): (() => void) => {
    const l = (): void => cb()
    ipcRenderer.on(EVT.menuOpenSearch, l)
    return () => ipcRenderer.removeListener(EVT.menuOpenSearch, l)
  },
  /** The app update lifecycle (app-update): validated here as the other payloads are */
  getUpdateState: async (): Promise<UpdateState> => checkedUpdate(await ipcRenderer.invoke(CMD.getUpdateState)),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(CMD.installUpdate),
  /** "Check now" in settings: answers the check's outcome */
  checkForUpdates: async (): Promise<CheckOutcome> => checkedOutcome(await ipcRenderer.invoke(CMD.checkForUpdates)),
  getSettingsCheck: async (): Promise<SettingsCheck> => checkedSettingsCheck(await ipcRenderer.invoke(CMD.getSettingsCheck)),
  onSettingsCheck: (cb: (check: SettingsCheck) => void): (() => void) => {
    const listener = (_e: unknown, check: unknown): void => cb(checkedSettingsCheck(check))
    ipcRenderer.on(EVT.settingsCheck, listener)
    return () => ipcRenderer.removeListener(EVT.settingsCheck, listener)
  },
  onUpdateState: (cb: (state: UpdateState) => void): (() => void) => {
    const listener = (_e: unknown, state: unknown): void => cb(checkedUpdate(state))
    ipcRenderer.on(EVT.updateState, listener)
    return () => ipcRenderer.removeListener(EVT.updateState, listener)
  },
  onUpdateNotice: (cb: (notice: UpdateNotice) => void): (() => void) => {
    const listener = (_e: unknown, notice: unknown): void => {
      const n = parseUpdateNotice(notice)
      if (n) cb(n)
    }
    ipcRenderer.on(EVT.updateNotice, listener)
    return () => ipcRenderer.removeListener(EVT.updateNotice, listener)
  },
  onSnapshot: (cb: (snap: Snapshot) => void): (() => void) => {
    const listener = (_e: unknown, snap: unknown): void => cb(checked(snap))
    ipcRenderer.on(EVT.snapshot, listener)
    return () => ipcRenderer.removeListener(EVT.snapshot, listener)
  }
}

export type AgentshedApi = typeof api
contextBridge.exposeInMainWorld('agentshed', api)
