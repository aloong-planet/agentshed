# Project detail

> Related: ADR-0004 (install/uninstall boundary) · ADR-0001 / ADR-0038 · ADR-0028 (query layer) ·
> ADR-0037 (Antigravity CLI side) · ADR-0049 (Antigravity CLI's components) · ADR-0051 (a project's
> documents are neither listed nor read)
> Each section's component-level requirements and boundaries live in its own spec (subagents-view /
> memory-view / plugins-view / skill-install / token-stats); this document covers **page-level**
> rules.

> Successful display payloads persist independently of the accounting index (ADR-0053).

## Problem Statement

"What capabilities does this project have installed, and what conventions does it follow" is the
product's founding question. The answers are scattered across three places — the
project directory, both sides' global configuration, and the agent data directories — and when a
project-level and a global-level entry share a name, which one applies is not obvious.

## Solution

Answer it with sections: Overview (the default landing spot, see token-stats) and each component's
**effective view** (project-level and global-layer side by side with the shadowing relationship
labelled). Everything is read-only; the one write operation is uninstalling a project-level skill.

## User Stories

1. As a user, I want the overview (usage and session trace) by default on entering a project, so that
   I can see how active it is at a glance.
2. As a user, I want each component section presented as an effective view (project-level /
   global-layer, with shadowing labelled), so that I know which definition actually applies in this
   project.
3. As a user, I want a stale project's detail page to tell me why it is stale and hand me a
   ready-made line to send to each agent that still records it, so that the agents clean their own
   registries and I never hand-edit their config files.
4. As a user, I want switching between projects to feel like turning a page — the page I am on stays
   until the next one is ready, and a project I opened earlier comes back at once — so that browsing
   projects is not punctuated by blank frames and rebuilt content.

## Failure modes and boundaries

**Sequence A: page composition**
- A1 The sections, in this order = Overview / Instructions / Skills / Subagents / Plugins / MCP / Memory /
  Sessions (project-detail::REQ-004); a new component type extends this list.
- A2 A stale project opens as the **stale note page**: the shell — struck-through name, stale tag,
  path — plus a single note card, with **no section tabs and no data areas** and no back control,
  the project list being beside it. The project's own token history is not reachable from its page;
  the global totals still include it (see agents-overview B3). Sequence S below owns the card. A
  directory that cannot be reached is not stale ([projects-list](projects-list.md) A6), so such a
  project opens its sections.
- A3 Detail is fetched on demand (it does not enter the overview snapshot), and **a project switch
  is atomic** (an invariant in AGENTS.md): the page on screen stays whole until the next project's
  page can be drawn whole, then the pane switches in one frame — no empty pane, no loading label, no
  new header over an old body. Only the list highlight moves at once. A project with a saved
  successful page is a **cached visit**: its page is drawn immediately from what was last shown, its
  token figures and session list excepted (project-detail::REQ-005), and refreshed in the background.
  A refetch that reaches a page already on screen — a snapshot update
  (an automatic rescan, see token-stats sequence E), a background revalidation, a page-local change
  — is a **transfusion**: the rendered content stays and the new data replaces it on arrival, so a
  section's local state (expansion, search, scroll position) survives the refresh. Sequence T below
  owns the switch.
- A4 Instructions section: a missing project CLAUDE.md / AGENTS.md shows "None" rather than an error;
  oversized files are truncated.
- A5 The detail drawer's width = min(a fixed width, **the right-hand content area's** width × 80%) —
  where the content area = the viewport minus the fixed elements on the left (the rail; and in the
  Projects dimension, the project sidebar as well).
- A6 The MCP section lists the servers in the project's `.mcp.json` with their enabled / disabled /
  default state; with none, it points to the Agents page for the global ones.
- A7 A conversation on any side, Antigravity CLI's included, moves the project's activity in the list.

