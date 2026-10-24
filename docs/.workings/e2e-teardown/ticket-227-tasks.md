# Ticket #227 — task list

The startup-skeleton e2e case can time out in a full run under heavy load. Working record, not a requirement
authority. The change is to the e2e harness, which no spec describes; the rule it settles goes to `CONTEXT.md`.
Branch `fix/skeleton-case-teardown`, in its own worktree, cut from `origin/main` at 1349d76 (no commits ahead when
cut).

## Facts found before deciding (2026-10-23)

- Reproduced (`evidence/ticket-227/reproduction.txt`), with a throwaway copy of the case that logs when its body ends and
  how long `app.close()` takes:
  - no load, five runs: the body done 4.7–8.7 s after launch, `app.close()` 41–71 ms;
  - eight busy processes (load about 16), ten runs: the body 4.8–5.0 s, `app.close()` 56–117 ms;
  - sixteen busy processes (load 28–78, then 249 as closes hung): the body still 4.8 s every time, `app.close()` 3.2 s,
    22.5 s, then not returning: five runs of seven hit the 60 s test timeout in teardown. The issue's symptom, and the
    issue's inference that the time went after the fill, both confirmed.
- Where the time goes (`evidence/ticket-227/probes.txt`), with tagged logs in the main process (a probe, restored):
  - the app's own quit takes about 15 ms from the close: `before-quit`, the display cache's flush (one pass, 1 ms),
    `will-quit` and the process's `exit` event, in that order, in every run, including those whose close took 7.8 s,
    18 s, 25 s and 86 s. The flush does not loop and nothing in the main process's JavaScript waits;
  - no "Waiting for the debugger to disconnect" line appears; the inspector ends at once ("Debugger ending");
  - polling the process during a 3.1 s close: still running (`ps` state `Rs`) with two helper children at 258 ms, still
    running with none at 2,050 ms. So after its JavaScript has exited, the Electron process keeps working at its native
    shutdown, and under CPU load that takes seconds to minutes;
  - Playwright's `ElectronApplication.close()` closes the browser context, which ends in the launched process's graceful
    close; that waits for the process to exit, with no bound (`playwright-core` 1.62.0, `lib/coreBundle.js`).
- The same unbounded wait is in every e2e teardown: 72 sites in seven files, found by listing every `.close(` in `e2e/`
  (`rg -n "\.close\(" e2e`): 67 `app.close()` / `l.app.close()`, four `app?.close().catch(() => {})`, one
  `probe.close()`.

## Decisions

