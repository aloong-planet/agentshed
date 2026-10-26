# Test review — #253

Ticket: [#253](https://github.com/aloong-planet/agentshed/issues/253) (the GitHub Actions in the three workflows, at their
current majors and pinned to full commits). Task list: [ticket-253-tasks.md](ticket-253-tasks.md).

## Design review (2026-10-26, implementation starts from 9685ccf)

Scope: the tests this change adds or changes — a new static test of every workflow file, and the removal of the
release workflow test's own pinning case, which the new test replaces. No spec unit asks for these: they hold #253's
first acceptance item ("Every action in the three workflows is at its current major and pinned to a full commit, with
its version in a comment"; Test: a static test of every workflow file) and the owner's decision D1 of 2026-10-26.
Mutation testing: by the project capability declaration, mutation-testing is not enabled, so it is skipped; each test's
"when does it go red" is answered below. The new test is also a check CI runs on every pull request (`pnpm
test:scripts`); as a new gate it must be seen red once (false-greens form four), which the slice does by running it on
`main`'s workflows before changing them.

### Test design table

| # | Test | Spec item | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| W1 | static, new (`scripts/workflow-actions.test.mjs`): every action in every workflow file is pinned to a full commit | #253's first item; D1 | the workflow files as GitHub reads them: every `*.yml` and `*.yaml` in `.github/workflows/`, listed from the directory, parsed with the YAML parser the release workflow test already uses (electron-builder's js-yaml through `build/mac-packaging.cjs`) | the real files. Red input: any `uses` not of the form `owner/repo@<40 hex digits>` — on `main`, `ci.yml`'s and `message-language.yml`'s `@v4` tags | every `uses` value, at any depth of the parsed file, matches `^[\w.-]+/[\w.-]+@[0-9a-f]{40}$` (the rule's own form, as the case it replaces wrote it); the directory lists at least the three workflows by name (literals), and every file has at least one `uses`, so no loop runs empty | the repository's own workflow files: the real data, no copy | none: three small files read once per run |
| W2 | static, new: each action's line carries its version in a comment, and the comments cover every action | #253's first item ("with its version in a comment"); D1 | the raw text of the same files: a YAML parser drops comments, so the comment is read from the line | the real files. Red inputs: a `uses:` line without a trailing `# v<major>.<minor>.<patch>` (on `main`, every line of `ci.yml` and `message-language.yml`); a `uses` the line scan cannot see (written in flow style), which makes the two lists differ | per file, the `uses` values read from lines of the form `uses: <value> # v<x.y.z>` equal, in order, the `uses` values of the parsed file (W1's list); expected value: the parsed file itself, read independently of the line scan | as W1 | none |
| W3 | static, new: an action is at one commit and one version in every workflow | #253's first item, as a regression guard: a later upgrade of one workflow that leaves another behind (the ticket's first draft left `message-language.yml` out) | as W1 and W2 | the real files. Red input: one action at two commits or under two version comments — on `main`, `actions/checkout` at `@v4` in `ci.yml` and at `11d5960…` in `release.yml` | for each `owner/repo`, the refs after `@` in the parsed files (W1's lists) form a set of exactly one member; and for each pinned value, the release comments on its lines (W2's scan) form a set of one. Together, one `(commit, version)` pair per action wherever W2 holds. The expected value is the rule (one member), not computed from the files | as W1 | none |
| R1 | static, removed: `release-workflow.test.mjs`'s "every action is pinned to a full commit" | the same rule for `release.yml` alone (the owner's decision of 2026-10-18) | — | — | replaced by W1, whose directory listing includes `release.yml` and whose pattern is the same; its reason (the gate job's certificate and Apple credentials, the publish job's write access) moves to the new file's header | — | — |

Incremental review of W3 (2026-10-26, while writing it): the row first read one set of `(commit, version)` pairs from
the comment lines alone. On `main` that scan sees no line of `ci.yml`, so the case would go red at its guard, not at the
two-commit check the row names. The row now reads the refs from the parsed files, which every `uses` reaches, and the
release comments only for its second set. Its input, expected value, fixture and resource are otherwise unchanged; the
checks below hold for it as stated.

### Coverage

No spec "Failure modes and boundaries" item is in scope: the change touches no product behaviour and no release
workflow condition. The rule's boundaries, enumerated from what a workflow file can hold:

| Boundary | Row |
|---|---|
| a new workflow file, of either extension | W1 (the directory listing, not a list of names) |
| an action at a tag or a branch | W1 |
| an action at a short commit | W1 (exactly 40 hex digits) |
| a pinned action without its version comment | W2 |
| a `uses` the line scan cannot see (flow style, a line break after `uses:`) | W2 (the two lists differ) |
| a job-level `uses` (a reusable workflow) | W1 and W2 read every `uses` at any depth; none exists today |
| two workflows at different commits or versions of one action | W3 |
| a version comment that names a release other than the commit's | Gap: no offline check can tell which release a commit is. Held by the evidence of this change (each target tag resolved to its commit, `evidence/ticket-253/actions-and-targets.txt`) and, later, by whoever updates a pin; stated in the test file's header |
| "at its current major" | Gap of the same kind: the current major is a fact about GitHub on a date, not about the repository. Held by this change's evidence; W3 only keeps every workflow on the same release |

A local action (`./path`) or a `docker://` image is not used anywhere; W1 would refuse one, so whoever adds one adds its
form to the rule deliberately.

Fixtures: the workflow files are the repository's own, so the test reads real data, not a shape written from the rule.

### Case design

Each case reads the files from disk, assumes nothing from another case, and runs in milliseconds. The cases read
through the files the runner itself reads, with no stand-in, no module replaced and no internal state written.

### False greens (design-level)

| Form | Check |
|---|---|
| Constant truth | W1's loop is guarded: the three workflow names are asserted present and each file has at least one `uses`; W2's equality has W1's non-empty list on one side; W3 asserts at least one action is shared by two files (checkout is in all three), so the "one pair" check is not decided by files that share nothing |
| Tautology | W1's pattern is the rule, written as a literal; W2's expected list comes from the YAML parser, an independent reading of the same text; W3's expectation is a constant (one pair) |
| Stale path | the files read are the ones GitHub runs (`.github/workflows/`); the parser is the one the release workflow test already trusts for the same files |
| When does each go red | W1: any action at a tag, a branch or a short commit, in any workflow, including a new one. W2: a pinned action without its comment, or a `uses` the line scan misses. W3: one action at two commits or versions. All three go red on `main`'s files, each for its own reason (the slice runs them there before changing the workflows) |

### Resource reuse

No expensive resource: the files are a few kilobytes and the parser loads in milliseconds. Existing shared setup
searched (`rg -n "yamlParser|workflows" scripts build --glob '*.test.*'`): the release workflow test loads the same
parser through `build/mac-packaging.cjs`; the new file loads it the same way, so no second YAML parser enters the
repository.

### Findings

None.

### Incremental review — S3, the site tests' build on the site's filesystem (2026-10-26, before changing it; implementation starts from f340555)

The owner's decision D5 (`ticket-253-tasks.md`) folds into this change the fix for CI's red at `pnpm test:site` on
ubuntu-26.04. It changes the site tests' shared set-up, so the row is reviewed here before the change.

| # | Test | Spec item | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| S3 | the site tests' global setup, changed (`site/test/build-site.ts`): it builds the site into a new directory under the site's own `node_modules/.cache/` instead of the operating system's temporary directory | landing-page Testing Decisions (the built-site check "reads a fresh build made for the run, never a previous one"); D5 | Vitest's global setup, one build per run provided to the tests as `builtSite` (unchanged) | a temporary directory on another filesystem than the site: CI's ubuntu-26.04 runner; locally, `TMPDIR` on a mounted disk image | the site's existing tests (7 files, 107 tests) run and pass with that `TMPDIR`; before the fix the same run fails with EXDEV and runs no test (`evidence/ticket-253/exdev-repro.txt`). Expected values: the tests' own, unchanged | the site's own sources | the site build, a few seconds: once per run in the global setup, as before; its directory removed when the run ends |

Coverage: the boundary is where the temporary directory lies — on the site's filesystem (this Mac's default) or on
another (CI's ubuntu-26.04; the mounted image). Both are run. A local run with the default `TMPDIR` cannot catch a
revert to the temporary directory; CI's `pnpm test:site` on ubuntu-26.04 does, at the real seam, and the mounted-image
run does on demand. No new case: an assertion that the output lies under the site's root would hold the set-up's
choice, not the failure, and a revert that kept the build on one filesystem would be harmless.

Case design: the cases are unchanged and read the build through `builtSite`, as before.

False greens: the red's form is a run that tests nothing and exits 1 ("No test files found" after the set-up's
EXDEV), so it cannot pass silently. After the fix, the run's count must read 107 tests, not merely exit 0.

