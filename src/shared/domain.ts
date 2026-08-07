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

/**
 * 全局库中的一个 skill(两侧合并单列)。
 * G 系列:origin=plugin 的条目来自有效启用插件的内含 skills——命名空间名(plugin:skill),
 * 不参与磁盘同名遮蔽(G2),sides 恒 claude(G4),不可装卸(G3,ADR-0004 装卸仅限全局库)。
 */
/** skill 包聚合统计(行内展示):可预览文本文件数与总字节;扫描 stat 即得,不读内容 */
export interface SkillPkgStats {
  files: number
  bytes: number
}

export interface GlobalSkill {
  name: string
  /** SKILL.md frontmatter 的 description;无则 null */
  description: string | null
  sides: AgentSide[]
  /** 各侧是否为软链(安装时解引用复制) */
  symlink: Record<AgentSide, boolean>
  /** 各侧包统计;该侧无定义或不可读为 null */
  pkg: Record<AgentSide, SkillPkgStats | null>
  origin: 'disk' | 'plugin'
  pluginName: string | null
  /** 插件条目的摘要同源包根(预览入口,plugins-view H5);磁盘条目为 null */
  pluginRoot: string | null
}

/**
 * Subagent 单侧详情。键语义按侧不同(源码级核实 2026-07-31):
 * Claude=文件名(去 .md),Codex=toml 内 name 字段(agent_roles.rs,无效 name 的文件 Codex 不加载)。
 */
export interface SubagentSideDetail {
  /** 完整定义原文(超长截断);解析失败时为原始文本或 null */
  content: string | null
  description: string | null
  /** 仅 Claude 侧:frontmatter tools */
  tools: string | null
  model: string | null
  /** 仅 Codex 侧:sandbox_mode */
  sandbox: string | null
  /** 该侧文件存在但解析失败/缺有效 name 的说明;正常为 null */
  error: string | null
}

/** 全局 subagent(两侧合并单列;不做跨侧内容 diff——格式异构,不造假信号) */
export interface SubagentEntry {
  name: string
  sides: AgentSide[]
  /** 展示描述:Claude 侧优先 */
  description: string | null
  claude: SubagentSideDetail | null
  codex: SubagentSideDetail | null
  /** Codex 名与内置(default/worker/explorer)同名 → 自定义覆盖内置(role.rs 语义) */
  overridesBuiltin: boolean
}

export interface MemoryFileMeta {
  name: string
  /** 绝对路径:按需读取的白名单键(内容不进快照,见 spec C8) */
  file: string
  mtimeMs: number
}

/** Memory 全局汇总条目(Claude 为 per-project;Codex 为全局目录,projectPath=null) */
export interface MemorySummaryEntry {
  side: AgentSide
  projectPath: string | null
  projectName: string
  /** MEMORY.md 是否存在(Codex 全局条目恒 false) */
  hasMain: boolean
  files: MemoryFileMeta[]
  lastModified: number | null
  stale: boolean
  hidden: boolean
}

/** 单条插件安装记录(E1:多条记录不合并,scope 非 user/project 时原样标注 E3) */
export interface PluginInstallRecord {
  scope: string
  /** project-scope 的归属项目;其余为 null */
  projectPath: string | null
  /** 归属项目目录已不存在(E2:原样显示并标"项目已失联") */
  projectMissing: boolean
  installPath: string | null
  version: string | null
}

export interface PluginHookSummary {
  event: string
  /** matcher 组数量(E7:摘要即止,不渲染命令详情) */
  matchers: number
}

/** 插件内含 skill 摘要(plugins-view H1/H6):pkg=包统计(stat-only);不可读为 null(行置灰判定) */
export interface PluginSkillSummary {
  name: string
  description: string | null
  pkg: SkillPkgStats | null
}

/** 插件内含组件摘要(E5:目录约定 + manifest 声明字段合并;E6:目录缺失 missing) */
export interface PluginContents {
  skills: PluginSkillSummary[]
  agents: string[]
  hooks: PluginHookSummary[]
  mcp: string[]
  missing: boolean
}

/** Claude plugin(全局层,只读)。enabled 为 user 层口径(E4);项目视角见 ProjectPluginEntry */
export interface PluginEntry {
  name: string
  version: string | null
  installs: PluginInstallRecord[]
  enabled: boolean
  /** 首条有效 installPath(MCP/内含组件扫描用) */
  installPath: string | null
  contents: PluginContents
}

