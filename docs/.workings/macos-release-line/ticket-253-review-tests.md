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
