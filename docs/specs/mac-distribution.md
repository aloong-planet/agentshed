# macOS distribution

> Related: [ADR-0031](../adr/0031-macos-release-line.md) ·
> [ADR-0032](../adr/0032-app-updates.md) (why each release carries a ZIP) ·
> [app-update](app-update.md) · [landing-page](landing-page.md) · electron-scaffold's macOS signing
> policy (`macos-signing.md`), cited by section below
>
> Pending: a notarized release of Agentshed is downloadable. Until one is there is no feature entry to
> link.

## Problem Statement

Agentshed has never been released. The repository is public and its READMEs face users, yet the only way
to get the app is to build it from source. The local package (`pnpm dist:mac:local`) is signed but never
notarized, which is right for the developer's own Mac and wrong for anyone else's: on another Mac,
Gatekeeper refuses it. Distributing to others brings in the macOS distribution policy, a place to
download from, and an entry point for people who have never seen the repository (the landing page,
specified separately).

## Solution

A release line built in CI on release tags (ADR-0031). A tag runs the release packaging on a macOS
runner through the electron-scaffold packaging asset. The run builds arm64 only, notarizes and staples
both the `.app` and the DMG, gates every artifact, and publishes nothing unless every gate passes.
Every release, pre-releases included, is published on GitHub Releases, and the package carries what
the in-app updater reads. Formal releases are also copied to the R2 bucket `agentshed-releases` behind
a custom download host; the latest pointer is updated last, after every mirrored file has been checked
reachable. The first release is the pre-release `v0.1.0-beta`, and the two READMEs, Chinese and
English, gain download and install instructions with it.

## User Stories

### mac-distribution::US-001 Install a notarized Agentshed

As a Mac user on Apple Silicon, I want to download Agentshed and open it the first time without
Gatekeeper refusing it, so that I can use it without building it or bypassing security.

- mac-distribution::US-001/AC-01: The user downloads the DMG (from the landing page, the R2 host or
  GitHub), opens it, drags Agentshed into Applications and opens it. The first launch shows macOS's
  notice that Apple checked the app for malicious software and found none, and the app opens.
- mac-distribution::US-001/AC-02: The first launch succeeds offline. The installed app carries its own
  stapled ticket, so Gatekeeper does not need to reach Apple.
- mac-distribution::US-001/AC-03: Opening the DMG itself passes Gatekeeper. The DMG carries its own
  stapled ticket.
- mac-distribution::US-001/AC-04: The DMG window has electron-builder's default look: the app icon and
  a link to Applications.

### mac-distribution::US-002 Release by pushing a tag

As the maintainer, I want pushing a release tag to produce and publish a verified release, so that a
release never depends on my machine or on manual steps.

- mac-distribution::US-002/AC-01: A formal tag (for example `v0.2.0`) builds, notarizes and gates the
  release. It then publishes a GitHub release marked Latest, copies the files to R2, and updates the
  latest pointer last.
- mac-distribution::US-002/AC-02: A pre-release tag (for example `v0.1.0-beta`) builds and gates the
  same way and publishes a GitHub release marked Pre-release. It touches neither R2 nor the latest
  pointer.
- mac-distribution::US-002/AC-03: If any gate fails, nothing is published: no GitHub release, no
  mirrored file and no pointer change. The failing step and Apple's log are kept with the run.
- mac-distribution::US-002/AC-04: A manual run with the verification switch runs the same release
  packaging and every gate, but keeps its results only as the run's temporary artifacts: no release,
  no mirror, no pointer.
- mac-distribution::US-002/AC-05: A manual run without the switch runs the local packaging (signed,
  never notarized) and keeps its results only as temporary artifacts.

### mac-distribution::US-003 Learn how to get the app from the README

As a visitor to the repository, I want the README to tell me how to download and install Agentshed, so
that I do not have to build it.

- mac-distribution::US-003/AC-01: Both READMEs, Chinese and English, gain download and install
  instructions, published together with the first release.

## Functional Requirements

