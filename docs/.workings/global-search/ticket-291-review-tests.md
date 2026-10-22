# Test review — #291

Ticket: [#291](https://github.com/aloong-planet/agentshed/issues/291), a search hit row keeps its keyword in view.
Specs: [session-view](../../specs/session-view.md) (REQ-002, its failure items, Testing Decisions) and
[global-search](../../specs/global-search.md) (US-001/AC-06, S8) as written in 4ed5ec2. Coverage:
[checklist.md](checklist.md), rows marked #291.

## Design review

2026-10-22. Implementation version: 4ed5ec2 (the specs and the confirmed prototype; no code changed yet). Scope:
every test planned for #291.

### Test design table

Seams, as session-view's Testing Decisions name them: **the e2e seam** (the built Electron app over a fixture
home, `e2e/global-search.spec.ts`'s launcher), since only a laid-out row can say whether its keyword is in view;
and **a pure renderer function** for where a moved row starts, unit-tested beside it.

Expensive resources: **the built app and one launch** per e2e case (several seconds); the new case launches
once and walks every phase in that one run, as the file's other cases do. The unit tests use none.

| # | Test | Spec units | Input that reaches the branch | Assertion and where the expectation comes from | Fixture shape | Resource |
|---|---|---|---|---|---|---|
| U1 | Where a moved row starts: 20 characters before the first occurrence | session-view::REQ-002/AC-02 | A question with its keyword 30 characters in | The text from 20 characters before the keyword, after an ellipsis: a literal string written out in the test | Hand-written strings | None |
| U2 | Starting at the keyword itself | session-view::REQ-002/AC-03 | The same question | The text from the keyword, after an ellipsis: a literal | As U1 | None |
| U3 | Nothing to move | session-view::REQ-002/AC-01; failure item "the keyword opens the question" | The keyword at the start; no occurrence | No moved text either way | As U1 | None |
| U4 | A keyword within the first 20 characters | session-view::REQ-002/AC-02, AC-03 | The keyword 13 characters in | No 20-character window (it would be the whole text); starting at the keyword is still offered: a literal | As U1 | None |
| U5 | Characters outside the basic plane count once, and are never cut in two | REQ-002 (applies to); failure item "markup … never cuts a character in two" | 25 emoji and a space before the keyword, so that counting code units would put the 20-before cut inside an emoji (amended after the post-implementation check, F5: the first input put the cut on a pair boundary) | The literal text from exactly 20 characters before (19 emoji and the space); no lone surrogate in the result | As U1 | None |
| U6 | Case and several occurrences | Failure item "several occurrences" | The keyword written in another case, twice | The first occurrence, found case-insensitively, decides: a literal | As U1 | None |
| E1 | Global search: a row whose keyword lies past the cut starts 20 characters before it; one whose keyword is in view keeps its beginning | session-view::REQ-002/AC-01, AC-02; global-search::US-001/AC-06, S8 | A fixture session with the keyword about 200 characters into one question, at the start of another, typed in the search box at the window's default size | The far row's text starts with an ellipsis and the 20 characters written before the keyword (a literal); the near row's text starts with its own first words; in every row the first highlighted occurrence lies wholly inside the row's text box, short of the ellipsis when the row overflows | A Claude session in a real session's line shape (the file's `claude` writer) | One launch |
| E2 | A project's Sessions tab: the same | session-view::REQ-002/AC-01, AC-02 | The same project, its Sessions tab, the same keyword | As E1 | As E1 | The same launch |
| E3 | A resize judges the rows again | session-view::REQ-002/AC-04; failure item "the window is resized" | A question with the keyword 66 characters in: in view at a wide window, past the cut at the narrowest (800px). The moved row is awaited at 800px before the window widens (amended after the post-implementation check, F1: the tab draws its results 200ms after typing, so the first draft widened fresh rows that had never moved) | At 800px the row is moved and its keyword in view; widened to 1400px, the row starts with its own first words again. Shown red under a fault that keeps a moved row's start through a width change (`evidence/ticket-291/e2e-plants-f1-f3.txt`) | As E1 | The same launch |
| E4 | A long keyword in a narrow row starts at the keyword | session-view::REQ-002/AC-03 | At 800px, a keyword of 40 characters that lies 86 characters into its question | The row's text starts with an ellipsis and the keyword (a literal), and the keyword lies wholly in view | As E1 | The same launch |
| E6 | A keyword ending under the ellipsis is out of view (added at the code review, 2026-10-22: the row measured the ellipsis with a canvas in the computed `font` shorthand, which the app reports empty, so it measured 10px against the real 13px) | session-view::REQ-002/AC-02 ("under the ellipsis") | Global search, the window sized so that the fourth question's highlight box (padding included, which is what is judged) ends 11.5px before the row's right edge — inside the real ellipsis by 1.5px, outside a 10px one by 1.5px — computed from the unmoved row's box and the highlight's own box (amended after the post-implementation check, F3: sizing from the text's end left about 0.5px of margin) | The row is moved (its text starts with an ellipsis) and its keyword is in view by a DOM-measured ellipsis. Red before the fix, and again under a planted 10px ellipsis after the amendment (`evidence/ticket-291/e2e-plants-f1-f3.txt`) | As E1 | The same launch |
| E7 | A new keyword on the same row judges it again, both ways | session-view::REQ-002/AC-04 ("the rows are drawn anew"); post-implementation check F4 | In global search, "call" (28 characters into the far question, in view), then "quokka question" (far in, the same single hit), then "call" again; the row marked before the second keyword. The return keyword lies past 20 characters, so a row that kept its moved start would show a window (amended after the incremental check, G1: the first draft returned through "planning", 19 characters in, which no window can cut) | The row keeps its beginning, moves, and returns to its beginning, and the marked row is still the one shown (so it was judged again, not drawn fresh). Shown red under a stuck-start fault (`evidence/ticket-291/e2e-plant-g1.txt`) | As E1 | The same launch |
| E8 | A question in a real one's shape | REQ-002/AC-02; post-implementation check F6 (most real questions hold CJK, many line breaks and runs of spaces) | A CJK question with a line break and a run of spaces before its keyword, about 100 characters in | The row as global search shows it (the break and the spaces read as one space) starts 20 characters before the keyword, those characters counted on the text as shown: a literal written as escapes | Shaped from the real corpus's measured shapes | The same launch |
| E5 | A page shown again draws its rows anew and judges them | Failure item "a page or tab left and shown again" (the item's first sentence, a row with no width, is unreachable in the app and stated as a gap in the file header: F2) | Global search's results drawn, then the Projects page shown and the Search page brought back | The far row still starts 20 characters before its keyword, its keyword in view | As E1 | The same launch |

### Dimension 1: Coverage

Against REQ-002 and its failure items, one row each: AC-01 (E1, E2, U3), AC-02 (U1, E1, E2), AC-03 (U2, U4, E4),
AC-04 (E3); "the keyword opens the question" (U3, E1's near row); "several occurrences" (U6); "the window is
resized, or the results are drawn anew" (E3; a new keyword on a row that stays mounted is E7 — superseded wording
"a new keystroke is every E case's own typing", corrected after the post-implementation check: a keystroke that
changes the hits mounts fresh rows); "a page or tab left and shown again" (E5 — superseded wording "rows drawn while
hidden": the item's first sentence, a row with no width, is a stated gap in the e2e file's header); "markup … never cuts a character in two" (U5; markup itself stays covered by the existing case
that types into a row holding HTML). global-search::US-001/AC-06 and S8 by E1. The full-text snippet, unchanged, keeps
its existing case. Gaps stated in the e2e file's header: a row with no width yet, and the in-view measure's shared
method (superseded wording "No gap to state in a file header", corrected after the post-implementation check's F2
and F7).

### Dimension 2: Case design

The e2e cases drive the app through its public surface: typing in the search boxes, the rail, a real window
resize through the window's own size. The unit cases call the exported pure function with its inputs. Nothing of
the project is mocked, no internal state is written. No finding.

### Dimension 3: False greens (by design)

- **Always-true assertions**: E1–E8 (E1–E5 when this was first written) assert the row's text against a literal start, not only that the keyword is
  visible, so a row the code never moved but that happens to show its keyword cannot pass as moved, and a row
  moved when it should not be fails the near-row check. "In view" is measured against the text box's visible
  end, the ellipsis's width taken off when the row overflows, so a keyword under the ellipsis fails it.
- **Tautology**: every expected string is written out in the test, never computed by the function under test.
- **Stale path**: the rows asserted are the live `.hit .t` of both searches; no removed path is asserted.
- **The oracle's independence** (added after the post-implementation check, F7): the e2e helper's "in view" lays out an ellipsis probe and compares overflow as the component does, so a mis-measurement common to both would not show; E6's sizing from the highlight's own box is the independent anchor.
- **Read too early**: each e2e reading polls the asserted value itself (the row's text and the keyword's box), so
  a measurement taken before the row was judged cannot pass.
- Mutation testing: per the project's capabilities `mutation-testing` is not enabled, so it is skipped; when each
  test would turn red is answered row by row in the post-implementation check.

### Dimension 4: Resource reuse

One app launch serves E1–E8 (E1–E5 when this was first written), as the file's cases each launch once; the unit tests need nothing built. No finding.

## Post-implementation check

2026-10-22. Implementation version: b295fdb (commit range 7fe0186..b295fdb). Ticket #291. Scope: every test this
change wrote or modified — `src/renderer/src/hit-window.test.ts` (U1–U6) and the e2e case "a hit row keeps its
keyword in view…" in `e2e/global-search.spec.ts` (E1–E6). Run by an independent agent that did not inherit the
implementing session. Specs read as they stand in the working tree today: session-view's hit-row failure item about
hidden rows was rewritten after b295fdb and is uncommitted (at b295fdb it still reads "Rows drawn while hidden").

Run evidence:

- Full run: [gateway-b295fdb.txt](evidence/ticket-291/gateway-b295fdb.txt), not re-run. HEAD b295fdb (the end of the
  range), a clean status, eleven commands each with its exit code and full output, `VERIFY_EXIT=0`: it carries every
  item `/implement` asks of a gateway log. How the codes were captured is not in the log (no script in the
  repository writes it: `rg -uu -F 'exit code of'` outside `evidence/` exits 1, while four evidence logs match);
  every step's own output agrees with its recorded 0.
- The reviewed tests only: `pnpm exec vitest run src/renderer/src/hit-window.test.ts` exit 0 (6 passed);
  `pnpm exec electron-vite build` exit 0 (renderer bundle `index-CPw4TZbb.js`, the gateway run's hash);
  `DEBUG=pw:api pnpm exec playwright test e2e/global-search.spec.ts -g "keeps its keyword"` exit 0, kept as
  [review-tests-e2e-timing.txt](evidence/ticket-291/review-tests-e2e-timing.txt).
- Mutation testing: per the project's capabilities (`capabilities.toml`, read with a TOML parser)
  `mutation-testing` is not enabled (`enabled = false`), so it is skipped and no temporary change was made. When
  each test turns red is answered below from the code under test and the source of each expected value.

### Each test against the test design table

| Test | Matches the table? | Difference |
|---|---|---|
| U1, U2, U6 | Yes | — |
| U3 | Yes | Adds an empty-keyword line the table does not list |
| U4 | Yes, in effect | The keyword is 13 characters in, the table says 12 (same branch) |
| U5 | No | The input does not do what the row says (F5) |
| E1, E2 | Yes | E1 also asserts the middle and long-keyword rows; the keyword is 216 characters in ("about 200") |
| E3 | Narrowing yes; widening no | The widening never reaches a moved row (F1) |
| E4 | Yes, in effect | The keyword is 86 characters in, the table says about 120 (the start at the keyword is still proven) |
| E5 | No | Cites the superseded failure item (F2) |
| E6 | Yes, in effect | Uses the fourth question, the table says the middle one (F8); its offset (F3) |

File headers: the unit file needs no gap note; the e2e file's "Known gaps" lacks the row with no width (F2).

### Dimension 1: Coverage

Against session-view::REQ-002 and its failure items as they stand:

- AC-01: E1 (the near, middle and long-keyword rows at 1100px keep their first 30 characters), E2, and the existing
  case at `e2e/global-search.spec.ts:192`, which asserts both marks of a two-occurrence row now drawn through the new
  component. Covered.
- AC-02: past the cut U1, E1, E2; under the ellipsis E6 (its margin: F3). Covered.
- AC-03: U2, U4, E4. Covered.
- AC-04: a narrower width — E6 (the row is whole at 1400px and moves after the resize; under the 10px bug it stayed
  whole) and E3's narrowing. A wider width — not exercised (F1). Drawn anew by a keystroke — fresh mounts only (F4).
- The keyword opens the question: U3, E1's near row, E3's near-row checks. Several occurrences: U6 (the first
  decides); every occurrence highlighted, the case at :192.
- "A row with no width yet is judged once it has one. … left and shown again, they draw their rows anew": the
  second sentence by E5 (the search page renders only while selected, `App.tsx:369`). The first has no trigger in
  the app: nothing under `src/renderer` sets `display: none` (`rg -uu` exits 1, with theme.css's 121 `display`
  matches as the control), and the pages and the Sessions tab render conditionally (`App.tsx:358-371`,
  `DetailPane.tsx:141-175`). It is a gap to state, and is not stated (F2).
- Markup: drawn as text through the existing highlight; the existing markup question's keyword is in view, so a
  moved markup row is not exercised, and moving cuts plain text only. No finding. Never cuts a character in two: U5
  (F5).
- global-search::US-001/AC-06 and S8: E1, E5, E6. Covered.

Fixture shape: the e2e fixture keeps a real session's line envelope (the file's `claude` writer), but every question
text, the thing this change transforms, is invented: Latin, one line, single spaces. Scanned against the local
corpus ([review-tests-question-shapes.txt](evidence/ticket-291/review-tests-question-shapes.txt); 9727 user texts
from 5441 session files, counts only):
- 5947 (61%) contain CJK, 3809 (39%) line breaks, 2000 (21%) runs of two or more spaces, and 451 hold VS16 emoji
  sequences.
- None has a ZWJ sequence, a regional-indicator flag, a skin-tone modifier, a combining mark, a carriage return, a
  tab or U+0130. Each pattern was checked against a planted control.
- No fixture takes the real shape (F6).

Reading the code against those shapes finds no defect:
- Line breaks and runs of spaces (corrected at the incremental check, 2026-10-22). This bullet first said they reach
  the row as written, on the unverified premise that a hit's text is the raw question, and F6's suggestion below
  repeats it ("20 characters as written"). They do not reach the row as written. Every question text passes through
  `realUserText`, which collapses each run of whitespace, line breaks included, to one space
  (`src/main/providers/session-title.ts:26-27, 36`). The row is given the question as shown and the window counts on
  that, which is what E8 asserts.
- A CJK character is about twice as wide, so at narrow widths the 20-character window gives way to the keyword start
  for short keywords too, as AC-03's wording allows. Not measured.
- A window starting between a base character and its VS16 shows only an invisible selector.
- U+0130 (code review R1) does not occur.

### Dimension 2: Case design

- No module doubles: `vi.mock`, `vi.spyOn`, `vi.fn`, `vi.stubGlobal` and `jest.` in both files give `rg` exit 1
  (control: `expect` matches 11 and 224 times in the same files).
- No private member, no internal state written. The window is resized through Electron's `setSize`, the window the
  user resizes.
- `hitRows` appends a hidden, absolutely positioned probe to the row and removes it in the same synchronous call.
  The row is not its containing block (`position: static`), so the row's size does not change, and no frame or
  React render sees it. Exempt for that reason.
- Each case is isolated (its own fixture home and userData, closed in `finally`) and asserts the live `.hit .t`
  text and its first `mark`'s box. No finding.

### Dimension 3: False greens

When each test turns red:

| Test | Red when | Expected value from |
|---|---|---|
| U1 | `before` starts anywhere but 20 code points before the first occurrence, lacks the ellipsis or cuts the tail | A literal |
| U2 | `at` does not start at the occurrence or lacks the ellipsis | A literal |
| U3 | A keyword at the start, an absent one or an empty one yields a candidate (e.g. `i < 0` for `i <= 0`); the empty-keyword line shares the at-start line's condition (`indexOf('')` is 0) | Literals |
| U4 | `before` is offered for an occurrence within the first 20 characters, or `at` is withheld. The exact boundary (`>` against `>=` at 20) is not pinned, but that mutant is equivalent at the row: a window 20 in is the whole text after an ellipsis, never in view when the whole text was not | A literal |
| U5 | Characters are counted in code units (the literal expects 20 emoji, code units give 10); the no-lone-surrogate line has no red condition of its own (F5) | A literal |
| U6 | The search is case-sensitive or takes a later occurrence | A literal |
| E1 | The far row is not started 20 characters before its keyword; a row whose keyword is in view is moved; a first mark lies outside the text box, or under the ellipsis by the shared measure (F7); the count is not 4. Red before: [e2e-old-rows-plant.txt](evidence/ticket-291/e2e-old-rows-plant.txt) | Literals |
| E5 | The re-mounted search page does not judge its rows, or its results do not come back | A literal |
| E2 | As E1, for the tab's first two rows | Literals |
| E3, narrowing | Row 3 is not judged again at 800px. Its state at 1100px is not asserted (E2 checks rows 1–2); E6 covers narrowing either way | A literal |
| E4 | The long keyword's row at 800px does not start at the keyword | A literal |
| E3, widening | Only a row drawn fresh at 1400px being moved; never a moved row failing to return (F1) | A literal |
| E6 | The product counts the ellipsis narrower than about 9.5px (±0.5), not the 11.5px the comment says (F3). Red before: [e6-ellipsis.txt](evidence/ticket-291/e6-ellipsis.txt) | A literal |

By form:
- Always true: none beyond F5's line.
- Tautology: F7.
- Stale path: none.
- Conditional skip: none. An absent mark gives `inView: false`, and an empty row list fails the whole-array or
  indexed comparison.
- Unexecuted assertion: none; every poll is awaited.

UI forms (review-code's false-greens):
- Form 1: geometric, not existence.
- Form 2: real clicks and a real resize.
- Form 4: red shown for E1 and E6; E3's widening was never red (F1).
- Form 5: each poll's expression is the asserted one. The two unpolled reads that follow polls (E3's
  `every(inView)` and row 2's text) can only err red.
- Form 8: `.t` is a flex item with `min-width: 0; overflow: hidden` (theme.css:2307), so `scrollWidth > clientWidth`
  is not constant.
- Platform: CI runs e2e on ubuntu-latest under xvfb (`.github/workflows/ci.yml:51-67`), where the row falls back to
  the Linux sans-serif. This case's pixel geometry has run on macOS only, and F3's margin applies there too.

### Dimension 4: Resource reuse

- The built app: one build per run. The gateway log shows one `electron-vite build` before `playwright test`.
- The app launch (about 1.1s in the targeted run): this case launches and closes once (the timing log has one
  `electron.launch` and one `electronApplication.close`). The full run does not log launches, so the count comes from
  the targeted run and the code (one `launch(home)` call).
- The fixture home is a launch parameter (`AGENTSHED_HOME_OVERRIDE`), so per-case launches are distinct resources.
  The case uses the file's `launch`, `claude` and `close` helpers.
- The unit tests need nothing built. As the table designed; no finding.

### Findings

Each is handed back to the main agent; none was fixed here.

| # | Finding | Where | Suggested handling |
|---|---|---|---|
| F1 | **E3's widening never widens a moved row**. After the long keyword, `fill('quokka')` brings the rows back only after the Sessions tab's 200ms debounce (`DetailPane.tsx:322-328`), and the test resizes about 5ms after the fill without waiting. The timing log shows the window 1400px wide about 7ms after the fill and the rows arriving between about 116 and 372ms, so row 3 is drawn at 1400px and never moved. "A row widened enough to show its keyword returns to the question's beginning" therefore has no red condition: a row that kept its moved start through a widening passes every case, since E6 and E3 only narrow | `e2e/global-search.spec.ts`, the "Widened again" step; table row E3 | Now: after `fill('quokka')`, poll row 3 to `{ text: '…u herd and then the quokka once more', inView: true }` at 800px before resizing (or widen before the long-keyword step); update the table's E3 input |
| F2 | **The failure item "a row with no width yet" is an unstated gap**. It has no trigger in the app (above), and the e2e header does not name it. Table row E5 and the design review's dimension 1 still cite "rows drawn while hidden" | `e2e/global-search.spec.ts` header; table row E5 | Now: add it to the header's "Known gaps" with its re-test condition (a page or tab that keeps hit rows mounted while hidden); point E5 at the item's second sentence |
| F3 | **E6's margin is about 0.5px, not 1.5px**. The 11.5px runs to the keyword's text end, measured on an unpadded probe, but the product and the helper judge the `mark`'s box. That box has `padding: 0 1px` (theme.css:2323), so it ends about 9.5px (±0.5 from rounding the window width) before the edge. The bug E6 guards (a 10px ellipsis with the 0.5px tolerance, so a mark ending 9.5px or more before the edge counts as in view) is caught only when that rounding falls one way. It did on this Mac (red before); another font, such as CI's ubuntu job, can flip it. Derived from the CSS and the test's arithmetic, not measured | `e2e/global-search.spec.ts`, the E6 step | Now: size the window from the mark's own right edge in the whole-text row and aim it midway between the two thresholds (about 11px before the edge); correct the comment |
| F4 | **"Drawn anew by a keystroke" reaches fresh mounts only**. Every keystroke in the case changes the hit set, so the rows get new keys (`${h.i}-q-${hi}`) and mount anew. No row instance carries over into a new judging, which is the case the keyword in the row's judging key exists for | Table, dimension 1 coverage line | Now: two keywords that hit the same questions in the same order (so the keys persist), the first in view and the second far in, asserting the far row moves on the second |
| F5 | **U5's input does not reach "would cut a character in two"**. With the keyword right after the emoji, a code-unit start falls at code unit 30, a pair boundary (computed), so the no-lone-surrogate line cannot be red unless the literal is | `hit-window.test.ts`, the fifth case; table row U5 | Now: put one basic-plane character between the emoji and the keyword (`${smile.repeat(25)} quokka` → `…` + 19 emoji + ` quokka`; a code-unit start there leaves a lone surrogate, computed), or correct the row's wording |
| F6 | **No fixture takes the real shape of a question text** (CJK, line breaks, runs of spaces: above) | E1's fixture; the table's fixture column | Recommended: one e2e question in the dominant real shape (a multi-line CJK question with a run of spaces before an ASCII keyword, written as `\u` escapes so check:lang stays green), asserting its row starts 20 characters as written before the keyword with the keyword in view; or record in the table why the invented shape suffices |
| F7 | **The helper's `inView` re-implements the product's judging**: the same probe-measured ellipsis, overflow test and 0.5px tolerance (`hitRows` against `firstMarkInView`/`ellipsisWidth`). So `inView: true` turns red only when the judging stops on a row it would itself call out of view, never when the measure is wrong. The measure's only independent anchor is E6's lower bound (F3), and the 13px set against it was read with the same probe (e6-ellipsis.txt, line 49). An over-measure smaller than the nearest in-view row's margin has no red condition. The code review's "independently of the component" holds for the code, not the algorithm | `e2e/global-search.spec.ts`, `hitRows` | Recommended: state the shared measure as a known gap (e2e header and this table), with E6 as its anchor. An independent reading needs pixels (the painted ellipsis in a screenshot), not recommended now (cost, per-platform fonts). Correct the code review record's sentence |
| F8 | Table wording drift: U4 (12 → 13 characters), E4 (about 120 → 86), E6 (the middle → the fourth question) | Test design table | Now: correct the rows |

Document sync: the findings add no new kind of sync item. The checklist row for #291's current verification must not
record AC-04's widening, or the failure item about a row with no width, as verified until F1 is fixed and F2's gap
is stated. A fix that passes does not by itself bring that row up to date.

Not a test finding: after b295fdb the working tree holds uncommitted documentation changes, and check:ui and
check:lang read documents. The gateway log covers b295fdb only, so the gateway is re-run before delivery, as
`/implement` requires.

### Handling of the findings (implementing session, 2026-10-22)

| # | Handling |
|---|---|
| F1 | Fixed: the moved row is awaited at 800px before the window widens. Shown red under a fault that keeps a moved row's start through a width change. Row E3 amended |
| F2 | Fixed: the unreachable half of the failure item (a row with no width) is a known gap in the e2e file's header, with its re-test condition; E5 points at the item's second sentence |
| F3 | Fixed: E6 sizes the window from the highlight's own box, leaving 1.5px on either side; shown red under a planted 10px ellipsis. Row E6 amended |
| F4 | Fixed: E7 gives one mounted row two keywords both ways and checks it was judged again, not drawn fresh |
| F5 | Fixed: U5's input puts a code-unit cut inside an emoji, so the no-lone-surrogate check can fail on its own |
| F6 | Fixed: E8 adds a CJK question with a line break and a run of spaces. It showed that the row counts on the text as shown, where both read as one space; the expected value says so |
| F7 | Recorded: a known gap in the e2e file's header, a note in the design table's dimension 3, and the code review record's sentence corrected |
| F8 | Fixed: U4, E4 and E6 reworded |

The fixes change the unit test and the e2e case, so an incremental check follows on the fix commit, with the targeted verification log of the fixes.

## Post-implementation check, incremental (fix commit 676557e)

2026-10-22. Implementation version: 676557e (fix range b295fdb..676557e). Ticket #291. Run by an independent agent
that did not inherit the implementing session. Specs as committed in 676557e (the working tree was clean).

Scope, by the incremental rules:

- Tests changed in the range: `src/renderer/src/hit-window.test.ts` (U5) and the e2e case "a hit row keeps its
  keyword in view…". In that case the fixture gains a fifth question, E3's widening and E6 are reworked, E7 and E8
  are added, and the file header gains two known gaps.
- Tests depending on test helper code changed in the range: none. Commands and results:
  - `git diff -U0 b295fdb 676557e -- e2e/global-search.spec.ts | rg '^@@'`: seven hunks, the header comment (line 17)
    and six inside the hit-row test body. No shared helper changed (`launch`, `claude`, `close`, `hitRows`,
    `mkHome`, the locators).
  - `rg -n -uu -e "from '\./hit-window'" -e "hit-window'" src e2e scripts site/src`: `hit-window.test.ts:6` and
    `SessionHits.tsx:6`. The product module changed in a comment only; the renderer bundle hash is still
    `index-CPw4TZbb.js`.
  - `rg -n -uu -e 'global-search\.spec' -e 'hit-window\.test' src e2e scripts site playwright.config.ts
    vitest.config.*`: only `scripts/check-lang.mjs:227`, a path rule from #295, not an import.
- Test design table rows changed in the range: U4, U5, E3, E4, E5 and E6 amended, E7 and E8 added, and the design
  review's dimension 3 note.
- Outside this scope, every dimension's conclusion carries over from the first post-implementation check (b295fdb).
  The changed case's unchanged phases (E1, E2, E3's narrowing, E4, E5) were re-read in their new context. The fifth
  question holds no "quokka", so E1 and E2 still see four rows, and E5 now starts after E7's last `fill('quokka')`
  with four rows. Their first-round conclusions stand.

Run evidence:

- The targeted verification log, [targeted-fixes.txt](evidence/ticket-291/targeted-fixes.txt):
  - It records HEAD b295fdb and 15 uncommitted files, each with its `git hash-object`. Every hash equals the blob in
    676557e (`git rev-parse 676557e:<path>`, file by file), and the only file of the range it omits is the log
    itself, so it ran on 676557e's content.
  - Each command appears with its exit code and full output, and the log ends `TARGETED_EXIT=0`, so it carries
    every item `/implement` asks of such a log.
  - It ran lint, typecheck, the renderer unit tests (`hit-window.test.ts`: 6 passed), one build, the whole of
    `e2e/global-search.spec.ts` (14 passed, the hit-row case among them), check:lang, check:nul and check:ui.
- The reviewed tests only, at 676557e: the unit file exit 0 (6 passed); the build exit 0; the e2e case with
  `DEBUG=pw:api` exit 0, kept as [review-tests-incremental-e2e.txt](evidence/ticket-291/review-tests-incremental-e2e.txt).
- Mutation testing: per the project's capabilities `mutation-testing` is not enabled, so it is skipped and no
  temporary change was made. The implementing session's plants ([e2e-plants-f1-f3.txt](evidence/ticket-291/e2e-plants-f1-f3.txt),
  run on the committed e2e file `ff787ac` and restored byte for byte) serve below as evidence of red.

### Each changed test against the test design table

| Test | Matches the table? | Note |
|---|---|---|
| U4 | Yes | 13 characters in |
| U5 | Yes | 25 emoji and a space; a code-unit cut would start at code unit 31, inside an emoji (computed) |
| E3 | Yes | The moved row is read at 800px before the widening: the run's log shows the order |
| E4 | Yes | 86 characters in |
| E6 | Yes | Sized from the highlight's own box in the unmoved row |
| E7 | Yes | Its return leg proves less than the row claims (G1) |
| E8 | Yes | The keyword 101 characters into the shown text (104 into the raw) |
| E5 | Yes | Points at the failure item's second sentence |

File header: the two new known gaps state what F2 and F7 asked for: the row with no width, with its re-test
condition, and the shared "in view" measure, with E6 as its anchor. Stale text outside the rows: the design review's
dimension 1 and dimension 4 (G2).

### Dimension 1: Coverage (incremental scope)

- F1: AC-04's widening now reaches a moved row (E3). Plant B (a width change keeps a moved start) fails at E3's
  widening poll, line 959.
- F2: the row with no width is a stated gap; E5 covers the failure item's second sentence.
- F4: E7's first leg reaches a row that persists across a keystroke and moves it. The marker on its `.hit` button
  survives, so the row was not drawn anew. The return leg is G1.
- F5: U5's input now reaches a code-unit cut inside a character.
- F6: E8 takes the corpus's dominant shape: CJK, a line break and a run of spaces before the keyword. It shows that
  the row is given the question as shown (normalised by `realUserText`), and the spec's "Applies to" now says so. My
  first round's statement to the contrary is corrected in place above.
- No gap in this scope is left unstated.

### Dimension 2: Case design (incremental scope)

- No module doubles in either file (`rg` exit 1; control: `expect` matches 11 and 235 times).
- E7 sets a `data-e2e-same-row` attribute on the app's `.hit` button. It is an identity marker that nothing in the
  app reads, React leaves it alone because it does not manage that attribute, and no behaviour depends on it.
  Exempt for that reason.
- E6 and E8 read geometry and text through the DOM. E8's question goes through the file's `claude` writer, written
  as `\u` escapes. No finding.

### Dimension 3: False greens (incremental scope)

| Test | Red when | Expected value from |
|---|---|---|
| U5 | Characters are counted in code units: the literal (19 emoji and the space) differs, and the no-lone-surrogate line now fails on its own, since that cut starts at code unit 31, inside an emoji (computed) | A literal |
| E3, widening | A moved row keeps its start through a widening, as under plant B (failing line 959). The moved state at 800px is asserted first, so a row drawn fresh at 1400px can no longer pass | A literal |
| E6 | The product counts the ellipsis narrower than the highlight's offset of 11–12px (11.5, ±0.5 from rounding the window width). With a 10px measure the row stays unmoved with 1.5–2.5px to spare (plant A, failing line 977); the fixed 13px measure moves it with 0.5–1.5px to spare after the 0.5px tolerance | A literal |
| E7, first leg | A keyword change does not judge the persisting row again (for instance the keyword left out of the judging key, or the candidates not recomputed): the row stays whole with "quokka question" out of view | A literal |
| E7, return leg | Only under faults the first leg already catches. Under plant B (the moved start kept through a change of key) it passes, because "planning" lies 19 characters in: there is no 20-before window, so the row falls back to its whole text. Plant B passed all of E7 and failed first at line 959 (G1) | A literal |
| E7, marker | The row is drawn anew across the two keystrokes | The marker's presence |
| E8 | The window is counted on anything but the text as shown, or the row is not moved. The literal equals a hand computation on the normalised text and differs from one on the raw text (computed) | A literal, written as escapes |

By form:
- Always true: none left; F5's line now has a red condition of its own.
- Tautology: none new. E8's literal can be reproduced by hand from the spec's rule and `realUserText`, without
  `hitWindow`.
- Stale path: none.
- Conditional skip: none. E6 throws if the row has no mark.
- Unexecuted assertion: none.

UI forms:
- Form 4: red is shown for E3's widening and for E6 after the rework. E7 and E8 were not shown red; E7's first leg
  has a red condition by reading, and G1 concerns its return leg.
- Form 5: each new poll reads the asserted expression, and E3's widening now polls the moved state before resizing.
- Platform, carried over: this case's pixel geometry (E6's 11.5px against a 13px ellipsis) has run on macOS only;
  CI's ubuntu job is its first run elsewhere.

