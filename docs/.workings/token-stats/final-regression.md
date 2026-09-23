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


## 2026-09-23 — Issue 186: global inline span and linked summary

Scope/version: `4714c4f0fb15866f34b1f61f7736464213ed2c2f` plus this delivery's uncommitted
spec/prototype/code/documents. The current increment is one ticket, so the dedicated multi-ticket
full-feature closeout section does not apply. The23 source-quoted conclusions in
[the acceptance record](checklist.md#2026-09-23--issue-186-implementation-acceptance) were rechecked
after the reviews; they are not inferred from old dropdown evidence.
Project capability declaration in CLAUDE.md enables i18n, enumeration wording and working-language
gates; all apply. No capability-dependent item was silently skipped.

### Stage 1 — Changed declarations against counterparts
| Declaration surface | Counterpart and conclusion |
|---|---|
| token-stats spec:REQ-002 and failure matrix | Shared context/prefs/control, linked slice and real restart/failure tests meet the13 span units; identity and duration remain separate. Pending condition removed after implementation |
| token-stats spec:REQ-001 and legacy D/G obligations | Existing common display clock, daily grain, effective rows, archive marks and all/today/d7 behavior retained; exact calendar and restored clock tests pass |
| features/token-stats | Replaced per-page reset/independence/fixed30 statements; now describes shared persistence, linked fourth card, startup control and save failure without implementation details |
| features/agents-overview | Restart boundary now explicitly distinguishes unpersisted active card from remembered global span; links canonical Token feature description |
| CONTEXT Time window/Trend span | Four card roles, fourth resolvedN, global remembered choice and default30 agree with spec, feature and implementation |
| agents prototype | Approved numeric control, global choice and linked card are implemented; mock values remain presentation examples |
| project prototype | Same numeric control and linkage at project scope; implementation computes exact rows instead of mock scaling |
| skeleton prototype | Resolved saved/default choice, disabled shared numeric control and fourth label match real startup; placeholder-to-data geometry verified |
| Shared prototype CSS/JS | Existing small gaps/pressed weight and shared demonstration storage remain consistent with the approved interaction; no app dependency on localStorage |
| zh dictionary | Dynamic nearN-days and localized save error; rendered Chinese labels/geometry inspected |
| en dictionary | Dynamic LastNdays and exact English save failure; exercised in real persistence/failure journeys |
| fr dictionary | N derniers jours and save-error meaning agree; rendered minimum-width theme/mode matrix passes |
| es dictionary | UltimosNdias and save-error meaning agree; same rendered matrix passes |
| ru dictionary | Supported30/60/90 all use the existing plural-days form; longest heading inspected at minimum width |
| ja dictionary | Dynamic day count and save-error copy align with other dictionaries; same rendered matrix passes |
| Changed production comments | Snapshot-anchor and span-independence claims updated to current shared clock and fourth-card coupling; save responses documented as acknowledgements only |
| Working records | Old specification/dropdown results remain explicitly historical; latest acceptance pointer, separate reviews, limitations and current gate evidence identify this delivery |

### Stage 2 — Relations outside changed declarations
| Relation | Check and conclusion |
|---|---|
| Feature/spec files ↔ their README entries | Read both indices; same existing feature/slugs and user-facing scope, no new file or rename. Existing summaries remain true |
| Global span ↔ agents-overview startup constraints | Compatible display copy is independent of saved preference; restart still opens Agents/all-history. No browsing-state persistence added |
| Changed facts ↔ other declarations | Repository-wide search over docs,src,CONTEXT and every README for page-local/independent totals/reset30/last30 found current mirrors in Token feature/glossary, all fixed. Remaining matches are unrelated query state, default30 examples, historical prototype comments, ADR history or retained dictionary APIs, not active fixed-span copy |
| Dynamic window ↔ ADR-0025 | Same effective row set and independent derived projections; no parser/archive/cache shape or stamp change needed |
| Chart behavior ↔ ADR-0008/0009 | Provider segmentation/scaling, data-only hierarchical labels and measured axis placement remain; both dense90-day mount tests pass |
| Skeleton ↔ live card/control | Same control component and context label on both paths; cold30/60/90 and restored60/90 geometry tests pass |
| Enumeration wording ↔ check:ui | Inspected gate scope: agent-side names/counts and shared UI contracts. It does not prove span-card semantics; explicit numeric-list/card-count audit and Electron tests cover that boundary |
| Copy ↔ i18n/typecheck/language gates | Gate scans unextracted source literals, typecheck checks dictionary completeness; rendered six-language tests independently verify names, selected labels and geometry |
| Rules ↔ templates/generated documents | No workflow rule or template changed in this increment; existing directory descriptions remain applicable |

### Stage 3 — Events and current-state claims
| Event | Enumeration/evidence and disposition |
|---|---|
| Local span becomes a global remembered preference | `rg -n 'useTrendSpan|TrendSpanContext' src/renderer/src` lists App owner plus AgentsPane,DetailPane,TokenViz,StartupSkeleton and context definition. Both mounts and placeholder accounted for; glossary/feature mirrors updated |
| Fourth card changes meaning withN | `USAGE_WINDOWS` still enumerates all,today,d7,d30; numeric list remains30,60,90. No member-count change. Four-card statements retained with dynamic fourth meaning; first-three regression assertions pass |
| Pending condition expires | `rg -n 'Pending:' docs/specs/token-stats.md docs/features/token-stats.md docs/features/agents-overview.md` returns no matches after removal; all three targets are readable tracked text |
| UI control replaces dropdown | `rg -n 'trend-span-select|combobox.*Trend days' src e2e` returns no matches after migrating the one stale test; all live consumers use numeric controls |
| Preference loading now includes span | Four-field validated IPC/load/backfill paths updated and typechecked; legacy disk files deliberately default per field. No incompatible account/login flow introduced |
| New shared lifetime invariant | Canonical definition is CONTEXT Trend span; behavior/failures defined in token-stats::REQ-002. No new architectural decision beyond existing app preferences and row derivation |
| Implementation/reviews/verification completed | Current checklist records23 per-unit results and89-E2E/725-unit final gateway exit0. One parity test remains an explicit opt-in skip |
| Publication/acceptance/merge | Delivery is prepared for existing PR185; Issue186 stays open until merge. No merge or new release claimed. User's dev server remains running untouched |

All changed declarations and affected relation endpoints were revisited after edits. Queue is empty:
no unresolved mapping, document contradiction or product finding in this increment. Technical testing
limits (forced acknowledgement reordering and power loss) remain explicitly recorded, not called
passing tests. Source/spec decisions were unchanged; no new ADR or standalone postmortem warranted.

### Delivery version binding

The reviewed specification, implementation, tests and evidence above were committed as
`46437b5fc317f6f17b1eb4764358583cfb50b2a6` and pushed to existing [PR185](https://github.com/zhoulf1006/agentshed/pull/185).
This follow-up changes delivery records only. Local final gateway exit0 applies to that exact code.
[GitHub run35814852190](https://github.com/zhoulf1006/agentshed/actions/runs/35814852190) could not
start either job: GitHub reports failed account payments or an insufficient spending limit. This is
remote infrastructure unavailability, not a remote test pass/fail. Issue186 remains open; merge
requires the user's separate confirmation. No product requirement or verification scope changed.

## 2026-09-23 — Compact slash selector

### Stage 1: changed declarations

| Pair | Conclusion |
| --- | --- |
| REQ-002/AC-01 versus renderer | Exact `30/60/90`, zero horizontal gap/padding, independent numeric buttons; aligned. |
| Spec versus feature catalogue | Both now describe compact slash choices with selected-number highlighting. |
| Approved prototype versus implementation | Same separator and horizontal geometry; the actual dev window was visually inspected after HMR. |

### Stage 2: related declarations

| Relationship | Conclusion |
| Feature/spec index entries | Still accurately describe Token statistics; no name or scope change. |
| All selector consumers | Agents, project Overview and disabled StartupSkeleton share the changed control. |
| Earlier working records | Dot descriptions are historical evidence, retained; this dated revision supersedes their visual acceptance. |
| i18n and appearance | Enabled per project capabilities; slash punctuation is language-neutral; labels and theme values are unchanged. |
| Visual gates | Existing tests check interaction, selection and non-overlap; literal punctuation is verified by rendered inspection. |

### Stage 3: events

| Event | Conclusion |
| User confirms slash prototype | Updated current AC-01 and feature description in the same change. |
| Enumerated members | Still three day options and six languages; no membership changes. |
| Pending notes in current spec/features | `rg -n 'Pending:' docs/specs/token-stats.md docs/features/token-stats.md` returned no matches. |
| New cross-project rule or architecture | None; no ADR or glossary change needed. |

The queue is resolved for this visual amendment; this is not a new whole-feature closeout.
