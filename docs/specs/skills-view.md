# Skills view

> Related: [features/skills-view](../features/skills-view.md) · [skill-install](skill-install.md) (install/uninstall) · [agents-overview](agents-overview.md) · [project-detail](project-detail.md) · [plugins-view](plugins-view.md) · ADR-0001 · ADR-0002 · ADR-0004 · ADR-0010  
> Status: **delivered** (prototype gate passed 2026-08-06; expand-to-preview + enumerate-and-read + inline package stats + `differs` removed + same-name override in detail). **Filtering by name and hover-for-full-name added 2026-08-10** (prototype gate passed the same day).

## Problem Statement

Skills exist as **skill packages** (a directory with `SKILL.md` as its entry point, optionally with
references and scripts) in each **agent side's** global library and project directories. The product
can already list names and frontmatter descriptions and install from the global library into a
project, but the user **cannot open the contents of a package**: before installing there is no
confirming "what does this skill make the agent do", and after installing there is no comparing the
project-level and global-layer copies. The number of sides is about to grow from 2 to N (Grok among
others), and the existing "the two sides differ" machine diff neither scales nor matches subagents'
discipline of "switch sides and read the source, no cross-side diff".

## Solution

On both lists — global Agents · Skills and project detail · Skills — a skill row from an **on-disk
source** can **expand** to show the package's text files (bounded depth); **clicking a file** opens a
drawer to read it (markdown previewable by default). The payload carries path metadata only;
**on expansion** the files are enumerated and registered in the allow-list, and contents are fetched
on demand when a file is read. Modelled for **N sides**: only sides with a definition get a badge and
a segment in the expanded area — two vendors are not hard-coded. The cross-agent-side skill content
diff (`differs` / "the two sides differ") is **retired and removed**.

**The project detail presentation rule (settled as part of this feature)**: within one **agent side**,
if a project-level and a global-layer entry have the **same name**, the list **shows only the
project-level one** (the project overrides the global one for display purposes), without listing the
covered global row alongside and without any "shadows / shadowed / coexists" label. Names that exist
only globally are still listed from the global layer. This is a **presentation rule for this app's
lists**; it does not rewrite the documentation of either side's runtime loading semantics (Codex may
still coexist at runtime on a same-name pair — see CONTEXT; this UI simply chooses not to display
that global copy alongside).

Plugin-sourced entries have, since 2026-08-07, **expanded and previewed on equal footing with on-disk
skills** (ADR-0012, overturning the v1 exclusion; the package root and security rules are in the
plugins-view spec, sequence H); still with no install or uninstall. Install/uninstall behaviour is
unchanged, see skill-install.

**Filtering by name** (2026-08-10): both lists carry a search box that narrows them to skills whose
**name** contains what was typed. This is a **filter**, not a search: everything it needs is already in the
snapshot and the project-detail payload, so it is a pure client-side narrowing of a list already on screen.
The sessions search it visually resembles is a different thing entirely — that one crosses IPC, scans file
contents, and reports hit counts and folded groups. Keeping the two apart matters because the resemblance
invites someone to "make skills filtering consistent" by routing it through IPC as well, which would buy
nothing and cost a round trip per keystroke.

Because the name column has a fixed width and has always truncated long names to an ellipsis, filtering
makes an existing annoyance land more often — the user arrives at a row *by name* and then cannot read the
name. So a truncated name **reveals itself in full on hover**. Only a truncated one: showing a tooltip that
repeats what is already legible is noise.

## User Stories

1. As a user, I want to open an on-disk skill from the global Skills list and read `SKILL.md` in full,
   so that I know what it instructs the agent to do before installing it into a project.
2. As a user, I want to see the package's other text files in the same drawer and open them, so that I
   can follow the skill's referenced documents and scripts to understand the whole convention.
3. As a user, I want to switch sides inside the drawer when a same-name skill exists on several agent
   sides, so that I can compare for myself rather than relying on a machine diff signal.
4. As a user, I want project detail to show only "which one this side finally uses in this project" —
   the project-level one when names collide — so that I am not distracted by global copies and
   shadowing badges.
5. As a user, I want global skills the project does not have to still appear in the detail list and be
   previewable, so that I know which capabilities are inherited from the global layer.
6. As a user, I want a symlinked skill to follow through to the real package's contents, so that what
   I see matches what the agent actually loads (the symlink badge is retained).
7. As a user, I want clicking "Install to…" / "Uninstall" not to open the preview by accident, so that
   installing and reading do not interfere with each other.
