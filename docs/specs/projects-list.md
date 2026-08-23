# Project list

> Related: [features](../features/projects-list.md) · ADR-0002 (dual seam) · ADR-0019 (what a registry is, per side) · ADR-0021 (side colour) · ADR-0022 (manual hiding removed)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01 — the requirements and boundaries were inferred from features, the existing
> test cases and the code's behaviour, since the original reasoning was lost with `.scratch/`. The
> boundary entries all have corresponding tests and are trustworthy; where one conflicts with the
> implementation, the implementation wins and this document is rewritten in place.

## Problem Statement

Projects are scattered across each agent side's own registry, so "see all the projects I have" means
digging through as many sets of configuration as there are sides, and the same directory is recorded
once on each of them. What counts as a registry differs per side — a key in a JSON config, a table in
a TOML config, a trusted-folder ledger — but the concept is the same one: the record that side keeps
because the user decided something about that directory (ADR-0019).

## Solution

Take the union of every side's registry, one directory to one project, sorted by activity. A row
carries **how many sides use it** as a single count rather than one badge per side, with the sides
themselves named on hover — the count is what the eye needs while scanning, the names are what a
second of attention asks for, and this keeps the row's width independent of how many sides exist.
Provide search, side filtering and stale filtering — all of which are this app's browsing preferences
and are never written back to any agent configuration.

## User Stories

1. As a user, I want the same directory registered on several sides merged into one entry that says
   how many sides use it, so that I do not have to dig through each side's configuration and do not
   see duplicates.
1a. As a user, I want to see *which* sides those are without leaving the list, so that I can tell a
   Claude-only project from one I also drive with another agent — without that costing row space on
   every row.
2. As a user, I want the default sort to be activity (most recent session time) with the relative
   time shown, so that what I have been working on lately is at the top.

> The row's trailing session count was removed on 2026-08-16 with the side-count badge's arrival
> (settled in the project-list prototype): two numbers at the row's end read as one, and the number
> that matters per project lives in the sessions tab. `ProjectEntry.sessionCount` stays in the
> contract — activity keeps both quantities — but currently surfaces nowhere. The engine's backfill
> covers all three sides since the session ticket landed (2026-08-16).
3. As a user, I want to search by name or path and filter by agent side, so that I can find things
   quickly when there are many projects.
4. As a user, I want stale projects (in the registry, directory deleted) collapsed by default but
   revealable, so that the list stays clean without losing the cleanup lead.
5. As a user, I want the list's structure with placeholder rows rather than an empty list before the
   first scan finishes, so that I do not mistake "not scanned yet" for "no projects" and the app
   never looks blank on launch (changed 2026-08-21; it used to be a bare hint on an empty stage).

> Manual hiding was story 5 until 2026-08-16, when it was removed (ADR-0022). The constraint it
> answered to — registries are read-only to this app, so directories the user does not care about
> accumulate in the list — still holds; the judgement was that the clutter has not materialised at a
> scale worth a permanent hover slot for. Recorded here because the constraint outliving the feature
> is what would make someone re-propose it.

## Failure modes and boundaries

**Sequence A: startup scan → list rendering**
- A1 No side's data directory exists → an empty snapshot with `detected=false` for every side, no
  throw.
- A2 Only some sides exist → `detected=true` for those, with the others' empty state alongside.
- A3 One side's registry is corrupt → that side degrades to empty with an error explanation, and
  **every other side behaves normally** (a single-side failure does not clear the whole table).
- A4 The same directory is registered on several sides → merged into one entry whose count equals the
  number of sides.
- A5 Trailing-slash or casing differences in the path → normalised, producing no duplicates.
- A6 A registry record whose directory has been deleted → marked stale, and does not vanish from the
  list.
- A7 A directory that has sessions on a side but **no registry record** on it → not a project from
  that side's point of view: it does not enter the list and does not raise the count of an entry that
  other sides did register. Its tokens still count toward global totals (ADR-0019, and the same rule
  the Claude side already followed for unregistered directories).
