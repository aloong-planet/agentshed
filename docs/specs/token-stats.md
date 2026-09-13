# Token statistics

> Related: [features](../features/token-stats.md) · ADR-0005 (aligned with ccusage, supersedes 0003) · ADR-0006 (Codex accounting) · ADR-0007 (usage archive) · ADR-0008 (provider segmentation) · ADR-0009 (x axis data days) · ADR-0019 (third side onboarding) · ADR-0020 (day usage keyed by side) · ADR-0021 (side colour) · ADR-0024 (composition colours) · ADR-0025 (usage rows as the one source) · ADR-0026 (archive retention by accounting stamp, liveness per (day, side)) · ADR-0027 (Codex usage records)
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
11. As a user, I want a day's figure never to fall when an agent rewrites or deletes its own
    records, so that the history I have already seen stays what I saw.
12. As a user, I want a project's own page to agree with the cross-project view about a day that
    only the archive still knows, so that the same day does not read as usage in one place and as
    nothing in another.
13. As a user, I want a Codex session's usage counted from Codex's own per-response records, so
    that the figure is exact and survives the agent's replay and format changes.
14. As a user, I want a session Codex has compressed to keep counting exactly as before, so that a
    cold week does not vanish from my history.

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
- B1 Sum per-response usage: in a paginated rollout from the usage boundary on, each usage record's
  own usage, deduplicated by response id (ADR-0027); before the boundary, and in a legacy rollout
  throughout, each usage event's per-turn increment under B7. Sanitise input (subtract cached) and
  list cached separately; the model comes from `turn_context`. The total is input + output — the
  same figure the side reports for itself — and carries **no cache-creation term** (B5).
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
- B7 **A usage event can report the same turn more than once, and can also miss a response.** The
  side re-emits a usage event whose per-turn figure repeats while its running cumulative does not
  move; summing every event counts those turns twice. Before the usage boundary the discriminator is
  the **cumulative**, not the per-turn figure: an event whose running total has not advanced since
  the previous one contributes nothing, and where a per-turn figure is absent the contribution is
  the difference between the two cumulatives. Using "the per-turn figure repeats" instead would be
  wrong in both directions — two genuinely identical consecutive turns would be dropped, and a
  repeat that varies the per-turn figure would be kept. The cumulative rule also drops a real
  response whose running total did not advance: measured 2026-09-10 over every rollout carrying
  usage records, in 17 of 345 the events under this rule sum below the records, by up to 2.9% of a
  session. That is why the usage records are the source from the boundary on — two records with one
  response id are one response (none observed in 5029 records) and nothing else is compared.
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
- B9 **The usage boundary is by line order.** The first usage record line in a rollout is the
  boundary: usage events after it are ignored whatever their timestamps, usage events before it
  count under B7. Measured on every dual-source rollout on this machine (345), line order and
  timestamp select the same events; line order is the rule because the writer appends in order and
  the migration preserves it, so no tie or reordering rule is needed. Only two rollouts carry usage
  events before their boundary (1.69 B tokens between them): they are why the events are not simply
  discarded once a record exists.
- B10 **A paginated fork or subagent thread carries no replayed usage**: Codex copies neither usage
  records nor, in paginated mode, usage events into a child thread, so the child's rollout holds
  only its own usage and the replay-prefix stripping finds nothing to strip. Legacy children still
  carry the replayed prefix as usage events, and the existing by-value stripping against the parent
  stays for them. A record whose thread id is not the rollout's own is not expected (0 of 5029) and
  counts as the rollout's, since the archive's grain carries no thread.
