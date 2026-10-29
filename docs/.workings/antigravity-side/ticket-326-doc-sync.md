# Document sync checklist — #326 Configuration shows CLAUDE.md and AGENTS.md

Ticket: [#326](https://github.com/aloong-planet/agentshed/issues/326) · feature checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The agents page's Configuration description (it still lists a read-only config.toml summary) and the project page's (it still lists a settings summary) are rewritten to the two entries — in this ticket's PR | [agents-overview](../../features/agents-overview.md), [project-detail](../../features/project-detail.md) | Done — rewritten in place (two entries, path headings, "None", unreadable file, no summaries; the agents page adds the card's height and that GEMINI.md and rules are not shown); checked in [final-regression.md](final-regression.md) stage 1 (2026-10-29) |
| Deviations written back — wrap-up | [agents-overview spec](../../specs/agents-overview.md) agents-overview::REQ-004, B5, Implementation and Testing Decisions; [project-detail spec](../../specs/project-detail.md) A4, project-detail::REQ-002 failure modes, Implementation and Testing Decisions | Done — the unreadable slot's declared prototype exemption, "None" in its card, the card's height, configuration files carrying their paths and the restore of saved copies, and project-detail's configuration e2e over any project (was: an Antigravity-only project); checked in final-regression.md stage 1 |
| CONTEXT's saved-page invariant covers a reshaped field and a conversion fed by the main process — added 2026-10-29 while implementing (the change reshaped two saved types) | [CONTEXT.md](../../../CONTEXT.md) Invariants, "A page switch is atomic and a revisit is instant" | Done — amended in place; final-regression.md stage 3 |
| This ticket's coverage rows and current verification — added while implementing | [checklist.md](checklist.md) Spec → tickets → verification, Current verification, Two-way audit | Done — two rows added (the configuration failure modes; the regression rules and the saved-page restore), seven verification rows, two audit rows (2026-10-29) |
| Cross regression for this ticket's range — step 8 | the documents above, the dictionaries, the agents-page and project-detail prototypes' Configuration tabs | Done — [final-regression.md](final-regression.md), section "#326", three stage tables; no difference left open |

Scope checked (2026-10-29, pre-delivery scope re-check): the two specs and two features pages above, CONTEXT.md, ADR-0037,
the features and specs README index rows, the dictionaries, both READMEs and `site/src` (searched in both languages for
every changed fact), the two prototypes, and this feature's working records. Differences found and handled: the
CONTEXT amendment had no row (added above); the decisions record and the checklist's audit claimed spec text that was
written only at the wrap-up (now true). No item marked done rests on a basis that no longer holds.
