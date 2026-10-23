# Ticket #299 — task list

The startup-restore case's today card misses its one-second rollover window under load. Working record, not a
requirement authority: the requirement the step checks is token-stats::REQ-001/AC-02 in
[the token-stats spec](../../specs/token-stats.md); the coverage checklist is [checklist.md](checklist.md). Branch
`fix/today-card-rollover-window`, in its own worktree, cut from `origin/main` at 1349d76 (no commits ahead when cut).

## Facts found before deciding (2026-10-23)

- The display clock sets a once-a-second `setInterval` when the page mounts (`src/renderer/src/DisplayClock.tsx:9`), and
  it is the only renderer code that reads the wall clock (`rg -n "Date\.now\(\)|new Date\(\)" src/renderer/src --glob
  '!*.test.*'`). The background rescan runs every 300 s by default (`src/main/index.ts:703`).
- The case installs Playwright's fake clock long after that mount, fast-forwards 61 s past midnight, and gives the today
  card 1,000 ms to read 0 (`e2e/startup-restore.spec.ts:70–72`).
- Measured with a throwaway copy of the step (`evidence/ticket-299/feedback-loop.txt`):
  - polled from Node every 10 ms, the card turns 900–922 ms after the fast-forward, ten runs out of ten;
  - a pause of 300 ms or 600 ms before or after the install brings that to about 600 ms or 300 ms: the card turns on a
    real one-second timer whose phase was set before the fake clock, so the interval set at mount keeps real time and
    reads the fake time at its next real tick;
  - throttling the page's CPU six- or twentyfold barely moves it (885–977 ms, 923–931 ms);
  - shifting the phase so the tick lands at the window's edge fails the step two runs out of three with the issue's
    symptom (`Expected: "0"`, `Received: "2k"`): the step fails only when the tick and its render end past 1,000 ms, a
    window as wide as one render, which a loaded machine widens;
  - holding the page's main thread through the debugger for 700 ms just before the tick fails the step three runs out of
    three with that symptom; the same hold with Playwright's default 5 s window passes three runs out of three. That is
    the feedback loop.
- The token-stats spec asks that crossing midnight does not split the definition of today (REQ-001/AC-02); it sets no
  time for the turn. The window dates from 3a6dca5 (#183).
- The only e2e use of Playwright's clock is this case (`rg -n "clock\.(install|fastForward|runFor|setFixedTime|pauseAt|setSystemTime|resume)" e2e`).
  Its later fast-forwards, in the time-zone loop, already wait the default 5 s.

## Decision (implementing agent, 2026-10-23)

| # | Decision | Answer and reason |
|---|---|---|
| D1 | How the step stops racing the tick (the issue's two leads) | The step waits the default 5 s, which covers the next real tick and its render. Since only the display clock reads the wall clock and no scan comes within 5 s, the card can still only turn through the display clock, so the step proves what it did. Making the clock's update observable would add product code for a test; reloading under the fake clock would change the scenario |
| D2 | The restore case's other short windows (500 ms and 1 s after the restart), raised in the test design review | Left as they are, with no ticket: the owner's answer on 2026-10-23 ("leave them, and no ticket", in Chinese, the recommended answer) |

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Feedback loop: reproduce the symptom on demand | `evidence/ticket-299/feedback-loop.txt` | done |
| 2 | Records declared on #299 and its document sync checklist | `ticket-299-doc-sync.md`, the issue body | done |
| 3 | Test design review | `ticket-299-review-tests.md`, Design review | done |
| 4 | Slice: the rollover step waits for the tick | the held loop green with the case's window; the case repeated | done: the held loop green 5 of 5 with the step as changed, the restore file green five times (`evidence/ticket-299/after-change.txt`); a display clock stretched to a minute turns the step red (`evidence/ticket-299/plant-clock-stretched.txt`) |
| 5 | Code review | `ticket-299-review-code.md` | done: no finding; the comment's facts measured |
| 6 | Full gateway | `evidence/ticket-299/gateway-251e3f7.txt` | done: `VERIFY_EXIT=0` on the clean tree of 251e3f7 (867 unit, 109 site, 148 e2e, smoke OK) |
| 7 | Independent post-implementation test check | `ticket-299-review-tests.md` | handed to an independent agent on 1349d76 up to the commit that records the gateway run |
| 8 | Step 7 (nothing in the spec changes: no time is specified) and step 8 | `final-regression.md` | |
| 9 | PR; stop for the owner | PR link | |

## Targeted verification (step 4)

The tests that read what this change touched, found by search rather than recalled: the change is one step of
`e2e/startup-restore.spec.ts`, with no product code, config or data changed, so the targeted set is that file
(`git diff --name-only` lists it alone). It passed five times over (`evidence/ticket-299/after-change.txt`, 10 of 10), and
typecheck and lint pass on it (`evidence/ticket-299/targeted.txt`).
