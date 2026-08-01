# Plugins 视图

> 关联: [features](../features/plugins-view.md) · ADR-0010(插件 skills 并入生效视图) · ADR-0004(装卸边界) · ADR-0001 / ADR-0002

## Problem Statement

插件可以装在用户级或只装给某个项目,包内还自带 skills、subagents、hooks、MCP 等组件。此前查看器把插件当纯全局概念且看不见包内组件,导致两个问题:project-scope 安装的插件在所有项目里显示为"已装但禁用"(实测 superpowers-demo 复现);启用一个插件等于盲装——不知道它注入了什么。

## Solution

按侧分组展示插件;Claude 组如实呈现每条安装记录与**各视角的有效启用集**(全局页取 user 层,项目详情按 local > project > user 合并并注明判定来源),点行展开查看**插件内含组件**四类(skills/subagents/hooks/MCP);Codex 组探测式仅列缓存中存在的插件。有效启用插件的内含 skills 以命名空间条目并入 Skills 分栏(ADR-0010)。全部只读。

## User Stories

1. As a 用户, I want 插件列表如实显示每条安装记录的 scope 与归属项目, so that project-scope 安装不再被显示为全局禁用。
2. As a 用户, I want 项目详情按本项目有效启用集显示并注明判定来自哪一层, so that 我看到的启用态与 agent 实际行为一致且可解释。
3. As a 用户, I want 展开插件查看**插件内含组件**(skills/subagents/hooks/MCP)摘要, so that 启用前后都能知道它注入了什么。
4. As a 用户, I want 有效启用插件的 skills 以 `插件名:skill名` 条目出现在 Skills 分栏(带来源徽标、无装卸按钮), so that "当前会话可用的 skills"一处看全。
5. As a 用户, I want 两侧插件分组展示且不做跨侧同名合并, so that 我知道某插件装在哪一侧(两侧 marketplace 与包格式独立)。
6. As a 用户, I want 安装目录被清理、归属项目失联等异常如实标注而非消失或崩溃, so that 我能据此判断要不要清理。

## 失败模式与边界

**序列 E:全局页 → Plugins 分栏**
- E1 同插件多条安装记录(user+project 双装) → 逐条显示 scope 与归属,不合并、不只取第一条。
- E2 project-scope 记录的归属项目目录已不存在 → 原样显示并标「项目已失联」,不校验不崩。
- E3 scope 为 local 或未知值 → 原样标注,不猜语义;记录缺 scope 字段 → 标「(未知)」。
- E4 启用态显式 false 与缺失 → 均显示未启用(全局页口径取 user 层)。
- E5 展开:目录约定 + manifest 声明字段(hooks 等字段支持 string/array/内联 object 三形态)合并去重;某类缺失 → 该类不显示;单个内含文件损坏(如某 SKILL.md 解析失败)→ 该条目保留名称、描述留空,不影响同类其余条目。
- E6 安装目录不存在(缓存被清) → 展开区标「安装目录缺失」,列表行保留。
- E7 hooks 摘要 = 事件名 + matcher 计数;**不渲染命令详情**(防误读为可执行审计)。
- E8 CODEX 组:枚举插件缓存三层目录(marketplace/plugin/version);缓存根缺失或空 → 本组整体不显示;同插件多版本目录并存 → 展示最高版本并标注缓存版本数;仅列存在,不显示启用态、不支持展开(语义未接入,不造假信号)。
- E9 两组之间不做同名合并(跨侧同名如 superpowers 各自成行)。
- E10 Codex 缓存单个 marketplace 目录不可读 → 仅跳过该目录,其余照常枚举(单点故障不得清空整组——见 CONTEXT.md「降级只准自伤」)。
- E11 manifest 声明的相对路径指向包外(`../`)→ 拒绝读取(堵路径逃逸口)。

**序列 F:项目详情 → Plugins 分栏**
- F1 有效启用集 = local > project > user 三层合并,首个提及该插件的层决定启用态;项目层显式 false 可压过 user 层 true;任何层未提及 → 未启用。
- F2 项目 settings.json/settings.local.json 缺失或损坏 → 该层跳过,降级到更低层,不崩。
- F3 验收场景(现成 fixture):project-scope 安装的插件在非归属项目/全局页显示未启用,在归属项目详情显示启用且注明来自 project 层。
- F4 详情页 CODEX 组与全局页同列表,标注「全局生效,无项目级启用语义」。

**序列 G:Skills 分栏并入插件条目**(ADR-0010)
- G1 仅有效启用插件的 skills 出现(按所在页口径:全局页取 user 层,详情页取该项目有效启用集);禁用后刷新 → 条目消失(仅 Plugins 展开可见)。
- G2 命名空间条目 `插件名:skill名` 不参与磁盘 skills 的遮蔽判定;与磁盘同名 skill 两条独立条目并存(命名空间隔离)。
- G3 插件条目无装/卸按钮(ADR-0004 装卸仅限全局库);分栏标签为「Skills」,条目以来源徽标区分。
- G4 不参与双端合并(Codex 插件生态独立),sides 恒为 Claude 侧。

**跨切面回归点**
- R1 IPC 契约(validate)必须与领域类型的新字段同步扩展(cache-crash 复盘同款教训)。
- R2 既有 skills 装卸不受影响:只碰全局库与项目 skills 目录;插件条目双保险(无按钮 + level 卫兵)。
- R3 插件读取在一次扫描内只做一遍,供 plugins/skills 并入/MCP 三处消费(避免重复目录扫描)。

## Implementation Decisions

- **类型**:安装记录数组(含 scope/归属项目/失联标记)+ 分层启用态(全局页 user 口径 / 详情页 enabledFrom 归因)+ 内含组件摘要四类;skills 条目增来源标注(磁盘/插件 + 插件名)。ADR-0001 类型单源,契约校验同步扩展。
- **读取层**:经 ScanRoots 注入;内含组件按"目录约定 + manifest 字段"双路合并,manifest 相对路径限定包内;Codex 侧仅缓存目录三层枚举,逐层安全枚举(单层不可读不影响同层其余)。
- **UI**:按侧分组两 section;Claude 组行内展开(展开即内容,非中转);Codex 组探测式。

## Testing Decisions

沿用 ADR-0002 双 seam:① providers 层 fixture 单测(覆盖 E/F/G 序列:多安装记录、分层 settings 合并与损坏降级、内含四类合并、路径逃逸拒绝、Codex 缓存枚举与单层不可读、命名空间并入与不参与遮蔽);② 契约校验往返;③ e2e 预置 fixture home 断言 F3 双向场景与新分栏无主进程报错(数据根经 e2e 专用环境变量注入,生产不设)。

## Out of Scope

- 一切写操作:插件的安装、卸载、启停。
- Codex 插件的启用态语义、内含组件展开、marketplace 索引解析——仅缓存目录枚举。
- 插件内含 commands/LSP/monitors/output-styles 展开(当前四类:skills/subagents/hooks/MCP)。
- hooks 的独立分栏(五来源合并视图)——插件展开内的 hooks 摘要不算,另立后续。
- `plugins/repos` 等非 cache 安装形态;local scope 的语义解释(原样标注)。