### Dimension 4: Resource reuse (incremental scope)

The targeted log shows one `electron-vite build` for its run. It does not log launches. My run of the case at
676557e shows one `electron.launch` and one `electronApplication.close`, and the range adds no `launch(` call, so E7
and E8 share the case's one launch, as their rows say. No finding.

### Findings (incremental)

Handed back to the main agent; none was fixed here.

| # | Finding | Where | Suggested handling |
|---|---|---|---|
| G1 | **E7's return leg cannot fail under the fault it is there for**. Row E7 says the row "returns to its beginning … so it was judged again". A row that kept its moved start through the keyword change would still read whole, because the in-view keyword ("planning") lies 19 characters in: it has no 20-before window, and the row falls back to its whole text. Plant B, which keeps the start through any change of key, passed all of E7 and was caught only by E3's widening (line 959). A fault specific to keyword changes would pass every case | `e2e/global-search.spec.ts:917-918`; table row E7 | Now, recommended: return to an in-view keyword more than 20 characters in, such as "call" (28 characters into the far question, the only question that holds it). A kept moved start would then show that keyword's 20-before window and fail. Otherwise reword row E7 so the return leg is not claimed as a check of judging again |
| G2 | **Stale statements in the design review section contradict the current table and file header**. Dimension 1 still says "rows drawn while hidden (E5)", "a new keystroke is every E case's own typing" and "No gap to state in a file header"; dimension 4 says "One app launch serves E1–E5" | This record: the design review's dimensions 1 and 4 | Now: replace them in place, or mark them as superseded by the post-implementation checks |

