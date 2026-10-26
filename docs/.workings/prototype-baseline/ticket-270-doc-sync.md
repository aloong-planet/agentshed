# Document sync checklist — #270

Ticket: [#270 check:ui counts a shared asset named in a comment as the page's reference to it](https://github.com/aloong-planet/agentshed/issues/270)
· work directory `prototype-baseline` (no spec; the requirement source is the issue's body) · records:
[task list](ticket-270-tasks.md) · [test review](ticket-270-review-tests.md) · [code review](ticket-270-review-code.md) ·
coverage checklist: [checklist.md](checklist.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The coverage checklist: a third round for #270 — its units (`270::1` the reference's removal goes red whatever a comment names, `270::2` green on main, and what the class-level check adds) and their current verification once run | [checklist.md](checklist.md) | Done — the units 270::1, 270::2 and 270::R1 (task 2, extended with the test checks' cases), their current verification at 8e9ddf4, the two-way audit row |
| Statements of what `pnpm check:ui` runs, once the test runs in it (the package script; any document or workflow comment naming the gate's parts) | `package.json`, and whatever a search finds | Done — `package.json`'s `check:ui` names both; no document or workflow comment describes the gate's parts (step 8, stage 2, `evidence/ticket-270/step8-searches.txt`) |
| Step 8 report: the two questions (no user-visible behaviour changes: the gate and its test only) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) (new in this work directory) | Done — the #270 section, three stages (2026-10-26); `docs/features/` unchanged |
| #270's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#270](https://github.com/aloong-planet/agentshed/issues/270) | Done — with the merge of #313, which needs the owner's confirmation; after it, the tracker only: the items ticked, and a comment naming the merge commit, how its tree compares with the PR head, and the CI runs on that head |

Pre-delivery scope re-check (2026-10-26, on the branch at 8e9ddf4 with this round's record edits): what the change
does and what its runs produced — the gate's searches through `stripComments`, the one-pass stripping with the parser,
the test's twelve cases and their red and green runs, the feedback loop, four full gateways — against #270's body (its
records section added), the coverage checklist's third round (units, current verification, audit row), the task list
(D1–D3, the source check), both reviews with every finding's handling, and step 8. No item missing, none stale. The
chart container rule's count is reported to the owner with the delivery, as it has no home in this change.
