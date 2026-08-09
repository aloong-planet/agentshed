# ADR-0006: Codex usage accounting (aligned with ccusage)

- Status: Accepted (2026-07-30)

## Context

The first version of the Codex statistics was **always zero**, because two parsing assumptions did
not match the real data: (1) the first line of a rollout contains embedded `base_instructions` — in
practice 206 of 208 files have a first line larger than 8 KB (largest 42 KB), so a fixed 8 KB buffer
truncated it, the JSON parse failed, and the whole session was discarded; (2) the real shape of a
token event is a top-level `type:"event_msg"` plus `payload.type:"token_count"` plus `payload.info`,
whereas the implementation matched a top-level `type:"token_count"` with a top-level `info`, which
**never hits**. On top of that, a whole session's cumulative total was recorded on its first day, so
sessions spanning midnight were attributed to the wrong day.

## Options

1. **Align with ccusage's codex adapter (at source level)**: two data roots, `sessions/` and
   `archived_sessions/`; attribute each turn's `last_token_usage` increment to the day of its event
   timestamp; for fork and subagent sessions find the parent via `forked_from_id` /
   `source.subagent.thread_spawn.parent_thread_id`, then strip the replay by **matching entry by
   entry by value** between the parent's event sequence before the fork point and the start of the
   child session; if the very first entry does not match, fall back to a "rewrite burst" heuristic
   (if the first two events are ≤1 s apart, skip forward to the first gap > 1 s); accounting-wise,
   sanitise input (subtract cached), count cached as cacheRead, and sum all four fields as the total
2. Take the last `total_token_usage` as the session total — rejected: sessions spanning midnight
   cannot be apportioned, and fork replay double-bills (measured: 2026-07-28 over-counted by 4.6×)
3. Sum per-turn `last` values but skip fork stripping — rejected: measured 4.6× over-count on
   2026-07-28 (449M vs 98M)
4. An official interface — (not documented at the time, excluded during scoping) the Codex CLI has no
   usage query command; the `token_count` events in the local rollout are the de facto accounting path

## Decision

We choose **option 1**. `archived_sessions` and fork stripping are both indispensable: adding the
former corrected 2026-07-21 from 38.6M to 127.8M (baseline 127.5M), and the latter corrected
2026-07-28 from 449M to 98.2M (baseline 97.8M).

## Consequences

- Positive: Codex went from "no data at all" to within ≤1.2% of ccusage day by day; sessions
  spanning midnight are apportioned correctly; fork and subagent replays no longer double-count
- Negative: a systematic ≤1.2% over-count remains — ccusage also handles speed/service_tier suffixes,
  the codex-auto-review fallback table, `response_item` events and other details we have not
  replicated (see the backlog)
- Neutral: the model name is taken from the last `turn_context` (an approximation of the session's
  primary model), which is imprecise for multi-model sessions

## Sources

The ccusage source (`rust/adapters/codex/src/{paths,replay,parser}.rs`, `main@2026-07-30`);
measurement against 208 rollouts on this machine; the day-by-day reconciliation script
`src/main/providers/ccusage-parity.test.ts` (run with `PARITY=1`).
