# Test review — #227

Ticket: [#227](https://github.com/aloong-planet/agentshed/issues/227) (the startup-skeleton e2e case can time out in a
full run under heavy load). Task list: [ticket-227-tasks.md](ticket-227-tasks.md).

## Design review (2026-10-23, implementation starts from 1349d76)

Scope: the bounded teardown — a shared e2e helper and its own cases, and the 72 teardown sites that move to it. No spec
covers the e2e harness; the rule goes to `CONTEXT.md` at step 7. Mutation testing: by the project capability
declaration, mutation-testing is not enabled, so it is skipped; each test's "when does it go red" is answered below.

### Test design table

| # | Test | Spec item | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| H1 | e2e (Playwright, no app launched), new: a close that finishes within the bound returns, kills nothing and notes nothing | the harness rule (D2 in the task list) | the shared helper `closeApp(app, { boundMs })`, called with an object of `ElectronApplication`'s shape: `close()` and `process()` with `pid` and `kill` (Playwright's own type, a third-party boundary) | a `close()` that resolves after 20 ms; a bound of 500 ms | `kill` never called; the case's annotations unchanged; the call returns before the bound. Values: the inputs | a two-method object standing in for Playwright's application | none |
| H2 | as H1, new (amended by the incremental review below): a close that outlasts the bound kills the app's process group, notes it on the case, and returns once the process is gone | as H1 | as H1, plus the injected group killer (the default sends SIGKILL to the group; the case records the call instead, so no real process is signalled) | a `close()` that resolves only once the killer has been called (as Playwright's does once the group is gone); a bound of 100 ms | the killer called once, with the stand-in's pid; one annotation of type `teardown` naming the bound; the call returns after the bound and within a second. Values: the inputs and the helper's documented note | as H1 | none |
| H3 | as H1, new (added from the code review, reviewed below): a group already gone when the bound passes is no error, and nothing is noted | as H1 | as H2 | a `close()` that resolves once the killer is called; a killer that then throws as `process.kill` does for a group that no longer exists (`code: 'ESRCH'`); a bound of 100 ms | the call returns without an error; no annotation added. Values: the inputs | as H1 | none |
| E* | e2e, changed: every teardown in the seven e2e files (72 sites) awaits the helper instead of `app.close()` | — (the harness) | the app through its real teardown | each case as before | each case's own assertions, unchanged; a teardown that finishes in time behaves exactly as before | as before | as before: no launch added or removed |

Incremental review of H2 (2026-10-23, before changing it). The loop with the first version of the helper
(`evidence/ticket-227/after-main-kill.txt`): every close reached the 10 s bound and the main process was killed, yet
four closes of seven took 28–69 s more, and two cases still timed out. Playwright settles a close on the child's
`close` event, which waits for the process and its stdio pipes (`processLauncher` in `playwright-core` 1.62.0); the
app is spawned detached, as its own process group, and Playwright's own forced kill signals the group. Killing the main
pid alone leaves the helper processes holding the pipes. H2 now asserts the group is killed, through an injected killer
so that the case signals nothing real; its input, assertion source and resources are otherwise as before.

Incremental review of H3 (2026-10-23, from the code review): the close can finish in the instant after the bound
passes, and `process.kill` then throws `ESRCH` for a group that is already gone; the helper must not fail a case
whose app closed. The row names its input (a killer throwing as `process.kill` does), its assertion and no resource;
it isolates like H1 and H2, and no real process is signalled.

### Coverage

- The two branches of the helper are each driven by an input that reaches them: H1's close finishes inside the bound,
  H2's does not. What the helper must not do on the fast path (kill, annotate) is asserted on H1.
- The reported failure, a teardown that outlasts the case's budget under load, is the throwaway loop
  (`evidence/ticket-227/reproduction.txt`: five of seven runs timed out in teardown at 16 busy processes). After the
  change the same loop must show no case timing out in teardown, and any close that hit the bound annotated.
- The 72 sites: listed by `rg -n "\.close\(" e2e` (every `.close(` call; the receivers are all `ElectronApplication`s).
  After the change the same listing must show none left outside the helper.
- Gaps: the native shutdown itself (why Electron takes seconds after its JavaScript has exited under load) is not
  tested or changed; it is Electron's, and the harness now bounds the wait on it.

### Case design

- H1 and H2 stand in for Playwright's application object, a third-party boundary, not a module of this project; the
  helper reads only `close()` and `process()`. No project module is mocked.
- The 72 sites change only how a case waits for its teardown.

### False greens (design-level)

- Constant-true: H2's `close()` cannot resolve until `kill` is called, so a helper that never kills times out the case
  rather than passing. H1's 500 ms bound is 25 times its 20 ms close.
- Tautology: the expected values are the inputs (the signal, the bound) and the helper's documented annotation type.
- When each goes red: H1 if the helper kills or annotates a close that finished in time; H2 if it waits without a bound
  (the case times out), kills anything but the app's group, or does not note the kill; H3 if a group already gone fails
  the case or is noted as killed.

### Resource reuse

- H1 and H2 launch nothing. The 72 sites add no launch.
