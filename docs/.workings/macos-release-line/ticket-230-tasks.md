# Ticket #230 — task list

Automatic app updates with the update button. Working record, not a requirement authority (the spec is
`docs/specs/app-update.md`). Checkpoints in brackets are what proves each step done.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Spec wording: REQ-001/AC-02 "still under reduced motion" reads both ways; the confirmed prototype stops the spinner under reduced motion. Reword, and correct the checklist row and the ticket that read it as "keeps spinning" | spec, checklist and #230 say "motionless" | done: spec REQ-001/AC-02, checklist row and #230 now say the loader stands still |
| 2 | Update controller over an injected source, red before green per slice: launch check → found → downloading → ready; up to date; failed check; failed download; 24-hour schedule; sleep → one check on waking; switch gating; automatic check while in flight; manual join and busy; install; failed install; repeat install; development run | `pnpm test` on the controller's file, each slice seen red first | done: 17 tests in update-controller.test.ts, each slice red first except the install guard, the switch gate, the overdue timer and the development run, which were written after their code and proven by mutation (install guard → 3 installs; switch gate → a request with the switch off) |
| 3 | The update state's IPC contract and its validation | contract tests | done: update.test.ts (5); mutation of the phase/version consistency check caught |
| 4 | The automatic-checks preference: default on, persisted, per-field fallback; carried through Prefs and the backfill | prefs store and contract tests | done: prefs store, contract, handler and backfill tests (53) carry autoCheckUpdates |
| 5 | Production source over electron-updater: GitHub feed, automatic download, install on quit, no downgrade, pre-releases following the running version | configuration unit test | done: update-source.test.ts (settings, feed, choice); the adapter itself awaits task 16 |
| 6 | Scripted source for e2e (environment seam; also stands in for "packaged" for updates only) | unit test; read only from its variable | done: scripted source tests (4) |
| 7 | Wiring: main process, preload, channels | typecheck; e2e reaches it | done: typecheck clean |
| 8 | Renderer: icons, six-language strings, the rail's bottom group with the update slot, the tooltip, the install-failure toast (after loading /ui-design) | e2e geometry, colours, text | done |
| 9 | e2e: lifecycle, geometry, tooltip, themes, reduced motion, single install, failures, language switch with the tooltip open, Settings anchor | `pnpm e2e` | done: e2e/app-update.spec.ts, 10 cases; the colour case first failed because Playwright pinned light (test fixed with colorScheme: null); the bottom-anchor mutation turned the geometry case red |
| 10 | Full verification gateway | `pnpm verify` exit 0 | done: `pnpm verify` exit 0 after the review fixes (789 unit, 104 e2e, smoke OK); check:lang and check:nul rerun after the last doc edits, 0 |
| 11 | Ticket acceptance items checked against the checklist mapping | checklist Current verification rows | done: each of #230 items mapped to its passing case in the test review; recorded in the checklist with the commit |
| 12 | Step 5: /review-code | `ticket-230-review-code.md` | done: two bugs fixed (unobserved cancelled download, test first; ready before Squirrel staged the package), refactor list for the owner |
| 13 | Step 6: /review-tests | `ticket-230-review-tests.md` | done: three cases added, twelve mutations caught |
| 14 | Spec final check and archive (step 7) | spec matches the implementation | done: spec Implementation Decisions written back; B3 corrected; no ADR or CONTEXT change needed |
| 15 | Step 8: /features-catalog (feature entry app-update) | `docs/features/app-update.md`, regression record | done: docs/features/app-update.md and its index rows; final-regression.md #230 section |
| 16 | Evidence: a locally packaged build reaches GitHub through the bundled updater and stays silent when no release exists | command output kept | done: evidence/ticket-230/packaged-run.txt — the bundled updater read the GitHub feed, found no release, and the check failed silently |
| 17 | Document sync checklist re-checked; PR opened; stop for the owner | PR link | done: PR #243; CI green after 2cd591a |
| 18 | The owner-confirmed refactor: one in-flight predicate for the four call sites, before merging | typecheck, lint, the existing tests; a mutation per site; `pnpm verify` exit 0 | done: four sites on `isUpdateInFlight`; three mutations, two caught and one site without a case (first judged unreachable; it was reachable through the wake path, and #231 added the case); `pnpm verify` exit 0 (789 unit, 104 e2e, smoke OK) |
