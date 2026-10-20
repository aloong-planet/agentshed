# Document sync checklist — #273

Ticket: [#273 Global search: ⌘⇧F and the Edit menu's Search Sessions…](https://github.com/aloong-planet/agentshed/issues/273) · feature `global-search` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Add ⌘⇧F and the Edit menu item to the global search feature entry | [features/global-search.md](../../features/global-search.md) | Done 2026-10-20: a capability line after the rail's Search item — from anywhere, as left, the cursor in the box, the search page itself included (03a5ba3) |
| Add "Search Sessions…" to the UI language entry's list of the application menu's entries into the app | [features/i18n.md](../../features/i18n.md) | Done 2026-10-20: the entries now read "Settings" (⌘,), "Check for Updates…" and, in the Edit menu, "Search Sessions…" (⌘⇧F) (03a5ba3) |
| Bring the spec's status and Pending note up to what shipped, and write the focus request into the renderer's decision | [spec](../../specs/global-search.md) | Done 2026-10-20: the Pending note expired and is gone; the status says every user story has shipped; the box takes the focus whenever the menu's item asks (03a5ba3) |
| Correct the i18n spec's stale sentence on the application menu, found in the regression | [i18n spec](../../specs/i18n.md) | Done 2026-10-20: it no longer says there is no custom menu (03a5ba3) |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done 2026-10-20: #273's block, first on 2882abc, its rows now versioned on cc5aefd's tests with that gateway's log; AC-01 and J10 pass for the menu item's path, the key press itself recorded as not verified |
| Record the key press's acceptance, or its standing as a stated gap, once the owner decides | [checklist](checklist.md), [#273](https://github.com/aloong-planet/agentshed/issues/273) | Waiting: the owner's decision, asked with the PR. Followed up by this ticket's implementer: the checklist's AC-01 and J10 rows and, if the owner rewords it, #273's acceptance line |
| Record the merge: the merge commit in the coverage checklist's rows, and #273's acceptance items ticked on the issue | [checklist](checklist.md), [#273](https://github.com/aloong-planet/agentshed/issues/273) | Waiting: the merge. Followed up by this ticket's implementer right after it |

Pre-delivery scope re-check (2026-10-20): from the ticket (its product and process acceptance), the change (2882abc,
cecebad, 03a5ba3, 2843aaf, cc5aefd and the records), the runs (three gateways, the probes) and the current documents —
the global-search and i18n specs, both feature entries and the indexes, the app-update entry and spec (the menu's
other entry), the six READMEs and the landing page, CONTEXT, the coverage checklist, the regression report, and the
ignored working-record directory listed with its ignored files shown. Found and added during the check: the spec's
status, Pending note and focus request (a row of their own, done), the i18n spec's stale sentence (done), and the key
press's acceptance (waiting for the owner). Items reopened: none stays open; the verification row was rewritten when
the tests changed after the independent checks. No item is Pending; the two Waiting items name their event and who
follows them up.
