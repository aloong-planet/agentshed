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

## Ticket #232 — "Check for Updates…" in the application menu

- Date: 2026-10-14
- Scope: this ticket's change only (not the full-feature closeout)
- Version: branch `feat/menu-check-updates` on bf77387, working tree as committed for the ticket's PR

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/app-update.md` Implementation Decisions, IPC | `menuCheck` and `sendUpdateNotice` | Was incomplete (the menu's outcome had no route): it is a one-off update notice, answered with a toast. Added |
| `docs/specs/app-update.md` Testing Decisions, the menu template | the e2e spec | Added: e2e clicks the item through the installed menu and reads its label after a switch |
| `docs/specs/app-update.md` failure modes for #232's units (A6 menu, B2 toast, C6 menu, D1, D3, D4, G2 menu, G6 menu) | tests | Each has a case (test review record) |
| `docs/specs/i18n.md` the known test gap | the e2e reading the installed menu | Was outdated ("whether it rebuilds after a switch can only be accepted by hand"): rewritten; what macOS draws stays the gap |
| `docs/features/app-update.md`, every changed line | the spec's user-visible layer (REQ-005, US-003/AC-01, AC-04, AC-05, US-005/AC-02) | True; the network boundary now names the menu as a way to check by hand |
| `docs/features/i18n.md`, the menu line | the template | Was incomplete (named Settings as the menu's one entry into the app): now names both entries |
| Dictionaries, six languages, `menu.checkForUpdates`, `update.toastUpToDate`, `update.toastFound` | the confirmed prototype's menu-toast copy; the label is copy only outside Chinese | True; gates green; no new collapse in the distinctions test |
| `UpdateSlot.tsx` header comment | the notice handler | True: it answers both notices with toasts |

### Stage 2: related declarations

| Relation | Rows (derived) | Conclusion |
|---|---|---|
| File ↔ index row | `docs/features/README.md` and `docs/specs/README.md` app-update rows | Still true |
| A fact ↔ its statements elsewhere: the menu gains an entry into the app | `grep -rniE "application menu\|app menu\|menu bar"` over docs/features, docs/specs (outside app-update), CONTEXT, READMEs → i18n feature 10, 26, 27; appearance feature 28; i18n spec 41, 152, 283, 389, 460 | i18n feature 27 rewritten (see stage 1); i18n spec 389 rewritten; the rest true — 283 already names the item, 460 holds (below "About" is the platform's own place) |
| A fact ↔ its statements elsewhere: update notices now carry the menu's outcome | `src/shared/update.ts` comments; the spec's IPC bullet | Both say so |
| Rule ↔ gate: no dictionary collapses a source distinction | the distinctions test | Green: the new strings collapse nothing new |
| Rule ↔ template | none changed this round | Row set empty |

### Stage 3: events

| Event | Search or source | Conclusion |
|---|---|---|
| The application menu's entries into the app went from one to two | the stage 2 search | One enumerating sentence (i18n feature 27), rewritten |
| Pending notes in scope | `docs/specs/app-update.md` (Testing Decisions: two releases) | Not expired — #240's |
| No new general rule | — | Row set empty |
| Work state: #232's coverage rows, document sync checklist and issue | — | Updated at delivery |
| The owner's native menu screenshot arrived (2026-10-14; app-update::REQ-005's Evidence) | the screenshot against the template's application submenu and REQ-005 ([evidence/ticket-232/](evidence/ticket-232/README.md)) | Agrees with both: the item directly below "About Agentshed", enabled, English as the interface language. Updated in place: the task list, the test review's gap and conclusion, the coverage row, the document sync checklist and the issue's REQ-005 box. Scope re-check: the specs' "accepted by hand — a known gap" (app-update Testing Decisions, i18n's known test gap) names the method, not a pending state, and stays true; no feature statement mentions the picture |

Queue empty after the pre-delivery scope re-check (see `ticket-232-doc-sync.md`).

## Ticket #239 — Launch v0.1.0-beta: the first pre-release, the live landing page and the README

- Date: 2026-10-21
- Scope: this ticket's change only, `git diff b3cb0f5 3064371` plus the records after it (not the full-feature
  closeout, which is #241)
- Version: branch `feat/launch-beta` at c5f44b9 (main merged in, the owner's choice of 2026-10-21) and the records
  after it

The two questions for the feature catalogue: **what became a lie** — nothing in an existing entry (no product
behaviour changed; the landing page's live behaviour was already described by its spec, and the app's language
entry is #277's); **what was missing** — the landing page, live since the owner's Pages action, had no entry: written,
with its index row. mac-distribution gets none: the catalogue leaves distribution out (the owner's decision of
2026-10-19), a rule the catalogue's README now states.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/features/landing-page.md` (new) | the landing-page spec's user-visible layer (the language toggle, the sticky header, the hero, the three download states, the in-place change, the download section, the features walk, the install steps, the appearance, links); the live page read in Chrome before any tag (list state, both languages); ADR-0035 for "Chinese and English only" | True; every capability traces to a spec requirement verified by #237 and #238 in a browser, and the list state is the one the live page shows today |
| `docs/features/README.md` (the index row; the content rule "distribution is not catalogued") | the entry; mac-distribution's Out of Scope; the specs index's exception | Agree |
| `README.md`, `README.en.md` (the download and install section) | mac-distribution's README decision and US-003/AC-01; the landing page's install section; the packaged app's `LSMinimumSystemVersion` 12.0 | True: the same requirements (macOS 12 or later, Apple Silicon), the same three steps, no version named; checked element by element in the code review |
| `docs/specs/mac-distribution.md` (the Pending note resolved into Out of Scope) | the to-spec rule for a Pending condition that became "decided not to" | Moved into Out of Scope with its reason and no timeline |
| `docs/specs/landing-page.md` (the Pending note removed; the header's links) | the live page (200 at both addresses) and the new entry | True |
| `docs/specs/README.md` (the one-to-one rule's exception; the two rows) | the features index; the two specs' headers | Agree |
| `package.json` (`0.1.0-beta`) | the tag check (`tag-check.txt`); the runtime readers (the settings version row measured by the e2e QR-001/AC-02, green in both languages) | True |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | features (landing-page row added); specs (mac-distribution and landing-page rows) | Agree |
| Rule ↔ template and generated documents | the catalogue's content rule ("distribution is not catalogued") ↔ the catalogue README that states it, and the specs index's exception that cites it | The README states it in words a reader needs no skill to understand |
| One fact ↔ its other statements: "macOS 12 or later, Apple Silicon" | both READMEs, the landing page's hero and install section, the mac-distribution spec, the packaged app's minimum | Agree |
| One fact ↔ its other statements: "download from the landing page or GitHub Releases" | both READMEs' links; the landing page's list-state link (the releases page) | Agree; the links resolve (200) |
| One fact ↔ its other statements: "the app speaks Chinese and English" | the landing-page entry's boundary; landing-page::CON-002; ADR-0035 | Agree |
| Rule ↔ the gate that holds it: mac-distribution::US-003/AC-01 | `check:lang` | Holds `README.en.md`'s language only (red under a planted word, `check-lang-readme-plant.txt`); the Chinese README's rule cannot go red, and the instructions in both are held by the code review's README check — stated in the test review |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: the READMEs, six → two (#277, merged in) | #239's own files and records searched for six READMEs; #239's issue text | The checklist row and the issue's quotes say two; the records keep "six" only in dated decisions |
| `Pending:` notes in scope | mac-distribution's ("a notarized release is downloadable"), landing-page's ("the page is live") | landing-page: due, the page is live — removed. mac-distribution: its condition turned into "decided not to" by the owner's decision — moved into Out of Scope |
| New general rule: the feature catalogue leaves distribution out | its canonical home | The features-catalog skill already states it; the project's catalogue README now does too, so a reader of the project finds it |
| Work state changed | #239 blocked by #277, merged in by a merge rather than a rebase; the issue's quotes; the tasks file; the coverage checklist; the document sync checklist | Each updated; listed in `ticket-239-doc-sync.md` |
| The post-implementation test check's findings | seven findings: the design table's version readers and README scope, two coverage rows, two kept reds, two release-check plans | Records corrected; the evidence files added |

Queue empty; the pre-delivery scope re-check is recorded in the document sync checklist.

### After the release (2026-10-22)

- Scope: the records pull request after `v0.1.0-beta` was published from main's 7dc0c22 — REQ-006's and the
  runbook's rewording, and the release events
- Version: branch `docs/release-beta-records` on 7dc0c22

The two questions for the feature catalogue: **what became a lie** — nothing: the landing-page entry describes the
three download states, and the live page now shows the test state it describes; **what was missing** — nothing: a
release is not a product behaviour, and distribution is not catalogued.

| Stage 1: declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/mac-distribution.md` REQ-006 ("a commit of main that carries that version") | the owner's decision; the tag on 7dc0c22, whose `package.json` says 0.1.0-beta; the tag check, which compares only the tag and the version (`release-run.txt`) | True |
| `docs/ops/mac-signing.md`, "A pushed tag is a public release" | the same | True |

| Stage 2: relation | Rows | Conclusion |
|---|---|---|
| One fact ↔ its other statements: where a release tag goes | REQ-006; mac-distribution Failure A5 ("tags only after the version change is merged"); the runbook; the checklist's REQ-006 row | Agree after the rewording; A5 already said "after the version change is merged" |
| One fact ↔ its other statements: "download from the landing page or GitHub Releases" | both READMEs; the landing page's hero (now the test state, leading to the release) | Agree; the release page and the DMG resolve |
| One fact ↔ its other statements: "notarized by Apple" | the release note; both READMEs' install steps; the landing page's install section | Agree; the note's claim follows the gates and the independent check |

| Stage 3: event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: releases, none → one pre-release | statements about there being no release, searched in English and Chinese across `docs/` (records excluded), `CONTEXT.md`, the READMEs and `site/` (`rg` for "no release", "first release", "0.1.0-beta" and their Chinese forms) | Each still true: the ones about the first release name `v0.1.0-beta`; "the mirror and pointer jobs have not run" holds (they were skipped); the landing-page failure A1 is a boundary, not a claim about now |
| `Pending:` notes in scope | app-update's ("two releases exist") | Not due: one release exists |
| Work state changed | #239's issue items; #240 (now unblocked, and carrying AC-02's user path); the coverage checklist; the document sync checklist; the tasks file | Updated here; the issues after the merge |
| A deferred acceptance | mac-distribution::US-001/AC-02's user path | Recorded with its trigger, method, verifier and evidence place in the checklist; carried to #240 |

Queue empty; the post-release scope re-check is recorded in the document sync checklist.

## Ticket #279 — The landing page's memory and search steps, and its pinned features section

- Date: 2026-10-21
- Scope: this ticket's change only, `git diff fcf41bc` on branch `feat/landing-global-search` (80f2968, the spec,
  prototype and records; 7af1220, the implementation; the step 8 edits after it)
- Version: 7af1220 and the documentation edits after it (no code changed after the gateway)

The two questions for the feature catalogue: **what became a lie** — the landing page's entry said the features
section walks through four views, with a frame that shows the step nearest its middle and steps to click: rewritten
for six views in a pinned showcase that the scroll turns, with "nothing to click between them" among its
boundaries; its hero line now says the heading and paragraph are the README's. **What was missing** — the memory and
search steps, and what a narrow screen or a page without scripts shows: both now in the entry.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/landing-page.md` (US-003, REQ-004, REQ-005, REQ-007, Sequence C, E2, the implementation decisions, Out of Scope, Further Notes) | the implementation at 7af1220, unit by unit (`ticket-279-tasks.md`, "Spec check before step 7"); every failure item of Sequence C and E2 against a test or a measurement (`ticket-279-review-tests.md`, dimension 1) | True: the final implementation, with C7 and the built form written back; every failure item covered |
| `docs/features/landing-page.md` (the hero line, the features capability, the new boundary) | the spec's user-visible layer: US-003/AC-01, AC-02, REQ-004/AC-01, AC-05, AC-06, AC-08, REQ-007, Failure C7, Out of Scope ("Clicking or keying between the feature steps") | Agree; nothing in the entry the spec lacks, and every visible change is there |
| ADRs | — | Row set empty: no decision of this round meets the ADR bar (a page layout, easy to reverse); ADR-0031 is not contradicted |
| `CONTEXT.md` | the words this round uses (showcase, step, turn) | Unchanged: the landing page is not part of the app's vocabulary, and no term of CONTEXT is used differently |
| The prototype (`docs/prototypes/landing-page/`) ↔ the site | copy item by item (ui.ts against the prototype's six steps and hero); the fourteen screenshots ([shots-check.txt](evidence/ticket-279/shots-check.txt)); the features section's geometry at three window sizes in both languages ([prototype-vs-site.txt](evidence/ticket-279/prototype-vs-site.txt)) | Identical. Differences that a visitor cannot see: the block's height comes from empty turn blocks rather than a custom property; without scripts the site shows the stacked steps (Failure C7, a boundary the prototype does not draw) |
| The prototype's own notes (the header comment and the acceptance note) | the decisions D1–D28 (`ticket-279-tasks.md`) | True after one fix: confirmed item (a) pointed to the search step as "the fifth"; it now points to the two later steps |
| `site/src/i18n/ui.ts` (the dictionary, a declaration surface) | the prototype's copy; the READMEs' opening line and summary (built-site check B5) | Agree |
| `site/README.md` (the scripts' description, the screenshots' provenance, what the built-site check reads) | `features.ts`, `shots.ts`, the built-site check | True |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | `docs/features/README.md` (Landing page: "introduces Agentshed in Chinese and English and offers whichever release exists"); `docs/specs/README.md` (landing-page) | Both rows still true; unchanged |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed this round |
| One fact ↔ its other statements: the app's summary | `README.md`, `README.en.md` (opening line and summary) ↔ the hero; the page's description and browser tab title | Agree (B5; both read from the hero copy) |
| One fact ↔ its other statements: the features section's six views | the spec (US-003/AC-01), the entry, the dictionary, the shot list, the prototype | Agree |
| One fact ↔ its other statements: the screenshots' provenance | the spec (REQ-005/AC-01, E2), `shots.ts`'s header, the site's README, the prototype's notes, the evidence | Agree: the hero and four cuts over the owner's data, the memory and search cuts over made-up data |
| One fact ↔ its other statements: the language switch keeps the visitor's place | the entry's language capability; REQ-004/AC-07 | Still true (M5, with its control) |
| Rule ↔ the gate that holds it: REQ-007 (the hero is the README's opening) | the built-site check B5, in `pnpm test:site`, which `pnpm verify` and CI run | Held for both languages; a change to either README's opening without the site's copy fails it. The site README now tells maintainers so |
| Rule ↔ the gate that holds it: "the steps are not counted or listed wrongly elsewhere" | `check:ui`, the project's enumeration-wording gate: its rules as its own run lists them (`evidence/ticket-279/gateway-7af1220.txt`, the `check:ui` step) | Its enumeration rule covers the app dictionary's agent sides; none of its rules reads the landing page's step count, so that is held by hand: Stage 3's search |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: the feature steps, four → six | Scripts in the searched files, counted first: Han and Latin in the specs, features, `site/src`, `site/test`, both READMEs, the prototype and its manifest; Latin only in `site/README.md` and `CONTEXT.md`. English: `rg -n -i "\b(four\|4\|five\|5)\b[^.\|]{0,40}\b(steps?\|views?\|screenshots?\|shots\|cuts?\|feature)"`; Chinese: the same search for a 4 or a 5 followed by the Chinese words for section, step, view, screenshot and item; listings by name: `rg -n -i "sessions revisited\|sessions, revisited\|token usage and trends"` and the same titles in Chinese. Parallel structures: the shot list and the dictionary's steps (the type requires six; B1 checks every source), the prototype's step array, the fourteen shots | Every count and listing says six, except two correct "four"s (the four cuts over real data) and the prototype's stale pointer, fixed (Stage 1) |
| `Pending:` notes in scope | `rg -n "Pending" docs/specs/landing-page.md docs/features/landing-page.md`: no output (#297 resolved the spec's only note) | Row set empty |
| New general rules this round | the hero repeats the README's opening line and summary; without scripts the stacked steps show; the pinned showcase never marks the language switch's place | Each has its canonical home in the spec (REQ-007; Failure C7; the language-toggle implementation decision and Failure C5), and REQ-007 a test |
| The post-implementation test check's findings (F1–F9, `ticket-279-review-tests.md`) | REQ-007's wording (F1); the checklist's REQ-007, AC-07 and Failures rows (F1, F4, F9); the test design table (F1–F5); the evidence README and records (F2–F7, F9); the test file's header (F8) | Each fixed in place; REQ-007's new sentence states the summary the owner chose (2026-10-21), so the spec gains precision, not scope; the entry's hero line ("the README's opening line as its heading and its summary as the paragraph") stays true |
| Work state changed | #279's issue (its records and acceptance items, declared 2026-10-21); #290's note that #279 waited for it (rewritten); the coverage checklist's #279 rows and current verification; the document sync checklist; the task list; records of other rounds that mention #279 (`docs/.workings/readme/final-regression.md`, `docs/.workings/global-search/final-regression.md`, `ticket-271-*`, `docs/.workings/memory-view/*`), found with `rg -uu -n "#279"` | Updated where they state this ticket's current state; the other rounds' dated records say what was true then ("until #279 lands"), which this change resolves without making them false: kept |

## Ticket #254 — Flaky e2e: the app-update case expects to read the download at 0%

- Date: 2026-10-23
- Scope: this ticket's change only, `git diff 1349d76` on branch `fix/app-update-e2e-first-step` (22c8ce6 the hold and
  the issue's case; 98b2208 the class after the owner's decision D3; the records and the step 7 write-backs after it)
- Version: 98b2208 for code and tests (the full gateway ran on it); the commits after it change documents only

The two questions for the feature catalogue: **what became a lie** — nothing. The change is to the e2e cases and to the
scripted update source, a test seam the app never uses unless `AGENTSHED_UPDATE_SCRIPT` is set; the app-update entry's
sentences, among them "A check that fails, and a download that fails, show nothing", describe the same behaviour and
are now checked by reads that can fail. **What was missing** — nothing: no user-visible behaviour was added or changed.
So `docs/features/` is unchanged.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/app-update.md`, Testing Decisions: the scripted source's holds and why a case holds | `src/main/update-source.ts` at 98b2208 (the guards and the poll); the measurements: a step passing before the window shows (`evidence/ticket-254/diag-before.txt`), a launch check's notice not showing when answered at once (`plant-check-notice.txt`) | True |
| `docs/specs/app-update.md`, the rest | the implementation (`ticket-254-tasks.md`, "Spec check before step 7") | Unchanged and true: no product behaviour changed |
| `CONTEXT.md`, the new invariant on "does not appear" checks | `Toast.tsx:23` (3.2 s); Playwright's default expect timeout (no `expect` in `playwright.config.ts`: 5 s); the planted toasts (`plant-notice-old-e2.txt`, `plant-startup-toast.txt`); the words "notice" and "toast" as the spec and CONTEXT use them | True; the same words as the spec (a notice, answered with a toast) |
| `src/main/update-source.ts`'s doc comment (the fields and what each hold is for) | the code beneath it; the measurements above | True |
| The e2e files' comments (`app-update.spec.ts`, `menu-check-updates.spec.ts`, `settings-updates.spec.ts`, `app.spec.ts`) | the cases' code; `src/main/index.ts:571`–`:580` (the menu's check, the one notice channel); `ipc-order.txt` (a window's requests in order) | True |
| ADRs | — | Row set empty: the change makes no decision that meets the ADR bar (a test seam's fields, easy to reverse) |
| The prototype | — | Row set empty: no interface change |
| The coverage checklists (`checklist.md`, `../i18n/checklist.md`), the current-verification rows added | `gateway-98b2208.txt` and the plant evidence they cite | True |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | `docs/specs/README.md` (app-update), `docs/features/README.md` (App updates) | Both rows still true; unchanged |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: what the scripted source does | the spec's Testing Decisions (changed), the source's doc comment (changed), the headers of `app-update.spec.ts`, `menu-check-updates.spec.ts` and `settings-updates.spec.ts` ("reads its script at every request", "every request logged"), `ticket-230-*` (dated records of the seam's creation) | The headers stay true (they list no fields; the holds read the script too); the dated records describe what was built then: kept |
| One fact ↔ its other statements: the toast's lifetime | `Toast.tsx:23`, CONTEXT's new invariant (`rg -n "3\.2 ?s\|3200\|3,200" docs/specs docs/features CONTEXT.md src/renderer/src/Toast.tsx`: these two, and global-search's unrelated 3.2 s read time) | Agree |
| One fact ↔ its other statements: REQ-002/AC-01, AC-02 ("show nothing") | the entry's line 42, the spec, the coverage checklist's planned verification rows | Agree; the checklist's current verification now cites a read that can fail |
| One fact ↔ its other statements: i18n::REQ-003's "with no notice" | the i18n checklist's row of 2026-10-21, which credited the retried read | Its conclusion stays true; the new row says the read could not fail then and can now |
| Rule ↔ the gate that holds it: "does not appear" checks | no gate reads e2e assertions | Held by people: the CONTEXT invariant states it; a lint rule over `toHaveCount(0)` would also flag the deliberate waits-out, so no gate is proposed |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: the scripted source's script fields (two added) | every listing of the fields: `rg -n "checkMs\|stepMs\|holdFirstStep\|holdCheck" docs src e2e --glob '!docs/.workings/**'` finds the doc comment (lists them all) and the cases that use them; the spec lists none by name. Scripts in the searched files: no Han characters in the spec, features, CONTEXT or the source; the e2e files' Chinese is copy under test (the update line and menu labels) | The one listing is complete |
| `Pending:` notes in scope | `rg -n "Pending:" docs/specs/app-update.md docs/specs/i18n.md CONTEXT.md`: one, app-update's "two releases exist, so an installation of the first has been updated to the second" | Not due: one release exists |
| New general rules this round | a case that must see a check in flight or a step holds it; a "does not appear" check reads against a later ordered event or counts once | Canonical homes: the spec's Testing Decisions, and CONTEXT's invariant |
| The post-implementation checks' findings (F1–F6, `ticket-254-review-tests.md`) | the test design table, the records' line numbers, the evidence headers, the document sync checklist, CONTEXT | Each handled in place (the record's handling sections) |
| Work state changed | #254's issue (its records and process acceptance, declared 2026-10-23); the coverage checklists; the document sync checklist; the task list; other records that mention #254 (`rg -uu -n "#254" docs README.md README.en.md CONTEXT.md`: `ticket-234-*` and `memory-view/ticket-294-review-tests.md`, dated notes that the issue was opened) | Updated where they state this ticket's current state; the dated notes stay true: kept |
