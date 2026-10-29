# Reviewer notes: prototype-detail.html

## Question

The page prototypes the project detail page (feature: project detail; its Overview follows token stats, and
its tabs follow the skills, subagents, plugins, memory and session views). It answers how a registered
project's page reads once opened: the header (the project's name, a chip for every side the project is
registered on, its path, the startup status) and the nine tabs — 「概览」, Skills, Subagents, Plugins, MCP,
Memory, 「会话」, 「配置」 and 「产物」, landing on 「概览」. In particular:

- whether the Overview holds as the first look at a project: the four time-window cards that are themselves
  the window selector, the composition bar below them, the per-side row, the 30 / 60 / 90-day trend with its
  side switch, the by-model breakdown of the selected window, and the recent-sessions card with the total
  under it;
- how the effective views are grouped: Skills by level and side, with the shared `.agents/skills` group
  between the Codex and Antigravity groups and the plugin-bundled group last; Subagents by level and side,
  with project-level shadowing on the Claude and Codex sides; Plugins by side, the Claude group showing this
  project's effective enabled set and the layer that decided it; MCP servers labelled by source; Memory's
  main file rendered in place, with its topic files opened in the file drawer; Configuration's two files,
  each headed by its path;
- how the 「会话」 tab's list, its sort and its search, with hits grouped by session, read;
- whether 「产物」 as type chips over one flat list, read in an overlay, is clear.

The mock project, Transfer, is registered on all four agent sides: Claude Code, Codex, Grok and Antigravity.

## Structure basis

- App window, rail and project column: the shared app window, rail and project column, as in the project
  list prototype (项目图鉴列表) with the same mock projects; the rail has Projects selected and the column
  has Transfer selected.
- The set of tabs and their order: the sections the project-detail spec's sequence A lists.
- The time-window cards, the composition bar, the per-side row and the by-model breakdown: the shared
  totals-card block, in the same form as the Agents page prototype (Agents 全局页), at project scale.
- The trend chart with its 30 / 60 / 90 choice in the heading, side switch, axis and legend: the shared
  trend-chart block, as on the Agents page prototype.
- The startup status hint after the side chips: the shared startup-status block, as on the Agents page and
  project list prototypes.
- The 「会话」 tab's search row and hit rows: the shared session-hits block, drawn the same as in the global
  search prototype (全局搜索). Session rows, recent-session rows and hit rows open the session page
  prototype (会话页).
- The Subagents drawer, and the Configuration entries headed by their path: the same form as the Agents page
  prototype.
- The Memory file drawer: the shared file drawer around the shared Markdown preview block, the same form as
  the skill file drawer of the Skills package preview prototype (Skills 包预览) and the Agents page's memory
  drawer; a link that cannot be followed shows the shared toast.
- The shared `.agents/skills` group, its CX and AG badges and its place between the Codex and Antigravity
  groups: the direction skills-view::REQ-002 records.
- Colours: the shared theme's tokens, for every palette and both modes. Copy used by two or more pages: the
  shared copy table.

## Demo scaffolding

The floating bar headed 「Demo ·」 is demo scaffolding — not part of the design; do not implement. The app has
none of its switches. Its groups:

- 「启动恢复」 — 「扫描中」 / 「完成」 / 「失败」, in every tab. In the app, whether this startup's scan is still
  running, and the scan's result, decide it.
- 「会话分栏」 — 「有会话」 / 「空态」, in the 「会话」 tab only. In the app, the number of sessions the scan
  found for the project decides it.
- 「Memory file read」 — 「read」 / 「loading」 / 「could not read」 / 「empty file」, in the Memory tab only,
  applied to every file the memory drawer opens. In the app, the result of reading the file the drawer opens
  decides it.
- The note lines under the groups, which say the above on the page.

Reviewer annotations drawn inside the page are not part of the design either; do not implement them:

- the parenthesis after 「最近会话」 on the Overview: 「(上限 5 条;subagent 与预热会话计 token 但不单独入列)」;
- the Memory tab's two notes, 「主文件里的相对链接指向同目录 topic 文件:…」 and 「无记忆时显示空态;…」;
- 「(缓存目录非空才显示本组)」 after the CODEX chip on the Plugins tab;
- the MCP description 「示意:项目级 MCP,受 enabled/disabled 开关控制」;
- 「非八步项目在此显示「未按约定沉淀」空态(不视为错误)」 under the 「产物」 list, and the reading overlay's meta
  line after 「Transfer ·」;
- remarks in parentheses inside mock text, such as 「(Codex 侧全局,与 Claude 侧各自成行)」 in a Subagents
  description, 「(mock 略)」 in drawer bodies and 「(只读渲染,滚动容器内)」 in a Configuration body.

## Uncovered dimensions

- Interface language: drawn in Chinese and English. Any other language shows as English, with the notice the
  dimension script adds.
- The demo bar, the reviewer annotations and the mock data (project, skill, file and model names, session
  titles, descriptions, question text, file bodies) are not translated: they read the same in every language.

## Invalidated conclusions

- **Skills tab, its rows**: each row is drawn as a name, a level or symlink pill and a description, with no
  expansion arrow, package stats, preview or Uninstall control, and the tab has no filter. The row, its
  expansion, its drawer and the filter are the ones the Skills package preview prototype (Skills 包预览) draws
  for the project detail Skills section; uninstalling is the one the skill install prototype
  (Agents·Skills 装卸交互) draws; and the skills-view spec's UI decisions define the row, which shows no
  description. The groups, their order and their counts on this page still hold.
- **Plugins tab, the row expansion**: a row expands into sections of chips, the installation records among
  them, and the CODEX row does not expand. The plugins-view spec defines the row (installation record chips
  on the row itself) and the expansion (category tabs — Skills, Subagents, Hooks, MCP, with no tab for an
  empty category — whose Skills tab is a previewable row list; in the Codex group the Skills category
  expands), the form the plugin skill preview prototype (Plugins·插件 skill 原地预览) draws on the Agents page.
- **MCP tab, the Antigravity rows**: they are drawn inside the one MCP card, with a command or a URL as the
  description. Antigravity's servers form a group of their own, shown on a project's page only when agy has
  servers (project-detail::REQ-002/AC-03 and its failure modes), and a server row shows its name, its
  source, the Disabled pill and, for a plugin's server, the note naming the plugin — never a command or URL
  (agents-overview spec, failure modes of the Antigravity side on the agents page).
- **Subagents tab, the drawer of an Antigravity definition**: the drawers of demo-agent and release-checker
  leave out some of tools, subagent, mainAgent and model. Every Antigravity definition's drawer lists all
  four, each "—" when absent (subagents-view::REQ-001, failure modes).
