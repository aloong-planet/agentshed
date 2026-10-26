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
at set-up, and so does a page of A, B or G whose comment no longer names its asset (added after the post-implementation
check's finding 1), so a page edited later cannot turn a case into a no-op.

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
| G (new) | a page without its asset's script, a `//` comment after code naming the asset | 270::1 (finding 2; decision D3) | in `shell/prototype-app-shell.html`, remove `  <script src="../_shared/app-rail.js"></script>` and append ` // the rail is drawn by ../_shared/app-rail.js` to the line `  let lang='zh';` in its inline script; the set-up asserts the page still names the asset | the line `docs/prototypes/shell/prototype-app-shell.html: declares app-rail but does not reference _shared/app-rail.js`; red on the gate at d9b0208, which keeps a trailing `//` comment | the page's own inline script, a comment in the form 37 of the pages' lines use | as G0 |
| H (new) | a `//` inside a string does not end the line | 270::R1 (decision D3: what the stripping must keep) | in `session-view/prototype-session.html`, after the line that defines `esc` in its first inline script, add `  const docsUrl = 'https://example.test/'; const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')` — the page follows the mode | the line `docs/prototypes/session-view/prototype-session.html: follows the mode but still styles by prefers-color-scheme`. A stripping that took the string's `//` for a comment would remove the rest of the line, and the line would not appear | as G | as G0 |

G0 now also holds G's and H's pages among the planted ones (the shell page already was, for E).

Coverage: G drives the fourth comment form (a `//` after code); with A–F the forms the pages use are each driven. H is
the boundary of that form: a `//` that is not a comment — in a string, as in a URL — stays, and so does the code after
it. It cannot be red on the gate at d9b0208 (which removes only whole-line `//` comments, so it keeps the line); it is
red under a stripping that ends a line at any `//`, which the slice shows once on a scratch copy.

False greens: G is red first on the current gate. H's absence of red there is by design, stated above; its red is
shown under the naive stripping it guards against. The set-up assertion of A, B and G makes a page edit that drops
the comment fail the file at once instead of leaving a case that plants nothing.

Resource reuse: unchanged, one tree and one gate run per file run.

Findings: none.

Self-check before handing the fix over (2026-10-26), items 2 to 5:
- Assertions written or changed: G and H each assert one exact line; the set-up assertion of A, B and G (the page still
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
