// Claude Code 侧数据读取:注册表(~/.claude.json 的 projects 键)。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface RegistryResult {
  detected: boolean
  paths: string[]
  error?: string
}

export function readClaudeRegistry(configFile: string): RegistryResult {
  if (!existsSync(configFile)) return { detected: false, paths: [] }
  try {
    const raw: unknown = JSON.parse(readFileSync(configFile, 'utf8'))
    const projects =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)['projects']
        : undefined
    if (typeof projects !== 'object' || projects === null) {
      return { detected: true, paths: [], error: 'projects 键缺失或非对象' }
    }
    return { detected: true, paths: Object.keys(projects) }
  } catch (err) {
    return { detected: true, paths: [], error: `注册表解析失败:${String(err)}` }
  }
}

/**
 * 项目路径 → Claude 会话目录名的正向编码(不做有损反解)。
 * 实测规律:所有非字母数字字符替换为 '-'(含 / . _)。
 */
export function encodeClaudeProjectDir(projectPath: string): string {
  return projectPath.replace(/[^A-Za-z0-9]/g, '-')
}

export interface Activity {
  sessionCount: number
  /** epoch ms;无会话为 null */
  lastSessionAt: number | null
}

/** 某项目的 Claude 会话活跃度:编码目录下 *.jsonl 计数 + 最大 mtime。不解析内容。 */
export function readClaudeActivity(claudeHome: string, projectPath: string): Activity {
  const dir = join(claudeHome, 'projects', encodeClaudeProjectDir(projectPath))
  if (!existsSync(dir)) return { sessionCount: 0, lastSessionAt: null }
  let count = 0
  let last: number | null = null
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue
    try {
      const m = statSync(join(dir, name)).mtimeMs
      count++
      if (last === null || m > last) last = m
    } catch {
      // 文件在扫描间隙被删:跳过
    }
  }
  return { sessionCount: count, lastSessionAt: last }
}