/** Codex 插件(E8:缓存三层目录枚举 + 最高版本包根下 skills 枚举;启用态语义未接入,不建模) */
export interface CodexPluginEntry {
  name: string
  marketplace: string
  /** 最高版本缓存目录(摘要同源包根,H5);不可得为 null */
  root: string | null
  /** 内含 skills(仅此一类,ADR-0012;目录约定与 Claude 同构) */
  skills: PluginSkillSummary[]
  /** 缓存中最高版本 */
  version: string | null
  cachedVersions: number
}

/** 项目详情的插件条目:有效启用 = enabledPlugins 按 local > project > user 合并(F1) */
export interface ProjectPluginEntry {
  name: string
  version: string | null
  /** 摘要同源包根(与 contents 扫描同一条 installPath,H5);无有效记录为 null */
  installPath: string | null
  enabled: boolean
  /** 启用/禁用判定来自哪一层;任何层都未提及为 null */
  enabledFrom: 'local' | 'project' | 'user' | null
  installs: PluginInstallRecord[]
  contents: PluginContents
}

/** 全局 MCP server(按来源标注) */
export interface McpServerEntry {
  name: string
  side: AgentSide
  /** 'global-config'(~/.claude.json)| 'plugin'(plugin.json 自带)| 'config.toml' */
  source: 'global-config' | 'plugin' | 'config.toml'
}

/** Agents 全局层(票07;subagents/memory 为 v2 组件扩展) */
export interface GlobalLayer {
  skills: GlobalSkill[]
  subagents: SubagentEntry[]
  /** Memory 汇总(按最近修改倒序;仅元数据与文件名,内容按需读取) */
  memory: MemorySummaryEntry[]
  /** Codex 记忆开关(config.toml [features] memories;C6 三态展示的判定依据) */
  codexMemoriesEnabled: boolean
  plugins: PluginEntry[]
  /** Codex 插件(探测式:缓存目录空则为空数组,UI 整组不显示) */
  codexPlugins: CodexPluginEntry[]
  mcp: McpServerEntry[]
  /** 全局 CLAUDE.md 内容(缺失 null,超长截断) */
  claudeGlobalMd: string | null
  /** Codex 全局 AGENTS.md 内容 */
  codexAgentsMd: string | null
  /** config.toml 只读摘要(model + 计数) */
  codexConfigSummary: string | null
}

/**
 * token 计数。总量口径(ADR-0005,对齐 ccusage):
 * Claude:total = input + output + cacheRead + cacheWrite(四项全加);
 * Codex:total = input + output + cacheWrite(input 已含 cached,不重复加)。
 */
export interface TokenTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface ModelUsage {
  model: string
  side: AgentSide
  total: number
}

/** 日粒度(本地时区)用量 */
export interface DayUsage {
  day: string
  /** 按 agent 侧(供单侧筛选) */
  claude: number
  codex: number
  /** 按 provider(模型提供方)分解 —— 趋势柱分段依据;键见 shared/provider.ts */
  byProvider: Record<string, number>
}

export interface TokenStats {
  bySide: Record<AgentSide, TokenTotals>
  byModel: ModelUsage[]
  byDay: DayUsage[]
}

/** 会话元数据 */
/**
 * 会话的 fork 状态。三态在数据上必须可区分,不是同一字段的两种成色:
 * 「不是 fork」与「是 fork 但剥不准」对用户的含义完全不同,后者要提示对照原文。
 */
export type ForkState = 'none' | 'stripped' | 'uncertain'

export interface SessionMeta {
  side: AgentSide
  title: string
  /** 最后活动时间 = 文件内最大时间戳(两侧同义;与走 mtime 的项目活跃度是两条管线) */
  at: number | null
  tokens: number
  /** 源文件绝对路径 —— 会话的身份。凭它定位并读取内容(读取经主进程白名单校验) */
  file: string
  /** 本会话的真实人类提问条数(harness 噪声已剥、被放弃的分支与重放前缀已除,与标题同源) */
  questionCount: number
  /** fork 与重放剥离的确定性,决定列表上出不出 ⑂ / ⑂? 标记 */
  forkState: ForkState
}

/** 会话页的一条提问(票 04)。文本按字节区间现读——索引与缓存里都没有文本(spec D2a) */
export interface SessionQuestion {
  /** 展示序号,1 起,恒为本会话展示集合内的原始轮次号(排序切换不重编) */
  i: number
  text: string
  at: number | null
  /** 本轮工具调用数(不含 subagent 派发) */
  tools: number
  /** 本轮 subagent 派发数 */
  subagents: number
}

