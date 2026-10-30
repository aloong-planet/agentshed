# Reviewer notes: prototype-session.html

## Question

What the session page looks like once a session is opened: the session view (session-view spec), with the way
back from a global search hit (global-search spec, global-search::US-003). The page answers:

1. Is the question list, a dense single-line index listed in full, easy to scan at real lengths? The mock
   sessions hold 42, 26, 18, 6 and 4 questions, across one or two days.
2. Does a turn expanded in place (thinking or reasoning, prose, collapsed tool blocks, subagent blocks) read as
   clear layers rather than a muddle?
3. Are the sides' unequal completeness and the parts that cannot be recovered (Codex's encrypted reasoning, a
   truncated tool result, an uncertain fork strip, unrecognised records) labelled visibly enough, without
   pretending the sides match or that anything is complete?
4. Is the header clear in each state: the single back control, or for a session opened from a global search hit
   the two exits; the side badge, the title and the startup hint; the meta line ending in the session ID; and
   the three buttons (copy the session ID, show the record file in Finder, copy the resume command) with their
   instant tooltip, the warning for a stale project, the form when the ID cannot be read and the failure toasts?
5. Do the session banners (Claude Code branch points; a Codex fork stripped, or stripped uncertainly; an
   Antigravity fork stripped, or its source no longer on this machine), the in-turn fetch states (fetching,
   rebuilding the index, a turn that fails, an empty turn) and a search hit's locating highlight read clearly?

The interface copy, the startup hint included, follows the chosen language. The session content (titles,
questions, answers, thinking, tool and subagent summaries, arguments and returns) is mock data and shows as
written in either language.

A project's session list and its session search are drawn on the project detail prototype (prototype-detail),
on its Sessions tab, not here.

## Structure basis

- The app window, the rail with Projects selected and the project sidebar with Transfer selected: the shared app
  frame and the shared project sidebar, the same sidebar and mock projects as the projects list prototype
  (prototype-list); clicking a project that has a prototype opens it. Drawn as context.
- The page's container (a session page in the project's place, each turn expanded in place under its question)
  and the question list as a single-line index with day groups and the ascending / descending segment: the
  direction confirmed for the session view (session-view spec, UI decisions).
- The exits row: the single back control "返回 Transfer · 会话"; for a session opened from a global search hit,
  "返回搜索结果" with a left chevron, then "进入 Transfer · 会话" with a right chevron: confirmed with global search
  (global-search spec, global-search::US-003).
- The startup hint beside the title: the shared startup-status piece, the inline scanning form the page headings
  draw.
- The session ID at the end of the meta line and the three buttons at the right end of the title row: confirmed
  for the session page header (session-view spec, UI decisions: the session page header). The buttons take the
  stale note's copy-button geometry (prototype-detail-stale-note); their tooltip takes the dark tooltip form of
  the settings prototype (prototype-settings), with the floating layers' shared shadow; a failure shows in the
  shared error toast.

## Demo scaffolding

The page's language, light/dark and palette follow the gallery's settings and the settings prototype; the page
has no switch of its own for them.

The demo bar at the bottom (`data-demo-harness`, its "Demo ·" tag, its groups and its note lines): not part of the
design; do not implement. The app has none of these controls. Each group, and what decides it in the product:

- 启动恢复 (扫描中 / 完成 / 失败, from the shared startup-status piece): this launch's scan, its progress and its
  result.
- 会话数据 (Claude 主会话 / Codex fork / Codex fork·父会话缺失 / Antigravity fork / Antigravity fork·来源已不在本机 /
  Grok 会话): the session that was opened, including whether a Codex fork's parent is in the scan set and whether
  an Antigravity fork's source is still on this machine.
- 项目目录 (存在 / 已不存在(失效项目)): whether the project's directory still exists at the scan. Choosing
  已不存在 also switches 打开来源 to 全局搜索, and choosing 项目 there switches back to 存在, since a stale project's
  sessions open from global search only.
- 会话 ID (已记录 / 记录里没有): the session's record; "记录里没有" also stands for a page restored from a copy saved
  before session IDs were kept, until the first scan refreshes it.
- 项目路径 (Transfer / 实测最长(97 字符)): the project's directory; the second option is the longest project path
  measured on this machine, to show how the resume tooltip wraps.
- 外部操作 (成功 / 记录文件已不存在 / 剪贴板写入失败): the system, at the moment of the click: whether the record
  file is still there when Finder is asked to show it, whether the clipboard accepts the copy. The page never
  copies anything or opens Finder.
- 取回状态 (索引就绪 / 索引失效 / 单轮失败): the signature check (path + mtime + size) made before a fetch, and the
  turn's read result.
- 打开来源 (项目 / 全局搜索): where the session was opened from.
- 搜索定位 (the action 跳到 05 并高亮): clicking a search hit, in a project's Sessions tab or in global search, which
  opens the session at that question.
- The bar and its note lines are in Chinese in either language.

Other demo-only behaviour and notes, not part of the design; do not implement:

- Clicking the parent's title in a fork banner while 打开来源 is 全局搜索 switches the header to the single back
  control and the bar to 项目; the mock stays on this session's content. In the product the click opens the
  parent's page, which has the single back control.
- Mock completeness: only some turns carry constructed content (the Claude Code session's turns 01, 02, 03, 07, 15
  and 16; the first three turns of each Codex session and the Codex orphan's turns 25 and 26; the Antigravity
  fork's first three turns). The others are filler turns: a one-line answer and tool rows. A filler turn's tool
  body shows the dotted note beginning "本原型只为标注的几轮构造了完整入参/返回", and its subagent block shows
  "(填充轮)" placeholders. In the product every block shows what the record holds. These notes are in Chinese in
  either language.

## Uncovered dimensions

- The project name: the mock project is Transfer, so the exits row with a long project name, each exit cut with
  an ellipsis (global-search spec, J11), is not drawn.

## Invalidated conclusions

- The thinking blocks in the Claude Code session's constructed turns, with a body and the summary "明文可得":
  Claude Code's records carry no thinking body, so a Claude Code turn shows no thinking block (session-view spec,
  C6). The thinking block's form holds; it is what an Antigravity turn shows (session-view::REQ-004/AC-04).
- The inner steps in the subagent blocks (the numbered step list, and the step count in the block's summary
  line): a subagent's own steps cannot be attributed to its dispatch on any side, so the block shows the dispatch
  prompt, a note that the inner steps are not shown, and the return (session-view spec, C3; REQ-004/AC-05 and G4
  for the Antigravity and Grok sides).
- The warning under the truncated tool result in the Claude Code session's turn 07 (the `xcrun notarytool log`
  block), where it says the record has no reference chain to the original under `tool-results/`, so the original
  cannot be located: the truncated return names the original's full path, and the product does not read the
  original; it shows the truncated version with a label saying so (session-view spec, C7).
- The warning in the Codex reasoning blocks, where it sets the headings against Claude Code's plain-text
  thinking: Claude Code's records carry no thinking body (session-view spec, C6). The rest of the warning holds:
  the reasoning body is encrypted and never obtainable, and the headings are all the record has.
