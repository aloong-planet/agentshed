# ADR-0044: The token cache lives in a SQLite store and is aggregated by de-duplication group; the display copy is written while the window has no focus

- Status: Proposed (2026-11-12)

## Context

The token cache is one JSON file: the scan worker reads all of it at launch, holds every file's entry in
memory, combines every entry at every scan and writes the whole file again whenever one entry changed
(ADR-0043). Measured on 2026-11-12 on this machine (about 7,000 session files, a 45 MB cache) with the
installed beta.8, which ran for six days: the main process, its worker threads included, held 355–465 MB
after a forced collection and 730–990 MB without one, with a peak of 973 MB, and a scan that changed one
entry wrote 45 MB. The token engine alone, run under Electron as Node, held about 80 MB of live JS data and
peaked at about 605 MB, the peak coming from reading and combining everything at once. All of it grows with
the history on disk, not with what changed.

The combination has to see more than one file only where files share a de-duplication key: a Claude
message's id and request id, a Codex session id and the parent id a fork names, an Antigravity call's
identity. On the measured data those groups are almost all one file each (4,171 Claude files fell into
4,149 groups).

Separately, the main process saves its display copy (ADR-0029) after every scan and every page read: it
clones the copy and serialises it, about 70 ms in two stretches on the measured data, and does so while the
user is in the window as much as when they are not.

## Options

1. **Keep each file's entry as a row of a SQLite store, group the files by the de-duplication keys they
   share, combine each group alone and store its result, and at each scan combine again only the groups
   a changed file belongs to, then sum the stored results; write the display copy only while the window
   has no focus** — chosen.
2. Keep the JSON file and make its contents smaller in memory: one copy of each repeated string,
   column arrays for the per-event records, 64-bit hashes for the ids — rejected as the answer. Measured,
   it takes the resident cache from 73 MB to between 33 and 54 MB, but every scan still combines every
   entry and every change still writes the whole file.
3. One file per session, or an append-only log beside the JSON file — rejected. Either keeps the writes
   to what changed, but the whole history is still read at launch, held in memory and combined at every
   scan.
4. Fold sessions that have not changed for a week into per-day totals, keeping only the ids the
   cross-file de-duplication needs — rejected: grouping gives the same saving for every unchanged file,
   cold or not, without a second path through the accounting.
5. Combine each group on demand and keep no stored result — rejected: the scan would read every entry
   back from the store at every scan, which is the whole-history cost of today moved to disk.
6. For the display copy: write on every change, as now — rejected: the cost lands while the user is in
   the window, at every scan and every page read. Write only at blur and at quit — rejected: while the
   window stays in the background its timed scans are never saved, and a crash after hours there loses
   all of them. Write while unfocused and also every five minutes while focused — rejected: it brings the
   stall back into the foreground to bound a crash's loss of a copy that the next scan rebuilds anyway.

## Decision

We adopt **option 1**.

- **The store** is a SQLite database in the settings directory, opened through the runtime's built-in
  module, owned by the scan worker as the JSON file was (ADR-0043). A file's entry is a row keyed by its
  path, with its signature and its per-file aggregate. In memory the engine keeps each file's signature
  and its group; the aggregates and the index of keys stay in the store.
- **A group** is a set of files connected by a shared de-duplication key. Each group is combined by the
  same combination as before, its files in scan order, and its result — its usage rows, its sessions
  and what the scan reads from them — is stored. A scan combines again only the groups that hold a file
  that changed, left the scan set, moved in the scan order, or now shares a key with a changed file; the
  scan's figures are the stored results summed. The figures equal one combination over every file in
  scan order (token-stats::CON-003).
- **Upgrading** imports the last JSON cache once, when it is this build's previous structure version, and
  deletes it; the import is the only reader of that file.
- **Restoring** (token-stats C16) reads a copy of the store, never a JSON file.
- **The display copy** is written when it holds a change and the window has no focus: when the window
  loses focus, when a change arrives while it has none, and at quit.

## Consequences

- Positive: measured on the prototype under Electron as Node on the same data: live JS data from about
  80 MB to 7–8 MB, the engine's footprint after five scans from 211–219 MB to 78–107 MB, its peak from about
  605 MB to 85–110 MB, a rescan from 277–322 ms to 142–156 ms, and a scan that changed a few files writes
  2–6 MB instead of 45 MB. Grouped and whole combinations matched row for row on the real data and under a
  stress run that added, removed and joined groups.
- Positive: launch no longer parses a 45 MB file; the engine starts in about 15 ms.
- Positive: while the user is in the window, neither a scan nor a page read clones or serialises the
  display copy.
- Negative: the store is 64 MB on disk against the JSON file's 45 MB: it holds the key index and each
  group's stored result as well.
- Negative: the cache structure version moves, so the accounting stamp's cache component moves with it
  (token-stats C10), and every JSON snapshot taken before stops being restorable (token-stats C16).
- Negative: the first launch after the upgrade imports the JSON file, 1.3–1.9 s with a peak footprint of
  340–351 MB in the prototype. A build from before this change, launched afterwards, finds no JSON file and
  parses every session file once.
- Negative: a crash or a forced quit while the window has focus loses the display copy's changes since the
  window gained it; the next launch shows the older copy until its first scan.
- Negative: the grouping is new accounting code where a mistake is a wrong figure nobody notices; its
  equality with the whole combination is what the tests hold it to.
- Neutral: a development run and the installed copy still share one store on a case-insensitive volume, as
  they shared the JSON file; each notices the other's writes before it scans.
- Not measured yet: the main process's own footprint with both halves in place. It is held to
  token-stats::QR-003, and this entry is accepted once that is met on the built change.

## Sources

`~/research/agentshed-memory/2026-11-12-where-the-memory-goes.md` (the beta.8 measurements),
`2026-11-12-how-comparable-apps-keep-memory-low.md` (options 2–4 and the grouping count) and
`2026-11-12-sqlite-prototype.md` (the prototype, its comparisons and its measurements), all taken under the
Electron 43.2.0 binary. ADR-0011, ADR-0026, ADR-0029, ADR-0043; token-stats C10, C16, token-stats::QR-002.
