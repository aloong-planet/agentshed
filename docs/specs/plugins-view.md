# Plugins 视图

> 关联: [features](../features/plugins-view.md) · [skills-view](skills-view.md)(预览基建) · ADR-0012(预览与启用态解耦) · ADR-0010(插件 skills 并入生效视图) · ADR-0004(装卸边界) · ADR-0001 / ADR-0002

## Problem Statement

插件可以装在用户级或只装给某个项目,包内还自带 skills、subagents、hooks、MCP 等组件。此前查看器把插件当纯全局概念且看不见包内组件,导致两个问题:project-scope 安装的插件在所有项目里显示为"已装但禁用"(实测 superpowers-demo 复现);启用一个插件等于盲装——不知道它注入了什么。组件可见后仍留一层盲区:插件内含 skills 只能看到名字,启用前无法审阅它指示 agent 做什么。

## Solution

按侧分组展示插件;Claude 组如实呈现每条安装记录与**各视角的有效启用集**(全局页取 user 层,项目详情按 local > project > user 合并并注明判定来源)。插件行内直接给启用态与安装记录;点行展开后为**类目 tab**(Skills/Subagents/Hooks/MCP,空类目不出 tab)。**Skills tab 为行式列表**(名 + 描述 + 文件数·大小),点行折叠展开包内文件表、点文件开抽屉读正文(复用 skills-view 预览基建)——**可读与启用态无关**(ADR-0012,启用前审阅)。Codex 组探测式,仅 Skills 类目可展开预览,**不并入 Skills 分栏**(无启用态语义,不造假信号,ADR-0012)。有效启用插件的内含 skills 以命名空间条目并入 Skills 分栏(ADR-0010)。全部只读。

## User Stories

1. As a 用户, I want 插件列表如实显示每条安装记录的 scope 与归属项目, so that project-scope 安装不再被显示为全局禁用。
2. As a 用户, I want 项目详情按本项目有效启用集显示并注明判定来自哪一层, so that 我看到的启用态与 agent 实际行为一致且可解释。
3. As a 用户, I want 展开插件按类目 tab 查看**插件内含组件**(skills/subagents/hooks/MCP), so that 启用前后都能知道它注入了什么,且一次只看一类不被淹没。
4. As a 用户, I want 点开插件内某个 skill 的包读 `SKILL.md` 与引用文档全文, so that **启用它之前**就知道它指示 agent 做什么(ADR-0012)。
5. As a 用户, I want Codex 侧插件的内含 skills 同样可枚举、可预览, so that 两侧插件的审阅能力一致。
6. As a 用户, I want 有效启用插件的 skills 以 `插件名:skill名` 条目出现在 Skills 分栏(带来源徽标、无装卸按钮), so that "当前会话可用的 skills"一处看全。
7. As a 用户, I want 两侧插件分组展示且不做跨侧同名合并, so that 我知道某插件装在哪一侧(两侧 marketplace 与包格式独立)。
8. As a 用户, I want 安装目录被清理、归属项目失联、单个 skill 目录缺失等异常如实标注(置灰/横幅)而非消失或崩溃, so that 我能据此判断要不要清理。

## 失败模式与边界

**序列 E:全局页 → Plugins 分栏(行与展开骨架)**
- E1 同插件多条安装记录(user+project 双装) → 逐条显示 scope 与归属(**行内 chips**),不合并、不只取第一条。
- E2 project-scope 记录的归属项目目录已不存在 → 原样显示并标「项目已失联」,不校验不崩。
- E3 scope 为 local 或未知值 → 原样标注,不猜语义;记录缺 scope 字段 → 标「(未知)」。
- E4 启用态显式 false 与缺失 → 均显示未启用(全局页口径取 user 层)。
- E5 展开:目录约定 + manifest 声明字段(hooks 等字段支持 string/array/内联 object 三形态)合并去重,按**类目 tab**呈现;某类缺失 → **该类不出 tab**;全类缺失 → 展开区仅状态说明;默认落**首个非空类目**;单个内含文件损坏(如某 SKILL.md 解析失败)→ 该条目保留名称、描述留空,不影响同类其余条目。
- E6 安装目录不存在(缓存被清) → 行内标「安装目录缺失」;展开区横幅说明;skills 行**置灰不可点**(缺失原因展示于行上统计位)。
- E7 hooks 摘要 = 事件名 + matcher 计数;**不渲染命令详情**(防误读为可执行审计)。
- E8 CODEX 组:枚举插件缓存三层目录(marketplace/plugin/version);缓存根缺失或空 → 本组整体不显示;同插件多版本目录并存 → 展示最高版本并标注缓存版本数;仅列存在,不显示启用态;**展开仅 Skills 类目**(按最高版本目录下的 skills 子目录枚举,目录约定与 Claude 同构;2026-08-07 磁盘实证),其余类目语义未接入、不展开不造假信号。
- E9 两组之间不做同名合并(跨侧同名如 superpowers 各自成行)。
- E10 Codex 缓存单个 marketplace 目录不可读 → 仅跳过该目录,其余照常枚举(单点故障不得清空整组——见 CONTEXT.md「降级只准自伤」)。
- E11 manifest 声明的相对路径指向包外(`../`)→ 拒绝读取(堵路径逃逸口)。

