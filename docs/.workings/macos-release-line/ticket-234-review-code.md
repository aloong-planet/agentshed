# Code review — ticket #234

Ticket: [#234 Release by pushing a tag](https://github.com/aloong-planet/agentshed/issues/234)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

- Date: 2026-10-18
- Version: branch `feat/release-workflow`, reviewed on 26b9216's uncommitted working tree after `pnpm verify` exit 0;
  the branch then moved onto 75fa4a8 unchanged (f5e7bdc), and R2's fix is 1444b6b, where both manual tiers ran
- Scope: `.github/workflows/release.yml` (new; its placeholder went to `main` first as PR #252),
  `scripts/release-tag.mjs`, `scripts/publish-release.mjs` and their tests, `scripts/release-workflow.test.mjs`,
  `.github/workflows/ci.yml` (the stale comment; `pnpm test:scripts` in the checks job), `package.json`
  (`test:scripts`; the `@actions/expressions` dev dependency) and the lockfile

## Underlying premises

- **GitHub runs the dispatched ref's file once a file at that path is on `main`.** From GitHub's documentation (the
  `workflow_dispatch` event; "each workflow run will use the version of the workflow that is present in the
  associated commit SHA or Git ref of the event"). Observed: run 39125515039, dispatched with `--ref` on this
  branch while `main` held the placeholder, ran the gate job (`macOS packaging and gates`), not the placeholder's
  `release placeholder`.
- **Org secrets reach a dispatch from this branch.** The five are organization secrets visible to this repository
  only (names checked with `gh api repos/aloong-planet/agentshed/actions/organization-secrets`); no environment
  gates them. Observed in both dispatches: the requirement steps were skipped, the certificate signed, and the
  Apple credentials reached `notarytool` (rejected once for a wrong `APPLE_ID` value, accepted after the owner
  corrected it).
- **An unset secret reads as an empty string**, so `secrets.X != ''` is false for it: GitHub's documentation on
  the secrets context. The static test evaluates both an empty and an absent secret.
- **`gh` finds a draft by its tag.** Read in gh's source (`pkg/cmd/release/shared/fetch.go`: `FetchRelease` looks
  up the published release and, through GraphQL, a draft with that pending tag). Every flag the adapter sends was
  checked in `gh release create|edit|delete|list --help` (gh 2.97.0).
- **A release asset carries a sha256 `digest` from upload**, drafts included: GitHub's changelog of 2025-06-03
  ("Releases now expose digests for release assets": generated at upload time) and real `gh release view --json
  assets` output. Not observed on a draft; if it were missing there, publishing fails closed (nothing public, the
  run red), and the first tag push shows it.
- **`@actions/expressions` evaluates as GitHub does** for the operators these conditions use (`==`, `!=`, `&&`,
  `||`, `startsWith`, `contains`, null against `''`). It is GitHub's published implementation, not the runner's.
  Stated as a gap in the test's header.
- **Comments that state causes**, each checked: a secret cannot appear in a step's `if` (GitHub's documentation;
  policy §5); an empty `CSC_LINK` read as a path — first written as a fact, now cited to the policy (§4), which
  records it; a rejection's Apple log is in the job log (the asset's `writeError`); drafts are visible only to the
  repository's writers (GitHub's documentation); the tag check makes the `-` rule exact (T3).

Finding: one comment stated a cause not verified here (the empty `CSC_LINK`) — fixed by citing its source.

## Runnability

- `pnpm verify` exit 0 on the working tree: typecheck, lint, 830 unit tests (1 skipped, as on `main`), 82 script
  tests (the asset's 51 and this ticket's 31), `check:ui`, `check:lang`, `check:i18n`, `check:nul`, 135 e2e,
  smoke. After the review's edits, `pnpm test:scripts` (83, with P11), `pnpm lint` and actionlint again exit 0.
- actionlint 1.7.12 on both workflows: no error. Shown able to fail: a copy with `timeout-minute` reported
  `unexpected key` and exit 1. Its shellcheck rule did not run (shellcheck is not installed); the run blocks are
  two `echo` + `exit 1` pairs, run with `bash -e` by the static test.
- The gate job's paths: a failed requirement stops every later step (no status function after it except the
  `failure()` upload, which is handed no credential); a failed packaging skips the success upload and keeps the
  notary logs.
- **R2, a bug found by the manual run and fixed**: the review first stated that the uploaded artifact is rooted at
  `release/<version>/`, so the publish job would read `artifact/<file>` — a premise taken from upload-artifact's
  least-common-ancestor rule and not observed. The run's artifact (39125515039) holds
  `0.1.0/Agentshed-0.1.0-mac-arm64.dmg`: the root is `release/`, the part of the paths before the first wildcard.
  The publish script read only the top level, so the first tag push would have failed to publish (closed: nothing
  public, the run red). The publish tests' fixture had the same imagined flat shape, which is why no test caught
  it. Fixed by test first: the fixture now has the downloaded layout, every publish case went red with "no DMG in
  <root>", and the script now requires exactly one directory named for the version (another version's directory
  fails before GitHub is touched). The fixed script then published the real downloaded artifact against a
  stand-in store: the uploaded file's sha256 equalled the DMG's
  (`f28143714fe78cd218deb0b29a1ce944f04bc8c279c34646b424635ff507cd3c`).
  Class check, "an assumption about a tool's output shape, not observed":
  - the gate job's upload root: wrong (R2);
  - `gh`'s JSON fields: observed on real output;
  - the asset's file names: observed in #233 and in this run;
  - download-artifact extracting a named artifact straight into its `path`: documented, not yet observed — the
    first tag push runs it;
  - a draft asset's digest: documented, not yet observed — the same run.
