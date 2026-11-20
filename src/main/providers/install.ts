// Skill install and uninstall (ticket 06): installing = a dereferencing deep copy from the global library
// into the project-level directory (landing in a temporary directory first, then renaming,
// cleaning up on failure so nothing half-finished is left); uninstalling = deleting the project's copy.
// The global library is read-only and is never written.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, type BigIntStats } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { PROJECT_SKILLS_DIR, type AgentSide, type ProjectEntry } from '@shared/domain'
import { skillLandings } from '@shared/skill-landing'
import { globalSkillsRoots, type ScanRoots } from './types'
import { globalSkillEntry } from './skill-package'
import { isAbsent } from './read-utils'
import { compareNames } from './scan-order'
import { ERR, type ErrorCode, type ErrorParams } from '@shared/errors'
import { skillOpLibrary, skillOpTarget, type DirPlace } from '../security'

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

/** A skill name may only be a single-segment directory name (closing path traversal). "." is not one: joined to a
 * directory it names that directory, the global library as a source and the project's skills directory as a copy */
function badName(name: string): boolean {
  return name === '' || name === '.' || name.includes('/') || name.includes('\\') || name.includes('..')
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
 * A directory by its device and inode, not its path: one directory can be spelled several ways that a real path does
 * not reduce to one, in letter case on a volume that ignores it or through a firmlink such as /System/Volumes/Data, and
 * a link back by another spelling would be entered and copied again (AC-03, "by whatever route"). The skills view's
 * package walk tells directories apart the same way (skill-package.ts, walkFiles), there to skip and here to fail.
 */
function idOf(st: BigIntStats): string {
  return `${st.dev}:${st.ino}`
}

/** A directory and every directory holding it, along its path as written and along where that path really leads: a
 * link on the way, the project's `.claude` or the library's own directory, leads somewhere else */
function dirsHolding(path: string): string[] {
  const ids: string[] = []
  for (const start of [path, realpathSync(path)]) {
    for (let d = start; ; d = dirname(d)) {
      ids.push(idOf(statSync(d, { bigint: true })))
      if (dirname(d) === d) break
    }
  }
  return ids
}

/** Where a directory is (security.ts, DirPlace), links followed: the nearest directory along the path that is there —
 * the one the install would create the rest of the path in — and the segments below it. null when the path cannot be
 * looked at */
export function dirPlace(path: string): DirPlace | null {
  const rest: string[] = []
  let there = path
  try {
    while (isAbsent(there)) {
      if (dirname(there) === there) return null
      rest.unshift(basename(there))
      there = dirname(there)
    }
    return { at: idOf(statSync(there, { bigint: true })), holders: dirsHolding(there), rest }
  } catch {
    return null
  }
}

/** Where an entry is (security.ts, DirPlace), the entry itself not followed: a link is the link, which is what an
 * uninstall deletes and what an install finds taken. null when the path cannot be looked at */
export function entryPlace(path: string): DirPlace | null {
  const holding = dirPlace(dirname(path))
  if (holding === null) return null
  try {
    const at = idOf(lstatSync(path, { bigint: true }))
    return { at, holders: [at, ...holding.holders], rest: [] }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? { ...holding, rest: [...holding.rest, basename(path)] } : null
  }
}

/**
 * Copy a skill to `to`, every symlink in it at any depth landing as what it points to, so the project's copy holds no
 * link and is self-contained (skill-install::REQ-004/AC-01). Not `cpSync`: under Electron 43's Node its `dereference`
 * follows only the top-level link and keeps every link below it as a link. It stops at a link that fails the install,
 * answering it; whatever cannot be read throws (A10).
 */
function copySkill(source: string, to: string): LinkProblem | null {
  const root = realpathSync(source)
  const rootId = idOf(statSync(root, { bigint: true }))
  mkdirSync(to)
  // Where a directory link leads back into the skill (AC-03): the skill's real directory and its library entry's
  // directory (the entry can be a link) and the directories holding them, and the copy being written and those holding
  // it, and the directories the walk is inside. Entering one would copy the skill into itself without end
  const back = new Set([...dirsHolding(root), ...dirsHolding(dirname(source)), idOf(statSync(to, { bigint: true })), ...dirsHolding(dirname(to))])
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
    // A project inside the skill's own directory, by whatever route: creating its skills directory would write into the
    // global library, and the walk would reach the copy it is writing with no link to name. It fails before anything is
    // written (A10), judged from the nearest part of the skills directory's path already there
    let there = targetBase
    while (isAbsent(there)) there = dirname(there)
    if (dirsHolding(there).includes(idOf(statSync(source, { bigint: true }))))
      throw new Error(`the project is inside the skill's directory, ${realpathSync(source)}`)
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

/** Every global library, each once */
function globalLibraries(roots: ScanRoots): string[] {
  return [...new Set(Object.values(globalSkillsRoots(roots)).flat())]
}

/** Whether an operation on these project skills directories of a project, and on its copies of this name there, would
 * change a global library (skill-install R4). Without a name, or with one that is not a single segment, only the
 * directories are judged: such a name has no copy, and the operation refuses it */
function libraryCheck(roots: ScanRoots, project: string, dirs: readonly string[], name?: string): ReturnType<typeof skillOpLibrary> {
  const landings = dirs.map((d) => join(project, d))
  const copies = name === undefined || badName(name) ? [] : landings.map((l) => join(l, name))
  return skillOpLibrary({ landings, copies, libraries: globalLibraries(roots) }, { dir: dirPlace, entry: entryPlace })
}

/** A project's skills directories that are a global library or lie inside one (skill-install R4), relative to the
 * project: the picker disables a target with a landing among them, and project detail offers no Uninstall in them */
export function libraryDirs(roots: ScanRoots, project: string): string[] {
  return [...new Set(Object.values(PROJECT_SKILLS_DIR))].filter((d) => !libraryCheck(roots, project, [d]).ok)
}

/**
 * The install the app calls: into one of the projects the app lists, judged by skillOpTarget (skill-install R3), and
 * never into a global library, judged by skillOpLibrary (R4), both before anything is written; a refusal is reported
 * at every landing, as a target found gone is (A5).
 */
export function installIntoListedProject(roots: ScanRoots, projects: readonly Pick<ProjectEntry, 'path' | 'stale'>[], args: InstallToProjectArgs): LandingResult[] {
  const landings = skillLandings(args.sides)
  const refused = (reason: ErrorCode): LandingResult[] => landings.map((l) => ({ dir: l.dir, loaders: l.loaders, result: { ok: false, reason } }))
  const target = skillOpTarget(projects, args.targetProjectPath)
  if (!target.ok) return refused(target.code)
  const library = libraryCheck(roots, args.targetProjectPath, landings.map((l) => l.dir), args.skillName)
  return library.ok ? installSkillToProject(roots, args) : refused(library.code)
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

/** The uninstall the app calls: from one of the projects the app lists, judged by skillOpTarget (skill-install R3), and
 * never from a global library, judged by skillOpLibrary (R4), both before anything is deleted */
export function uninstallFromListedProject(roots: ScanRoots, projects: readonly Pick<ProjectEntry, 'path' | 'stale'>[], args: UninstallArgs): OpResult {
  const target = skillOpTarget(projects, args.targetProjectPath)
  if (!target.ok) return { ok: false, reason: target.code }
  const library = libraryCheck(roots, args.targetProjectPath, [PROJECT_SKILLS_DIR[args.side]], args.skillName)
  return library.ok ? uninstallSkill(args) : { ok: false, reason: library.code }
}
