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
- The package version is read by the tag check, the packaging, and at run time through `app.getVersion()`: the
  settings page's version row, the accounting stamp, the updater's channel and the run-version record; e2e reads the
  running version at run time, and the unit tests use literals. (Corrected 2026-10-21: the first version of this line
  said only the tag check and the packaging read it, and the settings version row is exactly where this version's
  length showed — the post-implementation check found the omission.)
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
- 2026-10-21, bringing #277 in: #277 merged as b3cb0f5 (#295). Asked whether rebasing and force-pushing this pushed
  branch was risky; measured that nothing else builds on it (local equals remote, no PR, no other ref contains its
  commits) and that a trial rebase stops on four README modify/delete conflicts while a trial merge of main is clean.
  The owner chose the merge: main merged into this branch as c5f44b9, no history rewritten, no force push.
- 2026-10-22, where the tag goes: #297 merged the version change as fbe4339, and five merges followed (#298, #293,
  #300, #301 and #302: the memory preview, the READMEs and licence, the landing page, an ADR, the search rows).
  Asked with four options (main's head 7dc0c22, recommended; fbe4339, REQ-006's letter; a verification run first;
  not yet); the owner chose main's head, and with it the confirmation to push the tag. REQ-006 and the runbook's tag
  rule are reworded to "a commit of main that carries the version".
- 2026-10-22, the release note: Chinese then English (asked with three options: both, Chinese first, recommended;
  Chinese only; English only), and the proposed summary confirmed as written.
- 2026-10-22, the first launch: the owner downloaded the DMG and opened it online before the planned offline order
  could be followed, so this Mac had assessed the build. The owner confirmed the notice's wording (US-001/AC-01) and
  chose to settle AC-02 by its stapled-ticket evidence now and to run its user path, the offline first launch, with
  the next pre-release (#240), whose new build this Mac will not have assessed (asked with three options: that,
  recommended; another Mac now; the ticket evidence alone).

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
| 6 | Targeted checks, then the full gateway | `pnpm verify` exit 0 | red on 5b63b16: e2e `settings-updates.spec.ts:500` (QR-001/AC-02) in French and Japanese, the ready line on two lines. Blocked by #277, merged in as c5f44b9; green on c5f44b9: `VERIFY_EXIT=0` (`evidence/ticket-239/gateway-c5f44b9.txt`) |
| 7 | The manual verification run on the branch (verify on): 0.1.0-beta through Apple and every gate, nothing published | the run green; its gate lines | done: run 39232263252 on 5b63b16, green in 5m48s: the app accepted (f06c2ae3-3db8-4de8-985a-20ab75e05611), `latest-mac.yml` matches `Agentshed-0.1.0-beta-mac-arm64.zip`, the DMG passed (64318467-f898-47d9-8629-881a4e7f8b3c) |
| 8 | Step 5: `/review-code` | `ticket-239-review-code.md` | done: two document findings corrected; Runnability filled in on c5f44b9 |
| 9 | Step 6: `/review-tests` post-implementation check, by an independent sub-agent | the same record, second section | done on 3064371: seven findings, handled in the records and the evidence (`tag-check.txt`, `check-lang-readme-plant.txt`, `live-page-before-tag.txt`); dispositions in the record |
| 10 | Spec final check, step 7, step 8 (`/features-catalog`: the landing-page entry) | `final-regression.md`, this ticket's section | done: no departure from the spec; no new ADR, term or postmortem; the regression in `final-regression.md` |
| 11 | Pull request; stop for the owner's merge confirmation and the confirmation to push the tag | PR link; CI | in progress: the last gateway green on 9183669, bound to its commit and a clean tree (`evidence/ticket-239/gateway-9183669.txt`); the commit after it adds that evidence only, with `check:ui`, `check:lang` and `check:nul` passing on it; then the PR |
| 12 | The tag `v0.1.0-beta` on the merged commit; the release run | the run green; a Pre-release; nothing on R2, shown positively by the mirror and pointer jobs being skipped, with the download host's response headers beside the pointer's 404 | done: the tag on main's 7dc0c22 (the owner's choice, above), run 39755502301 green: the app accepted (de55b0de-cdc4-4a8c-afae-c60cfa4b7fef), the DMG passed (2cba1560-66b8-49ad-82fa-5daf3747d29a), published as a Pre-release; the mirror and pointer jobs skipped, the pointer 404 from Cloudflare (`evidence/ticket-239/release-run.txt`, `pointer-after-release.txt`) |
| 13 | The downloaded artifacts checked independently (policy §7) | `evidence/ticket-239/`; the stapled tickets decided by `stapler validate` on the DMG and on the `.app` inside it and inside the ZIP. `spctl --assess` is itself an assessment of the build, so on the Mac that does task 16 it runs only after task 16's offline first launch; `stapler validate` and the signature checks, which do not assess, run first | done: every file's size and sha256 equal to GitHub's; the DMG's image, Developer ID signature, team, timestamp and stapled ticket; the app in the DMG and in the ZIP stapled, valid deep and strict; minimum 12.0; fuses 7/7; the metadata equal to the ZIP (`artifact-check.txt` and its script). `spctl` ran after the owner's first launch: accepted, Notarized Developer ID (`first-launch.txt`) |
| 14 | The release note: drafted from the template, the summary from the owner | the published note | done: Chinese then English, the summary confirmed by the owner, published on the release and read back identical |
| 15 | The live page offers v0.1.0-beta in the test state, unchanged (landing-page::REQ-001/AC-05) | a browser reading of the rendered page | done: both languages read in Chrome after the script, the test state leading to the release; the served HTML byte-identical before and after (`live-page-after-release.txt`) |
| 16 | The first launch from a browser download, online and offline (US-001/AC-01, AC-02) | screenshots. The offline launch must be that Mac's first assessment of this build: a fresh browser download, its quarantine attribute confirmed (`xattr`), the network off before the first open — otherwise a cached assessment could pass without the stapled ticket | done in part: the online first launch (AC-01) by the owner, the notice's wording confirmed by the owner, Gatekeeper's prompt and approval in syspolicyd's log, no screenshot (`first-launch.txt`); the offline first launch (AC-02's user path) deferred to the next pre-release (#240), the owner's decision above |
| 17 | Records: the coverage checklist's #239 row, the document sync checklist, the issue's items | a records change | done before the tag (2026-10-21); the post-release records, REQ-006's and the runbook's rewording, and the evidence in a pull request after the release (2026-10-22); the issue's items ticked but AC-02, which waits for #240 |

## Resuming after #277

Followed on 2026-10-21 with a merge instead of the rebase planned below (the owner's choice, above): the two specs
as #277 left them were re-read in the merged tree (mac-distribution::US-003/AC-01 now names both READMEs; the README
decision says both languages), #239's issue text quotes the two READMEs, and the gateway re-runs from task 6.


#277 changes the language set on main, and with it statements this ticket relies on: mac-distribution::US-003/AC-01
and its README decision (six READMEs become two), the landing-page spec's CON-002, ADR-0013. When it is merged:
rebase this branch on main (it is pushed, so with a backup and the owner's confirmation), re-read the two specs as
#277 left them, re-run the gateway from task 6, then continue from task 8.
