# ADR-0045: The token engine, the session walk, the question-text rules and the display copy's writer are one Rust module loaded in the app's process

- Status: Proposed (2026-11-13)

## Context

The token engine (ADR-0043, ADR-0044) parses session files in TypeScript: the reader decodes each line whole
and `JSON.parse` builds every value in it. Measured on 2026-11-13 over a cold scan of this machine's data
(7,293 files, 19.5 GB of lines once cold rollouts are decompressed), the parse reads 2.7% of those bytes and
never reads 96.8%. The unread bytes sit in a few fields: tool output, copies of tool results and the history
Codex writes when it compacts a conversation.

ADR-0044 keeps a rescan's work and writes to what changed, but leaves the cold full parse alone. That parse
runs at first install, after a cache structure change that does not import the old cache, and after a damaged
cache. Through the parse pool it takes 44.5–47 s and peaks at 1,330 MB of footprint.

The question index and the titles come from the same per-line rules. The session page, the project search and
global search use those rules to read a question's text, and the session page uses them to show a turn.

## Options

1. **Write the engine in Rust as one Node-API module loaded in the app's process**: the session walk, reading
   every session file, each side's per-line rules, the question index and titles, each file's entry, the
   store, the grouping and the combination; the session page's and both searches' question text and the turn
   content's line rules call it; it serialises and writes the display copy — chosen.
2. Keep the engine in TypeScript, as ADR-0044 wrote it — rejected: the cold full parse stays at 44.5–47 s and
   1.3 GB, and its measured cost is building values no rule reads.
3. Rust for the store, the grouping and the combination only, the parse staying in TypeScript — rejected:
   after ADR-0044 those layers are already small. In its prototype they held 7–8 MB of live data, and summing
   the groups took 14–18 ms of a 142–156 ms rescan. This option pays the whole cost of a native module for
   little gain.
4. Rust reads the files and hands TypeScript only the fields its rules read, the rules staying in
   TypeScript — rejected by the owner in favour of option 1. It would leave two lists to keep in step, the
   fields the module extracts and the fields the rules read, and a field missed is a wrong figure nobody
   notices.
5. Go — compared in discussion, not measured. Loaded into the app's process, it brings its own runtime,
   garbage collector and threads beside V8 and Chromium, only one Go runtime fits in a process, and its signal
   handling has to coexist with theirs. Its natural form is a separate process, which is option 6.
6. A separate process the app talks to over a pipe — rejected:
   - its memory falls outside the main-process footprint token-stats::QR-003 measures, so meeting that
     threshold would mean not measuring the app;
   - every result is serialised once more to cross the pipe;
   - it is one more executable to sign and notarise.

   What it would give is isolation from a native crash; see Consequences.
7. Keep the TypeScript engine as a fallback for when the module will not load — rejected: every accounting
   rule would exist twice, held together by a parity check that never ends. A module that will not load is a
   build or install defect, and the tests and smoke runs on every shipped target catch it.
8. Leave the session walk, and the display copy's writer, in TypeScript — set aside by the owner, who chose to
   put all of this change's work in the module. The gain each would bring was stated when it was decided.
   The walk reads every Codex rollout's first line, which carries the session's base instructions. The display
   copy still crosses from JavaScript into the module once per write.

## Decision

We adopt **option 1**.

- **One module**, written in Rust, loaded through Node-API by the scan worker, the parse workers and the main
  process. Node-API is ABI-stable across Node versions and loads in both the main thread and a worker. The
  module is built from source for each target: darwin-arm64 for releases and development, linux-x64 for CI.
  No binary is committed, and its source lives in this repository.
- **What it owns**:
  - the session walk (each side's session list and every Codex rollout's first line), whose result goes to
    the project scan, which stays in TypeScript;
  - reading every session file, cold rollouts decompressed;
  - each side's per-line rules, the question index and the titles;
  - each file's entry, the store (ADR-0044), the grouping and the combination;
  - the question text and the turn content's line rules that the session page and both searches read;
  - serialising and writing the display copy, at the moments ADR-0044 sets.
- **Reading**: a value in a line is built only where a rule reads it; every other value is scanned past.
  Where JavaScript's `JSON.parse` and the module's parser would disagree on a line, the module gives
  JavaScript's result.
- **Its figures are the TypeScript engine's**: on the same files the module gives the same entries and the
  same figures, field for field, and the TypeScript engine is removed once that holds.
- **A module that will not load** makes every scan a failed scan (agents-overview::REQ-002/AC-03), and the
  failure is logged; no fallback engine exists. A Rust panic is caught at the module's boundary and counts as
  a failed request, under ADR-0043's rule for a request the engine fails.
- **The cold full parse** is held to a threshold, measured on a locally packaged build with its window shown,
  an empty token store and this machine's data (about 7,300 session files, 19.5 GB):
  - from launch to the first scan's figures reaching the window, at most 15 s;
  - over the same span, a peak footprint of the main process, its worker threads included, of at most
    600 MB.

## Consequences

- Positive: measured on a prototype of the Codex parse (a standalone program, four threads, as the parse pool
  has four workers) over all 3,052 Codex rollouts:
  - its results matched the TypeScript parse field for field;
  - it took 9.0–9.3 s against 42.0–42.5 s;
  - it peaked at 516–561 MB of footprint against 1,561–1,786 MB;
  - it spent 2.4 s of system CPU against 31 s.
- Positive: the question-text rules exist once, for the scan, the session page and both searches.
- Negative: a fault in native code, such as the module's C dependencies SQLite and zstd, ends the app's
  process, window included. Today a failing worker only hands its work back (ADR-0043). A Rust panic is not
  such a fault: it is caught at the boundary.
- Negative: a second language and toolchain. CI installs Rust and builds the module for linux-x64, and the
  release builds it for darwin-arm64. The module ships unpacked from the asar archive and is signed and
  notarised with the app.
- Negative: every accounting, question-index and title rule is rewritten: about 3,100 lines of TypeScript,
  and the behaviour their roughly 4,300 lines of tests hold. A mistake there is a wrong figure nobody notices;
  the parity with the TypeScript engine, on the test fixtures and on this machine's data, is what holds the
  rewrite to the old figures.
- Negative: there is a boundary to cross between JavaScript and the module. The walk's result goes into the
  project scan, and the display copy goes into the module once per write.
- Negative (inferred): the 600 MB threshold is below the prototype's 516–561 MB plus the app's own floor of
  about 100 MB, so the module has to read more leanly than the prototype did.
- Neutral: on the Codex data the prototype matched `JSON.parse` on every line, and no line failed to parse.
  The cases where the two parsers differ did not occur there, and the decision still requires JavaScript's
  result for them: a lone surrogate escape, a number out of range, a repeated key.
- Not measured yet: the module running inside Electron (the results handed back to JavaScript, and the app's
  own floor) and the other three sides. This entry is accepted once the cold-parse threshold and
  token-stats::QR-003 are met on the built change.

## Sources

`~/research/agentshed-memory/2026-11-13-unused-bytes.md` (the unread share and where it sits) and
`2026-11-13-rust-codex-parse.md` (the prototype, its comparison and the cold baselines), both measured under
the Electron 43.2.0 binary on 2026-11-13. Node-API's ABI stability:
<https://nodejs.org/docs/latest-v24.x/api/n-api.html>. Loading in a worker:
<https://nodejs.org/docs/latest-v24.x/api/addons.html#worker-support>. ADR-0043, ADR-0044;
agents-overview::REQ-002/AC-03; token-stats::QR-003.
