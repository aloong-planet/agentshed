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
at set-up, and so does a page of A or B whose own comment no longer names its asset (added after the post-implementation
check's finding 1), so a page edited later cannot turn a case into a no-op. G's comment is its own plant, held by the
plant-once check.

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

### Incremental review — the post-implementation check's findings 1 and 2 (2026-10-26, before changing the test; implementation at 30a2fee)

Changed rows and two new ones; the rest of the table stands.

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| A (changed) | as before | 270::1 | as before; and, once the link is removed, the set-up asserts the page still names `_shared/app-window.css` — the removed tag was its one occurrence outside comments, so only the comment can name it — and fails with a message to plant a comment if not | as before | as before | as before |
| B (changed) | as before | 270::1 | as before; the set-up asserts the page still names `_shared/project-side.js` once the script is removed | as before | as before | as before |
| G (new) | a page without its asset's script, a `//` comment after code naming the asset | 270::1 (finding 2; decision D3) | in `shell/prototype-app-shell.html`, remove `  <script src="../_shared/app-rail.js"></script>` and append ` // the rail is drawn by ../_shared/app-rail.js` to the line `  let lang='zh';` in its inline script (both strings held by the plant-once check) | the line `docs/prototypes/shell/prototype-app-shell.html: declares app-rail but does not reference _shared/app-rail.js`; red on the gate at d9b0208, which keeps a trailing `//` comment | the page's own inline script, a comment in the form 37 of the pages' lines use | as G0 |
| H (new) | a `//` inside a string does not end the line | 270::R1 (decision D3: what the stripping must keep) | in `session-view/prototype-session.html`, after the line that defines `esc` in its first inline script, add `  const docsUrl = 'https://example.test/'; const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')` — the page follows the mode | the line `docs/prototypes/session-view/prototype-session.html: follows the mode but still styles by prefers-color-scheme`. A stripping that took the string's `//` for a comment would remove the rest of the line, and the line would not appear | as G | as G0 |

G0 now also holds G's and H's pages among the planted ones (the shell page already was, for E).

Coverage: G drives the fourth comment form (a `//` after code); with A–F the forms the pages use are each driven. H is
the boundary of that form: a `//` that is not a comment — in a string, as in a URL — stays, and so does the code after
it. It cannot be red on the gate at d9b0208 (which removes only whole-line `//` comments, so it keeps the line); it is
red under a stripping that ends a line at any `//`, which the slice shows once on a scratch copy.

False greens: G is red first on the current gate. H's absence of red there is by design, stated above; its red is
shown under the naive stripping it guards against. The set-up assertion of A and B makes a page edit that drops the
page's own comment fail the file at once instead of leaving a case that plants nothing; G's comment is planted.

Resource reuse: unchanged, one tree and one gate run per file run.

Findings: none.

Self-check before handing the fix over (2026-10-26), items 2 to 5:
- Assertions written or changed: G and H each assert one exact line; the set-up assertion of A and B (the page still
  names its asset) — checked against the false-green forms: each can fail, each was seen failing (G on the gate at
  d9b0208, `evidence/ticket-270/red-first-2.txt`; H under a stripping that ends a line at any `//`, `naive-h.txt`; the
  set-up assertion on a copy whose global search comment no longer names the file, `pin-guard.txt`).
- Functions changed: `stripJsComments` (new) and `stripComments`. `stripJsComments` has one branch beyond its loop:
  `pos < at`, a comment range that starts inside an earlier one. No test drives it, and none can on today's pages: the
  parser finds 355 ranges in the pages' 33 inline scripts, none overlapping (`comment-ranges.txt`). It guards the
  output against splicing part of a comment back in if two ranges ever overlapped; a removal would show only then, as a
  comment's text read as code. Not counted as a missed regression: no page can produce it now. `stripComments`'s new
  step runs on every inline script: driven by B (a whole-line `//` inside a script), G (a trailing one) and H (a `//`
  inside a string), and by every rule that reads pages, since `check:ui` passes on main (`green-2.txt`).
- Test data: the plants of G and H use forms the pages use (38 trailing `//` comments today; URLs in strings).
- Shared helpers changed: none outside the gate and its test.

### Incremental review — the incremental check's finding 3 (2026-10-26, before changing the test; implementation at e53f6d0)

Two new rows; the rest stands. Both read through the theme rule, which flags a mode-following page whose code holds
`prefers-color-scheme`, so a stripping that removes code shows as the line missing.

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| I (new) | a `/*` inside a string does not open a comment | 270::R1 (decision D3: what the stripping must keep) | in `plugins-view/prototype-plugin-skill-preview.html` (follows the mode), after `  let lang = DemoDimensions.get('language')` in its first inline script, add `  const globs = ['ideas/*.md', window.matchMedia('(prefers-color-scheme: dark)'), 'src/**/*.ts']` — a glob string holding `/*`, code, then a glob holding `*/`, the forms of the pages' mock content | the line `docs/prototypes/plugins-view/prototype-plugin-skill-preview.html: follows the mode but still styles by prefers-color-scheme`; red on the gate at e53f6d0, whose block-comment pattern runs over script bodies | the page's own inline script; glob strings as the session and plugins pages' mock content writes them | as G0 |
| J (new) | a template line starting with `//` stays | 270::R1 (D3) | in `skill-install/prototype-install.html` (follows the mode), before `  const T={` in its first inline script, add a template literal whose second line is `// prefers-color-scheme is how the app reads the system appearance` | the line `docs/prototypes/skill-install/prototype-install.html: follows the mode but still styles by prefers-color-scheme`; red on the gate at e53f6d0, whose whole-line `//` pattern runs over script bodies | a template literal in the page's own inline script | as G0 |

G0 now also holds I's and J's pages among the planted ones.

Coverage: with H, three shapes of what must stay are driven — a `//` mid-line in a string (H), a `/*` in a string (I),
a template line that starts with `//` (J). The regular-expression shape is driven by K, added after the second
incremental check's finding 4 (`check:ui` passing on main showed only that the pages' two such literals are kept, not
that their loss would show: nothing a rule reads follows them on their lines).

False greens: I and J are red first on the gate at e53f6d0; each asserts one exact line.

Resource reuse: unchanged.

Findings: none.

Self-check before handing the fix over (2026-10-26), items 2 to 5:
- Assertions written: I and J, one exact line each, both red on the gate at e53f6d0 (`red-first-3.txt`), green after
  (`green-3.txt`).
- Function changed: `stripComments`, now one pattern with three outcomes — an HTML comment removed (driven by A, C, D,
  F), a script body through the parser (B, G, H, I, J), a style body through `stripCssComments` (E). Its closing-tag
  pattern allows a space before `>`; no page has one (`green-3.txt`), so that variant is not driven. The theme rule's
  linked CSS files now go through `stripCssComments`: for CSS, the same removal as before (block comments; CSS has
  neither HTML nor `//` comments), and `check:ui` passes on main.
- Test data: I's globs are the forms the session and plugins pages' mock content writes; J's template is a form the
  pages' scripts use.
- Shared helpers changed: none; `NAMED_IN_A_COMMENT` lost the shell page, whose comment is G's plant.

### Incremental review — the second incremental check's finding 4 (2026-10-26, before changing the test; implementation at 020e082)

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| K (new) | a `//` inside a regular expression does not end the line | 270::R1 (decision D3: what the stripping must keep) | in `project-detail/prototype-detail-stale-note.html` (follows the mode), after `const PATH = '/Users/you/Projects/removed-experiment-2025';` in its first inline script, add `const isUrl = (u) => /^https?:\/\//i.test(u); const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')` — the pages' own literal, then code | the line `docs/prototypes/project-detail/prototype-detail-stale-note.html: follows the mode but still styles by prefers-color-scheme`. It cannot be red on the gate at 020e082, whose parser keeps the literal whole; it is red under a stripping that cannot tell a regular expression from a comment (the TypeScript scanner without the parser), shown once on a scratch copy | the literal of `agents-page:724` and `project-detail:775`, in the page's own inline script | as G0 |

G0 now also holds K's page among the planted ones. Coverage: with H, I and J, every shape of what D3 keeps is driven:
a string, a template, a regular expression. Resource reuse: unchanged. Findings: none.

Self-check before handing the fix over (2026-10-26), items 2 to 5: the assertion written is K's, one exact line,
green on the gate (`green-4.txt`) and red under a stripping by the TypeScript scanner alone, the only case red there
(`scanner-k.txt`). No function, test data beyond K's plant (the pages' own literal), or shared helper changed.

## Post-implementation check (2026-10-26, implementation d9b0208, range ef5e4cb..30a2fee; ticket #270)

Scope: the test the change adds, `scripts/check-shared-ui.test.mjs` (seven cases), against the Test design table
above. First round; no fix range. Evidence read: the handed full gateway log `evidence/ticket-270/gateway-d9b0208.txt`,
and `red-first.txt`, `green.txt`, `loop-before.txt`, `loop-after.txt`, `symlink-facts.txt`, `targeted.txt` beside it.
No test was rerun: every answer below comes from those runs, the code and the pages; one test-runner fact was checked
in a scratch file outside the repository (Case design). `capabilities.toml` was read with a TOML parser (`tomllib`)
and checked against the repo-scaffold registry: all nine registered IDs present in their registered shapes, none
extra. By the project capability declaration, mutation-testing is not enabled, so mutation testing is skipped; each
case's "when does it go red" is answered below from the code and its expected value's source.

### Gateway log

| Requirement (full-verification-gate) | In the log |
|---|---|
| Version: `git rev-parse HEAD`, porcelain status, a hash per listed file | `d9b0208ba7a8…`; status empty, so no file to hash |
| Every command, with its full output | the `pnpm verify` steps in order: typecheck, lint, test, test:scripts, test:site, check:ui, check:lang, check:i18n, check:nul, e2e, smoke. Lint and e2e run as the `lint` and `e2e-suite` declarations' `enforced-by` say |
| Exit codes taken without a pipe | every step 0, then `VERIFY_EXIT=0`. The log does not show how the codes were taken; each step's own output agrees with its code (pass counts with no failure; typecheck and lint print nothing, their success form), so no code here hides a failure |
| Version against the handed range | `git diff --name-status d9b0208 30a2fee`: only this log is added, the run's own output. No test reads it: the test copies `docs/prototypes/` alone and the gate's walks do not reach `docs/.workings/`. `check:lang` and `check:nul` would read it at 30a2fee; it holds 0 CJK characters and 0 NUL bytes (scanned), so their results stand there |

