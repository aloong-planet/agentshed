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

### Incremental review — the code review's finding 1 (2026-10-26; implementation at b23997e)

Recorded after the guard was written, not before (the order slip is noted in the code review); reviewed here as if
before. No case changes; the set-up gains one assertion.

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| Set-up (changed) | every plant and file change lands in the tree's copied part | all (the harness's safety) | each `PLANTS` and `FILES` path, resolved with `realpathSync` (the file, or its directory for a file to add) | the resolved path lies inside the temporary tree; otherwise the run stops with `<path>: not in the tree's copied part (docs/prototypes/, src/) — a change there would write the repository`. Expected: a path the tree links resolves into the repository | the test's own plants | as G0 |

Coverage: the guard has two outcomes. Inside the copy: every current plant (23 cases green, `green-2.txt`). Outside:
a probe entry under `docs/adr/`, in a scratch tree, stops the run at that path and writes nothing
(`harness-probe-after.txt`); without the guard the same entry lands through the link with every case green
(`harness-probe-before.txt`). The probe is not a permanent case: driving it in the test would need a tree whose linked
part is scratch, which the test's own tree is not.

False greens: the assertion runs before each write, so a plant cannot write first and fail after. Resource reuse:
unchanged. Findings: none.

### Incremental review — the post-implementation check's findings 1 to 3 (2026-10-26, before changing the test; implementation at 6664a7e)

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| M1 (changed) | a chart without its own declaration, written with a second class token | 314::1 (decision D8: the class is matched by its token) | as before, the planted element now `<div class="chart wide" id="ovchart2"></div>` | unchanged: `… prototype-detail.html: chart container #ovchart2 declares no shared block`. A rule comparing the whole class value, or searching for a literal `class="chart"`, would miss it; shown once on a copy of the gate whose match is the whole value. M2 and M3 keep the single token, so both forms are driven | a class list of several tokens, the pages' common form | as G0 |
| N2 (new) | an empty declaration | 314::2 ("any other value turns `pnpm check:ui` red") | in `project-list/prototype-list.html`, add ` data-shared-block=""` to the `<b>Agentshed</b>` in the top bar (not a chart) | `docs/prototypes/project-list/prototype-list.html: data-shared-block="" names no shared block`; red on a40c926, which judges no declaration; shown once on a copy whose declaration pattern requires a non-empty value | the page's markup | as G0 |
| T3 (new) | trend-chart's style invariant in the app's sheet | 314::4 (the app's half of the invariant) | in `src/renderer/src/theme.css`, the `.col` rule's `overflow: visible;`, anchored on the comment line before it (the bare declaration occurs twice in the sheet), becomes `overflow: hidden;` | `src/renderer/src/theme.css: .col violates an invariant (clipping the bar cuts off the tooltip pseudo-element positioned outside it)`. As T1: green on a40c926 by design, red on the copy with the block-specific table emptied | the app sheet's own rule | as G0 |

Coverage, corrected: 314::4 — D, T1 (the prototypes' sheet), T3 (the app's sheet), T2. 314::1 — M1 now also drives the
token match. 314::2 — N1 and N2 (an unknown id, an empty one). Case design: N2 is on the project list page beside N1 and
B, its line distinct; T3's file is planted only by it. Resource reuse: unchanged. Findings: none.

Self-check before handing the fix over (2026-10-26), items 2 to 5: the assertions written are N2's and T3's, one exact
line each; M1's assertion is unchanged. Each was seen red where it guards: N2 on a40c926's gate (`red-first-2.txt`,
ten red: the nine of the first red run and N2) and alone under a declaration pattern requiring a non-empty value
(`nonempty-declaration.txt`); M1 alone under a whole-value class comparison (`token-match.txt`); T3, with D, T1 and T2,
under the emptied table (`contracts-empty-2.txt`); T3 passes on a40c926 by design. No function changed; the plants use
the pages' and the app sheet's own forms; no shared helper changed. All 25 green (`green-3.txt`).

## Post-implementation check (2026-10-26, implementation 4f5607a, range a40c926..6664a7e; ticket #314)

Scope: the test this change writes, `scripts/check-shared-ui.test.mjs` at 4f5607a — 23 cases: the eleven new ones (M1–M3,
N1, P1–P4, T1, T2, L1), G0 and C changed, the ten others (A, B, D–K) re-keyed — with the harness's `src/` copy, its
root-keyed `PLANTS` and `FILES`, and the set-up guard, against the Test design table above and its increment. First
round; no fix range. 6664a7e adds only the gateway log and task 7's row in `ticket-314-tasks.md`; the gate, its test and
the pages are byte-equal at 4f5607a and 6664a7e (`git diff --name-status 4f5607a 6664a7e`). Evidence read: the handed
full gateway log `evidence/ticket-314/gateway-4f5607a.txt`, and beside it `red-first.txt`, `green.txt`, `green-2.txt`,
`contracts-empty.txt`, `contracts-stale-key.txt`, `harness-probe-before.txt`, `harness-probe-after.txt`, `targeted.txt`
and `targeted-2.txt`. No test was run by this check: every run result below comes from those logs; the rest comes from
the code, the pages and the searches named where they are used. `capabilities.toml` was read with a TOML parser
(`tomllib`) and checked against the repo-scaffold registry: all nine registered IDs present in their registered shapes,
none extra (`macos-distribution` applies, `client-framework` being `"electron"`, and carries both profiles). By the
project capability declaration, mutation-testing is not enabled, so mutation testing is skipped; each case's "when does
it go red" is answered below from the code and its expected value's source.

### Gateway log

| Requirement (full-verification-gate) | In the log |
|---|---|
| Version: `git rev-parse HEAD`, porcelain status, a hash per listed file | `4f5607a8a3a0…` (line 3); status empty (lines 4–5), so no file to hash |
| Every command, with its full output | the `pnpm verify` steps in `package.json`'s order, each on its own: typecheck, lint, test, test:scripts, test:site, check:ui, check:lang, check:i18n, check:nul, e2e, smoke. Lint and e2e run as the `lint` and `e2e-suite` declarations' `enforced-by` say |
| Exit codes taken without a pipe | every step 0, then `VERIFY_EXIT=0` (line 691). The log does not show how the codes were taken; each step's output agrees with its code (pass counts with no failure; typecheck and lint print nothing, their success form; smoke's `Killed: 9` is the script ending its own dev parent, followed by `SMOKE_OK`) |
| Version against the handed range | `git diff --name-status 4f5607a 6664a7e`: the log itself added (the run's own output) and task 7's row in `ticket-314-tasks.md` changed. Neither is read by the test (it copies `docs/prototypes/` and `src/`; the gate reads those, the ticket-number rule's four `docs/` directories and root files, never `docs/.workings/`), by ESLint (it ignores `docs/`) or by `check:i18n` (it walks `src/`). `check:lang` and `check:nul` list `git ls-files --cached --others --exclude-standard`, so they read both at 6664a7e; both files hold 0 CJK characters (control: 4799 in `prototype-agents.html`, same scan) and 0 NUL bytes, so their results stand there |

The log is usable evidence for 6664a7e.

### Written test against the Test design table

| # | Seam and driving input | Assertion and expected value's source | Fixture | Resource | Result |
|---|---|---|---|---|---|
| G0 | gate CLI on the planted tree | `status === 1`; `problems.length > 0`; each problem starts with a `PLANTS` or `FILES` path or `scripts/check-shared-ui.mjs:` (test lines 157–163) | copied repository files | `runGate()` once, at module load | Matches |
| C | both trend-chart declarations on the Agents page moved into comments (lines 67–70) | exact line, literal | the page's own markup | as G0 | Matches |
| M1 | `#ovchart2` added after `#ovchart` (lines 75–78, one swap with M2) | exact line, literal | the page's chart markup | as G0 | Matches |
| M2 | `<!-- data-shared-block="trend-chart" -->` then `#ovchart3`, same swap | exact line, literal | markup and comment forms | as G0 | Matches |
| M3 | a string holding `#ovchart4`'s markup after `const pl = …` (line 80), inside the page's inline script (`prototype-detail.html:460–937`, the line at 464) | exact line, literal | markup in a script string | as G0 | Matches |
| N1 | ` data-shared-block="pie-chart"` on the project list's top bar (line 34) | exact line, literal | the page's markup | as G0 | Matches |
| P1 | the detail page's `totals-card.css` link removed (line 82) | exact line, literal (`checkBlock`'s message) | the page's own link | as G0 | Matches |
| P2 | the skills preview's `md-preview.css` link removed (line 87); its declaration stays in the script template at `prototype-skills-preview.html:401`, inside the inline script at 224–783 | exact line, literal | the page's own link and declaration | as G0 | Matches |
| P3 | `FILES` adds `_shared/side-note.css` (line 97); the search page links it after the theme link (line 29) | exact line, literal | `_shared/*.css` form; the page's link form | as G0 | Matches |
| P4 | `FILES` adds `_shared/totals-card.js` (line 98) | the Agents page's line, literal | `_shared/*.js` form | as G0 | Matches |
| T1 | `.col`'s `overflow: visible;` becomes `hidden` in `_shared/trend-chart.css` (line 90; the string occurs once, in `.col` at `:40–48`) | exact line, literal (the invariant's message as the gate holds it) | the sheet's own rule | as G0 | Matches; finding 1 is what it leaves out |
| T2 | `archivedDays={snap.archivedDays}` removed from `DetailPane.tsx` (line 91) | exact line, literal | the app's own use site | as G0 | Matches |
| L1 | `FILES` removes `_shared/startup-skeleton.css` (line 100) | exact line, literal | the repository's own library | as G0 | Matches |
| Set-up (changed) | `assertInCopy` before each `PLANTS` and `FILES` write (lines 112–116, 130, 142) | the resolved path lies under the tree's real path, else the run stops with the designed message | the test's own paths | as G0 | Matches |

