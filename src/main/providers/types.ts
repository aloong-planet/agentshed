// The data layer provider interface (seam 1): the data roots are injectable, so tests feed fixtures and
// production takes the real locations.

export interface ScanRoots {
  /** Claude Code's data root (production: ~/.claude; the registry is in ~/.claude.json, see
   * claudeConfigFile) */
  claudeHome: string
  /** Claude's registry file (production: ~/.claude.json) */
  claudeConfigFile: string
  /** Codex's data root (production: ~/.codex; the registry is in its config.toml) */
  codexHome: string
  /** The Codex / shared global skills directory (production: ~/.agents/skills) */
  agentsSkillsDir: string
}
