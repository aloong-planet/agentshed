# Ticket #314 — Document sync checklist

Ticket: [#314 check:ui's chart rule compares a page's charts with all its declarations, not each chart with its own](https://github.com/aloong-planet/agentshed/issues/314)
· work directory `prototype-baseline` (no spec; the requirement source is the issue's body) · records:
[task list](ticket-314-tasks.md) · [test review](ticket-314-review-tests.md) · [code review](ticket-314-review-code.md) ·
coverage checklist: [checklist.md](checklist.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The coverage checklist: a fourth round for #314 — its units `314::1`–`314::6` from the body's acceptance criteria, and their current verification once run | [checklist.md](checklist.md) | Done — the units 314::1–314::6 (task 2, extended with the post-implementation check's cases), their current verification at 78ff2f5, the two-way audit row; the third round's audit row now names #314 |
| Statements of how the gate knows a shared block, once it derives blocks from their files (the gate's header; any document or comment that describes the registry or says to add an entry to it) | `scripts/check-shared-ui.mjs`, and whatever a search finds | Done — the gate's header rewritten with the code; no document describes the registry or says to add an entry to it (step 8, stage 2, `evidence/ticket-314/step8-searches.txt`) |
| The two prototype pages' own notes, where they describe what the page declares (the Agents page's skeleton, the heading-ladder page's md-preview use) | `docs/prototypes/agents-page/prototype-agents.html`, `docs/prototypes/md-preview/prototype-heading-ladder.html` | Done — neither page's notes speak of declarations; the skeleton note and the heading-ladder header stay accurate (step 8, stage 1) |
| Step 8 report: the two questions (no user-visible behaviour changes: the gate, its test, and two attributes that change no rendering) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) | Done — the #314 section, three stages (2026-10-26); `docs/features/` unchanged |
| #314's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#314](https://github.com/aloong-planet/agentshed/issues/314) | Pending: the PR |
| A postmortem for the scratch-tree write-through (root cause, why nothing caught it, the guard), and its index row | [docs/postmortems/2026-10-26-a-scratch-copy-that-was-a-link.md](../../postmortems/2026-10-26-a-scratch-copy-that-was-a-link.md), [docs/postmortems/README.md](../../postmortems/README.md) | Done — written at step 7; read by the gate's ticket-number rule; the full gateway on the delivery head c751e33 passed (`evidence/ticket-314/gateway-c751e33.txt`) |

Pre-delivery scope re-check (2026-10-26, on the branch at 78ff2f5 with step 7's and step 8's edits): what the change
does and what its runs produced — the gate's derived blocks and its three rules, the test's 25 cases with their red and
green runs, the copy guard and its probes, the write-through and its restoration, two full gateways — against #314's
body, the coverage checklist's fourth round (units, current verification, audit rows), the task list (D1–D9, the
source check), both reviews with every finding's handling, the postmortem and its index, and step 8. Added in this
check: the postmortem item above. No other item missing, none stale. The two hand-kept lists elsewhere in the gate
(`ALLOWED`, `EXEMPT`) are reported to the owner with the delivery, recommended as no change (the code review, ④).
