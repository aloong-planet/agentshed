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
  - `menu-check-updates.spec.ts:239`–`:240` as on 22c8ce6, now `:253`–`:254` (a development run's click, after 800 ms): unchanged. A development run
    sends no notice at all, so there is no later notice to read against.
  Every retried "no toast" read in e2e, by the same search over `e2e/` (`rg -n "toast[^)]*\)\)?\.(toHaveCount\(0|not\.toBeVisible)|\.toast'\)\)\.toHaveCount\(0" e2e`):
  besides the two above, `app.spec.ts:2371`, `:2394` and `:5508` (`:5510` at 98b2208) wait earlier toasts out on purpose (before a new toast,
  before a screenshot), which a retried read is right for; `app.spec.ts:4405` (i18n::REQ-003: a stored preference naming
  a removed language reads as follow system "with no notice") is a negative read and can never be red the same way.
  Changed to one count, not retried, after the case's own checks of the window (row E9).
  The timed check, a second form of the same race: a case that must act while a check is in flight, the check
  answering after `checkMs` from when it was asked. Found while changing E8, which has one. The task list's first
  enumeration searched `checkMs` but classified only the timed downloads; every `checkMs` in e2e (`rg -n "checkMs"
  e2e`), six, each a "Checking…" state or a check to join within 1.5–2.5 s: `settings-updates.spec.ts:119` (E10),
  `:255` (E11), `:282` (E12), `:524` (E8), `menu-check-updates.spec.ts:193` and `:202` (E13). All take the check's hold.
  The "no request" reads after a fixed wait (as on 22c8ce6 `app-update.spec.ts:152`, `:205`, `:402`, `settings-updates.spec.ts:163`,
  `:376`, `:406`, `:411`; at 98b2208 `app-update.spec.ts:182`, `:235`, `:447` and `settings-updates.spec.ts:165`, `:388`, `:418`, `:423`) read a request log, not notices; no later event orders them, and they are not in this change.
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
- Carried over from the Design review: the six cases with 1.1-2 s margins. Superseded: the owner decided on 2026-10-23
  to handle them, and F2, in this change (task list D3); see the incremental check below.
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
  - E2: a failed download that leaves the slot, or a release that is ignored, red at `:288`. Two statements made here
    were wrong, corrected by the incremental check below: the hold ignored does not make E2 red at its 100 ms steps on
    an idle machine (plant P1, `plant-holds.txt`), only with every step at once (P1b, red at the slot read); and the
    toast read at `:289` could not go red at all, since `toHaveCount(0)` retries for 5 s and waits a 3.2 s toast out
    (plant P2 on this E2: green 5 of 5, `plant-notice-old-e2.txt`), not only miss a late one (F2).

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
- **F2** (pre-existing; low; handled in this change, see Handling and the incremental check). Location:
  `e2e/app-update.spec.ts:289`, E2's second launch. Problem: "no toast" is read after the slot goes, so a toast that
  renders later passes; the Design review's "E2 goes red if a failed download shows a toast" did not hold. (Corrected by
  the incremental check: the read is retried for 5 s and waits a toast that is present out, so it could not go red for
  any toast; this paragraph first said it held for a toast already in the DOM.) The slot's going and a notice's toast
  are separate IPC messages and separate React updates (`UpdateSlot.tsx:48`-`:67`, `Toast.tsx`), so which renders first
  is not fixed. Untouched by this change; the first launch of the same case waits 500 ms before its negative reads
  (`:276`). Impact: a regression that sends a notice on the download-failure path (the install-failure path does,
  `src/main/update-controller.ts:115`-`:117`) could pass E2 (shown since: `plant-notice-old-e2.txt`). The recommendation
  given here, not in this ticket, is superseded by the owner's decision D3; the deterministic form suggested here, a
  later notice after the failure and the toasts counted exactly, is what the change adopted.

### Document sync

