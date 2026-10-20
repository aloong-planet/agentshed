# Ticket #278 — task list

A stripped Codex fork's session page and project search show its parent's first question as its title. Working
record, not a requirement authority: the requirements are [the session-view spec](../../specs/session-view.md) A4
(the title is the first real question; `thread_name` first for Codex) and B2 (a stripped fork whose title came from
its first question is re-titled from the first question left); the coverage checklist is [checklist.md](checklist.md).
Branch `fix/stripped-fork-title` from a1b04b5, in its own worktree. #278 is a tracker ticket cut without the ticket
artifacts; they are added here and declared on the ticket.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Admission check: no interface change — the session page and the project search card show the title the spec already gives the session; no prototype or `/ui-design` step | — | done |
| 2 | Feedback loop (`/diagnosing-bugs`): the listed title against `sessionQuestions`' title for a stripped fork | a red command | done: a probe, red three runs in three (listed "child new question", page "parent question one") |
| 3 | Cause | file:line | done: the engine's Codex branch returns the cached title (`token-stats.ts`, `sessionQuestions`), while the scan re-titles only the listed metadata (`retitleStripped`); the session page and the project search take the engine's title |
| 4 | Test design review (`/review-tests`) | `ticket-278-review-tests.md` | done |
| 5 | Regression tests red on the unfixed code, then the fix | the tests green | done: U1, U3, E1, E2 red on a1b04b5 at their title assertions ([unit](evidence/ticket-278/red-unit.log), [e2e](evidence/ticket-278/red-e2e.log)); green with the fix, fcdb6c7 |
| 6 | Targeted verification | typecheck, lint, the tests importing the changed module | done: typecheck and lint exit 0; `rg -l --glob '*.test.ts' --glob '*.test.tsx' "token-stats'" src scripts` — 5 files, 125 green (one file skipped by design); the global search e2e (13) and app.spec's fork cases (3) green |
| 7 | Checklist sign-off | `checklist.md` | done |
| 8 | Step 5: `/review-code` | `ticket-278-review-code.md` | done: no bug; R1 (a second read for a cold stripped fork) recommended not done |
| 9 | Full verification gateway | `pnpm verify` exit 0 | done on fcdb6c7 ([log](evidence/ticket-278/verify-fcdb6c7.log)) |
| 10 | Step 6: post-implementation check, by an independent sub-agent | `ticket-278-review-tests.md` | pending |
| 11 | Spec final check; step 8 (the feature entry already says the title is the first question left after stripping) | the regression report | pending |
| 12 | Document sync; PR; stop for the owner | PR link | pending |
