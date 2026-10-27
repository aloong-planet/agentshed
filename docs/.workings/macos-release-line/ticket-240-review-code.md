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

Verification run: pending.

Conclusion: no finding so far; the verification run is the open item.

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
