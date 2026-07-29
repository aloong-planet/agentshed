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

/** 全景快照:一次扫描的完整产出(随票 02-07 增量扩展) */
export interface Snapshot {
  scannedAt: number
  sides: Record<AgentSide, SideInfo>
  projects: ProjectEntry[]
}

/** 空快照(扫描前/两侧均未检测到时的基态) */
export function emptySnapshot(scannedAt: number): Snapshot {
  return {
    scannedAt,
    sides: { claude: { detected: false }, codex: { detected: false } },
    projects: []
  }
}
