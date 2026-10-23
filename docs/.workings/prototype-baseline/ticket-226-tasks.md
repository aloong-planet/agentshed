# Ticket #226 — task list

Logic prototype pages still carry the logic template's chrome in Chinese. Working record, not a requirement
authority: the requirement source is the body of [#226](https://github.com/aloong-planet/agentshed/issues/226),
with no spec. Delivered in one branch and one PR with #250 (`ticket-250-tasks.md`). Checkpoints in brackets
are what proves each step done. Coverage rows: `226::*` in [checklist.md](checklist.md).

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Diff the three pages against the skill's `logic-page-template.html` on the base commit 1349d76 and list the chrome strings | diff per page | done: header comment, drive heading, the two receipts and the empty-state receipt, reset button, stress toggle and hint, empty-diagram notice, reset-view title, the two tooltip prefixes — the list #226 gives |
| 2 | Test design review (`/review-tests`) | `ticket-226-review-tests.md` | pending |
| 3 | Rewrite each page's chrome to the template's English wording; keep the prototype content | diff per page; remaining Chinese lines by kind | pending |
| 4 | Drive each page alone and in the gallery: entry buttons, an event, reset, stress mode, reset-view | browser run, no page error | pending |
| 5 | `pnpm check:lang` | exit code | pending |
| 6 | Step 5: `/review-code` | `ticket-226-review-code.md` | pending |
| 7 | Full verification gateway (shared with #250) | `pnpm verify` log | pending |
| 8 | Step 6: `/review-tests` post-implementation check, independent agent | `ticket-226-review-tests.md` | pending |
| 9 | Final check against #226 and archive (step 7) | checklist rows `226::*` | pending |
| 10 | Step 8 judgement and document sync; PR; stop for the owner | `ticket-226-doc-sync.md`; PR link | pending |