The ten other cases changed only in their plants' keys, as the design says (`git diff a40c926 6664a7e --
scripts/check-shared-ui.test.mjs`); their pages gained other cases' swaps (A's page P3's, B's N1's, D's M1–M3 and P1's,
F's P2's), whose lines name other subjects. Test file header (Dimension: Coverage): it states the approach, why
`docs/prototypes/` and `src/` are copied, and one gap — the block-specific table's stale-key check, run once on a copy of
the gate — which is 314::5's Evidence (`contracts-stale-key.txt`). It states no gap for the app's sheet (finding 1).

### Coverage

No spec; the units are `314::*` in [checklist.md](checklist.md), from #314's acceptance criteria.

| Unit | Driven by | Result |
|---|---|---|
| 314::1 | M1 (a chart without a declaration on a page declaring trend-chart on its own chart, among other blocks), M2 (a declaration only in a comment), M3 (a chart in a script template); each line absent on a40c926's gate (`red-first.txt`, lines 27–29) | Covered for charts whose class is `chart` alone; finding 2 |
| 314::2 | N1 (`pie-chart`), absent on a40c926's gate (`red-first.txt`, line 30) | Covered for a non-empty unknown id; finding 3 |
| 314::3 | P1 and P2 (the two blocks never listed; P2's declaration in a script template), P3 (a new block, reverse check), P4 (a block gaining a file); each absent on a40c926's gate (lines 31–34) | Covered |
| 314::4 | D (mount point `xaxis`), T1 (the invariant in the prototypes' sheet), T2 (`<TrendChart>`'s prop); D, T1 and T2 red, and only they, on a copy of the gate with an empty block-specific table (`contracts-empty.txt`) | The prototypes' half of the invariant only; finding 1 |
| 314::5 | L1, absent on a40c926's gate (line 37); the stale key by Evidence, as the criterion says: `contracts-stale-key.txt`, the gate alone on the worktree's files with the key renamed — exit 1, its one problem `BLOCK_CONTRACTS has an entry for trend-charts, which is no shared block`, while trend-chart, losing its contract, passes as an ordinary block | Covered |
| 314::6 | the two attributes (`git diff a40c926 6664a7e -- docs/prototypes`); the gate step of `check:ui` at 4f5607a: md-preview 5 usage sites, trend-chart 2, the chart rule passing, exit 0 (gateway lines 390–418) | Covered |

Boundary and empty inputs of the two new rules, each against a case:

| Rule and input | Driven | If the code changed |
|---|---|---|
| chart rule: `class="chart"` alone | M1–M3, C | — |
| chart rule: `chart` among other class tokens | no | whole-value or literal matching keeps every case green (finding 2) |
| chart rule: `chart` inside another token (`chart-note`) | no | a regression to `\bchart\b` reports a non-chart, on main as soon as such a class exists (loud); no page has one (`rg -uu -o 'class="[^"]*chart[^"]*"' docs/prototypes`: three matches, all `class="chart"`), so the design's reasoning holds |
| chart rule: a declaration naming an unknown block | N1's path | the declaration rule reports it |
| chart rule: `data-shared-block=""` on a chart | no | the declaration rule reports `""` as well (loud while the code finding 3 names holds) |
| declaration rule: an unknown non-empty id | N1 | — |
| declaration rule: an empty value | no | `[^"]*` changed to `[^"]+` keeps every case green (finding 3) |
| declaration rule: a common library's id | N1's path | `sharedBlocks` never yields a library, so it is unknown; a derivation that yielded libraries would report every page linking `theme.css` (loud) |

The mount points: `legend`, the second entry, is not planted; #314's test line for them is "the existing mount-point
case", so one entry is the owner's chosen coverage. `<TrendChart>`'s other use site (`AgentsPane.tsx:111`) is not
planted either; the criterion names the prop, not the sites.

Fixtures: every plant is a real page, sheet or source file, each in a form the repository already uses; the gate reads
the two added files for their names only (and P3's sheet for `prefers-color-scheme`, which it lacks). They are
independent of #314's text.

Conclusion (Coverage): three gaps, findings 1–3; otherwise each criterion's cases are written, and the cases for
missing behaviour were each seen red before the fix.

### Case design

- Public seam: the gate's command line; the cases read its output and exit code only. Every planted state is an edit a
  contributor can make to a page, a sheet, the app's source or `_shared/`; none is unreachable.
- Isolation: one temporary tree per file run, removed in `finally`; the cases share only the captured output, which
  none changes.
- Independence of the plants: the full planted output (`contracts-empty.txt`, lines 60–113: the same run but for D, T1
  and T2's lines) shows every problem on a planted path, and each asserted line's subject (a chart id, a block and its
  file, a path) produced by one plant only. P1 removes the detail page's `totals-card.css` link, which no other case
  uses; L1 removes a file no rule reads for existence.
- Set-up failure: a plant not found exactly once, a lost comment, or a path outside the copy throws at module load;
  `harness-probe-after.txt` shows such a throw failing the file, exit 1 (`pass 0`, `fail 1`).

Conclusion (Case design): no finding.

### False greens

| Form | Check |
|---|---|
| Constant truth | each case asserts one exact line (E: the absence of one prefix); G0 asserts exit 1 and a non-empty problem list before its loop |
| Tautology | the expected lines are literals, not computed by the gate's code |
| Stale path | the test copies the working tree's gate, the one `pnpm check:ui` runs (`package.json:24`) |
| Silent skip on a condition | none; a set-up failure fails the file (Case design) |
| Assertion that may not run | synchronous cases, no callbacks; G0's loop is guarded |
| Presence for effect (gate) | specific report lines and the exit code, not the presence of output |
| Synthetic path | the real CLI on real copies |
| Command that cannot tell | exit 1 alone cannot (about 30 problems in one run); every case asserts its own line |
| A new or changed gate never seen red | the test on a40c926's gate with the new pages: the nine cases for missing behaviour red, each at its own assertion, exit 1 (`red-first.txt`); T1, T2 and D red on the empty-table copy (`contracts-empty.txt`); the gate step alone red with a renamed key (`contracts-stale-key.txt`, exit 1), so each of `check:ui`'s two steps was seen red alone. Plants reached: after the fix every planted subject's line appears, and only its plant produces it |
| The check's own command wrong | the parse `/^ {4}\S/` matches the gate's `    ${p}` print for blocks and rules alike (seen in `contracts-empty.txt`) |
| Target outside the check's scope | `docs/prototypes/` and `src/` are real copies (`cpSync`), so the gate's `readdirSync` walks and the plants reach them; the guard keeps plants out of the linked rest |
| Exemption list (false-greens form 7) | `COMMON_LIBRARIES` names files exempt from being blocks. A declared block cannot be listed silently: its declarations would then name no block (the declaration rule); a stale entry is red (L1). Listing a never-declared shared file silences its reverse check — the owner's choice of a named list (D5, D7), not a behaviour #314 makes red; no finding |

When does each go red:

| # | Goes red when |
|---|---|
| G0 | the gate exits other than 1, reports nothing, or reports on a path nobody planted (a rule misfiring on an unplanted page, a library derived as a block, a crash's `    at …` lines) |
| A, B, G | the declaring page's asset search reads comments again (A's and B's comments pinned by `NAMED_IN_A_COMMENT`, G's planted) |
| H, I, J, K | the comment stripping cuts code after a `//` or `/*` in a string, a template line starting with `//`, or a `//` in a regular expression |
| C | the declaration search in `checkBlock` counts a commented declaration; the file fails at set-up if `#skChart` loses its declaration (its plant string would be gone) |
| D | the block-specific table stops reaching trend-chart's `containers` (`contracts-empty.txt`), or the mount-point search reads comments |
| E | the reverse check counts a comment naming an asset (C asserts the same message template in full, so a rewording turns C red first) |
| F | the tab identity rule reads `<head>` with comments |
| M1 | the chart rule judges a page rather than each chart (a40c926's count passes the page) |
| M2 | a declaration outside the chart's own tag is credited to it: a page-level count (a40c926's) or a search around the tag. Dropping `stripComments` from the chart rule alone would not turn it red: `<!--` is no opening tag, so the commented attribute never joins `#ovchart3`'s tag. In that rule `stripComments` keeps a commented-out chart from being judged, which no page has and no case drives; a regression there is a false red, loud |
| M3 | the chart rule reads markup only (a DOM parse misses the string) |
| N1 | a declaration of an unknown non-empty id stops being reported |
| P1, P2 | the contract stops coming from `_shared/` for the blocks never listed (P2 also: md-preview's script-template declaration stops counting, which turns its line into the reverse check's) |
| P3 | a new `_shared/*.css` is not a block |
| P4 | a block's added `.js` is not among its assets |
| T1 | the table stops reaching trend-chart's `cssInvariants`, or the prototypes' sheet leaves `files`, or the selector or pattern changes. Not when the app's sheet leaves `files` (finding 1) |
| T2 | the table stops reaching `appComponent`, or `DetailPane.tsx` stops being scanned, or the prop leaves `requiredProps` |
| L1 | `COMMON_LIBRARIES` stops being checked against `_shared/` |
| Set-up guard | a path resolves outside the copy: the run stops (`harness-probe-after.txt`); without the guard the same probe lands through the link with every case green (`harness-probe-before.txt`) |

