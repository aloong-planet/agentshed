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
- `src/renderer/src/side-badge.ts`: `gemini: 'Gemini'` in `SIDE_FULL_NAME` and `SIDE_SHORT_NAME`, `gemini: 'GEMINI'` in `SIDE_CHIP_LABEL`
- `src/shared/i18n/en.ts`, after `export const en: Locale = {` (line 4): `  plantedSides: 'Works with Codex and Gemini',` (line 5)
- `src/renderer/src/StartupHint.tsx`, after its `./icons` import: `const PLANTED_CHIP = 'GEMINI'`
- `src/shared/i18n/index.ts`: `'fr'` appended to `LANGUAGES`; `FILES` adds `src/shared/i18n/fr.ts` — `export const fr: Locale = {`, a `rail` block (`agents: 'Agents'`, `refresh: 'Actualiser'`, closed by `  },` on line 5), `railHint: 'Cliquez sur Actualiser'` (line 6), `sidesNote: 'Claude Code et Codex'` (line 7)
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
| X8, X9 | the colour families renamed away | 316::9 | the two global patterns on `theme.css` | `src/renderer/src/theme.css: no --p-* value — the brand colours come from them`; `src/renderer/src/theme.css: no --accent family value — the accent colours come from them` | the sheet with its names changed | as X0 |
| X10 | no README at the root | 316::9 | both copied READMEs removed | `no README*.md at the root — the README rule reads them` | — | as X0 |

The existing cases are unchanged; T3's plant on `theme.css` and the plants of this round on the same file are swaps on
distinct strings.

### Coverage

#316's criteria, each against its cases: 316::1 — B1 (the reported gap), B2 (dark values), B3 (a member added at the
source). 316::2 — A1 (the reported gap), A2 (the family), A3 (the exclusion kept). 316::3 — Th1, and G0 for the
existing themes' selectors. 316::4 — S1, S2. 316::5 — Lg1, Lg2 (both rules on the new dictionary). 316::6 — R1, R2.
316::7 — Ra1. 316::8 — K1 (the reported gap), K2 (a new directory), K3 (a new root file), K4 (the exclusion). 316::9 —
X1–X10, every derived source: its missing branch (X1–X6) and its empty branch (X7, X8–X10). 316::10 is the gate on main.

Not driven, by reasoning: the ticket-number rule's directory walk is not a derived list — an empty `docs/` is a state
of the repository, not a source that failed to read, and `package.json` and the root's files stay in scope; the
ticket-number rule's `package.json` stays by name (the decision). `AGENTS.md`, `CLAUDE.md`, `docs/ops/` and
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
