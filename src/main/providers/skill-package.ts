// skills-view: enumerating a package's files and reading their contents. Extensions / junk directories at
// any depth; symlinks are followed unless they lead back on themselves; the caller registers the exact
// allow-list.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { PROJECT_SKILLS_DIR, type AgentSide } from '@shared/domain'
import { globalSkillsRoots, type ScanRoots } from './types'
import type { CappedText } from '@shared/domain'

export const SKILL_TEXT_EXTS = new Set([
  'md',
  'txt',
  'json',
  'yml',
  'yaml',
  'toml',
  'sh',
  'bash',
  'zsh',
  'js',
  'ts',
  'mjs',
  'cjs',
  'jsx',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'css',
  'html',
  'svg'
])

export const SKILL_SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.DS_Store',
  '.hg',
  '.svn'
])

export interface SkillFileMeta {
  /** The relative path inside the package, POSIX style */
  path: string
  /** The absolute path (for registering in the allow-list) */
  absPath: string
  bytes: number
  lines: number
  /** mtime ms */
  mtimeMs: number
}

export interface SkillPackageListing {
  root: string
  files: SkillFileMeta[]
}

export type SkillPackageScope = 'global' | 'project'

export interface ResolveSkillRootArgs {
  side: AgentSide
  name: string
  scope: SkillPackageScope
  projectPath?: string
  roots: ScanRoots
}

/**
 * Where a side's global library keeps a skill: the first of that side's directories holding it as a skill (a SKILL.md
 * inside) — the copy the list shows and the side itself uses (skills-view::REQ-001/AC-01) — else the first holding the
 * entry at all, so a package broken after the scan still opens and reports its missing SKILL.md (C5). null when none
 * does. The name is the caller's to validate.
 */
export function globalSkillEntry(roots: ScanRoots, side: AgentSide, name: string): string | null {
  const entries = globalSkillsRoots(roots)[side].map((dir) => join(dir, name))
  return entries.find((e) => existsSync(join(e, 'SKILL.md'))) ?? entries.find((e) => existsSync(e)) ?? null
}

export function resolveSkillRoot(args: ResolveSkillRootArgs): string | null {
  const { side, name, scope, projectPath, roots } = args
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null
  if (name.includes(':')) return null // A plugin namespace; not previewable in v1
  let root: string
  if (scope === 'global') {
    const entry = globalSkillEntry(roots, side, name)
    if (entry === null) return null
    root = entry
  } else {
    if (typeof projectPath !== 'string' || !projectPath) return null
    root = join(projectPath, PROJECT_SKILLS_DIR[side], name)
  }
  if (!existsSync(root)) return null
  // The container check applies to **the entry point before resolution** (C9); symlinks are only
  // followed afterwards
  if (!isUnderKnownSkillRoots(root, roots, projectPath)) return null
  try {
    // Follow the symlink to the real directory
    return realpathSync(root)
  } catch {
    return null
  }
}

/**
 * Resolving a plugin skill's package root (plugins-view H8): the entry point = skills/<name> under the
 * plugin's package root.
 * Whether the package root is in the scan's registration set is validated at the handler layer
 * (fail-closed); this only handles name sanitising,
 * existence and symlink following (the same discipline as resolveSkillRoot).
 */
export function resolvePluginSkillRoot(pluginRoot: string, name: string): string | null {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || name.includes(':'))
    return null
  const entry = join(pluginRoot, 'skills', name)
  if (!existsSync(entry)) return null
  try {
    return realpathSync(entry)
  } catch {
    return null
  }
}

function isTextFile(name: string): boolean {
  const i = name.lastIndexOf('.')
  if (i < 0) return false
  return SKILL_TEXT_EXTS.has(name.slice(i + 1).toLowerCase())
}

function lineCount(text: string): number {
  if (!text) return 0
  return text.replace(/\n$/, '').split('\n').length
}

function relPosix(from: string, to: string): string {
  return relative(from, to).split(sep).join('/')
}

interface WalkedFile {
  rel: string
  abs: string
  bytes: number
  mtimeMs: number
}

