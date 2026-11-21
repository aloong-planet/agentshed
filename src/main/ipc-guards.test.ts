// Each channel's guard against every input it refuses (#405). The expected codes and parameters are written as the
// strings that cross IPC, not as ERR's constants, so a code renamed in errors.ts shows here as the refusal it changes.
// What each guard returns, and the row a guard fails without, are at the end (#538).
//
// Gap: what calls these is index.ts's wiring, which unit tests do not load (ADR-0038); e2e cases carry it, each
// sending over real IPC a request that only the wiring under test refuses:
// - the registration wrapper running a channel's guard before its handler: global-search's keyword over the limit,
//   lifecycle's restored session replaced by a link (revealSessionFile), session-view's sessionFresh outside the
//   allow-list, and project-detail's admission case, whose directory neither snapshot lists is refused while the first
//   scan is held. session-view's IPC surface case does not tell it apart: getSessionPage's own recheck refuses the same.
// - admitMemoryFile after readMemoryFile's delay: lifecycle's restored memory file replaced by a link.
// - listedProject after getProjectDetail's wait for the first scan: project-detail's admission case, whose project only
//   the restored snapshot lists.
// - admitSkillPackage after listSkillFiles' delay: plugins-view's unregistered plugin root and skills-view's project
//   whose page was never opened.
// Not driven: the six listedSession rechecks after an await, which need a scan to drop the file from the allow-list
// while the handler waits (AGENTSHED_FETCH_DELAY_MS holds getSessionPage); the file was listed a moment before. Nor
// admitSkillPackage's check that the snapshot still lists the project, which needs a project registration the snapshot
// no longer lists: a scan retires that registration by its owner (retireAfterScan), whether or not its saved page
// restored, so one is left only until the first scan: one an earlier build left for a directory its snapshot did not
// list, or one beside a saved snapshot that did not restore. The projects it judges by are the guard state's, which the
// admission case carries.
import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeAppError, type AppError } from '@shared/errors'
import type { RegistrationScope } from '@shared/display-data'
import { ReadRegistry } from './read-registrations'
import { regularTarget } from './source-identity'
import * as exported from './ipc-guards'
import {
  admitMemoryFile,
  admitSkillPackage,
  checkedByPrefsHandlers,
  copyTextArgs,
  globalSearchArgs,
  installSkillArgs,
  listSkillFilesArgs,
  listedSession,
  listedSessionArg,
  memoryFileArg,
  noArgs,
  projectDetailArgs,
  revealSessionArg,
  searchSessionsArgs,
  sessionTurnArgs,
  skillFileArg,
  skillHoldingsArgs,
  uninstallSkillArgs,
  type Guard,
  type GuardState,
  type Register
} from './ipc-guards'

const state = (o: Partial<GuardState> = {}): GuardState => ({
  sessions: new Set(),
  sessionsRestored: false,
  projects: [],
  registry: new ReadRegistry(),
  regular: () => true,
  exists: () => true,
  ...o
})

