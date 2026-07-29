// 领域模型:IPC 两端共用的单一类型来源(吸取 Transfer 消息模型漂移教训)。
// 术语对齐 CONTEXT.md:项目/失效项目/agent 侧/全局库/项目级安装/产物/活跃度/会话。

export type AgentSide = 'claude' | 'codex'

/** 单侧 agent 的检测信息 */
export interface SideInfo {
  /** 该侧数据目录是否存在于本机 */
  detected: boolean
  /** 注册表解析失败时的降级说明(该侧数据为空但 app 不崩) */
  error?: string
}

/** 项目:任一 agent 侧注册表记录过的工作目录(两侧并集,一目录一项目) */
export interface ProjectEntry {
  /** 规范化绝对路径(唯一键) */
  path: string
  /** 目录名(展示用) */
  name: string
  sides: AgentSide[]
  /** 失效:注册表仍有记录但磁盘目录已不存在 */
  stale: boolean
  /** 手动隐藏(存 app 自有存储,不写 agent 配置) */
  hidden: boolean
  /** 活跃度:最近会话时间(epoch ms;无会话为 null)与会话数 */
  lastSessionAt: number | null
  sessionCount: number
}

/** 全局库中的一个 skill(两侧合并单列) */
export interface GlobalSkill {
  name: string
  /** SKILL.md frontmatter 的 description;无则 null */
  description: string | null
  sides: AgentSide[]
  /** 各侧是否为软链(安装时解引用复制) */
  symlink: Record<AgentSide, boolean>
  /** 两侧同名且 SKILL.md 内容不同 */
  differs: boolean
}

/** Claude plugin(user-scope 全局,只读) */
export interface PluginEntry {
  name: string
  version: string | null
  scope: string | null
  enabled: boolean
  installPath: string | null
}

/** 全局 MCP server(按来源标注) */
export interface McpServerEntry {
  name: string
  side: AgentSide
  /** 'global-config'(~/.claude.json)| 'plugin'(plugin.json 自带)| 'config.toml' */
  source: 'global-config' | 'plugin' | 'config.toml'
}

/** Agents 全局层(票07) */
export interface GlobalLayer {
  skills: GlobalSkill[]
  plugins: PluginEntry[]
  mcp: McpServerEntry[]
  /** 全局 CLAUDE.md 内容(缺失 null,超长截断) */
  claudeGlobalMd: string | null
  /** Codex 全局 AGENTS.md 内容 */
  codexAgentsMd: string | null
  /** config.toml 只读摘要(model + 计数) */
  codexConfigSummary: string | null
}

/** 项目详情里的一个 skill(生效视图条目) */
export interface ProjectSkillEntry {
  name: string
  description: string | null
  /** project=项目级目录;global=全局层生效 */
  level: 'project' | 'global'
  side: AgentSide
  symlink: boolean
  /** 全局条目被同侧同名项目级遮蔽 */
  shadowed: boolean
  /** 项目级条目遮蔽了同侧同名全局 */
  shadows: boolean
}

/** 项目级 MCP(.mcp.json)条目 */
export interface ProjectMcpEntry {
  name: string
  /** 由项目键 enabled/disabledMcpjsonServers 合成;未出现在任一清单时为 null(默认态) */
  enabled: boolean | null
}

/** 项目详情(按需经 IPC 拉取,不进全景快照) */
export interface ProjectDetail {
  path: string
  skills: ProjectSkillEntry[]
  mcp: ProjectMcpEntry[]
  configs: {
    claudeMd: string | null
    agentsMd: string | null
    settingsSummary: string | null
  }
}

/** 全景快照:一次扫描的完整产出(随票 02-07 增量扩展) */
export interface Snapshot {
  scannedAt: number
  sides: Record<AgentSide, SideInfo>
  projects: ProjectEntry[]
  global: GlobalLayer
}

/** 空快照(扫描前/两侧均未检测到时的基态) */
export function emptySnapshot(scannedAt: number): Snapshot {
  return {
    scannedAt,
    sides: { claude: { detected: false }, codex: { detected: false } },
    projects: [],
    global: {
      skills: [],
      plugins: [],
      mcp: [],
      claudeGlobalMd: null,
      codexAgentsMd: null,
      codexConfigSummary: null
    }
  }
}
