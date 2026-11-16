# ADR-0051: A project's documents are neither listed nor read, and the read path they shared is memory files' alone

- Status: Accepted (2026-11-10)

## Context

Project detail had an Artifacts section: it listed the documents a project keeps under `docs/` (its ADRs,
`CONTEXT.md`, specs, feature pages, postmortems and prototypes), read the Markdown ones in an overlay and opened a
prototype in the system's default application, and the glossary named such a document an Artifact, one kind of
output of "the eight-step process", a workflow this project no longer describes that way. Memory reading went through
the same read command, allow-list and saved display data, all named after artifacts, so display copies saved before
the removal hold reads and read registrations of memory files and of documents under one tag.

## Options

1. **Remove the section and the glossary term; rename the shared read path after memory files; on restore, keep a
   read or registration saved under the old tag only for a path the restored data lists as a memory file**
2. Remove only the section and keep the read path's artifact name — rejected: memory reading would go on being
   described, in the code and in the specs, in terms of a feature that no longer exists.
3. Drop every read and registration saved under the old tag — rejected: memory previews restore from them today, and
   the first launch after the update would lose them until each page was opened again.
4. Tell a memory file from a document by its path, keeping whatever lies outside a project's `docs/` — rejected (not
   recorded; the implementer's own comparison): memory files have no one place (Codex keeps its own under its home
   directory), so a path's shape names a file without identifying it, and a document outside `docs/` would pass.

## Decision

We adopt **option 1**. Project detail lists and reads none of a project's documents and opens nothing in another
application; a relative link to one in the project's rendered instructions gets the out-of-scope notice, like any link
outside the readable set. The read command, its allow-list key, its errors and its saved-read kind are named after
memory files. A display copy saved before the change restores through the live contract: a saved project page loses
its document list, and a read or registration saved under the old tag survives, as a memory file's, only for a path
the restored snapshot or a restored project page lists as a memory file. The term Artifact leaves the glossary.

## Consequences

- Positive: memory reading is named for what it reads, and no path a project page listed as a document becomes
  readable, from a live page or from a restored one.
- Negative: a memory read or registration saved under the old tag whose path no restored listing names, as when the
  saved snapshot is dropped as malformed, is lost until a scan or the page registers it again.
- Negative: a build from before the change that reads a copy this one wrote restores none of its read registrations
  and none of its memory reads, which carry the new names, until its own scan and pages register them again.
- Neutral: the prototypes that draw the section stay as they are (ADR-0033), and "artifact" in release and packaging
  text still means a build output.

## Sources

Ticket #402: the owner's decisions of 2026-11-10. This machine's display cache on 2026-11-14: the scan's registration
listed 293 paths, every one a memory file the snapshot lists; the project registrations' other paths all lay under
`docs/`; of 35 reads saved under the old tag, 25 were memory files' and 10 documents', one of those a page no longer
listed; no path was both.