The log is usable evidence for 30a2fee.

### Written test against the Test design table

| # | Seam and driving input | Assertion and expected value's source | Fixture | Resource | Result |
|---|---|---|---|---|---|
| G0 | gate CLI on the planted tree | `status === 1`; `problems.length > 0`; each problem starts with a planted page | copied pages | `runGate()` once, at module load | Matches. The tree also leaves `.git` unlinked, which the design does not say; the gate reads no git state (no `child_process` import, no `.git` path), so nothing changes |
| A | the link line removed with its newline | exact line, literal | real page and comment | as G0 | Matches |
| B | the script line removed with its newline | exact line, literal | real page and comment | as G0 | Matches |
| C | element replaced by the comment plus the element without the attribute | exact line, literal | planted HTML comment | as G0 | Matches |
| D | `id="ovxaxis"` moved into a comment | exact line, literal | planted HTML comment | as G0 | Matches |
| E | a `/* */` line after `<style>` | no problem starting `docs/prototypes/shell/prototype-app-shell.html: references toast assets` | planted CSS comment | as G0 | Matches |
| F | the identity script wrapped in an HTML comment | exact line, literal | planted HTML comment | as G0 | Matches |

### Coverage

No spec; the units are `270::*` in [checklist.md](checklist.md), from #270's acceptance.

| Unit | Driven by | Result |
|---|---|---|
| 270::1 | A (an HTML comment, real) and B (a `//` line, real); both lines absent on ef5e4cb's gate (`red-first.txt`); the issue's two mutations with the restore checked by hash (`loop-before.txt`, `loop-after.txt`) | Covered today; finding 1 (the comments are not pinned) and finding 2 (a comment form left counting) |
| 270::2 | the gate step of `pnpm check:ui` at d9b0208: "Shared-UI consistency check passed", exit 0 (gateway log, lines 373–397) | Covered |
| 270::R1 | C (declaration), D (mount point), E (reverse check), F (tab identity) | Covered: each search changed in `checkBlock` has its own case, and F drives the tab identity rule's single stripped read |

Comment forms against real data. `stripComments` removes `<!-- -->`, `/* */`, and a line whose first non-blank
characters are `//`. A scan of the 17 HTML files under `docs/prototypes/` (the 13 the shared-block check reads, plus
the four `index.html`), every block asset string in each: 88 mentions, 19 inside comments (in 11 HTML comments and 2
whole-line `//` comments; no `/* */` comment names an asset), all removed by `stripComments`; the other 69 sit inside a
`<link>` or `<script>` tag; none survives stripping anywhere else. A and B take the two forms the real data uses from
real pages; E plants the third in a form the shell page uses. A fourth form the pages use is not removed: `//` after
code on the same line (at least 37 such lines on 5 of the 13 pages, by a heuristic scan; none names an asset) —
finding 2.

Fixtures: A and B are the real pages with their own comments (`global-search/prototype-search.html:55`, an HTML
comment; `project-list/prototype-list.html:86`, a `//` line), shapes taken from real data, independent of the issue's
text. C–F plant comments in forms their pages use (HTML comments: 14 on agents-page, 13 on project-detail, 1 on
skills-view; a `/* */` on shell).

Test file header: it gives the approach and why the prototypes are copied; it declares no gap. Every changed search has
a behaviour trigger, so nothing is untestable; finding 2's handling decides whether the header must state a limit.

### Case design

- Public seam: the gate's command line; the assertions read its output and exit code, nothing internal. Every planted
  state is a page edit a contributor can make, so each is reachable.
- Isolation: one temporary tree per file run (`mkdtempSync`, removed in `finally`; `rmSync` removes the links, not
  their targets, `symlink-facts.txt`). The cases share only the captured output, which none changes.
- Independence of the plants: six different pages. The design says "its own page and block"; C and D share
  trend-chart, on different pages. `checkBlock` part (1) judges each page alone and the chart container rule counts per
  page, so neither plant can make or hide the other's line; the design's conclusion holds.
- Set-up failure: a plant string not found exactly once throws at module load. Scratch check (Node v24.19.0): a
  top-level assertion failure makes `node --test` report the file failed and exit 1, so there is no silent green.

### False greens

| Form | Check |
|---|---|
| Constant truth | each case asserts one exact line (E: the absence of one prefix); G0's loop runs after `problems.length > 0` |
| Tautology | the expected lines are literals, not computed by the gate's code |
| Stale path | the test copies the working tree's gate, the one `pnpm check:ui` and CI's `checks` job run |
| Silent skip on a condition | none; a set-up failure fails the file (Case design) |
| Assertion that may not run | synchronous cases, no callbacks; the loop is guarded |
| Presence for effect (gate, CLI) | specific report lines and the exit code, not the presence of output |
| Synthetic path | the real CLI on real page copies |
| Command that cannot tell | exit 1 alone cannot: B's page also trips the project column rule (`loop-after.txt`); every case asserts its own line |
| A new gate never seen red | the test, on ef5e4cb's gate: 6 of 7 red, each failing at its own assertion (test lines 71–91; G0 passes there by design, as the harness guard). Plants reached: after the fix A, C, D and F's lines appear, which only their plants produce; on the unfixed gate E's line appears and B's page trips the project column rule. `pnpm check:ui`'s two steps were each seen red alone (`red-first.txt` exit 1; `loop-after.txt` exit 1), joined by `&&` as in `check:lang` and `check:nul` |
| The check's own command wrong | the parse `/^ {4}\S/` matches the gate's `    ${p}` print for blocks and global rules alike; seen working on the unfixed gate (E's line parsed). A gate crash prints `    at …` lines, which G0 rejects |
| Target outside the check's scope | the prototypes are copied, not linked (a linked directory is not a directory to `readdirSync(…, { withFileTypes: true })`, measured); the other trees are linked at their top level, which the gate opens by path |

When does each go red:

| # | Goes red when |
|---|---|
| G0 | the gate exits other than 1 (passes, or dies by a signal), reports nothing, or reports a problem on an unplanted page (a file missing from the tree, a crash). A skipped planted page shows as A–F losing their lines, not here; the design's "a page skipped" belongs to those cases |
| A | the declaring page's asset search reads comments again — only while the global search page's comment names `_shared/app-window.css` (finding 1) |
| B | the same for project-side — only while project-list's `//` line names the script (finding 1) |
| C | the declaration search counts a commented declaration |
| D | the mount-point search counts a commented id |
| E | the reverse check counts a comment naming an asset (its line was present on ef5e4cb's gate). A reworded message would let the prefix pass vacuously; C asserts the same message template in full, so a rewording turns C red first |
| F | the tab identity rule reads `<head>` with comments |

### Resource reuse

- The resource: the tree (a copy of `docs/prototypes/`, 16 MB by `du -sh`) and one gate run, built by `runGate()` once
  at module load; the cases read `run` and `problems`.
- Runtime count, from the gateway log: the file ran once in the whole run (`check:ui`, lines 356–372; its case names
  appear once; `test:scripts` lists other files, line 137). The seven cases took 0.047–0.505 ms each, the file 1098 ms:
  one build, outside the cases. This agrees with the table (once per file run).
- Cost: 1098–1321 ms per file run across the four recorded runs (gateway, `red-first.txt`, `green.txt`,
  `targeted.txt`), which the code review's 1.3 s matches. The design table's "about 2–3 s" was an estimate; at either
  cost the decision to build once per file stands.
- No case clears or releases the resource (the tree is removed before the cases run; `run` is never changed), so no
  ordering question arises. No seam is missing: the gate is a process, and the test builds its input once.

### Document sync

Facts this check establishes: the post-implementation check is done on d9b0208 (range ef5e4cb..30a2fee) with findings
1 and 2, and the test file's measured cost. Files checked: the task inputs (#270's body, `checklist.md`, this record,
the gateway log); this work directory's #270 files (`ticket-270-tasks.md`, `ticket-270-doc-sync.md`,
`ticket-270-review-code.md`, all eight files in `evidence/ticket-270/`); and the repository through
`rg -uu -l -e check-shared-ui -e check:ui`, hidden and ignored files included, excluding `node_modules`,
`site/node_modules`, `out`, `site/dist` and `.git` (dependencies and build output): 114 files. Outside
`docs/.workings/` they are `ci.yml`, `CONTEXT.md`, `capabilities.toml`, `package.json`, the gate, its test,
`check-lang.mjs` and its test, `docs/specs/i18n.md`, ADR-0009, ADR-0018 and ADR-0033. Other tickets' records under
`docs/.workings/` are left out: each records its own round.

- No permanent document says anything about the gate's test or how it treats comments (their lines name rules, tiers
  and CI's step), so this check changes none of them. What `check:ui` runs is the document sync checklist's second
  item, Pending until step 8.
- `checklist.md` has no current-verification row for `270::*` yet; the checklist's first item (Pending) covers it, and
  that row must carry the outcome of findings 1 and 2.
- Task 7 in `ticket-270-tasks.md` and #270's "Test review" acceptance item are the main agent's to update.
- The code review's statements about the test (1.3 s; a set-up failure fails the file) agree with the evidence.
- Handling findings 1 and 2 changes rows A and B of the Test design table (and adds a row under 2a). Those rows must be
  reviewed under the design review's increment rule before the test changes.

### Findings

**1. A and B depend on page comments that nothing in the test pins.** Kind: a regression that would be missed; also
an inaccurate record (Design review, Case design: "a page edited later cannot turn a case into a no-op").
A's comment condition is `global-search/prototype-search.html:55`; B's is `project-list/prototype-list.html:86`. The
set-up checks only that the removed tag occurs once. If either comment stops naming its asset (#269 removed such a
path from the session-hits comments), the case still passes, on the fixed gate and on ef5e4cb's gate alike. A return of
comment-reading in the declaring page's asset search, the branch #270's acceptance is about, would then go unreported,
because no other case drives that search with a comment (C: declaration, D: mount point, E: reverse check, F: tab
identity). Impact: the test's own regression guard for 270::1, with no sign when the guard lapses. Recommended: now, in
this ticket. After A and B's swaps in `runGate`, assert that the page still contains the asset path (the removed tag
occurred once, so only the comment can remain), and fail at set-up with a message saying to plant a comment. Correct
rows A and B and that sentence of the design review.

