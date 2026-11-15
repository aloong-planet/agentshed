# ADR-0020: Daily usage is keyed by agent side, not by a field per side

- Status: Accepted (2026-08-15)

## Context

`DayUsage`, one day's row in the trend chart, carries a breakdown by agent side beside `byProvider`, an indexed map of
the providers that accrued tokens that day. The side breakdown can be spelled out as one field per side or indexed by
side, and whichever shape it takes is the one the next author copies. A producer that leaves a side out must not pass
unnoticed: when it happened to `byProvider`, the day's total, the bar's height and the legend stayed right while the
segments inside the bar vanished.

## Options

1. **Index by side: `bySide: Record<AgentSide, number>`, the union as the key type, so every side is required**
2. A literal field per side (`claude: number; codex: number; …`) — rejected: the smallest edit, but every new side
   repeats the shape, and one interface would carry two styles for the same job, leaving the next author to guess which
   this codebase means.
3. Index sparsely, `Partial<Record<AgentSide, number>>`, as `byProvider` does — rejected: a side is a closed
   enumeration whose filter control exists whether or not it has volume, so absence could only mean "the producer
   forgot", which the compiler could not tell from zero.

## Decision

We adopt **option 1**. `DayUsage.bySide` is a total `Record<AgentSide, number>`: a producer writes an explicit zero for
a side with no volume that day, and when `AgentSide` grows, typecheck names every producer and consumer that has to
answer for the new member. `byProvider` stays `Partial`, because a provider with no volume must produce no segment and
its absence is meaningful; the asymmetry is deliberate, not one to tidy away.

## Consequences

- Positive: adding a side is mechanical, and no producer can silently leave one out.
- Negative: a side's zero in a day row reads the same whether that side had no usage that day or has no agent on this
  machine, so a view that must tell the two apart has to ask elsewhere.
- Neutral: producers write zeros they do not otherwise mean, the price of letting the compiler enforce completeness.

## Sources

`src/shared/domain.ts`: the `DayUsage` definition, with the notes on why `bySide` is total and `byProvider` is
`Partial` with `Provider` as its key type. The user's ruling of 2026-08-15 while onboarding the third agent side
(ADR-0019).
