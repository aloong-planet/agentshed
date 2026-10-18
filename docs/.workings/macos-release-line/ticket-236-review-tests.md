# Test review — ticket #236

Ticket: [#236 Mirror formal releases to R2 behind the download host](https://github.com/aloong-planet/agentshed/issues/236)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

## Design review

- Date: 2026-10-19
- Version: implementation starts from 0a5ad4d (`main`), branch `feat/r2-mirror`; no test written yet
- Scope: the tests planned for the mirror and pointer jobs of `.github/workflows/release.yml` (extending
  `scripts/release-workflow.test.mjs`), and for `scripts/mirror-release.mjs`

### Test design table

Seams:

- **The workflow file**, as in #234: parsed with the asset's YAML loader, conditions and expression-valued `env`
  evaluated with `@actions/expressions` against the documented event contexts, the requirement step's `run` block
  executed with `bash -e`. The contexts and helpers already in the test file are reused.
- **`mirrorRelease({ dir, tag, bucket })`** and **`pointRelease({ dir, tag, host, bucket, probe, sleep })`**. The
  bucket is the object store at the system boundary, one named function per operation (`put` a file, `putText` the
  pointer). The probe is the HTTP read of a public URL (status, size, sha256). Both are in-memory fakes over one
  model: objects by key, and the probe answering from that model by mapping the download host's URL to a key. The
  model records the objects present at the moment the pointer is written. `sleep` is injected, so retries cost no
  time.
- **`awsBucket({ bucket, endpoint, run })`**, the adapter that runs `aws s3 cp`. Its arguments are asserted (the
  contract with an external CLI, the exemption #234's G1 used).
- **`httpProbe()`**, the adapter that GETs a URL with `fetch` and hashes the body, run against a real HTTP server on
  localhost started once per file.
- **`main(argv, env, deps)`**, in process, for what it reads from the environment.

Fixture shapes:

- The artifact: the layout downloaded from run 39140793605 (`<version>/<files>`: the DMG and two notary logs).
- The pointer: Transfer's live `latest.json` (`{ version, releasedAt, files: [{ name, size, os, arch }] }`, read on
  2026-10-18), narrowed to what this pointer needs and extended by `url` (REQ-004/AC-02).
- `aws s3 cp`'s flags: from Transfer's sync job, whose uploads R2 serves with those headers today.

| # | Spec units | Seam | Input that drives the branch | Assertion object and where the expected value comes from | Fixture shape source | Expensive resources |
|---|---|---|---|---|---|---|
| W1 | REQ-002/AC-02 (mirror), REQ-002/AC-03, CON-004, Failure C5 | workflow + evaluator | every event context of #234's test (formal tags, pre-release tags, dispatches) | the `mirror` and `pointer` jobs' `if` holds for the formal tag pushes and for nothing else. Expected: spec REQ-002/AC-03, CON-004 | GitHub's documented contexts | none |
| W2 | REQ-002/AC-03; REQ-003 (order); US-002/AC-01; Failure C1 | workflow + evaluator | the jobs' `needs` and `if` | `mirror` needs `gate` and `publish`; `pointer` needs `gate` and `mirror`; neither `if` calls a status function, so a failed upstream job skips them. Expected: spec | the workflow | none |
| W3 | CON-003 (R2) | workflow + evaluator + `bash` | the secrets context with each R2 secret empty or absent | `HAS_R2` per case; in each job the R2 requirement runs whenever it is false, before checkout and download; its `run` exits non-zero and names the four secrets. Expected: spec CON-003 | as #234 S5 | none |
| W4 | CON-006 | workflow | the walk over every string (#234's S6) | the places reading `secrets.` are exactly #234's plus the two R2 booleans and the env of the upload step and of the pointer step, each env variable holding the one secret it is named for (`AWS_ACCESS_KEY_ID` ← `R2_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` ← `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`). Expected: policy §5 | the workflow | none |
| W5 | REQ-004/AC-01, AC-02 (the host); REQ-003 | workflow | the two jobs' steps | each downloads `agentshed-macos` and runs `node scripts/mirror-release.mjs upload\|pointer <that path>`; `DOWNLOAD_HOST` is `https://dl.agentshed.aloongplanet.com`. Expected: spec REQ-004, the certificate check | the workflow | none |
| M1 | REQ-004/AC-01 | `mirrorRelease` + bucket model | a formal tag, the downloaded layout | the model holds each DMG at `releases/v0.2.0/<name>` with `public, max-age=31536000, immutable` and `application/x-apple-diskimage`, and no `latest.json`. Expected: spec, Transfer's headers | the artifact layout | none |
| M2 | REQ-004/AC-02; REQ-003 | `pointRelease` + model + probe | every file present with its bytes | `latest.json` is the literal `{ version, files: [{ name, arch, size, url }] }` for the version, with `public, max-age=300` and `application/json`; at the moment it was written every file was present. Expected: spec REQ-004/AC-02, a hand-written literal | Transfer's pointer | none |
| M3 | Failure C2; REQ-003 | as M2 | one file absent from the model (the probe answers 404 on every attempt) | throws naming the URL; no `latest.json`. Expected: spec C2 | as M2 | none |
| M4 | Failure C2 | as M2 | one file present with other bytes | throws (size or sha256 differs); no `latest.json` | as M2 | none |
| M5 | (robustness of M3) | as M2 | the probe answers 404 once, then the bytes | the pointer is written after a retry, with no real wait (injected `sleep` called) | as M2 | none |
| M6 | CON-004 | `mirrorRelease`, `pointRelease` | a pre-release tag | both throw before any bucket or probe operation. Expected: spec CON-004 | — | none |
| M7 | Failure C1 | `mirrorRelease` + model | `put` fails on the second of two files | the error propagates (the job fails, so the pointer job never runs) | as M1 | none |
| A1 | REQ-004/AC-01 | `awsBucket` + recording `run` | `put` and `putText` | `aws s3 cp <file> s3://<bucket>/<key> --endpoint-url https://<account>.r2.cloudflarestorage.com --cache-control … --content-type … --only-show-errors`; `putText` uploads a file holding exactly the text. Expected: Transfer's flags, aws-cli's | Transfer's sync job | none |
| A2 | Failure C2 | `httpProbe` + localhost server | a 200 with bytes, a 404, a refused connection | status, size and sha256 of the bytes; status 404; a thrown error. Expected: the server's own bytes, hashed independently | — | one server, started once for the file (milliseconds) |
| E1 | CON-003 | `main` | `R2_BUCKET`, `R2_ACCOUNT_ID`, `DOWNLOAD_HOST` or `GITHUB_REF_NAME` unset; an unknown subcommand | throws naming what is missing, before any command | — | none |
| E2 | REQ-004/AC-01, AC-02 (the wiring the first formal release runs first) | `main` + recording `run` + model probe | `upload` then `pointer` with the workflow's environment | `aws s3 cp` goes to `s3://<R2_BUCKET>/…` on `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`; the pointer's URLs are under `DOWNLOAD_HOST`. Expected: the environment the workflow sets | the artifact layout | none |

### Dimensions

**Coverage.** Walked against the spec for #236's units:

- US-002/AC-01 (mirror and pointer): W2, M1, M2.
- REQ-002/AC-02 and AC-03: W1, W2.
- REQ-003 (the pointer half): W2, M2–M5.
- REQ-004/AC-01: M1, A1, W5.
- REQ-004/AC-02: M2, W5.
- REQ-004/AC-03: Evidence, the CORS measurement in evidence/ticket-236/cors.txt.
- CON-003: W3, E1.
- CON-004: W1, M6.
- CON-006: W4, and the workflow review.
- Failure C1: W2, M7.
- Failure C2: M3, M4, A2.
- Failure C3: the mirror half rests on #234's publish refusal plus W2 — a re-run of the whole workflow is refused at publish, so the mirror never receives a second build; a re-run of the failed jobs reuses the same artifact.
- Failure C5: W1.

Not reachable by a test, stated in the headers: R2 itself and the runner's aws-cli. The mirror and pointer jobs run
only on a formal tag, so no manual run can exercise them. Waiting, with the trigger the first formal release.

**Case design.** No project module is replaced. The bucket and the probe are the external boundary, as named
operations over one model, asserted through its state. A1's argument assertion carries the exemption stated in
#234's review.

**False greens (by design).**

- Constant-true: every loop over contexts or files first asserts its set is non-empty.
- Tautology: the pointer's expected value is a hand-written literal; the probe's sha256 in A2 is computed from the
  served bytes independently of the adapter.
- Stale path: the workflow's own commands and host are read from the file. No dead path is asserted.

**Resource reuse.** One localhost server per test file (A2), started in a `before` hook. Nothing else takes measurable
time.

Conclusion: every row is complete; writing may start.

Re-reviewed on 2026-10-19 for the added E2: the entry point's wiring runs for real only at the first formal
release, so it is driven here through the environment the workflow sets, with the aws-cli arguments asserted under
A1's exemption and the probe answering from the bucket model. No resource.

## Post-implementation check

- Date: 2026-10-19
- Version: branch `feat/r2-mirror` on 0a5ad4d, uncommitted working tree; `pnpm test:scripts` 98 of 98
- Scope: the 11 cases of `scripts/mirror-release.test.mjs` and the 5 added to `scripts/release-workflow.test.mjs`
  (now 16, with #234's credentials case extended), against the design table; the publish step's 16 cases, re-run
  after its artifact reading moved to `scripts/lib/release-artifact.mjs`

### Coverage

Every row has its case with the seam, input, assertion object and expected-value source it names:

- W1–W5: the five added workflow cases, W4 as #234's credentials case extended.
- M1–M7 and A1, A2, E1, E2: the eleven mirror cases.

The headers state the gap: R2, the host and the runner's aws-cli, first run at the first formal release. The
publish step's cases still pass unchanged after the move to the shared reading, so the move changed no behaviour
they observe.

### Case design

As designed. The bucket model and the probe answer from one state, and M2 asserts that state at the moment the
pointer was written. A1 and E2 assert aws-cli's arguments under the stated exemption. A2 runs against a real
server on localhost. W4 maps each R2 step's variable to its secret explicitly, since the variable names differ
from the secrets'.

### False greens

- **Red for the case's own reason, during the cycles:** M1–M6, A1 (after the call count was asserted first, so
  the first red was the assertion, not a TypeError), A2, E1, E2.
- **Red only for a missing job or step:** W1–W5. M7 was green on first run, since nothing caught errors.
- **So every case's own failure mode was then produced by a mutation** — 22 mutations, all caught by the expected
  case, in [evidence/ticket-236/mutations.txt](evidence/ticket-236/mutations.txt), with sha256 of the two
  mutated files before and after (identical):
  - **Workflow:**
    - W1: the mirror ran for pre-releases; the pointer ran on a dispatch on a tag.
    - W2: the mirror did not wait for publishing; the pointer did not wait for the mirror; `always()` was added.
    - W3: the R2 boolean ignored the bucket; the requirement exited 0.
    - W4: a variable held another secret; publishing read an R2 secret.
    - W5: the fallback host was used; the pointer job uploaded instead.
  - **Mirror script:**
    - M1: the DMGs were cached briefly.
    - M2: the URLs lost the host.
    - M3: an unserved file was accepted.
    - M4: the sha256 was not compared.
    - M5: there was no retry.
    - M6: pre-releases were mirrored.
    - M7: a failed upload was swallowed.
    - A1: the region was dropped.
    - A2: only one chunk was counted in the size.
    - E1: the host was not required.
    - E2: the endpoint lost the account.
- **Each mutation checked three ways:**
  - Reached: one exact occurrence, or for the text both R2 jobs share, the first occurrence through a whole-file
    transform.
  - Attributed: the expected case is among the failures; where others also failed, the mutation breaks their
    premise too (M2's host feeds the probe of M3–M5 and E2).
  - Restored: the bytes are written back in `finally` and compared.

### Resource reuse

The mirror file runs in 123 ms (its localhost server is started inside the one case that uses it), the workflow
file in 121 ms, the publish file in 78 ms. Nothing is loaded twice.

Conclusion: the tests match the table, and each is shown able to fail on the failure it exists for. Open: the
first formal release.
