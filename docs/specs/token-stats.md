# Token statistics

> Related: [features](../features/token-stats.md) · ADR-0005 (aligned with ccusage, supersedes 0003) · ADR-0006 (Codex accounting) · ADR-0007 (usage archive) · ADR-0008 (provider segmentation) · ADR-0009 (x axis data days)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01 — the boundary entries were inferred from the existing test cases (the
> accounting decisions are in the ADRs and are not restated here).

## Problem Statement

"Which project is burning my quota, and what has it been burning lately" had no ready answer: the two
sides' session records have different formats and different accounting, and Claude Code cleans up old
session files automatically — so history vanishes as you watch.

## Solution

Aggregate both sides' session records into a project-level and a global view whose accounting aligns
with ccusage and can be reconciled against it; and file away the day's aggregate on every refresh, so
the historical trend survives the source files being cleaned up.

## User Stories

1. As a user, I want the project overview to show the cumulative total, the 30-day trend, the model
   breakdown and the session list by default, so that entering a project tells me at a glance how much
   it burned and on what.
2. As a user, I want the trend bars segmented by provider and switchable to a single side, so that I
   can see which vendor's models the quota went to.
3. As a user, I want the date axis to label only days with usage, without overlapping or spilling out,
   so that the axis is readable at any window width.
4. As a user, I want the global cross-project trend and model breakdown, so that I can compare
   projects.
5. As a user, I want the historical trend to survive the agent cleaning up source sessions, with a
   label, so that a long-term trend does not break.
6. As a user, I want the numbers to reconcile against ccusage, so that I can trust them.

## Failure modes and boundaries

**Sequence A: Claude-side aggregation**
- A1 The total sums all four fields (input/output/cacheRead/cacheWrite), with cache displayed
  separately; model buckets use the same rule.
- A2 Whole-tree scan: an unregistered project's encoded directory also counts toward the global total
  (independent of the registry) but is not listed as its own project.
- A3 Duplicate lines with the same `message.id + requestId` count once, keeping the one with the more
  complete usage.
- A4 Sidechain replays (same message.id, new requestId) are deduplicated across files, keeping the
  non-sidechain one.
- A5 Lines with no `message.id` are not deduplicated and are summed as usual.
- A6 Synthetic models: their tokens count toward the total but do not enter a model bucket.
- A7 `cache_creation` detail takes priority: where an ephemeral breakdown exists, take the sum of
  5m+1h rather than the flat field.
- A8 Bad lines are skipped; one corrupt line does not discard the whole file.

**Sequence B: Codex-side aggregation**
- B1 Sum per-turn `last_token_usage` increments; sanitise input (subtract cached) and list cached
  separately; the model comes from `turn_context`.
- B2 Sessions spanning midnight are apportioned to their respective dates by event timestamp (not
  piled onto the first day).
- B3 Subagent sessions' tokens count toward the statistics but do not enter the session list.
- B4 Titles come from `session_index`.

**Sequence C: cache and archive**
- C1 An old-format cache (a historical file from before a structure change) does not crash and is
  recomputed into the new structure — **the structure definition and the version number are two
  halves of the same change** (see postmortems/cache-version-crash).
- C2 Garbage cache content does not crash and triggers a full recompute.
- C3 A second build gives the same result (idempotent); the cache file is valid JSON and lands
  atomically.
- C4 The archive is written on the first merge; a new instance reads it back.
- C5 Days whose source files still exist: the live values **overwrite** the archive (so an accounting
  fix corrects history automatically).
- C6 Days whose source files are gone: the archived values are kept and are not wiped by this scan
  finding nothing.
- C7 Within one day, rows are split by side × project × model and do not overwrite one another.
- C8 Archive writes are atomic with no temporary files left in the directory; a corrupt archive file
  degrades to empty without crashing (the next scan starts accumulating again).
- C9 The set of days covered by the archive is queryable (the UI draws the hatching and the note from
  it).

**Sequence D: trend and axis rendering**
- D1 Always produce 30 bars in ascending date order, with the last as the anchor day; historical days
  outside the window do not become bars.
- D2 Combined mode segments by provider in a fixed order (Anthropic → OpenAI → …), and the segments
  sum to the total; a zero value produces no empty segment.
