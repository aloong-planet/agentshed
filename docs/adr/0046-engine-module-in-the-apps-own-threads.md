# ADR-0046: The engine module is loaded through Node-API by the app's own threads, rather than written in Go or run as a separate process

- Status: Proposed

## Context

The engine module (ADR-0045) answers the scan worker, the parse workers and the main process (ADR-0043), each
handing it files, entries or the display copy. Where it runs decides what its memory counts against
(token-stats::QR-003, token-stats::QR-004), what a call costs and what a fault in it ends.

## Options

1. **A Node-API module, loaded by the scan worker, the parse workers and the main process in the app's own
   process** — chosen.
2. Go — compared in discussion, not measured: in the app's process it brings its own runtime, garbage
   collector, threads and signal handling beside V8's and Chromium's, and only one fits in a process. Its
   natural form is a separate process, option 3.
3. A separate process over a pipe — rejected: its memory falls outside the footprint token-stats::QR-003
   measures, so meeting it would mean not measuring the app; every result is serialised once more; it is one
   more executable to sign and notarise. It would isolate the app from a native crash (Consequences).

## Decision

We adopt **option 1**.

- The module is loaded through Node-API by the scan worker, the parse workers and the main process.
- A Rust panic is caught at the module's boundary and counts as a failed request, under ADR-0043's rule for a
  request the engine fails.

## Consequences

- Positive: the module's memory is the app's, counted where token-stats::QR-003 and token-stats::QR-004 measure
  it, and its results reach the thread that asked with no second serialisation and no executable of its own.
- Negative: a fault in native code, such as the C dependencies SQLite and zstd, ends the app's process, window
  included, where a failing worker only hands its work back (ADR-0043). A Rust panic is no such fault: it is
  caught at the boundary.
- Negative: the walk's result crosses into the project scan, and the display copy into the module at each
  write, holding the thread for one stretch longer than the two its clone and serialisation took (Sources);
  ADR-0043's about 70 ms for those two was measured in the app's main process, so in the app both may run
  longer. The stretch grows with the copy and is paid only while the window has no focus (ADR-0044).
- Negative: a parse holds the thread that asked for it, as one synchronous call, for as long as it reads (the
  whole file, or a resume's appended part), where the TypeScript parse gave way between reads. A parse worker
  runs nothing else, but a thread parsing a file itself answers nothing else meanwhile: the scan worker
  rebuilding a file for the session page or parsing a job a failed parse worker handed back, and the main
  process once the scan worker has failed.
- Neutral: Node-API is stable across Node versions and loads in a worker as in the main thread, so one build of
  the module per target serves every thread that loads it (Sources).

## Sources

#434, 2026-11-15, the Electron 43.2.0 binary as Node, a 10.4 MB display copy: 64–67 ms in one stretch against
32–42 ms in two. Node-API's ABI stability across Node versions:
<https://nodejs.org/docs/latest-v24.x/api/n-api.html>; loading in a worker:
<https://nodejs.org/docs/latest-v24.x/api/addons.html#worker-support>.
