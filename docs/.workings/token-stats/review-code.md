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
