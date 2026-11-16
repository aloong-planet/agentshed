# ADR-0032: App updates from GitHub Releases, offered rather than pushed — the app's one outbound request

- Status: Accepted (2026-10-12)

## Context

An installed copy has no way to learn of a newer release (ADR-0031), and the rest of Agentshed's own code makes no
outbound request, so an update check is the app's one (`AGENTS.md`, Product boundaries). On macOS electron-updater
6.8.9 installs from a ZIP of the app and fails without one. It offers pre-releases to a pre-release install
(`allowPrerelease` is true by default only when the running version has a pre-release component) with the GitHub
provider only.

## Options

1. **electron-updater reading GitHub Releases, checking daily behind a switch that is on by default, downloading a
   found update at once and installing it on a click or at quit** — chosen.
2. Reading the R2 mirror (a generic provider) — rejected: the mirror holds formal releases only (ADR-0031), and the
   pre-release channel would have to be rebuilt by hand with separate channel files.
3. A found update only announced, downloading when the user asks — rejected by the owner in favour of the way Codex
   updates, where an update downloads unasked and then waits on one button.
4. Downloading and installing silently — rejected: the user would not know the app changed, the least transparent
   choice for a local-first app.
5. Automatic checks off by default — rejected: most users would never turn them on, and the mechanism would exist in
   name only.
6. Automatic checks always on, with no switch — rejected: a user who wants the app never to reach the network could
   not stop it.
7. Installing as soon as a download completes — rejected: it restarts the app at a moment the user did not choose.
   Waiting for a click with no install on quit — rejected: an ignored button would leave the user on the old
   version with the download unused.
8. Formal releases only, for everyone — rejected: the first release is a pre-release (ADR-0031), so its users would get
   no fixes until the first formal release. A user-chosen channel — rejected: one more setting and state
   combination for little gain.
9. Checking at launch only — rejected: a copy left running for days would not see a new release. Every six hours —
   rejected: four times the requests for little benefit to a local-first app.
10. A sentence beside the switch and in the README saying that checks only fetch version information and send no local
    data — declined by the owner.
11. A manual check in settings only, or none — rejected: macOS users look for it in the application menu, and with no
    manual check a user who turned automatic checks off would never update.
12. Leaving updates out of the release line — rejected by the owner; updates ship with it.

## Decision

We choose **option 1**. Automatic checks run at launch and every 24 hours while the switch in settings, on by default,
allows them, and a manual check is in the application menu and in settings. Any check that finds an app update starts
downloading it in the background at once; a button at the bottom of the rail shows it while it downloads, installs or
is ready, a click when ready installs it and restarts the app, and an update left ready is installed when the app
next quits. A failed automatic check or background download shows nothing and the next check tries again, while a
manual check always reports what it found. The release channel follows the installed version, and no statement about
the network request is shown.

## Consequences

- Positive: installed copies stay current without the user watching the repository.
- Positive: the pre-release channel comes with electron-updater's defaults instead of hand-built channel files.
- Positive: nothing restarts the app without the user's click.
- Negative: updates download without being asked, using the user's bandwidth.
- Negative: the app makes an outbound request, and a user is not told about it outside the switch itself.
- Negative: where GitHub is slow or unreachable, automatic checks fail silently, and those users see no update until a
  check gets through.
- Negative: every installed copy locks in the feed, so moving it off GitHub needs a release that still reads the old
  feed long enough for installations to move.
- Negative: every macOS release carries a ZIP of the app beside the DMG, its submission and acceptance boundary derived
  for that form rather than copied from the DMG's (`macos-signing.md`).
- Neutral: the menu item, the switch and the update button are app copy, in every UI language (ADR-0013, ADR-0035).

## Sources

The owner's decisions of 2026-10-12, the background download after looking at Codex's update button in the installed
ChatGPT 26.930.61225 (its renderer bundle, and the lifecycle its Sparkle bridge exposes: idle, checking, downloading,
ready, installing). electron-updater 6.8.9's published package: `out/MacUpdater.js` (the ZIP requirement,
`ERR_UPDATER_ZIP_FILE_NOT_FOUND`), `out/AppUpdater.js` (`allowPrerelease`) and `out/providers/GitHubProvider.js` (the
release feed). The content security policy in `src/main/security.ts`.
