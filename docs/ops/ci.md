# Continuous integration

Requirements: [CI routing](../specs/ci-routing.md). The `CI` workflow runs on pull requests targeting
`main` and pushes to `main`. Do not add workflow-level path filters: the final required check needs a
result even when no product tests are necessary.

## Jobs and paths

`changes` routes a pull request by its changed paths. It compares the merge base with the head using Git,
and its summary explains every path. Deletions count, moves count at both locations,
and unfamiliar paths select both products. Failure to read the comparison fails the check.

A push to `main` is not compared: it selects both products whatever it changed. A newer push cancels an
unfinished run on `main`, so every default-branch run has to check what the cancelled one would have. It
is also where a dependency the table below does not list shows up.

| Pull request input | Jobs in addition to repository policy |
|---|---|
| Root README files, `AGENTS.md`, `CLAUDE.md`, `LICENSE`, `site/README.md`, `build/README.md`, `docs/**/*.md`, `docs/prototypes/**` | No product jobs |
| Other `site/**` files | `site-checks` |
| `src/**`, `e2e/**`, `build/**`, other `scripts/**`, application build/test/TypeScript configuration | `app-checks`, `e2e` |
| `src/renderer/src/theme.css` | Both products: the website's palette test reads it |
| Root package/lockfile, ESLint config, capability declarations, `.gitignore`, workflows, `scripts/ci-*`, the shared workflow test helper | Both products |
| Mixed inputs or a path outside these categories | Union of scopes; unknown paths select both |

Shared inputs take precedence over documentation and individual product scopes. A Markdown file under
application or website source is content in that product, not an extension-based exemption.

- `repo-policy` always runs CI routing/wiring tests, shared-piece/document/prototype checks, working
  language checks and the raw-NUL check.
- `app-checks` installs only the root package and runs typecheck, `lint:app`, unit and script tests,
  and the application copy check. `e2e` builds and drives Electron.
- `site-checks` installs the root lint tools and the website's own dependencies, then runs `lint:site`
  and `test:site`. The site's test setup builds it once into a fresh directory.
- `ci-gate`, displayed as **CI gate**, always evaluates all those results. Classification and policy
  must succeed; a selected product job must succeed; a deliberately unselected job may be skipped.
  Failures, cancellations, missing results and invalid flags fail the gate. It installs no dependencies.

`pnpm lint` and `pnpm verify` remain full local entry points. `pnpm lint:app` excludes only `site/`;
`pnpm lint:site` covers that directory with the same root configuration. `pnpm test:ci` tests routing
and workflow wiring without building the app or website.

## Required checks and migration

The active default-branch ruleset requires exactly these GitHub Actions checks:

- `CI gate`
- `message language (PR title, body, commits)`

The ruleset was switched on 2026-11-10, after the gate passed on the implementation PR and `main`.
The stored configuration was read back: enforcement is active, the target is the default branch,
and there are no bypass actors. Other protection settings were retained.

The old `typecheck + unit tests + shared-piece consistency` forwarding job is removed. The actual
`e2e(Electron)` job still runs whenever the application scope is selected; its result is enforced by `CI gate` rather
than being independently required. Deliberately skipped product jobs therefore do not strand a PR.

When changing required check names again, first make the replacement report a successful result,
update and read back the online ruleset, and only then remove the old job. Verify that a failed
required result blocks merging. Opening a PR does not itself change the online ruleset.

## Merging without the owner's approval

`capabilities.toml` declares `docs-auto-merge`: the agent merges a pull request that changes no executable
content once every CI run on its head has succeeded, without waiting for the owner. Every other pull
request waits for the owner's approval. The conditions, and how the agent establishes each of them, are
the delivery rules of the `implement` skill and are not repeated here.

The owner chose this on 2026-11-10, with these costs stated:

- The owner sees a change to a spec, an ADR or the glossary only after it is in `main`.
- Such a pull request has had no independent review: with no executable content changed, the delivery
  sends it to none.
- A change of comments alone in a JavaScript, TypeScript or Python file counts as no executable content,
  although a tool can read a comment. The owner kept this case in on 2026-11-11.

The checks such a pull request passes are those the table above gives its paths. One that changes only
the documentation paths of the first row passes repository policy, the CI gate and the message-language
check; one that changes comments in source also passes the product jobs of those paths.

To end it, set `enabled = false` under `[docs-auto-merge]`.

## Other workflows and deployment

Message language remains separate and also runs when the PR title/body is edited; that edit does not
restart product tests. Release still runs on release tags and manual dispatch, with its existing gates.

Cloudflare Pages deployment is separate; its build watch paths and preview/production branches are
configured in Cloudflare. The declared settings are in [the website README](../../site/README.md#deploying-cloudflare-pages).
The GitHub CI routing change does not modify that account configuration. Do not require a deployment
check that Cloudflare omits when it skips a build.