Document sync, from the range's changes only. The spec's "Applies to" and failure items match the tests: counting
on the text as shown, the row with no width, a page shown again. Still open for the scope re-check before delivery:

- The checklist's planned verification for the hit-row failure items does not name the row with no width as a
  stated gap. Its current-verification row for #291 still reads "Not run yet"; when it is brought up to date, the
  no-width item is recorded as a stated gap, not as verified.
- The ticket's document sync checklist, unchanged in this range, still lists the spec write-back and the features
  entries as pending, though 676557e carries both.

Not test findings:

- Carried over: the full gateway log is for b295fdb, and this range changes tests and a product comment, so the
  gateway is re-run before delivery, as `/implement` requires.
- The spec's "Applies to" and the comment in `hit-window.ts` say the text "is normalised so when it is indexed".
  The text a row is given is normalised when it is read (`questionTextOfRange` → `questionTextAt` → `realUserText`,
  `question-index.ts:283`), by the same function the indexer applies (`question-index.ts:480`). The substance holds;
  only the wording is loose.

### Handling of the incremental check's findings (implementing session, 2026-10-22)

| # | Handling |
|---|---|
| G1 | Fixed: E7 returns through "call", 28 characters in; under the stuck-start fault the case now fails first at E7's return leg (`evidence/ticket-291/e2e-plant-g1.txt`). Row E7 amended |
| G2 | Fixed: the design review's stale sentences corrected in place, each marked as superseded with what replaced it |

