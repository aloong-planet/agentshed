# Ticket #250 — task list

Prototype pages: small differences from the app. Working record, not a requirement authority: the requirement
source is the body and comments of [#250](https://github.com/aloong-planet/agentshed/issues/250), with no spec;
item 9 was settled by the owner on 2026-10-23 (all three list areas in line). Delivered in one branch and one PR
with #226 (`ticket-226-tasks.md`). Item numbers are #250's; checkpoints in brackets are what proves each step
done. Coverage rows: `250::*` in [checklist.md](checklist.md).

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Recheck every open item on the base commit 1349d76 | each item's text against the page | done: items 1, 2, 3, 5, 6, 8, 9 hold as written; item 7 mostly fixed by #264, the header's group count left (two, the bar carries three) |
| 2 | Owner's decision on item 9 | answer recorded | done 2026-10-23: all three in line, after screenshots of the three places; settled on 16px top and bottom later that day (task 7) |
| 3 | Test design review (`/review-tests`) | `ticket-250-review-tests.md` | skipped with TDD: prototypes carry no tests (the prototype skill: "no tests"), so no test is written; the changes are proven by browser probes run on the base page (red) and after (green), recorded in the coverage checklist. The post-implementation check (task 11) still runs |
| 4 | Items 1–3: the picker shadow, the title's stale tag, the Agents mask | computed styles | done in dbd90fc: computed styles alone and in the gallery (picker `0px 6px 22px 0px`; tag 9.5px, `0 4px`, 3px, 0.8; mask 0.35) |
| 5 | Item 5: a failed turn keeps its error through a redraw | browser probe red on the base page, green after | done in dbd90fc: an open turn is drawn from its fetch state; probe 7 red on the base page, 16 green after |
| 6 | Items 6–8: the orphan session's count, the detail header's group count, the dead model-bar rule | meta and list header; header text; search | done in dbd90fc: meta and list header both 26; header says three groups; `.m.x` rule removed, model bar colours unchanged |
| 7 | Item 9: list-area padding 16px at top and bottom on the three pages | computed padding | done: 18 / 18 / 14px in dbd90fc (bottom equal to top); the owner then chose 16px top and bottom once the review found the app and the other pages at 16px, done in the follow-up commit; computed 16px / 16px on all three |
| 8 | Every touched page opens with no script error, alone and in the gallery; `pnpm check:ui` | browser run; exit code | done: every touched page with no page or console error alone and in the gallery; check:ui exit 0 |
| 9 | Step 5: `/review-code` | `ticket-250-review-code.md` | done: no bug; class-level checks found two more header notes out of step (Agents count, global-search group), fixed in the review commit |
| 10 | Full verification gateway | `pnpm verify` log | done: `pnpm verify` step by step on 21a8958 with a clean tree, every exit code 0 (`evidence/round-2/gate-21a8958.log`) |
| 11 | Step 6: `/review-tests` post-implementation check, independent agent | `ticket-250-review-tests.md` | done: the independent check passed the gateway log and reproduced both probes; one finding (T250-1, a page count in the checklist), handled with #226's in the follow-up commits; the incremental checks of 0565012 and 4c5f473 found nothing new for #250 |
| 12 | Final check against #250 and archive (step 7) | checklist rows `250::*` | done 2026-10-23: every open item (1–3, 5–9) and the "Done when" verified in the checklist; the added scope recorded — the two header notes of item 7's class (250::R1) and item 9's top padding, by the owner's decision; the session page's header line on the mock lengths moved with item 6's count. No new decision or term needing an ADR or the glossary; no postmortem |
| 13 | Step 8 judgement and document sync; PR; stop for the owner | `ticket-250-doc-sync.md`; PR link | done: step 8 not run — the app does not change, so no sentence in `docs/features/` becomes untrue and none is missing (the delivery notes say so); document sync checked, no Pending item, the Waiting items listed in the document sync checklists; the final full gateway on 05ecf6f, every exit code 0 (`evidence/round-2/gate-05ecf6f.log`). The records commit after it changes only work records, read by check:lang and check:nul, both rerun with exit 0; the pull request's CI runs the full suite on the final head. Pull request opened from this branch; stopped for the owner |