/** Whether the directory `outer` holds the path `inner`, at any depth. Not a prefix check: the path of the
 * filesystem root already ends in a separator. */
export function holdsPath(outer: string, inner: string): boolean {
  const rel = relative(outer, inner)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`)
}

/** A stat-only walk (contents not read): enumeration and the inline stats share one set of
 * extension / junk-directory rules. A package's depth is unbounded, so the walk does not enter a directory it is
 * already inside, whichever route leads there, nor one holding the package: entering it would list the same files
 * again at each level (skills-view::REQ-003/AC-05). `root` is a real path; `realDir` is the real path of `dir`. */
function walkFiles(root: string): WalkedFile[] {
  const files: WalkedFile[] = []
  const inside = new Set<string>()

  function walk(dir: string, realDir: string): void {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    inside.add(realDir)
    for (const e of entries) {
      if (SKILL_SKIP_DIR_NAMES.has(e.name)) continue
      const abs = join(dir, e.name)
      let st
      try {
        // Follow the symlink
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        let realChild = join(realDir, e.name)
        if (e.isSymbolicLink()) {
          try {
            realChild = realpathSync(abs)
          } catch {
            continue
          }
        }
        if (inside.has(realChild) || holdsPath(realChild, root)) continue
        walk(abs, realChild)
        continue
      }
      if (!st.isFile()) continue
      if (!isTextFile(e.name)) continue
      files.push({ rel: relPosix(root, abs), abs, bytes: st.size, mtimeMs: st.mtimeMs })
    }
    inside.delete(realDir)
  }

  walk(root, root)
  return files
}

/**
 * Enumerate a skill package's previewable text files at any depth (called on expansion; it adds a per-file
 * line count, which requires reading contents).
 */
export function listSkillPackageFiles(rootAbs: string): SkillPackageListing {
  const root = realpathSync(rootAbs)
  const files: SkillFileMeta[] = []
  for (const f of walkFiles(root)) {
    let text: string
    try {
      // The line count covers the whole file; truncated reading for display happens on the read channel
      text = readFileSync(f.abs, 'utf8')
    } catch {
      continue
    }
    files.push({ path: f.rel, absPath: f.abs, bytes: f.bytes, lines: lineCount(text), mtimeMs: f.mtimeMs })
  }
  files.sort((a, b) => {
    if (a.path === 'SKILL.md') return -1
    if (b.path === 'SKILL.md') return 1
    return a.path.localeCompare(b.path)
  })
  return { root, files }
}

/**
 * Inline package stats (called during the scan): file count + total bytes, obtainable by stat alone with
 * zero content reads.
 * The same filtering rules as enumeration, so the row's numbers match the expanded table. Unreadable → null.
 */
export function statSkillPackage(rootAbs: string): { files: number; bytes: number } | null {
  let root: string
  try {
    root = realpathSync(rootAbs)
  } catch {
    return null
  }
  const files = walkFiles(root)
  return { files: files.length, bytes: files.reduce((a, f) => a + f.bytes, 0) }
}

const READ_CAP = 500_000

export function readSkillFileText(absPath: string): CappedText {
  const raw = readFileSync(absPath, 'utf8')
  return raw.length > READ_CAP
    ? { text: raw.slice(0, READ_CAP), truncated: true }
    : { text: raw, truncated: false }
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
export function isUnderKnownSkillRoots(
  entryAbs: string,
  roots: ScanRoots,
  projectPath?: string
): boolean {
  try {
    lstatSync(entryAbs)
  } catch {
    return false
  }
  const name = basename(entryAbs)
  if (!name || name === '.' || name === '..') return false
  let realParent: string
  try {
    realParent = realpathSync(dirname(entryAbs))
  } catch {
    return false
  }
  const allowed: string[] = Object.values(globalSkillsRoots(roots)).flat()
  if (projectPath) {
    for (const sub of Object.values(PROJECT_SKILLS_DIR)) allowed.push(join(projectPath, sub))
  }
  for (const base of allowed) {
    if (!existsSync(base)) continue
    try {
      if (realpathSync(base) === realParent) return true
    } catch {
      /* */
    }
  }
  return false
}
