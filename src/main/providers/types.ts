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
  /** The directory holding Antigravity CLI's data root (antigravity-cli/) and the configuration it loads
   * (config/) — production: ~/.gemini (ADR-0037). Named for the directory, which Gemini CLI also uses; this
   * product reads it for the Antigravity CLI side only */
  geminiHome: string
  /** Grok's data root (production: ~/.grok; the registry is its trusted_folders.toml, ADR-0019) */
  grokHome: string
  /** Antigravity CLI's data root (production: ~/.gemini/antigravity-cli; the registry is trustedWorkspaces in its
   * settings.json, ADR-0037). The desktop app's and the IDE's roots beside it are never read (token-stats::CON-001) */
  antigravityHome: string
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
    grok: join(roots.grokHome, 'skills'),
    // agy's own CLI library, the first of the three it loads (skills-view::REQ-001/AC-01 widens this to all three)
    antigravity: join(roots.antigravityHome, 'skills')
  }
}
