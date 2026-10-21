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
| 3 | Ticket records and the checklist's ticket mapping; the artifact paths declared on #277 | the records exist | in progress |
| 4 | Test design review | `ticket-277-review-tests.md`, design section | pending |
| 5 | Vertical slices: the language set (unit), resolution (unit, e2e), a stored removed language (unit, e2e), the selector's three items (e2e), the READMEs and their gate, the other gates, the six-language loops in the remaining tests | red first where the slice adds behaviour; typecheck and the slice's tests green | pending |
| 6 | Targeted checks: typecheck, lint, the tests found by search | exit 0 | pending |
| 7 | Checklist verification of this ticket's units | `checklist.md`, current verification | pending |
| 8 | Step 5: `/review-code` | `ticket-277-review-code.md` | pending |
| 9 | Full gateway `pnpm verify` | exit 0 | pending |
| 10 | Step 6: `/review-tests` post-implementation check, by an independent sub-agent | the same record, second section | pending |
| 11 | Spec final check; step 7 | spec matches the implementation | pending |
| 12 | Step 8: `/features-catalog` (the UI language entry and its index row) | `final-regression.md`, this ticket's section | pending |
| 13 | Document sync re-check; pull request; stop for the owner's merge confirmation | PR link; CI | pending |
