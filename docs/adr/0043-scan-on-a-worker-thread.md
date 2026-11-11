# ADR-0043: A scan runs on one worker thread that owns the token cache; the main process only starts it and takes its result

- Status: Proposed

## Context

A scan ran on the main process's thread, and all of it but the parsing of changed files was
synchronous: the walk of the session trees, the registry and component reads, the cache lookups, the
aggregation and the cache write. While it ran the window took no input. Measured on 2026-11-11 under
Electron 43.2.0 on a machine with 3047 Codex rollouts, 4060 Claude session files and a 45.7 MB token
cache: a rescan with nothing to parse held the main process for one stretch of 1.4 s, and the first
after the machine had been idle took 4.3 s.

Scans start on a five-minute timer and when the window gains focus (token-stats E1), so the freeze fell
most often at the moment the user came back to the window. A click on a project during it drew the
page's saved copy, days old for a project last opened days ago, and the request for its current detail
waited behind the scan.

The token cache also carries every session's question index (ADR-0011), so the session page, the
project search and global search read it between scans.

## Options

1. **One worker thread that lives for the run owns the token engine and its cache and runs the whole
   scan; the main process sends it requests** — chosen.
2. Leave the scan on the main process and only cut its cost, by keeping each rollout's first-line
   reading between scans and writing the cache only when it changed — rejected as the whole answer. What
   is left on the measured data is still one stretch of about 0.3 s: listing and stat-ing seven thousand
   files, the aggregation, the archive merge and the display save. It grows with the data. Both cuts are
   made as well (token-stats::QR-002), because they shorten every scan wherever it runs.
3. Leave the engine on the main process and make its work yield: asynchronous file calls in every
   reader, pauses inside the aggregation — rejected. The aggregation is one pass whose order is part of
   its result, since cross-file de-duplication keeps the first copy of a message, and the cache write
   serialises the whole cache in one call. Each would have to be rewritten in pieces, in the code where a
   mistake is a wrong figure nobody notices.
4. Give the parse workers the walk and the planning as well, and leave the engine on the main process —
   rejected. The aggregation and the cache write need every file's cached result, and those live where
   the engine lives. Sending them to a worker at each scan costs the main process more than the
   aggregation does.
5. A separate process instead of a thread — rejected. The requests and results would cross the same kind
   of boundary, with a process to start, watch and stop as well. What a process adds is isolation from a
   crash, and a worker that fails already hands its work back (below).
6. Change when a scan runs and leave where it runs: no scan on focus, scans only while the window is in
   the background, or a watch on the data directories — rejected. Focus is when the figures are about to
   be read, so it is the right moment to refresh them. A scan that still blocks would freeze a window
   left open on a second display, or the next timer tick while the window is in use. A watch starts scans
   more often and shortens none.

## Decision

We adopt **option 1**.

- **The scan worker owns the token engine**: the cache in memory, the cache file, and every step that
  reads the agents' data for a scan — the session walk, the registries and components, the plan, the
  parses, the aggregation and the cache write. It starts the parse workers itself.
- **The main process keeps what belongs to the window and to the archive**: the triggers and the rule
  that one scan runs at a time, the archive merge and its failure notice (ADR-0039), deriving the figures
  from the effective rows, validating the snapshot, saving the display copy and sending the result to
  the window.
- **Reading the question index is a request to the worker**: the session page, the project search,
  global search and the freshness check ask it, and it answers between the steps of a running scan.
- **A worker that will not start, fails or exits hands the work back**: the request in flight and every
  later one in that run are served on the main process, by an engine that reads the cache file, as a
  build without the worker would. It is logged once. The figures are the same and the window is held
  again for as long as a scan's synchronous work takes.
- **Quitting asks the worker to stop and waits for it**, so it stops between steps and no cache write is
  cut short.

## Consequences

- Positive: a rescan no longer freezes the window. The target on the measured data is no stretch over
  100 ms on the main process during a rescan (token-stats::QR-001), against 1.4 s and more.
- Positive: the cache, 45.7 MB on disk and several times that in memory, leaves the main process's heap.
- Negative: every use of the engine is a message to another thread. A session page's index read waits
  for the worker to reach the end of the step it is in, which is under a second on the measured data, and
  a scan's results are copied across the boundary, about 2 MB each time.
- Negative: a scan can run in two places, the worker and the main process after a failure, and the two
  have to stay the same code.
- Negative: worker threads now start worker threads. Measured on 2026-11-11 under Electron 43.2.0: a
  worker starts its own worker and the runtime's SQLite module loads in the inner one.
- Negative, not solved here: saving the display copy still clones and serialises it on the main process
  at every scan and every page read, about 70 ms in two stretches on the measured data.
- Neutral: the triggers and their intervals do not change, and the archive stays where it was.

## Sources

The measurements of 2026-11-11 quoted above, taken with the scan benchmark and a phase-by-phase probe
under Electron (the AGENTS.md invariant on main-process figures); a CPU profile of a rescan with nothing
to parse, in which reading every rollout's first line took 830 ms, the cache write 250 ms and the
aggregation 120 ms of 1444 ms. ADR-0011, ADR-0039; token-stats E1, token-stats::QR-001,
token-stats::QR-002; project-detail T2 and T3.
