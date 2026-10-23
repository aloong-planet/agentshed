# Document sync checklist — #227

Ticket: [#227](https://github.com/aloong-planet/agentshed/issues/227) (the startup-skeleton e2e case can time out in a
full run under heavy load). Records: [task list](ticket-227-tasks.md) · [test review](ticket-227-review-tests.md) ·
[code review](ticket-227-review-code.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The rule a future case needs: an e2e case closes the app through the shared bounded teardown, and why (Electron's native shutdown under load); written at step 7 | [CONTEXT.md](../../../CONTEXT.md), Invariants | Pending |
| The e2e files' headers that describe their launcher and teardown, if any states how a case closes | the seven e2e files | Pending |
| Step 8 report: whether user-visible behaviour changes (the two questions), and the cross-regression of what this touched | [final-regression.md](final-regression.md) | Pending |
| #227's comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#227](https://github.com/aloong-planet/agentshed/issues/227) | Waiting: the PR and the owner's merge |
