// 数据层 Provider 接口(seam 1):数据根目录可注入,测试喂 fixture,生产取真实位置。

export interface ScanRoots {
  /** Claude Code 数据根(生产:~/.claude;注册表在 ~/.claude.json,见 claudeConfigFile) */
  claudeHome: string
  /** Claude 注册表文件(生产:~/.claude.json) */
  claudeConfigFile: string
  /** Codex 数据根(生产:~/.codex;注册表在其 config.toml) */
  codexHome: string
  /** Codex/共享全局 skills 目录(生产:~/.agents/skills) */
  agentsSkillsDir: string
}