**Sequence T: switching and revisiting** (ADR-0028; saved successful pages also qualify as
cached visits under project-detail::REQ-001)
- T1 First visit: with project A on screen, selecting B highlights B in the list at once; A's header
  and body stay until B's detail has arrived, then the pane shows B's header and body in the same
  frame. Nothing is drawn in between.
- T2 Cached visit: selecting a project seen earlier draws its page immediately (header and body from
  what was last shown) and revalidates in the background; the fresh detail arrives by transfusion.
  The revalidation happens on every visit — there is no age below which a cached page is trusted
  without one. Its token figures and session list follow project-detail::REQ-005.
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
  on screen when the session opened), landing on the Sessions section (project-detail::REQ-004/AC-02), and
  its detail revalidates by transfusion.
- T9 Leaving the Projects dimension (Agents, Settings) and coming back: the selection is kept (the
  existing rule) and the page is a cached visit — no refetch, no empty frame. The exception is coming back
  through a side card's project count, which clears a selection not registered on that side
  ([projects-list::REQ-002/AC-05](projects-list.md)).
- T10 Fetch failure on a first visit (the IPC call rejects): the switch completes to the existing
  form, an empty pane body under the new project's header — no error card is invented (Out of
  Scope). A failed background revalidation leaves the shown page as it is. Either failure is logged
  by the main process as every IPC failure is.
- T11 An inactive in-memory entry may be discarded. A valid persisted page remains a cached
  visit under project-detail::REQ-001; discarding alone must not erase the cross-restart
  recovery copy. Without either copy the visit follows T1.
- T12 Changing the UI language or the theme refetches nothing: the detail carries no natural
  language (ADR-0001), so the cache is language-independent.
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
  follows the entry's side list: a future side joins by
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
  selection. The message names selecting another project, which clears it; with none left
  in the list it stays until a record comes back or the window reloads.
- S8 Introduced-content dimension: the card renders first-party copy plus the path **as text** (a
  path containing markup-like characters displays literally); the copy button is the only
  interactive element and writes only to the clipboard.
- S9 The registry files are agent-global live files; a running session of the receiving agent may
  rewrite its file and resurrect the entry after cleanup. The flow is idempotent — the mitigation is
  sending the line again — and the card deliberately does not carry this caveat (the agents surface
  it themselves when relevant).
- S10 The card is the page's whole body, so its sentences read as body text — the primary text colour
  at the window's body text size — not as a secondary-grey footnote; the stale tag keeps its warning
  colour and the prompt its monospace pill.

**Cross-cutting**
- R1 A file the page shows is read on demand only through an allow-list, which closes the
  arbitrary-path read hole: on this page it holds the memory files the page lists (memory-view), and
  the page opens nothing in another application.
- R3 **A rendered markdown link must never navigate the whole window** (in dev, falling back to
  index.html looks like "returning to the home page"; in the packaged build it leaves a blank screen;
  both lose all app state). External http(s) links go to the system browser, and the main process's
  `will-navigate` backstop covers every render site, including ones added in future. In the
  Instructions section's CLAUDE.md / AGENTS.md previews every relative link gets the out-of-scope
  notice, whatever it points at, and opens nothing.

## The Antigravity CLI side and the Instructions section

### project-detail::REQ-002 Antigravity in a project's page, and its Instructions entries

Applies to: the project detail page.

- project-detail::REQ-002/AC-01: The header's side chips include ANTIGRAVITY when the project is
  registered on that side ([agents-overview::CON-004](agents-overview.md)); the stale note's chips
  follow by construction (S3).
- project-detail::REQ-002/AC-02: The Instructions section has two entries, CLAUDE.md and AGENTS.md —
  the project's own files, each headed by its path, "None" when absent (A4). The project's AGENTS.md is
  read by Codex and Antigravity alike and is shown once. The Claude project settings summary is removed,
  and no settings summary is shown for any side (ADR-0049).
