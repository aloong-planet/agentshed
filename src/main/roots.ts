// 生产环境的真实数据根目录(测试不走这里,fixture 经 ScanRoots 注入)。
// AGENTSHED_HOME_OVERRIDE:e2e 专用注入口——以 fixture 目录冒充 home,
// 使全链路(含 IPC/白名单)可在预置数据上确定性断言;生产不设此变量。
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ScanRoots } from './providers/types'

export function realRoots(): ScanRoots {
  const home = process.env['AGENTSHED_HOME_OVERRIDE'] ?? homedir()
  return {
    claudeHome: join(home, '.claude'),
    claudeConfigFile: join(home, '.claude.json'),
    codexHome: join(home, '.codex'),
    agentsSkillsDir: join(home, '.agents', 'skills')
  }
}