### mac-distribution::REQ-001 What every release carries

- mac-distribution::REQ-001/AC-01: One DMG for arm64, named `Agentshed-<version>-mac-arm64.dmg`,
  signed with the Developer ID Application identity. It is notarized and stapled, and so is the `.app`
  inside it.
- mac-distribution::REQ-001/AC-02: A ZIP of the same stapled `.app`, named consistently with the DMG,
  for the in-app updater (ADR-0032), together with the update metadata the updater reads for the
  release's channel. The ZIP holds exactly the one `.app`, and that `.app` passes the same signature
  and stapled-ticket checks as the one in the DMG.
- mac-distribution::REQ-001/AC-03: Apple's notarization logs for the `.app` and the DMG are kept,
  unaltered, with the run's artifacts.
- mac-distribution::REQ-001/AC-04: The app declares macOS 12 as its minimum, in agreement with what
  the README and the landing page state.

### mac-distribution::REQ-002 The four CI tiers

- mac-distribution::REQ-002/AC-01: The tier follows how the run was triggered: a formal tag, a
  pre-release tag, a manual run with the verification switch, or a manual run without it
  (mac-distribution::US-002/AC-01 to AC-05; `macos-signing.md` §5).
- mac-distribution::REQ-002/AC-02: The publishing and mirroring jobs run only on real tag events, as
  their `if` conditions state. A manual run cannot reach them under any input, and a pull request never
  runs them.
- mac-distribution::REQ-002/AC-03: The mirror and pointer jobs depend on the macOS gate job and run
  only for formal tags.

### mac-distribution::REQ-003 Publication order (direct acceptance)

Artifacts go up before the pointer. The latest pointer is rewritten only after every mirrored file has
been checked reachable at its R2 URL, file by file (`macos-signing.md` §8). The GitHub release is
published once the whole artifact set has passed its gates, and never with only part of the set.

### mac-distribution::REQ-004 The R2 mirror and its pointer

- mac-distribution::REQ-004/AC-01: Formal releases are copied to the bucket `agentshed-releases`, one
  directory per version, under the custom download host.
- mac-distribution::REQ-004/AC-02: The latest pointer names the current formal version and its
  download URLs.
- mac-distribution::REQ-004/AC-03: Visitors' browsers on the landing page's origin can read the
  pointer cross-origin, with GET requests only. Before the first formal release there is no pointer,
  and a read finds it absent (landing-page::REQ-001).

The download host is `dl.agentshed.aloongplanet.com`, whose certificate was checked from outside Cloudflare on
2026-10-17 (ADR-0031).

### mac-distribution::REQ-005 Release notes (direct acceptance)

Every release has a note following the release-note template, with a summary the owner provides or
confirms. The title is `<tag>-release` for a formal release and the tag itself for a pre-release. The
macOS section claims "notarized by Apple" only after the run's gates passed and the downloaded artifacts
were verified independently (`macos-signing.md` §7, §10).

### mac-distribution::REQ-006 The first release (direct acceptance)

The first release is `v0.1.0-beta`, a pre-release. The package version is changed to `0.1.0-beta`
first, and the tag is made on that commit.

## Constraints

### mac-distribution::CON-001 One build, through the packaging asset (direct acceptance)

Applies to: both packaging profiles. Each packaging is a single electron-builder call that builds and
signs the `.app`, the DMG and the ZIP. Built-in notarization stays off. The `.app` is notarized by the
packaging asset's `afterSign` hook, and the DMG by its gate afterwards (`macos-signing.md` §3). The
asset files are copied unmodified from electron-scaffold, and their tests run in the project's
verification gateway. A change the project needs goes into the asset in skillshed first; the copy is
never edited on its own.

### mac-distribution::CON-002 The ZIP's gate comes from the asset (direct acceptance)

Applies to: the ZIP of mac-distribution::REQ-001/AC-02. The ZIP's submission and acceptance boundary is
derived for that form rather than copied from the DMG flow (`macos-signing.md`, preamble): the ZIP is not
submitted itself, and its gate is the asset's, which checks the app inside it and the update metadata
that names it (ADR-0032 consequences).

