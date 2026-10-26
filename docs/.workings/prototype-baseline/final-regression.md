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

## Ticket #314 — check:ui's chart rule compares a page's charts with all its declarations, not each chart with its own

- Date: 2026-10-26
- Scope: this ticket's change only, `git diff a40c926` on branch `fix/check-ui-block-contracts`: `scripts/check-shared-ui.mjs`
  (blocks derived from `_shared/<id>.{css,js}` with the common libraries apart, the block-specific table, the
  per-element chart rule, the declaration rule, the two lists' check, the per-block output lines),
  `scripts/check-shared-ui.test.mjs` (twelve cases added or changed, `src/` copied, the copy guard), one attribute on
  each of `docs/prototypes/agents-page/prototype-agents.html` and `docs/prototypes/md-preview/prototype-heading-ladder.html`,
  #314's body (rewritten with the owner's decisions), the postmortem `docs/postmortems/2026-10-26-a-scratch-copy-that-was-a-link.md`
  with its index row, the coverage checklist's fourth round, and this ticket's records
- Version: 78ff2f5 for code and tests (the full gateway ran on it, `evidence/ticket-314/gateway-78ff2f5.txt`; the earlier
  run on 4f5607a, before the post-implementation check's cases, is kept beside it); the delivery head adds the
  postmortem and the records, and the gateway reruns there because the gate's ticket-number rule reads the postmortem

The two questions for the feature catalogue: **what became a lie** — nothing. The change is to a repository gate,
its test, and two prototype pages that gain an attribute no style or script reads (`md-preview.js` already set the
second at run time); no product code changed (`git diff --stat a40c926 -- src site` is empty). **What was missing** —
nothing: no user-visible behaviour of the app was added or changed. So `docs/features/` is unchanged. There is no
spec for this work; the requirement source is #314's body.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `scripts/check-shared-ui.mjs`, the header's paragraph on how a block is known ("_shared/<id>.css and _shared/<id>.js are block <id>'s assets, apart from the common libraries … only what a file name cannot say … goes in BLOCK_CONTRACTS") | `sharedBlocks` and `BLOCK_CONTRACTS`; the gate's run listing ten blocks (`evidence/ticket-314/green.txt`); cases P1–P4 | True |
| The doc comments of `COMMON_LIBRARIES` ("no page declares them"), `BLOCK_CONTRACTS` and `sharedBlocks` | the declaration rule (a library's id is unknown); `contracts-empty.txt`; the derivation's code | True |
| The chart rule's comment and name ("each chart answers for itself … read as text without comments rather than through JSDOM, so a chart written in a script template is judged as well") | cases M1–M3; JSDOM's reading (the code review, ①) | True |
| The declaration rule's and the lists' check's comments and names | cases N1, N2, L1; `contracts-stale-key.txt` | True |
| `OPEN_TAG`'s comment (a `>` inside a quoted value does not end the tag) | the pattern's quoted-value alternatives | True |
| `scripts/check-shared-ui.test.mjs`, its header (what it plants; why `docs/prototypes/` and `src/` are copied; the block-specific table's stale key not driven, with where it was run) and its comments on the plants, `FILES` and the copy guard | the cases; `harness-probe-before.txt` and `-after.txt`; `contracts-stale-key.txt` | True |
| The two pages: the Agents page's skeleton note above `#skChart` ("the gray bars are the chart container's children, laid out like the real bars") and the heading-ladder page's header ("shared: md-preview") | the pages after the change | True: neither speaks of declarations; both stay accurate |
| `checklist.md`: the fourth round's paragraph, units 314::1–314::6, their current verification, the two-way audit row | #314's body; the evidence named in each row | True (current verification at 78ff2f5) |
| #314's body (Decisions, Acceptance criteria) | the implementation: each decision D1–D7 and each criterion's case or gate (`ticket-314-tasks.md`, source check) | True |
| `docs/postmortems/2026-10-26-a-scratch-copy-that-was-a-link.md` (what happened, why nothing caught it, what was done) | the code review's finding 1 and its record of the write-through; `harness-probe-before.txt`, `-after.txt`; the guard in the test; `cpSync`'s behaviour on a linked source (a link copied as a link, the probe's first run) | True. It names no ticket: the gate's ticket-number rule passes with it staged (`pnpm check:ui` exit 0), and again in the full gateway on the delivery head |
| Specs, features, ADRs, `CONTEXT.md`, the prototype gallery | — | Row set empty: none changed. Not an ADR: deriving the blocks from their files is a change to a check, easy to reverse; the owner's decision is recorded in #314 and the task list. No new term |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | `docs/postmortems/README.md` gains the new postmortem's row (date, title, one line); no file added or renamed in `docs/specs`, `docs/features`, `docs/adr` or the gallery's manifest | Agree: the row's title and link match the file, its line matches the postmortem's account |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: how `check:ui` knows a shared block, what it checks, and what `_shared/` holds | the scope `docs/specs docs/features docs/adr docs/ops docs/agents docs/prototypes CONTEXT.md AGENTS.md README.md README.en.md site/README.md .github capabilities.toml package.json` (166 tracked files; Han in 15, Latin in all), searched in English for `SHARED_BLOCKS`, "shared block", `shared-block`, `data-shared-block`, "registry", `check-shared-ui`, `check:ui`, `COMMON_LIBRARIES`, `BLOCK_CONTRACTS`, and in Chinese, by code point, for the words for a shared block, a shared visual block, a shared piece, two words for a registry, and a gate (`evidence/ticket-314/step8-searches.txt`). The Chinese hits: one word for a registry in the project-visibility logic prototype, meaning an agent side's project registry, and it and the word for a gate in the skills preview's mock package text. No document described the gate's block registry or told a reader to add an entry to it. Statements about the check: `ci.yml:43` runs it; `CONTEXT.md:557` (its rail-label rule); ADR-0009:53 (it backstops the trend chart); ADR-0018:57, :62 (the `--cross` rule, superseded by ADR-0033); ADR-0033:34–36 (one tier; the app side of the shared blocks checked) and :67; the i18n spec:480; `capabilities.toml`; `package.json`. ADR-0033:31–32 says `_shared/` holds "the shared pieces' styles (`project-side.css`, `startup-skeleton.css`)": a description of the folder's contents when that decision was taken, not a ruling on which file is a block; its decision (hand-edited baseline, no cross tier) is untouched, and decision D7 (startup-skeleton is a common library) was taken by the owner with the file's header in view. The prototype skill's UI.md places a shared block at `_shared/<block name>.{css,js}` and has each use site declare it, which the derivation and the chart rule follow | Agree: every statement stays true |
| Rule ↔ the gate that holds it: each chart declares its own block; every declaration names a block; a block's contract comes from its files; the two lists stay true | `scripts/check-shared-ui.test.mjs` in `pnpm check:ui`, which `pnpm verify` and CI's checks job run: M1–M3, N1, N2, P1–P4, L1 red first on a40c926's gate (`red-first.txt`, `red-first-2.txt`); T1–T3 and D red with the table emptied (`contracts-empty-2.txt`); M1 and N2 each red alone under the forms they guard (`token-match.txt`, `nonempty-declaration.txt`) | Held, for every form the cases name. Not held by a case: the block-specific table's stale key (Evidence, `contracts-stale-key.txt`; the test header says why). Read only in double quotes, as before: a class or declaration in single quotes is not judged (no page writes one) |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: the shared blocks the gate checks went from eight to ten (totals-card, md-preview) | statements that list or count the blocks: the scope searched for lines naming two or more block ids, and for counts of blocks in English and Chinese (`step8-searches.txt`): no list or count of the blocks. The two-id lines are the word "toast" twice on a line (`CONTEXT.md`, three specs) and the gallery manifest's md-preview entry, whose module and path both say `md-preview`; the counts are ADR-0013's "370 pieces of copy" and the detail page's comment calling its totals card the same shared visual block as the Agents page's. The gate's own output lists the blocks it derives, generated. The enumeration-wording gate's coverage is the dictionaries' side names, not the blocks, so the scan was by hand | Row set empty after the scan |
| `Pending:` notes in scope | no spec in scope; `grep -n "Pending:" CONTEXT.md`: no output | Row set empty |
| New general rules this round | none: the rule the gate now enforces — a shared block lives at `_shared/<block name>.{css,js}` and each use site declares it — is the prototype skill's (UI.md), its authoritative home; the common-library list is the gate's own data, checked against the files | Row set empty |
| The review findings | the code review's finding 1 (the harness could write the repository through its links), fixed with the copy guard; the post-implementation check's findings 1–3 (the app sheet's invariant, the class token match, an empty declaration undriven), handled by T3, M1's second token, N2; the incremental check on 6664a7e..78ff2f5, no finding; the write-through during the first probe, recorded in the code review and the postmortem | Handled in the records |
| Work state changed | #314's body (rewritten with the decisions); the coverage checklist's fourth round, and its third-round audit row, which said the chart rule's count was reported to the owner (now: opened as #314); this ticket's document sync checklist; other records naming #314 (`rg -uu -l '#314' docs README.md README.en.md CONTEXT.md`) | Updated where they state current state |
