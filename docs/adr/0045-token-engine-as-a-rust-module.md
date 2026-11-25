# ADR-0045: The token engine, the session walk, the question-text rules and the display copy's writer are one Rust module that builds only the values a rule reads

- Status: Accepted (2026-11-25)

## Context

The token engine (ADR-0043, ADR-0044) parsed session files in TypeScript, where `JSON.parse` built every value of
a line though the rules never read most of the bytes (Sources). ADR-0044 left alone the cold full parse (token-stats
C1, C2, C26), and it was slow and large (Sources). The question index, the titles and the question text the session
page and both searches show come from the same per-line rules.

## Options

1. **The engine, the session walk, the question-text rules and the display copy's writer in Rust, as one module** —
   chosen.
2. Keep the engine in TypeScript, as ADR-0044 wrote it — rejected: the cold full parse stays as slow and as
   large.
3. Rust for the store, the grouping and the combination only, the parse staying in TypeScript — rejected:
   after ADR-0044 those layers are small (Sources).
4. Rust reads the files and hands TypeScript only the fields its rules read — rejected: the fields
   extracted and the fields read are two lists to keep in step, and a field missed is a wrong figure nobody
   notices.
5. Leave the session walk and the display copy's writer in TypeScript — rejected (not recorded; ruled out when
   scoping): the walk reads every Codex rollout's first line, which carries its base instructions, and the display
   copy crosses into the module once per write.
6. Keep the session page's and both searches' cold rollout reads on Node's zstd decoder — rejected: under
   Electron 43 it misses later frames (Sources), and the cut-short rule would exist twice.
7. Claude Code's session list made by the planning — rejected: the walk makes the four sides' session lists in one place.
8. Read lines with serde_json — rejected: a lone surrogate escape or a number beyond the double range in a value a
   rule reads fails the whole line where `JSON.parse` reads it, and a Rust string cannot hold the lone surrogate
   JavaScript keeps (Sources).

## Decision

We adopt **option 1**.

- **One module** in Rust, built from its source in this repository for each target; no binary is committed.
- **What it owns, and how it reads a line**: as token-stats, Implementation Decisions, The engine module says, and
  the display copy's writer besides (agents-overview, Startup implementation decisions).
- **The cold full parse** is held to token-stats::QR-004.

## Consequences

- Positive: a cold full parse in the packaged app reaches its first figures within token-stats::QR-004 (Sources).
- Positive: the question-text rules and the cold rollout reader exist once, for the scan, the session page and both
  searches.
- Negative: a second language and toolchain on every target it is built for, and a library shipped outside the
  asar archive.
- Negative: every accounting, question-index and title rule exists only as rewritten in Rust, so a mistake there
  is a wrong figure nobody notices.
- Negative: a slip in the cold rollout reader reaches the scan, the session page and both searches at once.
- Negative: token-stats::QR-004's 600 MB leaves the module little room (Sources), so a change that keeps more of a
  scan in memory at once can break it.
- Neutral: speed is not what the module's own reader is kept for: on this machine's lines it reads the same
  fields only 14–16% faster than serde_json (Sources).

## Sources

`~/research/agentshed-memory/2026-11-13-unused-bytes.md`: a cold scan of this machine's data (7,293 files,
19.5 GB of lines decompressed) reads 2.7% of the bytes and never 96.8%. `2026-11-13-rust-codex-parse.md`: with
the parse in TypeScript, a cold full parse of every side on the same machine's data took 44.5–47 s through the
parse pool and peaked at 1,330 MB; the prototype (four threads, the pool's four workers; all 3,052 Codex
rollouts) took 9.0–9.3 s against 42.0–42.5 s, peaked at 516–561 MB against 1,561–1,786 MB. Both under the Electron 43.2.0 binary, 2026-11-13.
`2026-11-12-sqlite-prototype.md` (ADR-0044): those layers held 7–8 MB of live data, and summing the groups took
14–18 ms of a 142–156 ms rescan.
#453, 2026-11-16, packaged 3ca4011 on an empty settings directory over this machine's 7,467–7,469 files (21.0 GB of
lines decompressed), 1-minute load at most 3.0: first figures at 12.38–12.88 s, peak 470 MB.
#468, 2026-11-16, Electron 43.2.0 as Node (Node 24.18.0): a second frame starting in the read where the first ends is
not decoded; all 3,001 cold rollouts here held one frame.
`~/research/agentshed-engine/2026-11-25-extractable-libs.md`, 2026-11-25, serde_json 1.0.154: a lone surrogate escape
or `1e400` fails the line in a value read and not in a value skipped. Over this machine's 1,807,671–1,807,800 Claude Code
and plain Codex lines (8.75 GB), six fields read on one thread, neither parser refused a line and both read every field
alike, the module's reader at 2.76–2.90 GB/s against serde_json's 2.41–2.55 GB/s.