The checklist's planned verification names the no-width item as a stated gap; its current verification is written after the final full run. This handling changes E7's executable content, so the incremental check runs once more on its commit.

## Post-implementation check, incremental (fix commit d09280c)

2026-10-22. Implementation version: d09280c (fix range 676557e..d09280c). Ticket #291. Run by an independent agent
that did not inherit the implementing session. Specs as committed in d09280c (the working tree was clean). For E7,
this round's conclusions replace those of the 676557e round.

Scope, by the incremental rules:

- Tests changed in the range: the e2e case "a hit row keeps its keyword in view…", in E7 only. Its keyword in view
  is now "call" instead of "planning", on both legs, and its comment explains why.
- Tests depending on test helper code changed in the range: none. Commands and results:
  - `git diff -U0 676557e d09280c -- e2e/global-search.spec.ts`: two hunks, at lines 910–912 and 918, both inside
    the hit-row test body (E7). No shared helper changed.
  - `rg -n -uu -e "from '\./hit-window'" -e "hit-window'" src e2e scripts site/src`: `SessionHits.tsx:6` and
    `hit-window.test.ts:6`. `hit-window.ts` changed in a comment only, and the targeted log's renderer bundle is
    still `index-CPw4TZbb.js`.
- Test design table rows changed in the range: E7. Outside the rows, the design review's dimensions 1, 3 and 4 were
  corrected in place (G2).
