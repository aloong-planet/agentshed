# 项目详情

> 关联: [features](../features/project-detail.md) · ADR-0004(装卸边界) · ADR-0001 / ADR-0002
> 补建说明:本篇为 2026-08-01 spec 转持久产物后**逆向补建**。各分栏的组件级需求与边界在对应 spec(subagents-view / memory-view / plugins-view / skill-install / token-stats),本篇写**页面级**口径与**产物分栏**(产物是本页独有的能力)。

## Problem Statement

"这个项目装了哪些能力、有什么约定、沉淀了什么"是产品原点问题。答案散在项目目录、两侧全局配置与 agent 数据目录三处,且项目级与全局级同名时谁生效并不显然。

## Solution

以分栏回答:概览(默认落点,见 token-stats)、各组件的**生效视图**(项目级与全局层并列并标注遮蔽关系)、以及项目按八步流程沉淀的**产物**。全部只读,唯一写操作是项目级 skill 卸载。

## User Stories

1. As a 用户, I want 进入项目默认看到概览(用量与会话轨迹), so that 第一眼知道这个项目的活跃情况。
2. As a 用户, I want 各组件分栏以生效视图呈现(项目级/全局层、遮蔽标注), so that 我知道在这个项目里实际生效的是哪份定义。
3. As a 用户, I want 一处看全项目沉淀的产物并按类型筛选, so that 我不用在 docs/ 各子目录间翻找。
4. As a 用户, I want Markdown 产物就地阅读、原型用系统方式打开, so that 查阅不用离开 app,而原型能在浏览器里真正跑起来。
5. As a 用户, I want 失效项目仍能打开详情, so that 我能在删目录后确认它曾装过什么再决定清理。
6. As a 用户, I want 非八步项目的产物栏给出中性空态, so that 我不会把"没按这套流程做"当成错误。

## 失败模式与边界

**序列 A:页面构成**
- A1 分栏集合 = 概览 / Skills / Subagents / Plugins / MCP / Memory / 配置 / 产物;新增组件类型时在此扩展。
- A2 失效(stale)项目仍可打开:项目级内容为空态、全局层照常显示。
- A3 详情按需拉取(不进全景快照),拉取中显示读取态。
- A4 配置分栏:项目 CLAUDE.md / AGENTS.md 缺失显示"无"而非报错;超大截断。
- A5 详情抽屉宽度 = min(固定宽, **右侧内容区**宽度 × 80%)——内容区 = 视口减去左侧固定件(rail;Projects 维度还有项目侧栏)。此前按视口百分比算,窄窗时抽屉盖满整个内容区、失去"抽屉"语义(2026-08-02 bug);维度切换时左侧固定件宽度随之变化,算式必须跟着变。

**序列 B:产物分栏**
- B1 **六类产物**,展示顺序按自顶向下的推导链固定:**CONTEXT.md → ADR → specs → prototypes → features → postmortems**(术语与不变量 → 架构决策 → 需求与边界 → 界面形态 → 当前能力 → 事后教训)。筛选 chips 同序,「全部」置首。
- B2 各类的来源:CONTEXT.md 取项目根同名文件;adr/specs/features/postmortems 取 `docs/<类型>/*.md`;prototypes 递归取 `docs/prototypes/**/*.html`。
- B3 索引文件不是产物:各目录下的 `README.md` 不计入。
- B4 prototypes:排除画廊壳(根 `index.html`)与 `vendor/`;模块内 `index.html` 用目录路径作名,其余用文件名。
- B5 标题取 md 首个 `#` 标题;无标题用文件名兜底。
- B6 列表按修改时间**全局倒序**(跨类型),类型 chips 只筛不改序。
- B7 项目无 `docs/` 目录 → 空数组 → 中性空态文案("未按约定沉淀",不视为错误)。
- B8 某类无产物但其它类有 → 该类 chip 筛选后显示"该类无产物"。
- B9 Markdown 点开就地阅读(相对路径图片按产物所在目录解析);prototypes 的 HTML 交系统默认方式打开(它要真跑)。
- B10 `.scratch/` 天然不在 `docs/` 下,不计入产物(tickets 是施工文档,见 specs/README 的分工)。

**跨切面**
- R1 产物文件的读取/外开走白名单(只有详情列出过的文件可读),堵任意路径读取口。
- R3 **渲染出的 markdown 链接一律不得让整窗导航**(dev 下回落 index.html 表现为"退回主页",打包版留白屏,两者都丢光 app state)。产物间交叉引用(如 spec ↔ features)在阅读器内跳转,目标不在白名单则提示;外部 http(s) 交系统浏览器。主进程 `will-navigate` 兜底守卫覆盖所有渲染点(含未来新增的)。
- R2 新增产物类型时:类型枚举、读取来源、展示顺序、chips 标签四处同步(漏一处即出现"扫到了但不显示"或"显示了但点不开")。

## Implementation Decisions

- **产物类型顺序**:以常量顺序为单一出处,读取与 UI 同源,避免两处各排一次。
- **详情拉取**:按需 IPC,不进全景快照(项目多时快照不膨胀)。
- **白名单**:详情返回时把产物与 memory 文件路径登记进白名单,读取/外开都校验。

## Testing Decisions

沿用 ADR-0002 双 seam:providers 层 fixture 单测覆盖六类识别、README 排除、prototypes 递归与排除规则、标题兜底、无 docs 目录空态;类型顺序作为契约在单测中固定(防止顺序被无意改动)。UI 的 chips 筛选与阅读浮层不单测,靠 e2e 与手测。

## Out of Scope

- ~~会话内容渲染(仅元数据)~~(2026-08-06:已由 `docs/specs/session-view.md` 全量落地,移出本 spec 边界)。
- 产物的编辑与新建(只读查看)。
- 跨项目的产物聚合(裁定为伪需求,见 CONTEXT.md 已消解歧义;跨项目检索的归宿是未来的全局搜索)。
- 产物内容的全文检索。
