// skills-view:包内文件列举 + 读正文。深度/扩展名/垃圾目录;软链跟随;精确白名单由调用方登记。
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { AgentSide } from '@shared/domain'
import type { ScanRoots } from './types'
import type { CappedText } from '@shared/domain'

/** 包内相对路径最多段数(SKILL.md=1;references/foo.md=2;references/nested/x.md=3 超限) */
export const SKILL_MAX_SEGMENTS = 2

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

// 提示文案已移到渲染层(票 07):主进程只传 `deep` 这个判定结果

export interface SkillFileMeta {
  /** 包内相对路径,POSIX 风格 */
  path: string
  /** 绝对路径(登记白名单用) */
  absPath: string
  bytes: number
  lines: number
  /** mtime ms */
  mtimeMs: number
}

export interface SkillPackageListing {
  root: string
  files: SkillFileMeta[]
  deep: boolean
  deepPaths: string[]
}

export type SkillPackageScope = 'global' | 'project'

export interface ResolveSkillRootArgs {
  side: AgentSide
  name: string
  scope: SkillPackageScope
  projectPath?: string
  roots: ScanRoots
}

export function resolveSkillRoot(args: ResolveSkillRootArgs): string | null {
  const { side, name, scope, projectPath, roots } = args
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null
  if (name.includes(':')) return null // 插件命名空间,v1 不预览
  let root: string
  if (scope === 'global') {
    root =
      side === 'claude'
        ? join(roots.claudeHome, 'skills', name)
        : join(roots.agentsSkillsDir, name)
  } else {
    if (typeof projectPath !== 'string' || !projectPath) return null
    root =
      side === 'claude'
        ? join(projectPath, '.claude', 'skills', name)
        : join(projectPath, '.agents', 'skills', name)
  }
  if (!existsSync(root)) return null
  // 容器检查在**解析前的入口**上做(C9);跟随软链只发生在其后
  if (!isUnderKnownSkillRoots(root, roots, projectPath)) return null
  try {
    // 跟随软链到真实目录
    return realpathSync(root)
  } catch {
    return null
  }
}

/**
 * 插件 skill 包根解析(plugins-view H8):入口 = 插件包根下 skills/<名>。
 * 包根是否在扫描登记集由 handler 层校验(fail-closed);此处只管名消毒、
 * 存在性与软链跟随(与 resolveSkillRoot 同纪律)。
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

/** stat-only 遍历(不读内容):列举与行内统计共用同一套 扩展名/垃圾目录/深度 规则 */
function walkFiles(root: string): { files: WalkedFile[]; deepPaths: string[] } {
  const files: WalkedFile[] = []
  const deepPaths: string[] = []

  function walk(dir: string): void {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === '.' || e.name === '..') continue
      if (SKILL_SKIP_DIR_NAMES.has(e.name)) continue
      const abs = join(dir, e.name)
      let st
      try {
        // 跟随软链
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(abs)
        continue
      }
      if (!st.isFile()) continue
      if (!isTextFile(e.name)) continue
      const rel = relPosix(root, abs)
      if (rel.startsWith('..')) continue
      // 与原型 deep-demo:顶层+一层子目录可列;更深只提示
      const segments = rel.split('/').length
      if (segments > SKILL_MAX_SEGMENTS) {
        deepPaths.push(rel)
        continue
      }
      files.push({ rel, abs, bytes: st.size, mtimeMs: st.mtimeMs })
    }
  }

  walk(root)
  return { files, deepPaths }
}

/**
 * 枚举 skill 包内可预览文本文件(展开时调用;补每文件行数,需读内容)。
 * depth = 相对路径段数:SKILL.md=1;references/a.md=2;a/b/c.md=3 超限。
 * Spec: 深度 ≤ 2 才入列表;更深收集到 deepPaths。
 */
export function listSkillPackageFiles(rootAbs: string): SkillPackageListing {
  const root = realpathSync(rootAbs)
  const walked = walkFiles(root)
  const files: SkillFileMeta[] = []
  for (const f of walked.files) {
    let text: string
    try {
      // 行数按全文;展示可截断读取在 read 通道
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
  const deepPaths = [...walked.deepPaths].sort()
  return {
    root,
    files,
    deep: deepPaths.length > 0,
    deepPaths
  }
}

/**
 * 行内包统计(扫描时调用):文件数 + 总字节,stat 即得、零内容读。
 * 与列举同一套过滤规则,保证行上数字与展开表格一致。不可读 → null。
 */
export function statSkillPackage(rootAbs: string): { files: number; bytes: number } | null {
  let root: string
  try {
    root = realpathSync(rootAbs)
  } catch {
    return null
  }
  const { files } = walkFiles(root)
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
 * 容器检查作用于**解析前的入口**:入口须是已知 skills 根下的单段条目。
 * 入口可以是软链且目标不设限(A6)——只在枚举/读取时跟随。
 * 判定用 realpath(dirname(入口)),**不解析最后一段**:先解析整条路径会把父目录
 * 变成软链目标的父目录,软链装 skill(目标在根外)就会被误拒(2026-08-07 bug)。
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
  const allowed: string[] = [join(roots.claudeHome, 'skills'), roots.agentsSkillsDir]
  if (projectPath) {
    allowed.push(join(projectPath, '.claude', 'skills'))
    allowed.push(join(projectPath, '.agents', 'skills'))
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
