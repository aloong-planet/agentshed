// The real data roots in production (tests do not come through here; fixtures are injected via ScanRoots).
// AGENTSHED_HOME_OVERRIDE: an injection point for e2e and `pnpm bench:scan` — a fixture directory or a
// scratch home stands in for home, so the whole chain (IPC and allow-lists included) can be asserted
// deterministically against seeded data, or measured against a copy. Never set in production.
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ScanRoots } from './providers/types'

export function realRoots(): ScanRoots {
  const home = process.env['AGENTSHED_HOME_OVERRIDE'] ?? homedir()
  const gemini = join(home, '.gemini')
  return {
    claudeHome: join(home, '.claude'),
    claudeConfigFile: join(home, '.claude.json'),
    codexHome: join(home, '.codex'),
    geminiHome: gemini,
    grokHome: join(home, '.grok'),
    antigravityHome: join(gemini, 'antigravity-cli'),
    agentsSkillsDir: join(home, '.agents', 'skills')
  }
}
