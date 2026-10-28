# Memory view

> Related: [features](../features/memory-view.md) · ADR-0001 (single type source) · ADR-0002 (dual seam) · ADR-0037 (Antigravity CLI side)

## Problem Statement

Agents accumulate cross-session memories automatically and those memories shape later behaviour, but
the content is buried in an encoded data directory (per-project for Claude, global and requiring
manual enabling for Codex), so users do not know "what has the agent remembered about my project" and
have no way to spot a stale or unexpected memory.

## Solution

The global page's Memory section summarises each project's memories (metadata + file list, clicking a
row expands and clicking a file opens a drawer with the content); the project detail page's Memory
section renders that project's main memory file directly and can view topics. A memory file opens in
the same drawer as a skill's files: rendered Markdown by default, the raw text one switch away, and a
link to another file of the memory directory opening that file in place. Everything is read-only —
memory is agent-generated content.

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

### memory-view::US-001 Read a memory file as rendered Markdown

As a user, I want a memory file I open to read like a skill's files do — rendered, with its front
matter set apart and the raw text one switch away — and to follow its links to the other files of the
same memory directory without leaving the drawer, so that a memory reads as the structured note it is
rather than as Markdown source.

Applies to every memory file opened in a drawer: from the global page's Memory section (any file of an
expanded row, a Claude project's or the Codex global memory's), and from project detail's Memory
section (a topic row, or a link in the rendered main file).

- memory-view::US-001/AC-01: The drawer has the skill file drawer's form (memory-view::CON-001): a
  close button; a title block whose title is the memory's owner — the project's name, or the Codex
  global memory's placeholder name — over a meta line of side · file name · the file's modification
  time (relative, R2); and under it the preview frame — a bar with the file name and the raw / preview
  switch, then the body.
- memory-view::US-001/AC-02: A file opens in preview: the body is the file rendered through the shared
  markdown carrier (CONTEXT: one carrier and one rule set on every surface). A leading front matter
  block (`---` … `---`) shows as a card of key-value rows before the body; a nested key's indented
  lines fold into its parent's value (`metadata:` over `type: feedback` shows as one row,
  `metadata` · `type: feedback`). Every listed memory file is Markdown (only top-level `.md` files
  are listed, D5), so the switch is always present.
- memory-view::US-001/AC-03: The raw switch shows the file's text exactly as read, front matter
  included; switching back shows the preview again.
- memory-view::US-001/AC-04: `[[name]]` references render as plain text, not as links — including one
  written straight before a parenthetical remark, `[[name]](remark)`, whose remark stays text too
  (memory-view::CON-002).
- memory-view::US-001/AC-05: In the preview, a relative link whose target resolves to a file listed for
  the same memory directory switches the drawer to that file: the title stays, the meta line and the
  bar name the new file, and the new file opens in preview, scrolled to the top. On the global page
  the listed files are the expanded row's; in project detail they are the main memory file and the
  topics.
- memory-view::US-001/AC-06: Any other link never navigates the whole window and leaves the drawer on
  its file: an http(s) link goes to the system browser; an anchor link scrolls within the body; a
  relative target the directory does not list, or a link with any other protocol, shows the error
  toast naming why (outside the readable scope / unsupported link protocol).
- memory-view::US-001/AC-07: The body reports the read inside the same frame, the bar and its switch
  staying in place: "Loading…" while the file is read (unless an already-read body is shown, C8);
  "File cannot be read: <reason>" on a read failure; "Empty file" for an empty file. A file cut at the
  read cap ends with the existing truncation marker, in preview and raw alike.
- memory-view::US-001/AC-08: Esc, the close button and clicking the overlay each close the drawer.

## Constraints

### memory-view::CON-001 One drawer form with the skill file drawer (direct acceptance)

