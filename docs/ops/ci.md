# Continuous integration

Requirements: [CI routing](../specs/ci-routing.md). The `CI` workflow runs on pull requests targeting
`main` and pushes to `main`. Do not add workflow-level path filters: the final required check needs a
result even when no product tests are necessary.

## Jobs and paths

`changes` compares the event's commits using Git: the merge base to the head for a pull request, before
to after for a push. Its summary explains every path. Deletions count, moves count at both locations,
and unfamiliar paths select both products. Failure to read the comparison fails the check.

| Input | Jobs in addition to repository policy |
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

The existing ruleset requires `typecheck + unit tests + shared-piece consistency`, `e2e(Electron)` and
`message language (PR title, body, commits)`. The first name is retained by the `checks` compatibility
job: it succeeds only when **CI gate** succeeds. The existing E2E name stays attached to the conditional
Electron job. Thus the existing rules already enforce the stable gate indirectly for every PR.

To finish the naming migration after the new gate has passed on a pull request:

1. In Settings → Rules → Rulesets → main, require `CI gate` from GitHub Actions and keep
   `message language (PR title, body, commits)`.
2. Remove the old composite and E2E names from the required list in the same ruleset update; retain
   active enforcement, the default-branch target and no bypass actors. Read back the stored ruleset.
3. Only then remove the compatibility job. Product jobs remain conditional and are enforced by the gate.

Do not delete or rename an old required job before that switch. Opening a PR does not perform this
online configuration change. Test a required-result failure as well as a successful run before switching.

## Other workflows and deployment

Message language remains separate and also runs when the PR title/body is edited; that edit does not
restart product tests. Release still runs on release tags and manual dispatch, with its existing gates.

Cloudflare Pages deployment is separate; its build watch paths and preview/production branches are
configured in Cloudflare. The declared settings are in [the website README](../../site/README.md#deploying-cloudflare-pages).
The GitHub CI routing change does not modify that account configuration. Do not require a deployment
check that Cloudflare omits when it skips a build.