Conclusion (False greens): no false green; where a case cannot go red for a behaviour #314 names, that is findings 1–3.

### Resource reuse

- The resource: the tree (copies of `docs/prototypes/`, 16 MB, and `src/`, 1.9 MB, by `du -sh`) and one gate run, built
  by `runGate()` once at module load; the cases read `run` and `problems`.
- Runtime count, from the gateway log: the file ran once in the whole run (`check:ui`, lines 357–389; `test:scripts`
  lists other files, line 138). The 23 cases took 0.031–0.588 ms each, the file 1834 ms: one build, outside the cases,
  as the table says.
- Cost: 1743–1998 ms per file run across the seven recorded runs (gateway, `red-first.txt`, `green.txt`, `green-2.txt`,
  `contracts-empty.txt`, `targeted.txt`, `targeted-2.txt`), of which the gate alone is 1.57–1.61 s (code review ②).
  Building once per file run stands.
- No case clears or releases the resource (the tree is removed before the cases run; `run` is never changed), so no
  ordering question arises. No seam is missing: the gate is a process, and the test builds its input once. No other
  test builds a tree of the prototypes or copies `src/`: `rg -n "mkdtempSync|spawnSync|cpSync" scripts --glob
  '*.test.mjs'` (the other files build git repositories or release directories per case), and `rg -uu -l -e
  check-shared-ui -e docs/prototypes` over every `*.test.*` and `*.spec.*` file outside dependencies and build output
  (this test, `check-lang.test.mjs`'s seeds, `artifacts.test.ts`'s own fixture names).

