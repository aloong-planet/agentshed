# ADR-0001: IPC 契约单一类型源与双侧运行时校验

- 状态: 已接受(2026-07-30)

## 背景与问题

主进程与 renderer 各自持有消息形状副本时,契约漂移在运行期表现为静默的 undefined 渲染(Transfer 项目曾为此做过整轮收敛)。Agentshed 的快照结构会随功能票持续扩展,需要漂移在边界即刻暴露。

## 备选项

1. **shared 三件套:类型(domain)+ channel(ipc)+ 手写结构校验(validate),主进程出口 assert、preload 入口 check 双侧把关**
2. 引入 zod 等 schema 库——否决:校验面只有一个快照与少量参数,为此引入运行时依赖与双份 schema 定义不划算
3. 只靠 TypeScript 类型不做运行时校验——否决:IPC 越过类型边界(structured clone 的 unknown),漂移会静默通过

## 决策

选定**方案 1**:我们把 IPC 的 channel 名、领域类型、结构校验器全部收在 `src/shared/`,两端只从此处导入;快照在主进程发出前 assert、在 preload 收到时 check,校验失败抛错并带字段路径。

## 后果

- 正面:契约破坏在边界第一时间炸出且可定位;类型只有一份,漂移无处藏身
- 负面:每扩展一次快照要同步改 validate(手写校验有维护成本)
- 中性:校验是结构级(字段与类型),不做语义级(数值区间)

## 来源

Transfer ADR「消息领域模型收敛为单一数据源」的教训;本仓库 spec Implementation Decisions。
