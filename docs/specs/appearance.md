# 外观主题

> 关联: [features](../features/appearance.md) · 全 app UI token;产物 Markdown 跟 accent  
> 两维正交:**模式**(跟随系统 / 浅色 / 深色,默认跟随系统)× **配色**(紫(默认) / 雾蓝 / 琥珀褐)。  
> 最终视觉 = f(配色, 生效明暗);设置页与语言共用同一张偏好表,见 [i18n](i18n.md)。

## Problem Statement

App 需跟随 macOS 昼夜模式,并允许用户在多套 UI 强调色/纸感之间选择。现有 `theme.css` 已用 CSS 变量 + `prefers-color-scheme` 做昼夜,但只有固定品牌紫。用户要保留**现网默认紫**,并增加**雾蓝、琥珀褐**等阅读向方案;切换后**对整个 app 生效**(rail、列表、详情、抽屉、未来 Skill 预览等),而非局部皮肤。

## Solution

采用 **方案 B**:

- **方案维** `scheme ∈ { purple, blue, amber }`:**用户可选**,持久化到 app 自有存储。  
  - `purple` = 现网默认色板(浅 `#8a67ab` / 深 `#a084c7` 系)  
  - `blue` = 雾蓝  
  - `amber` = 琥珀褐  
- **模式维** `mode ∈ { system, light, dark }`:**用户可选**,默认 `system`,持久化到同一份 app 自有偏好。  
  `system` 是**策略而非快照**——选中它时明暗随 macOS 外观变化;选 `light` / `dark` 即锁定,系统再变也不影响,直到用户主动选回 `system`。  
- **生效明暗** `light | dark` = `f(mode, 系统外观)`,是最终落到渲染上的值;它本身不被持久化(持久化的是 mode)。  
- 最终视觉 = `f(scheme, 生效明暗)`。  
- **全 app** 只引用 CSS 变量;禁止组件内写死方案色。语义色(CC/CX、provider、ok/err)不随 scheme 改色相。

## User Stories

1. As a 用户, I want 在紫 / 雾蓝 / 琥珀褐之间选择外观, so that 可保留熟悉的默认紫,或改用更柔和的阅读向配色。  
2. As a 用户, I want 切换后**整个 app**立即换色且重启仍保留, so that 体验一致、不用每次重选。  
3. As a 用户, I want 浅/深默认跟系统外观, so that 与 macOS 其它 app 一致。  
3b. As a 在亮环境用深色系统的人, I want 把 app 单独锁成浅色, so that 不必为了这一个 app 去改整个系统外观。  
3c. As a 锁定了浅/深的人, I want 之后系统外观怎么变都不影响 app, so that 我的选择不被系统悄悄推翻。  
3d. As a 用户, I want 能重新选回「跟随系统」, so that 锁定是可逆的。  
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

**序列 B:明暗模式**

- B1 默认 `mode = system`;首次安装、无存储文件、字段非法或损坏 → 均落 `system`,不崩。  
- B2 `mode = system` 时,系统外观变化 → 界面明暗随之变化;`scheme` 不受影响。  
- B3 `mode = light | dark` 时,系统外观怎么变**界面都不变**。  
- B4 从锁定态切回 `system` → 立即按当前系统外观重新求值,不保留此前锁定的明暗。  
- B5 模式与配色**互相独立**:改模式不动配色,改配色不动模式;3 配色 × 2 生效明暗 = 6 种组合都须成立。  
- B6 模式与界面语言的两个「跟随系统」**互不干扰**:改系统语言只影响语言,改系统外观只影响明暗。  
- B7 切模式不触发全量重扫、不重载窗口。  
- B8 窗口 chrome 与 macOS 原生菜单**一并跟随**所选模式(由 `nativeTheme` 承担,见实现决策);不出现「app 内是深色、窗口边框还是浅色」的割裂。  
- B9 色板预览的取样**随生效明暗切换**:深色下三张配色卡应呈深色系,不得仍显示浅色取样(否则预览与实际观感不符)。

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
- D3 设置页「外观」段为**一张卡两行**:上行「模式」= 三段控件(跟随系统 / 浅色 / 深色),下行「配色」= 三张色板卡。两行以分隔线相接,标签在左、控件在右,与「语言」段同一形态。  
- D3a 配色卡为紧凑形态:**色块 + 名称**,不含整句描述;「默认为紫」这一信息移入该段下方说明文字。  
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
- **设置页顺序**:「语言」段在前,「外观」段在后。  
- **外观段**:一张卡两行——「模式」三段控件 + 「配色」三张色板卡(色块 + 名称,无整句描述),下接一段说明(明暗跟随规则、两维独立、默认为紫)。  
- 分段控件沿用既有 `.seg` 形态(外框 + overflow 裁剪 + 选中态 accent-soft),尺寸按设置页语境略放大于图表工具栏中的用法。  
- 点选即全 app 变色(含 rail 选中态),无保存按钮。  
- 色板取样按生效明暗两套,预览所见即所得。  
- Skill 预览抽屉布局仍为方案 A,见 skills-view。

