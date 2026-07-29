// 扫描引擎入口(seam 1):给定数据根目录 → 全景快照。
// 票01 骨架:仅检测两侧存在性;注册表/会话/skills 解析随票 02+ 增量落此层。
import { existsSync } from 'node:fs'
import type { Snapshot } from '@shared/domain'
import { emptySnapshot } from '@shared/domain'
import type { ScanRoots } from './types'

export interface ScanDeps {
  /** 时钟注入,测试可控 */
  now: () => number
}

export async function scan(roots: ScanRoots, deps: ScanDeps): Promise<Snapshot> {
  const snap = emptySnapshot(deps.now())
  snap.sides.claude.detected = existsSync(roots.claudeConfigFile)
  snap.sides.codex.detected = existsSync(roots.codexHome)
  return snap
}
