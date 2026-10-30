# Reviewer notes: prototype-agents.html

## Question

How the Agents page — the default landing page, opened from the icon rail's Agents entry and drawn full width
beside the rail — gathers the global picture of every agent side (Claude Code, Codex, Grok, Antigravity) onto one
screen, in the Agents overview feature, when the sides' components are not symmetric: plugins are read on Claude
Code, on Codex (a cache listing with no enablement) and on Antigravity, and not on Grok; MCP servers come from a
different file on each side that has them, and from plugins; memory is read on Claude Code and Codex only; the
configuration files are named by file, not by side. The page answers the form of:

- the page head: the title row with the scanning hint inline; the four time-window totals cards (all history,
  today, the last 7 days, the last N days), which are the window selector; the composition bar under them (cache
  reads, uncached input, output); one side card per side, with its detection, its usage in the selected window and
  its project / global skill / subagent counts;
- the Antigravity side card's third line when the scan left conversations unread — 「3 个对话读不出」 in the
  warning colour, with its hover text, the figure above it unchanged;
- the tabs Token / Skills / Subagents / Plugins / MCP / Memory / 「配置」 and how each lays out the sides;
- Token: the daily trend chart stacked by provider, with its inline 30 / 60 / 90 span choice and its 「合计」 /
  per-side switch, the days outside the selected window dimmed; the per-model rows of the selected window; every
  figure the window governs moving with it together; a window with no usage (today empty while history is not, or
  no records at all);
- Subagents: one merged list whose rows open the definition in a drawer, the drawer switching between the sides
  that define the name;
- Memory: rows expanding into their file lists; the Codex memory states; the memory file drawer — the file
  rendered as Markdown with its front matter as a key-value card, the raw / preview switch, links to the
  directory's other files switching the drawer, other links going to the browser or raising the error toast, and
  the read states inside the same frame;
- Plugins grouped by side, and MCP grouped by side and by source;
- 「配置」: the two entries CLAUDE.md and AGENTS.md, the latter rendering every global AGENTS.md that exists one
  after another, each under its path, and 「无」 when none exists;
- the startup skeleton drawn in the same place before this launch's first snapshot: the static labels rendered,
  a placeholder in every data slot, the controls under the head refusing input while the rail stays live, and the
  fill replacing the placeholders with no vertical shift.

The same sections on a project's own page are prototyped by the project detail prototype (prototype-detail.html);
installing a global skill into a project, by the skill install prototype (prototype-install.html).

## Structure basis

- The app window and the icon rail with Agents current: as every prototype page draws them (the shared app window
  and rail pieces).
- The totals cards with the composition bar, and the trend chart with its span choice: the shared totals card and
  trend chart pieces, which the project detail prototype draws on a project's overview.
- The scanning hint in the title row: the shared startup status piece, as the project list, project detail,
  session view and global search prototypes draw it.
- The startup skeleton: drawn from the app's Agents startup skeleton — which placeholder each data slot holds, and
  its size — with the placeholders of the shared startup skeleton piece.
- The memory file drawer: the shared file drawer around the shared Markdown preview block, the form the skill file
  drawer has on the skills view and plugins view prototypes; its error notices are the shared toast.
- The side badges and chips (CC CX GK AG; CLAUDE CODE, CODEX, GROK, ANTIGRAVITY) and their colours: the shared
  theme's side colours, as on every prototype page. The Grok badge slot of the Skills list follows the app's Agents
  · Skills list.

## Demo scaffolding

The interface language, light/dark and the colour scheme follow the gallery's settings and the settings prototype;
the page has no switch for them. The demo bar, the reviewer annotations and the mock data (names, paths,
descriptions, file contents) stay as written in every language.

- The floating demo bar (「Demo ·」) and its six groups — not part of the design; do not implement. Its note lines
  say what decides each state in the product and that the app has no such switch.
  - 「启动」 — 骨架 / 扫描中 / 完成 / 失败 (the shared startup status group), always shown: decided by whether the
    renderer has received this launch's first snapshot, and by the scan's result. 骨架 swaps the page for the
    skeleton and hides every other group.
  - 「Antigravity unreadable」 — none / 3 conversations, shown outside the skeleton: decided by how many
    Antigravity conversations the scan could not read.
  - 「用量」 — 有数据 / 本日无用量 / 全空, shown on every tab outside the skeleton: decided by the token usage recorded
    on this machine (whether any is recorded, whether today has any). The state reaches the trend chart as well
    as the cards and the model rows.
  - 「AGENTS.md files」 — two exist / all three / none, on the 「配置」 tab only: decided by which of
    `~/.codex/AGENTS.md`, `~/.gemini/AGENTS.md` and `~/.gemini/config/AGENTS.md` exist.
  - 「Codex 记忆」 — 开·有内容 / 开·无内容 / 关·无内容 / 关·遗留文件, on the Memory tab only: decided by
    `features.memories` in Codex's `config.toml` and by the files in its memory directory.
  - 「Memory file read」 — read / loading / could not read / empty file, on the Memory tab only: decided by reading
    the file the drawer opens; here one state applies to every file.
- The 「装卸交互演示 ↗」 link in the Skills tab's hint row: a jump to the skill install prototype — not part of the
  design; do not implement. In the product a global library row carries the 「安装到…」 button.
- The remark 「(缓存目录非空才显示本组)」 after the Plugins tab's CODEX heading, and the line
  「文件内容按需读取,不进快照。」 under the Memory list: reviewer annotations — not part of the design; do not
  implement. In the product the Codex group shows only when its cache directory is not empty, and a memory file's
  contents are read when the file is opened.
- Remarks in parentheses inside the mock texts, such as 「(mock 略)」, 「(只读渲染)」, 「(单侧条目示例)」 and
  「(Antigravity 单侧条目)」: reviewer annotations inside the mock data — not part of the design; do not implement.

## Invalidated conclusions

- The Skills tab's rows, namely the 「各侧有差异」 pill and the description after the badges: cannot be trusted.
  Authoritative: the skills view spec (no cross-side difference badge; a list row shows no description and carries
  the expansion arrow, the side badges, the source and symlink pills, the package stats and the install button) and
  the skills view prototype (prototype-skills-preview.html), which draws the row.
- The Plugins tab's expansions, namely a row opening into stacked sections of chips (install records, bundled
  skills, MCP servers, hooks) and the Codex rows not expanding: cannot be trusted. Authoritative: the plugins view
  spec (category tabs Skills / Subagents / Hooks / MCP with no tab for an empty category, the Skills tab a row list,
  the Codex group expanding to its Skills tab only) and the plugins view prototype
  (prototype-plugin-skill-preview.html).
- The MCP tab's row descriptions that show a configuration section, a command or a URL
  (「[mcp_servers.node_repl]」, 「node /usr/local/bin/sqlite-mcp-server.js」, 「https://api.githubcopilot.com/mcp/」):
  cannot be trusted. Authoritative: the agents overview spec — a row is the server's name, its source, the Disabled
  pill when its configuration disables it and, for a plugin's server, the note naming that plugin, in one row form
  for every side's group; no row shows a command or URL.
- The Memory tab's 「已隐藏」 pill on the practice-vpn row, and 「已隐藏」 in the tab's hint line: cannot be
  trusted. Authoritative: ADR-0022 (there is no manual hiding) and the memory view spec (a stale project keeps its
  「失效」 badge).
- **Code in the rendered Markdown preview** (the shared preview piece): its keywords, strings and comments are
  coloured; they cannot be trusted. Authoritative: the appearance spec, E7e — code takes one text colour, with
  no syntax colouring.
