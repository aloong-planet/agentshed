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
| H2 | as H1, new (amended twice: below, and after the post-implementation check): a close that outlasts the bound kills the app's process group, reports and notes it, and returns only once the close has settled | as H1 | as H1 | a `close()` that settles 150 ms after the killer is called (as Playwright's does once the group's pipes close); a bound of 100 ms | the killer called once, with the stand-in's pid; the sink called once with a note naming the bound; one annotation of type `teardown`; the call returns at least 250 ms after it started (bound plus settle) and within 1.5 s. Values: the inputs and the helper's documented note | as H1 | none |
| H3 | as H1, new (added from the code review; amended after the post-implementation check): a group already gone when the bound passes is no error, and nothing is reported or noted | as H1 | as H1 | a `close()` that settles 150 ms after the killer is called; a killer that then throws as `process.kill` does for a group that no longer exists (`code: 'ESRCH'`); a bound of 100 ms | the killer called with the stand-in's pid; the call returns without an error, only after the close has settled; the sink not called; no annotation added. Values: the inputs | as H1 | none |
| H4 | e2e, new (from the post-implementation check, F1): the default killer ends a real process group whose member still holds the pipes | as H1 | as H1, with the default killer, on processes the case starts itself | a detached node parent with piped stdio whose child inherits its stdout and keeps running; the stand-in's `close()` settles on the parent's `close` event (as Playwright's launcher does); a bound of 200 ms | the call returns within 3 s; the parent ended by SIGKILL. Killing the parent alone leaves the child holding the pipe, so `close` never comes and the case times out. Values: the inputs; the parent's exit signal from Node | two node processes the case spawns and, whatever happens, kills in its `finally` | two node processes, started and ended by the case (about 100 ms) |
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

- H1 and H2 launch nothing. The 72 sites add no launch.

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
| F9 | The trace: not added (D3 in the task list). The full run under load: run after this commit, recorded in the task list |