8. As a user, I want plugin namespace entries to expand and preview too, so that a capability in the
   effective view can be reviewed without detouring to the Plugins section (ADR-0012).
9. As a user, I want a best-practice notice when a package's references nest too deeply, rather than
   silent truncation with no explanation, so that I know to restructure that skill rather than
   suspecting the app of losing files.
10. As a user, I want no more "the two sides differ" badges, so that the product does not pretend it
    can give a reliable pairwise diff across N sides.
11. As a user with a large global library, I want to type part of a skill's name and see only the
    matching rows, so that I can reach one skill without scrolling past dozens of others.
12. As a user, I want the same box in project detail to narrow every group at once, so that I do not have
    to work out which of the five groups a name lives in before I can look for it.
13. As a user, I want a group whose entries all filtered out to disappear entirely rather than linger as
    an empty heading, so that what is left on screen is only what matched.
14. As a user, I want to tell "nothing matched what I typed" apart from "there is nothing here at all",
    so that I do not go looking for a library that is in fact populated.
15. As a user, I want a name too long for its column to show itself in full on hover, so that filtering
    can take me to a row whose name I can then actually read.
16. As a user, I want no tooltip on names that already fit, so that hovering the list does not flicker
    with restatements of what I can already see.

## Failure modes and boundaries

**Sequence A: global page → Skills section → preview**

- A1 An on-disk skill with that name in at least one side's global library → the whole row
  **expands and collapses**; expanding lists that side's previewable text files; the default side =
  the first side with a definition in `sides`, by **stable side order**.
- A2 The same name on several sides → a side switcher segment appears **inside the expanded area**,
  rendering only sides that **actually have a definition**; switching replaces the file list with that
  side's package while the row stays expanded.
- A3 Only one side has a definition → no side switcher; that side's files are listed directly.
- A4 A plugin source (`origin=plugin`) → **expandable and previewable, on equal footing with on-disk
  skills** (file table / inline stats / drawer; ADR-0012 overturned the v1 exclusion on 2026-08-07;
  the package root rule and security registration are in the plugins-view spec, sequence H); the
  "plugin" badge remains (list rows do not show the description, see the UI decisions); no install or
  uninstall (the existing G3 / ADR-0004).
- A5 The list **no longer** shows a cross-side content diff badge; the domain model **removes**
  `differs` (or any equivalent field), and the scan **no longer** reads each side's `SKILL.md` in full
  for diffing.
- A6 A symlinked directory → enumerate and read the real package after resolution; the row's symlink
  badge is retained.
- A7 "Install to…" versus expanding and clicking files: the action buttons `stopPropagation`; clicking
  a button only installs or uninstalls, and neither expands nor opens the drawer.
- A8 Clicking a file opens the drawer; if the package or file no longer exists or cannot be read → an
  explicit error inside the drawer, without crashing the list.
- A9 Both sides' global libraries empty → the existing empty state, with no preview entry point.
- A10 Depth > 2 → notice copy in the expanded area; over-deep paths do not enter the file list.

**Sequence B: project detail → Skills section (list rule + preview)**

- B1 **Same-side same-name override**: for each `side`, if a project-level entry named `N` exists, that
  side's global-layer `N` is **not listed**; only the project-level row is. Claude's "the project
  shadows the global" and Codex's "same names coexist at runtime" are unified into the same
  presentation **in this list**: only the project-level one is seen.
- B2 **Names only present globally**: that side's global layer is listed as usual (level=global) and is
  previewable; there is no "shadowed" row to click.
- B3 **Names only present in the project**: only the project-level entry is listed, previewable and
  uninstallable (as before).
- B4 The list **no longer** shows `shadows` / `shadowed` / `coexists` badges for skills (the same-name
  global row no longer appears, so those badges have nothing to attach to). This feature's acceptance
  was "the list emits no covered global row", with the filtering done while assembling the effective
  list; the three fields were briefly retained as constant false during implementation and were
  **removed from the `ProjectSkillEntry` contract at wrap-up on 2026-08-07** (no consumer anywhere in
  the repository, never persisted; subagents' identically named fields are unaffected, R8).
- B5 Every row in the on-disk list (the filtered project-level ones plus the uncovered global-layer
  ones) → **previewable**.
- B6 A project detail row is already bound to a single `side` → the drawer has **no** side switcher;
  it shows only that row's package.
- B7 The plugin-bundled group → previewable as in A4; a plugin namespace name and an on-disk name
  **coexist without covering each other** (the existing ADR-0010; they do not take part in B1's
  same-name override).
- B8 A stale project → the project-level directory is naturally empty, so every global-layer entry is
  listed per B2 (there is no project-level entry to override them).
- B9 The "Uninstall" button `stopPropagation`s and does not compete with the preview.
- B10 The global page's Skills section is **unaffected** by B1 (there is no "project-level override"
  concept on the global page).

