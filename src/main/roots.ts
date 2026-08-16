// The real data roots in production (tests do not come through here; fixtures are injected via ScanRoots).
// AGENTSHED_HOME_OVERRIDE: an e2e-only injection point — a fixture directory stands in for home,
// so the whole chain (IPC and allow-lists included) can be asserted deterministically against seeded
// data. Never set in production.
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ScanRoots } from './providers/types'

export function realRoots(): ScanRoots {
  const home = process.env['AGENTSHED_HOME_OVERRIDE'] ?? homedir()
  return {
    claudeHome: join(home, '.claude'),
    claudeConfigFile: join(home, '.claude.json'),
    codexHome: join(home, '.codex'),
    grokHome: join(home, '.grok'),
    agentsSkillsDir: join(home, '.agents', 'skills')
  }
}
