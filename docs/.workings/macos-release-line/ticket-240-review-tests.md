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
| app-update Failure C1 | Evidence, route 1: the display cache in userData rewritten at the quit before the restart (its modification time against the click), and the restarted app showing its pages at once |
| app-update Failure H2 | Test: covered by app-update::REQ-002/AC-03 (existing; the rejection branch). Evidence (the owner's decision): the release's app satisfies `v0.1.0-beta`'s designated requirement (`codesign --verify -R`), the check the system updater makes; the updater's logs from both installs |
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
