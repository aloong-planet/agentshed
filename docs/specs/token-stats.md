# Token statistics

> Related: [features](../features/token-stats.md) · ADR-0005 (aligned with ccusage, supersedes 0003) · ADR-0006 (Codex accounting) · ADR-0007 (usage archive) · ADR-0008 (provider segmentation) · ADR-0009 (x axis data days) · ADR-0019 (third side onboarding) · ADR-0020 (day usage keyed by side) · ADR-0021 (side colour) · ADR-0024 (composition colours) · ADR-0025 (usage rows as the one source)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01 — the boundary entries were inferred from the existing test cases (the
> accounting decisions are in the ADRs and are not restated here).

## Problem Statement

"Which project is burning my quota, and what has it been burning lately" had no ready answer: each
side's session records have their own format and their own accounting, and Claude Code cleans up old
session files automatically — so history vanishes as you watch.

## Solution

Aggregate every side's session records into a project-level and a global view whose accounting aligns
with ccusage and can be reconciled against it; and file away the day's aggregate on every refresh, so
the historical trend survives the source files being cleaned up. Sides differ only in their parsers —
what a total means, how a day is cut, and what a bar segment stands for are one definition shared by
all of them.

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
7. As a user, I want to pick a time window — all history, today, the last 7 days, the last 30 days —
   from the totals themselves rather than from a separate control, so that "what have I burned lately"
   is one click away and the answer to "how much" and the choice of "over what period" are the same
   object.
8. As a user, I want everything the window governs to move together — each side's figure, the
   composition, the highlighted span of the trend, the model breakdown — so that one selection yields
   one consistent answer instead of a page where some numbers moved and others did not.
9. As a user, I want to see what a total is made of, so that a large number is interpretable rather
   than merely large: how much was read from cache (and so cost little), how much had to be read
   fresh, how much the model generated.
10. As a user, I want each side named in one colour everywhere it is named, so that a badge in a list
    and a segment in a chart agree instead of teaching me two colour languages for one concept.

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
  separately; the model comes from `turn_context`. The total is input + output — the same figure the
  side reports for itself — and carries **no cache-creation term** (B5).
- B5 Cache creation is **not collected** on this side; it reads as zero. The records do carry a
  cache-write field, but it has never held a non-zero value, and the side's own total is input +
  output with no cache-write term — so there is no observed shape to validate a reading against.
  Zero states the honest position ("this side does not report writes") and keeps the four fields
  summing to the total. Adding the field to the total instead would double-count the moment it went
  non-zero, if those tokens sit inside the reported input the way cached reads already do (ADR-0023).
- B6 A record whose per-field breakdown is entirely zero while its own total is not contributes
  nothing, because the total is derived from the fields rather than taken from the record. Such
  records exist; the resulting under-count is known and accepted, because the alternative — trusting
  a total no field can account for — would put tokens into the statistics that cannot be attributed
  to a day, a model, or a bucket.
- B7 **The same turn can be reported more than once.** The side re-emits a usage record whose
  per-turn figure repeats while its running cumulative does not move; summing every record counts
  those turns twice. The discriminator is the **cumulative**, not the per-turn figure: a record whose
  running total has not advanced since the previous one contributes nothing, and where a per-turn
  figure is absent the contribution is the difference between the two cumulatives. Using "the
  per-turn figure repeats" instead would be wrong in both directions — two genuinely identical
  consecutive turns would be dropped, and a repeat that varies the per-turn figure would be kept —
  even though on the data measured to date the two criteria happen to select the same records.
- B8 A day's **four-field split is measured, not apportioned**. The per-turn events already carry all
  four figures and a timestamp, so each day accumulates its own four buckets. Apportioning the
  session's totals across its days by each day's share of the total — the earlier rule — rounds four
  times per day and the roundings do not cancel: measured 2026-08-21 on real data, the three
  cross-side buckets summed to 4 tokens less than the row totals over 12.7B. The drift is negligible
  in magnitude and disqualifying in kind, because "the segments sum to the total" is the whole reason
  those three buckets are the chosen cut (G8).
- B2 Sessions spanning midnight are apportioned to their respective dates by event timestamp (not
  piled onto the first day).
- B3 Subagent sessions' tokens count toward the statistics but do not enter the session list.
- B4 Titles come from `session_index`.