Conclusion (Resource reuse): no finding.

### Document sync

Facts this check establishes: the post-implementation check is done on 4f5607a (range a40c926..6664a7e) with findings
1–3; the gateway log is usable evidence for 6664a7e; the test's measured cost. Files checked: the task inputs (#314's
body by `gh issue view`, `checklist.md`, this record, the gateway log); this work directory's #314 files
(`ticket-314-tasks.md`, `ticket-314-doc-sync.md`, `ticket-314-review-code.md`, all ten files in `evidence/ticket-314/`);
and the repository through `rg -uu -l -e check-shared-ui -e check:ui`, hidden and ignored files included, excluding
`node_modules` at any depth, `out`, `site/dist` and `.git` (dependencies and build output): 145 files. Outside
`docs/.workings/` they are `ci.yml`, `CONTEXT.md`, `capabilities.toml`, `package.json`, the gate, its test,
`check-lang.mjs` and its test, `docs/specs/i18n.md`, ADR-0009, ADR-0018 and ADR-0033. Other tickets' records under
`docs/.workings/` are left out: each records its own round.

- No permanent document describes the gate's test, its cases, or how the gate knows a block (their lines name the
  `--cross` history, the single tier, the rail and README rules, CI's step, the capability declaration and the language
  gate's exemption for the gate's file), so this check changes none of them. How the gate knows a block is the document
  sync checklist's second item, Pending until step 8.
- `checklist.md`'s current-verification row for `314::*` still reads "Not run yet"; the checklist's first item
  (Pending) covers it, and that row must carry this check's outcome and the handling of findings 1–3. Findings 1–3 also
  change what the planned-verification cells of 314::4, 314::1 and 314::2 say, whichever way they are handled.
- The design review's Coverage paragraph ("314::4 — D, T1, T2") claims the criterion whole; finding 1's handling
  corrects it.
- Task 8 in `ticket-314-tasks.md` and #314's "Test review" acceptance item are the main agent's to update.
- The code review's statements about the test (23 cases; the guard; the probes; an empty declaration reported as an
  unknown block) agree with the code and the evidence; the last is the code finding 3 says no case drives.
- Handling findings 1–3 adds or changes rows of the Test design table (a new row beside T1, M1, a new row beside N1);
  those rows must be reviewed under the design review's increment rule before the test changes, and the test file
  header must state any gap left by choice. No new item for the document sync checklist: the rows these findings touch
  are its first item's and this record's.

### Findings

