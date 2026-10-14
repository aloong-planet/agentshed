# Ticket #231 — task list

The settings "Updates" section. Working record, not a requirement authority (the spec is
`docs/specs/app-update.md`). Branch `feat/settings-updates` from main dab4da4.

Mapping check (2026-10-14): the ticket was cut against the spec at 5911d52; the spec changed since only in
the header, REQ-001/AC-02's reduced-motion wording, Failure B3 and two Implementation Decisions (all #230's),
so #231's units and the checklist's #231 rows stand as cut.

Interface points and their confirmed prototype (settings prototype, confirmed 2026-10-13): the Updates
section after Language and Appearance, one card with two rows; the On / Off segmented switch; the version
row with the mono version, the result line (plain / ok / err) and the one button ("Check now" / "Install
now", unavailable states); the footnote and the development-run footnote; the unavailable switch in a
development run; the post-update "You're up to date". Not in the prototype, declared as copy only: the
switch's save-failure toast, which uses the existing save-failure toast of every other preference.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Version record: the first run after the version went up (userData, apart from the preferences; semver precedence) | unit: missing, older, equal, newer, malformed records; the record written each launch | done: `last-run-version.json`, semver precedence; 12 unit cases (first and the write failure red first; four after-code cases proven by mutation); a development run neither reads nor writes it (shared userData, observed) |
| 2 | Settings check record in main: settings' own check (checking, then its outcome), an update found by any check clears the outcome, the post-update line as the run's first outcome | unit with a fake check and state feed | done: `SettingsChecks`; 9 unit cases (five red first; the joined case first survived its mutation — it now starts from an outcome and turns red) |
| 3 | Contract and IPC: the settings check record, the check outcome, the switch's setter, the version and availability at launch | contract tests; typecheck | done: `SettingsCheck`, `parseSettingsCheck`, `parseCheckOutcome`; channels `checkForUpdates`, `getSettingsCheck`, `setAutoCheckUpdates`, event `settingsCheck`; launch arguments for the running version and availability; 4 contract cases, refusals proven by mutation |
| 4 | The switch's preference handler with validation | prefs handler tests | done: `setAutoCheckUpdates` (boolean only); handler case red first |
| 5 | Wiring: main, preload | typecheck; e2e reaches it | done: typecheck clean; e2e reaches every channel |
| 6 | Renderer (after loading /ui-design): the Updates section, the line and button logic (pure, tested), the switch through App, six-language strings, theme styles | unit on the line and button; e2e | done: version-row (6 unit cases), `UpdatesSection`, six dictionaries (copy from the confirmed prototype), scoped `.cfg-btn` states; screenshots and computed values in evidence/ticket-231/ |
| 7 | e2e: every ticket item through the settings page, the post-update seeds, D5 through a real wake | `pnpm e2e` | done: e2e/settings-updates.spec.ts (24 cases incl. QR-001) and the case #230 left open in e2e/app-update.spec.ts; all written after code, each proven by a mutation (test review) |
| 8 | QR-001/AC-02: six languages × line states measured | e2e | done: six languages × seven line states; the measurement shown able to fail on a long label and a long line |
| 9 | Full verification gateway | `pnpm verify` exit 0 | done: `pnpm verify` exit 0 (821 unit, 51 asset, 129 e2e, smoke OK) |
| 10 | Step 5: /review-code | `ticket-231-review-code.md` | done: no bug; two departures; two refactor items for the owner |
| 11 | Step 6: /review-tests | `ticket-231-review-tests.md` | done: three after-code cases first survived and now reach their code; two measurement weaknesses fixed; #230's gap closed |
| 12 | Spec final check and archive (step 7) | spec matches the implementation | done: spec Implementation Decisions written back; CONTEXT invariant added; no ADR needed |
| 13 | Step 8: /features-catalog | app-update feature entry; regression record | done: app-update entry extended; final-regression.md #231 section |
| 14 | Document sync, PR, stop for the owner | PR link | open |
| 15 | The owner-confirmed refactors: one renderer hook for the update lifecycle; settings' check resets `checking` in a `finally` | the existing cases; a rejected-check case red first; a mutation of the hook's push callback; `pnpm verify` exit 0 | done: both; the rejected-check case red first; the hook's push callback dropped turns the tooltip case red; `pnpm verify` exit 0 (822 unit, 129 e2e, smoke OK) |
