# ADR-0053: A display copy kept apart from the accounting cache restores the pages read after a restart, keeping a turn's content only within a size per turn

- Status: Proposed

## Context

A restart must show the previous run's data and the pages viewed before while the first scan runs, also after an update
invalidated the accounting cache and with it the question index that opens sessions (ADR-0011). One turn of a session
can hold hundreds of megabytes, and the copy is read back at launch as one string, which a JavaScript runtime caps.

## Options

1. **A display copy apart from the accounting cache, which keeps a turn's content only within a size per turn** —
   chosen.
2. Restore only the snapshot and the main process's derived state — rejected: an invalid accounting cache has no
   question index, so a session cannot be opened.
3. Derive everything from the accounting cache at startup — rejected: the upgrade case invalidates that cache.
4. Tie the saved display data to the accounting stamp — rejected: it removes the previous data exactly when a full
   rescan makes it most useful.
5. Keep every turn's content read — rejected: a copy over the string cap fails to read at launch, which loses every
   saved page, and the turns kept hold memory for the app's life.
6. A total for all turns kept as well, the least recently fetched leaving first — deferred: it waits for the owner's
   decision on #485, and is taken up when the owner adopts it.

## Decision

We adopt **option 1**.

- **The main process keeps a display copy**, versioned on its own, of successful scan and read outputs, each with its
  identity and observation; the renderer fills the query layer (ADR-0028) from its validated entries before it
  presents a saved page. A failed refresh keeps the last successful copy, authoritative absence retires an obsolete
  session, and query collection alone discards nothing. The renderer cannot write a path or a blob to it.
- **A turn's content is kept only within a size**: a turn whose body is over 8 MiB is kept by neither process nor
  written to the copy, and is fetched again when it is next shown.
- **A saved page answers a read-only presentation without the live index**; new source contents are still fetched
  through current registration and source validation. A restored exact-path registration takes extra target checks,
  never replaces the admission rules, and gives way to a current authoritative scan or enumeration.
- **The display copy is never a scan observation** and never rewrites history. A saved answer is tied to its page by
  the source question's identity, never by an ordinal; its text is neither ADR-0011's index nor a searchable corpus,
  and navigation and expansion state are not saved.

## Consequences

- Positive: a full restart shows the previous data and the pages read before, ahead of the first scan and across an
  accounting or index version bump; the source-read and accounting rules keep one owner each.
- Positive: no single turn can bring the copy near the string cap, nor stay in memory for the app's life.
- Negative: read content takes disk space and startup time, with no numeric retention limit, and its store needs
  atomic, ordered writes and schema validation.
- Negative: the number of turns kept has no bound, so their total can still pass the string cap.
- Negative: a revisit of a turn not kept waits for its fetch, which on a large compressed rollout decompresses from the
  file's start.
- Negative: the display copy may be stale, so its startup status and later replacement must stay visible and coherent.
- Neutral: the next successful scan or read follows the source; the saved copy recovers nothing never read and grants
  no access to a deleted or replaced target.

## Sources

The restoration discussion of 2026-09-13; the agents-overview, project-detail, session-view and token-stats specs. On
2026-09-13 an accounting cache of another version loaded no files. The size per turn: #485, settled on 2026-11-17.
Under Electron 43.2.0 a string holds at most 536,870,888 UTF-16 units. On this machine's data on 2026-11-17: 383 of
16,465 turns had a body over 8 MiB (Claude 13, Codex 369, Grok 1), the longest 582,015,113 bytes; every session's
question lines came to 100,374,954 bytes in all.
