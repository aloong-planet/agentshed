# Ticket #271 — task list

Global search: search every project's questions and open a hit's session. Working record, not a requirement
authority: the requirements are [the global-search spec](../../specs/global-search.md) and the body of
[#271](https://github.com/aloong-planet/agentshed/issues/271); the coverage checklist is [checklist.md](checklist.md).
Branch `feat/global-search` from 57a6a5c, in its own worktree. Checkpoints in brackets are what proves each
step done.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Admission check: every interface point of this ticket has a confirmed prototype; load `/ui-design` | the point-by-point list below | done: every interface point is on the confirmed global search prototype (rail item, frame, box and placeholders, idle, reading, results header, headings, cards, rows, no-hit, no-session, failure); exemptions as the spec declares (the list's scroll, the atomic jump); `/ui-design` loaded; no new colour token; icons all in the module |
| 2 | Test design review before the first test (`/review-tests`, design review) | `ticket-271-review-tests.md` | done: design review section of `ticket-271-review-tests.md`, with the rows amended during the cycle |
| 3 | Main process: the question corpus (read, update after a scan, search), its fixture-home tests | providers unit tests red then green; typecheck | done: dff584f; 15 corpus cases red then green (U6 sharpened after a surviving mutation), U14 added at review |
| 4 | Contract: the two channels, the payload type, validation on both sides, the preload | contract round trip red then green | done: dff584f; the contract case red against a permissive validator, then green |
| 5 | Presentation: grouping by project and the two orders | presentation unit red then green | done: dff584f; four cases red against stubs, then green |
| 6 | Query layer: the search and reading queries, snapshot invalidation | query-layer unit red then green | done: dff584f, a025015; red against stubs, then green; Q3 added at review |
| 7 | Renderer: rail item, the page, the jump, the list's scroll into view, copy in six languages | e2e red then green; typecheck; check:i18n; check:ui | done: 16daf97; seven e2e cases, each proved by a rebuilt mutation (the test review lists them); typecheck, check:i18n, check:ui green |
| 8 | Fetch-delay knob on the reading channel; rail-label exemption; "third dimension" comments | the reading e2e; check:ui | done: the delay holds each reading pass (e2e reading case); the exemption needed (48 failures without it); both comments reworded |
| 9 | Targeted verification (step 4.6): lint, the tests this change touches, found by search | commands and outputs in the review records | done on 16daf97: typecheck, lint, the whole unit suite, check:ui, check:i18n, build, the new e2e spec and the two changed cases; the import closure of the e2e suite is every spec (`rg -l "electron.launch|_electron" e2e` lists all seven), so `pnpm e2e` ran whole: 142 passed |
| 10 | Checklist sign-off of #271's units (step 4.7) | the coverage checklist's Current verification | done: Current verification rows for every #271 unit |
| 11 | Step 5: `/review-code` | `ticket-271-review-code.md` | done: `ticket-271-review-code.md`; no bug; two premises pinned by new cases; refactor list R1–R4 and one outside finding for the owner |
| 12 | Full verification gateway (`pnpm verify`) | exit 0 | done: `pnpm verify` exit 0 on a025015 (863 unit, scripts, 102 site, checks, 142 e2e, smoke). Afterwards one e2e comment changed: comment-stripped output identical (24182 bytes), no runtime comment read, lint exit 0 — the gateway result stands |
| 13 | Step 6: `/review-tests`, post-implementation check | `ticket-271-review-tests.md` | done: post-implementation section of `ticket-271-review-tests.md` |
| 14 | In-app measurements for ADR-0034 (first load and a search, alongside a scan) | measurements recorded; ADR status settled | done: `evidence/ticket-271/measurements.md`; ADR-0034 accepted |
| 15 | Spec final check and archive (step 7): spec write-back, ADR, CONTEXT | each item checked against the spec text | done: every #271 unit holds against the code; four write-backs (S2 first launch, S7 line breaks, identity and update order, renderer details) and the status with a Pending note; S7 and S2 for the owner to confirm in the PR |
| 16 | Step 8: `/features-catalog` — features/global-search.md, the catalogue row, projects-list, session-view | final regression section | done: the feature entry, its row, the project list line; `final-regression.md` #271 section |
| 17 | Document sync checklist re-checked; PR opened; stop for the owner | PR link | in progress: the checklist re-checked; the PR next |
