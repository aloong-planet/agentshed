// Skill install and uninstall (ticket 06): installing = a dereferencing deep copy from the global library
// into the project-level directory (landing in a temporary directory first, then renaming,
// cleaning up on failure so nothing half-finished is left); uninstalling = deleting the project's copy.
// The global library is read-only and is never written.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, type BigIntStats } from 'node:fs'
import { dirname, join } from 'node:path'
import { PROJECT_SKILLS_DIR, type AgentSide } from '@shared/domain'
import { skillLandings } from '@shared/skill-landing'
import type { ScanRoots } from './types'
import { globalSkillEntry } from './skill-package'
import { isAbsent } from './read-utils'
import { compareNames } from './scan-order'
import { ERR, type ErrorCode, type ErrorParams } from '@shared/errors'

export interface InstallArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export type OpResult =
  | { ok: true }
  // A failure carries only **a code plus parameters**, never a whole-sentence message: the renderer
  // produces the wording in the current language (ADR-0001).
  // `reason` was already a language-independent enum; this change removed the Chinese message alongside it.
  | { ok: false; reason: ErrorCode; params?: ErrorParams }

/** A skill name may only be a single-segment directory name (closing path traversal) */
function badName(name: string): boolean {
  return name === '' || name.includes('/') || name.includes('\\') || name.includes('..')
}

function projectSkillsDir(side: AgentSide, projectPath: string): string {
  return join(projectPath, PROJECT_SKILLS_DIR[side])
}

/** A symlink in the skill that fails the install, and its path inside the skill (skill-install::REQ-004/AC-02, AC-03) */
interface LinkProblem {
  reason: typeof ERR.skillLinkLeadsNowhere | typeof ERR.skillLinkLeadsBack
  link: string
}

/**
 * Copy a skill to `to`, every symlink in it at any depth landing as what it points to, so the project's copy holds no
 * link and is self-contained (skill-install::REQ-004/AC-01). Not `cpSync`: under Electron 43's Node its `dereference`
 * follows only the top-level link and keeps every link below it as a link. It stops at a link that fails the install,
 * answering it; whatever cannot be read throws (A10), as does a project inside the skill's own directory.
 */
function copySkill(source: string, to: string): LinkProblem | null {
  const root = realpathSync(source)
  // A directory by its device and inode, not its path: one directory can be spelled several ways that a real path does
  // not reduce to one, in letter case on a volume that ignores it or through a firmlink such as /System/Volumes/Data,
  // and a link back by another spelling would be entered and copied again (AC-03, "by whatever route")
  const idOf = (st: BigIntStats): string => `${st.dev}:${st.ino}`
  const dirsUpFrom = (path: string): string[] => {
    const ids: string[] = []
    for (let d = path; ; d = dirname(d)) {
      ids.push(idOf(statSync(d, { bigint: true })))
      if (dirname(d) === d) return ids
    }
  }
  const rootId = idOf(statSync(root, { bigint: true }))
  // The project's skills directory and those holding it. A project inside the skill's own directory would have the
  // walk reach the copy it is writing with no link to name: it fails before the copy starts (A10)
  const landing = dirsUpFrom(dirname(to))
  if (landing.includes(rootId)) throw new Error(`the project is inside the skill's directory, ${root}`)
  mkdirSync(to)
  // Where a directory link leads back into the skill (AC-03): the skill's real directory and its library entry's
  // directory (the entry can be a link) and the directories holding them, and the copy being written and those holding
  // it, and the directories the walk is inside. Entering one would copy the skill into itself without end
  const back = new Set([...dirsUpFrom(root), ...dirsUpFrom(dirname(source)), idOf(statSync(to, { bigint: true })), ...landing])
  const inside = new Set<string>()
  function walk(dir: string, dirId: string, into: string, rel: string): LinkProblem | null {
    inside.add(dirId)
    // In byte order, whatever order the directory lists in: the first link that fails is the one met first in path
    // order, segment by segment (REQ-004's failure modes)
    for (const name of readdirSync(dir).sort(compareNames)) {
      const abs = join(dir, name)
      const path = rel === '' ? name : `${rel}/${name}`
      const entry = lstatSync(abs, { bigint: true })
      let st = entry
      if (entry.isSymbolicLink()) {
        try {
          st = statSync(abs, { bigint: true })
        } catch (err) {
          // What it points to is gone, runs through a file, or is a chain of links that never reaches a file or a
          // directory. One it may not look at is not gone: the copy fails on it (A10)
          if (isAbsent(abs) || (err as NodeJS.ErrnoException).code === 'ELOOP')
            return { reason: ERR.skillLinkLeadsNowhere, link: path }
          throw err
        }
      }
      if (st.isDirectory()) {
        const childId = idOf(st)
        if (inside.has(childId) || back.has(childId)) return { reason: ERR.skillLinkLeadsBack, link: path }
        mkdirSync(join(into, name))
        const problem = walk(abs, childId, join(into, name), path)
        if (problem !== null) return problem
      } else if (st.isFile()) copyFileSync(abs, join(into, name))
      // A pipe, a socket or a device, behind a link or not: reading a pipe would block the main process. Skipped and
      // logged (REQ-004's failure modes)
      else console.warn('[skill-install] skipped, neither a file nor a directory:', path)
    }
    inside.delete(dirId)
    return null
  }
  return walk(source, rootId, to, '')
}

/** Remove a temporary copy; a cleanup failure does not cascade */
function discard(tmp: string): void {
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {
    // A cleanup failure does not cascade
  }
}

export function installSkill(roots: ScanRoots, args: InstallArgs): OpResult {
  const { skillName, side, targetProjectPath } = args
  if (badName(skillName)) return { ok: false, reason: ERR.skillBadName }
  // A target that cannot be reached is not stale: the copy below fails on it, with the failed-copy notice (A10)
  if (isAbsent(targetProjectPath))
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
    const problem = copySkill(source, tmp)
    if (problem !== null) {
      discard(tmp)
      return { ok: false, reason: problem.reason, params: { link: problem.link } }
    }
    renameSync(tmp, target)
    return { ok: true }
  } catch (err) {
    discard(tmp)
    // The notice names no cause, so the system's own words go to the log
    console.error('[skill-install] copy failed:', err)
    return { ok: false, reason: ERR.skillCopyFailed }
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
    console.error('[skill-install] delete failed:', err)
    return { ok: false, reason: ERR.skillDeleteFailed, params: { path: target } }
  }
}