/** 会话页载荷(getSessionPage 通道;自包含,渲染层不需要再拼别处的数据) */
export interface SessionPage {
  file: string
  side: AgentSide
  title: string
  at: number | null
  tokens: number
  /** 源文件字节数(页头体量展示用) */
  bytes: number
  forkState: ForkState
  /** Claude 主链分叉处数(>0 时出"分叉已归一"info 横幅);Codex 恒 0(票 06) */
  forkPoints: number
  /** Codex fork 且父在扫描集内时的父会话标题/文件(横幅引用与跳转);其余为 null */
  forkParentTitle: string | null
  forkParentFile: string | null
  questions: SessionQuestion[]
}

/**
 * 会话轮次的归一化块(票 05 立模型,票 07 扩全):两侧各自的原始行统一成这个
 * 模型,渲染层只认它。顺序 = 源文件行序(行内按 思考→正文→工具 的段序)。
 */
export interface TurnTextBlock {
  kind: 'text'
  role: 'assistant'
  at: number | null
  body: string
}
/** Claude 明文思考(thinking 段);Codex 侧没有这个 kind——推理走 reason */
export interface TurnThinkBlock {
  kind: 'think'
  at: number | null
  body: string
}
/** Codex 推理:只有明文小标题,正文是 encrypted_content 永远不可得(spec C6) */
export interface TurnReasonBlock {
  kind: 'reason'
  at: number | null
  titles: string[]
}
export interface TurnToolBlock {
  kind: 'tool'
  at: number | null
  name: string
  /** 一行摘要(入参截断),折叠态显示 */
  summary: string
  input: string
  /** 无返回(运行中/记录缺失)为 null */
  output: string | null
  /** Claude:transcript 只存截断版,原文旁挂 tool-results/ 不读(spec C7,2026-08-06 裁定) */
  truncated: boolean
}
export interface TurnSubStep {
  kind: 'text' | 'tool'
  label: string
}
export interface TurnSubBlock {
  kind: 'sub'
  at: number | null
  /** 派发名(Claude 取 subagent_type,无则工具名;Codex 恒 spawn_agent) */
  name: string
  prompt: string
  /** 内部步骤:Claude 从轮内 sidechain 行按 agentId 归组;Codex 无引用链恒空 */
  steps: TurnSubStep[]
  result: string | null
  /** Codex:子线程转写无稳定引用链,未归位(2026-08-06 裁定,界面标注) */
  unlinked: boolean
}
/** 显示白名单外的未知类型留痕(spec C8):不渲染内容,但绝不静默丢 */
export interface TurnUnknownBlock {
  kind: 'unknown'
  count: number
  types: string[]
}
export type TurnBlock =
  | TurnTextBlock
  | TurnThinkBlock
  | TurnReasonBlock
  | TurnToolBlock
  | TurnSubBlock
  | TurnUnknownBlock

/** 单轮取回载荷(getSessionTurn 通道) */
export interface SessionTurn {
  blocks: TurnBlock[]
  /** 本次实际读取的字节数——「没有整读」的证据,也是界面脚注的数据 */
  bytesRead: number
}

/** 搜索命中(票 08;searchSessions 通道) */
export interface SearchHit {
  /** 提问序号(展示集合内,1 起,与会话页同源) */
  i: number
  /** 提问全文(命中行经解析后的干净文本) */
  text: string
  at: number | null
  /** true = 命中在该轮的回答/工具正文里(仅全文模式产生) */
  inBody: boolean
  /** 正文命中的上下文片段(提问命中为 null;提取失败也为 null,渲染层退化) */
  snippet: string | null
}

export interface SearchGroup {
  file: string
  title: string
  side: AgentSide
  forkState: ForkState
  at: number | null
  hits: SearchHit[]
}

export interface SearchResult {
  groups: SearchGroup[]
  totalHits: number
  sessionCount: number
  /** 展示区间之外的命中数(fork 重放副本 / 被放弃分支 / 首问前噪声区) */
  folded: number
}

/** 单项目统计(概览 tab 数据) */
export interface ProjectStats {
  tokens: TokenStats
  sessions: SessionMeta[]
}

export function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

