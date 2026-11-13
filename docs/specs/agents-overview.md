# Agents overview

> Related: ADR-0001 (single type source) · ADR-0038 (test layers) · ADR-0037 (Antigravity CLI side)
> Each section's component-level requirements and boundaries live in its own spec (subagents-view /
> memory-view / plugins-view / token-stats / skill-install); this document covers only
> **page-level** rules: which sections exist, the summary cards, and single-side degradation.

> Startup restoration uses the original page prototypes.
> Successful display payloads persist independently of the accounting index (ADR-0029), and are
> written while the window has no focus (ADR-0044), by the engine module (ADR-0045).

## Problem Statement

Users running several agent sides want to know, the moment the app opens, "what state is each
side in, how much has each burned, and what does each have installed". That information is scattered
across the sides' directory structures whose formats and concepts are not even symmetric (plugins, for
instance, exist only on the Claude side).

## Solution

As the default landing page, gather every agent side's global picture onto one screen: per-side
summary cards at the top and, below them, sections by component type
(Token/Instructions/Skills/Subagents/Plugins/MCP/Memory). Everything is read-only; the one write
operation is installing a skill into a project (see the skill-install spec). **This app's colour
theme (purple / mist blue / amber brown) is not configured on this page** —
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
5. As a user, I want the totals' accounting (including stale projects) recorded where I can find it,
   so that when the numbers do not match I know where the difference is (the card itself carries no
   note — see B3).
6. As a user, I want the page's structure visible as a skeleton while the first scan runs, so that
   launching the app never looks like a blank or hung window even when the scan takes long.

## Failure modes and boundaries

**Sequence A: page load**
- A1 No side detected → a whole-page empty state with guidance (which agent to install), not an
  error.
- A2 One side not detected → that side's card shows "not detected", the others behave normally.
- A3 One side's registry corrupt or unreadable → that side's card shows an error explanation (in place of
  the stats row), the other sides are unaffected. A file behind a directory that cannot be entered counts as
  one that cannot be read, never as one not there. A registry that cannot be read and a corrupt one say
  different things, each a sentence in the current UI language naming the file, with no system error and
  no parser's text. A snapshot saved before the file was named shows the sentence alone until the first
  scan answers.
- A4 First scan of this launch not finished and no usable saved snapshot → the page renders a
  **skeleton**: the page's real structure with its static labels rendered (title, time-window card
  labels, side-card names, tab labels, trend title) and a placeholder block in every data slot — card
  values, side figures and their secondary rows, the trend chart with its axis and legend, the
  per-model rows. A scanning hint (spinner + copy) sits **inline in the title row**.
- A4a The skeleton is non-interactive: time-window cards, tabs and every other control under the
  page header refuse pointer input, and nothing shows a hover or selected affordance beyond a muted
  default-tab marker. The rail stays live — settings and the projects dimension both work. Changing
  language or appearance from settings restyles the skeleton like any page — its labels come from
  the same dictionaries and its colours from the same theme tokens.
- A4b Filling is in place: when the first snapshot arrives, data replaces placeholders with **no
  anchor moving** — the hint sits in the title row precisely so its disappearance causes no vertical
  shift. Two stated exceptions: the number of placeholder model rows is nominal, since the model
  count is unknown until the scan lands; and a machine whose sides report no usage at all collapses
  the usage-only regions (composition bar, legend, model rows) on fill, because the loaded page
  omits them — the skeleton is shaped for the common case of data being present.
- A4c The skeleton exists only while no live or restored snapshot is available. Later scans keep the previous
  data on screen and never fall back to the skeleton.
- A4d First scan failure without a restored snapshot → the skeleton and hint stay as they are; recovery rides the automatic
  rescan triggers (timer, window focus). A dedicated first-scan error state is out of scope. A usage archive that cannot
  be written or read is not a scan failure: the first scan leaves the skeleton as usual
  ([token-stats](token-stats.md) C4, C8).
- A4e Once the first snapshot lands with no side detected, A1's whole-page empty state replaces the
  skeleton — the two states never mix.

**Sequence B: sections and accounting**
- B1 The sections, in this order = Token / Instructions / Skills / Subagents / Plugins / MCP / Memory
  (agents-overview::REQ-006); a new component type extends this list.
