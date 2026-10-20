// The IPC contract: the single source for channel names and payload types. Both ends import only from
// here, and defining their own is forbidden.
import type { AgentSide } from './domain'
import type { ErrorCode, ErrorParams } from './errors'

export const CMD = {
  /** Get the current snapshot (triggering the first scan if there is none) */
  getSnapshot: 'agentshed:get-snapshot',
  /** Validated saved presentation data and startup scan state; read-only. */
  getStartup: 'agentshed:get-startup',
  /** Fetch project detail on demand */
  getProjectDetail: 'agentshed:get-project-detail',
  /** The session page: the question index + text read live by range (ticket 04; a range-read path, not
   * reusing the artifact read-whole one) */
  getSessionPage: 'agentshed:get-session-page',
  /** Whether the session index matches disk (ticket 05; a read-only predicate the renderer uses to show
   * the rebuilding interim state) */
  sessionFresh: 'agentshed:session-fresh',
  /** Fetch one turn on demand: a question index → that turn's range read live + normalised blocks
   * (ticket 05) */
  getSessionTurn: 'agentshed:get-session-turn',
  /** Search this project's sessions: questions by default, switchable to full text (ticket 08; a coarse
   * range-read pass, no index built) */
  searchSessions: 'agentshed:search-sessions',
  /** Global search: start reading every listed session's question texts into memory, or join the reading
   * under way; resolves once they are read (ADR-0034). The page asks for it when it is shown */
  readSearchQuestions: 'agentshed:read-search-questions',
  /** Global search: the listed sessions of every project whose questions contain a keyword, every hit; waits
   * for a reading under way */
  globalSearch: 'agentshed:global-search',
  /** Read an artifact's markdown (only files the detail page listed, validated against the main process's
   * allow-list) */
  readArtifact: 'agentshed:read-artifact',
  /** Open an artifact externally (prototypes HTML → the system default application; the same allow-list) */
  openArtifact: 'agentshed:open-artifact',
  /** Write text to the system clipboard via the main process (the renderer's navigator.clipboard is
   * unreliable under automation, and the OS clipboard is main-process territory anyway) */
  copyText: 'agentshed:copy-text',
  /** Install a skill from the global library into a project (landed as a copy) */
  installSkill: 'agentshed:install-skill',
  /** Uninstall a project-level skill copy */
  uninstallSkill: 'agentshed:uninstall-skill',
  /** Read the app's preferences (theme, UI language and so on) */
  getPrefs: 'agentshed:get-prefs',
  /** Set the theme (app-wide) */
  setTheme: 'agentshed:set-theme',
  /** Set the appearance mode (which may be "follow system"; the main process sets
   * nativeTheme.themeSource from it) */
  setMode: 'agentshed:set-mode',
  setTrendSpan: 'agentshed:set-trend-span',
  /** Set the UI language preference (which may be "follow system") */
  setLanguage: 'agentshed:set-language',
  /** Enumerate a package's previewable files when a skill is expanded (registering the allow-list) */
  listSkillFiles: 'agentshed:list-skill-files',
  /** Read the contents of a registered file inside a skill package */
  readSkillFile: 'agentshed:read-skill-file',
  /** The app update lifecycle as it stands, read on mount (app-update) */
  getUpdateState: 'agentshed:get-update-state',
  /** The user clicked to install the ready app update (app-update::US-001/AC-04) */
  installUpdate: 'agentshed:install-update',
  /** "Check now" in settings: the request is the settings surface's, and answers its outcome (app-update::US-003/AC-02) */
  checkForUpdates: 'agentshed:check-for-updates',
  /** Settings' check record as it stands, read on mount (app-update::REQ-004/AC-03) */
  getSettingsCheck: 'agentshed:get-settings-check',
  /** Set the automatic update checks switch (app-update::REQ-003/AC-03) */
  setAutoCheckUpdates: 'agentshed:set-auto-check-updates'
} as const

