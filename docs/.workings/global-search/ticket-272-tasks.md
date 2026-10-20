# Ticket #272 — task list

Global search: back to the results from a hit's session, or on into its project. Working record, not a
requirement authority: the requirements are [the global-search spec](../../specs/global-search.md) (US-003,
J3–J7) and [session-view](../../specs/session-view.md) P10, as quoted in
[#272](https://github.com/aloong-planet/agentshed/issues/272); the coverage checklist is [checklist.md](checklist.md).
Branch `feat/global-search-exits` from 5dfbf0d, in its own worktree.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Admission check: the two exits and their chevrons are on the confirmed session page prototype; the stale variant is a declared copy exemption | the list below | done: the prototype's exits row (back to the results with a left chevron, then into the project with a right chevron) and its stale copy exemption. The prototype draws the single back control in the same row with the same look, which the app's control had not matched since 2026-08-02: the row follows the prototype for all three controls. `/ui-design` loaded before the code, and reloaded after a context compaction and the change rechecked against it |
| 2 | Test design review (`/review-tests`) | `ticket-272-review-tests.md` | done: design review written; rechecked against `/review-tests` reloaded after a compaction; E3 (#271's case) added as a changed row before it was edited |
| 3 | e2e cases red first: the exits, the way into the project (normal and stale), the fork parent, J6, J7 | red for the designed reason | done: E8–E10 red first on 5dfbf0d, each at its exits assertion (no exits row); written together rather than one at a time, recorded in the test review. `red-green-mutation` turned out undeclared; the owner declared it not enabled (53e3ab3) |
| 4 | Implementation: the origin of an opened session, the exits row, its styles, copy in six languages | e2e green; typecheck; check:i18n; check:ui | done: 09966e1; E8–E10 green; typecheck, check:i18n, check:ui exit 0 |
| 5 | Targeted verification | lint; the closure of the changed modules | done: lint exit 0; the whole global search e2e file (10 green); unit tests found by `rg -l --glob '*.test.ts' --glob '*.test.tsx' "i18n|SessionPane|icons'|from './App'" src scripts` plus every test in the dictionaries' directory (11 files, 99 green); the seven app-spec cases that use the single back control (7 green) |
| 6 | Checklist sign-off of #272's units | Current verification | done: #272's block in Current verification, on 09966e1 |
| 7 | Step 5: `/review-code` | `ticket-272-review-code.md` | done: `ticket-272-review-code.md` — no bug; R-a and R-b done on the owner's decision (5bd38dd); O-1 → #281; O-2 fixed (7d8ea36) |
| 8 | Full verification gateway | `pnpm verify` exit 0 | done: `pnpm verify` exit 0 on 7d8ea36 (863 unit, 102 site, 145 e2e, smoke OK); the e2e header comment after it shown comment-only |
| 9 | Step 6: `/review-tests`, post-implementation | `ticket-272-review-tests.md` | done: `ticket-272-review-tests.md`, post-implementation check, run by the implementing agent rather than independently (the record says why); an independent one followed (row 13) |
| 10 | Spec final check and write-back (step 7): the Pending note narrows to US-004 | spec | done: status and Pending note (narrowed to US-004); J11 and the origin's wording written back and kept: put to the owner in the PR, who authorised the merge as written (2026-10-20) |
| 11 | Step 8: the feature entries (global search, session view); the regression report | `final-regression.md` #272 section | done: the two feature entries; `final-regression.md` #272 section |
| 12 | Document sync; PR; stop for the owner | PR link | done: [#282](https://github.com/aloong-planet/agentshed/pull/282), CI green on f5ec41f; squash-merged on the owner's authorisation as f0d7027 (tree equal to the head), the remote branch deleted, #272 closed and its items ticked |
| 13 | Independent post-implementation test check, on the owner's request after the merge | `ticket-272-review-tests.md`, its independent section | done 2026-10-20: run by a sub-agent that did not share this conversation; findings F1–F8, C1, C2; the owner's dispositions recorded; #272's two process items reopened |
| 14 | Follow-up PR: the findings' cases, the spec's card-header wording, the capability ID, the record corrections | PR link | done: [#284](https://github.com/aloong-planet/agentshed/pull/284), CI green on 473dff0; squash-merged on the owner's authorisation as 84d5ae0 (tree equal to the head), the remote branch deleted, #272 closed again and its two process items ticked again |

Follow-up steps (2026-10-20), branch `test/global-search-exits-followup` from #283's head 41f8a0d, in its own worktree;
rebased onto main once #283 merged as 1d82cfd, whose tree equals 41f8a0d's, so each commit kept its tree
(5e667e9 → 3aa2a3e, db77a8e → 6627940, 33ff8dc → 7dc70da) and every run and review below holds for the rebased commits:

| # | Task | Checkpoint | State |
|---|---|---|---|
| F-1 | Admission check: no interface change (tests, the spec's wording for a shipped behaviour, the capability's ID), so no prototype and no `/ui-design` step | — | done |
| F-2 | Test design review of the added and changed rows | `ticket-272-review-tests.md`, "Design review (follow-up)" | done; the earlier table's E3, E8 rows and launch time corrected |
| F-3 | Cases: E11 (J11), E3, E4, E8, E9 | the global search file green | done: 11 green |
| F-4 | Targeted verification | typecheck, lint | done: exit 0 (lint after installing the site's own dependencies in the new worktree) |
| F-5 | Step 5: `/review-code` | `ticket-272-review-code.md`, follow-up section | done: no bug, no refactor item |
| F-6 | Full verification gateway | `pnpm verify` exit 0 | done twice: before and after G1's guard ([first](evidence/ticket-272/verify-followup.log), [second](evidence/ticket-272/verify-followup-2.log)) |
| F-7 | Step 6: independent post-implementation check | `ticket-272-review-tests.md`, "Post-implementation check (follow-up, independent)" | done by a sub-agent; G1 done, G2 not run (mutation testing not enabled) |
| F-8 | Spec write-back: US-003/AC-01 names a card's header (S29) | spec | done |
| F-9 | Step 8: both feature lines; the regression report | `final-regression.md`, follow-up section | done |
| F-10 | Document sync; rebase onto main after #283; PR; stop for the owner | PR link | done: rebased, trees compared commit by commit; [#284](https://github.com/aloong-planet/agentshed/pull/284) |
