# Document sync checklist — #270

Ticket: [#270 check:ui counts a shared asset named in a comment as the page's reference to it](https://github.com/aloong-planet/agentshed/issues/270)
· work directory `prototype-baseline` (no spec; the requirement source is the issue's body) · records:
[task list](ticket-270-tasks.md) · [test review](ticket-270-review-tests.md) · [code review](ticket-270-review-code.md) ·
coverage checklist: [checklist.md](checklist.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The coverage checklist: a third round for #270 — its units (`270::1` the reference's removal goes red whatever a comment names, `270::2` green on main, and what the class-level check adds) and their current verification once run | [checklist.md](checklist.md) | Pending: the units at task 2, the verification after the runs |
| Statements of what `pnpm check:ui` runs, once the test runs in it (the package script; any document or workflow comment naming the gate's parts) | `package.json`, and whatever a search finds | Pending: at step 8 |
| Step 8 report: the two questions (no user-visible behaviour changes: the gate and its test only) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) (new in this work directory) | Pending: step 8 |
| #270's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#270](https://github.com/aloong-planet/agentshed/issues/270) | Pending: the PR |