**2. A `//` comment after code on the same line still counts as a reference.** Kind: a defect against #270's
acceptance ("whether or not a comment on that page names the asset").
`stripComments` removes `//` only from a line whose first non-blank characters are `//` (`/^\s*\/\/.*$/gm`). A trailing
one, such as `mount(side) // drawn by ../_shared/project-side.js`, survives, so a page that names an asset that way
can drop its real tag and the check stays green: the issue's defect in a fourth comment form. The pages use the form
(Coverage: at least 37 lines on 5 of 13 pages); none names an asset today, so main is unaffected now. No case drives
it, and neither the test header nor the design's coverage note states it. Impact: the next comment written in that
form re-opens #270 silently. Recommended handling, for the owner to decide because it goes past the issue's suggested
`stripComments`:
- (a), recommended: in the searches #270 changed, also strip trailing `//` comments inside `<script>` content, and add
  a case that plants one. A strip that also cuts a `//` inside a string errs toward a false red, which shows at once on
  main.
- (b): record it as a stated limit in the test header and in 270::1's checklist row, citing the owner's decision.

Either way it belongs to this ticket's PR.

### Handling (main agent, 2026-10-26)

- Finding 1: handled as recommended. After its plants, the set-up asserts that A's, B's and G's pages still name
  their assets (`NAMED_IN_A_COMMENT`), so a page edit that drops the comment fails the file with a message to plant
  one; shown on a copy whose global search comment no longer names `app-window.css`
  ([pin-guard.txt](evidence/ticket-270/pin-guard.txt)). Rows A and B changed in the design review's increment, which
  also corrects the Case design's claim (the plant check now covers the comment too).
- Finding 2: handled by (a), the owner's decision D3 (`ticket-270-tasks.md`). Inside a page's inline `<script>`, the
  gate removes every JS comment by the TypeScript parser's comment ranges (`stripJsComments`); HTML and CSS comments
  as before. New cases G (a page without its asset's script, a `//` comment after code naming it: red on the gate at
  d9b0208, [red-first-2.txt](evidence/ticket-270/red-first-2.txt)) and H (a `//` inside a string keeps the rest of the
  line: red under a stripping that ends a line at any `//`, [naive-h.txt](evidence/ticket-270/naive-h.txt)). All nine
  cases pass after, and `check:ui` passes on main ([green-2.txt](evidence/ticket-270/green-2.txt)); the parser finds 38
  trailing comments in today's pages, none overlapping ([comment-ranges.txt](evidence/ticket-270/comment-ranges.txt)).
  The gate's run time rose from about 1.05 s to 1.6 s (same file).
- Both change the test's executable content, so an incremental check of the fix follows.

## Post-implementation check, incremental (2026-10-26, implementation e53f6d0, fix range 30a2fee..e53f6d0; whole change ef5e4cb..e53f6d0; ticket #270)

Scope: the fix of findings 1 and 2, under the incremental clause. Evidence read: the handed targeted log
`evidence/ticket-270/targeted-2.txt`, and `red-first-2.txt`, `naive-h.txt`, `pin-guard.txt`, `green-2.txt` and
`comment-ranges.txt` with its script `ranges.mjs` beside it. The handed gateway log `gateway-d9b0208.txt` is d9b0208's
(`VERIFY_EXIT=0`, assessed in the first post-implementation check) and is no evidence for e53f6d0. No test was rerun:
the run results below come from those logs. The probes behind finding 3 ran in a scratch directory outside the
repository, on the gate's own `stripJsComments` and `stripComments` taken from the file by text (from
`function stripJsComments(code)` to the doc comment before `loadDimensions`), and wrote no repository file.
`capabilities.toml` is unchanged since ef5e4cb (`git diff --stat ef5e4cb e53f6d0 -- capabilities.toml`: empty); read
again with `tomllib` and checked against the repo-scaffold registry: the nine registered IDs present in their registered
shapes, none extra. By the project capability declaration, mutation-testing is not enabled, so mutation testing is
skipped; each case's "when does it go red" is answered below from the code, the evidence and the expected values'
sources.

### Objects under review

The fix range changes two files outside the records, the gate and its test (`git diff --name-status 30a2fee e53f6d0`;
the rest are records and evidence under `docs/.workings/`). Tests depending on what the range changed, searched over
every test file in the repository, ignored and hidden files included (103 files match the globs):

```
$ rg -uu -n --glob '!node_modules/**' --glob '!**/node_modules/**' --glob '!.git/**' --glob '!out/**' --glob '!site/dist/**' \
    --glob '*.{test,spec}.{mjs,cjs,js,ts,tsx,mts}' -e 'check-shared-ui' -e 'ranges\.mjs' -e 'NAMED_IN_A_COMMENT' -e 'stripJsComments' -e 'stripComments' .
./scripts/check-shared-ui.test.mjs:46:const NAMED_IN_A_COMMENT = {
./scripts/check-shared-ui.test.mjs:61:    cpSync(join(repo, 'scripts/check-shared-ui.mjs'), join(root, 'scripts/check-shared-ui.mjs'))
./scripts/check-shared-ui.test.mjs:69:      const asset = NAMED_IN_A_COMMENT[page]
./scripts/check-shared-ui.test.mjs:73:    const r = spawnSync(process.execPath, [join(root, 'scripts/check-shared-ui.mjs')], { encoding: 'utf8' })
./scripts/check-lang.test.mjs:25:  'scripts/check-shared-ui.mjs': `const side = /${CN}/\n`,
```

`check-lang.test.mjs` only names the path as a seed file it writes, with its own content, into a fresh repository (its
`SEEDS`); it reads neither the gate nor the test. The fix changes no shared helper or fixture outside the test file (no
prototype page changes in the range). So the objects are:
- all nine cases of `scripts/check-shared-ui.test.mjs`: G and H are new, and every case reads the one run whose set-up
  changed (the plant table, now with two more plants on the shell page and one on the session page, and the new set-up
  assertion);
- the Test design table rows changed in the range: A and B (changed), G and H (new), and the G0 note.

Carried over from the first post-implementation check (d9b0208, range ef5e4cb..30a2fee): the gateway log's
assessment; C, D, E and F's design rows and fixture shapes (their plants and assertions are unchanged); the harness
facts (links, copy, clean-up, a set-up failure failing the file); the resource's clearing and ordering conclusion.

### Targeted log

| Requirement (full-verification-gate) | In the log |
|---|---|
| Version | HEAD `30a2fee7…` and the porcelain status with a hash per listed file: the gate `bdcdc379…`, the test `b7aa88bb…`, `comment-ranges.txt`, `ranges.mjs`, this record and the task list |
| Every command, with its full output | the search for tests reading what changed (the same two test files as above), `pnpm check:ui`, the two tests that read `package.json`, `pnpm lint`, `pnpm check:lang`, `pnpm check:nul` |
| Exit codes taken without a pipe | `exit=0` after each, then `TARGETED_EXIT=0`. As with the gateway log, the log does not show how they were taken; each output agrees with its code (pass counts with no failure; lint prints nothing, its success form) |
| Version against the handed range | at e53f6d0 the gate and the test are the logged blobs (`git rev-parse e53f6d0:<path>`), and so are `comment-ranges.txt` and `ranges.mjs`. Differing at e53f6d0: `checklist.md`, `ticket-270-review-code.md`, this record and the task list, changed after the run; `green-2.txt`, `naive-h.txt`, `pin-guard.txt`, `red-first-2.txt` and the log itself, written after the run (file times 16:38:50 local, the run at 16:37:59) and added with the commit. None is read by the test: it copies `docs/prototypes/` and the gate, and the gate's document walks cover `docs/specs`, `docs/adr`, `docs/features`, `docs/postmortems` and `docs/prototypes` with `CONTEXT.md`, `README.md` and `package.json`. `check:lang` and `check:nul` read them at e53f6d0; the nine hold 0 CJK characters and 0 NUL bytes (scanned at e53f6d0), so those results stand there |

The log is usable evidence for e53f6d0 for the objects under review.

### Written test against the Test design table

| # | Seam and driving input | Assertion and expected value's source | Fixture | Resource | Result |
|---|---|---|---|---|---|
| G0 | gate CLI on the planted tree, now seven planted pages | as before; `planted` is `Object.keys(PLANTS)`, which holds the session and shell pages | copied pages | `runGate()` once, at module load | Matches the note |
| A | the link line removed; `NAMED_IN_A_COMMENT` then requires the page to contain `_shared/app-window.css` | exact line, literal | the real page and its HTML comment (`global-search/prototype-search.html:55`) | as G0 | Matches |
| B | the script line removed; the page must still contain `_shared/project-side.js` | exact line, literal | the real `//` line in an inline script (`project-list/prototype-list.html:86`) | as G0 | Matches |
| G | `  <script src="../_shared/app-rail.js"></script>\n` removed; ` // the rail is drawn by ../_shared/app-rail.js` appended to `  let lang='zh';` (shell page line 82, inside the inline script of lines 73–104); the set-up assertion for the page | exact line, literal | the page's own inline script | as G0 | Matches. The set-up assertion is vacuous for G: the comment it looks for is the test's own plant, so it holds whenever the plant applies. What keeps G from becoming a no-op is the plant-once check on both strings; the design's "the set-up assertion of A, B and G" overstates G's share, and its conclusion holds |
| H | after the `esc` line (session page line 253, the first inline script), a line holding `'https://example.test/'` and then `prefers-color-scheme` in a string | exact line, literal | a URL in a string, the form of the landing page's two URL strings | as G0 | Matches |
| C, D, E, F | plants and assertions unchanged; the set-up they read changed | as before | as before | as G0 | Matches; E's shell page now also carries G's plants (Case design) |

### Coverage

No spec; the units are `270::*` in [checklist.md](checklist.md).

| Unit | Driven by | Result |
|---|---|---|
| 270::1 | A (HTML comment), B (whole-line `//`), G (`//` after code, decision D3); A's and B's comments pinned by the set-up, G's planted; G red on d9b0208's gate | Covered |
| 270::2 | the gate step of `pnpm check:ui` on the fixed gate: "Shared-UI consistency check passed", exit 0 (`targeted-2.txt`, lines 53–77) | Covered |
| 270::R1 | C, D, E, F as before; D3's keep rule only by H, a `//` mid-line in a string | The class-level searches covered; D3's keep rule for that one shape only: finding 3 |

