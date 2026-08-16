// The IPC contract: the single source for channel names and payload types. Both ends import only from
// here, and defining their own is forbidden.
import type { ErrorCode, ErrorParams } from './errors'

export const CMD = {
  /** Get the current snapshot (triggering the first scan if there is none) */
  getSnapshot: 'agentshed:get-snapshot',
  /** Global refresh (the rail's bottom refresh button; repeat calls while one is in flight are deduplicated) */
  refresh: 'agentshed:refresh',
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
  /** Read an artifact's markdown (only files the detail page listed, validated against the main process's
   * allow-list) */
  readArtifact: 'agentshed:read-artifact',
  /** Open an artifact externally (prototypes HTML → the system default application; the same allow-list) */
  openArtifact: 'agentshed:open-artifact',
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
  /** Set the UI language preference (which may be "follow system") */
  setLanguage: 'agentshed:set-language',
  /** Enumerate a package's previewable files when a skill is expanded (registering the allow-list) */
  listSkillFiles: 'agentshed:list-skill-files',
  /** Read the contents of a registered file inside a skill package */
  readSkillFile: 'agentshed:read-skill-file'
} as const

export const EVT = {
  /** The main process pushes a new snapshot (a refresh completed) */
  snapshot: 'agentshed:snapshot',
  /** The application menu triggered "Settings" (ticket 13): the same operation as the rail's settings entry, with
   * the renderer switching dimension */
  menuOpenSettings: 'agentshed:menu-open-settings',
  /** The application menu triggered "Refresh": the same operation as the rail's refresh button */
  menuRefresh: 'agentshed:menu-refresh'
} as const

export interface SessionTurnArgs {
  file: string
  /** The question index, from 0, into the session page's displayed set (the order of
   * getSessionPage.questions) */
  i: number
}

export interface SearchSessionsArgs {
  /** The project path (the main process takes the session set from it; the renderer cannot supply file
   * paths) */
  path: string
  needle: string
  fullText: boolean
}

export interface SkillOpArgs {
  skillName: string
  side: 'claude' | 'codex'
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
  side: 'claude' | 'codex'
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

/**
 * The system's preferred language list (comma separated), passed to the preload through the same channel.
 * The renderer needs it to **compute locally** the effective language when the user selects "follow
 * system" and apply it immediately,
 * without an extra IPC round trip per switch. Language tags contain no commas, so the separator is safe.
 */
export const SYS_LANGS_ARG = '--agentshed-system-languages='

export type { AppearanceMode, AppearanceTheme } from './appearance'
export type { ErrorCode, ErrorParams } from './errors'
export type { Prefs } from './prefs'
export type { Language, LanguagePreference } from './i18n'
