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