**Sequence C: inside the drawer · package enumeration and file reading**

- C1 The package's files are enumerated and registered in the readable allow-list **when the skill row
  is expanded**; contents are fetched on demand when a file is clicked. The list and the snapshot do
  **not** pre-enumerate contents or full file path lists; the snapshot carries, per side, only
  **aggregate package stats (file count, total bytes; obtainable by `stat` alone without reading
  contents; revised 2026-08-06 for inline display)** and the minimum identity needed to locate the
  skill root.
- C2 Enumeration rules: **depth ≤ 2** (the skill root is depth 0; `references/foo.md` is 1; `a/b/c.md`
  at 3 is out of bounds); only **text extensions** enter the list; known junk directory names are
  excluded (any segment that is `.git`, `node_modules`, `__pycache__`, `.DS_Store` and the like).
- C3 If the package contains text files deeper than 2 (still visible after excluding junk directories)
  → **still list the files at depth ≤ 2** and show a fixed notice inside the drawer: **"as a matter of
  best practice a skill's reference depth should not reach 2 — consider restructuring this skill"**;
  the deeper files do not enter the clickable list.
- C4 Non-text files, or files not on the extension allow-list → **do not appear in the list** (no
  system-open entry point in v1).
- C5 `SKILL.md` is selected by default; if it is missing (a broken package) → an error or explanation
  inside the drawer, and the file list stays clickable if there are other text files, but the main file
  is not pretended into existence.
- C6 Clicking another file in the list → read that file in full on demand (monospace plain text); on
  failure the drawer's content area reports "file cannot be read" without closing the drawer.
- C7 Single-file read truncation follows the artifact read channel (an over-long file gets a
  truncation footnote rather than crashing).
- C8 Esc and clicking the overlay both close the drawer; after closing, allow-list entries may persist
  for the process's lifetime (the same pattern as memory and artifacts), but must never become
  arbitrary-path readability.
- C9 Path security: a readable path must be **an exact path registered by this enumeration**; prefix
  traversal, encoding variants and out-of-package paths are refused. The container check applies to
  **the entry point before resolution**: a skill entry point must be a single-segment entry under a
  known agent skills root (each side's global library skills directory, or an opened project's
  project-level skills directory) — fail-closed; a plugin-sourced entry's package root follows the
  scan registration set (plugins-view spec H8); when the entry point is a symlink, **its target is
  unconstrained** and is followed only during enumeration and reading (A6; nailed down by the
  2026-08-07 revision — checking the resolved path had previously caused a symlinked skill with an
  out-of-root target to be wrongly refused).

**Sequence D: what imported content can do to the host** (raw + markdown preview)

- D1 The content area toggles **raw / preview**: only markdown extensions show the toggle and preview
  by default; non-markdown shows **no toggle**, monospace raw only.
- D1b Frontmatter: a YAML header wrapped in `---` is split in the preview into a card of key-value
  rows (about 12.5px), with the body rendered after it.
- D2 The preview goes through the same **markdown → sanitised HTML** pipeline as the artifact reader
  (a single production exit; starting another unsanitised `dangerouslySetInnerHTML` is forbidden).
- D3 **Links** in the preview: the in-app / file allow-list and the destination of external http(s)
  links follow the existing "a rendered link must never navigate the whole window" invariant
  (CONTEXT); clicking inside a preview must not lose app state.
- D4 **Images** in the preview: relative paths resolve against the skill package root and must be
  allow-listed files; on failure a placeholder is shown, and this must not become a way to read paths
  outside the package.
- D5 Oversized text: truncated for display (C7), with the layout not breaking the drawer's scroll area.

**Sequence E: global page → Skills section → filtering by name**

- E1 Typing narrows the list to rows whose **name** contains the text, case-insensitively, as a plain
  substring. Not a subsequence (`gwd` does not reach `grill-with-docs`), not word-split, and never a
  regular expression — a name containing `.` or `[` is matched literally.