export function emptyTokenStats(): TokenStats {
  return { bySide: { claude: emptyTotals(), codex: emptyTotals() }, byModel: [], byDay: [] }
}

/** 项目详情里的一个 skill(生效视图条目;plugin 级=本项目有效启用插件的内含 skills) */
export interface ProjectSkillEntry {
  name: string
  description: string | null
  /** project=项目级目录;global=全局层生效;plugin=插件内含(命名空间条目,不参与遮蔽) */
  level: 'project' | 'global' | 'plugin'
  side: AgentSide
  symlink: boolean
  /** 本行对应包的统计;不可读为 null */
  pkg: SkillPkgStats | null
  origin: 'disk' | 'plugin'
  pluginName: string | null
  /** 插件条目的摘要同源包根(预览入口,plugins-view H5);磁盘条目为 null */
  pluginRoot: string | null
}

/**
 * 项目详情里的一个 subagent(生效视图条目)。
 * 遮蔽语义:Claude 与 Codex 均为项目级遮蔽低层——与 skills 的 Codex 同名共存相反
 * (agent_roles.rs 按 config layer 覆盖,源码级核实 2026-07-31)。
 */
export interface ProjectSubagentEntry {
  name: string
  side: AgentSide
  level: 'project' | 'global'
  description: string | null
  detail: SubagentSideDetail
  shadows: boolean
  shadowed: boolean
  overridesBuiltin: boolean
}

/** 项目详情的 Memory(D 序列):MEMORY.md 内容直出,topic 仅元数据(内容按需读取) */
export interface ProjectMemory {
  /** MEMORY.md 内容(超长截断);不存在为 null */
  main: string | null
  topics: MemoryFileMeta[]
}

/** 项目级 MCP(.mcp.json)条目 */
export interface ProjectMcpEntry {
  name: string
  /** 由项目键 enabled/disabledMcpjsonServers 合成;未出现在任一清单时为 null(默认态) */
  enabled: boolean | null
}

/**
 * 产物六类(八步流程约定;.scratch 里的 tickets 是施工文档,不计)。
 * 顺序是契约:自顶向下的推导链——术语与不变量 → 架构决策 → 需求与边界 →
 * 界面形态 → 当前能力 → 事后教训。读取与 UI 同取此常量,不各自排一次。
 */
export const ARTIFACT_ORDER = [
  'context',
  'adr',
  'specs',
  'prototypes',
  'features',
  'postmortems'
] as const

export type ArtifactType = (typeof ARTIFACT_ORDER)[number]

export interface ArtifactEntry {
  type: ArtifactType
  title: string
  /** 绝对路径(读取/外开经主进程白名单校验) */
  file: string
  mtimeMs: number
}

/** 项目详情(按需经 IPC 拉取,不进全景快照) */
export interface ProjectDetail {
  path: string
  skills: ProjectSkillEntry[]
  subagents: ProjectSubagentEntry[]
  memory: ProjectMemory
  plugins: ProjectPluginEntry[]
  mcp: ProjectMcpEntry[]
  configs: {
    claudeMd: string | null
    agentsMd: string | null
    settingsSummary: string | null
  }
  /** 概览 tab 数据(主进程从 token 引擎附上;引擎未就绪时 null) */
  stats: ProjectStats | null
  /** 产物(五类,时间倒序) */
  artifacts: ArtifactEntry[]
}

/** 全景快照:一次扫描的完整产出(随票 02-07 增量扩展) */
export interface Snapshot {
  scannedAt: number
  sides: Record<AgentSide, SideInfo>
  projects: ProjectEntry[]
  global: GlobalLayer
  /** 跨项目 token 汇总(口径:含已隐藏与失效项目;含归档补齐的历史天) */
  tokens: TokenStats
  /** 仅存在于归档、源会话文件已被 agent 清理的天(UI 标注历史段) */
  archivedDays: string[]
}

/** 空快照(扫描前/两侧均未检测到时的基态) */
export function emptySnapshot(scannedAt: number): Snapshot {
  return {
    scannedAt,
    sides: { claude: { detected: false }, codex: { detected: false } },
    projects: [],
    global: {
      skills: [],
      subagents: [],
      memory: [],
      codexMemoriesEnabled: false,
      plugins: [],
      codexPlugins: [],
      mcp: [],
      claudeGlobalMd: null,
      codexAgentsMd: null,
      codexConfigSummary: null
    },
    tokens: emptyTokenStats(),
    archivedDays: []
  }
}
