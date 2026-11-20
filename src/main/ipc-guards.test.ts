// Each channel's guard against every input it refuses (#405). The expected codes and parameters are written as the
// strings that cross IPC, not as ERR's constants, so a code renamed in errors.ts shows here as the refusal it changes.
//
// Gap: that a handler runs its guard before anything it does, the disk included, is the registration wrapper's
// wiring in index.ts, which unit tests do not load (ADR-0038). The e2e cases that send a refused request over real
// IPC carry it, session-view's IPC surface case first.
import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeAppError, type AppError } from '@shared/errors'
import type { RegistrationScope } from '@shared/display-data'
import { ReadRegistry } from './read-registrations'
import { regularTarget } from './source-identity'
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
  type GuardState,
  type Register
} from './ipc-guards'

const state = (o: Partial<GuardState> = {}): GuardState => ({
  sessions: new Set(),
  sessionsRestored: false,
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

describe('projectDetailArgs', () => {
  it.each([42, null, undefined, {}, ''])('refuses %j as bad arguments for path', (raw) => {
    expect(refusal(() => projectDetailArgs(raw, state()))).toEqual({ code: 'bad-args', params: { channel: 'getProjectDetail', field: 'path' } })
  })
  it('admits a path', () => {
    expect(projectDetailArgs('/p', state())).toBe('/p')
  })
})

const SESSION = '/s/a.jsonl'
const listed = (): GuardState => state({ sessions: new Set([SESSION]) })
const notListed = { code: 'session-not-whitelisted', params: {} }

describe('listedSessionArg', () => {
  it.each([42, null, undefined, '', '/s/b.jsonl', '/s/x/../a.jsonl'])('refuses %j as not in the allow-list', (raw) => {
    expect(refusal(() => listedSessionArg(raw, listed()))).toEqual(notListed)
  })
  it('admits a listed session as the allow-list spells it', () => {
    expect(listedSessionArg(SESSION, listed())).toBe(SESSION)
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
  it('admits a listed session and an index, with or without a revision', () => {
    expect(sessionTurnArgs({ file: SESSION, i: 0 }, listed())).toEqual({ file: SESSION, i: 0, revision: undefined })
    expect(sessionTurnArgs({ file: SESSION, i: 3, revision: 'r1' }, listed())).toEqual({ file: SESSION, i: 3, revision: 'r1' })
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
  it.each([42, '', undefined])('refuses the path %j first', (path) => {
    expect(refusal(() => searchSessionsArgs({ path, needle: 42, fullText: 'no' }, state()))).toEqual(badArgs('searchSessions', 'path'))
  })
  it.each([42, needle(201)])('refuses the needle %j before fullText', (n) => {
    expect(refusal(() => searchSessionsArgs({ ...valid, needle: n, fullText: 'no' }, state()))).toEqual(badArgs('searchSessions', 'needle'))
  })
  it.each(['no', undefined, 1])('refuses fullText %j', (fullText) => {
    expect(refusal(() => searchSessionsArgs({ ...valid, fullText }, state()))).toEqual(badArgs('searchSessions', 'fullText'))
  })
  it('refuses missing arguments as the path', () => {
    expect(refusal(() => searchSessionsArgs(null, state()))).toEqual(badArgs('searchSessions', 'path'))
  })
  it('admits a needle of the limit\'s length', () => {
    expect(searchSessionsArgs({ path: '/p', needle: needle(200), fullText: true }, state())).toEqual({ path: '/p', needle: needle(200), fullText: true })
  })
})

describe('globalSearchArgs', () => {
  it.each([42, null, needle(201)])('refuses %j', (raw) => {
    expect(refusal(() => globalSearchArgs(raw, state()))).toEqual(badArgs('globalSearch', 'needle'))
  })
  it.each([needle(200), ''])('admits %j', (raw) => {
    expect(globalSearchArgs(raw, state())).toBe(raw)
  })
})

describe('copyTextArgs', () => {
  it.each([42, null, ''])('refuses %j', (raw) => {
    expect(refusal(() => copyTextArgs(raw, state()))).toEqual(badArgs('copyText', 'text'))
  })
  it('admits text', () => {
    expect(copyTextArgs('x', state())).toBe('x')
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
    ['no arguments', undefined]
  ])('refuses %s', (_what, raw) => {
    expect(refusal(() => installSkillArgs(raw, state()))).toEqual(badArgs('installSkill'))
  })
  it('passes on only the three fields an install takes', () => {
    expect(installSkillArgs({ ...valid, side: 'claude', extra: 1 }, state())).toEqual({ skillName: 'tidy', sides: ['claude', 'codex'], targetProjectPath: '/p' })
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
  it('admits a skill, a side and a target', () => {
    expect(uninstallSkillArgs({ skillName: 'tidy', side: 'grok', targetProjectPath: '/p' }, state())).toEqual({ skillName: 'tidy', side: 'grok', targetProjectPath: '/p' })
  })
})

describe('skillHoldingsArgs', () => {
  it.each([42, null, undefined])('refuses %j', (raw) => {
    expect(refusal(() => skillHoldingsArgs(raw, state()))).toEqual(badArgs('skillHoldings'))
  })
  it('admits a name', () => {
    expect(skillHoldingsArgs('tidy', state())).toBe('tidy')
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
  it('admits each scope', () => {
    expect(listSkillFilesArgs({ name: 'tidy', side: 'codex', scope: 'global' }, state())).toEqual({ name: 'tidy', side: 'codex', scope: 'global' })
    expect(listSkillFilesArgs({ name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' }, state()))
      .toEqual({ name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' })
    expect(listSkillFilesArgs({ name: 'tidy', side: 'antigravity', scope: 'plugin', pluginRoot: '/r' }, state()))
      .toEqual({ name: 'tidy', side: 'antigravity', scope: 'plugin', pluginRoot: '/r' })
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
  it('refuses a project package from a project whose page was not opened', () => {
    expect(refusal(() => admitSkillPackage(state({ registry: live({ projects: ['/p'] }) }), project('/q')))).toEqual({ code: 'project-not-opened', params: {} })
  })
  it('admits a project package from an opened page, restored or live, and a global package', () => {
    expect(refusal(() => admitSkillPackage(state({ registry: live({ projects: ['/p'] }) }), project('/p')))).toBeNull()
    expect(refusal(() => admitSkillPackage(state({ registry: restored({ projects: ['/p'] }) }), project('/p')))).toBeNull()
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
