# Subagents view

> Related: [features](../features/subagents-view.md) · ADR-0001 (single type source) · ADR-0002 (dual seam)

## Problem Statement

Both agent sides support custom subagents (specialised assistant definitions), but the definitions
live in two different directories in two different formats (Claude's markdown + frontmatter, Codex's
toml), and a project level can override the user level. A user has no way to know "which assistants
are defined on this machine" or "which definition actually applies in this project".

## Solution

Add a Subagents section to both the global page and the project detail page: the global page merges
both sides into one column to see everything, and the detail page shows the effective view with the
shadowing relationships; clicking an entry opens a drawer with the full definition as written.
Everything is read-only.

## User Stories

1. As a user, I want to see all subagents from both sides on the global page (one merged column, with
   both-side badges), so that I know which specialised assistants are defined on this machine.
2. As a user, I want to click an entry to see the full definition (including the system prompt /
   developer_instructions) and metadata, so that I can see its persona and tool surface.
3. As a user, I want an entry present on both sides to switch sides inside the drawer, so that I can
   judge whether the two sides' configurations are equivalent (no machine diff signal is offered —
   the formats differ, so a diff would be tautologically true).
4. As a user, I want the effective view in project detail (project-level / global-level, with
   shadowing labelled), so that I know which definition actually applies in that project.
5. As a user, I want a Codex custom name colliding with a built-in (default/worker/explorer) to be
   labelled "overrides built-in", so that I know the built-in behaviour has been replaced.
6. As a user, I want a missing directory, corrupt file or unreadable file to degrade to an empty state
   or a label rather than crashing or silently disappearing, so that the viewer opens on any machine
   and its signals can be trusted.

## Failure modes and boundaries

**Sequence A: global page → Subagents section**
- A1 Neither side's agents directory exists or both are empty → empty-state copy, no crash.
- A2 Codex toml fails to parse (corrupt) → that entry shows a "parse failed" label (with the filename
  as a placeholder), and the rest behave normally.
- A3 Codex toml has no valid `name` → marked an invalid definition (Codex itself does not load it).
- A4 Claude markdown with no frontmatter or no description → the filename becomes the name, missing
  fields are left blank.
- A5 The same name on both sides (key: Claude = filename, Codex = the toml `name` field) → merged onto
  one row with both side badges, with the drawer showing each side's source; no `differs` field.
- A6 A definition file over 200 KB → truncated for display.
- A7 Source containing malicious HTML → goes through the existing sanitising render pipeline
  (regression point: the PR #10 rules).
- A8 The file exists but cannot be read (permissions / IO) → the entry stays with an "unreadable"
  label, and **does not silently disappear** — silently disappearing would pollute the same-name
  shadowing judgement (the Claude side's key is the filename, which still takes part; on the Codex
  side the name is unknowable, so only its existence is listed).
- A9 Two files in one layer with the same Codex `name` → the first wins (by filename order, matching
  `agent_roles.rs`, which skips later duplicates within a layer).

**Sequence B: project detail → Subagents section**
- B1 The project has no `.claude/agents` / `.codex/agents` → only the global effective entries are
  listed.
- B2 Claude same name: the project level shadows the global one (shadows/shadowed).
- B3 Codex same name: the project level shadows the user level (confirmed at source level —
  `agent_roles.rs` overrides by config layer, Project=25 > User=20) — **the opposite of Codex skills'
  same-name coexistence semantics**, so the implementation comments must be written per component.
  Known simplification: field-level backfill (a project-level entry inheriting a missing description
  from the user level) is not modelled.
- B4 A Codex custom name ∈ {default, worker, explorer} → an "overrides built-in" badge; the built-ins
  themselves are not on disk and get no entry.
- B5 A stale project → reading the project-level directory naturally yields nothing, and the global
  entries display as usual.

**Cross-cutting regression points**
- R1 The IPC contract (`validate`) must be extended along with any new domain type field — forgetting
  means the boundary passes silently (the same lesson as the cache-crash postmortem; listed as a
  review checklist item).
- R2 Snapshot size: subagent source text enters the snapshot; at this machine's scale (single-digit
  file counts × a 200 KB cap) that is acceptable and no lazy loading is done.

## Implementation Decisions

- **Types**: the merged global entry (with per-side source text and fields) and the effective-view
  entry (reusing the shadows/shadowed semantics) are modelled separately, sharing a per-side detail
  structure. ADR-0001's single type source, with contract validation extended in step.
- **Read layer**: injected through `ScanRoots` (so it can be fixtured); Codex toml is parsed with
  **smol-toml**, never with a regex.
- **Container structure (prototype ruling)**: a full-width list; clicking a row **opens the drawer
  directly** (metadata key-values + source; the both-sides switch lives inside the drawer and
  refreshes in place without closing; Esc and clicking the overlay are equivalent). Rejected:
  master-detail two-column (compresses the list's information density) and "inline metadata expansion
  + overlay" (the expansion is a redundant stop on the way to the drawer).
- **Sorting**: project level first, then by name within each group (as with skills).

## Testing Decisions

Following ADR-0002's dual seam, adding nothing new: (1) `ScanRoots` fixture unit tests at the
providers layer (covering the failure mode table: corrupt toml, missing name, duplicate names within
a layer, unreadable files, the shadowing judgement); (2) the contract validation round trip. The
standard for a good test: exercise only the reader's external behaviour (fixture directory → domain
entries), not its internal parsing functions. Unreadable files use a `chmod 000` fixture, explicitly
skipped when running as root.

## Out of Scope

- All write operations: creating, editing or deleting subagents.
- Codex shadowing's field-level backfill semantics.
- Subagent-level private memory directories (belongs to the memory-view spec's Out of Scope).
- Enumerating built-in subagents (not on disk, no source to read).
