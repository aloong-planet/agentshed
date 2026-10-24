# Code review — #299

Ticket: [#299](https://github.com/aloong-planet/agentshed/issues/299). Date 2026-10-23. Implementation: the change on
`fix/today-card-rollover-window` (from 1349d76), before its commit. Scope: the rollover step of
`e2e/startup-restore.spec.ts` — its window from 1,000 ms to Playwright's default, and the comment beside it. No product
code changes.

## Underlying premises

- **The display clock's timer was set before the fake clock, so it keeps real time** (the new comment). Measured: the
  card turns 900–922 ms after the fast-forward, ten runs of ten, and a pause of 300 or 600 ms before or after the
  install moves that by the same amount, which only a real timer with a phase set earlier does
  (`evidence/ticket-299/feedback-loop.txt`). Holds.
- **"Only the display clock reads the wall clock"**: `rg -n "Date\.now\(\)|new Date\(\)" src/renderer/src --glob
  '!*.test.*'` finds it in `DisplayClock.tsx` alone. Holds.
- **"No scan comes within the window"**: the first launch sets no rescan interval, so the default of 300 s applies
  (`src/main/index.ts:703`); and a scan does not move the display clock in any case. Holds.
- **"Up to a second after the jump, and then renders"**: on an idle machine the tick lands within the second (900–922 ms
  in this sequence). Under the held loop's 700 ms hold the card still read 2k at 1.34–1.35 s and read 0 at the next poll,
  1.85 s, inside the new window (`feedback-loop.txt`, `after-change.txt`). Holds.

## Runnability

- The step's state in and out: it reads the card until it reads `0` or 5 s pass. A tick that never comes turns it red
  (planted: the interval stretched to a minute, red at the step, `evidence/ticket-299/plant-clock-stretched.txt`, the
  plant confirmed in the bundle, `setInterval(tick, 6e4)` against `1e3`).
- Nothing else in the case depends on the step's timing: the time-zone loop after it already waits the default window.

## Security

- Not applicable: a test's timeout and comment.

## Consistency

- The step now matches the case's other clock reads (the time-zone loop), which use the default window.
- Comment density and style match the file.
- Smells: none on two changed lines.
- Class-level check, "a step waits a fixed window about one period of a real timer that produces the change": every e2e
  use of Playwright's clock (`rg -n "clock\.(install|fastForward|runFor|setFixedTime|pauseAt|setSystemTime|resume)"
  e2e`) is in this case; the step changed is the only one.

## Refactoring list

None.
