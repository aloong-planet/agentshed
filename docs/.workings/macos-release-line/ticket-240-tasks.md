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

Asked in two batches, each with a recommended answer; every recommendation was chosen:

- The version is 0.1.0-beta.2 (the spec's Failure E1 and the runbook's example), over 0.1.0-beta.1 and 0.2.0-beta.
- The running `v0.1.0-beta` is quit before the tag is pushed, so its 24-hour check cannot find the release before the
  offline first launch, nor install it on an unplanned quit (over turning automatic checks off, or leaving it).
- The offline first launch comes first, before any update, with the app dragged from the DMG into a folder of its own
  rather than Applications, then deleted; `/Applications` keeps `v0.1.0-beta` for the updates (over dragging into
  Applications and restoring a backup, and over doing it after the updates, when the updated app's launch may already
  have been this Mac's assessment of the build).
- Both install routes run on this release: the ready button first, then, with `v0.1.0-beta` restored from a
  byte-for-byte copy, install on quit (over the ready button only).
- app-update::US-004/AC-01 on real releases waits for the first formal release, with the other evidence that needs one
  (#241); its guarantee stays #230's unit test (over checking a local formal-version build against the feed now).
- Failure H2's real-path evidence is the real installs' signature check: the release's app checked against the
  installed app's designated requirement, which is what the system updater checks, and the updater's logs; the
  rejection branch stays on app-update::REQ-002/AC-03's test (over the test alone).

## Interface gate

No interface changes. The version row shows a different value, which is data, not a new form; the ready line's width
at the new length is QR-001/AC-02's subject, checked by the gateway's e2e.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Branch from the latest main | no commits ahead | done: 2cb6b4f |
| 2 | The package version 0.1.0-beta.2 | the tag check accepts `v0.1.0-beta.2` and refuses `v0.1.0-beta` and `v0.1.0-beta.1` | done (`evidence/ticket-240/tag-check.txt`) |
| 3 | Test design review | `ticket-240-review-tests.md`, design section | in progress |
| 4 | Targeted checks | typecheck, lint, the tests that read the version | pending |
| 5 | The manual verification run on the branch (verify on): 0.1.0-beta.2 through Apple on the upgraded actions, nothing published | the run green; its gate lines | pending |
| 6 | Coverage checklist sign-off for the change | `checklist.md` | pending |
| 7 | Step 5: `/review-code` | `ticket-240-review-code.md` | pending |
| 8 | The gateway run before the test check | `pnpm verify` exit 0 | pending |
| 9 | Step 6: `/review-tests` post-implementation check, by an independent sub-agent | the same record, second section | pending |
| 10 | Spec final check, step 7, step 8 (`/features-catalog`) | `final-regression.md`, this ticket's section | pending |
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
