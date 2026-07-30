# ADR-0002: 双 seam 测试策略(数据层注入 + IPC 契约)

- 状态: 已接受(2026-07-29,需求分析期用户拍板)

## 备选项

1. **双 seam:数据层(根目录注入,fixture 喂假目录树)+ IPC 契约(schema 校验往返)**
2. 数据层单一 seam——否决:用户明确要求契约层独立可测(Transfer IPC 漂移教训)
3. Playwright 端到端为主——否决:重、脆、慢,首版功能面宽时维护成本最高

## 背景与问题

扫描引擎读两侧 agent 的真实数据目录,直接测真实目录不可复现;UI 层变化频繁不值得单测。需要确定测试站在哪两个公开边界上。

## 决策

选定**方案 1**:我们把全部行为测试打在两个 seam 上——`ScanRoots` 注入使数据层可用临时 fixture 目录完整驱动(装卸在 fixture 上实测文件系统效果);`validate` 使契约独立于 Electron 可测。Electron 壳与 React UI 不单测,靠 dev 冒烟与手动清单。

## 后果

- 正面:测试零 Electron 依赖、毫秒级、可复现;数据行为覆盖密(61 例)
- 负面:UI 与主进程装配层(IPC handler 接线、刷新去重)无自动化覆盖,回归靠手测
- 中性:fixture 构造代码占测试体量约一半

## 来源

spec Testing Decisions(用户选定);tdd skill 的 seam 规则。
