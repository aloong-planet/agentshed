# Prototypes on the updated skill — documentation regression

## Ticket #270 — check:ui counts a shared asset named in a comment as the page's reference to it

- Date: 2026-10-26
- Scope: this ticket's change only, `git diff ef5e4cb` on branch `fix/check-ui-comment-refs`: `scripts/check-shared-ui.mjs`
  (the shared-block check's four searches and the tab identity rule's `<head>` searches read the page without
  comments; by the owner's decision D3, one pass removes each comment by the rules of where it stands — HTML comments
  in the markup, an inline script's JS comments by the TypeScript parser, a style block's CSS comments),
  `scripts/check-shared-ui.test.mjs` (new), the `check:ui` script, the coverage checklist's third round, and
  this ticket's records
- Version: 8e9ddf4 for code and tests (the full gateway ran on it, `evidence/ticket-270/gateway-8e9ddf4.txt`; earlier
  runs on d9b0208, e53f6d0 and 020e082, before the test checks' later fixes, are kept beside it); the commits after it
  change records and evidence only

The two questions for the feature catalogue: **what became a lie** — nothing. The change is to a repository gate and
its test; no product code and no prototype page changed (`git diff --stat ef5e4cb -- src site docs/prototypes` is
empty). **What was missing** — nothing: no user-visible behaviour was added or changed. So `docs/features/` is
unchanged. There is no spec for this work; the requirement source is #270's body.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `scripts/check-shared-ui.mjs`, the comment on the shared-block check's part 1 ("Read without comments: a comment naming an asset, a declaration or a mount point is none of them") | the code beneath it (`stripComments` before all four searches); the test's cases A–E (`evidence/ticket-270/green.txt`) | True |
| `scripts/check-shared-ui.mjs`, the comment in the tab identity rule ("Without comments: a commented-out script tag, icon link or title is not on the page") | the code beneath it; the test's case F | True |
| `scripts/check-shared-ui.mjs`, `stripComments`'s doc comment (one pass, each comment removed by the rules of where it stands; a comment-like sequence elsewhere stays) and `stripJsComments`'s (a `//` after code is a comment; one inside a string, a template or a regular expression is not) | the code; cases B, E, G–K (`evidence/ticket-270/green-4.txt`, `naive-h.txt`, `red-first-3.txt`, `scanner-k.txt`); the parser's ranges on today's pages (`comment-ranges.txt`: 355, 38 trailing, none overlapping) | True |
| `scripts/check-shared-ui.mjs`, the file header ("turns where a shared visual block appears and what it must satisfy into executable assertions …"), unchanged, re-read | the change: the header claims nothing about comments | True |
| `scripts/check-shared-ui.test.mjs`, its header (what it plants, and why the prototypes are copied rather than linked) and its comments on the plants and on `NAMED_IN_A_COMMENT` | the cases; `evidence/ticket-270/symlink-facts.txt` (a link to a directory is not a directory to `readdirSync`'s file types); `pin-guard.txt` (the set-up fails when a page stops naming its asset) | True |
| `package.json`, `check:ui` | the test runs before the gate, as `check:lang` and `check:nul` run theirs | True (a command, not prose) |
| `checklist.md`: the third round's paragraph, units 270::1, 270::2, 270::R1, their current verification, the two-way audit row | #270's body; the evidence named in each row | True |
| Specs, features, ADRs, `CONTEXT.md`, prototypes | — | Row set empty: none changed. Not an ADR: reading a page without comments is a fix to a check, easy to reverse, with no trade-off weighed; no new term or invariant |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | — | Row set empty: no file added or renamed in `docs/specs`, `docs/features` or `docs/adr` |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: what `check:ui` runs and what it checks | the scope `docs/specs docs/features docs/adr docs/ops docs/agents docs/prototypes CONTEXT.md AGENTS.md README.md README.en.md site/README.md .github capabilities.toml package.json` (166 tracked files, 146 of them text), searched for `check:ui`, `check-shared-ui` and the shared-UI check (`evidence/ticket-270/step8-searches.txt`): `ci.yml:43` runs it; `CONTEXT.md:557` (its rail-label rule) and `:579` (its dictionary rule); ADR-0009 (it backstops the trend chart's consistency); ADR-0018 (the `--cross` rule, superseded by ADR-0033); ADR-0033 (one tier, no prototype-versus-app comparison); the global-search and i18n specs (the rail-label exemption, the READMEs reaching each other); `capabilities.toml` (the enumeration-wording gate's source and command, and theming's). None says how the shared-block check finds a reference. Searched for how a page declares or references a block (`data-shared-block`, "references … block/asset") in the documents: no output. Scripts in the scope: Han in 44 text files (most of them prototypes, whose copy is Chinese); the Chinese words for a gate, a shared block or piece, and a comment searched in the six documents with Han: no output; the word for a gate in the prototypes: one hit, the skills preview's mock package text; controls matched (the word for download in `README.md`, 5 lines; the word for a shared piece in 10 prototype files) | Agree: every statement stays true |
| Rule ↔ the gate that holds it: a page's comments are not its markup, for the shared-block check and the tab identity rule | `scripts/check-shared-ui.test.mjs` in `pnpm check:ui`, which `pnpm verify` and CI's checks job run; seen red on the unfixed gate (`red-first.txt`) and, for the trailing comment, on the gate at d9b0208 (`red-first-2.txt`) | Held for the comment forms the pages use — HTML, CSS `/* */`, a whole-line `//`, a `//` after code — and for what is not a comment: a `//` in a string (H), a `/*` in a string (I), a template line starting with `//` (J), a `//` in a regular expression (K). The chart container rule still reads raw text and compares chart containers with every declaration (decision D1, reported to the owner) |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed | — | Row set empty: no languages, platforms, sides or shared blocks added or removed |
| `Pending:` notes in scope | no spec in scope; `grep -n "Pending:" CONTEXT.md`: no output | Row set empty |
| New general rules this round | none: the gate now applies to two more of its searches the rule it already applied elsewhere (`stripComments`) | Row set empty |
| The review findings | the code review (no finding; the class-level enumeration; a second layer for D3); the post-implementation check's findings 1 (the issue's cases relied on unpinned comments) and 2 (a `//` after code still counted); the first incremental check's finding 3 (the block and whole-line patterns still ran over scripts); the second's finding 4 (the regular-expression shape undriven); the third incremental check | Handled in the records: 1 by the set-up's pin, 2 by D3 (the owner's decision), 3 by the one-pass stripping within D3, 4 by case K |
| Work state changed | #270's issue (records declared on 2026-10-26); the coverage checklist's third round; this ticket's document sync checklist; other records naming #270 (`rg -uu -l '#270' docs README.md README.en.md CONTEXT.md`: this ticket's records, and `../global-search/final-regression.md:328`, a dated note that the issue was opened and is not global search's) | Updated where they state this ticket's current state; the dated note stays true: kept |
