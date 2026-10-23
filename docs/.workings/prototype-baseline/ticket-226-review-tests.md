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

Checked 2026-10-23 by an independent agent on the commit range 1349d76..21a8958 (21a8958 is the implementation;
0bb5a11 after it adds only work records and evidence), after the full verification gateway passed.

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
| 226::2 | the same probe: diagrams rendered (1, 1, 2 SVGs), an entry button, the current state highlighted, an unreachable event's tooltip, stress mode, a forced event, a legal event, reset, reset view after a pan; no script errors | the behaviour checks pass on the base as well (behaviour unchanged) | covered, except that only the first entry button of each page is clicked (T226-3) |
| 226::3 | `pnpm check:lang` in the gateway | — | covered: exit 0 |
| 226::R1 | tooltip reason without a prefix; a forced illegal event's receipt; the regex mutation log | the forced receipt fails on the base | covered for the prefix and its regex; the unknown-event reason is not driven (T226-2); the mutation log's provenance (T226-1) |

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

| Finding | Basis | Recommended disposition |
|---|---|---|
| T226-1: the regex mutation log comes from an earlier probe version on a pre-21a8958 tree, and row 226::R1, dated against 21a8958, cites it without saying so | False greens | Now: state the log's provenance in row 226::R1 (earlier probe version; logic pages equal to 21a8958 by the diff above) and rest the tooltip check's "when red" on the committed code as read here. Rerunning the mutation is not required: the project does not enable mutation testing |
| T226-2: the unknown-event reason, part of 226::R1, has no trigger on the page (every button's action type has its own reducer case, checked on all three pages) and is not mentioned in row 226::R1 | Coverage | Now: record in row 226::R1 that this string is verified by the diff only (`deny('unknown event')` in each `logic.js`, the wording of `logic-template.js` line 50), and why no probe drives it. Calling `StateMachine.reduce` with an invented type would be a synthetic path |
| T226-3: #226's verification names "entry buttons"; the probe clicks the first entry button of each page only (row 226::2 says "an entry button", which is accurate) | Coverage | Recommended now: let the probe click every `[data-new]` button, check the receipt and a status after each, and rerun alone and in the gallery (one loop). Otherwise record in row 226::2 why the second button is not driven (the same handler; only `initial()`'s argument differs, and this range does not touch it) |

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

Document sync arising from this check, for the main agent: the 226::R1 and 226::2 rows of
[checklist.md](checklist.md) (T226-1 to T226-3), as document sync items of this ticket
([ticket-226-doc-sync.md](ticket-226-doc-sync.md)), pending until done; once this check is closed, task 8 of
[ticket-226-tasks.md](ticket-226-tasks.md). Files read for this check: the coverage checklist, the #226 task list,
document sync checklist and code review record, every file in `evidence/round-2/`, #226's body, and the skill's
`logic-page-template.html` and `logic-template.js`; both test review paths were checked directly and were absent
before this record.
