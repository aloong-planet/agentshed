# Test review — #316

Ticket: [#316](https://github.com/aloong-planet/agentshed/issues/316) · work directory `prototype-baseline` ·
requirement source: #316's body as rewritten on 2026-10-26 with the owner's decisions, no spec; coverage units
`316::*` in [checklist.md](checklist.md). Task list: [ticket-316-tasks.md](ticket-316-tasks.md).

## Design review (2026-10-26, implementation starts from e926e38)

Scope: `scripts/check-shared-ui.test.mjs`, the shared-UI gate's test, run by `pnpm check:ui` before the gate. Eighteen
new cases on the planted tree, eleven on a second tree (X0–X10), one changed (G0), and harness changes. Mutation testing: by the
project capability declaration, mutation-testing is not enabled, so it is skipped; each case's "when does it go red"
is answered below. Every case for behaviour the gate lacks must be seen red on the unfixed gate first.

Seam: unchanged — the gate's command line on a temporary tree holding a copy of the gate, real copies of what the
cases plant, and links to the rest. Harness changes:

- **More of the tree is real.** The root's `README.md` and `README.en.md` are copied (a case plants `README.en.md`, and
  the second tree removes both), and `docs/.workings` is an empty directory instead of a link (a case adds a file
  there). A new file may sit at the tree's root or in a new directory: the copy guard now finds the nearest existing
  ancestor of a path and accepts it when it resolves inside the tree (the root included), and the harness creates the
  missing directories. A path under a linked directory still resolves into the repository and is still refused.
- **A plant can be a global pattern.** A `RegExp` with the `g` flag must match at least once; a string still must occur
  exactly once. The second tree renames every `--p-*` and `--accent*` name in `theme.css` this way.
