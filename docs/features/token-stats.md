# Token statistics

> Related decision: ADR-0005 (accounting aligned with ccusage) · ADR-0019 (the Grok side's rules) · ADR-0021 (side colour)

## Overview

"Which project is burning my quota, and what has it been burning lately" had no ready answer. This
feature aggregates every side's session records into a project-level and a global view, whose numbers
share a source and reconcile against each other.

## Capabilities
- Project overview (the default landing spot inside a project): a cumulative total card (accounting
  aligned with ccusage — the Claude total sums all four fields including cache reads and writes;
  Codex and Grok are input + output + cache writes, since their reported input already includes
  cached reads), a 30-day daily trend (local time zone; in combined mode
  each bar is stacked by provider, with bar height = that day's total and segments = each provider's
  share, and hovering shows each provider's number and percentage; the legend lists only providers
  that appear; a single side can be selected), a per-model breakdown, and a session list (side badge,
  title, tokens, relative time)
- The trend chart's date axis labels data days only (days with usage under the current view), with
  labels aligned to their bar: the first one and any month change show "M/D", the rest show the day
  number alone; after switching to a single side the labels follow that side's data days; when the
  window is too narrow, labels thin automatically (dropping every other adjacent day), and at any
  width they never overlap, clip, or spill outside the chart
- The Agents page's Token section: the same large trend chart and model breakdown, across projects;
  the totals include stale projects and say so
- Subagent consumption counts toward the statistics but does not appear in the session list;
  double-billed lines (a subagent replaying its parent's messages) are deduplicated automatically
- The statistics cover every session in the agent data directories — including historical projects
  already cleared from the registry (counted globally, not listed separately)
- History archive: every refresh files away that day's aggregate, so the historical trend survives
  Claude Code cleaning up old session files; archived spans are drawn as hatched bars with a note
- Projects with no sessions show zeros and an empty state rather than an error

## Boundaries and non-goals
- The Codex per-model breakdown is an approximation at the level of the session's primary model;
  the Claude and Grok breakdowns are exact (Grok lists the model that was actually billed)
- Grok sessions are metered in every total and trend, but do not yet open in the session list or
  session viewer
- No dollar cost estimation
- The archive can only accumulate from the first day this application ran; sessions older than that
  and already cleaned up cannot be recovered
- Viewing session contents is not part of this feature (see [Session view](session-view.md))
