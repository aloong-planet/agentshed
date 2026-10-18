# Ticket #251 — task list

Bring the prototypes in line with the updated prototype skill. Working record, not a requirement authority:
the requirement source is the body of [#251](https://github.com/aloong-planet/agentshed/issues/251) (rewritten
on 2026-10-18), with no spec, by the owner's choice. Checkpoints in brackets are what proves each step done.
Item numbers are #251's.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Re-copy the gallery infrastructure from the skill's masters (item 1) | `cmp` against each master | done: index.html, demo-dimensions.js, demo-harness.js and sync-mmd.mjs re-copied and byte-equal to their masters; app-identity.js already was (#251 lists it by mistake); sync-mmd rerun |
| 2 | Remove the generators; the four derived files become hand-kept; rewrite the comments that pointed at them (item 5) | search for the generator names and "Derived file" under `docs/prototypes/` and `scripts/` | done: the search finds only sync-mmd's own output headers and ADR-0018's history; ADR-0033 written |
| 3 | `check-shared-ui.mjs`: delete the six prototype-versus-app checks and the generator imports, drop the `--cross` tier (item 10) | `pnpm check:ui` exit 0; a mutation per kept rule family still turns it red | done: exit 0; four reversible mutations (brand colour in a component, app-side `.col` invariant, TrendChart without archivedDays, registry default outside its values) each exit 1 with the rule's message, files restored byte-identical |
| 4 | Test design review before the first new check (`/review-tests`, design review) | `ticket-251-review-tests.md` | skipped with TDD: no unit under test is written here. The check-script changes delete rules and register one shared block with the existing logic, each proven by mutation; the prototype pages are verified by browser evidence against a baseline snapshot. The post-implementation check (task 14) still runs |
| 5 | Registry `dimensions.js`: `general` flags, defaults, comment, prefix (items 1, 2, 11, 14) | browser checks of item 1 | done: language and mode general, language default en (its fallback); comment and fallback note rewritten |
| 6 | Shared pieces: navigation duplicates (7), "Demo ·" (2), harness rule (12), source paths (14), dictionary claims (9) | search per item; pages open with no errors | done: rail items are buttons and the rail and the project column no longer navigate on their own; startup switch in dock markup, its bar styles deleted; no `src/` in `_shared/` |
| 7 | Shared copy table for copy two or more pages show (item 9) | enumeration of duplicated copy, each mapped to the table or kept page-local | done: `_shared/copy.js` with the 30 entries whose wording agrees across pages; four keys whose wording differs (projectLost, pillProject, pillGlobal, ascending/descending) stay page-local for the owner to decide |
| 8 | App window root styles on a shared box, with the candidates cell (item 13) | computed styles of the window box per page; no root style on html/body | done: `_shared/app-window.css`, registered as shared block `app-window` (a mutation that drops the declaration turns check:ui red) |
| 9 | Pages: harness markup (12, 8, 2), root styles (13), source paths (14), copy (9), navigation helper (7) | per-page browser check | pending |
| 10 | Page-specific: settings wiring and no simulated system (1, 11); xAI colour settled from the app, owner's decision of 2026-10-18 (3); stale-note `.pick` (3); shell demo button (6); landing-page and md-preview body judgement (13) | browser checks | pending |
| 11 | Browser verification of every page and the gallery | errors 0; screenshots | pending |
| 12 | Full verification gateway | `pnpm verify` exit 0 | pending |
| 13 | Step 5: `/review-code` | `ticket-251-review-code.md` | pending |
| 14 | Step 6: `/review-tests`, post-implementation check | `ticket-251-review-tests.md` | pending |
| 15 | Final check against #251 and archive (step 7): ADR superseding ADR-0018's prototype half | ADR, ADR index | pending |
| 16 | Step 8 judgement: no user-visible behaviour changes, so `docs/features/` stays; written into the delivery notes | delivery notes | pending |
| 17 | Document sync checklist re-checked; PR opened; stop for the owner | PR link | pending |
