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
| U4 | A keyword within the first 20 characters | session-view::REQ-002/AC-02, AC-03 | The keyword 12 characters in | No 20-character window (it would be the whole text); starting at the keyword is still offered: a literal | As U1 | None |
| U5 | Characters outside the basic plane count once, and are never cut in two | REQ-002 (applies to); failure item "markup … never cuts a character in two" | Emoji before the keyword, so that counting code units would put the start in the middle of one | The literal text from exactly 20 characters before; no lone surrogate in the result | As U1 | None |
| U6 | Case and several occurrences | Failure item "several occurrences" | The keyword written in another case, twice | The first occurrence, found case-insensitively, decides: a literal | As U1 | None |
| E1 | Global search: a row whose keyword lies past the cut starts 20 characters before it; one whose keyword is in view keeps its beginning | session-view::REQ-002/AC-01, AC-02; global-search::US-001/AC-06, S8 | A fixture session with the keyword about 200 characters into one question, at the start of another, typed in the search box at the window's default size | The far row's text starts with an ellipsis and the 20 characters written before the keyword (a literal); the near row's text starts with its own first words; in every row the first highlighted occurrence lies wholly inside the row's text box, short of the ellipsis when the row overflows | A Claude session in a real session's line shape (the file's `claude` writer) | One launch |
| E2 | A project's Sessions tab: the same | session-view::REQ-002/AC-01, AC-02 | The same project, its Sessions tab, the same keyword | As E1 | As E1 | The same launch |
| E3 | A resize judges the rows again | session-view::REQ-002/AC-04; failure item "the window is resized" | A question with the keyword about 70 characters in: in view at a wide window, past the cut at the narrowest (800px) | At 800px the row is moved and its keyword in view; widened to 1400px, the row starts with its own first words again | As E1 | The same launch |
| E4 | A long keyword in a narrow row starts at the keyword | session-view::REQ-002/AC-03 | At 800px, a keyword of 40 characters that lies about 120 characters into its question | The row's text starts with an ellipsis and the keyword (a literal), and the keyword lies wholly in view | As E1 | The same launch |
| E5 | Rows drawn while hidden are judged when shown | Failure item "rows drawn while hidden" | Global search's results drawn, then the Projects page shown and the Search page brought back | The far row still starts 20 characters before its keyword, its keyword in view | As E1 | The same launch |

### Dimension 1: Coverage

Against REQ-002 and its failure items, one row each: AC-01 (E1, E2, U3), AC-02 (U1, E1, E2), AC-03 (U2, U4, E4),
AC-04 (E3); "the keyword opens the question" (U3, E1's near row); "several occurrences" (U6); "the window is
resized, or the results are drawn anew" (E3; a new keystroke is every E case's own typing); "rows drawn while
hidden" (E5); "markup … never cuts a character in two" (U5; markup itself stays covered by the existing case
that types into a row holding HTML). global-search::US-001/AC-06 and S8 by E1. The full-text snippet, unchanged, keeps
its existing case. No gap to state in a file header.

### Dimension 2: Case design

The e2e cases drive the app through its public surface: typing in the search boxes, the rail, a real window
resize through the window's own size. The unit cases call the exported pure function with its inputs. Nothing of
the project is mocked, no internal state is written. No finding.

### Dimension 3: False greens (by design)

- **Always-true assertions**: E1–E5 assert the row's text against a literal start, not only that the keyword is
  visible, so a row the code never moved but that happens to show its keyword cannot pass as moved, and a row
  moved when it should not be fails the near-row check. "In view" is measured against the text box's visible
  end, the ellipsis's width taken off when the row overflows, so a keyword under the ellipsis fails it.
- **Tautology**: every expected string is written out in the test, never computed by the function under test.
- **Stale path**: the rows asserted are the live `.hit .t` of both searches; no removed path is asserted.
- **Read too early**: each e2e reading polls the asserted value itself (the row's text and the keyword's box), so
  a measurement taken before the row was judged cannot pass.
- Mutation testing: per the project's capabilities `mutation-testing` is not enabled, so it is skipped; when each
  test would turn red is answered row by row in the post-implementation check.

### Dimension 4: Resource reuse

One app launch serves E1–E5, as the file's cases each launch once; the unit tests need nothing built. No finding.