Applies to the memory file drawer and the skill file drawer (which also shows a plugin's skill files):
they are one form — the same frame (width, close button, title block, padding), the same preview frame
(bar, switch, body) and the same content rules — so a change to either one's appearance is a change to
both. The form is the one confirmed on the prototype on 2026-10-21: the width is min(720px, 80% of the
content area), and the preview bar fades from the page ground into the card. The two differ only in
where the file is read from and in what the title block names.

### memory-view::CON-002 What rendered text keeps (direct acceptance)

Applies to every rendered-markdown surface — the file drawer, the main memory file, configuration
documents and the artifact reader — since they share one carrier (CONTEXT: one carrier and one rule set).
Two things an agent writes as text stay text: a `[[…]]` reference, with whatever follows it (so
`[[name]](remark)` is not a link), and a tag-like `<name>` whose name is not an HTML element (placeholders
such as `<slug>`, `<spec-slug>`, `<id>`), which shows as written instead of being dropped by the sanitiser.
Real HTML keeps rendering and is sanitised as before; a placeholder that shares an element's name
(`<input>`, `<p>`) is still taken as HTML. Inside code spans and fences nothing changes.

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
  without navigating to a detail page; clicking a file → the memory file drawer (memory-view::US-001).
  The Codex global row expands the same way (directory enumeration + reading the source, with no
  structural parsing).
- C8 What enters the snapshot for a summary entry is **only metadata and the file name list** — no
  content (so many projects' full text does not balloon the snapshot); content is read on demand when
  clicked (reusing the artifact read channel's allow-list mechanism, extended to memory directories;
  a first-read failure → "file cannot be read" inside the drawer, no crash —
  memory-view::US-001/AC-07). An already-read
  successful body is saved separately and restored immediately on reopening, including after a
  restart; a failed refresh retains it (project-detail::REQ-001/AC-05, ADR-0029). This does not
  restore the open drawer or authorize a new source read.
- C9 The expansion state is keyed by project path rather than list index — so an expanded row does not
  shift when a snapshot refresh reorders the list.

**Sequence D: project detail → Memory section**
- D1 No memory → empty-state copy.
- D2 The main memory file is rendered (sanitised as in subagents A7), capped at 200,000 text code
  units by the existing provider read. Topics open in the memory file drawer (memory-view::US-001),
  which reads through the artifact read channel, whose existing cap is 500,000 text code units. Saved
  display data preserves these truncation markers.
- D3 Subagent-level memory (`agents/<name>/memory/`) is not read (Out of Scope, not shown in the
  section).
- D4 A Codex-only project → an empty state explaining that "memory is a Claude-side mechanism" (Codex
  memory is global and does not enter project detail).
- D5 Subdirectories under the memory directory are not listed as files (only top-level `.md` is read).
- D6 Clicking a **relative link** in the main file (the index pointing at a topic in the same
  directory): if the target is in the readable list → the memory file drawer opens at that file
  (memory-view::US-001); if not → the error toast "the link target is outside the readable scope";
  **under no circumstances may the whole window navigate** — letting a rendered link's default
  behaviour through loses all app state (a 2026-08-02 bug). External http(s) links go to the system
  browser.

**Sequence E: reading a file in the memory file drawer** (memory-view::US-001)
- E1 An already-read body restored on reopening (C8), including after a restart, opens in preview like
  a fresh read; a successful refresh that changes the text re-renders it in the current mode, and a
  failed refresh leaves the shown body in place.
- E2 Following links in a row: each switch replaces the drawer's file; when two reads are in flight,
  only the last file chosen is shown — an earlier read finishing later must not replace it.
- E3 A file removed after the list was taken → its read fails → memory-view::US-001/AC-07's read
  failure, with the drawer still open.
- E4 Front matter without its closing `---` is not front matter: no card, the text renders as Markdown
  (the skill drawer's rule, skills-view D1b).
- E5 Large files (Codex's consolidated memory files run to several hundred thousand characters, under
  the 500,000 cap): the preview renders them in full; prose lines wrap; an unbroken token or a wide table
  scrolls the body sideways and a wide code line scrolls inside its fence, so nothing is cut off; the
  drawer never widens past its width.
- E6 What a memory file's content can do to the host: links per memory-view::US-001/AC-05 and
  memory-view::US-001/AC-06; images, scripts and every other sanitised element behave exactly as in
  the rendered main file (D2), which already goes through the same carrier — the drawer adds no
  capability beyond it.
- E7 Changing the interface language while the drawer is open re-renders its copy (the meta line's
  relative time, the switch, the read-state notices) and keeps the file, the mode and the scroll
  position.
- E8 Regression: the Subagents drawer keeps its own definition form and width rule (min(680px, 80% of
  the content area)); only memory files move to the file drawer form.

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
- **The memory file drawer (prototype ruling, 2026-10-21)**: one drawer frame and one preview frame
  serve both the memory file drawer and the skill file drawer (memory-view::CON-001); each supplies its
  title block, its content source (the artifact read channel for memory, the skill read channel for
  skills) and its readable list for links (the memory directory's listed files; the package's listed
  files). Link destinations come from the shared link interception; the drawer only decides what an
  in-directory target switches to.
- **The main file is on project detail's readable list**: the project detail entry carries the main
  memory file's entry — name, path, modification time; null when there is none — beside its content,
  and its path joins the topics on
  the project's read allow-list, so a topic's link to the main file opens it in the drawer
  (memory-view::US-001/AC-05) without depending on the global summary having listed it. Contract
  validation is extended with the field (R1); saved display data from before the field degrades to
  "not listed" until the live read replaces it.

## Testing Decisions

Following ADR-0002's dual seam: (1) fixture unit tests at the providers layer (covering sequence C:
an empty directory, topics only, stale, registry leftovers, Codex's three states and the
dotted-key form, degradation on a parse failure); (2) the contract validation round trip. The UI
layer's drawer read paths are not unit tested (per ADR-0002 the UI is not unit tested); e2e covers the
normal read, an empty file and a file removed after the scan.

memory-view::US-001 is tested end to end on the built app (the highest seam; prior art: the skills-view
drawer test and the Memory section test in the e2e suite): a seeded home whose memory files carry the
real shapes — front matter with a nested key, `[[name]]` references with and without a remark written
straight after them, `<slug>`-style placeholders, links to a sibling, to the main file, external and to an
unlisted file, a Codex memory file, one past the read cap, and one large file under it with wide content.
memory-view::CON-002 is tested at the one carrier (the shared renderer's unit tests). Link resolution
itself stays covered by the shared link module's unit tests.

## Out of Scope

- All write operations: editing or deleting memories (memory is agent-generated content).
- Subagent-level private memory directories.
- Structural modelling of Codex memory (directory enumeration and reading the source only; no parsing
  of durable entries, evidence files or other internal structure).
- Searching memory contents and aggregating them across projects.
- Following `[[name]]` references: they stay plain text (memory-view::US-001/AC-04); making them links
  needs a name-to-file rule of its own and is left for a later change.
- Antigravity CLI's knowledge items (agy's agent-written memory): none was produced over an eight-turn
  session, so there is no sample to ground a reader on (ADR-0037). The side shows nothing in either
  Memory section, and a project registered only on Antigravity gets D4's empty state.