- project-detail::REQ-002/AC-03: The MCP section's Antigravity group lists agy's global servers and its
  effectively enabled plugins' servers ([agents-overview::REQ-003/AC-04](agents-overview.md)); the
  project's own `.agents/mcp_config.json` is not shown.
- project-detail::REQ-002/AC-04: The Skills, Subagents, Plugins and Sessions sections show the side as
  their specs define ([skills-view::REQ-002](skills-view.md),
  [subagents-view::REQ-001](subagents-view.md), [plugins-view::REQ-001](plugins-view.md),
  [session-view::REQ-003](session-view.md)); the Overview's per-side row, trend side switch and model
  rows include it ([token-stats::REQ-003](token-stats.md)); the Memory section shows nothing for it, so
  a project registered only on Antigravity gets the memory-view D4 empty state.

Failure modes and boundaries: a project registered only on Antigravity opens with the ANTIGRAVITY
chip alone and its own sessions; the MCP section's Antigravity group appears on a project's page
only when it has servers, since it repeats global facts; an instruction file that cannot be read,
one inside a directory that cannot be entered included, shows the read error under its path, the
other entry unaffected — in the "None" line's form under the path heading, the same declared
prototype exemption as the agents page's (agents-overview::REQ-004 failure modes); the Instructions
previews keep R3's link destinations.

### project-detail::REQ-004 The Instructions section's name and place

Applies to: the tab row of a project's page. A stale project's note page has no tabs (A2).

- project-detail::REQ-004/AC-01: The section's tab has the agents page's label
  ([agents-overview::REQ-006/AC-01](agents-overview.md)).
- project-detail::REQ-004/AC-02: The tabs run Overview / Instructions / Skills / Subagents / Plugins
  / MCP / Memory / Sessions. The selected tab carries to the next project: selecting
  another project keeps it, and the next project shows it. A stale project's note page and the
  not-in-snapshot state have no tabs, and neither change nor use what the next page starts on: the
  next project selected, or the same project when a scan brings its page back, opens on the tab from
  the last page that had tabs, however many such pages came between. A project opens on Overview
  when no earlier tab applies: its first selection, with a note page before it or not, and coming
  back through the rail or a side card's project count, with a note page on the way or not, because
  coming back is not switching projects. Leaving a session for a project lands on Sessions,
  whichever way the session was entered, Overview's session card included: coming back from it (T8),
  or selecting a project in the list from its page, another project or the session's own, which
  shows the tab's empty sentence for a project with no sessions. It does so once: from there the tab
  carries as above, and leaving by the rail or a side card's project count and coming back starts on
  Overview. When a session is left onto a note page or the not-in-snapshot state, the next page with
  tabs opens on Sessions, by the same rule. A return overtaken by a move to another dimension draws
  no page, and the next page starts on Overview too.

Failure modes and boundaries, a narrow window: the row keeps its one form at every window width, and
no narrow form is designed. It does not move onto a second row, a sideways wheel over it does not
move it, and the pane clips it, so the pointer cannot reach a tab past the right edge until the
window is widened. The default 1100px window shows every tab in both languages. In English a narrower
window cuts Sessions first, and at the 800px minimum window MCP is cut and Memory and Sessions lie past
the edge. In Chinese the row is shorter, but in a narrower window its two-character labels wrap inside
their tabs and the row grows taller; at the minimum window Sessions is cut and no tab lies wholly past
the edge. The agents page's seven tabs fit at the minimum window in both languages. This is the one
exception to [i18n::QR-001](i18n.md).

The keyboard does reach those tabs, and that is accepted as it is, with no product change: Tab moves along the row, Enter
opens the focused tab, and focus on a tab wholly past the edge shifts the pane sideways to bring it into view, its header and
body together. That cuts off the start of the project's name and path, a short name whole; a tab the edge only cuts takes
focus with no shift. The shift stays through a pointer click on another project. It ends when Shift+Tab brings focus back to
the first tab, on opening a session or on leaving for the agents page; widening the window shrinks it, and the default window
ends it.