- E2 Only the name is matched. The description is deliberately not searched: list rows do not show it (see
  the UI decisions), so a hit explained by invisible text would look like a bug.
- E3 A plugin entry's namespace prefix is part of its name, so `brain` reaches
  `superpowers:brainstorming` and `chrome` reaches it by prefix too.
- E4 Clearing the box restores the full list. Whitespace only counts as empty — it filters nothing rather
  than matching nothing.
- E5 Nothing matched → an empty state saying **no name matched**, which is a different sentence from the
  existing "the global library is empty". Reusing the latter would state something false.
- E6 The global library is empty to begin with → the existing empty state, and **no search box**: there is
  nothing to narrow.
- E7 A row expanded before typing: rows that still match **keep** their expanded state; rows filtered out
  are unmounted, so when they match again they come back collapsed. This follows from keyed reconciliation
  and is the behaviour to preserve — a filter must not silently collapse what the user opened.
- E8 The "Install to…" popover is open when typing starts → it closes. It is a `fixed` layer positioned
  from its trigger's rect, and the row it was measured against may be about to leave the list.
- E9 A snapshot refresh (manual or automatic) while filtering → the keyword survives, because the section
  is not unmounted (the transfusion update, project-detail A3).
- E10 Leaving the tab, or switching project, clears the keyword: it is a way of looking at one list, not a
  setting.
- E11 Filtering runs over the **assembled** list, so it changes nothing about which rows exist — the
  same-side same-name override (B1) and the plugin join (ADR-0010) are decided before it and stay decided.

**Sequence F: project detail → Skills section → filtering by name**

- F1 **One** box narrows all five groups at once; there is no per-group box.
- F2 A group heading's count shows the number of rows **after** filtering, not the group's total. A count
  that kept reporting the total would contradict the rows underneath it.
- F3 A group with no matches disappears **together with its heading and card** — the same rule the section
  already applies to a group that is empty to begin with.
- F4 No group matched → one empty state saying no name matched, again distinct from "this project has no
  skills".
- F5 The uninstall confirmation dialog is unaffected: it is a modal over the page, not part of the list.
- F6 Switching project clears the keyword (F is a fresh list, and a keyword carried over would make a
  populated project look empty).
- F7 A project with no skills at all → the existing empty state and **no search box**, the same rule as
  E6. Recorded during implementation: E6 stated it for the global list only, and the detail list needs it
  said too — otherwise a box appears above a section whose only content is "there is nothing here".

**Sequence G: a truncated name → hover for the full name**

- G1 The name column is a fixed width with an ellipsis. Hovering a name that **fits** shows nothing.
- G2 Hovering a **truncated** name reveals the complete name.
- G3 "Truncated" is decided by **measuring** at hover time (rendered width against available width),
  never by counting characters — character counts are wrong for any name that is not plain Latin, and the
  measurement is one layout read taken exactly when the user asks. Nothing is cached: a cached value
  would need something to invalidate it, and there is nothing to buy with that. (Neither resizing nor
  font loading actually moves this answer — the column is a fixed width and the fonts are system ones —
  measured 2026-08-10, so the reason to measure on demand is simplicity, not staleness.)
- G4 The tooltip must **escape the list's overflow clipping**. The skills card clips, and a layer
  positioned against a row *within that card's coordinate space* is cut away entirely — it still reports
  a bounding box, so this cannot be checked by asking whether the element exists. Measured 2026-08-10:
  such a layer's own centre hit-tests to the pane body.
- G5 Escaping the clip and staying anchored are **two separate obligations**: one makes it visible at all,
  the other stops it lying about where it points. Positioning against the viewport discharges the first
  by itself — the element's containing block is then the viewport, so no ancestor's overflow reaches it,
  and it does **not** also need to be portalled out of the list. What still clips such an element is an
  ancestor that creates a containing block for it (a transform, filter or perspective), so that is the
  thing to check rather than nesting depth.
- G6 Because its coordinates are computed once from the row, anything that moves the row invalidates them:
  scrolling, resizing, and filtering the anchor row away all **hide** the tooltip rather than leaving it
  stranded over unrelated content.
- G7 Near the right edge of the window the tooltip shifts left rather than extending past the edge.
- G8 The tooltip does not take pointer events: it must not swallow the click that expands the row, nor
  cover the row and cause its own hover to end.
- G9 Moving the pointer away removes it.

**Sequence G′: what the name itself can do to the host**

