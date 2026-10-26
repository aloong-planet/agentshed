# Code review — #253

Ticket: [#253](https://github.com/aloong-planet/agentshed/issues/253). Task list: [ticket-253-tasks.md](ticket-253-tasks.md).

## Layered review (2026-10-26, implementation on branch `chore/actions-current-majors` over 9685ccf, uncommitted)

Scope: `git diff 9685ccf` — the three workflows' 24 `uses` lines moved to the targets, with their version comments;
`scripts/workflow-actions.test.mjs` (new); the release workflow test's own pinning case removed; the new test added to
`pnpm test:scripts`; one comment in `ci.yml`. No product code changes (`git diff --stat 9685ccf -- src site` is empty).

### Underlying premises

- **Each target is the official release's commit.** Every tag was resolved through the action's own repository
  (`gh api repos/<action>/commits/<tag>`), not taken from a page: a commit of a fork can be addressed through the parent
  repository's path, so a commit read elsewhere would not prove it is the release. All five match, and each target's
  `action.yml` declares node24 ([evidence/ticket-253/actions-and-targets.txt](evidence/ticket-253/actions-and-targets.txt)).
- **Every input the workflows pass still exists at the target.** Read in each target's `action.yml`: checkout's
  `persist-credentials` and `fetch-depth`; setup-node's `node-version`, `cache`, `cache-dependency-path`;
  upload-artifact's `name`, `path`, `if-no-files-found`, `retention-days`; download-artifact's `name`, `path` — all
  present. upload-artifact v7's `archive` defaults to `true` (zipped, as before); download-artifact v8's
  `digest-mismatch` defaults to `error`.
- **The breaking changes between version 4 and the targets** are read one by one against the workflows' use in the task
  list's table: none applies. One premise there cannot be settled offline: that pnpm/action-setup v6, given
  `packageManager: pnpm@9.12.3` and no `version`, installs pnpm 9.12.3 (v6 bootstraps pnpm 11 and then self-updates to
  the pinned version). The runs on the change settle it (task 9): the frozen install would fail on a lockfile the
  installed pnpm does not accept, and the action's log names the version.
- **Finding P1 (fixed): a cause in a new comment stated wider than the fact.** The new test's header said "CI is the
  required check for merging to main". The ruleset on `main` (20237985, active) requires three checks: CI's two jobs
  and the message-language job. The comment now names both workflows. The other causes in the header — the gate job's
  credentials and the publish job's write access — are the release workflow's own (its job `env` and `permissions`),
  and the owner's decision of 2026-10-18 recorded in the case this replaces.
- The removed case's reason moves to the new header, so no recorded reason is lost; the release test's header lists
  what it guards without pinning, and stays true.

### Runnability

- `pnpm test:scripts` passes, 137 tests including the new three; the new test red on `main`'s workflows, each case for
  its own reason ([evidence/ticket-253/red-first.txt](evidence/ticket-253/red-first.txt)); actionlint 1.7.12 finds no
  error in the three files and reports a misspelt key in a planted copy (exit 1)
  ([evidence/ticket-253/targeted.txt](evidence/ticket-253/targeted.txt)). Its shellcheck rule does not run (shellcheck
  is not installed), as on #234; no `run` block changed.
- The test's line scan: both `- uses:` and a `uses:` under an `if:` key match; a CRLF line ending is absorbed by `\s*$`;
  a `uses` in flow style or quoted makes the two lists differ, a red rather than a silent pass.
- What only GitHub can show, carried to task 9: the pnpm version above; the upgraded actions on ubuntu (CI) and macOS
  (a manual `release.yml` run, verify off); the download step, which only a tag push reaches (the ticket's third item,
  Waiting).
- No error path is added: the change has no runtime code.

### Security

- The pins narrow what runs: every action is now a reviewed commit in all three workflows, where `ci.yml` and
  `message-language.yml` followed moving tags. The default token stays read-only; `persist-credentials: false` stays on
  every checkout in `release.yml`.
- setup-node's cache-poisoning advice (its README at the target: disable automatic npm caching in publishing
  workflows) concerns the automatic npm cache, which this repository never gets (`packageManager` is pnpm). The gate
  job's explicit `cache: pnpm` is unchanged by this change. No finding.

### Consistency