Comment forms against real data, with the parser. Removed: HTML comments and `/* */` by pattern over the whole page,
every JS comment inside an inline script by the parser, and whole-line `//` by pattern over the whole page. The parser
finds 355 ranges in the pages' inline scripts, 38 after code (G's form), none nested (`comment-ranges.txt`). The pages
hold no JSDoc tag (0 tag nodes); a JSDoc tag with a `//` after its type is the form a probe found to give a nested
range, so the `pos < at` branch stays unreached on real data, as the self-check says. What must stay (D3): 7 literals
hold `//` (the landing page's two URL strings, the regular expression `/^https?:\/\//i` on agents-page and
project-detail, and Markdown fixture strings), and each is kept whole: the parser never takes a literal for a comment,
and the regular expressions and URL strings were checked directly. 4 strings hold `/*`, glob paths in mock content
(session-view three, plugins-view one); the block-comment pattern opens a comment at each, and only the absence of a
later `*/` keeps it from removing code (finding 3). The one non-JS script (`type="text/x-fixture"`, Markdown, on
md-preview's heading ladder page) comes out of the parser unchanged. On all 17 pages `stripComments` today equals a
reference stripping (HTML comments; each inline script's JS comments by the parser; CSS comments only inside
`<style>`), so main is unaffected now.

Fixtures: G's trailing comment copies the form of the 38; H's URL string the landing page's. Both are shapes taken from
real pages, independent of the issue's text. The real-data shape the plants do not take, a `/*` inside a string, is
finding 3.

Test file header: unchanged, no gap declared. The fix adds no path without a behaviour trigger: the `pos < at` branch
can be planted (above), so it is no untestable gap, and no page takes its form. Finding 3's handling decides whether
the header must state a limit.

### Case design

- Public seam and reachable plants, as before: G and H are page edits a contributor can make, read through the gate's
  output and exit code.
- Independence of the plants: the shell page now carries E's plant (a `/* */` naming `toast.css`: the toast block's
  reverse check) and G's (the `app-rail.js` script removed and named in a trailing comment: the app-rail block).
  Different blocks: G's plant names no toast asset and E's no app-rail asset, and G's other messages on the page (the
  rail rule's ordering lines) fall to G0's planted pages. The design's "each plant is on its own page and block" no
  longer holds for this page; its conclusion holds. H's plant is alone on the session page and names no asset.
- Isolation, clean-up, and a set-up failure failing the file: as before. The new set-up assertion throws inside
  `runGate`, so the file fails at load with its message (`pin-guard.txt`, exit 1).

### False greens

| Form | Check |
|---|---|
| Constant truth | G and H each assert one exact line; the set-up assertion is constant for G (above) and is not counted as G's guard |
| Tautology | the expected lines are literals, not computed by the gate's code |
| Stale path | the test copies the working tree's gate, the parser step included |
| Silent skip on a condition | none |
| Assertion that may not run | synchronous cases, no callbacks |
| A new gate never seen red (false-greens form four) | G: red on d9b0208's gate, the plant shown reached apart from G's assertion: the app-rail block reports "all 11 usage site(s) compliant" while the rail rule's ordering lines on the shell page ("includes app-rail.js before the rail it draws", which a search returning -1 produces) show the script tag gone (`red-first-2.txt`). H: red under a copy whose `stripJsComments` ends a line at any `//`, the mutation shown reached: the theme rule passes in that run, its session line gone (`naive-h.txt`). The set-up assertion: red on a copy whose global search page names the file only in the link (`grep -c`: 1), `pin-guard.txt` |
| The check's own command wrong | the problem parse `/^ {4}\S/` unchanged; a parser exception would print `    at …` lines, which G0 rejects |
| Target outside the check's scope | the plants are in the copied pages; G's line sits inside an inline script, which the parser step reads |

When does each go red:

| # | Goes red when |
|---|---|
| G0 | the gate exits other than 1, reports nothing, or reports a problem on a page outside the seven planted ones |
| A | the declaring page's asset search reads HTML comments again; the file fails at load if the page's comment stops naming `_shared/app-window.css` |
| B | the same search counts the whole-line `//` comment again, which needs both the parser step and the whole-line pattern to stop removing it, so B does not single out the parser step (G does); the file fails at load if the comment stops naming the script |
| G | the parser step stops removing a `//` after code, or the block check stops reading through `stripComments` |
| H | the stripping removes code after a `//` inside a string, the theme rule stops reading the page's code, or the session page stops following the mode. It does not go red for a `/*` inside a string or a template line starting with `//` (finding 3) |
| C, D, E, F | as in the first post-implementation check; the parser step touches neither HTML comments nor `<style>` |

### Resource reuse

- Unchanged: one tree (a copy of `docs/prototypes/`) and one gate run per file run, built by `runGate()` at module
  load; G and H add plants, not resources.
- Runtime count, from the targeted log: the file ran once (in `pnpm check:ui`, lines 31–52); the nine cases took
  0.049–0.498 ms each and the file 2128 ms: one build, outside the cases. This agrees with the table.
- Cost: 1393–2128 ms per run of the nine-case file across the four recorded runs (`naive-h.txt`, `red-first-2.txt`,
  `green-2.txt`, the targeted log); the gate alone 1.04–1.40 s before the parser step and 1.58–1.61 s after
  (`comment-ranges.txt`). Building once per file stands.
- No case clears or releases the resource, so no ordering question arises.

### Document sync

Facts this check establishes: the incremental check is done on e53f6d0 (range 30a2fee..e53f6d0) with finding 3, and
findings 1 and 2's handling is verified (the set-up assertion shown failing, G red first, H red under the naive
stripping). Files checked: the task inputs (#270's body, `checklist.md`, this record, the targeted and gateway logs);
this work directory's #270 files (`ticket-270-tasks.md`, `ticket-270-doc-sync.md`, `ticket-270-review-code.md`, and
`evidence/ticket-270/`); and the repository through
`rg -uu -l -e check-shared-ui -e check:ui -e stripComments -e stripJsComments`, hidden and ignored files included,
excluding `node_modules`, `site/node_modules`, `out`, `site/dist` and `.git` (dependencies and build output): 120
files. Outside `docs/.workings/` they are the same twelve as in the first round. Other tickets' records under
`docs/.workings/` are left out: each records its own round.

