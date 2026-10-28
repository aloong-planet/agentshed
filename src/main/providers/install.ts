// Skill install and uninstall (ticket 06): installing = a dereferencing deep copy from the global library
// into the project-level directory (landing in a temporary directory first, then renaming,
// cleaning up on failure so nothing half-finished is left); uninstalling = deleting the project's copy.
// The global library is read-only and is never written.
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECT_SKILLS_DIR, type AgentSide } from '@shared/domain'
import { skillLandings } from '@shared/skill-landing'
import type { ScanRoots } from './types'
import { globalSkillEntry } from './skill-package'
import { ERR, type ErrorCode, type ErrorParams } from '@shared/errors'

export interface InstallArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export type OpResult =
  | { ok: true }
  // A failure carries only **a code plus parameters**, never a whole-sentence message: the renderer
  // produces the wording in the current language (ADR-0015).
  // `reason` was already a language-independent enum; this change removed the Chinese message alongside it.
  | { ok: false; reason: ErrorCode; params?: ErrorParams }

/** A skill name may only be a single-segment directory name (closing path traversal) */
function badName(name: string): boolean {
  return name === '' || name.includes('/') || name.includes('\\') || name.includes('..')
}

function projectSkillsDir(side: AgentSide, projectPath: string): string {
  return join(projectPath, PROJECT_SKILLS_DIR[side])
}

export function installSkill(roots: ScanRoots, args: InstallArgs): OpResult {
  const { skillName, side, targetProjectPath } = args
  if (badName(skillName)) return { ok: false, reason: ERR.skillBadName }
  if (!existsSync(targetProjectPath))
    return { ok: false, reason: ERR.skillStaleTarget }
  // The copy the side uses, which is the one its list shows (skill-install::REQ-001/AC-05)
  const source = globalSkillEntry(roots, side, skillName)
  if (source === null || !existsSync(join(source, 'SKILL.md')))
    return { ok: false, reason: ERR.skillMissingSource, params: { name: skillName } }
  const targetBase = projectSkillsDir(side, targetProjectPath)
  const target = join(targetBase, skillName)
  if (existsSync(target))
    return { ok: false, reason: ERR.skillConflict }

  const tmp = join(targetBase, `.${skillName}.installing-${process.pid}`)
  try {
    mkdirSync(targetBase, { recursive: true })
    // dereference: a symlinked source lands as a real file (so the project is self-contained and does not
    // depend on the global library continuing to exist)
    cpSync(source, tmp, { recursive: true, dereference: true })
    renameSync(tmp, target)
    return { ok: true }
  } catch (err) {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      // A cleanup failure does not cascade
    }
    return { ok: false, reason: ERR.skillCopyFailed, params: { detail: String(err) } }
  }
}

export interface InstallToProjectArgs {
  skillName: string
  /** The install's sides: the skill's sides that the project is registered on (A8) */
  sides: AgentSide[]
  targetProjectPath: string
}

/** One landing's outcome: the directory, every side that loads it, and the result */
export interface LandingResult {
  dir: string
  loaders: AgentSide[]
  result: OpResult
}

/**
 * Install for several sides at once: one landing per directory, each reporting its own result (A9) — the shared skills
 * directory once, with one same-name check and one result, never a Codex landing and an Antigravity landing that
 * collide (skill-install::REQ-001/AC-01, AC-03, AC-04). A landing's source is the global library of its first side in
 * side order: Codex's copy when Codex and Antigravity both qualify, Antigravity's — the one agy uses — when it alone
 * does (AC-05).
 */
export function installSkillToProject(roots: ScanRoots, args: InstallToProjectArgs): LandingResult[] {
  return skillLandings(args.sides).map((l) => ({
    dir: l.dir,
    loaders: l.loaders,
    result: installSkill(roots, { skillName: args.skillName, side: l.sides[0], targetProjectPath: args.targetProjectPath })
  }))
}

/**
 * Which project skills directories of which projects already hold an entry of this name — the same test as the
 * same-name block (A4), so the picker's "Same name installed" tag and the refusal at install time agree
 * (skill-install::REQ-003/AC-02). A name that is not a single segment holds nowhere and gets an empty answer.
 */
export function skillHoldings(projectPaths: string[], skillName: string): Record<string, string[]> {
  if (badName(skillName)) return {}
  const dirs = [...new Set(Object.values(PROJECT_SKILLS_DIR))]
  return Object.fromEntries(projectPaths.map((p) => [p, dirs.filter((d) => existsSync(join(p, d, skillName)))]))
}

export interface UninstallArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export function uninstallSkill(args: UninstallArgs): OpResult {
  const { skillName, side, targetProjectPath } = args
  if (badName(skillName)) return { ok: false, reason: ERR.skillBadName }
  const target = join(projectSkillsDir(side, targetProjectPath), skillName)
  if (!existsSync(target))
    return { ok: false, reason: ERR.skillCopyMissing }
  try {
    rmSync(target, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: ERR.skillDeleteFailed, params: { detail: String(err) } }
  }
}
