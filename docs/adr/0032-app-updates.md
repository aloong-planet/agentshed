# ADR-0032: App updates from GitHub Releases, offered rather than pushed — the app's one outbound request

- Status: Accepted (2026-10-12)
- Relation: depends on ADR-0031, which creates the releases this reads; makes the one exception to the
  CONTEXT invariant that Agentshed's own code reaches no network

## Context

Once Agentshed is released (ADR-0031), an installed copy has no way to learn that a newer version exists:
users stay on whatever they first downloaded. The fix is an update mechanism, and it is a departure for
this product. Agentshed is local-first, and today its own code makes no outbound request at all — a
search of the 177 TypeScript files under `src/` finds no network API outside the tests (the two `fetch`
hits are a local query function and `net.fetch` reading `file://` URLs), and the production content
security policy is `default-src 'self'` with `connect-src 'self'`. An update check is the first time the
app reaches the network.

Two facts from electron-updater 6.8.9 shape the options: on macOS it installs from a **ZIP** of the app and
fails without one (`MacUpdater.js`, `ERR_UPDATER_ZIP_FILE_NOT_FOUND`); and its "pre-release installs are
offered pre-releases" behaviour — `allowPrerelease` defaulting to true only when the running version has
a pre-release component — exists for the GitHub provider only (`AppUpdater.js`).

## Options

1. **electron-updater reading GitHub Releases; checks at launch and every 24 hours while a settings
   switch, on by default, allows them; a found update is only announced, and downloads when the user asks;
   once downloaded, a prompt to restart, and otherwise installation on quit; a manual "check for updates"
   in the application menu and in settings; automatic failures silent, manual checks always reporting;
   the release channel following the installed version; no statement about the network request**
2. Reading the R2 mirror (a generic provider) — rejected: the mirror holds formal releases only
   (ADR-0031), and the pre-release channel would have to be rebuilt by hand with separate channel files
3. Downloading in the background and then prompting to restart — rejected by the owner: an update is
   downloaded only when the user has asked for it
4. Downloading and installing silently — rejected: the user would not know the app changed, the least
   transparent choice for a local-first app
5. Automatic checks off by default — rejected: most users would never turn them on, and the mechanism
   would exist in name only
6. Automatic checks always on, with no switch — rejected: a user who wants the app never to reach the
   network could not stop it
7. Installing immediately once a download completes — rejected: it restarts the app at a moment the user
   did not choose. Waiting for a restart click with no install on quit — rejected: an ignored prompt would
   leave the user on the old version with the download sitting unused
8. Formal releases only, for everyone — rejected: the first release is a pre-release (ADR-0031), so its
   users would get no fixes until the first formal release. A user-chosen channel — rejected: one more
   setting and state combination for little gain
9. Checking at launch only — rejected: a copy left running for days would not see a new release. Every
   six hours — rejected: four times the requests for little benefit to a local-first app
10. A sentence beside the switch and in the README saying that checks only fetch version information and
    send no local data — declined by the owner
11. A manual check in settings only, or none — rejected: the application menu is where macOS users look
    for it, and without any manual check a user who turned automatic checks off would never update
12. Leaving updates out of the release line — rejected by the owner; updates ship with it

## Decision

We choose **option 1**. Automatic update checks run at launch and every 24 hours while the switch in
settings, on by default, allows them. When an app update is found the app only says so; the download
starts when the user asks. When it finishes, the app offers to restart and install, and if the user does
not, the update is installed when the app next quits. A manual check is available from the application
menu and from settings. A failed automatic check is silent; a manual check always reports what it found:
an update, already up to date, or a failure. An installation's release channel follows the version
installed. No statement about the network request is shown.

## Consequences

- Positive: installed copies can stay current without the user watching the repository
- Positive: the pre-release channel comes with electron-updater's defaults instead of hand-built channel
  files
- Positive: nothing is downloaded, and nothing restarts, without the user's say
- Negative: the CONTEXT invariant that Agentshed's own code reaches no network now has one exception, and
  a user is not told about it outside the switch itself
- Negative: in places where GitHub is slow or unreachable, automatic checks fail silently and those users
  see no app update until a manual check gets through
- Negative: the update feed is locked in by every installed copy: moving it off GitHub later needs a
  release that still reads the old feed long enough for installations to move
- Negative: macOS packages must include a ZIP, which the electron-scaffold packaging asset does not gate
  today. The asset has to be extended in skillshed (its own rule: change the asset, never the copy), and
  `macos-signing.md` requires the ZIP's submission and acceptance boundary to be derived anew rather than
  copied from the DMG flow
- Neutral: the menu item, the switch and every update prompt are app copy, so they come in all six
  languages (ADR-0013)

## Sources

The owner's decisions in the requirements session of 2026-10-12. electron-updater 6.8.9, read from the
published package: `out/MacUpdater.js` (the ZIP requirement), `out/AppUpdater.js` (`allowPrerelease`) and
`out/providers/GitHubProvider.js` (the release feed). A search of `src/` for network APIs and the content
security policy in `src/main/security.ts`, both on 2026-10-12.
