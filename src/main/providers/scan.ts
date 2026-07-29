// 扫描引擎入口(seam 1):给定数据根目录 → 全景快照。
// 票02:注册表并集(徽标/失效/路径规范化)。会话活跃度、skills 等随后续票增量落此层。
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import type { AgentSide, ProjectEntry, Snapshot } from '@shared/domain'
import { emptySnapshot } from '@shared/domain'
import type { ScanRoots } from './types'
import { readClaudeRegistry, readClaudeActivity } from './claude'
import { readCodexRegistry, readCodexSessions } from './codex'
import { readGlobalLayer } from './global'

export interface ScanDeps {
  /** 时钟注入,测试可控 */
  now: () => number
  /** 手动隐藏查询(注入 HiddenStore;缺省视为无隐藏) */
  isHidden?: (projectPath: string) => boolean
}

/** 合并键:去尾斜杠 + 小写(macOS 大小写不敏感);展示保留首次出现的原始写法 */
function mergeKey(p: string): string {
  return normalizePath(p).toLowerCase()
}
function normalizePath(p: string): string {
  const stripped = p.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

export async function scan(roots: ScanRoots, deps: ScanDeps): Promise<Snapshot> {
  const snap = emptySnapshot(deps.now())

  const claude = readClaudeRegistry(roots.claudeConfigFile)
  const codex = readCodexRegistry(roots.codexHome)
  snap.sides.claude.detected = claude.detected
  if (claude.error) snap.sides.claude.error = claude.error
  snap.sides.codex.detected = codex.detected
  if (codex.error) snap.sides.codex.error = codex.error

  const byKey = new Map<string, ProjectEntry>()
  const add = (rawPath: string, side: AgentSide): void => {
    const path = normalizePath(rawPath)
    const key = mergeKey(path)
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.sides.includes(side)) existing.sides.push(side)
      return
    }
    byKey.set(key, {
      path,
      name: basename(path),
      sides: [side],
      stale: !existsSync(path),
      hidden: deps.isHidden?.(path) ?? false,
      lastSessionAt: null,
      sessionCount: 0
    })
  }
  for (const p of claude.paths) add(p, 'claude')
  for (const p of codex.paths) add(p, 'codex')

  // 活跃度:Claude 按编码目录 readdir;Codex 按 rollout 首行 cwd 归属(subagent 不计)
  const codexSessions = readCodexSessions(roots.codexHome)
  const codexByKey = new Map<string, { count: number; last: number | null }>()
  for (const s of codexSessions) {
    if (s.subagent) continue
    const key = mergeKey(s.cwd)
    const agg = codexByKey.get(key) ?? { count: 0, last: null }
    agg.count++
    if (agg.last === null || s.mtimeMs > agg.last) agg.last = s.mtimeMs
    codexByKey.set(key, agg)
  }
  for (const [key, entry] of byKey) {
    const cl = readClaudeActivity(roots.claudeHome, entry.path)
    const cx = codexByKey.get(key)
    entry.sessionCount = cl.sessionCount + (cx?.count ?? 0)
    const candidates = [cl.lastSessionAt, cx?.last ?? null].filter((v): v is number => v !== null)
    entry.lastSessionAt = candidates.length ? Math.max(...candidates) : null
  }

  snap.projects = [...byKey.values()]
  snap.global = readGlobalLayer(roots)
  return snap
}
