# Ticket #314 — Document sync checklist

Ticket: [#314 check:ui's chart rule compares a page's charts with all its declarations, not each chart with its own](https://github.com/aloong-planet/agentshed/issues/314)
· work directory `prototype-baseline` (no spec; the requirement source is the issue's body) · records:
[task list](ticket-314-tasks.md) · [test review](ticket-314-review-tests.md) · [code review](ticket-314-review-code.md) ·
coverage checklist: [checklist.md](checklist.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The coverage checklist: a fourth round for #314 — its units `314::1`–`314::6` from the body's acceptance criteria, and their current verification once run | [checklist.md](checklist.md) | Pending: the units at task 2, the verification after the runs |
| Statements of how the gate knows a shared block, once it derives blocks from their files (the gate's header; any document or comment that describes the registry or says to add an entry to it) | `scripts/check-shared-ui.mjs`, and whatever a search finds | Pending: the header with the code; the search at step 8 |
| The two prototype pages' own notes, where they describe what the page declares (the Agents page's skeleton, the heading-ladder page's md-preview use) | `docs/prototypes/agents-page/prototype-agents.html`, `docs/prototypes/md-preview/prototype-heading-ladder.html` | Pending: read with the change |
| Step 8 report: the two questions (no user-visible behaviour changes: the gate, its test, and two attributes that change no rendering) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) | Pending: step 8 |
| #314's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#314](https://github.com/aloong-planet/agentshed/issues/314) | Pending: the PR |
