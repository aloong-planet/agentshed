// The data layer provider interface (seam 1): the data roots are injectable, so tests feed fixtures and
// production takes the real locations.
import { dirname, join } from 'node:path'
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
 * The directory holding Antigravity CLI's data root, `~/.gemini`. Derived from the data root for now: #326 adds a root of
 * its own for the same directory, and the feature's closeout folds the two together (ticket #325's decisions).
 */
export function geminiDir(roots: ScanRoots): string {
  return dirname(roots.antigravityHome)
}

/** The configuration agy loads beside its data root, `~/.gemini/config` (ADR-0037): plugins, agents, MCP, skills */
export function antigravityConfigDir(roots: ScanRoots): string {
  return join(geminiDir(roots), 'config')
}

/**
 * The per-side global skills library roots, in the order the side prefers a same-name copy. Keyed by AgentSide so a
 * new side is a compile error here rather than a silent fall-through in a ternary at each consumer. Every side but
 * Antigravity has one; agy loads three, a name present in several being the first one's (skills-view::REQ-001/AC-01,
 * measured with agy's own listing). Its built-in skills (`antigravity-cli/builtin/skills`) are deliberately absent
 * (AC-02), and so is Codex's `~/.agents/skills`, which agy does not load (AC-06).
 */
export function globalSkillsRoots(roots: ScanRoots): Record<AgentSide, readonly string[]> {
  return {
    claude: [join(roots.claudeHome, 'skills')],
    codex: [roots.agentsSkillsDir],
    grok: [join(roots.grokHome, 'skills')],
    antigravity: [
      join(roots.antigravityHome, 'skills'),
      join(antigravityConfigDir(roots), 'skills'),
      // agy labels this one "Shared"; it is one of agy's global libraries, not the shared skills directory (CONTEXT)
      join(geminiDir(roots), 'skills')
    ]
  }
}
