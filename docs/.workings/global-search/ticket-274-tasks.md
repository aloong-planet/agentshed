# Ticket #274 — task list

The closeout of global search. Working record, not a requirement authority: the requirements are
[the global-search spec](../../specs/global-search.md) and the specs it amended; the coverage checklist is
[checklist.md](checklist.md). Branch `docs/global-search-closeout` from f4197bb, in its own worktree.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Record #273's merge (#286) | #273's document sync checklist | done: 290558d |
| 2 | Every ticket's document sync checklist without an open row | #271–#273 | done: none open |
| 3 | The coverage checklist's mapping against the current spec, both ways | Spec → tickets → verification | done: every unit mapped, no row without a spec basis |
| 4 | The gateway on the integrated code | `pnpm verify` exit 0 | done on 290558d (f4197bb's code) |
| 5 | Every unit verified on the integrated version | Current verification, closeout block | done: 42 rows; hand evidence checked against the code it rests on |
| 6 | ADR-0034's status | the ADR | done: Accepted stands |
| 7 | The full-feature regression | `final-regression.md` closeout section | done; CONTEXT's stale note corrected |
| 8 | Code and test review records | `ticket-274-review-code.md`, `ticket-274-review-tests.md` | done: no code or test changed |
| 9 | Document sync; PR; stop for the owner | PR link | done: [#287](https://github.com/aloong-planet/agentshed/pull/287), CI green on ac1a483; squash-merged on the owner's authorisation as 389d264 (tree equal to the head), the remote branch deleted, #274 closed and its items ticked |
