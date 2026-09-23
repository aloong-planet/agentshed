## 2026-09-23 — Selectable trend span

Scope/version: token-stats::REQ-002, 3a6dca5 plus uncommitted changes.

### 1. Coverage inventory
| Case family | Input and observable result |
|---|---|
| 30-day default | Existing shared tests and both fresh Electron launches retain 30 |
| 60/90 boundaries | Literal June 1 / May 2 starts and July 30 end; outside rows excluded; archived 250 total with 200/50 segments |
| DST/year/empty | New York spring/fall, 90 unique dates, literal endpoints, seven highlighted dates, entirely empty history |
| Both UI mounts | 91 JSONL records; repeated choices; day 75 has 185 tokens; totals unchanged |
| Composed filters | Codex removes old Claude segments; seven-day window dims 83/90 and 53/60 bars |
| Tabs/refresh | Skills round trip keeps 60; appended day-75 record becomes exactly 295 while span remains 90 |
| Project/empty | Empty-project round trip keeps 90, zero segments, and restores populated values |
| Dense geometry | 90 populated bars at 800px; nonempty axis, no overlapping/outside labels, positive bar width |
| Localization | Six languages × light/dark × both pages; accessible names, 90 bars, measured containment and no overlap |
| Startup | Existing skeleton-to-data anchors retain original no-shift tolerance |

Fixtures reuse mkUsageHome's source-derived assistant/message/usage shape. Dates, values and project
names are synthetic; no parser change is claimed. Existing archive and clock suites cover their
unchanged seams; new unit cases explicitly include archived dates older than 30 days. Fresh launches
and local-state ownership verify default initialization; no persistent preference exists.

### 2. Design
- Seams: shared pure API and real Electron UI. No own-module mocks, private-state setup, synthetic
  UI events or internal call-count assertions. Each UI case owns home/userData and closes in finally.
- Historical appends represent the external agent; assertions read the resulting rendered chart.
- Literal expected totals, counts and calendar endpoints avoid implementation-derived expectations.
  E2E day formatting locates fixture records; unit literals independently verify date arithmetic.

### 3. False-green and false-red audit
- Initial unit reds were the intended 30-versus-60/90 count, 89 distinct dates, and six highlighted
  days. Missing selector was only an initial integration red, not sufficient behavior evidence.
- Mutation forcing onSpan(30) was found in a fresh build; both mounts failed at the expected 60-bar
  assertion with 30 received. Exact source bytes were restored in finally.
- Mutation setting label min-width to 2000px was found in rebuilt CSS; localized geometry failed
  specifically on clipping. Exact source bytes were restored. Logs: /tmp/agentshed-trend-mutation-
  span.log and /tmp/agentshed-trend-mutation-geometry.log (local run evidence, not durable fixtures).
- A first refresh assertion incorrectly expected 1195 to format as 1.2k; the existing formatter
  rounds to 1k. The fixture now yields exactly 295; formatting was not changed to satisfy the test.
- Early dark checks used light emulation. Replaced with launchAppearance and effective-mode waits;
  screenshots wait for toasts to disappear. No product change was made for that measurement error.
- Async assertions are awaited; exact bar counts/nonempty labels guard geometry collections.
  No empty-loop success, conditional silent skip or source constant used as expected choice.


## 2026-09-23 — Issue 186: global preference and linked totals

Version: `4714c4f0fb15866f34b1f61f7736464213ed2c2f` plus this delivery's uncommitted changes.
The earlier dropdown evidence is historical. This review covers every changed/new test file and the
retained calendar/axis tests used as regression evidence.

### 1. Coverage and fixture inventory
| Test/fixture surface | Conditions and conclusion |
|---|---|
| prefs-store.test.ts | Saved60; absent/null/string/45/0 default only the new field; corrupt/legacy files; unrelated fields; real EISDIR interrupted replacement; reopening reads last complete60 |
| prefs-handlers.test.ts | Valid60/90/30 round trips, invalid types/ranges, unavailable store; unrelated appearance/language persist; no private-member setup |
| shared/prefs.test.ts | Required IPC span, defaults, invalid/missing span, all existing field validations retained |
| prefs-backfill.test.ts | Untouched and touched fields, specifically late incoming60 versus local90; preserves unrelated initial values |
| usage.test.ts | Exact12/35/79 totals, side/model/composition values, future/outside/undated exclusions; all/today/d7 unaffected; all existing row/projection identities retained |
| trend.test.ts / axis.test.ts | Existing 60/90 literal bounds, sparse/empty/archived dates, month/year and both DST transitions; dense/data-only axis contracts |
| app.spec.ts: both selectable-span mount cases | 91-day assistant history, old-day185→295 after real refresh, side/card identity, tabs, empty/populated project switch;90-day geometry at800px |
| app.spec.ts: localized span case | Six languages × three themes × two appearances × both entries; accessible names, accent/weight, distinct button rectangles and measured containment; fresh screenshot inspection |
| startup-restore.spec.ts | Saved90 with restored project/session content, clock and zone changes; failed startup retains saved60 and recovers; compatible display copy independent of accounting version |
| token-span.spec.ts: older/invalid preferences | Missing, numeric45 and string60 profiles; blue/dark/en preserved against a French system-language override; both entries show30; next save preserves all other fields |
| token-span.spec.ts: totals/restarts | Two projects, unequal recent/middle/old slices; exact62/144/246 global and16/42/78 versus46/102/168 project totals; fourth active/inactive and models; full quits/relaunches60 then90 |
| token-span.spec.ts: three cold startup cases | Span30/missing cache,60/corrupt cache,90/incompatible cache; disabled controls and fourth labels, geometry retained through first data |
| token-span.spec.ts: save failure | Actual temporary-path directory obstruction; live90 on both views, localized toast, unchanged archive/agent config; full restart restores60 |
| token-span.spec.ts: archive | Same-stamp retained75-day row and archived-only85-day row; exact total410, project142/268 and distinct hatching behavior |
| token-span.spec.ts: keyboard and identity | Native Tab/Space/Enter with hidden-window focus emulation, visible focus; every card × every side × every span on both entries; exact dimmed counts |

