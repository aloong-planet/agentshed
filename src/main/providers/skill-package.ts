// skills-view: enumerating a package's files and reading their contents. Extensions / junk directories at
// any depth; symlinks are followed unless they lead back on themselves; the caller registers the exact
// allow-list.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { AgentSide } from '@shared/domain'
import type { ScanRoots } from './types'
import type { CappedText } from '@shared/domain'
import {
  firstGlobalSkillEntry,
  inKnownSkillsDir,
  pluginSkillPackageRoot,
  skillPackageRoot,
  type ResolveSkillRootArgs,
  type SkillRootProbes
} from '../skill-package-root'

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

/** The disk's own answers to the skill package root decision (skill-package-root.ts). An error is the refusing answer:
 * an entry that cannot be looked at is not there, and a path whose real path cannot be told leads nowhere */
const diskProbes: SkillRootProbes = {
  exists: existsSync,
  entryThere: (path) => {
    try {
      lstatSync(path)
      return true
    } catch {
      return false
    }
  },
  realPath: (path) => {
    try {
      return realpathSync(path)
    } catch {
      return null
    }
  }
}

/** firstGlobalSkillEntry against the disk */
export function globalSkillEntry(roots: ScanRoots, side: AgentSide, name: string): string | null {
  return firstGlobalSkillEntry(roots, side, name, diskProbes)
}

/** skillPackageRoot against the disk */
export function resolveSkillRoot(args: ResolveSkillRootArgs): string | null {
  return skillPackageRoot(args, diskProbes)
}

/** pluginSkillPackageRoot against the disk */
export function resolvePluginSkillRoot(pluginRoot: string, name: string): string | null {
  return pluginSkillPackageRoot(pluginRoot, name, diskProbes)
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

/** A stat-only walk (contents not read): enumeration and the inline stats share one set of
 * extension / junk-directory rules. A package's depth is unbounded, so the walk does not enter a directory it is
 * already inside, whichever route leads there, nor one holding the package: entering it would list the same files
 * again at each level (skills-view::REQ-003/AC-05). A directory is known by its device and inode, not its path: a
 * real path does not reduce every spelling of one directory to one (letter case on a volume that ignores it, a
 * firmlink such as /System/Volumes/Data). The skill install's walk tells directories apart the same way (install.ts,
 * idOf and dirsHolding), there failing where this skips. `root` is a real path. */
function walkFiles(root: string): WalkedFile[] {
  const files: WalkedFile[] = []
  const idOf = (path: string): string | null => {
    try {
      const st = statSync(path, { bigint: true })
      return `${st.dev}:${st.ino}`
    } catch {
      return null
    }
  }
  // The package's directory and every directory holding it
  const holding = new Set<string>()
  for (let d = root; ; d = dirname(d)) {
    const id = idOf(d)
    if (id !== null) holding.add(id)
    if (dirname(d) === d) break
  }
  const inside = new Set<string>()

  function walk(dir: string, dirId: string): void {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    inside.add(dirId)
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
        const childId = idOf(abs)
        if (childId === null || inside.has(childId) || holding.has(childId)) continue
        walk(abs, childId)
        continue
      }
      if (!st.isFile()) continue
      if (!isTextFile(e.name)) continue
      files.push({ rel: relPosix(root, abs), abs, bytes: st.size, mtimeMs: st.mtimeMs })
    }
    inside.delete(dirId)
  }

  const rootId = idOf(root)
  if (rootId !== null) walk(root, rootId)
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

/** inKnownSkillsDir against the disk */
export function isUnderKnownSkillRoots(
  entryAbs: string,
  roots: ScanRoots,
  projectPath?: string
): boolean {
  return inKnownSkillsDir(entryAbs, roots, projectPath, diskProbes)
}
