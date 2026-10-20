# Ticket #273 — task list

Global search: ⌘⇧F and the Edit menu's Search Sessions…. Working record, not a requirement authority: the
requirements are [the global-search spec](../../specs/global-search.md) (US-004, J10, CON-004) and
[i18n](../../specs/i18n.md)'s application menu, as quoted in [#273](https://github.com/aloong-planet/agentshed/issues/273);
the coverage checklist is [checklist.md](checklist.md). Branch `feat/global-search-shortcut` from 84d5ae0, in its
own worktree.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Admission check: the Edit menu item is a native menu, exempted in the spec's prototype gate (the i18n spec's exemption for the application menu: no design freedom, only copy); the box's focus is not a visual change. `/ui-design` loaded before the code | the spec's exemption | done: the copy is the prototype's for Chinese and English (the Chinese in code points U+641C U+7D22 U+4F1A U+8BDD U+2026; "Search Sessions…") and follows each dictionary's existing wording for the other four |
| 2 | Test design review (`/review-tests`) | `ticket-273-review-tests.md` | pending |
| 3 | Cases: the menu unit (structure, accelerator, copy, the injected action); the e2e through the application menu from settings, a session page and the search page itself, and after a language switch | the menu unit and the global search file green | pending |
| 4 | Implementation: the menu item and its event, the preload's listener, the renderer opening the page and focusing the box, copy in six languages | typecheck; check:i18n; check:ui | pending |
| 5 | Targeted verification | lint; the tests that import the changed modules | pending |
| 6 | Checklist sign-off of #273's units | Current verification | pending |
| 7 | Step 5: `/review-code` | `ticket-273-review-code.md` | pending |
| 8 | Full verification gateway | `pnpm verify` exit 0 | pending |
| 9 | Step 6: `/review-tests`, post-implementation, by an independent sub-agent | `ticket-273-review-tests.md` | pending |
| 10 | Spec final check and write-back (step 7): the Pending note expires | spec | pending |
| 11 | Step 8: the feature entries (global search, UI language); the regression report | `final-regression.md` #273 section | pending |
| 12 | Document sync; PR; stop for the owner | PR link | pending |