// Real files for the guards that probe the disk, with the probes the app passes (index.ts guardState)
const root = mkdtempSync(join(tmpdir(), 'agentshed-ipc-guards-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const file = join(root, 'a.jsonl')
writeFileSync(file, '{}')
const link = join(root, 'link.jsonl')
symlinkSync(file, link)
const gone = join(root, 'gone.jsonl')
const dir = join(root, 'package')
mkdirSync(dir)
const dirLink = join(root, 'package-link')
symlinkSync(dir, dirLink)
const disk = { exists: existsSync, regular: regularTarget }

const scope = (o: Partial<RegistrationScope>): RegistrationScope => ({ owner: 'scan', memoryFiles: [], skillFiles: [], projects: [], pluginRoots: [], ...o })
/** A registry holding the scope as a restored registration, the one saved before this launch */
const restored = (o: Partial<RegistrationScope>): ReadRegistry => new ReadRegistry([scope(o)])
/** A registry holding the scope as one this launch made */
function live(o: Partial<RegistrationScope>): ReadRegistry {
  const registry = new ReadRegistry()
  registry.replace(scope(o))
  return registry
}

/** The refusal a call throws, as the page decodes it, or null when the call is admitted */
function refusal(fn: () => unknown): AppError | null {
  try {
    fn()
  } catch (e) {
    const decoded = decodeAppError(e)
    if (!decoded) throw e
    return decoded
  }
  return null
}

describe('Register', () => {
  // Judged by `pnpm typecheck`, which checks this file (tsconfig.node.json): each directive fails it as soon as the line
  // under it compiles, so a registration that passes an inline check or no guard can no longer typecheck. This run only
  // makes the calls, on a register that keeps nothing
  it('takes a guard made in ipc-guards.ts, never an inline check or none', () => {
    const register: Register = () => undefined
    register('guarded', noArgs, () => 0)
    // @ts-expect-error an inline check is not a guard
    register('inline', (raw: unknown) => String(raw), (a: string) => a)
    // @ts-expect-error a registration names its guard
    register('none', () => 0)
  })
})

describe('a channel that takes no argument, and the preference setters', () => {
  it.each([undefined, 42, { file: '/x' }])('refuse nothing: %j', (raw) => {
    expect(refusal(() => noArgs(raw, state()))).toBeNull()
    expect(refusal(() => checkedByPrefsHandlers(raw, state()))).toBeNull()
  })
  it('pass the preference value on as sent', () => {
    expect(checkedByPrefsHandlers('dark', state())).toBe('dark')
  })
})

// project-detail::CON-001/AC-01, AC-02, AC-03 at the guard and the recheck. Which directories count as listed is
// isListedProject's (shared/listed-project.test.ts). The guard judges through listedProject, the handler's recheck after
// its wait, so these cases hold both to it, against the state they are given.
const listing = (): GuardState => state({ projects: [{ path: '/p' }] })
const projectNotListed = { code: 'project-not-listed', params: {} }

describe('projectDetailArgs', () => {
  it.each([42, null, undefined, {}, ''])('refuses %j as bad arguments for path', (raw) => {
    expect(refusal(() => projectDetailArgs(raw, state()))).toEqual({ code: 'bad-args', params: { channel: 'getProjectDetail', field: 'path' } })
  })
  it('refuses a directory the snapshot does not list as not listed, before any probe of the disk', () => {
    let probes = 0
    const probe = (): boolean => { probes++; return true }
    expect(refusal(() => projectDetailArgs('/q', state({ projects: [{ path: '/p' }], regular: probe, exists: probe })))).toEqual(projectNotListed)
    expect(probes).toBe(0)
  })
})

const SESSION = '/s/a.jsonl'
const listed = (): GuardState => state({ sessions: new Set([SESSION]) })
const notListed = { code: 'session-not-whitelisted', params: {} }

describe('listedSessionArg', () => {
  it.each([42, null, undefined, '', '/s/b.jsonl', '/s/x/../a.jsonl'])('refuses %j as not in the allow-list', (raw) => {
    expect(refusal(() => listedSessionArg(raw, listed()))).toEqual(notListed)
  })
})

describe('listedSession, the recheck after an await', () => {
  it('refuses a session the allow-list of that moment no longer holds', () => {
    expect(refusal(() => listedSession(state({ sessions: new Set(['/s/other.jsonl']) }), SESSION))).toEqual(notListed)
  })
  it('admits one it still holds', () => {
    expect(refusal(() => listedSession(listed(), SESSION))).toBeNull()
  })
})

describe('sessionTurnArgs', () => {
  it('refuses an unlisted session as that before its other arguments', () => {
    expect(refusal(() => sessionTurnArgs({ file: '/s/b.jsonl', i: -1, revision: 42 }, listed()))).toEqual(notListed)
    expect(refusal(() => sessionTurnArgs(null, listed()))).toEqual(notListed)
  })
  it('refuses a revision that is not a string, before the index', () => {
    expect(refusal(() => sessionTurnArgs({ file: SESSION, i: -1, revision: 42 }, listed())))
      .toEqual({ code: 'bad-args', params: { channel: 'getSessionTurn', field: 'revision' } })
  })
  it.each([-1, 1.5, '1', undefined, NaN])('refuses the index %j', (i) => {
    expect(refusal(() => sessionTurnArgs({ file: SESSION, i }, listed())))
      .toEqual({ code: 'bad-args', params: { channel: 'getSessionTurn', field: 'i' } })
  })
  it('admits a listed session and an index without a revision', () => {
    expect(sessionTurnArgs({ file: SESSION, i: 0 }, listed())).toEqual({ file: SESSION, i: 0, revision: undefined })
  })
})

describe('revealSessionArg', () => {
  const sessions = new Set([file, link, gone])
  it('refuses a session not in the allow-list', () => {
    expect(refusal(() => revealSessionArg(join(root, 'other.jsonl'), state({ sessions, ...disk })))).toEqual(notListed)
  })
  it('refuses a listed session whose file is gone as unreadable', () => {
    expect(refusal(() => revealSessionArg(gone, state({ sessions, ...disk })))).toEqual({ code: 'session-file-unreadable', params: {} })
  })
  it('refuses a restored entry that is not a regular file, and admits it once the allow-list is a scan\'s', () => {
    expect(refusal(() => revealSessionArg(link, state({ sessions, sessionsRestored: true, ...disk })))).toEqual(notListed)
    expect(revealSessionArg(link, state({ sessions, sessionsRestored: false, ...disk }))).toBe(link)
  })
  it('admits a restored entry that is a regular file', () => {
    expect(revealSessionArg(file, state({ sessions, sessionsRestored: true, ...disk }))).toBe(file)
  })
})

const needle = (length: number): string => 'n'.repeat(length)
const badArgs = (channel: string, field?: string): AppError => ({ code: 'bad-args', params: field ? { channel, field } : { channel } })

describe('searchSessionsArgs', () => {
  const valid = { path: '/p', needle: 'x', fullText: false }
  it.each([
    ['a path that is not a string', { path: 42, needle: 42, fullText: 'no' }],
    ['an empty path', { path: '', needle: 42, fullText: 'no' }],
    ['no path', { needle: 42, fullText: 'no' }],
    ['no arguments', null]
  ])('refuses %s as the path, before the rest', (_what, raw) => {
    expect(refusal(() => searchSessionsArgs(raw, state()))).toEqual(badArgs('searchSessions', 'path'))
  })
  it.each([42, needle(201)])('refuses the needle %j before fullText', (n) => {
    expect(refusal(() => searchSessionsArgs({ ...valid, needle: n, fullText: 'no' }, state()))).toEqual(badArgs('searchSessions', 'needle'))
  })
  it.each(['no', undefined, 1])('refuses fullText %j', (fullText) => {
    expect(refusal(() => searchSessionsArgs({ ...valid, fullText }, state()))).toEqual(badArgs('searchSessions', 'fullText'))
  })
})

describe('globalSearchArgs', () => {
  it.each([42, null, needle(201)])('refuses %j', (raw) => {
    expect(refusal(() => globalSearchArgs(raw, state()))).toEqual(badArgs('globalSearch', 'needle'))
  })
  it('admits an empty keyword', () => {
    expect(globalSearchArgs('', state())).toBe('')
  })
})

describe('copyTextArgs', () => {
  it.each([42, null, ''])('refuses %j', (raw) => {
    expect(refusal(() => copyTextArgs(raw, state()))).toEqual(badArgs('copyText', 'text'))
  })
})

const memoryRefused = { code: 'memory-file-not-whitelisted', params: {} }

describe('memoryFileArg', () => {
  it.each([42, null, '/m/other.md'])('refuses %j as not registered', (raw) => {
    expect(refusal(() => memoryFileArg(raw, state({ registry: live({ memoryFiles: ['/m/a.md'] }) })))).toEqual(memoryRefused)
  })
  it('admits a registered file, restored or live', () => {
    expect(memoryFileArg('/m/a.md', state({ registry: restored({ memoryFiles: ['/m/a.md'] }) }))).toBe('/m/a.md')
    expect(memoryFileArg('/m/a.md', state({ registry: live({ memoryFiles: ['/m/a.md'] }) }))).toBe('/m/a.md')
  })
})

describe('admitMemoryFile, the recheck before the read', () => {
  const restoredAll = (): GuardState => state({ registry: restored({ memoryFiles: [file, link, gone] }), ...disk })
  it('refuses a file no longer registered', () => {
    expect(refusal(() => admitMemoryFile(state({ registry: live({ memoryFiles: [link] }), ...disk }), file))).toEqual(memoryRefused)
  })
  it.each([['a link', link], ['gone', gone]])('refuses a restored registration that is %s', (_what, path) => {
    expect(refusal(() => admitMemoryFile(restoredAll(), path))).toEqual(memoryRefused)
  })
  it('admits a restored regular file, and a live registration that is a link', () => {
    expect(refusal(() => admitMemoryFile(restoredAll(), file))).toBeNull()
    expect(refusal(() => admitMemoryFile(state({ registry: live({ memoryFiles: [link] }), ...disk }), link))).toBeNull()
  })
})

describe('installSkillArgs', () => {
  const valid = { skillName: 'tidy', sides: ['claude', 'codex'], targetProjectPath: '/p' }
  it.each([
    ['a skill name that is not a string', { ...valid, skillName: 42 }],
    ['a target that is not a string', { ...valid, targetProjectPath: null }],
    ['sides that are not a list', { ...valid, sides: 'claude' }],
    ['no sides', { ...valid, sides: [] }],
    ['an unknown side', { ...valid, sides: ['claude', 'vim'] }],
    // Structured clone keeps a hole (measured under Electron 43, #538), and no check would have looked at its place
    ['sides with a hole', { ...valid, sides: Object.assign([], { 1: 'claude' }) }],
    // A sparse list crosses in a few bytes whatever its length, and a copy of this one would not fit in an array
    ['more sides than there are, sent sparse', { ...valid, sides: Object.assign([], { [2 ** 32 - 2]: 'claude' }) }],
    ['no arguments', undefined]
  ])('refuses %s', (_what, raw) => {
    expect(refusal(() => installSkillArgs(raw, state()))).toEqual(badArgs('installSkill'))
  })
  it('leaves a name that is not one path segment to the install, which refuses it', () => {
    expect(refusal(() => installSkillArgs({ ...valid, skillName: '../x' }, state()))).toBeNull()
  })
})

describe('uninstallSkillArgs', () => {
  const valid = { skillName: 'tidy', side: 'grok', targetProjectPath: '/p' }
  it.each([
    ['a skill name that is not a string', { ...valid, skillName: undefined }],
    ['an unknown side', { ...valid, side: 'vim' }],
    ['no side', { ...valid, side: undefined }],
    ['a target that is not a string', { ...valid, targetProjectPath: 7 }],
    ['no arguments', null]
  ])('refuses %s', (_what, raw) => {
    expect(refusal(() => uninstallSkillArgs(raw, state()))).toEqual(badArgs('skillOp'))
  })
})

describe('skillHoldingsArgs', () => {
  it.each([42, null, undefined])('refuses %j', (raw) => {
    expect(refusal(() => skillHoldingsArgs(raw, state()))).toEqual(badArgs('skillHoldings'))
  })
})

describe('listSkillFilesArgs', () => {
  it.each([
    ['a name that is not a string', { name: 1, side: 'claude', scope: 'global' }],
    ['an unknown side', { name: 'tidy', side: 'vim', scope: 'global' }],
    ['an unknown scope', { name: 'tidy', side: 'claude', scope: 'user' }],
    ['no arguments', undefined]
  ])('refuses %s', (_what, raw) => {
    expect(refusal(() => listSkillFilesArgs(raw, state()))).toEqual(badArgs('listSkillFiles'))
  })
  it('refuses a project package without its project, and a plugin package without its root', () => {
    expect(refusal(() => listSkillFilesArgs({ name: 'tidy', side: 'claude', scope: 'project', pluginRoot: '/r' }, state())))
      .toEqual(badArgs('listSkillFiles', 'projectPath'))
    expect(refusal(() => listSkillFilesArgs({ name: 'tidy', side: 'claude', scope: 'plugin', projectPath: '/p' }, state())))
      .toEqual(badArgs('listSkillFiles', 'pluginRoot'))
  })
  // A path the scope does not take would go into the listing's registration key (savedReadKey), which retiring then
  // cannot read as a listing's
  it.each([
    ['a global package', { name: 'tidy', side: 'codex', scope: 'global' }, { name: 'tidy', side: 'codex', scope: 'global' }],
    ['a global package sent with a project and a plugin root', { name: 'tidy', side: 'codex', scope: 'global', projectPath: '/p', pluginRoot: '/r' },
      { name: 'tidy', side: 'codex', scope: 'global' }],
    ['a project package sent with a plugin root', { name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p', pluginRoot: '/r' },
      { name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' }],
    ['a plugin package', { name: 'tidy', side: 'antigravity', scope: 'plugin', pluginRoot: '/r' }, { name: 'tidy', side: 'antigravity', scope: 'plugin', pluginRoot: '/r' }],
    ['a plugin package sent with a project', { name: 'tidy', side: 'antigravity', scope: 'plugin', pluginRoot: '/r', projectPath: '/p' },
      { name: 'tidy', side: 'antigravity', scope: 'plugin', pluginRoot: '/r' }]
  ])('admits %s, passing on only the path its scope takes', (_what, raw, admitted) => {
    expect(listSkillFilesArgs(raw, state())).toStrictEqual(admitted)
  })
})

describe('admitSkillPackage', () => {
  const plugin = (pluginRoot: string) => ({ name: 'tidy', side: 'claude' as const, scope: 'plugin' as const, pluginRoot })
  const project = (projectPath: string) => ({ name: 'tidy', side: 'claude' as const, scope: 'project' as const, projectPath })
  const pluginRefused = { code: 'plugin-root-not-registered', params: {} }
  it('refuses a plugin root no scan or page registered', () => {
    expect(refusal(() => admitSkillPackage(state({ registry: live({ pluginRoots: [dir] }), ...disk }), plugin(join(root, 'other'))))).toEqual(pluginRefused)
  })
  it.each([['a link', dirLink], ['gone', join(root, 'gone-package')], ['a file', file]])('refuses a restored plugin root that is %s', (_what, path) => {
    expect(refusal(() => admitSkillPackage(state({ registry: restored({ pluginRoots: [path] }), ...disk }), plugin(path)))).toEqual(pluginRefused)
  })
  it('admits a restored plugin root that is a directory, and a live one that is a link', () => {
    expect(refusal(() => admitSkillPackage(state({ registry: restored({ pluginRoots: [dir] }), ...disk }), plugin(dir)))).toBeNull()
    expect(refusal(() => admitSkillPackage(state({ registry: live({ pluginRoots: [dirLink] }), ...disk }), plugin(dirLink)))).toBeNull()
  })
  // project-detail::CON-001/AC-04. Which snapshot is that moment's, the restored one or the latest scan's, is the guard
  // state index.ts builds, which project-detail's admission case carries: at this layer a restored registration before
  // the first scan and one after it are judged against the same list.
  it.each([
    ['admits a package from a project whose page was opened this launch, which the snapshot lists', live({ projects: ['/p'] }), '/p', null],
    ['admits a package from a project with a restored registration, which the snapshot lists', restored({ projects: ['/p'] }), '/p', null],
    ['refuses a package from a project with a restored registration, which the snapshot no longer lists', restored({ projects: ['/gone'] }), '/gone', projectNotListed],
    ['refuses a package from a project whose page was opened this launch, which the snapshot no longer lists', live({ projects: ['/gone'] }), '/gone', projectNotListed],
    ['refuses a package from a project the snapshot lists whose page was not opened', live({ projects: ['/q'] }), '/p', { code: 'project-not-opened', params: {} }]
  ])('%s', (_what, registry, projectPath, expected) => {
    expect(refusal(() => admitSkillPackage(state({ registry, projects: [{ path: '/p' }] }), project(projectPath)))).toEqual(expected)
  })
  it('admits a global package', () => {
    expect(refusal(() => admitSkillPackage(state(), { name: 'tidy', side: 'claude', scope: 'global' }))).toBeNull()
  })
})

describe('skillFileArg', () => {
  it.each([42, null, {}, { absPath: '' }, { absPath: 7 }])('refuses %j as bad arguments for absPath', (raw) => {
    expect(refusal(() => skillFileArg(raw, state()))).toEqual(badArgs('readSkillFile', 'absPath'))
  })
  it('refuses a file no package listing registered', () => {
    expect(refusal(() => skillFileArg({ absPath: join(root, 'other.md') }, state({ registry: live({ skillFiles: [file] }), ...disk }))))
      .toEqual({ code: 'skill-file-not-whitelisted', params: {} })
  })
  it.each([['a link', link], ['gone', gone]])('refuses a restored registration that is %s as unreadable', (_what, path) => {
    expect(refusal(() => skillFileArg({ absPath: path }, state({ registry: restored({ skillFiles: [path] }), ...disk }))))
      .toEqual({ code: 'skill-file-unreadable', params: {} })
  })
  it('admits a restored regular file, and a live registration that is a link', () => {
    expect(skillFileArg({ absPath: file }, state({ registry: restored({ skillFiles: [file] }), ...disk }))).toBe(file)
    expect(skillFileArg({ absPath: link }, state({ registry: live({ skillFiles: [link] }), ...disk }))).toBe(link)
  })
})

// What every guard returns is built from what it checked, never an object or an array the page sent (postmortem
// 2026-11-22-a-key-read-strictly-built-from-what-the-page-sent). Each guard has a row in GUARDS saying what it takes:
// - an object: it is sent its canonical arguments with a stray path at every level that holds an object or an array,
//   and returns its canonical result, written out here, sharing no object or array with what was sent;
// - a primitive: it admits that primitive and refuses it sent in an array or an object, so nothing it returns is one;
// - nothing: it returns nothing, whatever is sent;
// - the one exception, checkedByPrefsHandlers, which passes on the preference value: each setter refuses an object and
//   an array with invalid-pref (prefs-handlers.test.ts).
// How a guard is told from a recheck: Guard's brand is a type alone, so at run time every function this module exports
// counts as a guard unless RECHECKS names it, and typecheck holds RECHECKS to exports without the brand and GUARDS to a
// row for each export with it. A new export of either kind fails here until it has a row or a place in RECHECKS.
type GuardName = { [K in keyof typeof exported]: (typeof exported)[K] extends Guard<unknown> ? K : never }[keyof typeof exported]
const RECHECKS = ['listedProject', 'listedSession', 'admitMemoryFile', 'admitSkillPackage'] as const satisfies readonly Exclude<
  keyof typeof exported,
  GuardName
>[]
type Takes =
  | { takes: 'an object'; sends: object; at?: () => GuardState; returns: unknown }
  | { takes: 'a primitive'; sends: string; at?: () => GuardState }
  | { takes: 'nothing' }
  | { takes: 'the exception' }
const GUARDS: Record<GuardName, Takes> = {
  noArgs: { takes: 'nothing' },
  checkedByPrefsHandlers: { takes: 'the exception' },
  projectDetailArgs: { takes: 'a primitive', sends: '/p', at: listing },
  listedSessionArg: { takes: 'a primitive', sends: SESSION, at: listed },
  sessionTurnArgs: { takes: 'an object', sends: { file: SESSION, i: 3, revision: 'r1' }, at: listed, returns: { file: SESSION, i: 3, revision: 'r1' } },
  revealSessionArg: { takes: 'a primitive', sends: file, at: () => state({ sessions: new Set([file]), ...disk }) },
  searchSessionsArgs: {
    takes: 'an object',
    sends: { path: '/p', needle: needle(200), fullText: true },
    returns: { path: '/p', needle: needle(200), fullText: true }
  },
  globalSearchArgs: { takes: 'a primitive', sends: needle(200) },
  memoryFileArg: { takes: 'a primitive', sends: '/m/a.md', at: () => state({ registry: live({ memoryFiles: ['/m/a.md'] }) }) },
  copyTextArgs: { takes: 'a primitive', sends: 'x' },
  installSkillArgs: {
    takes: 'an object',
    // Every side, the longest list a page sends
    sends: { skillName: 'tidy', sides: ['claude', 'codex', 'grok', 'antigravity'], targetProjectPath: '/p' },
    returns: { skillName: 'tidy', sides: ['claude', 'codex', 'grok', 'antigravity'], targetProjectPath: '/p' }
  },
  uninstallSkillArgs: {
    takes: 'an object',
    sends: { skillName: 'tidy', side: 'grok', targetProjectPath: '/p' },
    returns: { skillName: 'tidy', side: 'grok', targetProjectPath: '/p' }
  },
  skillHoldingsArgs: { takes: 'a primitive', sends: 'tidy' },
  listSkillFilesArgs: {
    takes: 'an object',
    sends: { name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' },
    returns: { name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' }
  },
  skillFileArg: { takes: 'an object', sends: { absPath: file }, at: () => state({ registry: live({ skillFiles: [file] }), ...disk }), returns: file }
}

/** A copy of what a page sends with a stray path at every level that holds an object or an array. Structured clone,
 * which carries IPC arguments, keeps a property on an array as on any object (measured under Electron 43, #538) */
function withStrays<T extends object>(sends: T): T {
  const sent = structuredClone(sends)
  const stray = (v: unknown): void => {
    if (typeof v !== 'object' || v === null) return
    for (const inner of Object.values(v)) stray(inner)
    Object.assign(v, { stray: '/stray' })
  }
  stray(sent)
  return sent
}

/** Every object and array reachable from a value, the value itself included */
function reachable(v: unknown, found = new Set<object>()): Set<object> {
  if (typeof v !== 'object' || v === null || found.has(v)) return found
  found.add(v)
  for (const inner of Object.values(v)) reachable(inner, found)
  return found
}

describe('what every guard returns', () => {
  const rows = Object.entries(GUARDS) as [GuardName, Takes][]
  const taking = <T extends Takes['takes']>(t: T) => rows.filter((r): r is [GuardName, Extract<Takes, { takes: T }>] => r[1].takes === t)
  const run = (name: GuardName): Guard<unknown> => exported[name]

  it('has a row for every guard the module exports, and checkedByPrefsHandlers is the one exception', () => {
    const recheck: readonly string[] = RECHECKS
    const guards = Object.entries(exported).filter(([name, v]) => typeof v === 'function' && !recheck.includes(name)).map(([name]) => name)
    expect(guards.sort()).toEqual(Object.keys(GUARDS).sort())
    expect(taking('the exception').map(([name]) => name)).toEqual(['checkedByPrefsHandlers'])
  })
  it.each(taking('an object'))('%s returns what it checked, built anew, whatever else the page sends', (name, row) => {
    const sent = withStrays(row.sends)
    const result = run(name)(sent, (row.at ?? state)())
    expect(result).toStrictEqual(row.returns)
    const fromPage = reachable(sent)
    expect([...reachable(result)].filter((o) => fromPage.has(o))).toEqual([])
  })
  // The admission first, so that the refusals are of the wrapping and not of the value
  it.each(taking('a primitive'))('%s admits only a primitive', (name, row) => {
    const at = row.at ?? state
    expect(run(name)(row.sends, at())).toBe(row.sends)
    expect(refusal(() => run(name)([row.sends], at()))).not.toBeNull()
    expect(refusal(() => run(name)({ value: row.sends }, at()))).not.toBeNull()
  })
  it.each(taking('nothing'))('%s returns nothing, whatever the page sends', (name) => {
    expect(run(name)({ file: '/x' }, state())).toBeUndefined()
  })
})
