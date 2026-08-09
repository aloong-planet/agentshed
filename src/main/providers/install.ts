// Skill install and uninstall (ticket 06): installing = a dereferencing deep copy from the global library
// into the project-level directory (landing in a temporary directory first, then renaming,
// cleaning up on failure so nothing half-finished is left); uninstalling = deleting the project's copy.
// The global library is read-only and is never written.
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSide } from '@shared/domain'
import type { ScanRoots } from './types'
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
  return side === 'claude' ? join(projectPath, '.claude', 'skills') : join(projectPath, '.agents', 'skills')
}

function globalSkillDir(roots: ScanRoots, side: AgentSide, name: string): string {
  return side === 'claude' ? join(roots.claudeHome, 'skills', name) : join(roots.agentsSkillsDir, name)
}

export function installSkill(roots: ScanRoots, args: InstallArgs): OpResult {
  const { skillName, side, targetProjectPath } = args
  if (badName(skillName)) return { ok: false, reason: ERR.skillBadName }
  if (!existsSync(targetProjectPath))
    return { ok: false, reason: ERR.skillStaleTarget }
  const source = globalSkillDir(roots, side, skillName)
  if (!existsSync(join(source, 'SKILL.md')))
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
