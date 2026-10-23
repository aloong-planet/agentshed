# Test review — #299

Ticket: [#299](https://github.com/aloong-planet/agentshed/issues/299) (the startup-restore case's today card misses its
one-second rollover window under load). Task list: [ticket-299-tasks.md](ticket-299-tasks.md).

## Design review (2026-10-23, implementation starts from 1349d76)

Scope: the one step this change alters — the rollover step of `e2e/startup-restore.spec.ts`'s case "restart restores
viewed project, questions and read answer before a new scan finishes". Spec: [token-stats](../../specs/token-stats.md).
Mutation testing: by the project capability declaration, mutation-testing is not enabled, so it is skipped; the step's
"when does it go red" is answered below.

### Test design table

| # | Test | Spec item | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| E1 | e2e, changed: the rollover step of the restore case (its window from 1,000 ms to the default 5 s, with a comment on why) | token-stats::REQ-001/AC-02 (crossing midnight does not split the definition of today) | the app through its real renderer, with Playwright's clock installed on the page (unchanged) | the page's clock installed at 2030-01-01T00:30Z and fast-forwarded 61 s, so the display clock's next tick reads a new day | the today card's value reads `0`: the fixture's only usage is dated at the real time the case runs, none on 2030-01-01 | the case's own Claude session (unchanged; its shape was taken in #183) | the case's two launches over one userData, unchanged; one build per run |

### Coverage

- The step keeps its spec unit: it still drives the crossing of midnight and asserts the today card follows it.
- The input that drives the branch: the install and the fast-forward put the fake time on the next day, and the display
  clock's next tick, the only code that reads the wall clock, turns the card. Within 5 s nothing else can: the rescan
  runs every 300 s by default, and the case sets no shorter interval on its first launch.
- The same defect, "a step waits a fixed window about one period of a real timer that produces the change", enumerated
  over every e2e use of Playwright's clock (`ticket-299-tasks.md`, Facts): this step is the only one. The time-zone
  loop's fast-forwards wait the default 5 s.
- Nearby, a different mechanism: after the restart the same case gives restored content 500 ms and 1,000 ms
  (`e2e/startup-restore.spec.ts:94`, `:99`, `:100`, `:104`, `:107` as on 1349d76), while the new scan is held back 20 s. Not
  changed here:
  - impact: under heavy load those reads could miss their window the way this step did; none has been reported;
  - recommendation: leave them. Their windows say the restored copy answers promptly, and widening them would weaken
    that; reopen if one fails;
  - destination: the owner decided on 2026-10-23 to leave them, with no ticket ("leave them, and no ticket", in
    Chinese, the recommended answer); this record is the trace.
- Gaps: none new.

### Case design

- Nothing is mocked; no state is written by hand. The fake clock is Playwright's, installed on the page through its
  public API, as before.
- The step drives its target and asserts its effect: the card's text after the day changes.

### False greens (design-level)

- Constant-true: the card reads 2k before the install (asserted earlier in the case), so `0` can only follow the
  crossing.
- Tautology: `0` comes from the fixture's dates, not from the app's arithmetic.
- Stale path: the today card and the display clock are live (`DisplayClock.tsx`, `AgentsPane.tsx`).
- Read too early or late: the assertion polls the very text it asserts.
- When it goes red: if crossing midnight does not reach the today card (a definition of today taken from anything but
  the display clock, or a clock that never ticks), within 5 s. The held loop shows the window covers a tick late by
  700 ms (`evidence/ticket-299/feedback-loop.txt`).

### Resource reuse

- Unchanged: one build per run, the case's two launches over its own userData; the change adds none.

## Post-implementation check (2026-10-23, #299; the change 1349d76..2c87ce6, its full run on 251e3f7)

Performed by an independent agent that did not inherit the implementing conversation and loaded the review-tests
skill itself. Scope: every test the change added or changed. `git diff --stat 1349d76..2c87ce6` lists one test file,
`e2e/startup-restore.spec.ts`, whose only change is E1 (the rollover step, now `:72–75`: the 1,000 ms window removed,
three comment lines added); no product code, configuration, fixture or test helper changed. Spec:
[token-stats](../../specs/token-stats.md), token-stats::REQ-001/AC-02.

### Run evidence

- The full run is [gateway-251e3f7.txt](evidence/ticket-299/gateway-251e3f7.txt). It records `git rev-parse HEAD`
  (251e3f7), an empty `git status --porcelain --untracked-files=all` (so no file needs a `git hash-object` line), every
  command of `pnpm verify` in its order, an exit code per command, each command's output and `VERIFY_EXIT=0`. How the
  exit codes were taken is not shown; the format is the one the project's earlier gateway logs use.
