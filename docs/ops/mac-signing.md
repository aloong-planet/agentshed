# macOS signing, notarization and packaging · this project's runbook

This runbook holds **Agentshed's own values and steps**. The distribution policy — which build is signed,
which is notarized, what a gate must assert, what may and may not be claimed — is electron-scaffold's
`macos-signing.md`; it is cited by section here and not copied. Decisions: ADR-0031 (the release line),
ADR-0032 (app updates). Requirements: `docs/specs/mac-distribution.md`.

## The two packaging commands

Declared in `capabilities.toml` under `macos-distribution.profiles`:

| Command | Profile | What it does |
|---|---|---|
| `pnpm dist:mac:local` | local | Checks for the Developer ID identity, then one electron-builder call builds and signs the `.app`, the DMG and the ZIP of the app (with the update metadata); never notarizes, even with Apple credentials loaded. Policy §1, §3 |
| `pnpm dist:mac:release` | release | Checks the identity and the Apple credentials before building; the same call notarizes and staples the `.app` through the `afterSign` hook before its DMG and ZIP are built; then checks the ZIP's app and the update metadata, and signs, notarizes, staples and gates the DMG. Policy §3, §6, §7 |

Both run `build/mac-packaging.cjs`, the electron-scaffold packaging asset, with its tests in
`build/mac-packaging.test.cjs` (run by `pnpm test:scripts`, part of `pnpm verify` and of CI). **The two files
are copies and are never edited here**: a change goes into the asset in skillshed first and is copied back.
Check a copy against the asset with
`cmp build/mac-packaging.cjs <skillshed>/electron-scaffold/assets/mac-packaging.cjs` (and the same for the test
file). The project's lint covers the two copies like its own scripts; a lint finding in them is fixed in the asset.

The asset checks `electron-builder.yml` at run time, before building, against the requirements in its header: a mac
`dmg` target with an arch list, `mac.notarize: false`, `dmg.sign: true`, `directories.output` using at most
`${version}` and the DMG name below; and for the ZIP the updater installs from, a `zip` target with the same arch list,
`mac.artifactName` (the ZIP name below) and `dmg.writeUpdateInfo: false`. The configuration also declares the GitHub
provider (`publish`), the feed the app reads: without it electron-builder detects none in a git worktree and writes no
update metadata, without a word.

## This project's values

| What | Value |
|---|---|
| Signing identity | `Developer ID Application: Longfei Zhou (RHQ28XS7D9)` |
| Team ID | `RHQ28XS7D9` |
| App ID | `agentshed.aloong.com` (the Mac App Store ID `agentshed.aloongplanet.com` is kept on file only) |
| Architectures | arm64 only (ADR-0031) |
| Minimum macOS | 12.0 (`mac.minimumSystemVersion`; the README and the landing page say the same) |
| Output | `release/<version>/` (git-ignored; the five most recent versions are kept) |
| DMG | `release/<version>/Agentshed-<version>-mac-arm64.dmg` |
| ZIP (the in-app updater installs from it) | `release/<version>/Agentshed-<version>-mac-arm64.zip`, with its `.zip.blockmap` for a partial download |
| Update metadata | `release/<version>/latest-mac.yml`: the GitHub provider's name for every version, pre-releases included; it lists the ZIP with its size and sha512 |
| Notarization logs (release) | `Agentshed-<version>-mac-arm64.app.notary-log.json` and `<dmg>.notary-log.json`, next to the DMG |
| electron-builder | 26.17.0, the version the asset was verified on (26.15.3 mishandles the CI keychain import) |

## Credentials

The five standard variables of policy §4: `CSC_LINK` and `CSC_KEY_PASSWORD` (the certificate, needed only
where it is not in the login keychain — in CI), and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
`APPLE_TEAM_ID` (notarization, release profile only). They are never printed by any command or log.

Locally the certificate is in the login keychain (`security find-identity -v` lists it), and the three Apple
variables are loaded from `.env.local` at the repository root:

```bash
set -a && source ./.env.local && set +a && pnpm dist:mac:release
```

`.env.local` is untracked and git-ignored (`.env*.local`), so nothing loaded from it reaches the repository.

## Checking a package by hand

What the release profile asserts on its own (policy §6, §7), for an independent check of a built or
downloaded package (policy §7 lists the full set and why `stapler validate` is the one that tells a stapled app
from an unstapled one):

```bash
DMG=release/<version>/Agentshed-<version>-mac-arm64.dmg
codesign --display --verbose=4 "$DMG"            # Authority=Developer ID Application, TeamIdentifier=RHQ28XS7D9, a Timestamp
xcrun stapler validate "$DMG"                    # release only
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"   # release only
MP=$(mktemp -d) && hdiutil attach -readonly -nobrowse -mountpoint "$MP" "$DMG"
codesign --verify --deep --strict --verbose=2 "$MP/Agentshed.app"
xcrun stapler validate "$MP/Agentshed.app"       # release only
/usr/libexec/PlistBuddy -c "Print LSMinimumSystemVersion" "$MP/Agentshed.app/Contents/Info.plist"   # 12.0
hdiutil detach "$MP"
node scripts/check-fuses.mjs                     # the Electron fuses of the built app
```

The ZIP's app, and the metadata against the ZIP (policy §7); the ZIP itself is never written to:

