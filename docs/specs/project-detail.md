# Project detail

> Related: [features](../features/project-detail.md) · ADR-0004 (install/uninstall boundary) · ADR-0001 / ADR-0002
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01. Each section's component-level requirements and boundaries live in its own
> spec (subagents-view / memory-view / plugins-view / skill-install / token-stats); this document
> covers **page-level** rules and the **artifacts section** (artifacts being a capability unique to
> this page).

## Problem Statement

"What capabilities does this project have installed, what conventions does it follow, and what has it
accumulated" is the product's founding question. The answers are scattered across three places — the
project directory, both sides' global configuration, and the agent data directories — and when a
project-level and a global-level entry share a name, which one applies is not obvious.

## Solution

Answer it with sections: Overview (the default landing spot, see token-stats), each component's
**effective view** (project-level and global-layer side by side with the shadowing relationship
labelled), and the **artifacts** the project has accumulated under the eight-step process. Everything
is read-only; the one write operation is uninstalling a project-level skill.

## User Stories

1. As a user, I want the overview (usage and session trace) by default on entering a project, so that
   I can see how active it is at a glance.
2. As a user, I want each component section presented as an effective view (project-level /
   global-layer, with shadowing labelled), so that I know which definition actually applies in this
   project.
3. As a user, I want to see all the project's accumulated artifacts in one place, filterable by type,
   so that I do not have to dig through the subdirectories of `docs/`.
4. As a user, I want markdown artifacts readable in place and prototypes opened by the system, so
   that reading does not take me out of the app while prototypes can actually run.
5. As a user, I want a stale project's detail page to tell me why it is stale and hand me a
   ready-made line to send to each agent that still records it, so that the agents clean their own
   registries and I never hand-edit their config files.
6. As a user, I want a neutral empty state in the artifacts section for a project not following the
   eight-step process, so that I do not mistake "not done this way" for an error.

## Failure modes and boundaries

**Sequence A: page composition**
- A1 The set of sections = Overview / Skills / Subagents / Plugins / MCP / Memory / Configuration /
  Artifacts; a new component type extends this list.
- A2 A stale project opens as the **stale note page** (settled 2026-08-23, superseding the earlier
  "sections show empty states" behaviour): the shell — back control, struck-through name, stale tag,
  path — plus a single note card, with **no section tabs and no data areas**. The trade-off that the
  project's own token history is no longer reachable from its page was accepted; the global totals
  still include it (see agents-overview B3). Sequence S below owns the card.
- A3 Detail is fetched on demand (it does not enter the overview snapshot); **no loading state is
  drawn**: on first open and when switching projects the pane body stays empty until the detail
  arrives (ruled 2026-09-11 — the transient label it used to show only flickered on a project switch,
  since the detail arrives within a frame or two). A refetch triggered by a snapshot update (an
  automatic rescan, see token-stats sequence E) is a **transfusion**: the rendered content stays and
  new data replaces it on arrival, so a section's local state (expansion, search, scroll position)
  survives the refresh (settled 2026-08-08).
- A4 Configuration section: a missing project CLAUDE.md / AGENTS.md shows "none" rather than an error;
  oversized files are truncated.
- A5 The detail drawer's width = min(a fixed width, **the right-hand content area's** width × 80%) —
  where the content area = the viewport minus the fixed elements on the left (the rail; and in the
  Projects dimension, the project sidebar as well). It was previously computed as a percentage of the
  viewport, so in a narrow window the drawer covered the entire content area and lost its "drawer"
  meaning (a 2026-08-02 bug); the left-hand fixed elements' width changes when the dimension changes,
  so the formula has to change with it.

