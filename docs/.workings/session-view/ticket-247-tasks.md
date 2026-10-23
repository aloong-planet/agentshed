# Ticket #247 — task list

The Codex-compressed session case collects a stderr chunk without the expected error code. Working record, not a
requirement authority: the requirement the case checks is session-view P6 and P7 in
[the session-view spec](../../specs/session-view.md); the coverage checklist is [checklist.md](checklist.md). Branch
`fix/codex-compressed-stderr`, in its own worktree, cut from `origin/main` at 1349d76 (no commits ahead when cut).

## Facts found before deciding (2026-10-23)

- The case (`e2e/app.spec.ts:5170`) opens a Codex session's page, compresses its file (writes the `.zst`, removes the
  plain file) with the rescan at 250 ms, and waits for the page's error state. It then requires every collected
  main-process stderr chunk to carry `sessionFileUnreadable` or `sessionNotWhitelisted` (`:5204`–`:5207`). The launcher
  collects a chunk when it matches `Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:|\[parse-pool\]`
  (`:112`). A failing assertion prints `true`/`false` only, so CI's failure did not say which chunk it was.
- The Codex parser returns `null` for a file it cannot read (`src/main/providers/token-stats.ts:1456`, `:1558`), so a
  file removed mid-parse does not make a parse worker fail; the `[parse-pool]` warning comes only from a worker that
  errors or exits (`src/main/parse-pool.ts:79`–`:105`). The issue's first lead is therefore less likely than it read;
  not ruled out.
- The main process writes to stderr with `console.error`/`console.warn` in seven places
  (`rg -n "\[parse-pool\]|console\.(error|warn)" src/main --glob '!*.test.*'`), and Electron logs a handler's thrown
  error as "Error occurred in handler for '<channel>'".

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Records declared on #247 and its document sync checklist | `ticket-247-doc-sync.md`, the issue body | done |
| 2 | Test design review | `ticket-247-review-tests.md`, Design review | done (for the first change) |
| 3 | The failure names the chunk (the issue's first item): the assertion carries it; a planted non-matching line shows in the message | the planted run's failure message | done: the planted line, written at every automatic rescan, turns the case red with the line in the message (`evidence/ticket-247/plant-line.txt`); written once a second after startup it was never collected, since the case reads its chunks about 1 s after launch |
| 4 | Feedback loop: reproduce the failure and read the chunk, locally (repeated, under load) or on CI | the chunk's text | locally not reproduced: 40 runs, 40 under 8 busy processes, and an overloaded run whose only failures were timeouts (`loop-under-load.txt`); the fetch-delay seam and a probe that removes the file inside a page request give only the two expected codes (`loop-attempts.txt`). Next: CI, repeated |
| 5 | The cause fixed, in the case or the app | a regression check red before the fix | |
| 6 | Code review, full gateway, independent test check, step 7, step 8 | the records | |
| 7 | CI: the case repeated (the issue's third item) | a throwaway branch's run, recorded | |
| 8 | PR; stop for the owner | PR link | |

## What the loops ruled out (2026-10-23)

- A parse worker failing on a file removed mid-parse: the Codex parser returns `null` for a file it cannot read, so the
  worker does not fail (`src/main/providers/token-stats.ts:1456`, `:1558`).
- A half-written `.zst` read by a rescan: the first-line reader and the parser both return `null`
  (`src/main/providers/cold-rollout.ts`, `readFirstLineCold`; the parser's `catch`).
- The session-page request losing its file after its reads: the error carries `session-file-unreadable`, one of the
  two codes (probe, `loop-attempts.txt`).

Not ruled out: an error from another handler or another moment of the request, or a chunk that joins two lines; the
CI run with the case repeated will name the line if it recurs.
