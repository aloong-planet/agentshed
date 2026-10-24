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
| H1 | e2e (Playwright, no app launched), new (amended after the post-implementation check): a close that finishes within the bound returns, kills nothing and reports nothing | the harness rule (D2 in the task list) | the shared helper `closeApp(app, { boundMs, killGroup, report })`, called with an object of `ElectronApplication`'s shape: `close()` and `process()` with a `pid` (Playwright's own type, a third-party boundary); the group killer and the report sink injected | a `close()` that resolves after 20 ms; a bound of 500 ms | the killer and the sink never called; the case's annotations unchanged; the call returns before the bound. Values: the inputs | a two-method object standing in for Playwright's application, its pid 2^30 (no process group can have it) | none |
| H2 | as H1, new (amended twice: below, and after the post-implementation check): a close that outlasts the bound kills the app's process group, reports and notes it, and returns only once the close has settled | as H1 | as H1 | a `close()` that settles 150 ms after the killer is called (as Playwright's does once the group's pipes close); a bound of 100 ms | the killer called once, with the stand-in's pid; the sink called once with a note naming the bound; one annotation of type `teardown`; the call returns only once the stand-in's close has settled (a flag the stand-in sets), and within 1.5 s. Values: the inputs and the helper's documented note | as H1 | none |
| H3 | as H1, new (added from the code review; amended after the post-implementation check): a group already gone when the bound passes is no error, and nothing is reported or noted | as H1 | as H1 | a `close()` that settles 150 ms after the killer is called; a killer that then throws as `process.kill` does for a group that no longer exists (`code: 'ESRCH'`); a bound of 100 ms | the killer called with the stand-in's pid; the call returns without an error, only once the close has settled (the flag); the sink not called; no annotation added. Values: the inputs | as H1 | none |
| H4 | e2e, new (from the post-implementation check, F1; amended after the incremental check, G1–G3): the default killer ends a real process group whose member still holds the pipes, and the default report prints the warning | as H1 | as H1, with the default killer and the default report, on processes the case starts itself; `console.warn` captured for the case and restored | a detached node parent with piped stdio that starts a child inheriting its stdout and then prints a line; the case waits for that line, so the child exists before the bound starts; the stand-in's `close()` settles on the parent's `close` event (as Playwright's launcher does); a bound of 200 ms | the call returns within 3 s; the parent ended by SIGKILL; one warning starting `[e2e teardown]` naming the bound. Killing the parent alone leaves the child holding the pipe, so `close` never comes and the case times out. Values: the inputs; the parent's exit signal from Node | two node processes the case spawns; an `afterEach` hook kills any group a case started that has not closed, since a timed-out case never reaches a `finally` | two node processes, started and ended by the case (about 100 ms) |
| H7 | as H1, new (from the third incremental check, K1): a close that finishes just inside the bound is not killed — the kill never comes before the bound | as H1 | as H1 | a `close()` that resolves after 400 ms; a bound of 500 ms. A timer firing at any fraction of the bound below 0.8 kills before the close | the killer and the sink never called; the case's annotations unchanged; the stand-in's close settled on return (the flag). No clock reading: the two timers run on the same loop in the order they fall due. Values: the inputs | as H1 | none |
| H5 | as H1, new (F5): a close past the bound with no pid to kill is an error | as H1 | as H1 | `process()` without a pid; a `close()` that never settles; a bound of 100 ms | the call rejects naming the missing process; the killer not called. Values: the helper's documented error | as H1 | none |
| H6 | as H1, new (F5): a kill that fails for another reason than a group already gone is an error | as H1 | as H1 | a killer that throws `code: 'EPERM'`; a bound of 100 ms | the call rejects with that error. Values: the input | as H1 | none |
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

Incremental review of H1–H6 (2026-10-23, after the post-implementation check below, before changing the tests): the
check found that no case ran the default killer (F1), that the stand-in's close settled in the same tick as the kill so
the wait for it went untested (F2), that the only visible signal of a kill, the warning, was not asserted (F3), and two
untested error branches (F5). The rows above name each new input and assertion; H4 starts and ends its own processes
only; the stand-in's pid 2^30 makes a bypassed injection end in ESRCH rather than a real kill (F8).

Incremental review of H2–H4 (2026-10-24, after the incremental post-implementation check, G1–G4, before changing the
tests): H4 now keeps the default report and captures the warning, and waits for the parent's line before the bound
starts; H2 and H3 assert a settled flag rather than elapsed time; the rows above say so.

Incremental review of H7 (2026-10-24, after the third incremental check, K1, before writing it): H2's old elapsed-time
check also held the kill to no earlier than the bound, which the settled flag dropped; H7 holds it with a close that
finishes at 80% of the bound, which an early kill would cut. Coverage: the bound's lower side, the one boundary value
the cases lacked. Case design: as H1, no clock. False greens: H7 goes red when the helper's timer fires before 400 ms of a
500 ms bound. Resource reuse: none.

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
- The killer injected in H1–H3, H5 and H6 stands for the operating system's signal, the effect the requirement names;
  the cases assert the call it would make, and H4 runs the default killer on a real process group the case starts.
  The report sink stands for the terminal: the list reporter shows no annotations (`@playwright/test` 1.62.0), so the
  warning is what a reader of a run sees.
- The 72 sites change only how a case waits for its teardown.

### False greens (design-level)

- Constant-true: H2's `close()` cannot resolve until `kill` is called, so a helper that never kills times out the case
  rather than passing. H1's 500 ms bound is 25 times its 20 ms close.
- Tautology: the expected values are the inputs (the signal, the bound) and the helper's documented annotation type.
- When each goes red: H1 if the helper kills, reports or annotates a close that finished in time; H2 if it waits without
  a bound (the case times out), kills another pid, does not report or note the kill, or returns before the close has
  settled; H3 if a group already gone fails the case, is reported or noted, or the helper returns before the close has
  settled; H4 if the default killer ends less than the group (the case times out); H5 and H6 if those errors are
  swallowed. To be shown by planted faults on the helper: a main-only kill (H4), no wait for the settled close (H2,
  H3), no report (H2).

### Resource reuse

- H1–H3 and H5–H7 launch nothing; H4 starts two node processes and ends them, its `afterEach` covering a timeout. The
  72 sites add no launch.

## Post-implementation check (2026-10-23, 580b426; commit range 1349d76..0e6d642)

Performed by an independent agent that did not inherit the implementing conversation. Ticket: #227. Scope: the tests
this change added or changed, `e2e/close-app.spec.ts` (H1-H3) and the 72 teardown sites in the seven e2e files (E*),
against the test design table above, the helper `e2e/close-app.ts` and the full verification gateway log
[gateway-580b426.txt](evidence/ticket-227/gateway-580b426.txt). Mutation testing: per the project capability declaration
(`capabilities.toml`, read with a TOML parser: `[mutation-testing] enabled = false`), mutation-testing is not enabled; this
item is skipped, and each test's "when does it go red" is answered below against the helper's code.

Run evidence. The gateway log records `git rev-parse HEAD` 580b426 on a clean tree, each command, its exit code and its
full output: every exit code 0, `VERIFY_EXIT=0` (867 unit, 135 script, 109 site, 151 e2e, smoke OK). The range's last
commit, 0e6d642, adds the log itself and edits the task list, both under `docs/.workings/`, which no test reads
(`rg -uu -n "\.workings"` outside `docs/`: screenshot writes in `startup-restore.spec.ts`, string literals in
`app.spec.ts` and `md.test.ts`); the full-run results therefore stand for the range's code. The gateway's `check:lang`
and `check:nul` ran before those two files existed: `check:lang` was run again after this section was staged (see
Commands); `check:nul` was not (outside this check's allowed runs), both files hold no NUL byte (counted byte by byte),
and the gateway before delivery covers it.

### Test design table against the written tests

| # | Seam | Input | Assertion; where the expected value comes from | Fixture | Resource | Matches the table |
|---|---|---|---|---|---|---|
| H1 | `closeApp(app, { boundMs: 500, killGroup })` | a close settling after 20 ms; bound 500 ms | took < 500 ms; `killed` empty; annotations unchanged; the inputs | stand-in `{ close, process: () => ({ pid: 4242 }) }` | none | yes in substance; the row's seam text is stale (F7) |
| H2 | as H1, bound 100 ms | a close settling only when the injected killer runs | `killed` is `[4242]`; took in [100, 1000) ms; exactly one `teardown` annotation containing "100 ms"; the inputs | as H1 | none | yes |
| H3 | as H2 | a killer that releases the close, then throws `kill ESRCH` with `code: 'ESRCH'` | returns without an error; annotations unchanged; the inputs | as H1; the error has Node's shape (`process.kill(-(2**30), 0)` here gives message `kill ESRCH`, code `ESRCH`) | none | yes |
| E* | each case's teardown through `closeApp` | as before | each case's own assertions | as before | as before | yes: the 151 changed lines in the seven files are the 72 close calls, their 72 replacements and seven imports; no case, launch or assertion changed |

Sites: `git grep -c "\.close(" 1349d76 -- e2e` gives 72 in the seven files; at HEAD `rg -uu -n "\.close\(" e2e` lists only
the helper's three lines (the positive control) and `closeApp(` occurs 72 times in the seven files. Every other `close`
identifier in `e2e/` is one of the local `close(l)` wrappers in `app.spec.ts` and `global-search.spec.ts`, which call the
helper, or interface wording (drawer, popover). No hook (`beforeAll`, `afterAll`, `beforeEach`, `afterEach`) exists in
`e2e/`, so every `test.info()` the helper makes is inside a case.

Test file header: `e2e/close-app.spec.ts` says what it stands in for and notes no gap (F6).

### Coverage

Findings F1, F5, F6, F9. The helper's two main branches are each driven by an input that reaches them (H1, H2), and the
ESRCH branch by H3, whose red (`helper-cases-h3.txt`) falls at `close-app.ts:38`. No automated case reaches the default
group killer (`close-app.ts:20-22`, F1), the missing-pid branch (`:37`) or a kill error other than ESRCH (`:42`, F5). The
ticket's first proposed direction and the full-run clause of its acceptance sketch have no recorded disposition (F9).

### Case design

Findings F7, F8. No project module is mocked: no module-level stand-in, and the only injected part is the killer, which
stands for the OS signal, a system boundary. Asserting that it was called (H2) or not (H1) asserts the required external
effect, the kill; the exemption is not written in the record (F7). The cases are isolated (no shared state; each reads
only its own annotations); the fixed pid 4242 is a hazard only if the injection is bypassed (F8).

### False greens

Findings F1, F2, F3, F4. No constant-true, tautological or old-path assertion, no conditional skip, and every assertion
follows an awaited call. When each goes red, from the helper's code:

- H1: the helper kills or annotates a close that finished in time, or waits for the bound (took >= 500 ms). A helper
  returning before the close settles stays green here and is caught by H2 (no kill).
- H2: the helper never kills (the close never settles; the 5 s case timeout), kills before the bound (took < 100 ms),
  kills another pid, waits a second or more after the kill, or does not annotate. It stays green when the default killer
  signals only the main pid or sends a non-fatal signal (F1), when the helper returns without awaiting the close after
  the kill (F2), and when the warning is dropped (F3).
- H3: a kill throwing ESRCH fails the case or is annotated. It stays green for a helper that swallows every kill error
  (F5), one that does not await the close after ESRCH, and one that returns before the bound: H3 does not assert that the
  killer was reached (F2).
- E*: each case's own assertions are unchanged; their teardown no longer goes red on a quit that hangs (F4).

The reds recorded for the helper: H2 against an unbounded close (`helper-cases-first.txt`, the 5 s timeout) and H3
without the ESRCH handling (`helper-cases-h3.txt`) are reds at the asserted behaviour. The red the task list records as
"H2 red against the main-only kill" (`after-group-kill.txt`, last part) is `TypeError: app.process(...).kill is not a
function`: the old helper called a method the new stand-in no longer has. It shows the case reaches the new seam, not that
a main-only kill is caught (F1).

### Resource reuse

No finding. H1-H3 launch nothing (no `electron` import or launch in the file) and took 22-102 ms in the gateway run; the
72 sites add or remove no launch (the E* row). Runtime count from the gateway run: the e2e build once (one
`electron-vite build`, log lines 457-479); app launches print nothing in the log, so their count rests on the unchanged
launch code; the new kill path ran once, for the stand-in (log line 581, pid 4242), and no real teardown was killed in
the 151 cases; H1 and H3 print nothing, as designed.

### Findings

- **F1 (medium) - the fix's own kill is untested.** `e2e/close-app.ts:20-22` (`process.kill(-pid, 'SIGKILL')`) runs in no
  automated case: H1-H3 inject `killGroup`, and the gateway run killed no real teardown. Reverting it to a main-pid kill,
  the version `after-main-kill.txt` shows failing under load, or to a non-fatal signal leaves all 151 e2e cases green. The
  design review's "H2 [goes red if it] kills anything but the app's group" and the task list's "H2 red against the
  main-only kill" overstate what H2 checks (see False greens). Suggested handling, now: add a case (through the test
  design table and the design review) that spawns its own detached process group, a node parent with stdio pipes whose
  node child inherits the parent's stdout, stands it in as the app (`close()` settles on the parent's `close` event, as
  Playwright's launcher does; `process()` gives the parent's pid), and calls `closeApp` with a short bound and the
  default killer: it must return within a couple of seconds, and a main-only kill leaves the child holding the pipe, so
  the case times out. It costs two node processes and signals only the group it started. Correct the two overstated
  claims in the records.
