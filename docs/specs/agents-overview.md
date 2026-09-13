# Agents overview

> Related: [features](../features/agents-overview.md) · ADR-0001 (single type source) · ADR-0002 (dual seam)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01. Each section's component-level requirements and boundaries live in its own
> spec (subagents-view / memory-view / plugins-view / token-stats / skill-install); this document
> covers only **page-level** rules: which sections exist, the summary cards, and single-side
> degradation.

> Startup restoration uses the original page prototypes confirmed on 2026-09-14.
> Successful display payloads persist independently of the accounting index (ADR-0029).

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
5. As a user, I want the totals' accounting (including stale projects) recorded where I can find it,
   so that when the numbers do not match I know where the difference is (the card itself carries no
   note — see B3).
6. As a user, I want the page's structure visible as a skeleton while the first scan runs, so that
   launching the app never looks like a blank or hung window even when the scan takes long.

## Failure modes and boundaries

**Sequence A: page load**
- A1 Neither side detected → a whole-page empty state with guidance (which agent to install), not an
  error.
- A2 One side not detected → that side's card shows "not detected", the other behaves normally.
- A3 One side's registry corrupt → that side's card shows an error explanation (in place of the stats
  row), the other side is unaffected.
- A4 First scan of this launch not finished and no usable saved snapshot → the page renders a **skeleton** (changed 2026-08-21;
  it used to be a bare hint on an otherwise empty stage): the page's real structure with its static
  labels rendered (title, time-window card labels, side-card names, tab labels, trend title) and a
  placeholder block in every data slot — card values, side figures and their secondary rows, the
  trend chart with its axis and legend, the per-model rows. A scanning hint (spinner + copy) sits
  **inline in the title row**. The hint copy no longer promises that nothing is shown before the
  scan finishes — that sentence became false with this change and is rewritten in all six languages.
- A4a The skeleton is non-interactive: time-window cards, tabs and every other control under the
  page header refuse pointer input, and nothing shows a hover or selected affordance beyond a muted
  default-tab marker. The rail stays live — settings, the projects dimension and refresh all work
  (refresh is deduplicated against the in-flight startup scan per R2). Changing language or
  appearance from settings restyles the skeleton like any page — its labels come from the same
  dictionaries and its colours from the same theme tokens.
- A4b Filling is in place: when the first snapshot arrives, data replaces placeholders with **no
  anchor moving** — the hint sits in the title row precisely so its disappearance causes no vertical
  shift. Two stated exceptions: the number of placeholder model rows is nominal, since the model
  count is unknown until the scan lands; and a machine whose sides report no usage at all collapses
  the usage-only regions (composition bar, legend, model rows) on fill, because the loaded page
  omits them — the skeleton is shaped for the common case of data being present.
- A4c The skeleton exists only while no live or restored snapshot is available. Later scans keep the previous
  data on screen and never fall back to the skeleton.
- A4d First scan failure without a restored snapshot → the skeleton and hint stay as they are; recovery rides the automatic
  rescan triggers (timer, window focus). A dedicated first-scan error state is out of scope.
- A4e Once the first snapshot lands with no side detected, A1's whole-page empty state replaces the
  skeleton — the two states never mix.

**Sequence B: sections and accounting**
- B1 The set of sections = Token / Skills / Subagents / Plugins / MCP / Memory / Configuration; a new
  component type extends this list (ordered most-used first).
- B2 A summary card's secondary row shows that side's project count, global skill count and subagent
  count — using the same accounting as the corresponding section.
- B3 The Token totals **include stale projects** (this differs from the project list's default
  filtering; "hidden" left this rule with ADR-0022). The all-history card carried an explicit
  "(includes stale projects)" note until 2026-08-22, when the note was retired by user decision —
  the label reads `Total · all history` bare, and the inclusion is documented here rather than
  restated on the card.
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

**Sequence G: the Grok side**
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

### Startup implementation decisions

- Save successful snapshot and page-read results during normal operation, with ordered atomic
  replacement and a normal-quit flush. A forced kill may lose writes not yet completed, never
  invalidate the previous complete save. No numeric latency or retention limit has been approved.
- Main owns the saved data and produces validated page payloads; the renderer hydrates its query
  layer before showing restored pages. Do not add an arbitrary renderer-to-disk cache-write API.
- Use the existing inline scanning form in the page heading, including the project-list heading
  once there are real rows to select. On failure, stop the spinner and retain a quiet waiting-for-
  update status. Placement and failure wording follow the original prototypes confirmed on 2026-09-14.
- Saving only main-side statistics and allow-lists is insufficient for the session page when its
  question index is missing. The saved page payload is the startup display source in that case.

### Startup verification decisions

Reuse the existing fixture-home / user-data-directory Electron seam and first-scan/fetch delay
injections, plus a fixture-only count of failing scans. Visit pages in process A, quit, relaunch process B with the same user-data directory and
hold its first scan. Assert that the restored pages render before release of that scan. Repeat with
an incompatible accounting cache, a missing display cache and a corrupt display entry. Complete or
fail the scan and inspect visible data, page anchors and current expansion state. At the existing
filesystem and IPC contract seams, verify atomic persistence, independent versions, failed writes,
registration admission and replacement. No prototype mock is implementation evidence.

## Implementation Decisions

- **Data source**: one scan produces the overview snapshot and every section consumes that same
  snapshot (no per-section rescans); the parts depending on the project registry (such as the Memory
  summary) are filled in once the project list is ready.
- **Contract**: the snapshot structure follows ADR-0001's single type source plus boundary
  validation; adding a section requires extending the validation at the same time (forgetting means
  it passes silently).
- **Degradation granularity**: degrade per side (a single-side failure does not affect the other),
  never fail the whole page.
- **Skeleton**: a render-layer state of the same page, driven by "no snapshot yet" — the main
  process is untouched. Static labels come from the dictionaries (the same keys the loaded page
  uses); placeholder blocks take the separator-line grey with a subtle opacity pulse that honours
  reduced-motion preferences (settled in the prototype, 2026-08-21). Placeholder geometry matches
  the loaded content's line boxes so the fill is shift-free (A4b).

## Testing Decisions

Following ADR-0002's dual seam: fixture unit tests at the providers layer cover single-side absence
and corruption degradation and snapshot assembly; the contract validation round trip; e2e covers that
switching through every section renders with no main-process errors (adding a section requires
updating the tab count assertion).

The skeleton (A4 family) is tested at the e2e seam: an environment-injected delay holds the first
scan open (the same injection family as the rescan intervals), so the skeleton window is a stable
state rather than a race. Assertions are render-level, not existence-level: the placeholder blocks
are visible, controls under the header refuse pointer input (hit-testing, not attribute checks), and
the in-place fill is asserted **geometrically** — key anchors' positions measured before and after
the snapshot arrives (the same discipline as the project list's floating-layer assertions).

## Out of Scope

- Write operations on the global library / plugins / memories (the one write operation is installing
  a skill into a project).
- Cross-component aggregate views and global search.
- Live file watching (startup scan + the automatic rescans only).
- A dedicated first-scan error state (A4d keeps the skeleton and lets the rescan triggers retry).
- Making a first installation or a cleared user-data directory show history before its first scan: no saved display data exists in that case.
