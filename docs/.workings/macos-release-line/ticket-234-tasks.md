# Ticket #234 — task list

Release by pushing a tag. Working record, not a requirement authority (the spec is
`docs/specs/mac-distribution.md`). Checkpoints are what proves each step done.

Decisions taken with the owner on 2026-10-18, before implementation:

- **How the manual verification run reaches a workflow that is not on `main` yet**: GitHub dispatches a workflow
  only when a file at its path is on the default branch, and the run then uses the file at the dispatched ref
  (GitHub's documentation: the `workflow_dispatch` event, and "each workflow run will use the version of the
  workflow that is present in the associated commit SHA or Git ref of the event"). The owner chose to merge a
  placeholder `release.yml` first (PR #252), then dispatch the real workflow from this branch with
  `gh workflow run release.yml --ref feat/release-workflow`, and open this ticket's pull request only after the
  runs passed. Rejected: merging first and verifying on `main` (the pull request would open with its acceptance
  unverified); a temporary push trigger (it exercises another trigger than the one delivered); a local
  `dist:mac:release` instead (not the CI run, and the CI keychain import untested).
- The verification switch's input is named `verify`.
- The publish job's first note is one factual line; the owner's note replaces it after the release is checked
  (github-ops §5).
- `pnpm test:scripts` (the asset's tests and this ticket's) joins the CI workflow's checks job.
- Failure A6 (a version with build metadata, or not semver, fails at the tag check), derived to make the pre-release
  test exact, was confirmed by the owner on 2026-10-18, as were the tickets for the two findings outside the change
  (#254, #253).
- Every action in `release.yml` is pinned to a full commit SHA; `ci.yml` keeps its tags.

Coordination (2026-10-18, with the session doing #237): PR #255 (the landing page) also edits `ci.yml`'s checks job
— a site install after the root install, `pnpm test:site` right after `pnpm test` (where this ticket puts
`pnpm test:scripts`), and `cache-dependency-path` on setup-node — and adds `pnpm test:site` to `package.json`'s
`verify` after `test:scripts`. Whichever of #255 and #234 merges second rebases and keeps both steps; this ticket
trial-merges against `main` before its pull request opens.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Placeholder `release.yml` on `main`, dispatch-only, inert | PR #252 merged by the owner | done: merged as 75fa4a8 on the owner's confirmation (2026-10-18); the first CI run hit an unrelated e2e flake, now #254; branch deleted |
| 2 | Test design review (`/review-tests`, design review) | `ticket-234-review-tests.md`, design section | done: the table, re-reviewed after each change of seam or case (the publish store, P10, P11) |
| 3 | Tag check (Failure A1): `scripts/release-tag.mjs` | its tests red then green | done: T1–T4, each red on its assertion first |
| 4 | Publish script (REQ-003, Failures C3, C5): `scripts/publish-release.mjs` | its tests red then green | done: P1–P11, G1–G3; those green on first run proven by mutation |
| 5 | `release.yml`: gate job, publish job; the static workflow test | `scripts/release-workflow.test.mjs` red then green | done: S1–S10; actionlint clean (shown able to fail) |
| 6 | `ci.yml`: the stale comment; `pnpm test:scripts` in the checks job; `package.json` wiring | the new tests run in `pnpm test:scripts`; a mutation turns it red | done: `pnpm test:scripts` exit 1 on a mutation, 0 restored; seen in CI on the pull request |
| 7 | Full verification gateway | `pnpm verify` exit 0 | done: exit 0 (830 unit, 82 script, 135 e2e, smoke); again after the rebase |
| 8 | After #252 merges: rebase onto `main`, push, dispatch without the switch (local packaging) | run link; artifacts; the run used this branch's file | done: based on 75fa4a8 with no conflict (the branch had no commits; the placeholder became a modification); run 39125515039 passed, ran this branch's file, published nothing; its artifact's layout exposed R2, fixed in 1444b6b (evidence/ticket-234/local-run.txt) |
| 9 | Dispatch with the switch (tell the owner first): release packaging, Apple, every gate | run link; artifact list; the two notary logs; durations | done: the owner approved each attempt; 39134948592 failed at Apple's authentication (APPLE_ID corrected by the owner, checked locally with notarytool history, re-imported); 39140793605 passed every gate on 1444b6b, the downloaded DMG checked independently (evidence/ticket-234/verification-run-1.txt, -2.txt) |
| 10 | Step 5 `/review-code`, step 6 `/review-tests`, spec final check, step 7, step 8 | records | done: review records written and updated for R2; spec write-back (decisions, A6, the Pending note); step 7: no new ADR or term (the decisions are the spec's and the runbook's), ADR-0031 corrected; step 8 skipped by its two questions (ticket-234-doc-sync.md) |
| 11 | Document sync, Current verification row, the issue's boxes, PR; stop for the owner | PR link | done: `pnpm verify` exit 0 on 07b9346 (830 unit, 83 script, 135 e2e, smoke); a trial merge into origin/main (75fa4a8) is clean; the doc sync checklist has no Pending row; the issue updated; the pull request opened with "Part of #234" (two items wait for the first formal release), stopped for the owner |
