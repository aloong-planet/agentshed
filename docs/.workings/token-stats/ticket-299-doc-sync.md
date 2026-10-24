# Document sync checklist — #299

Ticket: [#299](https://github.com/aloong-planet/agentshed/issues/299) (the startup-restore case's today card misses its
one-second rollover window under load). Records: [task list](ticket-299-tasks.md) ·
[test review](ticket-299-review-tests.md) · [code review](ticket-299-review-code.md) · final regression:
[final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The coverage checklist's current verification for token-stats::REQ-001/AC-02, whose case changed, after the final run | [checklist.md](checklist.md) | Done — the checklist's new "Current verification" table, its first row at 251e3f7 |
| The fact the step relies on, that a page timer set before Playwright's fake clock keeps real time, in the spec beside the display clock's test note | [token-stats spec](../../specs/token-stats.md), REQ-001 | Done — written back at step 7 |
| Step 8 report: this change alters no user-visible behaviour (the two questions), and the cross-regression of what it touched | [final-regression.md](final-regression.md) | Done — the #299 section, three stages (2026-10-23); `docs/features/` unchanged |
| #299's process acceptance ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#299](https://github.com/aloong-planet/agentshed/issues/299) | Done — with the merge of #308, which needs the owner's confirmation; after it, the tracker only: the items ticked, and a comment naming the merge commit and how its tree compares with the PR head (main gained #305 after this branch was cut) |

Pre-delivery scope re-check (2026-10-23, on the branch's head): the token-stats spec's REQ-001 note, the coverage
checklist's new current-verification row, the feature entry (unchanged, still true), the step's comment and the
records (tasks, test review with its handling, code review, step 8) and the evidence, CI's repeated run included, agree
with what the change does at 251e3f7. No item missing, none stale. Waiting for the owner: the merge of #308; then the
tracker only.