A skill's name is **not** copy this product wrote, so beyond "what if it is missing", the question is what
it can do to the host. Where it comes from decides how loose it is:

- an **on-disk** skill is named by its **directory**, so the filesystem bounds it (no separators, a length
  ceiling);
- a **plugin** entry's name joins a key from the user's plugin manifest to a directory name — and a key in
  a configuration file is bounded by **nothing**: any length, any character.

So the looser half of the surface is the one that is easy to overlook, because "it's just a directory
name" reads as if the filesystem had already constrained it.

- G′1 **Very long names**: the column truncates, so the row is safe. The tooltip is the exposed surface —
  it must be bounded and wrap rather than run off-screen on a single line. Unbounded, one long name turns
  into a layer spanning the display (measured at 901px). Wrapping must break **anywhere**: skill names
  are mostly kebab-case with no spaces, so a word-boundary wrap finds nowhere to break and the bound
  achieves nothing.
- G′2 **Names as text, never as markup**: the tooltip renders the name as text. Nothing about a name may
  reach an HTML-parsing path — this is the same single-exit rule as D2, and it applies here even though a
  name feels too small to matter.
- G′3 **Names with unusual scripts, combining marks or emoji**: they may measure wider or taller than
  Latin text of the same length. The truncation judgement is a measurement (G3), so it stays correct
  regardless; the tooltip must not assume a single line height.
- G′4 A name that is entirely whitespace, or contains control characters, must not make the row unhittable
  or the tooltip empty-but-present.

**Cross-cutting regression points**

- R1 Install/uninstall (skill-install): preview changes none of its semantics, paths or confirmation
  dialog; it only adds hit-area discipline (A7/B5).
- R2 The plugin skills join (ADR-0010): joined entries preview on equal footing with on-disk ones (A4,
  ADR-0012); the package root and security rules belong to the plugins-view spec (H5/H8); the
  inclusion rule itself is unchanged by preview (effectively enabled only, G1).
- R3 The IPC contract: `differs` removed; the fields and validation for "open a skill package / list
  files / read a file" added in step with ADR-0001 — forgetting means the boundary passes silently.
- R4 Snapshot size: a skill's **contents and package file list do not enter** the global snapshot (the
  same discipline as memory's "contents do not enter the snapshot"); only two aggregate numbers per
  side, file count and total bytes, enter it (C1); the scan no longer retains full text for diffing.
- R5 N-side extension: side enumeration, badges and segments are all driven by "the sides this skill
  actually exists on"; hard-coding exactly two side buttons in the UI or the contract is forbidden.
  The current data sources may still be only Claude and Codex, but the model is built for N.
- R6 The existing "the two sides differ" copy: everything in features / prototypes / tests depending on
  `differs` is deleted or rewritten, so the documentation does not lie.
- R7 The old project detail Skills rule of "project-level and global-layer side by side + shadowing /
  coexistence badges" is **overturned** by B1–B4; `docs/features/project-detail.md` and the related
  tests are rewritten at implementation wrap-up.
- R8 **The Subagents effective view does not change with this rule**: subagents may still list
  project-level and global-layer side by side with shadowing labelled (the existing subagents-view);
  only Skills adopts "same name shows the project-level entry only".
- R9 **Filtering is layered on top of the assembled list and changes no assembly rule** (E11): the
  same-name override, the plugin join, and group membership are all decided upstream. If a future change
  makes filtering influence which rows exist, it stops being a filter.
- R10 **The install popover and the name tooltip are both floating layers over the same clipped list**, so
  they answer to the same two obligations (G5). A third such layer must satisfy them too; this is recorded
  as an invariant in CONTEXT rather than rediscovered each time — it was already got wrong once, in the
  popover, where a stale selector left it positioned against the document and it landed off-screen.
- R11 **Subagents, Plugins, Memory and MCP do not get a search box in this change.** Adding one where the
  list is short is noise, and each list would need its own decision about what a match means.

## UI decisions (prototype gate passed · 2026-08-06)

Matching the current behaviour of
`docs/prototypes/skills-view/prototype-skills-preview.html`:

- **Container**: a full-width list. An on-disk skill **expands and collapses on a row click** to show
  the package's file table; **clicking a file** opens a drawer to read it.
- **Expanded area**: headers "file / lines / size / modification date"; type badges; a marker on the
  `SKILL.md` entry point; an **N-side segmented control** inside the expanded area when there are
  several sides; the depth > 2 notice in the expanded area; plugin rows expand on equal footing with
  on-disk rows (ADR-0012, 2026-08-07). **Flat** (finalised 2026-08-06): zero indentation, no inner
  card, no summary bar, with the header and file rows sharing a 14px baseline.
