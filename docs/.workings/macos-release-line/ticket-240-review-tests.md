# Test review — ticket #240

Ticket: [#240 Update an installed pre-release to the next one](https://github.com/aloong-planet/agentshed/issues/240)
· feature `macos-release-line` · specs [app-update](../../specs/app-update.md),
[mac-distribution](../../specs/mac-distribution.md)

## Design review

- Date: 2026-10-27
- Version: implementation starts from 2cb6b4f (`origin/main`), branch `feat/update-to-next-beta`
- Scope: every verification this ticket plans. It writes or changes no test: the change is a version string and the
  release itself, and the ticket's units are the real update path, which only a published release and an installed
  copy can show (app-update Testing Decisions: "Not automatable, accepted by evidence")

### Test design table

No new or changed test. Each verification either runs an existing test or is evidence from a real run:

| What changes or is verified | Why no test is written | What verifies it |
|---|---|---|
| The package version 0.1.0-beta.2 | Consumed by code whose tests already cover this version's form: the tag check (`release-tag.test.mjs`: `v0.1.0-beta.2` against `0.1.0-beta.2`), the updater's channel (`update-source.test.ts`: `0.1.0-beta.2` allows pre-releases), the release-version form (`update.test.ts`), the run-version record (`run-version.test.ts`: 0.1.0-beta to 0.1.0-beta.2 counts as up). At run time `app.getVersion()` feeds the settings version row and the ready line, which the e2e cases read from the running app. A test of the literal in `package.json` would only restate it | The tag check by hand (`evidence/ticket-240/tag-check.txt`); the gateway's e2e app-update::QR-001/AC-02, whose unpackaged run reports the version from `package.json`, measuring the ready line at the new length in Chinese and English; the verification run and the tag's run, whose tag check fails before Apple on a mismatch (Failure A1) |
| The release `v0.1.0-beta.2` | Only a release tag exercises Apple, GitHub and the published files end to end (`macos-signing.md` §9) | The verification run on the branch; the tag's run (Pre-release, mirror and pointer skipped, the publish job's download step on download-artifact v8); the independent check of the downloaded artifacts (§7) |
| The real update path (the units below) | Not automatable: electron-updater, GitHub's feed and the system updater act only on a packaged, installed copy and a published release | The owner's Mac, with the reads named per unit below |

### Coverage

#240's units (`checklist.md`, "Spec → tickets → verification") and how each is shown:

| Unit | Mechanism |
|---|---|
| app-update::US-001/AC-04 | Test: e2e (existing, #230). Evidence, route 1: with the update ready, a click on the ready button; a new main process starts without the owner launching it, its arguments carry `--agentshed-app-version=0.1.0-beta.2`, and the bundle's version is 0.1.0-beta.2 |
| app-update::US-001/AC-05 | Test: controller unit (existing). Evidence, route 2: with the update ready, ⌘Q; no Agentshed process appears for a minute after the quit (app-update::CON-004: never relaunching); the bundle's version is 0.1.0-beta.2; the next launch from Finder runs 0.1.0-beta.2 |
| app-update::US-004/AC-01 | Test: unit (existing, #230). Real releases: waiting for the first formal release (the owner's decision of 2026-10-27; no formal release exists, and a formal installation reads only `/releases/latest`) |
| app-update::US-004/AC-02 | Test: unit (existing). Evidence, Failure E1: the installed `v0.1.0-beta` finds and downloads 0.1.0-beta.2 from the real feed (route 1), the version shown in the tooltip and the settings line |
| app-update Failure B3 | Evidence only when a real run reaches it. Not planned: every update here runs from `/Applications`. Recorded as not reached |
| app-update Failure C1 | Evidence, route 1: the restarted app shows its saved pages at once, the display restored after a real update. The flush of a pending write on the install's quit cannot be observed on a real install: the store writes each save on a 0 ms timer, so nothing is pending at a click, and the quit flush writes only a dirty store. That part stays on the code-path evidence of the checklist's C1 row, a gap in `update-source.test.ts`'s header. (Corrected after the post-implementation check's finding 2: the first version read the cache file's modification time against the click, which a working app does not change and a skipped flush would not change either) |
| app-update Failure H2, and the staging wait ("Ready means the update can install", a package rejected while staging being a failed download, Failure B2) | Test (added by this ticket, the increment below): unit, through the production update source with electron-updater's updater and Electron's native updater injected — not ready before Squirrel.Mac staged the package, a rejection while staging is a failed download, staged before the download reports done is ready. A rejection at install happens in Squirrel.Mac's installer after the app has quit, out of every test's reach: a gap, written in `update-source.test.ts`'s header (D8). Evidence (the owner's decision): the release's app satisfies `v0.1.0-beta`'s designated requirement (`codesign --verify -R`), the check the system updater makes; the updater's logs from both installs. (Corrected after the post-implementation check's finding 1: the first version said REQ-002/AC-03's test held the rejection branch, but a package rejected while staging never reaches the install) |
| mac-distribution::US-001/AC-02 | Gate: the release's stapled-ticket checks. Evidence: the offline first launch (task 14) |
| app-update Testing Pending (two releases) | Evidence: routes 1 and 2 |
| #253's third item (the publish job's download step on download-artifact v8) | Evidence: the tag run's publish job |
| app-update::REQ-004/AC-04 and "Check now" after a real install (left by #231 to #240's restart) | Test: e2e (existing, seeded versions). Evidence, route 1: after the restart, "Current version" 0.1.0-beta.2, the line "You're up to date", "Check now" available |

Conclusion: every unit has a mechanism; the evidence comes after the merge and the tag.

### Case design

No case is written, so there is nothing to judge here.

Conclusion: not applicable.

### False greens (judged from the design)

The instruments are command-line reads, the owner's observations and screenshots, judged by
`review-code/false-greens.md`:

- `spctl --assess` succeeds online whether or not a ticket is stapled (form three), and an assessment already made of
  a build answers its next launch: the offline launch must be this Mac's first assessment of the build. So `spctl` does
  not run on this release's artifacts before task 14; the DMG comes from a Chrome download, its quarantine attribute
  read with `xattr`; the network is shown off at the moment of the launch by a request to Apple that fails, not only by
  the owner's word; syspolicyd's log is read for the launch.
- A launch from Terminal (`open`) or of an app without quarantine shows no notice: the launch is from Finder.
- The bundle's version changes on either install route, so it cannot tell a restart from an install on quit: route 1
  is shown by a new main process started after the click, and route 2 by no process after the quit, then the version.
- Route 2 may download from the cache route 1 left (Failure B4: a cached download may be reused). What route 2 shows
  is the install on quit, not the download; recorded as such.
- No error in the updater's logs is not evidence that a signature check ran: H2's evidence is the requirement check
  itself, run with `codesign`, and whatever the logs show of it.
- The verification run cannot show publishing (Failure C4): only the tag's run shows the release, its Pre-release mark,
  the untouched R2 and the publish job's download step.
- The QR-001/AC-02 e2e reads the running version: it measures the new length only on a build made after the change,
  which the gateway's own build step makes.

Conclusion: no finding; each instrument has the input that would turn it red named.

### Resource reuse

No expensive resource: no test is written or changed, and the gateway's resources are unchanged.

Conclusion: no finding.

### Findings

None.

### Increment: the staging wait's unit tests (2026-10-27, after the post-implementation check)

- Version: 2992ad5; the post-implementation check's finding 1, handled by the owner's decision D7 (tests in this
  ticket, through an injection seam the production update source gains for electron-updater's updater and Electron's
  native updater; the owner confirmed that seam with the decision)
- Rows added to the test design table, each through `electronUpdateSource(version, load)`'s `check()`, with fakes for
  the two external updaters injected through `load` (not `vi.mock`, and no project module replaced):

| Case | Spec | Input that takes it into the branch | Assertion and expected value's source | Fixture's shape from | Expensive resource |
|---|---|---|---|---|---|
| T1 A found update is not ready until Squirrel.Mac has staged it | Implementation Decisions, "Ready means the update can install"; Failure H2 as rewritten (D8) | the updater's `checkForUpdates` answers an available `0.1.0-beta.2` whose download has finished; the native updater has not yet said `update-downloaded` | `downloaded` still pending after the download promise has settled and the event loop has turned; then, once the native updater emits `update-downloaded`, resolved. Expected: the spec's rule | electron-updater 6.8.9's `UpdateCheckResult` (`isUpdateAvailable`, `updateInfo`, `downloadPromise`, `cancellationToken`) and `MacUpdater`, which sets `squirrelDownloadedUpdate` on the native `update-downloaded` (read 2026-10-27); the version from the spec's Failure E1 | none |
| T2 A package Squirrel.Mac rejects while staging is a failed download | Failure H2 as rewritten (D8), Failure B2 | as T1, then the native updater emits `error` with Squirrel's rejection | `downloaded` rejects with that error. Expected: the spec (B2) and the error the native updater gave | Squirrel's message in Electron 43.2.0's framework, "Code signature at URL %@ did not pass validation" (read 2026-10-27) | none |
| T3 Staged before electron-updater reports the download done is ready at once | Implementation Decisions, as T1 | the native updater emits `update-downloaded` before the download promise settles; the fake updater records it as `MacUpdater` does | `downloaded` resolves with no further event. Expected: the spec's rule | `MacUpdater`'s handler, as T1 | none |
| T4 A download that fails before Squirrel.Mac has the package is a failed download | Failure B2 | the download promise rejects | `downloaded` rejects with that error | as T1 | none |

- Coverage: the adapter's `downloaded` settles in four ways — the download fails, Squirrel rejects while staging,
  Squirrel stages after the download reports done, Squirrel staged before it — one case each. The rejection at install
  is REQ-002/AC-03's (existing), and the real path's signature check is the route evidence. Conclusion: complete for
  the staging wait.
- Case design: each case drives the public `check()` of the production source; `squirrelDownloadedUpdate` is set by
  the fake updater on the native event, as `MacUpdater` sets it, never assigned by the test. Conclusion: no finding.
- False greens (from the design): T1's "still pending" is read only after the download promise has resolved and a
  macrotask has passed, so a `downloaded` that does not wait would have settled and the case turns red; T1 and T3 then
  read the settled value. Expected values are literals or the injected error object, not recomputed. The asserted
  object, `electronUpdateSource`, is the live path (`index.ts`, the packaged run's source). Conclusion: no finding.
- Resource reuse: no expensive resource; electron-updater is never loaded. Conclusion: no finding.

### Increment 2: the rest of the installed copy's source (2026-10-27, from the fix's self-check, item 3)

The fix changes `electronUpdateSource`, so the self-check listed each of its paths against a test or evidence. With
the seam in place, five paths a test can now reach had neither a test nor evidence that could fail: an answer with
no newer version, the download's progress, a failed install reported by the updater or thrown by it, and the cancel
the controller uses on a malformed version. Each guards a spec behaviour, and removing it turns nothing red (the e2e
cases run the scripted source), so each is a regression the tests would miss. Rows added, through the same seam and
fakes as T1–T4:

| Case | Spec | Input that takes it into the branch | Assertion and expected value's source | Fixture's shape from | Expensive resource |
|---|---|---|---|---|---|
| T5 A check that finds no newer version answers up to date | US-003/AC-01, AC-02 ("already up to date"); Failure A1 | `checkForUpdates` answers `isUpdateAvailable: false` for the running `0.1.0-beta` | `check()` resolves `null`, the controller's "up to date" (`FoundUpdate \| null`, its interface). Expected: the interface's contract | electron-updater's `UpdateCheckResult` with no update | none |
| T6 The download's progress reaches the controller | REQ-001/AC-02 (the ring shows the download's progress); US-001/AC-01 | the updater emits `download-progress` with `{ percent: 42.5 }` after the check | the `onProgress` the check was given receives 42.5. Expected: the event's literal | electron-updater's `ProgressInfo` (`percent` among its fields) | none |
| T7 An error the updater reports after the click is a failed install | REQ-002/AC-03, Failure C4 | `install()`, then the updater emits `error` | `install()` rejects with that error. Expected: the injected error | `AppUpdater`'s `error` event | none |
| T8 A `quitAndInstall` that throws is a failed install | REQ-002/AC-03, Failure C4 | the updater's `quitAndInstall` throws | `install()` rejects with that error | as T7 | none |
| T9 Dropping a found update cancels electron-updater's download | Failures A6, H1 (a malformed version is never installed: the controller cancels it) | `cancel()` on the found update | the check's `cancellationToken` reports it was cancelled. Expected: the token electron-updater handed over | `UpdateCheckResult.cancellationToken` | none |

- Coverage: with T1–T9 every path of `electronUpdateSource` has a case; the default loader (the real modules) is the
  packaged run's, shown by #230's packaged run and #240's routes. Conclusion: complete.
- Case design: through `check()` and `install()` of the production source; the fakes stand in for the two external
  updaters only. T9 reads the token at the boundary electron-updater exposes, the one observable effect a cancel has
  outside the app. Conclusion: no finding.
- False greens (from the design): T5 asserts `null`, which a source answering a found update would not give; T6's
  value is a literal not produced elsewhere; T7 reads the rejection only after emitting, and `install()` never
  settles on its own; T8's throw happens inside `install()`; T9's token starts uncancelled. Conclusion: no finding.
- Resource reuse: none. Conclusion: no finding.

## Post-implementation check

- Date: 2026-10-27
- Ticket: #240 · feature `macos-release-line`
- Version: 2992ad5 on branch `feat/update-to-next-beta`; the change is 2cb6b4f..2992ad5 (fa428ee the package
  version, 2992ad5 the records)
- Scope: `git diff --stat 2cb6b4f..2992ad5` lists `package.json` and eight records under
  `docs/.workings/macos-release-line/`. No test file and no test helper changes, so no test is a reviewed object of
  this round and none was run. Checked: the test design table and the coverage against what was done and against the
  code they describe, the verifications that have run, the test-file headers that carry #240's gaps, and the run
  evidence. Done by an independent sub-agent, which changed nothing outside this record
- Run evidence: [pre-review-2992ad5.txt](evidence/ticket-240/pre-review-2992ad5.txt), the gateway's run before this
  check, taken as handed over and not rerun

### Run evidence

Against the log requirements of `/implement`'s `full-verification-gate.md`:

- Version: `git rev-parse HEAD` is 2992ad5, the range's end; `git status --porcelain --untracked-files=all` is
  empty, so the version list is empty.
- Every command with its full output and its own exit code: typecheck, lint, `pnpm test` (873 passed, 1 skipped:
  `ccusage-parity`, an explicit skip the change does not touch), `test:scripts` (137), `test:site` (`astro check` 0
  errors, 107), `check:ui`, `check:lang`, `check:i18n`, `check:nul`, `build`, e2e on the targeted list's three files
  (114 passed), smoke: each 0; `VERIFY_EXIT=0`.
- The skip determination: the baseline is the fork point 2cb6b4f, its one CI run successful; `change-scope.mjs`
  exits 1, so nothing was skipped.
- The note after the run (a record edited at 14:41:30Z and restored at 14:43Z): no test command reads that record.
  The test files that name `docs/.workings` at all (`rg -l '\.workings'` outside `docs/`) use it as a screenshot
  path, in a comment, as Markdown text, or, in the shared-UI gate's tests, as an empty directory of their scratch
  tree. So the test results stand for 2992ad5; the scanning gates the note leaves open are not this check's
  evidence, and the full run after step 7 runs them again.

Conclusion: the log carries every required item, at the range's end; no finding.

### Test design table

Item 1 of the check, row by row:

| Row | Done at 2992ad5 |
|---|---|
| The package version 0.1.0-beta.2 | No test written or changed (the diff above). The tag check by hand accepts `v0.1.0-beta.2` and refuses `v0.1.0-beta` and `v0.1.0-beta.1`, reading 0.1.0-beta.2 from `package.json`, the line fa428ee commits ([tag-check.txt](evidence/ticket-240/tag-check.txt)). The four unit tests the row names hold the literals it cites (`release-tag.test.mjs` 17, `update-source.test.ts` 25, `update.test.ts` 8, `run-version.test.ts` 25-26) and pass in the log. QR-001/AC-02 ran in Chinese and English in the log (cases 104 and 105 of 114). The verification run 40522427267 at fa428ee passed its gate job, with publish, mirror and pointer skipped; its record, `verification-run.txt`, is not yet committed or linked (the document sync checklist's first row, Pending). The tag's run follows the merge |
| The release `v0.1.0-beta.2` | Not yet: the tag follows the merge (task 12) |
| The real update path | Not yet: tasks 13-18 |

The readers of the version outside the tests, enumerated (`rg -uu 'package\.json|npm_package_version|getVersion'`
outside `node_modules`, `docs/`, build output and test files): `app.getVersion()` in `src/main/index.ts` at 613 (the
renderer's version argument, shown in the version row), 675 (the usage archive's stamp), 722 (the update channel) and
748 (the run-version record); `scripts/release-tag.mjs`; `build/mac-packaging.cjs` (names and output directory);
`scripts/restore-archive.mjs` (a developer script). Those the row does not name are independent of the version's form
(the archive's stamp-change cases in `archive.test.ts`) or exercised by the verification run's packaging at
0.1.0-beta.2.

Test-file headers that carry #240's gaps: `e2e/app-update.spec.ts` (lines 2-7, the real path and the restart
"accepted by evidence once two releases exist") matches routes 1 and 2; `src/main/update-source.test.ts` (lines 1-7)
does not: Finding 3.

Conclusion: the table matches what was done; the header check gives Finding 3.

### Coverage

- Units: the checklist's rows that name #240 (`rg '#240' checklist.md`) are the spec table's US-001/AC-04, AC-05,
  US-004/AC-01 (moved), AC-02, Failures B3, C1, H2, mac-distribution::US-001/AC-02 and the Testing Pending row, and,
  in Current verification, #253's download step, #231's "Check now" after a real install, #235's install from a
  published ZIP (routes 1 and 2) and #230's real-release paths. Each has its row in the design review's coverage
  table, except one of #230's paths (the next item).
- Left to #240 outside the spec table: the Current verification row of 2026-10-14 (#230) and #230's code review
  ("Not reachable by a test: the restart path itself and the Squirrel staging wait ... covered by evidence in #240")
  leave the adapter's wait for Squirrel to stage the package (`staged()`, `update-source.ts` 72-92; the spec's
  Implementation Decision "Ready means the update can install") to #240. The coverage table has no row for it, and its
  H2 row cites a test of another branch: Finding 1.
- The failure modes the version and the release touch, walked: app-update E1 (US-004/AC-02's row), E3 (AC-01,
  moved), C1 (its row: Finding 2), C2 (route 2), C7 (the REQ-004/AC-04 row), G4 (route 1's restored pages), B3
  (recorded as not reached), B4 (route 2's caveat), H2 (Finding 1); mac-distribution A1 and A6 (the tag check and its
  tests), US-002/AC-02 (the tag's run), C4 (the verification run published nothing), D1 (task 14's notice).
- Fixtures: none written.

Conclusion: Findings 1 and 2.

### Case design

No case is written or changed.

Conclusion: not applicable.

### False greens

Per the project capability declaration, `mutation-testing` is not enabled (`capabilities.toml`, read with Python's
`tomllib`: `enabled = false`); this item is skipped. When each verification turns red, answered against the code and
the source of its expected value:

- The tag check by hand: red in the same evidence, twice (exit 1, naming the tag the version needs).
- QR-001/AC-02 (zh, en): red when the row label "Current version <running version>", the result line or the button
  takes a second line box, or a row spills; it was red in French and Japanese at 0.1.0-beta (#239). The appearance
  footnote is its control, and seven distinct texts show every state was measured. Its input is the package's
  version: Electron's default app sets the version from the `package.json` of the directory it is given
  (`default_app.asar`, `app.setVersion(packageJson.version)`, read 2026-10-27), the e2e launches it with `.`, and
  `app.spec.ts` 1605, which composes its expected stamp from `package.json`'s version, passed in the same run against
  the stamp the app composes from `app.getVersion()` (`index.ts` 675). The found version is the fixed widest form
  `10.10.10-beta.12`; the new length enters through the label beside the line (ADR-0035's table).
- The four unit tests named for the version's form: each red if its function refused or misread `0.1.0-beta.2`;
  inputs and expected values are literals from the spec's E1 and the tag rule, not recomputed.
- The verification run: red at any gate (a rejected submission, a missing staple, Gatekeeper, the metadata against the
  ZIP); its log shows both submissions accepted and `latest-mac.yml` matching the ZIP.
- The readings planned for tasks 13-18, re-read against the code: the design review's hold, except H2's together with
  the staging wait (Finding 1) and C1's (Finding 2).

Conclusion: Findings 1 and 2.

### Resource reuse

No test is reviewed in this round, so none loads or clears a resource; the log builds once (`pnpm build`, exit 0) for
the three e2e files, as the design review's "the gateway's resources are unchanged" says. No collection order to
check.

Conclusion: no finding.

### Document sync

Scope, listed before the check; the records directory enumerated with `find` (hidden files included) and
`git ls-files -o -i --exclude-standard docs/` (ignored files):

- Given: both specs (in full), this record, the log, the range.
- Records in `docs/.workings/macos-release-line/`: `ticket-240-tasks.md`, `ticket-240-doc-sync.md`,
  `ticket-240-review-code.md` (in full); `checklist.md` (the round note, the rows naming #240, C1, H2 and
  US-004/AC-01, and the range's diff); `final-regression.md` (its statements on the staging decision); #230's code and
  test review records (their staging and gap passages); all six files of `evidence/ticket-240/`, three of them
  untracked and ignored (`pre-review-2992ad5.txt`, `verification-run.txt`, `step8-searches.txt`), in full.
- Current documents: `docs/features/app-update.md` (in full), `CONTEXT.md` (the update entries), ADR-0035,
  `AGENTS.md`, `capabilities.toml`.
- Associated: the test files that carry #240's gaps (the headers of `update-source.test.ts`, `e2e/app-update.spec.ts`
  and `update-controller.test.ts`; `e2e/settings-updates.spec.ts` in full), `update-source.ts`, `display-store.ts`,
  `index.ts` (the version and the quit), electron-updater 6.8.9's `MacUpdater.js` (`quitAndInstall`), Electron's
  default app.
- Excluded: the other tickets' and other features' records (no statement on #240's tests beyond #230's, read above);
  `site/` and `docs/ops/` (the change's tests do not reach them; the runbook has its own sync row); GitHub issues
  #239, #240, #241 and #253, not read because this check does not touch GitHub, so their items are unverified here.

Differences found: `update-source.test.ts`'s header, which no sync row carries (Finding 3); the spec's H2 sentence
against its Implementation Decisions (Finding 1). The feature entry states nothing these findings change: a failed
download shows nothing, which is what a package rejected before staging gives.

### Findings

1. **H2: a package Squirrel rejects reaches the user through the untested staging wait, as a failed download, not
   through the install failure the coverage cites**
   - Fact: the coverage's H2 row cites app-update::REQ-002/AC-03's tests as "the rejection branch"; they drive the
     controller's failed install (the error toast) with the fake source and the scripted install. Squirrel checks the
     package before it signals `update-downloaded` (#230's code review, "Not holding (fixed)"), and the adapter
     turns that failure into a failed download: `downloaded` waits for the native `update-downloaded` and rejects
     on the native `error` (`staged()`, `update-source.ts` 78-92). The user sees Failure B2 (nothing), not
     REQ-002/AC-03's toast. No test reaches `electronUpdateSource` (`rg electronUpdateSource`: only `index.ts` and
     `update-source.ts`). The planned routes pass with or without the wait: electron-updater's `quitAndInstall`
     itself waits for the native `update-downloaded` when Squirrel has not staged yet (`MacUpdater.js` 240-255), so
     a ready button shown before staging still installs a valid release. #230 left the wait to #240's evidence
     (above); #240's coverage has no row for it. The spec says both: H2 and C4 make a rejected signature an install
     failure, the Implementation Decisions a failed download (Failure B2).
   - Impact: a change that drops or breaks the wait (`downloaded` settling at electron-updater's `downloadPromise`)
     turns nothing red, now or in #240's evidence; a rejected package would then show a ready button whose install
     waits for an `update-downloaded` that never comes (the stuck install #230's code review fixed). The owner's H2
     decision of 2026-10-27 rests on REQ-002/AC-03's test covering the rejection, which it does not on this path.
   - Handling: put the fact to the owner before the H2 decision stands. Recommended, in this branch before the tag:
     a unit test through `electronUpdateSource` with electron-updater and Electron's native updater replaced by
     fakes (a module mock, or a seam the adapter takes), red if `downloaded` settles before the native
     `update-downloaded` and if a native `error` before it leaves `downloaded` unrejected; its row goes through the
     design review's increment first. Alternative: the owner accepts the wait as a gap, written into
     `update-source.test.ts`'s header (Finding 3) and the checklist. Either way the spec's H2 sentence and its
     Implementation Decisions need reconciling at the spec check (task 10). Homes: the coverage and the test design
     table in this record; the spec.
2. **C1's planned reading cannot show the quit flush, and expects a write a working app does not make**
   - Fact: the coverage's C1 row reads "the display cache in userData rewritten at the quit before the restart (its
     modification time against the click)". The store writes on a 0 ms timer after every save (`display-store.ts`
     26-33), and the quit flush writes only a store still dirty (`display-store.ts` 35-50, `index.ts` 782-791).
     Saves come after scans and reads (`index.ts` 128-131, 247, and `remember()`), none at the click. So with the
     flush working the file's time precedes the click, and with the quit path skipping the flush it is the same;
     "the restarted app showing its pages at once" holds either way too.
   - Impact: the reading contradicts a working app (a false red at task 16) and cannot turn red when the flush is
     missing; the design review's conclusion that every instrument has its red input named does not hold for it.
   - Handling, recommended now: rewrite C1's row. Route 1 shows that the restarted app keeps its saved pages (G4 on a
     real update); the flush of a pending write on the install's quit is not observable on a real install, since
     nothing is pending at a click, and stays on the code path the checklist's C1 row reads, recorded as a gap in
     `update-source.test.ts`'s header (Finding 3) and in that row. The changed row goes through the design review
     again. Home: the coverage in this record; the header; the checklist.
3. **`update-source.test.ts`'s header names #240's two releases as the condition for gaps the plan leaves open, and
   no sync row carries it**
   - Fact: the header (lines 3-7) says the staging wait, the restart "with the display-cache flush on the way out,
     Failure C1", install on quit, "a package the system rejects (H2) and channel selection on real releases are
     accepted once two releases exist". After this release two releases exist, but: US-004/AC-01 on real releases
     waits for a pre-release after the first formal release (the owner, 2026-10-27; the checklist's rows of that
     day); H2's real-path evidence is the designated-requirement check, the rejection staying on a test (the owner,
     2026-10-27; but see Finding 1); the staging wait and the flush are not shown by the planned readings (Findings
     1 and 2). No row of `ticket-240-doc-sync.md` names the header, and the scope of step 8's searches
     (`step8-searches.txt`) leaves out `src/main/`, where it is.
   - Impact: once routes 1 and 2 pass, the header reads as those gaps closed, and the next reader of the adapter
     takes the staging wait, the rejected package, the flush and AC-01's real check as verified.
   - Handling, recommended now, in this branch: once Findings 1 and 2 are decided, rewrite the header's condition gap
     by gap (AC-01: a pre-release after the first formal release; the others as decided), and add a row for it to
     `ticket-240-doc-sync.md`. The row that rewrites the spec's Testing Pending note keeps channel selection for a
     formal installation (US-004/AC-01) open. Homes: the test file's header (dimension 1's record) and the document
     sync checklist.

## Disposition (main agent, 2026-10-27)

The hand-back named findings 1–3; the record's Findings section holds the same three, with the same titles.

- Finding 1, confirmed against `update-source.ts` and electron-updater 6.8.9's `MacUpdater.js`. The owner's D6 had
  been asked on the premise this finding shows untrue, so it went back to the owner with the correction: D7, tests in
  this ticket through an injection seam (the design review's increment, T1–T4, and increment 2, T5–T9, from the
  self-check below); D8, the spec's H2 rewritten. Checking Squirrel.Mac's source for D8 showed the second signature
  check runs in ShipIt after the app has quit, so D8 was asked again on that fact: a rejection while staging is a
  failed download, one at install installs nothing and shows nothing, and C4 no longer lists a rejected signature. The
  spec's Testing Decisions gain the seam; the coverage checklist's H2 row follows.
- Finding 2, confirmed against `display-store.ts` and `index.ts`'s quit flush: the design review's C1 row is
  corrected in place; the quit flush is recorded as a gap in `update-source.test.ts`'s header.
- Finding 3, confirmed: the header is rewritten gap by gap after D5, D7 and D8 (the restart, install on quit, the
  signature check on a real package and the pre-release channel by the routes; the flush and a rejection at install
  as gaps; the formal channel waiting for a pre-release after the first formal release); a row in the document sync
  checklist carries it.

### Self-check of the fix (items 2–5)

- Item 2, the new assertions, by dimension 3's forms: none vacuous (T1–T3 read "pending" only after the download has
  settled and a macrotask has passed; T5 asserts `null`, which a found update would not give; T9's token starts
  uncancelled and is read before and after), no tautology (literals from the spec's E1 and the events' own values, or
  the injected error object), no old path (`electronUpdateSource` is what `index.ts` runs), no conditional skip, every
  rejection awaited. Each case turned red under the mutation of the path it guards, and only that case
  (`evidence/ticket-240/adapter-mutants.txt`).
- Item 3, every path of the changed function: `electronUpdateSource`'s lazy load (each case), settings and feed
  (applied to the fake, not asserted: removing them changes no behaviour while electron-updater's defaults and the
  bundle's `app-update.yml` say the same, as `updaterSettings`' comment states, so no regression would go unseen; their
  values are `updaterSettings`' and `UPDATE_FEED`'s, tested above), progress (T6), no update (T5),
  a found update's version (T1), its download (T1–T4), its cancel (T9), `install()`'s reported error (T7) and thrown
  error (T8); the default loader (the routes, task 16). Increment 2 added the five a test can now reach.
- Item 4, the data: the fakes' shapes are electron-updater 6.8.9's types and `MacUpdater`'s handlers, and Squirrel's
  own rejection message, each read from the installed package or the bundled framework, not imagined.
- Item 5, shared helpers: none changed; the fakes are local to the new `describe` block.

Conclusion: no finding.
