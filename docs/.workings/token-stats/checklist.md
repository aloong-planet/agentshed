
## 2026-09-23 — Selectable trend span

Spec: [token-stats](../../specs/token-stats.md). Baseline commit: 3a6dca5; spec and implementation edits
are uncommitted. Direct spec implementation; no tickets assigned.

### Task list
- [x] Confirm existing prototype and update spec.
- [x] Implement with red/green tests at existing seams.
- [x] Run the full verification gateway and inspect rendered application.
- [x] Step 5: review-code.
- [x] Step 6: review-tests.
- [x] Spec closeout and features-catalog cross-regression.
- [ ] Commit, push and open PR; wait for merge authorization.

### Source → spec
| Source and supporting text | Disposition | Coverage | Audit |
|---|---|---|---|
| User: chart only shows 30 days, wants 60 and 90 | Effective | token-stats::REQ-002/AC-01–03 | Existing data, extended display |
| User confirms the prototype and asks to continue (translated) | Effective | token-stats::REQ-002/AC-01,04–06 | Both existing pages; defaults, independent controls and daily density retained |
| Existing spec D1–D10, G1–G13 and REQ-001 | Regression context | token-stats::REQ-002; token-stats::REQ-001/AC-02 | Daily accounting, dimming, clock, localization and state lifetime preserved |

### Spec → implementation → verification
| Unit | Expected result | Owner | Verification plan |
|---|---|---|---|
| token-stats::REQ-002/AC-01 | Localized 30/60/90 selector, default30 | Direct implementation | Unit + Electron user-path/geometry evidence; not yet executed |
| token-stats::REQ-002/AC-02 | Exact local calendar dates; empty/outside dates | Direct implementation | Unit + Electron user-path/geometry evidence; not yet executed |
| token-stats::REQ-002/AC-03 | Historical values, archive marks, provider/side counts | Direct implementation | Unit + Electron user-path/geometry evidence; not yet executed |
| token-stats::REQ-002/AC-04 | Independent totals, span and side filters | Direct implementation | Unit + Electron user-path/geometry evidence; not yet executed |
| token-stats::REQ-002/AC-05 | Tab/project/refresh retention, restart default | Direct implementation | Unit + Electron user-path/geometry evidence; not yet executed |
| token-stats::REQ-002/AC-06 | Dense axis and minimum-width controls | Direct implementation | Unit + Electron user-path/geometry evidence; not yet executed |

### Bidirectional audit
REQ-002 adds only the approved selectable span and carries its affected regression conditions.
D1 and D10 now point to REQ-002/AC-02 and AC-04; other D/G legacy references remain regression anchors.
A/B/F parsers, C cache/archive policy, E scheduling and the unrelated G composition/accounting rules
are not changed: the renderer consumes the same snapshot. All feature history is outside this
increment. No custom dates, hourly data, new totals cards or cross-restart setting is introduced.
The prototype covers both dropdowns and the dense daily chart. Publication audit found no
source/spec conflict; language and minimum-width rendering are verified on both pages in all six languages and both modes.

### Verification history
2026-09-23, 3a6dca5 plus uncommitted changes: not yet executed.


### Final acceptance audit (2026-09-23)
Version: 3a6dca5 plus this worktree's uncommitted changes, including the startup-header repair.

| Unit and spec clause | Evidence and conclusion |
|---|---|
| REQ-002/AC-01: "exactly 30, 60 and 90 days, initially 30" | Typed choice list; both mount tests start at 30 and traverse every choice; all six localized accessible names exercised. Startup control mirrors default and is disabled. Passed |
| REQ-002/AC-02: "N consecutive local calendar dates" | 60/90 literal endpoint tests, outside/sparse/empty rows, DST/year cases, UI last-day and exact bar counts. Passed |
| REQ-002/AC-03: "including archived values" | Unit first-day archived 250 total and 200/50 provider segments; Codex50; existing archive hatching and provider tests; rendered day75 changes185→295. Passed |
| REQ-002/AC-04: "independent" | Repeated span changes preserve card text; Codex persists across span; d7 dims83/90 and53/60; all dims0. The unchanged slice drives composition/models and the existing four-region test passes. Passed |
| REQ-002/AC-05: "tab switches and snapshot refreshes" | Both mount tests keep60 across Skills; refreshed history keeps90; empty/populated project round trip keeps90. Separate page owners initialize30 and have no persistence side effect. Passed |
| REQ-002/AC-06: "minimum supported window width" | 800px Electron windows,90 populated bars, nonempty axis/no overlap/outside; six languages×two modes×two mounts. Real light/dark screenshots inspected. Passed |
| REQ-001/AC-02 and startup position | Common display clock retained; DST highlight fix, existing restored-data clock tests and skeleton anchor test pass. Passed |

Red evidence: /tmp/agentshed-trend-unit-red.log, /tmp/agentshed-trend-dst-red.log,
/tmp/agentshed-trend-window-red.log. Targeted final test run: four cases passed in19.5s.
Mutation evidence: forcing30 fails both mounts at the expected bar count; oversized label fails
containment. Fresh built outputs were checked independently and exact source restored each time.

Screenshots are reproducible from the localized-control E2E case. The prototype startup page was
also checked in the in-app browser: disabled30 while scanning, enabled selector after fill,90 bars
when selected. The spec's new startup sentence preserves the existing no-shift requirement rather
than introducing another UI state. Review reports and three-stage document audit are alongside this file.

Final gateway: `pnpm verify` exited0. Typecheck,711 unit/integration tests, UI/language/i18n/NUL
checks,81 Electron E2E cases and smoke all passed. One existing opt-in ccusage reconciliation test
remains explicitly skipped by default (PARITY=1 required); it is not counted as passed.
Smoke: startup983ms, first scan17925ms, orphan self-exit274ms, no errors/orphans.
Log: /tmp/agentshed-trend-verify-final.log. No user development process was restarted.
