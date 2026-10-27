# Ticket #240 — task list

Ticket: [#240 Update an installed pre-release to the next one](https://github.com/aloong-planet/agentshed/issues/240)
· feature `macos-release-line` · spec [app-update](../../specs/app-update.md), with
[mac-distribution](../../specs/mac-distribution.md) for the release itself and #239's deferred
mac-distribution::US-001/AC-02. Branch `feat/update-to-next-beta`, in the worktree `agentshed-wt/update-240`, cut from
`origin/main` at 2cb6b4f (no commits ahead when cut). Records: [document sync checklist](ticket-240-doc-sync.md),
[test review](ticket-240-review-tests.md), [code review](ticket-240-review-code.md); coverage units in
[checklist.md](checklist.md).

## Facts established before the change (2026-10-27, on 2cb6b4f)

- The blocker #239 published `v0.1.0-beta` (run 39755502301, 2026-10-22). It is the only release (`gh release list`);
  it is a Pre-release.
- This Mac runs `v0.1.0-beta` from `/Applications/Agentshed.app`: the bundle's `CFBundleShortVersionString` is
  0.1.0-beta, it carries Chrome's quarantine attribute, and the running renderer's arguments carry
  `--agentshed-app-version=0.1.0-beta --agentshed-updates=1` (automatic checks on). Its `app-update.yml` names the
  GitHub provider, `aloong-planet/agentshed`, cache directory `agentshed-updater`.
- Since `v0.1.0-beta` (7dc0c22) thirteen commits reached main. Three touch `src/`: the scrollbars (#304,
  `theme.css`), the scripted update source's holds (#307, test seam only: `scriptedUpdateSource`), and a comment in
  `theme.css` (#317). No storage format changed, so the older version can read what the newer one writes, and the
  production update source is unchanged.
- electron-updater 6.8.9's GitHub provider (`out/providers/GitHubProvider.js`, read 2026-10-27): with pre-releases
  allowed and the running version's channel `beta`, it takes the first feed entry whose tag is valid semver and not of a
  custom or `alpha` channel, so `v0.1.0-beta.2` is found; it asks for `beta-mac.yml` and falls back to `latest-mac.yml`,
  the file the GitHub provider writes. With pre-releases not allowed (a formal installation) it reads only
  `/releases/latest`, and with no formal release that fails (`ERR_UPDATER_LATEST_VERSION_NOT_FOUND`).
- The tests read no version from `package.json`: they use literals, and the e2e cases read the running version at run
  time. The version's length reaches the settings page's ready line, which app-update::QR-001/AC-02 measures in the
  gateway's e2e (the case that went red for `0.1.0-beta` in French and Japanese, #239).

## Owner decisions (2026-10-27)

Asked with a recommended answer each; every recommendation was chosen. D1–D6 before the work, in two batches:

- D1 The version is 0.1.0-beta.2 (the spec's Failure E1 and the runbook's example), over 0.1.0-beta.1 and 0.2.0-beta.
- D2 The running `v0.1.0-beta` is quit before the tag is pushed, so its 24-hour check cannot find the release before
  the offline first launch, nor install it on an unplanned quit (over turning automatic checks off, or leaving it).
- D3 The offline first launch comes first, before any update, with the app dragged from the DMG into a folder of its
  own rather than Applications, then deleted; `/Applications` keeps `v0.1.0-beta` for the updates (over dragging into
  Applications and restoring a backup, and over doing it after the updates, when the updated app's launch may already
  have been this Mac's assessment of the build).
- D4 Both install routes run on this release: the ready button first, then, with `v0.1.0-beta` restored from a
  byte-for-byte copy, install on quit (over the ready button only).
- D5 app-update::US-004/AC-01 on real releases waits for a pre-release published after the first formal release, with
  the other evidence that needs a formal release (#241); its guarantee stays #230's unit test (over checking a local
  formal-version build against the feed now).
- D6 Failure H2's real-path evidence is the real installs' signature check: the release's app checked against the
  installed app's designated requirement, which is what the system updater checks, and the updater's logs (over the
  test alone). The question said the rejection branch stayed on app-update::REQ-002/AC-03's test; the
  post-implementation check found that untrue (its finding 1), and D7 and D8 followed.

D7 and D8 after the post-implementation check's finding 1, put to the owner with that correction:

- D7 The installed copy's wait for Squirrel.Mac to stage the package gets unit tests in this ticket, through an
  injection seam for electron-updater's updater and Electron's native updater, which the owner confirmed with this
  answer (over recording it as a gap with a follow-up ticket, or as a standing gap).
- D8 The spec's Failure H2 is rewritten to match the Implementation Decisions and what Squirrel.Mac does: the system
  updater checks the signature twice; a package rejected while staging is a failed download (B2), the ready button
  never shown; one rejected at install, after the click with the app already quit, is not installed, the version in
  place stays, and nothing is shown. C4 no longer lists a rejected signature among its causes. The code is unchanged.
  First answered as "rejected at install, an install failure (C4)"; Squirrel.Mac's source (`SQRLUpdater.m`'s staging
  check, `SQRLInstaller.m`'s check in ShipIt after the app quits, `ShipIt-main.m`) showed that no toast can follow a
  rejection at install, and the owner chose this wording on that correction (over leaving the rejection at install out
  of the spec). Both times over changing the code to make every rejection an install failure.

D9 after the incremental check's finding 4, which showed that the fix's default loader runs in no test and in none
of #240's evidence (the routes are updates made by `v0.1.0-beta`, whose adapter predates the seam):

- D9 Before the tag, a locally packaged build of this branch at the version 0.0.9-beta (the version changed for the
  build only, never committed) runs once on this Mac and finds, downloads and stages `v0.1.0-beta` on the real feed,
  running both halves of the loader; the running `v0.1.0-beta` is quit first, as D2 already asks before the tag (over
  recording the loader as a gap, its updater half shown after route 1's restart and its native half at the next
  pre-release).

## Interface gate

No interface changes. The version row shows a different value, which is data, not a new form; the ready line's width
at the new length is QR-001/AC-02's subject, checked by the gateway's e2e.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Branch from the latest main | no commits ahead | done: 2cb6b4f |
| 2 | The package version 0.1.0-beta.2 | the tag check accepts `v0.1.0-beta.2` and refuses `v0.1.0-beta` and `v0.1.0-beta.1` | done (`evidence/ticket-240/tag-check.txt`) |
| 3 | Test design review | `ticket-240-review-tests.md`, design section | done; its increment for the staging wait's cases (T1–T4) after task 9 |
| 4 | Targeted checks | typecheck, lint, the tests that read the version | done: `TARGETED_EXIT=0` (`evidence/ticket-240/targeted.txt`) |
| 5 | The manual verification run on the branch (verify on): 0.1.0-beta.2 through Apple on the upgraded actions, nothing published | the run green; its gate lines | done: run 40522427267 on fa428ee, green (`evidence/ticket-240/verification-run.txt`) |
| 6 | Coverage checklist sign-off for the change | `checklist.md` | done: the version change passed its targeted run; every other unit after the tag; US-004/AC-01 Waiting (D5) |
| 7 | Step 5: `/review-code` | `ticket-240-review-code.md` | done on fa428ee: no finding; a second round for the fix of task 9a |
| 8 | The gateway run before the test check | `pnpm verify` exit 0 | done on 2992ad5: `VERIFY_EXIT=0` (`evidence/ticket-240/pre-review-2992ad5.txt`) |
| 9 | Step 6: `/review-tests` post-implementation check, by an independent sub-agent | the same record, second section | done on 2992ad5: findings 1–3 (the staging wait untested and H2 against the Implementation Decisions; C1's reading; `update-source.test.ts`'s header) |
| 9a | The fix: D7's seam and T1–T9, D8's H2, C4 and the Testing Decisions, C1's design row, the test header; the self-check; the targeted run; the code review's second round; the incremental check by a new sub-agent | `adapter-mutants.txt`, `targeted-fix.txt`, `change-scope-fix.txt`; both review records | done: committed as fa809ba; the incremental check's findings 4 (the default loader shown by nothing) and 5 (a stale sentence) handled with D9 (task 9b) and in place |
| 9b | D9: the local build at 0.0.9-beta (`release/0.0.9-beta/`, `package.json` restored after the build); `v0.1.0-beta` quit by the owner; the build launched once: the update found, downloaded and staged (its log, electron-updater's cache, Squirrel.Mac's state); the build removed after | `evidence/ticket-240/loader-check.txt` | done 2026-10-27 16:05–16:09Z: `v0.1.0-beta` found, downloaded (121 MB) and staged within 40 s, the native `update-downloaded` heard, the ready button shown (`loader-check-rail.png`); quit then installed it into the scratch copy, no relaunch in 90 s; the copy and the build deleted |
| 10 | Spec final check, step 7, step 8 (`/features-catalog`) | `final-regression.md`, this ticket's section | done 2026-10-28. Spec check against the app-update spec as rewritten (H2, C4, the Testing Decisions) and mac-distribution: the version change matches the release rules (REQ-006's tag rule, Failure A1's check); the source's change is the Implementation Decision "Ready means the update can install" made testable, behaviour unchanged, with H2 and C4 now saying what it does (D8); the tests and the seam are the owner's D7, written into the Testing Decisions; no unrecorded scope. Step 7: no ADR (D1–D9 are this ticket's choices, easy to reverse; the product rules they touch live in the spec), no new term, no postmortem (the questions asked on unchecked facts were caught by this ticket's own reviews before anything shipped; recorded here and in the report's stage 3). Step 8: the #240 section, three stages, `docs/features/` unchanged |
| 11 | Full gateway; pull request; stop for the owner's merge confirmation | PR link; CI | pending |
| 12 | On the owner's confirmation, with `v0.1.0-beta` quit: the tag `v0.1.0-beta.2` on a main commit carrying the version; the release run | the run green; a Pre-release; the mirror and pointer jobs skipped; the publish job's download step on download-artifact v8 (#253) | pending |
| 13 | The downloaded artifacts checked independently (policy §7), `spctl` held back until task 14 is done | `evidence/ticket-240/` | pending |
| 14 | The offline first launch (mac-distribution::US-001/AC-02's user path): a Chrome download of the DMG, its quarantine read, the network off and shown off, the DMG and the app opened from Finder, the app in a folder of its own; screenshots; syspolicyd's log | `evidence/ticket-240/` | pending |
| 15 | `spctl` on the downloaded DMG and apps | the same | pending |
| 16 | Route 1: `v0.1.0-beta` copied byte for byte first; launched, the update found, downloaded, ready; the ready button clicked; the app restarts into 0.1.0-beta.2 with its saved pages (Failure C1), the post-update line and "Check now" | the bundle's and the running process's versions; screenshots | pending |
| 17 | Route 2: `v0.1.0-beta` restored from the copy; the update ready again; quit with ⌘Q; no relaunch; the next launch runs 0.1.0-beta.2 | the same | pending |
| 18 | Failure H2: the release's app against the installed app's designated requirement; the updater's logs from both installs | `evidence/ticket-240/` | pending |
| 19 | The release note: drafted from the template after tasks 12–13, the summary from the owner | the published note | pending |
| 20 | Records after the release: the coverage checklist's current verification, the app-update spec's Testing Pending note, the document sync checklist, step 8's events; #239's AC-02, #253's third item, #240's items | a records pull request, merged on the owner's confirmation | pending |

## Self-check of the fix for the post-implementation check (items 6 and 7)

- Item 6, the fix's evidence: `evidence/ticket-240/adapter-mutants.txt` prints, for each of nine mutations of
  `electronUpdateSource`, the text replaced, that it occurred once and landed, the cases that ran with the ones that
  failed, and the file's sha256 restored to the original's after each. Each reading can change: every mutation turns
  its own case red and no other. An earlier run of the first four, against the test file before increment 2, was
  replaced by this one rather than kept beside it.
- Item 7, the records the fix touches: the design review's coverage rows for C1 and H2 corrected in place and its two
  increments (T1–T4, T5–T9); the test review's disposition; the code review's second round; the coverage checklist's
  H2 row; the document sync checklist's rows for the spec and the test header; D6–D8 in this file. The test file's
  header states its gaps with their conditions.
