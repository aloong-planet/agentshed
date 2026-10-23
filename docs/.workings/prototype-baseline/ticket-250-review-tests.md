# Test review — #250

Ticket: [#250](https://github.com/aloong-planet/agentshed/issues/250) · work directory `prototype-baseline` ·
branch `docs/prototype-fixes-250-226`, delivered in one PR with #226 ([ticket-226-review-tests.md](ticket-226-review-tests.md)).
Requirement source: #250's body and comments, with no spec; coverage units `250::*` in [checklist.md](checklist.md).
Scope: the verification behind #250's units — the browser probes `evidence/round-2/verify-pages.cjs` (its #250
checks and the per-page script-error checks) and `evidence/round-2/probe-session-fail.cjs`, the readings and
searches the checklist cites, and the full verification gateway. No unit, integration or e2e test is added or
changed.

## Design review

Implementation version: 1349d76 (where the work began). Not run: skipped together with TDD, as task 3 of
[ticket-250-tasks.md](ticket-250-tasks.md) records (`/implement` step 4 lets the design review follow a skipped
TDD). The change is to prototype pages, which no test in the repository exercises: outside `docs/` and
`node_modules/`, a search of the 21a8958 tree for `docs/prototypes`, `prototypes/` and each touched page's name
finds, besides comments, only the three gates that read the real pages (`scripts/check-shared-ui.mjs`,
`scripts/check-lang.mjs`, `scripts/check-raw-nul.mjs`) and two test files that write their own fixtures into
temporary directories (`scripts/check-lang.test.mjs`, `src/main/providers/artifacts.test.ts`). The test design
table is therefore empty. The task list cites the prototype skill's "no tests" for the skip; that citation was not
re-read for this record. The checks below were made after implementation, on the probes as written.

## Post-implementation check

Round 1: checked 2026-10-23 by an independent agent on the commit range 1349d76..21a8958 (21a8958 is the
implementation; 0bb5a11 after it adds only work records and evidence), after the full verification gateway passed.
The probe changes that followed have their own incremental checks at the end of this section, first 0565012, then
4c5f473.

Handover evidence:
- Gateway log [`evidence/round-2/gate-21a8958.log`](evidence/round-2/gate-21a8958.log): HEAD
  21a895890cde0eddb02a65814d461539ebb7ec86 with an empty `git status --porcelain --untracked-files=all` (so no
  file needs a hash), each command with its full output and its exit code, lint and e2e run as the capability
  declaration's `enforced-by` names them (`pnpm lint`, `pnpm e2e`), every exit code 0. The version is the end of
  the handed range; no item the gateway section asks of the log is missing.
- Test files in the range: none. `git diff --name-only 1349d76..21a8958` lists five work records and fourteen
  files under `docs/prototypes/`. With an empty test design table there is no case to compare with it and no test
  file header to check for gap notes.
- Reproduction: both probes were rerun on full-tree exports of 1349d76 and 21a8958 made with `git archive`, so
  `build/icon.png`, which the pages load from outside `docs/prototypes/`, is present. Each output equals its
  committed log line for line once the logs' escaped code points are decoded: verify-pages, 166 lines, exit 1
  with 86 failures on the base and exit 0 after; probe-session-fail, 17 lines, exit 1 with 7 failures on the base
  and exit 0 after.

### Coverage

No spec, so no failure-modes section; coverage is #250's open items and its "Done when", each against its
verification:

| Unit | Verification | Red on 1349d76 | Judgement |
|---|---|---|---|
| 250::1 | verify-pages: the picker opened by a click on `.ins[data-i]`; computed `box-shadow` ends `0px 6px 22px 0px`; alone and in the gallery | yes, `0px 8px 26px 0px` | covered |
| 250::2 | computed font size, the four paddings, radius and opacity of the title's tag, as one exact string | yes, `10px 1px 5px 1px 5px 4px 1` | covered |
| 250::3 | drawer opened by clicks (Subagents tab, first row); computed display and background of the mask | yes, alpha 0.32 | covered |
| 250::5 | probe-session-fail: A1–A4 (a failed turn, then a sort, collapse all + expand all, and a language change made in the gallery), B (retry), C (a fetched turn; a session switch), D (a redraw during each of the three fetch kinds) | 7 of 16 fail: A2–A4, both D error checks, D ok and D stale while in progress | covered: all three redraws #250 names are driven |
| 250::6 | meta line and list header read after choosing the orphan session in the demo bar | yes, the meta says 24 | covered; the question line's count and the code comment by the diff |
| 250::7, 250::R1 | the header comments read against the bars' groups (comments have no rendered surface) | — | covered by reading. Rechecked independently for the three headers this range changes, against the bar markup: detail page — startup controls, sessions tab, memory file read: three groups, all named; Agents page — startup, usage, Codex memory, memory file read: four, all named; global search — startup, question reading, session data, search request, sample fills: all five named |
| 250::8 | search for the rule's colour and selector | — | covered. Rerun with a positive control: `rg -uu --text -n '3ba272\|\.m\.x\b'` and `/usr/bin/grep -r -a -n -E` over each export's `docs/prototypes` (80 files by both `rg -uu --files` and `find -type f`; `rg` here is a wrapper that passes its arguments through unchanged): two hits on 1349d76 (Agents page line 149, detail page line 165), none on 21a8958 (exit 1 with both tools). The model-bar INFO lines are equal in the base and after logs |
| 250::9 | computed `padding-top` and `padding-bottom` of each list area (`.main` on the two previews, `.body` on the session page) | yes, 18/100, 18/100, 14/90px | covered; the sides unchanged by the diff (22, 22, 20px) |
| 250::done | "no script errors" per page, alone and in the gallery; `pnpm check:ui` in the gateway | — | covered: the touched pages are 8 UI pages and 3 logic pages (`git diff --name-only`), and the probe opens exactly those |

Fixture source: the change reads no data produced elsewhere (the pages render their own mock data), so the
real-sample fixture rule does not apply.

Finding T250-1 (record accuracy): row 250::done of the coverage checklist says "9 UI pages, 3 logic pages"; the
touched pages are 8 UI pages and 3 logic pages, which is what the probe covers.

### Case design

The probes open each page, or each scenario, in a fresh browser context and drive it through its surface —
clicks on demo-bar options, tabs, rows, the install button, the sort, collapse all and the question rows — and
read rendered state: computed styles, text, attributes. No project module is replaced, no internal state is
written, nothing is asserted about calls. Stated exceptions, judged acceptable:
- probe-session-fail A4 changes the language by calling the gallery's `DemoDimensions.set` in a second tab of the
  same context — the call the gallery's settings popover makes — rather than clicking through the popover. What
  is under check, the session page redrawing on that change, is reached through the page's own listener; the base
  run shows the redraw (the turn's content, now in Chinese).
- A and B share one context in sequence on purpose: B is the retry after A's failure.
- Fixed waits instead of polling. Every wait before an outcome read exceeds the page's timer (500ms after a
  350ms timer, 1100ms after 900ms); the in-progress reads in D are made with no wait, inside the timer window. A
  slow machine turns these red, not green.

### False greens

Per the project capability declaration, `mutation-testing` is not enabled; mutation testing is skipped. Each
check's "when would it be red", answered against the page code and the source of its expected value:
- 250::1–3 and 250::9: exact computed values; the expected values come from the owner's comment on #250 (items
  1–3) and the owner's 16px decision (item 9), not from the implementation; each failed on 1349d76 with the old
  value, so each reads the property it names.
- 250::6: red when either the meta line or the list header does not say "26 questions"; on the base the meta
  failed (24) while the list header said 26, so the two halves are read separately.
- 250::5: A2–A4 are red when a redraw draws the turn's content instead of its error, which is what the base does.
  D "in progress" is red when a redraw draws the content before the fetch ends. D "outcome" is red when the end of
  the fetch writes into a box no longer in the page, since the redrawn box would then keep the in-progress line
  (the fix writes through a fresh `querySelector`). D ok and D stale "outcome" also pass on the base, whose redraw
  drew the content at once; they discriminate for the fixed code path, the one they are meant for. B and C pass on
  both commits, as regression checks of behaviour the change keeps.