- **Drawer**: the title = the skill name; the subtitle = level · side · path; the body full width.
- **Markdown preview**: only `.md` / `.markdown` / `.mdx` show "raw | preview" (preview by default);
  other types have no toggle and show raw only. YAML frontmatter is split into a key-value row card
  (about 12.5px), with the body rendered after it.
- **Side model**: N sides; no cross-side diff badge.
- **Project detail**: same side, same name keeps the project-level entry only; no shadowing or
  coexistence badges.
- **Interaction**: expanding / clicking files and install/uninstall do not compete.
- **List rows do not show the description** (global and detail, on-disk and plugin rows alike; ruled
  during implementation on 2026-08-06, a deviation from the prototype written back here) — a row =
  the expansion arrow + name + side badges + source/level/symlink pills + package stats +
  install/uninstall buttons; a skill's description is carried by expanding the file table and
  previewing SKILL.md.
- **Inline package stats** (ruled 2026-08-06; the plugin clause revised 2026-08-12): a row that can be
  expanded shows "N files · size" on the right, **excluding line counts** (line counts are per file in
  the expanded table); they follow along when switching sides. **Plugin rows show them too** — the
  original ruling said plugin rows had none, which was correct while plugin rows could not be expanded
  at all, and was left behind when ADR-0012 overturned that on 2026-08-07. A row shows no stats only
  when it cannot be expanded, which for a plugin row means its package root is unknown (A4 /
  plugins-view H5, fail-closed).
- **Row density** (finalised 2026-08-06): 8px row padding, a visual row height of about 32px, aligned
  with the rows in other sections.

**Filtering and hover (prototype gate passed 2026-08-10)**

- **The search box** sits at the very top of the section's content, above the existing hint line. It
  reuses the search input already used by the sessions section — same visual treatment, and no second
  variant of "a box you type into" — but renders **only** the input, without that section's scope toggle.
- **Width**: 300px, not full width and **not** tied to the name column. Matching the name column (200px)
  was tried first on the reasoning that a box searching names should not outgrow them; in practice the
  typing area was too cramped. The two were then deliberately decoupled: the box is sized for typing, the
  name column keeps the row geometry it shares with other sections, and truncation is compensated by
  hover instead.
- **No icon in the box.** The sessions box has none either, and the icon module forbids using a character
  as an icon; adding a real one would mean a separate icon selection for no gain here.
- **No extra feedback while filtering**: no match-count line. The list getting shorter is the feedback,
  and in project detail the group counts already move. A count line would also push the list down on every
  keystroke.
- **No highlighting** of the matched fragment. A row shows only its name, so what matched is self-evident.
- **The hover tooltip**: appears just below the name, left-aligned to it, shifting left near the window
  edge; plain text, no pointer events; bounded in width and wrapping rather than extending indefinitely
  (G′1). It appears on truncated names only.

## Implementation Decisions

- **Module boundary**: this spec governs Skills' **read-only viewing and preview** and the list signals
  (including removing the diff); install/uninstall still belongs to skill-install, and the page shells
  to agents-overview / project-detail.
- **Data fetching**: the list and the snapshot carry only the metadata needed to locate a skill package
  (name, side, source, description, symlink, shadowing and the other existing fields + the root path
  identity needed to open a preview); **on expanding a row** the package's files are enumerated and
  registered in the allow-list, and **on clicking a file** the contents are read on demand by path —
  reusing the same "exact path allow-list + read on demand" discipline as memory and artifacts, with
  no new arbitrary-path read hole.
- **Depth**: a relative path inside the package with ≤ 2 segments (excluding `.` / `..`) enters the
  list; anything deeper only triggers the notice copy.
- **Text extensions** (an initial set, adjustable during implementation but pinned by a unit test):
  `md` `txt` `json` `yml` `yaml` `toml` `sh` `bash` `zsh` `js` `ts` `mjs` `cjs` `jsx` `tsx` `py` `rb`
  `go` `rs` `css` `html` `svg` (svg read as text) and so on — the single constant set in the
  implementation is authoritative; unlisted extensions do not appear in the list.
- **Junk directory segment names** (whose whole subtree is skipped during enumeration): `.git`,
  `node_modules`, `__pycache__`, `.DS_Store` and the like, as a single constant set.