### mac-distribution::CON-003 Fail closed (direct acceptance)

Applies to: every tier. A missing certificate fails any packaging. A missing Apple or R2 credential
fails the release and mirror steps. Nothing is downgraded to "signed only" or published unsigned
(`macos-signing.md` §1, §5).

### mac-distribution::CON-004 Pre-releases never reach R2 (direct acceptance)

Applies to: the mirror and the pointer. Only formal-release events sync the mirror or touch the
pointer (`macos-signing.md` §5; ADR-0031 option 4, rejected).

### mac-distribution::CON-005 Toolchain (direct acceptance)

Applies to: packaging. electron-builder is at 26.17.0, the version the asset's behaviour was verified
on (26.15.3 mishandles the CI keychain import; ADR-0031).

### mac-distribution::CON-006 Credentials never shown (direct acceptance)

Applies to: every log and every piece of command output. The five certificate and Apple secrets and
the four R2 secrets are never printed. Locally they live in an untracked environment file.

### mac-distribution::CON-007 Declared in the capability file (direct acceptance)

Applies to: `capabilities.toml`. `macos-distribution` is enabled. Its local and release profiles name
the two packaging commands, and its source points to the project's macOS signing runbook, which holds
this project's actual values (identity, secret names, artifact naming, tier behaviour). The runbook does
not copy the policy.

## Failure modes and boundaries

**Sequence A: tagging and building**

- A1 The tag's version differs from the package version: the run fails before anything is submitted to
  Apple.
- A2 A pre-release suffix other than `-beta` (`-alpha`, `-rc`, `-dev`): a pre-release, handled like
  any other pre-release (mac-distribution::US-002/AC-02).
- A3 A leftover output from an earlier run: cleared before the build, so nothing from it can pass for
  this run's artifact (the asset's behaviour).
- A4 The certificate secret is missing or empty: the run fails at once and names what to configure.
  An empty value is never passed on (`macos-signing.md` §4).
- A5 A tag pushed on a commit that is not on main: the release line does not check this. The release
  process tags only after the version change is merged (github-ops §5).
- A6 The package version carries build metadata (`0.2.0+5`) or is not semver: the run fails at the tag check,
  before anything is submitted to Apple. The pre-release test (a `-` after the version, Failure A2) is exact only
  for such a version.

**Sequence B: notarizing and gating**

- B1 Apple takes a long time (2–30 minutes per submission, twice per release): the job waits. Its time
  limit leaves room for both submissions.
- B2 Apple answers Invalid: the run fails, Apple's log is fetched for diagnosis, and a failure to fetch
  the log never replaces the original error.
- B3 Any check of the artifact set fails (missing, duplicated or extra artifacts; wrong version or
  architecture; signature identity, Team ID or timestamp wrong; ticket not stapled; Gatekeeper refuses
  the DMG): nothing is published (mac-distribution::US-002/AC-03).
- B4 The ZIP's `.app` lacks its ticket or signature: the release fails like a DMG failure
  (mac-distribution::CON-002).

**Sequence C: publishing and mirroring**

- C1 A formal release's GitHub release is published, then the R2 upload fails partway: the pointer is
  not touched, so the landing page keeps reading the previous pointer and offers that release from R2,
  or, for the first formal release, finds none and offers the new release from GitHub (landing-page
  Failure A3). Re-running the mirror job completes the copy and then the pointer.
- C2 A file on R2 is not reachable after upload: the pointer is not updated (mac-distribution::REQ-003).
- C3 A re-run after a failure never leaves the release or the mirror holding a mix of two builds'
  files. The set is published whole or not at all (`macos-signing.md` §5).
- C4 A manual verification run never creates a release or touches R2, whatever its inputs
  (mac-distribution::REQ-002/AC-02).
- C5 A pre-release tag after a formal release: GitHub marks it Pre-release, and Latest stays on the
  formal release. R2 and the pointer are untouched (mac-distribution::CON-004).

