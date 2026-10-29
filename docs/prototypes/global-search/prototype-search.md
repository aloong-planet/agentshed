# Reviewer notes: prototype-search.html

## Question

Does a page of its own that searches the questions of every project's sessions, listing the hits grouped by
project and then by session, answer "which session, in which project" at a glance, while a project's own session
search stays the place for answers and tool output? The feature is global search (global-search spec): search the
questions everywhere, then go straight to the session inside its project.

The page draws the idle hint, the results, the no-hit line, the reading state, the failure line and the
no-session state, and the startup scan's restore states in the header's hint slot. The mock's projects are the
shared project column's, the stale `removed-experiment-2025` among them; its sessions come from Claude Code, Codex,
Grok and Antigravity CLI, the Antigravity CLI one under agy's own English title and marked as a stripped fork; the
`RAG` sample has a long session title, and the `notarize` sample has a question whose keyword lies past the line's
cut, beside others whose keyword is already in view.

Not screens of this page, so not drawn here: the Edit menu's "搜索会话… ⌘⇧F" / "Search Sessions… ⌘⇧F" entry,
which opens this page and puts the focus in its box; the project list scrolling the selected project into view on
arrival in Projects; and the arrival highlight on the session page, which is the session page prototype's.

## Structure basis

- The frame: the Agents page's (the rail, a header over a scrolling body, no project column), as the Agents page
  prototype (prototype-agents) draws it; the search row sits in the header, so it stays in view while the results
  scroll (global-search::REQ-005).
- The rail, with the Search item third in its top group below Projects, drawn with the magnifier: the shared rail.
- The results grouped by project, each project a section heading (folder icon, name, stale tag, its session and
  hit counts) over its session cards: the direction confirmed for global search (global-search::US-001/AC-04).
- The search row, the results header, the session cards and the hit rows: the project search's own, from the
  shared session-hits piece that the Sessions tab on the project detail prototype (prototype-detail) draws too.
- The side badges, the fork markers and the sort segment: as the project detail prototype draws them.
- The stale project's heading: its name struck through with the stale tag, as the shared project column draws a
  stale project.
- A session card's header and a hit row open the session page prototype (prototype-session), which draws the two
  exits back to these results and into the project.

## Demo scaffolding

Everything on the demo bar is not part of the design; do not implement. The app has none of these switches, and
the bar's note lines say what decides each state in the app.

- The `Demo ·` tag and the note lines: not part of the design; do not implement.
- "启动恢复" (the startup restore states, from the shared startup-status piece): not part of the design; do not
  implement. In the product, whether this launch's scan is still running and what it found decide the state.
- "问句读取" (已读完 / 读取中): not part of the design; do not implement. In the product, reading the sessions'
  questions into memory starts when the page is shown, and whether that reading is done decides the state.
- "会话数据" (有会话 / 一个也没有): not part of the design; do not implement. In the product, the number of sessions
  scanned in the projects decides it.
- "搜索请求" (成功 / 失败): not part of the design; do not implement. In the product, whether the search completes as
  a whole decides it; a single session that cannot be read is skipped, not a failure.
- "填入示例" (notarize / 权限 / RAG(长标题) / 无命中): one-shot fills of the search box; not part of the design; do not
  implement. In the product the user types the keyword.
