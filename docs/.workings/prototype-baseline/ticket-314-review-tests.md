# Test review — #314

Ticket: [#314](https://github.com/aloong-planet/agentshed/issues/314) · work directory `prototype-baseline` ·
requirement source: #314's body as rewritten on 2026-10-26 with the owner's decisions, no spec; coverage units
`314::*` in [checklist.md](checklist.md). Task list: [ticket-314-tasks.md](ticket-314-tasks.md).

## Design review (2026-10-26, implementation starts from a40c926)

Scope: `scripts/check-shared-ui.test.mjs`, the shared-UI gate's test, run by `pnpm check:ui` before the gate. Ten new
cases, two changed (G0 and C), and two harness changes. Mutation testing: by the project capability declaration,
mutation-testing is not enabled, so it is skipped; each case's "when does it go red" is answered below. The test is
the gate's regression guard: every case for behaviour the gate lacks must be seen red on the unfixed gate first.

Seam: unchanged — the gate's command line on a temporary tree holding a copy of the gate, a real copy of
`docs/prototypes/`, and links to the rest; one tree and one gate run serve every case. Two harness changes:

- `src/` is copied instead of linked, so a case can plant the app's source: the gate reads `src/renderer/src` for
  `<TrendChart>`'s props and `theme.css` for the style invariant, and a plant in a linked file would write the
  repository's own file. `src/` is 1.9 MB.
- The plants are keyed by their path from the tree's root (they were keyed from `docs/prototypes/`), so a plant can
  reach the shared sheets and the app's source; a new map `FILES` adds a file (its content) or removes one (`null`).

Red first: the pages change with the test (two attributes, data for the gate), the gate after. So the red run is the
new test and the new pages on the gate at a40c926; a plant written for the new pages could not apply to the old ones.

### Test design table

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| G0 (changed) | the run fails, and only on what was planted | all (the harness's soundness) | the planted tree | exit 1, some problem reported, and every problem line starts with a planted file's path or with `scripts/check-shared-ui.mjs` (where the common-library list lives, L1's line). Expected: the gate passes on main | the repository's own files, copied | the tree copy (16 MB of prototypes, 1.9 MB of `src/`) and one gate run: once per run of the file, shared by every case |
| C (changed) | a declaration left only in a comment does not declare the block | 270::R1 | in `agents-page/prototype-agents.html`, both trend-chart declarations moved into comments (`#chart`'s as before, and `#skChart`'s, which D1 adds), so the page declares the block nowhere while it still links its assets | as before: `docs/prototypes/agents-page/prototype-agents.html: references trend-chart assets without declaring data-shared-block="trend-chart"`. With `#skChart` declared, moving `#chart`'s alone would leave a declaration and the reverse check would not be reached | the page's own markup | as G0 |
| M1 | a chart without its own declaration, on a page that declares trend-chart on its chart | 314::1 | in `project-detail/prototype-detail.html`, after `<div class="chart" id="ovchart" data-shared-block="trend-chart"></div>`, add `<div class="chart" id="ovchart2"></div>` | `docs/prototypes/project-detail/prototype-detail.html: chart container #ovchart2 declares no shared block` — the new rule's message, written as a literal; red on a40c926, whose count passes the page (three charts, many declarations) | the page's own chart markup | as G0 |
| M2 | a chart whose declaration is only in a comment | 314::1 | same place, add `<!-- data-shared-block="trend-chart" --><div class="chart" id="ovchart3"></div>` | `… prototype-detail.html: chart container #ovchart3 declares no shared block`; red on a40c926, whose count reads the comment | the page's markup and comment forms | as G0 |
| M3 | a chart written in a script template | 314::1 (decision D8) | in the same page's inline script, add a line holding the string `'<div class="chart" id="ovchart4"></div>'` | `… prototype-detail.html: chart container #ovchart4 declares no shared block`; red on a40c926. Pins D8: a rule reading markup only (JSDOM) would miss it | markup in a script string, the form four pages use for md-preview's mount | as G0 |
| N1 | a declaration that names no block | 314::2 | in `project-list/prototype-list.html`, add ` data-shared-block="pie-chart"` to the top bar's `<div class="topbar" style="gap:12px">` | `docs/prototypes/project-list/prototype-list.html: data-shared-block="pie-chart" names no shared block`; red on a40c926 | the page's markup; the id is the gate header's own example of a chart kind | as G0 |
| P1 | totals-card's stylesheet removed | 314::3 | in `project-detail/prototype-detail.html`, remove `<link rel="stylesheet" href="../_shared/totals-card.css">` | `… prototype-detail.html: declares totals-card but does not reference _shared/totals-card.css` — `checkBlock`'s message, now reached for a block that was never listed; red on a40c926 | the page's own link | as G0 |
| P2 | md-preview's stylesheet removed, its declaration in a script template | 314::3 | in `skills-view/prototype-skills-preview.html`, remove `<link rel="stylesheet" href="../_shared/md-preview.css">`; the page declares md-preview in a script template (`:401`) | `docs/prototypes/skills-view/prototype-skills-preview.html: declares md-preview but does not reference _shared/md-preview.css`; red on a40c926 | the page's own link and declaration | as G0 |
| P3 | a new shared stylesheet linked without a declaration | 314::3 | `FILES` adds `docs/prototypes/_shared/side-note.css`; in `global-search/prototype-search.html`, `<link rel="stylesheet" href="../_shared/side-note.css">` is added after the theme link | `docs/prototypes/global-search/prototype-search.html: references side-note assets without declaring data-shared-block="side-note"`; red on a40c926, which knows no side-note | a shared file in the form of `_shared/*.css`; the page's link form | as G0 |
| P4 | a script added to an existing block | 314::3 | `FILES` adds `docs/prototypes/_shared/totals-card.js` | `docs/prototypes/agents-page/prototype-agents.html: declares totals-card but does not reference _shared/totals-card.js` (the Agents page declares totals-card; so does the detail page, whose line is not asserted, P1 being on it too); red on a40c926 | a shared script in the form of `_shared/*.js` | as G0 |
| T1 | trend-chart's style invariant still checked | 314::4 | in `docs/prototypes/_shared/trend-chart.css`, the `.col` rule's `overflow: visible;` becomes `overflow: hidden;` | `docs/prototypes/_shared/trend-chart.css: .col violates an invariant (clipping the bar cuts off the tooltip pseudo-element positioned outside it)` — the invariant's message and reason as the gate holds them. Green on a40c926 (the behaviour exists); its red is shown once on a copy of the new gate whose block-specific table is empty | the sheet's own rule, the very change the invariant forbids | as G0 |
| T2 | `<TrendChart>`'s required prop still checked | 314::4 | in `src/renderer/src/DetailPane.tsx`, remove the line `        archivedDays={snap.archivedDays}` | `src/renderer/src/DetailPane.tsx: <TrendChart> is missing archivedDays`. As T1: green on a40c926, red on the empty-table copy | the app's own use site | as G0 |
| L1 | a common library's file removed | 314::5 | `FILES` removes `docs/prototypes/_shared/startup-skeleton.css` (one page links it, the Agents page, already planted) | `scripts/check-shared-ui.mjs: COMMON_LIBRARIES lists startup-skeleton, but _shared has no startup-skeleton.css or startup-skeleton.js`; red on a40c926 | the repository's own library | as G0 |

D (a mount point's id in a comment) stays as it is and now also holds 314::4's mount points, read from the
block-specific table. The other existing cases change only in their plants' keys.

### Coverage

#314's criteria, each against its cases: 314::1 — a chart without a declaration on a page declaring others (M1), a
declaration only in a comment (M2), and the chart in a script template that D8 keeps in view (M3). 314::2 — N1.
314::3 — both blocks that were never listed (P1, P2, P2's declaration in a script template), a new block (P3), a block
gaining a file (P4). 314::4 — D, T1, T2. 314::5 — L1; the block-specific table's stale key is the criterion's
Evidence, one run on a copy of the gate with the key renamed: driving it here would need a block renamed across the
pages, which would undo D, T1 and T2 in the same run. 314::6 is the gate on main.

Not driven, by reasoning: a class that only contains `chart` (`chart-note`) is not a chart container. The rule matches
the class token; a regression there would report charts that are not, turning `check:ui` red on main as soon as such a
class exists — loud, not silent. No page has one. A declaration of a common library (`data-shared-block="theme"`) is
an unknown block by the same code path as N1.

Fixtures: the real pages and files, each plant in a form the repository already uses (listed per row).

### Case design

One tree, one run. Pages carrying more than one plant, with the lines each produces: the detail page — D, M1, M2,
M3, P1, and P4's second line; the Agents page — C, P4, and the new chart rule's two lines for its commented charts
(not asserted, allowed by G0); the global search page — A, P3; the project list page — B, N1; the skills page — F, P2.
Every asserted line names its own page and its own subject (a chart's id, a block, a file), so no plant can produce
another's line; and none removes what another needs (P1 removes the detail page's totals-card link, which no other
case uses). Plant strings must each occur once, as before.

### False greens (design-level)

| Form | Check |
|---|---|
| Constant truth | each case asserts one exact line; G0 asserts exit 1 and a non-empty problem list |
| Tautology | expected lines are literals: the new rules' messages as designed here, `checkBlock`'s and the invariant's as the gate holds them, with the planted path |
| Stale path | the tree is copied from the working tree on each run, gate and pages included |
| Regression cases (T1, T2) | they pass on a40c926 by design; their red is shown on a copy of the new gate with the block-specific table empty, where D must go red as well |
| When does each go red | M1–M3: when a chart's own element stops being judged (a page-level count, a markup-only read for M3, a comment read as markup for M2). N1: when an unknown id stops being reported. P1, P2: when a block's contract stops coming from its files (or md-preview's script declaration stops counting, P2). P3: when a new shared file is not a block. P4: when a block's added file is not in its contract. T1, T2, D: when the block-specific table stops reaching trend-chart. L1: when the list stops being checked against the files. C: when a comment counts as a declaration again. G0: when the copy stops reproducing the repository, or the plants produce nothing |

### Resource reuse

The tree copy and the gate run, made once per run of the file at load and shared by every case, as before; the copy
grows by `src/` (1.9 MB). No other test builds a tree of the prototypes (`rg -n "mkdtempSync|spawnSync" scripts --glob
'*.test.mjs'`, as in #270's review: the language and NUL gates' tests build a git repository per case).

### Findings

None.