**Sequence D: downloading and installing**

- D1 A browser download carries the quarantine attribute, so the first launch always shows the notice.
  The wording decides whether notarization worked: "Apple checked it … none was detected" means it did;
  "cannot verify the developer" or "may contain malware" is a failure (`macos-signing.md` §7).
- D2 A user opens the app straight from the DMG without moving it: it runs, but the in-app updater
  cannot replace it there (app-update B3). The README and the landing page say to drag it to
  Applications.
- D3 An Intel Mac: the arm64 build does not run there. The README and the landing page say "Apple
  Silicon". An x64 build is deferred (ADR-0031 option 9).
- D4 macOS 11 or older: the app does not open there (mac-distribution::REQ-001/AC-04). The README and
  the landing page say "macOS 12 or later".

**Sequence E: local packaging (regression)**

- E1 `pnpm dist:mac:local` on the developer's Mac still produces a Developer ID–signed package that is
  never notarized, now through the asset. It fails when the signing identity is missing, and on a
  machine with Apple credentials loaded it still never submits to Apple.
- E2 The packaged app keeps the Electron fuses and the other security settings of the packaging
  configuration (docs/ops/electron-security.md). Adopting the asset changes how the app is built, not
  what it is.

## Implementation Decisions

- **The packaging asset** (`mac-packaging.cjs` and its tests) is copied into `build/`, next to the
  existing release-cleanup hook, and the packaging configuration meets the requirements listed in the
  asset's header: a dmg target with an arch list, `mac.notarize: false`, a signed DMG (`dmg.sign`), the
  fixed DMG name and an output directory using at most the version; and for the ZIP, a zip target with
  the same arch list, the fixed ZIP name (`mac.artifactName`) and no update information for the DMG
  (`dmg.writeUpdateInfo: false`), since the DMG gate staples the DMG after electron-builder hashed it.
  Its certificate check replaces the project's own identity check script, so the existing
  `dist:mac:local` definition and that script's tests are retired in the same change. The two copies are
  linted like the project's own scripts; a finding in them is fixed in the asset.
- **The release feed is declared for packaging**: the configuration names GitHub Releases of this
  repository as its publish provider, the feed the app reads (app-update::CON-002), and a unit test holds
  the two equal. electron-builder writes the update metadata only for a provider it knows, and without a
  declared one it detects none in a git worktree, so a packaging there would carry no metadata. Packaging
  still uploads nothing itself.
- **Two packaging commands**, `dist:mac:local` and `dist:mac:release`, named for the environment, not
  the mechanism (`macos-signing.md` §1). They are what the capability file's profiles point to.
- **A release workflow** separate from the existing CI workflow, following Transfer's tag-triggered
  workflow: a macOS gate job (packaging and every gate), a publish job that depends on it, and mirror and
  pointer jobs for formal tags only. Secrets are turned into job-level booleans before any condition
  uses them (`macos-signing.md` §5). The packaging profile follows the trigger and the verification switch; the
  publish job's own condition reads the real event and ref, so no input of a manual run grants publishing. A tag
  is a pre-release when a `-` follows the version, which the tag check makes exact (Failures A1, A6).
- **What the release carries**: the DMGs, and the files the in-app updater reads — the ZIPs, their
  blockmaps (for a partial download) and the update metadata. The gate job keeps them with the run, and
  the publish step refuses an artifact that lacks any of them before anything reaches GitHub. R2 gets the
  DMGs only: the updater reads GitHub Releases (app-update::CON-002).
- **Publishing the GitHub release**: the whole artifact set goes into a draft, which only the repository's
  writers can see; each uploaded file is checked against the gated file by its sha256, and only then is the draft
  made public, in one step. A failed or partial upload leaves a draft and nothing public; a re-run removes the
  drafts left for the tag, and a tag whose release is already public is refused (Failure C3). The release
  starts with a one-line note, replaced by the release note of mac-distribution::REQ-005.