- B2 A summary card's secondary row shows that side's project count, global skill count and subagent
  count — using the same accounting as the corresponding section, with one stated difference: the
  skill count is the side's own global library (its on-disk names), never the plugin entries the
  Skills section also lists (skills-view::REQ-001/AC-05; the same for every side, Claude's included
  — one label on every card cannot count two ways). The project count is every project the side's
  registry records, stale ones included: the list its link opens shows exactly those
  (agents-overview::REQ-007).
- B3 The Token totals **include stale projects** (this differs from the project list's default
  filtering; ADR-0022). The all-history card's label reads `Total · all history` bare, with no
  "(includes stale projects)" note; the inclusion is documented here rather than restated on the
  card.
- B4 Sections where the sides' concepts are asymmetric (the Codex group under Plugins, the Codex
  global entry under Memory) follow their own spec's probe-style rules, and no false signal is
  manufactured for the sake of symmetry.
- B5 Instructions section: an entry with no file shows "None" in its card rather than an error;
  oversized files are truncated; the card keeps about half the window's height and its files scroll
  inside it, as the prototypes draw it.
- B6 Token section (the default tab): a daily trend chart over 30 / 60 / 90 days, switchable between
  combined and a single side, and a cross-project model breakdown; the totals include stale
  projects (B3).
- B7 Skills section: every side's global library is merged into one column, with side badges showing
  which sides have each entry and symlinks marked; there is no cross-side content diff. On-disk
  skills expand to preview the package's files ([skills-view](skills-view.md)); global library
  entries can start an "Install to…" action; plugin entries are read-only and expand to preview the
  package ([plugins-view](plugins-view.md)).
- B8 Subagents section: the Claude Code, Codex and Antigravity CLI subagent definitions in one view
  ([subagents-view](subagents-view.md)). Plugins section: the plugin list grouped by side, with
  bundled components expandable. Memory section: a summary of each project's automatic memories,
  with viewing ([memory-view](memory-view.md)).
- B9 MCP section: each side's global MCP servers grouped by origin (global config / bundled with a
  plugin / `config.toml` / Antigravity CLI's global MCP file); a server its configuration disables
  is marked Disabled, and a plugin's server names the plugin it comes from.

**Cross-cutting**
- R1 Component-level boundaries live in each section's own spec and are not repeated here.
- R2 The automatic scan is shared by both dimensions, and a trigger arriving while one is in flight is
  deduplicated (projects-list C4).
- R3 Every restart opens Agents, and the global 30/60/90-day trend choice is remembered across
  restarts ([token-stats](token-stats.md)); the other choices are not (agents-overview::CON-003).

**Sequence G: the Grok side**
- G1 Grok's own global skills (its skills directory) list alongside the other sides'; what it
  borrows from Claude Code's configuration at runtime never joins its lists — the exclusion is by
  construction (only its own root is read), and the Skills section carries one line of copy saying
  the borrowing happens (ADR-0019).
- G2 Agent definitions, plugins, memory and user-level MCP ship as explicit empty states: on the
  reference machine those categories have no real data (no directories, no config sections), and
  per the AGENTS.md sampling invariant no parser is written from a documentation name alone. Each
  category's parser lands when a real sample exists.
- G3 The third summary card follows A2/A3 like the others; installing a Grok skill into a project
  lands in the project's own .grok/skills (the same copy semantics as the other sides).

## The Antigravity CLI side

### agents-overview::CON-004 The Antigravity side's name and colour (direct acceptance)

