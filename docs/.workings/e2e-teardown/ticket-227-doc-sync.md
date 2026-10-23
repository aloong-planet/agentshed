# Document sync checklist — #227

Ticket: [#227](https://github.com/aloong-planet/agentshed/issues/227) (the startup-skeleton e2e case can time out in a
full run under heavy load). Records: [task list](ticket-227-tasks.md) · [test review](ticket-227-review-tests.md) ·
[code review](ticket-227-review-code.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The rule a future case needs: an e2e case closes the app through the shared bounded teardown, and why (Electron's native shutdown under load), with the trade-off that a slow close passes with a warning; written at step 7 | [CONTEXT.md](../../../CONTEXT.md), Invariants | Done — written at step 7 |
| The e2e files' headers that describe their launcher and teardown, if any states how a case closes; the helper's own test file names its gap | the seven e2e files, `e2e/close-app.spec.ts` | Done — no header states how a case closes: in each file's first 40 lines, `rg -n -i "\bclose\b|teardown"` matches only the new import; in `app.spec.ts`'s first 130 lines also its `close` helper and the note that the fixture home is "cleaned up with close", still true since that helper now goes through `closeApp`. `close-app.spec.ts`'s header names the native shutdown under load as its gap |
| Step 8 report: whether user-visible behaviour changes (the two questions), and the cross-regression of what this touched | [final-regression.md](final-regression.md) | Pending |
| #227's comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#227](https://github.com/aloong-planet/agentshed/issues/227) | Waiting: the PR and the owner's merge |