**Sequence F: Grok-side aggregation** (lettered after the existing sequences rather than inserted
next to A/B, so that no existing reference is renumbered)
- F1 Per-turn usage is read from the session's authoritative update stream, which is also the only
  file carrying the conversation and the tool calls — one file serves both metering and display.
- F2 The accounting rule follows the Codex shape, not the Claude one: reported input **already
  includes** cached reads, so input is sanitised by subtracting cached, cached is recorded as cache
  read, and the total is input + output — exactly the total the side reports for itself. Copying the
  Claude four-field sum would double-count the cache. Cache creation is not collected here either:
  B5's rule holds on this side unchanged, for the same reason (ADR-0023).
- F3 The model is taken from the per-turn usage record's own model key, which names the model that was
  actually billed. This is **exact**, unlike the Codex approximation, and it can differ from the model
  the session summary names — the billed name wins, and is not normalised into the summary's name.
  A record without the per-model map falls back to its top-level figures with no model bucket (the
  same rule as a Claude synthetic model: the tokens count, no bucket). The record shapes were grounded
  by full enumeration (224 records, 2026-08-16): two variants exist — an empty usage object, and one
  flagged incomplete without a cost figure — and both parse as what they report.
- F4 A turn record carries a cost figure. It is **neither read nor archived** (ADR-0019): a metric
  present on one side of a three-side comparison reads as breakage on the other two.
- F5 Subagent sessions are stored beside their parents, with the parent holding only a pointer; the
  real record appears exactly once in the scan, so no cross-file deduplication is required for them.
  Their tokens count toward statistics and they stay out of the session list (the same rule as B3).
- F6 A session directory missing its update stream contributes nothing and does not abort the scan of
  its siblings.
- F7 Sessions spanning midnight are apportioned by each turn's own timestamp, the same as B2.

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
- D1a A side newly in use has volume only on recent days. Combined mode shows it as a thin segment
  (single-digit pixels at typical bar heights), and single-side mode leaves most of the window empty
  with the axis labelling only its few data days under D6 — both are correct, and the thin-segment
  case is what a new side's colour has to survive.
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
- D10 The chart's own window stays 30 days whatever time window is selected (G1). Days outside the
  selection are **dimmed, not removed**: the data is day-grained, so cutting the chart down to the
  selection would leave one bar for "today", and a lone bar states nothing about its own size. The
  surrounding 29 days are the reference that makes the selected span readable. Selecting all history
  dims nothing. The axis, the segmentation and the tooltips are unaffected — dimming is a rendering
  state, not a different data set.

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

**Sequence G: the time window and the composition** (settled 2026-08-21)
- G1 Four windows — all history / today / the last 7 days / the last 30 days — presented as four cards
  that are **themselves the selector**: the card shows that window's total and clicking it selects the
  window. There is no separate range control; "how much" and "over what period" are one object. All
  history is the default selection.
- G2 The window is cut against the **snapshot anchor**, not the wall clock, so "today" always means the
  same day as the trend chart's last bar. A snapshot taken before midnight and read after it therefore
  reports the anchor's day, and the automatic refresh (E1/E6) is what moves both forward together.
  Reading the clock instead would let the cards and the chart disagree about which day "today" is,
  with nothing on screen to reveal it.
- G3 Everything the selection governs moves with it: each side's figure, the composition, the model
  breakdown, and the trend's dimming (D10). Nothing that the selection governs may stay on a different
  window — a page where some figures moved and others did not is worse than one that offers no
  windowing at all, because the reader has no way to tell which is which.
- G4 **All history and the trend chart deliberately disagree in span**, and the card says so in its
  own label. The chart is 30 days because that is what a daily trend can show; the cumulative total is
  every day on record. This mismatch already existed and already misread — an unlabelled cumulative
  total sitting above a chart captioned "last 30 days" is read as a 30-day figure. Naming the window
  on the card is the fix; making them agree is not, since neither span is wrong for its own purpose.
- G5 A window with no usage: total 0, **no composition bar drawn** (a zero-width bar would be a
  drawing of nothing), the model breakdown shows its empty state, and each side reads 0 while still
  reporting itself as detected — detection is about whether the side is installed, which is
  independent of whether it has burned anything.
- G6 Archived days take part in windows exactly like live ones **in the cross-project view**: the
  archive stores the same per-model, four-field rows, so a window covering only archived days still
  yields a composition and a model breakdown there. This is why the archive's row grain
  (day × side × project × model) is load-bearing rather than incidental.
  **A project's own view does not receive them**, which predates the windows: the archive was folded
  into the cross-project figures only, so a project page has always drawn an archived day as a
  zero-height bar carrying the archived marking. The windows inherit that boundary rather than
  widening it — the rows carry a project key, so closing it is possible, but it changes what a project
  page reports for spans it currently shows as empty, which is a product decision rather than a
  consequence of adding a time window.