- **F2 (low-medium) - "returns once it is gone" is not driven.** `e2e/close-app.spec.ts:16-19`: the stand-in settles its
  close in the same tick as the kill, so deleting `await closed` at `close-app.ts:50` (H2's path) or `:43` (H3's) leaves
  all three cases green, though H2's name claims it. Measured, the real close settled 13-19 ms after the kill (closes of
  10013-10019 ms on a 10000 ms bound, `after-group-kill.txt`). Suggested handling, now: settle the stand-in's close a
  fixed delay after the kill (say 50 ms) and assert the call returns only after it (took >= bound + delay, or a settled
  flag true on return); in H3 also assert `killed` is `[4242]`.
- **F3 (medium) - the visible signal is unasserted.** Under this project's reporter (`playwright.config.ts`: `list`
  only), the annotation never appears: Playwright 1.62's terminal and list reporters print no annotations
  (`node_modules/.pnpm/@playwright+test@1.62.0/.../playwright/lib/runner/index.js`: none in `TerminalReporter` from line
  1113 or `ListReporter` at 4612-4852; annotations reach only the JSON, HTML, JUnit and blob reporters). The
  `console.warn` at `close-app.ts:48` is therefore the only place a kill shows, and no case asserts it: removing it keeps
  every case green while a real slow close goes unseen. H2's own warning also prints in every full run (gateway log
  line 581), so the channel always carries one line that is not about an app. Suggested handling, now: H2 asserts the
  warning through a sink it injects or captures and restores (which also keeps the stand-in's line out of the run's
  output); say in the record that the annotation is not shown under the list reporter.
