# Token statistics work index

Namespaces: [token-stats](../../specs/token-stats.md), [agents-overview](../../specs/agents-overview.md).
This is a working evidence index, not the requirements authority.
Latest status: [Issue 186 implementation acceptance](#2026-09-23--issue-186-implementation-acceptance). Earlier stage records below retain their original historical status.

## Current source → spec audit: inline global span and linked total

Stage: specification update only. User approved the revised prototype and requested `to-spec`.
Version reference: `4714c4f0fb15866f34b1f61f7736464213ed2c2f`, plus uncommitted specification,
prototype and working-record changes. No new spec commit exists; no commit was created for this field.
The verification records below the historical divider concern the older dropdown design and do not
prove the revised requirements. Production implementation and acceptance remain pending.

### Confirmed-source inventory

Quotes below are faithful English translations of the current conversation, except inline numeric
notation. Earlier decisions were checked against the later revisions, not taken as current by default.

| Source anchor and supporting text | Disposition | Current coverage and conclusion |
|---|---|---|
| Initial request: “The chart only shows 30 days; I want more, 60 and 90.” | Effective | token-stats::REQ-002/AC-02, token-stats::REQ-002/AC-03: selectable daily extent and existing historical data |
| Revision: “I do not want a dropdown…30 · 60 · 90…highlight whichever number is selected.” | Effective; supersedes dropdown form | token-stats::REQ-002/AC-01, token-stats::REQ-002/AC-06 |
| Same revision: “Remember this choice…persist it…show this choice next time…global…all Token bar charts.” | Effective; supersedes independent page state and restart reset | token-stats::REQ-002/AC-05, token-stats::REQ-002/AC-07 |
| Linked-total request with fourth-card screenshot: “When choosing 60 days, show the last 60 days' total; 90 shows 90 days.” | Effective | token-stats::REQ-002/AC-08, token-stats::REQ-002/AC-09; one existing card changes, no fifth/sixth card |
| Delivered prototype explanation: “When this card is active, side/model statistics follow it”; user then asked about spacing and approved | Effective | token-stats::REQ-002/AC-04, token-stats::REQ-002/AC-09; preserve active card, do not auto-select it |
| Spacing response: “Small spacing…CSS…independent click regions”; final user: “ok, next use to-specs to update requirements” | Effective prototype confirmation | token-stats::REQ-002/AC-01; applies to numeric layout and linked card |
| Prior default, sparse data, local-day semantics and existing D/G behavior | Applicable regression constraints | token-stats::REQ-002/AC-02–04, token-stats::REQ-002/AC-06, token-stats::REQ-002/AC-08–09, token-stats::REQ-001/AC-02 |
| Existing app preferences: per-field fallback, atomic app-owned storage, localized failure toast and touched-field backfill | Existing technical precedent; required failure-path derivation, not a new settings surface | token-stats::REQ-002/AC-10–13; no new dialog, account or settings page |
| Previous confirmation of dropdown with fixed 30-day totals and restart reset | Superseded for those conditions | Replaced by the later explicit requests; old test passes do not apply |
| Icon changes, release/signing, session migration | Background, not this increment | No requirement imported |
| Custom endpoints, new card count, different token accounting | Not requested; existing exclusions remain | Out of Scope retained; no expansion |

### Stable identity and scope

- Keep token-stats::REQ-002 and AC-01–06: the daily-span selection obligation retains its identity;
  its UI, coupling and lifetime are revised with the explicit authorization above.
- New independent acceptance units: token-stats::REQ-002/AC-07–13. Full-history search across all
  local refs for these IDs in the spec returned no prior use before allocation.
- Keep token-stats::REQ-001/AC-02 and extend its window names to selected N days.
- Legacy story 7 and G1 now summarize the fourth-card rule whose unique acceptance definition is
  token-stats::REQ-002/AC-08; G11 explicitly scopes non-persistence to active-card identity.
  D1/D10 continue to refer to token-stats::REQ-002/AC-02 and token-stats::REQ-002/AC-04.
- Applicable D1–D10 and G1–G9/G11–G14 conditions are carried by AC-02–06, AC-08–09 and AC-13;
  they are regression obligations, not parallel newly numbered requirements.
- A/B/F parser rules, C archive/cache/retention policy, E scan triggers and G10/G15 colour/retention
  marking are unaffected: the same effective rows feed the new window. Other user-story motivation
  and unrelated implementation/testing paragraphs stay unchanged. No whole-feature closeout claimed.

### Interface coverage and confirmation

| Changed point | Existing prototype evidence | Decision |
|---|---|---|
| Inline numbers, selected accent, small CSS gaps and independent click regions | `docs/prototypes/agents-page/prototype-agents.html`, `docs/prototypes/project-detail/prototype-detail.html` | Approved by final “ok” following spacing explanation |
| Fourth-card title and amount, active side/model/composition coupling | Same two pages, 30/60/90 switching | Approved; project mock 13.3M / 26.0M / 39.2M, global 60-day 4.04B / 90-day 5.85B |
| Global sync and persistence interaction | Same-origin two-page synchronization and reload at 60 | Approved interaction; prototype storage is not production restart proof |
| Saved-span loading control/card label and loaded value | `docs/prototypes/agents-page/prototype-agents-skeleton.html`; Chinese and Russian render checks | Covered; existing loading layout reused |
| Save failure | Existing application save-error toast is reused | Pure localized message adaptation; no new state layout or dialog requiring a new prototype |

### Publication design audit: spec → source

| Unit | Reverse coverage and design conclusion |
|---|---|
| token-stats::REQ-002/AC-01 | Explicit numeric-form request and spacing approval; no dropdown |
| token-stats::REQ-002/AC-02 | Original 30/60/90 request plus existing calendar contract; empty/future/DST edges retained |
| token-stats::REQ-002/AC-03 | Historical daily values and existing ADR-0008/provider/archive behavior retained |
| token-stats::REQ-002/AC-04 | Existing independent side/active-card identities retained; only the explicitly requested fourth-card coupling changes |
| token-stats::REQ-002/AC-05 | Explicit global scope; includes navigation and snapshot lifetime |
| token-stats::REQ-002/AC-06 | Existing i18n, accessibility and width/axis rules applied to the confirmed form |
| token-stats::REQ-002/AC-07 | Explicit persistence; fresh default 30 retained; local app reopening, no invented login feature |
| token-stats::REQ-002/AC-08 | Explicit 60/90 total request; ADR-0025 source and project scope retained |
| token-stats::REQ-002/AC-09 | Approved linked-card prototype plus existing G3/G8; preserve active card and consistent breakdowns |
| token-stats::REQ-002/AC-10 | Missing/invalid existing preferences and isolation are necessary upgrade paths of persistence; reuse existing store policy |
| token-stats::REQ-002/AC-11 | Last-choice and startup-backfill races derived from global remembered selection; existing backfill seam available |
| token-stats::REQ-002/AC-12 | Failure/interruption path of persistence; existing toast/atomic write behavior, no new surface |
| token-stats::REQ-002/AC-13 | Existing startup no-shift contract adapted to saved global span; approved skeleton |
| token-stats::REQ-001/AC-02 | Shared display clock still binds totals and chart; window set follows approved N |

All current effective sources map to acceptance units, and every changed normative clause maps
back to a source or an applicable existing constraint. The operation-sequence matrix covers entry,
selection, navigation, snapshot updates, preference races, restart, invalid storage and failed saves.
External-content rendering is unchanged; this preference introduces no content-derived capability.
ADR-0008/0009/0025 stay valid, with no conflict or new architectural choice requiring an ADR.

### Document state and implementation handoff

The spec has an explicit `Pending:` product condition. `docs/features/token-stats.md` and the
Time window/Trend span entries in `CONTEXT.md` still describe the currently implemented dropdown
behavior. They must change with implementation, not claim the new behavior is shipped now. This is
an intentional staged difference with a concrete completion condition, not an unresolved design choice.
The implementation handoff must update those entries, extend prefs/IPC contracts, implement the
linked aggregation and run the revised Electron restart/global-scope acceptance tests. No tickets
were allocated and no production code was changed in this specification turn.

Testing seams: reuse Electron navigation/relaunch, public usage/trend/axis functions, preference
store/handler and preference-backfill. No new seam or testing framework is needed. Previous complete
gateway evidence is historical only; this turn checks document consistency and identifier/link shape.

Document verification: `pnpm check:lang` and `git diff --check` passed. Identifier/link inspection
found 13 unique span acceptance definitions, all local AC references and Markdown links resolved,
and no temporary or prototype path leaked into the spec. This verifies document shape, not product behavior.

## Spec → tickets → verification: approved single vertical slice

Published: [#186](https://github.com/zhoulf1006/agentshed/issues/186); local [ticket 01](ticket-draft.md). Reproducible surface listing: [enumeration](ticket-surface.md).
Version: `4714c4f0fb15866f34b1f61f7736464213ed2c2f` plus uncommitted spec/prototype updates.
Publication state: user approved the single-ticket breakdown; GitHub issue #186 is open with the
`ready-for-agent` label. Published body was read back and matched the approved acceptance text.
Source → spec is reused from the current audit above. No source re-interview or new requirement.

| Spec coverage unit | Exact source text and applicability | Owning ticket and role | Planned guarantee and boundary |
|---|---|---|---|
| token-stats::REQ-002/AC-01 | The heading presents exactly `30 · 60 · 90` inline, with each number independently clickable and the selected number highlighted using the theme accent and stronger weight. Small CSS-controlled gaps separate the numbers and dots; literal spacing characters do not determine layout. The dots are separators, not controls. There is no dropdown. | #186: Implementation and end-to-end acceptance | Test: Electron, both chart entries: click each numeric choice and use keyboard activation; assert selected state, computed accent/weight and independent hit areas. Evidence: light/dark rendered screenshots of the confirmed spacing. Not yet verified. |
| token-stats::REQ-002/AC-02 | Selecting N draws N consecutive local calendar dates in ascending order, ending on the shared current display day, including across month/year and daylight-saving boundaries. Older rows and future rows are excluded; absent dates remain zero with no segments. | #186: Implementation and end-to-end acceptance | Test: Public trend and usage seams: literal start/end dates for 30/60/90 including DST, month/year transitions, outside/future and missing dates; Electron asserts exact bar counts and endpoints after each click. Not yet verified. |
| token-stats::REQ-002/AC-03 | Expanding the span exposes existing historical daily values, including archived values and their existing hatching. Combined/provider segmentation, single-side counting, daily tooltips, and window-relative height scaling retain D2–D5 and ADR-0008 semantics. | #186: Implementation and end-to-end acceptance | Test: Seed different older, archived and recent daily values; expand both chart entries, inspect tooltip totals, provider segments, hatching and side-only values against the fixture. Not yet verified. |
| token-stats::REQ-002/AC-04 | Changing the span preserves the selected totals-card identity and the chart's side filter. Selecting a totals card or side does not reset the span. All-history, today and 7-day totals and their selected breakdowns are unaffected by a span-only change; the fourth card follows token-stats::REQ-002/AC-08 and token-stats::REQ-002/AC-09. The side filter applies only to bars, never to the totals cards. Dates outside the selected totals window are dimmed without removing bars; all history dims none. | #186: Implementation and end-to-end acceptance | Test: Electron: for every card identity and side mode, switch span and back; assert unchanged other-card amounts/active identity, unchanged side mode, correct dimmed bars, and all-side totals above side-filtered bars. Not yet verified. |
| token-stats::REQ-002/AC-05 | There is one global span for all Token daily charts. Changing it on either entry updates the other entry and every project when displayed, including already-mounted views. Switching pages, projects or tabs and receiving a new snapshot preserve that choice; there are no per-project or per-page overrides. | #186: Implementation and end-to-end acceptance | Test: Electron: choose 60 globally, visit project A then B, switch tabs, return global, then choose 90 in detail and refresh data; every entry retains the one current value. Not yet verified. |
| token-stats::REQ-002/AC-06 | All spans fit the chart width with daily bars; 60/90-day bars use tighter gaps. The date axis retains D6–D9/ADR-0009 semantics: data days only, correct month context, no overlapping or out-of-container labels. The inline choices and linked card remain usable at the minimum supported window width, in all themes, both appearances and every UI language. Copy and accessible names are localized; keyboard focus and the selected value are exposed through the existing accessible-control conventions. | #186: Implementation and end-to-end acceptance | Test: Electron geometry/computed-style and keyboard checks on both entries at minimum width in six languages, three themes and both appearances; assert selected/focus visibility, accessible names, no axis/control clipping or overlap. Evidence: inspect fresh screenshots. Not yet verified. |
| token-stats::REQ-002/AC-07 | A successful choice is saved as an application-owned preference. Quitting and reopening restores it for all charts and the fourth totals card. A fresh profile defaults to 30. This is local application persistence; it does not require an account or login. | #186: Implementation and end-to-end acceptance | Test: Electron: select 60 and 90 in separate runs, fully quit and relaunch using the same isolated user-data directory, then inspect both entries and the fourth card. A fresh profile starts at 30. Not yet verified. |
| token-stats::REQ-002/AC-08 | The fourth card remains a single card whose label is the localized equivalent of “Last N days” and whose amount sums the effective usage rows for those same N local calendar dates, for the current project or all projects as appropriate. It updates whenever the global span changes, even when another totals card is active. Archived and retained usage, zero dates and undated-row exclusion follow G5–G7 and ADR-0025; the value is not a multiple or extrapolation of the 30-day total. The other three cards keep their existing meanings. | #186: Implementation and end-to-end acceptance | Test: Electron plus usage-window seam: fixture with unequal amounts in each 30-day slice, two projects and archived/retained/undated/empty rows; assert exact fourth-card labels and totals even when another card is selected, with all other cards unchanged. Not yet verified. |
| token-stats::REQ-002/AC-09 | If the fourth card is active, changing N keeps it active and recomputes its side totals, composition, model breakdown and heading for N days together with the chart highlighting. Selecting that card after changing N uses the new N immediately. Its three composition buckets continue to sum to its total. Changing N does not automatically select the fourth card when another card is active. | #186: Implementation and end-to-end acceptance | Test: Electron: activate fourth card, switch 30/60/90, assert card/side figures/composition/model heading/rows/dimming in one pass; activate a different card and repeat to prove no automatic reselection. Assert composition identity at the usage seam. Not yet verified. |
| token-stats::REQ-002/AC-10 | An older preference file without the span field, or an invalid span value, falls back to 30 without resetting valid theme/language/appearance preferences. A corrupt preference file uses the existing preference-loading fallback without crashing. Saving the span preserves unrelated preferences and does not write agent configuration or accounting archives. | #186: Implementation and end-to-end acceptance | Test: Preference store/handler seam: missing, invalid and corrupt preferences, unrelated valid settings and save round-trip. Electron profile fixture verifies fallback 30 and preserved settings; isolated filesystem fixture verifies agent/archive files are untouched by span-only saves. Not yet verified. |
| token-stats::REQ-002/AC-11 | On rapid repeated selection, the last user choice wins across views and, once saved, after restart. A late initial preference read or an earlier save response must not overwrite a newer user choice. Snapshot refreshes and preference responses must not leave the selected number, fourth-card label/amount and active breakdowns on different spans. | #186: Implementation and end-to-end acceptance | Test: Existing preference backfill and handler seams with delayed/out-of-order completions, paired with Electron rapid selection plus snapshot updates; assert final selected number/card/breakdowns agree, then relaunch to inspect the final successful saved value. Not yet verified. |
| token-stats::REQ-002/AC-12 | If saving fails, the current selection remains consistent across the open app and the existing localized save-error feedback reports the failure; the app must not claim that it was saved. On reopening, restore the last successfully persisted value (or the default if none exists). Preference writes use the existing atomic save mechanism so an interruption does not leave a partially written preference file. | #186: Implementation and end-to-end acceptance | Test: Preference filesystem seam: force write/rename failure or interrupted replacement and re-open the store to inspect the last complete record. Electron using the same failure condition: choose a span, verify consistent live views and localized error toast, then reopen with the last saved choice. Not yet verified. |
| token-stats::REQ-002/AC-13 | With no first snapshot, the startup placeholder reserves the same inline control and fourth-card geometry, displays the resolved saved/default span, and keeps the chart control disabled. On first data or restored data, the card and chart use that span; startup data arrival cannot reset it to 30. Reopening with a saved span requires no corrective user click. Existing loading and restored-data states are reused. | #186: Implementation and end-to-end acceptance | Test: Electron first-scan delay: launch fresh and with saved 60/90, with and without saved display data; inspect disabled inline choice, fourth-card label and geometry, release scan, and verify the span and anchors remain correct. Not yet verified. |
| token-stats::REQ-001/AC-02 | Today/7-day/selected-N-day totals, model/side/composition breakdowns, trend end date and selected-span highlighting use the same current display-time anchor; crossing midnight or changing time zone must not split their definition of today. | #186: Regression acceptance | Test: Injected display clock plus Electron restored-data fixture: cross midnight and change time zone; compare today, 7-day and selected-N totals, chart end and active breakdowns from the same anchor. Not yet verified. |
| token-stats::REQ-001/AC-03 | Stored observation timestamps and the archive's scan-day accounting are not rewritten to make restored data look current. Undated-row and all-history accounting remain unchanged. | #186: Regression acceptance | Test: Seed saved observation times and archive accounting; change only span and display clock, inspect unchanged timestamps/archive and unchanged all-history/undated-row results. Not yet verified. |
| agents-overview::REQ-001/AC-01 | On a full quit and relaunch with a valid saved snapshot, show its overview and project-list data before the first background scan completes. | #186: Shared startup regression acceptance | Test: Electron: relaunch a saved profile with 60/90 while first scan is held; saved overview/project-list data appears before scan completion. Not yet verified. |
| agents-overview::REQ-001/AC-02 | A successful background scan replaces restored data in place; settings and browsing remain usable during scanning. | #186: Shared startup regression acceptance | Test: Electron: navigate between settings/projects during restored scan, release it, and check in-place data replacement plus preserved global span. Not yet verified. |
| agents-overview::REQ-001/AC-03 | Without a usable saved snapshot (missing, corrupt or incompatible format), retain the existing first-scan skeleton and its automatic recovery behavior. | #186: Shared startup regression acceptance | Test: Electron: missing/corrupt/incompatible display-cache fixtures still enter existing skeleton and recover with the stored preference intact. Not yet verified. |
| agents-overview::REQ-002/AC-01 | Restored data is accompanied by the existing scanning indicator while the first scan runs, without replacing the data area or blocking navigation. | #186: Shared startup regression acceptance | Test: Electron: saved data with 60/90 selected shows the existing scanning indicator and stays navigable without a skeleton replacement. Not yet verified. |
| agents-overview::REQ-002/AC-02 | Remove the scanning indicator when the first scan succeeds, without moving the page's content anchors. | #186: Shared startup regression acceptance | Test: Electron: compare card/chart anchor geometry before and after first scan; indicator disappears without shifting content. Not yet verified. |
| agents-overview::REQ-002/AC-03 | A failed scan retains the restored data; automatic scan triggers continue to provide recovery. The failed state must not claim that fresh data has arrived. | #186: Shared startup regression acceptance | Test: Electron failing-first-scan fixture: retain restored totals/span, show the existing failed status, then allow automatic recovery without claiming early freshness. Not yet verified. |
| agents-overview::CON-001 | Startup display data uses its own format version. An application or accounting-cache version change alone does not discard compatible display data. Restored numbers are presentation input, not a new scan result or input for overwriting the usage archive. | #186: Shared startup regression acceptance | Test: Existing display-store/version fixture plus Electron restored startup: compatible display data survives an accounting-version change; span preference writes do not feed restored rows into archive merging. Not yet verified. |
| agents-overview::CON-003 | Every full restart opens Agents. Project selection, session selection, scroll, expanded/collapsed state, search text and time-window selection are not restored by this feature. Persisted appearance and language preferences keep their existing behavior. | #186: Shared startup regression acceptance | Test: Electron relaunch after visiting a project and activating the fourth card: opens Agents with default active totals card, preserved 60/90 preference and appearance/language; existing navigation-state reset regression remains green. Not yet verified. |

### Whole-spec scope classification

| Section | Disposition in this increment |
|---|---|
| Problem/Solution and user-story motivation | Background; affected chart/window goals are accepted through token-stats::REQ-002, not duplicated as new story IDs |
| A/B/F parsing and C archive/cache rules | No product change; established regression gateway retained. Archive consumption and non-writing obligations are explicitly owned by AC-03/08/10 and token-stats::REQ-001/AC-03 |
| D chart/axis and G time windows/composition | In-scope regression conditions assigned to token-stats::REQ-002/AC-02/03/04/06/08/09; no palette or archive-marking redesign |
| E automatic refresh | Trigger implementation unaffected; span retention and in-place refresh owned by AC-05/11/13 and the cited startup regression units |
| Selectable span and its failure matrix | All 13 current units owned by draft 01, with every operation-sequence branch represented in its tests |
| Restored clock | token-stats::REQ-001/AC-02 and AC-03 are applicable regressions; AC-01 activity labels are unchanged because no relative-label surface changes |
| Implementation decisions | Global preference/derived window are technical prerequisites within draft 01; existing accounting/cache/archive decisions are constraints, not new refactors |
| Testing decisions | Reused seams and required user-path/geometry/relaunch assertions are allocated in the table; no new test framework or alternate verification boundary |
| Out of Scope | Preserved by the ticket's Boundaries; no acceptance obligation added for excluded products |
| Shared startup requirements | Both startup REQ groups and CON-001/003 have explicit regression ownership above; CON-002 file permissions and unrelated page sections are untouched |

### Bidirectional ticket audit

| Check or finding | Disposition |
|---|---|
| Spec unit → owning ticket → guarantee | Every current span unit and applicable identified clock/startup constraint has a direct row and exact quoted ticket criterion; no unowned unit |
| Ticket criterion → spec | Each product checkbox uses its existing namespace ID and source quote; no private ticket AC numbering or hidden product requirement |
| Shape vs persistence vs totals split | Rejected: the same screen would temporarily disagree. Draft 01 delivers all layers and both entries together |
| Lower-level pass substituted for behavior | Prevented: both entry points, navigation, fourth-card states, startup and full restart are required Electron paths; pure tests supplement them |
| Shared constraints and races | Same ticket owns each contribution and combined assertion. No deferred acceptance or inferred final ticket |
| Scope expansion | Technical prerequisites cite supporting ACs; workflow checks cite project policy. Parser/retention/navigation changes are excluded |
| Spec only exists with uncommitted edits | Explicitly recorded; implementation must obtain that revision and record a real commit when available. The older committed spec is not the accepted source |
| Existing dropdown verification | Historical only; revised requirements are not yet verified. All production results must be appended with their actual implementation commit |

Design verdict: one ticket fits one fresh implementation context using existing seams, without an
independent prefactor. No separate closeout ticket is required for a single-ticket increment.
The user approved this breakdown and it is published as #186. Any future split/merge requires
a fresh audit of the affected mapping.

### Verification history for the proposed ticket

2026-09-23; spec baseline `4714c4f0fb15866f34b1f61f7736464213ed2c2f` plus uncommitted revision;
implementation baseline is the same commit's older dropdown code. All 23 listed units for draft 01
are **not yet verified** for the revised design. Document mapping is planning evidence only.

---

## Historical implementation record: superseded dropdown design


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

### Tracker publication verification

GitHub issue [#186](https://github.com/zhoulf1006/agentshed/issues/186) was created after user approval. Read-back confirmed OPEN state,
`ready-for-agent`, no blockers, and an exact normalized-text match to the prepared body including
all 23 acceptance/regression units. No parent issue was modified. Spec remains the documented
uncommitted revision over `4714c4f0fb15866f34b1f61f7736464213ed2c2f`; production implementation is not started.


## 2026-09-23 — Issue 186 implementation acceptance

Version: `4714c4f0fb15866f34b1f61f7736464213ed2c2f` plus the uncommitted approved
spec/prototypes and implementation in this delivery. Each row below was rechecked against the current
spec and named test inputs/results, not inferred from the earlier dropdown passes. All rows are owned
by #186; this is a single-ticket increment, not a separate full-feature closeout ticket.

The first full revised gateway exposed one obsolete combobox assertion (87/88 E2E passed). After
repair, `pnpm verify` returned0:725 unit tests passed,1 explicitly opt-in parity test skipped,88 E2E
passed, all four static gates and smoke passed. Test review added the older/invalid-profile UI case,
which passes separately; final integrated gate evidence is appended below after completion.

| Coverage unit and governing source quote | Actual verification boundary and result | Conclusion |
|---|---|---|
| token-stats::REQ-002/AC-01 — The heading presents exactly `30 · 60 · 90` inline, with each number independently clickable and the selected number highlighted using the theme accent and stronger weight. Small CSS-controlled gaps separate the numbers and dots; literal spacing characters do not determine layout. The dots are separators, not controls. There is no dropdown. | Both selectable-span entries, localized-controls case and numeric-keyboard case: all three choices clickable, exact pressed/accent/700 weight, distinct rectangles; reviewed light/dark screenshots. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-02 — Selecting N draws N consecutive local calendar dates in ascending order, ending on the shared current display day, including across month/year and daylight-saving boundaries. Older rows and future rows are excluded; absent dates remain zero with no segments. | trend.test.ts literal30/60/90 calendar endpoints, DST spring/fall and year cases; both Electron mount tests exact counts/endpoints. Older/future/empty dates excluded or zero. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-03 — Expanding the span exposes existing historical daily values, including archived values and their existing hatching. Combined/provider segmentation, single-side counting, daily tooltips, and window-relative height scaling retain D2–D5 and ADR-0008 semantics. | trend.test.ts provider and single-side segments plus app archive/provider regressions; token-span archived/retained case: global410/project142/268, retained no hatch, archived hatch, exact old-day tooltip. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-04 — Changing the span preserves the selected totals-card identity and the chart's side filter. Selecting a totals card or side does not reset the span. All-history, today and 7-day totals and their selected breakdowns are unaffected by a span-only change; the fourth card follows token-stats::REQ-002/AC-08 and token-stats::REQ-002/AC-09. The side filter applies only to bars, never to the totals cards. Dates outside the selected totals window are dimmed without removing bars; all history dims none. | token-span numeric keyboard/identity test: both entries × four card roles × four side filters × three spans; pressed card and side retained, today dimsN−1/d7 dimsN−7; first three model slices unchanged. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-05 — There is one global span for all Token daily charts. Changing it on either entry updates the other entry and every project when displayed, including already-mounted views. Switching pages, projects or tabs and receiving a new snapshot preserve that choice; there are no per-project or per-page overrides. | Global-span exact-total journey visits alpha, beta and Agents in both directions; both existing mount cases retain span through tabs and real appended-history refresh185→295. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-06 — All spans fit the chart width with daily bars; 60/90-day bars use tighter gaps. The date axis retains D6–D9/ADR-0009 semantics: data days only, correct month context, no overlapping or out-of-container labels. The inline choices and linked card remain usable at the minimum supported window width, in all themes, both appearances and every UI language. Copy and accessible names are localized; keyboard focus and the selected value are exposed through the existing accessible-control conventions. | Localized-controls Electron case: six languages × three themes × two modes × both entries at800px; exact accent/weight and button gaps; keyboard case focus and activation; dense axis geometry polled after resize. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-07 — A successful choice is saved as an application-owned preference. Quitting and reopening restores it for all charts and the fourth totals card. A fresh profile defaults to 30. This is local application persistence; it does not require an account or login. | Global-span journey: fresh30, actual quit/relaunch60 and90 in the same isolated profile, both entries and fourth card read the restored value; active card independently defaults all. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-08 — The fourth card remains a single card whose label is the localized equivalent of “Last N days” and whose amount sums the effective usage rows for those same N local calendar dates, for the current project or all projects as appropriate. It updates whenever the global span changes, even when another totals card is active. Archived and retained usage, zero dates and undated-row exclusion follow G5–G7 and ADR-0025; the value is not a multiple or extrapolation of the 30-day total. The other three cards keep their existing meanings. | Exact unequal global62/144/246 and project16/42/78 versus46/102/168; inactive fourth-card title/amount update. Usage seam12/35/79 excludes undated/future rows; archive UI fixture supplies retained/archived totals. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-09 — If the fourth card is active, changing N keeps it active and recomputes its side totals, composition, model breakdown and heading for N days together with the chart highlighting. Selecting that card after changing N uses the new N immediately. Its three composition buckets continue to sum to its total. Changing N does not automatically select the fourth card when another card is active. | Exact-total journey activates fourth then changesN: side totals, exact three composition tooltip values, model counts/rows, heading and no dimmed dates agree. Identity matrix and unchanged first-three results prevent automatic reselection. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-10 — An older preference file without the span field, or an invalid span value, falls back to 30 without resetting valid theme/language/appearance preferences. A corrupt preference file uses the existing preference-loading fallback without crashing. Saving the span preserves unrelated preferences and does not write agent configuration or accounting archives. | Prefs store/IPC tests: per-field fallback, corrupt and legacy records, valid settings retained. Older/invalid Electron test runs missing/45/string60 against French system language and saved blue/dark/en; both entries30 and next save preserves fields. Failure journey confirms archive/config bytes unchanged. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-11 — On rapid repeated selection, the last user choice wins across views and, once saved, after restart. A late initial preference read or an earlier save response must not overwrite a newer user choice. Snapshot refreshes and preference responses must not leave the selected number, fourth-card label/amount and active breakdowns on different spans. | Late-read public backfill test and mutation demonstrate incoming60 cannot replace touched90. Rapid real selections30→90→30→60 followed by quit/relaunch restore60; actual snapshot refresh retains90. Evidence: onTrendSpan validates but never applies save responses, so earlier acknowledgement has no state-write path. Forced transport reordering is explicitly not claimed. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-12 — If saving fails, the current selection remains consistent across the open app and the existing localized save-error feedback reports the failure; the app must not claim that it was saved. On reopening, restore the last successfully persisted value (or the default if none exists). Preference writes use the existing atomic save mechanism so an interruption does not leave a partially written preference file. | PrefsStore EISDIR before atomic rename leaves disk60; open-app live90 stays coherent, localized toast appears, archive/config unchanged, full quit/relaunch60. Removing persist causes reopened-store assertion60 versus30 to fail (mutation-save.log). | Passed; test/evidence boundaries as stated |
| token-stats::REQ-002/AC-13 — With no first snapshot, the startup placeholder reserves the same inline control and fourth-card geometry, displays the resolved saved/default span, and keeps the chart control disabled. On first data or restored data, the card and chart use that span; startup data arrival cannot reset it to 30. Reopening with a saved span requires no corrective user click. Existing loading and restored-data states are reused. | Three Electron cold-cache cases30/60/90: missing/corrupt/incompatible display copy, exactly three disabled numeric buttons and matching fourth label, live fill preserves choice and geometry. Saved-data60/90 runs render before delayed scan without corrective input. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-001/AC-02 — Today/7-day/selected-N-day totals, model/side/composition breakdowns, trend end date and selected-span highlighting use the same current display-time anchor; crossing midnight or changing time zone must not split their definition of today. | Extended startup-restore journey selects90, injects2030 midnight and changes time zone:90 bars, selected-day marker, fourth total0 and today0 use one clock; shared usage/calendar tests cover7-day boundary. | Passed; test/evidence boundaries as stated |
| token-stats::REQ-001/AC-03 — Stored observation timestamps and the archive's scan-day accounting are not rewritten to make restored data look current. Undated-row and all-history accounting remain unchanged. | Startup-restore journey compares observation timestamp across display-clock changes; unchanged archive/config bytes checked during span write failure. Usage tests retain undated/all-history rules and existing archive tests guard scan-day accounting. | Passed; test/evidence boundaries as stated |
| agents-overview::REQ-001/AC-01 — On a full quit and relaunch with a valid saved snapshot, show its overview and project-list data before the first background scan completes. | Startup-restore project/session journey plus span60/90 delayed-scan relaunch shows saved overview/project data before scan completion; Agents is the initial page. | Passed; test/evidence boundaries as stated |
| agents-overview::REQ-001/AC-02 — A successful background scan replaces restored data in place; settings and browsing remain usable during scanning. | Existing startup-restore journey browses saved project/session/settings while scanning, then receives fresh rows in place. Global-span restart keeps savedN through ready transition. | Passed; test/evidence boundaries as stated |
| agents-overview::REQ-001/AC-03 — Without a usable saved snapshot (missing, corrupt or incompatible format), retain the existing first-scan skeleton and its automatic recovery behavior. | Three new token-span cold-cache cases explicitly supply missing, malformed and incompatible display-cache files and assert skeleton→data with savedN. | Passed; test/evidence boundaries as stated |
| agents-overview::REQ-002/AC-01 — Restored data is accompanied by the existing scanning indicator while the first scan runs, without replacing the data area or blocking navigation. | Global-span restart shows scanning state with actual restored figures60/90; existing startup-restore navigation remains usable while first scan is held. | Passed; test/evidence boundaries as stated |
| agents-overview::REQ-002/AC-02 — Remove the scanning indicator when the first scan succeeds, without moving the page's content anchors. | Global-span restart compares chart top before/after ready; cold-start cases compare inline-control top; existing startup skeleton tests compare all named anchors. | Passed; test/evidence boundaries as stated |
| agents-overview::REQ-002/AC-03 — A failed scan retains the restored data; automatic scan triggers continue to provide recovery. The failed state must not claim that fresh data has arrived. | Extended failed-startup case saves60, relaunches into waiting status without spinning, retains data/label, then automatic recovery succeeds. | Passed; test/evidence boundaries as stated |
| agents-overview::CON-001 — Startup display data uses its own format version. An application or accounting-cache version change alone does not discard compatible display data. Restored numbers are presentation input, not a new scan result or input for overwriting the usage archive. | Display-store unit regressions and startup-restore version fixture preserve compatible display copy across accounting-version changes; span-only write failure leaves archive byte-identical; no cache/version/schema edit in diff. | Passed; test/evidence boundaries as stated |
| agents-overview::CON-003 — Every full restart opens Agents. Project selection, session selection, scroll, expanded/collapsed state, search text and time-window selection are not restored by this feature. Persisted appearance and language preferences keep their existing behavior. | Full restart journey opens Agents with all-history selected while retaining90/60; viewed project/session data can be reopened but browsing selection is not restored. Existing navigation-state and appearance regressions remain green. | Passed; test/evidence boundaries as stated |

### Post-review spec audit

Reviewed every increment unit again after test-review repairs. No approved requirement was removed,
no implementation deviation required user re-approval, and no unrelated product behavior was added.
Preference contract/IPC/context and preload bootstrap are prerequisites of the existing persistence
and first-frame obligations. Parser/archive/accounting rules are unchanged. The spec Pending condition
is now false and removed; current feature and glossary text describe the new behavior.

The planned “delayed/out-of-order completions” mechanism is refined honestly: delayed initial data is
validated at backfillPrefs; rapid real IPC is exercised end to end; reversed acknowledgement delivery
is not forced, because acknowledgement values are never consumed. This is a validation-method
clarification, not a reduction of the last-choice requirement. See review-code/runtime and the explicit
coverage limit in review-tests and the test header.

No unmapped acceptance item, semantic narrowing, unapproved expansion or unresolved product finding
remains in the increment. See [review-code](review-code.md), [review-tests](review-tests.md) and
[final-regression](final-regression.md) for independent review and document checks.

### Final integrated gateway

2026-09-23, same baseline plus the final uncommitted delivery: `pnpm verify` exited **0**.
Typecheck,725 unit tests,89 Electron tests, shared-UI/language/i18n/NUL checks and real-data dev smoke
passed. One external-meter parity test is explicitly opt-in and skipped, not counted as a pass.
Smoke ran with a separate user-data directory; the user's running dev instance was not restarted.
No source change followed this gate; subsequent edits are delivery records only.

Durable artifacts: [full gate](issue-186-evidence/verify.log),
[preference red](issue-186-evidence/red-prefs.log), [usage red](issue-186-evidence/red-usage.log),
[backfill mutation](issue-186-evidence/mutation-backfill.log),
[persistence mutation](issue-186-evidence/mutation-save.log),
[Chinese global light](issue-186-evidence/trend-zh-light-0.png),
[Chinese project dark](issue-186-evidence/trend-zh-dark-1.png),
[Russian project light](issue-186-evidence/trend-ru-light-1.png).
The three current screenshots were opened and visually inspected; numeric spacing, selected accent,
linked90-day label and minimum-width chart/control containment match the confirmed design.

### Delivery version binding

The reviewed specification, implementation, tests and evidence above were committed as
`46437b5fc317f6f17b1eb4764358583cfb50b2a6` and pushed to existing [PR185](https://github.com/zhoulf1006/agentshed/pull/185).
This follow-up changes delivery records only. Local final gateway exit0 applies to that exact code.
[GitHub run35814852190](https://github.com/zhoulf1006/agentshed/actions/runs/35814852190) could not
start either job: GitHub reports failed account payments or an insufficient spending limit. This is
remote infrastructure unavailability, not a remote test pass/fail. Issue186 remains open; merge
requires the user's separate confirmation. No product requirement or verification scope changed.

## 2026-09-23 — Confirmed visual amendment

REQ-002/AC-01 now says: "The heading presents exactly `30/60/90` inline" and
"There are no spaces, horizontal button padding or gaps around the slashes."
This supersedes the dot-spacing acceptance recorded above, without changing the other requirements.
The live shared control, theme CSS and both prototype mounts implement the new form. The actual dev
window was inspected after HMR and shows compact slashes with the saved 90-day choice highlighted.
Existing behavioral regression results are recorded in slash-style.md.
