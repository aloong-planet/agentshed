# Continuous integration

Requirements: [CI routing](../specs/ci-routing.md). The `CI` workflow runs on pull requests targeting
`main` and pushes to `main`. Do not add workflow-level path filters: the final required check needs a
result even when no application tests are necessary.

## Jobs and paths

`changes` routes a pull request by its changed paths. It compares the merge base with the head using Git,
and its summary explains every path. Deletions count, moves count at both locations,
and unfamiliar paths select the application. Failure to read the comparison fails the check.

A push to `main` is not compared: it selects the application whatever it changed. A newer push cancels an
unfinished run on `main`, so every default-branch run has to check what the cancelled one would have. It
is also where a dependency the table below does not list shows up.

| Pull request input | Jobs in addition to repository policy |
|---|---|
| Root README files, `AGENTS.md`, `CLAUDE.md`, `LICENSE`, `build/README.md`, `docs/**/*.md`, `docs/prototypes/**` | No application jobs |
| `src/**`, `engine/**`, `e2e/**`, `build/**`, other `scripts/**`, application build/test/TypeScript configuration | `app-checks`, `e2e` |
| Root package/lockfile, ESLint config, capability declarations, `.gitignore`, workflows, `scripts/ci-*`, the shared workflow test helper | `app-checks`, `e2e` |
| Mixed inputs or a path outside these categories | `app-checks`, `e2e` |

Shared inputs take precedence over documentation. A Markdown file under application source is content, not an
extension-based exemption.

- `repo-policy` always runs CI routing/wiring tests, shared-piece/document/prototype checks, working
  language checks and the raw-NUL check.
- `app-checks` installs only the root package and the Rust toolchain `engine/rust-toolchain.toml` pins, and
  runs typecheck, `lint`, unit tests, the engine module's Rust tests (`pnpm test:engine`), script tests, and the
  application copy check. The unit tests build the
  engine module (ADR-0045) from source for linux-x64 before any test runs. `e2e` installs the same toolchain,
  builds the engine module and the app, and drives Electron.
- `ci-gate`, displayed as **CI gate**, always evaluates all those results. Classification and policy
  must succeed; a selected application job must succeed; a deliberately unselected job may be skipped.
  Failures, cancellations, missing results and invalid flags fail the gate. It installs no dependencies.

`pnpm lint` and `pnpm verify` remain full local entry points. `pnpm test:ci` tests routing
and workflow wiring without building the app.

## Required checks and migration

The active default-branch ruleset requires exactly these GitHub Actions checks:

- `CI gate`
- `message language (PR title, body, commits)`

The ruleset was switched on 2026-11-10, after the gate passed on the implementation PR and `main`.
The stored configuration was read back: enforcement is active, the target is the default branch,
and there are no bypass actors. Other protection settings were retained.

The old `typecheck + unit tests + shared-piece consistency` forwarding job is removed. The actual
`e2e(Electron)` job still runs whenever the application scope is selected; its result is enforced by `CI gate` rather
than being independently required. A deliberately skipped application job therefore does not strand a PR.

When changing required check names again, first make the replacement report a successful result,
update and read back the online ruleset, and only then remove the old job. Verify that a failed
required result blocks merging. Opening a PR does not itself change the online ruleset.

## Merging without the owner's approval

`capabilities.toml` declares `docs-auto-merge`: the agent merges a pull request that changes no executable
content once every CI run on its head has succeeded, without waiting for the owner. Every other pull
request waits for the owner's approval. The conditions, and how the agent establishes each of them, are
the delivery rules of the `implement` skill and are not repeated here.

"No executable content" reaches further than the specs: it is every file under `docs/`, every Markdown
file anywhere, and a change of comments alone in a JavaScript, TypeScript or Python file. Two kinds of
file inside that reach still wait for approval, because the owner asks to see a pull request that changes
either before it merges (the line under Engineering in `AGENTS.md`):

- `AGENTS.md` and `CLAUDE.md`: every session loads them, so a change binds all the work that follows.
- Anything under `docs/prototypes/`, its scripts and styles included: a change inside the prototype gate is
  built to its confirmed prototype (ADR-0033).

A pull request that changes one of those files together with other documents waits as a whole. The rest
of that reach merges without approval: among it the specs, the ADRs, the glossary, the postmortems, the
runbooks (this one included) and the READMEs, and those comment-only changes.

The owner chose this on 2026-11-10 and set the two exceptions on 2026-11-11, with these costs stated:

- The owner sees such a change only after it is in `main`.
- It has had no independent review: with no executable content changed, the delivery sends it to none.
- A tool can read a comment, and a comment-only change merges all the same.

The checks such a pull request passes are those the table above gives its paths. One that changes only
the documentation paths of the first row passes repository policy, the CI gate and the message-language
check; one that changes comments in source also passes the application jobs of those paths.

To end it, set `enabled = false` under `[docs-auto-merge]`.

## Other workflows and deployment

Message language remains separate and also runs when the PR title/body is edited; that edit does not
restart the application tests. Release still runs on release tags and manual dispatch, with its existing gates.
Download count, the download count's watchdog, runs every hour and on manual dispatch, never on a pull request, and
holds no secret ([its runbook](download-count.md)).

Agentshed's website is not built or deployed from this repository: the
[aloong-planet-home](https://github.com/aloong-planet/aloong-planet-home) repository deploys it to Cloudflare Pages
(see its [deployment runbook](https://github.com/aloong-planet/aloong-planet-home/blob/main/docs/ops/deployment.md)),
and a push here deploys nothing. The GitHub CI routing does not modify that account configuration.
