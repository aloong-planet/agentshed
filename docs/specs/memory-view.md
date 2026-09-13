# Memory view

> Related: [features](../features/memory-view.md) · ADR-0001 (single type source) · ADR-0002 (dual seam)

## Problem Statement

Agents accumulate cross-session memories automatically and those memories shape later behaviour, but
the content is buried in an encoded data directory (per-project for Claude, global and requiring
manual enabling for Codex), so users do not know "what has the agent remembered about my project" and
have no way to spot a stale or unexpected memory.

## Solution

The global page's Memory section summarises each project's memories (metadata + file list, clicking a
row expands and clicking a file opens a drawer with the content); the project detail page's Memory
section renders that project's main memory file directly and can view topics. Everything is read-only
— memory is agent-generated content.

## User Stories

1. As a user, I want a Memory summary on the global page (which projects have memories, topic counts,
   last modification, in reverse order of modification), so that I can spot stale or unexpected
   memories.
2. As a user, I want to click a row to expand the file list and click a file to open a drawer (without
   navigating away), so that reading a memory does not interrupt my browsing of the summary page.
3. As a user, I want to see a project's Memory in its detail page (the main file rendered + a topic
   list I can view), so that I know what the agent remembers about this project.
4. As a user, I want accurate guidance about Codex memory according to its toggle state (telling me
   how to turn it on when it is off, rather than showing "no content"), so that I do not mistake "the
   feature is off" for "there are no memories".
5. As a user, I want a missing or unreadable file to degrade to a notice rather than crashing, so that
   the viewer opens on any machine.

## Failure modes and boundaries

**Sequence C: global page → Memory section**
- C1 No project has any memory → empty state.
- C2 The memory directory exists but is empty → does not count as having memories, not listed.
- C3 Only topic files, no main memory file (the shape measured on this machine's Transfer project) →
  counts as having memories, with the main file slot showing "none".
- C4 The summary set: all registered projects (including stale, with its existing badge; manual
  hiding was removed by ADR-0022) — so nothing that has memories is invisible; sorted by last
  modification, most recent first.
- C5 An encoded directory with no corresponding project in the registry (a leftover) → not listed (the
  summary follows the project registry and reuses the existing encoding mapping rather than writing a
  new decoder).
- C6 **Codex memory has three states** (an experimental feature requiring manual enabling, judged on
  both the toggle and the content):
  - Not enabled (`features.memories` in config.toml is not true, including a missing config) → show
    **how to enable it** (pointing at the in-app path: the `/memories` command or "Settings →
    Personalisation → Enable memories"), not "no content";
  - Enabled but the directory is empty → "enabled, nothing yet";
  - Has content → its own global row (regardless of the toggle; if it is off but old files remain,
    list them truthfully with a note).
  - Toggle detection is confined to the `memories` key under the `features` table (the `[features]`
    section and the `features.memories` dotted key are equivalent forms and both must be recognised),
    and must not be misled by a `[memories]` configuration section or a same-named key elsewhere; it
    goes through a TOML parse, and **a parse failure counts as not enabled** (Codex itself cannot read
    that config either, and salvaging semantics from a broken file is a false signal — see CONTEXT.md,
    "degraded judgements follow the target system's behaviour").
- C7 Clicking a row **expands the file list inline** (main file + topics, with modification times)
  without navigating to a detail page; clicking a file → a drawer with the content. The Codex global
  row expands the same way (directory enumeration + reading the source, with no structural parsing).
- C8 What enters the snapshot for a summary entry is **only metadata and the file name list** — no
  content (so many projects' full text does not balloon the snapshot); content is read on demand when
  clicked (reusing the artifact read channel's allow-list mechanism, extended to memory directories;
  a first-read failure → "file cannot be read" inside the drawer, no crash). An already-read
  successful body is saved separately and restored immediately on reopening, including after a
  restart; a failed refresh retains it (project-detail::REQ-001/AC-05, ADR-0029). This does not
  restore the open drawer or authorize a new source read.
- C9 The expansion state is keyed by project path rather than list index — so an expanded row does not
  shift when a snapshot refresh reorders the list.

**Sequence D: project detail → Memory section**
- D1 No memory → empty-state copy.
- D2 The main memory file is rendered (sanitised as in subagents A7), capped at 200,000 text code
  units by the existing provider read. Topics open in the shared artifact drawer, whose existing
  cap is 500,000 text code units. Saved display data preserves these truncation markers.
- D3 Subagent-level memory (`agents/<name>/memory/`) is not read (Out of Scope, not shown in the
  section).
- D4 A Codex-only project → an empty state explaining that "memory is a Claude-side mechanism" (Codex
  memory is global and does not enter project detail).
- D5 Subdirectories under the memory directory are not listed as files (only top-level `.md` is read).
- D6 Clicking a **relative link** in the main file (the index pointing at a topic in the same
  directory): if the target is in the readable list → open a drawer in the app; if not → an explicit
  "the target is outside the readable range" notice; **under no circumstances may the whole window
  navigate** — letting a rendered link's default behaviour through loses all app state (a 2026-08-02
  bug). External http(s) links go to the system browser.

**Cross-cutting regression points**
- R1 The IPC contract (`validate`) must be extended along with any new domain type field (the same
  lesson as the cache-crash postmortem).
- R2 Times are displayed uniformly in relative form (matching the app-wide `fmtAgo` convention),
  never as absolute dates.

## Implementation Decisions

- **Types**: the summary entry (metadata + file name list, no content) and the project detail entry
  (main file content + topic metadata) are modelled separately; ADR-0001's single type source, with
  contract validation extended in step.
- **Read layer**: injected through `ScanRoots`; the summary follows the project registry and reuses
  the existing encoding mapping; the Codex side is directory enumeration + toggle detection (a TOML
  parse) only.
- **On-demand read channel**: file contents do not enter the snapshot, reusing the existing artifact
  read allow-list mechanism (only files listed in a snapshot or detail can be read), extended to
  memory directories.
- **Container structure (prototype ruling)**: on the global page, clicking a row expands the file list
  and clicking a file opens a drawer; on the detail page, the main file is rendered directly (the same
  pattern as the Configuration section) with topics in a drawer. Esc and clicking the overlay are
  equivalent.

## Testing Decisions

Following ADR-0002's dual seam: (1) fixture unit tests at the providers layer (covering sequence C:
an empty directory, topics only, stale, registry leftovers, Codex's three states and the
dotted-key form, degradation on a parse failure); (2) the contract validation round trip. The UI
layer's drawer read-failure path is not unit tested (per ADR-0002 the UI is not unit tested), and e2e
covers the normal read path.

## Out of Scope

- All write operations: editing or deleting memories (memory is agent-generated content).
- Subagent-level private memory directories.
- Structural modelling of Codex memory (directory enumeration and reading the source only; no parsing
  of durable entries, evidence files or other internal structure).
- Searching memory contents and aggregating them across projects.