**1. The app's half of trend-chart's `.col` invariant is not driven.** Kind: a regression that would be missed; also an
inaccurate record (the design review's Coverage "314::4 — D, T1, T2"; the test file header states no such gap).
314::4 reads "its `.col` style invariant (in the prototypes' sheet and the app's)". The gate keeps both sheets in
`BLOCK_CONTRACTS['trend-chart'].cssInvariants[0].files` (`check-shared-ui.mjs:43`). T1 plants only
`docs/prototypes/_shared/trend-chart.css` and asserts that file's line; no case touches `.col` in
`src/renderer/src/theme.css` (`:1474–1482`). Deleting the app's entry from `files`, or a rewrite that reads only the
first file, keeps all 23 cases and the gate on main green. Impact: the check that guards the shipped app's tooltip can
leave `check:ui` with nothing red; the e2e tooltip cases (gateway lines 577–578) would catch a clipped tooltip in the
app, but not the gate losing its check, which is what 314::4 is about. Recommended: now, in this ticket's PR — a case
that plants `overflow: hidden` in the app's `.col` and asserts `src/renderer/src/theme.css: .col violates an invariant
(clipping the bar cuts off the tooltip pseudo-element positioned outside it)`. The bare `  overflow: visible;` occurs
twice in `theme.css` (`:1482`, `:2560`), so anchor the plant on the comment line before `:1482`; `src/` is a real copy
now, so the plant writes only the tree. As T1, it passes on a40c926 by design; its red can be shown on the empty-table
copy as T1's was. Add its row under the increment rule first, and correct the Coverage paragraph and 314::4's checklist
row. Home: this ticket's PR.

**2. The chart rule's class-token match is not driven: every planted chart is `class="chart"` alone.** Kind: a
regression that would be missed.
314::1 covers every chart container, which #314 defines as a container with the `chart` class; the rule matches the
class by its token (`cls[1].split(/\s+/).includes('chart')`, `check-shared-ui.mjs:524`, decision D8), as a40c926's
`\bchart\b` did inside a class list. M1–M3 and C plant only `class="chart"`, the form of all three charts on the pages,
while class lists of several tokens are the pages' common form (on 35 lines of the Agents page alone,
`rg -c 'class="[^" ]+ [^"]*"'`). A rewrite to whole-value comparison or to a literal `class="chart"` search keeps all
23 cases and the gate on main green; a later chart written with a second class (a skeleton variant, say) and no
declaration would then pass — the defect #314 is about. Recommended: now — give one planted chart a second token, such
as M1's `<div class="chart wide" id="ovchart2">`, its asserted line unchanged, so both forms are driven (M2 and M3 keep
the single token). Update M1's row under the increment rule first. Home: this ticket's PR.

**3. An empty declaration, `data-shared-block=""`, is not driven.** Kind: a regression that would be missed.
314::2: every `data-shared-block` value names a shared block, and "any other value turns `pnpm check:ui` red"; #314's
gap reads "A declaration that names no block at all is not reported either". The declaration rule matches
`data-shared-block="([^"]*)"` (`check-shared-ui.mjs:541`), so `""` is reported as naming no block (the code review notes
it); N1 plants only a non-empty id. The chart rule just above matches `[^"]+` (`:525`), so aligning the declaration rule
to it — a natural tidy-up — lets an empty declaration on any element but a chart pass, with all 23 cases and the gate on
main green (no page has one: `rg -uu 'data-shared-block=""' docs/prototypes`, no match). Recommended: now — plant an
empty declaration on an element that is not a chart (on the project list page beside N1, for example) and assert
`docs/prototypes/project-list/prototype-list.html: data-shared-block="" names no shared block`; it is red on a40c926,
which judges no declaration. Add its row under the increment rule first. Home: this ticket's PR.

### Handling (main agent, 2026-10-26)

- Finding 1: handled as recommended. Case T3 plants `overflow: hidden` in the app sheet's `.col` rule, anchored on the
  comment line before it, and asserts the app sheet's line. The design review's Coverage is corrected in the increment
  above; the checklist's 314::4 row names T3.
- Finding 2: handled as recommended. M1's planted chart is `class="chart wide"`; M2 and M3 keep the single token. A copy
  of the gate comparing the whole class value turns M1 alone red (`token-match.txt`). The checklist's 314::1 row says
  both forms are driven.
- Finding 3: handled as recommended. Case N2 plants `data-shared-block=""` on the project list page's `<b>Agentshed</b>`
  and asserts the empty id's line; red on a40c926 and under a non-empty declaration pattern. The checklist's 314::2
  row names it.
- The fixes change the test's executable content, so an incremental check follows.

## Post-implementation check, incremental (2026-10-26, implementation 78ff2f5, fix range 6664a7e..78ff2f5; whole change a40c926..78ff2f5; ticket #314)

Scope: the fix of findings 1 to 3, under the incremental clause. Evidence read: the handed targeted log
`evidence/ticket-314/targeted-3.txt`, and beside it the five runs the fix adds — `red-first-2.txt`, `token-match.txt`,
`nonempty-declaration.txt`, `contracts-empty-2.txt`, `green-3.txt` — each in full (the ten failure bodies of
`red-first-2.txt` are one run's output, identical but for the last one's closing `exit=1`, compared by script). The
handed gateway log `gateway-4f5607a.txt` is 4f5607a's, assessed in the first round, and is no evidence for the fix: the
test's executable content changed after it, so by the full-verification-gate rule a new full run is due before
delivery; this check rests on none of it. No test was run by this check: every run result below comes from those logs;
the rest comes from the code, the pages and the searches named where they are used. `capabilities.toml` is unchanged in
the whole change (`git log --oneline a40c926..78ff2f5 -- capabilities.toml`: empty); read again with `tomllib` and
checked against the repo-scaffold registry: the nine registered IDs present in their registered shapes, none extra,
`macos-distribution`'s precondition holding (`client-framework = "electron"`) and both its profiles present. By the
project capability declaration, mutation-testing is not enabled, so mutation testing is skipped; each case's "when does
it go red" is answered below from the code, the evidence and the expected values' sources. The cases assert a gate's
output, so the review-code false-greens list is applied with the unit-test forms.

### Objects under review

The fix range changes one file outside the records, the test (`git diff --name-status 6664a7e 78ff2f5`: the test;
`checklist.md`, `ticket-314-review-code.md`, `ticket-314-tasks.md`, this record, and six files under
`evidence/ticket-314/`). The gate, the pages and the app's source are unchanged
(`git diff --quiet 6664a7e 78ff2f5 -- scripts/check-shared-ui.mjs docs/prototypes src`: exit 0). The test's hunks
(`git diff 6664a7e 78ff2f5 -- scripts/check-shared-ui.test.mjs`): three `PLANTS` entries (N2's on the project list
page, M1's second class token on the detail page, T3's on `src/renderer/src/theme.css`) and two new cases (N2, T3); the
header and the harness functions are untouched. Tests depending on what the range changed, searched over every test file
in the repository, ignored and hidden files included (103 files match the globs):

