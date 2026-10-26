# Test review — #270

Ticket: [#270](https://github.com/aloong-planet/agentshed/issues/270) · work directory `prototype-baseline` ·
requirement source: #270's body, no spec; coverage units `270::*` in [checklist.md](checklist.md). Task list:
[ticket-270-tasks.md](ticket-270-tasks.md).

## Design review (2026-10-26, implementation starts from ef5e4cb)

Scope: a new test of the shared-UI gate, `scripts/check-shared-ui.test.mjs`, run by `pnpm check:ui` before the gate.
No existing test changes. Mutation testing: by the project capability declaration, mutation-testing is not enabled, so
it is skipped; each case's "when does it go red" is answered below. The test is the gate's regression guard, so it is
also a check CI runs; it must be seen red on the unfixed gate (false-greens form four), which the slice does first.

Seam: the gate's command line, `node scripts/check-shared-ui.mjs`, run on a temporary tree. The gate takes its root
from its own location, so the tree holds a copy of the gate under `scripts/`, a real copy of `docs/prototypes/`, and
symbolic links to the repository's other top-level entries and to `docs/`'s other entries (`node_modules` among them, so
the gate's imports resolve). The prototypes must be a real copy: the gate walks them with `readdirSync(…, {
withFileTypes: true })`, where a symbolic link to a directory is not a directory, so a linked page would be skipped
without a word. The plants are exact string replacements in the copied pages, each required to occur once. One tree
and one gate run serve every case (the plants touch different pages and blocks); the cases assert on that run's output.

### Test design table

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| G0 | the run reports problems only on the planted pages, and exits 1 | 270::1, 270::R1 (the harness's soundness) | the planted tree | every problem line names one of the six planted pages; exit code 1. Expected: the gate passes on main (`check:ui` green), so a problem elsewhere would mean the copy differs from the repository | the repository's own prototype pages, copied | the tree copy (16 MB) and one gate run, about 2–3 s: once per test file run, shared by every case |
| A | the global search page without its `app-window.css` link | 270::1 | remove `<link rel="stylesheet" href="../_shared/app-window.css">` from `global-search/prototype-search.html`, whose header comment (an HTML comment) names the file | the line `docs/prototypes/global-search/prototype-search.html: declares app-window but does not reference _shared/app-window.css`. Expected value: the gate's own message for a declaring page missing an asset (`checkBlock`) | as G0: the page's real comment, unchanged | as G0 |
| B | the project list page without its `project-side.js` script | 270::1 | remove `  <script src="../_shared/project-side.js"></script>` from `project-list/prototype-list.html`, whose script comment (a `//` line) names the file | the line `docs/prototypes/project-list/prototype-list.html: declares project-side but does not reference _shared/project-side.js` | as A | as G0 |
| C | a declaration moved into a comment | 270::R1 | in `agents-page/prototype-agents.html`, remove ` data-shared-block="trend-chart"` from the chart's element and put `<!-- data-shared-block="trend-chart" -->` before it; the page still links the block's assets | the line `docs/prototypes/agents-page/prototype-agents.html: references trend-chart assets without declaring data-shared-block="trend-chart"` (the reverse check, now reached because the comment no longer counts as the declaration) | as A, the comment in the page's own form | as G0 |
| D | a mount point's id moved into a comment | 270::R1 | in `project-detail/prototype-detail.html`, remove ` id="ovxaxis"` from the x-axis element and put `<!-- id="ovxaxis" -->` before it | the line `docs/prototypes/project-detail/prototype-detail.html: declares trend-chart but is missing the xaxis mount point` | as A | as G0 |
| E | an asset named in a comment on a page that does not declare its block | 270::R1 | in `shell/prototype-app-shell.html` (declares app-window, app-rail and project-side, not toast), add `/* the toasts' styles live in ../_shared/toast.css */` at the top of its `<style>` block | no line `docs/prototypes/shell/prototype-app-shell.html: references toast assets without declaring …`. The page is planted, so G0 allows a problem on it; the case asserts this one is absent | as A, a CSS block comment | as G0 |
| F | the tab identity script commented out | 270::R1 | in `skills-view/prototype-skills-preview.html`, replace `<script src="../app-identity.js"></script>` with `<!-- <script src="../app-identity.js"></script> -->` | the line `docs/prototypes/skills-view/prototype-skills-preview.html: does not include ../app-identity.js in <head>` | as A | as G0 |

### Coverage

The issue's acceptance: removing a page's real reference to any block's asset goes red whatever a comment names (A, B:
the issue's two mutations, a CSS and a script asset, an HTML comment and a `//` comment); green on main (the gate itself
in `pnpm check:ui`, 270::2). The class-level additions, one case for each search changed: the declaration (C), the mount
point (D), the reverse check (E, which before the fix wrongly reports a page that only names an asset in a comment),
the tab identity rule (F). The three comment forms `stripComments` removes are each driven: HTML (A, C, D, F), `//`
(B), `/* */` (E). The chart container rule is unchanged (decision D1), so it has no case.

Fixtures: the real pages, their real comments for A and B; the planted comments in C–F copy forms the pages use.

### Case design

One tree, one run: each plant is on its own page and block, so no plant can produce or hide another's message, and G0
pins every reported problem to a planted page. A plant whose target string does not occur exactly once fails the test
at set-up, so a page edited later cannot turn a case into a no-op.

### False greens (design-level)

| Form | Check |
|---|---|
| Constant truth | each case asserts one exact line; G0 asserts exit 1 and that problems were reported (not an empty list) |
| Tautology | the expected lines are the gate's message formats written as literals with the planted page's path, not computed by the gate's code |
| Stale path | the copy is made from the working tree at each run, gate included, so the test runs the current gate on the current pages |
| An absence (E) | seen present first: on the unfixed gate the comment counts as a reference and E's line appears; after the fix it must not |
| When does each go red | A, B, C, D, F: when the gate reads the comment as the markup again (the unfixed gate: all five absent). E: when the reverse check reads comments again. G0: when the harness stops reproducing the repository (a page skipped, a file missing) and a problem appears elsewhere, or when the plants stop producing any problem |

### Resource reuse

The tree copy and the gate run are the expensive resource, made once per run of the file and shared by all seven
cases (computed at load, before the cases). Existing set-ups searched (`rg -n "mkdtempSync|spawnSync" scripts
--glob '*.test.mjs'`): the language and NUL gates' tests build a temporary git repository per case and spawn the gate
in it; this test spawns the gate the same way, but builds one tree for all cases, since its plants do not collide and a
tree costs a copy of the prototypes.

### Findings

None.
