# ADR-0027: Codex usage comes from usage records; ccusage is the alignment basis only for rollouts without them

- Status: Accepted (2026-09-10)

## Context

Codex's paginated history format writes `token_usage_record`, its own per-response accounting record, beside the
legacy usage event: one per model response, keyed by response id, never copied into a fork or subagent thread and
persisted in every history mode, while in that format the usage event is no longer replayed into child threads and is
documented upstream as best-effort. On this machine's data the two sources agree in most rollouts carrying both, the
events read lower in some, and a few rollouts hold usage events before their first record that exist nowhere else.
ccusage, the meter the figures reconcile against, reads only the usage event.

## Options

1. **Usage records from the first record on, deduplicated by response id; usage events before it under the cumulative
   rule; the boundary by line order; ccusage the alignment basis only for data without records**
2. Stay on the usage event under the cumulative rule, ccusage's reading — rejected: it drops real responses, the event
   is best-effort by its own documentation, and paginated children carry no replay for ccusage's replay rules to act on.
3. Usage records only, discarding the event everywhere — rejected: most rollouts carry no record, and the usage some
   rollouts hold before their first record exists in no other source.
4. The thread's running total from the last record as the session's figure — rejected: it survives compaction only in
   part, and it cannot be apportioned to days.
5. The boundary by timestamp rather than by line order — rejected: it selected the same events on every dual-source
   rollout measured, and line order needs no rule for equal or out-of-order timestamps, since the writer appends in
   order and the migration preserves it.
6. Comparing both sources per response and taking the larger — rejected: a rule that depends on which source happens
   to be present for a response is not reproducible from either one, and nothing measured shows the record lower.

## Decision

We adopt **option 1**. In a rollout the first usage record, by line order, is the usage boundary: usage events before
it count under the cumulative rule, usage events from it on are ignored, and usage records count once per response id
(token-stats spec, B7 and B9). Replay stripping (ADR-0006) stays for legacy children and finds nothing in paginated
ones. ccusage remains the reconciliation baseline for rollouts without records; on a day carrying records it is
expected to read lower, and the reconciliation reports that day as an expected divergence rather than a failure.

## Consequences

- Positive: the Codex figure is Codex's own accounting, exact per response, with no heuristic on its primary path,
  and the responses the cumulative rule dropped are counted.
- Positive: the legacy usage before a rollout's first record keeps counting, and the rule reads in one pass in line
  order.
- Negative: day-by-day parity with ccusage no longer holds on days with record-bearing rollouts, so the reconciliation
  covers only part of the data.
- Neutral: a compacted window's usage is lost upstream, and no source restores it (token-stats spec, B11).

## Sources

The full enumeration of this machine's 1391 rollouts (2.76 GB) on 2026-09-10: 345 carry both sources, interleaved per
turn; 1032 carry usage events only; the record's payload has one key set (5029 of 5029). From each rollout's first
record on, records deduplicated by response id and events under the cumulative rule sum to the same figure in 328
rollouts; in 17 the events sum lower, by up to 2.9% of a session, because the rule drops a real response whose running
total did not advance; in none do the records sum lower. No response id repeats, and no record names another thread.
Two rollouts carry usage events before their first record, 1.69 B tokens. The largest compacted thread's last running
total reads 255 M against 3.18 B counted. `codex-rs` at the 2026-09-09 tree: `protocol`'s `TokenUsageRecord`,
`core/agent_control/spawn.rs` (records never inherited; paginated children drop the usage event) and
`rollout/policy.rs` (records persisted in every history mode). ccusage at `main` on 2026-09-09 reads only the usage
event. The research comments on issue #161.
