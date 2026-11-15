# ADR-0025: Usage rows are the one source every token figure derives from

- Status: Accepted (2026-08-21)

## Context

A time window needs the total, the per-side split, the three-bucket composition and the per-model breakdown for an
arbitrary span of days, and no pre-aggregated field can answer for a span it did not aggregate over. The aggregation
step already builds on every run a row per day × side × project × model carrying all four token fields, because the
archive persists exactly that (ADR-0007). Two figures that must agree are free to differ wherever two code paths
compute them.

## Options

1. **Ship the rows and let the consumer aggregate: one source, every projection derived from it**
2. Keep the projections and add a pre-aggregated field per window — rejected: four windows by four figures is sixteen
   precomputed answers that every new window or figure extends, and it freezes the window set into the main process,
   so a decision about the interface would travel through the IPC contract.
3. Keep the projections and add the missing dimensions to each — rejected: it multiplies the projections without
   removing the reason they disagree, and each still answers only its own question.
4. Ship the rows alone, deleting the three fixed projections from the contract — rejected: every whole-history view and
   some fifty assertions read them, and what the disagreement called for was a single derivation, not their removal.

## Decision

We adopt **option 1**. The row set joins the wire contract as the source, and the three fixed projections (per side,
per model, per day) stay on the wire beside it, derived from the rows by one shared function rather than accumulated
beside them. A figure no fixed projection can answer, such as a time window's, is derived from the rows at the point of
use.

## Consequences

- Positive: figures that must agree do so by construction, not because two code paths happen to compute the same
  thing; an entry with no timestamp, for one, can no longer join a total while joining no day.
- Positive: the Codex per-day four-field split is measured from the per-turn figures rather than apportioned by ratio
  (token-stats spec, B8).
- Negative: the renderer holds aggregation logic, where accounting mistakes hide. It is a pure function over rows,
  unit-tested at the same seam as the trend and axis functions, with the identities the interface leans on asserted
  there.
- Negative: the payload grows with history rather than staying bounded by the window, unbounded in principle where the
  projections were not. The size at which this needs revisiting has not been picked.
- Neutral: the archive's row grain carries the window feature as well as the archive's survival (ADR-0007), so
  narrowing it would break both.

## Sources

Measured on 2026-08-21 on this machine's data: 378 rows, 67 KB serialised, 57 days covered, at most 20 rows on the
busiest day; at that rate, about 2,500 rows and under half a megabyte a year, small because the grain is a day, not an
event. The `TokenStats` definition in `src/shared/domain.ts` and the derivations in `src/shared/usage.ts`.
