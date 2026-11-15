# ADR-0025: Usage rows are the one source every token figure derives from

- Status: Accepted (2026-08-21)

## Context

Three pre-aggregated projections carry the token statistics to the renderer — a per-side total, a per-model list and a
per-day list of one figure per side and per provider — each discarding a different part of the same detail. A time
window needs the total, the per-side split, the three-bucket composition and the per-model breakdown for an arbitrary
span of days, which none of the three can answer: the per-day list has no model and no buckets, the per-model list no
day, the per-side total neither. The combination already gives a row per day × side × project × model carrying all
four token fields, which the archive persists (ADR-0007).

## Options

1. **Ship the usage rows and derive every figure from them** — chosen.
2. Keep the projections and add a pre-aggregated field per window — rejected: four windows × four figures are sixteen
   precomputed answers, and each new window or figure grows the grid. It also freezes the window set into the main
   process, so a UI decision travels through an IPC contract.
3. Keep the projections and add the missing dimensions to each — rejected: it multiplies the projections without
   removing the reason they disagree, and each still answers only its own question.
4. Remove the three projections from the contract, leaving the rows alone — rejected: every whole-history view reads
   them; the inconsistency is removed by a single derivation, not by deletion.

## Decision

We adopt **option 1**. The usage rows are the source every token figure derives from, and they are part of the
renderer contract. The three fixed projections stay in the contract beside them, derived from the rows by one shared
function and never accumulated in parallel with them. The window figures are derived from the rows where they are
used.

## Consequences

- Positive: figures that must agree agree by construction rather than by two code paths computing the same thing: a
  side's total and the windowed figures come from one row set (token-stats G7). An entry with no timestamp, for one,
  can no longer join a total while joining no day.
- Positive: the rows are built where the per-turn figures still exist, so a day's Codex four-field split is measured
  rather than apportioned by ratio (token-stats B8), and the three buckets sum to the total.
- Negative: the renderer holds aggregation logic, and aggregation is where accounting mistakes hide; it is a pure
  function over rows, and the identities it must keep are asserted over every fixture.
- Negative: the payload grows with the history rather than staying bounded by the window, without bound in principle;
  the size at which this needs revisiting is not picked.
- Neutral: the archive's row grain (day × side × project × model) is the shape the whole feature rests on, carrying
  the window feature as well as the survivability ADR-0007 chose it for; narrowing it would break both.

## Sources

Measured on this machine's real data, 2026-08-21: 378 rows, 67 KB serialised, 57 days covered, at most 20 rows on the
busiest day; at that rate about 2,500 rows and under half a megabyte a year. Before the rows: no entry without a
timestamp, each side's total equal to the sum of its days on all three sides, and the Codex apportionment 4 tokens
off over 12.7B. ADR-0007; token-stats G7, B8. The `TokenStats` definition in `src/shared/domain.ts` and the
derivations in `src/shared/usage.ts`.
