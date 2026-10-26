# Document sync checklist — #253

Ticket: [#253 Upgrade the GitHub Actions in the three workflows to their current majors](https://github.com/aloong-planet/agentshed/issues/253)
· feature `macos-release-line` · records: [task list](ticket-253-tasks.md) · [test review](ticket-253-review-tests.md) ·
[code review](ticket-253-review-code.md) · coverage checklist: [checklist.md](checklist.md) · final regression:
[final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The rule a future workflow needs: every action in every workflow runs at a full commit with its version in a comment, held by the static test of every workflow file (the owner's decision D1); written at step 7 | [CONTEXT.md](../../../CONTEXT.md), Invariants | Pending: step 7 |
| The release runbook's "Actions" bullet says `ci.yml` uses tags; it becomes untrue with D1, and its pointer to the test that holds the pins moves to the new test; at step 7 | [mac-signing.md](../../ops/mac-signing.md), CI, "Actions" and "Tests" | Pending: step 7 |
| The coverage checklist: #253's role on the release workflow's units (a regression run on the upgraded actions), and its current verification once the runs are in | [checklist.md](checklist.md) | Pending: after the runs (task 9) |
| The ticket's third item, the publish job's download step on download-artifact v8, which only a tag push runs: recorded when the next release tag's run has passed, by whoever cuts that tag (#240's pre-release is the next one planned), in that change's records and on #253 | [checklist.md](checklist.md), [ticket-240-doc-sync.md](ticket-240-doc-sync.md), [#253](https://github.com/aloong-planet/agentshed/issues/253) | Pending: the Waiting row and #240's follow-up row to be written at step 7 |
| Step 8 report: the two questions (no user-visible behaviour changes) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) | Pending: step 8 |
| #253's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only. The issue stays open for its third item | [#253](https://github.com/aloong-planet/agentshed/issues/253) | Pending: the PR |
