# ADR-0043: A scan runs on one worker thread that owns the token cache; the main process only starts it and takes its result

- Status: Accepted (2026-11-12)

## Context

Most of a scan is synchronous work, from the walk of the session trees to the aggregation and the cache write, so on
the main process's thread it holds the window (Sources). Scans start on a timer and when the window gains focus
(token-stats E1), so the freeze falls as the user comes back, and a project's current detail waits behind it. The
token cache also holds every session's question index (ADR-0011), which the session page and both searches read
between scans.

## Options

1. **One worker thread, kept for the run, owns the token engine and its store and runs the whole scan; the main
   process sends it requests** — chosen.
2. Only cut the scan's cost on the main process, keeping the rollouts' first-line readings between scans and writing
   only what changed — rejected as the whole answer: one stretch of about 0.3 s is left and grows with the data,
   though both cuts are made as well (token-stats::QR-002).
3. Make the engine's work yield on the main process — rejected: the aggregation is one pass whose order is part of its
   result, since de-duplication keeps a message's first copy, so cutting it into pieces risks a wrong figure nobody
   notices.
4. Give the parse workers the walk and the planning, the engine staying on the main process — rejected: the
   aggregation and the cache write need every file's cached result, and sending those to a worker each scan costs
   more than the aggregation does.
5. A separate process — rejected: the same boundary plus a process to start, watch and stop, for a crash isolation
   that a failing worker already gives by handing its work back.
6. Change when a scan runs: no scan on focus, scans only in the background, or a watch on the data directories —
   rejected: focus is when the figures are about to be read, a scan that still blocks would freeze a window in use,
   and a watch starts more scans and shortens none.

## Decision

We adopt **option 1**.

- **The scan worker owns the token engine and its store (ADR-0044)**, with every step that reads the agents' data
  for a scan, the parse workers included; the main process keeps the triggers, one scan at a time, the archive merge
  and its failure notice (ADR-0039), the figures, the display copy and the window (token-stats, Where a scan runs).
- **A question-index read is a request to the worker**, answered between the steps of a running scan.
- **A worker that will not start, fails or exits hands the work back**: every request of the run from then on, those
  in flight included, is served on the main process by a scanner opening the store as the worker left it, with the
  same figures, logged once. A request the worker's engine fails is a failed request, not a failed worker.
- **Quitting stops the worker between steps and waits for it**, so no store write is cut short, and then flushes the
  display copy, so a scan finished before the stop is saved before the exit; what the worker has not answered stays
  unanswered.

## Consequences

- Positive: a rescan no longer freezes the window, held to no stretch over 100 ms on the main process
  (token-stats::QR-001), and the engine and its store leave the main thread's heap.
- Negative: every use of the engine is a message to another thread: an index read waits for the step under way, under
  a second on the measured data, and each scan's results, about 2 MB, are copied across.
- Negative: after a worker failure a scan runs on the main process and holds it again, and the two have to stay the
  same code.
- Negative: worker threads start worker threads, the parse workers.
- Negative: between a scan's end on the worker and the main process taking its result, an index read is answered from
  the new store against the previous scan's allow-list, so a file that just left the scan set is refused meanwhile.
- Negative: what ran after a scan only because the scan held the main thread now runs during it, so an order like the
  quit's flush after the worker's stop must be kept on purpose.
- Negative: handing the display copy to the engine module holds the main thread for one stretch per write, which
  ADR-0044 confines to when the window has no focus (ADR-0046).
- Neutral: the triggers, their intervals and the archive do not depend on where a scan runs.

## Sources

Measured on 2026-11-11 under Electron 43.2.0, with 3,047 Codex rollouts, 4,060 Claude session files and a 45.7 MB
token cache: a rescan with nothing to parse held the main process for 1.4 s, 4.3 s after the machine had been idle,
of which the rollouts' first lines took 830 ms, the cache write 250 ms and the aggregation 120 ms; saving the display
copy took about 70 ms in two stretches; a nested worker loaded the runtime's SQLite module. On the built change
(about 7,000 session files), six rescans through the worker held the main process for at most 24–33 ms, against
283–476 ms for the same scans on it. Postmortem `2026-11-12-the-quits-flush-relied-on-the-scan-holding-the-thread`;
project-detail T2 and T3.