- G7 An entry carrying no timestamp cannot be attributed to any day, and therefore to any window. To
  keep this from silently detaching a total from its own breakdown, **every figure on the page derives
  from the same row set** — including all history and each side's total. The windowed figures and the
  side totals are then equal by construction rather than by coincidence. Measured 2026-08-21: zero
  undated rows on real data across all three sides, and the row sums matched the side totals exactly
  on all three, so the change is neutral on today's data and load-bearing the day it is not.
- G8 The composition cuts the selected window's total into the three cross-side comparable buckets —
  `input + cacheWrite` / `output` / `cacheRead` — which carry one meaning each on all three sides and
  sum exactly to the total (the invariant in CONTEXT.md). It is rendered **below the totals and
  outside any card**: it decomposes the same number the side figures decompose, by a different axis,
  so the two are siblings rather than one being contained in the other.
- G9 The smallest bucket is a fraction of a percent of the total on real data (output at 0.28%,
  measured 2026-08-21). Percentages are therefore part of the legend rather than something the reader
  infers from width, and each segment keeps a minimum width so the smallest one exists on screen at
  all. The legend also carries the absolute figure and states that cache writes are counted inside
  uncached input — that grouping is not inferable from the label, and "where did cache creation go" is
  the first question the bar provokes.
- G10 Composition colours: cache read blue, uncached input yellow, output green (ADR-0024).
- G11 The selection is view state: it survives switching tabs within the page — and, on the project
  detail page, switching projects, since the window is a lens the user holds rather than a property of
  one project — and is not persisted across restarts, matching how the session sort already behaves.
- G12 The window and the trend's side filter are **independent controls that compose**: selecting a
  side narrows what the bars count (D4), selecting a window dims which bars are in scope (D10), and
  using both leaves a single-side chart with part of its span dimmed. Neither resets the other. The
  window still governs the figures above the chart across all sides — the side filter is a property of
  the chart alone, which is why it does not touch them.
- G13 A refresh arriving while a non-default window is selected — automatic (E1) or manual — keeps the
  selection and recomputes its figures against the new snapshot. The anchor may have moved, so "today"
  can come to mean a different day than it did a moment ago; that is the intended behaviour and the
  reason G2 ties the window to the anchor rather than to the clock. Losing the selection on refresh
  would be the visible defect, since the automatic backstop fires on a timer the user did not ask for.
- G14 This feature renders figures the application computed itself. It introduces no new point at
  which external content is rendered or loaded, so it adds no interaction surface beyond the controls
  named above — stated rather than skipped, because "no new surface" is a conclusion that has to be
  reached rather than a default.

## Implementation Decisions

- **Accounting**: see ADR-0005/0006 (the sides' total formulas differ and must not be copied from one
  another) and ADR-0019 for the third side's onboarding rules.
- **Day usage shape**: a day's per-side figures are keyed by side rather than held in one field per
  side (ADR-0020), so that adding a side makes typecheck enumerate every producer and consumer instead
  of letting one silently omit it. The provider breakdown stays sparse — absence there means "no
  segment", which is meaningful, whereas a missing side would only mean "the producer forgot".
- **A new vendor**: adding one is a rule in the provider inference module, which ADR-0008 already
  anticipated; the chart logic does not change. The side's identifying colour is that provider colour
  (ADR-0021).
