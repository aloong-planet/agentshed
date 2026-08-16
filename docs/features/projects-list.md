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
  search and the stale filter
- Stale projects (in the registry, directory deleted) are filtered out by default with a count shown;
  a toggle reveals them, struck through and marked "stale"
- Clicking a project name opens its detail page; the refresh button at the foot of the rail refreshes globally
  (shared by both dimensions; repeat clicks while one is in flight are ignored)

## Boundaries and non-goals
- No live file watching: data updates on the startup scan and on manual refresh
- No manual hiding: every registered project is listed (removed 2026-08-16, ADR-0022; projects hidden
  before then reappear)
- Before the scan finishes after opening, a scanning state is shown rather than a misleading empty
  list
