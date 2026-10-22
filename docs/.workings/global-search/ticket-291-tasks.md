# Ticket #291 — task list

A search hit row whose keyword lies past the line's cut shows no highlight. Working record, not a requirement
authority: the requirements are [the global-search spec](../../specs/global-search.md) and
[the session-view spec](../../specs/session-view.md). Branch `fix/search-hit-highlight`, in its own worktree, cut
from `origin/main` at 5ff1db7 (no commits ahead when cut).

## Facts found before deciding (2026-10-22)

- A hit row's text is the whole question; the cut is the stylesheet's alone: the row's text box does not wrap,
  hides its overflow and ends it with an ellipsis (`src/renderer/src/theme.css:2307–2314`). The highlight marks
  every occurrence over the whole text (`src/renderer/src/SessionHits.tsx:11–26`), so an occurrence past the cut is
  marked but never shown.
- The row is one component shared by a project's own session search and global search (`SessionHitCard`, used in
  `DetailPane.tsx` and `GlobalSearchPane.tsx`; the prototypes' shared session-hits piece). In a project's search by
  question, the row also shows the whole question, so the same gap is there.
- A full-text hit in a project's search already shows a window: 20 characters before the first occurrence and 60
  after, with an ellipsis at each cut end (`src/main/providers/search-sessions.ts:31–47`). A question hit does not.
- The spec settles the cut and that the full text is on the session page (global-search S8), and that every
  occurrence is highlighted (global-search::US-001/AC-06); it does not say what a row shows when the keyword is
  outside its visible part.
- In the prototypes the rows are drawn by each page's own highlighting function
  (`docs/prototypes/global-search/prototype-search.html`, `docs/prototypes/project-detail/prototype-detail.html`);
  the shared piece is the stylesheet `_shared/session-hits.css`.
- #290 was closed as not planned on 2026-10-22 (ADR-0036): injected texts stay questions, so long rows with the
  keyword far in stay common.

## Decisions (step 1, 2026-10-22, the owner's answers)

| # | Decision | Answer |
|---|---|---|
| D1 | How a row shows a keyword past the cut | The row starts at the question's beginning as now; only when the first occurrence would not be visible does it start a little before that occurrence, after a leading ellipsis. Rows whose keyword is already visible, and short questions, are unchanged. Visibility is judged at the row's actual width and judged again when the width changes |
| D2 | Which searches | Both: a project's own session search by question and global search, which share the row; a full-text hit's snippet is already windowed and unchanged |
| D3 | Where a moved row starts | 20 characters before the first occurrence, as a full-text snippet does |
| D4 | A long keyword in a narrow row, where 20 characters before it and the keyword do not fit together | The row starts at the keyword itself, after the ellipsis, so the keyword always shows (proposed with the prototype, confirmed 2026-10-22). At the app's narrowest window (800px) the project page's hit text is 327px wide and the prototype's keywords fit with their 20 characters |
| D5 | The prototype: both pages' hit rows through one shared piece, with a long sample question each | Confirmed by the owner (2026-10-22) |

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Step 1: facts and decisions | this record | done |
| 2 | Step 2: the prototypes (both pages' hit rows, a long question in their data) and the specs; the owner confirms the prototype | the confirmed prototype | prototype confirmed (D5); measured in Chrome at 1280, 1000 and 800px and after a resize, every row's first occurrence in view, rows already in view unchanged, the long-keyword fallback at 800px; the specs next |
| 3 | Steps 4–8 (`/implement`, `/features-catalog`); PR; stop for the owner | PR link | pending |
