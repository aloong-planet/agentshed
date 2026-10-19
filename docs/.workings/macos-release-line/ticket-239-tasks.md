# Ticket #239 — task list

Ticket: [#239 Launch v0.1.0-beta: the first pre-release, the live landing page and the README](https://github.com/aloong-planet/agentshed/issues/239)
· feature `macos-release-line` · specs [mac-distribution](../../specs/mac-distribution.md),
[landing-page](../../specs/landing-page.md). Branch `feat/launch-beta`, in the worktree `agentshed-wt/update-zip`,
cut from `origin/main` at bedc384 (no commits ahead when cut).

## Facts established before the change (2026-10-19)

- The blockers are closed: #232, #235 (merged as e13f4ae) and #238. The owner action is done: the domain serves the
  landing page (`curl` of `https://agentshed.aloongplanet.com/` and `/en/`: 200, the list state's "download from
  GitHub" button), from the Pages project the site README's "Deploying" section describes.
- No release and no tag exist (`gh api …/releases`: 0; `…/tags`: none). The package version is 0.1.0.
- Nothing reads the package version but the tag check and the packaging (`rg` for `0.1.0` and for version reads:
  the tests use literals; e2e reads the running version at run time).
- The Pages deploy guide the document sync checklist planned (`docs/ops/pages-deploy.md`) already exists as the site
  README's "Deploying (Cloudflare Pages)" section (#237, #266): no second copy.
- The release steps followed: `github-ops` §4–§5, its release-note template, and electron-scaffold's
  `macos-signing.md` (the guide `capabilities.toml`'s `client-framework = "electron"` selects), §7 and §10.

## Owner decisions in this ticket

- 2026-10-19, the feature entries: the feature catalogue's rule leaves distribution out, so mac-distribution gets no
  entry; the landing page gets one. Asked with three options (no entry for either, recommended; both; the landing
  page only); the owner chose the landing page only.
- 2026-10-19, the settings page's ready line: with the version 0.1.0-beta it wraps to two lines in French and
  Japanese (app-update::QR-001/AC-02; the gateway's e2e red, measured in
  `evidence/ticket-239/ready-line-measurements.txt`). Asked with three options (shorten the two languages' copy,
  recommended; change the row's layout; the owner's own copy). The owner chose to drop French, Spanish, Russian
  and Japanese from the app and from the READMEs, before the first release: [#277](https://github.com/aloong-planet/agentshed/issues/277),
  which blocks this ticket. So the four READMEs are returned to main's text here, and #277 removes them.

## Interface gate

No interface of the app changes. The READMEs are text (the exception mac-distribution's Further Notes states); the
landing page is not changed, only described.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Branch from the latest main | no commits ahead | done: bedc384 |
| 2 | The package version 0.1.0-beta (REQ-006) | the tag check accepts `v0.1.0-beta` and refuses `v0.1.0` | done: 5b63b16 |
| 3 | The READMEs' download and install instructions (US-003/AC-01) | `check:lang` exit 0, and red under a planted Han word in README.en.md (line 15) | done for the Chinese and English READMEs (5b63b16); the French, Spanish, Russian and Japanese ones returned to main's text, since #277 removes them |
| 4 | The landing-page feature entry and its index row; the specs' Pending notes; the specs index (the owner's decision) | the entry describes the spec's user-visible layer only | done: 5b63b16 |
| 5 | Test design review | `ticket-239-review-tests.md`, design section | done |
| 6 | Targeted checks, then the full gateway | `pnpm verify` exit 0 | red on 5b63b16: e2e `settings-updates.spec.ts:500` (QR-001/AC-02) in French and Japanese, the ready line on two lines; everything else green (831 unit, 135 scripts, 102 site, 133 of 135 e2e). Blocked by #277 |
| 7 | The manual verification run on the branch (verify on): 0.1.0-beta through Apple and every gate, nothing published | the run green; its gate lines | done: run 39232263252 on 5b63b16, green in 5m48s: the app accepted (f06c2ae3-3db8-4de8-985a-20ab75e05611), `latest-mac.yml` matches `Agentshed-0.1.0-beta-mac-arm64.zip`, the DMG passed (64318467-f898-47d9-8629-881a4e7f8b3c) |
| 8 | Step 5: `/review-code` | `ticket-239-review-code.md` | in progress: two document findings corrected; Runnability waits for the gateway |
| 9 | Step 6: `/review-tests` post-implementation check | the same record, second section | pending |
| 10 | Spec final check, step 7, step 8 (`/features-catalog`: the landing-page entry) | `final-regression.md`, this ticket's section | pending |
| 11 | Pull request; stop for the owner's merge confirmation and the confirmation to push the tag | PR link; CI | pending |
| 12 | The tag `v0.1.0-beta` on the merged commit; the release run | the run green; a Pre-release, nothing on R2 | pending |
| 13 | The downloaded artifacts checked independently (policy §7) | `evidence/ticket-239/` | pending |
| 14 | The release note: drafted from the template, the summary from the owner | the published note | pending |
| 15 | The live page offers v0.1.0-beta in the test state, unchanged (landing-page::REQ-001/AC-05) | a browser reading of the rendered page | pending |
| 16 | The first launch from a browser download, online and offline (US-001/AC-01, AC-02) | screenshots | pending (needs the owner's Mac) |
| 17 | Records: the coverage checklist's #239 row, the document sync checklist, the issue's items | a records change | pending |

## Resuming after #277

#277 changes the language set on main, and with it statements this ticket relies on: mac-distribution::US-003/AC-01
and its README decision (six READMEs become two), the landing-page spec's CON-002, ADR-0013. When it is merged:
rebase this branch on main (it is pushed, so with a backup and the owner's confirmation), re-read the two specs as
#277 left them, re-run the gateway from task 6, then continue from task 8.