External record shape was checked against a real local Claude sample (keys only). Synthetic dates and
literal amounts provide independent numeric expectations; archive fixture follows its existing public
on-disk format and real merge path. No new parsing behavior is inferred from these fixtures.
The Grok row originally carried an impossible cache-write value; it now has input44, while the
Claude row exercises cache writes. Totals and the independent expected composition remain unchanged.

Coverage limits: acknowledgement reordering is not artificially forced inside Electron. The owner
ignores save responses; public backfill tests cover delayed initial reads, and real rapid events plus
restart cover final persistence. The test header states the missing transport-delay scenario and its
condition for addition. Power-loss durability is not simulated; real pre-rename failure and reopened
storage verify the existing atomic-replacement boundary. Opt-in external-meter parity remains an
explicit skipped test, not a passing result.

### 2. Test design and coupling
- Behavior seams: public PrefsStore/validated handlers, backfillPrefs, usage functions and real Electron
  UI. No owned-module mocks, private-state casts or internal call-count assertions introduced.
- Disk reads are supplementary evidence for acknowledged persistence and untouched archive/config;
  full process relaunch is the actual user-path proof. Directory obstruction deliberately targets the
  external filesystem boundary, and is cleaned up with the isolated profile.
- Card/model/composition assertions use literal totals and exact tooltip text. Replaced loose numeric
  substring patterns, which could match2 inside12. All async assertions are awaited; data cardinality
  is asserted before geometry; no conditional silent skip or empty collection success is introduced.
- Hidden-window keyboard testing enables focus through CDP, then sends real keyboard actions; no
  synthesized click event replaces a user path. Appearance measurement removes Playwright's default
  light emulation before reading native dark mode.

### 3. False-signal audit and mutation attribution
| Check | Actual red and restoration evidence |
|---|---|
| First preference read TDD | Saved60 was absent before the field existed; failure at the public reopened-store result. Evidence: red-prefs.log |
| Linked usage TDD | Selecting60 returned12 instead of35 while fixed30 logic remained. Evidence: red-usage.log |
| Backfill TDD plus targeted mutation | Initial missing-field red alone did not prove race protection. Mutated only the span branch to incoming; the intended late-read assertion received60 instead of90. Source replacement was asserted unique and printed; exact original bytes restored in finally. Evidence: mutation-backfill.log |
| Persistence mutation | Removed only setTrendSpan's persist call. Handler returned60 but reopening saw30, failing precisely the disk round-trip assertion. Exact source bytes restored. Evidence: mutation-save.log |
| Existing UI mutation guards | Earlier shared-control force30 and2000px label mutations failed bar-count and clipping assertions after fresh builds. Those paths remain exercised; this review does not claim a new replay of those historical mutations |
| Legacy dropdown assertion | Full gate failed at the removed combobox, while the snapshot showed30 pressed. Exhaustive src/e2e search found one such obsolete assertion and it was replaced |
| Geometry / colour false reds | Hex versus RGB normalization and actual label-geometry polling fixed the measurements; product axis/palette were not changed to satisfy them |
| Saved appearance false red | Test runner pinned light, so the added dark assertion initially failed; removing media emulation exposed the actual persisted dark appearance and the test passed |

No unresolved false-green finding. The final gate runs after exact source restoration and includes the
new fallback case. [checklist.md](checklist.md) records the actual result and each requirement's boundary.

### Delivery version binding

The reviewed specification, implementation, tests and evidence above were committed as
`46437b5fc317f6f17b1eb4764358583cfb50b2a6` and pushed to existing [PR185](https://github.com/zhoulf1006/agentshed/pull/185).
This follow-up changes delivery records only. Local final gateway exit0 applies to that exact code.
[GitHub run35814852190](https://github.com/zhoulf1006/agentshed/actions/runs/35814852190) could not
start either job: GitHub reports failed account payments or an insufficient spending limit. This is
remote infrastructure unavailability, not a remote test pass/fail. Issue186 remains open; merge
requires the user's separate confirmation. No product requirement or verification scope changed.