- "no script errors" counts `pageerror` events, and those include errors thrown inside the gallery's frame:
  [`verify-pages-mutation-script-error.log`](evidence/round-2/verify-pages-mutation-script-error.log), run with the
  committed script (its 160 check names equal the after log's) on 21a8958 plus an error thrown in the session page,
  is red on that page alone and in the gallery and nowhere else.
- Judged, no change: "alone <page>: loaded" is constant true (it tests the page object, not the document). A
  missing file makes `page.goto` throw, and the one page with no page-specific check, global search (only its
  header comment changed), owes "no script errors" alone. In the gallery the same check is real: it finds the
  page's frame by URL.
- Judged, no change: the exit code ignores console errors, which the probe prints as INFO lines. In the committed
  logs and in this check's runs the only console line is Chrome's blocked-autofocus message on global search in the
  gallery, present on the base too and judged in [ticket-250-review-code.md](ticket-250-review-code.md). A later
  run has to read the INFO lines; this round's runs hide nothing.
- 250::7, 250::R1 and 250::8 are readings and searches; the search's reach is shown by the positive control above.

### Resource reuse

No test resource is added or changed in the suite. In the gateway log the e2e step builds once (one
`electron-vite build`, then 148 tests on one worker); the test design table has no resource row to compare with.
The probes launch Chrome once per run (measured 0.7s) and open one context and page per page or scenario
(measured 0.2–0.3s each); neither reaches the one-second threshold, and a fresh context keeps each page's storage
apart. In gallery mode the gallery is loaded once per page because opening that page in the gallery is what is
checked. One probe-session-fail run took 12.1s.

### Findings and document sync

| Finding | Basis | Recommended disposition | Status (incremental check, 2026-10-23, at cc6a9fd) |
|---|---|---|---|
| T250-1: row 250::done counts 9 UI pages; there are 8 | Coverage, last row | Correct the count in [checklist.md](checklist.md) now, as a document sync item of this ticket ([ticket-250-doc-sync.md](ticket-250-doc-sync.md)), pending until done | Resolved in cc6a9fd: row 250::done reads "8 UI pages, 3 logic pages", and the sync item is marked done |

No coverage gap, false green or resource finding is left open for #250 (round 1; the incremental checks below
add none). Document sync arising from this check,
for the main agent: the checklist correction above and, once this check is closed, task 11 of
[ticket-250-tasks.md](ticket-250-tasks.md). Files read for this check: the coverage checklist, the #250 task list,
document sync checklist and code review record, the #251 test review (format), every file in
`evidence/round-2/`, and #250's body and comments; `docs/.workings/` is git-ignored, so the directory was listed
with hidden entries shown, and both test review paths were checked directly and were absent before this record.

### Incremental check: the probe change 0565012

Checked 2026-10-23 by an independent agent with a fresh context, at HEAD cc6a9fd with a clean tree, on the fix
range 0bb5a11..0565012 (in git's notation the one commit 0565012; cc6a9fd after it adds only the directed
verification log and record updates). The scope searches, the handover evidence and the #226 side are recorded in
[ticket-226-review-tests.md](ticket-226-review-tests.md) under the same heading; this section holds what concerns
#250.

