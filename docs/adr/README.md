# ADR 索引

本仓库 ADR 规范:MADR minimal 五段体(背景/备选项/决策/后果/来源,全必填);「备选项」必填以留存排除过程;三态(提议|已接受|已被取代),已接受后只追加不改写,推翻另开新条;只收本项目架构决策(流程类约定不入);三门槛(难逆转、无上下文会费解、真实 trade-off)同时满足才落条目。

| # | 决策 | 状态 |
|---|---|---|
| [0001](0001-ipc-contract-single-source.md) | IPC 契约单一类型源与双侧运行时校验 | 已接受 |
| [0002](0002-dual-seam-testing.md) | 双 seam 测试策略(数据层注入 + IPC 契约) | 已接受 |
| [0003](0003-token-accounting.md) | Token 统计口径 | 已被 0005 取代 |
| [0004](0004-skill-install-by-copy.md) | Skills 安装复制落地(拒绝软链) | 已接受 |
| [0005](0005-token-ccusage-alignment.md) | Token 统计对齐 ccusage(全树+去重+四项口径) | 已接受 |
| [0006](0006-codex-usage-accounting.md) | Codex 用量统计口径(双数据根+fork 重放剥离) | 已接受 |
| [0007](0007-usage-archive.md) | 用量历史归档(抗 agent 自动清理) | 已接受 |
| [0008](0008-trend-by-provider.md) | 趋势柱按 provider 分段 | 已接受 |
| [0009](0009-trend-xaxis-data-days.md) | 趋势图 x 轴只标数据日的层级日期标签 | 已接受 |
| [0010](0010-plugin-skills-in-effective-view.md) | 插件内含 skills 并入生效视图(命名空间隔离、启用态过滤) | 已接受 |
