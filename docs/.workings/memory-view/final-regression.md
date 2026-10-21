# memory-view — final regression

## 2026-10-21 · #294 (per-ticket step 8, not a closeout) · scope: the memory file drawer and the rendered-text rule

Ticket: [#294](https://github.com/aloong-planet/agentshed/issues/294). Implementation: f064a81 plus the
uncommitted step 6–8 changes on feat/memory-md-preview (tests after the incremental check, step 7 archive, step 8
docs). Spec: memory-view (US-001, CON-001, CON-002, sequence E, Implementation Decisions).

Languages in scope (`rg -l "[\p{Han}]" docs/features docs/specs CONTEXT.md README.md docs/adr src/shared/i18n`):
docs and CONTEXT are English apart from i18n and ADR quotations; the dictionaries hold six languages. Searches below
ran in English and in Chinese (the Chinese words for drawer, preview and raw text — no hit in docs, README or the site's copy); dictionary statements were
read by key in all six (`globalHint|topicsTitle|mainTitle`).

### Stage 1: changed declarations

| Statement surface | Checked against | Conclusion |
|---|---|---|
| docs/specs/memory-view.md (US-001, CON-001, CON-002, C7, C8, D2, D6, E1–E8, Implementation Decisions, Testing Decisions, Out of Scope) | the code at f064a81 and the test revisions | True — item by item in the spec check (ticket-294-tasks.md); E5 reworded to the measured behaviour; each failure mode has a test or a gap note in the e2e header (E2, E7) |
| docs/features/memory-view.md | spec US-001, CON-002, C7, D2 | Rewritten: the drawer reads like a skill's files (rendered, header card, raw switch); links to other memory files open in the drawer, web links in the browser, others show a notice; `[[…]]` and angle-bracket placeholders show as written in every rendered document; project detail's topics open in the same drawer from the list and the main file. Boundaries unchanged and still true |
| CONTEXT.md — one-carrier invariant | the implementation's render sites and the carrier's duties | Updated: the file drawer serves skill and memory files; the carrier keeps written text (memory-view::CON-002) |
| CONTEXT.md — display-copy invariant | display-data restore, ADR-0029 | Added: a field added to a saved type is filled in on restore when absent |
| docs/specs/skills-view.md D2 and UI decisions | memory-view::CON-001, CON-002; the shared FileDrawer | Updated: the pipeline keeps written text; the drawer's form is shared with the memory drawer, and a switched-to file starts at the top |
| docs/postmortems/2026-10-21-… and its index row | the review finding F1 and its fix | True |
| Dictionaries (six) | the code | `memory.topicMeta` removed with its one reader; the remaining memory strings (`globalHint`, `mainTitle`, `topicsTitle`) still describe the behaviour |
| Prototypes (agents-page, project-detail, skills-view, plugins-view; `_shared/file-drawer.css`, `toast.*`, `md-preview.js`, `copy.js`) ↔ implementation | the built app | Consistent: the app's memory drawer was rendered from the build and compared with the prototype (title, meta with the side's short name, bar, switch, card, body); the frame is equal across the skill, plugin and memory drawers in both (computed styles, e2e and prototype checks); the rendering rule is in both renderers; the toast matches the app's |
| ADR | — | None this round; ADR-0029's upgrade case is honoured (fill-in on restore) |

### Stage 2: related declarations

| Relation | Other end | Conclusion |
|---|---|---|
| features/memory-view.md ↔ its index row | features/README.md "What the agent remembers about each project, as a summary and in full" | Still true |
| specs/memory-view.md ↔ its index row | specs/README.md | Still true |
| the postmortem ↔ its index | postmortems/README.md | Row added |
| prototypes ↔ registry | manifest.js (no page added or renamed); scripts/check-shared-ui.mjs (file-drawer and toast registered) | True; check:ui passes with 4 file-drawer and 2 toast users |
| the skill file drawer's form ↔ its other statements | features/skills-view.md, features/plugins-view.md, specs/plugins-view.md H3 | Still true (preview by default, raw switch, links); the shared form is stated once, in the skills-view spec's UI decisions |
| the set of markdown render sites ↔ its enumerations | CONTEXT one-carrier invariant (updated); appearance C4 "skill preview, memory / configuration / artifact readers" and sequence E's list; i18n spec's "(sessions, memories, artifacts)" | True; the i18n one is a historical scope statement |
| the drawer width ↔ its statements | `rg -n -i "min\(680" docs CONTEXT.md e2e src` → only the Subagents drawer (spec E8, e2e, theme) | True: the 680 rule now belongs to the Subagents drawer alone; project-detail A5 states the rule generically |
| the old topic meta ↔ any statement | `rg -n -i` for the old meta in English and in its Chinese form, over docs, CONTEXT.md, e2e and src → none | True |
| the rendering rule (CON-002) ↔ features | features/memory-view.md (one statement naming every rendered document) | Stated once; the skills, project and Agents pages are not repeated, so the rule cannot drift between them |
| rule ↔ gate | CON-002: unit tests at the carrier (no gate); CON-001: e2e frame equality; the prototype frame: check:ui; the working records' language: check:lang over force-added files | Each guarded where stated; CON-002 has no gate and is held by tests |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| A set changed: the memory file drawer joined the markdown render sites | CONTEXT's list (updated); appearance C4 and E (still true); `rg -n -i "render sites" docs CONTEXT.md` | Handled |
| `Pending:` notes in scope | `rg -n "Pending:" docs/specs/memory-view.md docs/specs/skills-view.md docs/features/memory-view.md docs/features/skills-view.md CONTEXT.md docs/specs/appearance.md` → no output (exit 1) | None |
| New general rules | memory-view::CON-001 and CON-002 (spec); the saved-field fill-in (CONTEXT invariant and postmortem); the one file-drawer form in the prototypes (shared block, registered) | Each has its authoritative home |
| Work status: #294 | the issue's process-acceptance items; the doc-sync list; the coverage checklist's current verification; #279's memory screenshot | The doc-sync list and checklist are updated in this round; the issue's items are ticked at delivery; #279's retake waits for this PR's merge |

Queue empty; scope re-checked against the doc-sync list and the review records' document obligations (the
checklist rows for D5/D6, E5 and CON-002; the spec's tested shapes; the task log's gate runs) — all handled.
