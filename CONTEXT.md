# Agentshed

A desktop overview and management tool for Claude Code, Codex and Grok: see what each project has installed,
how many tokens it has burned, and which artifacts it has accumulated — and install or remove skills
from the global library. This file is the domain glossary.

## Language

**Project**:
Any working directory recorded in an agent side's registry; the sides are unioned, one directory to
one project. A **registry** is the per-project record a side keeps because the user decided
something about that directory — not a by-product of wherever that side happens to store its session
files (ADR-0019). A directory with sessions but no registry record is therefore not a project: its
tokens still count toward global totals, it simply does not appear in the list.
_Avoid_: repository, workspace

**Stale project**:
A project still recorded in a registry whose directory no longer exists on disk; filtered out by
default, can be toggled on.
_Avoid_: dead project, invalid project

**Agent side**:
A data source. Enumerated: Claude Code, Codex, Grok.
_Avoid_: tool, CLI, platform; `grok-build` (that is the name of a profile *inside* the Grok side, not
the side)

**Global library**:
The set of skills at an agent's global layer, and the only source for a project install. Read-only
as far as this product is concerned — its contents are never added to, changed, or removed via the app.
A side's global layer holds what lives under **that side's own** configuration root; what it reads
out of another side's at runtime is not part of it (see "Compatibility-borrowed component").
_Avoid_: marketplace, store

