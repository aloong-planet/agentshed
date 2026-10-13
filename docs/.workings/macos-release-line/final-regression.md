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
