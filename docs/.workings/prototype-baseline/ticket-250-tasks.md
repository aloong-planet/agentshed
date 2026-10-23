# Ticket #250 — task list

Prototype pages: small differences from the app. Working record, not a requirement authority: the requirement
source is the body and comments of [#250](https://github.com/aloong-planet/agentshed/issues/250), with no spec;
item 9 was settled by the owner on 2026-10-23 (all three list areas in line). Delivered in one branch and one PR
with #226 (`ticket-226-tasks.md`). Item numbers are #250's; checkpoints in brackets are what proves each step
done. Coverage rows: `250::*` in [checklist.md](checklist.md).

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Recheck every open item on the base commit 1349d76 | each item's text against the page | done: items 1, 2, 3, 5, 6, 8, 9 hold as written; item 7 mostly fixed by #264, the header's group count left (two, the bar carries three) |
| 2 | Owner's decision on item 9 | answer recorded | done 2026-10-23: all three in line, after screenshots of the three places |
| 3 | Test design review (`/review-tests`) | `ticket-250-review-tests.md` | pending |
| 4 | Items 1–3: the picker shadow, the title's stale tag, the Agents mask | computed styles | pending |
| 5 | Item 5: a failed turn keeps its error through a redraw | browser probe red on the base page, green after | pending |
| 6 | Items 6–8: the orphan session's count, the detail header's group count, the dead model-bar rule | meta and list header; header text; search | pending |
| 7 | Item 9: list-area bottom padding 18 / 18 / 14px | computed padding | pending |
| 8 | Every touched page opens with no script error, alone and in the gallery; `pnpm check:ui` | browser run; exit code | pending |
| 9 | Step 5: `/review-code` | `ticket-250-review-code.md` | pending |
| 10 | Full verification gateway | `pnpm verify` log | pending |
| 11 | Step 6: `/review-tests` post-implementation check, independent agent | `ticket-250-review-tests.md` | pending |
| 12 | Final check against #250 and archive (step 7) | checklist rows `250::*` | pending |
| 13 | Step 8 judgement and document sync; PR; stop for the owner | `ticket-250-doc-sync.md`; PR link | pending |
