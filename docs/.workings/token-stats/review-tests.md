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
