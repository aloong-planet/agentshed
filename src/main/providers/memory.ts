// Memory 读取(spec: subagents-memory-plugin 序列 C/D)。
// 全局汇总以项目注册表为准(C5),仅元数据+文件名进快照(C8),内容经白名单按需读取;
// Codex 全局记忆探测式:目录非空才入列(C6),仅目录枚举不解析结构。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { MemoryFileMeta, MemorySummaryEntry, ProjectEntry, ProjectMemory } from '@shared/domain'
import type { ScanRoots } from './types'
import { encodeClaudeProjectDir } from './claude'
import { readTextCapped } from './read-utils'

/** 目录下顶层 .md 文件的元数据(不递归;subagent 级 memory 子目录不读,Out of Scope) */
function listMdFiles(dir: string): MemoryFileMeta[] {
  if (!existsSync(dir)) return []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: MemoryFileMeta[] = []
  for (const name of names.sort()) {
    if (!name.endsWith('.md')) continue
    const file = join(dir, name)
    try {
      const st = statSync(file)
      if (!st.isFile()) continue
      out.push({ name, file, mtimeMs: st.mtimeMs })
    } catch {
      // 扫描间隙被删:跳过
    }
  }
  return out
}

/**
 * Codex 记忆开关(C6):features 表下的 memories 键为 true——
 * `[features]` 节与 `features.memories = true` 点键两种写法等价,TOML 解析识别。
 * 解析失败 → 未开启:Codex 本身也读不了该 config,从坏文件抢救语义是假信号
 * (判定类降级以目标系统的实际行为为准)。config 缺失/不可读同为未开启。
 */
export function readCodexMemoriesEnabled(codexHome: string): boolean {
  const raw = readTextCapped(join(codexHome, 'config.toml'))
  if (raw === null) return false
  try {
    const parsed = parseToml(raw) as Record<string, unknown>
    const features = parsed['features']
    return (
      typeof features === 'object' &&
      features !== null &&
      (features as Record<string, unknown>)['memories'] === true
    )
  } catch {
    return false
  }
}

export function readMemorySummary(roots: ScanRoots, projects: ProjectEntry[]): MemorySummaryEntry[] {
  const out: MemorySummaryEntry[] = []
  for (const p of projects) {
    const files = listMdFiles(join(roots.claudeHome, 'projects', encodeClaudeProjectDir(p.path), 'memory'))
    if (files.length === 0) continue // C2:空目录/无目录不入列
    out.push({
      side: 'claude',
      projectPath: p.path,
      projectName: p.name,
      hasMain: files.some((f) => f.name === 'MEMORY.md'),
      files,
      lastModified: Math.max(...files.map((f) => f.mtimeMs)),
      stale: p.stale,
      hidden: p.hidden
    })
  }
  const codexFiles = listMdFiles(join(roots.codexHome, 'memories'))
  if (codexFiles.length > 0) {
    out.push({
      side: 'codex',
      projectPath: null,
      projectName: '(Codex 全局记忆)',
      hasMain: false,
      files: codexFiles,
      lastModified: Math.max(...codexFiles.map((f) => f.mtimeMs)),
      stale: false,
      hidden: false
    })
  }
  // C4:按最近修改倒序
  return out.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
}

/** 项目详情 Memory(D 序列):MEMORY.md 内容直出(截断),topic 仅元数据 */
export function readProjectMemory(roots: ScanRoots, projectPath: string): ProjectMemory {
  const dir = join(roots.claudeHome, 'projects', encodeClaudeProjectDir(projectPath), 'memory')
  const files = listMdFiles(dir)
  const main = files.some((f) => f.name === 'MEMORY.md') ? readTextCapped(join(dir, 'MEMORY.md')) : null
  return { main, topics: files.filter((f) => f.name !== 'MEMORY.md') }
}
