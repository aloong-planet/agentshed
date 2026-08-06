# Agents 全局页

> 关联: [features](../features/agents-overview.md) · ADR-0001(类型单源) · ADR-0002(双 seam)
> 补建说明:本篇为 2026-08-01 spec 转持久产物后**逆向补建**。各分栏的组件级需求与边界在对应 spec(subagents-view / memory-view / plugins-view / token-stats / skill-install),本篇只写**页面级**口径:分栏构成、汇总卡、单侧降级。

## Problem Statement

同时使用 Claude Code 与 Codex 的用户,打开 app 第一眼想知道"两边各是什么状态、各烧了多少、各装了什么"。这些信息散在两套目录结构里,格式与概念还不对称(如插件只有 Claude 有)。

## Solution

作为默认落地页,把两侧 agent 的全局面貌汇成一屏:顶部两张侧汇总卡,下面按组件类型分栏(Token/Skills/Subagents/Plugins/MCP/Memory/配置)。全部只读,唯一的写操作是 Skills 装到项目(见 skill-install spec)。**本 app 外观方案(紫/雾蓝/琥珀褐)不在本页配置分栏**,见 [appearance](appearance.md)(Rail 设置维)。

## User Stories

1. As a 用户, I want 打开即见两侧的检测状态与 token 累计, so that 我一眼知道两边各是什么状态。
2. As a 用户, I want 各类组件按分栏归置且两侧在同一分栏内对照, so that 我不用在两套目录概念间来回换算。
3. As a 用户, I want 某侧数据损坏时该侧降级显示错误说明而另一侧照常, so that 单侧故障不让整页不可用。
4. As a 用户, I want 某侧未安装时显示"未检测到"而非报错, so that 只用一侧的用户也能正常使用。
5. As a 用户, I want 汇总口径(含已隐藏与失效项目)有明确标注, so that 数字对不上时我知道差在哪。

## 失败模式与边界

**序列 A:页面加载**
- A1 两侧均未检测到 → 整页空态引导(说明去装哪个 agent),不报错。
- A2 单侧未检测到 → 该侧卡显示"未检测到",另一侧正常。
- A3 单侧注册表损坏 → 该侧卡显示错误说明(替代统计行),另一侧不受影响。
- A4 扫描未完成 → 扫描态,不显示误导性的空分栏。

**序列 B:分栏构成与口径**
- B1 分栏集合 = Token / Skills / Subagents / Plugins / MCP / Memory / 配置;新增组件类型时在此扩展(顺序按"用得多的靠前")。
- B2 汇总卡副行显示该侧的项目数、全局 skills 数、subagents 数——口径与对应分栏一致。
- B3 Token 汇总**含已隐藏与失效项目**并显式标注(与项目列表的默认过滤口径不同,必须写明避免对不上账)。
- B4 两侧概念不对称的分栏(如 Plugins 的 Codex 组、Memory 的 Codex 全局条目)按各自 spec 的探测式规则处理,不为对称而造假信号。
- B5 配置分栏:文件缺失显示"无"而非报错;超大文件截断。

**跨切面**
- R1 各分栏的组件级边界见对应 spec,本篇不重复;新增分栏时同步更新 B1 的分栏集合。
- R2 全局刷新两维度共用,进行中重复点击去重。

## Implementation Decisions

- **数据来源**:一次扫描产出全景快照,各分栏消费同一快照(不各自重扫);依赖项目注册表的部分(如 Memory 汇总)在项目列表就绪后填充。
- **契约**:快照结构走 ADR-0001 类型单源 + 边界校验;新增分栏必须同步扩展校验(漏加即静默放过)。
- **降级粒度**:按侧降级(单侧故障不影响另一侧),不整页失败。

## Testing Decisions

沿用 ADR-0002 双 seam:providers 层 fixture 单测覆盖单侧缺失/损坏的降级与快照组装;契约校验往返;e2e 覆盖分栏逐个切换均渲染且主进程无错误(新增分栏须同步更新 tab 计数断言)。

## Out of Scope

- 全局库/插件/记忆的写操作(唯一写操作是 Skills 装到项目)。
- 跨组件的聚合视图与全局搜索。
- 文件实时监听(启动扫描 + 手动刷新)。
