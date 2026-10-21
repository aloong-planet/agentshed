# Document sync checklist — #239

Ticket: [#239 Launch v0.1.0-beta: the first pre-release, the live landing page and the README](https://github.com/aloong-planet/agentshed/issues/239) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the landing-page feature entry and index it, with the release change | [features/landing-page.md](../../features/landing-page.md) (new), [features index](../../features/README.md) and its content rule on distribution | Done: 5b63b16; the step 8 regression is in [final-regression.md](final-regression.md), #239's section |
| Rewrite the two spec headers' Pending notes and the specs index rows, with the release change | [mac-distribution spec](../../specs/mac-distribution.md) (Pending resolved into Out of Scope), [landing-page spec](../../specs/landing-page.md), [specs index](../../specs/README.md) (the one-to-one rule's exception) | Done: 5b63b16 |
| Add download and install instructions to the Chinese and English READMEs, with the release change | `README.md`, `README.en.md` | Done: 5b63b16, kept through the merge of main (c5f44b9) |
| Quote the spec's README requirement in #239 again after #277 changed it, when #277 merged | [#239](https://github.com/aloong-planet/agentshed/issues/239): "What to build" and mac-distribution::US-003/AC-01 | Done: 2026-10-21, with #277's blocker marked merged (#295) |
| Record the actual verification of this ticket's units in the coverage checklist, as they run | [checklist](checklist.md), current verification | Done for the units before the tag (2026-10-21, c5f44b9); the units after the merge are Waiting: the tag's run, the independent artifact check, the live page in the test state and the first launch on the owner's Mac (tasks 12–16) |
| Publish the release note following the template, after the tag's run and the independent check | the v0.1.0-beta GitHub release | Waiting: the merge, the tag's run, the independent check, and the owner's summary |
| Tick #239's product acceptance items with their evidence, as each post-release check completes | [#239](https://github.com/aloong-planet/agentshed/issues/239) | Waiting: the release events above |

Removed from this checklist, with the reason (2026-10-21):

- **The mac-distribution feature entry.** The owner decided on 2026-10-19 that only the landing page gets an entry:
  the feature catalogue leaves distribution out, which its README now states and mac-distribution's Out of Scope
  records.
- **"Add download and install instructions to the six READMEs".** #277 removed the French, Spanish, Russian and
  Japanese READMEs (merged in #295); the row above names the two that remain.
- **"Write the Pages deploy guide" (`docs/ops/pages-deploy.md`).** The guide already exists as the site README's
  "Deploying (Cloudflare Pages)" section (#237, #266); a second copy would drift.
- **"If the implementation departs from the spec, rewrite the spec".** The spec final check of 2026-10-21 found no
  departure: the README count changed with the spec (#277), and the Out of Scope entry was the owner's decision,
  written into the spec in this ticket.

**Pre-delivery scope re-check (2026-10-21, at c5f44b9 plus the records):** the current state of every document this
ticket touches was compared with what it did — the landing-page entry and the catalogue index, the two specs' headers
and mac-distribution's Out of Scope, the specs index, both READMEs, the package version, #239's issue text, and the
records (the coverage checklist's rows and current verification, both review records, the tasks file, the step 8
report). No missing or outdated item beyond those handled above; nothing pending; the waiting items name the release
events they wait for.
