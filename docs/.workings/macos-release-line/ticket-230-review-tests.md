# Test review — ticket #230

Ticket: [#230 Automatic app updates with the update button](https://github.com/aloong-planet/agentshed/issues/230)
· feature `macos-release-line` · spec [app-update](../../specs/app-update.md)

- Date: 2026-10-14
- Version: branch `feat/app-update-button` on 5911d52, uncommitted working tree, after the code review's
  fixes
- Scope: `src/main/update-controller.test.ts` (17), `src/main/update-source.test.ts` (8),
  `src/shared/update.test.ts` (5), the preference tests carrying the new field (store, contract, handlers,
  backfill), `e2e/app-update.spec.ts` (11), and the one changed expectation in `e2e/token-span.spec.ts`

## Coverage

Every product item of #230 against its test (the spec's failure modes as the checklist maps them to
#230):

| Item | Covered by |
|---|---|
| US-001/AC-01, AC-02, AC-03, AC-06 | controller cases 1 and the 24-hour schedule; e2e launch, ready, geometry |
| US-001/AC-04 | e2e ready → click → installing, one install recorded (the restart: gap below) |
| US-001/AC-05 | `updaterSettings` (install on quit on) (the real quit: gap below) |
| US-002/AC-01–AC-04 | controller switch cases; store default, persistence and fallback; e2e stored switch off; token-span's written-back default |
| US-003/AC-03, AC-05 | controller: a manual check that finds downloads; joined checks for each answer |
| US-004/AC-01–AC-04, Failure E5 | `updaterSettings` per running version; downgrade off |
| US-005/AC-01, Failure F2 | controller development run; `chooseUpdateSource` |
| REQ-001/AC-01 | e2e geometry against the Settings anchor (with appearance Failure D4, Failure G1) |
| REQ-001/AC-02 | e2e: 36px slot, 24px circle, ring, spinner, download icon; reduced motion |
| REQ-001/AC-03 | e2e: no install from the downloading slot or the spinner; controller install guard |
| REQ-001/AC-04 | e2e: position, dark form, text, accessible name, progress bar; follows progress while open and stays put (added in this review) |
| REQ-001/AC-05, Failure G3 | e2e colours in six theme states, recolouring on each switch |
| REQ-002/AC-01–AC-03 | controller failure cases; e2e failed check, failed download, failed install |
| REQ-006/AC-01–AC-03 | controller schedule, sleep with and without the wake event, in-flight checks |
| QR-001/AC-01 | the dictionary type (`pnpm typecheck`) and `pnpm check:i18n` |
| CON-001 | the existing CSP test; evidence `evidence/ticket-230/con-001-search.txt` |
| CON-002, CON-003, Failures A6, H1 | feed constant; contract tests; controller malformed versions |
| CON-004, Failure C10 | controller install guard; e2e single install |
| Failures B3, B4, C3 | the controller's failed-download path (B3 surfaces as one); B4 and C3 concern a new run, whose launch check is case 1 |
| Failure G2 | e2e language switch with the message open |
| Failure G5 | e2e second instance |
| Failure G6 | e2e error toast stacked with a language toast (added in this review) |

Gaps added in this review: the ready icon was never asserted, the message following progress (REQ-001/AC-04)
had no case, and G6's stacking had none. All three now have cases.

Honest gaps, with their conditions (also in the test files' headers): the real electron-updater ↔ GitHub ↔
Squirrel path — the restart into the new version, install on quit without relaunch, the wait for Squirrel to
stage the package, the display-cache flush on the restart (Failure C1), a package the system rejects (H2) and
channel selection on real releases. None can run without an installed copy and two real releases; they are
#240's evidence.

Fixtures: the feed's version strings follow a real electron-builder metadata file
(`Transfer/release/1.2.1/latest-mac.yml`: `version: 1.2.1`, no `v` prefix, no build metadata), so
rejecting `v0.2.0` and `0.2.0+build.7` matches the real shape. Progress values are fractional as the real
`download-progress` payload is.

## Case design

- No module doubles of the project's own code (`vi.mock` / `vi.spyOn`: searched, none in these files). The
  fake source and fake clock stand at the system boundary the spec names as the seam.
- Counts asserted: requests and installs at the update source. Exempted: the count is the requirement
  ("one request", "installs once"), and it is counted at the external boundary, not inside the controller.
- The e2e reads the scripted source's request log: that is the external feed's own record, not an internal
  state read.
- Every controller state used is reached through the public calls (start, check, install, wake, the
  source's answers); nothing is set directly.

## False greens

Cases written after their code, each proven able to fail by a mutation that reached the code under test
(the mutated file differed from its backup, the failure message named the mutated behaviour, and each
file was restored by copy and compared byte for byte; e2e mutations were built before running):

| Case | Mutation | Red as |
|---|---|---|
| install once (C10) | install guard dropped | 3 installs |
| switch off makes no automatic check | switch ignored | a request with the switch off |
| contract refuses version in the wrong phase | phase/version check dropped | downloading without a version accepted |
| sleep → one check | wake checks without re-arming | 3 checks instead of 2 |
| development run | `checking` published before the source check | a state published |
| e2e Settings anchor | bottom group's auto margin removed | rects differ |
| e2e switch off → no request | switch always on | a request recorded |
| e2e language switch | slot copy pinned to English | English text in a French UI |
| e2e reduced motion | the media rule removed | `upd-spin` instead of `none` |
| e2e message follows progress | text pinned to 0% | 0% instead of 60% |
| e2e ready icon | the loader drawn instead | the loader's path |
| e2e toasts stack | each toast replaces the last | never two toasts |

The other cases went red first for the reason they test (recorded in the task list). The e2e colour case
first failed because Playwright pinned the light appearance — the evidence was wrong, not the code; it now
launches with `colorScheme: null` and waits for the media query to report the mode.

CI found one more (2026-10-14, PR #243's first run, Linux under xvfb): the second-instance case spawned
Electron without the `--no-sandbox` that Playwright's launcher prepends on Linux, so Chromium's sandbox
killed the process (exit by signal, code `null`) before it reached the single-instance lock — the case was
red for its own launch, not for the behaviour. It now launches the second instance as the launcher does
and asserts code and signal together, so a recurrence names the signal.

No assertion inside a callback that may not run, no unawaited assertion, no loop over a possibly empty set
(the malformed-version and theme loops run over literal lists).

## Conclusion

Coverage complete for #230's own items, with the real-path gaps stated and owned by #240. Three cases
added, twelve mutations caught. No false green found.
