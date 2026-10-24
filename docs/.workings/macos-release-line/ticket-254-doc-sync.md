# Document sync checklist — #254

Ticket: [#254](https://github.com/aloong-planet/agentshed/issues/254) (the app-update case that waits to read the
download at 0%). Records: [task list](ticket-254-tasks.md) · [test review](ticket-254-review-tests.md) ·
[code review](ticket-254-review-code.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The spec's Testing Decisions say the scripted source can hold a check in flight and a download at its first step, and that a case which must see either holds it (why: both run on timers started at the check, and a launch check's notice arrives before the window listens); written at step 7 | [app-update spec](../../specs/app-update.md) | Done — written back on the branch at step 7 (Testing Decisions, the scripted source) |
| The coverage checklists' current verification for every unit whose case changed, after the final run: app-update's (the units of the 13 cases) and i18n::REQ-003's "no notice" read, which the i18n checklist credited while it could not fail | [checklist.md](checklist.md), [i18n checklist](../i18n/checklist.md) | Done — a row in each at 98b2208 (step 7) |
| The scripted source's doc comment names the new fields and what they are for (the e2e file header describes the seam without listing fields, and stays true) | `src/main/update-source.ts` | Done — in the implementation commits (22c8ce6, 98b2208) |
| The rule a future case needs: a "does not appear" check retried longer than the thing lives can never be red; it reads against a later ordered event or counts once (the test check's F6) | [CONTEXT.md](../../../CONTEXT.md), Invariants | Done — written at step 7 |
| Step 8 report: this change alters no user-visible behaviour (the two questions), and the cross-regression of what it touched | [final-regression.md](final-regression.md) | Done — the #254 section, three stages (2026-10-23); `docs/features/` unchanged |
| #254's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#254](https://github.com/aloong-planet/agentshed/issues/254) | Done — with the merge of #307, which needs the owner's confirmation; after it, the tracker only: the items ticked, and a comment naming the merge commit and how its tree compares with the PR head (main gained #305 after this branch was cut) |

Pre-delivery scope re-check (2026-10-23, on the branch's head): the app-update spec's Testing Decisions, CONTEXT's new
invariant, the coverage checklists (app-update's units and i18n::REQ-003's read), the feature entry (unchanged, still
true), the scripted source's doc comment and the e2e files' headers agree with what the change does at 98b2208; the
records (tasks, both test reviews, the code review, step 8) and the evidence, CI's repeated run included, are current.
No item missing, none stale. Waiting for the owner: the merge of #307; then the tracker only.