**序列 F:项目详情 → Plugins 分栏**
- F1 有效启用集 = local > project > user 三层合并,首个提及该插件的层决定启用态;项目层显式 false 可压过 user 层 true;任何层未提及 → 未启用。
- F2 项目 settings.json/settings.local.json 缺失或损坏 → 该层跳过,降级到更低层,不崩。
- F3 验收场景(现成 fixture):project-scope 安装的插件在非归属项目/全局页显示未启用,在归属项目详情显示启用且注明来自 project 层。
- F4 详情页 CODEX 组与全局页同列表,标注「全局生效,无项目级启用语义」。
- F5 详情页的 Skills tab 预览能力与全局页一致(同一组件、同一包根口径)。

**序列 G:Skills 分栏并入插件条目**(ADR-0010;并入口径**不因预览改变**,ADR-0012)
- G1 仅有效启用插件的 skills 出现(按所在页口径:全局页取 user 层,详情页取该项目有效启用集);禁用后刷新 → 条目消失(仅 Plugins 展开可见)。
- G2 命名空间条目 `插件名:skill名` 不参与磁盘 skills 的遮蔽判定;与磁盘同名 skill 两条独立条目并存(命名空间隔离)。
- G3 插件条目无装/卸按钮(ADR-0004 装卸仅限全局库);条目以来源徽标区分;**可折叠展开预览包,与磁盘 skill 同权**(文件表/行内统计/md 预览,见 skills-view spec;2026-08-07 解锁,推翻其 v1 排除)。
- G4 不参与双端合并(Codex 插件生态独立),sides 恒为 Claude 侧;Codex 插件 skills **不并入**(ADR-0012)。

**序列 H:插件 skill 包预览**(Plugins 展开区 Skills tab 内;两页两侧一致)
- H1 Skills tab 行式列表:每行 = 名(命名空间形式)+ frontmatter 描述 + 右侧「N 个文件 · 大小」(统计与 skills-view 行内统计同源同规:stat-only、扩展名/垃圾目录/深度过滤一致)。
- H2 点行折叠展开包内文件表(表头 文件/行数/大小/修改日期;`SKILL.md` 入口标;深度 >2 提示不列深层文件)——列举规则与 skills-view 序列 C 完全同规。
- H3 点文件开抽屉读正文:md 默认预览(frontmatter 键值卡片)可切原文,非 md 仅等宽原文;截断口径同产物通道——与 skills-view 序列 C/D 同规,含**引入内容能力维**(消毒单一出口、链接不导航整窗、图片路径限包内)。
- H4 **可读与启用态无关**(ADR-0012):未启用插件的行照常可点可读;读取不改变任何启用状态。
- H5 包根口径 = **内含组件摘要扫描同源**的那条 installPath(Claude;多安装记录不另猜)/ 缓存最高版本目录(Codex)——保证「看到的摘要」与「点开的内容」永远同一个包。
- H6 单个 skill 目录在包内不存在 → 该行置灰不可点,缺失原因展示于行上统计位。
- H7 包根可读但 `SKILL.md` 缺失 → 文件表照列其余文本文件,不伪造入口(同 skills-view C5)。
- H8 安全(C9 家族延伸):扫描时把**摘要同源包根**登记进程内集合;列举入口必须命中登记集(fail-closed,同 openedProjects/产物白名单模式);读文件仍走列举登记的精确路径白名单。渲染进程伪造不出登记集外的包根。
- H9 展开区 tab 切换不丢已展开的文件表状态与否不作保证(切回重新展开即可,v1 不做状态保持承诺)。

