// What every IPC channel admits from the page (#405): each channel's argument check and admission decision, the
// handler in index.ts only acting on what passed. The registration wrapper there runs a channel's guard after the
// sender check and before the handler, so nothing the handler does, the disk included, sees an argument the guard has
// not admitted. A guard is made only in this module: `Guard` is branded, so a registration cannot pass an inline check,
// and one that passes none fails typecheck (ipc-guards.test.ts holds both lines).
//
// A handler that awaits judges again with the state of that moment, as a scan may have replaced the allow-list in
// between: the rechecks below take the state they judge, and the handler builds it again for each.
import { ERR, appError } from '@shared/errors'
import {
  SEARCH_NEEDLE_MAX,
  type ListSkillFilesArgs,
  type SearchSessionsArgs,
  type SessionTurnArgs,
  type SkillInstallArgs,
  type SkillOpArgs
} from '@shared/ipc'
import type { ProjectEntry } from '@shared/domain'
import { isListedProject } from '@shared/listed-project'
import { AGENT_SIDES } from '@shared/validate'
import type { ReadRegistry } from './read-registrations'
import { sessionReadTarget, sessionRevealTarget } from './security'

declare const madeHere: unique symbol
/** A channel's check of what the page sent, returning the arguments its handler acts on, or throwing the refusal */
export type Guard<A> = ((raw: unknown, at: GuardState) => A) & { readonly [madeHere]: true }

/** What a channel registers with: the guard it is judged by and the handler that runs on what that guard admits */
export type Register = <A, T>(channel: string, guard: Guard<A>, run: (args: A) => T) => void

/** The main process's state a guard judges against, built again for every request and every recheck */
export interface GuardState {
  /** The session files the current allow-list holds: the last scan's, or the restored one before the first */
  sessions: ReadonlySet<string>
  /** Whether that allow-list is still the restored one */
  sessionsRestored: boolean
  /** The projects the snapshot of this moment lists: the restored one's until the first scan, the last scan's after it,
   * none without either */
  projects: readonly Pick<ProjectEntry, 'path'>[]
  registry: Pick<ReadRegistry, 'admission'>
  /** Whether a path is a regular file, or with `directory` a directory, never following a link */
  regular: (file: string, directory?: boolean) => boolean
  exists: (file: string) => boolean
}

function guard<A>(check: (raw: unknown, at: GuardState) => A): Guard<A> {
  return check as Guard<A>
}

/** A channel that takes no argument: whatever the page sends is ignored, as it always was */
export const noArgs: Guard<void> = guard(() => undefined)

/** The preference setters pass the value on: createPrefsHandlers checks it and refuses with invalid-pref
 * (prefs-handlers.test.ts), and setLanguage rebuilds the menu even then */
export const checkedByPrefsHandlers: Guard<unknown> = guard((raw) => raw)

/** A directory the snapshot lists as a project (project-detail::CON-001/AC-01, AC-03; the rule is isListedProject's) */
export const projectDetailArgs: Guard<string> = guard((path, at) => {
  if (typeof path !== 'string' || path === '') throw appError(ERR.badArgs, { channel: 'getProjectDetail', field: 'path' })
  listedProject(at, path)
  return path
})

/** The recheck after an await: the directory is still one the snapshot of that moment lists (project-detail::CON-001/AC-02) */
export function listedProject(at: GuardState, dir: string): void {
  if (!isListedProject(at.projects, dir)) throw appError(ERR.projectNotListed)
}

/** A session the allow-list holds, judged before the file is touched (session-view R1; the rule is sessionReadTarget's) */
export const listedSessionArg: Guard<string> = guard((raw, at) => {
  const file = sessionReadTarget(at.sessions, raw)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  return file
})

/** The recheck after an await: the session is still in the allow-list of that moment */
export function listedSession(at: GuardState, file: string): void {
  if (!at.sessions.has(file)) throw appError(ERR.sessionNotWhitelisted)
}

/** The session is judged first, so an unlisted one is refused as that whatever else is wrong */
export const sessionTurnArgs: Guard<SessionTurnArgs> = guard((raw, at) => {
  const a = raw as SessionTurnArgs
  const file = sessionReadTarget(at.sessions, a?.file)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  if (a?.revision !== undefined && typeof a.revision !== 'string') throw appError(ERR.badArgs, { channel: 'getSessionTurn', field: 'revision' })
  if (typeof a?.i !== 'number' || !Number.isInteger(a.i) || a.i < 0)
    throw appError(ERR.badArgs, { channel: 'getSessionTurn', field: 'i' })
  return { file, i: a.i, revision: a.revision }
})

/** Before the first scan the allow-list is the restored one, whose entries are shown only while regular files */
export const revealSessionArg: Guard<string> = guard((raw, at) => {
  const r = sessionRevealTarget(at.sessions, raw, { restored: at.sessionsRestored, exists: at.exists, regular: (f) => at.regular(f) })
  if (!r.ok) throw appError(r.code)
  return r.file
})

export const searchSessionsArgs: Guard<SearchSessionsArgs> = guard((raw) => {
  const a = raw as SearchSessionsArgs
  if (typeof a?.path !== 'string' || a.path === '') throw appError(ERR.badArgs, { channel: 'searchSessions', field: 'path' })
  if (typeof a?.needle !== 'string' || a.needle.length > SEARCH_NEEDLE_MAX)
    throw appError(ERR.badArgs, { channel: 'searchSessions', field: 'needle' })
  if (typeof a?.fullText !== 'boolean') throw appError(ERR.badArgs, { channel: 'searchSessions', field: 'fullText' })
  return a
})

