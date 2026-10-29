# Code review — #327 Closeout: full-feature acceptance and documentation regression (Antigravity CLI side)

Ticket: [#327](https://github.com/aloong-planet/agentshed/issues/327) (feature `antigravity-side`) · feature checklist:
[checklist.md](checklist.md) · decisions: [ticket-327-decisions.md](ticket-327-decisions.md)

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

Date 2026-10-29 · reviewed: `dc80aa2..87ec0b3` on `feat/antigravity-closeout` (the landing rehearsal's head `dc80aa2`, then
`db5aecf` — the `~/.gemini` path fold in `src/main/providers/types.ts`, `global.ts` and `src/main/roots.ts` — and
`87ec0b3`, the closeout's e2e case in `e2e/app.spec.ts` with its fixture home) · scope: every line of that range; the
documents this ticket changes are checked in the regression ([final-regression.md](final-regression.md)), not here.

## UI gate (step 4, item 0)

No interface change in this range: the fold moves where three paths are derived, the e2e case reads the interface.
`/ui-design` was loaded for the session; its rules bind no change here.

## Underlying premises

1. **"Every root the app or a test builds puts the data root inside `geminiHome`"** — the premise under "no behaviour
   change". Enumerated every place a `ScanRoots` is built (`rg -n "antigravityHome:" src scripts e2e`, 18 hits:
   the interface's own field, `realRoots()` and 16 test fixtures, the last 17 each `join(<home>, '.gemini', 'antigravity-cli')` beside
   `geminiHome: join(<home>, '.gemini')`; the scripts and the e2e build theirs through `realRoots()`). Holds; with it,
   `dirname(antigravityHome)` and `geminiHome` were the same string everywhere, so moving the derivation changes no path.
2. **The new `geminiHome` comment: "every location under it outside the data root is derived from this field"** —
   checked against every read under `~/.gemini`: `antigravityConfigDir` (plugins, agents, MCP, config `skills`, config
   `AGENTS.md`) now `join(roots.geminiHome, 'config')`; the third global skills library `join(roots.geminiHome,
   'skills')`; the root `AGENTS.md` `join(roots.geminiHome, 'AGENTS.md')`. Every other reader under the directory takes
   `antigravityHome` (conversations, settings, summaries, its own skills directory — `token-stats.ts`, `scan.ts`,
   `types.ts`), which is inside the data root. A literal `.gemini` in product code remains only in `realRoots()`
   (`rg -n "'\.gemini'" src -g '!*.test.ts'`: one hit, `roots.ts:11`). Holds.
3. The e2e case's comments state the fixture: the times (Claude 12:00, agy 09:00, Grok 06:00, Codex 01:00 today; the
   solo conversation two days ago), the figures (1k, 5k, 3k, 2k; 7k), "the measured four-question transcript" (`MEASURED_TRANSCRIPT.main`
   lists four questions — #324's case reads "4 questions" on its row), "asks nothing" (no transcript written, so no
   question, session-view::REQ-003/AC-02). Each matches the code beside it.

No finding. Security and Consistency below are scanned on the premises as they stand.

## Runnability

- The fold: each derivation returns the same string for every reachable `ScanRoots`; `geminiDir` had no caller outside
  `types.ts` (`rg -n geminiDir src scripts e2e` before the change: its definition and two uses in the same file). Typecheck
  and lint exit 0; the unit suite 1087 passed, 1 skipped, after the change.
- The e2e case: one launch, no rescan interval, no write to the home after launch; every read is a retried assertion
  on rendered DOM, and the card's four parts are one `expect.poll` over one DOM read, so they cannot pass on two
  different renders. Times are set within today from `localDayOffset(0)` with `setHours`, the form the Grok closeout's
  case already uses; a run started a few seconds before midnight would put the day key and the calls on two days —
  the same exposure every "today" case of the suite carries, not new here. Clipboard and Finder are not touched (no copy
  or reveal button is clicked).

Escape surfaces: no error path is added. No finding.

## Security

No new IPC channel, allow-list entry or read. The skill-file reader's known roots come from `globalSkillsRoots`, whose
values are unchanged in production (the same three agy paths), so nothing becomes readable that was not. No finding.

## Consistency

- Invariants: `ScanRoots` keeps one field per side's data root (ADR-0002's injectable seam; the decision against removing
  `antigravityHome` is in the decisions record). The e2e case keeps the suite's rule of one launch per distinct fixture
  home and the `launch(…, home)` requirement.
- Class-level check of "a location under `~/.gemini` derived from a source other than `geminiHome`": every derivation
  enumerated in premise 2 — none left.
- Smell baseline over the changed code: Duplicated Code — `mkAntigravityCloseoutHome` defines its own `file` and `skill`
  helpers, as `mkAgyComponentsHome` and the other home builders each do; answered: the suite's convention is a builder
  with local helpers, and lifting them to module level would touch every other builder (outside this change). The rest
  of the baseline does not apply to a derivation change and a test.
- Documents the fold makes untrue: the `geminiDir` comment it removes pointed at this closeout; the #326 decisions
  record's open finding "two roots for one tree" is resolved by it (its row is updated, see the decisions record).
  Specs, features, CONTEXT and ADRs name no derivation.

## Findings

None.

## Refactoring list (not executed)

| Item | Reason | Escape surface | Suggested handling |
|---|---|---|---|
| The e2e home builders each define `file` / `skill` helpers | Duplicated Code across builders (this change adds one more) | None (test code) | Do not do here: fold into a shared helper the next time several builders change together |

## Spec final check (before step 7; code read only)

2026-10-29, against the specs at `cbe22ca` with the five tickets' write-backs as `dc80aa2` holds them, unit by unit for
the units this ticket owns (the issue's product acceptance):

| Unit (spec text) | Implementation | Conclusion |
|---|---|---|
| agents-overview::REQ-003/AC-01 "A summary card for the side: detected when agy's data root exists (A1, A2); its figure is the side's usage in the selected window; its third line is the side's project count, global skill count and subagent count (B2), each by the same accounting as its section" — combined from #322, #323 and #325 | `SideCard` over `SIDE_ORDER` (#322), `slice.bySide` (#323), `sideStats` with `origin === 'disk'` (#325) | Met: the three parts render in one card; the e2e case reads them in one pass |
| project-detail::REQ-002/AC-04 "The Skills, Subagents, Plugins and Sessions sections show the side as their specs define …; the Overview's per-side row, trend side switch and model rows include it …; the Memory section shows nothing for it" — combined from #322 to #325 | `DetailPane`'s sections over the one project detail and snapshot | Met: the e2e case reads each section on one project registered on every side |
| token-stats::REQ-003/AC-08 "credited to the project of the first folder its trajectory metadata lists, presumed to be the directory agy was launched in" with its Pending note | `firstFolder` (#322, #323) — unchanged | Met as before; the Pending note is kept: no conversation on this machine lists more than one folder (re-checked read-only, [ticket-327-pending-check.log](ticket-327-pending-check.log)) |

Scope beyond these units: the fold (no spec text names how a path is derived; below spec level, recorded as a
decision). No code contradicts a spec statement.
