# Code review — #294 (the memory drawer previews Markdown)

Ticket: [#294](https://github.com/aloong-planet/agentshed/issues/294). Date 2026-10-21. Implementation: uncommitted on
feat/memory-md-preview over 9b7bb13. Scope: `FileDrawer` (new) under `SkillFileDrawer` and `MemoryFileDrawer`;
the project memory's main-file entry, its read registration and contract check; restoring saved project
details; the drawer class rename and styles; the removed `memory.topicMeta` copy; the unit and e2e tests.

## Underlying premises — 2 findings, both fixed

- **F1 (bug, fixed).** The spec said saved data from before the new field "degrades to not listed". It did not:
  restoring a saved read re-runs the live contract (`validateProjectDetail` in `validSavedRead`), so every
  project detail the installed app had saved (`memory: { main, topics }` — checked in the installed app's
  display cache) would be dropped, and after the update each viewed project would wait for its live read —
  the upgrade case ADR-0029 requires to keep working. Escape surface: per entry (self), but against a confirmed
  requirement, so fixed now: a saved project detail with no `mainFile` key is given `null` before validation; a
  present but malformed one is still dropped. Test: `display-store.test.ts` "restores a project detail saved
  before …" — red on the old code (`expected [] to deeply equal [ '/p' ]`), green after a fix that only fills the
  field, which pins the cause. Class-level check — other persisted shapes this change touches: snapshot, stats,
  session pages, artifact and skill contents, registrations: none changed; 0 others.
- **F2 (stale notes, fixed).** The provider test header said the drawer's failure branch was "tested by hand",
  and the spec's Testing Decisions said e2e covers only the normal read; e2e now covers an empty file and a
  file removed after the scan. Both rewritten.
- New causal comments, each checked: the body keyed by file resets the scroll on a switch — confirmed by
  mutation (without the key the switched-to body stays at 420.5 px; see Runnability); the main file joining the
  project's allow-list is what opens a late main file — confirmed by mutation ("This artifact path is not in the
  allowed list"); Electron logs every rejected IPC handler to stderr, and Playwright waits on a navigation the
  guard cancels — both observed in this run's e2e output.

## Runnability — 1 finding (a test's false green), fixed

- **F3 (false green, fixed).** The scroll-to-top check could not fail: `second.md` was short (a non-scrolling
  body sits at the top on its own) and unread (the "Loading…" placeholder resets any body). Removing the key
  survived twice. The test now reads `second.md` first and makes it long; the same mutation then fails at the
  scroll assertion (received 420.5), and the real run passes.
- State paths of the drawer: open (row click, main-file link), switch (in-directory link → new file, mode back to
  preview, top), close (Esc, close button, overlay), read states (loading, failure, empty) — each reached by an
  e2e step. A snapshot refresh while open keeps the drawer on its file (the open state holds the entry it was
  opened from); a stale file list only means a link to a newly added file shows the toast until reopened — self.
- Read failure escape surface: one file's failure reports inside its own drawer — self.

## Security — no finding

The drawer's readable list is the directory's listed files; the main process admits only the main file the
provider listed (no new path shape); link resolution and external hand-off are the shared interception, with
an e2e step for each branch (in-directory, unlisted, external).

## Consistency — no defect; 2 refactor candidates for the owner

- The skill drawer keeps its behaviour on the shared component (Skills view and plugin preview e2e green). The
  class rename (`skill-drawer`/`skill-md` → `file-drawer`/`file-md`) is mechanical: 17 stylesheet occurrences,
  24 in e2e, none left (`rg -c "skill-drawer|skill-md"` exit 1). The close button now centres its icon in a
  fixed box (ui-design §6), and the bar fades as the prototype draws it.
- `memory.topicMeta` removed from the six dictionaries: its one reader was the replaced drawer; no dynamic access
  (`rg "memory\[|\.memory as|t\.memory\b[^.]|dict\.memory\b[^.]" src` — no output); dictionaries are not persisted.
- Refactor candidates (not done; owner's call):
  - R1 Duplicated code: `SkillFileDrawer` and `MemoryFileDrawer` build the same link context (find the target in
    the listed files → open it; unresolved → toast). Moving it into `FileDrawer` would mean a common file shape
    (`absPath` vs `file`). Escape surface: none. Suggested: not now — two call sites of ten lines each.
  - R2 Mysterious name: the shared drawer's copy (raw, preview, close, empty file) lives under `skills.*` keys
    while the memory drawer uses it too. Renaming touches six dictionaries. Escape surface: none. Suggested:
    a separate task, or not at all.

After F1 and F3 (premise and runnability findings) the security and consistency layers were scanned again: the
saved-data fill-in only adds a null for an absent key and admits no path; no new finding.
