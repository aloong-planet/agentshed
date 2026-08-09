# Project list

> Related: [features](../features/projects-list.md) · ADR-0002 (dual seam)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01 — the requirements and boundaries were inferred from features, the existing
> test cases and the code's behaviour, since the original reasoning was lost with `.scratch/`. The
> boundary entries all have corresponding tests and are trustworthy; where one conflicts with the
> implementation, the implementation wins and this document is rewritten in place.

## Problem Statement

Projects are scattered across two agent registries (Claude's `projects` key in `~/.claude.json`,
Codex's `[projects.*]` in `config.toml`), so "see all the projects I have" means digging through two
sets of configuration, and the same directory is recorded once on each side.

## Solution

Take the union of both registries, one directory to one project with both side badges side by side,
sorted by activity; provide search, side filtering, stale filtering and hiding — all of which are
this app's browsing preferences and are never written back to any agent configuration.

## User Stories

1. As a user, I want the same directory registered on both sides merged into one entry marked with
   each side, so that I do not have to dig through two configurations and do not see duplicates.
2. As a user, I want the default sort to be activity (most recent session time) with the relative
   time and session count shown, so that what I have been working on lately is at the top.
3. As a user, I want to search by name or path and filter by agent side, so that I can find things
   quickly when there are many projects.
4. As a user, I want stale projects (in the registry, directory deleted) collapsed by default but
   revealable, so that the list stays clean without losing the cleanup lead.
5. As a user, I want to hide projects I do not care about and restore them, so that long-unused
   projects do not clutter my browsing — and this preference must not pollute the agent configuration.
6. As a user, I want a scanning state rather than an empty list before the scan finishes, so that I do
   not mistake "not scanned yet" for "no projects".

## Failure modes and boundaries

**Sequence A: startup scan → list rendering**
- A1 Neither side's data directory exists → an empty snapshot with `detected=false` on both sides, no
  throw.
- A2 Only one side exists → `detected=true` for that side, with the other's empty state alongside.
- A3 One side's registry JSON/TOML is corrupt → that side degrades to empty with an error
  explanation, and **the other behaves normally** (a single-side failure does not clear the whole
  table).
- A4 The same directory is registered on both sides → merged into one entry with both badges.
- A5 Trailing-slash or casing differences in the path → normalised, producing no duplicates.
- A6 A registry record whose directory has been deleted → marked stale, and does not vanish from the
  list.

**Sequence B: activity computation**
- B1 The Claude side counts `*.jsonl` under the encoded directory, taking the largest mtime as the
  most recent session time.
- B2 The Codex side reads a rollout's first line `cwd` for project attribution; an oversized first
  line (measured up to 42 KB) must still be readable.
- B3 Codex subagent threads do not count toward the session count and do not push the most recent
  time up.
- B4 A corrupt rollout first line → skip that file, no throw, and no effect on the other sessions in
  the same directory.
- B5 A project with no sessions → count 0, most recent time null (sorted last, not an error).
- B6 Sessions on both sides → the count is the sum of the union and the time is the larger of the two.

**Sequence C: filtering and hiding**
- C1 Search, side filtering, stale filtering and hiding all **stack**, never overriding one another.
- C2 The hidden state lives in this app's own storage and is **never written to any agent
  configuration** (uninstalling this app does not affect the agents).
- C3 Hidden projects collect under their own entry point with a count, expandable to restore.
- C4 Repeat clicks on global refresh while one is in flight are ignored (deduplicated, no concurrent
  scans).

## Implementation Decisions

- **Merge key**: the normalised path is the unique key (trailing slash and casing normalised), taking
  the union of both sides; one directory, one entry.
- **Activity**: Claude uses a `readdir` of the encoded directory (without parsing contents), Codex
  attributes by the rollout's first-line `cwd`; subagent threads are excluded.
- **Hidden state storage**: this app's own storage, physically isolated from the agent configuration.
- **Refresh**: global refresh is shared by both dimensions, with in-flight deduplication.

## Testing Decisions

Following ADR-0002's dual seam: `ScanRoots` fixture unit tests at the providers layer cover the
registry union, corruption degradation, path normalisation, activity attribution and subagent
exclusion; UI interactions (stacked filters, the hidden entry point) are not unit tested and rely on
e2e and manual testing.

## Out of Scope

- Live file watching: data only updates on the startup scan and manual refresh.
- Adding or removing project registrations from this app (the registries are read-only).
- Cross-project content search.
