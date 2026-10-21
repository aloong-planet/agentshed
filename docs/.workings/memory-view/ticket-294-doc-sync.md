# Document sync checklist — #294

Ticket: [#294](https://github.com/aloong-planet/agentshed/issues/294) (the memory drawer previews Markdown).
Feature records: [checklist](checklist.md) · final regression: [final-regression.md](final-regression.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The spec carries the drawer obligation and the boundaries it changes; written before implementation, revisited at the spec check before step 7 | [memory-view spec](../../specs/memory-view.md) | Pending — written 2026-10-21 (memory-view::US-001, memory-view::CON-001, sequence E, C7/C8/D2/D6); the spec check after review is still to run |
| The confirmed prototypes show the drawer the app implements; any implementation-time change to the drawer goes to the prototype first | `docs/prototypes/agents-page`, `project-detail`, `skills-view`, `plugins-view`, `_shared/file-drawer.css`, `_shared/toast.*`, `_shared/md-preview.js`, `_shared/copy.js` | Pending — confirmed 2026-10-21; the side-name wording was aligned to the drawer meta convention (short name) after confirmation, to be reported |
| Step 8: the feature catalogue says what the memory drawer now does | [memory-view features](../../features/memory-view.md) | Pending |
| Step 8: other declarations of the skill file drawer and the shared rendering surfaces stay true (one form with the memory drawer) | [skills-view spec](../../specs/skills-view.md), [appearance spec](../../specs/appearance.md), [CONTEXT.md](../../../CONTEXT.md) | Pending |
| Step 8 report | [final-regression.md](final-regression.md) | Pending |
| After this PR merges: #279's memory screenshot is retaken over the new drawer | [#279](https://github.com/aloong-planet/agentshed/issues/279) | Waiting — the merge of this PR |
