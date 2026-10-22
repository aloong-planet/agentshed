# Document sync checklist — #291

Ticket: [#291](https://github.com/aloong-planet/agentshed/issues/291) (a search hit row keeps its keyword in view).
Records: [task list](ticket-291-tasks.md) · [checklist](checklist.md) (rows marked #291) · final regression:
[final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The specs carry the confirmed rule; implementation-time boundaries and decisions are written back at the spec check before step 7 | [session-view spec](../../specs/session-view.md) (REQ-002, its failure items, Testing Decisions), [global-search spec](../../specs/global-search.md) (US-001/AC-06, S8) | Done — written in 4ed5ec2 (rebased as d41964a); written back in 676557e and after: the failure item about rows drawn while hidden corrected, how a row is judged (an implementation decision), what is counted (the question as shown); spec check in `ticket-291-tasks.md` |
| The confirmed prototype shows what the app implements; any implementation-time change goes to the prototype first | `docs/prototypes/_shared/session-hits.js`, the global search page, the project page's Sessions tab | Done — confirmed 2026-10-22 (D5) and committed in 4ed5ec2 |
| The coverage checklist maps #291's units and records their current verification | [checklist.md](checklist.md) | Done — the mapping in 4ed5ec2, amended after the test checks; the current verification row records the final run on a448fbc, with the no-width item as a stated gap |
| Step 8: the feature entries say what a hit row shows when its keyword lies far into a long question | [session-view features](../../features/session-view.md), [global-search features](../../features/global-search.md) | Done — 676557e; final-regression.md, #291 Stage 1 |
| Step 8 report | [final-regression.md](final-regression.md) | Done — the #291 section, three stages (2026-10-22) |

Pre-delivery scope re-check (2026-10-22, on a448fbc): the two specs, both feature entries and their index rows, the
prototypes and their shared piece, the coverage checklist and CONTEXT agree with what the rows do at a448fbc. No
item missing, none stale. After the merge, the tracker only: #291's acceptance items ticked and a comment with the
merge commit.
