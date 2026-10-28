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
  Squirrel stages after the download reports done, Squirrel staged before it — one case each. A rejection at install
  happens after the app has quit and no test of the app reaches it: a gap (D8), left to Squirrel.Mac and written in
  `update-source.test.ts`'s header; the real path's signature check is task 18's evidence. (Corrected after the
  incremental check's finding 5: this sentence first gave the rejection at install to REQ-002/AC-03's test) Conclusion: complete for
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

- Coverage: with T1–T9 every path of `electronUpdateSource` has a case; the default loader (the real modules) runs
  only in an installed copy of this code: a locally packaged build of this branch at 0.0.9-beta, finding, downloading
  and staging `v0.1.0-beta` on the real feed before the tag (D9, task 9b). #240's routes run `v0.1.0-beta`'s own
  adapter, from before the seam. (Corrected after the incremental check's finding 4: this sentence first said #230's
  packaged run and #240's routes showed the loader) Conclusion: complete.
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
  error (T8); the default loader (the local build's check before the tag, D9; first written as the routes, corrected
  after the incremental check's finding 4). Increment 2 added the five a test can now reach.
- Item 4, the data: the fakes' shapes are electron-updater 6.8.9's types and `MacUpdater`'s handlers, and Squirrel's
  own rejection message, each read from the installed package or the bundled framework, not imagined.
- Item 5, shared helpers: none changed; the fakes are local to the new `describe` block.

Conclusion: no finding.

## Post-implementation check: increment for the fix (2026-10-27)

- Date: 2026-10-27
- Ticket: #240 · feature `macos-release-line`
- Version: fa809ba on branch `feat/update-to-next-beta`; the fix is 2992ad5..fa809ba (the one commit fa809ba), within
  the change 2cb6b4f..fa809ba
- Scope, by the incremental rule:
  - Tests the fix's range changes: `src/main/update-source.test.ts`. Its diff (142 lines in, 8 out: the header's seven
    lines and one import line) is the rewritten header, two imports and the new `describe` block with T1–T9; its
    fifteen other cases are unchanged.
  - Tests that depend on test helper code the range changes: none. `git diff --name-only 2992ad5..fa809ba` lists two
    code files, `src/main/update-source.ts` (product code; its scripted source, the e2e seam, is unchanged) and the
    test file above; the rest are records and evidence under `docs/`. The new helpers (`nativeUpdater`, `macUpdater`,
    `installedSource`, `within`) are local to the new block. Every file that names the module:
    `rg -uu -l "update-source" -g '!node_modules/**' -g '!out/**' -g '!dist/**' -g '!release/**' -g '!docs/**' -g '!*.md'`
    lists `src/main/update-source.test.ts`, `src/main/index.ts`, `electron-builder.yml` (a comment) and
    `tsconfig.node.tsbuildinfo` (TypeScript's build cache). Over the 103 project test files
    (`rg -uu --files -g '*.test.*' -g '*.spec.*'` outside every `node_modules`, 1,313,245 bytes, all text by `file`)
    only `src/main/update-source.test.ts` names it, and nothing but the build cache names the test file itself
    (`rg -uu -l 'update-source\.test'`).
  - Test design table rows the range changes: the design review's coverage rows for C1 and H2 (corrected in place),
    its increment (T1–T4) and its increment 2 (T5–T9).
  - Carried over: every other conclusion, from the first post-implementation check above (2026-10-27, on 2992ad5) as
    its disposition settled it.
- Run evidence: [targeted-fix.txt](evidence/ticket-240/targeted-fix.txt), the fix's targeted run as handed over, not
  rerun. Done by an independent sub-agent, which changed nothing outside this record

### Run evidence

Against the log requirements of `/implement`'s `full-verification-gate.md`:

- Version: `git rev-parse HEAD` is 2992ad5, and the status lists twelve files with their `git hash-object`; each hash
  equals the blob at fa809ba (`git rev-parse fa809ba:<path>`, all twelve the same). fa809ba holds two files more: the
  log itself, written by the run, and `change-scope-fix.txt`, stamped 15:35:58Z, after the run began (15:35:15Z) and
  after its test command (23:35:32 local, 15:35:32Z), so not on the tree before the run. No test reads either. The
  run's tree is fa809ba's, the range's end.
- Every command with its full output and its own exit code: typecheck, lint, `vitest run
  src/main/update-source.test.ts` (24 passed, the file's 24 cases; no skip in the file), `check:ui`, `check:lang`,
  `check:nul`: each 0; `TARGETED_EXIT=0`. The selection search in its header is a note; the scope's searches above
  reproduce it.
- No build and no e2e: no reviewed object needs them. No e2e case changes, and none reaches `electronUpdateSource`
  (an unpackaged run under e2e takes the scripted source, `chooseUpdateSource`); the full run after step 7 runs them.

Conclusion: the log carries every required item, at the range's end; no finding.

### Test design table

Item 1, case by case (seam, driving input, asserted object, expected value's source, fixture, resource):

| Row | Written at fa809ba |
|---|---|
| T1 | As designed: `check()` of `electronUpdateSource('0.1.0-beta', load)` over both fakes; the download resolved, `downloaded` read pending after a 50 ms timer, then settled after the native `update-downloaded` and awaited as resolved. No resource |
| T2 | As designed: the native `error` with Squirrel's message once the wait has started (the pending read comes first); `downloaded` rejects with that message |
| T3 | As designed: the native `update-downloaded` before the download resolves, the flag set by the fake's own listener as `MacUpdater.js` 22–25 sets it; `downloaded` settles with no further event, and resolves |
| T4 | As designed: the download promise rejects; `downloaded` rejects with that error |
| T5 | As designed: `isUpdateAvailable: false`; `check()` resolves `null` |
| T6 | As designed: `download-progress` with 42.5 after the check; the check's callback receives exactly `[42.5]` |
| T7 | As designed: `install()` pending after 50 ms, then the updater's `error`; `install()` rejects with it |
| T8 | As designed: `quitAndInstall` throws; `install()` rejects with it |
| T9 | As designed: the token uncancelled, then `cancel()` on the found update cancels it |
| C1 row | Evidence after the tag (task 16); the flush is a gap, written in the header ("cannot be seen there ... rests on the quit path the install takes") and in the checklist's C1 row |
| H2 row | Its test half is T1–T4; the rejection at install is written in the header as a gap (D8); its evidence follows the tag (task 18) |

The test file's header against the reviewed rows' gaps: the staging wait is now tested; C1's flush, the rejection
at install and the formal channel are written with their conditions. Not written: the default loader the fix adds
(`loadElectronUpdaters`, `update-source.ts` 100–106), which every case replaces and none of #240's evidence runs:
Finding 4.

Conclusion: the cases match their rows; the header check gives Finding 4.

### Coverage

- The fix's spec statements, each against a case: "Ready means the update can install" (T1, T3); H2 as rewritten,
  a rejection while staging a failed download (T2); B2, a failed download (T2, T4). The Testing Decisions' new seam
  names the same four (not ready before staging, a rejection while staging, staged first, a failed download). The
  rest of `electronUpdateSource`: up to date (T5), progress (T6), the two install failures (T7, T8), the cancel (T9).
- Each case's claimed branch against its input: T2's rejection comes after the wait has started (its pending read
  precedes it), T3's staging before the download resolves, T4's failure before any native event.
- Fixtures: the fakes stand in for electron-updater 6.8.9 and Electron's native updater, shaped on the installed
  package: `MacUpdater` sets `squirrelDownloadedUpdate` on the native `update-downloaded` (`MacUpdater.js` 22–25) and
  resolves its download once Squirrel has fetched the ZIP, before Squirrel stages it (`MacUpdater.js` 184–189,
  218–224); the check's result (`AppUpdater.js` 404–423). Two differences, neither reaching a case: an answer with no
  update has no `downloadPromise` key where the fake has `null` (both falsy to the source's guard); the fake does not
  forward a native `error` to the updater's own `error`, as `MacUpdater.js` 18–21 does, and no case listens to the
  updater's `error` while staging.
- The default loader: no case runs it (each passes `load`), and the evidence the records name for it does not run it
  either: Finding 4.
- The increment's sentence on the rejection at install: Finding 5.

Conclusion: the staging wait and the rest of the function are covered; Findings 4 and 5.

### Case design

Each case builds its own fakes and source, drives the public `check()` or `install()`, and asserts what the
controller receives (`downloaded`, the answer, the progress callback, the rejection) or, for the cancel, the token at
electron-updater's boundary. Only the two external updaters are replaced; no project module, and no state written by
a test (the flag is set by the fake's listener on the native event). T8's synchronous throw is not how
`MacUpdater.quitAndInstall` fails (the native updater reports a failure as an `error` event, T7's input); it drives
the defensive branch the source has and hides nothing.

Conclusion: no finding.

### False greens

Per the project capability declaration, `mutation-testing` is not enabled (`capabilities.toml`, read with Python's
`tomllib`: `enabled = false`); this item is skipped. When each case turns red, against `update-source.ts` and the
expected value's source:

- T1: when `downloaded` settles before the native `update-downloaded` (the pending read), does not settle after it,
  or rejects (the final `await`); also when the found version is not the feed's.
- T2: when a native `error` while staging leaves `downloaded` unsettled (the case times out), when `downloaded`
  settles before the event, or when it rejects with another error.
- T3: when the flag `MacUpdater` sets is ignored: `downloaded` then waits for an event already past, and the 1 s read
  says pending. Under a `check()` that answered `null`, T3 alone would pass (`found?.downloaded` is undefined), but
  T1, T2, T4 and T9 turn red then, so no regression rests on its optional chain.
- T4: when a failed download is swallowed or replaced.
- T5: when an answer with no update is taken as found. It does not separate the guard's two conditions, which
  coincide in electron-updater's answers (no update: no download promise; an update with automatic download on: one).
- T6: when progress is not passed on, or passed altered.
- T7: when `install()` settles on its own (the pending read) or does not hear the updater's `error`.
- T8: when the throw is swallowed. Without the `try`, the executor still rejects with the throw: the same behaviour,
  so the case holds the behaviour rather than the statement.
- T9: when the cancel does not reach the token, which starts uncancelled.
- No conditional skip and no unawaited assertion: every `rejects` and every pending read is awaited. Expected values
  are literals or the injected objects, not recomputed; the asserted function is the one `index.ts` 722 runs.
- The extra evidence, `adapter-mutants.txt`, taken at the sha256 `update-source.ts` has at fa809ba: each of nine
  mutations turns its own case red; M1, the wait removed, also turns T2 red, since T2's pending read precedes its
  rejection.
- The changed rows' readings: C1's (the restarted app shows its saved pages at once) turns red when the display data
  does not survive the update (G4, agents-overview::CON-001), and the row no longer claims the flush; H2's
  `codesign --verify -R` turns red when the release's app does not satisfy the installed app's designated
  requirement, as the first check accepted.

Conclusion: no finding.

### Resource reuse

No case of T1–T9 loads an expensive resource: the fakes are event emitters and promises built per case, and
electron-updater and Electron are never loaded. The log's run of the file took 1023 ms, its timers (the pending reads
and the scripted source's holds) included, with no load or build output to count. No case clears a shared resource,
so there is no collection order to check.

Conclusion: no finding.

### Document sync

Scope, listed before the check; the records directory enumerated with `find` (219 files, hidden ones included),
`git ls-files -o -i --exclude-standard docs/ src/ e2e/` and `git ls-files -o --exclude-standard` (both empty: every
file is tracked):

- Given: both specs (in full), this record, the targeted log, the two ranges.
- The fix's facts: the diff of 2992ad5..fa809ba (`update-source.ts`, the test file, the spec, the records);
  `adapter-mutants.txt`, `change-scope-fix.txt` and `targeted-fix.txt` in full.
- Records: `ticket-240-tasks.md`, `ticket-240-review-code.md`, `ticket-240-doc-sync.md` (in full); `checklist.md`
  (the rows naming #240, the staging wait or the test file; the range's diff); `final-regression.md` (its statements
  on the staging decision).
- Current documents: `docs/features/app-update.md`, `CONTEXT.md` (the update entries), ADR-0032, `AGENTS.md`,
  `capabilities.toml`.
- Associated: `index.ts` (where the source is chosen), `update-controller.ts` (how a rejected download and install
  are taken, and the cancel), electron-updater 6.8.9's `MacUpdater.js` (in full) and `AppUpdater.js` (the defaults,
  the check, the download), and `update-source.ts` at the tag `v0.1.0-beta` (`git diff v0.1.0-beta 2cb6b4f`).
- Excluded: other tickets' and features' records (#230's dated statements on the staging wait describe that ticket);
  `site/` and `docs/ops/` (the fix's facts do not reach them); GitHub issues, not read because this check does not
  touch GitHub.

Differences found:

- Three records say the release's routes run the default loader, the header names no gap for it, and the document
  sync checklist marks the header Done and plans to state its gaps closed by routes 1 and 2: Finding 4.
- This record's increment gives the rejection at install to REQ-002/AC-03's test: Finding 5.
- Consistent: the spec's H2, C4, Implementation Decisions and Testing Decisions with `update-source.ts` and the cases;
  the checklist's H2 row with the spec; the feature entry (a failed install after the click shows an error notice,
  true of C4's remaining causes; a failed download shows nothing); CONTEXT and ADR-0032 (no statement on staging or
  the signature check); the mac-distribution spec (none either). The Current verification row of 2026-10-27 for
  #240's other units ("Not run yet", H2 among them) is dated at fa428ee and true of it; the fix's tests reach Current
  verification with the gateway's record, the document sync checklist's first row (Pending).

### Findings

4. **The default loader the fix adds runs in no test and in none of #240's evidence, while three records say the
   release's routes run it**
   - Fact: every case passes `load`, so `loadElectronUpdaters` (`update-source.ts` 100–106) never runs in a test.
     Routes 1 and 2 (tasks 16–17) are updates made by the installed `v0.1.0-beta`, whose `electronUpdateSource` is
     main's before the fix (`git diff v0.1.0-beta 2cb6b4f -- src/main/update-source.ts` changes only the scripted
     source), importing its two updaters inline; the loader is in a release only from 0.1.0-beta.2 on. There its
     `updater` half runs at the first check, and its `native` half only once a check finds a newer release
     (`check()`, 129–130), which no step of #240 makes: after route 1's restart nothing newer exists, and the reading
     planned there (the post-update line "You're up to date") shows whether or not that launch check ran (Failure
     C7). #230's packaged run predates it too. Yet this record's increment 2 ("the default loader ... shown by #230's
     packaged run and #240's routes"), its disposition's self-check, item 3 ("the default loader (the routes, task
     16)"), and the code review's second round, Runnability ("the release's routes run it"), say they do. The test
     file's header names no gap for it, its document sync row is Done, and the Waiting row plans to state the
     header's gaps accepted by routes 1 and 2.
   - Impact: a fault in the loader turns nothing red and shows in nothing #240 records. If its `native` half resolved
     to anything but Electron's `autoUpdater`, or an import failed, every update 0.1.0-beta.2 finds would end as a
     failed check or a failed download, both silent when automatic (app-update::REQ-002/AC-01, AC-02): installations
     of 0.1.0-beta.2 would stop updating and need a manual reinstall, first seen at the next release. The code
     review's premise that the loader is the replaced expressions moved makes this less likely, but rests on reading,
     not on a run of the bundle.
   - Handling, recommended now, in this branch: correct the three statements (the routes run `v0.1.0-beta`'s
     adapter; the loader first runs in an installed 0.1.0-beta.2). Write the loader into `update-source.test.ts`'s
     header as a gap with its conditions: its `updater` half shown by 0.1.0-beta.2's own check on the real feed, made
     from settings or the menu after route 1's restart and answering up to date rather than "Couldn't check for
     updates", a reading added to task 16; its `native` half by an installed copy of this code finding and staging a
     newer release, the next pre-release's update (or, if the owner wants it inside #240, a locally packaged build of
     this code at a version below 0.1.0-beta.2 checking once the release is out, Failure E5). Reopen the document
     sync checklist's header row, and keep the loader out of the gaps its Waiting row closes. Homes: the test file's
     header; this record; the code review record; the task list; the document sync checklist.
5. **The design review's increment still gives the rejection at install to REQ-002/AC-03's test, which D8 and the
   corrected H2 row make a gap**
   - Fact: the increment's coverage (T1–T4) reads "The rejection at install is REQ-002/AC-03's (existing)". Since D8
     the spec's C4 no longer lists a rejected signature, and its H2 says a package rejected at install is not
     installed and nothing is shown; the design review's H2 row and the test file's header record it as a gap that no
     test of the app reaches, and the code review's second round says the same.
   - Impact: the record gives two answers to whether a test covers the rejection at install; the stale one is the
     claim the first check's Finding 1 refuted, and a reader of the increment takes REQ-002/AC-03's toast for H2's
     install half.
   - Handling, recommended now: rewrite that sentence in place: the rejection at install is a gap (D8), left to
     Squirrel.Mac and written in the header, with the real path's signature check as task 18's evidence. Home: this
     record's increment.

## Disposition of the incremental check (main agent, 2026-10-28)

The hand-back named findings 4 and 5; the record's Findings section holds the same two, with the same titles.

- Finding 4, confirmed: `loadElectronUpdaters` runs in no case, and the routes are updates made by `v0.1.0-beta`,
  whose adapter predates the seam (`git diff v0.1.0-beta 2cb6b4f -- src/main/update-source.ts` changes only the
  scripted source). Put to the owner: D9, a local package of this branch at 0.0.9-beta run once before the tag. It found
  `v0.1.0-beta` on the real feed, downloaded it, and Squirrel.Mac staged it; the native updater's `update-downloaded`
  was heard and the rail showed the ready button, so both halves of the loader resolved to working updaters; quitting
  then installed the update on quit, with no relaunch (`evidence/ticket-240/loader-check.txt`,
  `loader-check-rail.png`). The three statements are corrected in place (this record's increment 2 and its
  self-check's item 3; the code review's second round, Runnability); `update-source.test.ts`'s header names the loader
  with that evidence; the document sync checklist's header rows follow.
- Finding 5, confirmed: the increment's sentence is rewritten in place (a rejection at install is a gap, D8).

### Self-check of this fix (items 1–7)

- Item 1: no product code changed. Not applicable.
- Items 2–5: no assertion, function, test data or shared helper changed; the test file's change is its header, a
  comment (`change-scope.mjs` on fa809ba judges it `same`: `evidence/ticket-240/change-scope-fix-2.txt`). Not
  applicable.
- Item 6, the evidence: `loader-check.txt` keeps the commands, the app's whole console, Squirrel.Mac's state and log,
  and the quit's 90 s watch; each reading could have shown the opposite (an error line, no `update-downloaded`, no
  ShipIt state, a relaunched process, the old version). The rail's picture is cropped from a full screen to the app's
  rail, so it shows nothing of the owner's other windows; the full screen was deleted.
- Item 7, the records: the task list (D9, task 9b), this record, the code review's second round, the coverage
  checklist's row for D9, the document sync checklist.

Conclusion: no finding.

## The records after the release (main agent, 2026-10-28)

The records change on 92928ba (branch `docs/record-v0.1.0-beta.2`) changes `update-source.test.ts`'s header only: the
condition of one gap (the restart, install on quit, the real package's signature check, the pre-release channel) is
stated as met by routes 1 and 2. `change-scope.mjs` against c0da98a judges the test file `same` and everything else
`inert`, exit 0 (`evidence/ticket-240/change-scope-records.txt`). By the post-implementation check's rule, a change
that touches a test's comments and no test's executable content or data takes no further check, so none was run;
the test design table is unchanged. The header's new statement is checked against the routes' evidence in the code
review's third round (`ticket-240-review-code.md`), and the run before it is green
(`evidence/ticket-240/pre-review-92928ba.txt`: 882 unit tests, the script, site and gate checks, smoke; its first
attempt, `pre-review-92928ba-no-electron.txt`, failed at the smoke run because the new worktree's Electron binary was
not installed, fixed by running Electron's install script, with no change to the tree).
