# Test review — #251

Ticket: [#251](https://github.com/aloong-planet/agentshed/issues/251) · work directory `prototype-baseline` ·
branch `chore/prototype-baseline`. Scope: the checks this change adds, keeps or removes in
`scripts/check-shared-ui.mjs`, and the browser evidence behind the coverage checklist. No unit, integration
or e2e test is added or changed.

## Design review

Implementation version: 26b9216 (where the work began). Skipped together with TDD (`/implement` step 4):
nothing here is a unit under test. The check-script changes delete rules and register one shared block
through the script's existing logic, each proven by mutation instead; the prototype pages are verified by
browser evidence against a snapshot of the original pages. The test design table is therefore empty.

## Post-implementation check

Checked 2026-10-18 on 03cbaa7 plus the review fixes committed with this record, after the full verification
gateway (`pnpm verify`) passed.

### Coverage

No spec, so no failure-modes section: coverage is the checklist's units (#251 items 1–15 and "Done when"),
each mapped to a gate or to browser evidence there. Gap, recorded rather than filled: the landing page is
not converted in this round (items 2, 12 and 13 for it wait for the landing-page PR, by the owner's
decision); its checks run when it is.

### Case design

No unit cases. The browser probes drive the pages through their public surface — clicks on the bar, the
rail, the rows, the settings controls — and read rendered state (computed styles, text, URL, hit tests).
One exception, stated: the item 1 script changes the gallery's values by calling the gallery's own
`DemoDimensions.set` in the gallery tab, the call its settings popover makes, rather than clicking through
the popover.

### False greens

- New gate (`app-window` shared block): a mutation that drops the declaration from the project list page
  turned `check:ui` red with the rule's message naming that page (reach: the only edit was that attribute;
  attribution: the message names the mutated file; restore: a byte copy, then `cmp`).
- Kept rules that used to run only under `--cross`: four reversible mutations (a brand colour in a
  component, an app-side `.col` invariant, TrendChart without `archivedDays`, a registry default outside
  its values) each turned `check:ui` red with that rule's message; the first try of the TrendChart
  mutation did not apply (wrong file), was caught by the script's own "did not apply" report, and was
  retargeted; every file was restored byte-identical (hash compared).
- Removed rules: they compared the prototypes with the app and are gone on purpose (ADR-0033); no other
  rule depended on them.
- Browser evidence, "when would it be red":
  - snapshot comparison: it did report the intended differences (removed blocks, changed copy) and nothing
    else, so it is not blind to text or pixel changes;
  - navigation probe: a page without the helper does not navigate (shown on the original skills preview
    with today's shared rail), which the probe reports as a miss;
  - overlay hit tests: the update tooltip ignores the pointer, which makes a hit test report a false
    negative; it was checked by its containing block and rect instead;
  - the rail relabel bug was first reproduced red by a probe, then green after the fix.

### Resource reuse

No test resources are added; the full gateway loads what it loaded before.
