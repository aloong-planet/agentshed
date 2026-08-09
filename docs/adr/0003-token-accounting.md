# ADR-0003: Token accounting rules

- Status: Superseded by ADR-0005 (the total rule, the scan scope and deduplication were all
  redefined by 0005; subagent inclusion, counting hidden and stale projects, and the Codex model
  approximation remain valid and were carried forward by 0005)

## Context

The two sides' session data use different shapes: Claude attaches incremental usage to every
assistant message (with cache fields kept separate), whereas Codex only has a running **cumulative**
total within a session (where input includes cached), and Codex has no per-message model field.
The numbers have to be presented across both sides and be reconcilable against a common source.

## Options

1. **Total = input + output, with cache reads and writes listed separately and excluded; statistics
   include hidden and stale projects; subagent consumption counts but does not enter the session
   list; the Codex model split takes the model from the session's last `turn_context`
   (an approximation); days are cut in local time**
2. Have the totals follow the list filters (hidden projects excluded) — rejected: hiding a project
   would change "total consumption", which is a fact, and the cache would be invalidated by browsing
   state
3. Count cache reads as consumption — rejected: cache reads are of a different order of magnitude
   from real billing or load; mixing them in inflates the total by an order of magnitude and makes it
   meaningless
4. Convert to a dollar cost — deferred: the price table needs manual maintenance and the two
   vendors' billing models (subscription vs API, cache pricing) do not line up. Restart condition:
   a reliable price data source appears

## Decision

We choose **option 1**, accepting that the Codex model split is an approximation at the level of the
session's primary model (a cumulative total cannot be split precisely per model), with the UI
labelling it as approximate.

## Consequences

- Positive: the two sides' numbers are comparable, and the global and per-project views reconcile
  against a common source; the accounting does not drift with browsing state
- Negative: multi-model Codex sessions (e.g. a guardian sub-thread switching model) are split
  imprecisely; cache consumption has to be read separately
- Neutral: including Claude subagent transcripts (`<session>/subagents/`) was added during
  implementation after measurement (missed in the first version, fixed at review)

## Sources

Measurement against real data (the shape of the usage fields, the cumulative semantics of
`token_count`, the subagents directory); the spec's accounting clause (the user's 2026-07-30 ruling
of "count everything").