- The publish job's paths: no DMG, a DMG of another version → fails before touching GitHub; a public release for
  the tag → refused; leftover drafts → removed; a partial or altered upload → nothing public, the draft left for
  diagnosis; published but not marked as intended → the run fails. Escape surface: each path fails this run only.
- **R1, examined (not a bug)**: two runs for one tag overlapping (a tag deleted and pushed again mid-run) — could
  this run's read-back by tag find the other run's public release and act on it? The per-file check stops it: a
  public release from another build holds other bytes under the same name, so the digest check refuses before
  anything is published, and identical bytes are not a mix. Written first as a fix with its own error, the test
  went red on the existing check, which is what showed this; it stays as P11, guarding the refusal. No
  `concurrency` setting is added: nothing requires it.
- The two manual tiers on GitHub, with the real secrets and Apple:
  - without the switch, run 39125515039: local packaging, signed, not notarized, nothing published; it exposed R2;
  - with the switch, run 39134948592: failed at Apple's authentication (401: `APPLE_ID` held a value other than the
    account's email), the failing step and Apple's message kept in the job log, nothing published;
  - with the switch again, run 39140793605 on 1444b6b: every gate passed, Apple's two logs kept unaltered, the
    downloaded DMG and its app checked independently.

  Evidence in `evidence/ticket-234/`. Not run: the tag tiers. The publish job's first real run is the first
  pre-release tag (#239); a formal release's Latest is the first formal release.

## Security

- Credentials: the five secrets reach only the two packaging steps (the local one gets the certificate only, never
  Apple's credentials), and the gate job's booleans only compare them (S6). No `run` block interpolates `${{ }}`;
  the tag reaches the scripts as `GITHUB_REF_NAME` and `gh` as an argument array, never through a shell. `gh`
  reads `GH_TOKEN` from the environment and the script prints `gh`'s output, never its arguments' secrets (there
  are none) or the token.
- Permissions: the workflow's token reads; only the publish job may write contents. Both checkouts drop the
  persisted credential.
- Supply chain: every action pinned to a commit (the owner's decision). `pnpm install` runs before any credential
  is in the environment; the packaging step then runs the project's own toolchain with them, as locally.
- The asset passes the Apple password to `notarytool` as an argument (visible in the runner's process list while it
  runs, never in logs) — recorded in #233's review; the runner is single-use.

## Consistency

- Job names follow `ci.yml`'s lower-case style and do not collide with the three required checks. Comments state
  reasons, as in `ci.yml`. Tests sit in `scripts/` with `node:test`, as `check-raw-nul.test.mjs` does, and reuse the
  asset's YAML loader rather than adding a parser. The two CLIs use the asset's error convention (`[mac]` there,
  `[release]` here; exit code 1).
- Invariants touched: the three required checks keep their names (`pnpm test:scripts` is a step inside the existing
  job); `ci.yml`'s remaining comment ("local verify and the release process guard it") stays true.
- Smells: none found in the new code. `publishRelease` is about forty lines, one straight sequence whose steps each
  carry their reason; splitting it would scatter the order it exists to keep.

## Findings outside this change

| Finding | Impact | Suggested | Destination |
|---|---|---|---|
| `e2e/app-update.spec.ts:159` is flaky on CI: the scripted download moves on every 700 ms and the case expects to read 0 first (PR #252's run 39122036829 read 20, 40, 60; the rerun passed) | Any pull request's required `e2e(Electron)` check can go red at random; reruns teach people to ignore red | A ticket like #247: the case asserts that an open message follows the progress, without needing to catch the first step | The owner chose a ticket (2026-10-18): [#254](https://github.com/aloong-planet/agentshed/issues/254) |
| The actions are at v4 in both workflows (`release.yml` pins v4's current commits); current majors are checkout v7, setup-node v7, pnpm/action-setup v6, upload-artifact v7, download-artifact v8 | None today (the v4 actions run; `ci.yml` passed on 2026-10-18). They will need upgrading when GitHub retires their runtime | One change that upgrades both workflows together, after this release line has run once | The owner chose a ticket (2026-10-18): [#253](https://github.com/aloong-planet/agentshed/issues/253), blocked by #239 |

## Conclusion

One bug, found by the manual run without the switch and fixed test first: the publish step read the artifact at the
wrong depth (R2). One comment's unverified cause now cites its source. R1 examined and shown already refused, kept
as a regression case (P11). Two findings outside the change became #254 and #253 by the owner's choice. The dispatch
tiers have run on GitHub with Apple (above); open: the tag tiers (#239, the first formal release).