- B11 **A compacted window has lost its usage for good**: the rollout keeps the summary and the
  span's messages but no usage records for it, and the thread's running total does not restore
  them. A day whose sessions were compacted therefore reads lower than before the compaction; on a
  past day the archive's rule (C10) retains the earlier figure, on the own day the lower figure
  shows. Nothing marks a compacted window anywhere in the interface (G15's ruling extends to it).
- B12 **A cold rollout is read like a plain one**: the same line reader runs over a decompression
  stream, so every rule above applies unchanged. Its identity is its `.jsonl.zst` path, so the day
  Codex compresses a rollout the plain path leaves the scan set and the compressed one enters it as
  a new file — parsed once, then cached like any other. The decoder's output chunk is the line
  reader's read chunk (1 MB, the size the plain reader measured): at the decoder's 16 KB default the
  same per-chunk cost the plain reader pays under Electron returned — measured 2026-09-11 with
  `pnpm bench:scan` over ten real cold rollouts (525 MB plain, 264 MB compressed): 9.0 s compressed
  against 0.95 s plain, and 1.24 s once the chunks matched. A cold rollout therefore costs about a
  third more than its plain twin to scan, the decompression itself. A cold rollout that cannot be
  decompressed (truncated, not zstd) is skipped like an unreadable plain file, hurting only itself.
  "Truncated" is judged by the recorder's mechanism, not by the decoder: Node's zstd decoder reports nothing for
  a cut frame (measured 2026-09-11, synchronously and as a stream alike — it yields the first half
  and ends cleanly), while every rollout line ends with a newline and a cold rollout is never
  mid-write, so a decompressed stream that does not end with a newline is cut short (all 1391
  rollouts on this machine end with one, the 935 cold ones included). A cut landing exactly on a
  line end escapes this and reads as a shorter session — that file only.

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
- C5 **Liveness is judged per (day, side)** (ADR-0026). A side is live on a day when this scan
  produced at least one row for it on that day. For a live (day, side) the live rows replace the
  archive's — subject to C10 for past days — so an accounting fix still corrects history
  automatically. Another side's rows on the same day have no bearing: Claude being live on a day
  neither replaces nor protects Codex's rows for it.
- C6 A (day, side) with archive rows and no live rows is **archived-only**: its rows are kept and
  are not wiped by this scan finding nothing for that side, even when other sides are live that
  day (the case the per-day reading got wrong).
- C7 Within one day, rows are split by side × project × model and do not overwrite one another.
- C8 Archive writes are atomic with no temporary files left in the directory; a corrupt archive file
  degrades to empty without crashing (the next scan starts accumulating again).
- C9 The set of archived-only **days** — a day the archive holds rows for and no side has live rows
  on — stays queryable, for the existing hatching and note. Retained (day, side) pairs are **not**
  exposed to the interface: retention is accounting-only (ADR-0026, amended 2026-09-10), and a day
  on which one side is archived-only while another is live carries no marking either.
- C10 **A past (day, side) never falls silently** (ADR-0026, the invariant in CONTEXT.md). Every
  archive row carries the accounting stamp it was written under — the application version and the
  cache structure version, combined. When a past (day, side) is live and its live total is **lower**
  than the archive's: under a **different** stamp the live rows are accepted (a correction of ours),
  and the rows they replace are kept as superseded values; under the **same** stamp the archive's
  rows are **retained**, and the live total is recorded as the observed value. A live total equal to
  or higher than the archive's is always accepted, and its predecessor kept as a superseded value
  when it differs. "Total" here is the side's total over the day, so a shift between projects or
  models on a day with an unchanged total is accepted as an ordinary rewrite.
  **A new stamp accepts a decrease only if the figure moved.** A retained pair carries the observed
  value the old stamp recorded; if the first scan under a new stamp observes that same figure, our
  code produced the same number as before on the same data, nothing was corrected, and the pair
  stays retained. Without this clause every release would re-apply an upstream loss that has
  already been retained once.
- C11 The scan's own day is exempt from C10: its rows are replaced on every scan and no superseded
  value is kept, because they change on every scan while a session is active. "Own day" is the
  local calendar day of the scan anchor, the same cut the windows use (G2). The first scan after
  midnight therefore treats yesterday as a past day from then on.
- C12 A retained (day, side) stays retained until a scan under a different stamp observes a figure
  other than the recorded observed value, or a live total at or above the archive's arrives. It is
  re-judged on every scan: the observed value tracks the latest live figure, and retention holds no
  state beyond the archive rows, their stamp and the observed value.
- C13 Superseded values are kept without a cap, each with the stamp and scan time that replaced it.
  Growth is bounded by how rarely past days change (measured 2026-09-09: over one afternoon of
  scans no past day's row changed); the point to revisit the cap is the archive file passing about
  5 MB.
- C14 An archive file written before stamps existed reads back with every row treated as written
  under an unknown stamp, which differs from every real one: the first scan accepts whatever it
  finds, exactly as before, and stamps the rows. Nothing is retained against a file that had no
  stamp to compare with.
- C15 A developer changing accounting code without changing either version component will see a
  legitimate decrease retained as if it were a loss. A forced-accept override, injected from the
  environment the way the rescan intervals are (E5), accepts every live figure for one scan and is
  never set in production.
- C16 A restore from a cache snapshot writes past-day rows as accepted changes under the current
  stamp, keeping what they replace as superseded values, for one side over one day range; it
  reports what it would write before writing (dry run by default), and it never touches the scan's
  own day or any other side. The next scan then judges those rows by C10 like any others: the
  compacted live figures are lower under the same stamp, so the restored rows are retained. A
  restore made while the application is running is seen by its next scan, not overwritten by what
  the application had in memory. The script refuses a snapshot whose cache structure version
  differs from the current one — the aggregation only understands the shape it was written for,
  and a restore from a shape it misreads would write plausible nonsense. The consequence: every
  cache structure bump orphans the snapshots written before it, and a restore across a bump needs
  the snapshot converted first, by hand, per version step — a conversion is exact only when the
  step's change to the per-file aggregate has a known value for the old entries (the 14 → 15 step did:
  every v14 Codex event was event-derived, so the boundary is the events' length). Automating the
  conversion is not planned; a snapshot a step cannot convert exactly is unrecoverable through the
  script.
- C17 A user deleting their own session files does not lower a past day: the deletion is a
  same-stamp decrease, so the archive's rows are retained and the deleted figure shows as the
  observed value. This is ADR-0007's purpose (history survives the source files) applied to a
  deletion by hand rather than by the agent.
- C18 An upstream rewrite that lands in the same window as an application update is accepted by
  C10's different-stamp branch, because no observed value exists yet to compare with. The loss is
  visible in the superseded values and recoverable through them; it is not prevented.
- C19 The comparison is per (day, side), so a project's loss offset by another project's growth on
  the same past day is accepted. The per-project comparison that would catch it was rejected in
  ADR-0026 (a project key change would count the day twice).
- C20 The own-day exemption follows the anchor even when the anchor's day moves backwards (a
  westward time-zone change late in the day): yesterday becomes the own day again and is replaced
  without superseded values. Accepted as a rare edge with no data at risk beyond that one day.
- C21 A correction of ours that lands while a loss stands retained is accepted: the new stamp
  observes a figure that moved (the corrected rules produce a slightly different lower number), so
  C10's different-stamp branch takes it and the retained value becomes a superseded value. The
  restore is then re-applied by hand (C16), after which the observed value is recorded under the new
  stamp and retention holds again. This is the price of C12's figure-moved clause being exact rather
  than tolerant; it fell due on 2026-09-10 for the Codex usage-record change (ADR-0027).

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
  scan, 60 s by default, debounced) plus a timed backstop (5 minutes by default). Since the manual
  control was removed (2026-08-23) these two are the **only** triggers after startup.