- **Finding C1 (fixed, class-level): a statement enumerating what a command runs became incomplete when the command
  gained a member.** `ci.yml`'s comment on `pnpm test:scripts` named the packaging asset's tests and the release
  workflow's; it now names every workflow's action pins too. Every other statement of what `test:scripts` runs, found
  with `git grep -n 'test:scripts'` over tracked files (records aside): `docs/ops/mac-signing.md:18` and `:136`, each
  naming one test file the command runs — still true; `package.json` itself. Other instances: two, none affected.
- The pinning rule's statements outside code — the release runbook's "Actions" bullet ("`ci.yml` uses tags") and
  `CONTEXT.md` — are document sync items for step 7 ([ticket-253-doc-sync.md](ticket-253-doc-sync.md)).
- Smells, on the code this change adds:
  - Duplicated Code: `strings()` (four lines) and the parser's loading appear in both workflow tests. Answered: sharing
    them would need a module both test files import, for a generic four-line walk; a test file cannot import the other
    without running its cases. Kept.
  - Mysterious Name: `collect()` returns, for each key, the values seen and where; its doc comment says so. No other
    smell.

### Refactoring list

None.

## Layered review — S3, the site tests' build on the site's filesystem (2026-10-26, on f340555, uncommitted)

Scope: `git diff f340555 -- site`: `site/test/build-site.ts`, the site tests' global setup, builds into a new
directory under `site/node_modules/.cache/` instead of `os.tmpdir()` (the owner's decision D5). No product code.

### Underlying premises

- **Why the build failed on CI**: Astro's build moves the built assets into `outDir` with `fs.rename`
  (`ssrMoveAssets`, astro 7.4.0, `dist/core/build/static-build.js:359`, in CI's stack trace), and a rename across
  filesystems fails with EXDEV. CI's run 40266512391 ran on ubuntu-26.04, where it renamed from
  `/home/runner/work/…/site/.astro/.prerender/` to `/tmp/agentshed-site-…/` and failed; main's last green run
  (40087613957) ran on ubuntu-24.04. Measured, not read: the same failure locally with `TMPDIR` on a mounted disk image,
  none with the default (`evidence/ticket-253/exdev-repro.txt`). The new comment states this cause; it is the one
  measured.
- **"No test files found"** in the failing run is a consequence, not a second fault: it appears with the EXDEV and goes
  with it (the same run after the fix reports 107 tests, `evidence/ticket-253/exdev-after-fix.txt`).
- `site/node_modules/.cache` is on the site's filesystem (it is inside the site's directory); `node_modules/` is
  ignored by git (`.gitignore:1`), so the gates that read `git ls-files --others --exclude-standard` never see a build
  there.

### Runnability

- With `TMPDIR` on another filesystem: 7 files, 107 tests pass; with the default, the same; after each run the
  build's directory is gone (`exdev-after-fix.txt`). `pnpm test:site`, `pnpm lint`, the language and NUL checks pass
  (`evidence/ticket-253/targeted-2.txt`).
- `mkdirSync(…, { recursive: true })` makes `.cache` when absent and is a no-op when present; `mkdtempSync` gives each
  run its own directory, so two runs at once do not share one. A run killed before its teardown leaves its directory
  behind, ignored by git and the gates, as a leftover under `/tmp` was before.

### Security

Test-only code; nothing is read from outside the repository or written outside the site's directory. No finding.

### Consistency

- **Class-level check: other code that moves files into the operating system's temporary directory from elsewhere.**
  Every file that uses the temporary directory (`git grep -l -E "tmpdir\(|os\.tmpdir|mkdtemp" -- src scripts e2e site
  build`: 47 files) was searched for a rename, move or copy: four hits. The two in `e2e/` are `mouse.move`; the
  packaging asset's test (`build/mac-packaging.test.cjs:891`) and the token engine's test
  (`src/main/providers/token-stats.test.ts:2336`) rename within one temporary directory, and both passed on CI's
  ubuntu-26.04 run (the checks job's `pnpm test` and `pnpm test:scripts`). Other instances affected: none.
- The statements of the build: the file's header ("into a new temporary directory"), `site/README.md:53`–`:54`
  ("builds the site into a new temporary directory once per test run"), `ci.yml:41` ("on a fresh build") and the
  landing-page spec ("a fresh build made for the run") — each still true.
- Smells: none on the changed lines.

### Refactoring list

None.