```
$ rg -uu -n --glob '!**/node_modules/**' --glob '!.git/**' --glob '!out/**' --glob '!site/dist/**' \
    --glob '*.{test,spec}.{mjs,cjs,js,ts,tsx,mts,cts,jsx}' -e 'check-shared-ui' -e 'PLANTS' -e 'runGate' \
    -e 'assertInCopy' -e 'NAMED_IN_A_COMMENT' .
./scripts/check-shared-ui.test.mjs:24:const PLANTS = {
./scripts/check-shared-ui.test.mjs:113:const NAMED_IN_A_COMMENT = {
./scripts/check-shared-ui.test.mjs:120:function assertInCopy(root, path) {
./scripts/check-shared-ui.test.mjs:127:function runGate() {
./scripts/check-shared-ui.test.mjs:136:    cpSync(join(repo, 'scripts/check-shared-ui.mjs'), join(root, 'scripts/check-shared-ui.mjs'))
./scripts/check-shared-ui.test.mjs:137:    for (const [path, swaps] of Object.entries(PLANTS)) {
./scripts/check-shared-ui.test.mjs:138:      assertInCopy(root, path)
./scripts/check-shared-ui.test.mjs:145:      const asset = NAMED_IN_A_COMMENT[path]
./scripts/check-shared-ui.test.mjs:150:      assertInCopy(root, path)
./scripts/check-shared-ui.test.mjs:154:    const r = spawnSync(process.execPath, [join(root, 'scripts/check-shared-ui.mjs')], { encoding: 'utf8' })
./scripts/check-shared-ui.test.mjs:161:const run = runGate()
./scripts/check-shared-ui.test.mjs:169:  const planted = [...Object.keys(PLANTS), ...Object.keys(FILES), 'scripts/check-shared-ui.mjs']
./scripts/check-shared-ui.test.mjs:269:  assert.ok(reported('scripts/check-shared-ui.mjs: COMMON_LIBRARIES lists startup-skeleton, but _shared has no startup-skeleton.css or startup-skeleton.js'), run.out)
./scripts/check-lang.test.mjs:25:  'scripts/check-shared-ui.mjs': `const side = /${CN}/\n`,
```

The test file has no `export` statement and no `module.exports` (`rg -n -e '^export' -e 'module\.exports'` on it: no
match) and imports only Node's built-in modules (lines 13–19), so no other file can share its set-up;
`check-lang.test.mjs` names the gate's path only as a seed it writes into a fresh repository, as in the earlier rounds.
Outside `docs/.workings/`, only `package.json:24` names the test (`rg -uu -n -e 'check-shared-ui\.test'` with the same
exclusions and `docs/.workings/`). Inside the file, every case reads the one run (`run`, `problems`, `reported`) that
`runGate()` builds from `PLANTS`, which the range changed. So the objects are:
- all 25 cases of `scripts/check-shared-ui.test.mjs`: M1's plant changed, N2 and T3 are new, and the other 22 read a run
  whose set-up gained N2's and T3's plants and M1's token;
- the Test design table rows changed in the range: the increment "the post-implementation check's findings 1 to 3" —
  M1 (changed), N2 (new), T3 (new) — with its corrected Coverage and Case design sentences and the self-check under it.
  The record's earlier sections are unchanged in the range (`git diff -U0 6664a7e 78ff2f5 -- <this record>`: one hunk,
  lines added after line 108).

Carried over from the first round (4f5607a, range a40c926..6664a7e): the gateway log's assessment; the harness facts
(the copies and links, the guard, clean-up, a set-up failure failing the file); the rows, fixture shapes, red-first
evidence and "when does it go red" of G0, A–K, M2, M3, N1, P1–P4, T1, T2, L1 and the set-up guard; the stale-key
Evidence for 314::5; the boundary rows not named below; the resource's size and its clearing and ordering conclusion.

### Targeted log

| Requirement (full-verification-gate) | In the log |
|---|---|
| Version | `HEAD: 6664a7ec…` and the porcelain status (`git status --porcelain --untracked-files=all`, named in the header, no pathspec) with a `git hash-object` per listed file: `checklist.md` `a4c118c5…`, `ticket-314-review-code.md` `73651d5d…`, this record `0eb37644…`, `ticket-314-tasks.md` `bec64579…`, the test `86dcae1c…` |
| Every command, with its full output | the searches for tests reading what changed (over `scripts build src e2e site/test`), `pnpm typecheck`, `pnpm check:ui`, `pnpm lint`, `pnpm check:lang`, `pnpm check:nul` |
| Exit codes taken without a pipe | `exit=0` after each, then `TARGETED_EXIT=0` (line 189) |
| Version against the handed range | each listed blob equals the file at 78ff2f5 (`git rev-parse 78ff2f5:<path>`, all five equal). `git diff --name-status 6664a7e 78ff2f5` lists those five plus six evidence files: `targeted-3.txt`, the run's own output, and the five runs above. Those five are absent from the listing because `docs/.workings/` is ignored (`.gitignore:4`, by `git check-ignore --no-index -v`) and `git status` lists no ignored file; no command of the run reads them (the test copies `docs/prototypes/` and `src/`; the gate reads those, four other `docs/` directories and root files; `check:lang` and `check:nul` list files with `--exclude-standard`; ESLint ignores `docs/`). No ignored file lies where the test or the gate reads (`git status --porcelain --ignored --untracked-files=all -- docs/specs docs/adr docs/features docs/postmortems docs/prototypes src scripts CONTEXT.md README.md README.en.md package.json`: empty; control, the same without paths: 34666 ignored entries). At 78ff2f5 the six files are tracked, so `check:lang` and `check:nul` read them there: 0 CJK characters and 0 NUL bytes in each (scanned; control: 4986 in `prototype-agents.html`, same scan), so the log's results stand for them |