- **Two trees.** `runGate(plants, files)` builds and runs one tree; the file runs it twice — the planted tree (the
  existing plants and this round's) and the missing-sources tree (sources renamed or emptied). The two cannot share a
  tree: one adds a member to a source the other renames.

Red first: the test changes first and runs on the gate at e926e38 (`evidence/ticket-316/red-first.txt`); the gate after.

### Test design table

Plants on the first tree (the components are chosen because no other plant or chip literal is in them):

- `src/renderer/src/TrendSpan.tsx`, after its `@shared/trend` import: `const PLANTED = ['#ad98d0', '#fa520f', '#7a9dc4', '#eef2f7']`
- `src/renderer/src/TokenViz.tsx`, after its `./TrendSpan` import: `const PLANTED_DARK = '#e8916f'`
- `src/renderer/src/theme.css`: `  --p-mistral: #fa520f;` after light `--p-other`; a light `html[data-theme='green']` block
  (`--card #fbfffb`, `--accent-soft #e8f5e9`, `--accent #2e7d32`, `--text #1b261c`) after amber's light block, and a dark
  one (`#141a15`, `#1f2b20`, `#66bb6a`, `#e3ece4`) after amber's dark block
- `src/shared/appearance.ts`: `'green'` appended to `APPEARANCE_THEMES`
- `src/renderer/src/SettingsPane.tsx`: `green` rows after amber's in `THEME_SWATCH` — light `['#fbfffb', '#e8f5e9', '#2e7d33', '#1b261c']` (the third differs from `theme.css` by one digit), dark as `theme.css`
- `src/renderer/src/side-badge.ts`: the gemini side — `gemini: GEMINI_FULL_NAME` (a constant's name, U2) in `SIDE_FULL_NAME`; `gemini: 'Gemini'`, then `...EXTRA_SHORT_NAMES` (U3), in `SIDE_SHORT_NAME`; `gemini: 'GEMINI'` in `SIDE_CHIP_LABEL`. The side's one readable name is its short one (corrected by the post-implementation check, finding 4)
- `src/shared/i18n/en.ts`, after `export const en: Locale = {` (line 4): `  plantedSides: 'Works with Codex and Gemini',` (line 5)
- `src/renderer/src/StartupHint.tsx`, after its `./icons` import: `const PLANTED_CHIP = 'GEMINI'`
- `src/shared/i18n/index.ts`: `'fr'`, then `...EXTRA_LANGUAGES` (U1), appended to `LANGUAGES` (corrected by the post-implementation check, finding 4); `FILES` adds `src/shared/i18n/fr.ts` — `export const fr: Locale = {`, a `rail` block (`agents: 'Agents'`, `refresh: 'Actualiser'`, closed by `  },` on line 5), `railHint: 'Cliquez sur Actualiser'` (line 6), `sidesNote: 'Claude Code et Codex'` (line 7)
- `docs/prototypes/_shared/app-rail.js`: `{ id: 'logs', icon: 'Folder', route: 'agents-page/agents' }` before the settings item; `docs/prototypes/plugins-view/prototype-plugin-skill-preview.html`: its rail gains `data-rail-logs="nowhere/missing"`
- `FILES` adds `README.fr.md` — `# Agentshed`, a blank line, `[Chinese](README.md) · [English](README.en.md) · [German](README.de.md) · **French**`; `README.en.md`: `See ticket 12.` after `# Agentshed` and a blank line (line 3); `FILES` adds `HANDBOOK.md`, `docs/guides/notes.md` and `docs/.workings/notes/notes.md`, each `See ticket 12.`

The second tree's plants: in `side-badge.ts`, `export const SIDE_FULL_NAME`, `SIDE_SHORT_NAME` and `SIDE_CHIP_LABEL`
renamed (`SIDE_LONG_NAME`, `SIDE_BRIEF_NAME`, `SIDE_TAG_LABEL`); in `index.ts`, `export const LANGUAGES = ` renamed
`LOCALES`; in `appearance.ts`, `APPEARANCE_THEMES` and `DEFAULT_THEME` renamed (`THEMES`, `FIRST_THEME`); in
`app-rail.js`, `const ITEMS = [` becomes `const ITEMS = [], OLD_ITEMS = [` (emptied, not renamed); in `theme.css`,
`/--p-(?=[a-z])/g` → `--provider-` and `/--accent/g` → `--hue`; `FILES` removes the copied `README.md` and `README.en.md`.

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| G0 (changed) | the planted run fails, and only on what was planted | all | the planted tree | exit 1; problems reported; every problem line starts with a planted or added file's path or `scripts/check-shared-ui.mjs:`, or is one of two lines a plant causes in a file it does not touch — `README.md: no link to README.fr.md` and `light.green swatch 3 (--accent): theme.css=#2e7d32, swatch table=#2e7d33` (the swatch rule's messages carry no path). Expected: the gate passes on main | the repository's own files | the planted tree (16 MB of prototypes, 1.9 MB of `src/`, two READMEs) and one gate run, once per file run, shared by every case on it |
| B1 | a provider colour outside the three files and the old list | 316::1 | `#ad98d0` (`--p-xai`, light) in `TrendSpan.tsx` | `src/renderer/src/TrendSpan.tsx: hard-coded #ad98d0` — the rule's message, literal; red on e926e38 (neither the file nor the value) | a hex string in a component, as the rule's subject | as G0 |
| B2 | a dark provider colour in a file the rule always searched | 316::1 | `#e8916f` (`--p-anthropic`, dark) in `TokenViz.tsx` | `src/renderer/src/TokenViz.tsx: hard-coded #e8916f`; red on e926e38 (light values only). Pins the dark values apart from the widened files | as B1 | as G0 |
| B3 | a provider colour added to `theme.css` | 316::1 | `--p-mistral: #fa520f` in `theme.css`, `#fa520f` in `TrendSpan.tsx` | `src/renderer/src/TrendSpan.tsx: hard-coded #fa520f`; red on e926e38. A list completed by hand would not have it | the variable in the form of its neighbours | as G0 |
| A1 | dark blue's accent | 316::2 | `#7a9dc4` in `TrendSpan.tsx` | `src/renderer/src/TrendSpan.tsx: hard-coded theme colour #7a9dc4`; red on e926e38 (the value missing from the list) | as B1 | as G0 |
| A2 | an `--accent-soft` value | 316::2 (D5, the family) | `#eef2f7` (blue, light) in `TrendSpan.tsx` | `src/renderer/src/TrendSpan.tsx: hard-coded theme colour #eef2f7`; red on e926e38. Red under a derivation of `--accent` alone | as B1 | as G0 |
| A3 | the settings page's swatches are not reported by the accent rule | 316::2 | the file holds 12 family values (the facts) and, planted, the green rows | no problem starts with `src/renderer/src/SettingsPane.tsx: hard-coded theme colour`. Red when the exclusion goes: G0 would not see it, the file being planted | the page's own table | as G0 |
| Th1 | a theme added, whose swatch row disagrees with its `theme.css` block | 316::3 | the green theme in `appearance.ts`, `theme.css` and `THEME_SWATCH` | `light.green swatch 3 (--accent): theme.css=#2e7d32, swatch table=#2e7d33` — the rule's message with the planted values; red on e926e38 (green never compared). The default's `:root` and the others' selectors are held by G0: a wrong mapping reports the existing themes, lines no plant explains | the theme blocks' and rows' own form | as G0 |
| S1 | a new side named beside another in copy | 316::4 | the gemini side in `side-badge.ts`; `'Works with Codex and Gemini'` on `en.ts:5` | `src/shared/i18n/en.ts:5 enumerates 2 side names in copy: 'Works with Codex and Gemini'`; red on e926e38 (one known name) | a dictionary entry's line form | as G0 |
| S2 | a new side's chip label hard-coded | 316::4 | `'GEMINI'` in `StartupHint.tsx` | `src/renderer/src/StartupHint.tsx: hardcoded chip label GEMINI — look it up in SIDE_CHIP_LABEL`; red on e926e38 | a quoted literal, the form the rule's pattern takes | as G0 |
| Lg1 | a new language's dictionary enumerates sides | 316::5 | `fr` in `LANGUAGES`; `fr.ts:7` `'Claude Code et Codex'` | `src/shared/i18n/fr.ts:7 enumerates 2 side names in copy: 'Claude Code et Codex'`; red on e926e38 (`fr.ts` never read) | `en.ts`'s head and `rail` block form | as G0 |
| Lg2 | a new language's dictionary names a rail control | 316::5 | `fr.ts`'s `rail.refresh` label `Actualiser` on line 6 | `src/shared/i18n/fr.ts:6 copy names the rail control "Actualiser" (rail.refresh) verbatim: 'Cliquez sur Actualiser'`; red on e926e38. The rail key is not exempt, so the rule has a label to look for | as Lg1 | as G0 |
| R1 | a README the others do not link | 316::6 | `README.fr.md` added | both `README.md: no link to README.fr.md` and `README.en.md: no link to README.fr.md`; red on e926e38 | the READMEs' language-switch line | as G0 |
| R2 | a link to a README that is not at the root | 316::6 (D9) | `README.fr.md` links `README.de.md` | `README.fr.md: links README.de.md, which is not at the root`; red on e926e38 (no such check). Keeps what the hand list gave: a removed README is reported, through the links to it | as R1 | as G0 |
| Ra1 | a new rail item's route on a page | 316::7 | `logs` in `ITEMS`; the plugins page's rail sends it to `nowhere/missing` | `docs/prototypes/plugins-view/prototype-plugin-skill-preview.html: data-rail-logs="nowhere/missing" is not in manifest.js`; red on e926e38 | the items' and the mount's own forms | as G0 |
| K1 | a ticket number in `README.en.md` | 316::8 | `README.en.md:3` | `README.en.md:3 references "ticket 12" — use a date or an ADR number`; red on e926e38 | a sentence in the README | as G0 |
| K2 | a ticket number in a new `docs/` directory | 316::8 | `docs/guides/notes.md:1` | `docs/guides/notes.md:1 references "ticket 12" — use a date or an ADR number`; red on e926e38 | a document under `docs/` | as G0 |
| K3 | a ticket number in a new root `.md` | 316::8 | `HANDBOOK.md:1` | `HANDBOOK.md:1 references "ticket 12" — use a date or an ADR number`; red on e926e38. Pins every root `.md`, not a longer list | as K2 | as G0 |
| K4 | a ticket number in the construction records | 316::8 | `docs/.workings/notes/notes.md` | no problem starts with `docs/.workings/`. Green on e926e38 too (by design); red when the scope takes `.workings` in | as K2 | as G0 |
| X0 (increment, below) | the missing-sources run fails, after every rule | 316::9 | the second tree | exit 1, and the output ends with the gate's summary (`Shared-UI check failed: N problem(s)`): a rule that throws on a missing source stops every rule after it, and the X lines, printed first, would not show it | — | the second tree, built and run once per file run, shared by X1–X10 |
| X1–X3 | the side tables renamed | 316::9 | `SIDE_FULL_NAME`, `SIDE_SHORT_NAME`, `SIDE_CHIP_LABEL` renamed | `src/renderer/src/side-badge.ts: SIDE_FULL_NAME is missing or empty — the side names come from it`; the same for `SIDE_SHORT_NAME`; `… SIDE_CHIP_LABEL is missing or empty — the chip labels come from it`. Messages fixed here, so the implementation is held to them | the declarations' own lines | as X0 |
| X4 | `LANGUAGES` renamed | 316::9 | as named | `src/shared/i18n/index.ts: LANGUAGES is missing or empty — the dictionaries come from it` | as X1 | as X0 |
| X5, X6 | the themes and the default renamed | 316::9 | as named | `src/shared/appearance.ts: APPEARANCE_THEMES is missing or empty — the themes come from it`; `… DEFAULT_THEME is missing or empty — the default theme comes from it` | as X1 | as X0 |
| X7 | `ITEMS` emptied | 316::9 | `const ITEMS = [], OLD_ITEMS = [` | `docs/prototypes/_shared/app-rail.js: ITEMS is missing or empty — the rail items come from it`. Drives the empty branch, X1–X6 the missing one | an empty array literal | as X0 |
| X8, X9 | the colour families renamed away | 316::9 | the two global patterns on `theme.css` | `src/renderer/src/theme.css: no --p-* value — the provider colours come from them` (renamed from "the brand colours" after step 8's search: CONTEXT avoids the term); `src/renderer/src/theme.css: no --accent family value — the accent colours come from them` | the sheet with its names changed | as X0 |
| X10 | no README at the root | 316::9 | both copied READMEs removed | `no README*.md at the root — the README rule reads them` | — | as X0 |

The existing cases are unchanged; T3's plant on `theme.css` and the plants of this round on the same file are swaps on
distinct strings.

### Coverage

#316's criteria, each against its cases: 316::1 — B1 (the reported gap), B2 (dark values), B3 (a member added at the
source); the renderer's `.ts` files, none (reopened: post-implementation check, finding 1). 316::2 — A1 (the reported gap), A2 (the family), A3 (the exclusion kept). 316::3 — Th1, and G0 for the
existing themes' selectors. 316::4 — S1, S2. 316::5 — Lg1, Lg2 (both rules on the new dictionary). 316::6 — R1, R2.
316::7 — Ra1. 316::8 — K1 (the reported gap), K2 (a new directory), K3 (a new root file), K4 (the exclusion);
`package.json`, none (reopened: post-implementation check, finding 2). 316::9 — X1–X10, every derived source: its
missing branch (X1–X6) and its empty branch (X7, X8–X10); a source file that is absent, none (reopened:
post-implementation check, finding 3). 316::10 is the gate on main.

Not driven, by reasoning: the ticket-number rule's directory walk is not a derived list — an empty `docs/` is a state
of the repository, not a source that failed to read, and `package.json` and the root's files stay in scope; the
ticket-number rule's `package.json` stays by name (the decision) — why it is kept by hand, not why no case drives
it (post-implementation check, finding 2). `AGENTS.md`, `CLAUDE.md`, `docs/ops/` and
`docs/agents/` are in scope by the same listing K2 and K3 drive; they are links in the tree.

### Case design

Each case asserts a whole problem line, written as a literal from the rule's message and the planted values; none reads
the gate's internals. The plants are each isolated to their own lines or files: the components chosen hold no other
plant or chip literal (`TrendSpan.tsx`, `StartupHint.tsx`, `TokenViz.tsx` — the last only B2). A3 and K4 assert an
absence on a file G0 cannot police (planted, or excluded by design). No state is built that the public path cannot
reach: every plant is an edit a developer could make to the file.

### False greens (design-time)

- Always-true assertions: each line assertion names a specific line; the absence checks (A3, K4) fail as soon as one such
  line appears, and the files hold what would produce it (A3: 12 values; K4: a ticket number).
- Tautology: expected values are literals from the plants and the messages fixed in the table, never recomputed from the
  gate's code.
- Guarding a dead path: each asserted message is the live rule's (the existing messages read from the gate at e926e38;
  the new ones, R2 and X1–X10, fixed here).

