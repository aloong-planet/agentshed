import { describe, expect, it } from 'vitest'
import { savedReadKey, type ReadRegistrations, type RegistrationScope } from '@shared/display-data'
import type { ListSkillFilesArgs } from '@shared/ipc'
import { ReadRegistry, retireAfterDetail, retireAfterScan, type Retiring } from './read-registrations'

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

/** A registry whose owners are as this launch registered them */
function registered(...scopes: (Partial<RegistrationScope> & { owner: string })[]): ReadRegistry {
  const registry = new ReadRegistry()
  for (const s of scopes) registry.replace({ memoryFiles: [], skillFiles: [], projects: [], pluginRoots: [], ...s })
  return registry
}
/** A package listing, registered under its own key with one file, as listSkillFiles registers it */
function listing(registry: ReadRegistry, args: ListSkillFilesArgs, file: string): Retiring {
  const read = { kind: 'skillFiles' as const, args, data: { files: [] } }
  registry.replace({ owner: savedReadKey(read), skillFiles: [file], memoryFiles: [], projects: [], pluginRoots: [] })
  return read
}
const stillAdmitted = (registry: ReadRegistry, kind: keyof ReadRegistrations, paths: string[]): string[] =>
  paths.filter(p => registry.admission(kind, p) !== null)

describe('retireAfterScan', () => {
  it('retires a page or listing whose project, plugin root or global skill the scan no longer lists, and keeps the rest', () => {
    const registry = registered({ owner: 'scan', pluginRoots: ['/r'] },
      { owner: 'project:/kept', projects: ['/kept'], memoryFiles: ['/kept/CLAUDE.md'] },
      { owner: 'project:/gone', projects: ['/gone'], memoryFiles: ['/gone/CLAUDE.md'], pluginRoots: ['/r-of-gone'] },
      { owner: 'project:/stale', projects: ['/stale'], memoryFiles: ['/stale/CLAUDE.md'] })
    const reads: Retiring[] = [
      { kind: 'projectDetail', path: '/kept' }, { kind: 'projectDetail', path: '/gone' }, { kind: 'projectDetail', path: '/stale' },
      { kind: 'sessionPage' },
      listing(registry, { name: 'a', side: 'claude', scope: 'project', projectPath: '/kept' }, '/f/project-kept'),
      listing(registry, { name: 'a', side: 'claude', scope: 'project', projectPath: '/stale' }, '/f/project-stale'),
      listing(registry, { name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r' }, '/f/plugin-kept'),
      // Only the page retired above registered this root, so its listing goes in the same pass
      listing(registry, { name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r-of-gone' }, '/f/plugin-of-gone-page'),
      listing(registry, { name: 'a', side: 'claude', scope: 'plugin', pluginRoot: '/r-never' }, '/f/plugin-never'),
      listing(registry, { name: 'tidy', side: 'codex', scope: 'global' }, '/f/global-kept'),
      listing(registry, { name: 'tidy', side: 'claude', scope: 'global' }, '/f/global-side-gone'),
      listing(registry, { name: 'gone', side: 'codex', scope: 'global' }, '/f/global-gone')
    ]
    retireAfterScan(registry, reads, { projects: [{ path: '/kept', stale: false }, { path: '/stale', stale: true }],
      global: { skills: [{ name: 'tidy', sides: ['codex', 'grok'] }] } })
    expect(stillAdmitted(registry, 'memoryFiles', ['/kept/CLAUDE.md', '/gone/CLAUDE.md', '/stale/CLAUDE.md'])).toEqual(['/kept/CLAUDE.md'])
    expect(stillAdmitted(registry, 'skillFiles', ['/f/project-kept', '/f/project-stale', '/f/plugin-kept', '/f/plugin-of-gone-page',
      '/f/plugin-never', '/f/global-kept', '/f/global-side-gone', '/f/global-gone'])).toEqual(['/f/project-kept', '/f/plugin-kept', '/f/global-kept'])
  })
})

describe('retireAfterDetail', () => {
  it('retires a listing of this project\'s skill the page no longer shows, or from a plugin root no one holds, and keeps the rest', () => {
    const registry = registered({ owner: 'project:/p', projects: ['/p'], pluginRoots: ['/r'] })
    const reads: Retiring[] = [
      { kind: 'projectDetail', path: '/p' },
      listing(registry, { name: 'tidy', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/shown'),
      listing(registry, { name: 'tidy', side: 'codex', scope: 'project', projectPath: '/p' }, '/f/other-side'),
      listing(registry, { name: 'gone', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/gone'),
      listing(registry, { name: 'lib', side: 'claude', scope: 'project', projectPath: '/p' }, '/f/global-level'),
      listing(registry, { name: 'gone', side: 'claude', scope: 'project', projectPath: '/q' }, '/f/other-project'),
      listing(registry, { name: 'tidy', side: 'claude', scope: 'plugin', pluginRoot: '/r' }, '/f/plugin-held'),
      listing(registry, { name: 'tidy', side: 'claude', scope: 'plugin', pluginRoot: '/r-never' }, '/f/plugin-never'),
      listing(registry, { name: 'gone', side: 'claude', scope: 'global' }, '/f/global')
    ]
    retireAfterDetail(registry, reads, '/p', { skills: [{ level: 'project', name: 'tidy', side: 'claude' }, { level: 'global', name: 'lib', side: 'claude' }] })
    expect(stillAdmitted(registry, 'skillFiles', ['/f/shown', '/f/other-side', '/f/gone', '/f/global-level', '/f/other-project',
      '/f/plugin-held', '/f/plugin-never', '/f/global'])).toEqual(['/f/shown', '/f/other-project', '/f/plugin-held', '/f/global'])
  })
})
