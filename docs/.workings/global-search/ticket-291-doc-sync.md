# Document sync checklist — #291

Ticket: [#291](https://github.com/aloong-planet/agentshed/issues/291) (a search hit row keeps its keyword in view).
Records: [task list](ticket-291-tasks.md) · [checklist](checklist.md) (rows marked #291) · final regression:
[final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The specs carry the confirmed rule; implementation-time boundaries and decisions are written back at the spec check before step 7 | [session-view spec](../../specs/session-view.md) (REQ-002, its failure items, Testing Decisions), [global-search spec](../../specs/global-search.md) (US-001/AC-06, S8) | Pending — written in 4ed5ec2; the write-back of what implementation adds is still to come |
| The confirmed prototype shows what the app implements; any implementation-time change goes to the prototype first | `docs/prototypes/_shared/session-hits.js`, the global search page, the project page's Sessions tab | Done — confirmed 2026-10-22 (D5) and committed in 4ed5ec2 |
| The coverage checklist maps #291's units and records their current verification | [checklist.md](checklist.md) | Pending — the mapping is in 4ed5ec2; the current verification row is "Not run yet" |
| Step 8: the feature entries say what a hit row shows when its keyword lies far into a long question | [session-view features](../../features/session-view.md), [global-search features](../../features/global-search.md) | Pending |
| Step 8 report | [final-regression.md](final-regression.md) | Pending |
