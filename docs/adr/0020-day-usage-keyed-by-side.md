# ADR-0020: Daily usage is keyed by agent side, not by a field per side

- Status: Accepted (2026-08-15)

## Context

`DayUsage` — one day's row in the trend chart — carried one **literal field per agent side**
(`claude: number; codex: number`) alongside `byProvider`, which is an indexed map. Adding a third
side forces a choice that the same interface has already answered twice, in opposite ways: the
provider breakdown is indexed and sparse, the side breakdown is spelled out field by field. Whichever
way the third side goes, one of those two styles is the one future readers will copy.

## Options

1. **Index by side: `bySide: Record<AgentSide, number>`** — the union is the key type, so every side
   is required
2. Add a third literal field `grok: number` — rejected: the smallest edit, and consistent with what
   is written today, but it repeats the shape a third time and a fourth side repeats it again; worse,
   it leaves one interface carrying two styles for the same job, so the next author has to guess
   which one this codebase means
3. Index sparsely, `Partial<Record<AgentSide, number>>`, matching `byProvider` — rejected: the two
   maps are sparse or dense for a reason. A provider with no volume must produce **no segment**, so
   absence is meaningful there. A side is a closed enumeration whose filter control exists whether or
   not it has volume, so absence would only mean "the producer forgot", and the compiler could not
   tell that from "zero that day" — which is precisely the failure this change exists to prevent

## Decision

We adopt **option 1**. `DayUsage.bySide` is a total `Record<AgentSide, number>`: producers write an
explicit zero for a side with no volume that day, and the moment `AgentSide` grows, typecheck
enumerates every producer and consumer that has to answer for the new member. `byProvider` stays
`Partial` — the asymmetry is deliberate and is now recorded rather than left to be "tidied up".

## Consequences

- Positive: adding a fourth side becomes mechanical, and no producer can silently omit one — the
  failure mode this replaces is the one CONTEXT.md already records for `byProvider`, where the day
  total, the bar height and the legend all stayed correct while the segments inside the bar vanished.
- Positive: `UsageRow` already carries the side as a value rather than a field, so the archive format
  and `ARCHIVE_VERSION` are untouched by this change.
- Negative: every read site changes shape at once (`found[side]`, the global day accumulator, the
  trend builder and the chart), so the diff is wider than adding a field would have been, and it
  lands in code shared with the two existing sides rather than in the new side's parser.
- Neutral: producers now write zeros they do not otherwise mean, which is the price of letting the
  compiler enforce completeness.

## Sources

`src/shared/domain.ts` — the `DayUsage` definition and the note explaining why `byProvider` is
`Partial` and why its key type was tightened from `string`. The user's ruling of 2026-08-15 while
onboarding the third agent side (ADR-0019).
