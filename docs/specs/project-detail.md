# Project detail

> Related: [features](../features/project-detail.md) · ADR-0004 (install/uninstall boundary) · ADR-0001 / ADR-0002 · ADR-0028 (query layer)
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
7. As a user, I want switching between projects to feel like turning a page — the page I am on stays
   until the next one is ready, and a project I opened earlier comes back at once — so that browsing
   projects is not punctuated by blank frames and rebuilt content.

## Failure modes and boundaries

**Sequence A: page composition**
- A1 The set of sections = Overview / Skills / Subagents / Plugins / MCP / Memory / Configuration /
  Artifacts; a new component type extends this list.
- A2 A stale project opens as the **stale note page** (settled 2026-08-23, superseding the earlier
  "sections show empty states" behaviour): the shell — back control, struck-through name, stale tag,
  path — plus a single note card, with **no section tabs and no data areas**. The trade-off that the
  project's own token history is no longer reachable from its page was accepted; the global totals
  still include it (see agents-overview B3). Sequence S below owns the card.
- A3 Detail is fetched on demand (it does not enter the overview snapshot), and **a project switch is
  atomic** (ruled 2026-09-12, superseding the 2026-09-11 empty-pane rule; the CONTEXT.md invariant of
  that date): the page on screen stays whole until the next project's page can be drawn whole, then
  the pane switches in one frame — no empty pane, no loading label, no new header over an old body.
  Only the list highlight moves at once. A project seen earlier in the run is a **cached visit**: its
  page is drawn immediately from what was last shown and refreshed in the background. A refetch that
  reaches a page already on screen — a snapshot update (an automatic rescan, see token-stats sequence
  E), a background revalidation, a page-local change — is a **transfusion**: the rendered content stays
  and the new data replaces it on arrival, so a section's local state (expansion, search, scroll
  position) survives the refresh (settled 2026-08-08). Sequence T below owns the switch.
- A4 Configuration section: a missing project CLAUDE.md / AGENTS.md shows "none" rather than an error;
  oversized files are truncated.
- A5 The detail drawer's width = min(a fixed width, **the right-hand content area's** width × 80%) —
  where the content area = the viewport minus the fixed elements on the left (the rail; and in the
  Projects dimension, the project sidebar as well). It was previously computed as a percentage of the
  viewport, so in a narrow window the drawer covered the entire content area and lost its "drawer"
  meaning (a 2026-08-02 bug); the left-hand fixed elements' width changes when the dimension changes,
  so the formula has to change with it.

**Sequence T: switching and revisiting** (ADR-0028; the cache is memory-only and empty at every
start, so "seen earlier" always means earlier in this run)
- T1 First visit: with project A on screen, selecting B highlights B in the list at once; A's header
  and body stay until B's detail has arrived, then the pane shows B's header and body in the same
  frame. Nothing is drawn in between.
- T2 Cached visit: selecting a project seen earlier draws its page immediately (header and body from
  what was last shown) and revalidates in the background; the fresh detail arrives by transfusion.
  The revalidation happens on every visit — there is no age below which a cached page is trusted
  without one.
- T3 Snapshot update: an automatic rescan marks every cached page stale. The page on screen refetches
  by transfusion; a page not on screen is refetched on its next visit, which is still a cached visit
  (drawn from the stale copy first).
- T4 Page-local change: uninstalling a skill marks that project's page stale and refetches it by
  transfusion; the copy a later cached visit draws from is the post-change one.
- T5 Rapid switching A → B → C before B has arrived: the list highlight follows the clicks, the pane
  holds A until C is ready, and B's page never appears — the pending switch is interruptible. B's
  fetch still completes and is kept, so a later visit to B is a cached visit.
- T6 Switching to a stale project: the note page renders from the snapshot alone (S6), so the switch
  needs no fetch and happens at once; switching from a stale project to a normal one holds the note
  page until the detail arrives (T1).
- T7 Switching to a project no longer in the snapshot: the not-in-snapshot empty state (S7), no fetch,
  at once.
- T8 Leaving for a session page and coming back: the project page is a cached visit (its detail was
  on screen when the session opened), landing on the Sessions section per the session-view rule, and
  its detail revalidates by transfusion.
- T9 Leaving the Projects dimension (Agents, Settings) and coming back: the selection is kept (the
  existing rule) and the page is a cached visit — no refetch, no empty frame.
