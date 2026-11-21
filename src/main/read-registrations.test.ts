import { describe, expect, it } from 'vitest'
import { savedReadKey, type ReadRegistrations, type RegistrationScope } from '@shared/display-data'
import type { ListSkillFilesArgs } from '@shared/ipc'
import { ReadRegistry, retireAfterDetail, retireAfterScan } from './read-registrations'

it('replaces one authoritative scope without removing another owner of the same path', () => {
  const registry = new ReadRegistry([{ owner: 'scan', memoryFiles: ['/shared', '/old'], skillFiles: [], projects: [], pluginRoots: [] },
    { owner: 'project:/p', memoryFiles: ['/shared', '/project'], skillFiles: [], projects: ['/p'], pluginRoots: [] }])
  expect(registry.admission('memoryFiles', '/old')).toBe('restored')
  registry.replace({ owner: 'scan', memoryFiles: ['/new'], skillFiles: [], projects: [], pluginRoots: [] })
  expect(registry.admission('memoryFiles', '/old')).toBeNull()
  expect(registry.admission('memoryFiles', '/shared')).toBe('restored')
  expect(registry.admission('memoryFiles', '/new')).toBe('live')
  expect(registry.admission('memoryFiles', '/arbitrary')).toBeNull()
})

type Owned = Partial<RegistrationScope> & { owner: string }
const scope = (s: Owned): RegistrationScope => ({ memoryFiles: [], skillFiles: [], projects: [], pluginRoots: [], ...s })
/** A registry whose owners are as this launch registered them */
function registered(...scopes: Owned[]): ReadRegistry {
  const registry = new ReadRegistry()
  for (const s of scopes) registry.replace(scope(s))
  return registry
}
/** A registry whose owners came back from the last launch's display copy */
const restored = (...scopes: Owned[]): ReadRegistry => new ReadRegistry(scopes.map(scope))
/** A package listing's registration, under its own key with one file, as listSkillFiles registers it */
const listing = (args: ListSkillFilesArgs, file: string): Owned => ({ owner: savedReadKey({ kind: 'skillFiles', args, data: { files: [] } }), skillFiles: [file] })
const stillAdmitted = (registry: ReadRegistry, kind: keyof ReadRegistrations, paths: string[]): string[] =>
  paths.filter(p => registry.admission(kind, p) !== null)
const kinds: (keyof ReadRegistrations)[] = ['memoryFiles', 'skillFiles', 'projects', 'pluginRoots']
/** Each path of one registration, by kind, that the registry still admits */
const admittedOf = (registry: ReadRegistry, s: Owned): string[] =>
  kinds.flatMap(kind => stillAdmitted(registry, kind, s[kind] ?? []).map(p => `${kind} ${p}`))

describe('admission', () => {
  // skills-view C9: only the exact registered path; a spelling that may reach the same file is refused, not resolved
  const exact = '/w/café/SKILL.md'.normalize('NFC')
  it.each([
    ['a trailing separator', `${exact}/`],
    ['a . segment', '/w/./café/SKILL.md'.normalize('NFC')],
    ['a .. segment leading to it', '/w/x/../café/SKILL.md'.normalize('NFC')],
    ['a prefix lookalike', `${exact}2`],
    ['a path inside it', `${exact}/x`],
    ['percent-encoding', '/w/caf%C3%A9/SKILL.md'],
    ['another Unicode normalisation', exact.normalize('NFD')],
    ['another letter case', exact.toUpperCase()]
  ])('admits a registered path of each kind by its exact spelling and refuses %s', (_what, spelling) => {
    const registry = registered({ owner: 'scan', memoryFiles: [exact], skillFiles: [exact], projects: [exact], pluginRoots: [exact] })
    expect(kinds.map(kind => registry.admission(kind, exact))).toEqual(['live', 'live', 'live', 'live'])
    expect(kinds.map(kind => registry.admission(kind, spelling))).toEqual([null, null, null, null])
  })
})

// Owners of none of the three forms, and listing keys that do not parse into side, name, scope and one path. Each but the
// first two names something a looser reading would keep: a project the scan lists live, or a root the scan holds.
const unparsed: [string, string][] = [
  ['an owner of none of the three forms', 'mystery:/kept'],
  ['a listing key cut short', '["skillFiles","claude","a","project","/kept"'],
  ['a listing key of an unknown scope', JSON.stringify(['skillFiles', 'claude', 'a', 'team', '/kept', null])],
  ['a listing key of a side this build does not know', JSON.stringify(['skillFiles', 'side-from-a-newer-build', 'a', 'plugin', null, '/r'])],
  ['a listing key with an empty name', JSON.stringify(['skillFiles', 'claude', '', 'project', '/kept', null])],
  ['a listing key with a path its scope does not take', JSON.stringify(['skillFiles', 'claude', 'a', 'plugin', '/gone', '/r'])],
  ['a listing key with more than its six parts', JSON.stringify(['skillFiles', 'claude', 'a', 'project', '/kept', null, 'x'])]
]

