# Review — code (step 5), #160: one session walk per scan (2026-10-09)

Scope: `walkSessions` and `SessionWalk` (scan.ts), the optional walk parameter of `scan()` and
`TokenEngine.build`, the wiring in `doScan` (index.ts) and in the bench, two unit tests.

## ① Underlying premises — one wrong comment, corrected

- **Corrected: "walking opens every rollout to read its first line".** True of Codex only; the Grok
  walk reads each session's `summary.json` (the subagent judgement) and stats `updates.jsonl`. The
  comment on `SessionWalk` now says what each side reads.
- "Two walks a moment apart could disagree" — true by construction: `doScan` ran `scan()` (registries,
  activity, global layer, memory) between the two walks, so a session written in that window was seen by
  one reader and not the other. The two now read one list.
- The saving was measured, not inferred: `pnpm bench:scan warm`, three runs before and after; on warm
  runs scan() + build() went from ~557 ms to ~410 ms including the single walk (~140 ms); projects, rows
  and session files unchanged (61 / 1110 / 724).

## ② Runnability — no finding

- The walk now runs before `scan()` inside the same `try` in `doScan`, so a throw from it takes the same
  path a throw from inside `scan()` took (the scan failure, retried automatically). Both walkers catch
  their own fs errors per entry today. Escape surface unchanged.
- The SCAN_DELAY seam and the injected scan failure sit where they were; the in-flight de-duplication
  is untouched.
- One list is held through `build()` instead of two built in turn.

## ③ Security — no finding

## ④ Consistency — class-level check: one more instance, not taken

"A scan enumerates the same session tree twice": enumerated every tree walk in `scan()` and
`TokenEngine.build`. Codex and Grok — fixed here. **Claude: also twice**, `readClaudeActivity` (per
registered project: readdir + stat of each `.jsonl`) in `scan()` and `listJsonl` over the whole
projects tree in `build()`. Neither opens a file, and all of `scan()` now takes ~45 ms warm, an upper
bound on that walk. Not taken: outside the issue and small; recorded below.

## Refactor list (for the user's decision)

| Item | Reason | Escape surface | Suggested |
|---|---|---|---|
| Share the Claude projects walk the same way | same class as #160 | none (time only) | not now: ≤45 ms on this machine, and the two walks read different scopes (registered projects vs the whole tree) |
| Make the walk parameter required in production callers | an optional parameter lets a new caller silently walk twice again | none (time only) | not now: both production callers pass it (grep: the walkers are called only inside `walkSessions`), and the bench prints the walk on its own line |