- E2 Concurrency: both triggers share one scan entry point with in-flight deduplication (at most one
  scan running at any moment), so a focus arriving during the backstop's scan joins it.
- E3 A scan that fails → **silently keeps the existing snapshot**, without interrupting the user or
  clearing data, and waits for the next trigger.
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
- G6 Archived-only and retained (day, side) pairs take part in windows exactly like live ones, **in
  the cross-project view and in a project's own view alike** (ADR-0026): every figure derives from
  the effective row set — live rows for accepted (day, side) pairs, archive rows for archived-only
  and retained ones — filtered by project where a project page asks. The archive stores the same
  per-model, four-field rows with their project key, so a window covering only archived days still
  yields a composition and a model breakdown on either page, and the two pages agree about the same
  day by construction. Until 2026-09-09 a project page drew such a day as a zero-height bar with the
  archived marking; that boundary is closed, and a project page now shows the day's value, hatched
  under the same per-day rule as the cross-project view. No prototype was made for this: the
  hatched bar already exists on the cross-project page, and giving it a height on the project page
  is a data-semantics change, not a new form (the prototype exemption for such changes, declared
  here rather than assumed).
- G15 **Retention has no marking** (ruled 2026-09-10, after a prototype of one was judged visually
  poor). A retained day is drawn exactly like any other day: no pattern, no note, no tooltip
  annotation, and the observed value appears nowhere in the interface. The existing archived-only
  marking is unchanged — a day is hatched and counted in the note when the archive holds it and no
  side has live rows on it. Consequence, accepted: a user cannot tell a retained day from a live
  one on screen; the archive's superseded values are the only trace.
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
- G13 A refresh arriving while a non-default window is selected (E1's automatic triggers) keeps the
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
- **Archive**: see ADR-0007 for its existence and grain, ADR-0026 for the conflict rule. The archive
  is the sole owner of the effective row set: each scan hands it the live rows and the scan anchor,
  and it returns the rows every figure derives from together with the archived-only days — no
  caller patches archive rows into live figures on its own. The accounting
  stamp is **injected** into the archive rather than read from the runtime inside it, so the unit
  seam can move the stamp between merges; production composes it from the application version and
  the cache structure version. The persisted archive gains a format version, a stamp per (day,
  side) pair — the unit the rule judges, so every row of the pair carries it — the observed value
  of each retained pair, and the superseded values each with the pair they belonged to; an older
  format upgrades on read as C14 describes. The
  snapshot contract keeps the list of archived-only days, computed per day as before; the retained
  set never leaves the archive.
- **Restore**: a repository script, run by a developer, that reads a cache snapshot and applies C16
  through the archive's own merge rather than by editing rows — the same aggregation the scan uses,
  so the restored rows are exactly what a scan of that data would have produced.
- **Codex usage sources**: see ADR-0027. The parser reads both sources in one pass and applies the
  usage boundary as it goes; the per-file aggregate keeps its list of per-event increments and gains
  the boundary index beside it, so that the replay stripping can stop at the legacy span — a shape
  change and a computation change, both of which bump the cache structure version under the rule
  below, which changes the accounting stamp (C21). Reading a cold rollout puts a
  zstd decompression stream in front of the line reader; the byte offsets the question index records
  for it are offsets in the decompressed stream.
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
it appears on its own, and an open detail page's section local state is preserved. Focus
events are semantically unreliable under a hidden-window test regime (noted in the existing e2e
header), and since the focus path shares its scan entry point with the timer, it gets no separate e2e.

The archive rule (C5, C6, C10–C14) is tested at the archive's own unit seam with the stamp and the
scan anchor injected: the cases are a same-stamp decrease on a past day (retained, observed value
recorded, superseded list untouched), a different-stamp decrease (accepted, predecessor superseded),
an increase under either stamp (accepted, predecessor superseded), the scan's own day decreasing
(replaced, nothing kept), a side with no live rows on a day the other side is live on
(archived-only, kept), a stampless file read back (accepted once, then stamped), and a shift
between projects with an unchanged side total (accepted). Each case must be able to go red on the
per-day reading the rule replaced, so the two-sides-one-day fixture the section above demands is
mandatory here too. The restore script is tested through the same seam by feeding it a snapshot
fixture and asserting the archive it produces equals a scan of that fixture's data. What the unit
seam cannot reach is that the retained value is what the page shows: the seeded-archive e2e case
grows a retained day (live data lower than the seeded archive under the same stamp) beside its
archived-only day and reads, in one pass on the cross-project page and on a project page, that
the retained day's tooltip total is the archived figure, that it carries no hatching, and that the
archived-only day still does — the assertion that distinguishes "retained silently" from
"overwritten silently", which look identical in every other respect.

The Codex usage sources (B1, B7, B9–B12) are tested at the providers seam with rollout fixtures
whose shapes come from real paginated samples (the record's key set, the interleaving of events and
records, a legacy span before the boundary, a compacted window, a subagent rollout with records): a
dual-source rollout where the events under B7 miss a response the records carry (the case that
distinguishes the sources), a legacy rollout unchanged, the boundary with events on both sides of it,
a duplicate response id, and a cold rollout equal to its plain twin. The ccusage reconciliation keeps
its meaning for legacy data only: it compares days whose Codex rollouts carry no usage records and
reports the record-bearing days separately as an expected divergence.


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
- Telling a correction from a loss by magnitude. The stamp is the only discriminator (ADR-0026);
  no threshold, however chosen, distinguishes a 30% fix from a 30% loss.
- Detecting an agent's format change on its own. The archive reacts to what the figures do, not to
  why; recognising a rewritten record format is the parsers' job.
- Marking a compacted window or a compacted session anywhere in the interface (ruled 2026-09-10):
  past days are protected by the archive, and a session-level marking is a session-view design
  question that needs a prototype.
- ccusage alignment for rollouts carrying usage records (ADR-0027): the third-party meter reads only
  the legacy events and is expected to read lower on those days.
- A cap on superseded values (revisited if the archive file passes about 5 MB, C13).
- Restoring history on a machine that never had it: the restore script works from a cache snapshot
  of this application's own making, and no such snapshot exists on a machine whose agent rewrote
  its records before this application ever scanned them.
- An arbitrary or custom date range. The four windows are fixed. A date picker is a different control
  with different questions (what does it do to the 30-day chart, what does it do to a range with no
  data, does it persist), and the four fixed windows answer the question that prompted this —
  "what have I burned lately" — without any of them.
- Sub-day granularity. "Today" is as fine as the windows go, because a day is as fine as the source
  records are cut for aggregation; an hourly window would have to re-derive from timestamps that the
  aggregation deliberately collapses.
- ~~Rendering session contents (metadata only)~~ (2026-08-06: fully shipped by
  `docs/specs/session-view.md`, moved out of this spec's boundary).