- **Side badge colours**: ADR-0021 was carried out for one side only — the Grok badge was derived from
  the retired Claude purple while the Claude badge kept that purple, so an accepted decision and the
  shipped values contradicted each other, and the file's own comment called the still-live value
  "retired". Completing it means the Claude badge takes the Anthropic hue. The badge is a fill behind
  small bold text rather than the raw provider colour, so its pair is derived at the lightness and
  chroma of the existing pairs rather than picked by eye; the resulting text-on-fill contrast lands
  inside the range the other pairs already occupy. Side colours are **appearance-varying, not
  theme-varying** (CONTEXT.md's variable classes): a colour scheme changes the interface, not the
  data.
- **Usage rows are the one source every figure derives from** (ADR-0025). Windowing needs
  day × side × project × model at four-field grain, which the aggregation already computes and the
  archive already persists; the pre-aggregated per-day and per-model fields were lossier projections
  of it. Deriving every figure from one row set is also what makes G7 hold by construction. Measured
  2026-08-21 on real data: 378 rows, 67 KB serialised, at most 20 rows on the busiest day — small
  enough that the aggregation belongs where the selection lives.
- **No cache version change**: the incremental cache stores per-file parse output, whose shape is
  untouched; what changes is the combination step, which re-runs on every build. This is the
  distinction the cache-version rule turns on — a *structure* change to what is cached must bump the
  version, and a change downstream of the cache must not, or every release would force a full rescan
  for nothing.
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

Following ADR-0002's dual seam: fixture unit tests at the providers layer cover every side's parsing
rules, deduplication, the cache and the archive — one fixture per side, because the formulas
deliberately differ and a shared fixture would let one side's rule stand in for another's. The
reconciliation test is the guard against exactly that substitution. Adding a side also requires a case
where **two sides have volume on the same day**, since a per-side keying mistake is invisible while
only one side has data; pure functions (trend/axis/provider) get their own
unit tests covering the geometric constraints of segmentation and axis layout; e2e covers that an
old-format cache does not crash at startup and the geometric checks on the trend chart's rendering
(labels do not overlap, tooltips are not clipped). The reconciliation baseline: the day-by-day ccusage
comparison, which now covers **all three sides** — the third-party meter gained Grok support, so the
side that once had no standing external baseline has one. The comparison needs real data and a
freshly generated baseline, so it stays out of the default gate; what it must not do is stay
unrunnable, which is how a whole side's systematic drift went unnoticed for weeks. Its baseline is
generated on demand rather than read from a fixed path — a path named after the day it was first
sampled is a one-off, and a reconciliation that needs a manual, undocumented step before it can run
is one nobody runs. Automatic refresh (sequence E): the focus throttle judgement is a pure function with
unit tests; e2e drives the whole chain with a short interval injected — after appending session data
it appears without a manual refresh, and an open detail page's section local state is preserved. Focus
events are semantically unreliable under a hidden-window test regime (noted in the existing e2e
header), and since the focus path shares its scan entry point with the timer, it gets no separate e2e.

The window aggregation (sequence G) is a **pure function from the row set plus a window to the four
figures a view needs**, which is the same seam the trend and axis functions already use — the highest
seam that does not need a rendered page, and the one where the interesting cases live: a window with
no rows, an undated row, a window whose only days are archived, and the identity that the three
buckets sum to the total (G8) and that all history equals the side totals (G7). The last two are
**algebraic identities over whatever fixture is supplied**, so they are asserted for every window on
every fixture rather than for one hand-picked case — a per-case assertion would only prove the case.
Sequence B8's "measured, not apportioned" needs a fixture whose session spans two days with a
lopsided split, since apportioning and measuring agree whenever a session's days are proportionally
alike, which is exactly what a casually written fixture produces. What unit tests cannot reach is that
the **selection actually drives** the four regions: that a click changes the side figures, the
composition, the model rows and the dimmed span together (G3). That is an e2e assertion, and it must
read all four in one pass, because the failure being guarded against is precisely that some of them
moved and others did not — checking them one at a time would pass on a page that is inconsistent.

## Out of Scope

- Dollar cost estimation. This stays out even though one side's records carry a real billing figure
  (not an estimate) — see ADR-0019: the other sides carry none, and a metric present on only one of
  them reads as breakage on the rest.
- An exact per-model split on the Codex side (currently an approximation at the level of the session's
  primary model). The Claude and Grok sides are exact, so the per-model table mixes exact and
  approximate figures without saying which is which; this asymmetry is known and accepted.
- Sessions from before this application first ran that the agent has already cleaned up (unrecoverable).
- An arbitrary or custom date range. The four windows are fixed. A date picker is a different control
  with different questions (what does it do to the 30-day chart, what does it do to a range with no
  data, does it persist), and the four fixed windows answer the question that prompted this —
  "what have I burned lately" — without any of them.
- Sub-day granularity. "Today" is as fine as the windows go, because a day is as fine as the source
  records are cut for aggregation; an hourly window would have to re-derive from timestamps that the
  aggregation deliberately collapses.
- ~~Rendering session contents (metadata only)~~ (2026-08-06: fully shipped by
  `docs/specs/session-view.md`, moved out of this spec's boundary).
