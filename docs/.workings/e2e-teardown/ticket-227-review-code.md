# Code review — #227

Ticket: [#227](https://github.com/aloong-planet/agentshed/issues/227). Date 2026-10-23. Implementation: the change on
`fix/skeleton-case-teardown` (from 1349d76), before its commit. Scope: the shared helper `e2e/close-app.ts`, its cases
`e2e/close-app.spec.ts`, and the 72 teardown sites in seven e2e files moved to it.

## Underlying premises

- **The app's own quit is fast; the time is in the process after it** (the helper's header). Measured: `before-quit`,
  the flush, `will-quit` and `exit` within about 15 ms of the close in every probed run, closes of 1.5 s to 86 s after
  (`evidence/ticket-227/probes.txt`); the process still running (`Rs`) 2 s into a 3.1 s close. Holds.
- **Playwright waits, with no bound, for the process to exit and its stdio pipes to close**: its launcher settles a
  close on the child's `close` event and has no timeout in its graceful close (`playwright-core` 1.62.0,
  `lib/coreBundle.js`, `launchProcess`). Holds, by its code.
- **The app is its own process group**: the launcher spawns with `detached: true` on non-Windows, and its own forced
  kill signals `-pid`. Holds, by its code. The e2e runs on macOS and Linux only.
- **Killing the main process alone was not enough; killing the group ends the close at once**: measured, closes of
  28–69 s after a main-only kill and two cases timed out (`after-main-kill.txt`); every close 10.01–10.02 s with the
  group kill, seven cases of seven passing (`after-group-kill.txt`). **Finding (fixed):** the header first said the
  helper processes "hold those pipes", which was inferred, not observed; it now states what was measured.

## Runnability

- The helper's states: a close that settles before the bound returns as Playwright's would (H1); one that does not is
  ended by killing the group, noted, and awaited (H2).
- **Finding (fixed, H3 red first):** a close finishing in the instant after the bound left `process.kill` throwing
  `ESRCH` for a group already gone, which would fail a case whose app had closed. Escape: it fails the case, not just
  the teardown's timing, so it was fixed now: `ESRCH` is taken as "already gone", nothing is noted, and the close is
  awaited.
- After the kill the helper still awaits Playwright's close; if that never settled (a process in an uninterruptible
  wait), the case would time out as before, with the kill noted. Not seen in any run; recorded.
- `test.info()` is only valid inside a test: every call site is in a test body or its `finally` (`rg -n "closeApp\("
  e2e`; no `afterAll`/`afterEach` calls the helper).

## Security

- The kill is aimed at the pid Playwright returns for the process it spawned, as a group; an undefined pid is refused
  rather than turned into a group of 0 (which would be the caller's own group). The cases inject the killer, so they
  signal nothing real.

## Consistency

- Every site: `rg -n "\.close\(" e2e` lists none outside the helper after the change (from 72). The optional forms
  (`app?.close().catch(() => {})`) keep their meaning: close only when there is an app, errors swallowed.
- The first module shared across e2e files: the owner's decision with the scope (D1). Its name and place follow the
  file it serves.
- Smells: none on the change; the replacement is mechanical and uniform.

## Refactoring list

None.
