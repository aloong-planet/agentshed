# Ticket #232 — task list

"Check for Updates…" in the application menu. Working record, not a requirement authority (the specs are
`docs/specs/app-update.md` and `docs/specs/i18n.md`). Branch `feat/menu-check-updates` from main bf77387.

Mapping check (2026-10-14): the ticket was cut against the specs at 5911d52; since then app-update changed in
the header, REQ-001/AC-02's wording, Failure B3 and Implementation Decisions (#230, #231), none of them #232's
units, and i18n did not change. The checklist's #232 rows stand as cut.

Interface points: the toasts (up to date with the version, failed, found and downloading, and the three
in-flight states) are the confirmed settings prototype's menu check, in its six-language copy; the native
menu item cannot be drawn in an HTML prototype and is stated in the spec (below "About Agentshed", greyed in a
development run), confirmed 2026-10-13. Its label in the five languages beyond Chinese is copy only.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Menu template: the item directly below "About", its copy in six languages, its enabled flag, its click through an injected action | menu template unit, red first | done: the item below "About", `id: checkForUpdates`, enabled only where updates are checked; three cases red first |
| 2 | Contract: the update notice gains the menu check's outcome, validated | contract tests | done: `UpdateNotice` gains `menuCheck` with a validated outcome; accepting case red first, refusal proven by mutation |
| 3 | Renderer: a notice → its toast (tone and copy), pure and tested; the update button's notice handler uses it | unit | done: `update-toasts.ts` (5 cases, four red first); the update button answers every notice through it |
| 4 | Wiring: the menu's action runs the controller's check and sends the outcome as a notice; the item is enabled only in a run that checks for updates | typecheck; e2e | done: `menuCheck`, `sendUpdateNotice` (exit validation, now also for the install failure) |
| 5 | Six-language strings | gates | done: label, two toasts; three toasts reuse the settings line's and the button's copy (the prototype's words) |
| 6 | e2e: each outcome's toast; in-flight states without a request; the rail button after a find; D4 with settings; B2; G2; G6; the development run | `pnpm e2e` | done: e2e/menu-check-updates.spec.ts, 6 cases, all written after code and proven by seven mutations |
| 7 | Evidence: the native menu (the known gap) | screenshot | done 2026-10-14: the owner's screenshot of a local package built from 2b1b703 ([evidence/ticket-232/](evidence/ticket-232/README.md)) — the item directly below "About Agentshed", enabled, in English as the interface language |
| 8 | Full verification gateway | `pnpm verify` exit 0 | done: `pnpm verify` exit 0 (830 unit, 135 e2e, smoke OK) |
| 9 | Step 5: /review-code | `ticket-232-review-code.md` | done: no bug; one departure; no refactor items |
| 10 | Step 6: /review-tests | `ticket-232-review-tests.md` | done: coverage complete, the native picture by the owner's screenshot (task 7); every after-code case proven |
| 11 | Spec final check and archive (step 7) | spec matches the implementation | done: app-update IPC and Testing Decisions written back; i18n's known gap rewritten |
| 12 | Step 8: /features-catalog | app-update feature entry; regression record | done: app-update and i18n entries; final-regression.md #232 section |
| 13 | Document sync, PR, stop for the owner | PR link | open: PR #248; waiting for the owner's merge confirmation |
