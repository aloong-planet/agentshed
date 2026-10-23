# Document sync checklist — #281

Ticket: [#281 Dark mode: scrollbar tracks stay light beside scrolling lists](https://github.com/aloong-planet/agentshed/issues/281) · feature `appearance` ·
coverage checklist: [checklist.md](checklist.md)

Created when #281 was taken up (2026-10-23): the issue predates the ticket-artifact convention, so its records and
this checklist are added for the current work only.

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the scrollbar requirement, its failure items and decisions into the spec, before implementation | [appearance spec](../../specs/appearance.md) (appearance::REQ-001, sequence F, C2, UI decisions, Implementation and Testing Decisions, Out of Scope, Further Notes) | Done: 5f376ad |
| Draw the scrollbars on the prototypes, for the owner to confirm before implementation | the prototypes' shared stylesheets (the app window, the token table) | Done: 5f376ad, confirmed by the owner on 2026-10-23 |
| Write back what implementation changes or finds, at the spec final check | [appearance spec](../../specs/appearance.md) | Done: the overlay claim's ground (7211ff3), the testing decisions for macOS's styles and the six-state check (b0bcfac), the no-standard-property rule and C1's missing variable (step 8); the final check found no departure |
| Update the count of appearance-varying variables, once the thumb tokens exist and are measured | [CONTEXT.md](../../../CONTEXT.md), "Theme variable classes" | Done: 11 / 28 / 4 as measured (`evidence/ticket-281/theme-vars.txt`); the scrollbar thumb named among the appearance-varying |
| Step 8: the feature entry says what a scrollbar looks like | [appearance features](../../features/appearance.md) and its index row if its one line changes | Done: a capability and a boundary; the index row unchanged, still true |
| Record the actual verification of this ticket's units, as they run | [checklist](checklist.md), current verification | Waiting: the final gateway on the delivered commit; every unit's row is written up to the targeted runs |
| Step 8 report | [final-regression.md](final-regression.md) (new for this feature's records) | Done: the #281 section, three stages (2026-10-23) |
| Declare this ticket's artifacts and process acceptance on the issue | [#281](https://github.com/aloong-planet/agentshed/issues/281) | Done: 2026-10-23 |

**Pre-delivery scope re-check (2026-10-23):** the scrollbars as implemented compared with every document this ticket
touches — the appearance spec (requirement, failure items, decisions, testing, out of scope, notes), the appearance
entry and both indexes, CONTEXT's theme variable classes, the prototypes' shared stylesheets, the coverage checklist,
the test and code review records and this list. No missing or outdated item beyond those handled above; nothing pending
but the delivered version's verification row, which waits on the final gateway.
