## 2026-09-23 — Selectable trend span

Scope: token-stats::REQ-002, baseline 3a6dca5 plus uncommitted changes.
Self-review covered changed production files, callers, shared styles and prototype mounts.

### 1. Underlying facts
- Elapsed-day subtraction is not calendar arithmetic: the New York fallback fixture produced 89
  unique dates for 90 bars; the same assumption in inWindow highlighted six instead of seven dates.
  Both failures were reproduced before fixing calendar subtraction. A full shared/renderer search
  for `86_400_000|86400000` identified these two calendar-window producers; the remaining production
  use in ProjectsPane measures elapsed relative days, not a calendar window.
- Existing snapshots contain untruncated history: 91 daily fixture records expose day 75 through
  both mounts without changing parsing, archive policy or IPC.
- The initial appearance test pinned light mode. Screenshot inspection exposed that false evidence;
  the existing appearance launcher removes the override. Actual dark screenshots were rechecked.

### 2. Runtime paths
- State starts at 30 per page. Typed options are checked before updating. Tabs and refreshed snapshots
  retain owner state; project switches preserve DetailPaneBody. The empty-project round trip keeps
  90 and restores populated values. Leaving the page destroys view state; no setting is written.
- Bars, scale, provider legend and axis derive from span. The axis effect reruns for bars/language;
  ResizeObserver is disconnected on cleanup. Zero/missing dates contain no segments.
- Existing startup test caught a two-pixel chart shift because the skeleton retained the old title.
  It now mirrors the confirmed default selector, disabled during loading; the original anchor test
  passes without changing its tolerance. This is reuse of the approved control, not a new design.
- Missing dates/side data affect only that date/side; no new asynchronous errors or writes.

### 3. Safety and correctness
- Fixed numeric choices, dictionary copy and existing snapshots only. No new IPC, filesystem access,
  archive mutation, external markup or permissions. Existing tooltip rendering remains intact.
- Rechecked date boundaries and state after fixing the assumptions above. The chart and totals use
  the same display clock/calendar cutoff; input/output accounting is unchanged.

### 4. Invariants and style
- Preserved totals windows, provider palette, daily grain, archive marks, axis semantics and startup
  geometry. New classes were collision-searched before introduction and use existing theme tokens.
- Six dictionaries add matching keys. The old trendTitle dictionary API is retained; its removal is
  unrelated to this change. No new architectural decision or refactor is required.
- Touched icon-bearing structures use existing components/native controls. No whole-repository icon
  audit is claimed. No new character icon was introduced or found in the touched structures.
- Trend span is recorded in CONTEXT; final behavior and startup constraints are in the existing spec.
  No unresolved review finding or deferred refactor.


## 2026-09-23 — Issue 186: global persisted inline span and linked totals

Version: `4714c4f0fb15866f34b1f61f7736464213ed2c2f` plus this delivery's uncommitted
implementation, approved specification/prototypes and tests. This section supersedes the earlier
review only for the revised span requirements. Review is local self-review, not an independent reviewer.

### 1. Underlying facts
- Preference loading precedes window creation; the saved span travels in the existing preload argument
  channel before the initial skeleton. Real cold/restarted Electron profiles verify 30/60/90 without a
  corrective click. Preference loading defaults per field; invalid-span UI profiles keep blue/dark/en.
- Every amount still derives from effective usage rows, not the prototype's scaled mock values. Literal
  global totals 62/144/246 and project totals 16/42/78 and 46/102/168 distinguish all three durations.
  Seeded retained/archived days produce 410 globally, 142 and 268 per project, with correct hatching.
- Inspected the key structure of a real local Claude assistant JSONL record: string timestamp,
  message.model, message.usage and all four token fields. No source content or private values copied.
- Three misleading test signals were identified: CSS hex versus computed RGB, labels measured before
  ResizeObserver relayout, and Playwright's light media override masking Electron's saved dark mode.
  Fixes normalize the comparison, poll the actual geometry and remove test emulation respectively;
  none required changing product behavior. The full gate also exposed one obsolete combobox selector.