- T10 Fetch failure on a first visit (the IPC call rejects): the switch completes to the existing
  form, an empty pane body under the new project's header — no error card is invented (Out of
  Scope). A failed background revalidation leaves the shown page as it is. Either failure is logged
  by the main process as every IPC failure is.
- T11 A cached page unused for a while is dropped (the query layer's default collection window, not
  a tuned number): the next visit to it is a first visit again (T1). Within the window the revisit
  is instant.
- T12 Changing the UI language or the theme refetches nothing: the detail carries no natural
  language (ADR-0016), so the cache is language-independent.
- T13 Window focus refetches nothing by itself: the snapshot is the app's one refresh clock (the
  focus rescan produces a snapshot, which is T3).

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
  A read that fails (the file was removed after the scan listed it) shows a toast and no overlay,
  rather than the click doing nothing — landed 2026-09-13 on the query layer (ADR-0028), the read
  going through `artifact-content-query`'s result wrapper rather than an unhandled rejection.
  Reopening an already-read file is a cached, instant revisit.
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
  not balloon when there are many projects), read through the query layer below.
- **The query layer** (ADR-0028): the detail is a suspense query keyed by the project path, and the
  selection change that alters the key runs inside a Transition. The list highlight is driven by the
  immediate selection and the pane by the transitioned one — that is the whole of "the highlight
  moves at once, the pane waits". One Suspense boundary wraps the detail slot of the Projects
  dimension; its fallback draws nothing.
  **Measured, not assumed (2026-09-13)**: with React 18's `createRoot`, once a Suspense boundary has
  committed real content, a later update that suspends it — whether wrapped in `startTransition` or
  a plain `setState` — holds that content rather than reverting to the fallback, and an update that
  arrives before an earlier one has committed preempts it, again regardless of Transition. A mutation
  removing the Transition around the selection change was rebuilt and run against the hold e2e case
  (T1) and it stayed green: the fallback never appeared. The Transition is kept anyway — it is
  React's documented pattern for this exact scenario, costs nothing, and is the seam that would
  matter the day a competing high-priority update needs to preempt a pending switch, which nothing
  here currently exercises. Its correctness is therefore asserted by matching the documented pattern
  and by the passing hold/interruption cases, not by a mutation that turns them red.
  A snapshot arrival invalidates every query (the mounted one refetches, the
  others on their next mount); a page-local change invalidates its own project's query. Every mount
  revalidates (T2); window focus does not (T13); a failed fetch is not retried, so failures surface
  at once as they do today. Collection keeps the library's default window (T11). A query function
  resolves to a result value (the detail, or the failure) and never throws, so no error boundary
  exists and T10 is a branch of the page, not of a boundary.
- **Section state is keyed by project**: the pane body subtree is keyed by the project path, so a
  section's local state resets on a project change exactly as it does today (the Skills filter rule)
  and survives a transfusion of the same project (A3).
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

The atomic switch and the cached visit (sequence T) are asserted at the e2e seam under an **injected
fetch delay**: an environment knob of the same test-seam family as the startup-skeleton scan delay,
read only by the project-detail IPC handler, zero in production and set only by the e2e cases that
need it. With the delay in force: after clicking B, the list highlight is on B while the pane header
still names A and its body is non-empty (sampled inside the delay window — the hold is asserted at
an instant, and the absence of an empty frame rests on the delay being far longer than the sampling
gap); after the delay the header names B; clicking A again shows A's header and body before the
delay could have elapsed (the cached visit); and the transfusion after a snapshot update is the
existing "expansion state survives the automatic refresh" case, which must stay green. The
Transition itself is verified by mutation once: without it the same case goes red on the hold.
No renderer unit test mounts a page (none does today), so the query layer has no unit seam; the
main-process side of the knob is a one-line read and is not unit tested.

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
- Moving the other on-demand reads (a turn's contents, skill package files, artifact contents, the
  session search) onto the query layer: they keep their effects and handlers for now, tracked as a
  follow-up.
- An error card for a failed detail fetch: the body stays empty as before (T10); a card is a new
  visible state and needs a prototype.
- A pending indicator while a first visit is in flight (dimming the clicked row, a progress bar):
  the list highlight moving at once is the only feedback, by the 2026-09-12 ruling; an indicator is
  a new visible state and needs a prototype.

## Further Notes

- **Prototype gate (2026-09-12)**: the atomic switch adds no visible state — the list highlight
  keeps its existing form, and the end state is the absence of an intermediate frame, which has no
  form to draw; declared here as the exemption rather than assumed.
