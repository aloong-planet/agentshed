# Ticket #316 — Document sync checklist

Ticket: [#316 check:ui's hand-kept lists leave new themes, sides, languages and colours unchecked](https://github.com/aloong-planet/agentshed/issues/316)
· work directory `prototype-baseline` (no spec; the requirement source is the issue's body) · records:
[task list](ticket-316-tasks.md) · [test review](ticket-316-review-tests.md) · [code review](ticket-316-review-code.md) ·
coverage checklist: [checklist.md](checklist.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The coverage checklist: a fifth round for #316 — its units `316::1`–`316::10` from the body's acceptance criteria, and their current verification once run | [checklist.md](checklist.md) | Pending — the units and the audit row are written; current verification waits for the runs |
| Statements of what the changed rules check and where their lists come from, once they derive them (the gate's comments; any document that lists the brand or accent colours, the themes, the sides, the languages, the READMEs, the rail items or the ticket-number rule's scope) | `scripts/check-shared-ui.mjs`, and whatever a search finds | Pending — the gate's comments change with the code; the documents' search is step 8, stage 2 |
| #314's records that left the gate's other hand-kept lists to the owner: the owner decided on 2026-10-26 (no check for `ALLOWED` and `EXEMPT`; the lists that mirror a growing set went to #316) | [ticket-314-review-code.md](ticket-314-review-code.md) ④, [ticket-314-doc-sync.md](ticket-314-doc-sync.md) (pre-delivery re-check) | Pending |
| Step 8 report: the two questions (no user-visible behaviour changes: the gate and its test) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) | Pending |
| #316's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#316](https://github.com/aloong-planet/agentshed/issues/316) | Done — with the merge of this ticket's PR; after it, the tracker only: the items ticked, and a comment naming the merge commit, how its tree compares with the PR head, and the CI runs on that head |
