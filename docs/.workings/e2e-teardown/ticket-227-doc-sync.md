# Document sync checklist — #227

Ticket: [#227](https://github.com/aloong-planet/agentshed/issues/227) (the startup-skeleton e2e case can time out in a
full run under heavy load). Records: [task list](ticket-227-tasks.md) · [test review](ticket-227-review-tests.md) ·
[code review](ticket-227-review-code.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The rule a future case needs: an e2e case closes the app through the shared bounded teardown, and why (Electron's native shutdown under load), with the trade-off that a slow close passes with a warning; written at step 7 | [CONTEXT.md](../../../CONTEXT.md), Invariants | Done — written at step 7 |
| The e2e files' headers that describe their launcher and teardown, if any states how a case closes; the helper's own test file names its gap | the seven e2e files, `e2e/close-app.spec.ts` | Done — no header states how a case closes: in each file's first 40 lines, `rg -n -i "\bclose\b|teardown"` matches only the new import; in `app.spec.ts`'s first 130 lines also its `close` helper and the note that the fixture home is "cleaned up with close", still true since that helper now goes through `closeApp`. `close-app.spec.ts`'s header names the native shutdown under load as its gap |
| Step 8 report: whether user-visible behaviour changes (the two questions), and the cross-regression of what this touched | [final-regression.md](final-regression.md) | Done — 2026-10-24: no user-visible behaviour changes (both questions answered "nothing"), so `docs/features/` is unchanged; the three stages' tables and the pre-delivery scope re-check are in the report |
| H4–H7 run on Linux for the first time (the incremental check's G7; H7 added after it): the PR's CI e2e job on ubuntu | #309's checks; the task list | Waiting: #309's CI |
| The 12-busy run's exit 1 after every case passed (Playwright's worker teardown past 60 s; the incremental check's G6): the owner's decision | the PR's description ("Left open"); #227's merge comment | Done — the owner decided on 2026-10-24: no ticket, a note in the PR ("no ticket, note it in the PR", in Chinese, the recommended answer); the PR's description carries the note with its evidence file, and #227's merge comment repeats it (next row) |
| #227's comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#227](https://github.com/aloong-planet/agentshed/issues/227) | Done — with the merge of #309; after it, #227 is written to on the tracker only: its acceptance items ticked and a comment naming the merge commit, repeating the heavy-load note (D4) |