Scope checked for what these conclusions change: this record; `ticket-254-doc-sync.md`, `ticket-254-tasks.md`,
`checklist.md` (the rows for app-update::REQ-001/AC-04, REQ-002/AC-01, AC-02 and the Current verification table) and
`final-regression.md`, enumerated with hidden and ignored files (`ls -la`, `rg -uu`); the spec's Testing Decisions;
`CONTEXT.md` and `docs/adr/` (no invariant or decision on negative e2e reads or the scripted seam's timing).
`docs/features/app-update.md` is excluded: neither the change nor these findings alter user-visible behaviour. No current
statement is made untrue. F1 is a correction to this record. F2's sync items: superseded by the owner's decision D3,
see the incremental check's Document sync. The checklist's Pending rows are unchanged by this check.

### Conclusion

- Coverage: no gap; the claimed branches are driven, and the regression points ran green.
- Case design: no implementation-coupling red flag; the real-time bounds are accepted.
- False greens: none in what this change wrote; F2 found a pre-existing read that could not be red (two of this
  section's answers for E2 were wrong, corrected above).
- Resource reuse: one build per run and the launches as designed, confirmed from the gateway and the code.
- Findings: F1 (record row), F2 (pre-existing). Both handled since, see Handling.

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

## Post-implementation check, incremental (2026-10-23, e4a86dd..9233d96)

Ticket #254. Run by the same independent agent as the first round, not the implementing conversation; its inputs were
the global instructions, the specs (`app-update.md`, and `i18n.md` for E9), this record, the commit range, the targeted
log and the gateway log. Implementation version: the code and tests of 98b2208; 9233d96 adds the gateway log and the
task list only (`git diff --stat 98b2208 9233d96`). Conclusions outside the scope below carry over from the first round
(1349d76..e4a86dd), as corrected in place above.

Run evidence, not re-run in full:

- Targeted log [targeted-2.txt](evidence/ticket-254/targeted-2.txt): HEAD e4a86dd plus the uncommitted change. Each of the
  six changed code and test files' `git hash-object` in its header equals the blob at 98b2208 (`git rev-parse
  98b2208:<path>`), so it ran the committed code. Every command, its output and its exit code are there, with
  `TARGETED_EXIT=0`.
- Gateway log [gateway-98b2208.txt](evidence/ticket-254/gateway-98b2208.txt): HEAD 98b2208 on a clean tree, every command
  with its full output and exit code, `VERIFY_EXIT=0` (873 unit, 148 e2e, smoke OK). Nothing missing in either.

Mutation testing: by the project capability declaration, mutation-testing is not enabled, so it is skipped. The plants
P1-P5 the implementing session recorded are acceptance evidence; this check read each one for whether it reached its
target, where it went red, and on which text of the test it ran.

### Incremental scope

- Tests changed in the range (`git diff e4a86dd..9233d96 -- src e2e`):
  - unit: U5 (`src/main/update-source.test.ts:88`), U6 (`:98`), and the `within` helper's type (`:73`, `Promise<void>`
    to `Promise<unknown>`), which U1-U4 also use;
  - `e2e/app-update.spec.ts`: E2 with E2a (`:299`), and the helpers `clickMenuCheck` (`:56`) and `recordToasts` (`:65`).
    `rg -n "clickMenuCheck|recordToasts|saidNothing" e2e/app-update.spec.ts` shows them used only inside E2
    (`:304`-`:334`);
  - `e2e/app.spec.ts`: E9 (`:4390`);
  - `e2e/menu-check-updates.spec.ts`: E3 (`:125`), E4 (`:153`), E13 (`:181`);
  - `e2e/settings-updates.spec.ts`: E10 (`:111`), E5 (`:173`), E6 (`:229`), E11 (`:255`), E12 (`:290`), E7 (`:431`), and
    E8 (`:515`, zh and en).
- Tests that depend on changed test support, by import relation:
  - `rg -n "from '\.\.?/" e2e`: no e2e file imports another; the only imports are `../src/renderer/src/env` (types) and
    `../src/shared/errors`, neither changed in the range.
  - The scripted source changed (`src/main/update-source.ts`, the seam's test-only path). `rg -l "update-source" src e2e
    scripts build` lists `src/main/update-source.test.ts` and the entry `src/main/index.ts`. `rg -l
    "AGENTSHED_UPDATE_SCRIPT" e2e src` lists the three update e2e files.
  - For a case that sets neither field, the seam's path is unchanged: `s.holdCheck === true` short-circuits the new loop,
    and `holding('holdFirstStep')` reads the field the old `holding()` read. All of them are green in `targeted-2.txt` and
    the gateway.
  - U1-U4 and E1 carry over from the first round and are re-run green here. The other unchanged cases in the three files
    were never in #254's review scope; nothing is concluded about them beyond green runs and the P1b/P5 plants.
- Test design table rows changed in the range: E2 (amended), and U5, U6, E2a, E9, E3-E8, E10-E13 (added).

Runs made by this check, only the tests in this scope, on the clean tree of 9233d96:

- `pnpm exec vitest run src/main/update-source.test.ts --reporter=verbose -t "can hold at its first step|stays held
  while its script cannot be read|did not ask for the hold|held download that is cancelled|a check can stay in flight"`:
  exit 0, 6 passed (U1-U6 by name) and 9 skipped;
- `pnpm exec electron-vite build`: exit 0;
- `pnpm exec playwright test e2e/app-update.spec.ts e2e/app.spec.ts e2e/menu-check-updates.spec.ts
  e2e/settings-updates.spec.ts -g "<the twelve changed titles>"`: exit 0, 13 passed (E8 twice).

### Written tests against the Test design table (incremental rows)

| Row | Input and release, as written | Assertions, as written | Resource | Result |
|---|---|---|---|---|
| U5 | hold `:90`, release `:93` | `:92` pending, `:94` settled, `:95` `null` | temporary directory | Matches |
| U6 | `checkMs: 100` `:100`, rewritten with the hold at 20 ms `:102`-`:103` | `:104` settled | as U5 | Matches |
| E2 | hold `:327`, recorder `:330`, release `:332` once the slot shows (`:331`) | slot gone `:333`; `saidNothing` `:334` (`:305`-`:308`): up to date, then toasts exactly one | two launches | Matches |
| E2a | `holdCheck` `:313`, recorder `:316`, request seen `:318`, release `:319` | idle `:320`, slot `:321`, `saidNothing` `:322` | as E2 | Matches |
| E9 | stored `fr`, unchanged | one count `:4407` | one launch | Matches |
| E3 | hold `:135` before the menu click `:136`; release `:139` after the toast `:137` and the bar `:138` | slot gone `:142`; up to date and the click `:144`-`:145`; toasts exactly two `:146` | one launch | Matches |
| E4 | hold `:157`; release `:165` after the menu check's toast `:164` | `:166`, `:168`, `:170`, `:172`, `:174` as before | one launch | Matches |
| E5 | hold `:177`; release `:186` after the handle `:185` | as before, `:187`-`:202` | one launch | Matches |
| E6 | hold `:241` before the wake `:242`; release `:244` after "is downloading" `:243` | as before, `:245`-`:248` | one launch | Matches |
| E7 | hold `:435`; release `:443` after the switch is stored off `:442` | as before, `:444`-`:445` | one launch | Matches |
| E8 | `holdCheck` `:540`, released `:544` after the checking state is measured `:543`; download hold `:555`, released `:559` after `:558` | as before, `:567`-`:573` | one launch per language | Matches |
| E10 | `holdCheck` `:120`; release `:127` after the forced click `:126` | as before, `:122`-`:131` | one launch | Matches |
| E11 | `holdCheck` `:264`; release `:269` once settings has gone `:268` | as before, `:270`-`:283` | two launches | Matches |
| E12 | launch `holdCheck` `:293`; release `:303` after "Checking…" `:302` | as before, `:304`-`:305` | one launch | Matches |
| E13 | `holdCheck` `:194`, released `:198` after the menu click `:197`; `holdCheck` `:205`, released `:210` after the settings click `:208` and the round trip `:209` | as before, `:199`-`:201`, `:211`-`:213` | one launch | Matches |

All rows match the written tests. File headers are unchanged and still true. The source's doc comment now names both
holds.

### Coverage

- Spec units: each changed case keeps its units and its assertions. The diff adds hold and release lines, replaces E2's,
  E2a's and E3's "no toast" reads with a read against a later notice, and replaces E9's retried read with one count.
  Units touched: app-update::REQ-002/AC-01 and AC-02 (E2, E2a); US-003/AC-02 to AC-05 and Failures A6, B2, D2-D6 (E3,
  E4, E10-E13); REQ-003/AC-04, C10, C11, CON-004 (E5); REQ-004/AC-02 and AC-03, B5, G2 (E6, E7, E11); QR-001/AC-02 (E8);
  and i18n::REQ-003, "no notice is shown" (`docs/specs/i18n.md:95`, E9).
- The branch each case claims: the hold keeps the state the case reads until the case releases it.
  - P1b (holds ignored, every step at once) turns exactly the 13 held cases red, at their first held read.
  - P5 (holds intact, every step at once) leaves all 38 green.
- The "no toast" class, checked by a full listing rather than a pattern: `rg -n "toast" e2e` (72 lines). The negative
  reads are:
  - `app.spec.ts:2371`, `:2394` and `:5510`: retried, waiting earlier toasts out before a new toast or a screenshot;
  - `app.spec.ts:4407`: E9;
  - `menu-check-updates.spec.ts:254`: the development run, a recorder read after 800 ms, where no notice can be sent;
  - `app-update.spec.ts:308` and `menu-check-updates.spec.ts:146`: the later-notice reads.

  This agrees with the Design review's enumeration (some of its line numbers are stale, F4).
- Timed scripts, by a full listing (`rg -n "checkMs|stepMs|FOUND_HOLDING|FOUND_READY|holdCheck|holdFirstStep" e2e`, 39
  lines): no `checkMs` is left. Every timed script without a hold ends in a held download or is read only at its end
  state: `settings-updates.spec.ts:158`, `:211`, `:350`, `FOUND_HOLDING`, `FOUND_READY`. This agrees with the
  classification.
- The CI repetition (#254's second acceptance item, task 9): not run yet; outside this check.
- Gaps: none new. The residual windows are under False greens.

### Case design

- No module mock, spy, fake timer, cast or internal write in the five changed test files: `rg -c
  "vi\.(mock|spyOn|fn|useFakeTimers)|jest\."` has no hit (positive control: `rg -c "it\(|test\("` gives 7-99 hits per
  file). No skip, `.only` or `fixme` in the three update files and the unit file.
- `clickMenuCheck` calls the menu item's own click handler in the main process. `recordToasts` observes the app's own
  toast host and writes only a test-owned global (`window.__toasts`), never app state. Both are copied from
  `menu-check-updates.spec.ts`; the e2e files keep their helpers per file (`fixture`, `launch`, `script`, `requests` are
  per file already), so the copy follows the convention.
- The premises the later-notice and round-trip reads stand on:
  - notices go out on one channel, in order (`sendUpdateNotice`, `src/main/index.ts:577`-`:580`);
  - one window's requests reach the main process in order (`ipc-order.txt`: 60 of 60).
- Isolation: unchanged, a home, userData and script per case.
- Real-time bounds: U5 and U6 follow U1-U4 (150 ms "pending", 1 s to settle, against about 50 and 100 ms needed);
  accepted as in the first round.
- E9 counted once: any toast at startup now turns it red, including a legitimate one. There is none today (green in the
  targeted run, the gateway and this check).
- E10's "a click while its own check runs asks nothing more" is read from the request log. A click the window failed to
  block would join the check in flight and make no request either, so the read shows the observable the spec states (no
  extra request), not the button's blocking. That blocking is the `aria-disabled` read at `:123`. This is not a finding.

### False greens

- The plants, checked for reach, red point and text:
  - P1 and P1b reached the build: `holdFirstStep` named on 1 line of `out/main/index.js` unplanted, 0 planted (the loops
    dropped). Their red points are the cases' first held reads, at the committed lines: `app-update.spec.ts:198`, `:331`,
    `menu-check-updates.spec.ts:138`, `:161`, `:196`, `settings-updates.spec.ts:122`, `:182`, `:243`, `:266`, `:302`,
    `:440`, `:542`.
  - P5 is green under its plant, so its reach matters. Its own log prints the `holdFirstStep` count, which P5 does not
    touch, and the header's `stepMs` count from `plant-instant-check.mjs` has no output in the file. Reach is shown by P1b
    instead: it uses the same replacement string, checked to occur once, and turns five more cases red than P1 (E2, E3,
    E4, E6, E7) (F4).
  - P2 on the new E2: red at the later-notice read, 3 of 3. It ran on an earlier text of the case: the read was inline at
    `:325`-`:327`, while the committed case folds it into `saidNothing` (`:304`-`:309`, called from `:334`). The statements
    are the same three, so the result carries over by reading; the evidence's line numbers now point at other code (F4).
  - P3 on E2a: red at `:308` via `:322`, 3 of 3, on the committed text. Before the check was held, P3's notice never showed
    (`plant-check-notice.txt`: the check answered before the window listened; with a 2 s check it shows).
  - P4 on E9: green 3 of 3 with the retried read, red 3 of 3 at `:4407` counted once, on the committed text.
  - P2 on E3: not run, though the Design review's False greens says P2 "shows E2 and E3 red" (F4). By reading, under P2
    the recorder holds `[found, err: Couldn't install the update, up to date]` and the read at
    `menu-check-updates.spec.ts:146` cannot match, so E3 goes red.
- When each goes red:
  - U5: the check's hold ignored, settled at once, red at `:92`; the release ignored, `:94`; a wrong answer, `:95`;
  - U6: the hold read from the script as it stands, held for good, red at `:104`;
  - E2: holds ignored with steps at once, `:331` (P1b; at its 100 ms steps on an idle machine it stays green, P1); a
    notice on the download-failure path, `:308` via `:334` (P2, earlier text); the slot stays, `:333`;
  - E2a: a notice on the check-failure path, `:308` via `:322` (P3). Without its hold the notice is sent before the window
    listens, and E2a could not see it (`plant-check-notice.txt`);
  - E3: holds ignored with steps at once, `:138` (P1b); a notice on failure, `:146` (by reading); the slot stays, `:142`;
  - E4: holds ignored, `:161` (P1b); a missing state toast or an extra request, `:164`-`:174`;
  - E5: holds ignored, `:182` (P1, P1b); a relabel that replaces the element, `:192`; an install without the click,
    `:194`;
  - E6: holds ignored with steps at once, `:243` (P1b); the line not emptied, `:245`; a fourth request, `:248`;
  - E7: holds ignored, `:440` (P1b); the switch cancelling the download, `:444`;
  - E8: the check's hold ignored, `:542` (P1, P1b); a wrapped line or a state not measured, `:567`-`:573`;
  - E9: a toast at startup, `:4407` (P4);
  - E10: the check's hold ignored, `:122` (P1, P1b); the button available while checking, `:123`; an extra request,
    `:131`;
  - E11: the check's hold ignored, `:266` (P1, P1b); the outcome lost while away, `:270`-`:272`;
  - E12: the check's hold ignored, `:302` (P1, P1b); a second request, `:305`;
  - E13: the check's hold ignored, `:196` (P1, P1b); a settings click that arrives after the release, a fourth request,
    red at `:213`.
- Residual windows, accepted:
  - The later-notice reads (E2, E2a, E3) catch a notice the failure sends no later than the menu check's own. A notice
    sent on a later timer would come after the expected list has matched.
  - E9's single count misses a startup toast that is already gone (3.2 s). The case reaches its count in about 0.7 s.

### Resource reuse

- Counted from the targeted log, per the incremental rule: one `electron-vite build` (main 863 ms, preload 40 ms, renderer
  574 ms) for its 123 e2e. The gateway also shows one build, for 148 e2e.
- Launches print nothing, so they are counted from the code. The range adds or removes none: `git diff e4a86dd..9233d96
  -- e2e | rg -n "^[+-].*(launch\(|electron\.launch)"` has no hit, over a non-empty diff. E2 and E11 launch twice, E8
  once per language, the others once, as before. Each launch is the behaviour under test and needs its own script and
  userData.
- U5 and U6: a temporary directory each. U1-U6 took 780 ms together in this check's run, which is their scripted waits.

### Findings

- **F3** (record; low; done in this check). Location: the first round's section above. Problem: two of its answers for
  E2 were wrong, and four statements were overtaken by the owner's decision D3. The wrong answers: "the hold ignored, red
  at `:286`" (P1 shows E2 green at its 100 ms steps on an idle machine), and "a toast, red only if in the DOM at `:289`"
  (the retried read waited any toast out, `plant-notice-old-e2.txt`). The overtaken statements: "no decision recorded",
  F2's recommendation and destination, its document-sync note, and the conclusion. Handling: corrected in place, each
  marked, so the record holds no conflicting statement.
- **F4** (record and evidence; low). Location: this record's Handling section and Design review, and
  `evidence/ticket-254/plant-holds.txt`. Problems:
  - (a) "E2 under P2 … red 3 of 3" does not say the run was on an earlier text of E2 (see False greens);
  - (b) the Design review's False greens claims P2 shows E3 red, and no run is recorded;
  - (c) `plant-holds.txt`'s header states a `stepMs` count with no output for it;
  - (d) the Design review's Coverage gives pre-change line numbers for reads it calls unchanged:
    - `app-update.spec.ts:152`, `:205`, `:402` are now `:182`, `:235`, `:447`;
    - `settings-updates.spec.ts:163`, `:376`, `:406`, `:411` are now `:165`, `:388`, `:418`, `:423`;
    - `menu-check-updates.spec.ts:239`-`:240` are now `:253`-`:254`;
    - `app.spec.ts:5508` is now `:5510`.

  Handling, before delivery and in the record only:
  - (a) add the version note, or re-run P2 on the committed E2;
  - (b) reword the sentence to the reasoning given under False greens, or run P2 over E3 (`node plant-notice.mjs
    e2e/menu-check-updates.spec.ts -g "a menu check that finds an update starts the download"`);
  - (c) add the output, or point the header at P1b;
  - (d) update the numbers.

  None of these changes a test.
- **F5** (document sync; low). Location: `ticket-254-doc-sync.md` rows 1 and 2, and `docs/.workings/i18n/checklist.md:67`.
  Problems:
  - Row 1 (the spec's Testing Decisions) names only the download's first-step hold. The change adds the check's hold and
    the rule the source's doc comment now states: a case that reads a notice of the launch check holds the check.
  - Row 2 (the coverage checklist's current verification) lists app-update::REQ-001/AC-04, REQ-002/AC-01 and AC-02 only,
    while the increment changed the cases for the units listed under Coverage.
  - The i18n checklist's current verification for i18n::REQ-003 ("Passed", `:67`) rested in part on a "no notice" read
    that could not go red for a startup notice (P4: green 3 of 3 before this change). Neither #254's checklist nor the
    i18n checklist says so.

  Handling, before delivery:
  - widen rows 1 and 2;
  - add a row for the i18n checklist's REQ-003 line, saying the read was made able to fail by #254 (the result still
    passes). This is a sync item in #254's own checklist, not a new ticket.
- **F6** (recommendation for step 7; no test change). Problem: the trap behind F2 and E9 recurs in any file: a retried
  negative read (`toHaveCount(0)`, `not.toBeVisible()`) of an element that lives for a while, such as a 3.2 s toast,
  waits the element out and passes. The scripted-seam rule is going into app-update's Testing Decisions (F5), but nothing
  in the repository tells the next test writer about this one: `rg -n -i` over `CONTEXT.md` and `docs/adr/` finds no
  invariant on negative reads. Impact: the next "no toast" or "X does not appear" read written that way can never be red.
  Recommendation: now, at this ticket's step 7, as a `CONTEXT.md` invariant: read "X does not appear" against a later
  ordered event, or count it once, never with a retried assertion whose timeout outlasts the element. Destination:
  `CONTEXT.md`, Invariants.

### Document sync

Scope checked for what these conclusions change, enumerated with hidden and ignored files (`ls -la`, `rg -uu`):

- this record;
- under `docs/.workings/macos-release-line/`: `ticket-254-doc-sync.md`, `ticket-254-tasks.md`, `checklist.md` (rows of
  the units under Coverage) and `final-regression.md`;
- `docs/.workings/i18n/checklist.md` and `final-regression.md`, found by `rg -l -uu "i18n::REQ-003" docs`;
- the app-update spec's Testing Decisions, and `docs/specs/i18n.md:95` (the expected value of E9, unchanged);
- `CONTEXT.md` and `docs/adr/`.

`docs/features/` is excluded: the only product-code change is the scripted source's test-only path, and no user-visible
behaviour changes. Results: F5 and F6. The doc-sync checklist's Pending rows are otherwise as they were. Task 7's range
in the task list ("e4a86dd..98b2208") differs from the handover's (e4a86dd..9233d96) only by the gateway-log commit.

### Conclusion

- Coverage: no gap. Each changed case drives the state it claims through the hold, and the classes behind F2 and the
  timed scripts are checked by full listings.
- Case design: no implementation-coupling red flag; the copied helpers follow the per-file convention.
- False greens: none in what the change wrote. Each case's way to go red is stated, most of them shown by a plant;
  E3's toast read goes red by reading only. The residual windows are accepted.
- Resource reuse: one build per run; launches unchanged.
- Findings:
  - F3 is done here.
  - F4 and F5 are record and document-sync fixes for the implementing session before delivery.
  - F6 is a step-7 recommendation.
  - None of them requires a change to a test, product code or test data.

## Handling of the incremental check's findings (implementing session, 2026-10-23)

| # | Handling |
|---|---|
| F3 | Done by the check itself, in place |
| F4 | (a), (b): P2 run over the committed E2 and E3: both red, E2 at `app-update.spec.ts:334` (in `saidNothing`), E3 at `menu-check-updates.spec.ts:146`, each with the planted toast recorded (`evidence/ticket-254/plant-notice-committed.txt`). (c): the instant-steps check's output added to `plant-holds.txt`'s header. (d): the Coverage paragraph's line numbers now give both versions |
| F5 | The document sync checklist's rows widened to the check's hold and to every unit whose case changed; the coverage checklist gains a current-verification row for them, and the i18n checklist one for i18n::REQ-003's "no notice" read (step 7) |
| F6 | Taken: an invariant in `CONTEXT.md`, "A 'does not appear' check can never be red if it is retried longer than the thing lives" (step 7) |
