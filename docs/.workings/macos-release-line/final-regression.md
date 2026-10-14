# macOS release line — documentation regression

Feature-level report of step 8 (the cross-regression after the feature catalogue is updated). One section
per ticket in ticket order; the closeout ticket adds the full-feature section. Coverage verification per unit
lives in [checklist.md](checklist.md), not here.

## Ticket #230 — Automatic app updates with the update button

- Date: 2026-10-14
- Scope: this ticket's change only (not the full-feature closeout)
- Version: branch `feat/app-update-button` on 5911d52, working tree as committed for the ticket's PR

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/app-update.md` REQ-001/AC-02 (the loader under reduced motion) | theme.css's reduced-motion rule; e2e reduced-motion case | True: stands still |
| `docs/specs/app-update.md` Implementation Decisions (pre-release setting; ready means staged) | `update-source.ts` | True after this ticket's write-back |
| `docs/specs/app-update.md` Failure B3 | REQ-002/AC-02 and the staging wait | Was untrue ("the button never appears"): a failed download shows the ring first. Corrected; the real behaviour is #240's evidence |
| `docs/specs/app-update.md` header | the new feature entry | The Pending note had expired (the entry now exists): removed, entry linked |
| `docs/specs/app-update.md` failure modes for #230's units | tests | Each has a test or a stated gap (test review record) |
| `docs/features/app-update.md` (new), every line | the spec's user-visible layer for what #230 ships | True. Nothing from #231/#232 (the settings section, the menu item) is claimed. The B3 line follows the corrected spec |
| `docs/features/README.md` row | the entry | Added |
| `docs/specs/README.md` row | the entry | Now links it |
| Dictionaries, six languages, `update` | spec texts (REQ-001/AC-04, REQ-002/AC-03); the confirmed prototype's copy | True; `pnpm check:i18n` and typecheck green |
| `docs/ops/electron-security.md` items 1, 7, 17, 20 | the implementation | Item 1 was untrue for the main process ("purely local app"): rewritten; re-pass recorded |
| theme.css comments (bottom group, update button) | e2e geometry and colour cases | True |
| `docs/prototypes/_shared/icons.js` (regenerated) | the icon module | In sync (`pnpm check:ui`) |
| `docs/.workings/macos-release-line/checklist.md` rows (reduced motion; Failure C1's route) | the spec and the implementation | True |
| CONTEXT (unchanged) | the feature entry's words | Same terms: app update, update check, release channel |
| ADR-0032 (unchanged) | the implementation | True as amended; electron-updater 6.8.9 as its Context states |
| The settings prototype (unchanged) | the rail button and tooltip as built | Same form: 36px slot, 24px accent circle, card glyph, dark tooltip to the right |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| appearance and i18n features: "the settings entry at the foot of the rail" | the rail's bottom group | True: Settings keeps its bottom anchor (e2e geometry) |
| appearance spec Failure D4 | same | True |
| i18n features: hover tooltips change with the language | the update tooltip | True (e2e language case) |
| CONTEXT invariant on outbound requests | the update source | True: the only network path is the updater (`evidence/ticket-230/con-001-search.txt`) |
| landing-page spec, install step 3: an update button at the bottom left | the button's position | True |
| The six READMEs | the app's first network request | No statement about the network or updates: nothing turns false (search below) |
| Rule ↔ gate: every string in six languages | `pnpm check:i18n`, dictionary type | Gate covers the new section: green |
| Rule ↔ gate: no copy names a rail control verbatim; no copy enumerates the agent sides | `pnpm check:ui` | New copy names neither: green |

Search for the README row: `grep -rniE "network|offline|outbound|local-first|purely local|no remote|never reach" README*.md docs/features docs/ops CONTEXT.md` — no README line; the docs/features hits are unrelated words
("remembered", "never wraps"); the README control read 7 lines.

### Stage 3: events

| Event | Search or source | Conclusion |
|---|---|---|
| The rail's entries are no longer a fixed three (an update button while one is in flight) | `grep -rniE "rail" docs/features README*.md` → i18n:14, appearance:10, agents-overview:18 (plus "trailing" in projects-list:12) | None counts the entries; all true |
| A new runtime dependency (electron-updater) | `grep -rniE "electron-updater|dependencies|tech stack" README*.md docs/features CONTEXT.md AGENTS.md` → no output (README.md read: 7 lines) | No document lists dependencies |
| Pending notes in scope | the app-update spec | Header note expired and disposed; Testing note (two releases) not expired — #240's |
| A new decision ("ready means can install") | — | Its home is the spec's Implementation Decisions (written back); not a general rule |
| Work state: #230's coverage rows, its document sync checklist, its issue | — | Updated at delivery (Current verification row, `ticket-230-doc-sync.md`, the issue's process boxes) |

Queue empty after the pre-delivery scope re-check (see `ticket-230-doc-sync.md`).

Re-check after the owner-confirmed refactor (2026-10-14, 95696cd): it renames no behaviour and changes no
user-visible state, so no feature or spec sentence depends on it. `grep -rniE "in flight|in-flight"
docs/specs/app-update.md docs/features/app-update.md CONTEXT.md` → spec lines 46, 87–88, 118, 168, 196,
316–317 (none in the feature entry or CONTEXT); every "update in flight" means downloading, ready or
installing, which is what the predicate takes its name from, and "check in flight" is a different thing the
predicate does not cover. Queue empty again.

## Ticket #231 — The settings "Updates" section

- Date: 2026-10-14
- Scope: this ticket's change only (not the full-feature closeout)
- Version: branch `feat/settings-updates` on dab4da4, working tree as committed for the ticket's PR

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/app-update.md` Implementation Decisions, IPC | the main process's settings check record and its channels | Was untrue ("naming the surface that asked"): settings asks through its own request and the main process keeps settings' check record. Rewritten |
| `docs/specs/app-update.md` Implementation Decisions, the first run after an update | `recordRunVersion` and where it is called | Was incomplete ("written at each launch"): only a run that checks for updates reads and writes it, and why. Rewritten |
| `docs/specs/app-update.md` failure modes for #231's units (A6 manual, B2 line, C7–C11, D2, D3, D5, D6, G2, G4) | tests | Each has a case or a stated gap (test review record) |
| `docs/features/app-update.md`, every changed line | the spec's user-visible layer (US-002, US-003/AC-02, AC-03, REQ-003, REQ-004, US-005/AC-02) | True. The menu item (#232) is not claimed; the schedule line now says it runs while automatic checks are on |
| `CONTEXT.md`, new invariant (development runs share userData) | the observation (one inode for both names) and the spec decision it cites | True |
| Dictionaries, six languages, `settings` (Updates section) and `toast` (the switch's save failure) | the confirmed prototype's copy; the spec texts (US-003/AC-02, REQ-003, REQ-004) | True; `pnpm check:i18n`, typecheck and the distinctions test green (French on/off accepted with its reason) |
| theme.css comments (unavailable segment; the version row) | the measured hover and unavailable states (`evidence/ticket-231/README.md`) | True |
| `e2e/app-update.spec.ts` header (gap note removed) | the case now added | True: the gap is closed |
| The settings prototype (unchanged) | the section as built (screenshots) | Same form: the card's two rows, the mono version, the line's three tones, "Check now" / "Install now", the footnotes |
| ADR-0032 (unchanged) | the implementation | True: manual checks from settings, the switch governs automatic checks only |

### Stage 2: related declarations

| Relation | Rows (derived) | Conclusion |
|---|---|---|
| File ↔ index row | `docs/features/README.md` app-update row; `docs/specs/README.md` app-update row | Both still true ("found and downloaded in the background, and installed with one click or on quit" does not exclude the settings section) |
| A fact ↔ its statements elsewhere: the settings page gains a third section | `docs/features/appearance.md` ("the same page also has a Language section"); `docs/features/i18n.md` ("opens with Language as its first section, above appearance"); `docs/specs/appearance.md` (Language and Appearance share the row form) | All true: none lists the sections as a complete set; the Updates section uses the same row form |
| A fact ↔ its statements elsewhere: the settings lead ("preferences … apply to the whole interface") | the dictionaries' `settings.lead`; the confirmed prototype | Judged true: the switch applies app-wide rather than to a part of the page, and the confirmed prototype shows the same lead above the Updates section |
| A fact ↔ its statements elsewhere: the six READMEs | settings words counted per README (control "Agentshed" hits once in each) | No README speaks of settings: nothing to align |
| A fact ↔ its statements elsewhere: #230's records of the tooltip gap | `ticket-230-review-tests.md`, `ticket-230-tasks.md`, the checklist's #230 row | Each said the line was unreachable until settings could check; it was reachable through the wake path. Corrected in place |
| Rule ↔ gate: no dictionary collapses a source distinction | the distinctions test | The five accepted pairs carry their reason; an accepted pair applies to every language, and the reason holds for any language using one word for "on" and "enabled" |
| Rule ↔ gate: dictionary copy names no rail control verbatim | `pnpm check:ui` | Green; the footnote says "the update button at the bottom left", a description, not a label |
| Rule ↔ template | none changed this round | Row set empty |

### Stage 3: events

| Event | Search or source | Conclusion |
|---|---|---|
| The settings page's sections went from two to three | `grep -rniE "two sections\|both sections\|three sections\|language and appearance\|language, appearance\|its sections\|settings (page\|dimension) (has\|holds\|contains)"` over docs (outside workings and prototypes), CONTEXT, READMEs, dictionaries → i18n spec 91, appearance spec 230–231, plugins-view spec 186, project-detail spec 199, the new feature line | Each read: none counts or lists the settings sections as a set (the i18n row counts "follow system" settings, which the switch is not); no change |
| A new runtime dependency (semver) | `grep -rniE "electron-updater\|dependencies\|tech stack" README*.md docs/features CONTEXT.md AGENTS.md` (the #230 search) | No document lists dependencies |
| Pending notes in scope | `docs/specs/app-update.md` (Testing Decisions: two releases), `docs/ops/mac-signing.md` (none since #244) | Not expired by this ticket — #240's |
| A newly observed general fact (development runs share the installed copy's userData) | — | Its home is CONTEXT's invariants (added) and the spec's decision for the version record; the code comment points to the same fact |
| Work state: #230's gap closed by a case here; #231's coverage rows, document sync checklist and issue | — | #230's records corrected in place; #231's updated at delivery |

Queue empty after the pre-delivery scope re-check (see `ticket-231-doc-sync.md`).