The log's form is the one #270's last incremental check settled (`ticket-270-review-tests.md`, its "Targeted log"): the
`HEAD:` value printed without its command and the exit codes' capture not shown are not missing items, since each
`exit=` follows a command printed without a pipe whose own output shows the same result (25 passes with no failure and
the gate's "passed" line for `check:ui`; the empty success form for typecheck and lint). The log is usable evidence for
78ff2f5 for the objects under review.

The five runs beside it name the test as `test dc82349342ef` and the gate as `gate d23a16115def`. Those are the files'
plain SHA-1 (`shasum -a 1`), not their git blob ids, and they equal the committed test's and gate's (`shasum -a 1` at
78ff2f5: `dc82349342ef…`, `d23a16115def…`), so each run is of the committed test. `red-first-2.txt`'s gate copy is
a40c926's exactly: its recorded `diff`, applied with `patch` to the gate at 78ff2f5, gives a file byte-equal to
`git show a40c926:scripts/check-shared-ui.mjs`. Noted for the next reader, who will not find `dc82349342ef` among git's
objects; no conclusion depends on the scheme.

### Written test against the Test design table

| # | Seam and driving input | Assertion and expected value's source | Fixture | Resource | Result |
|---|---|---|---|---|---|
| M1 | `#ovchart2` added after `#ovchart` as `<div class="chart wide" id="ovchart2"></div>` (line 79, the swap it shares with M2) | unchanged: exact line, literal (lines 217–219) | a class list of two tokens; the pages' three charts are `class="chart"` alone (`grep -rn -E 'class="[^"]*\bchart\b[^"]*"' docs/prototypes --include='*.html'`), class lists of several tokens their common form (first round) | as G0 | Matches |
| N2 | ` data-shared-block=""` added to `<b>Agentshed</b>` (line 35), in the project list page's top bar (`prototype-list.html:73`, markup; the line N1's plant also changes, applied before it; each string occurs once) | exact line, literal: the declaration rule's message with the empty id (lines 233–235) | the page's own element; no page has an empty declaration (`grep -rnF 'data-shared-block=""' docs/prototypes`: exit 1), so the value is a planted boundary | as G0 | Matches |
| T3 | in `src/renderer/src/theme.css`, the comment line `     the rounded corner is carried by the topmost segment instead */` and the `  overflow: visible;` after it become the same with `overflow: hidden;` (lines 93–98). The anchor is the sheet's line 1481, inside `.col { … }` (1474–1484), the sheet's only `.col {` rule; the bare declaration occurs at 1482 and 2560 | exact line, literal: the invariant's message as the gate holds it, with the app sheet's path (lines 260–262) | the app sheet's own rule | as G0 | Matches |
| G0 | the planted paths now include `src/renderer/src/theme.css`; T3's line starts with it, N2's with the project list page's | as before | — | `runGate()` once, at module load | Matches |
| the other 21 | plants and assertions unchanged | as before | as before | as G0 | Matches |