| # | Decision | Answer |
|---|---|---|
| D1 | How far the bounded teardown reaches | Every e2e teardown, through one shared helper (the owner's answer on 2026-10-23, "all 67", in Chinese, the recommended answer; the full listing found 72, the same class). The first module shared across e2e files: a new convention, chosen with the scope |
| D3 | The issue's first proposal, keeping a trace or the main process's output for a failed case | Not added (implementing agent): it was a means to pin the stuck step, which the reproduction and the probes pinned (`probes.txt`); the bound's warning names the bound and the pid, which is the visibility the issue asked for. A trace of an Electron app adds recording to every case for a failure the helper now ends |
| D2 | The bound | 10 s (implementing agent): a normal close takes under 0.2 s, and a case's 60 s budget keeps room for its body under load. On the bound the process is killed (SIGKILL), the case is annotated and a warning printed, so a slow close is visible instead of eating the budget |

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Feedback loop: reproduce the timeout and pin the stuck step | `evidence/ticket-227/reproduction.txt`, `probes.txt` | done |
| 2 | Records declared on #227 and its document sync checklist | `ticket-227-doc-sync.md`, the issue body | done |
| 3 | Test design review | `ticket-227-review-tests.md`, Design review | done (H2 amended for the group kill, H3 added from the code review) |
| 4 | Slices: S1 the helper (bounded close, kill, note); S2 every teardown through it; the loop under load again | the helper's cases red then green; the loop's closes bounded | done: H2 red against an unbounded close, then green (`helper-cases-first.txt`); the loop with a main-only kill still had closes of 28–69 s and two timeouts (`after-main-kill.txt`), so the helper kills the group, and the loop passes seven of seven with every close at 10.0 s (`after-group-kill.txt`). (The H2 red recorded then, `TypeError: app.process(...).kill is not a function`, came from the stand-in losing its `kill`, not from a main-only kill; after the post-implementation check H4 is the case that a main-only kill turns red, `plant-helper.txt`); 72 sites moved, none left; targeted run `targeted.txt` (150 e2e, `TARGETED_EXIT=0`, on the change before H3) |
| 5 | Code review | `ticket-227-review-code.md` | done: H3 (a group already gone) fixed red first; the header's claim narrowed to what was measured |
| 5b | Full gateway | `evidence/ticket-227/gateway-580b426.txt` | done: `VERIFY_EXIT=0` on the clean tree of 580b426 (867 unit, 109 site, 151 e2e, smoke OK); the only kill noted is the helper's own stand-in case |
| 5c | Independent post-implementation test check | `ticket-227-review-tests.md` | done: nine findings (F1–F9), handled (the record's handling section): H4–H6 added, H1–H3 sharpened, the report sink injected; planted faults on the helper each red where expected (`plant-helper.txt`); targeted run `targeted-2.txt` (`TARGETED_EXIT=0`); the full gateway again on f2d71e4, `VERIFY_EXIT=0` (867 unit, 109 site, 154 e2e, smoke OK; `gateway-f2d71e4.txt`). The incremental check of 0e6d642..the commit recording that gateway is handed to the same independent agent |
| 5g | The incremental check's findings G1–G7 | `ticket-227-review-tests.md`, handling section | G1–G5 handled in the cases and records, G7 a Waiting item, G6 the owner's decision; planted faults `plant-helper-2.txt`, targeted run `targeted-3.txt` (`TARGETED_EXIT=0`); a further incremental check next |
| 5h | The third incremental check's findings K1, K2 | `ticket-227-review-tests.md`, handling section | K1: H7 added, red under an early kill (`plant-helper-3.txt`); K2: wording corrected; targeted run `targeted-4.txt` (`TARGETED_EXIT=0`); a fourth incremental check, and the full gateway re-run on the delivered commit |
| 5i | The fourth incremental check's finding L1; the full gateway on the delivered code | `ticket-227-review-tests.md`, handling section; `evidence/ticket-227/gateway-3be7524.txt` | L1: H7 added to both lists (a comment and a record; `comment-only.txt`); gateway on 3be7524 `VERIFY_EXIT=0` (867 unit, 109 site, 155 e2e, smoke OK, no close reached the bound) |
| 5e | The issue's acceptance: a full run under comparable load no longer times out in teardown (F9) | `evidence/ticket-227/full-run-under-load.txt` | done, on 24807a5: the whole suite with 4, 8, 10 and 12 busy processes. At load 9–14 and 19–34 all 154 passed with no close reaching the bound; the issue's 35–70 was not held steady, since the next step up (10 busy) ran away to a mean of 195, where all 154 passed and 164 closes were ended at the bound. At 12 busy (load up to 268) all 154 passed too, and Playwright's own worker teardown then exceeded 60 s after the last case — outside any case, not seen at 10 busy under the same load, and recorded rather than chased |
| 5f | CI: the cases repeated | a throwaway branch's run | done: draft PR #306 (never merged), run 39972027006 with this branch at 580b426, before the post-implementation check's changes to the helper and its cases: the two startup-skeleton cases twenty times, 40 passed, and the helper's cases ten times (`ci-repeat-39972027006.txt`). The skeleton cases' teardown is unchanged by those changes |
| 5d | Step 7 (CONTEXT's invariant), step 8 | the records, `final-regression.md` | CONTEXT's invariant done (24807a5); step 8 done (`final-regression.md`, 2026-10-24) |
| 7 | PR; stop for the owner | PR link | |