### 2. Runtime paths and failure escape scope
| Entry/exit | Review and observed boundary |
|---|---|
| Launch → initial prefs → restored data or skeleton → live data | Synchronous validated startup span, independent snapshot hydration, disabled placeholder control; both restoration and three unusable-cache cases pass |
| Numeric mouse/keyboard choice → all mounted charts | App owns one preference; global/project consumers share context; all four card identities and all side filters survive every span |
| Tab/project/page switch or snapshot refresh | View-local span state removed from both owners; new snapshots change rows, not the preference; both entry tests prove an actual appended historical value arrives |
| Initial preference read finishes after a choice | Touched-field merge keeps the synchronous local mirror; mutation taking incoming60 over local90 fails the intended assertion |
| Earlier save acknowledgement finishes later | Responses are validated but never applied to span state. Writes execute synchronously at the main boundary; real rapid clicks and quit/reopen retain the final60 |
| Invalid/missing preference field | Self-only degradation: span30, other valid settings preserved; corrupt file uses the existing whole-file fallback |
| Invalid IPC input / unavailable store | Self-only request failure, validated before mutation; handler tests cover strings, objects, null, unsupported numbers and store readiness |
| Filesystem save fails | Self-only persistence failure: localized error, coherent live90, unchanged complete disk60, real restart60; agent configuration and usage archive bytes unchanged |
| Startup scan fails | Existing restored data and saved60 remain visible; existing waiting status and automatic recovery verified |
| Display clock advances / zone changes | Shared anchor and calendar-date arithmetic retained; 90 bars, fourth-card amounts and selected-day highlighting follow the same day; observation time unchanged |

No same-layer or upstream failure escape was found in this increment. The store's optimistic memory
on a write failure is intentional, matches existing preferences and the spec's live-selection rule.
No new timers/subscriptions are introduced by the span context; the existing chart observer cleanup remains.

### 3. Safety and correctness
- New IPC accepts only the closed numeric union at the main boundary. Saved field loading and preload
  response parsing are separately validated. Renderer input cannot supply paths or arbitrary settings.
- The only new write is the app-owned atomic preference replacement. No parser, archive writer,
  content renderer, permission, accounting stamp or cache schema changes.
- After checking startup ordering and failure behavior, rechecked state propagation and all six
  dictionary consumers. The fourth-card key remains its identity; the resolved duration is the global
  span, while all/today/d7 retain their old arithmetic and lifetime.

### 4. Invariants, class-level scan and refactoring
- Enumerated both production chart mounts, the shared totals card and startup skeleton. All consume
  the one owner; no page-local override remains. Six locale dictionaries supply equivalent dynamic
  N-day labels and save-error copy. The prototype's localStorage is demonstration-only, not app storage.
- Whole `src`/`e2e` search for `trend-span-select|combobox.*Trend days` returned no matches after the
  legacy assertion fix. Files are tracked text; both old sites were read before and after replacement.
- Calendar extent, provider palette, archived/retained semantics, active-card/side identity and four-card
  count are unchanged except for the approved fourth-card linkage. Existing dictionary keys are retained
  for compatibility; no unrelated dead-code deletion or architectural refactor was performed.
- Reviewed naming, duplication, data clumps, primitive obsession, repeated branching, shotgun/divergent
  changes, speculative abstractions, message chains, middlemen and inheritance: no new refactor item.
  The shared control avoids divergent skeleton/live geometry; the small context is the required shared
  state seam, not a new general preference framework.
- The touched UI uses existing icon components; the middle dot is a text separator, not an icon.
  No out-of-scope character-icon finding in the touched structures; no repository-wide icon audit claimed.

Disposition: no unresolved production-code finding or deferred refactoring item. Final acceptance
and delivery gate evidence are linked from [checklist.md](checklist.md).

### Delivery version binding

The reviewed specification, implementation, tests and evidence above were committed as
`46437b5fc317f6f17b1eb4764358583cfb50b2a6` and pushed to existing [PR185](https://github.com/zhoulf1006/agentshed/pull/185).
This follow-up changes delivery records only. Local final gateway exit0 applies to that exact code.
[GitHub run35814852190](https://github.com/zhoulf1006/agentshed/actions/runs/35814852190) could not
start either job: GitHub reports failed account payments or an insufficient spending limit. This is
remote infrastructure unavailability, not a remote test pass/fail. Issue186 remains open; merge
requires the user's separate confirmation. No product requirement or verification scope changed.
