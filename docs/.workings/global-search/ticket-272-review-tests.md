# Test review — #272

Ticket: [#272](https://github.com/aloong-planet/agentshed/issues/272) · feature `global-search` · branch
`feat/global-search-exits`. Scope: the e2e cases this ticket adds for the session page's two exits and the way
back to the results; no unit case — the origin of an opened session lives in the app's navigation state, whose
only seam is the window.

## Design review

Checked 2026-10-19. Implementation version: 5dfbf0d (main, where the work began). Requirement source: the
global-search spec (US-003/AC-01–AC-05, J1's exits, J3–J7) and session-view P10, as quoted in #272. Rechecked
the same day against `/review-tests` reloaded after a context compaction; the dimensions below are that recheck.

### Test design table

Seam: e2e under the built Electron app over #271's fixture home (`mkHome` in the global search spec file:
a target project below the list's fold, a stale project, a Codex fork pair with its parent, fillers).
Expected values are literals from that fixture and the copy table.

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| E8 | global-search.spec · the two exits | US-003/AC-01, AC-02; J1; J3; P10; Evidence for AC-01 (AC-05 dropped 2026-10-20: E8 takes "Back to search results", not the rail — F5) | e2e, `AGENTSHED_RESCAN_MS` | a keyword, oldest first and a scrolled list; a hit opened; a question appended to that session and a rescan while its page is on screen; then "Back to search results" | one row of two exits in that order — the texts "Back to search results" and "Go to target-proj · Sessions", a left then a right chevron (the icons' path data); after the return: the same keyword, sort and scroll position, and the new hit (151 rows); screenshots in light and dark | #271's home | one launch |
| E9 | global-search.spec · on into the project | US-003/AC-03 (both forms); US-003/AC-04 (fork parent, after going into the project); J4; J5 | e2e | a hit in the target project, then the second exit, then another session from its Sessions tab; a hit in the stale project, then its second exit; the stripped fork's hit, then the banner's parent link, then its back control | the project's detail on its Sessions tab, and the single back control ("Back to target-proj · Sessions") on the next session; the stale exit reads "Go to stale-proj" and lands on the stale note page (its tag, no tabs); the parent page has the single back control, which leads to fork-proj's Sessions tab | #271's home | one launch |
| E3 (#271's, changed) | global-search.spec · going to a hit | US-003/AC-01 (the jump's arrival), replacing #271's single back control there; S12 and CON-002's path into the Sessions tab | e2e | as #271 designed it; the step that reached the project's Sessions tab now takes the second exit, as a hit's session offers no single back control | on arrival, the two exits' texts in order, where #271 asserted "Back to target-proj · Sessions" (#271 shipped the single control until this ticket; the spec's Pending note said so); the rest as #271 designed it | #271's home | two launches, as #271 designed it: the second is the restart under test (corrected 2026-10-20 — F6) |
| E10 | global-search.spec · leaving and coming back while the session is open | J6; J7; US-003/AC-05 | e2e | a session from a hit on screen; the rail's Search, a new keyword, the rail's Projects; then another project clicked in the list, the rail's Search and Projects again | after the keyword change the session page is still there with its two exits, and "Back to search results" shows the new keyword's results; after another project is selected its page replaces the session, the Search item shows the page as left, and Projects shows that project rather than the session | #271's home | one launch |

Added 2026-10-19 during the cycle, before the change was made (an incremental review of one row): E3 is #271's
case, whose assertion of the single back control on a hit's session was #271's behaviour and is US-003's to
replace; it failed on the first run of the whole file with the exits in place, for that reason.

Capability: per the project's capability declaration, `red-green-mutation` is not enabled (declared 2026-10-19
on the owner's answer, in this ticket's branch — the ID was missing from `capabilities.toml`, so it was asked
rather than defaulted). Red first for these new-behaviour cases is therefore not required, and mutation testing
in the post-implementation check is skipped on that ground; what was done anyway is recorded there as extra
evidence, not as a requirement met.

Process note, stated rather than smoothed over: E8–E10 were written together and run red together before the
implementation, not one case and one slice at a time as `/tdd`'s loop rule asks. The implementation they waited
on was one slice (the origin of an opened session and the exits row), which all three needed; the deviation is
recorded here, not repeated.

### Dimension 1: Coverage

The spec's failure modes this ticket owns, against the table: J1's exits E8 (and E3); J3 E8; J4 E9; J5 E9; J6
E10; J7 E10. US-003/AC-01 E8 and E3; AC-02 E8; AC-03 E9, both forms; AC-04 E9 for the fork parent and for a
session opened after going into the project — "any session opened inside a project" is the existing single
back control, held by the existing session page cases in the app spec, which click it by its "Back to" text;
AC-05's session-page path E3 (the rail's Search from a hit's session) and E10 (corrected 2026-10-20 — F5). P10 is AC-01 and AC-04 together. CON-004's exits copy is held by the gates
(`pnpm typecheck`, `pnpm check:i18n`, `pnpm check:ui`), not by a case. No gap; nothing is untestable, so no gap
note is needed in the test file's header.

Each claimed boundary names the input that reaches it: J3's rescan is the appended question under
`AGENTSHED_RESCAN_MS`; J4's is the click on a session in the Sessions tab reached through the second exit; J5's
is the banner's parent link; J6's is the click on another project's row; J7's is the rail's Search, a new
keyword, then the rail's Projects; the stale form is the hit in the fixture's stale project.

Fixture source: the cases read #271's home unchanged, and drive the app's navigation rather than a data shape of
their own; the shape of that home's session files was judged in #271's test review (its Dimension 1), and holds
as the home is unchanged.

### Dimension 2: Case design

Each case launches on its own userData and home, so it is isolated and repeatable, and each asserts the effect
of every step it takes. The red flags, one by one: no module of the project is replaced (no `vi.mock`, no
`vi.spyOn`; these are e2e cases on the built app); nothing private is read and no state is written directly —
every step is a click or a keystroke in the window, and the appended question is a write to the agent's own
session file, the path a real agent takes; no call count or order is asserted; nothing is verified around the
window — the results, exits and pages are read from it; every state the cases reach is reached through the
window. The chevrons are identified by their path data, the only thing that tells a left chevron from a right
one.

### Dimension 3: False greens (the three judged on the design)

- Constant truth: each "single back control" assertion is an array of one text, which also asserts the count,
  so a page drawing both forms at once fails it; E8's 151 rows exceed the 150 the keyword hits before the
  rescan, so the count cannot be met without the rescan's update.
- Tautology: every expected value is a literal — the fixture's project names and questions, the English copy
  as the spec words it, the chevrons' path data as Lucide draws them — or a value measured in the window
  before leaving (E8's scroll position, measured after the row is brought into view, as #271's case learnt).
- Stale path: the assertions read the exits row the change adds and the single back control the session page
  draws today; #271's assertion of the single control on a hit's session is the stale one, and E3's row
  replaces it.

### Dimension 4: Resource reuse

The expensive resources: the build. An Electron launch was called one here too ("over a second"), but the
gateway's log puts whole launching cases at 604–648 ms, under the 1 s threshold (corrected 2026-10-20 — F8); the
conclusion below does not rest on it. The build happens once per
`pnpm e2e`, by its script, before Playwright; each case launches the app once, through the spec file's existing
`mkHome`, `launch` and `close` helpers, which every case in the file uses — the existing pattern, followed. A
launch cannot be shared across cases: each case writes its own home and userData, and the app reads both at
start. Planned: three launches for E8–E10, E3's unchanged.

## Post-implementation check

Checked 2026-10-19, after the full gateway passed on 7d8ea36 (`pnpm verify` exit 0: 863 unit and 102 site
cases, 145 e2e, smoke). Implementation version: 7d8ea36 — the exits (09966e1), the owner's refactors (5bd38dd),
the icon module's note (7d8ea36); the e2e file's header comment was updated after the gateway, shown to be
comment-only (its comment-stripped TypeScript output identical, 30225 bytes; no code reads comments; lint
green).

This check was run by the implementing agent, in the conversation that wrote the tests, not by an independent
reviewer. The `/implement` text loaded for this ticket did not ask for independence; the text reloaded at the
merge (2026-10-20) has the post-implementation check handed to a sub-agent that does not inherit the
implementation's conversation, or, where none can be started, this statement. The owner asked for an
independent check on 2026-10-20: it is the section "Post-implementation check (independent)" below. Where the two
differ, that section stands: its capability findings (C1, C2), J11 (F1: no case, and the measurement taken below
the window's minimum width), E8's attribution to AC-05 (F5), E3's design-table row (F6) and the launch time (F8)
replace what this section says about them.

### The written cases against the test design table

| # | Seam | Driving input | Assertions and expected values | Fixture | Resources | Conclusion |
|---|---|---|---|---|---|---|
| E8 | as designed | as designed; the scrolled list's position is read after the hit row is brought into view, then the row is clicked | as designed, plus the read position is checked to be past the scroll set (above 400), so the comparison is not of two zeros | #271's home | one launch | Consistent |
| E9 | as designed | as designed | as designed, plus the stripped fork's session is checked to have its two exits before the banner is followed, so the single control after it is a change and not the starting state | #271's home | one launch | Consistent |
| E10 | as designed | as designed; the second keyword is "stale", whose one hit is asserted by the results header | as designed | #271's home | one launch | Consistent |
| E3 (#271's, changed) | as designed | as designed | as designed | #271's home | two launches, #271's design (its relaunch for the empty page after a restart) | Consistent |

The test file's header names what the file covers, the exits now included; this ticket adds no gap to its known
gaps.

### Dimension 1: Coverage

Unchanged from the design review: J1's exits, J3–J7, US-003/AC-01–AC-05's paths and P10 each have a case; J11,
added to the spec on this branch, is held by evidence (the narrowing measurement in the code review), not a
case. Each case's boundary is reached by the input the design names.

### Dimension 2: Case design

Unchanged: no red flag in the written cases (no module replaced, no state written around the window, no call
counts, nothing read around the window, every state reached through the window).

### Dimension 3: False greens

Per the project's capability declaration, `red-green-mutation` is not enabled, so mutation testing is skipped
as a requirement. When each case goes red, answered against the code it covers:

- E8: no exits row, the exits in the other order or with the wrong chevron; "Back to search results" not
  reaching the search page, or the page not as left (keyword, sort, scroll position); the rescan's update not
  reaching the kept results (151 rows).
- E9: the way into the project not landing on its Sessions tab; the stale exit keeping "· Sessions" or not
  reaching the stale note page; the origin surviving into a session opened from the project, or into the fork
  parent; the parent's back control not leading to its project's Sessions tab.
- E10: the rail dropping the origin (the exits gone after Search and back); "Back to search results" not showing
  the new keyword's results; another project's selection not replacing the session; the Search item not keeping
  the page; Projects showing the old session after another project was chosen.
- E3: the arrival without the two exits; the second exit not reaching the Sessions tab (the sort steps after it
  then fail).

Taken anyway, as evidence rather than a requirement, on 09966e1 before the refactors
([mutations](evidence/ticket-272/mutations.mjs), [results](evidence/ticket-272/mutations-output.json),
[joint](evidence/ticket-272/mutation-joint-output.json)): eight mutations of the exits' wiring each turned red at
the assertion that guards them (M1, M3–M8, and M11 for the three origin clears removed together); M2, M9 and M10,
each one origin clear removed alone, survived as equivalent — the redundancy the refactor R-b then removed by
holding the origin in the open session's value. Each was built before its run, reached its target (the red
lines are the guarding assertions), and was restored byte for byte (hashes compared). They are not claimed for
5bd38dd's structure, on which the cases themselves ran green.

The browser-assertion forms: every assertion reads an effect — texts, the icons' path data, the page shown (its
title, tabs, the box's value), counts — not presence alone; the scroll position is polled on the asserted
expression itself; the arrays of texts assert their counts; every call is awaited.

### Dimension 4: Resource reuse

From the gateway's run: the e2e stage built once (`electron-vite build`, its main, preload and renderer bundles
built once each), and the three new cases launched the app once each, through the file's shared `launch`; the
count does not grow with the number of assertions in a case. As designed.

## Post-implementation check (independent)

Checked 2026-10-20, independently of the implementing agent: run by a sub-agent that does not share the
conversation that wrote the tests. The section above was read, but its conclusions were not taken as given.
Ticket: #272 (feature `global-search`); test review path: this record, the ticket's. Implementation version
checked: f0d7027, the squash merge of #282, whose tree equals the PR head f5ec41f. Its code and tests equal
7d8ea36's except for one comment in the e2e file's header (`git diff 7d8ea36 f5ec41f -- e2e src`), and 7d8ea36 is
where the full gateway ran: `pnpm verify` exit 0, its raw log [verify-7d8ea36.log](evidence/ticket-272/verify-7d8ea36.log)
(863 unit, 135 script, 102 site and 145 e2e cases, the e2e on one worker and each passed on its first run, then
smoke). That log is ignored by the repository's `.gitignore` (`docs/.workings/`) and is not tracked yet; it stays
this section's raw evidence only once force-added. The gateway was not re-run for this check. Scope: E8, E9, E10
and E3's changed lines in `e2e/global-search.spec.ts`, read against the global-search and session-view specs and
the code under test (`App.tsx`, `SessionPane.tsx`, the `.exits` and `.sback` rules in `theme.css`, `icons.tsx`, the
six dictionaries).

### Capability declaration

`capabilities.toml`, parsed with Python's `tomllib`: `client-framework`, `working-language`, `i18n`,
`enumeration-wording-gate`, `lint`, `e2e-suite`, `theming` and `macos-distribution` (with both profiles) are
registered and well formed. Two findings:

- **Unconfirmed `mutation-testing`** (C1). The registry's ID for the mutation switch is `mutation-testing`, and the
  file has no entry for it, so it is unconfirmed: neither enabled nor not enabled. The registry's recommended
  answer is its default, `enabled = false`. For the owner's answer, as context and not as a substitute: on
  2026-10-19 the owner answered "not enabled" to the predecessor ID's question (53e3ab3), an ID that also covered
  red-first.
- **An ID outside the registry: `red-green-mutation`** (C2). The skills renamed it to `mutation-testing` in their
  b47ea33 (2026-10-19 23:05:43 +0800), two minutes before 53e3ab3 (23:07:39) declared it here. The design review's
  capability paragraph, the section above and the document sync checklist's capability row rest on it.

The mutation half of Dimension 3 is therefore not decided here.

### The written cases against the test design table

| # | Seam | Driving input | Assertions and expected values | Fixture | Resources | Conclusion |
|---|---|---|---|---|---|---|
| E8 | as designed (e2e, `AGENTSHED_RESCAN_MS` 1500) | as designed; the hit row is brought into view before its position is read | as designed, plus the read position past the 400 set, and the session page's own 151 questions as the sign that the rescan arrived | #271's home | one launch | Consistent in mechanics; the row's AC-05 entry is not reached by its input (F5) |
| E9 | as designed | as designed | as designed, plus the fork child's two exits before its banner is followed | #271's home | one launch | Consistent |
| E10 | as designed | as designed; the second keyword is "stale" | as designed, plus the session still on the stage after "Back to search results" and Projects | #271's home | one launch | Consistent |
| E3 (changed lines) | as designed | as designed | as designed | #271's home | two launches (#271's relaunch for the empty page after a restart) | The row's resource cell says "unchanged: one launch" (F6) |

Test file header: its three known-gap notes are #271's and still hold; #272 adds neither a case nor a gap note for
J11 (F1).

### Dimension 1: Coverage

The spec units this ticket owns, each with its case and the input that reaches it:

| Unit | Case | Input that reaches it | Verdict |
|---|---|---|---|
| US-003/AC-01, J1's exits, session-view P10 | E8, E3 | a hit row clicked | Covered: texts, order, the chevrons' path data |
| US-003/AC-02, J3 | E8 | oldest first, a scroll past 400, a question appended under a 1.5 s rescan while the session is on screen, then the first exit | Covered |
| US-003/AC-03, J2's exit | E9 | the second exit on target-proj's hit and on stale-proj's | Covered, both forms |
| US-003/AC-04, J4, J5 | E9 | a session clicked in the Sessions tab after the second exit; the fork child's banner link | Covered; "any session opened inside a project" is the app spec's session-page cases |
| US-003/AC-05 from a session page | E3 (the rail's Search from the hit's session), E10 | the rail's Search item | Covered; E8 is also counted for it but takes the exit, not the rail (F5) |
| J6, J7 | E10 | another project's row; the rail's Search, a new keyword, then Projects | Covered |
| J11 | none | none | Not covered, and testable (F1) |
| CON-004 for the exits | gates | `Locale = Dict<typeof zh>`, so `pnpm typecheck` fails on a key missing in any language | Covered for presence; the non-English wording is not asserted |

Regression points the change touches:

| Point | Held by | Verdict |
|---|---|---|
| The single back control's handler, now shared with the second exit | the app spec's session-page cases that click it; E9 | Covered |
| The single back control's look and its new one-line cut (`white-space: nowrap`, the span's ellipsis) | no case; a one-off measurement | Part of F1 |
| A project search hit's locating focus, now `focusQ` in the open session's value | app spec, "session search: … clicking a hit goes straight to that question" | Covered |
| The fork banner's jump drops the origin | E9 | Covered |
| The fork banner's jump drops the locating focus (`focusQ: null`, rewritten by 5bd38dd) | no case | F2 |
| A project selected while a session is open | E10 (J6); the app spec's project switch cases | Covered |
| A session opened from a card header (US-002/AC-02): the same `openFromSearch`, so it has the exits | E3 reaches it and asserts no exits | F4 |
| A hit whose session cannot be opened (J8): the exits row is drawn outside the loaded content | the J8 case reaches it and asserts no exits; the code review says "read from the code, not run" | F3 |

Fixture: the cases read #271's home, whose shapes #271's review judged against real samples. The exits read two
fields from it, a project's name and stale flag, which that home already carries. The one shape the exits are
sensitive to, a name long enough to be cut, is absent: the longest project name in the home has 11 characters.
That is F1's missing input.

### Dimension 2: Case design

No red flag in E8, E9, E10 or E3's changed lines, each checked: no module of the project is replaced (e2e on the
built app; no `vi.mock` or `vi.spyOn` in the file); nothing private is read and no internal state is written. Every
step is a click, a keystroke, a scroll of the results body, or `appendQuestion`'s write to the agent's own session
file in its line shape. No call count or order is asserted. Nothing is verified around the window: texts, path data,
counts, values and scroll positions are read from it. Every state reached is reachable through the window. Each
case has its own home and userData and removes both. The chevrons are told apart by their path data; the test's
literals equal Lucide's paths in `icons.tsx` (`m15 18-6-6 6-6`, `m9 18 6-6-6-6`) and are written in the test, not
imported.

### Dimension 3: False greens

Mutation testing: not decided, because `mutation-testing` is unconfirmed (C1). If the owner declares it enabled,
it is owed on f0d7027's structure: the mutations recorded in the section above ran on 09966e1, before 5bd38dd
replaced the hand-cleared origin with the open session's value, and do not stand for the shipped code.

When each case goes red, answered against the code at f0d7027:

- E8: `openFromSearch` not marking the session as opened from search; the exits in the other order, with other
  copy or another chevron (the texts and path data are compared exactly); "Back to search results" not reaching the
  search page (`dim-search`); the kept page losing its keyword, sort or scroll position; the kept results not
  following the rescan (151 needs the appended question: the keyword hits one session of 150 questions).
- E9: the second exit not reaching the project's detail on its Sessions tab (the `h1` and the selected tab); the
  stale flag not reaching the copy, or the stale exit not reaching the stale note (its tag, no tabs); a session
  opened from the Sessions tab, or the fork parent, keeping the origin (the arrays of one text fail on two
  controls); the parent's back control not reaching fork-proj's Sessions tab.
- E10: the rail dropping the open session or its origin; "Back to search results" not showing the new keyword's
  page; a project selection not replacing the session; the Search item losing the page; Projects showing the old
  session after another project was chosen.
- E3's changed lines: the arrival without the two exits; the second exit not reaching the project.

What none of them goes red on: the exits' and the single back control's one-line cut (F1); the locating focus
carried into the fork parent (F2); the error page without the exits (F3); a card header's session without the exits
(F4); the five non-English wordings.

The forms, one by one. Constant truth: each "single back control" assertion is an array of one text, so it also
asserts the count; 151 needs the rescan; the read position is asserted past 400 before it is compared. Tautology:
every expected value is a literal (fixture names and questions, the English copy, Lucide's path data) or a position
measured in the window before leaving. Stale path: no assertion reads the single back control on a hit's session any
more; #271's one was replaced. Conditional skip: no branch or early return in the four cases. Assertions that may not
run: every locator assertion is awaited; the file's 23 synchronous `expect(` calls are all on values already read
(errors, `left`, evaluated results), found with `rg` over the file, its 13 `expect(l.errors` lines the positive
control.

Browser-assertion forms (review-code's false-greens list). Presence for effect: the stale note's tag is a presence
check, paired with the `h1` text and the tabs' absence; each absence assertion (`.pane-head .tabs`, `.pane-head
.stitle`) has its locator shown live earlier in the same case. Reading too early: the scroll position is polled on the
asserted expression, and the rescan is waited for on the asserted count; one evidence artefact is read too early, E8's
dark screenshot, saved right after `emulateMedia({ colorScheme: 'dark' })` with no wait for a repaint, where #271's
first case polls a computed colour first (F7); the committed dark screenshot is dark, checked by eye. Geometry: #272's
cases assert none. J11's only verification is evidence, taken at 640, 560 and 500 px wide after `narrow.mjs` lowered
the window's minimum size to 200 px, while the main window has `minWidth: 800` (`src/main/index.ts`): the cuts were
shown in states the window cannot reach, and at 640 px and wider that data's project name was not cut. It shows the
CSS mechanism; it does not drive J11's reachable form, a long name (F1).

### Dimension 4: Resource reuse

Counted from the gateway's log: the e2e stage built once, one `electron-vite build` with its main (863 ms), preload
(45 ms) and renderer (580 ms) bundles once each, before the 145 cases on one worker; the global setup makes the quiet
Electron copy once. The log prints nothing per launch, so launches are counted from the code: E8, E9 and E10 one
each, E3 two, all through the file's shared `launch`; the count does not grow with the number of assertions. As
designed.

The design review calls a launch "over a second"; the log contradicts it. Whole cases that launch, assert and close
take 604–648 ms (in `app.spec.ts` the cold start, the empty sidebar and the two UI language cases; "nothing to
search" in this file). By the skill's 1 s threshold a launch is not an expensive resource. The conclusion stands
either way: every case writes the instance's run state (its navigation and the search page kept for the run), so an
instance cannot be shared (F8).

### Findings

| # | Dimension | Case or file | What is wrong | Evidence | Recommended change |
|---|---|---|---|---|---|
| F1 | Coverage | J11; `e2e/global-search.spec.ts` | J11, a "Failure modes and boundaries" entry, has no case and no gap note; the coverage checklist plans it as evidence only. It is testable at this file's seam. The single back control's new one-line cut is untested too | The checklist's J11 rows; `narrow.mjs` ran once on real data, below the window's 800 px minimum; precedents in the suite: `BrowserWindow.setSize` (`app.spec.ts`), `Range.getClientRects` line counts (`settings-updates.spec.ts`, `app.spec.ts`) | Add a row to the test design table, review it as a design-review row, then write it: a registered project with a long directory name; its hit at the 800 px minimum width; each exit's text on one line (its client rects on one top), cut (`scrollWidth > clientWidth`, `text-overflow: ellipsis`), the row's right edge inside the header's content box; then the single back control the same, after the second exit and a session opened there. Show it red once by removing `white-space: nowrap` from `.sback`. If the owner rules J11 evidence-only, record that ruling; a header gap note is for what cannot be tested, which J11 is not |
| F2 | Coverage | E9's fork step | The fork banner's jump sets `focusQ: null` (`App.tsx` line 391, rewritten by 5bd38dd); no case asserts the parent opens with no located question. Were the child's focus (turn 1) carried over, the parent's question 1 would be located and every case would stay green | E9 lines 553–557 assert the parent's questions and its single control only; no other case jumps from a located session | In E9 after the banner, `await expect(win.locator('.qlist .q.located')).toHaveCount(0)`; `openHit`'s located assertion shows the locator live in the same case |
| F3 | Coverage | the J8 case ("a hit whose session file is gone…") | The exits on a hit's session in its error state are asserted nowhere; US-003/AC-01 covers every session opened from a hit, and an error page is where the way back matters most | The J8 case asserts only the error line; the code review states the exits there as "read from the code, not run" | In the J8 case, assert the two exits' texts and that the first returns to the search page with the keyword "twin"; no launch added |
| F4 | Coverage (spec question) | E3, the card header step | A card header opens its session through the same `openFromSearch`, so it has the exits, but no case asserts it, and the spec does not say whether a card header's session counts as "opened directly from a global search hit" (US-002/AC-02: "does the same") | E3 lines 335–338 assert the title and no located row only | Confirm with the owner that a card header's session has the exits, as shipped; then assert them in E3 after the card header click. If the owner answers otherwise, it is a code change |
| F5 | Coverage (accounting) | the test design table's E8 row; the coverage checklist's AC-05 row for #272 | E8 is counted for US-003/AC-05, but it takes "Back to search results", not the rail's Search item, so its input does not reach AC-05. No coverage is lost: E3 (the rail's Search from a hit's session) and E10 hold it | E8's steps; AC-05's wording | Drop AC-05 from E8's row and from the checklist's attribution, naming E3 and E10; no test change |
| F6 | Case design (table consistency) | the test design table's E3 row | Its resource cell says "unchanged: one launch"; the case launches twice. The section above noted two launches but left the row | E3's body (`launch`, then a relaunch on the same userData) | Correct the cell to two launches, both needed (the second is the restart under test), reviewed as a design-review row |
| F7 | False greens (evidence) | E8 lines 507–510 | The dark screenshot, cited as AC-01's evidence, is saved right after `emulateMedia` with no wait, so a later run can save a frame not yet repainted under the dark name | #271's first case polls a computed colour (lines 243–245) before its dark screenshot; E8 does not | Poll a computed colour of the pane to change before the dark screenshot, as #271's case does |
| F8 | Resource reuse (record) | the design review's Dimension 4 | "An Electron launch (each over a second)" is contradicted by the log (whole launching cases in 604–648 ms) | the gateway log | Correct the statement; no test change |
| C1 | False greens (switch) | `capabilities.toml` | `mutation-testing` unconfirmed | parsed file; the registry | The owner answers; the registry's recommended answer is `enabled = false`. If enabled, mutation testing on f0d7027 |
| C2 | (declaration) | `capabilities.toml` | `red-green-mutation` is not a registered ID | the registry; skills b47ea33 against 53e3ab3 | Replace it with `[mutation-testing]` on the owner's answer to C1 |

Sync obligations these findings create, for the ticket's document sync checklist (not edited here): the capability
row, Done on an ID no longer registered, reopens until C1 and C2 are settled; the coverage checklist's J11 rows
(planned as evidence, "Passed" on the below-minimum measurement) follow F1's outcome, and its AC-05 attribution F5;
the test design table's E3 and E8 rows follow F5 and F6; the section above states `red-green-mutation`, J11 held by
evidence and "no gap", which this section contradicts, and was left unchanged here as asked; the gateway log needs
force-adding to stay as evidence.

### Dispositions

Recorded by the main agent, 2026-10-20, from the owner's answers the same day (translated from the owner's
Chinese); the findings above are the sub-agent's and are unchanged.

- C1, C2: `mutation-testing` not enabled; the declaration's `red-green-mutation` is replaced with
  `[mutation-testing] enabled = false`.
- F1: J11 gets an e2e case at the window's 800 px minimum with a long project name, for the exits and the single
  back control, as recommended.
- F4: a session opened from a card's header is opened from a hit and keeps the two exits, as shipped; the spec's
  US-003/AC-01 is to say so, and E3 asserts them.
- F2, F3, F5–F8: as recommended.
- All of them in one follow-up PR, before #273. The previous section's statements are kept as its record, its
  second paragraph naming where this section supersedes them; the force-added log is this section's evidence.

## Design review (follow-up)

Checked 2026-10-20, before any test was written or changed. Implementation version: f0d7027 (main, #282's
merge); the follow-up changes tests, records and the spec's wording only. Requirement source: the global-search spec
(J11; US-003/AC-01 as clarified for a card's header, the owner's answer of 2026-10-20; J8; US-003/AC-04) and the
independent check's findings F1–F7 above. Rows added or changed:

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| E11 (new) | global-search.spec · a long project name at the window's minimum width | J11; the single back control's one-line cut (session-view's feature entry: the back button on one line) | e2e; the window set to 800 × 700 through `BrowserWindow.setSize`, as app.spec's minimum-width cases do, polled until `innerWidth` is 800 | #271's home plus one registered project whose directory name is 74 characters, with one Claude session holding "quasar" (no other fixture text does); its hit opened at 800 px; then the second exit, and that session opened from the project's Sessions tab | for each exit's text, then the single back control's: one line box (a line count over its text's client rects, as settings-updates.spec counts lines), cut (`scrollWidth > clientWidth`), `text-overflow` `ellipsis`; the two exits on one top; each control's right edge inside the header's content box (the header's own rect minus its right padding) — literals and the header's own measurement | #271's home; the long name is shaped like this machine's registered directory names (hyphenated words; 61 registered, the longest 47 characters), made longer so that the single back control overflows too | one launch |
| E9 (changed) | global-search.spec · on into the project | US-003/AC-04's fork parent; the regression point that the banner's jump opens the parent without a located question (F2) | e2e | as designed; the fork child opened from its hit, then the banner | before the banner, the child's focused question is numbered 01 (the corpus numbers the questions shown after the strip from 1), asserted on its number rather than its row's position (corrected 2026-10-20 — G1), so a focus carried over would locate the parent's question 01; after it, no `.q.located` and no `.q.focused` | #271's home | one launch, unchanged |
| E4 (#271's, changed) | global-search.spec · a hit whose file is gone | J8; US-003/AC-01 on a session that cannot be read (F3) | e2e | as #271 designed it, then the first exit | after the error line, the two exits' texts in order ("Back to search results", "Go to twin · Sessions"); after the first exit, the search page with the keyword "twin" | #271's home | one launch, unchanged |
| E3 (#271's, changed again) | global-search.spec · going to a hit | US-002/AC-02's session has US-003/AC-01's exits (F4) | e2e | the card header's click, as #271 designed it | after it, the two exits' texts in order | #271's home | two launches, unchanged |
| E8 (changed) | global-search.spec · the two exits | the dark evidence screenshot (F7) | e2e | `emulateMedia` dark | the first exit's computed colour polled until it differs from its light value, then the screenshot, as #271's first case waits on a card's background | #271's home | one launch, unchanged |

### Dimension 1: Coverage

J11 now has a case (E11), reaching both of its forms at once: a long name at the narrowest window the app allows.
The three regression points without an assertion each gain one: the fork parent's locating (E9), the exits on a
session that cannot be read (E4), and a card header's session (E3). E8's attribution to AC-05 is dropped; E3 and
E10 hold AC-05. Each new assertion names the input that reaches it: E11's is the long name at 800 px; E9's is the
banner from a session whose located question is its first; E4's is the removed file; E3's is the card header.
Fixture: one project is added for E11 only, in its own home, so the counts the other cases assert are unchanged.

### Dimension 2: Case design

No red flag. The window is resized through Electron's window API, as a user resizing it would, and every other
step is a click or a keystroke; nothing private is read, nothing is written around the window, no call is counted.

### Dimension 3: False greens (the three judged on the design)

- Constant truth: "cut" needs an overflow, which the 74-character name at 800 px makes; "one line" needs the
  no-wrap rule, without which the text would wrap rather than cut, failing both; the located guard in E9 makes
  the absence after the banner a change, not a starting state.
- Tautology: every expected value is a literal or the header's own measured box.
- Stale path: none; the assertions read the controls the page draws today.

### Dimension 4: Resource reuse

The build, once per `pnpm e2e`. E11 adds one launch through the file's `launch`, with its own home and userData,
as every case here does; the changed cases add none.

## Post-implementation check (follow-up, independent)

Checked 2026-10-20, independently of the implementing agent: run by a sub-agent that does not share the
conversation that wrote the follow-up, with `/review-tests` loaded by the sub-agent itself. The sections above were
read; their conclusions were not taken as given. Ticket: #272 (feature `global-search`), reopened for this
follow-up; test review path: this record, the ticket's. Implementation version checked: db77a8e on
`test/global-search-exits-followup` (5e667e9 before it), against 41f8a0d. The follow-up changes tests, the capability
declaration, the spec's US-003/AC-01, two feature entries and records; the application code is f0d7027's
(`git diff f0d7027 db77a8e -- src` is empty). Gateway: [verify-followup.log](evidence/ticket-272/verify-followup.log),
`pnpm verify` exit 0 as reported (863 unit, 135 script, 102 site and 146 e2e cases, the e2e on one worker with no
retries configured, then smoke). It ran on db77a8e's tree: the e2e file was last written at 13:50:34 and
`capabilities.toml` at 13:53:24, before the run began (the unit stage at 13:54:46, the e2e build after it); the
worktree is clean at db77a8e; and the log's case lines (144 to 649) are the file's. The gateway was not re-run for
this check. Scope: the five rows of "Design review (follow-up)" and their lines in `e2e/global-search.spec.ts`, read
against the global-search spec (US-002/AC-02, US-003, J8, J11), session-view (P2, P4, P10), the code under test
(`SessionPane.tsx`, `App.tsx`, `GlobalSearchPane.tsx`'s card header, the `.exits`, `.sback` and pane rules in
`theme.css`, the main window's minimum size in `src/main/index.ts`), the session page prototype's exits rules, and
the J11 screenshot the gateway's run wrote (`e2e-out/global-search-exits-long.png`, ignored by the repository).

### Capability declaration

`capabilities.toml`, parsed with Python's `tomllib`, against the registry: the nine registered IDs are present and
well formed (`macos-distribution` applies, `client-framework` being `"electron"`, and carries both profiles);
`[mutation-testing] enabled = false` (5e667e9) is the registered form; no ID outside the registry remains. C1 and C2
are settled. Per the project's capability declaration, `mutation-testing` is not enabled, so mutation testing is
skipped in Dimension 3.

### The written cases against the test design table

| # | Seam | Driving input | Assertions and expected values | Fixture | Resources | Conclusion |
|---|---|---|---|---|---|---|
| E11 | as designed: `BrowserWindow.setSize(800, 700)` in the main process, `innerWidth` polled to 800 (the main window's `minWidth` is 800, `minHeight` 520) | as designed: the 74-character name registered in `.claude.json` before the launch, one session holding "quasar" (the word's only fixture use); its hit at 800 px; the second exit; that session from the Sessions tab | as designed, plus the exits' texts with the long name and the single back control's text; the expected object per control is a literal, the header's content edge the header's own measurement | #271's home plus that project | one launch | Consistent |
| E9 (changed) | as designed | as designed | after the banner as designed (no `.located`, no `.focused`). Before it, the written guard is "the list's first row is `focused`", where the row says "the child's located question is its first" (its turn 1): under the default newest-first order the first row is the newest question, which is turn 1 only because the child shows one question | #271's home | one launch | Inconsistent in the guard (G1) |
| E4 (changed) | as designed | as designed | as designed, plus `dim-search` on the app after the first exit. The comment's "leads to the results as left" is held for the keyword, as the row says; the rest of "as left" goes through the handler E8 holds | #271's home | one launch | Consistent |
| E3 (changed again) | as designed | as designed | as designed | #271's home | two launches | Consistent |
| E8 (changed) | as designed | as designed | as designed | #271's home | one launch | Consistent |

Test file header: its description now says each exit is kept on one line; the three known-gap notes are #271's and
still hold; the follow-up adds no gap note, and none of its units is untestable. No assertion was removed: the e2e
diff adds lines and rewrites one header comment line.

The previous check's findings, against db77a8e: C1 and C2 settled (above); F1 by E11, with G2 open on it; F2 by E9's
assertion after the banner, stronger than recommended (`.focused` as well), with G1 on its guard; F3 by E4; F4 by E3,
the spec's US-003/AC-01 and both feature entries; F5, F6 and F8 in the test design table and the design review's
Dimensions 1 and 4, while the coverage checklist's AC-05 row still credits E8 (sync, below); F7 by E8.

### Dimension 1: Coverage

Conclusion: every unit the follow-up owns has a case reached by its input; no gap note is needed.

| Unit | Case | Input that reaches it | Verdict |
|---|---|---|---|
| J11, a long project name | E11 | a registered project with a 74-character name; its hit and the second exit at 800 px | Covered: both exits, then the single back control |
| J11, a narrow window | E11 | the same at 800 px, the narrowest the main window allows | Covered at its reachable bound; narrower is unreachable |
| The single back control's one-line cut (session-view's feature entry) | E11 | the session opened from the long project's Sessions tab | Covered |
| US-003/AC-01 for a card's header (US-002/AC-02) | E3 | the first card's header | Covered |
| US-003/AC-01 on a session that cannot be read (J8) | E4 | the hit's file removed before the click | Covered, and the first exit returns to the page with its keyword |
| The fork parent opens without a located question (US-003/AC-04's path, F2) | E9 | the banner, from the child opened at its hit | Covered; the guard's precondition is held at another seam (G1) |
| US-003/AC-05 from a session page | E3, E10 | the rail's Search item | Covered; E8 no longer counted |
| AC-01's dark evidence screenshot | E8 | `emulateMedia` dark | Waits for the dark colours |

Not covered, and not a gap: the exits' layout in the five other languages — the rules (no wrap, an ellipsis,
shrinking controls) do not depend on the language, and no-wrap holds for unspaced scripts too; widths under 800 px,
which the window cannot reach.

Fixture: E11 adds the one shape J11 depends on, a project name too long for the row. Its source, checked against
this machine's registries with a script counting by kind (no name printed): Claude's registry holds 61 paths (55
distinct names); the 6 paths whose names run to 20 characters or more are hyphenated (5) or hyphenated with a dot
(1), the longest 47, as the design row says. Codex's registry adds 13 paths, the longest name 19 characters. Across
both, of 62 distinct names, 31 are hyphenated, 3 hold a dot, 10 a capital letter, 1 a space, none a non-ASCII letter.
What the cut depends on is a break opportunity in the text: the fixture's name has hyphens and the copy around it
spaces, so a lost no-wrap rule shows as a wrap, as it would with the real names.

Regression points: the follow-up changes no application code. The changed cases' later steps (E3's J9, J2 and sort
steps; E4's error count; E9's parent back control) are unchanged and passed in the gateway's run; #271's coverage
rows that cite E3 and E4 still hold, as their assertions are kept.

### Dimension 2: Case design

Conclusion: no red flag in E11 or in the changed lines; one observation, no finding.

Each checked: no module of the project is replaced. Nothing private is read: `exitsFit` reads rendered geometry and
computed style from the window, the e2e seam's surface. No internal state is written: `.claude.json` is the agent's
registry, written before the launch as `mkHome` writes it, and the resize is Electron's window API on the main
window, a state a user reaches by narrowing the window (`app.spec.ts` lines 4810 and 4843 resize the same way). No
call count or order is asserted. Every state reached is reachable through the window. Each case has its own home
and userData and removes both.

Observation, no finding: the screenshot shows the first exit cut to "Back to s…" beside the long project exit. E11
asserts that cut (`cut: true` for both exits), which is J11's "each cut with an ellipsis" and the confirmed
prototype's rule: `docs/prototypes/session-view/prototype-session.html` gives the row and its controls the same
flex, `min-width: 0`, no-wrap and ellipsis rules, so the overflow is shared in proportion to each control's width.
No change recommended; should the owner prefer the first exit kept whole, that is a prototype and spec change, and
E11's first `cut` changes with it.

### Dimension 3: False greens

Conclusion: no false green found; one guard does not hold its own precondition (G1), and the one red run F1
recommended is not recorded (G2).

Mutation testing: skipped, per the project's capability declaration (`mutation-testing` not enabled). When each case
goes red, answered by reading the code at db77a8e (f0d7027's application code), not by running a mutation:

- E11: `.sback` losing `white-space: nowrap` (the texts wrap at their spaces and hyphens: more than one line box,
  and no horizontal overflow, so not cut); the span losing `overflow: hidden` (its automatic minimum width becomes
  its text's, so it is not cut); `text-overflow: ellipsis` lost (`clip`); `.sback` losing `min-width: 0` (the
  control keeps its text's width: not cut, and past the header's content edge); the row wrapping (`flex-wrap`, or a
  block row: a second top); the name not reaching the copy (the texts); the span gone from a control
  (`querySelector('span')` is null and the evaluation throws until the poll times out); an ancestor letting the
  header grow to its content (nothing cut). Not red on: the row's height, other languages.
- E9's changed lines: the banner's jump carrying the child's `focusQ` (the parent's question 1 would be drawn
  `located focused` in its first render, as `SessionPageBody` initialises `focused` from the prop); the child
  opening without a focused row (the guard).
- E4's changed lines: the exits drawn only with a loaded page (they sit outside `result.ok` today); the first exit
  not reaching the search page, or the page losing its keyword.
- E3's changed line: the card header's open not marking the session as opened from search (it calls `onOpen` with
  no question, through the same `openFromSearch`).
- E8's changed lines: the dark appearance not recolouring the exits (the poll times out); otherwise evidence only.

The forms, one by one. Constant truth: `cut` needs an overflow, which the 74-character name makes for all three
controls at 800 px; the two exits' `tops: 1` needs the row not to wrap; for the single back control `tops` is 1 for
any single control and carries nothing, while the rest of that object does; E9's absence follows a live `focused`
row in the same case. Tautology: the expected objects are literals; the header's content edge measures the
container, not the measured control; the exits' text uses the fixture's name, which the app reads from the
registered path, so a path or another name shown fails it; E8 compares with its own light value measured before.
Stale path: `.pane-head .exits .sback` is what `SessionPane` draws today for both forms. Conditional skip: no branch
or early return in E11 or the changed lines. Assertions that may not run: every locator assertion and poll is
awaited, and the expected arrays carry their lengths, so an empty query fails.

Browser-assertion forms (review-code's false-greens list). Presence for effect: each new assertion reads texts,
geometry or the page reached. Synthetic paths: the resize is the window's own, the clicks are real input. Reading
too early: E11 polls the asserted expression itself; E9's absence is read once the parent's question is on screen,
and the focus marks are drawn in that same render, so nothing later can add them; E8's dark screenshot now follows a
poll on a computed colour (F7). Geometry: `scrollWidth > clientWidth` is asserted true, so a span sized to its
content fails it rather than passes; the edge is compared through `getBoundingClientRect`, which an ancestor's
`overflow: hidden` does not clip; the wrap dimension is read by line boxes, the counter `settings-updates.spec.ts`
uses with a footnote that wraps as its control. An assertion that X does not happen: E11's "one line" and "inside"
have never been seen failing in this case; the counter's sight of a wrap is shown by that control elsewhere, and
F1's recommended single red run is not recorded (G2).

### Dimension 4: Resource reuse

Conclusion: as designed.

Counted from the gateway's log: the e2e stage built once — one `electron-vite build`, its main (862 ms), preload
(50 ms) and renderer (556 ms) bundles once each — before the 146 cases on one worker; the global setup prepares the
quiet Electron copy once per Playwright run. The log prints nothing per launch, so launches are counted from the
code: E11 one; E9, E4 and E8 one each; E3 two (its relaunch is the restart under test); all through the file's
`launch`, and the count does not grow with the assertions in a case. A launch is not an expensive resource: cases
that do little besides launching and closing take 626–697 ms whole in this log ("nothing to search" 661 ms, the app
spec's cold start 676 ms). `mkHome`'s writes are under 1 s by the same log: the J8 case, with its home, a launch, a
search and two clicks, takes 1.0 s whole.

### Findings

Numbered on from the previous check's F and C series.

| # | Dimension | Case or file | What is wrong | Evidence | Recommended change |
|---|---|---|---|---|---|
| G1 | False greens (a guard), and the test design table | E9, `e2e/global-search.spec.ts` line 566 | The guard asserts that the list's first row is `focused`; the design row says the child's located question is its turn 1. Under the default newest-first order the first row is the newest question, turn 1 only because the child shows one. The absence after the banner can catch a carried focus only if that focus is 1: true today, and held at the providers seam (`question-corpus.test.ts` lines 228–230 number the stripped child's question 1), but not by this case | `SessionPane.tsx`: `focused` is the question number `focusQ` gives, and the list is newest first by default; the child's fixture file | Assert the number: `await expect(win.locator('.qlist .q.focused .idx')).toHaveText('01')` in place of the first-row check, with no launch added; or keep the check and write the reliance on the providers case into the design row. Recommended: the assertion, in this follow-up |
| G2 | False greens (a disposition) | E11; the dispositions above | F1's recommendation, accepted "as recommended", ends "Show it red once by removing `white-space: nowrap` from `.sback`"; nothing records that run, or a decision to drop it. With `mutation-testing` not enabled the skill does not require it, and this check did not run it | `rg` over this feature's working records (ignored files included) and the two commit messages: no such run | Either run it once (build, E11 alone, the rule restored byte for byte with hashes compared) and record it as extra evidence, as the mutations on 09966e1 were; or record that the disposition did not include it, citing the capability. Recommended: run it — one build and one case, and the only run that would show this case's "one line" and "inside" failing |

Sync obligations these findings and the follow-up leave, for the ticket's document sync checklist (not edited here).
Documents read for them: this record, the code review record, the document sync checklist, the task list, the
coverage checklist's and the regression report's lines that `rg` finds for J11, E8, AC-05 and the card header, both
specs, the two feature entries, and CONTEXT.md, `docs/adr`, `docs/features` and `docs/specs` searched for the exits'
wording; `docs/.workings` was listed with ignored files shown (only `startup-restore/`, which the follow-up does not
touch). #271's, #273's and #274's records were left out: the follow-up changes none of their units. The cases
passing does not bring these rows up to date:

- The coverage checklist: J11's Current verification row still reads "Reopened … not verified until the follow-up's
  case runs", though the case has run (the log's case 105); AC-05's row still credits E8 (F5); AC-01's mapping and
  Current verification rows name neither the card header (E3) nor the error page (E4).
- The regression report: its J11 rows still say the follow-up's case is to support J11, and the global-search
  feature line this follow-up rewrote ("from the results — a hit, or a card's header") is not re-checked there; the
  document sync checklist's follow-up row does not list the regression report.
- The document sync checklist: the capability row is still Pending, though 5e667e9 made the declaration; the
  coverage checklist's row and the follow-up row stay Pending until the above is done.
- The J11 screenshot: the code review's follow-up cites it, but `e2e-out/` is ignored and every run overwrites it;
  keep a copy under `evidence/ticket-272/` if it is to stay evidence, or cite the log's case 105 alone.
- G1 and G2 add their own lines once settled.

### Dispositions (follow-up)

Recorded by the main agent, 2026-10-20; the findings above are the sub-agent's and are unchanged.

- G1: done as recommended. E9's guard asserts the focused question's number, `01`; the design row says so.
- G2: not run. The owner declared `mutation-testing` not enabled the same day (C1), and `/review-tests` says that with
  it not enabled no mutation testing is done; a red run made by removing a rule is one. When E11 goes red stays
  answered by reading, in the section above. The disposition of F1 is read as the case, not the red run.
