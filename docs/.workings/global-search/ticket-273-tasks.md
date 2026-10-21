# Ticket #273 — task list

Global search: ⌘⇧F and the Edit menu's Search Sessions…. Working record, not a requirement authority: the
requirements are [the global-search spec](../../specs/global-search.md) (US-004, J10, CON-004) and
[i18n](../../specs/i18n.md)'s application menu, as quoted in [#273](https://github.com/aloong-planet/agentshed/issues/273);
the coverage checklist is [checklist.md](checklist.md). Branch `feat/global-search-shortcut` from 84d5ae0, in its
own worktree.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Admission check: the Edit menu item is a native menu, exempted in the spec's prototype gate (the i18n spec's exemption for the application menu: no design freedom, only copy); the box's focus is not a visual change. `/ui-design` loaded before the code | the spec's exemption | done: the copy is the prototype's for Chinese and English (the Chinese in code points U+641C U+7D22 U+4F1A U+8BDD U+2026; "Search Sessions…") and follows each dictionary's existing wording for the other four |
| 2 | Test design review (`/review-tests`) | `ticket-273-review-tests.md` | done; an increment reviewed after the post-implementation check (E12 changed, E13 new, U1's comment) |
| 3 | Cases: the menu unit (structure, accelerator, copy, the injected action); the e2e through the application menu from settings, a session page and the search page itself, and after a language switch | the menu unit and the global search file green | done: U1, U2, E12; then E13 and E12's added assertions (13 green). Red first not required (no bug reproduced); U1 and U2 happened to run red before the template changed, at their assertions |
| 4 | Implementation: the menu item and its event, the preload's listener, the renderer opening the page and focusing the box, copy in six languages | typecheck; check:i18n; check:ui | done: 2882abc; all three exit 0 |
| 5 | Targeted verification | lint; the tests that import the changed modules | done: lint exit 0; `rg -l --glob '*.test.ts' --glob '*.test.tsx' "@shared/i18n\|shared/i18n\|from './(zh\|en\|fr\|es\|ru\|ja\|types\|index)'\|app-menu\|@shared/ipc\|shared/ipc\|preload\|GlobalSearchPane\|from './App'" src scripts` — 27 files, 399 green; the application menu's e2e (6 green) |
| 6 | Checklist sign-off of #273's units | Current verification | done: #273's block; AC-01 and J10 for the menu item's path, the key press a stated gap |
| 7 | Step 5: `/review-code` | `ticket-273-review-code.md` | done: no bug, no refactor item; the key press note's unverified cause removed |
| 8 | Full verification gateway | `pnpm verify` exit 0 | done on cecebad ([log](evidence/ticket-273/verify-cecebad.log)), on 2843aaf after the first check's findings ([log](evidence/ticket-273/verify-2843aaf.log)) and on cc5aefd after the second's ([log](evidence/ticket-273/verify-cc5aefd.log)) |
| 9 | Step 6: `/review-tests`, post-implementation, by an independent sub-agent | `ticket-273-review-tests.md` | done on 03a5ba3 by a sub-agent: F1–F5; F2–F5 done (2843aaf), F1 to the owner. Those changes checked by a second independent sub-agent on 2843aaf: F6–F14, all done as recommended (cc5aefd and the records after it), not checked a third time |
| 10 | Spec final check and write-back (step 7): the Pending note expires | spec | done: the note gone, the status and the focus request written (03a5ba3) |
| 11 | Step 8: the feature entries (global search, UI language); the regression report | `final-regression.md` #273 section | done: both entries (03a5ba3); the regression's #273 section |
| 12 | Document sync; PR; stop for the owner | PR link | done: [#286](https://github.com/aloong-planet/agentshed/pull/286), CI green on 28d56fc; the owner's hand check of the key press passed on 2026-10-20 and is recorded; squash-merged on the owner's authorisation as b6c4a41 (tree equal to the head), the remote branch deleted, #273 closed and its items ticked |
