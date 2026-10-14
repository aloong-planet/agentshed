# Test review — ticket #231

Ticket: [#231 The settings "Updates" section](https://github.com/aloong-planet/agentshed/issues/231)
· feature `macos-release-line` · spec [app-update](../../specs/app-update.md)

- Date: 2026-10-14
- Version: branch `feat/settings-updates` on dab4da4, uncommitted working tree, after the code review
- Scope: `src/main/run-version.test.ts` (12), `src/main/settings-check.test.ts` (9), the switch's case in
  `src/main/prefs-handlers.test.ts`, the two parsers' cases in `src/shared/update.test.ts` (4),
  `src/renderer/src/version-row.test.ts` (6), the accepted list in `src/shared/i18n/distinctions.test.ts`, and
  `e2e/settings-updates.spec.ts` (24), and the case added to `e2e/app-update.spec.ts` for #230's gap

## Coverage

| Item of #231 | Covered by |
|---|---|
| app-update::US-002/AC-01 (through the switch) | e2e "a change is stored at once and survives a restart; with it off the launch makes no request" |
| app-update::US-002/AC-02 (through the switch) | e2e: On in a fresh installation (the section case); Off kept across a restart; the invalid-value fallback is the preference store's (#230) |
| app-update::US-002/AC-03 | e2e "turning it off during a download neither cancels it nor discards the ready update" |
| app-update::US-002/AC-04 | e2e, the switch case: On → no request recorded |
| app-update::US-003/AC-02 | e2e: checking with the button unavailable, then up to date / failed; unavailable while downloading; "Install now" while ready (the relabel case); "Check now" back after a failed install. Unit: version-row's button rules |
| app-update::US-003/AC-03 (settings) | e2e "a settings check that finds an update starts the download" (the rail's slot appears) |
| app-update::US-003/AC-05 (settings) | e2e "a settings check during the launch check joins it"; unit: the joined check stays checking |
| app-update::US-005/AC-02 (settings) | e2e "a development run …" |
| app-update::REQ-002/AC-03 ("Install now") | e2e "an install from 'Install now' that fails" |
| app-update::REQ-003/AC-01, AC-02 | e2e: the section case (order, rows, controls, footnote) and the development run (its footnote) |
| app-update::REQ-003/AC-03 | e2e: the switch case (stored at once) ; unit: the handler |
| app-update::REQ-003/AC-04 | e2e: the relabel case (same element, one install, unavailable while installing, the rail's spinner) |
| app-update::REQ-004/AC-01 | e2e: downloading, ready and installing lines; unit: version-row |
| app-update::REQ-004/AC-02 | e2e D5 case; unit: settings-check's found-clearing |
| app-update::REQ-004/AC-03 | e2e "the line survives leaving settings mid-check and follows a language switch; a restart starts empty" |
| app-update::REQ-004/AC-04 | e2e: seeded older, equal, newer, missing and unreadable records; unit: the version record |
| app-update::QR-001/AC-01 | Gate: `pnpm typecheck` (the dictionary type) and `pnpm check:i18n`; the distinctions test |
| app-update::QR-001/AC-02 | e2e: six languages × seven line states, labels, line, button and row overflow |
| app-update::CON-003 (#231's IPC) | unit: `parseSettingsCheck`, `parseCheckOutcome` |
| app-update::CON-004 ("Install now") | e2e: nothing installed before the click (the relabel case) |
| Failures A6 (manual), B2 (line), C10, C11, D5, D6, G2 (section and line), G4 | e2e, each named in its case's title |

Gaps, with their conditions:

- "Check now" back once the update is installed: the install restarts the app, which only a real release can
  do; the new run's "Check now" is what the section case shows. Real path: #240.
- The menu's parts of US-003/AC-05, D4, G2, B2 and US-005/AC-02 are #232's.
- Closed here: the gap #230 left — an open message closes with the update button, so the button does not come
  back with it (REQ-001/AC-04). The case is in `e2e/app-update.spec.ts` ("an open message goes with the
  button …"), and the header's gap note is gone. Its first form brought the button back with settings' "Check
  now" and **survived** the mutation of that line: opening settings scrolls, and any scroll closes the message
  through the anchor-invalidation hook, so that path cannot see the line. It now stays on the page and brings
  the button back through the wake path, and the mutation turns it red ("Expected: 0, Received: 1"). #230's
  record said the case needed settings' manual check; the wake path was there then too — corrected in
  `ticket-230-review-tests.md`.

Fixtures: the version record is this app's own file; the release versions follow the release line's tags
(ADR-0031: `0.1.0-beta`, `0.1.0-beta.2`, `0.1.0`), and a long valid one (`10.10.10-beta.12`) for the widest line.
No external data is read by this ticket's code.

## Case design

- Seams: the version record on a temporary directory (the filesystem is its boundary); settings' check record
  with an injected check standing for the controller's — exempted from "mock of the project's own module":
  it is constructor injection of the collaborator's contract (`CheckOutcome`), which the controller's own
  tests pin, and the real pairing is the e2e's; the version row as pure functions; the e2e through the real
  IPC and renderer with the scripted source (the spec's seam).
- Counts asserted: requests and installs at the scripted source — the requirement is the count ("one
  request", "installs once"), at the external boundary.
- The published sequence of settings' check record is the IPC push, the module's output.
- Every state is reached through public paths: the record through `check()` and the states the controller
  publishes; the e2e states through the scripted feed; a later automatic check through the real wake path
  (the main process's clock moved past the period and the system resume event — the system boundary).
- Clicks on unavailable controls are forced: Playwright waits for an `aria-disabled` control to become
  available, which landed one click after the check in the first run (a false red, fixed in the test).

## False greens

Cases written before their code went red first on their assertion (the version record's first case, the
write failure, settings' check record's first five, the switch handler, the parsers' accepting cases, the
version row's five). Every case written after its code was proven by a mutation that reached the code (the
mutated file differed from its backup, the failure named the mutated behaviour, files restored by copy and
compared byte for byte, e2e mutations built before running):

| Case | Mutation | Red as |
|---|---|---|
| version record: went down, equal, fresh | `gt` → `!==` | the C8 case |
| version record: pre-releases | string comparison | the C7/C9 and E1/E2 cases |
| version record: written each launch | rename skipped | the "follows every launch" case and the unreadable-record cases |
| version record: unreadable record | record not validated | the `v0.1` record |
| settings check: joined check | a find ends the settings check | **first survived** — the case started with no outcome, so the clearing branch never ran; it now starts from the post-update line, and turned red |
| settings check: non-outcomes | a non-outcome leaves "up to date" | the found, joined and non-outcome cases |
| parsers: refusals | found without the version check; in-flight without its phase check; any settings outcome | each refusal case |
| version row: development run | no development-run guard | the case first passed against the stub, which showed it could not see the guard (an empty record changes nothing); it now carries the post-update outcome, and the mutation turned it red |
| version row: installing | "Install now" available while installing | the button case |
| e2e D5 | a find does not clear the outcome | "Received: You’re up to date" |
| e2e development run | the run always counts as checking for updates; a development run records its version too; the switch acts there | each red at its assertion |
| e2e post-update line, G4 | no post-update line | the older-record case and G4 |
| e2e switch stored | the setter not stored | the switch case |
| e2e relabel in place | a new element per action | "Received: false" (the old element disconnected) |
| e2e G4 restored | (test side) no saved display | the project row not shown within 3 s |
| QR-001/AC-02 measurement | an English label too long; an English result line too long | "rows spill"; "result line: 2" |
| e2e (#230's gap) message goes with the button | the slot keeps its message when the update goes | **first survived** through settings (see Gaps); red through the wake path |

Found and fixed in this review:

- The six-language measurement first polled the main process's state and then measured the DOM, which can
  still show the previous state (false-greens, form 5). It now waits for the line's own text to change before
  measuring and asserts seven different texts.
- Its wrap control was the updates footnote, which does not wrap in Chinese; it is now the appearance
  footnote, which wraps in every language.
- Layout measures that cannot see their failure (form 8): the line count groups text rects by line boxes
  (not the element's height, which flex stretch would mask); the row overflow is measured on the block-level
  row, which does not size to its content — both shown able to fail by the two dictionary mutations above.

Found by CI (2026-10-14, PR #246's first run, Linux under xvfb) and fixed: #230's geometry case ("… Settings
keeps its place") compared Settings' absolute y across two launches. On Linux two launches can get windows of
different inner heights; the top entries matched while Settings, anchored to the bottom, sat 27px higher (674
→ 647). The same failure had already hit main's run on d262cdc, while the next main run passed: a flake in
#230's case, not a change here. It now compares Settings by its distance from the window's bottom, and the
slot against Settings in the same launch. Re-proven: with the bottom group's auto margin removed it goes red
("fromBottom" 594 → 552, the slot's 36px plus the 6px gap).

The distinctions test's accepted list grew by five pairs (French "Activé" / "Désactivé"). The list is the
test's own form — pairs with a reason each — and an accepted pair applies to every language; the reason given
holds for any language that uses one word for "on" and "enabled".

## Conclusion

Coverage complete for #231's items, with the real-restart path owned by #240 and the menu's parts by #232,
and #230's open gap closed. Three after-code cases first survived their mutation because they did not reach
the code; all three now do. Two measurement weaknesses fixed. No false green left known.
