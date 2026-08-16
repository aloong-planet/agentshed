// The data layer provider interface (seam 1): the data roots are injectable, so tests feed fixtures and
// production takes the real locations.
import { join } from 'node:path'
import type { AgentSide } from '@shared/domain'

export interface ScanRoots {
  /** Claude Code's data root (production: ~/.claude; the registry is in ~/.claude.json, see
   * claudeConfigFile) */
  claudeHome: string
  /** Claude's registry file (production: ~/.claude.json) */
  claudeConfigFile: string
  /** Codex's data root (production: ~/.codex; the registry is in its config.toml) */
  codexHome: string
  /** Grok's data root (production: ~/.grok; the registry is its trusted_folders.toml, ADR-0019) */
  grokHome: string
  /** The Codex / shared global skills directory (production: ~/.agents/skills) */
  agentsSkillsDir: string
}

/**
 * The per-side global skills library root. Keyed by AgentSide so a new side is a compile error here
 * rather than a silent fall-through in a ternary at each consumer.
 */
export function globalSkillsRoots(roots: ScanRoots): Record<AgentSide, string> {
  return {
    claude: join(roots.claudeHome, 'skills'),
    codex: roots.agentsSkillsDir,
    grok: join(roots.grokHome, 'skills')
  }
}