## Implementation Decisions

- CSS:`html[data-scheme="purple"|"blue"|"amber"]` + 各 scheme 下 `@media (prefers-color-scheme: dark)`。  
- 启动设 `data-scheme`,缺省 `purple`。  
- 组件零方案分支,只写 `var(--accent)` 等。  

### 明暗模式由 nativeTheme 承担,CSS 零改动

- 主进程按偏好设 `nativeTheme.themeSource = 'system' | 'light' | 'dark'`。Electron 官方定义了这一属性与「Follow OS / Light / Dark」三态的映射,设为 `light`/`dark` 会**直接改变 `prefers-color-scheme` 的求值结果**,因此既有媒体查询无需改写即可跟随;macOS 上窗口边框与原生菜单也一并跟随。
- **明确不采用**渲染层自行计算明暗并写 DOM 属性(如 `data-theme`)的做法:那样需要每套深色值在媒体查询块与手动覆盖块各写一份(3 配色 × 2 = 6 份重复,改色必漏),窗口 chrome 也管不到,还多一处首帧闪烁风险。
- `themeSource` 须在窗口内容渲染前设定,避免首帧明暗跳变。
- 渲染层若需知道当前生效明暗(色板预览取样),读 `matchMedia('(prefers-color-scheme: dark)')` 即可——它会跟随 `themeSource` 变化,并可监听其 `change` 事件。
- 偏好存储:`mode` 与 `scheme`、`language` 同表,复用既有原子写与降级策略;单字段非法只降级该字段。

**遗留发现(不在本次改动面)**:`theme.css` 现有 4 组 `:root[data-theme='dark'|'light']` 规则(mark / 提问定位 / 风险横幅 / 轮内警告),排除 theme.css 自身后 git 全历史证明从未有任何代码设置过该属性,是**死代码**。采用 `nativeTheme` 方案后它们依然不会被触发。处置建议见「Out of Scope」。

## Testing Decisions

- Prefs:`scheme` 默认 `purple`、`mode` 默认 `system`;三值读写、损坏/非法回落;**单字段非法不牵连其他字段**。  
- 生效明暗推导为纯函数(`mode` + 系统外观 → `light|dark`),覆盖锁定/跟随/切回三条路径。  
- IPC 校验。  
- `data-scheme` 切换(轻测)。  
- 不测像素。  
- **已知测试缺口(不造假的绿)**:`nativeTheme.themeSource` 对窗口边框与 macOS 原生菜单的影响属于系统绘制,自动化测不到;可测的是"设了该属性"与"渲染层媒体查询随之改变",菜单与边框的实际观感只能人工验收。不得用前者冒充后者。

## Out of Scope

- 第四种方案、自定义色、主题市场。  
- 按时间自动切换明暗(日出日落 / 定时)。  
- 改 provider 品牌色、把 CC/CX 绑进 scheme。  
- 与 skill 业务逻辑耦合(只共享 token)。  
- **清理 `theme.css` 里 4 组死的 `:root[data-theme]` 规则**:证据已确凿(见实现决策),但删除波及 theme.css 四处不相邻区段,与本次改动面(设置页 + 主进程 themeSource)不重叠,按「既有 dead code 默认只提不删」暂留。已建票单独清理(含删除授权所需的完整证明与验收判据)。

## Further Notes

- **原型门(配色三选一部分):已过**(2026-08-06)。确认项:设置第三维 ⚙️;点选即全 app 变色、无保存按钮;三套均有 dark 表;CC/CX 语义色不随 scheme 改色相。  
- **原型门(明暗模式 + 紧凑布局):已过**(2026-08-08)。确认项:模式三段控件(跟随系统 / 浅色 / 深色);外观压为一张卡两行;配色卡**去掉整句描述**、只留色块 + 名称,「默认为紫」移入段末说明;色板取样随生效明暗切换。结论内联在「界面决策」;持久文档不挂原型路径指针。  
- 三配色 × 两生效明暗 = **6 态**手测;另加模式三态 × 系统外观两态的跟随/锁定矩阵。  
- 原型受载体限制用 `data-theme` 模拟明暗切换(浏览器里没有 Electron),**该做法不进实现**——实现走 `nativeTheme.themeSource`。

