# ADR-0044: The token cache lives in a SQLite store and is aggregated by de-duplication group; the display copy is written while the window has no focus

- Status: Accepted (2026-11-16)

## Context

A token cache kept as one JSON file was read whole at launch, held in memory, combined in full at every scan and
written whole when one entry changed (ADR-0043): its memory, scan time and writes grew with the history, not with what
changed. The combination needs more than one file only where files share a de-duplication key (a Claude message id,
ADR-0005; a Codex session or parent id; an Antigravity call's identity), and on real data such groups are almost all
one file. Saving the display copy (ADR-0053) after every scan and page read cloned and serialised it while the user was
in the window.

## Options

1. **A SQLite store of per-file entries, combined and stored group by group, a scan combining again only the groups a
   change reaches; the display copy written only while the window has no focus** — chosen.
2. Keep the JSON file, smaller in memory (shared strings, column arrays, 64-bit id hashes) — rejected: every scan
   still combines every entry, and every change still writes the whole file.
3. One file per session, or an append-only log beside the JSON file — rejected: the writes follow what changed, but
   the whole history is still read at launch, held and combined at every scan.
4. Fold sessions unchanged for a week into per-day totals — rejected: grouping saves as much for every unchanged file,
   without a second path through the accounting.
5. Combine each group on demand, with no stored result — rejected: every scan would read every entry back, the
   whole-history cost moved to disk.
6. Write the display copy on every change, only at blur and quit, or also every five minutes while focused — rejected:
   the first stalls the foreground at every scan and page read, the second loses a background window's timed scans to
   a crash, and the third brings the stall back to bound a loss the next scan rebuilds.

## Decision

We adopt **option 1**.

- **The store** is a SQLite database in the settings directory, opened by the engine module (ADR-0045) and owned by
  the scan worker (ADR-0043), one row per file: its path, signature and per-file aggregate.
- **A group** is a set of files connected by shared de-duplication keys, combined alone in scan order; its result
  (usage rows, sessions and what a scan reads from them) is stored. A scan combines again only the groups whose files,
  order, input or combination differ from their stored result's (token-stats, Implementation Decisions, Cache), with
  every group a changed file now shares a key with, and sums the stored results (token-stats::CON-003).
- **Upgrading** imports the previous structure version's JSON cache once and deletes it, its only reader;
  **restoring** (token-stats C16) reads a copy of the store, never a JSON file.
- **The display copy**, when it holds a change, is written as the window loses focus, when a change arrives while it
  has none, and at quit.

## Consequences

- Positive: the engine's footprint and peak, a rescan's time and a scan's writes follow what changed.
- Positive: launch reads no whole cache; in the window no scan or page read clones or serialises the display copy.
- Negative: the store is larger on disk than the JSON file, holding the key index and the groups' results as well.
- Negative: the cache structure version moves, and the accounting stamp's cache component with it (token-stats C10);
  JSON snapshots taken before stop being restorable (token-stats C16).
- Negative: the first launch after the upgrade stalls on the import, at a peak footprint of its own; a build from
  before, launched afterwards, finds no JSON file and parses every session file once.
- Negative: a crash or forced quit while the window has focus loses the display copy's changes since focus came; the
  next launch shows the older copy until its first scan.
- Negative: a grouping mistake is a wrong figure nobody notices; tests hold it to recorded figures and to the store
  combined again from scratch.
- Neutral: a development run and the installed copy share one store (token-stats C27), each noticing the other's
  writes before it scans.
- Neutral: the main process's footprint with both halves in place is held to token-stats::QR-003.

## Sources

In `~/research/agentshed-memory/`, under Electron 43.2.0, on this machine (about 7,000 session files, a 45 MB cache):
`2026-11-12-where-the-memory-goes.md` (beta.8 after six days: the main process 730–990 MB, peak 973 MB; the engine's
peak about 605 MB; one changed entry 45 MB written; a display copy save about 70 ms);
`2026-11-12-how-comparable-apps-keep-memory-low.md` (option 2: 73 MB to 33–54 MB; 4,171 Claude files in 4,149 groups);
`2026-11-12-sqlite-prototype.md` (the prototype under Electron as Node: the engine's peak 85–110 MB, a rescan 277–322
ms to 142–156 ms, a few changed files 2–6 MB written, the store 64 MB, the import 1.3–1.9 s at a peak of 340–351 MB).
#424, 2026-11-16, packaged 29856af, 7,421 session files: token-stats::QR-003's peak 138 MB, 110 MB after five rescans.
