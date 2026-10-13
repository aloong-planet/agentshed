# Document sync checklist — #230

Ticket: [#230 Automatic app updates with the update button](https://github.com/aloong-planet/agentshed/issues/230) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the app-update feature entry for what this ticket ships (automatic checks, the update button, install on click and on quit) and index it; in the same change as the behaviour | [app-update](../../features/app-update.md) (new), [features index](../../features/README.md) | Pending: not started |
| Rewrite the app-update spec header's Pending note and the specs index row once the feature entry exists | [app-update spec](../../specs/app-update.md), [specs index](../../specs/README.md) | Pending: not started |
| Check the statement that the settings entry sits at the foot of the rail against the rail with the update button above it | [appearance feature](../../features/appearance.md), [appearance spec](../../specs/appearance.md) Failure D4 | Pending: not started |
| Check CONTEXT's App update, Update check and Release channel terms and the outbound-request invariant against the implementation | [CONTEXT.md](../../../CONTEXT.md) | Pending: not started |
| Re-check the security checklist's items for the new IPC channels and the app's first outbound request | [electron-security](../../ops/electron-security.md) | Pending: not started |
| If the implementation departs from the spec, rewrite the spec in the same change; when the ticket is delivered, remove this row with a note if nothing departed | [app-update spec](../../specs/app-update.md) | Pending: not started |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Pending: not started |
