# Ticket #253 — task list

Upgrade the GitHub Actions in every workflow to their current majors. Working record, not a requirement authority: the
release line's requirements are [the mac-distribution spec](../../specs/mac-distribution.md); the coverage checklist is
[checklist.md](checklist.md). Branch `chore/actions-current-majors`, in its own worktree, cut from `origin/main` at
9685ccf (no commits ahead when cut).

## Facts found before deciding (2026-10-26)

- The repository has three workflows, not the two the ticket named: `ci.yml`, `release.yml`, and `message-language.yml`
  (added on 2026-10-08, before the ticket was written; `ls .github/workflows`). The third uses checkout,
  pnpm/action-setup and setup-node at `@v4`, as `ci.yml` does.
- The blocker is met: `v0.1.0-beta`'s release run 39755502301 (2026-10-22) ran the release line end to end, and the
  pre-release is published. #239 stays open for the offline first launch only (deferred to #240), which this ticket
  does not need.
- The current majors on 2026-10-26 are those the ticket names for 2026-10-18; each tag resolves to one commit, whose
  `action.yml` runs on node24 ([evidence/ticket-253/actions-and-targets.txt](evidence/ticket-253/actions-and-targets.txt)):

  | Action | Before (release.yml's pin) | Target |
  |---|---|---|
  | actions/checkout | v4.4.0 `11d5960a…` | v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1` |
  | actions/setup-node | v4.4.0 `49933ea5…` | v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1` |
  | pnpm/action-setup | v4.3.0 `b906affc…` | v6.1.0 `ea17c68df8912ef543352723c149a84f56e3d413` (the annotated tag peeled) |
  | actions/upload-artifact | v4.6.2 `ea165f8d…` | v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
  | actions/download-artifact | v4.3.0 `d3f86a10…` | v8.0.2 `9000827ccba6bdab643e8b6fd33ac0654aef8333` |

- Breaking changes between version 4 and the target, read in every release's notes
  ([evidence/ticket-253/release-notes/](evidence/ticket-253/release-notes/)) against how the workflows use each action:

  | Action | Breaking change | This repository | Conclusion |
  |---|---|---|---|
  | checkout | v5: node24, runner 2.327.1 or newer | GitHub-hosted runners only | No effect |
  | checkout | v6: credentials persisted to a separate file | `release.yml` sets `persist-credentials: false`; `ci.yml` and `message-language.yml` run no authenticated git after checkout (`message-language.yml` lists commits from the fetched history, `fetch-depth: 0`) | No effect |
  | checkout | v7 (and v5.1.0, v6.1.0): refuses to check out a fork's pull request under `pull_request_target` or `workflow_run` unless `allow-unsafe-pr-checkout` | the workflows run on `push`, `pull_request` and `workflow_dispatch` | No effect |
  | checkout | v6.0.2: tag handling (annotations kept, explicit `fetch-tags`) | the tag check reads `GITHUB_REF_NAME`, not git (`scripts/release-tag.mjs:27`); the publish and mirror scripts run no git | No effect |
  | setup-node | v5: automatic caching from `package.json`'s `packageManager`; v6 narrowed it to npm | `packageManager` is `pnpm@9.12.3` (root and `site/`), so nothing is cached unless asked; the jobs that cache name `cache: pnpm` after pnpm/action-setup, as before | No effect: the publish, mirror and pointer jobs stay uncached |
  | setup-node | v5: node24; v6: `always-auth` removed; v7: ESM, no dummy `NODE_AUTH_TOKEN` | no `always-auth`, no `registry-url` | No effect |
  | pnpm/action-setup | v4.4.0, v5: node24; v6: pnpm 11 support, bootstrapping then self-updating to the version `packageManager` pins (fixed in v6.0.7); v6.1.0: pnpm 12 | `packageManager` pins pnpm 9.12.3, no `version` input; the action states it supports pnpm 12 and earlier | To be shown by the runs: the installed pnpm must still be 9.12.3 |
  | pnpm/action-setup | v6.0.10's README points to a successor, `pnpm/setup` | `pnpm/setup` requires pnpm 11 or newer (its README, at the target commit) | Not applicable: the project is on pnpm 9 |
  | upload-artifact | v5, v6: node24; v7: ESM, `archive: false` for single files (default stays zipped) | uploads by name, zipped | No effect |
  | download-artifact | v5: a single artifact downloaded by ID extracts into the path directly | downloads by name (`name: agentshed-macos`), unchanged | No effect |
  | download-artifact | v8: a non-zipped file is not unzipped; a hash mismatch fails by default | the artifact is uploaded zipped by upload-artifact v7 | No effect; a mismatch now fails the job, as it should |

- The two artifact actions work with each other as a pair: upload-artifact v7 and download-artifact v8 are released
  together (both 2026-02-26, both updated 2026-10-07 to `@actions/artifact` 6.3.1). Only `release.yml` both uploads and
  downloads; the download runs in the publish, mirror and pointer jobs, which only a tag push reaches (the ticket's
  third item).
- The repository's default workflow token is read-only, and it has no Dependabot configuration.

## Decisions

| # | Decision | Answer and reason |
|---|---|---|
| D1 | Whether `ci.yml` (and `message-language.yml`) are pinned as `release.yml` is (the ticket: "decided here") | Pinned to full commits with the version in a comment: the owner's answer on 2026-10-26, "pin them to commits too (recommended)" (in Chinese). One rule for every workflow, held by a static test of every workflow file; CI is the required check for merging to `main`, so an action that moved under its tag could pass a bad pull request |
| D2 | Whether `message-language.yml` is upgraded here | In this change: the owner's answer on 2026-10-26, "upgrade it too (recommended)" (in Chinese). Its actions are the same version 4 actions. The issue body was rewritten on 2026-10-26 to name three workflows and the pinning rule |
| D3 | pnpm/action-setup or its successor `pnpm/setup` | pnpm/action-setup v6, its current major: `pnpm/setup` needs pnpm 11 or newer and the project is on pnpm 9.12.3. A fact, not a choice: moving pnpm is out of this ticket |
| D4 | Where the pinning rule is held | A static test of every workflow file in `.github/workflows/`, enumerated from the directory so a new workflow is covered; it replaces `release-workflow.test.mjs`'s release-only case, so the rule is checked in one place. The rule's statement: `CONTEXT.md`'s invariants, and the release runbook's "Actions" bullet |

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Facts: the current releases and commits, the release notes, the blocker | `evidence/ticket-253/` | done |
| 2 | Records declared on #253 and its document sync checklist | `ticket-253-doc-sync.md`, the issue body | done: the issue body rewritten on 2026-10-26 (records, three workflows, the pinning rule) |
| 3 | Test design review | `ticket-253-review-tests.md`, Design review | done: no finding; W3's row revised while writing it (the record's incremental note) |
| 4 | Slices: S1 the static test of every workflow; S2 the three workflows on the targets | the static test red on `main`'s workflows, green after; actionlint | done: the three cases red on `main`'s workflows, each at its own assertion (`evidence/ticket-253/red-first.txt`); green after S2; actionlint 0 errors on the three files and shown able to fail (`evidence/ticket-253/targeted.txt`, `TARGETED_EXIT=0`) |
| 5 | Code review | `ticket-253-review-code.md` | done: P1 (a cause in the new test's header stated wider than the ruleset) and C1 (`ci.yml`'s comment on `test:scripts`), both fixed before the commit; no refactoring |
| 6 | Full gateway | `evidence/ticket-253/gateway-2e9d247.txt` | 2e9d247: `VERIFY_EXIT=0` on its clean tree (873 unit, 137 script tests, 107 site, 155 e2e in 4.9 min, smoke OK, actionlint 0 errors) |
| 7 | Independent post-implementation test check | `ticket-253-review-tests.md` | done on 9685ccf..008b71f: no finding; no fix, so no incremental check |
| 8 | Spec check, step 7 write-back (`CONTEXT.md`, the runbook, the checklist's rows), step 8 | `final-regression.md` | done: the spec check below; `CONTEXT.md` and the runbook written with the implementation commit; the checklist's current-verification row; step 8, the #253 section of `final-regression.md` |
| 9 | Runs on the upgraded actions: CI on the pull request; a manual `release.yml` run with the switch off, its artifact downloaded | run links, `evidence/ticket-253/` | The manual run done: 40265409861 on 008b71f, green; pnpm switched to 9.12.3; the artifact downloaded, its digest equal to the upload's (`evidence/ticket-253/manual-run.txt`). CI: the checks on #312's head, linked in #253's comment after the merge |
| 10 | PR; stop for the owner | PR link | done: #312, waiting for the owner |

## Targeted verification (step 4)

The tests that read what this change touched, found by search rather than recalled (`evidence/ticket-253/targeted.txt`):
the workflows are read by `scripts/release-workflow.test.mjs` and the new `scripts/workflow-actions.test.mjs`;
`package.json` by `scripts/release-tag.test.mjs` and `build/mac-packaging.test.cjs`. All four are in `pnpm test:scripts`,
which passed (137), with typecheck, lint, the language and NUL checks, and actionlint. No product code changed, so no
unit or e2e test reads the change.

## Spec check before step 7 (2026-10-26, implementation 2e9d247, spec as on `main`)

| Unit | Spec text, in short | Implementation | Conclusion |
|---|---|---|---|
| mac-distribution::REQ-002, US-002/AC-02, AC-03, AC-05, REQ-001/AC-03, REQ-003, CON-003 | the tiers, the gates, the kept artifacts and logs, the publication, the fail-closed credentials | `release.yml`'s jobs, conditions, steps and inputs unchanged; only each action's commit moved. The static workflow test's condition cases pass unchanged; the manual run without the switch took the local tier on the new actions | Met, unchanged |
| Testing Decisions, "The workflow conditions get a static test …" | a static test of the conditions, a regression guard only | `release-workflow.test.mjs` keeps every condition case; its pinning case moved to the new test of every workflow | True |
| Implementation Decisions, "A release workflow …" | the gate, publish, mirror and pointer jobs | unchanged | True |

Scope added without a spec line: the static test of every workflow and the rule it holds — a repository rule, stated in
`CONTEXT.md`'s invariants rather than in a feature's spec. Deviations from the spec: none.

## Deferred acceptance

#253's third item — the publish job's download step on download-artifact v8 — runs only on a tag push. Arrangement, as
the ticket states it ("Waiting: the next release tag"), written by the owner's choice when the ticket was cut
(2026-10-18) and kept in the body rewritten on 2026-10-26:

- Trigger: the next release tag's run (the next pre-release, #240, is the one planned).
- Verifier: whoever cuts that tag.
- Method: the publish job's "Download" step and the publish step after it pass, reading the gate job's artifact.
- Evidence: the run's link on #253 (its item ticked when it passed) and a current-verification row in
  [checklist.md](checklist.md) against the "#253, regression" row; the follow-up is listed in
  [ticket-240-doc-sync.md](ticket-240-doc-sync.md).
