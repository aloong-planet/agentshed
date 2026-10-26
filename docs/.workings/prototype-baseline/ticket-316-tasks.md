# Ticket #316 — task list

`check:ui` keeps lists by hand that mirror a set the product grows, so a new member goes unchecked. Working record,
not a requirement authority: the requirement source is #316's body as rewritten on 2026-10-26 with the owner's
decisions (no spec; no comments), in the work directory `prototype-baseline`, where the gate's tickets without a spec
keep their records; coverage units `316::*` in [checklist.md](checklist.md). Branch `fix/check-ui-derived-lists`, in
its own worktree, cut from `origin/main` at e926e38 (no commits ahead when cut).

## Facts found before deciding (2026-10-26, on e926e38)

- The gate's hand-kept lists, enumerated from the whole file: `COMMON_LIBRARIES`, `BLOCK_CONTRACTS`, `SWATCH_VARS`,
  `THEME_SELECTORS`, the ticket-number rule's files and directories, the README rule's `FILES`, `SIDE_NAMES`,
  `SIDE_COUNT_WORDS`, `ALLOWED`, the two rules' languages, `EXEMPT`, `BRAND` and its three files, `THEME` (the accent
  colours), the chip pattern, the rail rule's `ITEMS`, the project column's states. Those that mirror a set defined
  elsewhere, and whose missing member goes unreported, are the eight in #316's table.
- Their sources, all first-hand (no hand copy in between):
  - `src/shared/appearance.ts:4` `APPEARANCE_THEMES = ['purple', 'blue', 'amber'] as const`, `:7`
    `DEFAULT_THEME = 'purple'`; `App.tsx:50` writes the theme to `data-theme`; `theme.css` holds the default's values
    under `:root` and the others under `html[data-theme='blue']` (`:84`) and `html[data-theme='amber']` (`:98`), each
    again in the dark media block (`:112`, `:162`, `:175`).
  - `src/shared/i18n/index.ts:67` `LANGUAGES = ['zh', 'en'] as const`; the dictionaries are `zh.ts` and `en.ts` in the
    same directory (the others there are `index.ts`, `types.ts`, `plural.ts` and tests).
  - `src/renderer/src/side-badge.ts:18`, `:25`, `:33`: `SIDE_FULL_NAME`, `SIDE_SHORT_NAME`, `SIDE_CHIP_LABEL`, each a
    `Record<AgentSide, string>` literal, total over the sides by the compiler.
  - `docs/prototypes/_shared/app-rail.js:149` `const ITEMS = [{ id, icon, route }, …]`, inside the file's function.
  - `theme.css`: five `--p-*` variables in light (`:60–66`) and dark (`:149–155`), ten values; the `--accent` family
    (`--accent`, `--accent-deep`, `--accent-soft`, `--accent-soft-deep`) in three themes, light and dark: 24 values,
    all hex. `#c9b3ec` is both dark `--p-xai` and dark purple `--accent-deep` (ADR-0021 accepts that collision).
  - The root holds `README.md` and `README.en.md`.
- The colour lists are short today: `BRAND` holds three light values (since 2026-07-30); `THEME` holds five `--accent`
  values and blue's light `--accent-deep`, missing dark blue's `--accent` `#7a9dc4`, which `theme.css` had when the
  list was written (2026-08-06, `git log -S`).
- Widening keeps main green: of the 79 `.ts`/`.tsx` files in `src/renderer/src/` (no subdirectories), only
  `SettingsPane.tsx`, which the accent rule excludes, holds any of the 34 values (12 accent-family values, its
  swatches). `git grep -nIiE '\btickets?\s+[0-9]+[a-z]?\b'` over `docs/` without `.workings`, every `.md`,
  `site/README.md`, `.github/`, `package.json` and `capabilities.toml`: exit 1; the same search finds 4 files in
  `docs/.workings/`.
- `docs/agents/` was created on 2026-09-10, after the ticket-number rule (2026-08-17), and was never added to it.
- None of the seven source constants was renamed since it was introduced (`git log -S` finds only the commit adding
  each); `--p-` changed in five commits, each adding colours.
