# Project list

> Related decisions: ADR-0019 (what a registry is, per side) · ADR-0021 (side colour)

## Overview
Projects are scattered across each agent side's own registry — Claude Code, Codex and Grok — so
"see all the projects I have" means digging through as many sets of configuration as there are
sides. This list takes the union of every side's registry, one directory to one project, sorted by
activity.

## Capabilities
- The same directory registered on several sides merges into one entry; trailing-slash and casing
  differences do not produce duplicates
- Each row carries a count of how many sides use that directory; hovering the count names the sides
  in full, each with its side colour
- Sorted by activity (most recent session time) by default, with the relative time shown on the
  row; sessions from every side count toward a project's activity, including a side that did not
  register the directory
- The search box filters by name or path; the agent side dropdown (All / Claude Code / Codex /
  Grok) narrows the list to one side and stacks with search and the stale filter
- Stale projects (in the registry, directory deleted) are filtered out by default with a count
  shown; a toggle reveals them, struck through and marked "stale"
- Clicking a project name opens its detail page; the selected row is marked by a deeper tint than
  the hover tint (no border ring), and adjacent rows stay visually separate even when a selected
  and a hovered row touch
- The refresh button at the bottom left refreshes globally (shared by both dimensions; repeat
  clicks while one is in flight are ignored)

## Boundaries and non-goals
- A directory an agent has sessions in but never registered is not listed for that side — the list
  shows registered projects, and its side count reflects registrations, not session presence
- No live file watching: data updates on the startup scan and on manual refresh
- No manual hiding: every registered project is listed (removed 2026-08-16, ADR-0022; projects
  hidden before then reappear)
- Before the scan finishes after opening, a scanning state is shown rather than a misleading empty
  list
