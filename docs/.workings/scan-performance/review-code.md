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

---

# Review — code (step 5), #158: resume a grown Codex rollout (2026-10-09)

Scope: `CodexResume` / `RESUME_LIMIT` / `codexEntry` / the resumable `parseCodexFile`, the signature
taken before parsing on every side, `eachJsonlLine(fromByte)` and `rolloutBytes(start)`, the seeded
question indexer, CACHE_VERSION 17, the bench's `grow` mode.

## ① Underlying premises — no finding

- "Codex only appends or renames a staged copy over the path" — taken from the #158 issue comment, which
  cites codex-rs (`recorder.rs` append-only, `rollout_migration.rs:813,821` and `compression.rs` rename).
  Not re-read tonight; the design does not depend on it for correctness of what it accepts: any change
  that is not pure growth on the same inode is parsed whole, and an in-place edit with growth is bounded
  by RESUME_LIMIT.
- "A half-written last line is read again whole": `eachJsonlLine` reports a line only when it parses,
  and the cursor is the end of the last reported line. Exercised by the mid-line cuts in the test.
- "A complete JSON object cannot be the prefix of a longer valid line", so a last line without a newline
  that parsed is never re-counted. The tests cut at every line end, which includes that case.
- The Codex indexer's `done()` only extends the last question's end (no Claude-style filtering), so a
  seeded index continues exactly; the Claude side refuses a seed.
- Measured on real data: the 839 MB and 1655 MB rollouts each resumed in 8 ms / 17 ms after a 1 MB
  append, with the result equal to a cold parse of the grown file (`pnpm bench:scan grow`).

## ② Runnability — no finding

- A resumed parse copies what it starts from (events, the question records, the response-id set), so the
  cached agg a concurrent `sessionQuestions` may be reading is never mutated mid-parse.
- `build()` and `sessionQuestions()` resuming the same file at once each produce a correct entry; the
  later write wins. Escape surface: none.
- A read error during a resumed parse returns null, the file drops out of this scan exactly as a whole
  parse failing did; the next scan has no entry for it and parses it whole. Self-harm.
- A third party deleting and recreating a rollout could reuse the inode number and grow past the old
  size; the result would be wrong until RESUME_LIMIT forces a whole parse. Codex itself never does this.

## ③ Security — no finding

The new cache fields are numbers, response ids and the clipped first question, which the agg already
stores as the title. No question text is added (spec D2a).

## ④ Consistency — class-level check done

"The cache signature is read after the parse, so growth during the parse is never seen": enumerated
every `sigOf` / `statOf` call — aggFor (all Claude and Grok parses), codexEntry, isFresh and
sessionQuestions all read it before parsing now; the three build sites were the instances, all changed.
CACHE_VERSION bumped with its reason in the version log, as the rule above it requires.

## Refactor list (for the user's decision)

| Item | Reason | Escape surface | Suggested |
|---|---|---|---|
| The cache grows ~15% (13.7 → 15.8 MB on this machine; 2.0 MB is resume state, mostly 24,398 response ids) | every startup reads the cache | none (time) | not now: the response ids are what makes the resume exact; trimming would mean keeping ids only near the end, a heuristic |
| Grok streams are not resumed | issue scope; 11 small sessions here | none | not now |
| Claude is not resumed | its last-leaf walk-back needs the whole parentUuid graph | none | not now |

## Outside this change (reported, not fixed)

- **A Grok session page fails once its stream has grown.** `sessionQuestions` rebuilds any non-Claude
  file through `readCodexSessionMeta`, which cannot read a Grok stream; measured with a scratch test:
  appending to a Grok `updates.jsonl` after a scan makes the page throw `session-meta-unreadable` until
  the next full scan refreshes the entry. Pre-existing on main. Needs the user's call on where it lives.

### Found by the gate after this review (2026-10-09)

The first `pnpm verify` failed two e2e cases (the archive retaining a past day under the same stamp;
the global span with archived and retained rows). Both seed archive rows under the accounting stamp
`<version>+c16` as a literal — on purpose, so that a CACHE_VERSION bump turns them red until updated
(the comment beside the app.spec one says so). The bump to 17 missed them: the review's premise
check did not search for the old version anywhere but token-stats. Updated both to `+c17`; the
CACHE_VERSION comment now says to search for `+c<old version>` when bumping, where the next person
bumping it will read it.

---

# Review — code (step 5), #159: parse on a worker pool (2026-10-09)

Scope: `ParseJob` / `ParseResult` / `runParseJob` / `ParseRunner`, the build split into plan → parse →
ordered assembly, `ParsePool`, the `parse-worker` entry (electron-vite and the bench), the pool in
`index.ts`, the `[parse-pool]` net in all seven e2e launchers, the bench's `workers` mode.

## ① Underlying premises — no finding

- "The parse path imports nothing from electron" — enumerated: the 31 local modules reachable from
  token-stats.ts by value imports; none imports electron.
- "A worker loads from the asar under the fuses" — measured: the packaged app (ad-hoc signed locally,
  see below) ran a cold scan of this machine's data in about 12 s with no `[parse-pool]` line.
- "The pooled cache equals the main-thread cache" — measured on real data: 4954 entries, 0 differing.

## ② Runnability — two findings, both fixed

- **Fixed: the session page's rebuild queued behind a scan.** It went through the pool; during a cold
  scan the pool's queue holds thousands of jobs. It now parses on the calling thread, which is what the
  spec already said.
- **Fixed: a Worker constructor that throws synchronously failed the whole scan** (upper escape: the
  rejection reached `mapLimit` and `build`). It now falls back like any worker failure; test added, red
  first with the constructor's TypeError.
- **Measured trade-off, decided: memory.** Peak RSS of a cold scan: main thread 1.03 GB; pool of 2:
  1.19 GB; 4: 1.48 GB; 8: 2.20 GB (times 24.8 / 12.9 / 8.5 / 7.4 s). The largest file bounds the time,
  so the pool is capped at four. For the user's confirmation.
- A worker dying mid-job, a script that will not load: covered by tests, each falls back. A worker
  that keeps failing to load costs one attempt per job, never a file.
- Idle workers stop after 10 s (timers unref'd); `before-quit` stops idle ones.

## ③ Security — no finding

The worker script path is fixed (`join(__dirname, 'parse-worker.js')`); jobs carry paths the main
thread already walked.

## ④ Consistency — class-level check

"Work that must keep scan order is assembled in completion order" — the build is the only place that
runs parses concurrently; `mapLimit` writes results by index and the build iterates the slots in scan
order. Smell baseline: `plan` and `codexPlan` share the hit check (two short copies; Codex adds the
resume decision) — accepted.

## Outside this change (reported, not fixed)

- **The local `pnpm dist:mac` build will not start on Apple Silicon**: its binary signature is
  invalid after packaging (`codesign --verify`: "code has no resources but signature indicates they
  must be present") and the system kills it at launch (exit 137). Ad-hoc signing it (`codesign --force
  --deep --sign -`) makes it run. Observed on this branch's build; the packaging configuration is
  unchanged here, so main is very likely the same — not checked against a main build. Needs the user's
  call.