Scope, by the incremental clause: the change is 12 lines in `verify-pages.cjs`'s `driveLogic`, which runs only on
the three logic pages. Of #250's checks it reaches the "no script errors" check of each logic page (part of
250::done), alone and in the gallery, since that check now also sees the added clicks. No other test changed,
nothing imports the probe (two whole-worktree searches, in the #226 record), and the test design table is empty
with no row changed. Carried over from round 1 (the post-implementation check above, on 1349d76..21a8958): every
UI-page check, `probe-session-fail.cjs`, the readings and searches for 250::7, 250::R1 and 250::8, and resource
use.

Evidence: [`evidence/round-2/directed-0565012.log`](evidence/round-2/directed-0565012.log) at HEAD 0565012 with
an empty status, each command with its full output and exit code; the gateway log `gate-21a8958.log` carried over
(HEAD 21a8958, clean, eleven commands, every exit code 0). The log does not record which code its base and
mutated runs tested; that finding (T226-5) is in the #226 record. The implementation run, without the 18 lines
the change adds, equals round 1's `verify-pages-after.log` line for line, so every #250 check reads what it read
in round 1.

#### Coverage

250::done: the eight UI pages and the three logic pages each open alone and in the gallery with no script error;
the logic pages' six "no script errors" checks pass after the added clicks (and on the base). Covered, no change
to round 1's judgement.

#### Case design

No #250 check changed; round 1's judgement stands.

#### False greens

Per the project capability declaration, `mutation-testing` is not enabled; mutation testing is skipped. "When
would it be red" for the logic pages' "no script errors": when a `pageerror` event reaches the page or its
gallery frame during the run, now including the added entry clicks. The directed log's throw run, made with the
committed probe, shows the mechanism as round 1's script-error log did: an error thrown in the session page fails
that page's check alone and in the gallery and no other check (the log shows the mutation reached one line).
Round 1's other answers stand.

#### Resource reuse

The change adds clicks only; no test resource is added. Carried over from round 1.

#### Findings and document sync

No #250 finding. T250-1 is resolved (table above). Document sync, for the main agent: task 11 of
[ticket-250-tasks.md](ticket-250-tasks.md) can note this check's outcome (no #250 finding); row 250::done of
[checklist.md](checklist.md) stays true with the directed run. The document search and its scope are in the #226
record.

### Incremental check: the entry-button fix 4c5f473

Checked 2026-10-23 by an independent agent with a fresh context, at HEAD ee91769 with a clean tree, on the fix
range cc6a9fd..4c5f473 (in git's notation the one commit 4c5f473; ee91769 after it adds only the directed
verification log, checklist rows and a document sync status). The scope searches, the handover evidence and the
#226 side are recorded in [ticket-226-review-tests.md](ticket-226-review-tests.md) under the same heading; this
section holds what concerns #250.

Scope, by the incremental clause: the change is the entry-button loop in `verify-pages.cjs`'s `driveLogic` (probe
lines 63 to 85), which runs only on the three logic pages, and three header comment lines about a #226 gap. Of
#250's checks it reaches each logic page's "no script errors" (part of 250::done), alone and in the gallery,
since that check now also sees the loop's reset, event and entry clicks. No other test changed, nothing imports
the probe or the new runner `directed.sh` (whole-worktree searches with two tools, in the #226 record), and the
test design table is empty with no row changed. Carried over from round 1 (post-implementation check,
1349d76..21a8958): every UI-page check, `probe-session-fail.cjs`, the readings and searches for 250::7, 250::R1
and 250::8, and resource use; from the first incremental check (0565012): its judgement on the logic pages'
script-error checks, extended below.

Evidence: [`evidence/round-2/directed-4c5f473.log`](evidence/round-2/directed-4c5f473.log) at HEAD 4c5f473 with an
empty status, its base tree and substitutions stated in its header, each command with its full output and exit
code; the gateway log `gate-21a8958.log` carried over (HEAD 21a8958, clean, eleven commands, every exit code 0;
nothing outside `docs/.workings/` has changed since). With the entry-button lines set aside, the implementation
run equals round 1's `verify-pages-after.log` except the six distinctness lines added in 0565012, so every #250
check reads what it read in round 1. The item 5 probe passes 16 of 16 after and fails 7 on the base, as before.

#### Coverage

250::done: the eight UI pages and the three logic pages each open alone and in the gallery with no script error;
the logic pages' six "no script errors" checks pass after the loop's added clicks (and on the base). Covered, no
change to round 1's judgement.

#### Case design

No #250 check changed; round 1's judgement stands.

#### False greens

Per the project capability declaration, `mutation-testing` is not enabled; mutation testing is skipped. "When
would it be red" for the logic pages' "no script errors": when a `pageerror` event reaches the page or its
gallery frame during the run, now including the loop's reset, event and entry clicks. The directed log's throw
run, with the committed probe, shows the mechanism again: an error thrown in the session page fails that page's
check alone and in the gallery and no other check, and the mutated copy differs from the pages in the one inserted
line (the log's reach count, and a `diff -r` in this check). Round 1's other answers stand.

#### Resource reuse

The change adds clicks only; no test resource is added. Carried over from round 1.

#### Findings and document sync

No #250 finding. Document sync, for the main agent: task 11 of [ticket-250-tasks.md](ticket-250-tasks.md) can note
that the second incremental check found nothing new for #250; row 250::done of [checklist.md](checklist.md)
stays true with `directed-4c5f473.log`. The document search and its scope are in the #226 record.
