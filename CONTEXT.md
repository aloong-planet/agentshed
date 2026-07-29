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

**产物(Artifact)**:
项目内按八步流程约定沉淀的五类文档:ADR、CONTEXT.md、功能目录(features)、踩坑复盘(postmortems)、原型(prototypes)。施工文档(.scratch)不算产物。
_Avoid_: 文档(泛称)

**活跃度(Activity)**:
项目列表的默认排序维度,由最近会话时间与会话数构成。

**会话(Session)**:
agent 侧的一次对话记录。本产品仅展示元数据(标题、时间、所属项目、token 消耗),不渲染对话内容。
_Avoid_: 聊天记录

## Flagged ambiguities(已消解歧义)

- **AgentDex(旧名)作废**:产品原定位「只读图鉴」;2026-07-29 需求分析裁定转为「全景 + 装卸管理」动手型,触发命名备胎条款,更名 Agentshed。「图鉴」不再用作产品定位词,改用「全景」。
- **「双视图/产物聚合」作废**(2026-07-30):跨项目按类型聚合产物裁定为伪需求——产物是项目内上下文文档,仅在项目详情内展示;跨项目检索的归宿是未来的全局搜索,不设聚合页。