- **R2 layout and pointer** follow Transfer's: each version's files under `releases/v<version>/`, cached for
  good, and the pointer `latest.json` at the bucket's root, cached for five minutes. The pointer is
  `{ version, files: [{ name, arch, size, url }] }`; it departs from Transfer's in carrying each file's download
  URL (mac-distribution::REQ-004/AC-02), and it is what the landing page reads. The mirror job needs the publish
  job, so the GitHub release is public before any file reaches R2 (Failure C1). The pointer job reads every
  mirrored file back through the download host and compares its size and sha256 with the gated file before it
  writes the pointer (mac-distribution::REQ-003). The bucket, its own token, its CORS rule (GET from the landing
  page's origin) and the custom domain are managed with Terraform in the infrastructure repository, kept
  separate from Transfer's (ADR-0031 option 5).
- **Runbooks**: the project's macOS signing runbook (identity, secrets, naming, tiers, workflow
  pitfalls) and its R2 setup notes go under `docs/ops/`, updated in place. They hold this project's
  values and point to the policy rather than copying it.
- **The README change** ships in the same change as the first release, in both languages. The
  instructions point to the landing page and to GitHub Releases, give the same requirements the landing
  page states (macOS 12 or later, Apple Silicon), say what the first launch shows, and tell users to
  drag the app to Applications. They name no version, so they need no edit at the next release.

## Testing Decisions

- **The asset's tests**, which use an injected command runner, run in the verification gateway and in the CI
  workflow's checks job through the script tests. They are placed so that the test command's arguments still
  reach the project's own test runner (`macos-signing.md` §3). They verify command order, failure propagation
  and clean-up, and never touch Apple; the green result must not be read as "notarized" (`macos-signing.md` §9).
- **The workflow conditions** get a static test showing that the manual verification tier cannot
  publish or touch the mirror, and that the mirror and pointer jobs depend on the gate job. It evaluates each
  condition with GitHub's published expression evaluator against the documented contexts of each trigger, and
  runs with the script tests. This is a regression guard only, and does not replace a real run.
- **The publish step** is tested against a model of the repository's releases standing in for GitHub, which
  records every state in which a release is public, so "never public with part of the set" is asserted over all
  of them, and an artifact without each of its update files is refused before the model is touched; its adapter to
  the GitHub CLI is tested for the arguments it sends and the output it reads.
- **The mirror and pointer steps** are tested the same way, against a model of the bucket whose objects the
  download host's reads are answered from, so "the pointer is written only after every file is served" is
  asserted on the model's state when the pointer was written; the aws-cli adapter is tested for its arguments,
  and the HTTP read against a server on localhost.
- **Evidence** (`macos-signing.md` §9: only a release tag or the manual verification tier exercises
  Apple end to end):
  - one manual verification run, with its logs and artifacts;
  - the first pre-release tag's run;
  - an independent check of the downloaded DMG and of the `.app` inside it, plus the ZIP's `.app`, per
    `macos-signing.md` §7;
  - a first launch from a browser download, with a screenshot showing the notice's wording;
  - for the first formal release, the output of the reachability check on every R2 URL before the
    pointer was rewritten.

- Prior art: Transfer's release workflow, which passed these gates with real notarizations, and the
  existing CI workflow's job layout.

## Out of Scope

- x64 and universal builds (deferred, ADR-0031 option 9); Windows and Linux.
- The Mac App Store line (the second app ID is only kept on file in the packaging configuration).
- A mainland-China mirror or a second copy of the landing page (ADR-0031 options 3 and 8).
- Pre-releases on R2, and a pre-release pointer (ADR-0031 option 4).
- Download statistics (deferred, ADR-0031 option 10).
- The in-app updater itself ([app-update](app-update.md)), and the landing page
  ([landing-page](landing-page.md)).

## Further Notes

- No interface of the app changes in this spec: the DMG window is electron-builder's default (owner's
  choice, 2026-10-12), and the README is text. The prototype gate does not apply. The landing page's
  interface is gated in its own spec.