- A8 The count is the number of sides holding a registry record, not the number of sides with
  sessions — the two differ exactly in the A7 case, and the list is a view over registries.
- A9 A side that is installed but has registered nothing (its data directory exists, its registry is
  absent or empty) → `detected=true` with no projects contributed. This is a normal state for a
  newly adopted side, not a failure, and must not be reported as one.
- A10 First scan of this launch not finished → the dimension renders a **skeleton**: the sidebar
  shows its real structure — the search field and the filter row greyed with their static labels —
  above placeholder rows whose geometry (row height, name/count/activity slots) matches real rows;
  the detail area shows the scanning hint centred **in place of** the pick-a-project empty state,
  because with nothing to pick yet that guidance would be false. The hint copy is one dictionary
  entry shared with the agents overview; its old parenthetical promised the pre-skeleton behaviour
  and is rewritten in all six languages.
- A11 The skeleton is non-interactive: search, the side dropdown, the stale toggle and the
  placeholder rows all refuse input; the rail stays live (dimension switch, settings).
- A12 The skeleton exists only before this launch's first snapshot; later scans keep the
  previous list on screen and never fall back to the skeleton. Filling is in place — placeholder
  and data rows share their geometry, so the swap moves no anchor; the placeholder row count is
  nominal (the project count is unknown until the scan lands).
- A13 First scan failure → the skeleton and hint stay; recovery rides the automatic rescan triggers
  (timer, window focus). A dedicated error state is out of scope (the agents overview spec carries
  the same rule as A4d).

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
- B6 Sessions on several sides → the count is the sum over the union and the time is the largest.
- B7 The Grok side stores a session as a **directory** rather than a file; activity reads the mtime of
  the one file inside it that is the authoritative stream (ADR-0019), so "the session file's mtime"
  keeps one meaning across all sides.
- B8 A Grok child session sits **beside** its parent rather than beneath it, and is identified as a
  subagent by what its own record says it is — never by directory depth. It does not count toward the
  session count and does not push the most recent time up (the same rule as B3).
- B9 Activity counts sessions from **every** side that has them, including a side that did not
  register the directory. So a project registered on one side only can show a session count and a
  most-recent time drawn partly from another side, while its side count stays at one. The two answer
  different questions — "how many sides claim this project" versus "when was this directory last
  worked in" — and are deliberately not reconciled; A8 is where they visibly diverge.

**Sequence C: filtering**
- C1 Search, side filtering and stale filtering all **stack**, never overriding one another.
- C2 No browsing preference is written to any agent configuration (uninstalling this app does not
  affect the agents). This outlives the hiding feature it was originally written for: it governs any
  preference this list grows.
- C3 — withdrawn with manual hiding (ADR-0022). The number is left unused rather than reassigned, so
  that an old reference to C3 fails to find anything instead of finding a different rule.
- C4 Scan triggers that coincide are deduplicated (no concurrent scans): with the manual control gone
  (2026-08-23) the coinciding pair is the timed backstop and a focus trigger, and the second one
  joins the in-flight scan rather than starting another.
- C5 Side filtering is a **single-choice dropdown** defaulting to all sides, not one control per side:
  the row of controls has to stay readable as sides are added, and in the narrowest supported sidebar
  the longest of the six UI languages must not push it out of the column. The row's occupants *can*
  outgrow that column (found 2026-08-16: the prototype's width readout was blind to the stale toggle
  and the stale counter, which it hard-coded in Chinese — the shortest of the six). Ruled the same
  day: the stale counter yields first, ellipsizing down to a floor with its full sentence on its
  title; the toggle label wraps onto a second text line only when its own natural width exceeds the
  column; nothing crosses the column's content edge.
