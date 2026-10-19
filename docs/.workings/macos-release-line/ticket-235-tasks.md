# Ticket #235 — task list

Every release carries the update ZIP and its metadata. Working record, not a requirement authority (the spec is
`docs/specs/mac-distribution.md`). Checkpoints are what proves each step done. Branch `feat/update-zip`, in the
worktree `agentshed-wt/update-zip`, cut from `origin/main` at 2d9e374 (no commits ahead when cut).

## Facts this ticket rests on (checked 2026-10-19)

| Fact | How established |
|---|---|
| The asset to adopt is skillshed's `070c4f2` (#20); nothing after it touches `mac-packaging.cjs`, its test or `macos-signing.md`, locally or on skillshed's `origin/master` | `git log 070c4f2..HEAD` and `..origin/master` on those paths: empty |
| The project's copies are byte-identical to skillshed's `280b789` (the script) and `13396d2` (the test) | `cmp` against each commit's file |
| With a mac `zip` target the asset requires `mac.artifactName: ${productName}-${version}-mac-${arch}.${ext}`, `dmg.writeUpdateInfo: false`, the same arch list as the dmg target, and a publish provider configured or detectable; it now checks `dmg.sign: true` itself | the asset's header and `resolveLayout`, read in full |
| The app's updater does not depend on the packaged `app-update.yml`: it sets the GitHub feed itself | `src/main/update-source.ts` (`UPDATE_FEED`, `setFeedURL`) |
| electron-builder detects a publish provider only from `package.json`'s `repository` (absent), CI variables, or `<project>/.git/config`; in a git worktree `.git` is a file, so a packaging there writes no update metadata, silently | a real local packaging in this worktree wrote none; `app-builder-lib/out/util/repositoryInfo.js` read (evidence/ticket-235/local-packaging.txt). Hence the provider is declared in `electron-builder.yml` |
| The publish step and the mirror step both take their files from `releaseFiles`, which selects DMGs only; the mirror's pointer and content type are DMG-specific | `scripts/lib/release-artifact.mjs`, `scripts/publish-release.mjs`, `scripts/mirror-release.mjs` |
| The app reads updates from GitHub Releases, never R2 | app-update::CON-002; ADR-0032 option 2 (rejected) |
| The gate job uploads `release/*/*.dmg` and `release/*/*.notary-log.json` only, and the static workflow test asserts exactly that list | `.github/workflows/release.yml`; `scripts/release-workflow.test.mjs` |
| The lint skips the two copies by exact name | `eslint.config.js` |

## UI admission check (step 4.0)

