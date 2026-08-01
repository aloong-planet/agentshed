# Electron 安全清单 · 本项目现状台账

对照 Electron 官方 "Checklist: Security recommendations"(20 条)的**逐条判定**。清单本身与判据见 `electron-scaffold` skill 的 `electron-security.md`;本文件只记**本项目做到了什么、在哪、怎么验**。

- 全条过检日期:**2026-08-02**(Electron 43.2.0)
- 重过时机:改主进程窗口/会话/协议/IPC 配置、升 Electron 主版本、引入新的"渲染他人内容"能力

| # | 条目 | 本项目状态 | 位置 / 验证 |
|---|---|---|---|
| 1 | 只加载安全内容 | **不适用** | 纯本地应用,不加载远程内容 |
| 2 | 远程内容不开 nodeIntegration | ✅ 默认 + 无远程内容 | `createWindow` webPreferences |
| 3 | contextIsolation | ✅ 显式开 | 同上 |
| 4 | sandbox | ✅ 显式开 | 同上 |
| 5 | 权限请求 | ✅ 请求与查询**全 deny** | `security.ts installPermissionGuards` |
| 6 | 不禁用 webSecurity | ✅ 未动默认 | — |
| 7 | CSP | ✅ 响应头注入,两档策略 | `security.ts cspFor/installCsp`;单测锁 prod 无 unsafe-eval、`img-src` 不含 http(s) |
| 8 | allowRunningInsecureContent | ✅ 默认关 | — |
| 9 | experimentalFeatures | ✅ 默认关 | — |
| 10 | enableBlinkFeatures | ✅ 未用 | — |
| 11 | webview allowpopups | ✅ 未用 webview | — |
| 12 | webview 校验 | ✅ 预防性拦截 | `installNavigationGuards` 里 `will-attach-webview` 删 preload/关 node/preventDefault |
| **13** | 限制导航 | ✅ `will-navigate` **+ `will-frame-navigate`**,挂 `web-contents-created` | `security.ts`;`isAppUrl` 比 origin 不用 startsWith;单测覆盖前缀相似绕过 |
| **14** | 限制新窗口 | ✅ 无条件 deny,白名单交系统浏览器 | 同上 |
| **15** | openExternal 已校验 | ✅ `new URL()` + **协议白名单** | `externalOpenTarget`;单测覆盖大小写/userinfo/危险协议 |
| 16 | 跟最新 Electron | ✅ **43.2.0**(2026-08-02 从 35.7.5 升级) | 升级后已重跑全量 verify + 打包 + fuses 校验。**勘误**:fuse wire 长度由 8 增至 9(Electron 41 追加 `wasmTrapHandlers` 于 index 8),前 8 位**位置未变**故 6 条断言仍成立;fuses.json5 明载"只追加不重排",按下标读长期安全 |
| **17** | IPC sender 校验 | ✅ 全部 handler 经 `handle()` 包装器 | `index.ts handle()` + `assertTrustedSender`;**包装器保证新增 handler 自动受校验** |
| **18** | 避免 file:// | ✅ 渲染页跑 `app://bundle` | `app-protocol.ts`;单测覆盖编码穿越;e2e 断言打包版 URL 以 `app://` 开头 |
| **19** | Fuses | ✅ 6 项 | `electron-builder.yml electronFuses`;`scripts/check-fuses.mjs` **读产物二进制**校验 |
| 20 | preload 不裸暴露 API | ✅ 暴露包装函数,回调丢弃 `IpcRendererEvent` | `preload/index.ts`(核实无需改动) |

## 固化的门禁(工具不可靠,这才是防线)

| 层 | 内容 |
|---|---|
| 单测 | `src/main/security.test.ts`(15 例:导航放行/外链白名单/IPC sender/CSP 四档)、`src/main/app-protocol.test.ts`(7 例:路径解析与编码穿越) |
| e2e | 打包版 URL 必须 `app://`;文档内链接点击后**窗口 URL 不变**;新分栏全链路无主进程报错 |
| 打包 | `node scripts/check-fuses.mjs` 读 Electron Framework 二进制的 fuse wire,与 `electron-builder.yml` 期望值比对 |

## 待办(不在本次改动面,已定归宿)

- **`grantFileProtocolExtraPrivileges` fuse 仍为 ENABLED**(index 7)。本项目已完整满足 #18(打包版走 `app://bundle`、dev 走 http、代码内无 `file://` 页面加载),官方对这种形态建议关掉此 fuse。**影响面**:它约束的是"从 `file://` 加载的**页面**"的额外特权;`app-protocol.ts` 在主进程内用 `net.fetch(file://…)` 读盘属另一条路径,理论上不受影响,**但须实测验证而非推断**。**建议**:另开任务(改 electron-builder.yml 一行 + 打包 e2e 验证 app:// 与读盘均正常 + 更新本台账),不在安全清单这轮顺手改。
- **Electron 44 的前瞻命中**:渲染进程 `clipboard` 模块将被移除(40 已废弃)。本项目当前未在渲染层用 clipboard;将来若加"复制内容"功能,直接走 preload + contextBridge 或 W3C Async Clipboard API。

## 已知取舍

- **CSP 的 dev 档放宽**(`unsafe-inline`/`unsafe-eval`/`ws:`):vite HMR 必需,仅 dev 生效,打包产物用严格档。
- **`isAppUrl` 的 prod 分支同时接受 `app:` 与 `file:`**:后者覆盖 devtools/内部页等边缘载入,它们不承载本 app 的 IPC 面。
- **`will-frame-navigate` 是官方清单的缺口**(清单只提 `will-navigate`,而它只管主框架),本项目两者都挂。