/** The keyword's length limit is the project search's (global-search S4) */
export const globalSearchArgs: Guard<string> = guard((needle) => {
  if (typeof needle !== 'string' || needle.length > SEARCH_NEEDLE_MAX) throw appError(ERR.badArgs, { channel: 'globalSearch', field: 'needle' })
  return needle
})

/** A memory file a scan or an opened project page registered (project-detail R1) */
export const memoryFileArg: Guard<string> = guard((file, at) => {
  if (typeof file !== 'string' || !at.registry.admission('memoryFiles', file)) throw appError(ERR.memoryFileNotWhitelisted)
  return file
})

/** The recheck before the read: still registered, and a restored registration only while the file is a regular one
 * (agents-overview::CON-002) */
export function admitMemoryFile(at: GuardState, file: string): void {
  if (!at.registry.admission('memoryFiles', file)) throw appError(ERR.memoryFileNotWhitelisted)
  if (at.registry.admission('memoryFiles', file) === 'restored' && !at.regular(file)) throw appError(ERR.memoryFileNotWhitelisted)
}

export const copyTextArgs: Guard<string> = guard((text) => {
  if (typeof text !== 'string' || text === '')
    throw appError(ERR.badArgs, { channel: 'copyText', field: 'text' })
  return text
})

/** An install's shape only: which project it may go into is installIntoListedProject's (skill-install R3, R4), and a
 * name that is not one path segment is refused there */
export const installSkillArgs: Guard<SkillInstallArgs> = guard((args) => {
  const a = args as SkillInstallArgs
  if (
    typeof a?.skillName !== 'string' ||
    typeof a?.targetProjectPath !== 'string' ||
    !Array.isArray(a?.sides) ||
    a.sides.length === 0 ||
    !a.sides.every((s) => AGENT_SIDES.has(s))
  ) {
    throw appError(ERR.badArgs, { channel: 'installSkill' })
  }
  return { skillName: a.skillName, sides: a.sides, targetProjectPath: a.targetProjectPath }
})

/** An uninstall's shape only, as for an install (uninstallFromListedProject decides the rest) */
export const uninstallSkillArgs: Guard<SkillOpArgs> = guard((args) => {
  const a = args as SkillOpArgs
  if (
    typeof a?.skillName !== 'string' ||
    !AGENT_SIDES.has(a?.side) ||
    typeof a?.targetProjectPath !== 'string'
  ) {
    throw appError(ERR.badArgs, { channel: 'skillOp' })
  }
  return a
})

/** The page names the skill, never the paths probed */
export const skillHoldingsArgs: Guard<string> = guard((name) => {
  if (typeof name !== 'string') throw appError(ERR.badArgs, { channel: 'skillHoldings' })
  return name
})

/** The package's shape; whether its root may be read is admitSkillPackage's, after the handler's delay. Only the path
 * its scope takes is passed on: the listing's registration is keyed by these arguments (savedReadKey), and retiring
 * reads that key as a listing's only when it holds no other path */
export const listSkillFilesArgs: Guard<ListSkillFilesArgs> = guard((args) => {
  const a = args as ListSkillFilesArgs
  if (
    typeof a?.name !== 'string' ||
    !AGENT_SIDES.has(a?.side) ||
    (a?.scope !== 'global' && a?.scope !== 'project' && a?.scope !== 'plugin')
  ) {
    throw appError(ERR.badArgs, { channel: 'listSkillFiles' })
  }
  if (a.scope === 'project' && typeof a.projectPath !== 'string') {
    throw appError(ERR.badArgs, { channel: 'listSkillFiles', field: 'projectPath' })
  }
  if (a.scope === 'plugin' && typeof a.pluginRoot !== 'string') {
    throw appError(ERR.badArgs, { channel: 'listSkillFiles', field: 'pluginRoot' })
  }
  const named = { side: a.side, name: a.name }
  if (a.scope === 'project') return { ...named, scope: a.scope, projectPath: a.projectPath }
  if (a.scope === 'plugin') return { ...named, scope: a.scope, pluginRoot: a.pluginRoot }
  return { ...named, scope: a.scope }
})

/**
 * Whether a package's root may be read (plugins-view H8, skills-view C9): a plugin package root the scan or a project
 * page registered, a restored registration only while it is a directory (agents-overview::CON-002); a project's package
 * only from a project whose page was opened, while the snapshot lists it (project-detail::CON-001/AC-04). A global
 * package, and the container check of every package that is not a plugin's, are resolveSkillRoot's, which the skill
 * name also passes through.
 */
export function admitSkillPackage(at: GuardState, a: ListSkillFilesArgs): void {
  if (a.scope === 'plugin') {
    if (!at.registry.admission('pluginRoots', a.pluginRoot as string)) throw appError(ERR.pluginRootNotRegistered)
    if (at.registry.admission('pluginRoots', a.pluginRoot as string) === 'restored' && !at.regular(a.pluginRoot as string, true)) {
      throw appError(ERR.pluginRootNotRegistered)
    }
  } else if (a.scope === 'project') {
    if (!at.registry.admission('projects', a.projectPath as string)) throw appError(ERR.projectNotOpened)
    listedProject(at, a.projectPath as string)
  }
}

/** A file of a package listed this launch or restored, a restored one only while it is a regular file (skills-view C8) */
export const skillFileArg: Guard<string> = guard((args, at) => {
  const a = args as { absPath?: unknown }
  if (typeof a?.absPath !== 'string' || !a.absPath) throw appError(ERR.badArgs, { channel: 'readSkillFile', field: 'absPath' })
  if (!at.registry.admission('skillFiles', a.absPath)) throw appError(ERR.skillFileNotWhitelisted)
  if (at.registry.admission('skillFiles', a.absPath) === 'restored' && !at.regular(a.absPath)) throw appError(ERR.skillFileUnreadable)
  return a.absPath
})