- **Cross-side diff**: the field, the comparison logic, the UI and the tests are all deleted; no
  deprecated compatibility slot is retained.
- **N sides**: in the domain, a skill's "sides it exists on" is a list or set rather than a hard-coded
  binary structure; adding an agent side only adds a recognisable side to the preview UI, without
  changing the interaction skeleton.
- **Detail list assembly**: when grouping by side, the global-layer set = that side's global names −
  that side's project-level names; the project-level set is kept whole. The filtering happens while
  assembling the detail data (or in a pure selector), so the IPC exit and the UI agree and there is no
  "the contract has a row, the UI hides it".
- **Filtering by name is client-side only.** No IPC command, no contract change, no snapshot field: both
  lists already hold every name they display. The keyword lives with the section that owns the list, which
  is what makes E9 (survives a refresh) and E10 (cleared on leaving) fall out rather than need arranging.
- **The two lists share the control, not the filtering.** The box itself is one component — otherwise the
  placeholder, the class and the input attributes drift apart between two boxes that are meant to look
  identical. Everything behind it stays per-list: each keeps its own keyword state and applies the rule to
  its own shape (one flat list; five groups with counts). The rule is a pure predicate in its own module,
  shared because it is genuinely one rule; no component wraps the *filtering*, because there is nothing
  common in the shapes around it.
- **The box carries a modifier rather than restyling the shared search-bar rule**, because that rule also
  serves the sessions search, whose box shares its row with a scope toggle and must flex. Widening it
  there would resize a box in another section — the kind of change that is invisible until someone opens
  that other section.
- **Floating layers over the skills list** follow one shared discipline (R10): position against the
  viewport from the anchor's measured rect — which is also what carries them out of the list's clipping —
  and dismiss on anything that invalidates that rect.
- **Their surface is one component; their placement is not.** The look (fixed positioning, background,
  border, radius, shadow) is defined once and shared, because it genuinely is the same and the two copies
  it replaced had already drifted apart. Placement is not shared: one layer flips between above and below
  its anchor, the other clamps against the window edge, and merging those would be an abstraction built
  on two instances whose successor is unknown. That merge is deferred to its own task.
- **The surface's shadow is a theme variable**, defined for every palette and both light and dark. It was
  previously a literal in each copy, which made this surface the one thing in the UI that could not
  follow the palette — and a single alpha cannot serve both, since one that reads on a light backdrop
  disappears on a dark one.
- **New copy goes through the dictionaries**: the placeholder and the "no name matched" empty states are
  user-visible strings, so they exist in all six languages. The empty state is a **new** string, not a
  reuse of the existing "library is empty" one (E5/F4) — reusing it would be cheaper and would lie.

## Testing Decisions

Following ADR-0002's dual seam:

1. **The providers / security seam**: tested on fixture directories — depth truncation and the notice
   condition, extension filtering, junk directory skipping, symlink following, out-of-package path
   refusal, an unregistered path being unreadable, a missing `SKILL.md`, an empty package; the open
   enumeration does not pre-hide contents in the scan snapshot; **on a same-side same-name pair the
   detail skills list contains no covered global row** (at least one Claude and one Codex fixture).
2. **The contract seam**: round-trip validation after removing `differs`; validation of the new
   preview-related fields and commands; plugin entries have no preview path.
3. **e2e**: opening an on-disk skill from global or detail → see a fragment of `SKILL.md`; clicking
   another text file in the package switches the content; plugin rows are not previewable (if a
   fixture can be built); on a same-name pair in detail, no second global row appears in the UI.

A good test asserts only external behaviour (directory → the set of relative paths listed / the text
read / the reason for refusal), never the internal traversal details. Drawer animations are not unit
tested.

**Filtering and hover** add no provider-side surface, so they sit on the seams that already exist:

4. **The matching rule** is a pure predicate over (name, keyword) and is unit tested there: case
   insensitivity, substring rather than subsequence, regex metacharacters treated literally, whitespace
   treated as empty, and the namespace prefix counting as part of the name.
5. **e2e** covers what only assembly can show: both lists narrow and recover; a group heading's count
   follows the filter and a group with no matches disappears; the two "nothing here" states are distinct
   sentences; an expanded row survives filtering while a row that left and returned comes back collapsed.

**Two traps specific to this feature, both of which produce green tests that prove nothing:**

