# Token statistics

> Related: ADR-0005 (aligned with ccusage, supersedes 0003) · ADR-0006 (Codex accounting) · ADR-0007 (usage archive) · ADR-0008 (provider segmentation) · ADR-0009 (x axis data days) · ADR-0019 (third side onboarding) · ADR-0020 (day usage keyed by side) · ADR-0021 (side colour) · ADR-0024 (composition colours) · ADR-0025 (usage rows as the one source) · ADR-0026 (archive retention by accounting stamp, liveness per (day, side)) · ADR-0027 (Codex usage records) · ADR-0037 (Antigravity CLI side) · ADR-0039 (an archive file that fails stops no scan) · ADR-0043 (a scan runs on a worker thread) · ADR-0044 (the token cache in a SQLite store, aggregated by de-duplication group)

> Startup restoration uses the original page prototypes.
> Successful display payloads persist independently of the accounting index (ADR-0029).

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

1. As a user, I want the project overview to show the cumulative total, a selectable daily trend, the model
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
7. As a user, I want to pick a time window — all history, today, the last 7 days, and the last N
   days matching the chosen trend span — from the totals themselves rather than from a separate control, so that "what have I burned lately"
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
15. As a user, I want the figures to keep updating when my usage history cannot be saved, and to be told
    so once, so that a full disk does not stop the app and I know there is something to free.

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
  response whose running total did not advance (measured: in some rollouts the events under this
  rule sum below the records). That is why the usage records are the source from the boundary on —
  two records with one response id are one response (none observed) and nothing else is compared.
- B8 A day's **four-field split is measured, not apportioned**. The per-turn events already carry
  all four figures and a timestamp, so each day accumulates its own four buckets. Apportioning the
  session's totals across its days by each day's share of the total would round four times per day
  and the roundings do not cancel. The drift is negligible in magnitude and disqualifying in kind,
  because "the segments sum to the total" is the whole reason those three buckets are the chosen cut
  (G8).
- B2 Sessions spanning midnight are apportioned to their respective dates by event timestamp (not
  piled onto the first day).
- B3 Subagent sessions' tokens count toward the statistics but do not enter the session list.
- B4 Titles come from `session_index`.
- B9 **The usage boundary is by line order.** The first usage record line in a rollout is the
  boundary: usage events after it are ignored whatever their timestamps, usage events before it
  count under B7. Measured on every dual-source rollout, line order and timestamp select the same
  events; line order is the rule because the writer appends in order and the migration preserves it,
  so no tie or reordering rule is needed. A few rollouts carry usage events before their boundary:
  they are why the events are not simply discarded once a record exists.
- B10 **A paginated fork or subagent thread carries no replayed usage**: Codex copies neither usage
  records nor, in paginated mode, usage events into a child thread, so the child's rollout holds
  only its own usage and the replay-prefix stripping finds nothing to strip. Legacy children still
  carry the replayed prefix as usage events, and the existing by-value stripping against the parent
  stays for them. A record whose thread id is not the rollout's own is not expected and counts as
  the rollout's, since the archive's grain carries no thread.
