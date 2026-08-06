// skills-view:包内文件列举 + 读正文。深度/扩展名/垃圾目录;软链跟随;精确白名单由调用方登记。
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { AgentSide } from '@shared/domain'
import type { ScanRoots } from './types'

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

export const SKILL_DEEP_HINT =
  '按照最佳实践,skill 引用深度不宜 ≥ 2,建议改造该 skill'

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
  try {
    // 跟随软链到真实目录
    return realpathSync(root)
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

/**
 * 枚举 skill 包内可预览文本文件。
 * depth = 相对路径段数-? skill 根下文件 SKILL.md depth 0; references/a.md depth 1; a/b/c.md depth 2.
 * Spec: 深度 ≤ 2 才入列表;更深收集到 deepPaths。
 */
export function listSkillPackageFiles(rootAbs: string): SkillPackageListing {
  const root = realpathSync(rootAbs)
  const files: SkillFileMeta[] = []
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
      let text = ''
      try {
        text = readFileSync(abs, 'utf8')
      } catch {
        continue
      }
      // 行数按全文;展示可截断读取在 read 通道
      const bytes = Buffer.byteLength(text, 'utf8')
      files.push({
        path: rel,
        absPath: abs,
        bytes,
        lines: lineCount(text),
        mtimeMs: st.mtimeMs
      })
    }
  }

  walk(root)
  files.sort((a, b) => {
    if (a.path === 'SKILL.md') return -1
    if (b.path === 'SKILL.md') return 1
    return a.path.localeCompare(b.path)
  })
  deepPaths.sort()
  return {
    root,
    files,
    deep: deepPaths.length > 0,
    deepPaths
  }
}

const READ_CAP = 500_000

export function readSkillFileText(absPath: string): string {
  const raw = readFileSync(absPath, 'utf8')
  return raw.length > READ_CAP ? `${raw.slice(0, READ_CAP)}\n…(已截断)` : raw
}

/** 已知 skills 根下的单一 skill 目录(跟随软链后) */
export function isUnderKnownSkillRoots(
  absRoot: string,
  roots: ScanRoots,
  projectPath?: string
): boolean {
  let real: string
  try {
    real = realpathSync(absRoot)
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
      const realBase = realpathSync(base)
      if (!real.startsWith(realBase + sep)) continue
      const rest = real.slice(realBase.length + 1)
      // 必须是 base 下的直接子目录
      if (rest && !rest.includes(sep) && rest !== '..') return true
    } catch {
      /* */
    }
  }
  return false
}