## Cross-restart page restoration

### project-detail::REQ-001 Restore successful project pages

- project-detail::REQ-001/AC-01: After a full quit and relaunch, opening a previously viewed project
  with a valid saved detail displays the last successful detail before the first scan finishes,
  including its sections, statistics and session list, the last two as project-detail::REQ-005/AC-02
  sets out. An accounting-cache invalidation alone
  must not turn this into a first visit.
- project-detail::REQ-001/AC-02: A project without saved detail follows the existing first-visit
  behavior; never substitute another project's data.
- project-detail::REQ-001/AC-03: Refresh a restored page by transfusion when current data is ready;
  a failed background request must not overwrite the last successful payload with an error result.
- project-detail::REQ-001/AC-04: A successful snapshot declaring the selected project stale or
  absent takes precedence over its saved page and follows S6/S7.
- project-detail::REQ-001/AC-05: Already-read memory and skill-package preview content
  belonging to the project is eligible for restoration as previously viewed content; unread
  bodies are not eagerly fetched to populate the saved copy.

The shared version, source-admission and navigation constraints are
[agents-overview::CON-001](agents-overview.md), [agents-overview::CON-002](agents-overview.md) and
[agents-overview::CON-003](agents-overview.md). Restored markup retains R3's link destinations.
The saved page includes successful detail data and separately fetched preview bodies already read
from that page. Restoring these bodies does not restore the open drawer or authorize new file reads.
Error results and pending requests are never stored as successful page content.

## A page drawn from its copy

### project-detail::REQ-005 A page drawn from its copy shows the latest scan's figures

Applies to: a project page drawn from a saved copy — a cached visit (T2) or a page restored at launch
(project-detail::REQ-001) — and the page on screen when a scan completes. A scan computes every
project's token figures and session list, so the page never has to show older ones than the scan holds.

- project-detail::REQ-005/AC-01: From the first frame of a cached visit, the page's token figures —
  the totals cards, the composition, the trend and the model breakdown — and its session list are
  those of the latest completed scan, not those the copy was saved with. The rest of the page is the
  copy's until its revalidation arrives (T2).
- project-detail::REQ-005/AC-02: A page restored at launch shows, until the first scan completes, the
  figures and session list saved with the restored snapshot, which are the last scan's of the run that
  saved them; these are the statistics and session list project-detail::REQ-001/AC-01 names. A project
  the saved figures hold nothing for shows what its page copy carries.
- project-detail::REQ-005/AC-03: When a scan completes, the page on screen takes that scan's figures
  and session list with the snapshot, without waiting for its own refetch (T3).
- project-detail::REQ-005/AC-04: Once a scan has completed in this run, a project that scan holds no
  figures for shows zeros and an empty session list ([token-stats](token-stats.md) G17), as its
  revalidation would, and not the copy's figures.

Failure modes and boundaries: until the revalidation arrives, the copy's other sections can be older
than the figures and the session list beside them. A session in that list opens, because the main
process admits sessions from the same scan the list came from. The saved figures degrade entry by
entry (the restart sequence in [agents-overview](agents-overview.md)), so one project's can be missing
while its page copy restores; that page then shows its copy's figures until the first scan (AC-02),
and never another project's. The same holds whenever the window holds no figures at all — none saved,
and no scan completed yet.

## Constraints

### project-detail::CON-001 Which directories a project's detail is asked for and read for

Applies to: every request for a project's detail, and every package listing from a project's own
skills directory ([skills-view](skills-view.md) C9).

- project-detail::CON-001/AC-01: The main process reads a project's detail only for a directory its
  snapshot lists as a project, compared exactly as the snapshot spells the path, a stale project
  included. Another spelling of a listed project's directory is refused as any other directory is.
- project-detail::CON-001/AC-02: A request is judged against the snapshot of the moment it arrives —
  the restored one until the first scan completes, the latest scan's after it — and again against the
  snapshot of the moment its files would be read.
