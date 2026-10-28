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

## 2026-10-24 — The hero need not match the README (landing-page::REQ-007 narrowed; no ticket)

- Date: 2026-10-24
- Scope: this change only, `git diff 544f21f` on branch `test/drop-readme-hero-check`: the owner dropped the hero's tie
  to the README (`checklist.md`, the source row of 2026-10-24); REQ-007 keeps the heading, the tie goes to Out of Scope,
  and the built-site check's README case is deleted
- Version: 544f21f with this change's edits, committed together; the site tests and lint ran on it
  (`evidence/readme-tie-2026-10-24/site-and-lint.txt`), the language, shared-UI and NUL checks on the final tree
  (`evidence/readme-tie-2026-10-24/checks.txt`)

The two questions for the feature catalogue: **what became a lie** — the entry's hero line, "the README's opening line
as its heading and its summary as the paragraph": still true of today's page, but it states a tie the spec no longer
has, so a later README change would make it false with nothing to notice; rewritten to the spec's words (a title and a
one-paragraph description). **What was missing** — nothing: the page shows what it showed.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/landing-page.md`, REQ-007 (now the heading only) and Out of Scope (the tie) | the built page's English heading (the built-site case, passing); the owner's decision (the checklist's source row) | True |
| `docs/specs/landing-page.md`, the rest | the change: no copy, structure or behaviour touched | Unchanged and true. Further Notes' "the heading and the README's summary in the hero", confirmed on 2026-10-21, is a dated record of that confirmation: kept |
| `docs/features/landing-page.md`, the hero line | the spec's US-001/AC-01 (icon, title, one-paragraph description, the button with the platform line, the whole window) and REQ-007 | True; spec and entry agree, and the entry states nothing the spec lacks |
| `site/test/built-site.test.ts` (the README case deleted; the English heading case moved into the sections group) | the spec's REQ-007; the test file's header (it names what the check cannot see; no README) | True |
| `site/README.md`, the note on the built-site check | the test file: it reads no README now | True |
| The landing prototype's two notes (the header comment's Memory paragraph; decision (o) in the confirmed list) | the spec's REQ-007 and Out of Scope | Marked no longer in force where the conclusion was made; the page's copy and interface are unchanged, so the prototype still matches the page |
| ADRs | — | Row set empty: dropping a copy tie is not a decision that meets the ADR bar (easy to reverse, no alternatives weighed) |
| `CONTEXT.md` | `git grep -n -i readme -- CONTEXT.md`: no output | Row set empty: no term or invariant names the tie |
| `checklist.md` (header, the D19 and D23 rows, the new source row, REQ-007's planned verification, the #279 current-verification row, the new current-verification row, the two-way audit row) | `evidence/readme-tie-2026-10-24/` | True |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | `docs/features/README.md` (Landing page: "The website that introduces Agentshed in Chinese and English and offers whichever release exists"); `docs/specs/README.md` (landing-page) | Both still true; unchanged |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: the hero repeats the README | `git grep -n -i readme -- docs site scripts .github CONTEXT.md AGENTS.md package.json site/package.json` (529 lines); scripts in those files: Han in `docs/`, `site/` and `scripts/`, Latin everywhere, so the Chinese side searched too, for the Chinese words for a readme (`git grep -n -P '(*UTF)\x{81EA}\x{8FF0}\|\x{8BF4}\x{660E}\x{6587}\x{4EF6}'`: no output; the same form finds the Chinese word for the hero in the prototype, so it reads Han text; the Chinese statements write "README" as is, and the search above found the prototype's decision (o)). Current statements: the spec, the features entry, `site/README.md`, the prototype's two notes — all changed (stage 1). The rest are dated records: #279's tasks, test and code reviews and its final regression above, `../readme/final-regression.md`, the evidence of #279 | The dated records describe what was decided and checked then: kept |
| One fact ↔ its other statements: the English heading's text | the spec's REQ-007, the built-site case, `site/src/i18n/ui.ts`, `README.en.md`'s opening line | Agree: all read "Your coding agents, in full view" |
| Rule ↔ the gate that holds it: REQ-007 | the built-site case "the English heading reads as the spec’s", in `pnpm test:site`, which `pnpm verify` and CI run | Held. The dropped tie has no gate left, by the owner's decision. `check:ui` still reads the READMEs, for i18n::CON-001 (each README links the other), which this change does not touch |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed | — | Row set empty: no languages, platforms or agents added or removed |
| `Pending:` notes in scope | `grep -n "Pending:" docs/specs/landing-page.md`: no output | Row set empty |
| New general rules this round | none: a rule was dropped, not made | Row set empty |
| A requirement narrowed with the owner's approval | landing-page::REQ-007; the checklist's source, planned-verification, current-verification and audit rows | Recorded in the checklist (removal mapping in its two-way audit); no ID retired or reused |

## Ticket #253 — Upgrade the GitHub Actions in the three workflows to their current majors

- Date: 2026-10-26
- Scope: this ticket's change only, `git diff 9685ccf` on branch `chore/actions-current-majors`: the three workflows'
  action pins and one comment in `ci.yml`, `scripts/workflow-actions.test.mjs` (new), the release workflow test's
  pinning case removed, `pnpm test:scripts`, the `CONTEXT.md` invariant, the release runbook's "Actions" bullet, the
  coverage checklist's rows, #240's document sync checklist (one follow-up row), and this ticket's records; and, by the
  owner's decision D5, `site/test/build-site.ts` (the site tests build on the site's own filesystem, for ubuntu-26.04)
- Version: 2e9d247 for the workflows and the static test (the full gateway ran on it, `evidence/ticket-253/gateway-2e9d247.txt`);
  b0ac644 adds the site tests' fix (the full gateway ran again on it, `evidence/ticket-253/gateway-b0ac644.txt`); the
  commits after it change records and evidence only

The two questions for the feature catalogue: **what became a lie** — nothing. The change is to the repository's
workflows, a static test and the site tests' set-up; no product code changed (`git diff --stat 9685ccf -- src site`
lists only `site/test/build-site.ts`), and the app and the landing page behave as before. Distribution is outside the catalogue by the owner's choice (the specs index;
mac-distribution's Out of Scope). **What was missing** — nothing: no user-visible behaviour was added or changed. So
`docs/features/` is unchanged.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| The three workflows' version comments (`# v7.0.1` and the rest, 24 lines) | each comment's commit resolved from that release's tag in the action's own repository (`evidence/ticket-253/actions-and-targets.txt`); the static test's third case (one commit names one release) | True |
| `ci.yml`, the comment on `pnpm test:scripts` | `package.json`'s `test:scripts` (the packaging asset's tests, the release scripts' and workflow's tests, and `workflow-actions.test.mjs`) | True |
| `scripts/workflow-actions.test.mjs`, its header (the rule, the two reasons, the gap) | the release workflow's gate job `env` and publish job `permissions`; the ruleset on `main` (20237985: CI's two jobs and the message-language job required); the cases beneath it | True after the code review's P1 (the required checks named in full) |
| `scripts/release-workflow.test.mjs`, its header | its cases after the pinning case's removal: the header never listed pinning | True |
| `CONTEXT.md`, the invariant "Every action in every workflow runs at a full commit, with its release in a comment" | the three workflows at 2e9d247; the static test; the ruleset; the owner's decisions (2026-10-18 for `release.yml`, 2026-10-26 for the other two) | True |
| `docs/ops/mac-signing.md`, CI, "Actions" | the workflows; the static test; the `CONTEXT.md` invariant | True; "`ci.yml` uses tags" removed |
| `docs/ops/mac-signing.md`, CI, "Tests" (unchanged line, re-read since its neighbour changed) | `scripts/release-workflow.test.mjs` still evaluates the conditions; `pnpm test:scripts` runs it | True |
| `checklist.md`: the increment line, the "#253, regression" row and its current-verification row | the workflow's units in the spec; the gateway log; the manual run's evidence (`evidence/ticket-253/manual-run.txt`) | True; the tag tier's download stays Waiting, as the row says |
| `ticket-240-doc-sync.md`, the follow-up row | #253's third acceptance item; the checklist's #253 row | True |
| `site/test/build-site.ts`, its header (a fresh build per run, in a new directory under the site's `node_modules/.cache`, and why: Astro's rename fails across filesystems, as on ubuntu-26.04) | CI's failing run 40266512391 (ubuntu-26.04, EXDEV from the workspace to `/tmp`) against main's last green run (ubuntu-24.04), and CI's green run 40277001845 on bb0a7f9, ubuntu-26.04, 107 site tests (`evidence/ticket-253/ci-312.txt`); the local repro with `TMPDIR` on another filesystem, red before (`exdev-repro.txt`) and green on bb0a7f9 (`exdev-after-fix-bb0a7f9.txt`, with its version list) | True |
| Specs, ADRs, features, prototypes | — | Row set empty: none changed. The spec's Testing Decisions ("The workflow conditions get a static test …") still describe `release-workflow.test.mjs`, which keeps every condition case; the pinning rule is a repository rule, not a release-line requirement, so its home is `CONTEXT.md`, not the spec. Not an ADR: easy to reverse, with its one trade-off (manual upgrades) stated in the invariant |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | — | Row set empty: no file added or renamed in `docs/specs`, `docs/features` or `docs/adr`; `CONTEXT.md` has no index |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: which workflows are pinned, and to what | the scope `docs/specs docs/features docs/adr docs/ops docs/agents CONTEXT.md AGENTS.md README.md README.en.md site/README.md .github capabilities.toml package.json` (86 tracked files), searched for action names, `@v<n>`, "pinned", "full commit", "uses tags" and "moving tag" (`evidence/ticket-253/step8-searches.txt`): the invariant and the runbook's bullet (both changed); every other "pinned" is another sense (the landing page's showcase, chart labels, a test's language). Scripts in the scope: Han in six files (`README.md`, `README.en.md`, ADR-0015, ADR-0017, i18n's spec and entry), so the Chinese words for a workflow, for pinning or a fixed commit, and "Actions" were searched there: no output; the control, the Chinese word for download in `README.md`, matched 5 lines | Agree |
| One fact ↔ its other statements: the workflows and their number | the same scope, searched for "two/three/both/every/all/each workflow(s)" and the three file names: the invariant, the runbook's bullet and its table (`release.yml` by name), `docs/ops/r2-setup.md:52` (`release.yml`'s two jobs) | Agree; nothing counts the workflows |
| One fact ↔ its other statements: what `pnpm test:scripts` runs | `git grep -n 'test:scripts'` over tracked files: `ci.yml` (changed), `docs/ops/mac-signing.md:18` and `:136`, each naming one file it runs | Agree (the code review's C1) |
| One fact ↔ its other statements: where and how the site tests build | `git grep` for the temporary directory, a fresh build and the global setup over the site, the specs, features, ADRs, `CONTEXT.md`, both READMEs, `package.json` and `.github` (`evidence/ticket-253/step8-searches.txt`, the D5 part): the setup's header (changed), `site/README.md:53`–`:54` ("builds the site into a new temporary directory once per test run"), `ci.yml:41` ("on a fresh build"), the landing-page spec's Testing Decisions ("a fresh build made for the run"), `README.en.md:91` (the app's e2e, another build) | Agree: each still true of a new directory per run |
| Rule ↔ the gate that holds it: every action at a full commit with its release in a comment, one commit per action | `scripts/workflow-actions.test.mjs` in `pnpm test:scripts`, which `pnpm verify` and CI's checks job run; seen red on `main`'s workflows (`evidence/ticket-253/red-first.txt`) | Held for the form. Not covered, and held by people (stated in the invariant and the test's header): which release a commit is, and whether it is the current major |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: the workflows the pinning rule covers (one → three) | statements that list which workflows are pinned: the stage-2 search; the runbook's "`ci.yml` uses tags" was the one, now rewritten | True |
| CI's runner image changed (`ubuntu-latest`: ubuntu-24.04 → ubuntu-26.04, between 2026-10-24 and 2026-10-26) | statements naming the runner's system or the temporary directory (`git grep -i "ubuntu\|24.04\|26.04\|tmpfs\|/tmp"`, `step8-searches.txt`): the workflows' `runs-on: ubuntu-latest`, `ci.yml`'s comments on e2e on ubuntu and on apt package names drifting, the runbook's "The publish job runs on `ubuntu-latest`", the appearance spec's hover shade read on macOS only ("on ubuntu, where CI runs e2e … measured 2026-10-23"), and the site's set-up (changed). The tools the release jobs use on it, GitHub CLI and AWS CLI, are in the ubuntu-26.04 image's software list (runner-images `ubuntu26/20261012.163`) | True: none names a version of ubuntu; the appearance line is a dated measurement whose case still skips on ubuntu (e2e green on ubuntu-26.04 in run 40266512391) |
| `Pending:` notes in scope | `grep -n "Pending:" docs/specs/mac-distribution.md CONTEXT.md docs/ops/mac-signing.md`: no output (exit 1), the three files read (340, 768 and 160 lines, `evidence/ticket-253/step8-searches.txt`) | Row set empty |
| New general rules this round | every action in every workflow at a full commit with its release in a comment, at one commit across workflows | Canonical home: `CONTEXT.md`'s invariant; the runbook points to it; the static test holds its form |
| The review findings: the code review's P1 and C1; the post-implementation check (no finding, `ticket-253-review-tests.md`); D5's code review (no finding) and its incremental test check (F1: the after-fix evidence bound to no version, the CI runs not kept) | the test's header, `ci.yml`'s comment, the records, the evidence | Each handled in place (the records); F1 by keeping the CI runs (`ci-312.txt`) and a versioned rerun (`exdev-after-fix-bb0a7f9.txt`) |
| Work state changed | #253's issue (body rewritten on 2026-10-26: three workflows, the pinning rule, the records; D5's addition the same day); the coverage checklist; this ticket's document sync checklist; #240's (the third item's follow-up); other records naming #253 (`rg -uu -l '#253' docs README.md README.en.md CONTEXT.md`: `ticket-234-review-code.md` and `ticket-234-tasks.md`, dated notes that the ticket was opened and blocked by #239) | Updated where they state this ticket's current state; the dated notes stay true: kept. #239's blocking item is met (the run of `v0.1.0-beta`), stated in #253's body |

## Ticket #240 — Update an installed pre-release to the next one

- Date: 2026-10-28
- Scope: this ticket's change before the tag, `git diff 2cb6b4f` on branch `feat/update-to-next-beta`: `package.json`'s
  version (0.1.0-beta.2); after the post-implementation check, the installed copy's update source with an injectable
  loader and its unit tests (D7), the app-update spec's H2, C4 and Testing Decisions (D5, D7, D8), the test file's
  header (D9's evidence); the coverage checklist's round; this ticket's records. The release `v0.1.0-beta.2` and the
  real update path come after the merge and the tag; their events are written back in this ticket's records pull
  request, as a section after this one
- Version: fa428ee for the version change, fa809ba for the source, its tests and the spec, caf6195 for the header and
  the records (the full run before the pull request reads the final tree)

The two questions for the feature catalogue: **what became a lie** — nothing. The version is not a behaviour; the
source's change keeps what it does (the loader is the code it replaced, moved, and D9 ran it in a packaged build); the
spec's H2 and C4 now say what the app already did. `docs/features/app-update.md` says only that "a failed install
after the click shows an error notice", true of C4's remaining causes, and says nothing of signatures. **What was
missing** — nothing: no user-visible behaviour was added or changed. So `docs/features/` is unchanged; the entry is
checked against the real update path after the routes (the document sync checklist's row).

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `package.json`, `"version": "0.1.0-beta.2"` | the tag check (`evidence/ticket-240/tag-check.txt`); the runtime readers: the settings version row and the ready line, measured by e2e app-update::QR-001/AC-02 in Chinese and English on a build of this tree (`targeted.txt`, `pre-review-2992ad5.txt`); the verification run's artifacts, named for the version (`verification-run.txt`) | True |
| `docs/specs/app-update.md`, Failure H2 (two checks; a rejection while staging a failed download; one at install, after the app has quit, not installed and nothing shown) and C4 (no rejected signature among its causes) | `update-source.ts`'s staging wait; electron-updater 6.8.9's `MacUpdater`; Squirrel.Mac's `SQRLUpdater.m` (the staging check) and `SQRLInstaller.m` (the check in ShipIt before the installed app is moved); T2, and the local build's staging (`loader-check.txt`) | True |
| `docs/specs/app-update.md`, Testing Decisions: the installed copy's source as a seam, and the formal channel's condition | `update-source.test.ts`'s T1–T9, each red under its mutation (`adapter-mutants.txt`); D5 | True |
| `src/main/update-source.ts`, `UpdaterLoad`'s comment; `staged()`'s comment, unchanged, re-read | the code; H2 as rewritten | True |
| `src/main/update-source.test.ts`, the header (each gap with its condition) | D5, D7–D9; `loader-check.txt` for the loader and the adapter's check; the routes still to run for the restart, install on quit, the real package's signature check and the pre-release channel; the code for the flush and a rejection at install | True |
| `checklist.md`: the round's line, US-004/AC-01's and H2's rows, the current-verification rows for #240 (the version change, AC-01 Waiting, D9, the rest after the tag) and for #253's release profile | the owner's decisions; the evidence files named in each row | True |
| `ticket-240-doc-sync.md` | the coverage checklist; the task list | True |
| ADRs, features, prototypes, `CONTEXT.md`, the READMEs, the site | — | Row set empty: none changed |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | — | Row set empty: no file added or renamed in `docs/specs`, `docs/features` or `docs/adr` |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: the app's version, and which releases exist | the scope `docs/specs docs/features docs/adr docs/ops docs/agents docs/postmortems CONTEXT.md AGENTS.md README.md README.en.md site/README.md site/src src/shared/i18n .github capabilities.toml package.json` (131 tracked files; eleven hold Chinese), searched for `0.1.0`, "beta", "test version" and "current version", and in the eleven files for the Chinese words for version, test version, pre-release and preview (`evidence/ticket-240/step8-searches.txt`). Every statement naming `v0.1.0-beta` says it is the first release or is an example; the version row and the landing page's "Only a test version so far: {version}" and its Chinese form take the version at run time | Agree; no statement names the current version as 0.1.0-beta |
| One fact ↔ its other statements: what a rejected update package does | the same scope, searched for "signature", "reject", "staged/staging/Squirrel" and "install fail(ed)/Couldn't install", and in the eleven files for the Chinese words for signature, install failure and cannot install (`step8-searches.txt`, the part added after the fix): H2 and C4 (changed), the Implementation Decision "Ready means the update can install" and REQ-002/AC-03 (the toast for a failed install after the click), the feature entry's "a failed install after the click shows an error notice", the two dictionaries' "Couldn't install the update"; outside the scope, `staged()`'s comment, the test file's header and the checklist's H2 row | Agree: every place that says what a rejected signature does says the same; the toast stays C4's, for causes before the app quits |
| One fact ↔ its other statements: when channel selection on real releases is verifiable | the spec's Testing Decisions (changed); the checklist's US-004/AC-01 rows; the test file's header; #241's list of formal-release evidence (rewritten on 2026-10-27); #240's item | Agree, but for #240's item, rewritten with the pull request (its document sync row) |
| One fact ↔ its other statements: the update source's test seams | the spec's Testing Decisions (the update source, the installed copy's source, the scripted source); `update-source.test.ts`; `update-controller.test.ts`'s fake source; the e2e files' headers | Agree |
| Rule ↔ the gate that holds it: a release tag is `v` + the package version, on a main commit carrying it | the tag check (`scripts/release-tag.mjs`), run by the gate job before packaging; red for `v0.1.0-beta` and `v0.1.0-beta.1` on this version (`tag-check.txt`) | Held for the version; "on main" is held by people (mac-distribution Failure A5, the runbook) |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed | — | Row set empty before the tag: the releases stay one until the tag is pushed (the records pull request takes it) |
| `Pending:` notes in scope | `git grep -n "Pending:"` over the three specs, `CONTEXT.md` and the two runbooks (2216 lines, `step8-searches.txt`): app-update's "two releases exist, so an installation of the first has been updated to the second" | Not due: one release exists. Waiting on routes 1 and 2 (`ticket-240-doc-sync.md`) |
| New general rules this round | — | Row set empty: D1–D9 are this ticket's choices, in the task list; the spec carries the ones that describe the product (H2, C4, the seam) |
| Work state changed: app-update::US-004/AC-01's real-release evidence moved out of #240 | the checklist's rows (changed); #241 (rewritten 2026-10-27); #240's item | #240's item rewritten with the pull request |
| Work state changed: the release profile notarized on #253's upgraded actions; the source's staging wait now tested, and its loader run on a packaged build | #253's current-verification row ("the release profile's notarization on the new actions … the next tag runs it"); #230's row and review, which left the staging wait to #240's evidence | A current-verification row for the verification run 40522427267 and one for D9; #230's records are dated and stay as they are; the publish job's download step still waits for the tag |
| The review findings | the code review (none, then a second round with none); the post-implementation test check's findings 1–3 and the incremental check's 4–5 | Each handled: D7–D9, the spec, the records (`ticket-240-review-tests.md`, its dispositions) |
| Two owner questions asked on unchecked facts: D6 on REQ-002/AC-03 covering a rejected package, and D8's first answer on a rejection at install giving C4's toast | the questions' texts against the code and Squirrel.Mac's source | Each corrected and asked again with the fact checked (D6 → D7 and D8; D8 revised); the task list says so |

Queue empty; the pre-delivery scope re-check is recorded in the document sync checklist.

## Ticket #240, after the release — v0.1.0-beta.2 and the real update path

- Date: 2026-10-28
- Scope: the release `v0.1.0-beta.2` (the tag on main's c0da98a, run 40553823619) and what it made happen — the
  independent check of its files, the offline first launch, routes 1 and 2 on the owner's Mac, the release note, the
  live landing page; and this ticket's records change, `git diff c0da98a` on branch `docs/record-v0.1.0-beta.2`: the
  app-update spec's Testing Decisions (the Pending note's condition met), `update-source.test.ts`'s header (comments
  only), the coverage checklist, the task list, the document sync checklist, the code review's third round, the
  evidence of tasks 12–19
- Version: 92928ba for the spec, the header and the records; the records of this stage in the commit after it

The two questions for the feature catalogue: **what became a lie** — nothing. Routes 1 and 2 did what
`docs/features/app-update.md` says: the ready button installed the update and restarted into the new version, an update
left ready installed on quit and the next launch ran it, the first launch after the version went up said "You're up to
date", the ready state offered "Install now", and a test version was offered the newer test version. **What was
missing** — nothing: the release added no behaviour. `docs/features/` is unchanged.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/app-update.md`, Testing Decisions: the real path, channel selection on real releases and install on quit, accepted on an installation of one release updating to the next by each install route; the formal channel once a pre-release follows a formal release | routes 1 and 2 (`route1-*.txt`, `route2-*.txt`); E1 on real releases (`route1-staged.txt`); the formal channel still waiting (the checklist's US-004/AC-01 row) | True |
| `src/main/update-source.test.ts`, the header's gap for the restart, install on quit, the real package's signature check and the pre-release channel, now stated as met | the same evidence and `artifact-check.txt`'s designated-requirement check; the code review's third round | True |
| `checklist.md`: the round's line; the rows of 2026-10-28 (the release run, the independent check, the release note, the live page, E1, routes 1 and 2, H2, B3, the Testing Pending note); the AC-02 row replaced by its result; #230's, #231's and #235's conclusions; D9's conclusion; #253's two rows and its plan row | each row's evidence files, read again; the conclusions against those rows | True |
| `ticket-240-tasks.md` tasks 11–20, `ticket-240-doc-sync.md`, `ticket-240-review-code.md`'s third round | the checklist's rows; the evidence; the diff | True |
| The published release note of `v0.1.0-beta.2` (GitHub; mac-distribution::REQ-005) | the change between the tags (the scrollbars, appearance spec; the in-app update, app-update spec); the release's four assets (the table lists the DMG only); the run's gates and the independent check (before "notarized by Apple"); the compare link; the owner's summary | True (`release-note.txt`) |
| ADRs, features, prototypes, `CONTEXT.md`, the READMEs, the site | — | Row set empty: none changed |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | — | Row set empty: no file added or renamed in `docs/specs`, `docs/features` or `docs/adr` |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: when the real update path is verifiable | the scope of this ticket's earlier section (131 tracked files; Latin in all, Han in eleven), searched for "two releases", "first verifiable", "verifiable once", "real release", "real update path", "accepted by evidence", and in the eleven files for the Chinese words for real, two versions and verify (`evidence/ticket-240/step8-after-release.txt`): the changed sentence; ADR-0031's rejected option 11 and the site README's fixture note, about other things. Outside the scope: the test header and the checklist (changed) | Agree |
| One fact ↔ its other statements: what the real update path does (the restart, install on quit, the post-update line) | `docs/features/app-update.md`'s capabilities; the spec's US-001/AC-04, AC-05, REQ-004/AC-04, C1, C2, C7, CON-004; the settings footnote, in English "click the update button at the bottom left to install it and restart; otherwise it installs when you quit" and its Chinese form (seen in both routes' screenshots) | Agree with what routes 1 and 2 showed |
| Rule ↔ the gate that holds it | — | Row set empty: no rule changed this round |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: GitHub's releases, one → two (`v0.1.0-beta`, `v0.1.0-beta.2`) | statements counting or listing releases: the same scope searched for "only release", "one release", "single release", "first release", "0.1.0-beta", "releases exist", "no release", and in the eleven files for the Chinese words for only, first, first version, test version and "0.1.0" (`step8-after-release.txt`). Every hit names `v0.1.0-beta` as the first release or is an example, a fixture or a dated account (ADR-0035); the landing page's "Only a test version so far: {version}" and its Chinese form take the version at run time and read 0.1.0-beta.2 live (`landing-after-release.txt`). No structure aligned by position with the releases. The enumeration gate (`check:ui`, `enumeration-wording-gate`) does not cover releases, so this was a manual scan; releases are not a product dimension the app enumerates, so no gate is proposed | No statement became false |
| `Pending:` notes in scope | `git grep -n "Pending:"` over the specs, `CONTEXT.md`, `docs/ops`, `docs/features` and `docs/adr`, before (c0da98a) and after this change (`step8-after-release.txt`): before, app-update's "two releases exist, so an installation of the first has been updated to the second"; after, none | Due and disposed of in this change (rewritten as plain text, the note removed) |
| New general rules this round | — | Row set empty for the product. A verification fact learned: syspolicyd's info-level lines age out of the log store within minutes, so the offline launch's reachability and notarization-date lines exist only in the capture taken at 12:30 CST. It governs how release evidence is taken, not the product; it is stated in the evidence's header and in this report |
| Work state changed: #240's units verified on the real release | the checklist's #240 rows; #230's, #231's and #235's rows, which named #240's paths as unverified | Rewritten in this change |
| Work state changed: #239's deferred AC-02 passed | the checklist's AC-02 row (replaced); #239's item | The row in this change; #239's item after the merge (the document sync checklist) |
| Work state changed: #253's third item passed at the tag's run | the checklist's #253 rows and plan row; #240's verification-run row; #253's item | The rows in this change; #253's item after the merge |
| Work state changed: the release published, the live landing page now offering it | landing-page::REQ-001/AC-02, AC-05 (#239's row of 2026-10-22 recorded v0.1.0-beta) | A row of 2026-10-28 for v0.1.0-beta.2; no site change came with it |
| Found while checking: the rows of #234, #237 and #238 still say their #239 parts are unverified, though #239's rows of 2026-10-21/22 verified them | the checklist's current verification | Not this round's facts (#239's); left for #241's closeout, which verifies every row of the feature |
| The review findings | the code review's third round: R3-1 (a comment line over the block's width), fixed; no post-implementation check this round, since the test file changed in comments only (change-scope against c0da98a: `same`; `ticket-240-review-tests.md`) | Handled |

Queue empty; the pre-delivery scope re-check is recorded in the document sync checklist.
