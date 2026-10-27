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

Conclusion: complete for 296::1 and 296::2.

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
