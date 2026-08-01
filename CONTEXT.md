# Agentshed

Claude Code 与 Codex 的桌面全景与管理工具:看清每个项目装了什么、烧了多少 token、沉淀了哪些产物,并从全局库向项目装卸 skills。本文件是领域词汇表。

## Language(术语)

**项目(Project)**:
任一 agent 侧注册表中记录过的工作目录;两侧取并集,一目录一项目。
_Avoid_: 仓库、workspace

**失效项目(Stale project)**:
注册表仍有记录但磁盘目录已不存在的项目;默认过滤不显示,可开关显示。
_Avoid_: 死项目、无效项目

**agent 侧(Agent side)**:
数据来源端,枚举:Claude Code、Codex。
_Avoid_: 工具、CLI、平台

**全局库(Global library)**:
agent 全局层的 skills 集合,项目级安装的唯一来源;对本产品只读,内容增删改不经 app。
_Avoid_: 市场、marketplace

**项目级安装(Project install)**:
将 skill 从全局库以完整复制落地到项目自有目录;卸载即删除项目内副本,项目自持不依赖全局库存续。
_Avoid_: 软链、同步

**生效视图(Effective view)**:
项目详情的组件口径(skills/subagents 通用)——项目级条目与该侧全局层生效项并列呈现,同名时按该侧语义标注遮蔽/共存关系;skills 生效视图并含有效启用插件的内含 skills(命名空间隔离,不参与遮蔽)。
_Avoid_: 已装列表

**Subagent(子代理)**:
agent 定义文件所描述的专职助手(Claude:agents/*.md;Codex:agents/*.toml),被委派子任务时在独立上下文运行。与「agent 侧」严格区分:侧是数据来源端,subagent 是侧内的一类组件。
_Avoid_: agent(裸称,与 agent 侧混淆)

**Memory(记忆)**:
agent 自动生成的跨会话笔记,生成态内容,本产品只读展示。Claude 侧 per-project(MEMORY.md + topic 文件);Codex 侧为全局目录,探测式展示(非空才显示)。
_Avoid_: 笔记(泛称);CLAUDE.md(人工指令,属配置)

**有效启用集(Effective enabled plugins)**:
某项目视角下实际生效的插件集合:enabledPlugins 按 local > project > user 层级合并后为 true 者。全局页口径取 user 层。
_Avoid_: 已安装(安装≠启用)

**插件内含组件(Plugin-bundled components)**:
插件包内自带的 skills/subagents/hooks/MCP 等,随插件启停整体生效;发现路径 = 目录约定与 manifest 声明字段的合并。
_Avoid_: 插件功能(泛称)

**产物(Artifact)**:
项目内按八步流程约定沉淀的五类文档:ADR、CONTEXT.md、功能目录(features)、踩坑复盘(postmortems)、原型(prototypes)。施工文档(.scratch)不算产物。
_Avoid_: 文档(泛称)

**活跃度(Activity)**:
项目列表的默认排序维度,由最近会话时间与会话数构成。

**会话(Session)**:
agent 侧的一次对话记录。本产品仅展示元数据(标题、时间、所属项目、token 消耗),不渲染对话内容。
_Avoid_: 聊天记录

**数据日(Data day)**:
趋势窗口内、当前视图口径下当日合计 > 0 的日子;x 轴只为数据日出日期标签(见 ADR-0009)。
_Avoid_: 有量日、活跃日

## Invariants(不变量)

- **降级只准自伤(故障逃逸面判据,2026-08-01 定案)**:读取/解析任一条目失败时,降级只准影响该条目自身的展示——不得向**同层**逃逸(清空或污染其他条目,含同名遮蔽判定这类跨条目计算),不得向**上层**逃逸(拖垮聚合视图或整次扫描)。评估此类缺陷"要不要修"的首要判据是**逃逸面**而非发生率:会逃逸的即需解决,只自伤的可记录缓办。(实例:A8 不可读 subagent 静默消失曾污染同名遮蔽判定;E10 单 marketplace 故障曾清空整组。)

## Flagged ambiguities(已消解歧义)

- **AgentDex(旧名)作废**:产品原定位「只读图鉴」;2026-07-29 需求分析裁定转为「全景 + 装卸管理」动手型,触发命名备胎条款,更名 Agentshed。「图鉴」不再用作产品定位词,改用「全景」。
- **「双视图/产物聚合」作废**(2026-07-30):跨项目按类型聚合产物裁定为伪需求——产物是项目内上下文文档,仅在项目详情内展示;跨项目检索的归宿是未来的全局搜索,不设聚合页。
- **Codex 同名语义按组件而异,不可望文类推**(2026-08-01,均源码级核实):skills 两级同名**共存**(root_loader.rs 只按路径去重),subagents 两级同名**项目级遮蔽**(agent_roles.rs 按 config layer 覆盖,同层重名先者优先)。生效视图的遮蔽标注必须按组件取各自语义。