export const EVT = {
  /** The main process pushes a new snapshot (a refresh completed) */
  snapshot: 'agentshed:snapshot',
  startupStatus: 'agentshed:startup-status',
  /** The application menu triggered "Settings" (ticket 13): the same operation as the rail's settings entry, with
   * the renderer switching dimension */
  menuOpenSettings: 'agentshed:menu-open-settings',
  /** The application menu triggered "Search Sessions…" (global-search US-004): the search page, its box focused */
  menuOpenSearch: 'agentshed:menu-open-search',
  /** The main process pushes each step of the app update lifecycle (app-update) */
  updateState: 'agentshed:update-state',
  /** A one-off update event the renderer answers with a toast: a failed install (app-update::REQ-002/AC-03) */
  updateNotice: 'agentshed:update-notice',
  /** The main process pushes each change of settings' check record (app-update::REQ-004/AC-02) */
  settingsCheck: 'agentshed:settings-check',
} as const

export interface SessionTurnArgs {
  /** The source question identity this ordinal belongs to. */
  revision?: string
  file: string
  /** The question index, from 0, into the session page's displayed set (the order of
   * getSessionPage.questions) */
  i: number
}

/** The longest keyword either session search accepts — a project's own and global search; a longer one is refused
 * at the IPC boundary as bad arguments */
export const SEARCH_NEEDLE_MAX = 200

export interface SearchSessionsArgs {
  /** The project path (the main process takes the session set from it; the renderer cannot supply file
   * paths) */
  path: string
  needle: string
  fullText: boolean
}

export interface SkillOpArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export type SkillOpResult =
  | { ok: true }
  // A failure carries only **a code plus parameters**, never a whole-sentence message (ADR-0015): the
  // renderer produces the wording in the current language.
  | { ok: false; reason: ErrorCode; params?: ErrorParams }

/** Enumerate a skill package: from the global library, project level, or a plugin package
 * (plugins-view H8) */
export interface ListSkillFilesArgs {
  side: AgentSide
  name: string
  scope: 'global' | 'project' | 'plugin'
  /** Required when scope=project */
  projectPath?: string
  /** Required when scope=plugin: the summary-source package root, which must hit the scan's registration
   * set (fail-closed) */
  pluginRoot?: string
}

export interface SkillFileEntry {
  path: string
  absPath: string
  bytes: number
  lines: number
  mtimeMs: number
}

export interface ListSkillFilesResult {
  files: SkillFileEntry[]
  deep: boolean
  deepPaths: string[]
}

export interface ReadSkillFileArgs {
  absPath: string
}

/**
 * The prefix by which the effective language is passed to the preload through the window's creation
 * arguments.
 * This synchronous channel rather than IPC is what gives the renderer the correct language on its first
 * frame (see createWindow's comment).
 */
export const LANG_ARG = '--agentshed-language='

/** The saved chart span is available before the first skeleton or restored-data render. */
export const TREND_SPAN_ARG = '--agentshed-trend-span='

/**
 * The system's preferred language list (comma separated), passed to the preload through the same channel.
 * The renderer needs it to **compute locally** the effective language when the user selects "follow
 * system" and apply it immediately,
 * without an extra IPC round trip per switch. Language tags contain no commas, so the separator is safe.
 */
export const SYS_LANGS_ARG = '--agentshed-system-languages='

/** The running version, for settings' "Current version" (app-update::REQ-003/AC-01): fixed for the run */
export const APP_VERSION_ARG = '--agentshed-app-version='

/**
 * Whether this run checks for app updates: `1` when packaged, or when the e2e seam declares an update
 * source, `0` in a development run, where settings' update controls are unavailable (app-update::US-005/AC-02)
 */
export const UPDATES_ARG = '--agentshed-updates='

export type { AppearanceMode, AppearanceTheme } from './appearance'
export type { ErrorCode, ErrorParams } from './errors'
export type { Prefs } from './prefs'
export type { UpdateNotice, UpdateState } from './update'
export type { Language, LanguagePreference } from './i18n'
