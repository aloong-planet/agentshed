# Code review — ticket #235

Ticket: [#235 Every release carries the update ZIP and its metadata](https://github.com/aloong-planet/agentshed/issues/235)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

- Date: 2026-10-19
- Version: branch `feat/update-zip`, commit b51002e on 2d9e374, plus uncommitted corrections to five comments
  (below), with lint, the script tests and the update-source unit re-run on them
- Scope: the packaging asset re-copied (`build/mac-packaging.cjs` and its test, skillshed 070c4f2, reviewed in
  skillshed; here only that they are the asset's bytes and fit this project), `electron-builder.yml`,
  `eslint.config.js`, `scripts/lib/release-artifact.mjs`, `scripts/publish-release.mjs`, the release workflow's upload
  step, and the tests

## Underlying premises

| Premise | How established |
|---|---|
| The copies are the asset's bytes | `cmp` against skillshed's 070c4f2 and the clone's working file; nothing after 070c4f2 touches either file |
| The asset needs, with a zip target: the same arch list, `mac.artifactName`, `dmg.writeUpdateInfo: false`, a provider | its header and `resolveLayout`, read in full; `resolveLayout` on the new configuration returns `zip: true` |
| electron-builder writes the update metadata only when it knows the provider | measured: a packaging in this worktree without one wrote none, silently; `app-builder-lib/out/util/repositoryInfo.js` reads `package.json`'s `repository`, three CI variables, then `<project>/.git/config` as a file, which a worktree's `.git` file does not provide. With the provider declared, a packaging here and the CI run both wrote `latest-mac.yml` |
| `--publish never` with a declared provider writes the metadata and uploads nothing | the local packaging and the verification run 39216743638: metadata written; no release or draft exists on the repository afterwards (`gh api …/releases`: 0) |
| The metadata lists only the ZIP, with the ZIP's size and sha512 | measured on both packagings and on the run's artifact: equal to `openssl dgst -sha512` and `stat` of the ZIP |
| electron-builder writes the ZIP's blockmap, so the publish step may require it | observed in all three packagings (`building block map … .zip.blockmap`) |
| Declaring the provider changes nothing else in a released app | the app sets its feed itself (`setFeedURL(UPDATE_FEED)`); a CI checkout has a `.git` directory, so CI builds detected the provider before and carried the same `app-update.yml`; it names the same feed (checked in the run's ZIP) |
| The publish job has no YAML parser (no install) | read: it runs `node` after `setup-node` and `download-artifact` only; so the publish step checks the set's names, and the metadata's content is the gate's check (`checkUpdateMetadata`) |
| Causal comments | every comment in the changed files that speaks of the artifact set, the upload or the provider, enumerated and checked. Five corrected: `electron-builder.yml` said the provider is detected "only from a `.git` directory" (also `package.json` and CI variables); the update-source test said "releases go where that provider says" (the workflow publishes to its own repository; the provider shapes the metadata and `app-update.yml`); `updateFiles` said the gate checked the files "before anything went to Apple" (the `.app` is submitted during the build; the check is before the DMG's submission); the publish script's header and the publish test's fixture note still said DMGs only; `release-artifact.mjs`'s header described the download as DMGs and logs |

Conclusion: five comment findings, all corrected; one premise (provider detection) found false by a real packaging
and fixed in the configuration.

## Runnability

- The path of a release: the gate builds the DMG and the ZIP in one call (the asset), gates the ZIP's app and the
  metadata before the DMG goes to Apple, and uploads the five kinds of file; the publish step refuses an artifact
  without the ZIP, its blockmap or exactly one metadata file for each DMG, before touching GitHub, then publishes all
  of them or none (the existing draft-then-public sequence, now over four files). Measured end to end up to the
  upload by the verification run (the publish job is not reached by that tier).
- Fault escape surface: a missing or stray update file fails the publish job before GitHub is touched — self (the
  release stays unpublished, the gate's artifact stays for a re-run). The mirror is unchanged and DMG-only — no
  escape into R2 or the pointer.
- Local packaging now also builds a ZIP (about 120 MB per version); `clean-old-releases.cjs` keeps five versions, so
  a developer's `release/` roughly doubles. Not a defect.
- The GitHub release now shows the ZIP, its blockmap and `latest-mac.yml` beside the DMG. Policy §10 says the release
  note's download table lists the DMGs only; that is the release note's rule (#239 writes the first one).

Conclusion: no defect.

## Security

No new secret or credential path: the provider block names a public repository, packaging still passes
`--publish never`, and only the existing publish job (with `GH_TOKEN`) uploads. The ZIP's app is the same signed,
notarized and stapled app as the DMG's (independently checked on the run's artifact), and the updater verifies the ZIP
by the metadata's sha512, which equals the file's. Nothing new is printed.

Conclusion: no finding.

## Consistency

- Class-level: every place that names the release's files was enumerated — the gate's upload paths, the asset's
  artifact-set check, `releaseFiles` (DMGs: publish and mirror), `updateFiles` (publish only). They agree: the gate
  keeps DMGs, ZIPs, blockmaps, the metadata and the notary logs; the release gets all but the logs; R2 gets the DMGs.
- The feed is now stated twice (`UPDATE_FEED` and `electron-builder.yml`'s `publish`); the new unit test holds them
  equal, and a mutation of the owner turns it red.
- The lint exclusion of the two copies is gone, since the asset fixed its findings; the copies lint clean, and a
  planted finding in one is reported.
- Smells checked: none in the change. `updateFiles` takes the DMG names rather than re-reading them, so the two
  selections cannot disagree about which DMGs there are.
- Regression: every existing publish case runs on the full set and still asserts what it did; the mirror's cases are
  unchanged and pass; `pnpm test:scripts` 135, the update-source unit 9.

Conclusion: no finding to act on.

## Refactoring list

None.

## Findings outside this ticket's change

**O1. The asset's header says a GitHub repository makes the provider detectable; in a git worktree it does not.**
The header of `mac-packaging.cjs` (skillshed 070c4f2) says a publish provider "must be configured or detectable (a
GitHub repository is)". electron-builder 26.17.0 reads `<project>/.git/config` as a file, so in a git worktree — the
way parallel sessions here work — nothing is detected and no update metadata is written, without a word.

- Impact: any project adopting the ZIP and relying on detection gets local packages without metadata in a worktree.
  The release profile's DMG gate fails such a build ("no update metadata"), so nothing broken is published; the local
  profile does not check the metadata, so a local package quietly lacks it. In CI a checkout has a `.git` directory,
  and detection works.
- Here: answered by declaring the provider (this change), so agentshed no longer depends on detection.
- Recommendation: fix the header in skillshed — "must be configured (detection reads `.git/config`, which a git
  worktree does not have)" — and consider checking the metadata in the local profile too. Home: a comment on
  zhoulf1006/skillshed#18 when its evidence is linked there (the asset's own ticket), or a new skillshed issue; the
  owner decides which (the document sync checklist carries the row).
