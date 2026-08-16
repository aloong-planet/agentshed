# Agents overview

> Related: [features](../features/agents-overview.md) · ADR-0001 (single type source) · ADR-0002 (dual seam)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01. Each section's component-level requirements and boundaries live in its own
> spec (subagents-view / memory-view / plugins-view / token-stats / skill-install); this document
> covers only **page-level** rules: which sections exist, the summary cards, and single-side
> degradation.

## Problem Statement

Users running several agent sides want to know, the moment the app opens, "what state is each
side in, how much has each burned, and what does each have installed". That information is scattered
across the sides' directory structures whose formats and concepts are not even symmetric (plugins, for
instance, exist only on the Claude side).

## Solution

As the default landing page, gather every agent side's global picture onto one screen: per-side
summary cards at the top and, below them, sections by component type
(Token/Skills/Subagents/Plugins/MCP/Memory/Configuration). Everything is read-only; the one write
operation is installing a skill into a project (see the skill-install spec). **This app's colour
theme (purple / mist blue / amber brown) is not configured in this page's Configuration section** —
see [appearance](appearance.md) (the rail's settings dimension).

## User Stories

1. As a user, I want to see every side's detection status and cumulative tokens on opening, so that I
   know each side's state at a glance.
2. As a user, I want each component type in its own section with the sides side by side inside it,
   so that I do not have to translate between two directory concepts.
3. As a user, I want one side's corrupt data to degrade to an error explanation on that side while
   the other carries on, so that a single-side failure does not make the whole page unusable.
4. As a user, I want a side that is not installed to show "not detected" rather than an error, so
   that someone using only one side can still use the app.
5. As a user, I want the totals' accounting (including stale projects) stated explicitly, so that
   when the numbers do not match I know where the difference is.

## Failure modes and boundaries

**Sequence A: page load**
- A1 Neither side detected → a whole-page empty state with guidance (which agent to install), not an
  error.
- A2 One side not detected → that side's card shows "not detected", the other behaves normally.
- A3 One side's registry corrupt → that side's card shows an error explanation (in place of the stats
  row), the other side is unaffected.
- A4 Scan not finished → a scanning state, not misleading empty sections.

**Sequence B: sections and accounting**
- B1 The set of sections = Token / Skills / Subagents / Plugins / MCP / Memory / Configuration; a new
  component type extends this list (ordered most-used first).
- B2 A summary card's secondary row shows that side's project count, global skill count and subagent
  count — using the same accounting as the corresponding section.
- B3 The Token totals **include stale projects** and say so explicitly (this differs from the
  project list's default filtering, and it has to be stated or the numbers will not reconcile;
  "hidden" left this rule with ADR-0022).
- B4 Sections where the sides' concepts are asymmetric (the Codex group under Plugins, the Codex
  global entry under Memory) follow their own spec's probe-style rules, and no false signal is
  manufactured for the sake of symmetry.
- B5 Configuration section: a missing file shows "none" rather than an error; oversized files are
  truncated.

**Cross-cutting**
- R1 Component-level boundaries live in each section's own spec and are not repeated here; adding a
  section means updating B1's list.
- R2 Global refresh is shared by both dimensions, and repeat clicks while one is in flight are
  deduplicated.

**Sequence G: the Grok side (ticket #126)**
- G1 Grok's own global skills (its skills directory) list alongside the other sides'; what it
  borrows from Claude Code's configuration at runtime never joins its lists — the exclusion is by
  construction (only its own root is read), and the Skills section carries one line of copy saying
  the borrowing happens (ADR-0019; the line is allow-listed in the side-enumeration gate as a
  statement about a real borrowing relation).
- G2 Agent definitions, plugins, memory and user-level MCP ship as explicit empty states: on the
  reference machine those categories have no real data (no directories, no config sections), and
  per CONTEXT's sampling invariant no parser is written from a documentation name alone. Each
  category's parser lands when a real sample exists; the feature catalogue states the gap.
- G3 The third summary card follows A2/A3 like the others; installing a Grok skill into a project
  lands in the project's own .grok/skills (the same copy semantics as the other sides).

## Implementation Decisions

- **Data source**: one scan produces the overview snapshot and every section consumes that same
  snapshot (no per-section rescans); the parts depending on the project registry (such as the Memory
  summary) are filled in once the project list is ready.
- **Contract**: the snapshot structure follows ADR-0001's single type source plus boundary
  validation; adding a section requires extending the validation at the same time (forgetting means
  it passes silently).
- **Degradation granularity**: degrade per side (a single-side failure does not affect the other),
  never fail the whole page.

## Testing Decisions

Following ADR-0002's dual seam: fixture unit tests at the providers layer cover single-side absence
and corruption degradation and snapshot assembly; the contract validation round trip; e2e covers that
switching through every section renders with no main-process errors (adding a section requires
updating the tab count assertion).

## Out of Scope

- Write operations on the global library / plugins / memories (the one write operation is installing
  a skill into a project).
- Cross-component aggregate views and global search.
- Live file watching (startup scan + manual refresh only).