No interface point: the change is packaging, the release's files and their upload. Exception, no visible change in
the app (the to-spec prototype gate's list); the spec's Further Notes say the prototype gate does not apply.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Test design review (`/review-tests` design review), before the first test | `ticket-235-review-tests.md` design section | done |
| 2 | Re-copy the asset and its test from `070c4f2`; drop the lint exclusion | `cmp` with skillshed's files; `pnpm lint`; the asset's tests | done: both copies `cmp`-identical to 070c4f2; lint passes on them, and a planted finding is reported; 86 asset tests pass |
| 3 | `electron-builder.yml`: the zip target, `mac.artifactName`, `dmg.writeUpdateInfo: false` | the asset's own check (`resolveLayout`) passes in a real packaging | done: plus the declared GitHub provider; `resolveLayout` passes with `zip: true` |
| 4 | The publish step publishes the update files with the DMGs and refuses a set without them; the mirror stays DMG-only | script tests red then green | done: P1, P2 red then green; P3 moved to the full set; M1 green first, proven by mutation |
| 5 | The gate job uploads the ZIP, its blockmap and the metadata; the static workflow test follows | script tests | done: W1 red then green |
| 6 | A real local packaging (`pnpm dist:mac:local`) on this Mac: the ZIP and the update metadata written, the ZIP's app checked by the asset | the run's output, kept as evidence | done: twice (`evidence/ticket-235/local-packaging.txt`): the first wrote no metadata, the second, with the provider declared, wrote `latest-mac.yml` matching the ZIP |
| 7 | Targeted verification (step 4.6) | lint and the affected tests, found by search | done: `evidence/ticket-235/targeted-verification.txt` |
| 8 | Ticket checklist check (step 4.7) | each item's evidence | done: each item's evidence, after the verification run (task 12, run first: it gates the packaging only, so the code review could not invalidate it) |
| 9 | Step 5: `/review-code` | `ticket-235-review-code.md` | done: five comment findings corrected; one outside finding (O1, the asset's header) for the owner |
| 10 | Full verification gateway | `pnpm verify` exit 0 | done: exit 0 on b51002e with the comment corrections, and again on the final tree after the test review's added case (`evidence/ticket-235/full-verification.txt`) |
| 11 | Step 6: `/review-tests` after implementation | `ticket-235-review-tests.md` post-implementation section | done: one survivor beyond the design (B12) closed with a sixth P2 case |
| 12 | The manual verification run (`verify` on) on the branch: real notarization; the ZIP's app and the metadata checked independently (policy §7), which is also skillshed#18's owed evidence | the run, its artifacts, the independent check, in `evidence/ticket-235/` | done: run 39216743638 green in 6m22s; the artifact checked independently (`evidence/ticket-235/verification-run.txt`), the metadata's sha512 and size equal to the ZIP's |
| 13 | Spec final check and step 7: the spec, the runbook, the comment in `electron-builder.yml` | spec and records | done: below; the spec and the runbook written back; no ADR, CONTEXT term or postmortem |
| 14 | Step 8 decision; document sync; PR; stop for the owner | PR link; CI | step 8 skipped by its two questions (`ticket-235-doc-sync.md`); PR pending |

## Spec final check (2026-10-19, code read against the spec on the uncommitted tree)

| Unit | The spec says | The implementation | Conclusion |
|---|---|---|---|
| REQ-001/AC-02 | "A ZIP of the same stapled `.app`, named consistently with the DMG, for the in-app updater (ADR-0032), together with the update metadata the updater reads for the release's channel. The ZIP holds exactly the one `.app`, and that `.app` passes the same signature and stapled-ticket checks as the one in the DMG." | `Agentshed-<version>-mac-arm64.zip` from the same builder call; `latest-mac.yml`, the name a GitHub feed's updater reads for every channel (a pre-release installation asks for `beta-mac.yml` first, then falls back to it: policy §3); exactly one `.app` and the DMG's checks, in the asset's gate and in the independent check of the run's artifact | Met |
| CON-001 | "Each packaging is a single electron-builder call that builds and signs the `.app`, the DMG and the ZIP … The asset files are copied unmodified …, and their tests run in the project's verification gateway." | one call (the asset); the copies `cmp`-identical to 070c4f2; their tests in `pnpm test:scripts` | Met |
| CON-002 | (rewritten in this change) the ZIP's boundary derived for that form; its gate is the asset's | the asset's ZIP gate, used in the run | Met |
| Failure B4 | "The ZIP's `.app` lacks its ticket or signature: the release fails like a DMG failure" | the release profile checks the ZIP's app's signature and stapled ticket and fails the packaging otherwise (the asset's tests) | Met |

Scope added beyond the spec's text, each now in it: the declared provider (Implementation Decisions, "The release
feed is declared for packaging"); the publish step refusing an artifact without its update files and R2 staying
DMG-only ("What the release carries"); the copies linted again (the packaging asset's bullet). No implementation
departs from the spec.

Not a postmortem: the worktree packaging that wrote no metadata was found by this ticket's own real packaging before
anything shipped; the cause and the defence are in the spec and the code review (O1 carries the asset's side).

## A comment edit after the final gateway (2026-10-19)

Reading the staged diff before the commit, the corrected `electron-builder.yml` comment on provider detection still
left out the CI variables the code review had named (`app-builder-lib/out/util/repositoryInfo.js` of 26.17.0, the
copy electron-builder resolves: `repository`, then `TRAVIS_REPO_SLUG`/`APPVEYOR_REPO_NAME`, then the CircleCI pair,
then `.git/config`). The comment now names them. The gateway result stands, by its three conditions:

1. Same tree: the file before and after, parsed with the parser electron-builder uses (the asset's `yamlParser`),
   `assert.deepStrictEqual` → equal (control: a changed `publish.owner` is reported unequal); and of the diff's
   changed lines, 0 are not comments.
2. No reader of the text: every reader parses it — `rg -n "readFileSync|readFile\(" build/mac-packaging.test.cjs | rg
   electron-builder` → no output (exit 1); the asset reads it through `yamlParser().load` (its line 637), the
   update-source unit the same way; the other mentions (`clean-old-releases.cjs`, `check-fuses.mjs`) are comments
   and messages. YAML has no docstrings or doctests.
3. `pnpm lint` → exit 0.
