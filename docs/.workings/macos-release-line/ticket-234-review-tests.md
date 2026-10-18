# Test review — ticket #234

Ticket: [#234 Release by pushing a tag](https://github.com/aloong-planet/agentshed/issues/234)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

## Design review

- Date: 2026-10-18
- Version: implementation starts from 26b9216 (`main`), branch `feat/release-workflow`; no test written yet
- Scope: the tests planned for the release workflow (`.github/workflows/release.yml`), the tag check
  (`scripts/release-tag.mjs`) and the publish script (`scripts/publish-release.mjs`). The packaging asset's own 51
  tests are skillshed's and unchanged here; this ticket only runs them in CI as well.

### Test design table

Seams:

- **The workflow file**, parsed as YAML (the js-yaml electron-builder ships, through the asset's exported
  `yamlParser`), with every `if` and every expression-valued `env` evaluated by `@actions/expressions` —
  GitHub's own published parser and evaluator for Actions expressions, added as a dev dependency — against
  event contexts. A step's own `run` block is executed with `bash` where its behaviour is the script itself.
- **`checkReleaseTag(tag, packageVersion)`** and the CLI that reads `GITHUB_REF_NAME` and `package.json`.
- **`publishRelease({ dir, tag, prerelease, releases })`**, whose `releases` is the release store at the system
  boundary, injected as one named function per operation (`list`, `deleteDraft`, `createDraft`, `view`,
  `publish`; tdd's mocking.md: an SDK-style interface rather than a generic command runner, so the fake needs no
  branching on arguments). The fake is a small in-memory model of the repository's releases: each operation
  changes its state, and it records every state in which a release is public.
- **`ghReleases(repo, run)`**, the adapter that implements those operations with the GitHub CLI; `run` is the
  injected command runner. Its tests assert the `gh` arguments each operation sends — the contract with the CLI,
  at the system boundary — and how it reads `gh`'s output. Every flag it uses was checked to exist in
  `gh release create|edit|delete|list --help` (gh 2.97.0, 2026-10-18).
- **`main(argv, env, run)`**, the entry point, run in process: what it reads from the environment.

Event contexts (the fixture of the static test): `github.event_name`, `github.ref`, `github.ref_name`,
`inputs.verify`, `secrets.*`. Shapes from GitHub's documentation of the two triggers (`workflow_dispatch`:
`GITHUB_REF` is the branch or tag that received the dispatch; `push` of a tag: `refs/tags/<name>`), not from the
spec. The set: push of `v0.2.0`, `v1.0.0`, `v0.1.0-beta`, `v0.1.0-beta.2`, `v0.2.0-alpha.1`, `v0.2.0-rc.1`,
`v0.2.0-dev`; dispatch with `verify` true and false, each on a branch and on a tag ref; dispatch without inputs.

The artifact the publish rows read has the layout downloaded from the manual run 39125515039:
`<version>/<files>`, upload-artifact rooting it at `release/`, the part of the paths before the first wildcard.
The rows were first written over a flat directory — a shape imagined rather than seen, so it shared the
implementation's wrong premise and could not catch it (see the post-implementation check). The `gh` fake's
shapes come from real `gh` 2.97.0 output (`gh release list --json
tagName,isDraft,isLatest,isPrerelease,name` and `gh release view --json assets` on cli/cli, 2026-10-18): assets carry
`name`, `size`, `state` and `digest` (`sha256:<hex>`).

