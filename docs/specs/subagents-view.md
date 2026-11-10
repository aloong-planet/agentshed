# Subagents view

> Related: ADR-0001 (single type source) · ADR-0038 (test layers) · ADR-0037 (Antigravity CLI side)

## Problem Statement

Both agent sides support custom subagents (specialised assistant definitions), but the definitions
live in two different directories in two different formats (Claude's markdown + frontmatter, Codex's
toml), and a project level can override the user level. A user has no way to know "which assistants
are defined on this machine" or "which definition actually applies in this project".

## Solution

Add a Subagents section to both the global page and the project detail page: the global page merges
the sides into one column to see everything, and the detail page shows the effective view with the
shadowing relationships; clicking an entry opens a drawer with the full definition as written.
Everything is read-only.

## User Stories

1. As a user, I want to see all subagents from every side whose definitions are read on the global page
   (one merged column, with side badges), so that I know which specialised assistants are defined on this machine.
2. As a user, I want to click an entry to see the full definition (including the system prompt /
   developer_instructions) and metadata, so that I can see its persona and tool surface.
3. As a user, I want an entry present on several sides to switch sides inside the drawer, so that I can
   judge whether the sides' configurations are equivalent (no machine diff signal is offered —
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
- A1 No side's agents directory exists, or all are empty → empty-state copy, no crash.
- A2 Codex toml fails to parse (corrupt) → that entry shows a "parse failed" label (with the filename
  as a placeholder), and the rest behave normally. Its detail line says so in a sentence in the current
  UI language, with none of the parser's text.
- A3 Codex toml has no valid `name` → marked an invalid definition (Codex itself does not load it).
- A4 Claude markdown with no frontmatter or no description → the filename becomes the name, missing
  fields are left blank.
- A5 The same name on both sides (key: Claude = filename, Codex = the toml `name` field) → merged onto
  one row with both side badges, with the drawer showing each side's source; the row does not flag whether the two sides
  differ.
- A6 A definition file over 200 KB → truncated for display.
- A7 Source containing malicious HTML → goes through the existing sanitising render pipeline.
- A8 The file exists but cannot be read (permissions / IO, or the directory form's directory cannot be
  entered) → the entry stays with an "unreadable"
  label, and **does not silently disappear** — silently disappearing would pollute the same-name
  shadowing judgement (the Claude side's key is the filename, which still takes part; on the Codex
  side the name is unknowable, so only its existence is listed).
- A9 Two files in one layer with the same Codex `name` → the first wins (by filename order, matching
  `agent_roles.rs`, which skips later duplicates within a layer).
- A10 An entry present on some sides but not on another shows that other side's badge dashed.
- A11 The drawer's metadata rows by side: tools and model on the Claude side; model and sandbox on the
  Codex side (the Antigravity side's rows are given in subagents-view::REQ-001's boundaries).

**Sequence B: project detail → Subagents section**
- B1 The project has no `.claude/agents` / `.codex/agents` → only the global effective entries are
  listed.
- B2 Claude same name: the project level shadows the global one (shadows/shadowed).
- B3 Codex same name: the project level shadows the user level (confirmed at source level —
  `agent_roles.rs` overrides by config layer, Project=25 > User=20) — **the opposite of Codex skills'
  same-name coexistence semantics**.
  Known simplification: field-level backfill (a project-level entry inheriting a missing description
  from the user level) is not modelled.
- B4 A Codex custom name ∈ {default, worker, explorer} → an "overrides built-in" badge; the built-ins
  themselves are not on disk and get no entry.
- B5 A stale project → reading the project-level directory naturally yields nothing, and the global
  entries display as usual.

**Cross-cutting regression points**
- R1 The IPC contract (`validate`) must be extended along with any new domain type field — forgetting
  means the boundary passes silently.
- R2 Snapshot size: subagent source text enters the snapshot; no lazy loading is done.

## The Antigravity CLI side

### subagents-view::REQ-001 Antigravity CLI subagents

Applies to: the Subagents section of the agents page and of project detail (ADR-0037; shapes measured 2026-10-28
with samples agy confirmed loading).

- subagents-view::REQ-001/AC-01: Global definitions are read from `~/.gemini/config/agents/`, in both
  forms agy loads: `<name>.md` and `<name>/agent.md`. Project-level definitions are read from
  `.agents/agents/<name>/agent.md`, the form sampled at that level.
- subagents-view::REQ-001/AC-02: A definition is Markdown with front matter: its name is the front
  matter's `name`, else the file's name (or, for the directory form, the directory's); its description
  is the front matter's; the drawer shows the definition as written (A6, A7).
- subagents-view::REQ-001/AC-03: A definition marked as not usable as a main agent is listed like any
  other: agy loads it, and only agy's own agent list leaves it out (measured).
- subagents-view::REQ-001/AC-04: On the agents page an Antigravity definition sharing its name with
  another side's is one row with both badges, the drawer switching sides (A5).
- subagents-view::REQ-001/AC-05: In project detail the project-level group is headed "Project level ·
  .agents/agents" and the global entries follow; Antigravity rows carry no shadowing badge, since
  whether a project-level name shadows a global one in agy was not observed, and a degraded judgement
  follows the target system's behaviour rather than an assumption (AGENTS.md).
- subagents-view::REQ-001/AC-06: Subagents bundled with an Antigravity plugin show inside that plugin's
  expansion ([plugins-view::REQ-001](plugins-view.md)), not in this section.

Failure modes and boundaries: a definition without front matter or without a name follows A4; one that
cannot be read stays with the unreadable label (A8); a file over 200 KB is truncated (A6); the
directory form without an `agent.md` holds no definition; a project-level flat `<name>.md` was not
sampled and is not read; a missing agents directory at either level yields an empty group, not an error
(A1, B1). Two definitions in one directory giving one name: the first in name order is listed (agy's
own choice was not measured; Codex's loader keeps the first within a layer, A9). A description written
as a YAML block scalar (`>-`, `|-`) shows its text, not the marker. The drawer's Antigravity rows are
tools, subagent, mainAgent and model, each "—" when absent: whether an agy subagent without a model
inherits the main one was not measured, so the drawer claims nothing.

## Implementation Decisions

- **Read layer**: Codex toml goes through a real TOML parse, never a regex.
- **Container structure**: a full-width list; clicking a row **opens the drawer
  directly** (metadata key-values + source; the both-sides switch lives inside the drawer and
  refreshes in place without closing; Esc and clicking the overlay are equivalent). Rejected:
  master-detail two-column (compresses the list's information density) and "inline metadata expansion
  + overlay" (the expansion is a redundant stop on the way to the drawer).
- **Sorting**: project level first, then by name within each group (as with skills).
- **Project detail's layout**: the effective view is grouped — each side's project-level group headed
  by the directory that side reads (`.claude/agents`, `.codex/agents`, `.agents/agents`), then each
  side's global group ("Global level · <side>"), each heading counted; Claude's and Codex's
  shadowing badges are unchanged, Antigravity's rows carry none. One grouped side among flat ones
  would read wrong.

## Out of Scope

- All write operations: creating, editing or deleting subagents.
- Codex shadowing's field-level backfill semantics.
- Subagent-level private memory directories (belongs to the memory-view spec's Out of Scope).
- Enumerating built-in subagents (not on disk, no source to read).
- Grok agent definitions: there is no real sample to ground a parser on, so the Grok side contributes
  nothing to this section rather than a guessed reading.
