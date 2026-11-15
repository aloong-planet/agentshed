# ADR-0045: The token engine, the session walk, the question-text rules and the display copy's writer are one Rust module loaded in the app's process

- Status: Proposed

## Context

The token engine (ADR-0043, ADR-0044) parses session files in TypeScript, where `JSON.parse` builds every value
of a line though the rules never read most of the bytes: tool output, copies of tool results and Codex's
compaction history. ADR-0044 left alone the cold full parse, run at first install, after a cache structure
change that does not import the old cache and after a damaged cache, and it is slow and large (Sources). The
question index, the titles and the question text and turns the session page and both searches show come from the
same per-line rules.

## Options

1. **The engine, the session walk, the question-text rules and the display copy's writer in Rust, as one
   Node-API module loaded in the app's process** — chosen.
2. Keep the engine in TypeScript, as ADR-0044 wrote it — rejected: the cold full parse stays as slow and as
   large, and its cost is building values no rule reads.
3. Rust for the store, the grouping and the combination only, the parse staying in TypeScript — rejected:
   after ADR-0044 those layers are small (Sources), so the module's whole cost would buy little.
4. Rust reads the files and hands TypeScript only the fields its rules read — rejected by the owner for
   option 1: the fields extracted and the fields read are two lists to keep in step, and a field missed is a
   wrong figure nobody notices.
5. Go — compared in discussion, not measured: in the app's process it brings its own runtime, garbage
   collector, threads and signal handling beside V8's and Chromium's, and only one fits in a process. Its
   natural form is a separate process, option 6.
6. A separate process over a pipe — rejected: its memory falls outside the footprint token-stats::QR-003
   measures, so meeting it would mean not measuring the app; every result is serialised once more; it is one
   more executable to sign and notarise. It would isolate the app from a native crash (Consequences).
7. A TypeScript fallback for when the module will not load — rejected: every accounting rule would exist
   twice, held together by a parity check that never ends, and a module that will not load is a build or
   install defect the tests and smoke runs on every shipped target catch.
8. Leave the session walk and the display copy's writer in TypeScript — set aside by the owner, who put all of
   this change's work in the module. The walk reads every Codex rollout's first line, which carries the
   session's base instructions, and the display copy still crosses into the module once per write.

## Decision

We adopt **option 1**.

- **One module** in Rust, loaded through Node-API by the scan worker, the parse workers and the main process,
  built from its source in this repository for each target (darwin-arm64 for releases and development,
  linux-x64 for CI); no binary is committed.
- **What it owns**:
  - the session walk (the Codex, Grok and Antigravity CLI session lists and every Codex rollout's first line;
    Claude Code's sessions are listed by the planning, which stays in TypeScript), whose result goes to the
    project scan, which stays in TypeScript;
  - reading every session file, cold rollouts decompressed;
  - each side's per-line rules, the question index and the titles;
  - each file's entry, the store (ADR-0044), the grouping and the combination;
  - the question text and the turn content's line rules that the session page and both searches read;
  - serialising and writing the display copy, at the moments ADR-0044 sets.
- **Reading**: a value in a line is built only where a rule reads it, and every other value is scanned past.
  Where `JSON.parse` and the module's parser would disagree on a line, the module gives JavaScript's result.
- **Its figures are the TypeScript engine's**, entry for entry and field for field on the same files, and the
  TypeScript engine is removed once that holds.
- **No fallback engine exists**: a module that will not load, or reports another build than the application's
  code was made with, fails as token-stats' failure modes for scans and the window state. A Rust panic is
  caught at the module's boundary and counts as a failed request, under ADR-0043's rule for a request the
  engine fails.
- **The cold full parse**, on a locally packaged build with its window shown, an empty token store and this
  machine's data (about 7,300 session files, 19.5 GB), takes at most 15 s from launch to the first scan's
  figures reaching the window, with a peak footprint of the main process and its worker threads of at most
  600 MB over that span.

## Consequences

- Positive: a prototype of the Codex parse matched the TypeScript parse field for field in under a quarter of
  its time, about a third of its peak footprint and under a tenth of its system CPU (Sources).
- Positive: the question-text rules exist once, for the scan, the session page and both searches.
- Negative: a fault in native code, such as the C dependencies SQLite and zstd, ends the app's process, window
  included, where a failing worker only hands its work back (ADR-0043). A Rust panic is no such fault: it is
  caught at the boundary.
- Negative: a second language and toolchain: CI builds the module for linux-x64 and the release for
  darwin-arm64, and it ships outside the asar archive, among the app's resources, signed and notarised with
  the app.
- Negative: every accounting, question-index and title rule is rewritten, about 3,100 lines of TypeScript and
  the behaviour their roughly 4,300 lines of tests hold. A mistake there is a wrong figure nobody notices, and
  the parity with the TypeScript engine, on the fixtures and this machine's data, holds it to the old figures.
- Negative: the walk's result crosses into the project scan, and the display copy into the module at each
  write, holding the thread for one stretch longer than the two its clone and serialisation took (Sources);
  ADR-0043's about 70 ms for those two was measured in the app's main process, so in the app both may run
  longer. The stretch grows with the copy and is paid only while the window has no focus (ADR-0044).
- Negative: a parse holds the thread that asked for it, as one synchronous call, for as long as it reads (the
  whole file, or a resume's appended part), where the TypeScript parse gave way between reads. A parse worker
  runs nothing else, but a thread parsing a file itself answers nothing else meanwhile: the scan worker
  rebuilding a file for the session page or parsing a job a failed parse worker handed back, and the main
  process once the scan worker has failed.
- Negative: the 600 MB threshold is below the prototype's 516–561 MB plus the app's own floor of about
  100 MB, so, by inference, the module has to read more leanly than the prototype did.
- Neutral: on the Codex data the prototype matched `JSON.parse` on every line and no line failed to parse, so
  the cases where the parsers differ did not occur. The decision still requires JavaScript's result for them:
  a lone surrogate escape, a number out of range, a repeated key.
- Neutral: the module inside Electron (the results handed back to JavaScript, the app's own floor) and the
  other three sides are not measured yet; the entry is accepted once the cold-parse threshold and
  token-stats::QR-003 are met on the built change.

## Sources

`~/research/agentshed-memory/2026-11-13-unused-bytes.md`: a cold scan of this machine's data (7,293 files,
19.5 GB of lines decompressed) reads 2.7% of the bytes and never 96.8%, and through the parse pool takes
44.5–47 s and peaks at 1,330 MB. `2026-11-13-rust-codex-parse.md`: the prototype (four threads, as the pool has
four workers; all 3,052 Codex rollouts) took 9.0–9.3 s against 42.0–42.5 s, peaked at 516–561 MB against
1,561–1,786 MB and spent 2.4 s of system CPU against 31 s. Both under the Electron 43.2.0 binary, 2026-11-13.
`2026-11-12-sqlite-prototype.md` (ADR-0044): those layers held 7–8 MB of live data, and summing the groups took
14–18 ms of a 142–156 ms rescan. #434, 2026-11-15, the Electron 43.2.0 binary as Node, a 10.4 MB display copy:
64–67 ms in one stretch against 32–42 ms in two. Node-API's ABI stability across Node versions:
<https://nodejs.org/docs/latest-v24.x/api/n-api.html>; loading in a worker:
<https://nodejs.org/docs/latest-v24.x/api/addons.html#worker-support>.
