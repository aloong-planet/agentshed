# Review — tests (step 6), #160: one session walk per scan (2026-10-09)

Cases: "scan() counts the sessions of the supplied walk, not ones that appeared after it"
(activity.test.ts) and "build() aggregates the sessions of the supplied walk, not ones that appeared
after it" (token-stats.test.ts).

## Dimension 1 — coverage: one gap, recorded

- Each case drives the property through a realistic sequence: sessions exist, the walk runs, more
  sessions are written, then the function runs with the walk. Codex and Grok are both in each case.
- Gap: `doScan` passing its walk to both readers is main-process wiring with no unit seam. Recorded in
  the activity.test.ts header with the condition that retires it; meanwhile the bench prints the walk on
  its own line in the app's order, and the walkers are called only inside `walkSessions` (grep).
- Fixtures: the suites' existing Codex rollout and Grok session builders, which follow the measured
  real layouts (session_meta first line; sessions/<encoded cwd>/<id>/updates.jsonl + summary.json).

## Dimension 2 — case design: no finding

Public functions only, real files in a temporary home, no mocks. The walk is passed through the public
parameter, not forged.

## Dimension 3 — false greens: four mutations, all red

Red first was for the wrong reason (`walkSessions is not a function`), so each case was checked by
mutation, restoring from a backup copy each time:

| Mutation | Case | Result |
|---|---|---|
| scan() walks again (ignores `deps.sessions`) | scan | red: 4 sessions, expected 2 |
| build() walks again (ignores `sessions`) | build | red: Codex 1210, expected 110 |
| only scan()'s Grok half walks again | scan | red: 3 sessions, expected 2 |
| only build()'s Grok half walks again | build | red: Grok 605, expected 55 |

The last two exist because in the second row the Codex assertion failed first, so it said nothing about
the Grok half.

---

# Review — tests (step 6), #158: resume a grown Codex rollout (2026-10-09)

Cases: in token-stats.test.ts, "resuming a grown Codex rollout" — (1) wherever the file is cut, resuming
gives the cold result; (2) a change before the old end stays unseen until a whole parse; (3) a rename
is parsed whole; (4) a shrink is parsed whole; (5) after RESUME_LIMIT resumes the next growth is parsed
whole; (6) the session page rebuilds a grown rollout to the cold index. In jsonl.test.ts: reading from
a byte offset; a cold rollout refuses an offset.

## Dimension 1 — coverage: one gap, recorded

- Case 1 cuts at every line end and 7 bytes before every newline (a line half-written at the first
  scan), over a rollout built to put state across the cut: a re-reported event (B7), the first usage
  record (the boundary, B9), a response id seen on both sides (B1), a model switch, a second question.
- Gap: growth *during* a parse (the reason the signature moved before the parse) needs a writer racing
  the reader; recorded in the token-stats.test.ts header with the condition that retires it.
- Fixtures: the suite's real-shaped rollout builder; the appended record lines carry the fields the
  parser reads (response_id, usage) from the measured key set.
- Real data: `pnpm bench:scan grow` on the 839 MB and 1655 MB rollouts compared the resumed result with
  a cold parse — equal both times.

## Dimension 2 — case design: no finding

Public `TokenEngine.build` / `sessionQuestions` only, real files; the in-place edit uses positional
writes so inode and size stay as a real in-place edit leaves them. No mocks.

## Dimension 3 — false greens: two found and closed

- Cases 1, 3, 4, 6 were green before the implementation (a whole parse equals a cold one), and case 5
  was vacuous then (RESUME_LIMIT undefined, so its loop never ran). None counted as proof; each was
  checked by mutation afterwards:

| Mutation | Turns red |
|---|---|
| A — never resume | (2), (5) |
| B — forget the counted response ids | (1), (2) |
| C — forget the previous cumulative's key | (1) |
| D — forget the usage boundary | (1) |
| E — forget the model | (1) |
| F — resume reading from byte 0 | (1), (6) |
| G — ignore the stored first-question title | (1), (6) |
| H — drop the inode check | (3) |
| I — drop the size-grew check | (4) |
| J — drop the resume limit | (5) |
| K — drop the cold-rollout offset guard | the jsonl guard case (fails deep in the decoder instead) |

- Each mutation was restored from a backup copy and compared byte for byte afterwards.

---

# Review — tests (step 6), #159: parse on a worker pool (2026-10-09)

Cases: "a parse runner that finishes out of order gives the result of parsing one file at a time"
(token-stats.test.ts); parse-pool.test.ts: results per job under out-of-order completion, the size
cap, idle reuse and stop, a worker dying mid-job, a constructor that throws, a script that will not
load.

## Dimension 1 — coverage: one gap, recorded

- The real worker cannot run under vitest (it is a build output); the pool tests use stand-in scripts.
  The real worker is covered by e2e (all seven launchers fail on a `[parse-pool]` line, and every
  fixture's first scan has misses) and by `pnpm bench:scan workers` on real data. Recorded in the
  parse-pool.test.ts header.
- The ordering case puts the same message in sessions of two projects, so which project it counts
  toward depends on assembly order.

## Dimension 2 — case design: no finding

Public `TokenEngine.build` and `ParsePool.run`; the only spy is on `console.warn` (not our module).

## Dimension 3 — false greens: one survived mutation, explained and replaced

All cases were written after the implementation, so each was checked by mutation:

| Mutation | Result |
|---|---|
| P1 — assemble the slots in reverse | **survived** — it reversed both builds the case compares (the pooled and the inline one go through the same assembly), so it never reached the difference the case guards |
| P1′ — assemble in completion order | red: the pooled build attributes the shared message to the other project |
| P2 — no size cap | red |
| P3 — ignore the idle time | red |
| P4 — a dead worker's job resolves null | red |
| P5 — warn on every failure | red |
| constructor throw | red before the fix (TypeError escaped) |

The first P1 run also mis-passed arguments (a multi-line pattern broke the shell loop, so the whole
suite ran); rerun by hand with the case's filter, it still survived, for the reason above.