| # | Spec units | Seam | Input that drives the branch | Assertion object and where the expected value comes from | Fixture shape source | Expensive resources |
|---|---|---|---|---|---|---|
| S1 | REQ-002/AC-01, REQ-002/AC-02 (a pull request never runs them) | workflow file | the parsed `on` | `on` is exactly a push of `v*` tags and `workflow_dispatch` with the boolean `verify` (default false); no `pull_request`, no branch push. Expected: spec REQ-002, the owner's input name | the workflow | none |
| S2 | REQ-002/AC-01; US-002/AC-01, AC-02, AC-04, AC-05; Failure A2; CON-007 | workflow file + evaluator | every event context | the gate job's profile per context (release for every tag and for `verify: true`, local otherwise), and the one packaging step whose `if` holds, whose command is the matching profile's in `capabilities.toml` (read with a TOML parser). Expected: spec US-002, the capability declaration | GitHub's documented contexts | none |
| S3 | REQ-002/AC-02; US-002/AC-03, AC-04; Failure C4; REQ-003 (published only once the set passed its gates) | workflow file + evaluator | every event context | the publish job's `if` holds for the tag pushes only; it `needs` the gate job; its `if` calls no status function, so GitHub's implicit `success()` skips it after a failed or cancelled gate; only it may write contents (workflow default read). Expected: spec | as S2 | none |
| S4 | Failures A2, C5; US-002/AC-01, AC-02 | workflow file + evaluator | each tag | the publish job's `PRERELEASE` value: `false` for `v0.2.0`, `v1.0.0`; `true` for every suffix, `-beta.2` included. Expected: semver's pre-release (spec A2; app-update's Failure E1 names `0.1.0-beta.2`) | the tag list above | none |
| S5 | CON-003; Failure A4 | workflow file + evaluator + `bash` | `secrets` with each credential empty, absent or set | `HAS_CSC` and `HAS_APPLE` per case; the certificate requirement runs whenever `HAS_CSC` is false and comes before checkout, install, the tag check and packaging; its `run` exits non-zero and names `CSC_LINK`; the Apple requirement runs for the release profile without Apple credentials and not for the local profile, before packaging, and names the three variables; the steps after them call no status function, so a failed requirement stops them. Expected: spec A4, CON-003; policy §4, §5 | GitHub's secrets context (an unset secret reads as an empty string) | none |
| S6 | CON-006; CON-003; Failure E1 on the CI path | workflow file | a walk over every string in the parsed workflow | the set of places that read `secrets.` is exactly: the gate job's two booleans (comparisons only) and the env of the two packaging steps; the local step gets only `CSC_LINK` and `CSC_KEY_PASSWORD`, never Apple; no `run` block contains `${{`. Expected: policy §5, spec CON-006 | the workflow | none |
| S7 | Failure A1 | workflow file + evaluator | push and dispatch contexts | the tag check runs `node scripts/release-tag.mjs`, holds for pushes only, and comes before both packaging steps. Expected: spec A1 | as S2 | none |
| S8 | Failure B1 | workflow file | the gate job | `timeout-minutes` ≥ 2 × 30 + 15. Expected: spec B1 (2–30 minutes per submission, twice per release) | the workflow | none |
| S9 | REQ-001/AC-03; US-002/AC-03, AC-04, AC-05 | workflow file | the gate and publish jobs | after packaging, the DMGs and the notary logs are uploaded under one name with `if-no-files-found: error`; on failure the notary logs are uploaded too; the publish job downloads that name and passes its directory to the publish script. Expected: spec REQ-001/AC-03, US-002/AC-03 | the workflow | none |
| S10 | (owner's decision, 2026-10-18; no spec unit) | workflow file | every `uses:` | each is pinned to a full 40-hex commit. Expected: the owner's decision | the workflow | none |
| T1 | Failure A1 | `checkReleaseTag` | `v0.2.0` / `0.2.0`; `v0.1.0-beta.2` / `0.1.0-beta.2` | returns the version. Expected: spec A1 | — | none |
| T2 | Failure A1 | `checkReleaseTag` | `v0.1.1` / `0.1.0`; `0.1.0` / `0.1.0` (no `v`) | throws, naming the tag and the tag the package version needs. Expected: spec A1 | — | none |
| T3 | Failures A1, A2 (the `-` rule of S4) | `checkReleaseTag` | `v0.1.0+5` / `0.1.0+5`; `v0.1` / `0.1` | throws: build metadata, and a version that is not semver, are refused — S4 classifies by `-` alone, which is exact only for these tags | — | none |
| T4 | Failure A1 | CLI | a temporary directory with a `package.json`, `GITHUB_REF_NAME` matching, mismatching, unset | exit 0; exit 1 with both versions on stderr; exit 1 | — | none (one `node` process each) |
| P1 | US-002/AC-01; REQ-003 | `publishRelease` + release-store fake | formal tag, one DMG and its notary logs in the directory | the release ends public with exactly the DMG (name, size, digest), title `v0.2.0-release`, not a pre-release, Latest; every public state the fake recorded has the whole set; the body is the one-line note. Expected: spec REQ-003, REQ-005 (title), the owner's note decision | the fields of gh 2.97.0 output | none |
| P2 | US-002/AC-02; Failure C5 | as P1 | pre-release tag; the fake starts with a public formal release marked Latest | public, pre-release, title is the tag, not Latest; the formal release stays Latest. Expected: spec C5, REQ-005 | as P1 | none |
| P3 | Failure C3 | as P1 | a public release already exists for the tag | throws; the fake's state is unchanged (nothing created, nothing deleted). Expected: spec C3 | as P1 | none |
| P4 | Failure C3 | as P1 | two drafts for the tag and one for another tag | both drafts for the tag are gone, the other stays; the public release holds only this run's file. Expected: spec C3 | as P1 | none |
| P5 | REQ-003; Failure C3 | as P1 | the fake loses one of two uploads; separately, the create command fails after uploading one | throws; no public state was ever recorded. Expected: spec REQ-003 | as P1 | none |
| P6 | REQ-003 | as P1 | the fake stores a different digest for the upload | throws; nothing public. Expected: spec REQ-003 | as P1 | none |
| P7 | REQ-003 | `publishRelease` | the version's directory without a DMG; another version's directory; a DMG named for another version inside the right directory | throws before any release-store operation | the artifact's layout from run 39125515039 | none |
| P8 | US-002/AC-01 | as P1 | after publishing, the fake reports the formal release not Latest | throws (the run goes red where it can be seen). Expected: spec US-002/AC-01 | as P1 | none |
| P11 | Failure C3 | as P1 | the store answers the read-back after creating with a public release for the tag that another run published meanwhile, holding the same file name with other bytes | throws; the other release is left as it was, and this run makes nothing public. Expected: C3; added by the code review (finding R1) | as P1 | none |
| G1 | REQ-003 (the operations P1–P8 rely on) | `ghReleases` + recording `run` | each operation called once | the exact `gh` arguments: `release list --json tagName,isDraft,isLatest,isPrerelease --limit 1000`, `release delete <tag> --yes`, `release create <tag> <files…> --draft --verify-tag --title … --notes …` (plus `--prerelease` for a pre-release), `release view <tag> --json isDraft,isPrerelease,assets`, `release edit <tag> --draft=false --latest` or `--latest=false`; each with `-R <repo>`. Expected: the flags' meanings in `gh … --help`. Exemption from the "no call assertions" rule: these arguments are the contract with an external CLI | gh 2.97.0 help | none |
| G2 | REQ-003 | `ghReleases` + `run` returning real-shaped output | the JSON `gh release list` and `gh release view --json assets` print | `list` and `view` return the fields `publishRelease` reads (tag, draft, latest, pre-release; asset name, size, digest, state), unchanged. Expected: the real sample | gh 2.97.0 output on cli/cli | none |
| G3 | REQ-003 | `ghReleases` + failing `run` | `run` throws | the error propagates (no operation reports success after a failed command) | — | none |
| P9 | REQ-002/AC-02 (fail closed on an unknown classification) | `main` in process | `PRERELEASE` unset or not `true`/`false`; `GITHUB_REF_NAME` unset; no directory argument | throws, and `run` is never called | — | none |
| P10 | US-002/AC-01, AC-02; Failure C5 (the classification reaches `gh`) | `main` in process + scripted `run` answering in the order the steps run | `PRERELEASE=false` and `PRERELEASE=true` from the environment (strings, as the workflow passes them) | the `create` arguments carry `--prerelease` only for `true`, the `edit` arguments carry `--latest` for `false` and `--latest=false` for `true` — the string `'false'` must not be read as truthy. Expected: spec C5 | gh 2.97.0 output shapes | none |

### Dimensions

**Coverage.** Walked against the spec's Failure modes for #234's units (A1, A2, A4, B1, B3, C3, C4, C5) and the
user stories and requirements it owns:

- A1 → T1–T4, S7.
- A2 → S2, S4, with T3 holding up S4's rule.
- A4 → S5.
- B1 → S8, plus the verification run's durations (Evidence).
- B3 → the asset's gates (its own tests) reached only through the release profile, S2 and S3 (a failed gate job
  stops publish).
- C3 → P3–P6.
- C4 → S3.
- C5 → S4, P2.
- REQ-003's GitHub half → P1, P5–P7.
- CON-006 → S6, plus the run logs (Evidence).

Not reachable by a test, stated in the test files' headers with the condition that closes each:

- GitHub's own evaluation of these conditions: the reference evaluator is one implementation of the expression
  language, and the runner's is another. Closed for the dispatch contexts by the two manual runs; for tag events
  by the first pre-release tag (#239) and the first formal release.
- The real `gh` against GitHub: the first tag run.
- Apple: the verification run.

No fixture models an external data source the spec is blind to, except the `gh` output, which follows a real
sample.

**Case design.** No module of the project is replaced. The release-store fake stands for GitHub, and P1–P8 assert
the state it ends in and the public states it recorded, not call counts. The one place where order is the
requirement — nothing public before the whole set is verified — is asserted as a property of every recorded
public state, which holds whatever sequence produced it. G1 asserts arguments, under the exemption its row states
(the contract with an external CLI). Each case drives the branch its row names, by its own input.

Re-reviewed on 2026-10-18 after the publish rows changed seam (P1–P8 from a fake `gh` command runner to the
SDK-style release store; G1–G3 and the in-process P9 added): coverage unchanged (G1–G3 add the adapter that the
store hides); the argument assertions are confined to G1 with their exemption; no row loads an expensive resource.

Re-reviewed on 2026-10-18 for the added P10: it covers the one conversion the unit rows cannot see (the workflow
passes `PRERELEASE` as a string), drives it by the environment the workflow sets, and asserts the arguments `gh`
receives under G1's exemption; its scripted `run` answers by position in the sequence, with the same output shapes
as G2.

Re-reviewed on 2026-10-18 after the manual run showed the artifact's real layout (code review R2): every publish
row's fixture now has that layout, P7 gains the case of another version's directory, and P1–P11 drive the
version directory the job downloads. Coverage otherwise unchanged; no resource.

Re-reviewed on 2026-10-18 for P11, added by the code review's finding R1 (two runs for one tag overlapping): it
drives the read-back the finding is about through the store fake, by its answer, and asserts the outcome (the other
run's release untouched, nothing public from this run), not which check stops it. Written first with an assertion on
a new error message, it went red on the existing file check instead, which showed the escape R1 feared is already
refused; the row was rewritten to guard that refusal, and S11 (a `concurrency` setting) was dropped with the fix it
was to accompany. No resource loaded.

**False greens (by design).** Each of the three design-time checks below was checked against the table:

- Constant-true: every loop over contexts or tags first asserts its list is the non-empty set above. S6's walk
  asserts it visited the packaging steps' env, so an empty walk cannot pass.
- Tautology: expected values come from the spec, the capability file and GitHub's documentation, never
  recomputed from the workflow's own expressions. The fake computes upload digests the way GitHub does (sha256 of
  the bytes), separately from the script's own hashing; P6 proves a mismatch is caught.
- Stale path: the objects asserted are the live workflow file and the two scripts the workflow calls; S2 and S7
  read the commands from the workflow and check them against the capability file, so a renamed script fails.

**Resource reuse.** No resource takes a second to load. The workflow is parsed once per test file at module scope.
Each spawned `node` process (T4, P9) is the behaviour under test (the CLI wiring), so it is run per case. Nothing in
the repository's tests already shares a workflow parse.

Conclusion: the table is complete on every row, each dimension's check above found nothing open, and writing may
start.

## Post-implementation check

- Date: 2026-10-18
- Version: branch `feat/release-workflow` on 26b9216, uncommitted working tree; `pnpm verify` exit 0 on it, then
  `pnpm test:scripts` 83 of 83 after the code review added P11; updated for R2 at 1444b6b (on 75fa4a8), where the
  fixture took the downloaded layout and the mutation batch was run again
- Scope: the 32 cases written (`scripts/release-workflow.test.mjs` 12, `scripts/release-tag.test.mjs` 4,
  `scripts/publish-release.test.mjs` 16 including P5's two subtests), against the design table

### Coverage

Every row of the table has its case, with the seam, driving input, assertion object and expected-value source the
row names: S1–S10 in the workflow test (S5 as three cases: the certificate, Apple's credentials, and nothing running
after a failed requirement), T1–T4, P1–P11, G1–G3. S11 was dropped with the fix it was to accompany (code review,
R1); P11 replaced it. The gaps are stated in the headers of the workflow test and the publish test (GitHub's own
evaluator and the real `gh` and GitHub, with the runs that close each); the tag test's header points to where the
check's placement is asserted, and its one boundary, the CLI, is spawned. Nothing claimed covered is driven by an
input that cannot reach it: each case's label names the input that takes it there.

**Fixture shape (a finding, fixed).** The publish rows' artifact was a flat directory, a shape imagined rather than
seen — the "fixture from the same source as the spec" failure this dimension exists to catch, missed at design
time because the artifact did not exist yet. The manual run without the switch produced one; its layout
(`<version>/<files>`) differs, the script shared the wrong assumption, and every case was green over a layout the
publish job would never see (code review R2). The fixture now has the downloaded layout; with it every publish
case went red ("no DMG in <root>") before the fix and green after, and the fixed script published the real
downloaded artifact against a stand-in store.

### Case design

As designed. The release-store fake is asserted through its end state and its recorded public states; G1 and P10
assert `gh` arguments under the stated exemption (the contract with an external CLI). The workflow test finds steps
by their command (the packaging commands come from `capabilities.toml`) or by their name for the two requirement
steps, so renaming a step turns it red rather than letting it pass unread.

### False greens

Every case was red once during the cycles, but several were red for a reason other than the one the case is meant
to catch (no job or step existed yet), and P2, P5's second subtest, P10, G2, G3 and S10 were green on first run
because their behaviour came with an earlier slice. So each case's own failure mode was then produced by a
mutation and the case named was seen red. All 28 mutations are in
[evidence/ticket-234/mutations.txt](evidence/ticket-234/mutations.txt), with sha256 of the three mutated files
before and after the batch (identical); the whole batch was run again after the fix of R2, with M28 added:

- **Workflow**:
  - S2: a dispatch without the switch ran the release profile.
  - S3: publishing was reachable from a dispatch on a tag ref; `needs` was emptied; `always()` was added.
  - S4: the suffix was told by `-beta` alone.
  - S5: the password was dropped from the certificate boolean; the certificate requirement exited 0; it was
    moved after install; the team was dropped from Apple's boolean; Apple's requirement also held on the local
    tier; `always()` was added to the local packaging.
  - S6: the local packaging got an Apple credential; a run block interpolated.
  - S7: the tag check also ran on dispatches.
  - S8: the time limit was 60.
  - S9: the notary logs were not kept; publishing downloaded another artifact.
  - S10: an action was at a moving tag.
  - S1: a branch push trigger was added.
- **Scripts**:
  - T3: build metadata was accepted; a non-semver version was accepted.
  - P5: a failed create was swallowed.
  - P7: a DMG of another version was accepted; another version's directory was accepted (M28).
  - P9: the repository check was dropped.
  - P4: leftover drafts were kept.
  - P3: a published tag was replaced.
  - P8: the post-publish check was skipped.
  - P6 and P11: the digest check was disabled.
  - P2: Latest was always set; the pre-release title; the pre-release flag.
  - G2: `view` dropped the assets.
  - G3: a failed `gh` was swallowed.
  - P10: the classification was read with `Boolean()`.

Each mutation was checked three ways:

- **Reached**: the tool refuses a search that does not occur exactly once and checks that the replacement landed.
- **Attributed**: the expected case is among the failures. Where a second case also went red, it is because the
  mutation breaks its premise too, as M1 makes a local dispatch need Apple's credentials.
- **Restored**: the original bytes are written back in `finally` and compared, never through version control.

The S-cases rest on one evaluator. Its fidelity to GitHub's runner is the stated gap, closed by the dispatch runs
for their contexts. The `bash -e` runs of the two requirement blocks are the runner's default shell for a step
without `shell`.

### Resource reuse

No case loads a resource of a second or more. The whole `pnpm test:scripts` run, 83 cases including the asset's 51,
took 217 ms (`duration_ms` of the run; the three new files 99, 192 and 66 ms on their own); the workflow is parsed once at the test file's module scope; the spawned
processes (T4) are the CLI under test.

Conclusion: the tests match the table and each is shown able to fail on the failure it exists for. The gaps the
headers state are closed for the dispatch contexts by the two manual tiers (runs 39125515039 and 39140793605) and
open for the tag contexts until the first pre-release tag (#239) and the first formal release.