- D3 When one agent used several providers, split by provider rather than by agent side.
- D4 Single-side mode counts only that side, and segmentation degenerates to one segment.
- D5 A day with no data: total 0, no segments.
- D6 The x axis labels data days only (days with usage under the current view): M/D for the first one
  and at month changes, the day number alone otherwise; switching views changes the data day set (the
  same day called twice with 0 and a positive value makes the label disappear and reappear).
- D7 When space runs out, adjacent clusters drop every other one (dropping the right-hand member of a
  conflicting pair), and surviving labels stay pinned to bar centres; the first and last labels are
  clamped inside the container; if a month-boundary label is dropped, the next surviving label in the
  new month is promoted back to M/D.
- D8 Extremely narrow windows: keep thinning but leave at least 1, without overlapping or spilling,
  and the algorithm terminates.
- D9 No data at all → no labels.

**Sequence E: automatic snapshot refresh (settled 2026-08-08, fixing "today's statistics are
missing" — the only rescan triggers had been startup and manual ↻, so leaving the app running
overnight froze `scannedAt` and today's data was not shown)**
- E1 Triggers: window focus (only if at least a throttle window has passed since the last successful
  scan, 60 s by default, debounced) plus a timed backstop (5 minutes by default); manual ↻ is
  unchanged.
- E2 Concurrency: automatic and manual share the same scan entry point with in-flight deduplication
  (at most one scan running at any moment).
- E3 An automatically triggered scan that fails → **silently keeps the existing snapshot**, without
  interrupting the user or clearing data, and waits for the next trigger; a manual ↻ failure is still
  thrown explicitly to the caller.
- E4 A new snapshot is delivered through the existing push channel; an open project detail page
  **updates by transfusion** (no "loading" flash, section local state preserved — the behaviour entry
  is in the project-detail spec).
- E5 The throttle window and the backstop interval are injected from the environment (a test seam;
  production uses the defaults).
- E6 The overnight case is a corollary of E1: focus or the backstop triggers a rescan, the `scannedAt`
  anchor moves forward, and today's data and the axis recover under D1's semantics — no special-casing
  of "crossing midnight" is needed.

## Implementation Decisions

- **Accounting**: see ADR-0005/0006 (the two sides' total formulas differ and must not be copied from
  one another).
- **Archive**: see ADR-0007 (resilient to the agent's automatic cleanup; live values overwriting the
  archive is what makes accounting fixes retroactive).
- **Segmentation and axis**: see ADR-0008/0009.
- **Cache**: incremental by file signature; **a structure change must bump the version number at the
  same time**, and within one version a shape check treats corrupt or drifted entries as a miss and
  recomputes.
- **Automatic refresh**: the trigger layer lives entirely in the main process (focus + timer, with
  parameters injected from the environment); the renderer gets no new channel (the existing snapshot
  push is reused); the cost of a rescan is absorbed by the incremental cache.

## Testing Decisions

Following ADR-0002's dual seam: fixture unit tests at the providers layer cover both sides' parsing
rules, deduplication, the cache and the archive; pure functions (trend/axis/provider) get their own
unit tests covering the geometric constraints of segmentation and axis layout; e2e covers that an
old-format cache does not crash at startup and the geometric checks on the trend chart's rendering
(labels do not overlap, tooltips are not clipped). The reconciliation baseline: the day-by-day ccusage
comparison test. Automatic refresh (sequence E): the focus throttle judgement is a pure function with
unit tests; e2e drives the whole chain with a short interval injected — after appending session data
it appears without a manual refresh, and an open detail page's section local state is preserved. Focus
events are semantically unreliable under a hidden-window test regime (noted in the existing e2e
header), and since the focus path shares its scan entry point with the timer, it gets no separate e2e.

## Out of Scope

- Dollar cost estimation.
- An exact per-model split on the Codex side (currently an approximation at the level of the session's
  primary model).
- Sessions from before this application first ran that the agent has already cleaned up (unrecoverable).
- ~~Rendering session contents (metadata only)~~ (2026-08-06: fully shipped by
  `docs/specs/session-view.md`, moved out of this spec's boundary).
