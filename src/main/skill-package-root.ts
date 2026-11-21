// Where a skill package may be listed from: the decision layer of the skill package guard (docs/ops/electron-security.md
// item 26). It is pure: what it needs to know about the disk arrives as the probes below, which are its only route to
// the disk, and the handler passes the real ones (providers/skill-package.ts, resolveSkillRoot and its neighbours). The
// boundary is skills-view C9 (the container check applies to the entry point before resolution) and plugins-view H8 (a
// plugin skill is skills/<name> under a registered package root, whose registration admitSkillPackage judges); A6
// leaves where an entry leads unconstrained. The walk that lists a package's files stays in providers/skill-package.ts:
// its refusals end a link cycle (skills-view::REQ-003/AC-05) and confine nothing.
import { basename, dirname, join } from 'node:path'
import { PROJECT_SKILLS_DIR, type AgentSide } from '@shared/domain'
import { globalSkillsRoots, type ScanRoots } from './providers/types'

export type SkillPackageScope = 'global' | 'project'

export interface ResolveSkillRootArgs {
  side: AgentSide
  name: string
  scope: SkillPackageScope
  projectPath?: string
  roots: ScanRoots
}

/** What the decision asks the disk. A probe that cannot tell answers the refusing way: false, or null */
export interface SkillRootProbes {
  /** Whether a path leads to something, a link followed: a dangling link leads nowhere */
  exists: (path: string) => boolean
  /** Whether an entry is there itself, a link not followed: a dangling link is there */
  entryThere: (path: string) => boolean
  /** Where a path really leads, every link resolved; null when that cannot be told */
  realPath: (path: string) => string | null
}

/**
 * Where a side's global library keeps a skill: the first of that side's directories holding it as a skill (a SKILL.md
 * inside) — the copy the list shows and the side itself uses (skills-view::REQ-001/AC-01) — else the first holding the
 * entry at all, so a package broken after the scan still opens and reports its missing SKILL.md (C5). null when none
 * does. The name is the caller's to validate.
 */
export function firstGlobalSkillEntry(
  roots: ScanRoots,
  side: AgentSide,
  name: string,
  probes: SkillRootProbes
): string | null {
  const entries = globalSkillsRoots(roots)[side].map((dir) => join(dir, name))
  return entries.find((e) => probes.exists(join(e, 'SKILL.md'))) ?? entries.find((e) => probes.exists(e)) ?? null
}

/** A skill package's root for the skills view: its entry in a library or a project's skills directory, admitted by the
 * container check and then followed to where it really leads (C9, A6); null when refused */
export function skillPackageRoot(args: ResolveSkillRootArgs, probes: SkillRootProbes): string | null {
  const { side, name, scope, projectPath, roots } = args
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null
  if (name.includes(':')) return null // A plugin namespace; not previewable in v1
  let root: string
  if (scope === 'global') {
    const entry = firstGlobalSkillEntry(roots, side, name, probes)
    if (entry === null) return null
    root = entry
  } else {
    if (typeof projectPath !== 'string' || !projectPath) return null
    root = join(projectPath, PROJECT_SKILLS_DIR[side], name)
  }
  if (!probes.exists(root)) return null
  // The container check applies to **the entry point before resolution** (C9); symlinks are only
  // followed afterwards
  if (!inKnownSkillsDir(root, roots, projectPath, probes)) return null
  // Follow the symlink to the real directory
  return probes.realPath(root)
}

/**
 * A plugin skill's package root (plugins-view H8): the entry point = skills/<name> under the plugin's package root.
 * Whether the package root is in the scan's registration set is validated at the handler layer (fail-closed); this only
 * handles name sanitising, existence and symlink following (the same discipline as skillPackageRoot).
 */
export function pluginSkillPackageRoot(pluginRoot: string, name: string, probes: SkillRootProbes): string | null {
  // "." would name the package's whole skills directory, not one skill in it
  if (!name || name === '.' || name.includes('..') || name.includes('/') || name.includes('\\') || name.includes(':'))
    return null
  const entry = join(pluginRoot, 'skills', name)
  if (!probes.exists(entry)) return null
  return probes.realPath(entry)
}

/**
 * The container check applies to **the entry point before resolution**: the entry point must be a
 * single-segment entry under a known skills root.
 * The entry point may be a symlink and its target is unconstrained (A6) — it is only followed during
 * enumeration and reading.
 * The judgement uses realpath(dirname(entry)) and **does not resolve the last segment**: resolving the
 * whole path first turns the parent directory
 * into the symlink target's parent, so a symlink-installed skill whose target is outside the root would
 * be wrongly refused (a 2026-08-07 bug).
 */
export function inKnownSkillsDir(
  entryAbs: string,
  roots: ScanRoots,
  projectPath: string | undefined,
  probes: SkillRootProbes
): boolean {
  if (!probes.entryThere(entryAbs)) return false
  const name = basename(entryAbs)
  if (!name || name === '.' || name === '..') return false
  const realParent = probes.realPath(dirname(entryAbs))
  if (realParent === null) return false
  const allowed: string[] = Object.values(globalSkillsRoots(roots)).flat()
  if (projectPath) {
    for (const sub of Object.values(PROJECT_SKILLS_DIR)) allowed.push(join(projectPath, sub))
  }
  for (const base of allowed) {
    if (!probes.exists(base)) continue
    if (probes.realPath(base) === realParent) return true
  }
  return false
}
