# Document sync checklist — #253

Ticket: [#253 Upgrade the GitHub Actions in the three workflows to their current majors](https://github.com/aloong-planet/agentshed/issues/253)
· feature `macos-release-line` · records: [task list](ticket-253-tasks.md) · [test review](ticket-253-review-tests.md) ·
[code review](ticket-253-review-code.md) · coverage checklist: [checklist.md](checklist.md) · final regression:
[final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The rule a future workflow needs: every action in every workflow runs at a full commit with its version in a comment, held by the static test of every workflow file (the owner's decision D1); written at step 7 | [CONTEXT.md](../../../CONTEXT.md), Invariants | Done — in the implementation commit 2e9d247; checked true in step 8 (stage 1) |
| The release runbook's "Actions" bullet said `ci.yml` uses tags; untrue with D1. It now points to the invariant and the test; the "Tests" bullet stays true | [mac-signing.md](../../ops/mac-signing.md), CI, "Actions" and "Tests" | Done — in 2e9d247; checked in step 8 (stage 1) |
| The coverage checklist: #253's role on the release workflow's units (a regression run on the upgraded actions), and its current verification once the runs were in | [checklist.md](checklist.md) | Done — the increment line and the "#253, regression" row (step 4), and the current-verification row of 2026-10-26 (the gateway and the manual run 40265409861) |
| The ticket's third item, the publish job's download step on download-artifact v8, which only a tag push runs: recorded when the next release tag's run has passed, by whoever cuts that tag (#240's pre-release is the next one planned), in that change's records and on #253 | [checklist.md](checklist.md), [ticket-240-doc-sync.md](ticket-240-doc-sync.md), [#253](https://github.com/aloong-planet/agentshed/issues/253) | Waiting: the next release tag's run. Its arrangement is in the task list ("Deferred acceptance"), the checklist's row says Waiting, and #240's document sync checklist lists the follow-up |
| Step 8 report: the two questions (no user-visible behaviour changes) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) | Done — the #253 section, three stages (2026-10-26); `docs/features/` unchanged |
| #253's first two acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only. The issue stays open for its third item | [#253](https://github.com/aloong-planet/agentshed/issues/253) | Pending: the PR, to be opened |

Pre-delivery scope re-check (2026-10-26, on the branch at 008b71f with this round's record edits): what the change does
and what its runs produced — the pins and their release comments, the new test and the removed case, the comment on
`pnpm test:scripts`, the gateway, the manual run and its artifact — against `CONTEXT.md`'s invariant, the runbook's
"Actions" and "Tests" bullets, the coverage checklist's increment line, regression row and current-verification row,
#240's follow-up row, the issue body (rewritten on 2026-10-26), the task list, both reviews and step 8. No item missing,
none stale. CI on the pull request is still to run; it is recorded in the PR's records once it has.
