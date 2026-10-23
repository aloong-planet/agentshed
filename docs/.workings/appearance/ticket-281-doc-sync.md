# Document sync checklist — #281

Ticket: [#281 Dark mode: scrollbar tracks stay light beside scrolling lists](https://github.com/aloong-planet/agentshed/issues/281) · feature `appearance` ·
coverage checklist: [checklist.md](checklist.md)

Created when #281 was taken up (2026-10-23): the issue predates the ticket-artifact convention, so its records and
this checklist are added for the current work only.

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the scrollbar requirement, its failure items and decisions into the spec, before implementation | [appearance spec](../../specs/appearance.md) (appearance::REQ-001, sequence F, C2, UI decisions, Implementation and Testing Decisions, Out of Scope, Further Notes) | Done: 5f376ad |
| Draw the scrollbars on the prototypes, for the owner to confirm before implementation | the prototypes' shared stylesheets (the app window, the token table) | Done: 5f376ad, confirmed by the owner on 2026-10-23 |
| Write back what implementation changes or finds, at the spec final check | [appearance spec](../../specs/appearance.md) | Pending: implementation not started |
| Update the count of appearance-varying variables, once the thumb tokens exist and are measured | [CONTEXT.md](../../../CONTEXT.md), "Theme variable classes" ("Currently 20") | Pending: two appearance-varying tokens join; the count is taken by measuring the six states, not by counting |
| Step 8: the feature entry says what a scrollbar looks like | [appearance features](../../features/appearance.md) and its index row if its one line changes | Pending |
| Record the actual verification of this ticket's units, as they run | [checklist](checklist.md), current verification | Pending |
| Step 8 report | [final-regression.md](final-regression.md) (new for this feature's records) | Pending |
| Declare this ticket's artifacts and process acceptance on the issue | [#281](https://github.com/aloong-planet/agentshed/issues/281) | Done: 2026-10-23 |