- Outside this scope, every conclusion carries over from the 676557e round, and through it from the b295fdb round.

Run evidence:

- The targeted verification log, [targeted-fixes-g.txt](evidence/ticket-291/targeted-fixes-g.txt):
  - It records HEAD 676557e and 8 uncommitted files, each with its `git hash-object`. Every hash equals the blob in
    d09280c (`git rev-parse d09280c:<path>`, file by file), and the only file of the range it omits is the log
    itself, so it ran on d09280c's content.
  - Each command appears with its exit code and full output, and the log ends `TARGETED_EXIT=0`.
  - It ran lint, typecheck, the renderer unit tests, one build, the whole of `e2e/global-search.spec.ts` (14 passed,
    the hit-row case among them), check:lang, check:nul and check:ui.
- No test was run in this round: the log covers the changed case, and the plant below answers when it turns red.
- Mutation testing: per the project's capabilities `mutation-testing` is not enabled, so it is skipped and no
  temporary change was made. The implementing session's plant ([e2e-plant-g1.txt](evidence/ticket-291/e2e-plant-g1.txt),
  run on the e2e blob `299563c`, which is d09280c's, and restored byte for byte) serves as evidence of red.

### Each changed test against the test design table

| Test | Matches the table? | Note |
|---|---|---|
| E7 | Yes | "call" lies 28 characters into the far question and is the only question to hold it (computed over the case's five questions); "quokka question" likewise hits only that question |

### Dimension 1: Coverage (incremental scope)

G1 is resolved. E7 now covers a keyword change on a mounted row in both directions, and the return leg can fail.
The checklist's planned verification names "a new keyword on a mounted row", and names the row with no width as a
stated gap. No finding.

### Dimension 2: Case design (incremental scope)

No module doubles in the changed file (`rg` exit 1). E7's identity marker is unchanged and exempt as before. No
finding.

### Dimension 3: False greens (incremental scope)

| Test | Red when | Expected value from |
|---|---|---|
| E7, first leg | A keyword change does not judge the persisting row again: the row stays whole with "quokka question" out of view | A literal |
| E7, return leg | A keyword change keeps the row's moved start, or does not judge it again. "call" lies past 20 characters, so a kept start shows that keyword's 20-before window (`…nd for the planning call, …`) instead of the whole question. Shown under plant B, which now fails first at E7's return poll (line 919) | A literal |
| E7, marker | The row is drawn anew across the two keystrokes | The marker's presence |

Each poll reads the asserted expression. No transient state equals the whole question except the judged result, so a
read taken too early fails rather than passes. No other form applies. No finding.

### Dimension 4: Resource reuse (incremental scope)

The targeted log shows one `electron-vite build` (a single build heading, with its three outputs). The range adds no
`launch(` call, so the case keeps its one launch. No finding.

### Findings (incremental, d09280c)

None.

- G1 is resolved, as above.
- G2 is resolved. The design review's dimension 1 now names E7 for a keyword change and E5 for a page shown again,
  and lists the two stated gaps. Dimensions 3 and 4 read E1–E8. Each superseded sentence is marked as such.
- My previous round's note on the wording "normalised … when it is indexed" is resolved. The spec now says "whenever
  it is read, by the same function the index uses", and the comment in `hit-window.ts` says "whenever it is read".

Document sync, from this range's changes only:

- The spec, the checklist's planned verification and the ticket's document sync checklist match the changes. The
  spec write-back and the features entries are Done, and the checklist row stays Pending until its current
  verification is written after the final full run.

Not a test finding, carried over: the full gateway log is for b295fdb, so the gateway is re-run before delivery, as
`/implement` requires.
