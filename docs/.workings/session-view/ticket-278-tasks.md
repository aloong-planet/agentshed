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
| 10 | Step 6: post-implementation check, by an independent sub-agent | `ticket-278-review-tests.md` | done: five findings (F1–F5), all taken into #278; dispositions in the record |
| 11 | The findings: design review increment, F1's test red on fcdb6c7, the fix, then U5–U7 and U3 as its own case | the tests green | done: U4 red with "grandparent question" ([log](evidence/ticket-278/red-f1.log)); 4dd8a6f; typecheck and lint exit 0, the 5 files importing the engine 129 green ([log](evidence/ticket-278/targeted-4dd8a6f-unit.log)), the fork and global search e2e cases 18 green after a build ([log](evidence/ticket-278/targeted-4dd8a6f-e2e.log)); checklist updated |
| 12 | Step 5 increment: `/review-code` on 4dd8a6f | `ticket-278-review-code.md` | done: no bug; R1 widened, R2 added, both recommended not done |
| 13 | Full verification gateway | `pnpm verify` exit 0 | done on 4dd8a6f ([log](evidence/ticket-278/verify-4dd8a6f.log), [exit](evidence/ticket-278/verify-4dd8a6f.exit)) |
| 14 | Step 6 on the increment, by a new independent sub-agent | `ticket-278-review-tests.md` | done: two findings (F6, F7), both taken into #278; U4's written text run red against fcdb6c7's engine in a throwaway checkout ([log](evidence/ticket-278/red-f1-final.log)) |
| 15 | F6 and F7: design review increment 2, U8 and U6's allow-list assertion, the gap note narrowed; targeted verification; `/review-code` increment 2 | the tests green | done: 1c51f4d; typecheck and lint exit 0, the 5 files importing the engine 130 green; code review: tests only, no bug |
| 16 | Full verification gateway | `pnpm verify` exit 0 | done on 1c51f4d ([log](evidence/ticket-278/verify-1c51f4d.log), [exit](evidence/ticket-278/verify-1c51f4d.exit)) |
| 17 | Step 6 on increment 2, by a new independent sub-agent | `ticket-278-review-tests.md` | done: two findings (F8, F9), both disposed of: the gap note rewritten (fa8024a, comment only, [evidence](evidence/ticket-278/comment-only-after-1c51f4d.log)), the failed-read rule written into spec B2 (562ddc7) |
| 18 | Spec final check | the table below | done |
| 19 | Step 7: archive — spec written back (562ddc7); no ADR (no architectural decision); no new term for `CONTEXT.md`; a postmortem, as its root cause, why no test caught it and its defence are all known | `docs/postmortems/` | done |
| 20 | Step 8 (`/features-catalog`): the documentation regression for #278's scope | `final-regression.md` | done: three stages, no feature entry needed an edit; the tracker's product acceptance gained the banner's and the list's items |
| 21 | Document sync; PR; stop for the owner | PR link | pending |

## Spec final check

Checked 2026-10-20: spec 562ddc7 against the implementation at 1c51f4d (fa8024a after it changes a comment only).
Read-only on the code.

| Spec unit (quoted) | Implementation | Conclusion |
|---|---|---|
| A4: "take **the first real user message**; Codex prefers `thread_name`" | titles are parsed as before; a `thread_name` blocks the re-title (`!agg.titleFromThread` in the shared method and the scan) — U2 | Met |
| B2: "Re-deriving the title after stripping applies only to sessions whose title comes from the first question" | the re-title runs only when the title did not come from `thread_name` and leading questions were stripped, in either tier that strips — U1, U5 | Met |
| B2: "The re-derived title is the session's title wherever the session is named — the list and global search, its session page, a project's own session search, and the parent title on the banner of a fork of it" | the list and global search take the scan's re-title; the session page, the project search and the banner's parent title go through one engine method — U1, U3, U4, E1, E2 | Met |
| B2: "where that read fails …, that surface keeps the title the session was parsed with, and nothing else is affected" | both callers of the shared read keep the parsed title on null — U7 (the banner), U8 (the list); the session's own call is the expression U7 drives (gap note) | Met |
| Further Notes: "the stripped banner carries the parent session's title"; the risk banner, parent present, names it too | both banners render the parent title the engine gives — U4; E1 for the rendering | Met |
| Out of scope: nothing changed beyond the title the engine hands out; the Claude and Grok branches and the payload's shape are untouched | `git diff a1b04b5 1c51f4d --stat -- src` lists `token-stats.ts` and two test files | No expansion |
