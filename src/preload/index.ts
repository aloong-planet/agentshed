import { contextBridge, ipcRenderer } from 'electron'
import {
  CMD,
  EVT,
  type SearchSessionsArgs,
  type SessionTurnArgs,
  type SkillOpArgs,
  type SkillOpResult,
  type Prefs,
  type AppearanceMode,
  type AppearanceTheme,
  type LanguagePreference,
  type ListSkillFilesArgs,
  type ListSkillFilesResult,
  type ReadSkillFileArgs
} from '@shared/ipc'
import type { CappedText, ProjectDetail, SearchResult, SessionPage, SessionTurn, Snapshot } from '@shared/domain'
import {
  contractError,
  validateSnapshot,
  validateProjectDetail,
  validateSessionPage,
  validateSessionTurn,
  validateSearchResult
} from '@shared/validate'
import { parsePrefs } from '@shared/prefs'
import { ERR, appError } from '@shared/errors'
import { FALLBACK_LANGUAGE, isLanguage, type Language } from '@shared/i18n'
import { LANG_ARG, SYS_LANGS_ARG } from '@shared/ipc'

// Contract validation at the renderer's entry: a snapshot from the main process that does not meet the
// contract throws rather than silently rendering undefined
function checked(snap: unknown): Snapshot {
  const r = validateSnapshot(snap)
  if (!r.ok) throw contractError('snapshot', r.failure)
  return snap as Snapshot
}

function checkedPrefs(raw: unknown): Prefs {
  const p = parsePrefs(raw)
  if (!p) throw appError(ERR.contractType, { path: 'prefs', expect: 'Prefs' })
  return p
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

const api = {
  /** The effective language, available on the first frame (not the preference — that goes through getPrefs) */
  initialLanguage: initialLanguage(),
  /** The system's preferred language list at startup: the renderer computes the effective language
   * locally from it when "follow system" is selected */
  systemLanguages: systemLanguages(),
  getSnapshot: async (): Promise<Snapshot> => checked(await ipcRenderer.invoke(CMD.getSnapshot)),
  refresh: async (): Promise<Snapshot> => checked(await ipcRenderer.invoke(CMD.refresh)),
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
  readArtifact: (file: string): Promise<CappedText> =>
    ipcRenderer.invoke(CMD.readArtifact, file) as Promise<CappedText>,
  openArtifact: (file: string): Promise<void> => ipcRenderer.invoke(CMD.openArtifact, file),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke(CMD.copyText, text),
  installSkill: (args: SkillOpArgs): Promise<SkillOpResult> =>
    ipcRenderer.invoke(CMD.installSkill, args) as Promise<SkillOpResult>,
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
  setMode: async (mode: AppearanceMode): Promise<Prefs> =>
    checkedPrefs(await ipcRenderer.invoke(CMD.setMode, mode)),
  /** The application menu's two entry points (ticket 13): they behave identically to the same-named
   * operations in the UI */
  onMenuOpenSettings: (cb: () => void): (() => void) => {
    const l = (): void => cb()
    ipcRenderer.on(EVT.menuOpenSettings, l)
    return () => ipcRenderer.removeListener(EVT.menuOpenSettings, l)
  },
  onMenuRefresh: (cb: () => void): (() => void) => {
    const l = (): void => cb()
    ipcRenderer.on(EVT.menuRefresh, l)
    return () => ipcRenderer.removeListener(EVT.menuRefresh, l)
  },
  onSnapshot: (cb: (snap: Snapshot) => void): (() => void) => {
    const listener = (_e: unknown, snap: unknown): void => cb(checked(snap))
    ipcRenderer.on(EVT.snapshot, listener)
    return () => ipcRenderer.removeListener(EVT.snapshot, listener)
  }
}

export type AgentshedApi = typeof api
contextBridge.exposeInMainWorld('agentshed', api)
