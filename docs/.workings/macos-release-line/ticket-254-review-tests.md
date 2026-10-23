# Test review — #254

Ticket: [#254](https://github.com/aloong-planet/agentshed/issues/254) (the app-update case that waits to read the
download at 0%). Task list: [ticket-254-tasks.md](ticket-254-tasks.md).

## Design review (2026-10-23, implementation starts from 1349d76)

Scope: the tests this change adds or changes — three unit cases for the scripted update source's first-step hold, and
two app-update e2e cases that take it. Spec: [app-update](../../specs/app-update.md). Mutation testing: by the project
capability declaration, mutation-testing is not enabled, so it is skipped; each test's "when does it go red" is answered
below. The issue's own acceptance asks for one planted fault (the open message no longer follows the progress); that is
acceptance evidence, run once, not mutation testing.

### Test design table

| # | Test | Spec item | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| U1 | unit, new: a found update holds at its first step while the script says so, and moves on once rewritten without it | Testing Decisions, the scripted source for e2e (a technical prerequisite of #254, not a coverage unit) | `scriptedUpdateSource(script)`, exported | script `{check: 'found', steps: [0, 40, 100], stepMs: 5, download: 'complete', holdFirstStep: true}`; 150 ms later (three hold polls) the same script without the field | the progress values reported and whether the download has settled: `[0]` and unsettled after 150 ms, then `[0, 40, 100]` and resolved; literals from the script | the seam's own JSON, written by the test; no external data | none: a temporary directory per case, milliseconds |
| U2 | unit, new: a script caught mid-rewrite (unreadable) keeps the download held | as U1 | as U1 | while held, the script written as `{not js`; 150 ms later a valid script without the field | `[0]` and unsettled after the unreadable write; then resolved with all steps; literals | as U1 | as U1 |
| U3 | unit, new: a held download that is cancelled fails | as U1; the controller cancels the download of a malformed version (Failures A6, H1) | as U1, plus the returned `cancel` | script with `holdFirstStep: true`; `cancel()` while held | the download rejects; the source's contract (a cancelled download throws) | as U1 | as U1 |
| U4 | unit, new (added in the cycle, reviewed as below): a download whose own script did not ask for the hold is not held by a later script that does | as U1 | as U1 | script `{check: 'found', checkMs: 100, steps: [0, 40, 100], stepMs: 5, download: 'complete'}`; 20 ms into the check, the script rewritten with `holdFirstStep: true` (the next check's script) | the download settles within 1 s with all three steps; literals | as U1 | as U1 |
| E1 | e2e, changed: "an open message follows the progress of the download and stays anchored to the slot" | app-update::REQ-001/AC-04 | the app through its real IPC and renderer, with the scripted source (spec seam) | script `{check: 'found', steps: [0, 20, 40, 60], stepMs: 100, download: 'hold', holdFirstStep: true}`; after the tip's first place is read, the script rewritten without the field | the slot reads `0`; the tip reads "Downloading update 0%", then "Downloading update 60%" while still open; the tip's place equal before and after. Values: the script's steps and the English copy | the seam's own JSON | one built app per `pnpm e2e` (electron-vite build, then Playwright); one Electron launch for this case, with its own userData and home as every case in the file |
| E2 | e2e, changed: "a failed automatic check and a failed background download show nothing" (its second launch) | app-update::REQ-002/AC-01, AC-02 | as E1 | second launch's script `{check: 'found', steps: [0, 30], stepMs: 100, download: 'fail', holdFirstStep: true}`; after the slot shows, rewritten without the field | the slot visible, then gone within 5 s; no toast. Values: the spec ("shows nothing") | as E1 | as E1; two launches, as before |

Incremental review of U4 (2026-10-23, before writing it): found while reading the staged change — the hold re-read the
script for every download, so a download whose script never asked for it could be held by a later script, or forever
if the script went away. The row names its input, its assertion from literals, no fixture beyond the seam's JSON and no
expensive resource; it isolates like U1–U3. The checks below hold for it as stated.

### Coverage

- The change keeps the same spec units: E1 still drives REQ-001/AC-04 (the open message follows the download and stays
  anchored), E2 REQ-002/AC-01 and AC-02. What it changes is when the download moves: on the case's release, not on a
  timer started before the window shows.
- The branch each case claims, and the input that drives it: E1's "follows the progress" is driven by the release —
  steps 20, 40 and 60 arrive while the tip is open, and the tip must read 60%. E2's "a failed download shows nothing"
  by `download: 'fail'` after the release. U1–U3 each name their input in the table.
- The race this ticket is about, across the e2e that uses timed downloads: enumerated in the task list (Facts). Two cases
  have a margin inside the window's normal appearance time; both take the hold (E1, E2). Six more have the same pattern
  with 1.1–2 s of margin (`menu-check-updates.spec.ts:133`, `:149`, `settings-updates.spec.ts:173`, `:234`, `:421`,
  `:537`). Not changed here:
  - impact: under heavy load (load averages of 35–70 have been recorded on this machine, #227) any of them can fail the
    same way;
  - recommendation: convert them to the hold in a ticket of their own, since each is a different flow and the hold makes
    `:421`'s "turning it off during a download" certain to happen during the download;
  - destination: none in the repository yet. The owner decides whether it becomes a ticket. For new cases, the spec's
    Testing Decisions will say that a case which must see a step holds the download (step 7).
- Gaps: none new. The file header's gap (the real updater path) is unchanged.

### Case design

- No module of the project is mocked; nothing private is cast or written. The script is the fake external feed's own
  input, rewritten through the channel the seam documents ("reads its script at every request"); the hold extends that
  reading to the held step.
- Each case is isolated: its own temporary home, userData and script.
- The cases drive the target behaviour and assert its effect: progress values and settlement (U1–U3); the slot, the
  tip's text and place (E1); the slot's going and the absence of a toast (E2).
- Reachable state: every state comes through the seam's public input; the held step is a state the real download also
  has (a step that has not moved on yet).

### False greens (design-level)

- Constant-true: U1 and U2 assert the held state after 150 ms, three polls of the hold, so a hold that is not honoured
  would have reported 40 and 100 by then (5 ms steps). E1's "same place" compares two reads around a change the case
  first waits for (60%), so an open message that never updated fails at 60% before the place is compared.
- Tautology: every expected value is a literal from the script or the English copy; none is recomputed or imported.
- Stale path: `aria-valuenow`, the tip and the toast are what the app renders today (`UpdateSlot.tsx`); the scripted
  source is the one e2e reads (`chooseUpdateSource`).
- Read too early or late: each wait polls the very expression it asserts (`toHaveAttribute`, `toHaveText`,
  `toHaveCount`).
- When each goes red:
  - U1, if the hold is ignored (steps before the release) or the release is ignored (the download never settles: the
    case times out);
  - U2, if an unreadable script is taken as a release, or as a failure;
  - U3, if a held download ignores its cancellation;
  - U4, if the hold is read from whatever the script says now rather than from the script the check answered from: the
    download under way would be held by the next check's script;
  - E1, if the open message stops following the progress — to be shown by the issue's planted fault, the tip's text
    fixed at 0% — or if the hold does not hold, which the late-observer loop shows: the case with a 3 s wait before its
    first read passes, and the old case with the same wait fails;
  - E2, if a failed download leaves the slot or shows a toast, or if the slot never shows.

### Resource reuse

- Shared setup searched first: `rg -n "globalSetup|beforeAll|electron.launch" e2e/app-update.spec.ts playwright.config.ts`
  shows the file has no shared launch: one launch per case (`:41`), and one build per run (the `pnpm e2e` script builds
  before Playwright; `globalSetup` only points Electron at its quiet copy on macOS). E1 and E2 follow that: E1 one launch, E2 two, unchanged in number. A launch cannot be shared, since
  each case needs its own script and userData.
- Unit cases: a temporary directory each, created and removed in milliseconds; not expensive.
