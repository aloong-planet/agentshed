# 缓存结构变更未升版本导致启动崩溃(2026-07-30)

## 现象

打包版启动后 `agentshed:get-snapshot` 抛 `TypeError: Cannot read properties of undefined (reading 'length')`(combine 内),快照无法返回,UI 停在扫描态;同一份代码在开发机跑 dev 却正常。

## 根因

token 缓存里存的是 `FileAgg` 的**结构体**。Codex 侧的 agg 在同一天内从 `{ totals, byDay }` 改成了 `{ events }`(为实现 fork 重放剥离),但 `CACHE_VERSION` 仍是 2 —— 旧缓存因此被判定为"命中",直接当新结构使用,`a.events` 为 undefined,`.length` 即崩。

## 为什么没被测住

三层都漏:

1. **单测**用临时 cacheDir,每次都是空缓存 → 只覆盖"冷启动"与"同结构幂等",从不构造"旧结构缓存 + 新代码"。
2. **dev 冒烟**跑在真实 userData 上,而开发机的缓存在改动过程中已被新代码重写过一遍 → 恰好是新结构,复现不了。**冒烟脚本的环境状态依赖是它的固有盲区**。
3. **没有 e2e**:主进程 IPC handler 的异常只出现在主进程 stderr,单测与冒烟都没有断言这条通道。

## 固化的防线

- `CACHE_VERSION` 常量旁写明"改动 FileAgg 形状必须同时升此号",并在 loadCache 处按常量比对。
- 版本之外再加 `isWellFormedAgg` 形状校验:同版本内的损坏/漂移条目一律当未命中重算,缺字段不再流进聚合层。
- 单测新增两例:旧结构缓存不崩且按新结构重算;缓存内容为垃圾时全量重算。
- 新增 **e2e**(Playwright 驱动真实 Electron,独立 userData 可预置缓存):其中一例专门预置旧结构缓存启动,并断言主进程 stderr 无 `Error occurred in handler` / `UnhandledPromiseRejection` / `TypeError`。
- 冒烟脚本收进 `scripts/smoke.sh` 并加错误检测;脚本头注明"环境状态依赖,迁移类场景归 e2e"。
- 验证网关合为 `pnpm verify` = typecheck + 单测 + e2e + 冒烟。

## 教训

持久化的是**结构**而非标量时,结构定义与版本号是同一次改动的两半;只改一半就是留了一颗定时炸弹。而"我本地跑得好"恰恰是这类 bug 的典型症状——因为本地状态已被自己的新代码洗过一遍。
