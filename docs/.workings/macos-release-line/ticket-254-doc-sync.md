# Document sync checklist — #254

Ticket: [#254](https://github.com/aloong-planet/agentshed/issues/254) (the app-update case that waits to read the
download at 0%). Records: [task list](ticket-254-tasks.md) · [test review](ticket-254-review-tests.md) ·
[code review](ticket-254-review-code.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The spec's Testing Decisions say the scripted download can hold at its first step, and that a case which must see a step holds it; written at step 7 | [app-update spec](../../specs/app-update.md) | Pending |
| The coverage checklist's current verification for the units whose case changed (app-update::REQ-001/AC-04, REQ-002/AC-01, AC-02), after the final run | [checklist.md](checklist.md) | Pending |
| The scripted source's doc comment names the new field and what it is for (the e2e file header describes the seam without listing fields, and stays true) | `src/main/update-source.ts` | Done — in the implementation commit |
| Step 8 report: this change alters no user-visible behaviour (the two questions), and the cross-regression of what it touched | [final-regression.md](final-regression.md) | Pending |
| #254's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#254](https://github.com/aloong-planet/agentshed/issues/254) | Waiting: the PR and the owner's merge |