Resource reuse: one build per run, unchanged. A run killed before its teardown leaves its directory under
`site/node_modules/.cache/`, which git and the repository's gates ignore (`git check-ignore -v`: `.gitignore:1`
`node_modules/`); the next run makes a new one.

Findings: none.

## Post-implementation check (2026-10-26, #253, implementation 9685ccf..008b71f; the code checked is 2e9d247's)

Scope: the tests this change writes or changes — `scripts/workflow-actions.test.mjs` (W1–W3, new, blob 902295e) and
the removal of `scripts/release-workflow.test.mjs`'s pinning case (R1). `git diff --stat 2e9d247..008b71f` lists only
the gateway log, so the code at the range's end is 2e9d247's. First round: no fix range was handed over, so nothing is
carried from an earlier round.

Run evidence:

- **Full run**: the handed-over log, [gateway-2e9d247.txt](evidence/ticket-253/gateway-2e9d247.txt), checked against
  the full verification gateway's log requirements. Version: `git rev-parse HEAD` 2e9d247, and `git status --porcelain
  --untracked-files=all` empty, so no file needs a hash; the log was written outside the worktree and copied in by
  008b71f. Commands: every step of `pnpm verify` (typecheck, lint, test, test:scripts, test:site, check:ui,
  check:lang, check:i18n, check:nul, e2e, smoke), then actionlint on `.github/workflows/*.yml`. Exit codes: all 0,
  `VERIFY_EXIT=0`, each taken without a pipe — the script that wrote the log (`gateway.sh` in the main agent's scratch
  directory, whose output file is byte-identical to the committed log) runs each step as
  `pnpm "$step" >> "$LOG" 2>&1` and reads `code=$?` on the next line. Output: complete for each command. lint and e2e:
  the capability declaration enables both, and the log runs their `enforced-by` (`pnpm lint`, `pnpm e2e`). The version
  matches the handed-over range. No gap.
- **Runs of the tests under review only** (no full run):
  1. `node --test scripts/workflow-actions.test.mjs` in the worktree at 008b71f, clean tree: 3 pass, exit 0.
  2. The committed file against `main`'s workflows, since [red-first.txt](evidence/ticket-253/red-first.txt) ran an
     earlier version of it (its stack lines are 37/41, 45/48 and 63/67; the committed file's are 38/42, 46/49 and
     64/68), and the targeted run's blob (b7502ac) is not the committed one either. Set-up: a scratch directory holding
     `git archive 9685ccf .github/workflows build/mac-packaging.cjs` (workflow blobs 8d15b66, 26b6ee8 and 6485482,
     each equal to `git rev-parse 9685ccf:<path>`; `build/mac-packaging.cjs` byte-identical to the worktree's), the
     committed test file copied in, and the worktree's `node_modules` linked. Nothing in the worktree changed. Node
     v24.19.0. Output, abridged; exit 1:

     ```
     test at scripts/workflow-actions.test.mjs:38:1   (W1)
       AssertionError: ci.yml   at :42:38   actual: 'actions/checkout@v4'   operator: 'match'
     test at scripts/workflow-actions.test.mjs:46:1   (W2)
       AssertionError: ci.yml   at :49:12   actual: []   expected: the seven parsed values of ci.yml   operator: 'deepStrictEqual'
     test at scripts/workflow-actions.test.mjs:64:1   (W3)
       AssertionError: actions/checkout: {"v4":["ci.yml","message-language.yml"],
         "11d5960a326750d5838078e36cf38b85af677262":["release.yml"]}   2 !== 1   at :68:47
     ```

     Each case goes red at its own assertion. The `@v4` values show the run read the scratch copy: the worktree's
     workflows hold no tag.

### Test design table, against the written tests

| # | Seam | Driving input | Assertion and expected-value source | Fixture | Resource | Result |
|---|---|---|---|---|---|---|
| W1 | `readdirSync` of `.github/workflows/`, filtered by `/\.ya?ml$/`, each file parsed by `yamlParser()` from `build/mac-packaging.cjs` (lines 18–27); `uses` is every string whose key path ends in `.uses` (lines 26, 30–33) | the real files | line 39: the three names, as literals; line 41: at least one `uses` per file; line 42: each value against the literal `^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$` | the repository's own files | none | As designed |
| W2 | the raw text split on `\n`, matched by `PINNED_LINE` (line 36) | the real files | line 49: per file, the captured values equal the parsed `uses` (W1's list), in order | as W1 | none | As designed |
| W3 | as W1 and W2 | the real files | line 67: some action appears in more than one workflow; line 68: one ref per `owner/repo`, from the parsed values; line 73: one release comment per pinned value, from the line scan | as W1 | none | As designed, in the form the design review's incremental note gave it |
| R1 | — | — | removed alone (`strings()` stays, used at the release test's lines 232 and 250); its pattern is W1's, its file is in W1's listing and asserted by name, and its reason is in the new file's header (lines 3–6) | — | — | As designed |

The test file's header states the two gaps the design review named (lines 8–10): which release a commit is, and
whether it is the current major, with what closes them (whoever updates a pin resolves the tag to its commit and moves
every workflow together).

### Coverage

- **Spec "Failure modes and boundaries"**, read in full (A1–A6, B1–B4, C1–C5, D1–D4, E1–E2): none concerns the commit
  an action runs at, and the change alters no condition, job or step of the release workflow (its diff touches only
  `uses` lines). The design review's "none in scope" holds. The release workflow test's 15 remaining cases, which
  hold those units, are unchanged and pass in the gateway (log lines 295–309).
- **The rule's boundaries** (the design review's table), each against the code: a new file of either extension — line
  22; a tag, a branch or a short commit — line 42 (exactly 40 lowercase hex digits); a missing comment — no capture,
  so line 49 differs; flow style, or a line break after `uses:` — no capture, line 49 differs; a quoted value —
  captured with its quotes, line 49 differs (a red); a job-level `uses` — its path `jobs.<id>.uses` is read, which is
  all the row claims (a reusable workflow's `owner/repo/.github/workflows/<file>@<sha>` would be refused by line 42);
  two workflows at different commits — line 68; one commit under two release comments — line 73.
- **Gaps**: the two above, in the header. The upgraded actions' behaviour on GitHub's runners is no claim of these
  tests: the release workflow test's header states its own gap ("the jobs' real effects need GitHub, Apple and the
  secrets"), and the runs are task 9 and the Evidence of checklist.md's "#253, regression" row.
- **Fixtures**: the repository's own workflow files, the data GitHub runs; no shape written from the rule.
- **Regression points this change touches**: the tests that read the changed files, per
  [targeted.txt](evidence/ticket-253/targeted.txt)'s search with its control (`scripts/release-workflow.test.mjs` and
  the new file for the workflows; `scripts/release-tag.test.mjs` and `build/mac-packaging.test.cjs` for
  `package.json`), all in `pnpm test:scripts`: 137 pass in the gateway. The release workflow test finds steps by
  `uses?.startsWith('actions/<name>@')` (lines 152, 194, 211, 264, 314, 317), a prefix the new pins keep.

No finding.

### Case design

- Isolated and reproducible: synchronous reads of files in the repository, with no clock, network or environment. The
  three cases share the module-level `workflows`, read once at load; none mutates it (`split`, `map`, `flatMap` and
  `collect` build new values).
- Drives the target behaviour, on the right object: the input is `.github/workflows/`, the directory GitHub reads
  workflows from, not a copy; `.github/` holds nothing else (`ls -la .github`), so no composite action lies outside
  the listing. Each case asserts a property of those files.
- No public interface is bypassed and no unreachable state is built: the files are read as GitHub reads them.

No finding.

### False greens

Mutation testing: per the project capability declaration, mutation-testing is not enabled (`[mutation-testing]
enabled = false`, read with Python's `tomllib`; the form matches the capability registry); this item is skipped. Each
case's "when does it go red" is answered below against the code and its expected values' sources.

| Form | W1 | W2 | W3 |
|---|---|---|---|
| Constant truth | the three names and a non-empty `uses` per file are asserted (at HEAD: `ci.yml` 7, `message-language.yml` 3, `release.yml` 14) | the parsed side is W1's guarded list, read in the same file and run; the line scan is an independent reading | line 67: checkout is in all three files; line 73's loop has a member for every `uses` wherever W2 holds |
| Tautology | the pattern is a literal | the expected list is the YAML parser's reading, not the regex's | the expected value is the constant one |
| Stale path | `.github/workflows/` is live; `test:scripts` runs in CI's checks job (`ci.yml:40`) and in `pnpm verify`, and the gateway ran the file (log line 138, cases at 310–312) | same | same |
| Conditional skip | no `skip` and no early `return` | same | same |
| Assertion may not run | synchronous; loops guarded | same | same |
| When does it go red | a value not `owner/repo@<40 hex>` in any `*.yml` or `*.yaml`, one of the three files missing, or a file without an action; seen red on `main`'s files at line 42 | a `uses:` line without `# v<x.y.z>`: seen red at line 49. A `uses` the scan cannot see: by reading — its value is missing from the captured list, so the lists differ at line 49 | one action at two refs: seen red at line 68. One pinned value under two release comments: by reading — `collect` maps that value to two releases, so `values.size` is 2 at line 73; not reached on `main`, where line 68 throws first |

The file is also a check CI runs on every pull request, so the gate forms apply (review-code's false-greens list).
Forms one, two, five and eight do not apply: it asserts the form of values read synchronously from text, not presence,
rendering or timing. Three: the property is the text of the files, read directly. Four: the gate goes red on real
input, `main`'s workflows, with the committed file (run 2); a planted mutation for W2's second branch and W3's second
step is skipped per the capability declaration and answered by reading above. Six: the gateway's exit codes are taken
without a pipe (above). Seven: no exemption list. Nine: the listing must include the three files by name and each
file's parsed `uses` must be non-empty, so the scan cannot pass without reading them.

No finding.

### Resource reuse

The test design table lists no expensive resource, and the run confirms it: the file's standalone runs take 67–68 ms in
all, Node's start, the js-yaml load and three files included (`ci.yml` 3684 bytes, `message-language.yml` 2040,
`release.yml` 9865); in the gateway its three cases take 0.61, 0.64 and 0.33 ms (log lines 310–312). Nothing reaches
the one-second bar, so there is no load count to take. The parser is loaded once per file through
`build/mac-packaging.cjs`, as the release workflow test loads it.

No finding.

### Records

Statements about these tests were found with `rg -uuu -n` over the worktree, hidden and ignored files included
(`node_modules/`, `site/node_modules/` and `.git/` excluded: third-party packages and version-control internals; 1062
files searched, 521 of them under `docs/.workings/`), for `workflow-actions`, "pinned to a full commit", "every action
in every workflow", "uses tags" and "action pins". The files the hand-over names (the spec, this record, the gateway
log, the capability file, `AGENTS.md` and `CLAUDE.md`) and the related ones (`checklist.md`,
`ticket-253-doc-sync.md`, `ticket-253-tasks.md`, `ticket-253-review-code.md`, `ticket-240-doc-sync.md`,
`docs/ops/mac-signing.md`, `CONTEXT.md`, and the two test files' headers) were read directly.

- `CONTEXT.md:710–717`, `docs/ops/mac-signing.md:133–136`, `ci.yml:38–40` and `package.json:17` name the new test and
  what it holds; each is true against the code.
- `checklist.md`'s "#253, regression" row, "Test: the static workflow test (every case unchanged)": the cases that hold
  the units it names are unchanged; R1, the one case removed, held none of them, and its rule is W1's.
- Gateway logs of earlier changes printing "every action is pinned to a full commit", and `ticket-234-tasks.md`'s
  "`ci.yml` keeps its tags", are dated records of other work, not current statements.
- This record's design review agrees with the written tests (the table above).

No coverage gap, false green or resource finding arises here, so this check adds no document sync item.

### Findings

None.
