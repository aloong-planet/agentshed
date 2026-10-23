# Test review — #226

Ticket: [#226](https://github.com/aloong-planet/agentshed/issues/226) · work directory `prototype-baseline` ·
branch `docs/prototype-fixes-250-226`, delivered in one PR with #250 ([ticket-250-review-tests.md](ticket-250-review-tests.md)).
Requirement source: #226's body (no comments), with no spec; coverage units `226::*` in [checklist.md](checklist.md).
Scope: the verification behind #226's units — the logic-page part of `evidence/round-2/verify-pages.cjs`, the two
mutation logs beside it, the diff the checklist cites, and `pnpm check:lang` in the full verification gateway. No
unit, integration or e2e test is added or changed.

## Design review

Implementation version: 1349d76 (where the work began). Not run: skipped together with TDD, as task 2 of
[ticket-226-tasks.md](ticket-226-tasks.md) records (`/implement` step 4 lets the design review follow a skipped
TDD). No test in the repository exercises the logic pages; the code outside `docs/` that reads the real pages is
the three gates (`check:ui`, `check:lang`, `check:nul`) — the search behind this is in
[ticket-250-review-tests.md](ticket-250-review-tests.md). The test design table is therefore empty. The checks
below were made after implementation, on the probe as written.

## Post-implementation check

Round 1: checked 2026-10-23 by an independent agent on the commit range 1349d76..21a8958 (21a8958 is the
implementation; 0bb5a11 after it adds only work records and evidence), after the full verification gateway passed.
The probe change that followed (0565012) has its own incremental check at the end of this section; for the
logic-page part of `verify-pages.cjs` that check is the current one, and round 1's judgements below are
annotated where it changes them.

Handover evidence:
- Gateway log [`evidence/round-2/gate-21a8958.log`](evidence/round-2/gate-21a8958.log): HEAD 21a8958 (full hash in
  the log) with an empty status, every command with its full output and exit code, lint and e2e run as the
  capability declaration names them, every exit code 0, `pnpm check:lang` among them. It matches the handed range;
  nothing the gateway section asks of the log is missing.
- Test files in the range: none (`git diff --name-only 1349d76..21a8958`); no case to compare with the empty test
  design table, no test file header to check.
- Reproduction: verify-pages rerun on full-tree exports of 1349d76 and 21a8958 gives its committed logs line for
  line (details in [ticket-250-review-tests.md](ticket-250-review-tests.md)); on the base every logic-page chrome
  check fails on all three pages, alone and in the gallery.

### Coverage

| Unit | Verification | Red on 1349d76 | Judgement |
|---|---|---|---|
| 226::1 | eleven chrome checks per page, alone and in the gallery: drive heading, empty-state receipt, reset button, stress label, hint, receipt after an entry, unreachable prefix, forced prefix, legal receipt, receipt after reset, reset-view title; the diff for the header comment and the empty-diagram notice, which a normal load never renders | yes, all eleven on each page | covered. The expected strings were checked against the skill's canonical `logic-page-template.html`: each is the template's wording (its lines 112, 122, 128, 139, 140, 191, 252, 273, 276, 293), and the empty-diagram notice in the diff is its line 150 verbatim. Every line with Chinese left in the three directories after the change was enumerated: page titles and headings, questions, state field labels, group and button labels, install-flow's operation field and scan-cache's cold/warm note in the pages; the reasons each page wrote and visibility's "visible in" values in `logic.js`; diagram titles and labels in the `.mmd` and `model.mmd.js` files. All are prototype content by #226's own list (see O1 for one reason's label) |
| 226::2 | the same probe: diagrams rendered (1, 1, 2 SVGs), an entry button, the current state highlighted, an unreachable event's tooltip, stress mode, a forced event, a legal event, reset, reset view after a pan; no script errors | the behaviour checks pass on the base as well (behaviour unchanged) | covered, except that only the first entry button of each page is clicked (T226-3). Since 0565012 every entry button is clicked; what that shows is judged in the incremental check (T226-4) |
| 226::3 | `pnpm check:lang` in the gateway | — | covered: exit 0 |
| 226::R1 | tooltip reason without a prefix; a forced illegal event's receipt; the regex mutation log | the forced receipt fails on the base | covered for the prefix and its regex; the unknown-event reason is not driven (T226-2); the mutation log's provenance (T226-1). Since cc6a9fd the row rests on `directed-0565012.log` (incremental check) |

Fixture source: nothing here reads data produced elsewhere; the real-sample fixture rule does not apply.

### Case design

The probe drives each page through its panel — entry, event and reset buttons, the stress checkbox, the reset-view
button — in a fresh context per page and mode, and reads text, classes, attributes and the canvas transform. No
module is replaced and no state is set by hand. Stated exceptions, judged acceptable:
- Tooltips are read from `data-tip` instead of hovering: the template draws the tooltip as `content:attr(data-tip)`
  (its CSS at lines 88–89), so the attribute is the drawn text's only source.
- The pan before the reset-view check is made with dispatched pointer events on the canvas. That is setup, and it
  goes through the page's own pointer listeners; the behaviour asserted, the reset-view button, is clicked for real.

### False greens

Per the project capability declaration, `mutation-testing` is not enabled; mutation testing is skipped. Each
check's "when would it be red", answered against the page code and the template as the source of the expected
values:
- The eleven chrome checks are exact or prefix matches on the template's strings; red whenever the rendered text
  differs, as the base run shows with the Chinese strings.
- "the tooltip's reason carries no rejection prefix": red when a tip contains " ignored: " or the Chinese word for
  "ignored". It passes on the base, where the Chinese prefix and its Chinese regex were paired and stripped: it
  checks the pairing, and the forced-receipt check carries 226::R1's red on the base.
- The forced receipt: red when the receipt lacks the class `illegal bad`, the "⚠ <event> ignored: " prefix, or the
  tooltip's reason at its end.
- The rest: an exact SVG count, a status other than the empty dash, at least one highlighted node, the reset-view
  transform changed by the pan and then restored.
- T226-1: [`verify-pages-mutation-regex.log`](evidence/round-2/verify-pages-mutation-regex.log), cited by row
  226::R1, was not produced by the committed `verify-pages.cjs` or on 21a8958. Its check names differ (156 checks:
  an error check named "no page or console errors" that failed on console messages; 250::9 checks of the bottom
  equal to the top at 18/18/14px), and it has no global-search page; the committed script gives 160. The logic pages
  and their `logic.js` are the same at 6d7f054 and 21a8958 (`git diff --stat 6d7f054..21a8958 -- docs/prototypes`
  touches only the three padding files), so the mutated object matches the implementation, but the check that
  judged it belongs to an earlier script whose code is not kept. Read against the committed code, the tooltip check
  goes red when a page's regex no longer strips its prefix, since the tip then keeps " ignored: ".

### Resource reuse

No test resource is added or changed. The probe's costs (Chrome launched once per run, 0.7s; a context and page per
page and mode, 0.2–0.3s) are measured in [ticket-250-review-tests.md](ticket-250-review-tests.md); neither reaches
the one-second threshold.

### Findings and document sync

| Finding | Basis | Recommended disposition | Status (incremental check, 2026-10-23, at cc6a9fd) |
|---|---|---|---|
| T226-1: the regex mutation log comes from an earlier probe version on a pre-21a8958 tree, and row 226::R1, dated against 21a8958, cites it without saying so | False greens | Now: state the log's provenance in row 226::R1 (earlier probe version; logic pages equal to 21a8958 by the diff above) and rest the tooltip check's "when red" on the committed code as read here. Rerunning the mutation is not required: the project does not enable mutation testing | Resolved: the mutation was rerun with the committed probe on a copy of the implementation's pages (`directed-0565012.log`), and row 226::R1 rests on that run and names the old log as an earlier version's. What the new log does not record is T226-5 |
| T226-2: the unknown-event reason, part of 226::R1, has no trigger on the page (every button's action type has its own reducer case, checked on all three pages) and is not mentioned in row 226::R1 | Coverage | Now: record in row 226::R1 that this string is verified by the diff only (`deny('unknown event')` in each `logic.js`, the wording of `logic-template.js` line 50), and why no probe drives it. Calling `StateMachine.reduce` with an invented type would be a synthetic path | Resolved in row 226::R1. The probe's own header does not note the gap: T226-6 |
| T226-3: #226's verification names "entry buttons"; the probe clicks the first entry button of each page only (row 226::2 says "an entry button", which is accurate) | Coverage | Recommended now: let the probe click every `[data-new]` button, check the receipt and a status after each, and rerun alone and in the gallery (one loop). Otherwise record in row 226::2 why the second button is not driven (the same handler; only `initial()`'s argument differs, and this range does not touch it) | Addressed in 0565012: every `[data-new]` button is clicked. The per-button check cannot tell a working button from a dead one in the sequence it runs in: T226-4 |

Observations handed to the main agent, outside the test findings:
- O1: each `logic.js` gives, in `legal()`'s null branch (no entry yet), a page-written reason that begins with the
  Chinese for "empty state:"; the template's branch reads "empty state: no entity yet, enter first". It shows in the
  tooltips before an entry button is clicked; the probe never reads that tooltip, and the class-level list in
  [ticket-226-review-code.md](ticket-226-review-code.md) does not name the branch. The owner's 226::R1 decision
  keeps the reasons each page wrote. Recommended: record in that code review record that this branch counts as a
  page-written reason (no change), or ask the owner if the label is to count as chrome; either way that record is its
  home.
- O2: the skill's canonical `logic-page-template.html` (line 339) calls `highlight(state.status)` once the diagram
  renders, while `state` is still null on a fresh load; the three pages guard it with `if (state)`. A new page copied
  from the template would throw once at load. It lies in the skill's repository, not here, so it has no home in this
  repository: the user decides whether to file it there.

Status at the incremental check (2026-10-23): O1 is judged in [ticket-226-review-code.md](ticket-226-review-code.md)
(Consistency, last item: a reason the page wrote, no change), which is its home. O2 has no decision recorded in
this directory; it still waits for the user.

Document sync arising from this check, for the main agent: the 226::R1 and 226::2 rows of
[checklist.md](checklist.md) (T226-1 to T226-3), as document sync items of this ticket
([ticket-226-doc-sync.md](ticket-226-doc-sync.md)), pending until done; once this check is closed, task 8 of
[ticket-226-tasks.md](ticket-226-tasks.md). Files read for this check: the coverage checklist, the #226 task list,
document sync checklist and code review record, every file in `evidence/round-2/`, #226's body, and the skill's
`logic-page-template.html` and `logic-template.js`; both test review paths were checked directly and were absent
before this record.

Status of that document sync at the incremental check (2026-10-23): the checklist rows were rewritten in cc6a9fd
and the sync item is marked done; row 226::2 needs one more change (T226-4).

### Incremental check: the probe change 0565012

Checked 2026-10-23 by an independent agent with a fresh context, at HEAD cc6a9fd with a clean tree. The fix range
handed over, 0bb5a11..0565012, is in git's notation the one commit 0565012 (0bb5a11, the evidence commit, was
read by round 1); cc6a9fd after it adds only the directed verification log and record updates. The pages and
`build/` are the same at 21a8958 and 0565012 (`git diff --stat 21a8958 0565012 -- docs/prototypes build`:
empty).

Scope, by the incremental clause:
- Tests changed in the range: `git diff --name-only 0bb5a11..0565012` lists eight files, all under
  `docs/.workings/prototype-baseline/`; the one with executable content is `evidence/round-2/verify-pages.cjs`.
  Its change, 12 lines in `driveLogic`: a loop that clicks every `[data-new]` button with one check per button,
  one check that the buttons' statuses differ, and a click back to the first entry. The checks the change
  reaches: those new checks, every `driveLogic` check after the loop (probe lines 72 to 106) and each logic
  page's "no script errors", for 3 pages alone and in the gallery. The UI-page checks and the `driveLogic`
  checks before line 60 run before or apart from the change.
- Tests that depend on changed helper code: none. The probe is no helper, and nothing imports it:
  `rg -uu --text -l 'verify-pages' .` and `/usr/bin/grep -r -a -l 'verify-pages' .` over the whole worktree
  (node_modules, hidden and ignored files included; `rg` here is a shell function that passes its arguments to
  the bundled rg unchanged) list the same five files: the probe (its usage line, the positive control), the
  directed log, the checklist and the two test review records. `probe-session-fail.cjs` requires only
  Playwright.
- Rows of the test design table changed in the range: none. The table is empty (design review skipped with TDD,
  above); this record, created in 0565012, holds no row.
- Carried over from round 1 (the post-implementation check above, on 1349d76..21a8958): the judgements on the
  `driveLogic` checks before the loop, on 226::1 and 226::3, and on resource use, together with everything in
  [ticket-250-review-tests.md](ticket-250-review-tests.md) outside the logic pages.

Handover evidence:
- Directed verification log [`evidence/round-2/directed-0565012.log`](evidence/round-2/directed-0565012.log):
  HEAD 0565012, the end of the fix range, with an empty status (no file needs a hash); lint, check:lang,
  check:nul, then the committed probes on the implementation, on a base tree and on two mutated copies; each
  command with its full output and exit code. Once its escaped code points are decoded, the committed log equals
  the raw log the run wrote in the session's temporary directory, all 862 lines. The exit codes are taken
  without a pipe (`"$@" >> "$LOG" 2>&1; code=$?`), as the runner script `directed.sh` in that temporary
  directory shows; the script is not part of the committed evidence, and the log alone does not say which code
  the base and mutated runs tested (T226-5).
- Full verification gateway log: `gate-21a8958.log`, carried over as the most recent full run (HEAD 21a8958, a
  clean status, eleven commands, every exit code 0, as round 1 found). The fix changes
  only work records, which no gateway step reads except check:lang and check:nul, both rerun in the directed log
  with exit 0. Lint ignores `docs/` (`eslint.config.js` line 39), so the directed lint step does not read the
  probe.
- Counted from the directed log: implementation 178 PASS, 0 FAIL, exit 0; base 80 PASS, 98 FAIL, exit 1; regex
  mutation 2 FAIL (visibility's tooltip check, alone and in the gallery), exit 1; throw mutation 2 FAIL (the session page's "no script errors", alone and in the gallery), exit 1; the item 5 probe 16
  of 16 after and 7 failing on the base. Against round 1's logs: the implementation run without its 18 new lines
  equals `verify-pages-after.log` line for line (diff exit 0), and the base run without them equals
  `verify-pages-base.log` except the total (86 failed there, 98 here). So the click back to the first entry
  hands the later checks the same state as before the change, and the 12 failures added on the base are the
  per-button checks.

#### Coverage

| Unit | Verification after 0565012 | Judgement |
|---|---|---|
| 226::2, entry buttons | every `[data-new]` button clicked: two per page (ok and missing, install and uninstall, cold and warm); the DOM query takes the full set, and the distinctness check requires at least two | T226-3 addressed. What the per-button check shows is limited (T226-4); an entry started after an event has been dispatched, where the entry handler must clear the receipt (`lastEvent = null`), is not driven |
| 226::R1 | rests on `directed-0565012.log` (tooltip prefix, forced receipt, regex mutation); the unknown-event reason by the diff, as row 226::R1 says | T226-1 and T226-2 resolved in the checklist. The probe's header (lines 1 and 2) notes neither the gap nor when to re-test (T226-6) |
| 250::done, the three logic pages | "no script errors" after the added clicks | judged in [ticket-250-review-tests.md](ticket-250-review-tests.md): no finding |

Fixture source: unchanged; the pages render their own mock data.

#### Case design

The loop clicks each `[data-new="<value>"]` with a real Playwright click (the values are plain words, so the
built selector needs no quoting) and reads the rendered status badge and receipt. No module is replaced, no state
is written, nothing is asserted about calls. Each page and mode still gets a fresh context, and the click back to
the first entry gives the later checks their old start state (log comparison above). No red flag.

#### False greens

Per the project capability declaration, `mutation-testing` is not enabled; mutation testing is skipped. Each
check's "when would it be red", answered against the entry handler in each page's `index.html`
(the same on all three: `lastEvent = null; state = SM.initial(<argument taken from the button's data-new>);
render()`) and the source of its expected value:
- The per-button check, "entry button <value>: a status, no event dispatched yet" (12 runs): the loop starts right
  after the first entry (probe line 54), and no event is dispatched in between, so before every click the status
  already differs from the empty dash and the receipt already reads "No event dispatched yet". The check therefore
  passes for a button whose click does nothing, and for an entry handler that does not clear an earlier receipt.
  It turns red only when the receipt's wording after the click differs from the template's: the base run's 12
  added failures are that, a Chinese receipt. Its status half is constant true where it runs. T226-4.
- The distinctness check, "each entry button gives its own status" (6 runs): red when fewer than two entry
  buttons are found (which also keeps the loop from running zero times unnoticed), or when two buttons leave the
  same status text, which a dead second button, or two buttons calling `initial()` with one argument, would
  produce. It passes on the base as well, since behaviour did not change, so no run shows it red; its red rests on
  this reading. Expected value: each entry button is an entry of its own (#226 names the entry buttons); on all
  three pages the buttons pass different arguments to `initial()`, and the status texts differ (scan-cache's by
  its cold or warm note). Were two entries ever to share a status text, the check would go red wrongly, not
  green. This check, with "after entry, a status" for the first button, is what shows that each button starts
  an entry.
- The later `driveLogic` checks and the logic pages' "no script errors": the same values as in round 1 (log
  comparison above), so round 1's answers stand. The tooltip check's red is now shown with the committed probe:
  under the regex mutation, which the log shows reached one line of visibility's `logic.js`, only visibility's
  tooltip check fails, alone and in the gallery. "No script errors" now also covers errors thrown by the added
  clicks.
- Read against review-code's false-greens forms for browser checks: existence standing in for effect (form one)
  is the per-button status half, T226-4; no synthetic path (form two), the clicks are real; a check never seen
  red (form four) is the distinctness check, red by reading only, as above; no early read (form five), since the
  handler runs synchronously inside the click and the reads return each button's own status; no command error
  taken for data (form six), the exit codes are taken without a pipe; the object is reached (form nine), the
  gallery runs read each page's frame and the values differ per page.

#### Resource reuse

No test resource is added or changed: the change adds clicks inside a page context that already exists. The
directed log has no load or launch output to count from; by the code, Chrome is launched once per run (probe line
110) and one context is opened per page and mode (22 per run, in `open()`), as in round 1, whose measurements
(0.7s per launch, 0.2 to 0.3s per context) stay under the one-second threshold. Carried over from round 1.

#### Findings and document sync

| Finding | Basis | Recommended disposition |
|---|---|---|
| T226-4: the per-button entry check cannot go red for a dead button or for a receipt that is not cleared, because both of its halves already hold before each click; row 226::2 of the checklist and the 0565012 commit message present "each starts its own entry with an empty receipt" as verified | False greens | Now, in the probe: start each entry click from a state the click has to change. Recommended: dispatch a legal event first (the receipt then reads "Dispatched ..."), then click the entry button and keep the check, which then goes red for a dead button and for an uncleared receipt (clicking reset before each entry is the lighter variant; it catches a dead button only). This changes the probe's executable content: rerun the directed verification (green on the implementation, red on the base for the wording), then a further incremental check, as `/implement` step 6 requires. If the probe is kept as it is: correct row 226::2 instead, saying that the distinct statuses show each button starts an entry, that the per-button check shows the receipt's wording, and that an entry after an event is not driven |
| T226-5: the directed log does not say which code its base and mutated runs tested: no base commit, no mutation text; the runner script `directed.sh` that holds both (`git archive 1349d76`; the two substitutions) lives only in the session's temporary directory | Handover evidence | Now: keep `directed.sh` beside the log in `evidence/round-2/`, or write the base commit and the two substitutions into the log's header, and cite it from row 226::R1 and the 0565012 row of the checklist. Records only; no further check |
| T226-6: the probe's header does not note its known gap, the unknown-event reason, which no button reaches (it is recorded only in checklist row 226::R1) | Coverage | Now: add a header line to `verify-pages.cjs`: the unknown-event reason (`deny('unknown event')`) has no trigger on the pages, since every button's event has a reducer case, so it is checked by the diff; re-test when a page gains an event without one. Comment only: per `/implement` step 6, the judgement that the executable content is unchanged goes into the work record, and no further check is needed. It can ride with T226-4's probe change |

Document sync, for the main agent. Facts taken from 0565012 and its directed run; scope per the document-sync
rules: all 23 files of `docs/.workings/prototype-baseline/` (each tracked; `find -type f` and `rg -uu --files`
both list 23), and the whole worktree searched for the probe's name (above) and for `directed-0565012`,
`T226-<n>`, `T250-<n>` and `prototype-baseline` (`rg -uu --text`, node_modules left out, which the first search
covered); every hit is in that directory, so the root documents (`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, both
READMEs), `docs/specs`, `docs/features`, `docs/adr` and `docs/agents` state none of these facts. `docs/prototypes`
is left out because the range changes no page. Results:
- [checklist.md](checklist.md): the 0565012 row (178, 98, 2 and 2; the item 5 probe's 16 and 7) matches the log;
  row 226::R1 matches it, with T226-5 on its evidence; row 226::2 says more than the probe shows (T226-4).
- [ticket-226-review-code.md](ticket-226-review-code.md), Consistency: the rerun statement matches the log; O1 is
  judged there.
- [ticket-226-doc-sync.md](ticket-226-doc-sync.md): its row for T226-1 to T226-3 stays done for what it lists;
  T226-4 to T226-6 need their own item, pending until done.
- [ticket-226-tasks.md](ticket-226-tasks.md), task 8: it says the probe change goes to an incremental check; its
  state needs this check's outcome once the findings are handled.

Files read for this check: this record and the #250 one, the coverage checklist, both tickets' task lists and
document sync checklists, the #226 code review record, the probe, the directed log in full and the gateway log's
header and exit codes, `verify-pages-after.log` and `verify-pages-base.log` (compared by `diff` with the
directed runs), the eslint configuration's ignore block, the visibility page's script and the three pages' entry
handlers, and the bodies and comments of #226 and #250. Both test review paths were read in full before this
section was added.