The increment's claims against the evidence. M1 "shown once on a copy of the gate whose match is the whole value":
`token-match.txt` changes line 524 to `cls[1] !== 'chart'`; M1 alone is red (24 pass, 1 fail, at its assertion, test
line 218), and its output lacks `#ovchart2` while `#chart`, `#skChart`, `#ovchart3` and `#ovchart4` stay. N2 "red on
a40c926", "shown once on a copy whose declaration pattern requires a non-empty value": `red-first-2.txt` (N2 among the
ten red) and `nonempty-declaration.txt` (line 541 to `[^"]+`; N2 alone red, at test line 234; the `""` line gone,
`pie-chart`'s kept). T3 "green on a40c926 by design, red on the copy with the block-specific table emptied":
`red-first-2.txt` line 183, its line present in that run's output; `contracts-empty-2.txt`, D, T1, T3 and T2 red and
only they (21 pass). The self-check's "ten red: the nine of the first red run and N2": M1–M3, N1, N2, P1–P4 and L1
(`red-first-2.txt`, lines 173–185). The corrected Coverage and Case design sentences agree with the test.

Test file header (Dimension: Coverage): unchanged in the range (lines 1–12; the first hunk starts at line 30). It states
one gap, the block-specific table's stale key, still 314::5's Evidence; the fix leaves no gap by choice, each of
findings 1–3 being driven by a case.

### Coverage

No spec; the units are `314::*` in [checklist.md](checklist.md), from #314's acceptance criteria.

| Unit | Driven by | Result |
|---|---|---|
| 314::1 | M1 (now a two-token class), M2, M3; each absent on a40c926's gate (`red-first-2.txt`) | Covered; the token match is driven (finding 2 closed) |
| 314::2 | N1 (an unknown non-empty id) and N2 (an empty id), each absent on a40c926's gate | Covered; both kinds of value that name no block are driven (finding 3 closed) |
| 314::3 | P1–P4 as in the first round; red again on a40c926's gate in `red-first-2.txt` | Covered |
| 314::4 | D, T1 (the prototypes' sheet), T3 (the app's sheet), T2; the four red, and only they, under the emptied table (`contracts-empty-2.txt`) | Covered: both sheets of the invariant (finding 1 closed) |
| 314::5 | L1, red again on a40c926's gate, and the stale-key Evidence as before | Covered |
| 314::6 | the gate step of `pnpm check:ui` at the fix: md-preview 5 usage sites, trend-chart 2, the chart and declaration rules passing, exit 0 (`targeted-3.txt`, lines 94–122); the gate and the pages are unchanged in the range | Covered |

The boundary rows the first round left undriven, now:

| Rule and input | Driven | If the code changed |
|---|---|---|
| chart rule: `chart` among other class tokens | M1 | a whole-value comparison turns M1 alone red (`token-match.txt`); a literal `class="chart"` search misses `class="chart wide"` the same way |
| declaration rule: an empty value | N2 | `[^"]+` turns N2 alone red (`nonempty-declaration.txt`) |
| the invariant in the app's sheet | T3 | dropping the app sheet from `files`, or reading only the first file, removes T3's line, whose only producer is `check-shared-ui.mjs:863` |
| chart rule: `data-shared-block=""` on a chart | no | the chart rule (`[^"]+`, line 525) reports the chart, and the declaration rule reports `""`, which N2 now pins: loud either way |

Fixtures: M1's token list and T3's rule are the repository's own forms; N2's empty value is a planted boundary on the
page's own element. They are independent of #314's text.

Conclusion (Coverage): findings 1–3 are closed by T3, M1's token and N2; no new gap.

### Case design

- Public seam and reachable plants: a second class token, an empty attribute and a `.col` declaration in the app's
  sheet are edits a contributor can make, read through the gate's output and exit code.
- Independence: each new asserted line has a subject only its plant produces — `#ovchart2` (M1); the empty id on the
  project list page (N2; no page has one, and the declaration rule passes on the unplanted pages, `targeted-3.txt`
  line 113); the app sheet's `.col` (T3; the gate reports none on the unplanted sheet, line 103). Each of the three
  messages has one producer in the gate (`grep -n` over its 918 lines: lines 527, 542, 863). N2's element is no chart,
  so only the declaration rule can report it. T3's file is planted by T3 alone, and the swatch rule, which also reads
  `theme.css`, passes in the planted runs (`token-match.txt`, line 52). N1 and N2 change the same line of the page;
  each plant string still occurs once (the set-up asserts it, and the run is green).
- The full planted output at the fix: `token-match.txt` and `nonempty-declaration.txt` each list 31 problems, each
  lacking only its mutated line, so the unmutated run reports 32, every one on a planted path (G0 green,
  `targeted-3.txt`).
- Isolation, clean-up and a set-up failure failing the file: carried over.

Conclusion (Case design): no finding.

### False greens

| Form | Check |
|---|---|
| Constant truth | M1, N2 and T3 each assert one exact line |
| Tautology | the expected lines are literals, not computed by the gate's code |
| Stale path | the test copies the working tree's gate, the one `pnpm check:ui` runs |
| Silent skip on a condition | none; T3's plant, like every plant, fails the file at load unless its anchor occurs exactly once |
| Assertion that may not run | synchronous cases, no callbacks |
| Presence for effect; command that cannot tell | each case asserts its own report line, not the exit code or the presence of output |
| A new case never seen red (false-greens form four) | M1 red alone under the whole-value class match (`token-match.txt`); N2 red on a40c926's gate (`red-first-2.txt`) and alone under `[^"]+` (`nonempty-declaration.txt`); T3 red under the emptied table with D, T1 and T2 (`contracts-empty-2.txt`), green on a40c926's gate by design. Each failure lies at its own assertion (test lines 218, 234, 261), and the run's output in the failure message shows the reach apart from the assertion: the mutated line gone, its neighbours kept. Each mutated copy differs from the gate by the one `diff` it records; the copies ran in a scratch directory, and the worktree is clean |
| The check's own command wrong | the problem parse `/^ {4}\S/` unchanged |
| Target outside the check's scope | `src/` is a real copy, so T3's plant reaches the copied sheet; the guard let it through (the run is green, no set-up throw) |

When does each go red:

| # | Goes red when |
|---|---|
| M1 | the chart rule judges a page rather than each chart (a40c926's count), or matches the class by its whole value or by a literal `class="chart"` |
| N2 | an empty declaration stops being reported: the declaration pattern requires a non-empty value, or the rule skips an empty id; and on a40c926's gate, which has no declaration rule |
| T3 | the table stops reaching trend-chart's `cssInvariants` (`contracts-empty-2.txt`), the app sheet leaves `files`, the loop reads only the first file, or the selector or pattern changes; the file fails at load if the anchor changes |
| T1 | as in the first round, without its exception there: the app sheet leaving `files` is now T3's |
| G0 | as in the first round; the planted paths gained the app sheet |
| the others | as in the first round |

Conclusion (False greens): no false green.

### Resource reuse

- Unchanged: one tree (copies of `docs/prototypes/` and `src/`) and one gate run per file run, built by `runGate()` at
  module load; the fix adds plants, not a resource, and leaves the tree's size as it was (T3 edits a copied file).
- Runtime count, from the targeted log: the file ran once (in `pnpm check:ui`, lines 56–93); the 25 cases took
  0.0237–0.593 ms each and the file 1636 ms: one build, outside the cases. This agrees with the table.
- Cost: 1631–1753 ms per file run across the fix's six runs (`targeted-3.txt`, `green-3.txt`, `token-match.txt`,
  `nonempty-declaration.txt`, `contracts-empty-2.txt`, and `red-first-2.txt` on a40c926's gate). Building once per file
  run stands.
- No case clears or releases the resource, so no ordering question arises.

Conclusion (Resource reuse): no finding.

### Document sync

Facts this check establishes: the incremental check is done on 78ff2f5 (range 6664a7e..78ff2f5) with no finding;
findings 1–3 are closed by T3, M1's token and N2, as the handling says; the targeted log is usable evidence for 78ff2f5
for the test. Files checked: the task inputs (#314's body by `gh issue view`, `checklist.md`, this record,
`targeted-3.txt`, `gateway-4f5607a.txt`); this work directory's #314 files (`ticket-314-tasks.md`,
`ticket-314-doc-sync.md`, `ticket-314-review-code.md`, and `evidence/ticket-314/`: 16 files, the six this range adds
read as above, the other ten unchanged in the range); `final-regression.md`, read by its path: no #314 section yet (the
document sync checklist's fourth item, Pending); and the repository through `rg -uu -l -e check-shared-ui -e check:ui`,
hidden and ignored files included, excluding `node_modules` at any depth, `out`, `site/dist` and `.git` (dependencies
and build output): 151 files, the first round's 145 and the six evidence files, outside `docs/.workings/` the same
twelve. Other tickets' records under `docs/.workings/` are left out: each records its own round.

- No permanent document describes the gate's test or its cases (first round), and the range changes none of them; the
  new plants make none of them untrue.
- `checklist.md`: the planned verification of 314::1 (a two-token class), 314::2 (an empty declaration) and 314::4 (the
  plant in both sheets, green on the unfixed gate) matches the test and the runs. The current-verification row for
  `314::*` still reads "Not run yet"; the document sync checklist's first item (Pending) covers it, and that row must
  carry both rounds' outcomes.
- `ticket-314-tasks.md`: task 8's state matches the first round and its handling, and must carry this round's outcome
  when step 6 closes. Task 7's row is 4f5607a's gateway, true as dated; the next full run, due because the test's
  executable content changed after it, must replace it. The self-check of the fixes (each run keeps its commands, the
  copy's change by `diff`, the test's hash and HEAD, and its whole output; `green-3.txt` its versions) matches the files:
  the commands write the scratch paths as placeholders, the real paths showing in the failure output, and the hash is
  the content's SHA-1 (Targeted log above).
- `ticket-314-review-code.md`: the new self-check ("no product code changed; the gate is unchanged") is accurate (the
  `git diff --quiet` above). Its earlier "23 cases" statements are dated to b23997e and 4f5607a and stay true there.
- This record: the increment's rows and sentences and the handling are accurate as checked above. The design review's
  Coverage paragraph ("314::4 — D, T1, T2") stays as written: it is that review's original report, corrected by the
  increment rather than rewritten, as the document-sync rule on original evidence asks.
- `ticket-314-doc-sync.md`: no new item; its five items stay Pending.
- #314's body: its Test lines name the least each criterion needs (cases for 314::1, a declaration of a block with no
  file for 314::2, a plant on `.col` for 314::4); the added cases make none of them untrue.

### Findings

None.
