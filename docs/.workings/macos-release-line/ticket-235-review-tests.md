# Test review — ticket #235

Ticket: [#235 Every release carries the update ZIP and its metadata](https://github.com/aloong-planet/agentshed/issues/235)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

## Design review

- Date: 2026-10-19
- Version: implementation starts from 2d9e374 (`origin/main`), branch `feat/update-zip`. Changed so far, no test
  yet: the packaging script re-copied from skillshed's 070c4f2, and `electron-builder.yml` (the zip target,
  `mac.artifactName`, `dmg.writeUpdateInfo: false`, the declared publish provider)
- Scope: every test this ticket plans: the publish step's, the mirror's, the static workflow test's, a check of
  the packaging configuration against the app's update feed, and the packaging asset's own tests, copied

What the fixtures are shaped on: a real `pnpm dist:mac:local` on this Mac with the changed configuration
(2026-10-19). Its version directory held `Agentshed-0.1.0-mac-arm64.dmg`, `Agentshed-0.1.0-mac-arm64.zip`,
`Agentshed-0.1.0-mac-arm64.zip.blockmap`, `latest-mac.yml` (listing the ZIP only, with its sha512 and size) and
`builder-debug.yml`; the release profile adds the two notary logs (the layout of run 39125515039). The first
packaging, before the provider was declared, wrote no `latest-mac.yml` at all: electron-builder detects the
provider only from a `.git` directory, and a worktree has a `.git` file.

### Test design table

Seams: **P** = the publish step against the model of the repository's releases (`fakeReleases`, the existing
stand-in at the system boundary); **M** = the mirror and pointer steps against the model bucket (existing);
**W** = the static workflow test on the parsed workflow (existing); **U** = a vitest unit on the main process's
update source; **A** = the packaging asset's tests with an injected command runner.

