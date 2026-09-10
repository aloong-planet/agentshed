# ADR-0027: Codex usage comes from usage records; ccusage is no longer the alignment basis for rollouts that carry them

- Status: Accepted (2026-09-10); supersedes in part the usage-source clause of ADR-0006

## Context

ADR-0006 aligned the Codex side with ccusage: per-turn usage is read from the `token_count` usage
event, with the cumulative rule of spec B7 dropping re-reported turns. Codex's paginated-history
format (rolled out to every rollout on this machine on 2026-09-09) adds a per-response accounting
record, `token_usage_record`, written by Codex itself: one per model response, keyed by response id,
never copied into forks or subagent threads (`spawn.rs`), persisted in every history mode
(`policy.rs`), and carrying the response's usage beside the turn's and the thread's running totals.
In paginated mode the usage event is no longer replayed into child threads either, and the event
itself is documented upstream as best-effort.

Full enumeration of this machine's 1391 rollouts (2.76 GB, 2026-09-10): 345 carry both sources,
interleaved per turn; 1032 carry usage events only; the record's payload has exactly one key set
(5029 of 5029). Over the span from each rollout's first record, records deduplicated by response id
and events under B7 sum to the same figure in 328 rollouts; in 17 the events sum lower, by up to 2.9%
of a session (the cumulative rule drops a real response whose running total did not advance); in none
do the records sum lower. No response id repeats; no record names another thread. Only 2 rollouts
carry usage events before their first record — 1.69 B tokens that exist nowhere else. ccusage
(`main` at 2026-09-09) reads only the usage event and has no notion of the record.

## Options

1. **Usage records from the first record on, deduplicated by response id; usage events before it
   under B7; the boundary by line order; ccusage kept as the alignment basis only for data without
   records** — chosen.
2. Stay on the usage event with the cumulative rule (ccusage's reading) — rejected: it demonstrably
   drops real responses (17 of 345 rollouts), the event is best-effort by its own documentation, and
   it is no longer replayed, so the replay-stripping that justified matching ccusage's replay rules
   has nothing to act on in paginated children.
3. Usage records only, discarding the event everywhere — rejected: 1032 rollouts have no record, and
   two rollouts hold 1.69 B tokens of legacy usage before their first record; the event is the only
   source for both.
4. The thread's running total from the last record as the session figure — rejected: it survives
   compaction only partially (255 M against 3.18 B for the largest compacted thread) and cannot be
   apportioned to days.
5. The boundary by timestamp rather than line order — rejected: identical selection on every
   dual-source rollout measured, and line order needs no rule for equal or out-of-order timestamps;
   the writer appends in order and the migration preserves it.
6. Comparing both sources per response and taking the larger — rejected: an accounting rule that
   depends on which of two sources happens to be present per response is not reproducible from a
   single source, and nothing measured shows the record lower.

## Decision

We adopt **option 1**. In a rollout the first usage record, by line order, is the **usage boundary**:
usage events before it count under the cumulative rule (B7), usage events from it on are ignored,
and usage records count once per response id. Fork and subagent replay stripping stays for legacy
children and finds nothing in paginated ones. ccusage remains the reconciliation baseline for legacy
rollouts only; for rollouts carrying records it is expected to read lower, and the reconciliation
reports such days as an expected divergence rather than a failure.

## Consequences

- Positive: the Codex figure is Codex's own accounting, exact per response, with no heuristic on
  the primary path; up to 2.9% of a session's usage that the cumulative rule dropped is counted;
  the legacy 1.69 B tokens keep counting; the rule reads from a single pass in line order.
- Negative: the per-file computation changes, so the cache structure version is bumped and every
  rollout is re-parsed once; the accounting stamp changes with it, and on a machine where a loss is
  retained (spec C21) the new stamp observes a moved figure and accepts it — this machine's restore of
  2026-08-11 … 2026-09-08 has to be re-applied once after this lands; the day-by-day parity with
  ccusage no longer holds on days with record-bearing rollouts, so the reconciliation loses part of
  its coverage.
- Neutral: the model still comes from `turn_context`; the four-field grain and the archive are
  untouched; a compacted window's usage is lost upstream and no source restores it (spec B11).

## Sources

The full enumeration and the two-source measurement of 2026-09-10 (this machine, every rollout);
`codex-rs` at the 2026-09-09 tree — `protocol` `TokenUsageRecord` (tur_def.rs:2249),
`core/agent_control/spawn.rs` (records never inherited at line 104, paginated children drop the
usage event at 1008–1018), `rollout/policy.rs` (records persisted in every history mode); the
research comments on the incident ticket of 2026-09-09; ADR-0006; spec token-stats sequence B.
