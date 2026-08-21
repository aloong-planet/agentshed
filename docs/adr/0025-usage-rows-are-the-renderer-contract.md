# ADR-0025: Usage rows are the one source every token figure derives from

- Status: Accepted (2026-08-21)

## Context

The token statistics reached the renderer as three pre-aggregated fields: a per-side total, a flat
per-model list, and a per-day list holding one scalar per side plus one per provider. Each was
computed by the aggregation step and each discarded a different part of the same underlying detail.

Adding a time window broke all three at once. A window needs the total, the per-side split, the
three-bucket composition and the per-model breakdown **for an arbitrary span of days** — and none of
the three fields can answer that: the per-day field has no model and no buckets, the per-model field
has no day, and the per-side field has neither.

The reflex was that this required collecting more data, changing the cached parse shape, bumping the
cache version and forcing a full rescan. That turned out to be wrong. The aggregation step already
builds, on every run, a row per **day × side × project × model** carrying all four token fields — it
has to, because that is what the archive persists (ADR-0007). The three fields shipped to the
renderer were lossier projections of a row set that already existed and was already being written to
disk.

## Options

1. **Ship the rows; let the consumer aggregate** — one source, every projection derived
2. Keep the projections and add a fourth pre-aggregated field per window — rejected: four windows ×
   four figures is sixteen precomputed answers, and the next window or the next figure adds a row or a
   column to that grid. It also freezes the window set into the main process, so a UI decision would
   travel through an IPC contract
3. Keep the projections and add the missing dimensions to each — rejected: it multiplies the
   projections without removing the reason they disagree, and each still answers only its own
   question

## Decision

Option 1, with one deliberate softening found during implementation. The row set is the source, and
joins the wire contract; the three fixed projections **stay on the wire beside it**, derived from the
rows in a single shared function rather than accumulated in parallel with them. Deleting them from the
contract was measured against its own blast radius and rejected: some fifty existing assertions and
every whole-history view read the projections, and what the defect actually required was not their
removal but a single derivation — two accumulators for one figure was the disagreement risk. The
window figures, which no fixed projection can answer, are derived from the rows at the point of use.

Sizing was measured rather than assumed, 2026-08-21 on real data: **378 rows, 67 KB serialised, 57
days covered, at most 20 rows on the busiest day.** Extrapolating the observed rate gives roughly
2,500 rows and under half a megabyte per year. The row set is small because its grain is a day, not
an event.

No cache version change is involved. The incremental cache stores per-file parse output, whose shape
is untouched; what changed is the combination step downstream of it, which re-runs on every build.
This is exactly the distinction the cache-version rule turns on, and getting it backwards in either
direction is costly — a missed bump serves stale structure, and a needless one forces a full rescan
for nothing.

## Consequences

- Positive: figures that must agree now agree **by construction** rather than by two code paths
  happening to compute the same thing. The previous arrangement had a live instance of this: an
  entry carrying no timestamp joined the per-side total but could not join any day, so the total and
  the sum of its days were free to differ silently. Measured before the change: zero such rows on real
  data, and the two sums matched exactly on all three sides — the change is neutral today and
  load-bearing the day it is not.
- Positive: the Codex per-day four-field split can become measured rather than apportioned by ratio,
  because the rows are built where the per-turn figures still exist. The apportionment rounded four
  times per day and the roundings did not cancel: 4 tokens of drift over 12.7B, negligible in
  magnitude and disqualifying in kind, since "the three buckets sum to the total" is the entire reason
  those buckets are the chosen cut.
- Negative: the renderer now holds aggregation logic that used to live in the main process, and
  aggregation logic is where accounting mistakes hide. The mitigation is that it is a pure function
  over rows, unit-testable at the same seam as the trend and axis functions, and that the identities
  it must preserve are asserted algebraically over every fixture rather than for hand-picked cases.
- Negative: payload size now grows with history rather than staying bounded by the window. At the
  measured rate this is under half a megabyte per year, but the growth is unbounded in principle,
  whereas the projections were not. The threshold at which this needs revisiting is a real number
  nobody has picked; it is named here so the next reader knows it is unpicked rather than fine.
- Neutral: the archive's row grain (day × side × project × model) stops being an implementation detail
  of persistence and becomes the shape the whole feature rests on. ADR-0007 chose that grain for
  survivability; it now also carries the window feature, and narrowing it later would break both.
