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
| E8 | global-search.spec · the two exits | US-003/AC-01, AC-02, AC-05 (from a session page); J1; J3; P10; Evidence for AC-01 | e2e, `AGENTSHED_RESCAN_MS` | a keyword, oldest first and a scrolled list; a hit opened; a question appended to that session and a rescan while its page is on screen; then "Back to search results" | one row of two exits in that order — the texts "Back to search results" and "Go to target-proj · Sessions", a left then a right chevron (the icons' path data); after the return: the same keyword, sort and scroll position, and the new hit (151 rows); screenshots in light and dark | #271's home | one launch |
| E9 | global-search.spec · on into the project | US-003/AC-03 (both forms); US-003/AC-04 (fork parent, after going into the project); J4; J5 | e2e | a hit in the target project, then the second exit, then another session from its Sessions tab; a hit in the stale project, then its second exit; the stripped fork's hit, then the banner's parent link, then its back control | the project's detail on its Sessions tab, and the single back control ("Back to target-proj · Sessions") on the next session; the stale exit reads "Go to stale-proj" and lands on the stale note page (its tag, no tabs); the parent page has the single back control, which leads to fork-proj's Sessions tab | #271's home | one launch |
| E3 (#271's, changed) | global-search.spec · going to a hit | US-003/AC-01 (the jump's arrival), replacing #271's single back control there; S12 and CON-002's path into the Sessions tab | e2e | as #271 designed it; the step that reached the project's Sessions tab now takes the second exit, as a hit's session offers no single back control | on arrival, the two exits' texts in order, where #271 asserted "Back to target-proj · Sessions" (#271 shipped the single control until this ticket; the spec's Pending note said so); the rest as #271 designed it | #271's home | unchanged: one launch |
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
AC-05's session-page path E8 and E10. P10 is AC-01 and AC-04 together. CON-004's exits copy is held by the gates
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

The expensive resources are the build and an Electron launch (each over a second). The build happens once per
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
