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
| D7 (added after the post-implementation check, finding 1) | 296::1, the marker on a later line of a `//` first comment | `docs/prototypes/demo-strip.js`: a `//` run whose first line is a reworded title and whose second line carries the marker, then a Chinese `//` line 3; the read going on past the run's first line | Exit 1, one problem, `…demo-strip.js:3 ` and the reason; line 3 from the fixture | The real copies' hand-wrapped headers (`app-identity.js` wraps mid-sentence), the title reworded so the marker falls on line 2 | None |
| D8 (same, finding 1) | 296::1, the marker on a later line of a block first comment that runs on past it | `docs/prototypes/index.html`: doctype, a `<!--` comment whose title line holds no marker, the marker on its next line, a further line ending in `-->`; a Chinese comment on line 5; the read going on past the opening line and stopping only at the closing token | Exit 1, one problem, `docs/prototypes/index.html:5 ` and the reason; line 5 from the fixture | The real gallery shell's header (a `<!--` comment running on for several lines), its title moved onto a line of its own | None |
| D9 (same, finding 2; file and source corrected for finding 4) | 296::2, a `//` first comment ends at a line of code | `docs/prototypes/dimensions.js`: a `//` run holding a Chinese line, a line of code, then a `//` comment quoting the marker; the run ending at the code | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus the Chinese line | The real `dimensions.js` (a `//` header meeting `window.DEMO_DIMENSIONS = …` on line 11), with a later comment that mentions the shell's marker | None |
| D10 (same, finding 2) | 296::2, a file that opens with code is no copy | `docs/prototypes/_shared/notes.js`: line 1 code holding a Chinese string, line 2 a `//` comment quoting the marker; the first line not being a comment | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus the line-1 Chinese | Designed: the shape of `vendor/mermaid.min.js`, the one file under `docs/prototypes/` that opens with code | None |
| D11 (added by the self-check after findings 1 and 2) | 296::2, a first comment that runs to the end of the file without the marker is no copy | `docs/prototypes/_shared/placeholder.js`: two `//` lines, the second Chinese, and no newline at the end; the read reaching the end of the file | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus the Chinese line | Designed: a file of comments only, as a placeholder script would be | None |
| D12 (added for the incremental check's finding 3) | 296::1, the marker on a later line of a `/*` first comment that closes on a later line still | `docs/prototypes/demo-panel.css`: a `/*` comment whose title line holds no marker, the marker on line 2, a third line ending in `*/`; a Chinese comment on line 4; the read going on past the opening line to `*/` | Exit 1, one problem, `…demo-panel.css:4 ` and the reason; line 4 from the fixture | The real stylesheets' first comments (`_shared/theme.css`: a `/*` comment over nine lines), its title reworded so the marker falls on line 2 | None |
| D13 (same, finding 3) | 296::2, a `/*` first comment ends at `*/` | `docs/prototypes/_shared/panel.css`: a two-line `/*` comment without the marker, then a comment quoting it, then a rule whose `content` is Chinese on line 4; the read stopping at `*/` | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus line 4 | The real stylesheets' multi-line first comments | None |
| D14 (same, finding 4) | 296::2, a blank line ends a `//` first comment | `docs/prototypes/manifest.js`: a `//` header holding a Chinese line, a blank line, a `//` comment quoting the marker, then code; the run ending at the blank line | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus the Chinese line | The real `manifest.js` (a `//` header over lines 1–8, a blank line, a second `//` comment before any code) | None |
| D15 (added by the self-check after findings 3 and 4) | 296::1, a block header recognised whatever the doctype's case and the comment's indent | `docs/prototypes/shell.html`: `<!DOCTYPE html>` in upper case, then an indented `<!--` header carrying the marker, then a Chinese comment on line 3; the case-blind doctype skip and the trimmed first line | Exit 1, one problem, `…shell.html:3 ` and the reason | Designed: HTML allows either case and any indent (no copy has either today) | None |
| D16 (same) | 296::1, an indented `//` run read on past its first line | `docs/prototypes/demo-indented.js`: two indented `//` lines, the marker on the second, then an indented Chinese `//` line 3; the trimmed test for a `//` line | Exit 1, one problem, `…demo-indented.js:3 ` and the reason | Designed: a header indented inside its file (no copy has one today) | None |
| D17 (added for the second incremental check's finding 5) | 296::2, the line that ends a `//` run is not part of the first comment, so a marker on it does not count | `docs/prototypes/dimensions.js`: a `//` header holding a Chinese line, then a line of code with a trailing comment quoting the marker; the run-end test made before the marker test | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus the Chinese line | The real `dimensions.js` (a `//` header meeting `window.DEMO_DIMENSIONS = {` on line 11), its code line given a trailing comment | None |
| D18 (same) | 296::2, a first line of code is no comment, so a marker on it does not count | `docs/prototypes/_shared/notes.js`: line 1 code holding a Chinese string and a trailing comment quoting the marker; the same test on the first line | Exit 0, `Working language: 9 line(s)`: the seeds' 8 plus line 1 | Designed: as D10, the marker moved onto the code line | None |

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
2: two details of the first-comment read are driven by no case. D7–D11 (the increment below) drive what those
findings named, except the `/*` form of finding 1. Reopened again on 2026-10-27 by the incremental check (in the
post-implementation check below), findings 3 and 4: a `/*` first comment's closing token, and a blank line ending a
`//` first comment, are driven by no case. D12–D16 (the second increment below) drive what those findings named.
Reopened a third time on 2026-10-27 by the second incremental check, finding 5: no case puts the marker on the line
that ends a `//` first comment, or on a first line that is no comment, where it must not count.

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

### Increment after the post-implementation check (2026-10-27, on 645c866)

Rows D7–D10 above, added for the post-implementation check's findings 1 and 2, and D11, added by the self-check
below, each reviewed before it was written:

- Coverage: D7 and D8 drive the read going on past the first comment's first line, in a `//` run and in a block
  comment that runs on past the marker line (finding 1); D9 drives the end of a `//` run at a line of code and D10 a
  file whose first line is code (finding 2); D11 drives the read reaching the end of the file inside the first
  comment. Each row names the input that reaches its line of `isSkillCopy`. This claimed that with them every line of
  the function is driven by a case whose verdict would change without it; counted by line it missed that the `/*`
  closing token and a blank line ending a `//` run were driven by none (the incremental check's findings 3 and 4, covered
  by the second increment below). No gap goes into the test's header.
- Case design: each row runs through `check()` and asserts the exit status and the reported line, or the permitted
  count.
- False greens, from the design: D7 and D8 are red if the read stops at the comment's first line (no marker found,
  the file stays exempt, exit 0); D9 is red if a `//` run does not end at code (the marker on line 4 is reached, the
  Chinese line reported, exit 1); D10 is red if the first line is not tested for being a comment (the marker on line 2
  is reached, exit 1); D11 is red if reaching the end of the file inside the first comment counts as a copy (its
  Chinese line reported, exit 1). Every expected value comes from the fixture: a line number, or the seeds' 8 plus one.
- Resource reuse: each row is one more `check()` call, about 230 ms; no expensive resource.

Findings: none.

Self-check of the fix before it goes back for review (items 2–5 of the post-implementation step; item 1 is in the
code review record, items 6 and 7 in the task list):

- Item 2, each new assertion against the false-green forms: D7 and D8 assert exit 1, the reported line and the
  rule's reason; D9–D11 assert exit 0 and nine permitted lines, which a file left unread (eight) also fails. Each is
  red under the change it guards, shown on three changed copies of the gate (`evidence/ticket-296/increment-mutants.txt`:
  reading the first comment's first line only turns D7 and D8 alone red; dropping the end of a `//` run turns D9 and
  D10 alone red; counting the end of the file inside the first comment as a copy turns D11 alone red), with all 17
  cases green on the branch's gate. No always-true assertion, no tautology, no stale path, no skip, every assertion
  runs. A second round of this self-check, after D11, found nothing.
- Item 3, every branch and exit of `isSkillCopy` (unchanged by the fix) against a case: the `#!` skip D5; the doctype
  skip D1 and D8; a `<!--` comment D1, D8, D6; a `/*` comment D3; a `//` run D2, D4, D5, D7, D9; a `//` run ending at
  a line that is not one, or a first line that is code, D9 and D10; the marker found D1–D5, D7, D8; a block comment's
  closing token, `-->` D6 and D8, `*/` D12 and D13; a blank line ending a `//` run D14; the end of the file reached inside the first comment — no case, until this self-check added D11,
  reviewed above as an increment: without it, that exit could return true and a comment-only file would be checked as
  tooling, a loud false red against 296::2 of the same kind as finding 2.
- Item 4, the new cases' data: D7, D8 and D9 take the real headers' shapes (a wrapped title, the gallery shell's
  running comment, `dimensions.js`'s header meeting code; corrected for the incremental check's finding 4, which found
  this item naming the manifest's header); D10 and D11 are designed, there being no real sample of either shape among
  the copies.
- Item 5: the fix changes no shared helper (`check()`, `SEEDS`, `JS_COPY_HEADER` are unchanged); not applicable.

### Second increment, after the incremental check (2026-10-27, on 7c4ebc5)

Rows D12–D14 above, and D9's file and source, changed for the incremental check's findings 3 and 4, each reviewed
before it was written:

- Coverage: D12 drives the read going on past a `/*` comment's first line to `*/` on a later line, and D13 its
  stopping at `*/` without the marker (finding 3); D14 drives a blank line ending a `//` run, in the real manifest's
  shape (finding 4). D9 keeps its input and assertion and takes the file name of its real source, `dimensions.js`.
  With them each closing condition of the first comment is driven in each of its forms: `-->` (D6, D8), `*/` (D12,
  D13), a `//` run's end at code (D9, D10), at a blank line (D14), and at the end of the file (D11); and the marker is
  read past the first line in all three forms (D7, D8, D12).
- Case design: each row runs through `check()` and asserts the exit status and the reported line, or the permitted
  count.
- False greens, from the design: D12 is red if the `/*` read stops at its first line, or if its closing token matches
  the opening line (the file stays exempt, exit 0); D13 is red if the `/*` read does not stop at `*/` (the marker on
  line 3 is reached, line 4 reported); D14 is red if a blank line does not end a `//` run (the marker on line 4 is
  reached, line 2 reported). Every expected value comes from the fixture: a line number, or the seeds' 8 plus one.
- Resource reuse: each row is one more `check()` call, about 230 ms; no expensive resource.

Findings: none.

Self-check of this fix before it goes back for review (items 2–5; item 1 in the code review record, items 6 and 7 in
the task list):

- Item 3, enumerated by condition rather than by line this time, every test and normalisation in `isSkillCopy`
  against a case: the `#!` skip D5; the doctype skip D1, D8, and its blindness to case — none, so D15 is added; the
  first line's trim — none, so D15 indents its header; `<!--` read to `-->` D1, D8 and stopping there D6; `/*` read to
  `*/` D12 and stopping there D13, D3 on one line; a `//` run read on D2, D4, D5, D7, its lines' trim — none, so D16
  indents a run; a `//` run ending at code D9, D10, at a blank line D14, at the end of the file D11; the marker found
  D1–D5, D7, D8, D12, D15, D16. D15 and D16 are reviewed as part of this increment: each is red without the condition
  it drives (the doctype taken as a first line that is no comment, or an indented opener or `//` line not read), the
  file then exempt and exit 0; their expected lines come from the fixtures.
- Item 2, each new assertion against the false-green forms: D12–D16 assert the exit status with the reported line and
  the rule's reason, or nine permitted lines; each is red under the change it guards, on changed copies of the gate
  (`evidence/ticket-296/increment-mutants-2.txt`). No always-true assertion, tautology, stale path or skip.
- Item 4, the data: D12, D13 and D14 take the real files' shapes (the stylesheets' multi-line first comments, the
  manifest's blank line); D15 and D16 are designed, no copy having either shape.
- Item 5: no shared helper changes; not applicable.

### Third increment, after the second incremental check (2026-10-27, on 5852bf6)

Rows D17 and D18 above, added for the second incremental check's finding 5, each reviewed before it was written:

- Coverage: inside the read's loop the two forms test in opposite orders. A block comment tests the marker before its
  closing token, since its closing line is part of it; D1, D3 and D15 carry the marker on that line. A `//` run tests
  that a line is still a `//` line before the marker, since the line that ends it is not part of it; D17 puts the
  marker on a code line that ends a run, and D18 on a first line of code. The second increment's claim that "each
  closing condition of the first comment is driven in each of its forms" counted conditions and not this order; with
  D17 and D18 the order is driven in both forms.
- Case design: each row runs through `check()` and asserts exit 0 and the permitted count.
- False greens, from the design: D17 and D18 are red if the marker is tested before the run-end test, or if the two
  exits are folded into one test after the marker (either makes the file a copy and reports its Chinese line, exit 1),
  and if the file is not read (8). Every expected value comes from the fixture: the seeds' 8 plus one.
- Resource reuse: each row is one more `check()` call, about 230 ms; no expensive resource.

Findings: none.

Self-check of this fix (items 2–5; item 1 in the code review record, items 6 and 7 in the task list):

- Item 3, the read's conditions and now the order between them, against a case: every condition as the second
  increment's self-check lists it, plus the order of the run-end and marker tests in a `//` run, D17 and D18, and the
  order of the marker and closing-token tests in a block, D1, D3, D15. The `#!` and doctype skips run before the first
  line is read, and only in that order can both precede a comment; no other pair of tests depends on its order.
- Item 2: D17 and D18 assert exit 0 and nine permitted lines; each is red under the swapped order and under the folded
  test (`evidence/ticket-296/increment-mutants-3.txt`). No always-true assertion, tautology, stale path or skip.
- Item 4: D17 takes `dimensions.js`'s real shape; D18 is designed, no file opening with code carrying the marker.
- Item 5: no shared helper changes; not applicable.

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
   on past its marker line), each asserting the Chinese line after the header is reported. Disposition (2026-10-27,
   incremental check): fixed for a `//` run and a `<!--` comment by D7 and D8 in a32cd16; its `/*` form is still
   undriven and continues as finding 3.
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
   quoting the marker, asserting exit 0 and `Working language: 9 line(s)`. Disposition (2026-10-27, incremental
   check): fixed by D9 and D10 in a32cd16, with D11 adding the end of the file; D9's fixture is not the real
   `manifest.js`'s shape, whose first comment ends at a blank line, which is finding 4.

### Incremental check of the fix (2026-10-27, 645c866..7c4ebc5)

Date 2026-10-27; ticket [#296](https://github.com/aloong-planet/agentshed/issues/296) (feature `prototype-baseline`);
second round of the post-implementation check, an independent incremental check under `/implement` step 6. Whole change
e4c9589..7c4ebc5 on `fix/check-lang-copy-marker`; the fix under check is 645c866..7c4ebc5: a32cd16 adds D7–D11 to
`scripts/check-lang.test.mjs` (blob b09aefc) with their records and evidence, and 7c4ebc5 adds one row to
`checklist.md`. `scripts/check-lang.mjs` is unchanged since df9fdcf (`git log -- scripts/check-lang.mjs`). Requirement
source: #296's body (296::1–296::5 and the owner's decisions) and its comment, read with
`gh issue view 296 -R aloong-planet/agentshed` (and `--comments`) on 2026-10-27; for what a first comment is, the
owner's rule as skillshed implements it, `leadingComment` in `scripts/check-prototype-copies.mjs` at 3db94ce (a `//` run
ends at the first line that is not a `//` line; a `<!--` or `/*` comment runs to `-->` or `*/`). Run evidence:
[targeted-fix-1.txt](evidence/ticket-296/targeted-fix-1.txt) only. This check ran no gateway, full run or test and no
changed copy of the gate. It changed no file but this record: this section, and in place the design review's coverage
conclusion and the dispositions of findings 1 and 2.

**Objects, and how they were found.**

- Tests the range changes: `git diff 645c866..7c4ebc5 -- scripts/` touches `scripts/check-lang.test.mjs` only. It adds
  two entries to the copy loop (D7, D8; the loop's body is unchanged, so D1–D5 run as before) and moves the boundary
  page's case (D6), its fixture and assertions unchanged, into a new loop of permitted files with D9, D10 and D11.
- Tests that depend on test helper code the range changes: none. The diff leaves `check()`, `SEEDS`, `withChinese` and
  `JS_COPY_HEADER` untouched, and no test reads a file the range changes. `git diff --name-only 645c866..7c4ebc5` lists
  the test and seven files under `docs/.workings/prototype-baseline/`.
  `rg -uu -n -F -g '!**/node_modules/**' -g '!out/**' -g '!.git/**' -g '!docs/.workings/**' -e check-lang.test -e check-lang.mjs -e ticket-296 -e evidence/ticket-296 -e prototype-baseline .`
  hits `package.json:25` (the `check:lang` script: the control that the search reads the tree), the gate itself, the
  test's own line 13 (the path of the gate it runs), comments in four other scripts and tests (`check-raw-nul.mjs`,
  `lib/working-language.mjs`, `check-message-lang.mjs`, `zh-script.test.ts`) and two documents (`docs/specs/i18n.md`,
  ADR-0017). None of them imports or reads a file the range changes. The same search for `-e .workings` hits
  `.gitignore`, a comment in `check-shared-ui.mjs`, strings in two prototype pages, and these tests:
  `check-shared-ui.test.mjs` (its own fixture tree, with an empty `docs/.workings`), `startup-restore.spec.ts`
  (screenshots written to another feature's directory), and comments or strings in `workflow-actions.test.mjs`,
  `close-app.spec.ts`, `md.test.ts` and `app.spec.ts`. None of them reads this work directory.
- Test design table rows the range changes: D7–D11, all added. No other row changed (`git diff 645c866..7c4ebc5` of
  this record).

Outside these objects, every dimension's conclusion is carried over from the first round (on 3757e36).

**The targeted log**, against the full gateway's log requirements. `git rev-parse HEAD` gives 645c866, and
`git status --porcelain --untracked-files=all` lists four modified files, each with its hash. Each hash equals that
file's blob at a32cd16 and at 7c4ebc5 (`git rev-parse a32cd16:<file>` and `7c4ebc5:<file>`), so the run read the test
exactly as committed. 7c4ebc5's one `checklist.md` row is read by no test, since the test runs the gate in temporary
repositories. The repository gate in the log read the checklist before that row was added. The row holds no Chinese:
`rg -c '\p{Han}'` over the diff exits 1, and the control, `src/shared/i18n/zh.ts`, gives 358. The full gateway before
delivery covers that row. Both commands (`pnpm lint`, `pnpm check:lang`) are logged with their full output and their
own exit codes, both 0, and `VERIFY_EXIT=0`. The work directory is ignored (`.gitignore:4`), so
`increment-mutants.txt` is not in the status, although it was on disk before the run (written at 17:30 local; the run
started at 09:31:33Z, 17:31:33 local). No step reads it: ESLint ignores `docs/` (`eslint.config.js:39`), the gate lists
files with `--exclude-standard`, and the test runs in temporary repositories. The log meets every requirement and
matches the range; no finding.

#### Dimension 1: Coverage

**The test design table against the test, for the objects:**

| Row | Written as the table says | Notes |
|---|---|---|
| D6 | Yes: fixture and assertions unchanged, now an entry of the permitted loop | — |
| D7 | Yes: `demo-strip.js`, a `//` run with the marker on its second line, a Chinese `//` line 3; asserts exit 1, `found 1 problem(s)`, `…demo-strip.js:3 ` and the rule's reason | The real `app-identity.js` wraps its header mid-sentence (`do not edit by` / `hand — …`, lines 1–2) |
| D8 | Yes: doctype, a `<!--` title line without the marker, the marker on line 3, `-->` on line 4, Chinese on line 5; the same four assertions | The real `index.html`'s first comment runs over lines 2–7 |
| D9 | The test is as the table says, but the row's fixture source is not | The real `manifest.js` ends its first comment at a blank line (line 9), followed by a second `//` comment: finding 4 |
| D10 | Yes | Of the `.js` files under `docs/prototypes/`, only `vendor/mermaid.min.js` opens with code (the four `.mmd` files open with `%%`) |
| D11 | Yes. The missing final newline is what takes the read to the end of the file: with one, the empty last line ends the run at `:149` | No real file ends inside its first comment, and all 56 end with a newline |

**The first-comment read, by form, against the cases and the real files.** The real files were surveyed by a
read-only node script that re-implements `isSkillCopy`'s read (`check-lang.mjs:140–154`). It ran over the 56 `.html`,
`.mmd`, `.css` and `.js` files under `docs/prototypes/` that `git ls-files --cached --others --exclude-standard` lists,
the same count as the first round's.

| Form | The read goes on past the first line (296::1) | The read ends without the marker (296::2) | Real files |
|---|---|---|---|
| `<!--` | D8 | at `-->`: D6 | 17 pages; every first comment spans several lines (16 close on lines 5–72; `index.html` carries the marker on line 2) |
| `//` | D7 | at code on the first line: D10; at code on a later line: D9; at a blank line: **none** (finding 4); at the end of the file: D11 | 20 scripts: 3 copies, 13 whose run ends at code (`dimensions.js` on line 11, `_shared/toast.js` on line 3), 4 whose run ends at a blank line (`manifest.js` and the three `logic.js`) |
| `/*` | **none** (finding 3) | at `*/`: **none** (finding 3) | 14 (12 stylesheets, `_shared/session-hits.js`, `vendor/marked.umd.js`); every first comment spans more than one line, closing on lines 2–14 (`_shared/theme.css`: line 9) |

**Gaps in the test's header.** None are noted. The increment says none is owed. Findings 3 and 4 each owe a case, or
a gap note with the condition for driving it.

Conclusion: incomplete, findings 3 and 4. Findings 1 and 2 are fixed as recommended: D7 and D8 drive the marker on a
later line of a `//` and a `<!--` first comment, and D9 and D10 drive the end of a `//` run at code and a first line of
code. Finding 1's `/*` form is left, and continues as finding 3.

#### Dimension 2: Case design

D6–D11 each build their own repository through `check()` and run the real CLI once. Each asserts the exit status and
the reported file and line with `found 1 problem(s)`, or exit 0 and the permitted count. None reads the gate's
internals, and none builds a state that a commit could not hold. D8 uses D1's file name, but in its own repository.

Conclusion: no finding.

#### Dimension 3: False greens

Per the project capability declaration (`capabilities.toml`, read with Python's `tomllib`), `mutation-testing` is not
enabled; mutation testing is skipped. Each object's "when does it go red" is answered below, against the gate at
df9fdcf and each expected value's source. Every expected value is a literal: a line number fixed by the fixture, the
seeds' 8 plus the fixture's one line, or the prototype rule's reason typed in the test.

| Case | Goes red when |
|---|---|
| D6 | the block read runs past `-->` (`:151`): line 3's quote then makes the file a copy and line 4 is reported; or the file is not read (8) |
| D7 | the `//` read stops at the run's first line (no marker found, the file exempt, exit 0); or the `//` branch is not taken (`:147`, `:149`) |
| D8 | the block read stops at its opening line, whether by reading only the first line or by a closing token that matches that line (`:151`); or the doctype line is not skipped (`:144`) |
| D9 | a `//` run does not end at a later line that is not a `//` line (`:149`): the marker on line 4 is then reached and line 2 reported; or the file is not read (8) |
| D10 | a first line of code does not end the read (`:149`, on its first line): the marker on line 2 is then reached and line 1 reported |
| D11 | reaching the end of the file inside the first comment counts as a copy (`:153`): line 2 is then reported |

The implementer's evidence agrees with this table: in `increment-mutants.txt`, three changed copies of the gate, each
diff printed at `:151`, `:149` and `:153` as the gate has those lines today, turn exactly D7 and D8, D9 and D10, and
D11 red. This check ran none of them.

Forms: no always-true assertion (each line number, and the count of 9, needs the fixture's own Chinese line; an unread
file gives 8); no tautology (literals, as above); no stale path (the live CLI); no conditional skip; every assertion
runs (the cases are synchronous; the objects' two loops run over literal arrays of seven and four entries; the log
names all 17 cases). No case answers two details. Replacing the `/*` closing token (`'*/'`, `:147`) with any other string leaves all
17 green (finding 3). So does letting a blank line continue a `//` run (finding 4).

The forms for gates and command-line checks (review-code's false-greens list): the range adds no gate or check. Its
command-line evidence is `increment-mutants.txt`, which checklist row 178 cites. Form four: each mutation's diff
against the branch's gate is printed, which is independent proof that it landed, and the red falls on the targeted
cases and no other. Form six: every run's excerpt keeps `tests 17` with its pass and fail counts, so a run that did not
start would show.

Conclusion: no false green. The undriven details are findings 3 and 4.

#### Dimension 4: Resource reuse

The table names no expensive resource for D7–D11. The targeted log confirms it: all 17 cases ran, 220.7–242.7 ms each
(`duration_ms 4011.262792`), each building one temporary repository and one gate process inside its own `check()`. No
resource reaches the one-second bar. Nothing is shared or cleared, so the order of the cases bears on no count.

Conclusion: no finding.

#### Document sync

The facts that changed, from the range and its targeted run: D7–D11 added and D6 moved, 17 of 17 passing; findings 1
and 2 fixed (but for finding 1's `/*` form); findings 3 and 4 opened. Scope checked:

- the task inputs: #296's body and comment, this record, the range, and the targeted log;
- the work directory, listed with hidden entries (`ls -la`) and ignored files. `git status --porcelain --ignored`
  shows only `.husky/_/`, `node_modules/`, `out/`, `site/.astro/`, `site/node_modules/` and two `tsbuildinfo` files,
  and `git ls-files -o -i --exclude-standard -- docs/.workings` lists nothing, so every file there is tracked;
- `ticket-296-tasks.md`, `ticket-296-doc-sync.md`, `ticket-296-review-code.md`, and `checklist.md` (rows 106–107, 178);
- `final-regression.md`, which has no #296 section (task 11);
- the test file's header;
- every file naming the test or the ticket:
  `rg -uu -n -F -g '!**/node_modules/**' -g '!out/**' -g '!.git/**' -e check-lang.test -e '#296' -e '296::' .`
  gives 251 lines. Outside this work directory they are `package.json` and the records of other tickets (the gate's
  earlier #223 under `docs/.workings/i18n/`, and gateway logs). Inside it, besides #296's own files, they are other
  tickets' records and logs (#250, #270, #314, #316, round 2). None of them states this test's current coverage.

What the first round owed, now:

- D7–D11 are in the test design table, reviewed as an increment.
- The design review's coverage conclusion had not been brought up to date. It is now, in place, by this check.
- `checklist.md` row 178 records the added cases as Verified, on `targeted-fix-1.txt` and `increment-mutants.txt`. That
  stands: it states what those cases do. Rows 106–107 name the cases each unit started with, and contradict nothing.
- The document sync checklist's coverage row is Pending, as it should be.
- Task 9 of `ticket-296-tasks.md` reads "the incremental check follows". It needs this round's result.

Owed by findings 3 and 4:

- each added case's row in the test design table, reviewed as a design increment before it is written;
- the increment's claims corrected (finding 3), and D9's fixture source corrected, along with the self-check's
  item 4 (finding 4);
- `checklist.md`'s current verification for 296::1 and 296::2 citing the added cases;
- task 9 recording this round.

For any case the owner declines: the gap and its condition go into the test's header, and that unit's current
verification names the gap. Until then the coverage row of `ticket-296-doc-sync.md` stays Pending.

#### Findings

3. **No case drives a `/*` first comment past its first line or to its closing token** (Dimension 1; a regression that
   would go unseen; 296::1 and 296::2, the owner's decision; the rest of finding 1). For a `/*` first comment the read
   goes on to `*/` (`check-lang.mjs:147`, `:151`), as skillshed's `leadingComment` does. The only `/*` case is D3,
   whose one-line header carries the marker, so the read returns at `:150` before the token is ever compared. Replace
   `'*/'` with any other string and all 17 cases stay green. Two kinds of change go unseen:
   - A token that matches the opening line (`'/*'`, `'*'`) silently exempts a `/*` copy whose marker sits on a later
     line. That is #296's own failure, and finding 1's form for the CSS copy that 296::1 names.
   - A token that never matches reads a `/*` mockup on past its first comment. A later quote of the marker then makes
     the file a copy, and every Chinese line in it is reported: a false red against 296::2.

   The real shape is the multi-line one. All 14 `/*`-headed files under `docs/prototypes/` close their first comment
   on line 2 or later (`_shared/theme.css`: line 9), while D3 is designed as one line.

   The increment's claims, "every line of the function is driven by a case whose verdict would change without it" and
   (item 3) "a block comment's closing token D6", count lines and branches, a unit at which `-->` and `*/` look like
   one. Only `-->` is driven: by D6 on the closing side and by D8 on the reading side.

   Recommended: now, in this PR. Add two rows, the `/*` counterparts of D8 and D6, both in the real shape (a `/*`
   comment over several lines):
   - a CSS copy whose header carries the marker on its second line and closes on a later line, asserting the Chinese
     line after it is reported;
   - a stylesheet whose first comment closes without the marker, followed by a comment quoting it, asserting exit 0 and
     `Working language: 9 line(s)`.

   With them the increment's two claims hold; any row the owner declines leaves those claims to be corrected.
   Disposition (2026-10-27, second incremental check): fixed by D12 and D13 in 70f1f3d, as recommended; the first
   increment's line-count claim and its self-check's item 3 corrected in place.

4. **D9 does not have the real `manifest.js`'s shape, and a blank line ending a `//` first comment is driven by no
   case** (Dimension 1; an untrue record, and a regression that would go unseen; 296::2).
   - The record: D9's row gives its source as "the real `manifest.js` (a `//` header, then `window.PROTOTYPES = …`)",
     and the self-check's item 4 as "the manifest's header before its code". The real file's `//` header runs over
     lines 1–8, line 9 is blank, and a second `//` comment follows (lines 10 onwards, describing `app-identity.js`)
     before any code. D9's code-ended run is a real shape too, but that of 13 other scripts, such as `dimensions.js`,
     whose header meets code on line 11.
   - The coverage: the blank line is what ends the first comment of `manifest.js`, the file 296::2 names, and of the
     three `logic.js` modules. Skillshed's `leadingComment` ends a run there as well. Change `:149` so that a blank line
     does not end a `//` run (say `lines[i].trim() !== '' && …`), and all 17 cases stay green. D9's run ends at code,
     D10's first line is code, D11 has no blank line, and the other `//` cases find the marker before any blank line
     or hold none at all. A mention of the marker in the manifest's second comment would then make it a copy, with
     every Chinese name and question in it reported: finding 2's false red, in the shape the real file has.

   Recommended: now, in this PR. Add one permitted case in the real `manifest.js`'s shape: a `//` header holding a
   Chinese line, a blank line, then a `//` comment quoting the marker, asserting exit 0 and
   `Working language: 9 line(s)`. Correct D9's fixture source to a script whose header ends at code (`dimensions.js`),
   and the self-check's item 4 with it, reviewed as a design increment. Disposition (2026-10-27, second incremental
   check): fixed in 70f1f3d, as recommended: D14 in the real manifest's shape; D9's file and source corrected to
   `dimensions.js`, with the self-check's item 4.

### Second incremental check of the fix (2026-10-27, 7c4ebc5..e389e28)

Date 2026-10-27; ticket [#296](https://github.com/aloong-planet/agentshed/issues/296) (feature `prototype-baseline`);
third round of the post-implementation check, an independent incremental check under `/implement` step 6. Whole change
e4c9589..e389e28 on `fix/check-lang-copy-marker`; the fix under check is 7c4ebc5..e389e28. 70f1f3d changes
`scripts/check-lang.test.mjs` (blob b09aefc to 4d9f78b): it adds D12, D15 and D16 to the copy loop and D13 and D14 to
the second permitted loop, and moves D9 to `dimensions.js` with that file's first lines. It also adds the records (the
test design table's rows, the second increment and its self-check, the in-place corrections, the code review record
and the task list) and three evidence files. e389e28 adds one row to `checklist.md`. `scripts/check-lang.mjs` is
unchanged since df9fdcf (`git diff --stat df9fdcf..e389e28 -- scripts/check-lang.mjs` is empty). Requirement source:
#296's body (296::1–296::5 and the owner's decisions) and its comment, read with
`gh issue view 296 -R aloong-planet/agentshed` (and `--comments`) on 2026-10-27; for what a first comment is, the
owner's rule as skillshed implements it, `leadingComment` in `scripts/check-prototype-copies.mjs` at 3db94ce (lines
30–47: a `//` run takes the lines while they are `//` lines, so the line that ends it is not part of it; a `<!--` or `/*`
comment takes every line up to and including the one holding `-->` or `*/`). Run evidence:
[targeted-fix-2.txt](evidence/ticket-296/targeted-fix-2.txt) only. This check ran no gateway, full run or test, and no
changed copy of the gate. Its one script, a read-only survey of the real prototype files, ran from the session's
scratch directory. It changed no file but this record: this section, and in place the design review's coverage
conclusion and the dispositions of findings 3 and 4.

**Objects, and how they were found.**

- Tests the range changes: `git diff 7c4ebc5..e389e28 -- scripts/` touches `scripts/check-lang.test.mjs` only. Its
  three hunks (`git diff -U0`: old line 103 to new 104–128, old 148–149 to new 173–174, old 156 to new 182–194) lie
  inside the two literal arrays the loops run over: the copy loop's entries (D12, D15, D16 and a comment), D9's file and
  first lines, and the second permitted loop's entries (D13, D14). The loops' bodies are unchanged, so the other cases
  run as before.
- Tests that depend on test helper code the range changes: none. The hunks leave lines 13–56 untouched (`gate`, `CN`,
  `CHINESE_NAME`, `SEEDS`, `withChinese`, `JS_COPY_HEADER`, `check()`). `git diff --name-only 7c4ebc5..e389e28` lists the
  test and seven files under `docs/.workings/prototype-baseline/`.
  `rg -uu -n -F -g '!**/node_modules/**' -g '!out/**' -g '!.git/**' -g '!docs/.workings/**' -e check-lang.test -e check-lang.mjs -e ticket-296 -e evidence/ticket-296 -e prototype-baseline -e checklist.md .`
  gives 12 lines (exit 0): `package.json:25` (the `check:lang` script, the control that the search reads the tree), the
  test's line 13 (the path of the gate it runs), the gate's own lines 255 and 327, comments in `check-message-lang.mjs`,
  `lib/working-language.mjs`, `check-raw-nul.mjs` (two) and `zh-script.test.ts`, and `docs/specs/i18n.md:547` and
  ADR-0017 (two). None of them imports or reads a file the range changes. `rg -uu -l -F` with the same exclusions and
  `-e .workings` lists ten files: `.gitignore`, `check-shared-ui.mjs`, two prototype pages, and six tests.
  `check-shared-ui.test.mjs` builds its own fixture tree with an empty `docs/.workings`. `startup-restore.spec.ts`
  writes screenshots to another feature's directory. `workflow-actions.test.mjs` and `close-app.spec.ts` name the
  directory in a comment, `md.test.ts` and `app.spec.ts` in a string. None of them reads this work directory.
- Test design table rows the range changes: D9 (its file, input and source) and D12–D16, added (the table's lines in
  `git diff 7c4ebc5..e389e28` of this record). No other row changed.

Outside these objects, every dimension's conclusion is carried over from the first round (on 3757e36) and the second
(on 7c4ebc5).

**The targeted log**, against the full gateway's log requirements. `git rev-parse HEAD` gives 7c4ebc5, and
`git status --porcelain --untracked-files=all` lists four modified files, each with its hash. Each hash equals that
file's blob at 70f1f3d and at e389e28 (`git rev-parse 70f1f3d:<file>` and `e389e28:<file>`), so the run read the test
exactly as committed. Both commands (`pnpm lint`, `pnpm check:lang`) are logged with their full output and their own
exit codes, both 0, and `VERIFY_EXIT=0`. The three evidence files 70f1f3d adds are not in the status, the work
directory being ignored (`.gitignore:4`). `increment-mutants-2.txt` was on disk before the run (written 17:54:22 local;
the run started at 09:54:43Z, 17:54:43 local). No step reads it: ESLint ignores `docs/` (`eslint.config.js:39`), the
gate lists files with `--exclude-standard` (`check-lang.mjs:284`), and the test runs in temporary repositories.
`change-scope-fix-2.txt` was written at 17:55:04, after the log's last write at 17:55:03, and `targeted-fix-2.txt` is
the log itself. e389e28's `checklist.md` row is read by no test, and the repository gate in the log read the checklist
before that row was added. The row holds no Chinese: `rg -c '\p{Han}'` over the whole range's diff (54,544 bytes)
exits 1, and the control, `src/shared/i18n/zh.ts`, gives 358. The full gateway before delivery covers that row. The
log meets every requirement and matches the range; no finding.

#### Dimension 1: Coverage

**The test design table against the test, for the objects:**

| Row | Written as the table says | Notes |
|---|---|---|
| D9 | Yes: `docs/prototypes/dimensions.js`, a `//` run holding a Chinese line 2, code on line 3, a `//` comment quoting the marker on line 4; asserts exit 0 and `Working language: 9 line(s)` | The real `dimensions.js`: a `//` header over lines 1–10, `window.DEMO_DIMENSIONS = {` on line 11 |
| D12 | Yes: `demo-panel.css`, a `/*` title line without the marker, the marker on line 2, `*/` closing line 3, a Chinese comment on line 4; asserts exit 1, `found 1 problem(s)`, `…demo-panel.css:4 ` and the rule's reason | The real `_shared/theme.css`: a `/*` comment over lines 1–9, `*/` closing line 9 |
| D13 | Yes: `_shared/panel.css`, a two-line `/*` comment without the marker, a comment quoting it on line 3, a rule whose `content` is Chinese on line 4; asserts exit 0 and the count of 9 | Takes `theme.css`'s opening words and its multi-line form |
| D14 | Yes: `manifest.js`, a `//` header holding a Chinese line 2, a blank line 3, a `//` comment quoting the marker on line 4, code on line 5; asserts exit 0 and the count of 9 | The real `manifest.js`: a `//` header over lines 1–8, line 9 blank, a second `//` comment over lines 10–13, code on line 14 |
| D15 | Yes: `shell.html`, `<!DOCTYPE html>`, a `<!--` header indented by two spaces and carrying the marker, a Chinese comment on line 3; the four copy assertions with `…shell.html:3 ` | Designed, as the row says |
| D16 | Yes: `demo-indented.js`, two `//` lines indented by two spaces, the marker on the second, an indented Chinese `//` line 3; the four copy assertions with `…demo-indented.js:3 ` | Designed, as the row says |

**Real samples.** A read-only node script surveyed the 56 `.html`, `.mmd`, `.css` and `.js` files under
`docs/prototypes/` that `git ls-files --cached --others --exclude-standard -- docs/prototypes` lists, the same count as
the earlier rounds'. All 17 doctypes are lower-case, no first line after the skips is indented, and no `//` run holds
an indented line, so D15 and D16 have no real sample to take, as their rows say. The marker is in four of the 56 files,
the four exempt-type copies (`index.html`, `app-identity.js`, `demo-dimensions.js`, `demo-harness.js`). In none of
them, and in no other file, does the marker sit on a line that ends a `//` run or on a first line that is no comment.

**The first-comment read, by form and by condition, against the cases** (296::1 on the reading side, 296::2 on the
closing side):

| Form | The read goes on past the first line | The read ends without the marker | The line that ends the read, holding the marker |
|---|---|---|---|
| `<!--` | D8 | at `-->`: D6 | part of the comment, so the marker counts: D1, D15 (the marker on the line holding `-->`) |
| `//` | D7, D16 (indented) | at code on a later line: D9; at code on the first line: D10; at a blank line: D14; at the end of the file: D11 | not part of the comment, so the marker must not count: **none** (finding 5) |
| `/*` | D12 | at `*/`: D13 | part of the comment: D3 |

The skips and normalisations: the `#!` skip D5; the doctype skip D1, D8, and its blindness to case D15; the first
line's trim D15; a `//` line's trim D16.

**Gaps in the test's header.** None are noted. Finding 5 owes a case, or a gap note with the condition for driving it.

Conclusion: incomplete, finding 5. Findings 3 and 4 are fixed as recommended: D12 and D13 drive a `/*` first comment
past its first line and its stopping at `*/`, both in the real multi-line shape; D14 drives a blank line ending a `//`
run in the real manifest's shape, and D9's file and source are now `dimensions.js`, whose shape it has.

#### Dimension 2: Case design

D9 and D12–D16 each build their own repository through `check()` and run the real CLI once. The copy cases assert the
exit status, `found 1 problem(s)`, the reported file and line, and the rule's reason. The permitted cases assert exit
0 and the permitted count. None reads the gate's internals, and each fixture is a file a commit can hold. D9 and D14
reuse the file names of two kept permitted cases (`dimensions.js`, `manifest.js`), each in its own repository.

Conclusion: no finding.

#### Dimension 3: False greens

Per the project capability declaration (`capabilities.toml`, read with Python's `tomllib`: `[mutation-testing]` with
`enabled = false`, the section form the capability registry defines for it), `mutation-testing` is not enabled;
mutation testing is skipped. Each object's "when does it go red" is answered below, against the gate at df9fdcf
(`isSkillCopy`, `check-lang.mjs:140–154`) and each expected value's source. Every expected value is a literal: a line
number fixed by the fixture, the seeds' 8 plus the fixture's one line, or the prototype rule's reason typed in the
test. Each copy case also goes red if another line, or another rule, is reported.

| Case | Goes red when |
|---|---|
| D9 | a `//` run does not end at a later line of code (`:149`): line 4's marker is then reached, the file is a copy and line 2 is reported; or the file is not read (8) |
| D12 | the `/*` read stops at its opening line, by reading the first line only or by a closing token that matches it (`:147`, `:151`); or `/*` is not taken as a block opener (`:147`), so the opening line, no `//` line, ends the read at `:149`. Each leaves the file exempt, exit 0 |
| D13 | the `/*` read does not stop at `*/` (`:147`, `:151`): line 3's quote then makes the file a copy and line 4 is reported; or the file is not read (8) |
| D14 | a blank line does not end a `//` run (`:149`): line 4's marker is then reached and line 2 reported; or the file is not read (8) |
| D15 | the doctype skip becomes case-sensitive (`:144`), or the first line is not trimmed (`:145`): the doctype, or the indented opener, is then a first line that is no comment, and the file is exempt, exit 0 |
| D16 | a `//` line is tested untrimmed (`:149`), so the indented first line ends the read; or the read stops at the run's first line (`:151`). Each leaves the file exempt, exit 0 |

The implementer's evidence agrees with this table. `increment-mutants-2.txt` prints each of nine changed copies' diff
against the branch's gate, and the cases each turns red are the ones this table and the earlier rounds' tables give:
the first line only, D7, D8, D12 and D16; no end to a `//` run, D9, D10 and D14; the end of the file as a copy, D11; a
`/*` token matching the opener, D12; a `/*` token never matching, D13; a blank line continuing a run, D14; a
case-sensitive doctype skip, D15; the first line untrimmed, D15; a `//` line untrimmed, D16. This check ran none of
them.

Forms: no always-true assertion (each line number, and the count of 9, needs the fixture's own Chinese line; an unread
file gives 8); no tautology (literals, as above); no stale path (the live CLI); no conditional skip; every assertion
runs (the cases are synchronous; the copy loop runs over a literal array of ten entries and the second permitted loop
over one of six; the log names all 22 cases).

No case answers one detail. Inside the read's loop the two forms test in opposite orders. A block tests the marker
(`:150`) before its closing token (`:151`), since the closing line is part of the comment. A `//` run tests whether
the line is still a `//` line (`:149`) before the marker, since the line that ends it is not part of it. Walked case by
case, swapping `:149` and `:150` changes no verdict among the 22. The copy cases find the marker on a line of their
first comment either way. The lines that end the read in D9 (code), D10 (code on line 1), D14 (blank), D11 (none) and
the permitted `.js` cases (the empty last line) hold no marker, and `:149` applies to no block case. That is finding 5.

The forms for gates and command-line checks (review-code's false-greens list): the range adds no gate or check. Its
command-line evidence is `increment-mutants-2.txt`, which checklist row 179 and the task list's item 6 cite, and
`change-scope-fix-2.txt`. Form four: each mutation's diff against the branch's gate is printed, which is independent
proof that it landed, and the red falls on the targeted cases and no other. Form six: every run keeps `tests 22` with
its pass and fail counts, so a run that did not start would show. `change-scope-fix-2.txt` prints its exit code, 1, and
its verdict to run the tests. No skip rests on it, and the targeted log ran them.

Conclusion: no false green. The undriven detail is finding 5.

#### Dimension 4: Resource reuse

The table names no expensive resource for D9 or D12–D16. The targeted log confirms it: all 22 cases ran, 230.2–357.1 ms
each (D15 the slowest; `duration_ms 5537.733833`), each building one temporary repository and one gate process inside
its own `check()`. No resource reaches the one-second bar. Nothing is shared or cleared, so the order of the cases
bears on no count.

Conclusion: no finding.

#### Document sync

The facts that changed, from the range and its targeted run: D9 moved to `dimensions.js`, D12–D16 added, 22 of 22
passing; findings 3 and 4 fixed; finding 5 opened. Scope checked:

- the task inputs: #296's body and comment, this record, the range, and the targeted log;
- the work directory, listed with hidden entries (`ls -la`) and ignored files. `git status --porcelain --ignored`
  shows only `.husky/_/`, `node_modules/`, `out/`, `site/.astro/`, `site/node_modules/` and two `tsbuildinfo` files,
  and `git ls-files -o -i --exclude-standard -- docs/.workings` lists nothing, so every file there is tracked;
- `ticket-296-tasks.md`, `ticket-296-doc-sync.md`, `ticket-296-review-code.md`, and `checklist.md` (rows 106–107,
  173–179);
- `final-regression.md`, which has no #296 section (`grep -c 296` gives 0, exit 1; the control `#270` gives 4; task 11);
- the test file's header;
- every file naming the test or the ticket:
  `rg -uu -n -F -g '!**/node_modules/**' -g '!out/**' -g '!.git/**' -e check-lang.test -e '#296' -e '296::' .`
  gives 290 lines. Outside this work directory they are `package.json` and the records of other tickets: the gate's
  earlier #223 under `docs/.workings/i18n/`, and other features' gateway and targeted logs. Inside it, besides #296's
  own files, they are other tickets' records and logs (#250, #270, #314, #316, round 2). None of them states this
  test's current coverage.

What the second round owed, now:

- D12–D14 and D9's correction are in the test design table, reviewed as the second increment; D15 and D16, from its
  self-check, are reviewed there too.
- The first increment's claims and D9's source, with the self-check's items 3 and 4, are corrected in place.
- `checklist.md` row 179 records the added cases as Verified, on `targeted-fix-2.txt` and `increment-mutants-2.txt`.
  That stands: it states what those cases do. Rows 106–107 name the cases each unit started with, and contradict
  nothing.
- The design review's coverage conclusion, and the dispositions of findings 3 and 4, are brought up to date in place
  by this check.
- The document sync checklist's coverage row is Pending, as it should be.
- Task 9 of `ticket-296-tasks.md` reads "a further incremental check follows". It needs this round's result.

Owed by finding 5:

- the added case's row in the test design table, reviewed as a design increment before it is written, and the second
  increment's claim that "each closing condition of the first comment is driven in each of its forms" brought to it;
- `checklist.md`'s current verification for 296::2 citing the added case;
- task 9 recording this round.

If the owner declines the case, the gap and its condition go into the test's header, and 296::2's current verification
names the gap. Until then the coverage row of `ticket-296-doc-sync.md` stays Pending.

#### Findings

5. **No case puts the marker on the line that ends a `//` first comment, or on a first line that is no comment, where
   it must not count** (Dimension 1; a regression that would go unseen; 296::2 and the owner's decision).
   - The rule: the marker counts only on a line of the file's first comment. Skillshed's `leadingComment` keeps a
     block's closing line in the comment, but not the line that ends a `//` run (3db94ce, lines 38 and 41–44). The
     gate matches this by testing in opposite orders: a block tests the marker (`:150`) before its closing token
     (`:151`), and a `//` run tests that the line is still a `//` line (`:149`) before the marker.
   - What drives it: the block order is driven, since D1, D3 and D15 carry the marker on the line that closes their
     comment and go red if the order flips. The `//` order is driven by no case. The lines that end the read in D9,
     D10, D14 and the permitted `.js` cases hold no marker, and every `//` copy finds it on a `//` line.
   - What goes unseen: swap `:149` and `:150`, and all 22 cases stay green. So does a refactor that folds the two exits
     into one test after the marker test (`if (end === null ? !isSlashLine : lines[i].includes(end)) return false`),
     which reads as a simplification and keeps every block verdict. The gate on the repository stays green too: only
     the copies hold the marker, on a line of their first comment (the survey under Dimension 1). The file that goes
     wrong is a mockup script whose header meets a line of code with a trailing comment quoting the marker
     (`window.PROTOTYPES = [ // the gallery shell is copied from the prototype skill's template`), or a page whose
     first line after the doctype is markup with an inline comment quoting it. It becomes a copy, and every Chinese
     line in it is reported: a false red against 296::2, of the kind findings 2 and 4 named.
   - The record: the second increment's claim that "each closing condition of the first comment is driven in each of
     its forms" counts conditions. The order between the run-end test and the marker test is not one of them, and it
     is the very point where the forms differ.

   Recommended: now, in this PR. Add one permitted case in the real `dimensions.js`'s shape: a `//` header holding a
   Chinese line, ended by a line of code that carries a trailing comment quoting the marker (for instance
   `window.DEMO_DIMENSIONS = {} // the gallery shell is copied from the prototype skill's template`). Assert exit 0
   and `Working language: 9 line(s)`. Review its row as a design increment before it is written. Disposition: open.
