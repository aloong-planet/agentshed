# 外观主题

> 关联: features 待建(`appearance`) · 全 app UI token;Skill 预览等同系  
> 状态:**第 2 步完成,原型门已过**(2026-08-06 用户确认),可切票/实现。  
> 方案 B — 用户可选外观方案 × 系统昼夜。  
> 方案枚举:**紫(默认)** / **雾蓝** / **琥珀褐**(2026-08-06 补默认紫)。

## Problem Statement

App 需跟随 macOS 昼夜模式,并允许用户在多套 UI 强调色/纸感之间选择。现有 `theme.css` 已用 CSS 变量 + `prefers-color-scheme` 做昼夜,但只有固定品牌紫。用户要保留**现网默认紫**,并增加**雾蓝、琥珀褐**等阅读向方案;切换后**对整个 app 生效**(rail、列表、详情、抽屉、未来 Skill 预览等),而非局部皮肤。

## Solution

采用 **方案 B**:

- **方案维** `scheme ∈ { purple, blue, amber }`:**用户可选**,持久化到 app 自有存储。  
  - `purple` = 现网默认色板(浅 `#8a67ab` / 深 `#a084c7` 系)  
  - `blue` = 雾蓝  
  - `amber` = 琥珀褐  
- **昼夜维** `light | dark`:**跟随系统** `prefers-color-scheme`(v1 不做强制浅/深)。  
- 最终视觉 = `f(scheme, systemAppearance)`。  
- **全 app** 只引用 CSS 变量;禁止组件内写死方案色。语义色(CC/CX、provider、ok/err)不随 scheme 改色相。

## User Stories

1. As a 用户, I want 在紫 / 雾蓝 / 琥珀褐之间选择外观, so that 可保留熟悉的默认紫,或改用更柔和的阅读向配色。  
2. As a 用户, I want 切换后**整个 app**立即换色且重启仍保留, so that 体验一致、不用每次重选。  
3. As a 用户, I want 浅/深自动跟系统外观, so that 与 macOS 其它 app 一致。  
4. As a 用户, I want 侧徽标(CC/CX)与 provider 图表色不随方案乱跳, so that 语义色保持可辨。  
5. As a 开发者, I want 新界面只绑 token 名, so that 加方案不必改组件。

## 失败模式与边界

**序列 A:选型与持久化**

- A1 默认方案 = **`purple`(紫)**(首次安装、无存储文件时 = 现网观感)。  
- A2 用户改为 `blue` / `amber` / 改回 `purple` → 立刻改 `document.documentElement.dataset.scheme`,并原子写入 userData。  
- A3 重启后读出 scheme;非法值/损坏文件 → 回落 **`purple`**,不崩。  
- A4 存储 = app `userData` 自有文件(与 `hidden.json` 同纪律:临时文件 + rename;**绝不写 agent 配置**)。字段 `scheme: "purple"|"blue"|"amber"`。  
- A5 切换方案不触发全量重扫、不重载窗口(只改 DOM 属性 + CSS)。  
- A6 **生效范围 = 整 app**:rail、Agents/Projects 主区、详情、会话页、toast、浮层/抽屉、设置页自身、未来 Skill 预览与 Markdown 预览中跟 accent 的部分。无「仅设置页换肤」的中间态。

**序列 B:昼夜**

- B1 浅/深**仅**跟随 `prefers-color-scheme`。  
- B2 v1 **不做**强制浅/深控件。  
- B3 系统外观变化时 CSS 自动切换;scheme 属性不变。  
- B4 窗口 chrome:v1 不单独定制 `nativeTheme` 主题源。

**序列 C:色板范围**

- C1 **跟 scheme 走**(每方案各有 light/dark 表):  
  `--bg/--card/--text/--text-2/--line/--line-strong/--accent/--accent-soft/--accent-deep`  
  及预览用 `--md-*`(若已落地)。  
- C2 **不跟 scheme 走**(语义/数据色;可有 light/dark,三方案相同):  
  - 侧徽标 CC/CX token  
  - provider `--p-*`  
  - `--ok-*` / `--err-*` / warn 语义(若与方案纸感冲突可微调亮度,色相不绑方案)  
- C3 `theme.css` 内写死 hex 的局部样式 → 收进 token,避免换方案漏色。  
- C4 Skill 预览与产物 Markdown:标题/链接等跟 `--accent` 系,与当前 scheme 一致。

**序列 D:设置入口**

- D1 Rail **第三维「设置」**(`Dim = agents | projects | settings`)。  
- D2 切到设置时主区为设置页。  
- D3 v1 设置页「外观」段:**三选一**(紫 / 雾蓝 / 琥珀褐)+「浅深跟随系统」。允许其它段占位,不造假功能。  
- D4 刷新钮仍在 rail 底部区;与设置入口分组。  
- D5 点选即时生效,无保存按钮。  
- D6 进出设置不丢 `selected` 项目。

**跨切面**

- R1 Prefs:主进程存 + IPC `getPrefs` / `setScheme`。  
- R2 契约:scheme 枚举三值;未知回落或拒绝写入。  
- R3 e2e:可选断言 `data-scheme` 切换。  
- R4 实现色值:紫 = 现 `theme.css` 浅深表;雾蓝/琥珀褐 = 原型已列浅深表。

## 界面决策

- **入口**:Rail ⚙️ 设置第三维。  
- **设置页**:「外观」→ 三张方案卡(名称 + 一句说明 + swatch)+ 脚注跟系统。  
- 点选即全 app 变色(含 rail 选中态)。  
- Skill 预览抽屉布局仍为方案 A,见 skills-view。

## Implementation Decisions

- CSS:`html[data-scheme="purple"|"blue"|"amber"]` + 各 scheme 下 `@media (prefers-color-scheme: dark)`。  
- 启动设 `data-scheme`,缺省 `purple`。  
- PrefsStore 仿 HiddenStore;仅 `scheme`。  
- 组件零方案分支,只写 `var(--accent)` 等。

## Testing Decisions

- Prefs:默认 `purple`、三值读写、损坏/非法回落。  
- IPC 校验。  
- `data-scheme` 切换(轻测)。  
- 不测像素。

## Out of Scope

- 第四种方案、自定义色、主题市场。  
- v1 强制浅/深。  
- 改 provider 品牌色、把 CC/CX 绑进 scheme。  
- 与 skill 业务逻辑耦合(只共享 token)。

## Further Notes

- **原型门:已过**(2026-08-06)。用户确认 `docs/prototypes/appearance/prototype-settings.html` 四项:  
  1. 设置第三维 ⚙️,外观三选一含默认紫  
  2. 点选即全 app 变色(rail / Agents / Projects 示意同步),无保存按钮  
  3. 浅/深跟随系统;三套均有 dark 表  
  4. CC/CX 语义色不随 scheme 改色相  
  结论已内联「界面决策」;持久文档不挂原型路径指针。  
- 三方案 × 两昼夜 = **6 态**手测(比双方案多两态)。  
- 切票建议:  
  1. Prefs + IPC + token 矩阵(紫/蓝/琥珀 × 浅/深)  
  2. Rail 设置维 + 外观三选一 UI  
  3. 硬编码收口;skills-view 预览跟 token  

