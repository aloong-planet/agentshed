# Compact slash selector — 2026-09-23

User approved the existing prototype displaying `30/60/90` without spaces.
This continues the feature in the local dev integration branch so the approved app icon stays present.

- [x] Apply the approved separator and zero horizontal spacing to the shared live/startup control.
- [x] Update REQ-002/AC-01 and the current feature description.
- [x] Verify rendered geometry and existing regression checks.
- [x] Review code: delimiter semantics, shared mount coverage and style scope.
- [x] Review tests: existing behavioral assertions versus visual evidence.
- [x] Cross-check prototype, spec, features and implementation.

No new unit test: this is a reversible punctuation/CSS change with no new logic. Existing Electron
checks exercise interaction, totals, persistence and startup; rendered inspection checks the new spacing.

## Validation

- Typecheck, 725 unit tests and shared-UI checks passed in the initial verification command.
- The initial gateway stopped at an English-only documentation violation inherited from the icon
  branch; its capability statement was also stale. Corrected that local icon record, then resumed
  the remaining language/i18n/NUL, Electron and smoke stages. No code was changed after the tests.
- All 89 Electron E2E cases passed, including the six-language/theme appearance matrix, keyboard
  use, both chart entries, exact totals, saved preferences and disabled startup placeholders.
- Reviewed the actual running dev window after HMR and the fresh production-rendered screenshots
  `test-results/app-selectable-trend-span--10948-t-and-dark-at-minimum-width/trend-zh-light-1.png`
  and `trend-zh-dark-0.png`; all show the approved compact slash form.
- One opt-in external-meter unit case remains explicitly skipped. No new tests or mutations added.
- Real-data smoke passed: startup 1207 ms, first scan 22774 ms, self-exit 742 ms; no errors or orphan processes.
- Both verification segments exited successfully after correcting the documentation gate failure.
