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
| U2 | unit, new: a script caught mid-rewrite (unreadable) keeps the download held | as U1 | as U1 | while held, the script written as `{"check":"fou` (a valid script cut short; an empty file, the more common mid-write read, takes the same `catch`); 150 ms later a valid script without the field | `[0]` and unsettled after the unreadable write; then resolved with all steps; literals | as U1 | as U1 |
| U3 | unit, new: a held download that is cancelled fails | as U1; the controller cancels the download of a malformed version (Failures A6, H1) | as U1, plus the returned `cancel` | script with `holdFirstStep: true`; `cancel()` while held | the download rejects; the source's contract (a cancelled download throws) | as U1 | as U1 |
| U4 | unit, new (added in the cycle, reviewed as below): a download whose own script did not ask for the hold is not held by a later script that does | as U1 | as U1 | script `{check: 'found', checkMs: 100, steps: [0, 40, 100], stepMs: 5, download: 'complete'}`; 20 ms into the check, the script rewritten with `holdFirstStep: true` (the next check's script) | the download settles within 1 s with all three steps; literals | as U1 | as U1 |
| E1 | e2e, changed: "an open message follows the progress of the download and stays anchored to the slot" | app-update::REQ-001/AC-04 | the app through its real IPC and renderer, with the scripted source (spec seam) | script `{check: 'found', steps: [0, 20, 40, 60], stepMs: 100, download: 'hold', holdFirstStep: true}`; after the tip's first place is read, the script rewritten without the field | the slot reads `0`; the tip reads "Downloading update 0%", then "Downloading update 60%" while still open; the tip's place equal before and after. Values: the script's steps and the English copy | the seam's own JSON | one built app per `pnpm e2e` (electron-vite build, then Playwright); one Electron launch for this case, with its own userData and home as every case in the file |
| E2 | e2e, changed: "a failed automatic check and a failed background download show nothing" (its second launch; amended by the incremental review below) | app-update::REQ-002/AC-01, AC-02 | as E1, plus the toast recorder and the menu item's own click handler, copied from `menu-check-updates.spec.ts` | second launch's script `{check: 'found', steps: [0, 30], stepMs: 100, download: 'fail', holdFirstStep: true}`; the recorder attached while held; after the slot shows, rewritten without the field; once the slot has gone, the script set to `{check: 'upToDate'}` and the menu item clicked | the slot visible, then gone within 5 s; then the toasts recorded since the hold are exactly `ok: Agentshed is up to date (<version>)`. Values: the spec ("shows nothing") and the menu check's English copy; `<version>` read from the app | as E1 | as E1; two launches, as before |
| U5 | unit, new: a check can stay in flight while the script says so, and answers once rewritten without it | as U1 | as U1 | script `{check: 'upToDate', holdCheck: true}`; 150 ms later the same script without the field | the check unsettled after 150 ms, then answering "no update" (`null`); literals | as U1 | as U1 |
| U6 | unit, new: a check whose own script did not ask for the hold is not held by a later script that does | as U1 | as U1 | script `{check: 'upToDate', checkMs: 100}`; 20 ms into the check, rewritten with `holdCheck: true` | the check answers within 1 s; literals | as U1 | as U1 |
| E2a | e2e, changed: the first launch of the same case (a failed automatic check shows nothing) | app-update::REQ-002/AC-01 | as E2 | script `{check: 'fail', holdCheck: true}` at launch; the recorder attached; then rewritten without the field; once the lifecycle is idle again, `{check: 'upToDate'}` and the menu item clicked | the slot absent; the toasts recorded since the window listened are exactly `ok: Agentshed is up to date (<version>)`. Values: the spec ("shows nothing") and the menu check's copy | as E1 | as E1 |
| E9 | e2e, changed: "UI language: a stored preference naming a removed language reads as follow system" | i18n::REQ-003 | the app with a stored preferences file (unchanged) | the stored language `fr`, as before | after the window's checks, the toasts counted once, not retried: zero. Values: the spec ("with no notice") | a real preferences file's shape, as before | one launch, unchanged |
| E3 | e2e, changed: "a menu check that finds an update starts the download, and a failed download adds no second toast" | app-update::US-003/AC-03, Failure B2 | the app with the scripted source; the menu item's own click handler; the file's toast recorder (all unchanged) | script `{check: 'found', steps: [0, 20, 40], stepMs: 50, download: 'fail', holdFirstStep: true}` before the menu click; after the toast and the progress bar, rewritten without the field; once the slot has gone, `{check: 'upToDate'}` and a second menu click (in place of an 800 ms wait) | the recorded toasts: the "found — downloading" toast, then the slot gone within 10 s, then exactly `[found, up to date (<version>)]`. Values: the menu check's copy, `<version>` read from the app | the seam's own JSON | one launch, unchanged |
| E4 | e2e, changed: "a menu check while an update downloads, is ready or installs reports that state and makes no request" | app-update::US-003/AC-04 | as E3 | launch script `{check: 'found', steps: [0, 40, 80, 100], stepMs: 50, download: 'complete', install: 'hold', holdFirstStep: true}`; released after the menu check has reported the download | the toasts "found — downloading", "ready to install", "Installing update…" in turn, and the request log `['check', 'install']`; copy and the script | as E3 | as E3 |
| E5 | e2e, changed: "the download finishing turns the same button into Install now…" | app-update::REQ-003/AC-04, C10, C11, CON-004 | the app with the scripted source; the settings section (unchanged helpers) | launch script `{check: 'found', steps: [0, 40, 80, 100], stepMs: 50, download: 'complete', install: 'hold', holdFirstStep: true}`; released after the button's element handle is taken | as before: the line "is downloading", "Check now" unavailable, then the same element relabelled "Install now", one install; copy and the script | as E3 | as E3 |
| E6 | e2e, changed: "a settings up to date, then an automatic check finds an update: the line follows it, and after a failed download it is empty" | app-update::REQ-004/AC-02, D5, B2 | as E5, plus the wake path (unchanged helper) | script `{check: 'found', steps: [0, 20, 40], stepMs: 50, download: 'fail', holdFirstStep: true}` before the wake; released once the line reads "is downloading" | as before: the line follows the download, then empty; the slot gone; "Check now" available; three requests; copy and the script | as E3 | as E3 |
| E7 | e2e, changed: "turning it off during a download neither cancels it nor discards the ready update" | app-update::US-002/AC-03, B5 | as E5 | launch script `{check: 'found', steps: [0, 30, 60, 100], stepMs: 50, download: 'complete', install: 'hold', holdFirstStep: true}`; released once the switch is stored off | as before: the switch stored off while the line reads "is downloading", then "ready to install" and the rail's "Update available"; copy and the script | as E3 | as E3 |
| E8 | e2e, changed: "the labels and the result line stay on one line in every UI language and every state of the line" (zh and en) | app-update::QR-001/AC-02 | as E5 | the checking state: `{check: 'upToDate', holdCheck: true}` before "Check now", released once that state is measured (was `checkMs: 1500`); the downloading state: `{check: 'found', version: '10.10.10-beta.12', steps: [0, 50, 100], stepMs: 50, download: 'complete', install: 'hold', holdFirstStep: true}` before "Check now", released once that state is measured | as before: each state's measured line counts; copy and the script | as E3 | as E3, per language |
| E10 | e2e, changed: "Check now shows checking with the button unavailable, then up to date or the failure; a malformed answer is a failure" | app-update::US-003/AC-02, D2, A6 | as E5 | `{check: 'upToDate', holdCheck: true}` before the click (was `checkMs: 1500`); released after the forced click on the unavailable button, which sends nothing (`UpdatesSection.tsx:67`–`:71`) | as before: "Checking…" with the button unavailable, then "You're up to date"; two requests; copy and the script | as E3 | as E3 |
| E11 | e2e, changed: "the line survives leaving settings mid-check and follows a language switch; a restart starts empty" | app-update::REQ-004/AC-03, D6, G2 | as E5 | `{check: 'upToDate', holdCheck: true}` before the click (was `checkMs: 1500`); released once the settings section has gone | as before: the outcome arrives while away and the line shows it on return; copy | as E3 | as E3; two launches, as before |
| E12 | e2e, changed: "a settings check during the launch check joins it: one request, its outcome reported" | app-update::US-003/AC-05, D3 | as E5 | launch script `{check: 'upToDate', holdCheck: true}` (was `checkMs: 2500`); released once the line reads "Checking…", which the main process publishes on the joined click | as before: "Checking…", then "You're up to date"; one request; copy | as E3 | as E3 |
| E13 | e2e, changed: "menu and settings checks in quick succession join into one request, each surface reporting in its own form" | app-update::US-003/AC-05, D4 | as E3 | first `{check: 'upToDate', holdCheck: true}` (was `checkMs: 1500`), released after the menu click, which runs in the main process; then `{check: 'fail', holdCheck: true}`, released after the settings click and a `getSettingsCheck` round trip from the same window, which the main process answers after the click's own request | as before: each surface's report, the toasts and three requests; copy | as E3 | as E3 |

Incremental review of U4 (2026-10-23, before writing it): found while reading the staged change — the hold re-read the
script for every download, so a download whose script never asked for it could be held by a later script, or forever
if the script went away. The row names its input, its assertion from literals, no fixture beyond the seam's JSON and no
expensive resource; it isolates like U1–U3. The checks below hold for it as stated.

Incremental review of E2–E8 (2026-10-23, before changing them). The owner decided on 2026-10-23 (answering "into #254's PR", in Chinese) that the six cases with wider margins and F2 (the post-implementation check below) are handled here.
The rows name their inputs, their assertions from literals and copy, the seam's JSON as fixture and no new launch.
Each case keeps its spec units and its assertions; what changes is when the download moves (on the case's release) and,
for E2 and E3, how "no toast" is read (against a later notice instead of at an instant or after a fixed wait). With the
hold, the steps no longer need to last long: they run 50 ms apart once released. The checks below hold for these rows as
stated in the Coverage, Case design and False greens additions. The cases' sizes and launches are unchanged.

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
  `:537`). First recorded here as not changed, with a recommendation of a ticket of its own; the owner decided on
  2026-10-23 to handle them in this change (E3–E8). The hold also makes `:421`'s "turning it off during a download"
  certain to happen during the download. For new cases, the spec's Testing Decisions say that a case which must see a
  step holds the download (step 7).
- "No toast" read at an instant or after a fixed wait (F2, from the post-implementation check), every such read in the
  three update e2e files (`rg -n "toast|waitForTimeout" e2e/app-update.spec.ts e2e/menu-check-updates.spec.ts
  e2e/settings-updates.spec.ts`), four:
  - `app-update.spec.ts:289` (E2, at once after the slot goes) and `menu-check-updates.spec.ts:139`–`:140` (E3, after
    800 ms): changed to a later notice. Notices reach the window in order on one channel (`sendUpdateNotice`,
    `src/main/index.ts:577`–`:580`), so a notice the failure sends comes before the menu check's own;
  - `app-update.spec.ts:276`–`:278` (a failed automatic check at launch, after 500 ms): the failure comes before any
    recorder can be attached. First judged here to need no change, since a toast stays 3.2 s (`Toast.tsx:23`); that
    was wrong twice over. A planted toast on the download-failure path (`evidence/ticket-254/plant-notice-old-e2.txt`)
    passed E2's read five runs out of five, each case taking 5.6–6.7 s instead of 2.1 s: `toHaveCount(0)` retries for up
    to 5 s, so it waits for a 3.2 s toast to go and then passes. And a planted toast on the check-failure path
    (`evidence/ticket-254/plant-check-notice.txt`) never shows at all when the scripted check fails at once: the notice
    is sent before the window listens. Counted once, the read stayed green under that plant; with the check taking 2 s,
    the toast shows. So the check is held too (`holdCheck`, U5 and U6) until the recorder is attached, and the read is
    made against a later notice, like E2;
  - `menu-check-updates.spec.ts:239`–`:240` (a development run's click, after 800 ms): unchanged. A development run
    sends no notice at all, so there is no later notice to read against.
  Every retried "no toast" read in e2e, by the same search over `e2e/` (`rg -n "toast[^)]*\)\)?\.(toHaveCount\(0|not\.toBeVisible)|\.toast'\)\)\.toHaveCount\(0" e2e`):
  besides the two above, `app.spec.ts:2371`, `:2394` and `:5508` wait earlier toasts out on purpose (before a new toast,
  before a screenshot), which a retried read is right for; `app.spec.ts:4405` (i18n::REQ-003: a stored preference naming
  a removed language reads as follow system "with no notice") is a negative read and can never be red the same way.
  Changed to one count, not retried, after the case's own checks of the window (row E9).
  The timed check, a second form of the same race: a case that must act while a check is in flight, the check
  answering after `checkMs` from when it was asked. Found while changing E8, which has one. The task list's first
  enumeration searched `checkMs` but classified only the timed downloads; every `checkMs` in e2e (`rg -n "checkMs"
  e2e`), six, each a "Checking…" state or a check to join within 1.5–2.5 s: `settings-updates.spec.ts:119` (E10),
  `:255` (E11), `:282` (E12), `:524` (E8), `menu-check-updates.spec.ts:193` and `:202` (E13). All take the check's hold.
  The "no request" reads after a fixed wait (`app-update.spec.ts:152`, `:205`, `:402`, `settings-updates.spec.ts:163`,
  `:376`, `:406`, `:411`) read a request log, not notices; no later event orders them, and they are not in this change.
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
  - E2, if a failed download leaves the slot, or if the slot never shows; and if it sends a notice, since that notice
    comes before the menu check's own and the recorded toasts are then two;
  - E3, if the menu check's toast or the progress bar is missing, if the failed download leaves the slot, or if it sends
    a notice (as E2);
  - E4–E8, as before for their own assertions; and each depends on the hold where its first read would otherwise come
    after the download has moved on. To be shown by a planted fault: the scripted source ignoring `holdFirstStep`, run
    over the changed cases; a second plant, a failed download sending a notice at once, shows E2 and E3 red at their
    toast read;
  - U5, if the check's hold is ignored (it answers before the release) or the release is ignored (it never answers);
  - U6, as U4 for the check;
  - E2a, if the failed check sends a notice (as E2), shown by plant P3;
  - E9, if a toast is on screen at its read; a toast shown at startup is still there, since it stays 3.2 s. To be shown
    by a planted startup toast, before (green, the retried read) and after (red).

### Resource reuse

- Shared setup searched first: `rg -n "globalSetup|beforeAll|electron.launch" e2e/app-update.spec.ts playwright.config.ts`
  shows the file has no shared launch: one launch per case (`:41`), and one build per run (the `pnpm e2e` script builds
  before Playwright; `globalSetup` only points Electron at its quiet copy on macOS). E1 and E2 follow that: E1 one launch, E2 two, unchanged in number. A launch cannot be shared, since
  each case needs its own script and userData.
- Unit cases: a temporary directory each, created and removed in milliseconds; not expensive.

## Post-implementation check (2026-10-23, 1349d76..e4a86dd)

Ticket #254. Run by an independent agent that did not inherit the implementing conversation; its inputs were the global
instructions, the spec, this record, the commit range and the gateway log. Implementation version: the code and tests
of 22c8ce6. 43451fa and e4a86dd change records only (`git diff --stat 43451fa e4a86dd -- src e2e scripts build
package.json playwright.config.ts`: empty). Scope: the tests this change adds or changes, U1-U4 in
`src/main/update-source.test.ts` and E1, E2 in `e2e/app-update.spec.ts`.

Full-run evidence: [gateway-43451fa.txt](evidence/ticket-254/gateway-43451fa.txt), not re-run. Against the handover:
`git rev-parse HEAD` 43451fa on a clean tree (no file to hash), every command with its full output and its exit code on
a line of its own, `VERIFY_EXIT=0`; since 43451fa..e4a86dd touches only `docs/.workings/`, the code it ran is the code
at the end of the range. Nothing missing.

Mutation testing: by the project capability declaration (`capabilities.toml`, read with a TOML parser), mutation-testing
is not enabled, so it is skipped. Each test's "when does it go red" is answered below from the code under test and the
source of its expected values.

Runs made by this check, only the tests under review, on the clean tree of e4a86dd:

- `pnpm exec vitest run src/main/update-source.test.ts --reporter=verbose -t "can hold at its first step|stays held
  while its script cannot be read|did not ask for the hold|held download that is cancelled"`: exit 0, 4 passed and 9
  skipped, the four passed being U1-U4 by name;
- `pnpm exec electron-vite build`: exit 0;
- `pnpm exec playwright test e2e/app-update.spec.ts -g "an open message follows the progress of the download|a failed
  automatic check and a failed background download" --repeat-each=3`: exit 0, 6 passed (E1 1.6-1.9 s, E2 2.1 s).

### Written tests against the Test design table

| Row | Seam | Driving input | Assertion and expected-value source | Fixture | Resource | Result |
|---|---|---|---|---|---|---|
| U1 | as designed | as designed (`:104`, release `:109` after 150 ms) | as designed (`:107`-`:112`) | as designed | as designed | Matches |
| U2 | as designed | **differs**: the table says the script is rewritten as `{not js`; the test writes `{"check":"fou` (`:121`), a truncated prefix of a valid script | as designed | as designed | as designed | F1 |
| U3 | as designed | as designed (`:144`-`:146`) | as designed, the message `cancelled` (`:147`-`:148`) | as designed | as designed | Matches |
| U4 | as designed | as designed (`checkMs: 100`, rewrite at 20 ms, `:131`-`:136`) | as designed (`:138`-`:139`) | as designed | as designed | Matches |
| E1 | as designed | as designed (hold `:164`, release `:177` after the first place is read) | as designed (`:168`, `:170`, `:178`, `:179`) | as designed | one launch (`:165`) | Matches |
| E2 | as designed | as designed (hold `:283`, release `:287` once the slot shows) | as designed (`:286`, `:288`, `:289`) | as designed | two launches (`:273`, `:284`) | Matches |

Re-review of U2's row with the input the test writes (for F1): it drives the branch the row names. The first
`holding()` call runs inside `check()` before the test writes, so the polls at about 50 and 100 ms read the truncated
file and take the `catch` twice before the 150 ms verdict. A truncated file and an empty one (the more common mid-write
read in `midwrite-read.txt`, 5,400 of 6,599 failed reads) both fail `JSON.parse` and take the same `catch`. Expected
values are literals; no expensive resource. The row passes as amended.

File headers: neither changed, and both stay true. The e2e header's "reads at every request" still holds; the extra
reads while held are stated in the source's doc comment. The unit header lists the production adapter's gaps, which
the hold does not touch.

### Coverage

- Spec units unchanged: E1 app-update::REQ-001/AC-04, E2 app-update::REQ-002/AC-01 and AC-02, both green in the
  gateway on the committed code.
- The branch each case claims and the input that takes execution there, in the written code: E1's "follows the
  progress" by the release at `:177`, after the tip is open (`:170`); E2's failed download by `download: 'fail'` after the
  release at `:287`; U2 as above; U4's "own script did not ask" by the rewrite 20 ms into a 100 ms check, after the check
  has read its script.
- Regression points: every e2e that goes through the scripted source (38 cases, `targeted.txt`) and the full run (148
  e2e) green; a script without the field is guarded by U4 and the existing "reports its progress steps" case.
- The issue's first acceptance item: the planted fault red at the 60% read (`plant-tip-frozen.txt`), and the
  late-observer loops green held and red unheld (`late-observer.txt`, `late-observer-failed-download.txt`). These ran on
  the build before U4's guard; the guard adds a conjunct that is true for both cases' scripts, so the cases ran the same
  path. The committed E1, with its 100 ms steps (the "step time shortened" branch), is green in the gateway.
- The issue's second acceptance item, the CI repetition: not run yet. It is task 9 and an acceptance item on #254;
  outside this check.
- Carried over from the Design review, unchanged: the six cases with 1.1-2 s margins. No decision is recorded at this
  check; it needs the owner's call before delivery, together with F2, which has the same destination.
- Gaps: none new.

### Case design

- No module mock, spy, fake timer, cast or internal write: `rg -c "vi\.(mock|spyOn|fn|useFakeTimers)|jest\."` over the
  two files has no hit (positive control: `rg -c "it\(|test\("` gives 14 hits in each). No skip, `.only` or early return.
- Isolation: a temporary directory per unit case (`beforeEach`/`afterEach`); a home, userData and script per e2e case.
- The cases drive the target behaviour and assert its effect through the public interface: the `onProgress` values and
  the `downloaded` promise (U1-U4); the slot's `aria-valuenow`, the tip's text and place, the slot's going and the toast
  count (E1, E2). The script is the seam's documented input.
- Reachable state: U2's unreadable script is one a reader really sees while a test rewrites it (`midwrite-read.txt`).
- Real-time bounds: U1 and U4 allow 1 s, and U3 500 ms, for a settlement the correct code reaches in about 65, 115 and
  50 ms. A red from timing alone needs a stall of 450 ms or more inside the case. Accepted as written: the margins are
  8-15 times the need, and each bound turns a hang into a named failure instead of the 5 s test timeout.

### False greens

- Constant-true: the 150 ms "pending" reads in U1 and U2 are three hold polls, while an ignored hold settles in about
  15 ms. A broken hold could pass only if the event loop stalled for 135 ms or more in that window; accepted.
- Tautology: every expected value is a literal from the script or the English copy.
- Stale path: `scriptedUpdateSource` is the source the app runs under the seam (`src/main/index.ts:721`); `aria-valuenow`
  and `update-tip` are rendered by `src/renderer/src/UpdateSlot.tsx:139` and `:100`.
- Silent skip: none.
- Assertions that might not run: all awaited. The `within` helper counts a missing download (`found` null) as settled,
  and each case has an assertion that goes red then (U1, U2: "pending" expected; U3: `.rejects` on undefined; U4:
  `seen` empty).
- Browser assertions (review-code's false-greens list; the change adds no gate and no command-line check): each wait
  polls the expression it asserts. The tip is placed once at hover, with `translateY(-50%)` and no transition
  (`UpdateSlot.tsx:73`-`:98`), so the first place is not read mid-animation.
- When each goes red:
  - U1: the hold ignored, settled by about 15 ms, red at `:107`; the release ignored, red at `:110`;
  - U2: the `catch` taken as a release, red at `:122`; the `catch` rethrowing, the download rejects, red at `:122`;
  - U3: the cancellation check inside the hold removed, held for good while the script still holds, red at `:147`; a
    resolution instead of a rejection, red at `:148`;
  - U4: the hold read from the script as it stands, or the script read again when the download starts, held by the
    rewritten script, red at `:138`;
  - E1: the tip not following the progress, red at `:178` (planted); the hold ignored, red at `:168`, since with 100 ms
    steps the window shows (about 620 ms) after step 60 (`diag-before.txt`: 3 of 3 red, built at 1349d76, which has no
    hold); the release ignored, red at `:178`; the tip moved, red at `:179`;
  - E2: the hold ignored, the download fails about 200 ms after the check, before the window shows, red at `:286`
    (inferred from `diag-before.txt`'s timing; measured for the old case read 1.5 s late); a failed download that leaves
    the slot, or a release that is ignored, red at `:288`; a toast, red only if it is in the DOM when `:289` reads, at
    once after the slot goes (F2).

### Resource reuse

- Counted from the gateway's `pnpm e2e`: one `electron-vite build` (main 903 ms, preload 43 ms, renderer 610 ms) before
  Playwright, for all 148 cases, as the table says. Launches print nothing in the list reporter, so their number comes
  from the code: E1 one, E2 two, and the diff adds none. Each launch is the behaviour under test (the launch check) and
  needs its own script and userData, so it cannot be shared.
- Unit cases: a temporary directory each; no expensive resource. U1-U4 took 522 ms together in this check's run: their
  scripted waits, not set-up.

### Findings

- **F1** (record; low). Location: this record, Test design table, row U2, "Input that drives the branch". Problem: the
  row says the script is written as `{not js`; the test writes `{"check":"fou` (`src/main/update-source.test.ts:121`).
  Handling: amend the row's input to the written literal, noting that an empty file, the more common mid-write read,
  takes the same `catch`. The re-review above covers the amended row; no test change.
- **F2** (pre-existing; low). Location: `e2e/app-update.spec.ts:289`, E2's second launch. Problem: "no toast" is read
  once, at once after the slot goes, so a toast that renders later passes; the Design review's "E2 goes red if a failed
  download shows a toast" holds only for a toast already in the DOM at that read. The slot's going and a notice's toast
  are separate IPC messages and separate React updates (`UpdateSlot.tsx:48`-`:67`, `Toast.tsx`), so which renders first
  is not fixed. Untouched by this change; the first launch of the same case waits 500 ms before its negative reads
  (`:276`). Impact: a regression that sends a notice on the download-failure path (the install-failure path does,
  `src/main/update-controller.ts:115`-`:117`) could pass E2. Not shown either way: no planted run, as mutation testing is
  not enabled. Recommendation: not in this ticket, whose scope is the first-step race. A deterministic form is to make a
  later notice (a menu check's toast) after the failure and assert the toast count is exactly one, since notices arrive
  in order. Destination: no persistent home in the repository; the owner decides, together with the six timed cases
  (fold it into that follow-up if one is opened, or drop it with this record as the trace).

### Document sync

Scope checked for what these conclusions change: this record; `ticket-254-doc-sync.md`, `ticket-254-tasks.md`,
`checklist.md` (the rows for app-update::REQ-001/AC-04, REQ-002/AC-01, AC-02 and the Current verification table) and
`final-regression.md`, enumerated with hidden and ignored files (`ls -la`, `rg -uu`); the spec's Testing Decisions;
`CONTEXT.md` and `docs/adr/` (no invariant or decision on negative e2e reads or the scripted seam's timing).
`docs/features/app-update.md` is excluded: neither the change nor these findings alter user-visible behaviour. No current
statement is made untrue. F1 is a correction to this record. F2 adds a sync item only if the owner opens the follow-up;
the Current verification line for REQ-002/AC-02, still pending in the document sync checklist, should not credit E2 with
more than that single read for "no toast". The checklist's Pending rows are unchanged by this check.

### Conclusion

- Coverage: no gap; the claimed branches are driven, and the regression points ran green.
- Case design: no implementation-coupling red flag; the real-time bounds are accepted.
- False greens: none in what this change wrote; every test has a stated way to go red. F2 qualifies a pre-existing read.
- Resource reuse: one build per run and the launches as designed, confirmed from the gateway and the code.
- Findings: F1 (record row), F2 (pre-existing, for the owner). No test, product code or test data change is required by
  this check.

## Handling of the post-implementation check's findings (implementing session, 2026-10-23)

| # | Handling |
|---|---|
| F1 | The design table's U2 row now names the literal the test writes, with the note on an empty file |
| F2 | The owner decided to handle it in this change, with the six timed cases (D3 in the task list). The design review's rows E2, E2a, E3–E13 were added or amended before the tests changed. Planting the toast showed the read was worse than late: E2's retried `toHaveCount(0)` waited a 3.2 s toast out and passed, 5 of 5 (`plant-notice-old-e2.txt`) |

What the change that followed adds, and the runs that show each part can be red (all on the change before its commit;
the scripts and their outputs are in `evidence/ticket-254/`):

- "No toast", read against a later notice (E2, E2a, E3) or counted once (E9):
  - E2 under P2, a failed download sending a notice at once: red 3 of 3 at the read (`plant-notice-new-e2.txt`);
  - E2a under P3, a failed check sending a notice at once: red 3 of 3 (`plant-check-notice-e2a.txt`). Before the check
    was held, P3's notice never showed, since the check answered before the window listened; with a check taking 2 s
    it shows (`plant-check-notice.txt`);
  - E9 under P4, a toast at startup: green 3 of 3 with the retried read, red 3 of 3 counted once
    (`plant-startup-toast.txt`).
- The holds (U5, U6 for the check, red before their code; E1–E8, E10–E13 in e2e), over the three update files
  (`plant-holds.txt`):
  - P5, every step at once with the holds intact: all 38 cases green, so none of them depends on step timing any more;
  - P1b, the holds ignored and every step at once: exactly the 13 cases that take a hold red, the other 25 green;
  - P1, the holds ignored at 50 ms steps: 8 of the 13 red; the other five read within the download's first ~200 ms when
    the machine is idle, which is the margin a loaded machine takes away.
- Targeted run after the change (`targeted-2.txt`): typecheck, lint, 15 unit tests, a fresh build, and 123 e2e — the
  three update files and the whole of `app.spec.ts` — `TARGETED_EXIT=0`.
