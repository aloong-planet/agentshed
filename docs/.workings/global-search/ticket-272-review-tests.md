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
