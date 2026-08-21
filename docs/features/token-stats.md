# Token statistics

> Related decision: ADR-0005 (accounting aligned with ccusage) · ADR-0019 (the Grok side's rules) · ADR-0021 (side colour) · ADR-0025 (one source for every figure)

## Overview

"Which project is burning my quota, and what has it been burning lately" had no ready answer. This
feature aggregates every side's session records into a project-level and a global view, whose numbers
share a source and reconcile against each other.

## Capabilities
- A time window row at the top of both the Agents page and the project overview: four cards — total
  over all history, today, the last 7 days, the last 30 days — each showing that window's total, and
  **clicking a card selects the window**. Everything the window governs moves together: each side's
  figure, the composition bar, the highlighted span of the trend chart, and the per-model breakdown.
  All history is the default; the selection survives switching tabs (and, in a project, switching
  projects) and is not kept across restarts. "Today" means the day of the last scan, the same day as
  the trend chart's last bar.
- A composition bar under the totals, cutting the selected window's total into three parts that mean
  the same thing on every side: cache reads (blue), uncached input (yellow — cache writes are counted
  here, as the legend's hover text explains), and generated output (green). The three always sum to
  the total; each part's percentage and absolute figure are in the legend, since on real data the
  smallest part is a fraction of a percent; a part at exactly zero draws nothing.
- Accounting aligned with ccusage — the Claude total sums all four fields including cache reads and
  writes; Codex and Grok are input + output, since their reported input already includes cached reads
  and neither side reports cache writes at all; a turn the agent reports more than once is counted
  once
- A 30-day daily trend (local time zone; in combined mode each bar is stacked by provider, with bar
  height = that day's total and segments = each provider's share, and hovering shows each provider's
  number and percentage; the legend lists only providers that appear; a single side can be selected).
  The chart's own span stays 30 days whatever time window is selected: days outside the window are
  dimmed rather than removed, and the legend says so. The side filter and the time window compose —
  neither resets the other.
- The trend chart's date axis labels data days only (days with usage under the current view), with
  labels aligned to their bar: the first one and any month change show "M/D", the rest show the day
  number alone; after switching to a single side the labels follow that side's data days; when the
  window is too narrow, labels thin automatically (dropping every other adjacent day), and at any
  width they never overlap, clip, or spill outside the chart
- A per-model breakdown scoped to the selected window, its heading naming the window; a window with
  no usage shows an empty state instead of bars
- The Agents page's side cards each carry that side's figure for the selected window, next to what
  that side has installed; the project overview lists the same per-side figures in a row of its own.
  A side with no usage in the window reads 0 while still reporting whether it was detected — the two
  facts are independent
- Every side is identified by one colour wherever it is named — badge, legend swatch, chart segment —
  and that colour is its provider's: Claude Code wears the Anthropic orange, not the interface's
  purple
- Subagent consumption counts toward the statistics but does not appear in the session list;
  double-billed lines (a subagent replaying its parent's messages) are deduplicated automatically
- The statistics cover every session in the agent data directories — including historical projects
  already cleared from the registry (counted globally, not listed separately)
- History archive: every refresh files away that day's aggregate, so the historical trend survives
  Claude Code cleaning up old session files; archived spans are drawn as hatched bars with a note, and
  on the Agents page their usage counts inside every figure a time window reports — the totals, the
  composition and the model breakdown included
- Projects with no sessions show zeros and an empty state rather than an error

## Boundaries and non-goals
- The four windows are fixed; there is no custom date range, and nothing finer than a day
- A project's own page draws archived days as empty bars with the archived marking; their values join
  the cross-project figures only
- The Codex per-model breakdown is an approximation at the level of the session's primary model;
  the Claude and Grok breakdowns are exact (Grok lists the model that was actually billed)
- No dollar cost estimation
- The archive can only accumulate from the first day this application ran; sessions older than that
  and already cleaned up cannot be recovered
- Viewing session contents is not part of this feature (see [Session view](session-view.md))