### Resource reuse

Two expensive resources, both built by `runGate`: the planted tree with its gate run, and the missing-sources tree with
its gate run. Each is built once per run of the file, at module level, and shared by every case on it; they differ in
their plants, so neither can stand in for the other (the existing harness's precedent, extended). The current file takes
4.7 s for one tree (2026-10-26); the second adds one copy and one gate run. Nothing clears either resource between
cases.

### Findings

No finding.

### Design increment (2026-10-26, after the first green run)

X0 also asserts that the gate's summary line closes its output. Found while writing the gate: the swatch rule stops on a
missing theme list (`THEME_SELECTORS` null), and without that stop it would throw — every rule after it unrun, the
process failing on the exception, and X0's exit code and X1–X10 (whose lines the first rule prints) all still green.
The summary line is printed only after every rule has run. Reviewed on this row: Coverage — it drives the branch the
X lines cannot (a rule surviving its source's absence); Case design — it reads the run's own output; False greens — red
when any rule throws on the second tree; Resource reuse — the same tree.

Not driven, recorded in the test's header: the chip rule's stop when it reads no label. Without it, the rule's pattern
would match empty string literals in an already-red run, adding lines but changing no verdict.

### Design increment (2026-10-26, the code review's findings 2 and 3)

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| U1 | a source array with a member the reader cannot read | 316::9 (finding 2) | on the planted tree, `LANGUAGES` becomes `['zh', 'en', 'fr', ...EXTRA_LANGUAGES] as const` (Lg1 and Lg2 still read `fr`) | `src/shared/i18n/index.ts: LANGUAGES has a member this script cannot read — the dictionaries come from it`; red first on e7d6f5a, which drops the spread in silence | a spread, the commonest way an array literal stops being a literal | as G0 |
| U2 | a source record with a member the reader cannot read | 316::9 (finding 2) | on the planted tree, `SIDE_FULL_NAME`'s new side is `gemini: GEMINI_FULL_NAME` (an identifier); S1 still finds `Gemini` through `SIDE_SHORT_NAME` | `src/renderer/src/side-badge.ts: SIDE_FULL_NAME has a member this script cannot read — the side names come from it`; red first on e7d6f5a | a record value that names a constant | as G0 |
| Sub | a component in a new subdirectory of the renderer's source | 316::1 (finding 3; D4, every `.ts` and `.tsx`) and 314::4 (the app component's prop) | `FILES` adds `src/renderer/src/panes/Planted.tsx`, holding `'#10a37f'` (a provider colour the old list had, so only the file's place is new) and `<TrendChart days={days} />` | `src/renderer/src/panes/Planted.tsx: hard-coded #10a37f` and `src/renderer/src/panes/Planted.tsx: <TrendChart> is missing archivedDays`; both red first on e7d6f5a, whose listings stop at the top level | a component file in the form of the renderer's own | as G0 |

| U3 | a source record with a spread member | 316::9 (finding 2: the fix also counts an object's spread or shorthand member, which the reader had skipped) | on the planted tree, `SIDE_SHORT_NAME` gains `...EXTRA_SHORT_NAMES` after the new side | `src/renderer/src/side-badge.ts: SIDE_SHORT_NAME has a member this script cannot read — the side names come from it`; red on e7d6f5a | an object spread | as G0 |

Reviewed on these rows: Coverage — U1 and U2 drive the reader's two shapes (array, record), U3 the record's member that
is not a property, and every mirrored list goes through the one check they drive; Sub drives both listings the finding names. Case design — whole lines as
literals, plants a developer could write. False greens — each red when its branch goes (the e7d6f5a runs). Resource
reuse — the same planted tree.

### Design increment (2026-10-27, the post-implementation check's findings 1–3)

| # | Test | Unit | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|
| Ts | a provider colour in a renderer `.ts` module | 316::1 (D4; finding 1) | on the planted tree, `src/renderer/src/skill-content-query.ts` gains `const PLANTED = '#d97757'` after its `./display-queries` import (a colour the old list had, in a file none of its rules searched: only the file type is new) | `src/renderer/src/skill-content-query.ts: hard-coded #d97757`; red when `rendererSources` drops `.ts`, which the accent and chip rules list through too | a module of the renderer's own, holding no other plant | as G0 |
| Pk | a ticket number in `package.json` | 316::8 (D6; finding 2) | `package.json` joins the copied files; on the planted tree its `description` (line 4) opens with `See ticket 12. ` | `package.json:4 references "ticket 12" — use a date or an ADR number`; red when the rule's list drops `package.json` | the manifest's own prose field | as G0 |
| Y0 | the absent-sources run fails, after every rule has run | 316::9 (finding 3) | a third tree: `FILES` removes `side-badge.ts`, `src/shared/i18n/index.ts`, `src/shared/appearance.ts`, `_shared/app-rail.js` and `src/renderer/src/theme.css` — every file a mirrored list is read from but the READMEs, whose absence X10 drives | exit 1 and the summary line, as X0: a reader that throws on a missing file stops the gate before any rule | — | the absent-sources tree, built and run once per file run, shared by Y0–Y9 |
| Y1–Y9 | each source absent as a file | 316::9 (finding 3) | as Y0 | the lines X1–X9 assert, word for word: a file that is not there is reported as its declaration's absence is (`constValue`'s and `themeHexValues`' paths for an unreadable file, which no tree reached) | as X1–X9 | as Y0 |

Why a third tree rather than removing `index.ts` and `theme.css` on the second, as finding 3 suggests: X0 drives the
swatch rule's stop on a missing theme list, which is reached only while `theme.css` can be read — with it removed, the
rule returns "cannot read" first, and the stop would go undriven. The second tree keeps its files and drives the
declarations; the third drives the files.

Reviewed on these rows: Coverage — Ts drives the listing's `.ts` half, Pk the rule's one listed file, Y0–Y9 the
unreadable-file path of both readers for every source file. Case design — whole lines as literals, plants and removals
a developer could make. False greens — Ts red without `.ts` in the listing, Pk without `package.json` in the list, Y0
red when a reader throws on a missing file (the summary never printed), Y1–Y9 when a missing file goes unreported.
Resource reuse — Ts and Pk on the planted tree; the third tree is built once per file run, like the other two, and
differs from both in what it removes; the file grows by one copy and one gate run (about 2 s, from the post-implementation
check's build count: 1.6–1.8 s per gate run).

Self-check before handing the fixes for the post-implementation check's findings 1–3 over (2026-10-27), items 2–5:

- 2, the new assertions (Ts, Pk, Y0, Y1–Y9), against the false-green forms: each names a whole line or the summary as a
  literal; none is always true — each was seen red on a changed copy of the gate (`evidence/ticket-316/red-first-4.txt`:
  ts-dropped turns Ts alone red, package-json-dropped Pk alone, const-value-no-null-stop and theme-css-no-fallback each
  Y0–Y9); Y1–Y9 come from a literal list of nine lines, so the loop cannot run empty.
- 3, the functions the fix changed: none in the gate. In the test, `COPIED` gains `package.json` and the third tree is
  one more `runGate` call; `runGate`'s branches are unchanged, and a removal of a file that is not there throws in the
  set-up, failing the file.
- 4, the fixtures: the plants are lines of the files as they are (`package.json:4`'s description, the module's own
  import), and the third tree removes real files.
- 5, shared helpers: `COPIED` and `runGate` are used by this file only (`git grep -n -e COPIED -e runGate -- scripts`:
  the test); the evidence script `mutant-run.sh` builds its scratch trees with the files the harness copies, so it now
  copies `package.json` as a real file too (a link would be copied as a link and refused by the guard).

No finding.

## Post-implementation check (2026-10-27, implementation 723db11, range e926e38..723db11)

Ticket [#316](https://github.com/aloong-planet/agentshed/issues/316); an independent check, first round. Its objects are
the 34 cases this change wrote or changed — G0, B1–B3, A1–A3, Th1, S1, S2, Lg1, Lg2, R1, R2, Ra1, K1–K4, U1–U3, Sub,
X0–X10 — and the harness they share (`runGate`, `assertInCopy`, `COPIED`, `EMPTY`, global plants). The 24 cases the
change left as they were come in only through that harness: their plants and assertions are unchanged, every file they
plant is under the copied `docs/prototypes/` or `src/`, where the nearest-ancestor guard resolves as the old one did,
and they are green in the gateway run. Requirement source: #316's body, read with `gh issue view 316 -R
aloong-planet/agentshed` on 2026-10-27. Full-run evidence: [gateway-723db11.txt](evidence/ticket-316/gateway-723db11.txt)
only; this check made no full run.

**The gateway log**, against the full gateway's log requirements: it names the version (`git rev-parse HEAD` 723db11,
the range's end; `git status --porcelain --untracked-files=all` empty, so no file needs a hash), each of `pnpm verify`'s
eleven steps as its own command with its full output and its own exit code, all 0, and `VERIFY_EXIT=0`. Lint and e2e
ran (`pnpm lint`, `pnpm e2e`; `capabilities.toml` declares both enabled). The only other ignored files under
`docs/.workings/` are three screenshots `e2e/startup-restore.spec.ts` writes into `docs/.workings/startup-restore/`
during the run's e2e step. The log meets every requirement; no finding.

### Coverage

**The test design table against the test, row by row** (seam, input, assertion, the expected value's source, fixture,
resource): every row matches the test as written, apart from the plant list above the table (finding 4). The values
the rows name, read from the sources at 723db11: `#ad98d0` is light `--p-xai` (`theme.css:65`), `#e8916f` dark
`--p-anthropic` (`:149`), `#7a9dc4` dark blue `--accent` (`:169`), `#eef2f7` blue's light `--accent-soft` (`:93`);
amber's light and dark blocks end on the planted strings (`:109–110`, `:186–187`); `en.ts:4` is
`export const en: Locale = {`; `fr.ts`'s rail block has `en.ts`'s form (`en.ts:9–14`, closed by `  },` at two spaces,
which the rail rule's pattern needs). The plant list said `gemini: 'Gemini'` in `SIDE_FULL_NAME` and `'fr'` alone in
`LANGUAGES`; U1–U3's increment changed both and did not carry them back. Corrected above; the rows reading those plants,
reviewed again as a design review:

- S1 — its input is now the gemini side's short name only (its full name is a constant's name). Coverage: a side added
  to `SIDE_SHORT_NAME` in copy. Case design: unchanged. False greens: red when the side names are not taken from
  `SIDE_SHORT_NAME`, since `SIDE_FULL_NAME` alone leaves Gemini unknown and the string one name short. Resource reuse:
  the planted tree.
- Lg1, Lg2 — `LANGUAGES` holds `'fr'` and a spread; `fr` is still read, so both rows stand as written.

`SIDE_FULL_NAME`'s names are driven only as a source that is absent (X1) or has an unreadable member (U2). Reading the
short names alone would give every case and the repository's copy the same verdict: in `side-badge.ts` each side's
full name contains its short name (`Claude Code` and `Claude`, `Codex`, `Grok`; `:17–27`). A case would need a full
name that does not contain the short one, a form the source does not have, and no change to that list alters a verdict
on real copy. Not a finding.

**The members each criterion names, against the cases whose input goes through them** (enumerated from #316's
acceptance criteria and decisions):

| Criterion | Members named | Driven by |
|---|---|---|
| 316::1 | `--p-*` values: light, dark, one added | B1, B2, B3 |
| 316::1 (D4) | files: a top-level `.tsx`, a `.tsx` in a subdirectory, a `.ts` | B1, B2; Sub; **none** (finding 1) |
| 316::2 | `--accent`; the rest of the family; light; dark; `SettingsPane.tsx` excluded | A1; A2; A2; A1; A3 |
| 316::3 | the default against `:root`; every other theme against its selector | G0 (purple); Th1 (green), G0 (blue, amber) |
| 316::4 | a new side in copy; its chip label | S1; S2 |
| 316::5 | each dictionary rule on a new dictionary | Lg1, Lg2 |
| 316::6 | every root `README*.md`; a link to one that is not there (D9) | R1; R2 |
| 316::7 | every `ITEMS` member's route | Ra1 |
| 316::8 | `docs/` (a new directory); `docs/.workings` excluded; a root `.md` (existing, new); `package.json` | K2; K4; K1, K3; **none** (finding 2) |
| 316::9 | each source: its declaration absent; empty; a member unreadable; the source file absent | X1–X6, X10; X7–X9; U1–U3; **none** (finding 3) |
| 316::10 | the gate on the repository | the gateway's `pnpm check:ui`, exit 0 |

**Gaps in the test's header.** Two are noted: the block-specific table's key check (run once on a copy of the gate,
#314's records) and the chip rule's stop when it reads no label (without it the rule only adds lines to a run already
red). Both read true against the gate at 723db11 (`check-shared-ui.mjs:638`, `:694`). Findings 1–3 are not header items:
each can be driven on the two trees as they are.

### Case design

No finding. Every case reads the gate's command line — its exit code and its printed lines — and nothing inside it, and
every plant is an edit a developer could make to the file. Both trees are built once at import and each case reads only
their output strings, so no case depends on another's order or state. A file carrying several plants (`TrendSpan.tsx`:
four values) has each asserted by its own line, keyed by value. The tree links `docs/`'s other directories, so there the
ticket rule's walk does not enter them (a link is not a directory to `readdirSync`'s file types); no case asserts on
them, and in the repository they are real directories (False greens, form nine).

### False greens

By the project capability declaration, mutation-testing is not enabled; mutation testing is skipped. Each case's "when
does it go red", against the gate at 723db11. Every expected value is a literal: the planted value inside the rule's
own message, as the gate writes it (`check-shared-ui.mjs:270–271`, `:326`, `:336`, `:390`, `:411`, `:413`, `:454`,
`:521`, `:591`, `:607`, `:622`, `:643`, `:817`), never recomputed by the test.

| Case | Goes red when | Evidence |
|---|---|---|
| G0 | the planted run exits other than 1, prints no problem, or prints a line no plant explains — e.g. the default theme sent to `html[data-theme='purple']`: purple's block is then reported as `theme.css: light.purple (…) is missing …`, which starts with no planted path | `mutants.txt`, default-not-root |
| B1 | the provider colours lack light `--p-xai`, or the rule skips a renderer file outside the three it read | `red-first.txt` |
| B2 | the provider colours come from the light part of `theme.css` only | `red-first.txt`; `mutants.txt`, brand-light-only |
| B3 | the provider colours are not read from `theme.css` as it stands (a list kept by hand, however complete today) | `red-first.txt` |
| A1 | the accent colours lack dark blue's `--accent` | `red-first.txt` |
| A2 | the accent colours come from `--accent` alone | `red-first.txt`; `mutants.txt`, accent-alone |
| A3 | `SettingsPane.tsx` is no longer excluded: it holds 12 family values, and 3 more in the green rows (`#e8f5e9`, `#1f2b20`, `#66bb6a`) | `mutants.txt`, settings-not-excluded |
| Th1 | the swatch rule's themes are not read from `APPEARANCE_THEMES` (green never compared) | `red-first.txt` |
| S1 | the side names are not taken from `SIDE_SHORT_NAME` (above) | reasoning on the plant since U2; `red-first.txt` for the old fixed list |
| S2 | the chip pattern is not built from `SIDE_CHIP_LABEL` | `red-first.txt` |
| Lg1 | the side-enumeration rule does not read every dictionary `LANGUAGES` names | `red-first.txt` |
| Lg2 | the rail-label rule does not | `red-first.txt` |
| R1 | the READMEs are not the root's listing (each README's line its own assertion) | `red-first.txt` |
| R2 | a link to a README that is not at the root goes unreported | `red-first.txt`; `mutants.txt`, readme-links-unchecked |
| Ra1 | the rail rule's items are not `ITEMS` | `red-first.txt` |
| K1 | `README.en.md` is outside the scan | `red-first.txt` |
| K2 | `docs/` is walked through a fixed list of directories | `red-first.txt` |
| K3 | the root's `.md` files are a fixed list | `red-first.txt` |
| K4 | the walk enters hidden directories | `mutants.txt`, ticket-walk-hidden (green on e926e38 by design) |
| U1 | an array member that is not a string literal is dropped without a report | `red-first-2.txt` |
| U2 | a record value that is not a string literal is dropped without a report | `red-first-2.txt` |
| U3 | an object member that is not a property assignment is skipped | `red-first-3.txt` |
| Sub | either listing stops at the top level: the provider rule's (`rendererSources`) or `<TrendChart>`'s (`appSources`), each its own assertion | `red-first-2.txt` |
| X0 | the missing-sources run exits other than 1, or a rule throws, so the summary line is never printed | `mutants.txt`, swatch-no-stop |
| X1–X10 | the matching source's absence is not reported in those words; each line is its own case | `red-first.txt`; `mutants.txt`, sources-silent (all ten) |

The evidence is the implementation's own runs, read here: `red-first.txt` ran the test against e926e38's gate,
`red-first-2.txt` and `red-first-3.txt` against e7d6f5a's, and `mutants.txt` changed copies of e7d6f5a's gate (blob
167bfa6); each line `mutants.txt` changed stands verbatim at 723db11 (`grep -cF` on each: 1). This check changed no gate.

The forms for gates and command-line checks (review-code's false-greens list), the change being a gate's rules:

- Form four, a gate never seen red: each new rule prints its line on the planted tree and the gate exits 1 there (G0);
  the cases were red on e926e38's gate first (`red-first.txt`: 26 red; A3, K4 and X0 green by design; the 25 existing
  cases green).
- Form seven, an exemption that blinds the gate: the gate's exemptions are predicates — `SettingsPane.tsx` by name (A3
  holds its edge), `docs/.workings` by the hidden-entry skip (K4). The test's own allowance, `CAUSED_ELSEWHERE`, is two
  exact lines, not patterns.
- Form nine, a target outside the tool's reach: in the repository the ticket walk and the renderer listing reach what
  the cases reach in the tree. No symbolic link under `docs/`, `src/` or at the root (`find docs src -type l` and
  `find . -maxdepth 1 -type l`: no output; `ls -la docs`: eight real directories), so `docs/agents/` and `docs/ops/`
  are walked as K2's new directory is; in the tree, `src/` and the READMEs are real copies.
- Form six, a check whose own failure reads as data: a gate that does not start leaves `status` null, which G0 and X0
  refuse; a change in how the gate prints problems empties `problems`, which G0's non-empty check refuses, so A3 and K4
  cannot pass on nothing unseen.

No finding.

### Resource reuse

Two expensive resources, as the table names them: the planted tree with its gate run, and the missing-sources tree with
its gate run. The gateway log has no output per build (only the file's `duration_ms 6491.133125`), so the count comes
from a run of this check's objects alone, on 723db11 with a clean tree (node v24.19.0):
`node --import <scratchpad>/count-builds.mjs --test-skip-pattern="<the 24 unchanged cases' names>" scripts/check-shared-ui.test.mjs`,
the pattern built from the `test(…)` calls on lines 279–376. The preload counts the tree builds and the gate runs and
changes no file:

```js
import fs from 'node:fs'
import cp from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
const t0 = Date.now(), events = []
const mk = fs.mkdtempSync
fs.mkdtempSync = (prefix, ...rest) => {
  const dir = mk(prefix, ...rest)
  if (String(prefix).includes('agentshed-shared-ui-')) events.push(`build ${events.filter((e) => e.startsWith('build')).length + 1} at +${Date.now() - t0}ms: ${dir}`)
  return dir
}
const sp = cp.spawnSync
cp.spawnSync = (cmd, args, ...rest) => {
  const started = Date.now()
  const r = sp(cmd, args, ...rest)
  if (Array.isArray(args) && args.some((a) => String(a).endsWith('scripts/check-shared-ui.mjs'))) events.push(`gate run ${events.filter((e) => e.startsWith('gate run')).length + 1} at +${started - t0}ms, ${Date.now() - started}ms, exit ${r.status}`)
  return r
}
syncBuiltinESMExports()
process.on('exit', () => process.stderr.write(`\n[count-builds] ${events.length} event(s)\n${events.map((e) => `[count-builds] ${e}`).join('\n')}\n`))
```

Its output: `tests 34`, `pass 34` (exactly the 34 objects, G0 first), and

```
[count-builds] build 1 at +9ms: /var/folders/9h/52q4kxb115j2nglbz0kfpkh00000gn/T/agentshed-shared-ui-xupHdt
[count-builds] gate run 1 at +113ms, 1806ms, exit 1
[count-builds] build 2 at +1943ms: /var/folders/9h/52q4kxb115j2nglbz0kfpkh00000gn/T/agentshed-shared-ui-ecmV6T
[count-builds] gate run 2 at +2013ms, 1609ms, exit 1
```

Afterwards no `agentshed-shared-ui-*` directory was left in the temporary directory and `git status --porcelain
--untracked-files=all` was empty. An earlier run of the whole file (58 cases) gave the same four events; it also ran
the 24 unchanged cases, so the scoped run above is the one cited. Each tree is built once per test process, by the two
module-level `runGate` calls, as the table says; neither count grows with the cases. No case clears or releases either
resource: the cases read the runs' output strings, and each tree is removed inside `runGate` before any case runs, so
the order of the cases does not bear on the count. No finding.

### Document sync

Scope checked for what this check's findings change: the task inputs (#316's body, this record, the range
e926e38..723db11, the gateway log); the work directory `docs/.workings/prototype-baseline/`, listed with hidden entries
(`ls -la`) and ignored files (`git status --ignored --untracked-files=all -- docs/.workings`: the gateway log is the
only ignored file in it) — `ticket-316-tasks.md`, `ticket-316-review-code.md`, `ticket-316-doc-sync.md`, the fifth
round of `checklist.md`, `final-regression.md` (no #316 section yet: `grep -n -E '316|Fifth'`, no output) and
`evidence/ticket-316/`; the test file's header; the root's current statements (`AGENTS.md`, `README.md`,
`README.en.md`, `CONTEXT.md`, `capabilities.toml`); and every file naming the gate outside `node_modules/`, `out/`,
`.git/` and `docs/.workings/` (`rg -uu -e check-shared-ui -e check:ui`: 27 lines, in `ci.yml`, `CONTEXT.md:557`,
`capabilities.toml`, `docs/specs/i18n.md:480`, ADR-0009, ADR-0018, ADR-0033, the 2026-10-26 postmortem,
`package.json`, the gate, its test, `check-lang.mjs` and its test). None outside the work directory states what the
test covers. `docs/features/` is out of scope: the change alters no user-visible behaviour (the task list).

Owed by the findings:

- Findings 1–3, when their cases are added: the cases' rows in the test design table, reviewed before the cases are
  written; the design review's coverage paragraph (marked above) brought to them; `checklist.md`'s current
  verification for 316::1, 316::8 and 316::9, when written, citing them. Any the owner declines instead: the gap and
  the condition for driving it go into the test file's header, and that unit's current verification names the gap
  rather than the whole criterion. Until then the coverage checklist row of `ticket-316-doc-sync.md` stays Pending (it
  is), and task 8 of `ticket-316-tasks.md` records this check's findings.
- Finding 4: done in this record.
- Not a finding, but owed: this check rests on `evidence/ticket-316/gateway-723db11.txt`, which the repository ignores
  and the branch does not yet hold (`git status --ignored` lists it); it is kept by committing it with `git add -f`
  beside this record, as `gateway-b03fc6e.txt` was.

### Findings

1. **No case plants into a renderer `.ts` file** (Coverage; a regression that would go unseen; 316::1, D4).
   `rendererSources()` takes `.ts` and `.tsx`, and the provider, accent and chip rules all list through it. Every colour
   and chip plant sits in a `.tsx` file (`TrendSpan.tsx`, `TokenViz.tsx`, `StartupHint.tsx`, `panes/Planted.tsx`); the
   one renderer `.ts` file planted, `side-badge.ts`, is outside the chip rule and holds no colour. With `.ts` dropped
   from that filter every case stays green and so does the gate on the repository, while the 23 non-test `.ts` files in
   `src/renderer/src/` (44 `.ts` files with the tests, beside 35 `.tsx`) drop out of the listing all three rules read — for the provider rule,
   the half of D4's widening that is new. Recommended: now, in this PR — a provider colour planted in a renderer `.ts`
   module that holds no other plant, asserting `src/renderer/src/<file>.ts: hard-coded <value>`; the listing is shared,
   so the one case drives it for all three rules.
2. **No case drives the ticket-number rule's `package.json`** (Coverage; a regression that would go unseen; 316::8,
   D6). This change rewrote the rule's list to the root's `.md` files plus `'package.json'`. K1–K4 drive the root
   listing, the `docs/` walk and its exclusion; nothing plants in `package.json`, a link in the tree. Drop
   `'package.json'` from the list and every case stays green, yet its `description` is prose a ticket number can be
   written into. Recommended: now — `package.json` copied into the planted tree, a ticket number planted in its
   `description`, asserting `package.json:<line> references "ticket 12" — use a date or an ADR number`.
3. **No case drives a source file that is absent** (Coverage; a regression that would go unseen; 316::9). The cases
   drive a declaration absent from a file that exists (X1–X6), an empty one (X7–X9), no README at all (X10) and an
   unreadable member (U1–U3). A source file that is gone — `side-badge.ts` moved into a subdirectory, say, which this
   change made the renderer rules follow — goes instead through `constValue`'s `if (src === null) return undefined`
   and `themeHexValues`' `read(…) ?? ''`, which neither tree reaches: every source file exists in both. Remove either
   guard and all 58 cases stay green, while a moved source then makes the gate throw as it loads — the TypeScript
   parser given a null text throws `TypeError: Cannot read properties of null (reading 'length')` (checked with the
   worktree's `typescript`), and `stripCssComments(null)` throws the same way — exit 1 with a stack trace, no rule run
   and no line naming the source: what X0 rules out for an absent declaration. Recommended: now — in the
   missing-sources tree, one source read through `constValue` removed instead of its declaration renamed (e.g.
   `src/shared/i18n/index.ts`: X4's line then comes through the absent file, while X1–X3, X5 and X6 keep the absent
   declaration), and `theme.css` removed instead of its variables renamed (X8's and X9's lines are unchanged: the same
   `values.size === 0` branch, then reached through `?? ''`).
4. **The plant list above the test design table misstated two plants** (Coverage; an untrue record). It gave
   `gemini: 'Gemini'` in `SIDE_FULL_NAME` and `'fr'` alone in `LANGUAGES`; the test has `gemini: GEMINI_FULL_NAME`
   there and `...EXTRA_SHORT_NAMES` in `SIDE_SHORT_NAME` (U2, U3), and `'fr', ...EXTRA_LANGUAGES` (U1). As written, the
   list had S1 run through the full-name table, which it has not done since U2. Fixed in this record: the plant list
   corrected, and S1, Lg1 and Lg2 reviewed again (Coverage, above).
