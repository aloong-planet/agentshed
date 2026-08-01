# Subagents 查看

> 关联: [features](../features/subagents-view.md) · ADR-0001(类型单源) · ADR-0002(双 seam)

## Problem Statement

两侧 agent 都支持自定义 subagent(专职助手定义),但定义散在两处目录、格式各异(Claude 的 md + frontmatter,Codex 的 toml),且项目级可覆盖用户级。用户无从知道"本机定义过哪些助手""某项目里实际生效的是哪个定义"。

## Solution

全局页与项目详情页各设 Subagents 分栏:全局页两侧合并单列看全量,详情页按生效视图看遮蔽关系;点条目开抽屉查看完整定义原文。全部只读。

## User Stories

1. As a 用户, I want 在全局页看到两侧全部 subagent(合并单列、双端徽标), so that 我知道本机定义过哪些专职助手。
2. As a 用户, I want 点条目查看完整定义原文(含 system prompt / developer_instructions)与元数据, so that 我能看清它的人设与工具面。
3. As a 用户, I want 双端同名条目在抽屉内分侧切换查看, so that 我了解两侧配置是否等价(不提供机器 diff 信号——格式异构,diff 必然恒真)。
4. As a 用户, I want 在项目详情看生效视图(项目级/全局级、遮蔽标注), so that 我知道在该项目里实际生效的是哪个定义。
5. As a 用户, I want Codex 自定义名与内置(default/worker/explorer)同名时有「覆盖内置」标注, so that 我知道内置行为已被替换。
6. As a 用户, I want 目录缺失、文件损坏或不可读时降级为空态/标注而非崩溃或静默消失, so that 查看器在任何机器上都能打开且信号可信。

## 失败模式与边界

**序列 A:全局页 → Subagents 分栏**
- A1 两侧 agents 目录均不存在/为空 → 空态文案,不崩。
- A2 Codex toml 解析失败(损坏) → 该条目显示「解析失败」标注(文件名占位),其余正常。
- A3 Codex toml 缺有效 `name` → 标为无效定义(Codex 本身不加载它)。
- A4 Claude md 无 frontmatter/缺 description → 文件名为名,缺失字段留空。
- A5 双端同名(键:Claude=文件名,Codex=toml `name` 字段) → 合并一行,双侧徽标,抽屉内分侧看原文;不设 differs 字段。
- A6 定义文件超 200KB → 截断展示。
- A7 原文含恶意 HTML → 经既有消毒渲染管线(回归点:PR #10 口径)。
- A8 文件存在但不可读(权限/IO)→ 条目保留并标「不可读」,**不静默消失**——静默消失会污染同名条目的遮蔽判定(Claude 侧键=文件名仍参与判定;Codex 侧名不可知,仅列存在)。
- A9 同层内两文件同 `name`(Codex)→ 先者优先(按文件名序;对齐 agent_roles.rs 同层 duplicate 跳过后来者)。

**序列 B:项目详情 → Subagents 分栏**
- B1 项目无 `.claude/agents`/`.codex/agents` → 仅列全局生效项。
- B2 Claude 同名:项目级遮蔽全局(shadows/shadowed)。
- B3 Codex 同名:项目级遮蔽用户级(源码坐实 agent_roles.rs 按 config layer 覆盖,Project=25 > User=20)——**与 Codex skills 的同名共存语义相反**,实现注释必须按组件分开写。已知简化:字段级回填(项目级缺 description 从用户级继承)不建模。
- B4 Codex 自定义名 ∈ {default, worker, explorer} → 「覆盖内置」徽标;内置本身不在磁盘,不列条目。
- B5 失效(stale)项目 → 项目级目录读取自然为空,全局项照常。

**跨切面回归点**
- R1 IPC 契约(validate)必须与领域类型的新字段同步扩展——漏加即边界静默放过(cache-crash 复盘同款教训,列为 review 检查项)。
- R2 快照体积:subagent 原文进快照;本机量级(个位数文件 × 200KB cap)可接受,不做懒加载。

## Implementation Decisions

- **类型**:全局合并条目(含分侧原文与字段)与生效视图条目(复用 shadows/shadowed 语义)分开建模;两者共用单侧详情结构。ADR-0001 类型单源,契约校验同步扩展。
- **读取层**:经 ScanRoots 注入(可 fixture);Codex toml 走 **smol-toml** 解析,不写正则。
- **承载结构(原型裁决)**:列表全宽;点行**直接开抽屉**(元数据 kv + 原文;双端切换段在抽屉内,切换时原地刷新不关闭;Esc 与遮罩点击等价关闭)。否决 master-detail 双栏(压缩列表信息密度)与「行内元数据展开 + 浮层」(展开是进抽屉的多余中转)。
- **排序**:项目级先、组内名称序(同 skills)。

## Testing Decisions

沿用 ADR-0002 双 seam,不新增:① providers 层 ScanRoots fixture 单测(覆盖失败模式表:损坏 toml、缺 name、同层重名、不可读文件、遮蔽判定);② 契约校验往返。好测试标准:只测 reader 外部行为(fixture 目录 → domain 条目),不测内部解析函数。不可读文件用 chmod 000 fixture,root 环境显式跳过。

## Out of Scope

- 一切写操作:subagent 的创建、编辑、删除。
- Codex 遮蔽的字段级回填语义。
- subagent 级独立 memory 目录(归 memory-view spec 的 Out of Scope)。
- 内置 subagent 的枚举(不在磁盘,无来源可读)。
