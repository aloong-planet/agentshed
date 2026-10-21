# Test review — ticket aloong-planet/agentshed#223

- Ticket: [aloong-planet/agentshed#223](https://github.com/aloong-planet/agentshed/issues/223), a tracker ticket.
  Its artifacts are declared in the ticket
  ([comment](https://github.com/aloong-planet/agentshed/issues/223#issuecomment-6119569122)): the code review
  `ticket-223-review-code.md`, this test review and the document sync checklist `ticket-223-doc-sync.md`, all
  under `docs/.workings/i18n/`. The slug follows `docs/specs/i18n.md`, whose Further Notes hold the
  working-language gate's exemption rules.
- Requirement sources: the ticket's Fix and Verification sections, and `docs/specs/i18n.md` Further Notes
  ("mockup content but not the tooling beside it"; the predicates "verified to hold in both directions"). The
  spec's "Failure modes and boundaries" section has no row for the working-language gate.

## Design review — 2026-10-21

- Version: implementation starts from 39f9763 (this record as the step-6 check left it, plus the gateway's
  runner). The design follows the owner's decision on F1, to add the regression test in this pull request.
- Before this section, no design review had been performed in either round; the 2026-10-12 round gave "no
  unit seam" as the reason, which F1 refutes. The cases reviewed in "Post-implementation check — 2026-10-21"
  below are one-off mutation runs, not tests, and were not designed here.
- Planned test file: `scripts/check-lang.test.mjs` (`node:test`), run by `pnpm check:lang` before the gate
  itself, the way `pnpm check:nul` runs `scripts/check-raw-nul.test.mjs`. The gateway and CI both run
  `pnpm check:lang`.
- Seam: the gate's command line, `node scripts/check-lang.mjs`, run with a fresh temporary Git repository as
  its working directory. The gate lists that directory's files with `git ls-files` and reads them relative to
  it, so a test controls the whole file set without touching the repository. This is the seam
  `scripts/check-raw-nul.test.mjs` uses for its sibling gate.
- Fixture: every case starts from the same eight seed files, one per exemption rule, each holding one line of
  Chinese that its rule permits. Without them the gate reports each rule that matches no file as dead, and
  every run would exit 1. Measured on 39f9763: the seeds alone exit 0 with 8 permitted lines, one file per
  rule. The Chinese is built from code points, so the test file itself holds none.

### Test design table

| Case | Covers | Driving input | Assertion and source of the expected value | Fixture shape | Expensive resource |
|---|---|---|---|---|---|
| T0 seeds only | the fixture itself: every rule matched, nothing else red | the eight seeds | exit 0, `8 line(s)`: one line per seed, counted by hand | the seeds | none |
| R1–R4 a named copy | ticket #223 Fix 2 and Verification ("a Chinese string added to `index.html` turns `check:lang` red"); spec Further Notes, "not the tooling beside it"; this round's three copies | seeds plus one of `docs/prototypes/index.html`, `app-identity.js`, `demo-dimensions.js`, `demo-harness.js`, holding an English first line and a Chinese comment on line 2 | exit 1, `found 1 problem(s)`, the problem `docs/prototypes/<file>:2`, and the prototype rule's reason "the tooling beside it gets no exemption". The four paths come from the hash check of the skill's assets against every tracked file, not from `SKILL_TOOLING` | paths from the repository's file list; content one comment line, since the predicate decides by path and by line | none |
| R5 `sync-mmd.mjs` | the gate's comment: the fifth copy needs no entry, because `.mjs` is not an exempt type | seeds plus `docs/prototypes/sync-mmd.mjs` with a Chinese comment on line 2 | as R1–R4 | as R1–R4 | none |
| P1 a mockup page | ticket Verification ("one in a mockup page does not") | seeds plus `docs/prototypes/shell/prototype-app-shell.html` with a Chinese line | exit 0, `9 line(s)`: the seeds' 8 plus this line, which shows the file was read and the line permitted, not skipped | as R1–R4 | none |
| P2 a logic page named `index.html` | the copies are named by path, not by basename | seeds plus `docs/prototypes/project-list/visibility/index.html` | as P1 | as R1–R4 | none |
| P3 `manifest.js` | ticket Fix 2 ("`manifest.js` … stays exempt") | seeds plus `docs/prototypes/manifest.js` | as P1 | as R1–R4 | none |
| P4 `dimensions.js` | this round's decision: the project's registry addresses the reviewer | seeds plus `docs/prototypes/dimensions.js` | as P1 | as R1–R4 | none |

### Dimension 1 — Coverage

- Every requirement of the ticket and the spec sentence has a row: red for the copies (R1–R4), green for a
  mockup page and `manifest.js` (P1, P3), and growth inside the rule staying green (P1–P4, each one permitted
  line more). P2 and P4 cover the two ways the narrowing could over-reach: matching by basename, and
  catching the project's own registry beside the copies. The spec has no "Failure modes and boundaries" row
  for the gate.
- Driving input reaches the branch: a named path with a Chinese line is exactly the input that reaches the
  narrowed branch of `mockupOnly`; any other exempt-type path under `docs/prototypes/` reaches the exemption.
- Fixture shape: the predicate reads nothing but the path and whether a line holds Chinese, so file content
  has no structure to get wrong. The paths are the real ones.
- Gap, to note in the test file's header: a template the skill adds later is covered only once it is named in
  both the gate and this test. That gap belongs to the refactor item the owner sent to a separate issue.

### Dimension 2 — Case design

- Each case builds its own temporary repository and removes it in a `finally` block, so cases are isolated and
  can run in any order.
- Each case runs the whole gate and asserts on its output, so it drives the real behaviour.
- Implementation-coupling red flags, each checked: no module double; no private member or internal state
  (the test cannot reach `SKILL_TOOLING` and does not try); no call-count assertion; no side channel (the
  results come from the gate's own exit code and output); every state is one a contributor reaches by adding
  a file.

### Dimension 3 — False greens (judged from the design)

- Constant assertions: none. Every expected value is exact (exit code, problem count, file and line,
  permitted count), with no threshold to fill.
- Tautology: none. The expected values are literals from the ticket, the spec and the hash check, never
  recomputed from the gate.
- Old path: none. `mockupOnly` and `SKILL_TOOLING` are the live code path, and each path in the table is a
  live file in the repository.
- When each case goes red: R1–R4 if an entry is dropped or misspelled or the narrowing is lost; R5 if `.mjs`
  becomes an exempt type; P1–P4 if the narrowing over-reaches onto that path, or if the file stops being read;
  T0 if a rule changes so that a seed no longer satisfies it, which also tells the author to update the seeds.

### Dimension 4 — Resource reuse

- No expensive resource: a gate run in a seeded temporary repository took 212–330 ms over three runs on
  39f9763, and a temporary repository costs less. The gate run is the behaviour under test, so each case
  runs it.
- Existing practice: `scripts/check-raw-nul.test.mjs` builds a fresh temporary index per case. This test
  follows it.

## Post-implementation check — 2026-10-21

- Version: branch `fix/gallery-shell-language` at 604e0ef. Range e9db914..604e0ef: the merge 2cf3dea (main
  at 9b7bb13), then b164921 and 604e0ef. The pull request's net change (`git diff 9b7bb13 604e0ef`) is
  `scripts/check-lang.mjs` (`SKILL_TOOLING` and `mockupOnly`) plus files under `docs/.workings/i18n/`; nothing
  under `docs/prototypes/` changes (`git diff --stat 9b7bb13 604e0ef -- docs/prototypes` is empty).
- Executed by an independent reviewer that did not inherit the implementation conversation and loaded
  `/review-tests` itself.
- Review object: the tests written or changed in the range. `git diff --name-only 9b7bb13 604e0ef` lists 35
  files; filtered for test files (`\.test\.|\.spec\.|(^|/)e2e/|(^|/)test/`) it lists none (grep exit 1). The
  change's verification is the gate's own run in the full gateway and the 15 runs of
  `ticket-223-evidence/rerun-2026-10-21/mutate.mjs`; those are reviewed here as the cases.
- Run evidence, read and not re-run by this check:
  - `rerun-2026-10-21/full-gateway.log`: HEAD 604e0ef, `git status --porcelain --untracked-files=all` clean,
    every `pnpm verify` stage run as its own command with its exit code and full output: typecheck, lint, test
    (869 passed, 1 skipped), test:scripts (135), test:site (`astro check` 0 errors, 102 tests), check:ui,
    check:lang (2554 permitted lines, prototype rule on 38 files), check:i18n, check:nul (8 tests, 741 files),
    e2e (148 passed) and smoke; each exit 0, overall exit 0. Lint and e2e are the stages the capability
    declaration names (`lint`, `e2e-suite`, both enabled). The log has every item the gateway requires; the
    runner that wrote it is not kept beside it (O2).
  - The mutation logs were produced with `scripts/check-lang.mjs` at blob 240e8c9 (b164921's version, recorded
    in `targeted.log`) or later. From b164921 to 604e0ef that file changes only in the `SKILL_TOOLING` doc
    comment: the TypeScript printer with `removeComments` gives identical output for both versions (7469
    characters each), so the logs describe 604e0ef's behaviour.

### Test design table (reverse-filled by this check from `mutate.mjs`)

Every row uses the same seam: the gate's command line, `node scripts/check-lang.mjs` from the repository root,
reading the real file set from `git ls-files --cached --others --exclude-standard`. The driving input is one
Chinese comment line (a four-character marker built from code points) appended to the named real file; the N
rows also remove the narrowing `!SKILL_TOOLING.includes(file) && ` from the gate. No row uses an expensive
resource.

| Case | Covers | Driving input | Assertion and source of the expected value | Fixture shape |
|---|---|---|---|---|
| C0: the gateway's `check:lang`, baseline, final | ticket: `check:lang` passes | the unmodified tree | exit 0; 2554 permitted lines at baseline and final | the real tree |
| T1–T4 | ticket: Chinese in `index.html` turns the gate red; this round: the three copies main brought in | marker in `index.html`, `app-identity.js`, `demo-dimensions.js`, `demo-harness.js` | exit 1, one problem at the appended line, with the prototype rule's reason "the tooling beside it gets no exemption"; red is expected from the ticket and the spec's tooling sentence | real files |
| T5 | the comment's claim that `sync-mmd.mjs` needs no entry | marker in `sync-mmd.mjs` | exit 1, one problem at the appended line | real file |
| G1 | ticket: a mockup page does not turn red | marker in `shell/prototype-app-shell.html` | exit 0 and 2555 permitted lines (baseline + 1): the line was read and permitted | real file |
| G2 | only the shell's path is named, not its basename | marker in the logic page `project-list/visibility/index.html` | as G1 | real file |
| G3, G4 | `manifest.js` and `dimensions.js` stay exempt | marker in each | as G1 | real files |
| G5 | shared mockup components stay exempt | marker in `_shared/app-rail.js` | as G1 | real file |
| N1, N2 | the narrowing is what turns T1 and T2 red | T1 and T2 with the narrowing removed | exit 0, 2555 permitted lines, prototype rule on 39 files | real files, real gate |
| N3 | T5's red does not come from the narrowing | T5 with the narrowing removed | exit 1, one problem at the appended line | real file, real gate |

Comparing the written cases with the test design table: no table existed before the cases were written, so
there is nothing independent to compare with. The table above is derived from the cases and matches them by
construction. No test file exists, so no file header carries a gap note; the gaps are recorded under
Dimension 1.

### Dimension 1 — Coverage

| Requirement | Case | Input that reaches it |
|---|---|---|
| `check:lang` passes with the copies no longer exempt | C0 | the real tree at 604e0ef |
| Chinese in a named copy turns the gate red and names the rule | T1–T4 | the appended line. Each red names `<file>:<line>` with the line one past the file's end (211, 30, 135 and 344 lines before the append, counted on 604e0ef) |
| Chinese in a mockup page does not | G1 | as above |
| A file sharing the shell's basename is not caught | G2 | `project-list/visibility/index.html` |
| The registries addressing the reviewer stay exempt | G3, G4 | `manifest.js`, `dimensions.js` |
| Spec, both directions: growth inside the rule stays green | G1–G5 | each adds one permitted line |
| The list names every copy the file type would exempt | T1–T4, and a hash check | each prototype-skill asset at `aloong-planet/skillshed` `origin/master` (local clone at 546260d) looked up among all 741 tracked blobs at 604e0ef. The byte-identical copies are `index.html`, `app-identity.js`, `demo-dimensions.js`, `demo-harness.js` and `sync-mmd.mjs` (`.mjs`, not an exempt type); the two logic templates have no identical copy |
| The gallery still lists and opens every prototype | not affected by this pull request | nothing under `docs/prototypes/` changes; `index.html` is blob 45bdedf, identical to the skill's `gallery-template.html` |

- Fixture shape: no fixture is invented. Every run reads the real tree, and the marker goes into real files.
  The marker's shape (a comment line) does not narrow the coverage: for a named copy `mockupOnly` reports
  every line with Chinese whatever its shape, and for any other file with an exempt extension it permits every
  line, so there is no shape-dependent branch to reach.
- Gaps:
  - **No regression test stays behind (finding F1).** The four named files hold no Chinese today (0 lines
    each, counted on 604e0ef with the gate's own `CJK` pattern), and the gate skips a file with no Chinese
    before any rule applies, so the gateway's green is the same with or without the narrowing. Dropping an
    entry, misspelling a path or removing the narrowing turns nothing red, and the next Chinese in that file
    is accepted. Only the one-off mutation runs show that the narrowing works. The reason given on 2026-10-12,
    "no unit seam", does not hold; see F1.

### Dimension 2 — Case design

- Isolation: each case reads a byte backup, edits real files, confirms the edit (the marker line is present;
  the narrowing occurs once before and not after), runs the gate, and restores in a `finally` block with a
  byte comparison. Every log records the restore as byte-identical. No `git checkout` is used. The cases are
  independent, and the script can be re-run.
- Drives the target: each case runs the whole gate as `pnpm check:lang` does, and the result is the gate's
  outcome (exit code, problem line, permitted count), not an internal value.
- Assertion object: right in every row. The script's own verdict (`summary.md`, "as expected") compares the
  exit code only; this check read every red log for attribution (O1).
- Implementation-coupling red flags, each checked: no module double (no test framework is involved); no
  private member read; no call-count or call-order assertion; no side-channel read (every result comes from
  the gate's own output); no state the public path cannot reach (a contributor adding Chinese to a file is the
  real path, and removing the narrowing in the N rows mutates the code under test rather than setting up
  state).

### Dimension 3 — False greens

- Per the project capability declaration, `mutation-testing` is not enabled (`enabled = false`, read with
  smol-toml); mutation testing by this check is skipped, and this check made no temporary edit. The cases
  above are the implementer's own mutation evidence for a changed gate, which review-code's false-greens form
  4 requires; they are reviewed here as evidence.
- When each case goes red:
  - C0: on any unpermitted Chinese line in the tree. For this change it proves nothing: it holds with or
    without the narrowing (F1).
  - T1–T4: they would turn green if an entry were dropped or misspelled or the narrowing removed. N1 and N2
    show this for T1 and T2. For T3 and T4 it follows from the output: the problem carries the prototype
    rule's reason, so `mockupOnly` returned the line, which for a `.js` file under `docs/prototypes/` happens
    only when `SKILL_TOOLING` names it.
  - T5: would turn green if `.mjs` became an exempt type; N3 shows that the narrowing plays no part.
  - G1–G5: would turn red if the narrowing over-reached (by basename, by directory, or onto the registries)
    or the extension exemption broke. Each reports 2555 permitted lines against 2554, so the gate read the
    appended line and permitted it rather than skipping the file.
  - N1–N3: control runs. A red N1 or N2 would mean that something other than the narrowing decides the copies.
- Unit-test forms, each checked: constant assertion — none (exact exit codes and problem lines, no threshold);
  tautology — none (red and green are expected from the ticket and the spec, not from the gate's code); old
  path — none (every target is a live file, and the predicate is the gate's live path); silent conditional
  skip — none (`mutate.mjs` throws when an edit changes nothing or its marker is missing); assertion that may
  not run — none (synchronous `spawnSync`, no callback, no loop over a possibly empty set).
- Gate forms from `review-code/false-greens.md`:
  - Form 4, a changed gate that never went red: it went red in T1–T5 and N3, each time with one problem, at
    the file and line of the appended marker.
  - Form 7, an exemption predicate: mutated in both directions. Violations go red with the rule named (T
    rows), and growth inside the rule stays green (G rows).
  - Form 9, the target inside the scan: green runs prove the read by the extra permitted line, red runs by
    the reported line.
  - Form 6, a command that ran wrong: `mutate.mjs` takes `status` straight from `spawnSync`. A crashing gate
    would also count as red, but every red log carries the expected problem line and no stack trace. The
    gateway records each exit code per command (O2).
  - Forms 1, 2, 3, 5 and 8: no interface, browser, geometry, asynchronous or external-service assertion is
    part of this change.

### Dimension 4 — Resource reuse

- No expensive resource. A gate run takes 0.7 s in the full gateway log, below the 1 s threshold, and it is
  the behaviour under test, so every case must run it. Nothing is loaded or built that could be shared, and
  the runtime count has nothing to count.
- No shared setup exists for `check-lang.mjs`. If F1's test is written, the precedent to reuse is
  `scripts/check-raw-nul.test.mjs`, a fresh temporary Git index per case (78–218 ms each in the full gateway
  log), which is not an expensive resource either.

### Findings

| # | Finding | Impact | Recommendation | Destination |
|---|---|---|---|---|
| F1 | The narrowing has no regression test, and the reason given ("no unit seam") does not hold. The gate already has a command-line seam: it lists files with `git ls-files` in its working directory, reads them relative to it, and resolves its imports relative to itself, so it runs against a temporary Git index exactly as `scripts/check-raw-nul.test.mjs` runs its sibling gate (inside `pnpm check:nul`, in the gateway and in CI). The gap was first raised on 2026-10-12 and is raised here a second time, unchanged | A dropped or misspelled `SKILL_TOOLING` entry, or a lost narrowing, turns nothing red, and the next Chinese in that copy is accepted. That is the defect #223 fixes, back with nothing to report it | Now, in this pull request: add `scripts/check-lang.test.mjs` on the `check-raw-nul.test.mjs` pattern, with the T, G and N cases as fixture files at the same paths, the Chinese built from code points so that the test file itself passes the gate, and run it from the gateway (for example `check:lang` running it first, as `check:nul` does). A fixture index without a Chinese-bearing file for every rule fails with "rule matches no file", so either seed one file per rule or assert on each case's problem line with a positive control in the same run. Do the design review first, then `/tdd`. The alternative is a separate issue | The owner decides: this pull request or a new issue |
| F2 | No design review exists, and the skip is not recorded with a ground `/implement` accepts (it skips the design review only together with a TDD skip for lack of test value) | The case set was never reviewed before it ran | Settled with F1: a regression test gets a design review section with its implementation-start commit; if F1 is declined, record that decision and its ground here | This record |
| F3 | The document sync checklist's pre-delivery scope re-check is dated 2026-10-12 and describes c149802 (the shell copy and the shell-only narrowing). Its statement that the Chinese-quoting raw evidence "stays untracked in `ticket-223-evidence/`" does not hold on this branch's worktree: those four files exist only in the main checkout's ignored `docs/.workings/i18n/ticket-223-evidence/` | Delivery could rest on a scope check of a change the pull request no longer makes, and a reader of the branch looks for evidence that is not there | Before delivery, redo the re-check for the 2026-10-21 scope, and state where those four files live (or that they are local to the main checkout); keep `logic-pages-vs-template.diff` reachable while #226 relies on it | `ticket-223-doc-sync.md` |
| F4 | Pull request #225 (head still e9db914) carries the 2026-10-12 evidence: the shell copy, red first with five problems, M1–M5 at 2373 and 2374 permitted lines, the gallery render, and `pnpm verify` on f4d391d | Once this round is pushed, the description's evidence describes a change the pull request no longer contains | At delivery, replace the title and the evidence with this round's: the T, G and N runs at 2554 and 2555, the full gateway on 604e0ef, and F1's outcome | PR #225 description |

Dispositions (2026-10-21, after the check above returned):

- F1: the owner chose to add the test in this pull request. It is `scripts/check-lang.test.mjs`, run by
  `pnpm check:lang`, designed in "Design review — 2026-10-21" above and reviewed in the code review's second
  pass.
- F2: settled with F1. The design review was written before the test, starting from 39f9763.
- F3: the document sync checklist's scope re-check is redone for 2026-10-21, and it states where the four
  untracked files live.
- F4: the pull request's title and description are replaced with this round's at delivery.
- O2: the runner is kept beside the log as `rerun-2026-10-21/run-gate.mjs`.
- O3: carried by [#296](https://github.com/aloong-planet/agentshed/issues/296) with the code review's refactor
  item.

Observations, no change required this round:

- O1: `mutate.mjs` judges each case by its exit code alone, so attribution was checked by reading each red
  log. A reuse of the script, or F1's test, should assert the problem's file and line as well.
- O2: the full gateway log records each exit code but not the runner that wrote it. Keeping the runner beside
  the log, as `mutate.mjs` is kept, would let a reviewer confirm that no pipe was involved.
- O3: an entry in `SKILL_TOOLING` that matches no file is not reported, unlike the gate's rules ("rule matches
  no file and is now dead"). A copy the skill renames would be exempt under its new name while the old entry
  sits dead. This is the mechanism of the code review's refactor item (a template the skill adds is silently
  exempt) and belongs in that item's decision.

### Document sync

- Scope checked on 2026-10-21: `docs/.workings/i18n/`, tracked and ignored files (enumerated with
  `git ls-files` and `find`); the ticket and its comment; pull request #225; and the whole worktree except
  `node_modules/` and `.git/`, searched with `rg -uu -a` for `check-lang`, `SKILL_TOOLING`, `mockupOnly`,
  `tooling beside` and `gallery shell`. That search covers `docs/specs/` (`i18n.md`, `project-detail.md` B4),
  `docs/features/`, `docs/adr/`, `CONTEXT.md`, `README*`, `AGENTS.md`, `scripts/` and `.github/`. Other
  features' working records that mention `check-lang` describe their own past runs and are not affected.
- Result: no statement in the spec, the features, the ADRs or `CONTEXT.md` becomes false through this
  check's findings, and none is missing. The sync obligations are F3 (the checklist) and F4 (the pull request
  description). A test added for F1 is recorded here; no authoritative document describes the gate's tests,
  so it adds no checklist item.

## Earlier round (2026-10-12, c149802)

The first check reviewed c149802, which copied the skill template over the shell and named the shell alone.
Its conclusions about that copy (red first on the shell's five lines, mutations M1–M5, the gallery render of
16 entries) describe that commit only; the pull request no longer makes the copy. Its raw evidence is the
tracked files at the top level of `ticket-223-evidence/` and four untracked files (`red-before-copy.log`,
`mutation-M1-shell-title.log`, `mutate.sh`, `logic-pages-vs-template.diff`) that exist only in the main
checkout's ignored copy of that directory (F3).

## Outside this ticket

- The e2e case "startup skeleton: agents page shows placeholders, refuses input, fills in place" timed out
  once in the 2026-10-12 full run, under a load average of about 70. The owner decided on 2026-10-12 to track
  it separately: [#227](https://github.com/aloong-planet/agentshed/issues/227), still open. It passed in the
  2026-10-21 full gateway run (4.8 s).
