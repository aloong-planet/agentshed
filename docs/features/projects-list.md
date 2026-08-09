# Project list

## Overview
Projects are scattered across two agent registries, so "see all the projects I have" means digging
through two sets of configuration. This list takes the union of both registries, one directory to one
project, sorted by activity.

## Capabilities
- The same directory registered on both sides merges into one entry with both agent side badges side
  by side; trailing-slash and casing differences do not produce duplicates
- Sorted by activity (most recent session time) by default, with the relative time and session count
  shown on the row
- The search box filters by name or path; the agent side filter (all / Claude / Codex) stacks with
  search, the stale filter and hiding
- Stale projects (in the registry, directory deleted) are filtered out by default with a count shown;
  a toggle reveals them, struck through and marked "stale"
- Hovering a row reveals "Hide"; hidden projects collect under a "N hidden" entry point that expands
  to restore them. Hiding is a browsing preference of this app and is never written to any agent
  configuration
- Clicking a project name opens its detail page; ↻ at the bottom of the rail refreshes globally
  (shared by both dimensions; repeat clicks while one is in flight are ignored)

## Boundaries and non-goals
- No live file watching: data updates on the startup scan and on manual refresh
- Before the scan finishes after opening, a scanning state is shown rather than a misleading empty
  list