- What the rules rest on stays true with the change: CONTEXT's side-enumeration invariant ("enforced by a shared-UI
  check over the dictionaries") and the rail-label invariant (`CONTEXT.md:557`, `:572`); the i18n spec's README gate
  (i18n::CON-001, `docs/specs/i18n.md:478`); ADR-0021's provider colours.

## Decisions

| # | Decision | Answer and reason |
|---|---|---|
| D1 | Which lists to derive (sides' names and chip labels, languages, READMEs, rail items) | All four, each from where its members are defined (owner, 2026-10-26, the recommended answer) |
| D2 | The swatch rule's themes | From `APPEARANCE_THEMES`; `DEFAULT_THEME` is `:root`, every other theme `html[data-theme='<id>']` (owner, recommended): `theme.css` alone cannot name the default, and a theme missing from it would not be checked |
| D3 | The brand colours | Every `--p-*` value in `theme.css`, light and dark (owner, recommended) |
| D4 | The brand colour rule's files | Every `.ts` and `.tsx` in `src/renderer/src/`, as the accent rule (owner, recommended) |
| D5 | The accent colours | The whole `--accent` family, 24 values (owner, recommended, after asking for the cost of deriving): the rule's name says the family; no file but the excluded settings page holds one |
| D6 | The ticket-number rule's scope | Every document under `docs/` except `docs/.workings/`, every `.md` at the root, and `package.json` (owner, recommended): only the exclusion is kept by hand |
| D7 | A source that cannot be read, or yields no member | Reported, so the rule never checks an empty list in silence: the gate's existing convention ("being unable to read the file is itself the problem", the swatch rule) applied to every derived list |
| D8 | How the gate reads its sources | The TypeScript parser for the `.ts` and `.js` sources (the gate already reads `project-side.js`'s `PROJECTS` with it); `theme.css` by cutting its text, as the swatch rule does |
| D9 | What the README rule keeps from its hand list | A link to a README that is not at the root is reported (found in the test design): the hand list reported a removed README ("missing README.en.md"), and a list read from the files would not. Through the links, a removed README is still reported, as i18n::CON-001's gate needs |

Kept by hand (in #316's body): `ALLOWED`, `EXEMPT`, `COMMON_LIBRARIES`, `BLOCK_CONTRACTS`; the side-count words; the
swatch variables and the project column's states. No user-visible behaviour changes: the change is to a repository
gate and its test.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Facts, decisions, #316's body rewritten with them | the issue body, this list | done: the body rewritten on 2026-10-26 |
| 2 | Records: the document sync checklist and the coverage checklist's fifth round | `ticket-316-doc-sync.md`, `checklist.md` | done |
| 3 | Test design review | `ticket-316-review-tests.md`, Design review | done: no finding; one increment (X0 asserts the run completes), reviewed there |
| 4 | Slice: the new cases red on the unfixed gate; the gate derived; all green | the red and green runs in `evidence/ticket-316/` | done: the 26 cases for missing behaviour red on e926e38's gate, A3, K4 and X0 green there by design, the existing 25 green (`red-first.txt`); all 54 green after, and the gate green on the repository (`green.txt`, before X0's increment; `targeted-2.txt` after it); eight changed copies of the gate each turn exactly the cases the design table names red (`mutants.txt`) |
| 5 | Targeted verification | `evidence/ticket-316/targeted*.txt` | done: `targeted-2.txt` — typecheck, lint, `check:ui` (54 cases, then the gate) and `check-lang`'s test (the search's one other test naming the gate) each exit 0. `targeted.txt`, the first run, failed lint on `site/` files only: the new worktree had not installed `site/`'s own dependencies |
| 6 | Code review | `ticket-316-review-code.md` | |
| 7 | Full gateway | `evidence/ticket-316/gateway-*.txt` | |
| 8 | Independent post-implementation test check | `ticket-316-review-tests.md` | |
| 9 | Source check, archive, write-back, step 8 | `final-regression.md` | |
| 10 | PR; CI; stop for the owner | PR link | |
