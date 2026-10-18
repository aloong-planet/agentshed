# Document sync checklist — #234

Ticket: [#234 Release by pushing a tag](https://github.com/aloong-planet/agentshed/issues/234) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Add the CI tiers, the release workflow and its pitfalls to the macOS signing runbook | [mac-signing](../../ops/mac-signing.md) | Done: the "CI" section (tiers by trigger, the `verify` input and `--ref`, tags as public releases, artifacts, publishing and re-runs, the first note, time limits, pinned actions, tests) and its "Secrets" subsection (organization secrets, how to check their names, GitHub's two rules, fail-closed order, the notarytool argument); the asset tests' line now says CI runs them too. Checked against the workflow and the two manual runs |
| Rewrite the spec's Testing Pending note once the first manual verification run has passed every gate | [mac-distribution spec](../../specs/mac-distribution.md) | Done: the note removed (its condition holds and the fact is ordinary: the evidence list keeps "one manual verification run"); the verification run 39140793605 passed every gate ([evidence](evidence/ticket-234/verification-run-2.txt)) |
| Correct the CI workflow's comment that the repository is private (it is public) | [ci.yml](../../../.github/workflows/ci.yml) | Done: the billing clause removed; the remaining reason (what e2e asserts is platform-independent) holds |
| Write back where the implementation departed from or added to the spec | [mac-distribution spec](../../specs/mac-distribution.md) | Done: Implementation Decisions (the profile follows the trigger, publishing reads the real event and ref, the `-` rule; publishing through a draft checked by sha256, re-runs, the first note); Testing Decisions (the evaluator, the script tests in CI, the publish step's seam); Failure A6, derived to make A2 exact and confirmed by the owner on 2026-10-18 |
| Map the derived Failure A6 in the coverage checklist and record it in the two-way audit | [checklist](checklist.md) | Done: the #234 failures row now lists A6 with the tag check's tests; a "Derived during #234" audit row records the owner's confirmation |
| ADR-0031's consequence "nine repository secrets": five of them are organization secrets since the owner's decision of 2026-10-18 | [ADR-0031](../../adr/0031-macos-release-line.md) | Done: the consequence rewritten in place (five organization secrets visible to this repository, four R2 secrets in it) |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done: the #234 row records 1444b6b, the gateway, the mutations, the two manual tiers (with the failed first attempt) and what stays with #239 and the first formal release |
| Add Failure A6 to the issue's product acceptance and tick what this ticket's evidence supports, at delivery | [#234](https://github.com/aloong-planet/agentshed/issues/234) | Pending: at delivery |

Pre-delivery scope re-check (2026-10-18, on 1444b6b with the uncommitted write-back): the facts this ticket
changed — a release workflow exists and runs on tags and dispatch; the five signing secrets are organization
secrets; `pnpm test:scripts` runs in CI; a pre-release is told by a `-` after the version; publishing goes through
a draft; Failure A6 — were searched over the whole repository with `rg --hidden --no-ignore` (git-ignored working
records included; excluded: `node_modules`, `.git`, `docs/prototypes`, `release/`, `out/`, the lockfile), for the
secrets wording, "release workflow", "tag-triggered", "private", `test:scripts`, "verification gateway", the
verification switch and the Latest / Pre-release markings, then for "first manual verification run" and
"Testing Pending" after the spec's note was removed. 84 and 4 hits, every one read. Found and fixed beyond the planned rows: the runbook's line on the asset tests, ADR-0031's secrets
consequence, the checklist's A6 mapping. ADR-0030's "this private repository" already carries its amendment of
2026-10-08. The coverage checklist's "Testing Pending" mapping row stays: it names the unit whose result the
Current verification row now records.

Step 8 (`/features-catalog`) skipped by its two questions: no sentence in `docs/features/` becomes untrue — the one
that depends on releases (`app-update.md`: a pre-release installation is offered pre-releases and formal releases)
holds, since the publish job marks suffixed tags Pre-release — and none is missing, as the release line's feature
entry is written with the first release (the spec header's Pending note). Search:
`grep -rniE "release|download|notari|\.dmg|github release|signed" docs/features/ README*.md`, every hit read
(`app-update.md` and the features index only; no README line).
