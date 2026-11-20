import { savedReadKey, type ReadRegistrations, type RegistrationScope, type SavedRead } from '@shared/display-data'
import type { GlobalSkill, ProjectEntry, ProjectSkillEntry } from '@shared/domain'

/** Each scan/detail/package enumeration owns its exact paths. Replacing one owner cannot either
 * retain that owner's obsolete permission or revoke another owner's current permission. */
export class ReadRegistry {
  private scopes = new Map<string, { scope: RegistrationScope; restored: boolean }>()
  constructor(scopes: RegistrationScope[] = []) {
    for (const scope of scopes) this.scopes.set(scope.owner, { scope, restored: true })
  }
  admission(kind: keyof ReadRegistrations, path: string): 'restored' | 'live' | null {
    let restored = false
    for (const entry of this.scopes.values()) if (entry.scope[kind].includes(path)) {
      if (!entry.restored) return 'live'
      restored = true
    }
    return restored ? 'restored' : null
  }
  replace(scope: RegistrationScope): void { this.scopes.set(scope.owner, { scope, restored: false }) }
  remove(owner: string): void { this.scopes.delete(owner) }
  snapshot(): RegistrationScope[] { return [...this.scopes.values()].map(e => e.scope) }
}

/** The saved reads retiring looks at: a project page by its path, a package listing by its arguments */
export type Retiring =
  | { kind: 'projectDetail'; path: string }
  | Extract<SavedRead, { kind: 'skillFiles' }>
  | { kind: Exclude<SavedRead['kind'], 'projectDetail' | 'skillFiles'> }

/** After a scan has replaced its own registration: a project page's registration goes with a project the scan no
 * longer lists live, and a package listing's with a project, plugin root or global skill gone. In the reads' order, so
 * a plugin root that only a retired page registered retires the listings from it in the same pass */
export function retireAfterScan(registry: ReadRegistry, reads: Iterable<Retiring>,
  snap: { projects: readonly Pick<ProjectEntry, 'path' | 'stale'>[]; global: { skills: readonly Pick<GlobalSkill, 'name' | 'sides'>[] } }): void {
  for (const r of reads) {
    if (r.kind === 'projectDetail' && !snap.projects.some(p => p.path === r.path && !p.stale)) registry.remove(`project:${r.path}`)
    if (r.kind === 'skillFiles' && ((r.args.scope === 'project' && !snap.projects.some(p => p.path === r.args.projectPath && !p.stale)) ||
      (r.args.scope === 'plugin' && !registry.admission('pluginRoots', r.args.pluginRoot ?? '')) ||
      (r.args.scope === 'global' && !snap.global.skills.some(skill => skill.name === r.args.name && skill.sides.includes(r.args.side))))) registry.remove(savedReadKey(r))
  }
}

/** After a project page has replaced its registration: a listing of that project's skill the page no longer shows, and
 * one from a plugin root no registration holds any more */
export function retireAfterDetail(registry: ReadRegistry, reads: Iterable<Retiring>, path: string,
  detail: { skills: readonly Pick<ProjectSkillEntry, 'level' | 'name' | 'side'>[] }): void {
  for (const r of reads) if (r.kind === 'skillFiles' && ((r.args.scope === 'project' && r.args.projectPath === path &&
    !detail.skills.some(skill => skill.level === 'project' && skill.name === r.args.name && skill.side === r.args.side)) ||
    (r.args.scope === 'plugin' && !registry.admission('pluginRoots', r.args.pluginRoot ?? '')))) registry.remove(savedReadKey(r))
}
