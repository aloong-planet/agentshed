# ADR-0006: Codex usage accounting: two data roots, per-turn increments by day, fork replay stripping

- Status: Accepted (2026-07-30)

## Context

Codex keeps rollouts under two roots, `sessions/` and `archived_sessions/`, and its legacy usage events carry each
turn's increment beside the session's running cumulative, with no model on the event. A fork or subagent rollout in the
legacy format begins by replaying its parent's events, and a session can span midnight. The figures must reconcile day
by day against ccusage.

## Options

1. **Align with ccusage's Codex adapter: read both roots; attribute each turn's increment to the day of its event; strip
   a legacy child's replayed prefix by matching it entry by entry, by value, against its parent's events before the
   fork point, falling back to the rewrite-burst heuristic when the parent is missing or the first entry does not
   match; count cached reads as cache read and take them out of input**
2. The last running cumulative as the session's figure — rejected: a session spanning midnight cannot be apportioned
   to its days, and a fork's replay is billed twice.
3. Summing the per-turn increments without stripping a fork's replay — rejected: the replayed prefix counts twice.
4. An official usage interface (not recorded; ruled out when scoping): the Codex CLI has no command that reports
   usage, which leaves the rollouts the only accounting path.

## Decision

We adopt **option 1**. Where usage events are the source (ADR-0027 says where), each turn's increment counts on the day
of its event, under the token-stats spec's Sequence B; a legacy fork or subagent rollout has its replayed prefix
stripped (the session-view spec says how). The model of a session is the one its last `turn_context` names, an
approximation of the session's primary model that the per-model view says it is.

## Consequences

- Positive: sessions spanning midnight are apportioned to their days, and a legacy child's replay is not counted twice.
- Positive: on days without usage records the figures reconcile day by day against ccusage.
- Negative: a session that switches model, such as one with a sub-thread on another model, has its usage put on one
  model.

## Sources

The ccusage source at `main` on 2026-07-30: `rust/adapters/codex/src/{paths,replay,parser}.rs`. Measured on 2026-07-30
against this machine's 208 rollouts and ccusage's figures: adding `archived_sessions/` took 2026-07-21 from 38.6M to
127.8M tokens (ccusage 127.5M); stripping fork replays took 2026-07-28 from 449M to 98.2M (ccusage 97.8M). On
2026-08-19, once re-reported turns counted once (spec B7), the day-by-day difference from ccusage was zero on every
side then onboarded. The day-by-day reconciliation `src/main/providers/ccusage-parity.test.ts`, run with `PARITY=1`.