**跨切面回归点**
- R1 IPC 契约(validate)必须与领域类型的新字段同步扩展(cache-crash 复盘同款教训)。
- R2 既有 skills 装卸不受影响:只碰全局库与项目 skills 目录;插件条目双保险(无按钮 + level 卫兵)。
- R3 插件读取在一次扫描内只做一遍,供 plugins/skills 并入/MCP 三处消费(避免重复目录扫描);包根登记与统计在同一遍完成。
- R4 快照体积纪律同 skills-view:每 skill 只带聚合统计与定位身份,文件列表与正文展开时按需。

## Implementation Decisions

- **类型**:安装记录数组(含 scope/归属项目/失联标记)+ 分层启用态(全局页 user 口径 / 详情页 enabledFrom 归因)+ 内含组件摘要四类。内含 skills 条目扩展为 名 + 描述 + **包统计(文件数/字节)+ 可读性(包根缺失/子目录缺失即不可读及原因)**;插件条目(全局与详情)带**摘要同源包根**身份。Codex 插件条目补内含 skills(仅此一类)。ADR-0001 类型单源,契约校验同步扩展。
- **读取层**:经 ScanRoots 注入;内含组件按"目录约定 + manifest 字段"双路合并,manifest 相对路径限定包内;Codex 侧缓存目录三层枚举 + 最高版本目录下 skills 子目录枚举(与 Claude 同目录约定),逐层安全枚举。扫描时对每个插件 skill 做 stat-only 包统计并登记包根(H8)。
- **预览通道**:复用 skills-view 的列举/读文件 IPC 通道与白名单纪律,入口扩展为「登记的插件包根 + skill 名」形态;不新开任意路径读口。
- **UI**:按侧分组两 section;行内 = 名 + 版本 + 启用态/来源 + 安装记录 chips;展开 = 类目 tab(segment 形态,区别于页面级 tab)+ 单类目面板;Skills tab 复用 skills-view 的行/文件表/抽屉机制。

## Testing Decisions

沿用 ADR-0002 双 seam:
1. **providers seam**:fixture 单测覆盖 E/F/G/H 序列——多安装记录、分层 settings 合并与损坏降级、内含四类合并、路径逃逸拒绝、Codex 缓存枚举与单层不可读、命名空间并入与不参与遮蔽;**新增**:Codex skills 枚举(最高版本、目录约定)、插件 skill 包统计与可读性(整包缺失/单目录缺失)、包根登记集拒绝未登记入口(fail-closed 负例)。
2. **契约 seam**:新字段(skills 元数据/包根/Codex skills)往返校验;坏载荷拒收。
3. **e2e**:预置 fixture home——展开插件见类目 tab;Skills tab 点行见文件表、点文件抽屉见正文;未启用插件可读;缺失置灰;Codex 组仅 Skills tab;详情页 F3 双向场景回归。

好测试:只断言外部行为(目录 → 条目集合/统计/可读性;入口 → 放行或拒绝原因),不测遍历实现细节。

## Out of Scope

- 一切写操作:插件的安装、卸载、启停。
- Codex 插件的启用态语义、marketplace 索引解析、除 skills 外的内含组件展开(ADR-0012 重启条件:官方接入启用态语义)。
- subagents/hooks/MCP 条目的点击跳转或详情预览(各自另票)。
- Plugins 与 Skills 分栏之间的跳转/定位高亮(2026-08-07 裁定作废,ADR-0012 备选 4)。
- hooks 的独立分栏(五来源合并视图)——插件展开内的 hooks 摘要不算,另立后续。
- `plugins/repos` 等非 cache 安装形态;local scope 的语义解释(原样标注)。

## Further Notes

- **原型门:已过**(2026-08-07,四轮迭代定稿:行内安装记录与启用态、类目 tab、Skills 行式列表与统计、置灰缺失态、Codex 仅 Skills tab)。
- 实现收尾(第 8 步)须同步:`docs/features/plugins-view.md`(展开形态与预览能力)、`docs/features/skills-view.md` 与 `docs/features/agents-overview.md` 中「插件不可预览」相关措辞。
