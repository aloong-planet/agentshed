# Ticket #277 — task list

Ticket: [#277 Reduce the app's interface languages to Chinese and English](https://github.com/aloong-planet/agentshed/issues/277)
· feature `i18n` · spec [i18n](../../specs/i18n.md), with app-update::QR-001, mac-distribution::US-003/AC-01 and
global-search::CON-004. Branch `feat/two-languages`, in the worktree `agentshed-wt/two-languages`, cut from
`origin/main` at 9b7bb13 (no commits ahead when cut). Blocks #239.

Ticket records (opened by hand, so created here): this file, [ticket-277-review-tests.md](ticket-277-review-tests.md),
[ticket-277-review-code.md](ticket-277-review-code.md), [ticket-277-doc-sync.md](ticket-277-doc-sync.md); the feature
records [checklist.md](checklist.md) and [final-regression.md](final-regression.md).

## Owner decisions in this ticket

- 2026-10-19 (in #239's requirements step): drop French, Spanish, Russian and Japanese before the first release,
  the READMEs with them. Recorded in #277's body.
- 2026-10-21: the selector keeps its dropdown form (three items); a new ADR-0035 records the language set. The
  revised settings prototype was confirmed the same day.

## Interface gate

One interface point: the language selector's overlay, seven items → three. Covered by the settings prototype,
confirmed by the owner on 2026-10-21. No other interface changes; the READMEs are documents.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Branch from the latest main | no commits ahead | done: 9b7bb13 |
| 2 | Steps 1–2: facts, decisions, ADR-0035, CONTEXT, the specs, the prototypes | prototype confirmed; `check:lang`, `check:ui` exit 0 | done: c39db9d |
| 3 | Ticket records and the checklist's ticket mapping; the artifact paths declared on #277 | the records exist | done: the records, the checklist mapping, #277's records section |
| 4 | Test design review | `ticket-277-review-tests.md`, design section | done (rows U8 and U18 revised during slice 1) |
| 5 | Vertical slices: the language set (unit), resolution (unit, e2e), a stored removed language (unit, e2e), the selector's three items (e2e), the READMEs and their gate, the other gates, the six-language loops in the remaining tests | red first where the slice adds behaviour; typecheck and the slice's tests green | done: 7c1b7d8 (unit cases red before the change, green after; the README gate red under two planted breaks) |
| 6 | Targeted checks: typecheck, lint, the tests found by search | exit 0 | done: typecheck, lint, `pnpm test` (850 passed) exit 0; the changed e2e cases 19 of 20, the one red an untouched case that passed 3 of 3 alone (`evidence/ticket-277/targeted-e2e.txt`) |
| 7 | Checklist verification of this ticket's units | `checklist.md`, current verification | done (targeted stage) |
| 8 | Step 5: `/review-code` | `ticket-277-review-code.md` | done: two findings corrected, bd7d697 |
| 9 | Full gateway `pnpm verify` | exit 0 | first run on 7c1b7d8 red at `check:lang` (the test review record quoted Chinese copy; fixed in bd7d697); second run on bd7d697 green: `VERIFY_EXIT=0`, 850 unit, 135 scripts, 102 site, 144 e2e, smoke ([gateway-bd7d697.txt](evidence/ticket-277/gateway-bd7d697.txt)); re-run before the PR, since step 7 and 8 edited documents the gates read |
| 10 | Step 6: `/review-tests` post-implementation check, by an independent sub-agent | the same record, second section | done by an independent sub-agent on ac2a2e6: six findings, all handled in this ticket (rows U19, E18 and revised E3, E7, E8, E11); the fixes go back to the same reviewer for a check |
| 11 | Spec final check; step 7 | spec matches the implementation | done: every unit implemented, nothing outside the spec but test and gate plumbing; step 7 added the Testing Decisions gap note and the postmortem; no new ADR or term |
| 12 | Step 8: `/features-catalog` (the UI language entry and its index row) | `final-regression.md`, this ticket's section | done |
| 13 | Document sync re-check; pull request; stop for the owner's merge confirmation | PR link; CI | pending |
