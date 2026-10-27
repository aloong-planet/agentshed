# Ticket #296 — test review

Ticket: [#296](https://github.com/aloong-planet/agentshed/issues/296) (feature `prototype-baseline`; no spec, the
requirement source is the body's acceptance criteria 296::1–296::5). Test under review:
`scripts/check-lang.test.mjs`, which runs the language gate's CLI in temporary Git repositories.

## Design review

Date 2026-10-27; implementation base e4c9589 (origin/main when the work began, before any change); scope: the cases
planned for `scripts/check-lang.test.mjs`.

### Test design table

The seam for every row is the gate's CLI, run by the file's `check()` helper on the seeds plus the row's files, staged
in a fresh Git repository. "Copy header" below means a first comment carrying the marker
`copied from the prototype skill's template`.

| Row | Covers | Input that drives the target branch | Assertion and where its expected value comes from | Fixture shape from | Expensive resource |
|---|---|---|---|---|---|
| D1 (replaces the case for the listed `index.html`) | 296::1, an HTML copy | `docs/prototypes/index.html`: `<!doctype html>`, then the gallery shell's copy header as an HTML comment, then a Chinese comment on line 3; the doctype skip and the `<!--` comment branch | Exit 1, one problem, `docs/prototypes/index.html:3 ` and the prototype rule's reason in stderr; line 3 from the fixture's own lines, the reason the rule's text, typed in the test | The real `docs/prototypes/index.html`, its first two lines | None |
| D2 (replaces the cases for the three listed scripts) | 296::1, a JS copy | `docs/prototypes/demo-harness.js`: the real two-line `//` copy header, then a Chinese `//` line 3; the `//` branch, the marker on the first of two comment lines | Exit 1, one problem, `…demo-harness.js:3 ` and the reason; as D1 | The real `demo-harness.js` header | None |
| D3 (new) | 296::1, a CSS copy | `docs/prototypes/demo-dock.css`: a one-line `/* … */` copy header, then a Chinese `/* … */` line 2; the `/*` branch | Exit 1, one problem, `…demo-dock.css:2 `; as D1 | Designed from the skill's rule (no CSS copy exists in any project) | None |
| D4 (new, the ticket's case) | 296::1, a copy under a name no list held | `docs/prototypes/demo-notes.js`, marked as D2, Chinese on line 3 | Exit 1, one problem, `…demo-notes.js:3 `; red first on e4c9589's gate, which exempts the file by its type | The real `demo-harness.js` header under a new name | None |
| D5 (new) | 296::1, a JS copy behind a `#!` line | `docs/prototypes/demo-tool.js`: `#!/usr/bin/env node`, a `//` copy header, a Chinese `//` line 3; the `#!` skip | Exit 1, one problem, `…demo-tool.js:3 `; as D1 | The skill's `sync-mmd.mjs` header under a `.js` name | None |
| D6 (new) | 296::2, the boundary | `docs/prototypes/notes/prototype-notes.html`: doctype, a first comment without the marker, a second comment quoting it, a Chinese `<p>` on line 4; the first-comment read stopping at the first comment | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus the fixture's one Chinese line | Designed: a mockup page shaped like the real ones (doctype, header comment, content) | None |

Kept unchanged: "the seeds alone pass" (every rule alive), "sync-mmd.mjs is reported, since .mjs is not an exempt
type", and the four permitted cases (a mockup page, a logic page named `index.html`, `manifest.js`,
`dimensions.js`), whose files carry no marker and so stay on the mockup side; they back 296::2's other parts. The
header's gap line (#296) goes, since a new copy is covered by D4.

### Dimension 1: Coverage

The units this test backs, 296::1 and 296::2, map to rows: an HTML copy (D1), a JS copy (D2), a CSS copy (D3), a
copy whatever its name (D4), the `#!` skip the decision names (D5); the four permitted cases and the boundary page
(D6). Each row names the input that takes the gate into its branch. Not driven here: a marker split across two
lines, which the gate does not recognise. The skill's rule forbids it, and skillshed's
`check-prototype-copies.mjs` reports it, so a copy carrying it cannot come from the skill; 296::3 and 296::4 are
backed by evidence, not by this test. The gate reads files the skill writes, so two fixtures (D1, D2, and D4 and
D5 after them) take the real copies' header shapes; D3 and D6 are designed, there being no real sample.

Conclusion: complete for 296::1 and 296::2. Reopened on 2026-10-27 by the post-implementation check, findings 1 and
2: two details of the first-comment read are driven by no case.

### Dimension 2: Case design

Each case builds its own repository and runs the real CLI, so cases are isolated and the state is reachable: Git
reports the files exactly as a commit would. Each asserts the exit status and the reported file and line, not just
that the gate ran. No row reads the gate's internals.

Conclusion: no finding.

### Dimension 3: False greens (judged from the design)

- Always-true assertions: each row asserts a line number or a count that its fixture alone produces; D6's 9 needs
  the file read and its line permitted, so a skipped file (8) fails it.
- Tautologies: line numbers and counts come from the fixtures; the reason string is typed in the test and only
  names the rule that reported.
- Stale paths: the assertions read `mockupOnly`'s live result through the CLI.

Mutation testing: per the project's capability declaration, `mutation-testing` is not enabled; this item is
skipped. When each case goes red is answered at the post-implementation check.

Conclusion: no finding.

### Dimension 4: Resource reuse

Measured on e4c9589: each case takes about 230 ms (a temporary repository and one gate process; the current file's
ten cases ran in 2.3 s), below the one-second bar, so the rows use no expensive resource. The rows reuse the file's
`check()` helper, the only set-up of its kind in the repository's tests of this gate.

Conclusion: no finding.

### Findings

None.

## Post-implementation check

Date 2026-10-27; ticket [#296](https://github.com/aloong-planet/agentshed/issues/296) (feature `prototype-baseline`);
first round, an independent check under `/implement` step 6. Implementation 3757e36, range e4c9589..3757e36 on
`fix/check-lang-copy-marker`; the code is as at f4c20b8, since 3757e36 adds only the two gateway logs and the task list
(`git diff --stat f4c20b8..3757e36`). Requirement source: #296's body and its one comment, read with
`gh issue view 296 -R aloong-planet/agentshed` (and `--comments`) on 2026-10-27. Objects: the cases this change wrote or
changed in `scripts/check-lang.test.mjs` — D1–D5 (the copy loop, lines 65–95), D6 (lines 119–128) and the header
(lines 1–4) — and the helpers they use (`check()`, `SEEDS`, `JS_COPY_HEADER`, which is new). The six cases kept as
they were (the seeds, `sync-mmd.mjs`, the four permitted cases) come in through the same `check()` and seeds, both
unchanged. Run evidence: [pre-review-f4c20b8.txt](evidence/ticket-296/pre-review-f4c20b8.txt) only; this check made no
gateway or full run, and changed no file but this record.

**The gateway log**, against the full gateway's log requirements: it names the version (`git rev-parse HEAD` f4c20b8;
`git status --porcelain --untracked-files=all` empty, so no file needs a hash), each step of `pnpm verify` but e2e as
its own command with its full output and its own exit code, all 0, and `VERIFY_EXIT=0`. Lint ran (`pnpm lint`;
`capabilities.toml` declares `lint` enabled). `pnpm e2e` (declared enabled) did not run, as the run before the test
check runs only the e2e case files in the targeted list and that list has none (`targeted-search.txt`, taken on the
change before 446bad8; df9fdcf changed comments only and added no file, so the list stands); no object of this check
is an e2e case. The work directory is ignored (`.gitignore:4`), so the first run's log
(`pre-review-f4c20b8-no-electron.txt`), already on disk, is not in the status; no step reads it (`check:lang` and
`check:nul` list files with `--exclude-standard`, `check:ui`'s ticket walk skips hidden directories). The log's version
matches the handed-over range. The log meets every requirement; no finding.

### Dimension 1: Coverage

**The test design table against the test, row by row** (seam, input, assertion, the expected value's source, fixture,
resource). Every row runs through `check()` and the gate's CLI, as the table says.

| Row | Written as the table says | Notes |
|---|---|---|
| D1 | Yes: `docs/prototypes/index.html`, doctype, the shell's header comment, Chinese on line 3; asserts exit 1, `found 1 problem(s)`, `docs/prototypes/index.html:3 ` and `the tooling beside it gets no exemption` | The fixture's line 2 is the real line 2 with ` -->` added: the real comment runs on to line 7. The branch is the same — the marker is read on the comment's first line before the closing token is looked for (`check-lang.mjs:150–151`) — so the shape holds for what the case drives |
| D2 | Yes: `JS_COPY_HEADER` is byte-equal to the real `demo-harness.js` lines 1–2 (checked by string search of the test text), Chinese `//` line 3 | — |
| D3 | Yes: `demo-dock.css`, a one-line `/* … */` header, Chinese on line 2 | No CSS copy exists: the skill's files at skillshed 3db94ce (`git ls-tree`) hold no stylesheet |
| D4 | Yes: `demo-notes.js`, `JS_COPY_HEADER`, line 3 | Red first on e4c9589's gate (`red-first.txt`; `base-run.txt` with the final test file) |
| D5 | Yes: `demo-tool.js`, `#!` line, a `//` header, Chinese line 3 | The header is the real `sync-mmd.mjs` line 2 cut after `do not edit by hand`; the structure (a `#!` line, a `//` run with the marker on its first line, the run going on) is the real one |
| D6 | Yes: `docs/prototypes/notes/prototype-notes.html`, a first comment without the marker, a second quoting it, Chinese `<p>` on line 4; asserts exit 0 and `Working language: 9 line(s)` | — |
| Kept | The seeds, `sync-mmd.mjs` and the four permitted cases are unchanged (`git diff e4c9589..3757e36 -- scripts/check-lang.test.mjs`); the header's gap line is gone | — |

**The members the criteria and the owner's decisions name, against the cases whose input goes through them:**

| Criterion | Member | Driven by |
|---|---|---|
| 296::1 | an HTML, a JS, a CSS copy; a copy under a new name | D1; D2; D3; D4 |
| 296::1 (decision) | the first comment as `<!--`, `//` run, `/*` | D1; D2, D4, D5; D3 |
| 296::1 (decision) | skipping a leading `#!` line; a `<!doctype>` line | D5; D1 |
| 296::1 (decision) | the marker "on one line of its first comment": the first line; a later line | D1–D5; **none** (finding 1) |
| 296::2 | mockups, logic pages, `manifest.js`, `dimensions.js` | the four permitted cases |
| 296::2 | a page mentioning the marker below its first comment, the first comment a block (`<!--`) | D6 |
| 296::2 (decision) | the same boundary where the first comment is a `//` run or the file opens with code | **none** (finding 2) |
| 296::3, 296::4 | evidence, not this test | `no-list.txt`, `copy-check.txt` (False greens, below) |
| 296::5 | the gate on the repository | the log's `pnpm check:lang`, exit 0, 2270 permitted lines |

**Real samples.** The gate reads files the skill writes. The five real copies, at their first comments (read as
`isSkillCopy` reads them, its logic re-run in node over the files): `index.html` lines 2–7, `app-identity.js` 1–8,
`demo-dimensions.js` 1–33, `demo-harness.js` 1–45, `sync-mmd.mjs` 2–7; each carries the marker on its comment's first
line, and each is byte-equal to its template at 3db94ce (`git show 3db94ce:prototype/<file>` against the copy, `cmp`
exit 0 for all five; the skill's `prototype/` is clean in its clone). D1, D2, D4 and D5 take those shapes; D3 and D6
are designed, as the table says. Under `docs/prototypes/` the 56 `.html`, `.js`, `.css` and `.mmd` files open as
follows: 17 pages with a doctype and a `<!--` comment, 12 stylesheets with `/*`, 20 scripts with `//`, 2 with `/*`
(`_shared/session-hits.js`, `vendor/marked.umd.js`), 1 with code (`vendor/mermaid.min.js`) and 4 diagrams with `%%`.

**Gaps in the test's header.** None noted, and none owed today: findings 1 and 2 can each be driven by one more case
through `check()`.

Conclusion: incomplete — findings 1 and 2.

### Dimension 2: Case design

Each case builds its own repository in a fresh temporary directory, stages its files with Git as a commit would see
them, runs the real CLI once and removes the directory in `finally`; no case depends on another. Each asserts the exit
status and the reported file and line, or the permitted count, never the gate's internals. D3's CSS copy is a shape no
skill file has today, yet it is a file state a project can hold, and the `/*` branch it drives is the one the two
`/*`-headed scripts above go through.

Conclusion: no finding.

### Dimension 3: False greens

Per the project capability declaration, `mutation-testing` is not enabled; mutation testing is skipped. Each case's
"when does it go red" is answered against the gate at f4c20b8 (`scripts/check-lang.mjs`) and the expected value's
source. Every expected value is a literal: a line number the fixture alone fixes, a count of the seeds' 8 plus the
fixture's one line, and the prototype rule's reason typed in the test (`check-lang.mjs:267` holds it); nothing is
recomputed or imported from the gate.

| Case | Goes red when | Evidence |
|---|---|---|
| Seeds | a rule stops matching its seed (the dead-rule report) or a seed's line is reported; the count is not 8 | the log |
| D1 | the doctype line is not skipped (`:144`), a `<!--` comment is not read (`:147`), the closing token is looked for before the marker (`:150–151`), or the line or the reporting rule differ | reasoning on the code; on e4c9589's gate it passes by the listed name (`base-run.txt`) |
| D2 | a `//` run is not read as the first comment (`:147`, `:149`) | reasoning; passes by the listed name on e4c9589 |
| D3 | a `/*` comment is not read (`:147`) | red on e4c9589's gate (`base-run.txt`) |
| D4 | copies are recognised by name | red on e4c9589's gate (`red-first.txt`, `base-run.txt`) |
| D5 | the `#!` line is not skipped (`:143`): the first line is then not a comment and the file stays a mockup | reasoning; its red on e4c9589 comes from the unlisted name, not from the skip |
| `sync-mmd.mjs` | `.mjs` joins the exempt types, or a non-exempt file under `docs/prototypes/` is not checked | unchanged case, green in the log |
| The four permitted | the file's Chinese is reported (exit 1), or the file is not read (8 lines): a copy recognised by anything but the marker — a name such as `index.html` takes the logic page | reasoning |
| D6 | the read runs past the first block comment's closing token (`:151`): line 3's quote then makes the file a copy, line 4 is reported; or the file is not read (8) | reasoning |

Forms: no always-true assertion (each line number and count needs the fixture's own line); no tautology (above); no
stale path (`SKILL_TOOLING` is gone from the gate, `no-list.txt`, and the cases read the live CLI); no conditional skip
(no `return` or `skip` in any case); every assertion runs (synchronous; the copy loop's array is a literal of five, and
the log lists all twelve cases by name). What no case answers is in findings 1 and 2: two lines of `isSkillCopy` whose
removal or cut leaves every case green, judged by reading each case's fixture against the code (no copy of the gate
was changed).

The forms for gates and command-line checks (review-code's false-greens list), the change being a gate's rule with
command-line evidence for 296::3 and 296::4:

- Form four, a changed gate never seen red: the gate exits 1 on each copy case, and on the real copies with a Chinese
  line planted in `demo-harness.js` and `index.html`, reported at those lines and both files restored byte for byte
  (`plant-real.txt`, with byte counts and the planted line printed as independent proof the plant landed).
- Form seven, an exemption that blinds the gate: the exemption is a predicate (an exempt type and no marker in the
  first comment). Both directions are driven — violations red (D1–D5), legitimate content green (the permitted cases,
  D6) — except the two boundaries in findings 1 and 2.
- Form nine, a target outside the tool's reach: a file without Chinese never reaches the predicate
  (`check-lang.mjs:301`), so the repository run (296::5, `old-vs-new.txt`) shows only that no result on main changes,
  as those records say; whether the real copies are recognised rests on `plant-real.txt`. The cases' files are staged,
  so `git ls-files --cached --others --exclude-standard` lists them.
- Form six, a check whose own command fails: `no-list.txt` searches the gate by its path (no ignore rule applies), with
  a control on e4c9589's gate hitting seven lines, and reads `rg`'s exit 1 directly. `copy-check.txt` reads `cmp`'s exit
  directly; its line for the five copies is a summary, and the five comparisons above, against the committed templates
  at 3db94ce rather than the clone's working tree, give the same result.

Conclusion: no false green; the undriven lines are findings 1 and 2.

### Dimension 4: Resource reuse

The test design table names no expensive resource. The log confirms it: the twelve cases take 230.0–244.7 ms each
(`duration_ms 2894.0805`), each one temporary repository and one gate process built inside its own `check()` call, so
there is no resource above the one-second bar to count. Nothing is shared between cases, and no case clears or releases
anything another uses, so the order of the cases does not bear on any count. The cases reuse the file's `check()`,
the only set-up of its kind for this gate.

Conclusion: no finding.

### Document sync

Scope checked for what this check's conclusions change: the task inputs (#296's body and comment, this record, the
range e4c9589..3757e36, the gateway log); the work directory `docs/.workings/prototype-baseline/`, listed with hidden
entries (`ls -la`) and ignored files (`git status --porcelain --ignored`: the worktree's ignored entries are `.husky/_/`,
`node_modules/`, `out/`, `site/.astro/`, `site/node_modules/` and two `tsbuildinfo` files, none a document; every file
under `evidence/ticket-296/` is tracked) — `ticket-296-tasks.md`, `ticket-296-doc-sync.md`, `ticket-296-review-code.md`,
`checklist.md`'s sixth round (rows 296::1–296::5, Verified at 446bad8) and `final-regression.md` (no #296 section yet;
task 11); the test file's header; and every tracked file outside the work directory naming the gate's copies, its test
or the marker (`git grep -e SKILL_TOOLING -e 'check-lang\.test' -e check:lang -e "copied from the prototype skill"`:
14 lines, in `ci.yml`, `package.json`, the five copies, the gate and its test; and
`git grep -i -e mockupOnly -e 'tooling beside' -e 'prototype exemption' -e 'verbatim cop' -e "skill.s cop"`:
`docs/specs/i18n.md:554`, whose "mockup content but not the tooling beside it" stands, and the gate and its test).
None outside the work directory states what the test covers. `docs/features/` is out of scope: the change alters no
user-visible behaviour.

Owed by the findings:

- Findings 1 and 2, when their cases are added: the cases' rows in the test design table, reviewed as a design
  increment before they are written; the design review's coverage conclusion (marked above) brought to them;
  `checklist.md`'s current verification for 296::1 and 296::2 citing them. Any the owner declines instead: the gap and
  the condition for driving it go into the test file's header, and that unit's current verification names the gap
  rather than the whole criterion. Until then the coverage checklist row of `ticket-296-doc-sync.md` stays Pending (it
  is), and task 9 of `ticket-296-tasks.md` records this check's findings.

### Findings

1. **No case puts the marker below the first line of a copy's first comment** (Dimension 1; a regression that would go
   unseen; 296::1 and the owner's decision). The decision, the skill's rule and skillshed's
   `check-prototype-copies.mjs` (`leadingComment(text).some(…)`, line 61) all take the marker on any one line of the
   first comment, and `isSkillCopy` reads on through the comment for it (`check-lang.mjs:148–152`). Every copy fixture
   (D1–D5) carries it on the comment's first line, and D6's first comment holds none. Cut the read to the comment's
   first line and every case stays green, and so do the gate on the repository and `plant-real.txt` — the five real
   copies carry it on that line too. The headers are hand-wrapped prose with the marker mid-sentence
   (`app-identity.js`: columns 48–89 of a 105-character line), so a reworded title moves it to the next line; the
   skill's check still passes such a copy, while a gate reading the first line only would exempt it again in silence —
   #296's own failure. Recommended: now, in this PR — two rows in the copy loop, a `//` run and a block comment, each
   carrying the marker on its second line, the block one in the real gallery shell's shape (a `<!--` comment that runs
   on past its marker line), each asserting the Chinese line after the header is reported. Disposition: open.
2. **No case drives the end of a `//` first comment, or a file that opens with code** (Dimension 1; a regression that
   would go unseen; 296::2 and the owner's decision). `check-lang.mjs:149` ends the first comment at the first line
   that is not a `//` line, which also makes a file opening with code no copy. Every case reaching `isSkillCopy` gives
   the same verdict without it: D2, D4 and D5 meet the marker on their first `//` line, the permitted `.js` cases and
   the seed page hold no marker anywhere, and D6's first comment is a block. 296::2 states the boundary for a page,
   which D6 drives; for the 17 `//`-headed scripts under `docs/prototypes/` that are not copies (`manifest.js`,
   `dimensions.js`, eight `_shared/*.js`, three logic modules, three generated `model.mmd.js` and a fixture) and
   `vendor/mermaid.min.js`, nothing holds it. Without that line, a `manifest.js` that mentions the marker below its
   first comment — describing the gallery shell, say — would be checked as tooling and every Chinese name and question
   in it reported: a false red against 296::2, loud rather than silent, but a spec behaviour no case would catch going
   wrong. Recommended: now, in this PR — a permitted case,
   e.g. `docs/prototypes/manifest.js` with a `//` first comment holding a Chinese line, then code, then a `//` comment
   quoting the marker, asserting exit 0 and `Working language: 9 line(s)`. Disposition: open.