**Sequence S: the stale note page** (the product's stance is **hint only, never operate**: Agentshed
never writes to any agent's registry; it tells the user what happened and hands them a line to send)
- S1 The card reads, top to bottom: the **cause** ("the project directory no longer exists — deleted
  or moved", the two being indistinguishable at scan level, so neither is asserted alone — while the
  named agents' registries still record it), the **effect** (removing the records takes the row off
  the list; token totals and the trend are unaffected, statistics being registry-independent), and
  the **send line** — "send this line to <chips> and let each delete it itself" with a copyable
  one-sentence prompt.
- S2 The prompt is agent-agnostic by design: no commands, no file names, no paths to registries — the
  agent locates and edits its own configuration (observed to also back up, keep the file valid and
  surface the rewrite race on its own). It embeds the absolute project path and is generated in the
  current UI language.
- S3 Only the sides whose registries record the project appear — as the uppercase full-name side
  chips, in both the cause and the send line; a single-side project shows a single chip. The card
  consumes the entry's side list and the AgentSide-total display Records: a future side joins by
  construction, and neither code nor copy enumerates the sides as a closed set (chips are
  interpolated, never written out).
- S4 Copying: success shows a transient confirmation beside the button; a clipboard failure shows the
  error toast and no false success.
- S5 Long paths wrap inside the prompt pill; no horizontal overflow at the narrowest supported width.
- S6 Staleness is per-snapshot, and the page follows it both ways: a refresh flipping stale→false
  returns the normal sectioned page, false→true switches to the note page. The note page renders
  from the snapshot entry alone — entering it fires no detail fetch and shows no loading state.
- S7 After the records are removed and a refresh runs, the project leaves the list; if it was the
  selected project, the pane shows the existing not-in-snapshot empty state rather than a ghost
  selection(the mechanism that has always answered a vanished entry — a selection reset would hide
  what happened, the message says it).
- S8 Introduced-content dimension: the card renders first-party copy plus the path **as text** (a
  path containing markup-like characters displays literally); the copy button is the only
  interactive element and writes only to the clipboard.
- S9 The registry files are agent-global live files; a running session of the receiving agent may
  rewrite its file and resurrect the entry after cleanup. The flow is idempotent — the mitigation is
  sending the line again — and the card deliberately does not carry this caveat (the agents surface
  it themselves when relevant).

**Sequence B: artifacts section**
- B1 **Six artifact types**, displayed in a fixed order following the top-down derivation chain:
  **CONTEXT.md → ADR → specs → prototypes → features → postmortems** (terminology and invariants →
  architectural decisions → requirements and boundaries → UI form → current capabilities →
  after-the-fact lessons). The filter chips follow the same order, with "All" first.
- B2 Where each type comes from: CONTEXT.md is the file of that name at the project root;
  adr/specs/features/postmortems come from `docs/<type>/*.md`; prototypes are collected recursively
  from `docs/prototypes/**/*.html`.
- B3 Index files are not artifacts: each directory's `README.md` does not count.
- B4 Prototypes: exclude the gallery shell (the root `index.html`) and `vendor/`; an `index.html`
  inside a module is named by its directory path, everything else by its filename.
- B5 The title comes from the markdown's first `#` heading, falling back to the filename.
- B6 The list is in **reverse chronological order globally** (across types) by modification time; the
  type chips filter without changing the order.
- B7 A project with no `docs/` directory → an empty array → neutral empty-state copy ("nothing
  accumulated by convention", not treated as an error).
- B8 A type with no artifacts while others have some → filtering by that chip shows "no artifacts of
  this type".
- B9 Markdown opens for reading in place (relative-path images resolve against the artifact's own
  directory); prototypes' HTML is handed to the system default application (it needs to actually run).
- B10 `.scratch/` is not under `docs/` by construction and does not count as an artifact (tickets are
  working documents — see the division of labour in specs/README).

**Cross-cutting**
- R1 Reading and externally opening artifact files goes through an allow-list (only files this detail
  page has listed can be read), closing the arbitrary-path read hole.
- R3 **A rendered markdown link must never navigate the whole window** (in dev, falling back to
  index.html looks like "returning to the home page"; in the packaged build it leaves a blank screen;
  both lose all app state). Cross-references between artifacts (spec ↔ features, say) navigate inside
  the reader, and a target outside the allow-list gets a notice; external http(s) links go to the
  system browser. The main process's `will-navigate` backstop covers every render site, including
  ones added in future. The Configuration section's CLAUDE.md / AGENTS.md previews use the same
  allow-list (settled 2026-08-21): a relative link resolving to a listed project document opens the
  reader overlay — the very one the Artifacts section uses — and anything else relative gets the
  notice; a prototype target keeps its open-in-browser route.
- R2 When adding an artifact type, update four places together: the type enum, the read source, the
  display order, and the chip labels (missing one produces either "scanned but not shown" or "shown
  but cannot be opened").

## Implementation Decisions

- **Artifact type order**: the constant's order is the single source, shared by the reader and the UI,
  so the ordering is not written twice.
- **Detail fetching**: on-demand IPC rather than entering the overview snapshot (so the snapshot does
  not balloon when there are many projects).
- **Allow-list**: when detail is returned, the artifact and memory file paths are registered in the
  allow-list, and both reading and external opening validate against it.
- **The stale note page renders from the snapshot entry alone** (path, sides, staleness are already
  there), so the stale branch sits above the detail fetch and never fires it.
- **The copy icon** joins the icon module (Lucide copy, chosen 2026-08-23 over clipboard); the side
  chips reuse the uppercase full-name chip form the side cards already wear.
- **Copying goes through the main process** (an IPC channel writing the OS clipboard): the renderer
  clipboard API rejects under automation — measured, not assumed — and the OS clipboard is
  main-process territory anyway. The channel validates its sender and input like every other.
- **The `{sides}` slot is a checked contract**: a unit guard asserts every language's cause and send
  sentences carry exactly one slot and the prompt embeds its path — the type alignment cannot see
  string content, so a dropped slot would otherwise fail silently.

## Testing Decisions

Following ADR-0002's dual seam: fixture unit tests at the providers layer cover recognising the six
types, excluding READMEs, the prototypes recursion and exclusion rules, the title fallback, and the
no-`docs`-directory empty state; the type order is pinned as a contract in a unit test (so it is not
changed unintentionally). The UI's chip filtering and reading overlay are not unit tested and rely on
e2e and manual testing.

The stale note page's seam is the e2e harness over a fixture home with a registry entry whose
directory does not exist (prior art: the three-side fixture in the projects-list tests): assert the
page structure (card present, no tabs, no loading state), the chip set following the recorded sides,
and the copy feedback. The copy's clipboard write is verified at the behaviour level (feedback
appears); the dictionary keys are covered by the type alignment.

## Out of Scope

- ~~Rendering session contents (metadata only)~~ (2026-08-06: fully shipped by
  `docs/specs/session-view.md`, moved out of this spec's boundary).
- Editing or creating artifacts (read-only viewing).
- Removing a stale project's registry records from inside the app (the hint-only stance, settled
  2026-08-23: the registries are the agents' own live files and Agentshed never writes to them).
- Per-agent removal commands or registry file paths on the stale note card (retired 2026-08-22 in
  favour of the agent-agnostic prompt line).
- A token-history view for stale projects (accepted trade-off of the note-only page; the global
  totals still include them).
- Cross-project artifact aggregation (ruled a false requirement, see CONTEXT.md's flagged
  ambiguities; cross-project retrieval belongs to a future global search).
- Full-text search of artifact contents.