- B11 **A compacted window has lost its usage for good**: the rollout keeps the summary and the
  span's messages but no usage records for it, and the thread's running total does not restore
  them. A day whose sessions were compacted therefore reads lower than before the compaction; on a
  past day the archive's rule (C10) retains the earlier figure, on the own day the lower figure
  shows. Nothing marks a compacted window anywhere in the interface (G15's ruling extends to it).
- B12 **A cold rollout is read like a plain one**: the same line reader runs over a decompression
  stream, so every rule above applies unchanged. Its identity is its `.jsonl.zst` path, so the day
  Codex compresses a rollout the plain path leaves the scan set and the compressed one enters it as
  a new file — parsed once, then cached like any other. The decoder's output chunk is the line
  reader's read chunk (1 MB): at the decoder's 16 KB default the same per-chunk cost the plain
  reader pays under Electron returns. A cold rollout that cannot be decompressed (truncated, not
  zstd) is skipped like an unreadable plain file, hurting only itself. "Truncated" is judged by the
  recorder's mechanism, not by the decoder: Node's zstd decoder reports nothing for a cut frame
  (measured 2026-09-11, synchronously and as a stream alike — it yields the first half and ends
  cleanly), while every rollout line ends with a newline and a cold rollout is never mid-write, so a
  decompressed stream that does not end with a newline is cut short (every rollout measured ends
  with one, the cold ones included). A cut landing exactly on a line end escapes this and reads as a
  shorter session — that file only.

**Sequence F: Grok-side aggregation**
- F1 Per-turn usage is read from the session's authoritative update stream, which is also the only
  file carrying the conversation and the tool calls — one file serves both metering and display.
- F2 The accounting rule follows the Codex shape, not the Claude one: reported input **already
  includes** cached reads, so input is sanitised by subtracting cached, cached is recorded as cache
  read, and the total is input + output — exactly the total the side reports for itself. Copying the
  Claude four-field sum would double-count the cache. Cache creation is not collected here either:
  B5's rule holds on this side unchanged, for the same reason (ADR-0023).
- F3 The model is taken from the per-turn usage record's own model key, which names the model that
  was actually billed. This is **exact**, unlike the Codex approximation, and it can differ from the
  model the session summary names — the billed name wins, and is not normalised into the summary's
  name. A record without the per-model map falls back to its top-level figures with no model bucket
  (the same rule as a Claude synthetic model: the tokens count, no bucket). The record shapes were
  grounded by full enumeration (2026-08-16): two variants exist — an empty usage object, and one
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
- C1 A token store of another structure version, older or newer, does not crash: it is replaced by an
  empty store of this version and every file is parsed again, apart from the one upgrade C26 imports —
  **the structure definition and the version number are two halves of the same change** (see
  postmortems/cache-version-crash). The version is recorded in the store itself.
- C2 A store that will not open, is not a database, or whose tables are not the shape its version
  has, is garbage: it is replaced and every file is parsed again. Within a store of this version, an
  entry that is not well formed is a miss, and only its file is parsed again (Implementation Decisions,
  Cache); a group's stored result that does not read back is combined again from its files' entries,
  with nothing parsed.
- C3 A second build gives the same result (idempotent). What a scan changes in the store lands in one
  transaction, so the store holds all of it or none of it, wherever the scan was stopped. A failed write
  (a blocked or full settings directory) does not fail the scan: what was computed is in memory and goes
  out as usual, and the failure is logged. The engine then takes the store as it is, so the next scan
  parses again the files whose entries did not land and combines their groups again
  (token-stats::QR-002/AC-02). The store's log and shared-memory files sit beside it in the settings
  directory and are the store's own.
- C4 The archive is written on the first merge; a new instance reads it back. **A failed write does not
  fail the scan** (a settings directory gone read-only or full, ADR-0039): the effective rows computed in
  memory go out as usual and the failure is logged. Each later scan writes again, so the file catches up
  with no restart once the directory is writable, and carries what the failed merges moved in memory.
  The user is told once per run, in a toast in the current UI language: usage history cannot be saved
  right now, because its file in the settings directory cannot be read or written. The sentence states
  no system error and no path. A first scan's failure shows it too, and reloading the window does not
  repeat it. With the window unfocused the toast waits until the window has focus: a background scan's
  failure would otherwise come and go unseen, and nothing tells the user again that run. A failure that
  has cleared by then tells nothing, since the sentence says "right now", and a later failure in that run
  still tells.
- C5 **Liveness is judged per (day, side)** (ADR-0026). A side is live on a day when this scan
  produced at least one row for it on that day. For a live (day, side) the live rows replace the
  archive's — subject to C10 for past days — so an accounting fix still corrects history
  automatically. Another side's rows on the same day have no bearing: Claude being live on a day
  neither replaces nor protects Codex's rows for it.
- C6 A (day, side) with archive rows and no live rows is **archived-only**: its rows are kept and
  are not wiped by this scan finding nothing for that side, even when other sides are live that
  day (the case the per-day reading got wrong).
- C7 Within one day, rows are split by side × project × model and do not overwrite one another.
- C8 Archive writes are atomic with no temporary files left in the directory, whichever step of a write
  failed, and a failed write leaves the file as the last good archive. A corrupt archive file, one that
  reads and does not parse, degrades to empty without crashing (the next scan starts accumulating
  again). A file of a newer format is not corrupt: token-stats::REQ-006 governs it. **Nor is a file that
  exists and cannot be read** (ADR-0039): degrading it to empty would overwrite history that is only out
  of reach. Its effective rows are the live rows, no day is archived-only, nothing is written and a
  restore (C16) refuses, as for a newer format. The read is tried again at each scan, because a change of
  mode does not move the file's signature, and once it can be read the next scan reads it with its
  history whole and C10 applies again. The failure is logged and C4's toast tells the user, since the
  figures now lack the archived days.
- C9 The set of archived-only **days** — a day the archive holds rows for and no side has live rows
  on — stays queryable, for the existing hatching and note. Retained (day, side) pairs are **not**
  exposed to the interface: retention is accounting-only (ADR-0026), and a day on which one side is
  archived-only while another is live carries no marking either.
- C10 **A past (day, side) never falls silently** (ADR-0026, the invariant in AGENTS.md) — within an
  archive this build reads; a corrupt or unreadable one (C8) or one of a newer format
  (token-stats::REQ-006) gives the rule nothing to hold. Every
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
  local calendar day of the scan anchor; display windows use their separate current-time anchor (G2). The first scan after
  midnight therefore treats yesterday as a past day from then on.
- C12 A retained (day, side) stays retained until a scan under a different stamp observes a figure
  other than the recorded observed value, or a live total at or above the archive's arrives. It is
  re-judged on every scan: the observed value tracks the latest live figure, and retention holds no
  state beyond the archive rows, their stamp and the observed value.
- C13 Superseded values are kept without a cap, each with the stamp and scan time that replaced it.
  Growth is bounded by how rarely past days change; the point to revisit the cap is the archive file
  passing about 5 MB.
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
  the application had in memory. A snapshot is a copy of the token store; the script reads it without
  writing to it, and reads no other kind of file — a JSON cache file is not a snapshot. The script
  refuses a snapshot whose cache structure version differs from the current one — the aggregation only
  understands the shape it was written for, and a restore from a shape it misreads would write plausible
  nonsense. The consequence: every cache structure bump orphans the snapshots written before it, and a
  restore across a bump needs the snapshot converted first, by hand, per version step — a conversion is
  exact only when the step's change to the per-file aggregate has a known value for the old entries.
  Automating the conversion is not planned; a snapshot a step cannot convert exactly is unrecoverable
  through the script. The script also refuses a snapshot of the current version that holds an entry that
  is not well formed, a converted one included (Implementation Decisions, Restore).
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
  than tolerant.
- C22 **While a write is blocked, the file is what counts as the archive** (ADR-0039). Within the run
  memory holds the effective rows: C10 retains a lower past figure, and writes that fail and are tried
  again keep one superseded value (C13). A restart reads the last good file and compares against that, so
  a higher figure and a retained pair's observed value held only in memory are gone, and an application
  update in that window falls under C18. A row that reached only memory, and is gone from the agent's data
  before a write succeeds, is not archived: that is the cost accepted.
- C23 Another writer changing the file during a blocked stretch (C16's restore, a newer build) moves its
  signature, so the next merge reads the file back rather than writing from memory (token-stats::REQ-006/AC-03),
  and what only memory held goes with it. A stat failing for any reason but absence is not a removed file: it
  says nothing about the file, and the rows in memory stay, so C10 holds. A file that stops being readable
  while the app runs changes nothing, since the next write replaces it from memory, which holds its
  history. A directory at the file's path holds no history, so it is not an unreadable file, and writes
  fail as C4 says.
- C24 Interface for C4, C8 and C22: the scan's result appears where it was stuck and the notice is a toast,
  so no page, state form or control is added or changed, only one sentence in the existing toast form
  (the prototype exemption, declared). A standing state for this would need a prototype.
- C25 **A settings directory already read-only or full at launch never reaches a scan**: the runtime
  cannot create its single-instance lock there, so the application cannot start. It says so in a
  native dialog naming the directory and exits non-zero, with no window ([i18n](i18n.md), The launch
  dialog; measured 2026-11-05). C4 and C8 govern what happens once the application is running: a
  directory that goes read-only or full later, or a volume with room for the lock and not for the
  archive.
- C26 **Upgrading from the JSON cache** (ADR-0044). A launch that finds no usable token store and a JSON
  cache file of structure version 19 — the last kept in that file, whose per-file aggregate the store
  keeps unchanged — imports every well-formed entry of it into a new store before the first scan, each as
  a scan would have stored it, and deletes the JSON file once the import has landed. An entry that is not
  well formed is not imported, and the first scan parses its file. A JSON file of another version, or one
  that is garbage by the rules that file had (it does not parse, or its `files` is not an object of
  entries), is deleted without an import, and the first scan parses every file. A JSON file beside a
  usable store — a build from before the store ran since — is deleted unread: the store's signatures
  decide what is current, and a file that changed since is parsed again. An import that fails lands
  nothing and the first scan parses every file; the JSON file is then deleted as one beside a usable
  store. A deletion that fails is logged, and a later launch deletes the file it finds.
- C27 **Two processes on one store**. A development run and the installed copy use one settings directory
  on a case-insensitive volume (app-update spec, Implementation Decisions), so both can run on one store.
  Before each scan and each read of an entry, a process that finds the store changed by the other since
  it last read it takes the store as it is, so it never combines from, or writes over the other's
  changes with, what it held in memory. A write that finds the store held by the other waits for it, and
  one that still cannot write is a failed write (C3).

**Sequence D: trend and axis rendering**
- D1 The plotted calendar span follows token-stats::REQ-002/AC-02.
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
- D10 Chart span and totals-card highlighting compose as token-stats::REQ-002/AC-04 specifies.
- D11 In combined mode, hovering a bar shows each provider's number and percentage; the legend lists
  only the providers that appear.
- D12 Days outside the selected totals window are dimmed rather than removed, and the legend says so.

**Sequence E: automatic snapshot refresh**
- E1 Triggers: window focus (only if at least a throttle window has passed since the last successful
  scan, 60 s by default, debounced) plus a timed backstop (5 minutes by default). These two are the
  **only** triggers after startup.
- E2 Concurrency: both triggers share one scan entry point with in-flight deduplication (at most one
  scan running at any moment), so a focus arriving during the backstop's scan joins it.
- E3 A scan that fails → **silently keeps the existing snapshot**, without interrupting the user or
  clearing data, and waits for the next trigger.
- E4 A new snapshot is delivered to the window; an open project detail page **updates by
  transfusion** (no "loading" flash, section local state preserved — the behaviour entry is in the
  project-detail spec).
- E5 The throttle window and the backstop interval are injected from the environment.
- E6 The overnight case is a corollary of E1: focus or the backstop triggers a rescan, the `scannedAt`
  anchor moves forward, and today's data and the axis recover under D1's semantics — no special-casing
  of "crossing midnight" is needed.

**Sequence G: the time window and the composition**
- G1 Four windows — all history / today / the last 7 days / the last N days under
  token-stats::REQ-002/AC-08 — presented as four cards
  that are **themselves the selector**: the card shows that window's total and clicking it selects the
  window. There is no separate control for the totals window; "how much" and "over what period" are one object. All
  history is the default selection.
- G2 The cards, trend and window highlighting share the current display-time anchor in
  token-stats::REQ-001. The snapshot timestamp records when the data was observed, not what day
  the user is viewing it on. All dependent regions move together.
- G3 Everything the selection governs moves with it: each side's figure, the composition, the model
  breakdown, and the trend's dimming (D10). Nothing that the selection governs may stay on a different
  window — a page where some figures moved and others did not is worse than one that offers no
  windowing at all, because the reader has no way to tell which is which.
- G4 **All history and the trend chart deliberately disagree in span**, and the card says so in its
  own label. The chart shows the selected 30, 60 or 90 calendar days; the cumulative total is every
  day on record. An unlabelled cumulative total sitting above a chart captioned "last 30 days" would
  be read as a 30-day figure. Naming the window on the card is the rule; making them agree is not,
  since neither span is wrong for its own purpose.
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
  day by construction. A project page shows such a day's value, hatched under the same per-day rule
  as the cross-project view. No prototype was made for this: the hatched bar already exists on the
  cross-project page, and giving it a height on the project page is a data-semantics change, not a
  new form (the prototype exemption for such changes, declared here rather than assumed).
- G15 **Retention has no marking**. A retained day is drawn exactly like any other day: no pattern,
  no note, no tooltip annotation, and the observed value appears nowhere in the interface. The
  existing archived-only marking is unchanged — a day is hatched and counted in the note when the
  archive holds it and no side has live rows on it. Consequence, accepted: a user cannot tell a
  retained day from a live one on screen; the archive's superseded values are the only trace.
- G7 An entry carrying no timestamp cannot be attributed to any day, and therefore to any window. To
  keep this from silently detaching a total from its own breakdown, **every figure on the page
  derives from the same row set** — including all history and each side's total. The windowed
  figures and the side totals are then equal by construction rather than by coincidence.
- G8 The composition cuts the selected window's total into the three cross-side comparable buckets —
  `input + cacheWrite` / `output` / `cacheRead` — which carry one meaning each on every side and
  sum exactly to the total (the invariant in AGENTS.md). It is rendered **below the totals and
  outside any card**: it decomposes the same number the side figures decompose, by a different axis,
  so the two are siblings rather than one being contained in the other.
- G9 The smallest bucket is a fraction of a percent of the total on real data. Percentages are
  therefore part of the legend rather than something the reader infers from width, and each segment
  keeps a minimum width so the smallest one exists on screen at all. The legend also carries the
  absolute figure and states that cache writes are counted inside uncached input — that grouping is
  not inferable from the label, and "where did cache creation go" is the first question the bar
  provokes.
- G10 Composition colours: cache read blue, uncached input yellow, output green (ADR-0024).
- G11 The selected totals-card identity is view state (the global trend-span preference has its
  own lifetime under token-stats::REQ-002/AC-05 and token-stats::REQ-002/AC-07): it survives switching
  tabs within the page and is not persisted across restarts, matching how the session sort already behaves. On the project
  detail page it is held while you stay in Projects, since the window is a lens the user holds rather than a property of one
  project: switching projects, a stale project's note page or the not-in-snapshot state between two pages, and a session
  opened and left, by the back control or by selecting a project in the list. It resets when you leave Projects, whichever
  way you come back, and a search hit's session arrives on the default.
- G12 The window and the trend's side filter are **independent controls that compose**: selecting a
  side narrows what the bars count (D4), selecting a window dims which bars are in scope (D10), and
  using both leaves a single-side chart with part of its span dimmed. Neither resets the other. The
  window still governs the figures above the chart across all sides — the side filter is a property of
  the chart alone, which is why it does not touch them.
- G13 A refresh arriving while a non-default window is selected (E1's automatic triggers) keeps the
  selection and recomputes its figures against the new snapshot. The anchor may have moved, so "today"
  can come to mean a different day than it did a moment ago; that is the intended behaviour and the
  reason G2 gives the window and chart one shared display-time anchor. Losing the selection on refresh
  would be the visible defect, since the automatic backstop fires on a timer the user did not ask for.
- G14 This feature renders figures the application computed itself. It introduces no new point at
  which external content is rendered or loaded, so it adds no interaction surface beyond the controls
  named above — stated rather than skipped, because "no new surface" is a conclusion that has to be
  reached rather than a default.
- G16 A part of the composition at exactly zero draws nothing.
- G17 A project with no sessions shows zeros and an empty state rather than an error.

## Selectable trend span

### token-stats::REQ-002 Select the daily chart span

Applies to every Token daily bar chart, including the global Token tab and every project Overview.
The confirmed layout uses inline numeric choices in the existing chart heading, with one global
preference and a linked fourth totals card. The provider palette and daily grain stay unchanged.

- token-stats::REQ-002/AC-01: The heading presents exactly `30/60/90` inline, with each number
  independently clickable and the selected number highlighted using the theme accent, stronger
  weight and a persistent underline, including when not hovered. There are no spaces, horizontal button padding or gaps around the slashes.
  The slashes are separators, not controls. There is no dropdown.
- token-stats::REQ-002/AC-02: Selecting N draws N consecutive local calendar dates in ascending
  order, ending on the shared current display day, including across month/year and daylight-saving
  boundaries. Older rows and future rows are excluded; absent dates remain zero with no segments.
- token-stats::REQ-002/AC-03: Expanding the span exposes existing historical daily values, including
  archived values and their existing hatching. Combined/provider segmentation, single-side counting,
  daily tooltips, and window-relative height scaling retain D2–D5 and ADR-0008 semantics.
- token-stats::REQ-002/AC-04: Changing the span preserves the selected totals-card identity and the
  chart's side filter. Selecting a totals card or side does not reset the span. All-history, today
  and 7-day totals and their selected breakdowns are unaffected by a span-only change; the fourth
  card follows token-stats::REQ-002/AC-08 and token-stats::REQ-002/AC-09. The side filter applies
  only to bars, never to the totals cards. Dates outside the selected totals window are dimmed
  without removing bars; all history dims none.
- token-stats::REQ-002/AC-05: There is one global span for all Token daily charts. Changing it on
  either entry updates the other entry and every project when displayed, including already-mounted
  views. Switching pages, projects or tabs and receiving a new snapshot preserve that choice;
  there are no per-project or per-page overrides.
- token-stats::REQ-002/AC-06: All spans fit the chart width with daily bars; 60/90-day bars use
  tighter gaps. The date axis retains D6–D9/ADR-0009 semantics: data days only, correct month
  context, no overlapping or out-of-container labels. The inline choices and linked card remain
  usable at the minimum supported window width, in all themes, both appearances and every UI
  language. Copy and accessible names are localized; keyboard focus and the selected value are
  exposed through the existing accessible-control conventions.
- token-stats::REQ-002/AC-07: A successful choice is saved as an application-owned preference.
  Quitting and reopening restores it for all charts and the fourth totals card. A fresh profile
  defaults to 30. This is local application persistence; it does not require an account or login.
- token-stats::REQ-002/AC-08: The fourth card remains a single card whose label is the localized
  equivalent of “Last N days” and whose amount sums the effective usage rows for those same N
  local calendar dates, for the current project or all projects as appropriate. It updates whenever
  the global span changes, even when another totals card is active. Archived and retained usage,
  zero dates and undated-row exclusion follow G5–G7 and ADR-0025; the value is not a multiple or
  extrapolation of the 30-day total. The other three cards keep their existing meanings.
- token-stats::REQ-002/AC-09: If the fourth card is active, changing N keeps it active and recomputes
  its side totals, composition, model breakdown and heading for N days together with the chart
  highlighting. Selecting that card after changing N uses the new N immediately. Its three
  composition buckets continue to sum to its total. Changing N does not automatically select the
  fourth card when another card is active.
- token-stats::REQ-002/AC-10: An older preference file without the span field, or an invalid span
  value, falls back to 30 without resetting valid theme/language/appearance preferences. A corrupt
  preference file uses the existing preference-loading fallback without crashing. Saving the span
  preserves unrelated preferences and does not write agent configuration or accounting archives.
- token-stats::REQ-002/AC-11: On rapid repeated selection, the last user choice wins across views
  and, once saved, after restart. A late initial preference read or an earlier save response must
  not overwrite a newer user choice. Snapshot refreshes and preference responses must not leave
  the selected number, fourth-card label/amount and active breakdowns on different spans.
- token-stats::REQ-002/AC-12: If saving fails, the current selection remains consistent across the
  open app and the existing localized save-error feedback reports the failure; the app must not
  claim that it was saved. On reopening, restore the last successfully persisted value (or the
  default if none exists). Preference writes use the existing atomic save mechanism so an
  interruption does not leave a partially written preference file.
- token-stats::REQ-002/AC-13: With no first snapshot, the startup placeholder reserves the same
  inline control and fourth-card geometry, displays the resolved saved/default span, and keeps
  the chart control disabled. On first data or restored data, the card and chart use that span;
  startup data arrival cannot reset it to 30. Reopening with a saved span requires no corrective
  user click. Existing loading and restored-data states are reused.

### Failure modes and boundaries: selection through restart

| User operation sequence | Governing acceptance units |
|---|---|
| Fresh launch → no snapshot → first data; or reopen with saved 60/90 and restored data | token-stats::REQ-002/AC-07, token-stats::REQ-002/AC-13 |
| Choose 60 on global page → open project A → project B → return global page | token-stats::REQ-002/AC-05, token-stats::REQ-002/AC-08 |
| Choose 30 → 90 → 60 while earlier preference reads/writes are outstanding → quit after save → reopen | token-stats::REQ-002/AC-07, token-stats::REQ-002/AC-11 |
| Change span with all history/today/7 days active; then select the fourth card; then change span again | token-stats::REQ-002/AC-04, token-stats::REQ-002/AC-08, token-stats::REQ-002/AC-09 |
| Switch a chart to one side → change span → switch side again, including a side with no usage | token-stats::REQ-002/AC-03, token-stats::REQ-002/AC-04 |
| Expand beyond available history, or open an empty project; include archived-only and retained dates | token-stats::REQ-002/AC-02, token-stats::REQ-002/AC-03, token-stats::REQ-002/AC-08 |
| New snapshot arrives, scan fails, midnight passes, or time zone changes while viewing saved data | token-stats::REQ-002/AC-05, token-stats::REQ-002/AC-11, token-stats::REQ-001/AC-02; E3 retains existing data |
| Upgrade an older profile, read an invalid value, save alongside an appearance change, or fail/interrupt a save | token-stats::REQ-002/AC-10, token-stats::REQ-002/AC-11, token-stats::REQ-002/AC-12 |
| Switch language/theme or narrow the window with 90 days selected | token-stats::REQ-002/AC-01, token-stats::REQ-002/AC-06 |

Entering/leaving a page does not create or destroy the global preference. Loading preferences,
receiving saved/live data and changing the user's choice are independent events governed by the
acceptance units above. The existing active-card and side-filter lifetimes stay as G11/G12 define.
This change adds preference reads/writes but no new accounting reads, archive writes or external
content rendering; G14's external-content boundary is unchanged.

## Restored-data time semantics

### token-stats::REQ-001 Use one current display clock

- token-stats::REQ-001/AC-01: Relative activity labels across overview, projects, detail, memory
  and sessions use current time, so data saved yesterday never reads as just observed on restart.
- token-stats::REQ-001/AC-02: Today/7-day/selected-N-day totals, model/side/composition breakdowns,
  trend end date and selected-span highlighting use the same current display-time anchor;
  crossing midnight or changing time zone must not split their definition of today.
- token-stats::REQ-001/AC-03: Stored observation timestamps and the archive's scan-day accounting
  are not rewritten to make restored data look current. Undated-row and all-history accounting
  remain unchanged.

The display copy follows [agents-overview::CON-001](agents-overview.md); it never feeds restored
figures into archive merging. A stale copy containing no rows for the new day shows the computed
empty-day result while its startup scan indicator remains visible, then receives the live rows.

## The Antigravity CLI side

Antigravity CLI (`agy`) is the fourth agent side (ADR-0037). Each of its conversations is a SQLite
database whose rows carry protobuf records, one usage record per model call; the schema is not
published and is read from the descriptors embedded in agy 1.4.9. The facts below were measured
against real conversations in both of agy's sign-in modes, a fork, a rewind, a subagent and failed
calls. The field mapping and the de-duplication were reconciled call by call on 2026-10-28 against
agy's own per-call usage output: 16 de-duplicated calls across seven databases matched to the token,
the differences explained by one rewound call and three subagent calls. Only the latest format is
supported.

### token-stats::CON-001 What the Antigravity CLI side reads (direct acceptance)

Applies to: the Antigravity CLI side. Its conversations, settings and conversation titles are read
only from agy's own data root, `~/.gemini/antigravity-cli`; its component and configuration files are
read where agy loads them, as the component specs list. The Antigravity desktop app's and IDE's data
roots (`~/.gemini/antigravity`, `~/.gemini/antigravity-ide`) are never read. A conversation is a
`.db` file directly in the conversations directory (subagent conversations sit there too, measured);
the log and shared-memory files beside it are not conversations. Only the supported format is read:
user version 1, with the tables and columns usage is read from (the steps' index and metadata, the
generator metadata's index and data, the trajectory metadata, and the trajectory table's cascade id —
the conversation's own id, one row per database). Any other shape is unreadable
(token-stats::REQ-004).

### token-stats::CON-002 Reading agy's files writes nothing (direct acceptance)

Applies to: every read of a file under agy's directories, the conversation databases and the title
database included. A read creates, changes or deletes no file there — no journal, shared-memory or
log file, and no checkpoint. A database with no write-ahead log beside it is read in place, opened as
immutable; a database with a log beside it (agy has it open) is copied together with its log into this
application's own temporary directory and read there, and the copy is removed afterwards. Measured
2026-10-28: an ordinary read-only open of a WAL database leaves `-shm` and `-wal` files behind, and an
immutable open of a database agy is writing misses the rows still in its log.

### token-stats::REQ-003 Count Antigravity usage once per model call

Applies to: every conversation database of the side, forks and subagent conversations included.

- token-stats::REQ-003/AC-01: A model call counts once across every database of the side. Its identity
  is its `response_id`, else its `provider_assigned_message_id`, else its `message_id` — signed-in
  sessions carry the first, API-key sessions only the last (measured). agy records every call three
  times in one database — the step's usage, the generator metadata's usage and the first entry of that
  record's retry list — and the three count once.
- token-stats::REQ-003/AC-02: A retry-list entry counts as a call of its own only when it carries token
  counts and an identity different from the call it belongs to. A failed attempt without token counts
  (a 429, a 503 or a timeout, measured) adds nothing.
- token-stats::REQ-003/AC-03: The four fields are taken as recorded: input = input tokens, output =
  output tokens, cache read = cache-read tokens, cache write = cache-write tokens. Thinking is already
  inside output and is never added again; input already excludes cache reads and nothing is subtracted
  from it. The total is the four fields summed, so it is higher than agy's own total (input + output) by
  the cache reads — exactly so on every measured call, none of which reported a cache write — and by the
  cache writes of a call that reports any (ADR-0037); the composition buckets keep G8's meanings.
- token-stats::REQ-003/AC-04: The model is the generator metadata's `response_model` as agy records it,
  never normalised (`gemini-3.8-flash-n` stays `gemini-3.8-flash-n`). A call without one counts toward
  the total and enters no model bucket (the rule A6 and F3 apply on the other sides).
- token-stats::REQ-003/AC-05: A call's day is its step's completion time, else its creation time, in
  local time. A call with neither — a generator record with no step — is an undated row (G7).
- token-stats::REQ-003/AC-06: A conversation made by `/fork` (or by switching the custom agent, which
  forks) holds a copy of its parent's database. A step whose source names another conversation, a
  generator record attached only to such steps, and a generator record attached to no step of the
  database whose own record names another conversation as the one that made the call, are that
  conversation's usage and never the fork's: a fork's figures hold only what it generated itself.
  "Another conversation" is one other than the conversation's own id, as its trajectory table records
  it (token-stats::CON-001) — equal to its database's name on every measured conversation, but read from
  the database, so that a renamed file cannot make every step look copied. When the conversation it was
  copied from is no longer on this machine, those calls count nowhere live; past days keep them through
  the archive (C10, C17) and the own day shows the lower figure.
- token-stats::REQ-003/AC-07: A subagent conversation is one whose own trajectory metadata names a
  parent conversation, or carries a nesting depth or a subagent spec. It is never recognised by where
  its file sits, nor by its trajectory source, which is the same for subagents and main conversations
  (measured). Its usage counts, and it stays out of the session list (the rule B3 and F5 apply).
- token-stats::REQ-003/AC-08: A conversation's usage is credited to the project of the first folder its
  trajectory metadata lists, presumed to be the directory agy was launched in. A folder that is not
  registered contributes to the global figures only (A2's rule, ADR-0019).
  > Pending: a real conversation spanning several folders has been observed, and the first folder it
  > lists is the directory agy was launched in.
- token-stats::REQ-003/AC-09: A database with no steps and no generator records contributes nothing and
  is not unreadable. agy creates one each time its interface is opened, even when nothing is sent
  (measured).

### token-stats::REQ-004 Report Antigravity conversations that cannot be read

- token-stats::REQ-004/AC-01: A conversation database that cannot be read in the supported format
  (token-stats::CON-001) — it will not open, its user version, tables or columns differ, or a usage
  record will not decode — is left out of every figure and every list, and counted.
- token-stats::REQ-004/AC-02: The scan's count of unreadable conversations reaches the Antigravity side
  card ([agents-overview::REQ-003/AC-02](agents-overview.md)); a count of zero shows no notice.
- token-stats::REQ-004/AC-03: A read that fails while a log is beside the database, before or after
  the read, is agy writing it rather than a format change: it is not counted, the conversation keeps
  its last successful result, and it is read again at the next scan. A conversation never read
  successfully contributes nothing until a read succeeds.
- token-stats::REQ-004/AC-04: Leaving a conversation out lowers the live figures: past days keep their
  archived figures (C10) and the own day shows the lower figure. The notice is the only signal.

### Failure modes and boundaries: the Antigravity CLI side

- agy is running a conversation while a scan reads it: the copy path (token-stats::CON-002) reads the
  committed part of the log; a torn last frame is ignored by SQLite's own log checks, so the figures
  lag at most one scan behind the conversation. agy exiting between the check and the copy merges and
  deletes the log; the copy then finds none and the database alone holds everything. The log is copied
  before the database, so agy exiting between the two copies also leaves a database copy that holds
  everything; a checkpoint agy runs while it keeps writing could still split the pair (not observed),
  and a read of it that fails is retried at the next scan.
- While a conversation has a log, every scan that reads it copies the database and the log in full:
  no copy-on-write clone is made through the runtime on macOS. A conversation that changed is read
  twice in one scan — once for its folder (the activity walk) and once for its usage — so one agy is
  writing is copied twice. A conversation whose database time and log did not change since its last
  read is not read again, and a conversation found unreadable keeps that verdict, counted at every
  scan, until its database or its log changes. The activity walk keeps only successful reads, so it
  opens an unreadable conversation again at every scan — in place, or through a copy while a log is
  beside it — and finds it unreadable again.
- A read cut short by the application being killed leaves its copy in a temporary directory only the
  user can read; nothing is left under agy's directories.
- A conversation is credited to the first of its trajectory metadata's workspace URIs or, in a record
  without them, of its workspaces' folders (the two named the same folder in every measured record); a
  first folder that is not a local `file:` URI credits no project. A nesting depth of zero is no
  subagent marker (token-stats::REQ-003/AC-07): no measured main conversation carries one.
- agy starts writing a database that is being read in place: the read may fail; the log is now there,
  so token-stats::REQ-004/AC-03 applies and the next scan reads it through the copy.
- Rewind: agy deletes the rewound calls from the database (steps and generator records alike,
  measured). The next scan's figures fall; a past day keeps its figure through C10 only if a scan saw
  it first, and the own day shows the lower figure (C11).
- Fork, then the parent is deleted from agy's resume list: token-stats::REQ-003/AC-06 — the copied calls
  leave the live figures with the parent, and the fork's own figures do not change.
- An automatic update of agy changes the format: new and rewritten conversations become unreadable and
  are counted (token-stats::REQ-004); unchanged conversations keep their cached results, since their
  files did not change.
- Signed-in and API-key conversations on one machine: both identity orders resolve
  (token-stats::REQ-003/AC-01); an API-key `message_id` has the same shape as a signed-in `response_id`,
  and the two namespaces were not observed to collide.
- A model id with a routing suffix (`-n`): kept as recorded (token-stats::REQ-003/AC-04), so the per-model
  list can show names no other tool shows; accepted.
- A model call agy runs on a Claude model reports cache writes; the four-field total includes them, and
  ADR-0037 counts cache writes among the figures the Claude Code and
  Antigravity CLI sides report.
- Usage agy never writes to a database — the `/btw` side question (deleted once answered) and the
  Auto mode's command reviewer — is not counted; this under-count is not signalled in the interface.
- The generator metadata holds each call's full prompt and can reach hundreds of megabytes in one
  database: decoding skips those fields by their length prefix and never decodes them. The runtime's
  SQLite module returns a record whole, so one record's bytes are in memory while it is read; the
  records are read one at a time.
- A zero-byte or non-SQLite `.db` file fails to open in the supported format and is counted as
  unreadable (token-stats::REQ-004/AC-01).
- The settings file or the data root is missing or corrupt: projects-list A1–A3 and A9 apply to this
  side as to the others.
- A conversation in another format gives its folder no activity either: the activity walk applies the
  same format check. One whose format and trajectory record read but one of whose usage records will
  not decode is left out of the figures and counted, while its folder still takes the database's time —
  activity is the file's time, a separate pipeline (projects-list). A read that fails while agy writes
  keeps the conversation's last folder as well as its last usage.
- A call carrying no identity (none measured): it counts where it is — within its database its step
  and its generator record are joined through the step the record names — and is never matched
  across databases.
- A conversation deleted between the scan's listing and its read is not unreadable: deleted before its
  read starts, it leaves the figures in that scan; deleted while it is read, that scan keeps its last
  result, as for a read that fails while agy writes, and it leaves the figures at the next scan.
- External content: the side's figures are numbers this application computes, and its model names are
  shown as plain text in the existing model rows, as every side's are; nothing read from agy's files
  is rendered or loaded at a new point (G14 holds).

## An archive a newer build wrote

A build can read an archive a newer build wrote: a development run and the installed copy use one
user-data directory on macOS's default case-insensitive volume (app-update spec, Implementation
Decisions), and an older release can be installed over a newer one by hand. A newer build that adds an
agent side archives that side's rows; to an older build that side is outside its set of agent sides. A
newer build that changes the archive's own shape writes a format version the older build does not
read. The display copy's counterpart is [agents-overview::REQ-005](agents-overview.md). The accounting
cache needs no rule here: a newer build's cache carries another structure version and is recomputed
(C1), and within one version an entry of a kind this build does not parse is a miss.

### token-stats::REQ-005 Keep a side this build does not know out of the figures and in the file

Applies to: every archive row whose side is outside this build's set of agent sides — missing or not a
string included — on any day, the scan's own day included.

- token-stats::REQ-005/AC-01: The row is left out of every figure — each time window, each side's
  figure, the composition, the model breakdown, the trend and every project's own figures — and the
  scan completes and delivers its snapshot as if the row were absent.
- token-stats::REQ-005/AC-02: The row makes no day archived-only: a day is archived-only (C9) only
  through rows of sides this build knows.
- token-stats::REQ-005/AC-03: Every write this build makes to the archive carries the row unchanged,
  with its pair's stamp, observed value and superseded values, so the build that knows the side reads
  its history back as that build wrote it.
- token-stats::REQ-005/AC-04: Nothing marks the row: no notice, count or log line. This build shows
  the side nowhere, so leaving its usage out agrees with everything else on screen.

### token-stats::REQ-006 Leave an archive of a newer format alone

Applies to: an archive file whose format version is a whole number above the one this build writes.

- token-stats::REQ-006/AC-01: This build never writes the file: it stays byte for byte as the newer
  build left it through every scan, and a restore (C16) reports that it cannot write and writes
  nothing.
- token-stats::REQ-006/AC-02: Every figure derives from the scan's live rows alone and no day is
  archived-only, as in a user-data directory holding no archive; the scan completes and delivers its
  snapshot.
- token-stats::REQ-006/AC-03: The judgement follows the file as it is at each scan: a newer build
  writing its format while this build runs is left alone from this build's next scan on, and is never
  overwritten from what this build read earlier.
- token-stats::REQ-006/AC-04: Nothing marks it: no notice, count or log line.

### Failure modes and boundaries: an archive a newer build wrote

- A newer build archives a new side's usage, then this build is launched: its first scan completes
  with the sides it knows (token-stats::REQ-005/AC-01); its restored display copy follows
  agents-overview::REQ-005.
- The newer build is launched again: that side's past days read as before, since this build's writes
  carried its rows (token-stats::REQ-005/AC-03); its own day comes from its scan as usual (C11).
- Both builds run at once on one user-data directory: each merge re-reads a file another writer changed
  since its last read, the mechanism C16's restore relies on, so neither writes the other's rows back
  from stale memory; this build's writes carry the other side's rows through
  (token-stats::REQ-005/AC-03).
- The scan's own day holds rows of a side this build does not know: they are left out and kept like any
  other day's. C11's replacement applies to pairs the scan produced rows for, and a build produces none
  for a side it does not know.
- A restore (C16) names a side this build knows: it writes that side's pairs only, and rows of a side
  it does not know are carried through (token-stats::REQ-005/AC-03).
- A restore (C16) against an archive of a newer format refuses before reading the snapshot and
  leaves the file as it was; against this build's format its dry run reports and writes nothing.
- An archive of a newer format while this build runs alone: the days only the archive held read lower
  or empty, with no hatching (token-stats::REQ-006/AC-02, token-stats::REQ-006/AC-04). This is the
  one place besides a corrupt or unreadable archive (C8) where a past day reads lower than the archive
  holds: C10 governs the archive this build writes, and this build writes none. Usage the agent deletes in that
  time reaches the newer build's archive only if the newer build scanned it before.
- A newer build drops a side an older one archived: to the newer build those rows are of a side it does
  not know, and token-stats::REQ-005 applies to them there.
- The archive file is removed while this build leaves a newer one alone: the next scan finds no file and
  starts a new archive in this build's format (C4).
- An archive whose version is not a whole number, or a file that is not an archive at all: corrupt, C8
  applies.
- Interface: no page, state, copy or control is added or changed — these rules decide which rows the
  existing pages count (the prototype exemption, declared). No new point renders or loads external
  content (G14 holds).

## Scans and the window

A scan reads every side's registries, components and session files, and E1 starts one on a timer and
when the window gains focus. The two requirements below keep it from freezing the window and from
repeating work.

### token-stats::QR-001 A rescan does not hold up the window (direct acceptance)

Applies to: every automatic rescan (E1) while the scan worker runs (ADR-0043); the first scan of a run
takes the same path. During a rescan the main process is never busy for longer than 100 ms at a
stretch, whether or not session files changed since the last scan. It is judged by the scan benchmark
under Electron (the AGENTS.md invariant on main-process figures), as the main process's longest
event-loop stall across one rescan, on real data of the size the threshold was set against: about
7,000 session files.

### token-stats::QR-002 A rescan repeats no reading or write whose input did not change

Applies to: every scan after the first of a run; token-stats::QR-002/AC-02 applies to the first as well.
The first scan served on the main process after the scan worker fails is a first scan for
token-stats::QR-002/AC-01 (Failure modes and boundaries, below).

- token-stats::QR-002/AC-01: A Codex rollout whose modification time, size and inode are the ones the
  previous scan saw is not opened to read its first line again: everything the scan takes from that
  line — the project it is credited to, whether it is a subagent's, its ids and its fork time among
  them — is what was read then. A rollout that differs in any of the three is read again.
- token-stats::QR-002/AC-02: A scan writes to the token store only what it changed: the entry of each
  file a parse gave a new entry, the removal of each entry whose file ends the scan with none (it left
  the scan set, or no longer gives an entry), and the stored result of each group it combined again
  (token-stats::CON-003). A scan that changed nothing writes nothing; a parse that gave nothing to a
  file the store held no entry for, or that kept the entry the store already held
  (token-stats::REQ-004/AC-03), changed nothing.

### Failure modes and boundaries: scans and the window

- The scan worker cannot be started, fails or exits, during a scan or between two (ADR-0043): the scan
  and the question-index reads under way, and every later one of that run, are served on the main
  process, and the failure is logged once. The figures are the same. token-stats::QR-001 does not hold
  for the rest of that run. A scan or a read that fails on a worker still running is that scan (E3) or
  that read (session-view C4) failed, not a failed worker.
- A rollout replaced under its path, appended to or edited in place differs in its inode, its size or
  its modification time, and its first line is read again (token-stats::QR-002/AC-01). An edit that
  moves none of the three is not seen until the file next changes — the limit the token cache's own
  signature has (Implementation Decisions, Cache).
- The first-line readings are kept in memory for the run and are not saved: the first scan of a run
  reads every rollout's first line. They are kept where the scan runs, so after the scan worker fails
  the first scan served on the main process reads every rollout's first line as well, and
  token-stats::QR-002/AC-01 holds again from the scan after it.
- Only a reading that gave a session is kept. A rollout that gave none — it could not be opened, or its
  first line is corrupt or names no project (projects-list B4) — is opened again at every scan, the one
  exception to token-stats::QR-002/AC-01: such a failure can end without the signature moving, as a
  change of mode touches none of the three, and a kept failure would hide the session until the file
  next changed, which a cold rollout never does. A rollout with a kept reading that changes into one
  giving none leaves the scan; its earlier reading is not used.
- A store write that fails, a scan's or a session page's (session-view C4), lands nothing, and the
  engine takes the store as it is (C3): the next scan parses again what did not land and writes it, so
  the store catches up without a restart once the directory is writable.
- A run that finds no usable store — none, a garbage one or one of another version (C1, C2) — creates
  an empty store of this version when it opens it, before its first scan, a home with no session file
  included.
- A session page, a project search or global search asks for a question index while a scan runs: the
  worker answers between the scan's steps, not after the scan, and the asking page keeps its existing
  pending form until then.
- Quitting while a scan runs: the quit waits for the worker to stop between two steps, so the store
  holds the last scan whose writes landed (C3). A scan the worker has not finished by then is
  dropped with its results. One it finishes first is a finished scan: its result is taken, and the
  display copy it leaves is on disk before the app exits. Anything else asked of the worker and not
  answered when it stops stays unanswered, and no failure is shown for it.
- Interface: no page, state, copy or control is added or changed — these rules decide where a scan
  runs and what it reads again, and the figures are the same (the prototype exemption, declared). No
  new point renders or loads external content (G14 holds).

## The token store

The token cache is a SQLite store that keeps each file's entry and each de-duplication group's combined
result, and a scan combines again only the groups its changes reach (ADR-0044). The requirements below
hold it to the figures one combination over everything gives, and to memory and writes that follow what
changed.

### token-stats::CON-003 Combining by group gives the figures of one combination (direct acceptance)

Applies to: every scan, on the scan worker or on the main process, and everything it derives from the
token cache — the usage rows, each project's sessions and their order, the session read allow-list,
each side's count of unreadable conversations and every title it shows. These are exactly what one
combination over every file of the scan set, in scan order, gives from the same entries.

### token-stats::QR-003 A scan's memory and its writes follow what changed

Applies to: a locally packaged build from its second launch on — not the first launch of a build, which
imports the JSON cache (C26) or combines every group again (Implementation Decisions, Cache) — with its
window shown and its store current to within ten files at launch, on real data of the size these were
set against: about 7,000 session files. Memory is the main process's, its worker threads included, read
with macOS `footprint`.

- token-stats::QR-003/AC-01: From launch through the first scan and five rescans, the main process's
  peak footprint is at most 400 MB.
- token-stats::QR-003/AC-02: After those rescans, its footprint is at most 250 MB.
- token-stats::QR-003/AC-03: A rescan that parses at most ten files writes at most 10 MB to the token
  store, its log and the checkpoint into the store included, whether or not the window has focus. The
  display copy ([agents-overview::REQ-008](agents-overview.md)) and the archive are written by their own
  rules and are not counted.

### Failure modes and boundaries: the token store

- A changed file that now shares a key with files of other groups joins them: the groups become one and
  are combined together. A change that drops the only key tying two parts of a group splits it, and each
  part is combined again.
- A file whose entry did not change but whose input to the combination did — its place in the scan
  order, its admission to the session read allow-list, the project it is credited to, a title read
  beside it — has its group combined again: the order decides which copy of a message is kept, and the
  rest reaches the rows and the lists.
- An entry the session page rebuilt (session-view C4) is a changed file for the next scan: its group was
  combined from the entry it replaced.
- Two groups' sessions with the same time keep the order one combination gives them, so the session
  list reads the same.
- A file that leaves the scan set takes its entry and its group's stored result with it, and the rest of
  its group is combined again.
- A group's stored result that does not read back, or that was combined under another combination
  (Implementation Decisions, Cache), is combined again from its files' entries with nothing parsed.
- Interface: no page, state, copy or control is added or changed — these rules decide where the cache
  lives and how much of it a scan combines, and the figures are the same (the prototype exemption,
  declared). No new point renders or loads external content (G14 holds).

## Implementation Decisions

- **Global preference and derived window**: the selected number is an app-owned preference. All
  chart entries consume one shared choice. Keep the selected totals-card identity separate from its
  resolved day count: the fourth card derives its window from the global span. Compute real amounts
  from effective usage rows under ADR-0025, never from the prototype's mock scaling. The span lives
  in the preferences alone, not in cached usage or archive structures; the accounting stamp and
  parser rules do not depend on it.

- **Accounting**: see ADR-0005/0006 (the sides' total formulas differ and must not be copied from
  one another) and ADR-0019 for the third side's onboarding rules. ccusage reads the Claude Code,
  Codex and Grok sides and has no Antigravity CLI reader; for Codex its figures match only on days
  whose rollouts carry no usage records.
- **Day usage shape**: a day's per-side figures are keyed by side (ADR-0020). The provider breakdown
  stays sparse — absence there means "no segment".
- **A new vendor**: a provider is inferred from the model name (ADR-0008), and adding a vendor adds
  an inference rule; the chart logic does not change. The side's identifying colour is that provider
  colour (ADR-0021).
- **Side badge colours**: the Claude badge takes the Anthropic hue (ADR-0021). The badge is a fill
  behind small bold text rather than the raw provider colour, so its pair is derived at the
  lightness and chroma of the existing pairs rather than picked by eye; the resulting text-on-fill
  contrast lands inside the range the other pairs already occupy. Side colours are
  **appearance-varying, not theme-varying** (CONTEXT.md's variable classes): a colour scheme changes
  the interface, not the data.
- **Usage rows are the one source every figure derives from** (ADR-0025). Windowing needs day × side
  × project × model at four-field grain, which the archive persists. Deriving every figure from one
  row set is also what makes G7 hold by construction.
- **Cache version bumps**: the store keeps per-file parse output, and each group's combined result
  with the combination it came from (Cache, below). A *structure* change to what is stored must bump the
  version, and a change to the combination must not: the results it would make stale are combined again
  from the stored entries with nothing parsed, while a bump makes every file parse again, so a bump for a
  combination change would force a full rescan for nothing.
- **Archive**: see ADR-0007 for its existence and grain, ADR-0026 for the conflict rule. The archive
  is the sole owner of the effective row set: each scan hands it the live rows and the scan anchor,
  and it returns the rows every figure derives from together with the archived-only days — no caller
  patches archive rows into live figures on its own. The accounting stamp is composed from the
  application version and the cache structure version. The persisted archive carries a format
  version, a stamp per (day, side) pair — the unit the rule judges, so every row of the pair carries
  it — the observed value of each retained pair, and the superseded values each with the pair they
  belonged to; an older format upgrades on read as C14 describes. The snapshot contract keeps the
  list of archived-only days, computed per day; the retained set never leaves the archive.
- **Restore**: a repository script, run by a developer, that reads a copy of the token store and applies
  C16 through the archive's own merge rather than by editing rows — the same aggregation the scan uses,
  combining the snapshot's entries as one scan set, so the restored rows are exactly what a scan of that
  data would have produced. It opens the copy so that nothing is written to it or beside it. It refuses
  a snapshot that is not a store of the current structure version, or that holds an entry that is not
  well formed (Cache, below), and says how many entries are not: a scan parses such an entry's file again,
  and a restore has no file to parse, so the rows of the other entries alone would write a day short
  of that entry's usage as an accepted change.
- **An archive a newer build wrote** (token-stats::REQ-005, token-stats::REQ-006): the archive
  admits a row's side against this build's set of agent sides as it reads the file, so a side is
  admitted from the build that adds it on. Rows outside it are held apart from the rows the conflict
  rule judges: they never enter the effective row set or the archived-only days, and every write
  puts them back as read; their pairs' stamps, observed and superseded values stay in the file,
  since nothing this build does touches a pair it never sees live. The figure derivation is not made
  to skip a side it has no bucket for: inside the process every row's side is typed, the archive
  file is the one place a side enters the figures untyped, and a derivation that skipped silently
  would hide a producer's mistake. A file of a newer format is held as not this build's to write:
  the archive returns the live rows as the effective set and refuses every write until the file on
  disk changes, judged again on the same re-read a restore relies on.
- **An archive file that fails** (ADR-0039): the merge reports whether its file failed rather than
  throwing, and a restore still throws. Writing leaves the rows the merge moved in memory and the
  recorded signature as they were, which is what keeps the next merge from reading the file back and
  lets it carry them to the next write. The notice crosses IPC as a command the main process answers
  true once in a run: it holds that state because a reload is a new renderer in the same run, and
  because the failure can come before the window subscribes, and each merge that succeeds before the
  notice is taken withdraws it. The window asks at mount, with each snapshot and on focus, and asks
  nothing while it has no focus. The notice stays out of the snapshot, which is saved with the
  display copy and would restore a failure from an earlier run. The archive, the preferences and the last
  run's version share one atomic write, which removes its temporary file
  when it fails; the display copy's asynchronous write does the same.
- **Codex usage sources**: see ADR-0027. The parser reads both sources in one pass and applies the
  usage boundary as it goes; the per-file aggregate keeps its list of per-event increments and the
  boundary index beside it, so that the replay stripping can stop at the legacy span — a shape change
  and a computation change, both of which bump the cache structure version under the rule below,
  and the version is part of the accounting stamp (C21). Reading a cold rollout puts a zstd decompression stream in front of the
  line reader; the byte offsets the question index records for it are offsets in the decompressed
  stream.
- **Segmentation and axis**: see ADR-0008/0009.
- **Cache**: incremental by file signature, kept in a SQLite store in the settings directory, opened
  through the runtime's built-in module by whichever engine runs the scan (Where a scan runs, below) and
  recording its own structure version (ADR-0044). It holds each file's entry under its path — its
  signature and its per-file aggregate — the de-duplication keys each entry carries, and each group's
  combined result with the combination it came from. In memory the engine keeps each file's signature
  and its group, never the aggregates; every read of an entry goes to the store. A group is the set of
  files linked, directly or through others, by a key they share: a Claude message's id with its request
  id, a Codex session id or the parent id a fork names, an Antigravity call's identity; a file with none
  is a group alone. A group's input is, file by file in scan order, its entry and what the scan adds to
  it — the project it is credited to, its admission to the read allow-list, a title read beside it — and
  a group whose input differs from the one its stored result came from is combined again; the scan's
  figures are the stored results summed (token-stats::CON-003). The combination a result came from is
  the application version in a packaged build; every run of an unpackaged build is a combination of its
  own, so its first scan combines every group again. Combining every group again reads the entries of one
  group at a time. **A structure change must bump the version number at the same time**, and within one version a shape check treats corrupt or drifted entries as a miss and
  recomputes. An entry is well formed when its signature is a string and its per-file aggregate has
  every field its side requires, each of the type it requires, every row of each of its lists
  included: as many elements as the row's type has, each a number, a string or `null` where that
  type has one; every read of an entry — a scan's, a
  session page's ([session-view](session-view.md) C4), a fork's parent lookup, the restore's (C16) —
  gets a well-formed entry or none. A Codex entry's resume state is not part of that: it is checked
  when a resume would use it, and one that fails costs that rollout its resume, never its entry. The
  signature is read before a file is parsed, so a file that grows while it is read
  shows as changed on the next scan. **A Codex rollout that only grew is parsed from where the last
  parse stopped**: its entry also keeps the inode, the size and the end of the last parsed line,
  with everything the parser carries from line to line, and a rollout with the same inode and a
  larger size resumes there. Codex's writer only appends to a rollout or replaces it by renaming a
  copy over the path, so a new inode, a size that did not grow, a cold rollout, or fifty resumes in
  a row (bounding an in-place edit nothing cheap can see) mean a whole parse. A resumed parse equals
  a whole parse. Claude and Grok files are parsed whole when they change: Claude's question filter
  needs the whole parent graph, and Grok's streams are small.
- **Where parsing runs**: the scan is planned on the thread that runs it (the next paragraph) — cache
  hits, resumes, whole parses — and the files that need parsing are parsed on a pool of worker
  threads (cores minus one, at most four), several at once; the results are then taken in scan order,
  because the cross-file deduplication keeps the first copy of a message and so the order is part of
  the result. Parse workers start when there is work and stop after ten idle seconds. One that fails
  or will not load hands its file back to the thread that runs the scan, so a failure costs time,
  never a file. The largest file alone bounds the time, so workers past four mostly cost memory. The
  pooled cache is identical, file by file, to one parsed without the pool. The session page's
  single-file rebuild parses on the thread that runs the scan.
- **Where a scan runs** (ADR-0043): on the scan worker, one worker thread kept for the run that owns
  the token store: the session walk, the registry and component reads, the planning, the pool of
  parse workers it starts, the aggregation, the store's writes and the single-file rebuild. The main
  process gives it the data roots and takes back the snapshot without its token figures, the usage
  rows, each project's sessions and the session read allow-list. The archive merge and every step
  after it stay on the main process, as does reading a project's detail. The worker starts each
  request as it arrives, and a scan gives way between its steps — the session walk, the registry and
  component reads, the token build — so a question-index read is answered while a scan waits for its
  parses and between two of its steps. After the worker has failed, the main process's own scanner
  starts from the store as the worker last left it.
- **Automatic refresh**: the triggers (focus + timer) run in the main process, and the scan they
  start on the scan worker; the cost of a rescan is absorbed by the incremental cache.
- **Antigravity usage** (ADR-0037): the databases are opened through the runtime's built-in SQLite
  module (available in Electron 43), under token-stats::CON-002. The records are decoded by field
  number against the descriptors embedded in agy 1.4.9, reading only the fields the side needs and
  skipping the prompt fields by their length prefix; a field the reader reads arriving in another
  wire type than its descriptor declares is a record that will not decode. The extraction script and
  the descriptor set stay with the research record so a drift can be re-checked. Within a database a
  call's three records are joined by identity — the step brings the time, the generator record the
  model; calls are de-duplicated across databases after the per-file results are combined, since
  identity spans databases (token-stats::REQ-003/AC-01), the first in scan order kept. The reads run
  on the parse workers like the other sides'. The scan's count of unreadable conversations travels
  with the snapshot as the side's own count, present only when not zero, and is saved with the
  display copy, so the notice is back at the next launch before the first scan. A conversation's
  cache entry is keyed by its path, the database's modification time and the log's presence,
  modification time and size — never the database's size, which a checkpoint leaves unchanged
  (measured) — and, since the entry also carries the conversation's session index
  (session-view::REQ-004), its transcript's modification time and size; a changed conversation is
  re-read whole, as agy rewrites and truncates rows in place. The per-file aggregate has this side's
  variant, so the cache structure version is bumped in the same change; the usage row carries the
  side, so the archive format is unaffected. The side joins the
  agent-side set (ADR-0020). Its models' provider is inferred from the model name (a Gemini model is
  Google's; a Claude model run through agy is Anthropic's, D3), and its side colour is the Google
  provider colour (ADR-0021).

## Out of Scope

- Dollar cost estimation. This stays out even though one side's records carry a real billing figure
  (not an estimate) — see ADR-0019: the other sides carry none, and a metric present on only one of
  them reads as breakage on the rest.
- An exact per-model split on the Codex side (currently an approximation at the level of the session's
  primary model). The other sides are exact, so the per-model table mixes exact and
  approximate figures without saying which is which; this asymmetry is known and accepted.
- Sessions from before this application first ran that the agent has already cleaned up (unrecoverable).
- Telling a correction from a loss by magnitude. The stamp is the only discriminator (ADR-0026);
  no threshold, however chosen, distinguishes a 30% fix from a 30% loss.
- Detecting an agent's format change on its own. The archive reacts to what the figures do, not to
  why; recognising a rewritten record format is the parsers' job.
- Marking a compacted window or a compacted session anywhere in the interface: past days are
  protected by the archive, and a session-level marking is a session-view design question that needs
  a prototype.
- ccusage alignment for rollouts carrying usage records (ADR-0027): the third-party meter reads only
  the legacy events and is expected to read lower on those days.
- A cap on superseded values (revisited if the archive file passes about 5 MB, C13).
- A standing state or a repeated notice while the archive's file fails (ADR-0039): the notice is one
  toast a run.
- Restoring history on a machine that never had it: the restore script works from a cache snapshot
  of this application's own making, and no such snapshot exists on a machine whose agent rewrote
  its records before this application ever scanned them.
- An arbitrary or custom date range. There are four card roles; the fourth follows the fixed
  30/60/90 choices. A date picker is a different control
  with different questions (what does it do to the daily chart, what does it do to a range with no
  data, does it persist), and these card roles answer the question that prompted this —
  "what have I burned lately" — without any of them.
- Sub-day granularity. "Today" is as fine as the windows go, because a day is as fine as the source
  records are cut for aggregation; an hourly window would have to re-derive from timestamps that the
  aggregation deliberately collapses.
- Viewing session contents: not part of this feature (see [session-view](session-view.md)).
- Gemini CLI as a side (ADR-0037 option 2: deferred until usage through a paid Gemini API key or an
  enterprise licence needs counting, when it would be a fifth side), and the Antigravity desktop app's
  and IDE's data roots (ADR-0037 option 3).
- agy's own cost and credit figures: not read, for the reason F4 gives.
- Normalising Antigravity model names, or mapping agy's opaque model enumeration to names
  (ADR-0037 option 7).
- Recovering usage that a rewind deleted before any scan saw it: the database no longer holds it, and
  the transcript's token fields carry no model and no call identity.
- Refreshing more often than E1's triggers, or watching the agents' data directories for changes
  (ADR-0043 option 6): every scan marks every saved page stale and changes the display copy, and a
  focus refresh that does not hold up the window already brings the figures up to date when they are
  about to be read.
- A memory threshold for a build's first launch, which imports the JSON cache (C26) or combines every
  group again, for a development run, or for the window's own process: token-stats::QR-003 holds the
  main process of a packaged build from its second launch on.
- Keeping the rollouts' first-line readings from one run to the next: it needs a file of its own or a
  new cache structure version, and a new version moves the accounting stamp (C10).