- Version against the range: 251e3f7 is inside 1349d76..2c87ce6, and the one later commit, 2c87ce6, changes only this
  log and the task list (`git diff --name-only 251e3f7 2c87ce6`), which no test reads. The case's line:
  `✓ 138 e2e/startup-restore.spec.ts:8:1 … (27.4s)`.
- This check ran no test: every question below was answered from the log, the recorded evidence and the code, and
  mutation testing is not enabled (see False greens).

### Test design table against the test as written

E1, the rollover step (`e2e/startup-restore.spec.ts:70–75` on 2c87ce6), column by column:

- Test and change: `toHaveText('0')` with no timeout argument. `playwright.config.ts` sets no `expect` timeout, so
  Playwright's default 5,000 ms applies; the planted run reports `Timeout: 5000ms` at `:75`. Agrees.
- Spec item: token-stats::REQ-001/AC-02. Agrees.
- Seam: the real renderer with Playwright's page clock (`:70–71`, unchanged). Agrees.
- Driving input: the clock installed at 2030-01-01T00:30Z and fast-forwarded 61 s (unchanged). Agrees.
- Assertion and expected value: `.tot-c` nth(1) `.v` reads `0`. nth(1) is the today card (`USAGE_WINDOWS = ['all',
  'today', 'd7', 'd30']`, `src/shared/usage.ts:15`, rendered in that order at `src/renderer/src/TokenViz.tsx:78`), whose
  value is `sliceUsage(rows, 'today', anchor, span).total` (`TokenViz.tsx:62`, `:87`) with `anchor` the display clock
  (`AgentsPane.tsx:41`, `:65`). `0` follows from the fixture's rows, dated at the real time of the run (`:16`). Agrees.
- Fixture: the case's own Claude session, unchanged. Agrees.
- Expensive resource: one build per run and the case's two launches, unchanged. Agrees.
- Gap notes in the file header: the design records no gap and the header carries none. Agrees.

### Coverage

- The step keeps token-stats::REQ-001/AC-02 and the spec's failure-mode row "midnight passes … while viewing saved
  data" as before; the change alters only how long it waits. The input still drives the branch the design names: after
  the install the page's `Date.now()` reads 2030-01-01, a day with no usage in any local time zone, and the display
  clock's next tick carries it into the card.
- "Only the display clock reads the wall clock", re-checked over everything the renderer bundles rather than
  `src/renderer/src` alone: `rg` for `Date.now`, `new Date`, `Temporal`, `performance.now`/`timeOrigin`, an
  argument-less `.format()` and `toLocale…String` over `src/renderer`, `src/shared` and `src/preload` (tests excluded,
  15 hits) finds a wall-clock read only at `DisplayClock.tsx:6` and `:8`; every other `new Date(...)` takes an argument
  and `performance.now()` only times durations. A bare `Date()` call: no hit (exit 1). Holds. The display clock also
  ticks on `focus` and `visibilitychange` (`DisplayClock.tsx:10–11`); either still turns the card through the display
  clock, so the comment's "can only turn through it" holds.
- "No scan comes within the window": the backstop is 300 s (`src/main/index.ts:703`), and the focus trigger needs 60 s
  since the last scan (`:704–706`), which the case's first launch does not reach before the step. A scan would not turn
  the card anyway: the card's day comes from the display clock, not from the snapshot.
- The class-level enumeration, re-run wider (`rg -uu clock e2e`, 8 files, none binary): Playwright's page clock appears
  only in this case (`:70`, `:71`, `:80`). The two other hits, `e2e/settings-updates.spec.ts:7` and
  `e2e/app-update.spec.ts:249`, move the main process's `Date.now` and emit `resume` synchronously, then wait the
  default window: no real timer, not the same defect.
- Fixture independence: the fixture is unchanged, so it is not re-judged; the design row's source (#183) stands.
- Gaps: none.

### Case design

- Red flags, over the changed lines: no module mock or spy, no cast or internal state written, no assertion on call
  counts or order, no side-channel read, no state unreachable through public paths (a wall clock that jumps is what a
  sleep or a clock change gives). None.
- The step drives its target, the day change, and asserts its effect on the card the requirement names.

### False greens

- Mutation testing: by the project capability declaration (`capabilities.toml`, read with Python's `tomllib`:
  `[mutation-testing] enabled = false`), mutation-testing is not enabled, so it is skipped. Every registered ID is
  present in the declaration, in its registered form.
- The forms, for E1: constant-true, no (the card reads 2k before the install, `:66`, and every recorded failure of
  the step reports `Received: "2k"`); tautology, no (`0` is the fixture's dates, not the app's arithmetic); stale path,
  no (the display clock and the today card are live, above); conditional skip, none; an assertion that may not run, no
  (the expect is awaited).
