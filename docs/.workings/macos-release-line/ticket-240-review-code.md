# Code review — ticket #240

Ticket: [#240 Update an installed pre-release to the next one](https://github.com/aloong-planet/agentshed/issues/240)
· feature `macos-release-line`

- Date: 2026-10-27
- Version: fa428ee on branch `feat/update-to-next-beta` (base 2cb6b4f)
- Scope: `package.json`'s version, 0.1.0-beta → 0.1.0-beta.2, and the release it is for; the ticket's records. No code,
  test, workflow or configuration changes

## Underlying premises

What the change relies on, each checked against the current code or measured:

- The installed `v0.1.0-beta` finds the new release. Its bundle's `app-update.yml` names the GitHub provider and
  `aloong-planet/agentshed` (read on this Mac). electron-updater 6.8.9's GitHub provider, with pre-releases allowed
  (set from the running version, `update-source.test.ts`: `0.1.0-beta` allows them) and the running channel `beta`,
  takes the first feed entry whose tag is valid semver and of no custom or `alpha` channel
  (`GitHubProvider.js` 60–83). `semver.prerelease('v0.1.0-beta.2')` is `["beta", 2]` and `semver.valid` accepts the
  tag (measured), so the new release is that entry. It asks for `beta-mac.yml` and, with pre-releases allowed, falls
  back to `latest-mac.yml` on any failure (`GitHubProvider.js` 131–140), the file the GitHub provider writes (runbook).
- The new version counts as newer: `AppUpdater.isUpdateAvailable` offers it when `semver.gt(latest, current)`
  (`AppUpdater.js` 357); `semver.gt('0.1.0-beta.2', '0.1.0-beta')` is true (measured).
- The release line treats the tag as a pre-release: the workflow tells one by a `-` after the version, which the tag
  check makes exact; the tag check accepts `v0.1.0-beta.2` for this version (`evidence/ticket-240/tag-check.txt`).
- The live landing page needs no change to offer the new release: it picks GitHub's newest pre-release by its
  publication time (`site/src/releases.ts` 87, 95), so `v0.1.0-beta.2` replaces `v0.1.0-beta` once published
  (landing-page::REQ-001/AC-05).
- The test plan runs the older version on data the newer one wrote (the offline launch before the routes, and
  `v0.1.0-beta` restored before route 2). No storage format changed since `v0.1.0-beta`:
  `git diff --stat 7dc0c22..2cb6b4f -- src/` lists `theme.css` and the scripted update source with its test only.
- The records' facts (`ticket-240-tasks.md`) were each read from the code, the installed app or a command's output on
  2026-10-27; one was corrected while writing (#317's `src/` change is a comment in `theme.css`, not a gate).
- No comment was written in code, so no causal claim needs proving.

Conclusion: no finding.

## Runnability

- The version reaches the app at run time through `app.getVersion()`: the settings version row and the ready line
  carry it. The ready line at the new length stays on one line in Chinese and English (app-update::QR-001/AC-02, in
  the targeted e2e run on a build of this tree: `evidence/ticket-240/targeted.txt`, `targeted-e2e.txt`).
- The run-version record counts 0.1.0-beta → 0.1.0-beta.2 as a version that went up (`run-version.test.ts` 25–26),
  so the first run after a real update shows the post-update line.
- The release's packaging, gates and naming follow the version: the manual verification run on this branch is the
  real run of the release profile at this version (task 5); its result is recorded below.
- Failure paths: a failed gate publishes nothing (mac-distribution::US-002/AC-03), unchanged; a tag naming another
  version fails before Apple (Failure A1, the tag check above).

Verification run 40522427267 on fa428ee (`evidence/ticket-240/verification-run.txt`): green. The release profile at
0.1.0-beta.2 on #253's action commits: the app signed by the Developer ID identity and accepted by Apple
(71518ddc-b78d-4f0b-b7fc-f02c86fafedd), the ZIP and the DMG named for the version, `latest-mac.yml` matching the ZIP,
the DMG notarized, stapled and gated (a2fc4974-c091-4940-9257-0a6c6f37e267), six files kept; the publish, mirror and
pointer jobs skipped. This is the release profile's first notarization on the upgraded actions, which #253 left to the
next tag; the tag's own run still has to show the publish job's download step.

Conclusion: no finding.

## Security

No code path, credential or workflow condition changes. The version string the app shows from the feed is validated
before it reaches the renderer (`isReleaseVersion`, app-update Failure H1), and `0.1.0-beta.2` is one of its accepted
forms (`update.test.ts`).

Conclusion: no finding.

## Consistency

- Statements the change could falsify: no README or site page names the current version (`rg -F '0.1.0-beta'` over
  the repository outside `node_modules`, `docs/.workings` and build output: the hits are the specs and ADRs naming
  `v0.1.0-beta` as the first release, still true; ADR-0035's measurement table, which already measured
  `0.1.0-beta.2`; the settings prototype's demo version; tests' literals; the workflow's and the runbook's
  `v0.1.0-beta.2` examples).
- The smells baseline: no code is introduced or touched, so none applies.

Conclusion: no finding.

## Refactoring list

None.

## Second round: the fix for the post-implementation check (2026-10-27)

- Version: the working tree on 2992ad5 before the fix's commit (`git diff 2992ad5 -- src docs/specs`)
- Scope: `src/main/update-source.ts` (the installed copy's source takes its two updaters from an injectable `load`,
  defaulting to the dynamic imports it made before; `Updater` and `NativeUpdater` exported for the test),
  `src/main/update-source.test.ts` (T1–T9 and the header), and the app-update spec (H2, C4, the Testing Decisions),
  from the owner's decisions D7 and D8
- The self-check's item 1 (the fix's product code against the spec, sentence by sentence) is this round's
  Underlying premises and Consistency

### Underlying premises

- The default loader is the code it replaces, moved: the same expression for electron-updater's `autoUpdater`
  (default export first), and `autoUpdater` from `electron` (`git diff 2992ad5 -- src/main/update-source.ts`). Both are
  still called only inside `check()` and `install()`, so an unpackaged run still constructs neither.
- The fakes' behaviour is the real one's, read 2026-10-27: electron-updater 6.8.9's `MacUpdater` sets
  `squirrelDownloadedUpdate` on the native `update-downloaded` and forwards the native `error` (`MacUpdater.js` 14–26);
  its `UpdateCheckResult` (`types.d.ts` 26–33). Squirrel.Mac checks a package against the running app's signature
  when it stages it (`SQRLUpdater.m`, `verifyUpdate:fromBundle:`, on GitHub's master), and again in ShipIt after the app
  has quit, before it moves the installed app aside (`SQRLInstaller.m`, `installRequest:` validates at 356 and acquires
  the target at 377). The staging message is in Electron 43.2.0's own Squirrel framework (`strings`); the installer's
  order was read on master, not on the copy Electron bundles.
- New statements that claim a cause, each checked: the test header's "a save is written at once and nothing is pending
  at a click" (`display-store.ts` 26–33: a 0 ms timer per save; the quit flush writes only a dirty store); its
  "Squirrel.Mac … keeps the version in place" and the spec's H2 (the installer validates before it moves the app). The
  spec's C4 no longer gives a rejected signature as a cause of the toast: a rejection at install happens after the app
  has quit.

Conclusion: no finding.

### Runnability

- Production passes no `load`, so `index.ts`'s `electronUpdateSource(app.getVersion())` runs the default loader; the
  updater is still loaded once (`loaded ??=`) and the native updater read per found update, as before.
- Every path of `electronUpdateSource` is now driven by a case (T1–T9) and each case turns red under a mutation of the
  path it guards, the others staying green (`evidence/ticket-240/adapter-mutants.txt`: nine mutations, the file
  restored byte for byte after each). The default loader itself runs only in an installed copy of this code, so it is shown by a locally packaged build
  of this branch finding, downloading and staging a real release before the tag (D9, task 9b). The release's routes do
  not run it: they are updates made by `v0.1.0-beta`, whose adapter predates the seam. (Corrected after the incremental
  test check's finding 4: this sentence first said the routes run it.) Run on 2026-10-27 (`evidence/ticket-240/loader-check.txt`):
  a local package of fa809ba at 0.0.9-beta found `v0.1.0-beta` on the real feed, downloaded it, and Squirrel.Mac staged
  it; the rail showed the ready button, so both halves of the loader resolved to working updaters. Quitting it then
  installed the update on quit, with no relaunch.

Conclusion: no finding.

### Security

The seam is an optional parameter of a function only `index.ts` calls, which passes nothing; no input reaches it.

Conclusion: no finding.

### Consistency

- The spec now says what the code does: H2 (two checks; a rejection while staging a failed download), C4 (no
  rejected signature), the Implementation Decision "Ready means the update can install" (unchanged, now consistent
  with H2), and the Testing Decisions' new seam. `docs/features/app-update.md` says only that "a failed install after
  the click shows an error notice", true of C4's remaining causes.
- The smells baseline on the touched code: the exported `Updater` and `NativeUpdater` serve the test, a real consumer,
  not speculative generality; `UpdaterLoad` names what it is. No other smell.

Conclusion: no finding.

## Third round: the records after the release (2026-10-28)

- Version: the working tree on c0da98a, branch `docs/record-v0.1.0-beta.2` (`git diff c0da98a -- src docs/specs`)
- Scope: `src/main/update-source.test.ts`'s header (one gap's condition stated as met; six comment lines, no code) and
  the app-update spec's Testing Decisions (the Pending note's condition met, its sentence rewritten). The rest of the
  change is records and evidence

### Underlying premises

- The header now says that the restart, install on quit without relaunch, the system updater's signature check on a
  real package and channel selection for a pre-release installation are accepted by evidence from an installation of
  one release that updated to the next by each install route. Each against the evidence: the restart from the ready
  button (`route1-installed.txt`: a new process at 12:43:28 running 0.1.0-beta.2), install on quit with no launch
  request (`route2-watch.txt`, `route2-who-launched.txt`), both of the system updater's checks passing on the
  published package (`artifact-check.txt`'s designated-requirement check with its control; ShipIt's checks before the
  move in `route1-install-log.txt` and `route2-install-log.txt`), and v0.1.0-beta offered v0.1.0-beta.2 on the real
  feed (`route1-staged.txt`). The installs ran v0.1.0-beta's source, whose adapter differs from fa809ba's by the loader
  only (the second round); the loader's own evidence stays D9's, which the header's first gap already names.
- The spec's rewritten sentence says the same, without the ticket's evidence paths (a persistent document).
- No other comment or statement claims a cause.

Conclusion: no finding.

### Runnability

No code changes: every changed line in `src/` is a comment (`git diff -U0 -- src/`, each added and removed line
beginning `// `). Nothing runs differently.

Conclusion: no finding.

### Security

No code, credential or workflow changes.

Conclusion: no finding.

### Consistency

- Finding R3-1, fixed in place: the rewritten clause pushed the header's eighth line to 137 characters, where the
  comment wraps at about 115 (the file's longer lines are code). Lines 8–12 rewrapped at the block's width, the words
  unchanged (checked by joining both versions). As a class (a rewritten line overrunning its block's wrap): every line
  this round added to wrapped prose measured — the spec's three (at most 103, the paragraph's own lines reaching 106)
  and the header's six (at most 116); none other overruns.
- The header and the spec's Testing Decisions now agree (both state the condition as met by each install route), and
  agree with the coverage checklist's rows of 2026-10-28.
- The smells baseline: no code is introduced or touched, so none applies.

Conclusion: one finding (R3-1), fixed.

### Refactoring list

None.