- **F4 (medium; the owner's decision) - a hanging quit no longer fails any case.** Before, a quit that hung (for example
  a `before-quit` or `will-quit` handler that never returns) turned the case red at 60 s; now every case passes with a
  kill and a warning, and nothing fails on a real teardown kill, locally or in CI. Cases that relaunch and read what the
  quit persisted still catch a quit that does not persist; a hang after persisting is silent. This is D2's trade-off, but
  no record states that the suite stopped going red on it. Suggested handling: write it into the CONTEXT invariant planned
  for step 7 (the document sync checklist's first row), including that a real teardown kill in an unloaded run is a
  defect to investigate; optionally make CI fail on one (a switch in the helper, or a step rejecting `[e2e teardown]`
  lines other than the helper's own case), in this ticket or a new one.
- **F5 (low) - two error branches untested.** `close-app.ts:37` (no pid: throws) and `:42` (a kill error other than
  ESRCH: rethrown). Both are reachable with the same stand-in at no cost (`process()` without a pid; a killer throwing
  `EPERM`). A helper that swallowed every kill error would leave the case waiting on the close until the 60 s timeout
  instead of failing at once with the cause. Suggested handling: two small cases through the design table, or a line in
  the Coverage section recording them as deliberately untested.
- **F6 (low) - no gap notes in the test file header.** `e2e/close-app.spec.ts:1-2` notes neither the native shutdown
  under load (the design review's Coverage "Gaps") nor, unless F1's case is added, the default killer, with the condition
  under which each is tested (the load loop, `after-group-kill.txt`). Suggested handling, now: add both to the header.
- **F7 (low) - the test design table lags the tests.** Row H1 still describes the stand-in as "`close()` and `process()`
  with `pid` and `kill`"; since the H2 amendment `process()` gives only `pid` and the kill is the injected killer. The Case
  design section does not state the exemption for asserting calls on the injected killer (it is the OS-boundary effect the
  requirement names). Suggested handling, now: update row H1, add the exemption, and re-review the changed row.
- **F8 (low) - the stand-in's pid can be a real group.** `close-app.spec.ts:14` uses pid 4242, which can exist on macOS
  and Linux. Every case injects the killer, so nothing is signalled today; a helper change that stopped honouring the
  injected killer would send SIGKILL to process group 4242 on the machine running the tests. Suggested handling: a pid
  above every platform's pid limit (for example `2 ** 30`; the null signal to `-(2**30)` gives ESRCH here), so a bypass
  ends in ESRCH and H2's 5 s timeout rather than a real kill.
- **F9 (low-medium) - two ticket items without a disposition.** #227's first proposed direction ("Keep a trace, or the
  main process's output, for a failed case") appears in no record (`rg -i "trace"` over the four records: no match) or in
  `playwright.config.ts`. Its acceptance sketch asks that "a full run under comparable load no longer times out in
  teardown"; the evidence is seven runs of one case (`after-group-kill.txt`), and task 6 (CI) is open. Suggested
  handling: record a decision on the trace (do it, or drop it with the reason, such as the stuck step pinned by the
  reproduction); run one full `pnpm e2e` under the reproduction's load in the implementing session, or record why the
  single-case loop stands for it. This check added no load.

### Document sync these findings create

Handed to the main agent; none is in the document sync checklist yet, and a fix passing its tests does not mark any of
them synced:

- this record: row H1 and the Case design exemption (F7), the "when it goes red" claim for H2 (F1), and new rows for any
  case added (F1, F2, F3, F5), each through the design review;
- `ticket-227-tasks.md`: task 4's "H2 red against the main-only kill" (F1), and a decision on the trace (F9);
- `e2e/close-app.spec.ts` header: the gaps (F6), which the checklist's second row (e2e file headers) covers;
- `CONTEXT.md`, the invariant planned for step 7 (the checklist's first row): the trade-off of F4.

### Commands (this check)

| Command | Exit code |
|---|---|
| `git status`, `git branch --show-current`, `git log --oneline 1349d76..HEAD` | 0 |
| `capabilities.toml` parsed with `smol-toml` (node) | 0 |
| `gh issue view 227 --json title,body,state,labels` | 0 |
| `git show --stat 580b426`, `git show --stat 0e6d642`, `git diff --stat 580b426 0e6d642` | 0 |
| `git diff 1349d76..HEAD -- <the seven e2e files>` (to a file) | 0 |
| `git grep -c "\.close(" 1349d76 -- e2e` | 0 |
| `rg -uu -n "\.close\(" e2e`; `rg -uu -c "closeApp\(" e2e` | 0; 0 |
| `rg -uu -n "beforeAll\|afterAll\|afterEach\|beforeEach\|test\.use\|test\.extend" e2e` | 1 (no match) |
| `rg -uu -n "\.workings"` outside `docs/` | 0 |
| reading `playwright-core` 1.62.0 `launchProcess` and the `@playwright/test` 1.62.0 reporters (`rg`, `sed`) | 0 |
| `pnpm -s exec playwright test e2e/close-app.spec.ts --repeat-each=5` (output to a file) | 0 (15 passed) |
| `node -e "process.kill(-(2**30), 0)"` in a try (the null signal to a group that cannot exist) | 0 (ESRCH caught) |
| NUL byte count of the two files 0e6d642 added or changed (node) | 0 |
| `git add -f` this record, then `pnpm check:lang` (output to a file; run again after this row was added) | 0; 0 |

## Handling of the post-implementation check's findings (implementing session, 2026-10-23)

| # | Handling |
|---|---|
| F1 | New H4 runs the default killer on a process group the case starts (a detached parent with piped output, a child inheriting it). A main-only kill turns it red by timing out (`evidence/ticket-227/plant-helper.txt`). The two overstated claims corrected: the design review's "kills anything but the app's group" now rests on H4, and the task list no longer calls the earlier `TypeError` a red against the main-only kill |
| F2 | The stand-in's close settles 150 ms after the kill; H2 and H3 assert the helper returns only after that, and H3 asserts what was killed. Dropping the wait turns both red (`plant-helper.txt`) |
| F3 | The warning goes through an injected sink (`report`, defaulting to the warning); H2 and H4 assert it. Dropping the report turns both red. The design review notes that the list reporter shows no annotations |
| F4 | Stated in `CONTEXT.md`'s invariant (step 7): a slow close passes with a warning, so a warning on an unloaded run is a defect to look into. CI is not made to fail on a kill: that would bring back the failure under load the bound removes |
| F5 | H5 (no pid) and H6 (a kill error other than ESRCH) added |
| F6 | The test file's header names its gap: Electron's native shutdown under load is not reproduced there, with where the loaded runs are |
| F7 | The design table's rows match the written cases; the case design states why asserting the injected killer's call is right (it stands for the operating system's signal) |
| F8 | The stand-in's pid is 2^30, which no process group can have |
| F9 | The trace: not added (D3 in the task list). The full run under load, on 24807a5: all 154 cases passed at every load tried, from 9–14 to over 250, with closes ended at the bound once the load ran away; one Playwright worker-teardown timeout after the last case at the highest load (`evidence/ticket-227/full-run-under-load.txt`; task 5e) |

## Post-implementation check, incremental (2026-10-24, 76b23b6; fix range 0e6d642..76b23b6)

Performed by the same independent agent as the first round, which did not inherit the implementing conversation.
Ticket: #227. Mutation testing: per the project capability declaration, mutation-testing is not enabled; this item is
skipped. The planted faults in `plant-helper.txt` were the implementing session's; this check reads them as evidence
only.

### Scope, as retrieved

- Changed in the range (`git diff --name-status 0e6d642..76b23b6`): the tests `e2e/close-app.spec.ts`; the shared test
  helper `e2e/close-app.ts`; `CONTEXT.md`; work records and evidence under `docs/.workings/e2e-teardown/`.
- Tests depending on the changed helper (`rg -uu -n "from '\./close-app'"` over the repository, `node_modules/`, `out/`
  and `docs/.workings/` excluded): `close-app.spec.ts` and the seven e2e files of E* (`app-update`, `app`,
  `global-search`, `menu-check-updates`, `settings-updates`, `startup-restore`, `token-span`). Nothing outside `e2e/`
  imports it.
- Test data changed in the range: none. No test reads the repository's `CONTEXT.md` (`rg -uu -l "CONTEXT\.md"` outside
  `docs/`: the tests only write fixture files of that name in temporary homes); the gate `check:ui` reads it, and ran in
  the gateway below.
- Rows of the test design table changed in the range: H1-H3 amended, H4-H6 added; E* unchanged.
- Out of scope: nothing else depends on the change. The E* conclusions that rest on code outside the range (the 151-line
  diff of the 72 sites, none left, no hook) are carried over from the first round (2026-10-23, 580b426).

### Run evidence

- Targeted log [targeted-2.txt](evidence/ticket-227/targeted-2.txt): HEAD 0e6d642 with `close-app.spec.ts` 431ca5f and
  `close-app.ts` 6f3400b in the tree, the same blobs as 24807a5 and 76b23b6; typecheck, lint and the six cases three
  times, all exit 0 (`TARGETED_EXIT=0`). It runs only `close-app.spec.ts`, not the seven importers (G5).
- Full gateway [gateway-f2d71e4.txt](evidence/ticket-227/gateway-f2d71e4.txt): HEAD f2d71e4, clean tree, every exit code
  0, `VERIFY_EXIT=0`; 154 e2e passed (148 app cases and H1-H6). f2d71e4 holds the range's code (`git diff --stat
  24807a5 76b23b6` outside `docs/.workings/`: empty); 76b23b6 adds only the log itself and edits the task list, which no
  test reads, both NUL-free (byte count). The seven importers' results are taken from this log.
- This check ran the helper's six cases five times: 30 passed; no process of H4's shape left afterwards
  (`pgrep -fl` before and after: none).

### Test design table against the written tests (changed rows)

| # | Matches the row | Notes |
|---|---|---|
| H1 | yes | bound 500 ms, close at 20 ms; killer, sink and annotations untouched; took < 500 ms |
| H2 | yes | close settles 150 ms after the kill; killed `[2^30]`, took in [250, 1500) ms, one report and one `teardown` annotation naming 100 ms |
| H3 | yes | as H2, the killer throwing ESRCH after releasing the close; killed `[2^30]`, took >= 250 ms, no report, no annotation |
| H4 | input, assertions and resource yes; fixture column no (G3) | the row says the case kills its processes "in its `finally`"; the code ends them in `test.afterEach` (`close-app.spec.ts:16-22`), moved there after a timed-out case left a child behind (`plant-helper.txt`, line 2) |
| H5 | yes | no pid, close never settles; rejects with "no process to kill"; killer not called |
| H6 | yes | killer throws EPERM; rejects with it. The error's shape (`kill EPERM`, `code`) is Node's |
| E* | yes (unchanged) | the helper's change gives the seven files' teardowns the same behaviour: the default sink prints the same line the helper printed before |

Test file header (`close-app.spec.ts:1-6`): names what each case stands in for and the gap with its condition (the native
shutdown under load; the loaded runs).

### The first round's findings, as handled

| # | Verified |
|---|---|
| F1 | yes: H4 runs `killGroupOf` on a group the case starts; the planted main-only kill turns H4 red at its 5 s timeout (`plant-helper.txt`); the two overstated claims are corrected (design review, task 4) |
| F2 | yes: both waits are driven (the planted removal turns H2 and H3 red at about 104 ms) and H3 asserts the killer was reached |
| F3 | in part: the call to the sink is asserted (H2, H4; the planted removal turns both red), and the record says the list reporter shows no annotations; the default sink itself runs in no case (G1) |
| F4 | stated in `CONTEXT.md` and consistent with the code; failing CI on a kill was declined by the implementing session with its reason. The first round marked this the owner's decision: to be confirmed by the owner at the PR |
| F5 | yes: H5, H6 |
| F6 | yes |
| F7 | yes for H1-H3 and the exemption; H4's row has a new mismatch (G3) |
| F8 | yes: pid 2^30 |
| F9 | yes: D3 records the trace decision; the full runs under load (`full-run-under-load.txt`) match the task list's summary, including the 12-busy run's exit 1 from Playwright's worker teardown after all 154 passed (G6) |

### Coverage

Findings G1, G2. Each changed row is driven by an input that reaches its branch: H4 the default killer, H5 the
missing pid (`close-app.ts:46`), H6 a non-ESRCH kill error (`:51`). Not reached by any case: the default report sink
(`close-app.ts:25-27`, G1). H4's claim that a member "still holds the pipes" when the kill comes rests on timing (G2).

### Case design

Finding G3. No project module is mocked; the injected killer and sink stand for the OS signal and the terminal, and the
record states why. H4 signals only the group it spawned, and its `afterEach` cleanup ran clean in this check's 30 runs.

### False greens

Findings G1, G2, G4. When each goes red, from the helper's code:

- H1: the helper kills, reports or annotates a close that finished in time, or waits for the bound.
- H2: no kill (5 s timeout), a kill before the bound or of another pid, no wait for the settled close (took about
  100 ms), no report, no annotation.
- H3: ESRCH fails the case, is reported or noted, the killer is never reached, or the helper returns before the close
  settles.
- H4: a kill of less than the group (the close never comes; 5 s timeout), a signal other than SIGKILL, no report. It stays
  green for a main-only kill if the child has not been spawned by the 200 ms bound (G2).
- H5: a missing pid is not an error, or a kill is attempted. H6: a non-ESRCH kill error is swallowed or taken as success.
  A helper that swallowed either and then waited on the close would go red only at the 60 s default timeout (no
  `setTimeout` in H5 and H6); slow, not false.
- Nothing fails if `warn` stops printing or the default `report` becomes a no-op (G1).

The planted-fault evidence: each replacement is checked to occur exactly once before it is applied, the file is
restored byte for byte, and Playwright loads the helper's source directly, so each fault reached the code under test;
the reds fall on the predicted cases with the predicted durations. The log keeps only the result lines, not the failure
messages, so the red's location rests on case and duration.

### Resource reuse

No finding. The changed rows launch no app; H4 starts two node processes per run (about 200 ms with its bound). Counted
from the targeted log: three H4 groups in 18 cases, no app launch, no build. From the gateway: one `electron-vite build`;
no `[e2e teardown]` line at all, so no real teardown was killed in the 148 app cases, and the helper's cases now report to
their own sinks.

### Findings

- **G1 (low-medium) - the default report sink runs in no case.** `e2e/close-app.ts:25-27` (`warn`) and the default
  `report = warn` (`:34`): H2 and H4 inject `report`, and the gateway run printed no `[e2e teardown]` line. Emptying
  `warn`, or defaulting `report` to a no-op, keeps all 154 green, though `CONTEXT.md` now says a slow close "shows only as
  that warning". Its only evidence is the loaded runs (`full-run-under-load.txt`, 329 lines). Suggested handling: H4,
  already the case for the default killer, also leaves `report` at its default and captures `console.warn` for its
  duration (restored in a `finally`), asserting one line that starts with `[e2e teardown]` and names the bound; replacing
  the Node global is a system boundary, not a project module, and the record says so. Otherwise, name the gap in the
  test file header.
- **G2 (low-medium) - H4's precondition is timing.** `close-app.spec.ts:93-106`: the parent spawns the child after its
  own start-up, and nothing waits for the child before `closeApp` starts its 200 ms bound. A child not yet spawned at the
  kill leaves a main-only kill green. The planted-fault run shows the child in time on an unloaded machine. Suggested
  handling: the parent writes a line once the child is spawned, and the case awaits it before calling `closeApp`.
- **G3 (low) - the record lags the code on H4.** The H4 row's fixture column says the case kills its processes "in its
  `finally`"; it does so in `test.afterEach` (`close-app.spec.ts:16-22`), and the reason is only in `plant-helper.txt`.
  The design review's Resource reuse section still reads "H1 and H2 launch nothing", without H3-H6 or H4's processes.
  Optional, in the same change: drop the pid from `started` on the parent's `close` event, so that `afterEach` signals
  only a group that may still be alive rather than a remembered id. Suggested handling: update the row and the section.
- **G4 (low, optional) - lower bounds with no tolerance.** `close-app.spec.ts:64` and `:83` (`took >= 100 + SETTLE_MS`)
  compare `Date.now()` with timers on libuv's cached millisecond loop clock; the margin seen is 3-15 ms over the targeted,
  gateway, loaded and this check's runs. A flag set when the stand-in's close settles, asserted true on return, checks
  the same wait without the clock.
- **G5 (low) - the targeted verification left out the helper's importers.** `targeted-2.txt` runs only
  `close-app.spec.ts`; the seven files that import the changed helper are not in it, and the import retrieval is not
  recorded (the rule for the targeted run after fixes takes the importers too). The gateway on f2d71e4 ran them on the
  same code, so no rerun is needed. Suggested handling: record the retrieval and point to the gateway for those files.
- **G6 (low; the owner's decision) - the 12-busy run's exit 1 has no durable home.** After all 154 passed, Playwright's
  worker teardown exceeded 60 s outside any case (`full-run-under-load.txt`, lines 1266-1284); the cause is not known
  and it was not seen at 10 busy under similar load. The task list, a working record, is its only place. Impact: a
  local `pnpm e2e` under load far above the issue's can still exit 1 with every case green. Suggested handling: the
  owner decides between a ticket and dropping it.
- **G7 (low; waiting) - H4 has not yet run on Linux.** The CI repeat (`ci-repeat-39972027006.txt`) ran 580b426, before
  H4-H6. The PR's CI e2e job on ubuntu will be their first run there. Suggested handling: a Waiting item on that job.

### Document sync

Facts changed in the range and where they are stated: the helper's report sink (the helper's header and the
`CONTEXT.md` invariant say a warning is printed: still true); H4-H6 (this record: G3); the `CONTEXT.md` invariant
(consistent with `close-app.ts`: the 10 s default, the group kill, the annotation, the warning; its `#227` follows the
file's own `#122` at line 432); the test file's gap (the checklist's second row, Done; its check reproduced: in the first
40 lines of the seven files only the import matches). New sync items from this round, none in the document sync
checklist yet: this record (G3, and G1 or G2 if the cases change); a durable home for G6 (the owner's decision); a
Waiting item for G7 (the PR's CI). A fix passing its tests does not mark any of them synced.

### Commands (this round)

| Command | Exit code |
|---|---|
| `git status`, `git log --oneline 0e6d642..HEAD`, `git show --stat` of 24807a5, f2d71e4, 76b23b6 | 0 |
| `git diff --name-status 0e6d642..76b23b6`; `git diff 0e6d642..76b23b6 -- e2e/close-app.ts CONTEXT.md` | 0; 0 |
| `git rev-parse <commit>:<file>` and `git hash-object` for the targeted log's files | 0 |
| `git diff --stat 24807a5 76b23b6 -- . ':(exclude)docs/.workings'`; `git diff --name-only f2d71e4 76b23b6` | 0; 0 |
| `rg -uu -l` / `rg -uu -n` for importers of `close-app` (repository, exclusions as above) | 0 |
| `rg -uu -l "CONTEXT\.md"` outside `docs/`, then the read sites | 0 |
| `git diff 0e6d642..76b23b6 -- <this record>` (to a file), table rows listed | 0 |
| `rg` over `gateway-f2d71e4.txt`, `full-run-under-load.txt`, `ci-repeat-39972027006.txt` (results to files) | 0 |
| first 40 lines of the seven e2e files, `rg -n -i "\bclose\b\|teardown\|close-app"` | 0 |
| `pgrep -fl` for H4's process shape, before and after the run | 1; 1 (none) |
| `pnpm -s exec playwright test e2e/close-app.spec.ts --repeat-each=5` (output to a file) | 0 (30 passed) |
| NUL byte count of the two files 76b23b6 adds or changes (node) | 0 |
| `git add -f` this record, then `pnpm check:lang` (output to a file; run again after this row was added) | 0; 0 |

## Handling of the incremental check's findings (implementing session, 2026-10-24)

| # | Handling |
|---|---|
| G1 | H4 keeps the default report and captures `console.warn` for its duration, restored in a `finally`; it asserts one warning starting `[e2e teardown]` that names the bound. A silent default report turns H4 red (`evidence/ticket-227/plant-helper-2.txt`) |
| G2 | The parent prints a line once its child has spawned, and H4 waits for that line before calling the helper. A main-only kill fails H4: the case times out at 5 s, and its 3 s check then fails as well once the `afterEach` hook has ended the group and released the close (`plant-helper-2.txt`; wording corrected after the third incremental check, K2) |
| G3 | The H4 row and the Resource reuse section updated (design review, "Incremental review of H2–H4"); a group leaves `started` on its parent's `close` event, so `afterEach` signals only a group not seen closing |
| G4 | H2 and H3 assert a flag the stand-in sets when its close settles, instead of elapsed time; dropping either wait turns its case red (`plant-helper-2.txt`) |
| G5 | `targeted-3.txt` records the retrieval for this change: no file names the changed test file except the type checker's build cache (`tsconfig.node.tsbuildinfo`), and a control search lists the helper's seven importers. For `targeted-2.txt`: the helper did not change between it and f2d71e4, whose gateway ran those seven files |
| G6 | Waiting for the owner's decision, ticket or drop (asked 2026-10-24) |
| G7 | A Waiting item in the document sync checklist: the PR's CI e2e job on ubuntu is H4–H6's first run on Linux |

Targeted verification of these changes: `evidence/ticket-227/targeted-3.txt` (typecheck, lint, the retrieval, the helper's six cases five times over: 30 passed; `TARGETED_EXIT=0`). An incremental check of the commit follows.

## Post-implementation check, incremental (2026-10-24, 3da7bd1; fix range 76b23b6..3da7bd1)

Performed by the same independent agent as the earlier rounds, which did not inherit the implementing conversation.
Ticket: #227. Mutation testing: per the project capability declaration, mutation-testing is not enabled; this item is
skipped. The planted faults in `plant-helper-2.txt` were the implementing session's; this check reads them as evidence
only.

### Scope, as retrieved

- Changed in the range (`git diff --name-status 76b23b6..3da7bd1`): `e2e/close-app.spec.ts`, which holds H1-H6 and their
  stand-in; work records and evidence under `docs/.workings/e2e-teardown/`. The helper `e2e/close-app.ts` is unchanged
  (blob 6f3400b at both ends), so no test depends on changed helper code, and the seven E* files are out of scope.
- Files naming the changed test file (`rg -uu -l "close-app\.spec"`, `node_modules/`, `out/` and `docs/.workings/`
  excluded): only `tsconfig.node.tsbuildinfo`, the type checker's cache. Control: the same search for
  `from './close-app'` lists `close-app.spec.ts` and the seven E* files. Test data changed: none.
- Rows of the test design table changed in the range: H2, H3 and H4 amended; H1, H5, H6 and E* unchanged.
- Carried over: the E* conclusions from the first round (2026-10-23, 580b426) and the previous incremental round
  (2026-10-24, 76b23b6); the conclusions on H1, H5 and H6 from the previous incremental round, their code being unchanged.

### Run evidence

- Targeted log [targeted-3.txt](evidence/ticket-227/targeted-3.txt): HEAD 76b23b6 with `close-app.spec.ts` cb397a7 in the
  tree, the blob 3da7bd1 committed; typecheck and lint exit 0; the retrieval; the six cases five times, 30 passed,
  `TARGETED_EXIT=0`. Its two retrieval commands end in `; echo "... $?"`, so the exit code logged for them is the echo's;
  grep's own code is printed in their output (0 for both). They are retrievals, not gates.
- Full gateway [gateway-f2d71e4.txt](evidence/ticket-227/gateway-f2d71e4.txt), the latest full run: it predates this
  range's change to `close-app.spec.ts`, the only code difference between f2d71e4 and 3da7bd1 (`git diff --stat f2d71e4
  3da7bd1` outside `docs/.workings/`). As the incremental rule says, it stands as the full-run evidence here, and the
  gateway is run again before delivery, since a test changed after it.
- This check ran the helper's six cases five times: 30 passed; no process of H4's shape before or after
  (`pgrep -fl`: none); the tree clean.

### Test design table against the written tests (changed rows)

| # | Matches the row | Notes |
|---|---|---|
| H2 | yes | `settled()` true on return, the call within 1.5 s, killed `[2^30]`, one report and one `teardown` annotation naming 100 ms; no elapsed-time lower bound any more (K1) |
| H3 | yes | killed `[2^30]`, `settled()` true, no report, no annotation; no timing |
| H4 | yes | default killer and default report; waits for the parent's "child running" line (printed on the child's `spawn` event) before the 200 ms bound; `console.warn` captured and restored in a `finally`; within 3 s, exit by SIGKILL, one warning matching `^\[e2e teardown\] .*200 ms`; the group leaves `started` on the parent's `close`, so `afterEach` signals only a group not seen closing |

Test file header (`close-app.spec.ts:1-6`): updated for H4's default report; the gap note stands.

### The previous round's findings, as handled

| # | Verified |
|---|---|
| G1 | yes: H4 runs the default `report`; the planted silent default fails H4 at the warning assertion (`plant-helper-2.txt`, line 133) |
| G2 | yes: H4 waits for the child before the bound. The planted main-only kill fails H4 by its 5 s test timeout; the 3 s check then fails as well (4965 ms), once the `afterEach` hook has ended the group and released the close. The handling row's "fails H4 at its 3 s check" names the second failure only (K2) |
| G3 | yes: the H4 row, the Resource reuse section and the `started` bookkeeping |
| G4 | yes for the waits: dropping either wait fails H2 or H3 at its `settled()` assertion (lines 70, 88). But the elapsed-time bound it replaced also pinned the bound's lower edge, and that is now unchecked (K1) |
| G5 | yes: `targeted-3.txt` records the retrieval with a control; the note on `targeted-2.txt` holds (the helper did not change between it and f2d71e4) |
| G6 | in the checklist, Pending the owner's decision (asked 2026-10-24) |
| G7 | in the checklist, Waiting on the PR's CI |

### Coverage

Finding K1. Each changed row's input reaches its branch, and H4's precondition, a child holding the pipes when the kill
comes, is now waited for. Missing: the boundary value of the bound itself; no case has a close that settles shortly
before the bound (K1).

### Case design

No finding. No project module is mocked. Replacing `console.warn` in H4 touches a Node global, not a project module, and
it is restored in a `finally`; if H4 times out, the `finally` never runs, and the replaced `console.warn` stays only in a
worker Playwright replaces after a failure.

### False greens

Finding K1. When each changed case goes red, from the helper's code:

- H2: no kill (5 s timeout), another pid, no wait for the settled close (`settled()` false), no report, no annotation,
  or a wait of 1.5 s or more. It stays green for a kill that comes before the bound (K1).
- H3: ESRCH fails the case, is reported or noted, the killer is never reached, or the helper returns before the close
  settles.
- H4: a kill of less than the group (5 s timeout), a signal other than SIGKILL, a silent default report, or a warning
  without the prefix or the bound.

The planted-fault log now keeps the failure messages: each red falls on the line that asserts the planted behaviour
(133, then 131 after the timeout, 70, 88), each replacement was asserted to occur exactly once, and the file was restored
byte for byte.

### Resource reuse

No finding. Counted from the targeted log: five H4 process groups in 30 cases, no app launch, no build.

### Findings

- **K1 (low-medium) - a kill before the bound is no longer caught.** In the previous version, H2's
  `took >= 100 + SETTLE_MS` checked two things: the wait for the settled close, and that the kill came no earlier than
  the bound. The flag kept the first and dropped the second. My G4 suggestion named only the first; that omission is
  mine. Now a helper whose timer fires at a fraction of the bound (say `boundMs / 10`) passes all six:
  - H1: its 20 ms close beats a 50 ms timer, so nothing is killed.
  - H2 and H3: they kill at 10 ms and settle; nothing checks when the kill came.
  - H4: it kills at 20 ms, and the warning still names 200 ms.

  Only a kill at once is caught (by H1). Suggested handling: add the boundary case. A close settling at about 80% of
  the bound (for example 400 ms of a 500 ms bound) must return with nothing killed, reported or noted, and `settled()`
  true. This needs no clock lower bound. The alternative is for H2's injected killer to record when it was called,
  asserted to be no earlier than the bound minus a small tolerance (say 90 ms of 100). Either way, through the design
  table and the design review.
- **K2 (low, wording) - G2's handling row names the second failure.** "A main-only kill fails H4 at its 3 s check":
  `plant-helper-2.txt` shows the 5 s test timeout first, and the 3 s check failing only after the `afterEach` hook ended
  the group. Suggested handling: correct the row.

### Document sync

Facts changed in the range: H2-H4's assertions and H4's set-up (the design rows and the Resource reuse section match);
the `started` bookkeeping (the H4 row says so); G6 and G7 (the checklist has both). `CONTEXT.md` and the helper's header
are untouched by the range and still match the helper. New sync items from this round, none in the document sync
checklist yet: the design table and this record for K1 (when the case or assertion is added), and K2's wording; the task
list should note that the full gateway is run again before delivery, as `close-app.spec.ts` changed after f2d71e4. A fix
passing its tests does not mark any of them synced.

### Commands (this round)

| Command | Exit code |
|---|---|
| `git status`, `git log --oneline 76b23b6..HEAD`, `git show --stat` of 3da7bd1 | 0 |
| `git diff 76b23b6..3da7bd1 -- e2e/close-app.spec.ts`; the records' diff (to a file) | 0; 0 |
| `git rev-parse` / `git hash-object` for the spec and the helper; `git diff --name-status 76b23b6..3da7bd1` | 0 |
| `git diff --stat f2d71e4 3da7bd1 -- . ':(exclude)docs/.workings'` | 0 |
| `rg -uu -l "close-app\.spec"` and the control `rg -uu -l "from '\./close-app'"` (exclusions as above) | 0; 0 |
| `pgrep -fl` for H4's process shape, before and after the run | 1; 1 (none) |
| `pnpm -s exec playwright test e2e/close-app.spec.ts --repeat-each=5` (output to a file) | 0 (30 passed) |
| `git add -f` this record, then `pnpm check:lang` (output to a file), twice | 0; 0 |

## Handling of the third incremental check's findings (implementing session, 2026-10-24)

| # | Handling |
|---|---|
| K1 | New H7 (design row and its incremental review above): a close that finishes at 400 ms of a 500 ms bound returns with nothing killed, reported or noted, and settled. A timer at a tenth or at 70% of the bound turns H7 red, and only H7 (`evidence/ticket-227/plant-helper-3.txt`) |
| K2 | G2's handling row corrected: the planted main-only kill fails H4 by its 5 s timeout first, then its 3 s check |

Targeted verification: `evidence/ticket-227/targeted-4.txt` (typecheck, lint, the retrieval as before, the helper's seven cases five times over: 35 passed; `TARGETED_EXIT=0`). The full gateway is re-run on this commit before delivery.

## Post-implementation check, incremental (2026-10-24, 3be7524; fix range 3da7bd1..3be7524)

Performed by the same independent agent as the earlier rounds, which did not inherit the implementing conversation.
Ticket: #227. Mutation testing: per the project capability declaration, mutation-testing is not enabled; this item is
skipped. The planted faults in `plant-helper-3.txt` were the implementing session's; this check reads them as evidence
only.

### Scope, as retrieved

- Changed in the range (`git diff --name-status 3da7bd1..3be7524`): `e2e/close-app.spec.ts` (H7 added; H1-H6 unchanged);
  work records and evidence under `docs/.workings/e2e-teardown/`. The helper `e2e/close-app.ts` is unchanged (blob
  6f3400b), so no test depends on changed helper code, and the seven E* files are out of scope.
- Files naming the changed test file (`rg -uu -l "close-app\.spec"`, `node_modules/`, `out/` and `docs/.workings/`
  excluded): only `tsconfig.node.tsbuildinfo`. Control: `from './close-app'` occurs once in each of the eight files
  (`close-app.spec.ts` and the seven E* files). Test data changed: none.
- Rows of the test design table changed in the range: H7 added; no other row changed.
- Carried over: H1-H6 from the previous round (2026-10-24, 3da7bd1), their code unchanged; E* from the first round
  (2026-10-23, 580b426) and the incremental round of 2026-10-24 on 76b23b6.

### Run evidence

- Targeted log [targeted-4.txt](evidence/ticket-227/targeted-4.txt): HEAD 3da7bd1 with `close-app.spec.ts` 7d10a91 in the
  tree, the blob 3be7524 committed; typecheck and lint exit 0; the retrieval, each grep's own exit code logged directly
  (0, 0); the seven cases five times, 35 passed, `TARGETED_EXIT=0`.
- Full gateway: the latest completed run, [gateway-f2d71e4.txt](evidence/ticket-227/gateway-f2d71e4.txt), predates the
  changes to `close-app.spec.ts` since f2d71e4 (`git diff --stat f2d71e4 3be7524` outside `docs/.workings/`: that file
  only). The gateway on 3be7524 was running in this worktree during the check (its log had reached `pnpm e2e`, 155 cases)
  and is not used here. This section was written and staged only after that run had passed its file-scanning gates
  (`check:lang`, `check:i18n`, `check:nul`), so that it does not change what those gates read.
- This check ran the seven cases five times with `--output` in a scratch folder, so as not to touch the `test-results/`
  of the gateway's e2e then running in the same worktree: 35 passed; no process of H4's shape before or after
  (`pgrep -fl`: none); the tree clean.

### Test design table against the written tests (the changed row)

| # | Matches the row | Notes |
|---|---|---|
| H7 | yes | `standIn(400)`, bound 500 ms, killer and sink injected; asserts `killed` and `reported` empty, the annotations unchanged and `settled()` true; no clock reading |

Test file header (`close-app.spec.ts:1-4`): its list of the stand-in cases, "H1–H3, H5 and H6", leaves out H7 (L1).

### The previous round's findings, as handled

| # | Verified |
|---|---|
| K1 | yes: H7 is the boundary case. A timer at a tenth or at 70% of the bound fails H7 alone, at `expect(killed).toEqual([])` (line 140; `plant-helper-3.txt`, killed `[1073741824]`, the stand-in's pid); H1-H6 stay green under both, which confirms that H7 is the only guard of the bound's lower side |
| K2 | yes: G2's handling row now names the 5 s timeout first, then the 3 s check |

### Coverage

Finding L1 (wording only). H7's input, a close at 80% of the bound, reaches the branch it claims: an early timer wins the
race and kills, a correct timer loses to the close. What is left uncovered is a kill between 80% and 100% of the bound,
and the H7 row states this ("below 0.8"); it is the margin the timers need.

### Case design

No finding. H7 is a stand-in case like H1: no project module mocked, no process signalled (pid 2^30), no shared state.

### False greens

No finding. H7 goes red when the helper kills before 400 ms of a 500 ms bound (`killed` not empty), reports or notes
without a kill, or returns before the close settles (`settled()` false). It is not timing-fragile under load:
- The close's timer is created before the bound's, and falls due 100 ms earlier.
- If both are overdue at once, Node runs expired timers in the order they fall due and drains promise callbacks after
  each one. The close's resolution therefore reaches the race, and the bound's timer is cleared, before the bound's
  callback can run.

A helper that waited the whole bound regardless of the close would pass H7, but H1 catches it (`took < 500`).

### Resource reuse

No finding. H7 launches nothing (about 400 ms per run). Counted from the targeted log: five H4 process groups in 35 cases,
no app launch, no build.

### Findings

- **L1 (low, wording) - two lists of the cases leave out H7.**
  - `close-app.spec.ts:1` says "H1–H3, H5 and H6 launch no app: a stand-in ... with the group killer and the report
    sink injected"; H7 is one of those.
  - The design review's Resource reuse section ("H1–H3, H5 and H6 launch nothing; H4 starts two node processes") also
    leaves out H7.

  Suggested handling: add H7 to both. Changing the header comment is a test-file change, so it goes with the delivery
  gateway's rules: a comment-only change needs the syntax-tree comparison recorded, or the full run again.

### Document sync

Facts changed in the range: H7 (its design row and incremental review match the code; L1 for the two lists); K2's
wording (corrected); the task list's 5h (states H7, K2, the targeted run and the gateway re-run on the delivered commit).
`CONTEXT.md`, the helper and its header are untouched by the range. New sync items from this round, none in the document
sync checklist yet: L1's two lists. The full gateway on 3be7524, still running at the time of this check, remains
the delivery gate. A fix passing its tests does not mark anything synced.

### Commands (this round)

| Command | Exit code |
|---|---|
| `git log --oneline 3da7bd1..HEAD`, `git show --stat` of 3be7524, `git diff --name-status 3da7bd1..3be7524` | 0 |
| `git diff 3da7bd1..3be7524` of the test file, the task list and this record (the last to a file) | 0 |
| `git rev-parse` / `git hash-object` for the spec and the helper; `git diff --stat f2d71e4 3be7524 -- . ':(exclude)docs/.workings'` | 0; 0 |
| `rg -uu -l "close-app\.spec"`; the control `rg -uu -c "from '\./close-app'"` (exclusions as above) | 0; 0 |
| `rg -n "^## \|Running [0-9]+ tests\|passed\|VERIFY_EXIT"` over the running gateway's log, to see its stage | 0 |
| reading `scripts/quiet-electron.sh` (the global setup's copy is a no-op once made) | 0 |
| `pgrep -fl` for H4's process shape, before and after the run | 1; 1 (none) |
| `pnpm -s exec playwright test e2e/close-app.spec.ts --repeat-each=5 --output=<scratch>` (output to a file) | 0 (35 passed) |
| `git add -f` this record, then `pnpm check:lang` (output to a file), twice | 0; 0 |

## Handling of the fourth incremental check's finding (implementing session, 2026-10-24)

| # | Handling |
|---|---|
| L1 | H7 added to both lists: the test file's header and the design review's Resource reuse section. The header is a comment, so the full gateway on 3be7524 (`evidence/ticket-227/gateway-3be7524.txt`, `VERIFY_EXIT=0`) stands for the changed file: the syntax trees with comments removed are identical, the comment is read by no tool but lint, and lint passes (`evidence/ticket-227/comment-only.txt`). No test's executable content changed, so no further check follows |
