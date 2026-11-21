import type { ReadRegistrations, RegistrationScope } from '@shared/display-data'
import type { AgentSide, GlobalSkill, ProjectEntry, ProjectSkillEntry } from '@shared/domain'
import { AGENT_SIDES } from '@shared/validate'

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

/** A package listing's arguments, as its owner, the listing's saved-read key, carries them: one path, the one its scope
 * takes */
type Listing = { side: AgentSide; name: string } & ({ scope: 'global' } | { scope: 'project'; projectPath: string } | { scope: 'plugin'; pluginRoot: string })

/** What a registration's owner names: the scan, a project page by its path, a package listing by its arguments, or
 * nothing this build reads (an owner of another form, or a key that is not exactly one listing's as `savedReadKey`
 * writes it, a side this build knows included) */
function ownerOf(owner: string): { kind: 'scan' } | { kind: 'page'; path: string } | { kind: 'listing'; args: Listing } | { kind: 'unknown' } {
  if (owner === 'scan') return { kind: 'scan' }
  if (owner.startsWith('project:')) return { kind: 'page', path: owner.slice('project:'.length) }
  let key: unknown
  try { key = JSON.parse(owner) } catch { return { kind: 'unknown' } }
  if (!Array.isArray(key) || key.length !== 6) return { kind: 'unknown' }
  const [kind, side, name, scope, projectPath, pluginRoot] = key as unknown[]
  const path = (v: unknown): v is string => typeof v === 'string' && v.length > 0
  if (kind !== 'skillFiles' || typeof side !== 'string' || !AGENT_SIDES.has(side) || !path(name)) return { kind: 'unknown' }
  const named = { side: side as AgentSide, name }
  if (scope === 'global' && projectPath === null && pluginRoot === null) return { kind: 'listing', args: { ...named, scope } }
  if (scope === 'project' && path(projectPath) && pluginRoot === null) return { kind: 'listing', args: { ...named, scope, projectPath } }
  if (scope === 'plugin' && projectPath === null && path(pluginRoot)) return { kind: 'listing', args: { ...named, scope, pluginRoot } }
  return { kind: 'unknown' }
}

/** After a scan has replaced its own registration, each other registration is judged by its owner, whether or not its
 * saved read restored beside it: a project page's goes with a project the scan no longer lists live, a package
 * listing's with a project, plugin root or global skill gone, and one whose owner this build does not read goes too,
 * since nothing in this build will register it again (agents-overview::CON-002/AC-03). Plugin listings are judged last,
 * once the pages this scan retires are gone: only the scan and the pages hold plugin roots, a listing never does, so
 * the order the registrations were made in does not matter */
export function retireAfterScan(registry: ReadRegistry,
  snap: { projects: readonly Pick<ProjectEntry, 'path' | 'stale'>[]; global: { skills: readonly Pick<GlobalSkill, 'name' | 'sides'>[] } }): void {
  const listedLive = (path: string): boolean => snap.projects.some(p => p.path === path && !p.stale)
  const plugins: [owner: string, root: string][] = []
  for (const { owner } of registry.snapshot()) {
    const o = ownerOf(owner)
    if (o.kind === 'scan') continue
    if (o.kind === 'listing' && o.args.scope === 'plugin') plugins.push([owner, o.args.pluginRoot])
    else if (o.kind === 'unknown' || (o.kind === 'page' && !listedLive(o.path)) ||
      (o.kind === 'listing' && o.args.scope === 'project' && !listedLive(o.args.projectPath)) ||
      (o.kind === 'listing' && o.args.scope === 'global' && !snap.global.skills.some(skill => skill.name === o.args.name && skill.sides.includes(o.args.side)))) registry.remove(owner)
  }
  for (const [owner, root] of plugins) if (!registry.admission('pluginRoots', root)) registry.remove(owner)
}

/** After a project page has replaced its registration, each listing is judged by its owner, whether or not its saved
 * read restored beside it: a listing of that project's skill the page no longer shows goes, and one from a plugin root
 * no registration holds any more. An owner this build does not read is the scan's to judge */
export function retireAfterDetail(registry: ReadRegistry, path: string,
  detail: { skills: readonly Pick<ProjectSkillEntry, 'level' | 'name' | 'side'>[] }): void {
  for (const { owner } of registry.snapshot()) {
    const o = ownerOf(owner)
    if (o.kind === 'listing' && ((o.args.scope === 'project' && o.args.projectPath === path &&
      !detail.skills.some(skill => skill.level === 'project' && skill.name === o.args.name && skill.side === o.args.side)) ||
      (o.args.scope === 'plugin' && !registry.admission('pluginRoots', o.args.pluginRoot)))) registry.remove(owner)
  }
}
