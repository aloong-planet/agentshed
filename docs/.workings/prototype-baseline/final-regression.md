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
  run on 4f5607a, before the post-implementation check's cases, is kept beside it); the delivery head c751e33 adds the
  postmortem and the records, and the full gateway passed there too (`gateway-c751e33.txt`), the gate's ticket-number
  rule reading the postmortem

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
| `docs/postmortems/2026-10-26-a-scratch-copy-that-was-a-link.md` (what happened, why nothing caught it, what was done) | the code review's finding 1 and its record of the write-through; `harness-probe-before.txt`, `-after.txt`; the guard in the test; `cpSync`'s behaviour on a linked source (a link copied as a link, the probe's first run) | True. It names no ticket: the gate's ticket-number rule passes with it staged (`pnpm check:ui` exit 0), and again in the full gateway on the delivery head (`gateway-c751e33.txt`) |
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

## Ticket #316 — check:ui's hand-kept lists leave new themes, sides, languages and colours unchecked

- Date: 2026-10-26
- Scope: this ticket's change only, `git diff e926e38` on branch `fix/check-ui-derived-lists`: `scripts/check-shared-ui.mjs`
  (the mirrored lists read from their sources and the rule reporting a source it cannot read; the provider colour,
  accent, chip, dictionary, README, ticket-number, rail and swatch rules reading them; the renderer's files read with
  their subdirectories), `scripts/check-shared-ui.test.mjs` (three trees, copied READMEs and `package.json`, an empty
  `docs/.workings`, global plants), `CONTEXT.md` (the side-enumeration invariant's allow-list sentence), #316's body (rewritten with the
  owner's decisions), the coverage checklist's fifth round, #314's records naming the owner's decision, and this
  ticket's records
- Version: 6b5aecc for the gate and the test's cases (the last executable change; the test's header changed after it, a
  comment-only change, `evidence/ticket-316/comment-only.txt`); the full gateway on the delivery head is named in the
  coverage checklist's current verification

The two questions for the feature catalogue: **what became a lie** — nothing. The change is to a repository gate, its
test and one glossary sentence about that gate; no product code changed (`git diff --stat e926e38 -- src site
docs/prototypes` is empty). **What was missing** — nothing: no user-visible behaviour was added or changed. So
`docs/features/` is unchanged. There is no spec for this work; the requirement source is #316's body.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `scripts/check-shared-ui.mjs`, the header's new paragraph (what a check mirrors is read from where its members are defined; a source it cannot read is reported) | the mirrored lists' section and the rule for `SOURCE_PROBLEMS`; X0–X10, U1–U3 | True |
| The mirrored lists' section: its lead comment and the doc comments of `constValue` (nested declarations; an object's spread or shorthand member kept as unreadable), `mirrored` (a member it cannot take is reported), `SIDE_NAMES` (a side counts once, its one pattern), `THEME_SELECTORS` (the default in `:root`), `themeHexValues` (hex only; another notation not searched), `READMES`, `rendererSources` (subdirectories included) | the code; Ra1, X7 (nested `ITEMS`), U1–U3, Th1 and G0 (the default's mapping, `mutants.txt` default-not-root), Sub | True |
| The rules' comments and names: the mirrored lists' rule; the ticket-number rule (root `.md`, `package.json`, `docs/` but `.workings`, through the walk's hidden-entry skip); the README rule (every README links every other; a link to one not there); the swatch rule's stop; the side-enumeration rule (the allow-list carries the reason an entry may name the sides); the dictionaries; the provider colour and accent rules; the chip rule; the rail rule's items | each rule's code; K1–K4 (`mutants.txt` ticket-walk-hidden), R1, R2, X0 (swatch-no-stop), S1, Lg1, Lg2, B1–B3, A1–A3, S2, Ra1; the allow-list entries' own `why` texts (a spec condition or none) | True |
| `scripts/check-shared-ui.test.mjs`, its header (what is copied and why, `package.json` included; the three trees; what is not driven) and its comments on the plants, `MISSING_PLANTS`, `ABSENT_FILES`, `COPIED`/`EMPTY` and the copy guard | the cases; the runs in `evidence/ticket-316/` | True |
| `CONTEXT.md:579–581` (side-enumeration invariant: "allow-listed there by dictionary key with the reason it may name them") | the gate's `ALLOWED` entries | True (it said "and the ticket that retires it", a field the entries lost when #126 was replaced by spec references; review finding 5) |
| `checklist.md`: the fifth round's paragraph, units 316::1–316::10, their current verification, the audit row | #316's body; the evidence named in each row | True (current verification on the delivery head's gateway) |
| #314's records: `ticket-314-review-code.md` ④ and `ticket-314-doc-sync.md`'s pre-delivery note | the owner's decision of 2026-10-26 (in the conversation, recorded in #316's body: no stale-key check for `ALLOWED` and `EXEMPT`) | True |
| #316's body (Decisions, Acceptance criteria) | the implementation: each decision and each criterion's cases (`ticket-316-tasks.md`, source check) | True |
| Specs, features, ADRs, the prototype gallery | — | Row set empty: none changed. Not an ADR: reading a gate's lists from their sources is easy to reverse; the decisions are recorded in #316 and the task list. No new term |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | — | Row set empty: no file added or renamed in `docs/specs`, `docs/features`, `docs/adr`, `docs/postmortems` or the gallery's manifest |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: what `check:ui` checks and where its lists come from | the scope `docs/specs docs/features docs/adr docs/ops docs/agents docs/prototypes docs/postmortems CONTEXT.md AGENTS.md CLAUDE.md README.md README.en.md site/README.md .github capabilities.toml package.json` (180 tracked files; Han in 101, Latin in all), searched in English for the gate's names, the changed rules' subjects (hard-coded, provider, brand and accent colours, the `--accent` family, chip labels, ticket numbers, the READMEs' links, rail labels and items) and the allow-list, and in Chinese for the words for a gate, hard-coded, brand colour, accent colour, ticket number, side label and inter-link (`evidence/ticket-316/step8-searches.txt`). Statements about the gate: `ci.yml:43` runs it; `CONTEXT.md:557` (the rail-label rule, over the dictionaries now read from `LANGUAGES`) and `:579` (fixed, stage 1); `capabilities.toml:14–15` (the enumeration-wording gate's source) and `:33` (theming); ADR-0009:53, ADR-0018:57/62/79 (the `--cross` rule, superseded by ADR-0033), ADR-0033:34–35, :49–50, :67; the global-search spec:313–314 (the rail-label exemption by key); the i18n spec:478–485 (the READMEs' reachability). The i18n spec says a link missed "when adding a language or renaming a file" is caught: true now without changing the gate, which was not so for a new README before. The Chinese hits are prototype copy and a skill fixture, none about the gate | Agree: every statement stays true |
| Rule ↔ the gate that holds it: a list a check mirrors is read from its source; a source it cannot read is reported; the provider and accent colours are not hard-coded in any renderer file; every root `.md`, `package.json` and document under `docs/` but `.workings` names no ticket; every README links every other | `scripts/check-shared-ui.test.mjs` in `pnpm check:ui`, which `pnpm verify` and CI run: each case red first on the unfixed gate (`red-first.txt`, `red-first-2.txt`, `red-first-3.txt`), eight changed copies of the gate each turning exactly their cases red (`mutants.txt`) | Held, for the forms the cases name. Held by people: appearance's "hard-coding a theme's colours inside a component is forbidden" (the appearance spec) beyond the accent family — neutral tokens (`--bg`, `--card`, `--text`) share values with ordinary colours, so a search for them would report code that is not using a theme's colour; a provider or accent colour written in another notation than hex (the gate's comment says so) |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed | none in the product: no side, language, theme, colour or rail item was added or removed (`git diff --stat e926e38 -- src docs/prototypes` is empty). What grew is the gate's reading of them (provider colours 3 → 10 values, accent 6 → 24, the provider rule's files 3 → 79, the ticket-number scope by the root's `.md` files, `docs/ops` and `docs/agents`); the searches above found no statement listing or counting those sets | Row set empty after the scan |
| `Pending:` notes in scope | no spec in scope; `grep -c "^> Pending:" CONTEXT.md`: 0 | Row set empty |
| New general rules this round | none: the decisions read this gate's lists from their sources and bind `check:ui`, whose header states them; the CONTEXT invariant on copy that enumerates sides is unchanged in substance | Row set empty |
| The review findings | the code review's findings 1–5 (a comment naming a non-cause; a source member read in silence as absent, seven lists; the renderer rules reading only the top level, two listings; new names in an avoided term; the allow-list's lost ticket field, in the gate and CONTEXT), each fixed; the test review's post-implementation findings 1–6 (a renderer `.ts`, `package.json` and an absent source file undriven, handled by Ts, Pk and a third tree; the record's plant list and design review, fixed in the record; the test header calling `package.json` a link, fixed) | Handled in the records |
| Work state changed | #316's body (rewritten with the decisions); the coverage checklist's fifth round; #314's records that left the gate's other lists to the owner (now naming the decision and #316); this ticket's document sync checklist | Updated where they state current state |

### Follow-up 2026-10-27: wording the owner asked for

- Date: 2026-10-27
- Scope: commit 5074243 on the same branch, asked for by the owner after the PR was opened (the avoided term "brand
  colour", and `package.json`'s description, changed now): `theme.css`'s comment over the `--p-*` values, the
  prototypes' trend chart stylesheet's comment, the appearance feature page's and spec's boundary lines, the agents
  prototype's by-model label in both languages, one e2e case's name, a comment in check:ui's test, and `package.json`'s
  description
- Version: 5074243; full gateway `evidence/ticket-316/gateway-5074243.txt`

The two questions: **what became a lie** — nothing; the changed lines say the same thing in the glossary's word, and the
description no longer lists the sides as the whole set. **What was missing** — nothing: no behaviour changed.

| Stage | Rows | Conclusion |
|---|---|---|
| 1, changed declarations | `theme.css:59` and `_shared/trend-chart.css:121` (the rules under each comment use the `--p-*` values); `docs/features/appearance.md:48` and `docs/specs/appearance.md:444` (the provider colours do not follow the theme: `theme.css` sets the `--p-*` values only in `:root` and the dark block, never under `data-theme`); the agents prototype's `byModel` in Chinese and English (its bars use `--p-*`; the Chinese label says "provider" followed by the character for colour, `\x{8272}`, as five other prototype files do: `rg -c 'provider \x{8272}' docs/prototypes`); the e2e case reading `--p-anthropic`, `--p-openai` and `--p-google`; the test comment naming the provider colour rule (the rule's name in the gate); `package.json`'s description (Claude Code, Codex "and other coding agents", as `README.en.md`'s opening sentence says) | True. The two boundary lines still say CC/CX where they mean every side badge: finding A |
| 2, one fact ↔ its other statements: the avoided term, and copy listing the sides | `rg -n -i -uu 'brand[ -]?colou?r'` outside `docs/.workings` and dependencies: only CONTEXT's _Avoid_ line (`CONTEXT.md:260`) remains; the Chinese term, `rg -n -uu '\x{54c1}\x{724c}\x{8272}'`, finds nothing (exit 1; the same pattern counts 1 in the agents prototype at 5074243^). `rg -i '\bbrand'` found one more use of the old name, the test's comment (fixed in the commit); the other hits mean a product name or the site header's `.brand`, not a colour. Sides listed on user-facing surfaces outside the dictionaries (`docs/features`, the READMEs, `site/src`, `package.json`): `projects-list.md:6` lists Claude Code, Codex and Grok as the whole set (finding B); `features/README.md:19` and `subagents-view.md` say "both sides", true because the subagents view reads two sides (`subagents.ts` has no Grok reader); `token-stats.md:28` names sides for their own accounting | Agree, but for findings A and B |
| 3, events | no dimension's members changed; no `Pending:` note touched; no new general rule. Earlier evidence files name the renamed e2e case by its old title; they record past runs and stay as they are | Row set empty |

Findings raised with the owner (the owner decided on 2026-10-27 to fix both in this PR, without a full gateway; done
in 16bd99f, below):

- **A — "CC/CX" where every side badge is meant**: the appearance spec at 46, 63, 138 and 444, and the feature page at 48.
  The Grok badge does not follow the theme either (`--gk-*` sits beside `--cl-*` and `--cx-*` in `:root` and the dark
  block only), so these lines leave it out. The spec's line 463 records what the prototype gate confirmed on 2026-08-06,
  before the Grok side, and stays. Recommendation: say "the side badges" in one small change.
- **B — `docs/features/projects-list.md:6`** lists the three sides as the whole set ("each agent side's own registry —
  Claude Code, Codex and Grok"), which turns false when a side is added. Recommendation: drop the list; the sentence
  already says "each agent side".

#### The owner's decision: findings A and B fixed (16bd99f)

- Scope: commit 16bd99f: the appearance spec at 46, 63, 138 and 444 and the feature page at 48 say "the side badges";
  the appearance and language feature pages' "Nothing is written to the Claude / Codex configuration" (appearance:50,
  i18n:52, the same defect in the same boundary lists) says "the agent configuration", as the appearance spec's line
  100 does; the project list's feature page drops its list of the sides
- Version: 16bd99f. **No full gateway: the owner waived it** (2026-10-27: fix them together, without the full gateway). The gates that read
  these documents ran on a clean tree, each exit 0: `check:ui` (its 70 cases, then the gate), `check:lang`, `check:i18n`
  (`evidence/ticket-316/targeted-16bd99f.txt`). The change is to four Markdown documents only (`git diff --stat
  9d50dc5 16bd99f` in the same log)

| Stage | Rows | Conclusion |
|---|---|---|
| 1, changed declarations | each changed line against `theme.css` (every side badge's `--cl-*`, `--cx-*`, `--gk-*` set only in `:root` and the dark block); against the appearance spec's line 100 for the configuration; the project list's sentence against itself ("each agent side") | True |
| 2, one fact ↔ its other statements: copy naming some or all sides | `rg -n -i 'claude ?(code)? ?(/\|and\|or) ?codex\|CC ?/ ?CX\|codex,? (and\|or\|/) grok\|both (agent )?sides\|two sides\|either side\|three sides' docs/features docs/specs README.md README.en.md package.json`, 64 lines in 22 files before the fix. Besides the eight fixed lines, the four files changed hold the spec's line 463 (a dated record, kept) and `projects-list.md:19` (finding C); the other files, finding C | Agree within the changed lines; the rest is finding C |
| 3, events | none | Row set empty |

Finding left for the owner (no persistent home until decided):

- **C — other lines that name sides, not judged**: the search above leaves 55 lines in 19 files once the fixed lines and
  the spec's line 463 are set aside. Most name the sides a feature really reads (the subagents and plugins views and parts of the session view are two-sided; the token
  statistics spec's "all three sides" lines are dated measurements). Judging each needs the feature's sides checked in
  code, which this change did not do. Lines that look like the same defect and need that check: `agents-overview.md:26`
  and `:30` (the Claude and Codex sides' subagents and MCP servers), `specs/project-detail.md:17` ("both sides'
  global configuration"), `specs/skill-install.md:10`, `:24`, `:53` (two sides), and two that list every side
  literally, `projects-list.md:19` (the side dropdown's options) and `session-view.md:64` (the badges CC/CX/GK).
  Recommendation: one small ticket that checks each feature's sides and rewrites what is wrong.
