# Document sync checklist — #231

Ticket: [#231 The settings "Updates" section](https://github.com/aloong-planet/agentshed/issues/231) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Extend the app-update feature entry with the Updates section, the result line and the post-update line | [app-update](../../features/app-update.md) | Done: four capabilities added (the section and switch, "Check now" and its line, the update in the line and "Install now", the line's lifetime and the post-update line), the schedule line made conditional on the switch, two boundaries extended; checked against the spec ([final-regression](final-regression.md), #231 stage 1) |
| Check the statements about the settings page's sections (Language and Appearance, now with Updates third) | [appearance feature](../../features/appearance.md), [i18n feature](../../features/i18n.md) | Done: both still true — neither lists the sections as a complete set (#231 stage 2); the appearance spec's shared row form also holds for the Updates section |
| If the implementation departs from the spec, rewrite the spec in the same change; when the ticket is delivered, remove this row with a note if nothing departed | [app-update spec](../../specs/app-update.md) | Done: two departures written back to Implementation Decisions — settings asks through its own request and the main process keeps settings' check record; the version record is read and written only by a run that checks for updates |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done: the #231 row records the implementation at 0bca714 (after the owner-confirmed refactors), its results and its gaps |
| Record the newly observed fact that a development run writes into the installed copy's userData, where the next person adding a userData file will read it | [CONTEXT.md](../../../CONTEXT.md) Invariants | Done: added (observed 2026-10-14), citing the spec's decision for the version record |
| Correct #230's records of the tooltip gap: the line was reachable through the wake path, and this ticket adds its case | [ticket-230-review-tests](ticket-230-review-tests.md), [ticket-230-tasks](ticket-230-tasks.md), [checklist](checklist.md) #230 row | Done: corrected in place |