Applies to: every place the interface names or colours a side. The Antigravity CLI side is called
**Antigravity**: that full name where sides are named in full (hover layers, the side dropdown, a
session page's meta line), the badge **AG** where sides are badged, and the uppercase chip
**ANTIGRAVITY** where sides are chipped (side cards, a project's header, the stale note). Its colour is
the Google provider colour (ADR-0021); its badge pair is fill #dde7fb with text #3563b5 in the light
appearance and fill #1f2e49 with text #96b9f3 in the dark, varying with appearance and not with colour
scheme, like the other side colours. Documents keep "Antigravity CLI", to tell it from the desktop app
and the IDE (ADR-0037).

### agents-overview::REQ-003 The Antigravity side on the agents page

- agents-overview::REQ-003/AC-01: A summary card for the side: detected when agy's data root exists
  (A1, A2); its figure is the side's usage in the selected window; its third line is the side's project
  count, global skill count and subagent count (B2), each by the same accounting as its section.
- agents-overview::REQ-003/AC-02: When the scan left Antigravity conversations unread
  ([token-stats::REQ-004](token-stats.md)), the card's third line reads "N conversations couldn't be
  read" in the warning colour instead, with a tooltip saying that agy may have changed its conversation
  format in an update and that their usage is not counted; the figure above it stays. A count of zero
  shows the usual third line.
- agents-overview::REQ-003/AC-03: The Skills, Subagents and Plugins sections gain the side as
  [skills-view::REQ-001](skills-view.md), [subagents-view::REQ-001](subagents-view.md) and
  [plugins-view::REQ-001](plugins-view.md) define; the Memory section shows nothing for it
  ([memory-view](memory-view.md), Out of Scope).
- agents-overview::REQ-003/AC-04: The MCP section's Antigravity group lists the servers in agy's global
  MCP file (`~/.gemini/config/mcp_config.json`), a server marked disabled carrying the disabled pill,
  and the servers bundled with its effectively enabled plugins, under the name agy gives them
  (`<plugin>_<server>`, measured) and marked as coming from that plugin. A project's own
  `.agents/mcp_config.json` is shown nowhere: agy was not observed to load it (ADR-0037).

### agents-overview::REQ-004 Instructions shows CLAUDE.md and AGENTS.md

Applies to: the Instructions section of the agents page ([project-detail::REQ-002](project-detail.md)
governs the project page's).

- agents-overview::REQ-004/AC-01: The section has two entries, CLAUDE.md and AGENTS.md, not grouped by
  side (ADR-0037).
- agents-overview::REQ-004/AC-02: CLAUDE.md is `~/.claude/CLAUDE.md`.
- agents-overview::REQ-004/AC-03: AGENTS.md renders, one after another, every global AGENTS.md a side
  was observed to load that exists — `~/.codex/AGENTS.md`, `~/.gemini/AGENTS.md`,
  `~/.gemini/config/AGENTS.md`, in that order (agy loads both of its own, the root one first, measured)
  — each headed by its path. When none exists the entry shows "None".
- agents-overview::REQ-004/AC-04: The Codex `config.toml` summary is removed, and no settings summary is
  shown for any side.
- agents-overview::REQ-004/AC-05: agy's GEMINI.md files and its rules are shown nowhere; Grok's global
  AGENTS.md is not added, there being no sample of it.

### Failure modes and boundaries: the Antigravity side on the agents page

- agy installed but never used (data root present, no conversation, no trusted folder): the card is
  detected with zero usage and zero counts (A9 in the projects-list spec).
- An automatic update of agy breaks the format: the card's third line turns into the unreadable count
  at the next scan and back once the count returns to zero; the usage figure shows what could be read.
- The side's settings file is corrupt or unreadable (A3) while conversations were left unread: the third
  line explains the error, and the count shows once the error is gone — an error says the side's data is empty, which
  explains the figure more than the count does.
- The count is part of the saved snapshot (agents-overview::REQ-001): after a restart the notice is back
  before the first scan, which then replaces it.
- One of the three global AGENTS.md files cannot be read, a file inside a directory that cannot be entered
  included: its slot shows the read error under its path and the others render (B5); all three absent →
  "None". The read error takes the "None" line's form
  under the file's path heading: the prototypes draw no unreadable state, so the slot is made of two
  forms they do draw — declared as the prototype exemption (no new form).
- `~/.gemini/GEMINI.md` exists and no AGENTS.md does: the AGENTS.md entry shows "None"
  (agents-overview::REQ-004/AC-05).
- A global MCP file that does not parse: the Antigravity group shows no servers from it, the plugin
  servers still list, and the other sides are unaffected (the per-side degradation rule).
- The MCP section's Antigravity group shows whenever the side is detected or lists a server; empty, it
  says that neither the global file nor an enabled plugin brings one. A server's row is its name, its
  source, the Disabled pill when its configuration disables it, and for a plugin's server the note
  naming that plugin — one row form for every side's group, so Claude's plugin servers carry the note
  too. A server's command or URL is shown on no row: it can carry a token.
- Copy never enumerates the sides as a closed set: the unreadable notice names only this side's own
  conversations, and the Instructions entries are named by file, not by side.

## The Instructions section and the way into the project list

### agents-overview::REQ-006 The Instructions section's name and place

Applies to: the agents page's tab row, on the loaded page and on the startup skeleton (A4). The word follows the
glossary's Instructions.

- agents-overview::REQ-006/AC-01: The section's tab reads "Instructions" in English, and in Chinese the label the
  confirmed prototype draws.
- agents-overview::REQ-006/AC-02: The tabs run Token / Instructions / Skills / Subagents / Plugins / MCP / Memory.
  Token stays the tab the page opens on.
- agents-overview::REQ-006/AC-03: The startup skeleton's tab row shows the same labels in the same order.

### agents-overview::REQ-007 A side card's project count opens that side's projects

Applies to: a side card's project count, in the card's usual third line (B2).

- agents-overview::REQ-007/AC-01: A count of one or more is a control. Activating it, by pointer or by keyboard,
  opens the Projects dimension on that side's projects ([projects-list::REQ-002](projects-list.md)).
- agents-overview::REQ-007/AC-02: A count of zero is plain text, with no control, whether the side has registered
  nothing or is not detected.
- agents-overview::REQ-007/AC-03: At rest the control keeps the third line's secondary text colour with a thin
  underline in the strong line colour. On hover the text and the underline both take the primary text colour. A
  keyboard focus draws a visible ring in the accent colour.
- agents-overview::REQ-007/AC-04: The control does not change the height of the card or the width of the line:
  the card measures the same with a link as with plain text.
- agents-overview::REQ-007/AC-05: Only the project count is a control; the skill and subagent counts stay text.

Failure modes and boundaries, by what the user is doing when the card is drawn:

- **The startup skeleton is up** (A4, A4a): the third line is a placeholder, so there is no control.
- **A restored snapshot is showing while the first scan runs** (agents-overview::REQ-001): the control works from
  the restored data, and the list it opens shows the same restored data.
- **The side's third line shows its error or its unreadable count** (A3, agents-overview::REQ-003/AC-02): the line
  has no project count, so it has no control. The side can still be chosen in the project list's dropdown.
- **A scan lands between reading the card and activating the control**: the card and the list both draw from the
  snapshot in hand when the control is activated, so the count and the rows agree.
- **Coming back to the agents page**: from the rail, as after any departure, on Token with the all-history window
  (the page keeps neither across a switch of dimension).
- **The time window**: the project count does not depend on it, so the selected window changes neither the count
  nor what the control opens.
- **Introduced content**: the count is first-party text; nothing rendered from agent data becomes a control here.

## Startup restoration requirements

### agents-overview::REQ-001 Restore the previous snapshot

- agents-overview::REQ-001/AC-01: On a full quit and relaunch with a valid saved snapshot,
  show its overview and project-list data before the first background scan completes.
- agents-overview::REQ-001/AC-02: A successful background scan replaces restored data in place;
  settings and browsing remain usable during scanning.
- agents-overview::REQ-001/AC-03: Without a usable saved snapshot (missing, corrupt or incompatible
  format), retain the existing first-scan skeleton and its automatic recovery behavior.

### agents-overview::REQ-002 Identify data awaiting refresh

- agents-overview::REQ-002/AC-01: Restored data is accompanied by the existing scanning indicator
  while the first scan runs, without replacing the data area or blocking navigation.
- agents-overview::REQ-002/AC-02: Remove the scanning indicator when the first scan succeeds,
  without moving the page's content anchors.
- agents-overview::REQ-002/AC-03: A failed scan retains the restored data; automatic scan triggers
  continue to provide recovery. The failed state must not claim that fresh data has arrived.

### agents-overview::CON-001 Separate display restoration from accounting (direct acceptance)

Startup display data uses its own format version. An application or accounting-cache version
change alone does not discard compatible display data. Restored numbers are presentation input,
not a new scan result or input for overwriting the usage archive.

### agents-overview::CON-002 Keep restored permissions fail-closed

- agents-overview::CON-002/AC-01: Restored file and plugin-root allow-lists contain only registrations
  previously produced by the main process; a renderer-supplied arbitrary path never becomes readable
  because restoration is enabled.
- agents-overview::CON-002/AC-02: Before a source read admitted by a restored registration, recheck
  the target with lstat: file reads require a regular non-symlink file; plugin enumeration requires
  a directory with the existing package containment rules. Reject missing, invalid or replaced
  targets through the existing error path rather than following a replacement symlink.
- agents-overview::CON-002/AC-03: A fresh scan/detail enumeration establishes current registrations;
  restored registrations must not extend permission after that authoritative replacement.

### agents-overview::CON-003 Restore content, not navigation (direct acceptance)

Every full restart opens Agents. Project selection, session selection, scroll, expanded/collapsed
state, search text and time-window selection are not restored by this feature. Persisted appearance
and language preferences keep their existing behavior.

### agents-overview::REQ-005 Restore a newer build's saved data without the sides this build does not know

Applies to: every saved entry of the display copy — the snapshot, project statistics and every saved
page — and every side outside this build's set of agent sides, as a newer build that adds a side saves
them ([token-stats](token-stats.md), An archive a newer build wrote, says how a build meets one).

- agents-overview::REQ-005/AC-01: A key naming such a side in a record keyed by side is removed before
  the entry is checked against the contract, and the entry restores without it.
- agents-overview::REQ-005/AC-02: An entry naming such a side anywhere else — a side field, a list of
  sides, a usage row — is not restored, and every other entry restores (restart sequence, item 1).
- agents-overview::REQ-005/AC-03: No restored entry names such a side, as a key or as a value.

### agents-overview::REQ-008 Write the display copy while the window has no focus

Applies to: every change to the display copy — a scan's snapshot and project statistics, a saved page,
a registration the main process produced.

- agents-overview::REQ-008/AC-01: A change made while the window has focus is not written while it keeps
  focus. It is written when the window loses focus — to another application or window, or by being
  hidden, minimised or closed.
- agents-overview::REQ-008/AC-02: A change made while the window has no focus, or while there is no
  window — a timed scan in the background — is written right away.
- agents-overview::REQ-008/AC-03: A normal quit, the restart that installs an update included
  ([app-update](app-update.md) C1), writes every change not yet written before the app exits.
- agents-overview::REQ-008/AC-04: A crash or a forced quit loses at most the changes made since the window
  last gained focus; the next launch restores the copy last written (agents-overview::REQ-001), and its
  first scan replaces it.
- agents-overview::REQ-008/AC-05: A write that fails leaves its changes unwritten, and the next moment
  AC-01 to AC-03 name writes them (restart sequence, item 7).

### Failure modes and boundaries: restart sequence

1. Read saved data before exposing it. Envelope corruption falls back under
   agents-overview::REQ-001/AC-03; a corrupt individual page entry must not clear unrelated valid data.
2. Open Settings or Projects during the startup scan: agents-overview::REQ-001/AC-02 applies.
3. Cross a calendar day while the app is closed: use the display-clock requirements in
   [token-stats::REQ-001](token-stats.md), without changing stored observation timestamps.
4. Scan succeeds while a restored page is open: the page's own restoration requirements govern
   refresh; snapshot replacement alone must not destroy its last good payload.
5. Scan fails or a source disappears: agents-overview::REQ-002/AC-03 and
   agents-overview::CON-002 apply; no fabricated success or blank global replacement.
6. Quit during scanning: persist the last successful data, never partial scan output. An interrupted
   disk write must leave either the preceding complete record or the new complete record readable.
7. Write fails: keep the working in-memory app usable and retain the preceding disk record; a failed
   persistence operation must not clear visible data or be reported as a completed save.
8. Restore content containing links, markup, images or long text: route it through the existing
   rendering, sanitization, navigation and size boundaries. Display restoration grants no new
   capability to content, and it stores data rather than rendered executable HTML.
9. Launch this build after a newer build that adds a side saved the display copy: project statistics
   and pages naming the side only in a record keyed by side restore without it
   (agents-overview::REQ-005/AC-01). The snapshot does not restore when a project's or a skill's list
   of sides names the side, and the skeleton shows until the first scan (A4,
   agents-overview::REQ-001/AC-03); a session page or a skill-file listing of that side does not
   restore, nor do the saved answers of that page (agents-overview::REQ-005/AC-02).
10. Launch the newer build again after this build saved: its copy holds what this build saved, without
    the side; the newer build fills that side's empty values in as for any copy saved before the side
    existed (ADR-0020), and its first scan replaces them.
11. Interface: no page, state, copy or control is added or changed — the rule decides which saved
    entries the existing pages show (the prototype exemption, declared). It restores data, never
    rendered content, so item 8's boundaries are unchanged.
12. The window gains focus while a write is under way: the write completes, and changes made from then
    on wait for the next moment agents-overview::REQ-008 names. A change made while a write is under
    way is written by the next write, not lost to the one in progress.
13. Interface: agents-overview::REQ-008 decides when the copy is written, not what any page shows — no
    page, state, copy or control is added or changed (the prototype exemption, declared), and no new
    point renders or loads external content.
14. The engine module ([token-stats](token-stats.md), Scans and the window) will not load: every write
    of the copy fails as item 7 says and every scan fails as item 5 says. The copy is read at launch
    without the module, so each launch restores the copy last written (agents-overview::REQ-001).

### Startup implementation decisions

- Record successful snapshot and page-read results as they arrive, and write them when
  agents-overview::REQ-008 says, with ordered atomic replacement. A change is recorded without copying
  the data; the copy is serialised and written by the engine module (ADR-0045) only when it is written,
  and read at launch without it. A forced kill may lose writes not yet
  completed, never invalidate the previous complete save. No numeric retention limit has been approved.
- Main owns the saved data and produces validated page payloads; the renderer receives restored data
  before showing restored pages. Do not add an arbitrary renderer-to-disk cache-write API.
- Use the existing inline scanning form in the page heading, including the project-list heading
  once there are real rows to select. On failure, stop the spinner and retain a quiet waiting-for-
  update status. Placement and failure wording follow the original prototypes.
- Saving only main-side statistics and allow-lists is insufficient for the session page when its
  question index is missing. The saved page payload is the startup display source in that case.
- A side this build does not know (agents-overview::REQ-005) is removed from every record keyed by side
  before a saved entry is checked — the mirror of the fill that gives a copy saved before a side existed
  that side's empty values, applied to the same records. For token figures it removes only empty
  buckets: a non-empty one derives from usage rows naming the side (ADR-0025), which fail the contract,
  so that entry is not restored. For the side's other keyed facts — detected, symlinked, packaged — it
  removes facts this build shows nowhere.

## Implementation Decisions

- **Data source**: one scan produces the overview snapshot and every section consumes that same
  snapshot (no per-section rescans); the parts depending on the project registry (such as the Memory
  summary) are filled in once the project list is ready.
- **Contract**: the snapshot structure follows ADR-0001's single type source plus boundary
  validation.
- **Degradation granularity**: degrade per side (a single-side failure does not affect the other),
  never fail the whole page.
- **Skeleton**: a state of the same page, driven by "no snapshot yet". Static labels are the loaded
  page's own; placeholder blocks take the separator-line grey with a subtle opacity pulse that
  honours reduced-motion preferences. Placeholder geometry matches the loaded content's line boxes
  so the fill is shift-free (A4b).
- **Saved field names**: the Instructions section's saved fields `configs`, `claudeMd` and
  `agentsMd` keep their names, so the display copy's format does not change.
- **The project count is its own element** (agents-overview::REQ-007): the count and the rest of the
  line are separate, so one can be a control while the sentence stays each language's own.
- **Instruction files carry their paths** (agents-overview::REQ-004): each file the section shows
  travels with its absolute path, which heads it, and with its contents — or none, for a file that
  exists but cannot be read; an absent file is not sent, so an entry with no file shows "None". The
  global AGENTS.md files are a fixed list in AC-03's order, which keeps GEMINI.md, rules and Grok's
  AGENTS.md out by construction (AC-05). A snapshot saved before the files carried their paths restores
  with the two files that version read — CLAUDE.md and Codex's AGENTS.md — at the paths the main
  process knows them by, and without its settings summary (AGENTS.md: a saved page restores across an
  update).

## Out of Scope

- Links on a side card's skill and subagent counts.
- Write operations on the global library / plugins / memories (the one write operation is installing
  a skill into a project).
- Cross-component aggregate views. Global search is a page of its own and covers session questions only
  ([global-search](global-search.md)).
- Live file watching (startup scan + the automatic rescans only).
- A dedicated first-scan error state (A4d keeps the skeleton and lets the rescan triggers retry).
- Making a first installation or a cleared user-data directory show history before its first scan: no saved display data exists in that case.
- Settings summaries of any side (the Codex `config.toml` summary and the Claude project settings
  summary, ADR-0037), and agy's GEMINI.md files and rules.
- Antigravity CLI's memories and built-in skills.
