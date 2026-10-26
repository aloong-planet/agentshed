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
| 6 | Code review | `ticket-316-review-code.md` | done: findings 1 (a comment naming a cause that is not one), 2 (a source member the reader cannot read dropped in silence; seven lists) and 3 (the renderer rules reading only the directory's top level; two listings), fixed with cases U1–U3 and Sub, red first on e7d6f5a; targeted again, `targeted-3.txt`. Found at step 8's searches: findings 4 (new names using the glossary's avoided "brand colour") and 5 (the allow-list's "ticket that retires it", in the gate's comment and CONTEXT), fixed; `targeted-4.txt` |
| 7 | Full gateway | `evidence/ticket-316/gateway-*.txt` | b03fc6e: `VERIFY_EXIT=0` on a clean tree (`gateway-b03fc6e.txt`); rerun after findings 4 and 5 |
| 8 | Independent post-implementation test check | `ticket-316-review-tests.md` | first round on e926e38..723db11: findings 1 (no renderer `.ts` planted), 2 (`package.json` undriven by the ticket-number rule's cases) and 3 (an absent source file undriven), handled by cases Ts, Pk and a third tree (Y0–Y9) — a third tree rather than the finding's suggestion, which would have left X0's swatch stop undriven; finding 4 (the plant list) fixed in the record by the check. Each new case red on a changed copy of the gate (`red-first-4.txt`). Incremental on 723db11..6b5aecc: findings 5 (the test's header called `package.json` a link) and 6 (the design review describing the test before the fix, fixed in the record by the check); 5 fixed in the header, a comment-only change by the reuse conditions' (1)–(3) (`comment-only.txt`), so step 6 is closed |
| 9 | Source check, archive, write-back, step 8 | `final-regression.md` | done: the source check below; no ADR, no new term, no postmortem (no failure reached a commit); CONTEXT's side-enumeration sentence fixed (finding 5); the checklist's current verification; step 8, the #316 section of `final-regression.md` |
| 10 | PR; CI; stop for the owner | PR link | |

Self-check of the post-implementation check's fixes (2026-10-27), items 6 and 7: `red-first-4.txt` keeps its commands,
the gate's hash equal to HEAD's, the test's hash with the test uncommitted, the scripts it ran (`mutate.py` in full;
`mutant-run.sh` as recorded in `mutants.txt`, changed to copy `package.json`, the change stated in the file), and each
run's verdict lines; the worktree was checked unchanged around the mutant runs. The records follow: the design increment
and the self-check in `ticket-316-review-tests.md`, item 1 in `ticket-316-review-code.md`, this list. The coverage
checklist's current verification is written with the delivery head's gateway. No finding.

## Source check before step 7 (2026-10-27, implementation 6b5aecc, against #316's body)

| Line of the issue | Implementation | Conclusion |
|---|---|---|
| Decision: the side names and chip labels from `SIDE_FULL_NAME`, `SIDE_SHORT_NAME`, `SIDE_CHIP_LABEL` | `SIDE_NAME_ENTRIES`, `SIDE_NAMES`, `CHIP_LABELS` (S1, S2, X1–X3, Y1–Y3, U2, U3) | Met |
| Decision: the languages from `LANGUAGES`, each dictionary at `src/shared/i18n/<language>.ts` | `DICTIONARIES`, read by both dictionary rules (Lg1, Lg2, X4, Y4, U1) | Met |
| Decision: the READMEs from the root's `README*.md` | `READMES` (R1, X10); and D9, a link to a README not at the root (R2) | Met |
| Decision: the rail items from `ITEMS` in `_shared/app-rail.js` | `RAIL_ITEMS` (Ra1, X7, Y7) | Met |
| Decision: the swatch rule's themes from `APPEARANCE_THEMES`, `DEFAULT_THEME` as `:root` | `THEMES`, `DEFAULT_THEME`, `THEME_SELECTORS` (Th1; G0 for the existing three; X5, X6, Y5, Y6) | Met |
| Decision: the provider colours from every `--p-*` value, light and dark | `PROVIDER_COLOURS` (B1–B3, X8, Y8) | Met |
| Decision: the accent colours from the whole `--accent` family, every theme, light and dark | `ACCENT_COLOURS` (A1, A2, X9, Y9) | Met |
| Decision: the provider colour rule searches every `.ts` and `.tsx` in `src/renderer/src/` | `rendererSources()`, with subdirectories (B1, Ts, Sub) | Met |
| Decision: the ticket-number rule scans `docs/` but `.workings`, every root `.md`, `package.json` | the rule's list and walk (K1–K4, Pk) | Met |
| Kept by hand: `ALLOWED`, `EXEMPT`, `COMMON_LIBRARIES`, `BLOCK_CONTRACTS`, the side-count words, the swatch variables, the project column's states | unchanged in the gate (the diff touches none of their entries) | Met |
| 316::1 – 316::9 | the cases above, each red where it guards (`red-first*.txt`, `mutants.txt`) | Met |
| 316::10 | `pnpm check:ui` exit 0 on the repository (the gateways) | Met |

Scope beyond the issue's text, each traced to a decision or a finding: the README link check (D9, from the test design);
a member the reader cannot read reported (the code review's finding 2, within 316::9's "a source it cannot read");
the renderer's subdirectories read, by the colour and chip rules and `<TrendChart>`'s prop check (the code review's
finding 3, within D4's "every `.ts` and `.tsx`"); the provider colour rule renamed and the allow-list sentence fixed in
the gate and CONTEXT (findings 4 and 5). Not an ADR, no new term. Deviations: none.
