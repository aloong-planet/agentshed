# Document sync checklist — #294

Ticket: [#294](https://github.com/aloong-planet/agentshed/issues/294) (the memory drawer previews Markdown).
Feature records: [checklist](checklist.md) · final regression: [final-regression.md](final-regression.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The spec carries the drawer obligation, the rendered-text rule and the boundaries they change; revisited at the spec check before step 7 | [memory-view spec](../../specs/memory-view.md) | Done — US-001, CON-001, CON-002, sequence E, C7/C8/D2/D6, Implementation and Testing Decisions; spec check recorded in ticket-294-tasks.md (2026-10-21) |
| The confirmed prototypes show what the app implements; implementation-time changes go to the prototype first | `docs/prototypes/agents-page`, `project-detail`, `skills-view`, `plugins-view`, `_shared/file-drawer.css`, `_shared/toast.*`, `_shared/md-preview.js`, `_shared/copy.js` | Done — two changes after the owner's confirmation, both reported at delivery: the meta line uses the side's short name (the drawer meta convention), and the shared renderer keeps written text (owner decisions D5, D6) |
| Step 8: the feature catalogue says what the memory drawer and rendered documents now do | [memory-view features](../../features/memory-view.md) | Done — final-regression.md, Stage 1 |
| Step 8: other declarations of the skill file drawer, the render sites and saved display data stay true | [skills-view spec](../../specs/skills-view.md), [CONTEXT.md](../../../CONTEXT.md), [appearance spec](../../specs/appearance.md), [postmortems](../../postmortems/README.md) | Done — final-regression.md, Stages 2 and 3 |
| Step 8 report | [final-regression.md](final-regression.md) | Done (2026-10-21) |
| After this PR merges: #279's memory screenshot is retaken over the new drawer | [#279](https://github.com/aloong-planet/agentshed/issues/279) | Waiting — the merge of this PR |
