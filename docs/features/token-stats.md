# Token statistics

> Related decision: ADR-0005 (accounting aligned with ccusage) · ADR-0027 (Codex usage from its own records) · ADR-0019 (the Grok side's rules) · ADR-0021 (side colour) · ADR-0025 (one source for every figure) · ADR-0026 (a past day's figure never falls silently)

## Overview

"Which project is burning my quota, and what has it been burning lately" had no ready answer. This
feature aggregates every side's session records into a project-level and a global view, whose numbers
share a source and reconcile against each other.

## Capabilities
- A time window row at the top of both the Agents page and the project overview: four cards — total
  over all history, today, the last 7 days, and the last N days — each showing that window's total, and
  **clicking a card selects the window**. Everything the window governs moves together: each side's
  figure, the composition bar, the highlighted span of the trend chart, and the per-model breakdown.
  All history is the default; the selection survives switching tabs (and, in a project, switching
  projects); the active card is not kept across restarts. The fourth card's label and actual total
  follow the global 30/60/90-day choice even when another card is active. If the fourth card is active,
  its side figures, composition and model breakdown also follow that choice. The other three cards
  keep their meanings. "Today" follows the current local day, as does the trend
  chart's last bar. Time labels, windows and charts keep advancing while saved data is displayed,
  including across midnight and time-zone changes; observation times remain unchanged.
- A composition bar under the totals, cutting the selected window's total into three parts that mean
  the same thing on every side: cache reads (blue), uncached input (yellow — cache writes are counted
  here, as the legend's hover text explains), and generated output (green). The three always sum to
  the total; each part's percentage and absolute figure are in the legend, since on real data the
  smallest part is a fraction of a percent; a part at exactly zero draws nothing.
- Accounting: the Claude total sums all four fields including cache reads and writes; Codex and Grok
  are input + output, since their reported input already includes cached reads and neither side
  reports cache writes at all; a turn the agent reports more than once is counted once. Codex figures
  come from Codex's own per-response accounting records wherever a session carries them (its newer
  record format), and from the per-turn usage events before the first record and in sessions that
  have none — so a response the events under-report is still counted, and a session Codex forked or
  spawned in the newer format is counted from its own file alone. Alignment with ccusage holds for
  sessions without such records; where they exist the third-party meter reads lower
- A daily trend with inline **30 · 60 · 90** choices in its heading; the selected number is highlighted
  and each number supports mouse and keyboard activation (30 by default; local time zone; in combined mode each bar is stacked by provider, with bar
  height = that day's total and segments = each provider's share, and hovering shows each provider's
  number and percentage; the legend lists only providers that appear; a single side can be selected).
  Days outside the selected totals window are dimmed rather than removed, and the legend says so.
  Changing the span preserves the side filter and active totals card. One choice applies to the
  Agents page and every project, survives navigation and refreshes, and is remembered after quitting
  and reopening. Loading placeholders show the remembered choice with disabled buttons until data
  arrives. If saving fails, an error is shown and the open views keep the current choice; reopening
  restores the last successfully saved choice. Missing or invalid saved choices use 30 without
  resetting other valid preferences. Longer spans keep one bar per local calendar day, with smaller
  gaps and automatically thinned date labels.
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
- History archive: every refresh files away each day's aggregate, so the historical trend survives
  the agents cleaning up or rewriting old session files; archived spans are drawn as hatched bars
  with a note, and their usage counts inside every figure a time window reports — the totals, the
  composition and the model breakdown included — on the Agents page and on a project's own page
  alike, so the two pages agree about the same day
- A session Codex has compressed after a week of inactivity keeps counting exactly as before: its
  usage, model and day attribution do not change with the compression, and a compressed file the
  agent cut short is left out rather than counted in part (a cut that happens to land exactly on a
  line end is the one case that reads as a shorter session)
- A past day's figure never falls silently: when an agent's records for a past day shrink — rewritten
  by the agent, or deleted by hand — the day's figure is retained as it was counted before; only a
  correction that arrives with an application update replaces it. Today's figure is exempt and still
  moves with every refresh while sessions are being written
- Projects with no sessions show zeros and an empty state rather than an error

## Boundaries and non-goals
- There are four totals-card roles; the fourth follows the three fixed chart spans. There is no custom date range, and nothing finer than a day
- A retained day looks like any other day: nothing on screen marks it, and the smaller figure the
  records now hold appears nowhere
- Deleting session files by hand does not lower a past day's figure either — the application cannot
  tell a deletion from the agent's own cleanup, and keeps the day as counted
- The Codex per-model breakdown is an approximation at the level of the session's primary model;
  the Claude and Grok breakdowns are exact (Grok lists the model that was actually billed)
- No dollar cost estimation
- The archive can only accumulate from the first day this application ran; sessions older than that
  and already cleaned up cannot be recovered, and neither can history on a machine whose agent
  rewrote its records before this application ever scanned them
- Viewing session contents is not part of this feature (see [Session view](session-view.md))