| Case | Spec items | Seam | Input that reaches the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource and provision |
|---|---|---|---|---|---|---|
| P1 a formal tag publishes the whole set (changed) | REQ-001/AC-02, REQ-003 | P | the artifact of a release packaging: DMG, ZIP, ZIP blockmap, `latest-mac.yml`, two notary logs | the release's assets are exactly the DMG, the ZIP, the blockmap and the metadata (literal names), in every state in which it was public (the existing `publicStates`, asserted non-empty) | the real packaging's file names | none |
| P2 an artifact missing an update file fails before the store is touched (new) | REQ-001/AC-02, Failure B3 | P | five artifacts: no `*-mac.yml`; two of them; no ZIP for a DMG; no blockmap for a ZIP; a ZIP of another version | each fails with its own message (literal), and the store (the existing untouchable Proxy) is never called | the real names, one file removed, doubled or renamed | none |
| P3 the other publish cases on the full set (fixtures changed) | REQ-003, Failures C3, C5 | P | the existing cases' inputs, with the full set of each version in place of DMGs alone | unchanged assertions; the upload-loss case names the file it lost (literal) | as P1 | none |
| M1 the mirror and the pointer ignore the update files (new) | app-update::CON-002, REQ-004/AC-01, AC-02 | M | an artifact holding the full set of a formal release | the bucket holds the DMG only and the pointer lists the DMG only (literal keys and entries) | as P1 | none |
| W1 the gate job keeps the update files (changed) | REQ-001/AC-02 | W | the workflow file | the kept upload's paths are the DMGs, the notary logs, the ZIPs, the blockmaps and the metadata (a literal list); the failure upload stays logs-only (unchanged) | the workflow itself | none |
| U1 the packaging publishes where the app reads (new) | app-update::CON-002 | U | `electron-builder.yml`, parsed with the YAML parser electron-builder itself uses (the asset's `yamlParser`) | its `publish` equals `UPDATE_FEED` (which the existing test holds to a literal) | the real configuration file | none |
| A the asset's tests, copied unmodified from 070c4f2 | CON-001, CON-002, Failure B4 | A | the asset's own cases, including every ZIP case `macos-signing.md` §9 lists | as written in skillshed; their design was reviewed there (skillshed's `docs/.workings/mac-packaging-zip/ticket-18-review-tests.md`) | the asset's own | none |

Increment in the post-implementation check (re-reviewed before the case was added): a mutation outside the design
— the stray check no longer catching blockmaps — survived, since P2's stray input is a ZIP only. P2 gains a sixth
artifact, a blockmap of another version, expected to fail with its own message (literal) before the store is
touched. Dimension 1: the same item (Failure B3, an extra artifact); dimension 3: red under exactly that mutation.

### Coverage

| Item | Covered by |
|---|---|
| REQ-001/AC-02 the ZIP with the metadata, exactly one `.app`, same checks | A (the asset's ZIP gate); P1, P2 (the release carries the set); W1 (the run keeps it); Evidence: the real local packaging, and the manual verification run |
| CON-001 the copies unmodified, their tests in the gateway | A in `pnpm test:scripts`; Evidence: `cmp` with skillshed's files |
| CON-002 the ZIP's gate comes from the asset | A; Evidence: the adopted version gates the ZIP (the real packaging, the verification run) |
| Failure B3 missing, duplicated or extra artifacts | A (the gate, before Apple); P2 (the publish step's own check, before GitHub) |
| Failure B4 the ZIP's app without its ticket or signature | A |
| Failures C3, C5, REQ-003 | P3 |
| REQ-004 and CON-004 (the mirror) | the existing mirror cases, plus M1 for the new files in the artifact |
| app-update::CON-002 | U1, M1 |
| Failure E1 local packaging (regression) | Evidence: the real `pnpm dist:mac:local` |

Gap, stated in the test file headers that change: no test reaches GitHub, Apple or a real upload-artifact; the
manual verification run exercises the upload and the gate with Apple, and the first tag the publishing.

Conclusion: no missing item. The fixtures follow a real packaging's output, not the spec.

### Case design

- No module mocks or spies on the project's code; the release store and the bucket are the existing stand-ins at
  the system boundary.
- U1 reads the configuration file because the configuration is the subject: it is what electron-builder reads.
- P2 asserts that the store is never called, through the existing untouchable Proxy.

Conclusion: no finding.

### False greens (judged from the design)

- Always-true: P1 asserts the public states are non-empty before checking each; P2 asserts one message per
  artifact.
- Tautology: every expectation is a literal name, key or message; U1 compares the configuration with the
  constant the existing test holds to a literal.
- Old paths: the existing publish cases switch to the full set, so they keep running the path a real artifact
  takes; with DMG-only fixtures they would test an artifact the workflow no longer produces.
- After implementation: every case not red first gets a mutation that reaches the code under test.

Conclusion: no finding.

### Resource reuse

| Expensive resource | Loaded or built how often | Provided by |
|---|---|---|
| none: temporary directories of a few small files, created per case | — | each case, as the existing tests do |

Conclusion: no finding.

## Post-implementation check

- Date: 2026-10-19
- Version: branch `feat/update-zip`, commit b51002e plus uncommitted corrections to five comments (code review) and
  P2's sixth case (below). `pnpm verify` exited 0 on b51002e with the comment corrections; after the sixth case the
  publish tests pass (17), and the gateway on the final tree exited 0 again (`evidence/ticket-235/full-verification.txt`)
- Scope: every case of the design table as written, the copied asset tests, and the evidence runs

### Written tests against the test design table

| Row | Cases written | Against the table |
|---|---|---|
| P1 | 1: the whole set published, in every public state | Consistent |
| P2 | 6: no metadata, two metadata files, no ZIP, no blockmap, a ZIP of another version, a blockmap of another version | Consistent once the sixth was added (increment above) |
| P3 | the 8 existing publish cases on the full set; the upload-loss case now names the metadata as the file lost (the last sent) | Consistent |
| M1 | 1: only the DMG on R2 and in the pointer | Consistent |
| W1 | 1: the kept upload's five paths, the failure upload unchanged | Consistent |
| U1 | 1: `publish` equals `UPDATE_FEED` | Consistent |
| A | the asset's 86 cases, `cmp`-identical to 070c4f2 | Consistent |

The fixtures follow the real packaging's names, and the verification run 39216743638's artifact holds exactly those
six files (`evidence/ticket-235/verification-run.txt`), so the shape the publish and mirror cases assume is the one the
workflow produces. The gaps the changed files' headers state still hold: no case reaches GitHub (the first tag push
does) or R2 (the first formal release).

Conclusion: one case added, recorded as an increment before it was written; otherwise as designed.

### Coverage

| Item | Covered by |
|---|---|
| REQ-001/AC-02 | A (the ZIP gate); P1, P2, W1; Evidence: the verification run (gate lines: the ZIP's app stapled, "latest-mac.yml matches"), and the independent check of its artifact (the ZIP's app: stapled, signed, accepted; the metadata's sha512 and size equal the ZIP's) |
| CON-001 | A in `pnpm test:scripts`; `cmp` with skillshed |
| CON-002 | A; Evidence: the run's gate used the adopted asset's ZIP gate |
| Failure B3 | A; P2 (six artifacts) |
| Failure B4 | A |
| Failures C3, C5, REQ-003 | P3 |
| REQ-004, CON-004, app-update::CON-002 | M1, U1; the existing mirror cases |
| Failure E1 | Evidence: two real local packagings |

Not covered here: the publish step's real run against GitHub with the update files, first on the first tag push (the
pre-release v0.1.0-beta, #239); the updater installing from a published ZIP, once two releases exist (#240).

Conclusion: no missing item.

### Case design

As designed: no mock or spy on the project's code (the release store and the bucket are the boundary stand-ins), U1
reads the configuration as its subject, P2 asserts through the untouchable store.

Conclusion: no finding.

### False greens

- Red first, and red for the reason the case exists: W1 (the kept paths lacked the three update globs), P1 (only the
  DMG published), P2's first case (an artifact without metadata reached the store).
- Mutations (`evidence/ticket-235/mutations.txt`), each turning red exactly the case it names (for P2, the case label
  in the assertion's message), the file restored byte for byte, the worktree's status unchanged; a control stayed
  green: B1 (M1: the mirror taking ZIPs), B2 (U1: another owner), B3–B7 (P2's first five cases, one check removed each),
  B8 (P1: the update files not published), B9 (W1: the metadata not kept), B10 (P3: a lost upload not noticed).
- Beyond the design (the memory "mutations from the design table only prove the wiring"): B12, the stray check no
  longer catching blockmaps, survived; P2 gained the case that catches it, and under B12 exactly that case is red.
- P3's eight cases guard code #235 did not change (the draft, digest, Latest and re-run logic); their proof is #234's
  mutations of that code (`evidence/ticket-234/mutations.txt`), and their fixtures now take the path a real artifact
  takes.
- The process boundary: the upload is measured by the real run (the artifact holds the five kinds of file); the
  publish step's process wiring is unchanged and stays the gap above.
- U1 compares the configuration with `UPDATE_FEED`, which the existing case holds to a literal: not a tautology, and
  B2 turns it red.

Conclusion: one survivor found (B12) and closed; no false green left that is known.

### Resource reuse

No expensive resource: the cases write a few small files into temporary directories, and nothing loads or builds
anything that takes a second or more. Nothing to count.

Conclusion: no finding.