- project-detail::CON-001/AC-03: A refused request gets its own error and nothing else: none of the
  directory's files is read, nothing of it joins the allow-list (R1), and the project does not count
  as opened.
- project-detail::CON-001/AC-04: A project counts as opened, for a package listing from it, only while
  the snapshot of that moment lists it, whether its page was opened in this run or restored from the
  last launch.
- project-detail::CON-001/AC-05: The window asks for a project's detail only for a directory its own
  snapshot lists, by AC-01's rule. A snapshot that no longer lists the project on screen refetches
  nothing for it, the exception to T3: its page leaves for the not-in-snapshot state (S7), and if the
  project comes back its page is a cached visit (T2).

## Implementation Decisions

- **The query layer** (ADR-0028): a failed fetch is not retried, so failures surface at once.
- **Section state is per project**: a section's local state resets on a project change (the
  Skills filter rule) and survives a transfusion of the same project (A3).
- **The selected window** ([token-stats](token-stats.md) G11) is held while the Projects dimension
  is shown, across the session page and the project pane; leaving the dimension clears it.
- **Allow-list**: when detail is returned, the memory files it lists — its topics and its main file — are
  registered in the allow-list, and a read validates against it (R1).
- **A display copy saved while a page listed the project's documents** (ADR-0051): a saved project page
  restores without that list. A read or a read registration saved under the kind and key that memory
  files and documents then shared survives, as a memory file's, only for a path the restored snapshot, a
  restored project page or the scan's own saved registration (which only ever held memory files) lists
  as a memory file; every other one is dropped, so no document becomes readable through it. An earlier
  build that reads a copy this build wrote restores none of its saved project pages and none of its read
  registrations or memory reads.
- **Each scan's project figures reach the window beside the snapshot** (project-detail::REQ-005):
  every project's token figures and session list, keyed the way the project list merges paths, and
  checked on both sides of the boundary like every payload (ADR-0001). They are not part of the
  snapshot (A3), and the display copy saves them beside it (ADR-0053). The detail a page fetches still
  carries that project's figures as of the fetch, and the page draws the window's for that project
  over them whenever the window holds them: a scan replaces the figures the main process reads a
  detail from and sends them to the window in the same turn, so the window's are never the older.
- **Copying goes through the main process** (an IPC channel writing the OS clipboard): the renderer
  clipboard API rejects under automation, and the OS clipboard is main-process territory anyway. The channel validates its sender and input like every other.
- **The `{sides}` slot**: every language's cause and send sentences carry exactly one slot, and the
  prompt embeds its path.
- **Instruction entries carry their paths** (project-detail::REQ-002/AC-02): the detail sends each
  of the project's two files with its path and its contents, or none for a file that exists but
  cannot be read, and null for an absent one. A project detail saved before the files carried their
  paths restores with each file at its place in the project and without the settings summary
  (AGENTS.md: a saved page restores across an update).

## Out of Scope

- Removing a stale project's registry records from inside the app (the hint-only stance: the
  registries are the agents' own live files and Agentshed never writes to them).
- Per-agent removal commands or registry file paths on the stale note card (the prompt line is
  agent-agnostic).
- A token-history view for stale projects (the note-only page; the global
  totals still include them).
- Persisting session search results or search state across restarts. Search already uses the query
  layer under ADR-0028, but is not a saved display-page or preview payload.
- An error card for a failed detail fetch: the body stays empty as before (T10); a card is a new
  visible state and needs a prototype.
- A pending indicator while a first visit is in flight (dimming the clicked row, a progress bar):
  the list highlight moving at once is the only feedback; an indicator is
  a new visible state and needs a prototype.
- A narrow form of a project's tab row (wrapping onto a second row, scrolling, an overflow menu): a
  tab past the window's edge stays out of the pointer's reach until the window is widened, and the
  keyboard's sideways shift of the pane stays, both accepted (project-detail::REQ-004).