- As a browser assertion (review-code's false-greens list): the polled expression is the asserted one, the text of
  `.tot-c` nth(1) `.v` (form five). A changed check shown red (form four): below, and finding F1.
- When it goes red:
  - the today card does not follow the day change (its day taken from anything but the display clock, such as the
    snapshot's `scannedAt` or the last data day, or the today window counting the fixture's rows on 2030-01-01): it
    keeps reading `2k`, red at `:75` after 5 s;
  - the display clock does not tick within 5 s of the jump: red. Shown by the plant that stretched the interval to a
    minute and rebuilt: red at `:75` with `Expected: "0"`, `Received: "2k"`, `Timeout: 5000ms`
    (`evidence/ticket-299/plant-clock-stretched.txt`);
  - a machine that delays the tick and its render past 5 s: red. The margin over the idle turn (about 0.9 s) is about
    4 s; a 700 ms stall passed 5 of 5 (`evidence/ticket-299/after-change.txt`).
  - What it no longer catches: a turn between 1 s and 5 s after the jump, such as a display clock ticking every 2–4 s.
    token-stats::REQ-001/AC-02 sets no time for the turn, so no specified behaviour loses its check.

### Resource reuse

- Counted in the full run: one `electron-vite build` (the three bundles of one build, before `Running 148 tests using 1
  worker`). The global setup's quiet Electron copy printed nothing, which `scripts/quiet-electron.sh` does when the copy
  is current (it exits before `copy ready`), so it was reused, not rebuilt. App launches are not logged; in the code
  the case calls `launch()` twice (`:54`, `:94`), the restart being the behaviour under test. Matches the design row;
  the change adds no resource.

### Findings

- F1 (low; evidence wording, no test change). `evidence/ticket-299/plant-clock-stretched.txt:20` and `:32`: the in-run
  reach check printed `0`. Its pattern `setInterval([a-zA-Z_$]*,6e4)` lacks the space the bundle keeps
  (`setInterval(tick, 6e4)`), and the pipe into `wc -l` hid grep's no-match status. Reach is shown by the separate
  check in the same file (`:72–90`: the same replacement on a second build), whose header promises the interval "with
  and without it" but shows only "with". [ticket-299-review-code.md](ticket-299-review-code.md) (Runnability) cites
  "`setInterval(tick, 6e4)` against `1e3`", and the `1e3` side is not in the evidence. This check read it from the
  gateway's own build: `out/renderer/assets/index-CwhfPdBv.js` (695,221 bytes, the bundle the gateway log names) holds
  `setInterval(tick, 1e3)`. The conclusion stands. Suggested handling: annotate the evidence file where it reads `0`
  (why, and where reach is shown) and add the `1e3` reading with its source. Destination: that working record; nothing
  persistent changes.
- F2 (low; evidence wording, no test change). `evidence/ticket-299/after-change.txt:2` and `:6–15`: command 1 uses a
  `DIAG_CASE_WINDOW` knob that the throwaway source recorded in `feedback-loop.txt` does not contain, and the runs'
  titles still read "window 1000ms". The runs show the window exceeded 1 s (each passed with the card turning at
  1,851–1,856 ms), so the conclusion stands, but the record does not show the step as run. Suggested handling: one line
  in the file giving the knob's code and noting the stale title. Destination: that working record.
- Neither asks for a change to a test, a fixture or product code; no coverage gap, false green or resource finding.

### Document sync

- Checked: this record, the task list, the code review record, the document sync checklist, the five evidence files,
  [checklist.md](checklist.md) (token-stats::REQ-001/AC-02 at `:126` and `:289`), `docs/features/token-stats.md`, the
  token-stats spec, `docs/adr/` and `CONTEXT.md`, by `rg -uu` for `startup-restore.spec.ts`, `REQ-001/AC-02`,
  `midnight`, `display clock`, `once a second`, `every second` and `within a second`. No current statement names the
  step's 1,000 ms window or a time for the turn, so the change makes none of them false. This check adds no sync item;
  the Pending row for the checklist's current verification ([ticket-299-doc-sync.md](ticket-299-doc-sync.md)) is as it
  was. F1 and F2 go to the implementing agent.

## Handling of the post-implementation check's findings (implementing session, 2026-10-23)

| # | Handling |
|---|---|
| F1 | `plant-clock-stretched.txt` notes why its in-run count read 0 (no space in the pattern; the pipe hid grep's status), where reach is shown (the second build's `setInterval(tick, 6e4)`), and the unplanted reading `setInterval(tick, 1e3)` with its source |
| F2 | `after-change.txt` gives the `DIAG_CASE_WINDOW` knob's code and says why the run titles still read "window 1000ms" |
