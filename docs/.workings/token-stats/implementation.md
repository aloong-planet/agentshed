# Issue 186 implementation

Status: delivered to PR 185; waiting for user review and merge authorization. Local verification passed. GitHub CI could not start because of account billing/spending limits. The confirmed inline-span prototype covers both chart entries, the linked fourth card and startup skeleton. The ticket/checklist maps 23 atomic acceptance units to this single delivery; no blocked dependencies or new UI decisions.

Branch continuation: `codex/token-trend-range`, existing PR 185; fetched origin/master at `3a6dca5`, existing feature commit `4714c4f`. This continues the same unmerged feature rather than creating a second branch containing it. Original icon checkout is untouched.

## Tasks

- [x] 4a. Preference store/IPC/startup/backfill, red-green tests at public preference seams.
- [x] 4b. Shared calendar slice, global inline control and linked totals, red-green usage and Electron checks.
- [x] 4c. Persistence, failure/race/startup and language/appearance regression; full `pnpm verify`.
- [x] 5. Invoke review-code; record findings independently.
- [x] 6. Invoke review-tests; record findings independently.
- [x] 7. Reconcile every ticket acceptance unit against final implementation and evidence.
- [x] 8. Invoke features-catalog; current feature, glossary/spec/prototype consistency.
- [x] Publish code and documentation together to PR 185; stop for merge approval.

## Validation seams

Reuse PrefsStore and validated handlers (real temporary filesystem), backfillPrefs, sliceUsage/inWindow/buildTrendBars, and isolated-profile Electron UI. No private-member casts or mocks of owned modules. Styling uses rendered geometry/screenshots rather than low-value unit tests.

Implementation/specification commit: `46437b5fc317f6f17b1eb4764358583cfb50b2a6`. PR: https://github.com/zhoulf1006/agentshed/pull/185 . Issue 186 remains open pending merge. No merge or dev restart performed.
