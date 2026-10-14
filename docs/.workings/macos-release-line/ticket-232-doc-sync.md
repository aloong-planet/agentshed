# Document sync checklist — #232

Ticket: [#232 "Check for Updates…" in the application menu](https://github.com/aloong-planet/agentshed/issues/232) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Extend the app-update feature entry with the menu item and its toasts | [app-update](../../features/app-update.md) | Done: one capability added (the menu check and its notices, in-flight states, shared checks); the development-run boundary and the network boundary name the menu ([final-regression](final-regression.md), #232 stage 1) |
| Check the statements about the application menu's entries | [i18n feature](../../features/i18n.md), [i18n spec](../../specs/i18n.md) "The application menu" | Done: the feature's menu line named Settings as the one entry into the app — now both entries; the spec's menu decision already named the item; its known test gap rewritten (the rebuild is now read by e2e, the native picture stays manual) |
| If the implementation departs from the spec, rewrite the spec in the same change; when the ticket is delivered, remove this row with a note if nothing departed | [app-update spec](../../specs/app-update.md) | Done: the menu check's outcome travels as an update notice (IPC decision); Testing Decisions name the e2e through the installed menu |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done: the #232 row records the implementation commit, its results and the screenshot it waits for |
