# ADR-0007: Usage history archive

- Status: Accepted (2026-07-30); the conflict rule is superseded by ADR-0026 (retention by
  accounting stamp, liveness per (day, side)) — the archive's existence and its row grain stand

## Context

Claude Code defaults to `cleanupPeriodDays: 30`, and session files past that age are deleted
automatically. Measured on this machine: the 1674 files in `~/.claude/projects` only cover the 38
days from 2026-06-23; anything earlier is already gone. By contrast Codex does not clean up
automatically, and its data goes back to 2026-02. Every statistics tool built on "scan all session
files right now" (including ccusage) loses history as the source files are cleaned — this is not a
capability problem, the data is simply gone.

## Options

1. **Persist daily aggregates on the app side (day × side × project × model), and fill the trend from
   the archive once the source files disappear**
2. Just raise `cleanupPeriodDays` and skip the archive — rejected: that only defers the problem, and
   at this machine's intensity session files run about 4 MB/day (~1.5 GB a year), so it cannot grow
   without limit; the archive is a few dozen lines a day, under 2 MB a year
3. Copy the session files into the app's own directory — rejected: it duplicates the same disk
   footprint, and session transcripts contain sensitive content, so copying widens the exposure
4. Store day × side only (the most minimal) — rejected (user's ruling): granularity can be
   aggregated up but not split down, so storing it finely now is what makes "this project's
   historical consumption" and "how this model's share changed" possible later

## Decision

We choose **option 1**, at day × side × project × model granularity. **Conflict rule**: for a day
whose source data this scan can still see (a live day), the live values **overwrite** the archive for
that whole day — so history corrects itself automatically after an accounting change or a bug fix
(as in this round's ccusage alignment); days whose source data is gone keep their archived values.
The UI marks archived spans with hatched bars and a note so they are not confused with live data.

## Consequences

- Positive: history no longer disappears with the agent's cleanup; accounting fixes retroactively
  correct the days still visible; the size is negligible
- Negative: the archive can only accumulate from the day it is enabled, so anything already deleted
  before June is gone for good; and archived spans keep whatever accounting rules were in force when
  they were written (the source files are gone, so they cannot be recomputed)
- Neutral: on the Codex side the four fields (input/output/cache) are apportioned by that day's
  ratios (the incremental events are already aggregated by day and there is no independent per-day
  source for the four fields), so the total is exact and the four fields are approximate

## Sources

Measurement on this machine (session file span, daily volume, `cleanupPeriodDays` unset); tracing
down the "33 days vs 81 days" discrepancy during ccusage reconciliation.
