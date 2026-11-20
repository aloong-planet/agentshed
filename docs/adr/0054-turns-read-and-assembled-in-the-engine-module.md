# ADR-0054: The engine module reads each turn the session page expands and assembles its blocks

- Status: Accepted (2026-11-20)

## Context

A turn the session page expands can hold up to 64 MiB of a session file (session-view C2), and its blocks come from
its side's per-line rules. The engine module (ADR-0045) already reads every session file and holds each side's
per-line rules.

## Options

1. **The module reads the turn a line at a time and assembles its blocks on the reading thread** — chosen.
2. Read a turn in TypeScript as byte ranges — rejected: each step holds a copy of the whole turn (#485).
3. Assemble a turn's blocks in TypeScript from the lines the module reads — rejected: the lines cross as strings and
   `JSON.parse` builds their values again, a turn near the limit peaking far higher (Sources).

## Decision

We adopt **option 1**.

- **The read**: the module reads each turn the session page expands, its question's range and its body's, in one pass
  that stops at the turn's end, a line at a time, leaving out the lines the turn does not hold by its side's line rules.
- **The assembly**: the module assembles the turn's blocks by its side's rules as part of the read, so that a panic
  there fails that read alone, and hands the blocks over in place of the lines.

## Consequences

- Positive: a turn's fetch is no slower, within 5%, than with the assembly in TypeScript, and a turn near the limit
  peaks about half as high (Sources).
- Negative: a turn's assembly exists only as rewritten in Rust, so a slip there draws a turn wrongly, with no other
  implementation to show the difference.
- Neutral: the blocks the session page draws are the ones the TypeScript assembly drew, but where that assembly broke
  session-view C8 (Sources).

## Sources

#494, 2026-11-20, Electron 43.2.0, every Claude Code transcript on this machine: all 10,517 turns (164,081 blocks)
assembled by the module deep-equal to the TypeScript assembly's. `pnpm bench:scan turn`, medians of five, the assembly
in TypeScript against in the module: the three largest Claude Code turns (20.3, 17.8 and 13.2 MB of body) took 19, 18
and 15 ms to their blocks against 11, 11 and 8 ms, the main process peaking at 71.8, 66.9 and 57.0 MB against 48.4,
48.6 and 41.8 MB; a constructed 67.1 MB turn took 195 ms against 189 ms and peaked at 282.6 MB against 153.8 MB.

#496, 2026-11-20, Electron 43.2.0, every Codex rollout on this machine, plain and cold: all 6,055 turns within the limit
(97,841 blocks) assembled by the module deep-equal to the TypeScript assembly's. A payload type naming a property every
object has, which that assembly took for an output and the module traces (session-view C8), is in none of them. `pnpm
bench:scan turn`, medians of five, the assembly in TypeScript against in the module: the three largest plain Codex turns
(25.4, 17.2 and 10.5 MB of body) took 54, 40 and 20 ms to their blocks against 37, 19 and 14 ms, the main process
peaking at 120.8, 82.2 and 66.2 MB against 64.5, 54.1 and 47.3 MB; the largest of a cold rollout (64.8 MB) took 2101 ms
against 1968 ms and peaked at 224.6 MB against 97.9 MB; a constructed 67.1 MB turn took 193 ms against 192 ms and peaked
at 282.7 MB against 153.8 MB.

#497, 2026-11-20, Electron 43.2.0, every Grok session on this machine: all 467 turns (16,574 blocks) assembled by the
module deep-equal to the TypeScript assembly's. `pnpm bench:scan turn`, medians of five, the assembly in TypeScript
against in the module: the three largest Grok turns (10.0, 5.1 and 4.4 MB of body) took 13, 18 and 9 ms to their
blocks against 8, 9 and 5 ms, the main process peaking at 49.9, 45.7 and 37.1 MB against 39.0, 32.9 and 33.6 MB; a
constructed 67.1 MB turn took 218 ms against 201 ms and peaked at 282.5 MB against 153.8 MB.

#498, 2026-11-20, Electron 43.2.0, every Antigravity CLI conversation on this machine: all 23 turns (56 blocks)
assembled by the module deep-equal to the TypeScript assembly's. `pnpm bench:scan turn`, medians of five, the
assembly in TypeScript against in the module: the three largest Antigravity turns (7.9, 5.6 and 3.3 KB of body) took
6, 6 and 5 ms to their blocks against 5, 5 and 5 ms, the main process peaking at 27.2, 27.2 and 27.2 MB against 27.5,
27.2 and 27.1 MB; a constructed 67.1 MB turn took 205 ms against 210 ms and peaked at 282.4 MB against 153.6 MB.

#499, 2026-11-20, Electron 43.2.0, with the line read #498 made one for every side: every Claude Code, Codex and Grok
turn on this machine within the limit (10,656, 6,055 and 467 turns; 167,224, 97,841 and 16,574 blocks) assembled by
the module deep-equal to the TypeScript assembly's. `pnpm bench:scan turn`, medians of five, the module before that
change against after it, on turns of the sizes #494, #496 and #497 measured: none took longer or peaked higher by more
than 2%.