- No permanent document describes how the gate treats comments or what its test holds (their lines name the gate, its
  tiers, CI's step and single rules), so the fix makes none of them untrue.
- `checklist.md`: the 270::1 and 270::R1 rows match the test as written (G with the pinned comments; H). 270::R1's row
  must follow finding 3's handling. There is still no current-verification row for `270::*`; the document sync
  checklist's first item (Pending) covers it, and that row must carry this round's outcome.
- `ticket-270-tasks.md`: D3's "a `//` inside a string, a template or a regular expression stays" is untrue of the gate
  as written for a template line starting with `//` (finding 3); task 7's state is the main agent's to update.
- `ticket-270-review-code.md`, the second layer's Consistency: "The block-comment and whole-line `//` patterns stay, for
  `<style>` blocks and the CSS files the theme rule reads": they also run over inline script bodies (finding 3).
- `ticket-270-doc-sync.md`: no new item; its four items stay Pending.
- Handling finding 3 by (a) adds a Test design table row, which must be reviewed under the design review's increment
  rule before the test changes.

### Findings

**3. The stripping still removes code inside inline scripts: a `/*` in a string opens a block comment, and a template
line starting with `//` is cut.** Kind: a defect against decision D3 and the stripping's contract (its doc comment:
"comments may describe the wiring, only markup and code count"); also a regression that would be missed, since D3's
keep rule is driven for one shape only (H: a `//` mid-line in a string).
After the parser step, `stripComments` still applies `/\/\*[\s\S]*?\*\//g` and `/^\s*\/\/.*$/gm` to the whole page,
inline script bodies included (`scripts/check-shared-ui.mjs:240-241`). So:
- A `/*` inside a JS string starts a "comment" that runs to the next `*/` anywhere later in the page, across scripts
  and markup. The parser step lets the span run further than before, since a real JS block comment, already removed,
  no longer ends it. Real data: four strings on two pages hold `/*`, glob paths in mock content (session-view:
  `tool-results/*.txt` twice and `.github/workflows/*.yml`; plugins-view: `ideas/*.md`). No `*/` survives after them
  today, so nothing is removed on main (Coverage). Probe on the real session page: one mock Glob line in the page's own
  form, `const mockGlob = 'Glob  src/**/*.ts → …'` (a `**/` glob holds `*/`), put at the start of the last inline
  script, cuts about 39,200 characters of inline script code from what every rule reads (`stripComments` output
  52,850 characters before, 13,658 after the 46-character line); with
  `const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')` placed after the page's first `/*` string
  (line 284), the theme rule's input holds `prefers-color-scheme` without the Glob line and does not with it, so a
  mode-following page styling by the system appearance passes. A synthetic probe shows the span also takes markup
  between scripts, a `data-shared-block` declaration included; with the block's asset tags inside the span too, the
  block check skips the page, and a later removal of a real reference there is not reported (#270's acceptance).
- A template literal's line that starts with `//` is removed with the rest of the line (probe), though D3 says "a `//`
  inside a string, a template or a regular expression stays". No page has such a line today.
Why it belongs to this change: the two patterns predate #270 (ef5e4cb has the same three patterns), but this change
routes the shared-block check's four searches and the tab identity rule through `stripComments` (D1), and D3 rebuilt
the function around what must stay; H's row is the case for that keep rule and covers the mid-line string only. The
regular-expression form of the rule holds on real pages (Coverage) without a case driving it either.
Impact: every rule that reads a page without comments (the shared-block searches, tab identity, demo dimensions,
theme, rail and column ordering) silently loses the code in the span; the next glob with `**/` written into a page's
mock content after one of the four strings opens it, on the session page among others.
Records affected: D3's wording in `ticket-270-tasks.md` (the template clause), the code review's consistency note
quoted under Document sync, and the fix commit's message ("a // inside a string, a template or a regular expression
stays").
Recommended handling:
- (a), recommended, now in this ticket: apply the block-comment and whole-line `//` patterns only outside inline script
  bodies (the parser has already removed those bodies' comments; the patterns stay for `<style>` and the CSS files the
  theme rule reads), which stays within D3 as worded ("HTML and CSS comments as before"). Add a case that plants, on a
  page that follows the mode, a `prefers-color-scheme` line between a string holding `/*` and a later string holding
  `*/` (the glob forms the pages use), red on e53f6d0's gate; enter its row in the Test design table and review it
  under the increment rule first.
- (b): state both shapes as a limit in the test header, 270::R1's checklist row and D3's wording, citing the owner's
  decision.

Either way it belongs to this ticket's PR.

### Handling (main agent, 2026-10-26)

- Finding 3: handled by (a), within decision D3 as worded ("HTML and CSS comments as before"). `stripComments` is now
  one pass over the page: an HTML comment in the markup is removed, an inline script's body goes to the parser, a style
  block's body loses its CSS comments, and nothing else is touched — so a `/*` in a script's string and a template line
  starting with `//` stay. The theme rule reads a linked CSS file through `stripCssComments`, its only non-page input.
  New cases I (a `/*` in a string, then code, then a `*/` in a string) and J (a template line starting with `//`), red
  on the gate at e53f6d0 ([red-first-3.txt](evidence/ticket-270/red-first-3.txt)); all eleven cases pass after and
  `check:ui` passes on main ([green-3.txt](evidence/ticket-270/green-3.txt)).
- The note under G's row (the set-up assertion is vacuous for G): `NAMED_IN_A_COMMENT` no longer lists the shell page,
  and the design review's rows and sentences that counted G's assertion now credit the plant-once check.
- Records the finding named: D3's wording is true of the gate now; the code review's consistency note is rewritten;
  e53f6d0's message ("a // inside a string, a template or a regular expression stays") was not true of that commit for
  a template line starting with `//` — the commit cannot be reworded without rewriting pushed history, and the gate
  after this fix makes it true; this handling records the difference.
- The fix changes the test's executable content, so a further incremental check follows.

## Post-implementation check, incremental (2026-10-26, implementation 020e082, fix range e53f6d0..020e082; whole change ef5e4cb..020e082; ticket #270)

Scope: the fix of finding 3, under the incremental clause. Evidence read: the handed targeted log
`evidence/ticket-270/targeted-3.txt`, and `red-first-3.txt` and `green-3.txt` beside it. The handed gateway log
`gateway-d9b0208.txt` is d9b0208's (assessed in the first post-implementation check) and is no evidence for 020e082; a
newer full run is not among the materials. No test was rerun: the run results below come from those logs. Probes ran
in a scratch directory outside the repository, on the stripping functions of the gate at 020e082 and at e53f6d0 taken
from the files by text (the `stripCssComments` line, and from the doc comment before `stripJsComments` to the one
before `loadDimensions`), on the 17 pages and on the plant strings; they wrote no repository file.
`capabilities.toml` is unchanged since ef5e4cb (`git diff --stat ef5e4cb 020e082 -- capabilities.toml`: empty); read
again with `tomllib`: `mutation-testing` is `enabled = false`, and the first incremental check's registry check of the
same file is carried over. By the project capability declaration, mutation-testing is not enabled, so mutation testing
is skipped; each case's "when does it go red" is answered below from the code, the evidence and the expected values'
sources.

### Objects under review

The fix range changes two files outside the records, the gate and its test (`git diff --name-status e53f6d0 020e082`;
the other seven are records and evidence under `docs/.workings/`); no prototype page changes. Tests depending on what
the range changed, searched over every test file in the repository, ignored and hidden files included (103 files match
the globs):

```
$ rg -uu -n --glob '!node_modules/**' --glob '!**/node_modules/**' --glob '!.git/**' --glob '!out/**' --glob '!site/dist/**' \
    --glob '*.{test,spec}.{mjs,cjs,js,ts,tsx,mts,cts,jsx}' -e 'check-shared-ui' -e 'NAMED_IN_A_COMMENT' -e 'PLANTS' \
    -e 'stripJsComments' -e 'stripComments' -e 'stripCssComments' .
./scripts/check-shared-ui.test.mjs:18:const PLANTS = {
./scripts/check-shared-ui.test.mjs:56:const NAMED_IN_A_COMMENT = {
./scripts/check-shared-ui.test.mjs:70:    cpSync(join(repo, 'scripts/check-shared-ui.mjs'), join(root, 'scripts/check-shared-ui.mjs'))
./scripts/check-shared-ui.test.mjs:71:    for (const [page, swaps] of Object.entries(PLANTS)) {
./scripts/check-shared-ui.test.mjs:78:      const asset = NAMED_IN_A_COMMENT[page]
./scripts/check-shared-ui.test.mjs:82:    const r = spawnSync(process.execPath, [join(root, 'scripts/check-shared-ui.mjs')], { encoding: 'utf8' })
./scripts/check-shared-ui.test.mjs:96:  const planted = Object.keys(PLANTS).map((page) => `docs/prototypes/${page}`)
./scripts/check-lang.test.mjs:25:  'scripts/check-shared-ui.mjs': `const side = /${CN}/\n`,
```

`check-lang.test.mjs` names the path only as a seed it writes into a fresh repository, as in the earlier rounds. So the
objects are:
- all eleven cases of `scripts/check-shared-ui.test.mjs`: I and J are new, and every case reads the one run whose
  set-up changed (two plants on two more pages; `NAMED_IN_A_COMMENT` without the shell page) and whose gate changed
  (`stripComments` rebuilt as one pass; the theme rule's linked sheets through `stripCssComments`);
- the Test design table rows changed in the range: I and J (new), G (changed: its set-up assertion dropped, the
  plant-once check named), the G0 note, the increment's Coverage and False greens notes, and the first increment's
  Case design and False greens sentences that credited G's set-up assertion.

Carried over from the first post-implementation check (d9b0208, range ef5e4cb..30a2fee): the gateway log's assessment;
the harness facts (links, copy, clean-up, a set-up failure failing the file); C, D, E and F's rows and fixture shapes.
From the first incremental check (e53f6d0, range 30a2fee..e53f6d0): A, B and H's rows and fixture shapes, the set-up
assertion seen failing (`pin-guard.txt`), G's and H's red-first evidence, and the resource's clearing and ordering
conclusion.

### Targeted log

| Requirement (full-verification-gate) | In the log |
|---|---|
| Version | `HEAD: e53f6d06…` and the porcelain status (`git status --porcelain --untracked-files=all`, no pathspec) with a hash per listed file: the gate `c6800a98…`, the test `1522ebbb…`, `green-3.txt`, `red-first-3.txt`, `checklist.md`, `ticket-270-review-code.md`, `ticket-270-tasks.md` and this record. The command behind the `HEAD:` line is not printed; its value is 020e082's parent |
| Every command, with its full output | the searches for tests reading what changed (the same two test files as above, over `scripts build src e2e site/test`), `pnpm check:ui`, the two tests that read `package.json`, `pnpm lint`, `pnpm check:lang`, `pnpm check:nul` |
| Exit codes taken without a pipe | `exit=0` after each, then `TARGETED_EXIT=0`. As in the earlier rounds, the log does not show how they were taken; each output agrees with its code (pass counts with no failure; lint prints nothing, its success form) |
| Version against the handed range | every listed blob equals the file at 020e082 (`git rev-parse 020e082:<path>`), and `git diff --name-status e53f6d0 020e082` lists those eight files plus `targeted-3.txt`, the run's own output (run 17:01:35 local, commit 17:02:13). So the log ran on 020e082's tree exactly. `check:lang` and `check:nul` at 020e082 also read the log: 0 CJK characters and 0 NUL bytes in it (scanned) |

The log is usable evidence for 020e082 for the objects under review.

### Written test against the Test design table

| # | Seam and driving input | Assertion and expected value's source | Fixture | Resource | Result |
|---|---|---|---|---|---|
| I | in `plugins-view/prototype-plugin-skill-preview.html` (`data-follow="language=zh,en mode theme"`), after `  let lang = DemoDimensions.get('language')\n` (line 160, inside the page's first inline script), the line `  const globs = ['ideas/*.md', window.matchMedia('(prefers-color-scheme: dark)'), 'src/**/*.ts']` | exact line, literal: the theme rule's message for the page | the page's own inline script; the opening string is the page's own `ideas/*.md` (line 203) | as G0 | Matches |
| J | in `skill-install/prototype-install.html` (follows the mode), before `  const T={\n` (line 102, inside the page's first inline script), a template literal `note` over three lines whose middle line starts with `//` and holds `prefers-color-scheme` | exact line, literal | a multi-line template in the page's own inline script | as G0 | Matches |
| G | the two plants as before; `NAMED_IN_A_COMMENT` no longer lists the shell page | exact line, literal | as before | as G0 | Matches the changed row: what keeps G from a no-op is the plant-once check on both strings; the vacuous set-up assertion the first incremental check noted is gone |
| G0 | nine planted pages (`Object.keys(PLANTS)`), I's and J's among them | as before | copied pages | `runGate()` once, at module load | Matches the note |
| A–F, H | plants and assertions unchanged; the run they read gained two plants on pages none of them uses; A's and B's pages are still pinned by the set-up | as before | as before | as G0 | Matches |

### Coverage

No spec; the units are `270::*` in [checklist.md](checklist.md), from #270's acceptance and decisions D1 and D3.

| Unit | Driven by | Result |
|---|---|---|
| 270::1 | A (an HTML comment in the markup: the pattern's first branch), B (a whole-line `//` in an inline script: now the parser alone), G (a `//` after code: the parser); A's and B's comments pinned by the set-up, G's planted | Covered |
| 270::2 | the gate step of `pnpm check:ui` on 020e082: "Shared-UI consistency check passed", exit 0 (`targeted-3.txt`, lines 57–81). On all 17 pages the one-pass `stripComments` gives the same text as e53f6d0's, byte for byte (probe), so every rule reads on main what it read before this fix | Covered |
| 270::R1 | C, D, E, F as before. D3's keep rule: H (a `//` in a string), I (a `/*` in a string, then code, then a `*/` in a string), J (a template line starting with `//`); a `//` inside a regular expression by no case | The class-level searches covered; D3's regular-expression shape not driven: finding 4 |

Real data against the one pass (probes over the 17 HTML files under `docs/prototypes/`): 33 inline scripts and one
`<style>` block per page; no closing tag with a space before `>`, every `script` and `style` tag in lower case (370
matches with and without case folding), no `<!--` inside a script body. Literals in the inline scripts, by the parser:
4 hold `/*` (plugins-view line 203; session-view lines 284, 315 and 360), none holds `*/`; 199 template literals or
template parts span lines, on 9 pages, none with a line starting with `//`; 32 regular-expression literals, 2 of them
holding `//` (finding 4), none `/*`. The 12 shared sheets the mode-following pages link hold no `prefers-color-scheme`
at all, raw or stripped, so the theme rule's switch to `stripCssComments` for them changes no result and nothing drives
it. Not counted: D3 keeps CSS comments "as before", for a sheet the removal is the same block-comment pattern as at
e53f6d0, and losing it would show as a red on the next sheet comment naming the media feature, not as a silent pass.

What the one pass leaves to no case: a `//` line or a `/* */` span in the markup's text (now kept; the old whole-page
patterns removed them, and the byte-equal output shows no page has one), the closing tag's `\s*`, and the case folding
of the tag name. A pattern brought back over the whole page turns J (whole-line `//`) or I (block comment) red; one
confined to the markup, or a page writing `</script >` or an upper-case tag, is a form no page takes and no decision
names, so these are not counted, as the `pos < at` branch was not.

Fixtures: I's opening string is plugins-view's own (`ideas/*.md`); the closing `src/**/*.ts` takes the pages'
glob-string form with a `**` segment, which no page holds today (no literal holds `*/`) and which is what closes the
span. J's template takes the form of the pages' multi-line templates, with the planted line the keep rule is about.
Both are planted boundaries; the feature's real-sample shapes remain A's and B's real comments.

Test file header: unchanged (lines 1–6), no gap declared. The fix adds no path without a behaviour trigger: each form
listed above can be planted. Finding 4's handling decides whether the header must state a limit.

### Case design

- Public seam and reachable plants, as before: I and J are page edits a contributor can make (a glob array in mock
  data, a multi-line template), read through the gate's output and exit code.
- Independence: I is alone on plugins-view and J alone on skill-install; neither names an asset or touches markup, and
  each produces one message, the theme rule's line on its planted page. Each plant is self-contained: I's `/*` and `*/`
  are both on its own line, so the span e53f6d0's pattern removed was the plant's own; J's `//` line lies inside its
  own template.
- Location: both plants lie inside their page's first inline script (probe: no HTML comment, style block or markup
  around them), so the cases test the script route, not the markup's text, which the one pass leaves untouched too.
- Isolation, clean-up and a set-up failure failing the file: carried over. The set-up assertion now covers A and B
  only.

### False greens

| Form | Check |
|---|---|
| Constant truth | I and J each assert one exact line; neither page reports it on main (`targeted-3.txt`, gate step) |
| Tautology | the expected lines are literals, not computed by the gate's code |
| Stale path | the test copies the working tree's gate; the theme rule is live (it runs and passes in the gate step) |
| Silent skip on a condition | none |
| Assertion that may not run | synchronous cases, no callbacks |
| A new gate never seen red (false-greens form four) | I and J red on e53f6d0's gate (`red-first-3.txt`, exit 1, each failing at its own assertion), the other nine green there. That run's test is not the committed one (`git hash-object` 36b728c3, against 1522ebbb): the committed test with `NAMED_IN_A_COMMENT`'s earlier doc comment and its shell page entry restored hashes to 36b728c3 exactly (rebuilt in the scratch directory), so I's and J's plants and assertions are the committed ones. Plants reached: after the fix both lines appear (`green-3.txt`), which only the plants produce |
| Target outside the check's scope | the plants lie in the scripts the parser step reads (Case design) |

When does each go red:

| # | Goes red when |
|---|---|
| G0 | the gate exits other than 1, reports nothing, or reports a problem on a page outside the nine planted ones |
| A | HTML comments in the markup stop being removed before the declaring page's asset search; the file fails at load if the page's comment stops naming `_shared/app-window.css` |
| B | the parser step stops removing a whole-line `//` comment: with the old patterns gone it is the only step that removes it, so B now singles out the parser for that form (the first incremental check's "needs both" no longer holds); the file fails at load if the comment stops naming the script |
| G | the parser step stops removing a `//` after code, or script bodies stop going to it |
| H | the stripping of a script removes code after a `//` inside a string, the theme rule stops reading the page's code, or the session page stops following the mode |
| I | the stripping of a script (or of the whole page) opens a comment at a `/*` inside a string and closes it at a later `*/` inside a string, as e53f6d0's block pattern did; or H's theme conditions, for plugins-view |
| J | a whole-line `//` pattern runs over script bodies (as at e53f6d0), or the stripping takes a template's line for a comment; or H's theme conditions, for skill-install |
| C, D, F | HTML comments in the markup stop being removed before the declaration search (C), the mount-point search (D), or the tab identity rule's read of `<head>` (F) |
| E | CSS comments inside `<style>` stop being removed (the style branch dropped or its body left unstripped), or the reverse check reads the raw page |

None goes red when a `//` inside a regular-expression literal is taken for a comment (finding 4).

### Resource reuse

- Unchanged: one tree (a copy of `docs/prototypes/`) and one gate run per file run, built by `runGate()` at module
  load; I and J add plants, not resources.
- Runtime count, from the targeted log: the file ran once (in `pnpm check:ui`, lines 33–56); the eleven cases took
  0.050–1.328 ms each and the file 2082 ms: one build, outside the cases. This agrees with the table.
- Cost: 2082–2661 ms per run of the eleven-case file across the three recorded runs (`targeted-3.txt`, `green-3.txt`,
  `red-first-3.txt`); the gate alone 1.60–1.63 s at 020e082 against 1.58–1.65 s at e53f6d0 in the interleaved timing
  of `green-3.txt`. Building once per file stands.
- No case clears or releases the resource, so no ordering question arises.

### Document sync

Facts this check establishes: the incremental check is done on 020e082 (range e53f6d0..020e082) with finding 4, and
finding 3's handling is verified (I and J red on e53f6d0's gate with the committed plants, green after; the one pass
equal to e53f6d0's stripping on all 17 pages; the gate green on main). Files checked: the task inputs (#270's body,
`checklist.md`, this record, the targeted and gateway logs); this work directory's #270 files (`ticket-270-tasks.md`,
`ticket-270-doc-sync.md`, `ticket-270-review-code.md`, and `evidence/ticket-270/`: 18 files, the three this range adds
read in full, the rest unchanged since the earlier rounds read them); and the repository through
`rg -uu -l -e check-shared-ui -e check:ui -e stripComments -e stripJsComments -e stripCssComments`, hidden and ignored
files included, excluding `node_modules`, `site/node_modules`, `out`, `site/dist` and `.git` (dependencies and build
output): 123 files. Outside `docs/.workings/` they are the same twelve as in the earlier rounds. Other tickets' records
under `docs/.workings/` are left out: each records its own round.

- No permanent document describes how the gate treats comments or what its test holds (their lines name the gate, its
  tier, CI's step and single rules), so the fix makes none of them untrue.
- `checklist.md`: the 270::1 and 270::R1 rows match the test as written; 270::R1's row lists H, I and J and is silent
  on the regular-expression shape, which finding 4's handling settles. There is still no current-verification row for
  `270::*`; the document sync checklist's first item (Pending) covers it, and that row must carry this round's outcome.
- `ticket-270-tasks.md`: D3 as worded is true of the gate at 020e082 (the two regular-expression lines are kept whole,
  probe). Tasks 3 and 7 describe step 6 as it stood before the first incremental check (task 3's increment lists rows
  A, B, G and H; task 7 ends "the incremental check of the fix follows"). Not counted as a finding: step 6 is still
  open and these are its progress rows; when it closes they must carry the increment for I and J, finding 3 and its
  handling, and finding 4 and its handling. The first incremental check left task 7 to the main agent; this settles
  when: at step 6's close.
- `ticket-270-review-code.md`: the rewritten consistency note matches the gate; the self-check of finding 3's fix ("a
  `//` or `/*` inside a string, a template or a regular expression stays, with the code after it (cases G–J)") credits
  G–J with the regular-expression shape (finding 4).
- This record: finding 3's handling is accurate as checked above; the increment's Coverage note on the
  regular-expression shape is finding 4.
- `ticket-270-doc-sync.md`: no new item; its four items stay Pending.
- Handling finding 4 by (a) adds a Test design table row, which must be reviewed under the design review's increment
  rule before the test changes.

### Findings

**4. D3's regular-expression shape is driven by no case, and the record says the gate on main covers it.** Kind: a
regression that would be missed, against decision D3 ("a `//` inside a string, a template or a regular expression
stays"), the owner's ruling that stands in for a spec here; also an inaccurate record.
- No case's plant holds a regular-expression literal (G: a real comment; H: a string; I: strings; J: a template). On
  the pages the parser finds 32 such literals in the 33 inline scripts; two hold `//`, the same `/^https?:\/\//i` at
  `agents-page/prototype-agents.html:724` and `project-detail/prototype-detail.html:775`. What follows the literal's
  `//` on both lines, `i.test(href)){ window.open(href,'_blank','noopener'); return }`, holds nothing any rule searches
  for (block declarations and assets, mount-point ids, script and link tags, `DemoDimensions`, `prefers-color-scheme`,
  the tags in `<head>`). A stripping that took that `//` for a comment and cut the rest of the line would leave every
  rule's result on main unchanged: `check:ui` passing on main shows the shape is kept today, not that its loss would
  show.
- The shape is where a tokenizer without the parser's context goes wrong. TypeScript's scanner, run over the plant
  lines and the two page lines alone (it cannot tell a regular expression from a division), cuts both page lines after
  the literal's `\/\`, leaves H's, I's and J's plant lines whole and removes G's comment, while the gate's
  `stripJsComments` keeps both page lines whole (probe). So H, I and J cannot tell such a stripping from the parser on
  this point.
- Records: this record's increment for finding 3, Coverage ("the three shapes D3 keeps are each driven"; "The
  regular-expression shape ... stays covered by `check:ui` passing on main"): D3 names a string, a template and a
  regular expression, and H, I and J drive the first two and finding 3's `/*` string; and the code review's self-check
  of finding 3's fix ("(cases G–J)"). The first incremental check noted the shape undriven inside finding 3 without
  making it an item of its own; this finding makes it one.
- Impact: code after a `//` inside a regular expression on the same line would drop out of what every rule reads
  without a sign; the two lines today lose nothing a rule reads, the next such line could (a `prefers-color-scheme`
  read or an asset path after a URL test).
- Recommended handling:
  - (a), recommended, now in this ticket: a case on a mode-following page no other plant uses
    (`project-detail/prototype-detail-stale-note.html`, `md-preview/prototype-heading-ladder.html` or the landing
    page): a line in its first inline script with the pages' own literal and, after it on the same line, code holding
    `prefers-color-scheme`, for instance
    `  const isUrl = (u) => /^https?:\/\//i.test(u); const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')`,
    which the gate keeps whole and the scanner cuts after `\/\` (probe); it asserts the theme rule's line for that
    page. Its red is shown once on a scratch copy whose `stripJsComments` takes the literal's `//` for a comment, as
    H's was under the naive stripping. Enter its row in the Test design table and review it under the increment rule
    first.
  - (b): state the shape as a limit (kept by the parser alone, driven by no case) in the test header and in 270::R1's
    checklist row, citing the owner's decision.
  - Either way, rewrite the increment's two Coverage sentences and the code review's "(cases G–J)" to what the cases
    drive.

Either way it belongs to this ticket's PR.

### Handling (main agent, 2026-10-26)

- Finding 4: handled by (a), within decision D3. Case K plants, on the stale-note page (follows the mode), the pages'
  own `/^https?:\/\//i` and, after it on the same line, code reading `prefers-color-scheme`; it asserts the theme rule's
  line for that page. Green on the gate ([green-4.txt](evidence/ticket-270/green-4.txt), twelve of twelve); red under
  a copy whose `stripJsComments` uses the TypeScript scanner alone, where it is the only case red
  ([scanner-k.txt](evidence/ticket-270/scanner-k.txt)). The two records the finding named are rewritten: the
  increment's Coverage sentences (K drives the regular-expression shape; main passing showed only that it is kept)
  and the code review's self-check (G–J for the string and template shapes, K for the regular expression).
- The fix changes the test's executable content, so a further incremental check follows.

## Post-implementation check, incremental (2026-10-26, implementation 8e9ddf4, fix range 020e082..8e9ddf4; whole change ef5e4cb..8e9ddf4; ticket #270)

Scope: the fix of finding 4, under the incremental clause. Evidence read: the handed targeted log
`evidence/ticket-270/targeted-4.txt`, and `green-4.txt` and `scanner-k.txt` beside it. The handed gateway log
`gateway-d9b0208.txt` is d9b0208's (assessed in the first post-implementation check; unchanged since 30a2fee,
`git diff --stat 30a2fee 8e9ddf4 -- <it>` empty) and is no evidence for 8e9ddf4; a newer full run is not among the
materials. No test was rerun: the run results below come from those logs. One probe ran in a scratch directory outside
the repository: the stripping functions of the gate at 8e9ddf4 taken from the file by text (the `stripCssComments`
line, and from the doc comment before `stripJsComments` to the one before `loadDimensions`), and the scanner-only
`stripJsComments` as `scanner-k.txt`'s diff writes it, each run on the stale-note page with and without K's committed
plant strings; it wrote no repository file. `capabilities.toml` is unchanged since ef5e4cb
(`git diff --stat ef5e4cb 8e9ddf4 -- capabilities.toml`: empty); read again with `tomllib` and checked against the
repo-scaffold registry: the nine registered IDs present in their registered shapes, none extra, and
`macos-distribution`'s precondition holds (`client-framework = "electron"`). By the project capability declaration,
mutation-testing is not enabled, so mutation testing is skipped; each case's "when does it go red" is answered below
from the code, the evidence and the expected values' sources. K is an assertion of a gate's test, so the review-code
false-greens list is applied with the unit-test forms.

### Objects under review

The fix range changes one file outside the records, the test (`git diff --name-status 020e082 8e9ddf4`: the test, and
seven records and evidence files under `docs/.workings/`). The gate is unchanged (blob `c6800a98…` at both ends), and
so are the pages, `package.json` and `capabilities.toml`
(`git diff --stat 020e082 8e9ddf4 -- docs/prototypes scripts/check-shared-ui.mjs package.json capabilities.toml`:
empty). Tests depending on what the range changed, searched over every test file in the repository, ignored and hidden
files included (103 files match the globs):

```
$ rg -uu -n --glob '!node_modules/**' --glob '!**/node_modules/**' --glob '!.git/**' --glob '!out/**' --glob '!site/dist/**' \
    --glob '*.{test,spec}.{mjs,cjs,js,ts,tsx,mts,cts,jsx}' -e 'check-shared-ui' -e 'NAMED_IN_A_COMMENT' -e 'PLANTS' \
    -e 'runGate' -e 'prototype-detail-stale-note' .
./scripts/check-shared-ui.test.mjs:18:const PLANTS = {
./scripts/check-shared-ui.test.mjs:39:  'project-detail/prototype-detail-stale-note.html': [
./scripts/check-shared-ui.test.mjs:63:const NAMED_IN_A_COMMENT = {
./scripts/check-shared-ui.test.mjs:69:function runGate() {
./scripts/check-shared-ui.test.mjs:77:    cpSync(join(repo, 'scripts/check-shared-ui.mjs'), join(root, 'scripts/check-shared-ui.mjs'))
./scripts/check-shared-ui.test.mjs:78:    for (const [page, swaps] of Object.entries(PLANTS)) {
./scripts/check-shared-ui.test.mjs:85:      const asset = NAMED_IN_A_COMMENT[page]
./scripts/check-shared-ui.test.mjs:89:    const r = spawnSync(process.execPath, [join(root, 'scripts/check-shared-ui.mjs')], { encoding: 'utf8' })
./scripts/check-shared-ui.test.mjs:96:const run = runGate()
./scripts/check-shared-ui.test.mjs:103:  const planted = Object.keys(PLANTS).map((page) => `docs/prototypes/${page}`)
./scripts/check-shared-ui.test.mjs:124:  assert.ok(reported('docs/prototypes/project-detail/prototype-detail-stale-note.html: follows the mode but still styles by prefers-color-scheme'), run.out)
./scripts/check-lang.test.mjs:25:  'scripts/check-shared-ui.mjs': `const side = /${CN}/\n`,
```

The test file has no `export` statement and no `module.exports` (`rg -n -e '^export' -e 'module\.exports'` on it: no
match), so no file can import its plant table or `runGate`; `check-lang.test.mjs` names the gate's path only as a seed
it writes into a fresh repository, as in the earlier rounds. The stale-note page, K's new fixture, is named by no other
test (outside `docs/.workings/`, its path appears only in this test and in `docs/prototypes/manifest.js`). So the
objects are:
- all twelve cases of `scripts/check-shared-ui.test.mjs`: K is new, and every case reads the one run whose set-up
  gained K's plant;
- the Test design table rows changed in the range: K (new), the G0 note under it, and the finding-3 increment's
  Coverage sentences (rewritten).

Carried over from the first post-implementation check (d9b0208, range ef5e4cb..30a2fee): the gateway log's assessment;
the harness facts (links, copy, clean-up, a set-up failure failing the file); C, D, E and F's rows and fixture shapes.
From the first incremental check (e53f6d0, range 30a2fee..e53f6d0): A, B and H's rows and fixture shapes, the set-up
assertion seen failing (`pin-guard.txt`), G's and H's red-first evidence, and the resource's clearing and ordering
conclusion. From the second incremental check (020e082, range e53f6d0..020e082): G, I and J's rows and fixture
shapes, I's and J's red-first evidence, the real-data facts of the one pass (scripts, literals, sheets), and its
byte-equal output against e53f6d0's stripping on all 17 pages.

### Targeted log

| Requirement (full-verification-gate) | In the log |
|---|---|
| Version | `HEAD: 020e0820…` and the porcelain status (`git status --porcelain --untracked-files=all`, named in the header, no pathspec) with a hash per listed file: the test `695ec141…`, `green-4.txt`, `scanner-k.txt`, `checklist.md`, `ticket-270-review-code.md`, `ticket-270-tasks.md` and this record |
| Every command, with its full output | the searches for tests reading what changed (the same two test files as above, over `scripts build src e2e site/test`), `pnpm check:ui`, the two tests that read `package.json`, `pnpm lint`, `pnpm check:lang`, `pnpm check:nul` |
| Exit codes taken without a pipe | `exit=0` after each, then `TARGETED_EXIT=0` |
| Version against the handed range | every listed blob equals the file at 8e9ddf4 (`git rev-parse 8e9ddf4:<path>`), and `git diff --name-status 020e082 8e9ddf4` lists those seven files plus `targeted-4.txt`, the run's own output (its date line 17:21:07 local; committed with the fix at 17:21:41). So the log ran on 8e9ddf4's tree exactly. `check:lang` and `check:nul` at 8e9ddf4 also read the log: 0 CJK characters and 0 NUL bytes in its 19,070 bytes (scanned) |

Two notes on the logs' form have been carried since the first round without a decision: the `HEAD:` line prints its
value without its command (noted in the second incremental check), and the log does not show how the exit codes were
taken (each round). Decided here, for logs of this form: neither is a missing item. The HEAD value is labelled and
checked against the repository (8e9ddf4's parent); its command takes no path argument, which is what printing a
version command guards against (a pathspec that hides files from the listing), and the status command, which could
take one, is printed with its arguments. Each `exit=` follows a command printed without a pipe, and each command's own
output shows the same result (pass counts with no failure, the gate's "passed" line, lint's empty success form), so no
code stands alone. A log whose form changes, or a command whose output cannot show its result, is judged anew.

The log is usable evidence for 8e9ddf4 for the objects under review.

### Written test against the Test design table

| # | Seam and driving input | Assertion and expected value's source | Fixture | Resource | Result |
|---|---|---|---|---|---|
| K | in `project-detail/prototype-detail-stale-note.html` (`data-follow="language mode theme"`, line 72), after `const PATH = '/Users/you/Projects/removed-experiment-2025';\n` (line 114, inside the page's first inline script, lines 112–174), the line `const isUrl = (u) => /^https?:\/\//i.test(u); const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')` (the test's string escapes give exactly this text, probe) | exact line, literal: the theme rule's message for the page | the pages' own literal (`agents-page/prototype-agents.html:724`, `project-detail/prototype-detail.html:775`; `rg -F` over `docs/prototypes/` finds these two and no other), in the page's own inline script | as G0 | Matches |
| G0 | ten planted pages (`Object.keys(PLANTS)`), K's among them. D's page and K's share the `project-detail/prototype-detail` stem; the prefix check appends `:`, so neither page's lines pass as the other's | as before | copied pages | `runGate()` once, at module load | Matches the note |
| A–J | plants and assertions unchanged; the run they read gained one plant on a page none of them uses | as before | as before | as G0 | Matches |

The finding-3 increment's rewritten Coverage sentences (H, I and J for three shapes of what must stay; K for the
regular expression; main passing showed only that the two literals are kept) agree with the test as written.

### Coverage

No spec; the units are `270::*` in [checklist.md](checklist.md), from #270's acceptance and decisions D1 and D3.

| Unit | Driven by | Result |
|---|---|---|
| 270::1 | A, B, G as in the second incremental check; the range does not touch them | Covered |
| 270::2 | the gate step of `pnpm check:ui` on 8e9ddf4: "Shared-UI consistency check passed", exit 0 (`targeted-4.txt`, lines 57–81); the gate and the pages are unchanged in the range | Covered |
| 270::R1 | C, D, E, F as before. D3's keep rule ("a `//` inside a string, a template or a regular expression stays"): H (a string), J (a template line starting with `//`), K (a regular expression); I adds finding 3's `/*` in a string | Covered: every shape D3 names is driven |

Real data against K: the literal is the pages' own. Its context differs: on the pages it follows `if(`, in K it follows
`=>`. Both are regular-expression positions to the parser, and the scanner alone cuts both (the second incremental
check's probe on the two page lines; this round's probe on K's line), so the difference changes no outcome. The code
after the literal is planted, as H's is: on the pages nothing a rule reads follows the literal (finding 4), so a
planted reader of `prefers-color-scheme` is what makes the cut visible.

Fixtures: K's literal is a real-sample shape, independent of D3's text; the line around it is a planted boundary, as
for H, I and J.

Test file header: unchanged (lines 1–6), no gap declared. The fix adds no path without a behaviour trigger.

### Case design

- Public seam and reachable plant, as before: a URL test followed by code on one line of a page's script is a page edit
  a contributor can make, read through the gate's output and exit code.
- Independence: K is alone on the stale-note page, and its line names no asset, block, mount point or script tag, so
  its one message is the theme rule's line for its page; the theme rule judges each page alone. In `scanner-k.txt` the
  planted run reports 15 problems, every one on another planted page; with K's line read, the run still passes G0
  (`targeted-4.txt`).
- Location: K's plant lies inside the page's first inline script (probe: the one-pass pattern's match around it is the
  `<script>` block of lines 112–174, the first with a body). As for I and J, this is what lets K go red: in the
  markup's text the one pass would keep the line whatever the script stripping did. The anchor is a JS statement of
  that script, and the plant-once check fails the file if it changes.
- Isolation, clean-up and a set-up failure failing the file: carried over.

### False greens

| Form | Check |
|---|---|
| Constant truth | K asserts one exact line. The unplanted stale-note page holds no `prefers-color-scheme` after stripping (probe), and the gate step on main reports nothing for it (`targeted-4.txt`), so the line comes from K's plant alone |
| Tautology | the expected line is a literal, not computed by the gate's code |
| Stale path | the test copies the working tree's gate; the theme rule is live (it runs in the gate step) |
| Silent skip on a condition | none |
| Assertion that may not run | synchronous case, no callback |
| Presence for effect; command that cannot tell | K asserts its page's own report line, not the exit code or the presence of output |
| A new gate never seen red (false-greens form four) | K cannot be red on the gate (it guards what the parser keeps); it is green there (`targeted-4.txt`, `green-4.txt`) and red under the copy whose `stripJsComments` uses the TypeScript scanner alone (`scanner-k.txt`, exit 1, failing at its own assertion, test line 124; the other eleven green). Reach, apart from K's assertion: the probe shows the scanner-only stripping cutting K's line after `/^https?:\/\` and leaving no `prefers-color-scheme` on the page, while the gate's keeps the line whole; and the run's output in `scanner-k.txt` lists the theme rule's lines for the other three planted mode pages and not this one. The file records no HEAD or hash; its versions are fixed by its content: the diff's left side is byte-equal to the gate's lines 216–231 at 8e9ddf4 (020e082's gate, compared); I and J green rule out e53f6d0's gate, where they are red whatever `stripJsComments` does (its block and whole-line patterns, `red-first-3.txt`); the failing case is K at test lines 123–124, the twelve cases in the committed order; and `green-4.txt`, written in the same second by file time (17:21:07, the targeted log's date line too), records HEAD 020e082, the gate unchanged and the test `695ec141…`. So it backs K's red for the committed test and gate; how the task list describes it is finding 5 |
| The check's own command wrong | the problem parse `/^ {4}\S/` unchanged |
| Target outside the check's scope | the plant lies in the inline script the parser step reads (Case design) |

When does each go red:

| # | Goes red when |
|---|---|
| G0 | the gate exits other than 1, reports nothing, or reports a problem on a page outside the ten planted ones |
| K | the stripping of a script takes the `//` inside a regular-expression literal for a comment and cuts the rest of the line: a tokenizer without the parser's context (the scanner alone, `scanner-k.txt`), or a pattern that knows strings and templates but not regular expressions (the literal's `\//` holds a `//` outside any quote); or H's theme conditions, for the stale-note page; the file fails at load if the anchor line changes. H, I and J stay green under the scanner alone (`scanner-k.txt`), so K is the only case for that regression |
| A–J | as in the second incremental check |

### Resource reuse

- Unchanged: one tree (a copy of `docs/prototypes/`) and one gate run per file run, built by `runGate()` at module
  load; K adds a plant, not a resource.
- Runtime count, from the targeted log: the file ran once (in `pnpm check:ui`, lines 32–56); the twelve cases took
  0.0455–0.779 ms each and the file 1585 ms: one build, outside the cases. This agrees with the table.
- Cost: 1585 ms (`targeted-4.txt`) and 1784 ms (`green-4.txt`) per run of the twelve-case file on the gate; 1129 ms
  under the scanner-only copy, which is not the gate. Building once per file stands.
- No case clears or releases the resource, K included, so no ordering question arises.

### Document sync

Facts this check establishes: the incremental check is done on 8e9ddf4 (range 020e082..8e9ddf4) with finding 5, and
finding 4's handling is verified (K matches its row, green on the gate, red under the scanner alone with the reach
shown apart from its assertion; the two records the finding named are rewritten and accurate). Files checked: the task
inputs (#270's body by `gh issue view`, `checklist.md`, this record, `targeted-4.txt`, `gateway-d9b0208.txt`); this
work directory's #270 files (`ticket-270-tasks.md`, `ticket-270-doc-sync.md`, `ticket-270-review-code.md`, and
`evidence/ticket-270/`: 21 files, the three this range adds read in full, the other 18 unchanged in the range);
`final-regression.md`, checked by its path: not there yet (the document sync checklist's third item, Pending); and the
repository through `rg -uu -l -e check-shared-ui -e check:ui -e stripComments -e stripJsComments -e stripCssComments`,
hidden and ignored files included, excluding `node_modules`, `site/node_modules`, `out`, `site/dist` and `.git`
(dependencies and build output): 126 files, outside `docs/.workings/` the same twelve as in the earlier rounds, whose
matching lines were read; and `rg -uu -n -e prototype-detail-stale-note` outside `docs/.workings/`: the test and
`manifest.js` only. Other tickets' records under `docs/.workings/` are left out: each records its own round.

- No permanent document describes what the gate's test holds (their lines name the gate, its tier, CI's step and
  single rules), so the new case makes none of them untrue.
- `checklist.md`: 270::R1 now names the regular-expression shape and its red under the scanner alone, which matches K
  and `scanner-k.txt`; 270::1 and 270::2 are unchanged and match. There is still no current-verification row for
  `270::*`; the document sync checklist's first item (Pending) covers it, and that row must carry this round's outcome.
- `ticket-270-tasks.md`: task 7 now carries findings 3 and 4 and their handling, accurately. Task 3 still lists only
  the first increment (rows A, B; new G, H); under the second incremental check's settlement it must carry the
  increments for I and J and for K when step 6 closes. The self-check of finding 4's fix: finding 5.
- `ticket-270-review-code.md`: the rewritten self-check of finding 3's fix credits K with the regular expression and
  "G–J" with the string and template shapes. Each shape it credits is driven (H, I, J; G drives the sentence's first
  clause, a `//` after code). Not counted: wording, with no shape credited that no case drives. The self-check of
  finding 4's fix ("a test case only; the gate is unchanged") is accurate (the gate's blob is the same at both ends).
- This record: K's row, the G0 note, the rewritten Coverage sentences and finding 4's handling are accurate as checked
  above.
- `ticket-270-doc-sync.md`: no new item; its four items stay Pending.
- Handling finding 5 changes a record sentence only, no Test design table row.

### Findings

**5. The task list says `scanner-k.txt` keeps its versions; it records none, and writes its commands with
placeholders.** Kind: an inaccurate record.
- `ticket-270-tasks.md`, the self-check of finding 4's fix: "`green-4.txt` and `scanner-k.txt` keep their commands,
  versions and whole output". `scanner-k.txt` has no HEAD line and no hash of the copied gate or test; its commands
  read `diff <the gate> <the scanner copy>` and `node --test <copy>/scripts/check-shared-ui.test.mjs (the test
  unchanged)`. Its versions follow only by inference from its content and from `green-4.txt` (False greens above), the
  check this round had to rebuild; the conclusion it backs, K red under the scanner alone, stands.
- Impact: a reader taking the sentence at its word skips that inference, and a copy that differed from the committed
  test or gate would show nowhere in the file. The same words stand in the self-check of findings 1 and 2's fix for
  `naive-h.txt` and `pin-guard.txt` ("with the versions it ran on"), outside this range; neither file records a
  version either.
- Recommended: now, in this ticket: rewrite the sentence to what the file holds (the copy's change by `diff`, the test
  said unchanged, no version line; its versions fixed by its content and by `green-4.txt`, written in the same second
  by file time, as this record's False greens shows), and correct the earlier sentence for `naive-h.txt` and
  `pin-guard.txt` in the same edit to what those files hold. The raw files stay as they are. No rerun is needed for
  `scanner-k.txt`, whose versions this round fixed from its content; for the two earlier files only the sentence is in
  question here, and the first incremental check's use of them is carried over.

It belongs to this ticket's PR.

### Handling (main agent, 2026-10-26)

- Finding 5: handled as recommended. The task list's two self-check sentences now say what the files hold:
  `red-first-2.txt`, `green-2.txt` and `green-4.txt` record their versions; `naive-h.txt`, `pin-guard.txt` and
  `scanner-k.txt` record none, write their scratch paths as placeholders, and show what differs from the committed
  files, so their versions follow from their content and from the runs beside them. The evidence files are unchanged.
- The fix changes records only — no test's executable content and no data a test reads — so, by the step's rule, no
  further incremental check is due. Self-check, items 6 and 7: the corrected sentences match the files (read again);
  no other record repeats the overstated words (`grep -n "versions it ran on\|keep their commands," docs/.workings/prototype-baseline/*.md`
  after the edit lists only finding 5's own quotations of the old words and this line). No finding.
