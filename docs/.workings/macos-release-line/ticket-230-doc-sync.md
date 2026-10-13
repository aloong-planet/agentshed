# Document sync checklist — #230

Ticket: [#230 Automatic app updates with the update button](https://github.com/aloong-planet/agentshed/issues/230) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the app-update feature entry for what this ticket ships (automatic checks, the update button, install on click and on quit) and index it; in the same change as the behaviour | [app-update](../../features/app-update.md) (new), [features index](../../features/README.md) | Done: written and indexed; every line checked against the spec ([final-regression](final-regression.md), #230 stage 1) |
| Rewrite the app-update spec header's Pending note and the specs index row once the feature entry exists | [app-update spec](../../specs/app-update.md), [specs index](../../specs/README.md) | Done: the expired note removed, the entry linked from the header and the index |
| Check the statement that the settings entry sits at the foot of the rail against the rail with the update button above it | [appearance feature](../../features/appearance.md), [i18n feature](../../features/i18n.md), [appearance spec](../../specs/appearance.md) Failure D4 | Done: still true, Settings keeps its anchor (e2e geometry case; final-regression stage 2). The i18n entry makes the same statement and was added to this row |
| Check CONTEXT's App update, Update check and Release channel terms and the outbound-request invariant against the implementation | [CONTEXT.md](../../../CONTEXT.md) | Done: no change needed; the invariant holds ([evidence/ticket-230/con-001-search.txt](evidence/ticket-230/con-001-search.txt)) |
| Re-check the security checklist's items for the new IPC channels and the app's first outbound request | [electron-security](../../ops/electron-security.md) | Done: item 1 rewritten (it called the app purely local); partial re-pass recorded for items 1, 7, 17, 20 |
| Write back where the implementation departed from the spec | [app-update spec](../../specs/app-update.md) | Done: the pre-release setting is set from the running version; ready waits for the system updater to stage the package; Failure B3 corrected (a failed download shows the ring first); REQ-001/AC-02's reduced-motion wording made unambiguous |
| Keep the prototypes' shared icon file in step with the icon module (two icons added) | [prototype icons](../../prototypes/_shared/icons.js) | Done: regenerated with the project's sync script; `pnpm check:ui` green |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification | [checklist](checklist.md) | Done at delivery, with the implementation commit |