describe('retireAfterScan', () => {
  it('retires a page or listing whose project, plugin root or global skill the scan no longer lists, and keeps the rest', () => {
    const registry = registered({ owner: 'scan', pluginRoots: ['/r'] },
      { owner: 'project:/kept', projects: ['/kept'], memoryFiles: ['/kept/CLAUDE.md'] },
      { owner: 'project:/gone', projects: ['/gone'], memoryFiles: ['/gone/CLAUDE.md'] },
      { owner: 'project:/stale', projects: ['/stale'], memoryFiles: ['/stale/CLAUDE.md'] },
      listing({ name: 'a', side: 'claude', scope: 'project', projectPath: '/kept' }, '/f/project-kept'),
      listing({ name: 'a', side: 'claude', scope: 'project', projectPath: '/stale' }, '/f/project-stale'),
      listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r' }, '/f/plugin-kept'),
      listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r-never' }, '/f/plugin-never'),
      listing({ name: 'tidy', side: 'codex', scope: 'global' }, '/f/global-kept'),
      listing({ name: 'tidy', side: 'claude', scope: 'global' }, '/f/global-side-gone'),
      listing({ name: 'gone', side: 'codex', scope: 'global' }, '/f/global-gone'))
    retireAfterScan(registry, { projects: [{ path: '/kept', stale: false }, { path: '/stale', stale: true }],
      global: { skills: [{ name: 'tidy', sides: ['codex', 'grok'] }] } })
    expect(stillAdmitted(registry, 'memoryFiles', ['/kept/CLAUDE.md', '/gone/CLAUDE.md', '/stale/CLAUDE.md'])).toEqual(['/kept/CLAUDE.md'])
    expect(stillAdmitted(registry, 'skillFiles', ['/f/project-kept', '/f/project-stale', '/f/plugin-kept', '/f/plugin-never',
      '/f/global-kept', '/f/global-side-gone', '/f/global-gone'])).toEqual(['/f/project-kept', '/f/plugin-kept', '/f/global-kept'])
  })

  // The page this scan retires is the root's only holder in the first two rows; in the others the scan's own registration
  // or a page the scan still lists live holds it too
  it.each([
    ['only the page this scan retires', 'before', [], []],
    ['only the page this scan retires', 'after', [], []],
    ['the scan too', 'before', ['/r'], ['/f/plugin']],
    ['the scan too', 'after', ['/r'], ['/f/plugin']],
    ['a page still listed live too', 'before', [], ['/f/plugin']],
    ['a page still listed live too', 'after', [], ['/f/plugin']]
  ])('judges a plugin listing by whether its root is held once the scan\'s retirements are applied: held by %s, the listing saved %s that page', (holder, order, scanRoots, expected) => {
    const gone: Owned = { owner: 'project:/gone', projects: ['/gone'], pluginRoots: ['/r'] }
    const plugin = listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r' }, '/f/plugin')
    const live: Owned[] = holder === 'a page still listed live too' ? [{ owner: 'project:/kept', projects: ['/kept'], pluginRoots: ['/r'] }] : []
    const registry = registered({ owner: 'scan', pluginRoots: scanRoots }, ...live, ...(order === 'before' ? [plugin, gone] : [gone, plugin]))
    retireAfterScan(registry, { projects: [{ path: '/kept', stale: false }], global: { skills: [] } })
    expect(stillAdmitted(registry, 'skillFiles', ['/f/plugin'])).toEqual(expected)
  })

  // Restored from the last launch with no saved read beside it (its read was dropped on restore); the scan has just
  // replaced its own registration, holding /r, and a page this launch read still holds /r-page
  it.each<[string, Owned, string[]]>([
    ['a page whose project the scan no longer lists', { owner: 'project:/gone', projects: ['/gone'], memoryFiles: ['/gone/CLAUDE.md'], pluginRoots: ['/r-gone'] }, []],
    ['a project listing whose project the scan no longer lists', listing({ name: 'a', side: 'claude', scope: 'project', projectPath: '/gone' }, '/f/a'), []],
    ['a plugin listing whose root no registration holds', listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r-none' }, '/f/a'), []],
    ['a global listing whose skill the scan no longer lists', listing({ name: 'gone', side: 'claude', scope: 'global' }, '/f/a'), []],
    ['a page whose project the scan lists live', { owner: 'project:/kept', projects: ['/kept'], memoryFiles: ['/kept/CLAUDE.md'], pluginRoots: ['/r-kept'] },
      ['memoryFiles /kept/CLAUDE.md', 'projects /kept', 'pluginRoots /r-kept']],
    ['a project listing whose project the scan lists live', listing({ name: 'a', side: 'claude', scope: 'project', projectPath: '/kept' }, '/f/a'), ['skillFiles /f/a']],
    ['a plugin listing whose root the scan holds', listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r' }, '/f/a'), ['skillFiles /f/a']],
    ['a plugin listing whose root a page holds', listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r-page' }, '/f/a'), ['skillFiles /f/a']],
    ['a global listing whose skill the scan lists', listing({ name: 'tidy', side: 'claude', scope: 'global' }, '/f/a'), ['skillFiles /f/a']]
  ])('judges a registration restored without its saved read by the same rules: %s', (_what, saved, expected) => {
    const registry = restored(saved)
    registry.replace(scope({ owner: 'project:/held', projects: ['/held'], pluginRoots: ['/r-page'] }))
    registry.replace(scope({ owner: 'scan', pluginRoots: ['/r'] }))
    retireAfterScan(registry, { projects: [{ path: '/kept', stale: false }, { path: '/held', stale: false }],
      global: { skills: [{ name: 'tidy', sides: ['claude'] }] } })
    expect(admittedOf(registry, saved)).toEqual(expected)
  })

  it.each(unparsed)('retires %s, which the project page\'s pass leaves alone, and still judges the registrations after it', (_what, owner) => {
    const odd: Owned = { owner, skillFiles: ['/f/odd'] }
    const kept: Owned = { owner: 'project:/kept', projects: ['/kept'], memoryFiles: ['/kept/CLAUDE.md'] }
    const registry = restored(odd, kept, listing({ name: 'a', side: 'claude', scope: 'project', projectPath: '/gone' }, '/f/gone'))
    // The page's read replaces its registration, then judges the listings; a looser reading would take the odd owner
    // for a listing of this project, whose page shows no skill, or of a root nothing holds yet
    registry.replace(scope(kept))
    retireAfterDetail(registry, '/kept', { skills: [] })
    expect(stillAdmitted(registry, 'skillFiles', ['/f/odd'])).toEqual(['/f/odd'])
    registry.replace(scope({ owner: 'scan', pluginRoots: ['/r'] }))
    retireAfterScan(registry, { projects: [{ path: '/kept', stale: false }], global: { skills: [] } })
    expect(stillAdmitted(registry, 'skillFiles', ['/f/odd', '/f/gone'])).toEqual([])
    expect(stillAdmitted(registry, 'memoryFiles', ['/kept/CLAUDE.md'])).toEqual(['/kept/CLAUDE.md'])
  })
})

describe('retireAfterDetail', () => {
  it('retires a listing of this project\'s skill the page no longer shows, or from a plugin root no one holds, and keeps the rest', () => {
    const registry = registered({ owner: 'project:/p', projects: ['/p'], pluginRoots: ['/r'] },
      listing({ name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/shown'),
      listing({ name: 'tidy', side: 'codex', scope: 'project', projectPath: '/p' }, '/f/other-side'),
      listing({ name: 'gone', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/gone'),
      listing({ name: 'lib', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/global-level'),
      listing({ name: 'gone', side: 'claude', scope: 'project', projectPath: '/q' }, '/f/other-project'),
      listing({ name: 'tidy', side: 'claude', scope: 'plugin', pluginRoot: '/r' }, '/f/plugin-held'),
      listing({ name: 'tidy', side: 'claude', scope: 'plugin', pluginRoot: '/r-never' }, '/f/plugin-never'),
      listing({ name: 'gone', side: 'claude', scope: 'global' }, '/f/global'))
    retireAfterDetail(registry, '/p', { skills: [{ level: 'project', name: 'tidy', side: 'claude' }, { level: 'global', name: 'lib', side: 'claude' }] })
    expect(stillAdmitted(registry, 'skillFiles', ['/f/shown', '/f/other-side', '/f/gone', '/f/global-level', '/f/other-project',
      '/f/plugin-held', '/f/plugin-never', '/f/global'])).toEqual(['/f/shown', '/f/other-project', '/f/plugin-held', '/f/global'])
  })

  // Restored from the last launch with no saved read beside it; the page's read has just replaced its registration
  it.each<[string, Owned, string[]]>([
    ['a listing of this project\'s skill the page no longer shows', listing({ name: 'gone', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/a'), []],
    ['a plugin listing whose root no registration holds', listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r-none' }, '/f/a'), []],
    ['a listing of this project\'s skill the page shows', listing({ name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/a'), ['skillFiles /f/a']],
    ['a plugin listing whose root the page holds', listing({ name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r' }, '/f/a'), ['skillFiles /f/a']]
  ])('judges a registration restored without its saved read by the same rules: %s', (_what, saved, expected) => {
    const registry = restored(saved)
    registry.replace(scope({ owner: 'project:/p', projects: ['/p'], pluginRoots: ['/r'] }))
    retireAfterDetail(registry, '/p', { skills: [{ level: 'project', name: 'tidy', side: 'claude' }] })
    expect(admittedOf(registry, saved)).toEqual(expected)
  })
})