- **A clipped element still reports a bounding box.** Asserting that the tooltip "is visible" in the
  library's usual sense passes even when nothing of it is painted. The tooltip's visibility must be
  asserted by **hit-testing its own centre** — if the point resolves to something behind it, it was cut
  away. The same trap applies to the install popover, whose regression test already works this way.
- **Assertions keyed to a class name can be permanently true.** The clipping box is named differently in
  the prototype and in the app, so a check written against one name silently never fires against the
  other. Assert the **property** (an ancestor that clips) rather than the name of the element that
  happens to have it today.

A third, hit while testing this and worth the same treatment:

- **An assertion can be satisfied by the wrong cause.** "Typing closes the install popover" was first
  asserted by opening the popover on a row the keyword then filtered away — so the popover vanished with
  its row, and the assertion passed with the deliberate close deleted. Whenever a test removes something
  and then checks that something else is gone, pin the thing that was supposed to *stay*: assert the
  anchor row is still there, so only the behaviour under test can explain the disappearance.

Related, for browser assertions specifically: dismissal-on-scroll and dismissal-on-resize must be driven
by **dispatching the event**, not by really scrolling or resizing. Doing it for real moves the row out
from under the pointer, the layer goes away via the pointer leaving, and the assertion passes whether or
not the listener was ever attached.

All of these were hit while building this, which is why they are recorded here rather than left as advice.

**Coverage gaps, recorded rather than papered over** (a stated gap is worth more than a green that means
nothing):

- **E6 / F7** (no box when the list is empty to begin with) — guaranteed structurally, since the empty
  case returns before the box is rendered, but nothing pins it.
- **E9 / E10 / F6** (the keyword surviving a refresh, and clearing on leaving or switching project) —
  these follow from *which component owns the state*, so the way they break is someone lifting that state
  to a parent. That is the highest-value gap of these five.
- **G7** (shifting left near the window edge) — the name column sits far from the right edge, so the
  clamp effectively never binds; reproducing it needs an extreme window size.
- **F5** (the uninstall dialog being unaffected) — it is a page-level modal with no coupling to the list.
- **G′4** (a name that is entirely whitespace or holds control characters) — needs a fixture with such a
  directory name.

## Out of Scope

- Cross-agent-side machine diff / side-by-side diff / the `differs` signal (retired, see CONTEXT).
- System-opening non-text files in a package, and asset thumbnails.
- Rich-text preview of non-markdown files (script highlighting and so on); non-text files are still not
  listed (C4).
- Editing a skill from this app or writing back to disk.
- Adding to or removing from the global library (it is read-only); install/uninstall details are in
  skill-install.
- Wiring up a new agent side's data source (such as Grok) in this ticket; it only requires the model
  and the UI to be **extensible to N sides**, while still consuming the existing ones.
- **Matching anything other than the name** — descriptions, file contents, frontmatter. Rows do not show
  a description, so a hit explained by text the user cannot see reads as a malfunction (E2).
- **Fuzzy or ranked matching.** Subsequence matching (`gwd` → `grill-with-docs`) was considered and
  declined: it needs scoring to be usable, and scoring makes the result order a thing that must itself be
  explained.
- **Highlighting the matched fragment**, and any count-of-matches readout.
- **Persisting the keyword** across sessions, or sharing it between the global and detail lists.
- **A search box on the other sections** (Subagents, Plugins, Memory, MCP) — see R11.
- **Widening the name column, or making it flexible.** The 200px is shared row geometry across sections;
  changing it is a separate decision about that geometry, not a consequence of filtering.
- **Reaching the full name by keyboard.** The reveal is hover-only for now; the name is also readable in
  the drawer's subtitle, so nothing is unreachable, but this is a real gap rather than a non-goal and is
  the obvious next thing if the tooltip proves useful.

## Further Notes

- **Prototype gate: passed** (2026-08-06). The user confirmed implementing the prototype's current
  behaviour (a list expanding into a file table with lines / size / date; clicking a file opens a
  drawer; markdown preview with a frontmatter card, and raw/preview shown for markdown only).

- **Existing descriptions that must be rewritten** (at implementation wrap-up, step 8; this spec pins
  the contract first): "same-name content differing between the two sides is badged" in
  `docs/features/agents-overview.md`; the difference explanation in the skill-install prototype's copy;
  any test title depending on `differs`.
- **The parallel with subagents-view**: switch sides and read the source, no cross-side diff — skills
  aligns with it; the only difference is that a skill is a **package**, hence the multi-file
  enumeration and depth rules.