**Compatibility-borrowed component**:
A skill, subagent, plugin or MCP server that one agent side loads from **another** side's
configuration at runtime. It belongs to the side that owns it on disk and never joins the borrowing
side's lists; instead the borrowing side's grouping says in copy that the borrowing happens, so what
is left out stays visible rather than silent (ADR-0019).
_Avoid_: shared component (nothing is shared — one side is reading the other's files); inherited

**Project install**:
Landing a skill from the global library into the project's own directory as a full copy. Uninstalling
deletes the in-project copy; the project is self-contained and does not depend on the global library
continuing to exist.
_Avoid_: symlink, sync

**Effective view**:
The component listing shown on the project detail page. Skills and subagents diverge here
(skills-view B1) — subagents: project-level entries are shown alongside the effective entries from
that side's global layer, with same-name entries marked as shadowed; skills: within one side, a
same-name pair shows only the project-level entry, with no shadowed global row and no
shadowing/coexistence badge (this is a list *presentation* rule and does not change either side's
runtime loading semantics). The skills effective view also includes skills bundled with effectively
enabled plugins (namespace-isolated, not participating in same-name shadowing).
_Avoid_: installed list

**Subagent**:
A specialised assistant described by an agent definition file (Claude: `agents/*.md`;
Codex: `agents/*.toml`), which runs in its own context when delegated a subtask. Strictly distinct
from "agent side": a side is a data source, a subagent is a kind of component within a side.
_Avoid_: agent (bare, confusable with agent side)

**Memory**:
Cross-session notes generated automatically by an agent. Generated content — this product only
displays it. Per-project on the Claude side (`MEMORY.md` + topic files); a global directory on the
Codex side, shown probe-style (only when non-empty).
_Avoid_: notes (too general); `CLAUDE.md` (human-authored instructions — that is configuration)

**Effective enabled plugins**:
The set of plugins actually in effect from a given project's point of view: those resolving to true
after `enabledPlugins` is merged across the local > project > user layers. The global page uses the
user layer.
_Avoid_: installed (installed ≠ enabled)

**Plugin-bundled components**:
The skills / subagents / hooks / MCP servers shipped inside a plugin package, which come and go with
the plugin as a unit. The discovery path is the union of the directory convention and the fields
declared in the manifest.
_Avoid_: plugin features (too general)

**Artifact**:
The five kinds of document a project accumulates under the eight-step process: ADRs, `CONTEXT.md`,
the feature catalogue (`features`), postmortems, and prototypes. Working documents (`.scratch`) are
not artifacts.
_Avoid_: docs (too general)

**Activity**:
The default sort dimension of the project list, composed of most-recent-session time and session
count. "Most-recent-session time" here is **the session file's mtime**, which is a **separate
pipeline** from a session's own "last activity time"; "session count", however, **shares its source
with the session list** (counting only real sessions, not warmups or subagents). Time diverges,
count converges — the asymmetry is deliberate. The other pipeline takes the largest timestamp inside
the file (see "Session"). The two are deliberately not unified: mtime is a cheap approximation over
nearly two thousand files, and reading contents instead would push the project list's first-paint
cost up to the level of a full scan. The price is that the two disagree when a file is touched
without its contents changing. Accepted.
_Avoid_: treating the two times as one; "unifying them while we're here" (tests pin the boundary)

**Session**:
One conversation record on an agent side, uniquely identified by the absolute path of its source
file. Where a side stores a session as a **directory** rather than a single file, that identity is
the one file inside it that carries the conversation, the tool calls and the per-turn usage together
— the authoritative stream (ADR-0019). The directory's other files are not sessions of their own,
and a child session stored beside its parent rather than beneath it is still a subagent, judged by
what the record says it is and never by how deep it sits. **A record containing no real human question at all (a warmup session the agent opened by
itself, or a pure-replay fork verified to have been stripped empty) does not count as a browsable
session**, and does not enter the list — but its tokens still count, the same rule as subagents.
Its "last activity time" is **the largest timestamp inside the file** (same meaning on every side;
a separate pipeline from project activity, which uses mtime — see "Activity").
The session page is **indexed primarily by question** (every real question listed once; fork replay
prefixes and abandoned branches do not enter the trunk); clicking a question fetches that **turn** on
demand. Searchable within a project (searches questions by default). The full specification is in
`docs/specs/session-view.md` (fully shipped 2026-08-06; the export feature was dropped).
_Avoid_: chat log

**Filtering** (as opposed to **searching**):
Two things this product does that look alike on screen and are not the same. **Filtering** narrows a
list already fully in hand — the skills lists match a typed substring against the name and hide the
rest, entirely in the renderer, with nothing crossing IPC. **Searching** goes and looks: the sessions
search crosses IPC, reads file contents on the main side, and comes back with hit counts, snippets
and folded groups. The distinction is worth naming because the resemblance is inviting: a search box
above a list suggests "make these consistent", and routing a filter through IPC would buy nothing
while costing a round trip per keystroke. When adding a box above a list, decide which of the two it
is first — the answer determines whether the contract changes at all.

That question is one for **specs, ADRs and code**. User-facing copy is free to say "search" — it is
the word people look for, and the placeholder does say it.
_Avoid_: treating the two as one mechanism because they share a visual form

**Turn**:
Everything recorded from one real question up to the next (assistant prose, tool calls and returns,
subagent dispatches). A turn is identified by a **byte range** in the source file; fetching one on
demand reads only that range and is independent of total file size. Turn contents are normalised
through a common block model (prose / thinking / reasoning / tool / subagent / unknown-trace) for
rendering; unknown types outside the display allow-list leave a trace and are never silently dropped.
_Avoid_: message pair, question-answer pair

**Data day**:
A day within the trend window whose total under the current view is > 0. The x axis only emits date
labels for data days (see ADR-0009).
_Avoid_: non-zero day, active day

**Supported language**:
A language the app UI can be switched to. Enumerated: Simplified Chinese, English, French, Russian,
Spanish, Japanese. All six are left-to-right; this product makes no RTL commitment (see ADR-0013).
_Avoid_: the six official UN languages (this product's six exclude Arabic); locale (too general)

**Language preference**:
The value the user selects in settings, which is persisted. Either "follow system" or one specific
supported language; defaults to "follow system". "Follow system" is a **continuously applied policy**,
not a snapshot of the language at the moment of selection — if the system language changes later,
the UI changes with it.
_Avoid_: current language, selected language (neither distinguishes the preference from its resolution)

**Effective language**:
The language the UI is actually using right now; always one specific supported language. Derived
from the language preference: if the preference names a language, that one; if it is "follow system",
resolve the system's preferred-language list in order, take the first supported one, and fall back to
English if none match. Never persisted itself.
_Avoid_: default language

**Source language**:
Simplified Chinese; the single source of truth for UI copy. New copy is written in the source
language first, and the other five are derived from it and aligned entry by entry — there is no
"temporarily blank" intermediate state. Strictly distinct from "effective language": the source
language is where copy is **authored**, regardless of which language a user is looking at.
_Avoid_: default language, primary language

**Appearance**:
The user's preference for a light or dark UI. Either "follow system", "light", or "dark"; defaults to
follow system. Orthogonal to the **theme** — any combination is valid. Structurally identical to
"language preference": "follow system" is a continuously applied policy, not a snapshot, and the
**effective appearance** it produces together with the system appearance is what actually renders.
The effective appearance is never persisted itself.

The word follows Apple, which calls light and dark the two *appearances*; the platform this product
ships on is the one whose vocabulary a user already has.
_Avoid_: dark mode (states only half of it), theme (that names the other axis here), day/night

**Theme**:
Which palette the UI renders in. Enumerated: purple (default), mist blue, amber brown. Orthogonal to
the **appearance** — all combinations are valid, and choosing one leaves the other alone.

The word follows Primer, whose structure is the same as ours: several themes, each rendering in
either appearance. **Deliberately not "colour scheme"** — CSS's `prefers-color-scheme` and SwiftUI's
`ColorScheme` both mean *light/dark*, so that name is already spoken for by the other axis, and
`theme.css` would otherwise read as if `prefers-color-scheme` and `data-scheme` were the same
dimension. They are not.

The code says `theme` too — identifiers, the DOM attribute `data-theme`, and the persisted preference
key. The rename deliberately shipped **without** reading the old `scheme` key: the cost, accepted at
the time, is that anyone who had already chosen a theme falls back to purple once after upgrading.
`language` and `mode` kept their key names and are unaffected. Recorded so that a later reader finds
a decision here rather than a missing migration.
_Avoid_: colour scheme (means light/dark elsewhere), skin, palette (fine in prose, but it is the
*contents* of a theme rather than the choice itself)

**Side colour**:
The single colour that identifies one agent side wherever it is named — a list badge, a legend swatch,
a stacked segment. It is that side's **provider** colour, so the same value serves both (ADR-0021).
Distinct from the **accent**, which says "selected" rather than "which side"; the two being the same
value is the defect ADR-0021 was written about, not a resemblance to preserve.
_Avoid_: badge colour (names one of its uses), brand colour (these are ours, not the vendors')

**Usage row**:
One day's usage at the finest grain the aggregation produces — day × side × project × model, carrying
all four token fields. One shape serves three roles: the archive's persisted grain (ADR-0007), part of
the wire contract, and the single source every token figure derives from (ADR-0025) — the totals, the
trend, and whatever a selected **time window** needs. A row with an empty day is on record but
attributable to no day: it joins the whole-history figures and no bounded window.
_Avoid_: archive row (names one of its roles), usage event (an event is per turn; a row is per day)

**Time window**:
The span a token figure is scoped to: all history, today, the last 7 days, or the last 30 days — a
closed set, selected by clicking the card that shows that window's total. Cut against the snapshot's
scan anchor, not the wall clock, so "today" always means the trend chart's last bar. Distinct from the
**trend chart's own 30-day span**, which never changes: a narrower window dims bars, it does not
remove them.
_Avoid_: date range (suggests arbitrary endpoints, which are out of scope), period (ambiguous between
this and the chart's span)

**Theme variable classes**:
Every variable declared in a theme block belongs to exactly one of three classes, and the class —
not a count — decides where it has to be defined. Which class it is follows from one question: what
is its relationship to the surface it sits on?

- **theme-varying** — it *constitutes* the surface or the text on it (page background, card, text,
  lines, accent). Defined per theme × per appearance. Currently 9 variables.
- **appearance-varying** — it sits *on* a surface and must stay legible against it (shadows, status
  backgrounds, badge fills). One value per appearance, shared across themes. Currently 20.
- **static** — it is an opaque block carrying its own ground (a destructive button, a callout), so no
  surrounding surface applies. One value throughout. Currently 4. The name follows Primer and
  Material, which both use *static* for exactly this.

Verified by measuring, never by counting definitions: switch through every theme × appearance and
read the resolved values — the class predicts which of them must differ and which must match. A
count cannot see the failure that matters, because a variable defined for light and forgotten for
dark still *resolves* in dark, having inherited the light value.
_Avoid_: judging by how many places a variable is defined in (see above); "functional colour" for the
static class (measured: `--warn-*` is functional yet appearance-varying, so the two do not line up)

**Structured error**:
Failure information crossing the IPC boundary, composed of an error code and parameters, containing
no natural-language wording at all. The wording is produced in the renderer in the current language
(see ADR-0015).
_Avoid_: error message (bare, implies a finished sentence)

## Invariants

- **The decision layer of every host security guard must be a testable pure function (settled
  2026-08-02)**: navigation allow/deny, external-link allow-listing, IPC sender validation, the CSP
  policy, protocol path resolution — all extracted as pure functions with unit tests covering
  **bypass vectors** (origin prefix lookalikes, casing, userinfo, encoded traversal). Rationale:
  there is no reliable automated gate for this class of defect (Electron's official runtime warnings
  do not cover navigation / new windows / webviews; the mainstream SAST tools are unmaintained and
  have demonstrated blind branches), so our own tests are the only line of defence. The current state
  item by item is in `docs/ops/electron-security.md`; the checklist and criteria are in the
  electron-scaffold skill.

- **A floating layer over a clipped list owes two separate obligations (settled 2026-08-10)**: it must
  **escape the ancestors' overflow clipping**, and it must be **positioned from its anchor's measured
  rect and answer for that position once the rect goes stale** (scroll, resize, or the anchor row being
  filtered away — what the answer *is* differs per event, see below). The two are not interchangeable —
  escaping the clip is what makes it visible at all; re-measuring or dismissing is what stops it lying
  about where it points. Satisfying one and assuming
  the other is covered is precisely how this goes wrong.

  **Viewport positioning discharges the first obligation on its own**: a viewport-positioned element's
  containing block is the viewport, which is not inside any ancestor, so no ancestor's overflow clips
  it — it does **not** additionally need to be portalled out of the list. (Stated the other way round
  once, which would have forced a pointless portal; the install popover disproves it by sitting inside
  the clipping card and rendering fine.) What does still clip such an element is an ancestor that
  creates a containing block for it — a transform, filter or perspective — so that, not nesting, is
  what to check. It already went wrong once:
  the install popover hung off a wrapper whose class no rule defined, fell back to the initial
  containing block, and landed below the bottom of the window, so installing looked like a dead
  button (fixed 2026-08-10). **Note the shape of that failure — the popover was in the DOM with a
  perfectly ordinary bounding box the whole time.** A clipped or mislaid layer reports geometry
  exactly like a working one, so "the element exists" and "the element is visible" prove nothing here;
  the check that distinguishes them is hit-testing the layer's own centre and confirming the point
  belongs to the layer. Applies to the install popover, the skill-name tooltip and the language
  selector's dropdown today, and to any further such layer.

  **Both obligations now have code carriers**, so a new layer inherits them rather than reimplements
  them: the shared surface carries viewport positioning (hence the escape from clipping), and a shared
  hook watches for the events that invalidate a measured position. What the hook deliberately leaves
  to each layer is *computing coordinates* — one flips above/below its button, one right-aligns using
  its own rendered width, one clamps against the window edge, and folding those together would need a
  parameter per difference.

  **Scrolling dismisses — except the layer's own. A resize is the caller's choice.** Dismiss for a
  layer being glanced at (a hover tooltip, gone the moment the pointer moves); reposition for one the
  user is operating (a menu they are choosing from — a resize is not them changing their mind).

  **A scroll hard on a resize's heels is the browser's, not the user's (settled 2026-08-16, #122).**
  A resize makes the browser clamp a scrolled container's scrollTop back into its new range and
  dispatch a scroll event for the clamp — indistinguishable at the event level from a user scroll,
  so without attribution it dismisses the layer and overrides the reposition the resize handler just
  performed; the 'reposition' choice never survived in practice. The shared hook attributes by
  ordering (a scroll within a short window after a resize is the resize's), at the documented cost
  of swallowing a wheel scroll performed while dragging the window edge. Tests that dispatch both
  events must keep their scroll cases clear of that window or they assert the swallowing, not the
  dismissal.

  The scroll exception is not a detail: a document-level capture listener hears the layer scrolling
  its **own** contents too, and a scrollable layer that closes on that makes everything below its fold
  unreachable — reaching for an option dismisses the thing you were reaching into. Only one of these
  layers is scrollable today, which is why the pattern was safe in the layer it was copied *from* and
  wrong in the one it was copied *to*. Getting either of these wrong is
  invisible in tests that only check the layer appears, so it is stated here as the rule rather than
  left to each author's judgement.

- **A link inside rendered content must never navigate the whole window (settled 2026-08-02)**:
  for any content rendered into the app through markdown (memories, configuration, artifacts), links
  must be intercepted and their destination decided by us — allow-listed ones open inside the app,
  external ones go to the system browser, anything else gets an explicit notice. Letting the default
  behaviour through navigates the entire renderer window and loses all app state. The main process's
  `will-navigate` / `setWindowOpenHandler` are a backstop; a new render site need not re-wire them,
  but must not bypass them either.

- **Rendered markdown goes through one carrier and one rule set on every surface (settled
  2026-08-19, carrier settled 2026-08-20)**: all markdown render sites (the skill file drawer, the
  memory/configuration document cards, the artifact reader) render through the shared MarkdownBody
  component, which by construction applies the sanitising exit, the link interception above, and
  the single content rule set — the shape-layered heading ladder specified in the appearance spec's
  sequence E, the paper-style code rules (bordered inline pill, bordered fenced inset, no inner box
  on the code element inside a fence), list indentation and the shared body line-height. A new
  render surface uses the component rather than writing its own rendering or styles.
  Two traps this guards: adjacent levels must
  never be distinguished by font size alone (a wrapped heading's taller block swamps a small size
  difference), and a container's own chrome-heading rule (`overlay h2` style descendant selectors)
  ties with the ladder on specificity and wins on source order, silently restyling headings inside
  the rendered body — chrome headings are scoped with a child combinator or a dedicated class.

- **When reading agent-generated data, a rule may only be grounded in a sample or in a mechanism
  (settled 2026-08-03)**: to write a rule that recognises, strips, or admits some data shape, the
  grounds must be **a real sample you have looked at** or **a mechanism you can articulate** — a name
  alone (from a research list, from documentation, from memory) is not grounds. Where a mechanism
  exists, extrapolating along it is allowed (e.g. `<local-command-*>`: caveat and stdout were both
  observed, both are the harness wrapping a `!` command, so match by family prefix). With only a name,
  the regex you write is a one-in-three guess, and the fixture can only be built on the same guess —
  the test passes without having verified anything.
  **Corollary: "listing every shape of X" is a negative conclusion in positive disguise (added
  2026-08-03).** "Codex tool calls come in these kinds" reads as positive enumeration but
  actually asserts "there are no others" — a negative judgement, which per CLAUDE.md's "negative
  conclusions require a different method" cannot rest on sampling. Case in point: a 120-file sample
  gave `custom_tool_call` + `function_call`, looking clean and complete; a full enumeration over
  278 files / 62,912 lines turned up a third, `tool_search_call` (25 occurrences). It never appeared
  once in the sample, and the consequence of missing it would be a permanently undercounted tool
  count that **no test would ever go red on** — the fixtures are built from the same sample.
  **Criterion**: any set of shapes destined for a `Set` / `switch` / allow-list must come from a
  **full enumeration** (scan the whole data directory and count), not from "the ones I happened to
  look at". A full enumeration over local data usually takes seconds; there is no reason to skip it.

  Rationale: the divergence between a research-phase list and real data goes **both ways**. Measuring
  297 sessions showed the list had missed a shape accounting for 63% of them (`Warmup`), while
  `Conversation info`, which was on the list, did not appear in my sample — the latter is worse,
  because I wrote an assertion into the spec that it "does not exist" (a recheck proved it does; it
  was simply outside a sample ordered by mtime). On method for negative conclusions, see CLAUDE.md.

- **Stripping may follow the sample strictly; allow-listing may not — strictness follows the
  direction of failure (settled 2026-08-03)**: the same rule "only handle shapes we have seen" has
  opposite consequences in the two cases.
  **Stripping / filtering** (no match → keep) fails **visibly** — missing one kind of noise makes a
  title ugly at worst, and the user sees it immediately. So it may follow the sample strictly and
  err on the side of doing nothing.
  **Allow-listing / admitting** (no match → discard) fails **invisibly** — missing one type means
  content silently disappears and nobody knows what is gone. This class **must not follow the sample
  only**: an unknown type outside the allow-list must leave a discoverable trace, never be silently
  dropped.
  A further reason: this product is local-first, and **each user's own data is their entire
  universe**; the coverage of a sample taken on a dev machine over someone else's machine is unknown.
  For stripping logic that does not matter; for an allow-list it means someone else cannot see
  content they should.

- **Degraded judgements follow the target system's behaviour (settled 2026-08-01)**: for any
  judgement of the form "is this feature on / is this configuration in effect", when reading fails or
  the content cannot be parsed, the degraded conclusion must match **what the target agent actually
  does at that moment** (it cannot read the file → we report not in effect). Do not salvage semantics
  out of unparseable content — a salvaged "enabled" is a false signal the target system itself cannot
  see. (Case in point: C6, a line-scanning fallback for a failed Codex `config.toml` parse; removed.)
- **Degradation may only hurt itself (fault escape surface criterion, settled 2026-08-01)**: when
  reading or parsing any one entry fails, the degradation may only affect that entry's own display.
  It must not escape **sideways** (emptying or polluting other entries, including cross-entry
  computations such as same-name shadowing) and must not escape **upward** (dragging down an
  aggregate view or an entire scan). The primary criterion for whether such a defect is worth fixing
  is **the escape surface**, not its frequency: anything that escapes needs fixing, anything that
  only hurts itself may be recorded and deferred. (Cases in point: A8, an unreadable subagent
  silently disappearing and polluting the same-name shadowing judgement; E10, a single marketplace
  failure emptying an entire group.)

- **Light and dark each get their own declaration, identical values included (settled 2026-08-15)**:
  a value being the same in both appearances is not a reason to write it once and let the other
  inherit. Rationale: inheritance is silent, so "deliberately the same" and "the second one was
  forgotten" look identical in the source, and the forgotten one still *resolves* — it inherits —
  rather than showing up as missing. With both present, "what is this colour in dark?" is answered by
  reading the dark block, without first having to work out whether anything overrode it. This governs
  the light/dark dimension only; whether a variable needs a declaration per *theme* still follows
  what that variable's relationship to its surface says (see "Theme variable classes"). The
  cross-project rule in the ui-design skill was amended to match on the same day, so the two no
  longer disagree.

- **Copy names a control, it never shows the control's glyph (settled 2026-08-15)**: a sentence that
  points at a button writes the button's name — taken from that button's own label, in that language —
  rather than reproducing its icon inside the string. Rationale: a glyph written into prose is a copy
  of something that lives elsewhere, and it goes stale the moment the icon changes, silently and in
  every language at once. This was learnt three times in one round: `docs/features/` named six
  controls by glyph and all six became lies when the icons became SVG; `notDetectedHint` pointed at
  `↻` mid-sentence in six dictionaries; three code comments referred to pills by `⑂` / `⑂?`. Where
  the label itself is needed at runtime, pass it in rather than writing it down — `notDetectedHint`
  takes the refresh button's label as an argument, so renaming that button cannot leave the sentence
  naming a control that no longer exists.

- **`rail` is an internal term and must not appear in user-facing copy (settled 2026-08-15)**: the
  48px vertical strip of icon buttons down the left edge. The word is useful in code, comments and
  `docs/features/` and stays there — but a user has no way to learn it, because nothing in the
  interface is labelled "rail" (the four buttons' tooltips read Agents / Projects / Refresh all /
  Settings, and `rail` survives only as a CSS class name). Copy that needs to point at it describes
  the position instead ("at the bottom left"). Note that "sidebar" is **not** an alternative name for
  it: the project list beside it is the sidebar. This is the same failure as naming a control by its
  glyph, one level up — copy referring to something by a name the reader cannot resolve.

- **User-facing copy never enumerates the agent sides as an exhaustive set (settled 2026-08-16)**:
  a sentence that means "all sides" says so side-count-neutrally ("the agent sides");
  naming one specific side is fine. Rationale: the side set grows, and an enumeration written into
  copy is a sentence that becomes a lie the moment a side is added — silently, in six languages at
  once, on a surface no side-onboarding diff touches. It happened twice in one onboarding round
  (the totals card's "both sides", the scanning state's "Claude Code / Codex"), and the rule had
  already been written down — in a prototype comment, where it constrained nobody. Enforced by a
  shared-UI check over the dictionaries; copy that must enumerate (because its surface genuinely
  judges only those sides today) is allow-listed there by dictionary key with the reason and the
  ticket that retires it.

- **Non-printing characters are written as escapes in source, never as raw bytes (settled
  2026-08-13)**: `\x00` rather than a literal NUL. Identical at runtime; the difference is that a raw
  NUL makes recursive `grep`/`ripgrep` **skip the entire file in silence** — empty output and exit 1,
  indistinguishable from an honest miss. A 1028-line file returned nothing for every search, which
  produced a wrong count of the producers writing `DayUsage.byProvider` (one instead of three) and
  nearly shipped a change covering a third of what it claimed to. Note the direction of the failure:
  it corrupts answers about **absence** — "nothing else references this", "there is no other
  producer" — which are exactly the answers nobody re-checks. Enforced by `pnpm check:nul`.

- **`TokenTotals.input` does not mean the same thing on every side, so it must not be summed across
  them (settled 2026-08-18)**: on the Claude side `input` is the genuinely new content — cache reads
  and cache writes each have their own disjoint bucket. On the Codex and Grok sides the reported input
  demonstrably contains the cached reads (which we subtract), and **may or may not** also contain the
  tokens written to cache — neither side reports that quantity, so it cannot be subtracted and the
  question cannot be settled from the data (ADR-0023). Either way the sanitised `input` on those sides
  is not the same quantity as Claude's "new only". The same asymmetry makes
  `cacheWrite` a Claude-only figure; summing it across sides labels one side's number as three sides'.
  **The three cross-side comparable buckets are `input + cacheWrite`, `output`, and `cacheRead`** —
  these carry one meaning each on all three sides and, on each side, sum exactly to that side's total.
  This is not fixable in the parser: the information is absent from the source data, so any presentation
  that needs comparability must aggregate to those three.

  The interface holds this invariant: the composition bar cuts a total into exactly these three
  buckets, and no surface sums `input` or `cacheWrite` across sides on its own. The former violation —
  a card set summing both, with a secondary line claiming a per-side breakdown it never rendered — was
  retired on 2026-08-21 when the totals became the four-window card row.

- **A metric only some sides report does not join `TokenTotals` (settled 2026-08-18)**: reasoning
  tokens are a case in point — Codex reports `reasoning_output_tokens` and Grok `reasoningTokens`
  (verified subsets of output: 50791/50791 and 380/380, so no volume is lost by ignoring them), while
  the Claude side has no equivalent — 57 of 51753 usage records carry `output_tokens_details`, all
  reading zero. Adding the field would put a real number beside a structural blank, which reads as
  breakage on the side that has none rather than as an honest absence. This is the same judgement
  ADR-0019 made about Grok's `costUsdTicks`, and it is recorded here so the next reader does not
  re-derive it from a fresh scan. The bar for admitting a new field is that **every** side can answer
  it, or that the view showing it is explicitly single-side.

## Flagged ambiguities

- **"AgentDex" (former name) is retired**: the product was originally positioned as a read-only
  catalogue; on 2026-07-29 requirements analysis ruled it a hands-on "overview + install/remove
  management" tool, which triggered the naming-fallback clause and produced the name Agentshed.
  "Catalogue" is no longer used to position the product; "overview" is used instead.
- **"The six official UN languages" is retired (2026-08-08)**: the requirement as originally stated
  named the six official UN languages, which include Arabic; the ruling replaced Arabic with
  Japanese, keeping the count at six with all of them left-to-right, and RTL outside the support
  commitment (rationale and options in ADR-0013). From now on, describe this product's language
  support as "six languages" and enumerate them; do not use the shorthand.
- **"Dual view / artifact aggregation" is retired (2026-07-30)**: aggregating artifacts by type
  across projects was ruled a false requirement — artifacts are in-project context documents and are
  shown only within project detail. Cross-project retrieval belongs to a future global search; there
  will be no aggregation page.
- **Codex same-name semantics differ per component and must not be extrapolated by analogy**
  (2026-08-01, both verified at source level): two same-name skills across layers **coexist**
  (`root_loader.rs` deduplicates by path only), whereas two same-name subagents **shadow at the
  project level** (`agent_roles.rs` overrides by config layer; within one layer the first wins).
  These are **runtime semantics**; the shadowing badges in the subagents effective view still follow
  them, but the skills **list presentation** has, since skills-view (2026-08-06), uniformly shown
  "only the project-level entry for a same-name pair" and no longer badges by runtime semantics
  (see the "Effective view" entry).