- C6 Hovering the side count opens a layer naming the sides in full. It is a layer over a clipped,
  scrollable list, so it owes both floating-layer obligations (CONTEXT's invariant): it escapes the
  ancestors' clipping, and it answers for a stale anchor — dismissed on any scroll but its own, and
  dismissed on resize, because it is being glanced at rather than operated.
- C7 The dropdown, being operated rather than glanced at, **repositions** on resize instead of
  closing; it dismisses on scroll like any anchored layer.

## Implementation Decisions

- **Merge key**: the normalised path is the unique key (trailing slash and casing normalised), taking
  the union of every side; one directory, one entry.
- **Registry per side**: each side's registry is the per-project record it keeps on a user decision,
  never a by-product of where it stores sessions (ADR-0019). Reading it is per-side; what "registered"
  means is not.
- **Activity**: attribution is per-side (an encoded directory listing, a rollout's first-line `cwd`, a
  session directory named by the encoded working directory), but the resulting quantities are one
  concept — most recent session time and session count — and subagent threads are excluded on every
  side.
- **Side identity in the row**: a count, plus a hover layer naming the sides. Side colours appear
  only in that layer and in the side dropdown's options (both name sides in full), and are the side
  colours defined in ADR-0021 rather than a palette local to this list. The count itself carries no
  side's colour — it says "how many", and colouring it would read as "which".
- **Refresh**: scanning is automatic only (focus + timed backstop, in-flight deduplicated). The rail's
  global refresh control was removed on 2026-08-23 — it held ⌘R, shadowing the platform reload, and
  the automatic triggers already covered staleness. See Out of Scope for what that costs.
- **Selection is a deeper wash, not a ring** (settled 2026-08-21 on the project-list prototype):
  hover = `--accent-soft`, selected = `--accent-soft-deep` (a new token, accent mixed 26% into card,
  baked per theme × light/dark), no outline. The old ring was an outline, which paints outside the
  border box and rode on the neighbouring row's hover background; hovering the selected row keeps
  the deep wash. Adjacent rows keep a 1px gap so a selected and a hovered wash never read as one
  block.
- **Skeleton**: a render-layer state of this dimension, driven by "no snapshot yet" — the main
  process is untouched. The sidebar's static labels come from the dictionaries (the same keys the
  loaded page uses); placeholder blocks take the separator-line grey with a subtle opacity pulse
  that honours reduced-motion preferences, and placeholder rows share the real rows' geometry
  (settled in the prototype, 2026-08-21). One skeleton form language across both dimensions — the
  agents overview's skeleton uses the same placeholder colour and pulse.

## Testing Decisions

Following ADR-0002's dual seam: `ScanRoots` fixture unit tests at the providers layer cover the
registry union, corruption degradation, path normalisation, activity attribution and subagent
exclusion — with a fixture per side, since each side's registry and session layout differ while the
resulting entries must not. The A7/A8 distinction (sessions without a registry record) needs its own
fixture case, because it is the one place where "has sessions" and "is a project" come apart.

UI interactions are covered by e2e, and the two floating layers (C6/C7) need **geometric** assertions
rather than existence ones: a clipped or mislaid layer reports a perfectly ordinary bounding box, so
the check that distinguishes it is hit-testing the layer's own centre and confirming the point belongs
to it. Their opposite resize answers are each asserted, since a layer that dismisses when it should
reposition looks identical to one that was never opened.

The skeleton (A10–A13) is tested at the e2e seam: an environment-injected delay holds the first scan
open (the same injection family as the rescan intervals), making the skeleton a stable state rather
than a race. Assertions are render-level — placeholder rows visible, the sidebar's controls refusing
pointer input by hit-testing (not attribute checks), and the in-place fill asserted geometrically
(row height and first-row position measured before and after the snapshot arrives).

## Out of Scope

- Live file watching: data only updates on the startup scan and the automatic rescans.
- A manual refresh control (removed 2026-08-23). The cost is accepted: an action taken outside the
  app — or an install made inside it — becomes visible at the next automatic scan rather than on
  demand.
- Adding or removing project registrations from this app (the registries are read-only).
- Cross-project content search.