```bash
ZIP=release/<version>/Agentshed-<version>-mac-arm64.zip
D=$(mktemp -d) && ditto -x -k "$ZIP" "$D" && ls -A "$D"   # exactly Agentshed.app
codesign --verify --deep --strict --verbose=2 "$D/Agentshed.app"
codesign --display --verbose=4 "$D/Agentshed.app"         # Authority=Developer ID Application, TeamIdentifier=RHQ28XS7D9, a Timestamp
xcrun stapler validate "$D/Agentshed.app"                 # release only
rm -rf "$D"
cat release/<version>/latest-mac.yml                      # its sha512 and size must equal the next two
openssl dgst -sha512 -binary "$ZIP" | base64
stat -f %z "$ZIP"
```

A local package passes the signature lines and fails the `stapler` and `spctl --type open` lines: it is never
notarized, by design.

## CI

`.github/workflows/release.yml` packages macOS in CI (mac-distribution::REQ-002; the tiers are policy §5). Its
gate job runs on `macos-latest`. The publish job runs on `ubuntu-latest` and needs the gate job. For formal tags,
the mirror and pointer jobs then copy the release to R2 and rewrite its `latest.json` (`docs/ops/r2-setup.md`).

| Trigger | Tier | What it leaves |
|---|---|---|
| A pushed `v*` tag without a suffix (`v0.2.0`) | formal | the release profile and every gate; then a GitHub release titled `<tag>-release`, marked Latest; then the R2 mirror and, last, `latest.json` |
| A pushed `v*` tag with a suffix (`v0.1.0-beta.2`) | pre-release | the same; the release titled with the tag, marked Pre-release |
| `gh workflow run release.yml -f verify=true` | manual verification | the release profile and every gate; the run's artifacts only |
| `gh workflow run release.yml` (`verify` off) | manual packaging | the local profile (signed, never notarized); the run's artifacts only |

- **The verification switch is the `verify` input.** Add `--ref <branch>` to run a branch's version of the
  workflow. GitHub dispatches only a workflow whose file is on `main`, and then runs the file at the given ref.
- **A pushed tag is a public release.** Make the tag only on a commit on `main` whose `package.json` carries the
  tag's version, after the version change is merged (the version change goes through a pull request; github-ops §5). The gate job fails before packaging
  when the tag is not `v` + that version, or when the version is not semver or carries build metadata
  (`scripts/release-tag.mjs`). A suffix after the version makes the release a pre-release, whatever the suffix
  says.
- **Artifacts.** `agentshed-macos` holds the DMG, the ZIP, its blockmap, the update metadata and, in the release profile,
  the two notarization logs, unaltered.
  A failed gate job uploads whatever logs Apple returned as `agentshed-macos-failed`; the log of a rejection is also
  in the job log.
- **Publishing.** `scripts/publish-release.mjs` puts the whole set — the DMG and the files the updater reads, the ZIP,
  its blockmap and the metadata — in a draft, which only the repository's writers can see; it refuses an artifact that
  lacks any of them. It checks each upload against the gated file by sha256, then makes the draft public in one step. A failed or
  partial upload leaves a draft and nothing public. Re-run the publish job ("Re-run failed jobs"): it removes the
  drafts left for the tag and uploads the same files again. It refuses a tag whose release is already public; a new
  build of that version needs a new version.
- **Release note.** The release starts with a one-line note. The note proper (github-ops §4, §5) replaces it with
  `gh release edit` once the downloaded DMG and ZIP have been checked as in the section above. Its download table lists
  the DMG only: the ZIP and the metadata are for the updater (policy §10).
- **Time limits.** The gate job has 120 minutes: Apple takes 2–30 minutes per submission, and the release profile
  submits twice. The publish job has 15.
- **Actions.** Every action is pinned to a full commit, with its version in a comment: the gate job holds the
  certificate and Apple's credentials, and the publish job can write releases. The other workflows are pinned the same
  way, at the same commits (an `AGENTS.md` invariant; `scripts/workflow-actions.test.mjs` checks every workflow file).
  Update an action by its new release's commit, in every workflow at once.
- **Tests.** `scripts/release-workflow.test.mjs` evaluates the workflow's conditions (`pnpm test:scripts`, which
  CI's checks job and `pnpm verify` run). A change to a condition goes red there before any tag finds it.

### Secrets

The five variables above are **organization secrets** of `aloong-planet`, visible to selected repositories only —
this one. A team-wide certificate and Apple account need importing once, not per app. They are imported with
`~/apple-signing/import-secrets.sh`, outside Terraform, so their values never enter a Terraform state file. The
repository's own secret list does not show them. Check their names with:

```bash
gh api repos/aloong-planet/agentshed/actions/organization-secrets --jq '.secrets[].name'
```

GitHub's rules that matter here:

- A private repository on GitHub Free cannot read organization secrets: this one is public.
- A repository secret of the same name hides the organization's.

The workflow turns each set into a job-level boolean, because a secret cannot appear in a step's `if`. It fails
before checkout when the certificate pair is missing, in every tier, and before packaging when an Apple
credential is missing, in the release tiers. Only the packaging step receives the secrets. The local profile gets
the certificate only, so even in CI it can never submit to Apple. The asset passes the Apple password to
`notarytool` as an argument: it is visible in the runner's process list while it runs, never in a log.
