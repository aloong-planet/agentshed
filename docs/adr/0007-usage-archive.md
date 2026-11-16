# ADR-0007: Usage history archive

- Status: Accepted (2026-07-30)

## Context

Claude Code deletes session files older than its `cleanupPeriodDays`, 30 days by default, while Codex does not clean up
on its own. A figure computed from the session files present at scan time loses every day whose files are gone, and
every tool that scans those files, ccusage included, loses the same days. Session transcripts hold sensitive content
and grow by megabytes a day.

## Options

1. **Persist usage rows per day × side × project × model on the app side, and take a day's figures from them once its
   source files are gone** — chosen.
2. Raise `cleanupPeriodDays` and keep no archive — rejected: it only defers the loss, and session files cannot grow
   without limit at megabytes a day, against an archive of a few dozen rows a day.
3. Copy the session files into the app's own directory — rejected: it doubles their disk footprint, and copying
   sensitive transcripts widens their exposure.
4. Store day × side only — rejected (the user's ruling): a fine grain can be aggregated up but a coarse one cannot be
   split down, and a project's history or a model's share over time needs the fine one.

## Decision

We adopt **option 1**: the app keeps its own usage rows at day × side × project × model, and an archived-only
(day, side) takes its figures from them. How a live (day, side) is reconciled with what the archive holds is
ADR-0026's.

## Consequences

- Positive: history no longer disappears with the agents' cleanup, and the archive stays small, a few dozen rows a day.
- Negative: history an agent deleted before the app's first scan on a machine cannot be recovered (token-stats Out of
  Scope).
- Negative: an archived-only (day, side) keeps the accounting rules in force when it was written, since its source
  files are gone and it cannot be computed again.
- Neutral: a day no side's files still cover is marked as archived in the interface (token-stats C9), so it is not
  taken for live data.

## Sources

Measured on this machine, 2026-07-30: the 1674 files in `~/.claude/projects`, with `cleanupPeriodDays` unset, covered
only the 38 days from 2026-06-23, while Codex's data went back to 2026-02; Claude Code's session files grew about 4 MB a
day (about 1.5 GB a year), against an archive of a few dozen rows a day, under 2 MB a year. The "33 days vs 81 days"
discrepancy of the ccusage reconciliation. ADR-0026; token-stats C9 and Out of Scope.
