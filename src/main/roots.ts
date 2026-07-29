// 生产环境的真实数据根目录(测试不走这里,fixture 经 ScanRoots 注入)
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ScanRoots } from './providers/types'

export function realRoots(): ScanRoots {
  const home = homedir()
  return {
    claudeHome: join(home, '.claude'),
    claudeConfigFile: join(home, '.claude.json'),
    codexHome: join(home, '.codex'),
    agentsSkillsDir: join(home, '.agents', 'skills')
  }
}
