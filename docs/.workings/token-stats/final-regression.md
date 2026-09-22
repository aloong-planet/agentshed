## 2026-09-23 — Selectable trend span

Scope: token-stats::REQ-002, baseline 3a6dca5 plus the uncommitted changes in this worktree.
Direct spec implementation, not a multi-ticket closing ticket. Acceptance mapping is in checklist.md.
The project declares i18n, enumeration wording and working-language checks enabled in CLAUDE.md;
all three apply. No capability-dependent check was silently skipped.

### Stage 1 — Changed declaration surfaces
| File | Counterpart and result |
|---|---|
| docs/specs/token-stats.md | Six ACs match the shared chart and its two owners; startup title mirrors the disabled default |
| docs/features/token-stats.md | Replaced fixed-30 claim, added selectable daily spans and state lifetime; four totals windows remain |
| docs/features/agents-overview.md | Summary now agrees with selectable chart; no independent behavior added |
| CONTEXT.md | Totals window and trend span are separate terms; both use local calendar days |
| docs/prototypes/agents-page/prototype-agents.html | Confirmed compact selector and 90-day mock; production layout follows it |
| docs/prototypes/project-detail/prototype-detail.html | Same shared chart and independent filters at project scope |
| docs/prototypes/agents-page/prototype-agents-skeleton.html | Reuses approved control in existing loading structure; disabled before data, enabled after fill |
| docs/prototypes/_shared/trend-chart.js and .css | Default30, trailing selected days, dense gaps; existing three mounts checked |
| src/shared/i18n/zh.ts | Source copy splits heading around the selector; accessible name present |
| src/shared/i18n/en.ts | Same four new keys; supported counts all use plural days |
| src/shared/i18n/fr.ts | Same keys and meaning; measured at minimum width |
| src/shared/i18n/es.ts | Same keys and meaning; measured at minimum width |
| src/shared/i18n/ru.ts | Same keys; supported counts all use the existing days form; measured long text |
| src/shared/i18n/ja.ts | Same keys; full-width labels measured at minimum width |
| Production header/date comments | Updated fixed-30 and obsolete agent-stacking descriptions in touched constructs |

### Stage 2 — Relations outside the diff
| Relation | Check and conclusion |
|---|---|
| Feature/spec files ↔ README indices | Existing token-stats/agents-overview entries still accurately describe their unchanged feature boundary; no new file or rename |
| Fixed 30-day claim ↔ mirrors | Searched tracked docs, CONTEXT, renderer and all six dictionaries; updated feature mirror. Old trendTitle keys are retained APIs, not active chart headings |
| Chart ↔ startup skeleton | Existing no-shift test failed by 2px; mirrored default control restores the original geometry contract |
| Calendar arithmetic ↔ shared totals | DST test exposed six instead of seven selected days; both calendar producers now agree |
| ADR-0008/0009/0025 ↔ chart behavior | Scale/axis/source-of-truth contracts preserved; no architecture change requiring a new ADR |
| Enumeration rule ↔ check:ui | Gate scans side-name/count language, not numeric chart spans; manual span audit below covers this increment |
| Copy rule ↔ check:i18n and typecheck | Chinese extraction scan and dictionary shape check apply; UI tests separately verify rendered names/geometry |
| Rules ↔ templates | No rule/template changes; generated-doc synchronization not applicable |

### Stage 3 — Events
| Event | Enumeration evidence and disposition |
|---|---|
| Chart span grows from one to three choices | TREND_SPANS enumerates 30,60,90; two renderer mounts and three prototype mounts. `rg -n 'trendTitle' src docs/prototypes/agents-page/prototype-agents-skeleton.html` returns six retained dictionary entries plus prototype heading/copy, not an active production fixed label. Updated token-stats/agents-overview/CONTEXT mirrors |
| Totals-window members | USAGE_WINDOWS remains all,today,d7,d30; four-card wording stays true and independence is covered on both pages |
| Pending annotations | `rg -n 'Pending:' docs/specs/token-stats.md docs/features/token-stats.md docs/features/agents-overview.md` returns no matches; files were read and are tracked text |
| New domain term | Trend span has its canonical definition in CONTEXT.md; view-state/clock rules remain in spec |
| Loading geometry evolves with heading | Existing startup contract, not a new state. Prototype and implementation now mirror the same approved default control; targeted startup test passes |

The affected rows were revisited after the startup and documentation fixes. No unresolved relation,
event or decision remains. Verification status and the final gateway result are recorded in checklist.md.
