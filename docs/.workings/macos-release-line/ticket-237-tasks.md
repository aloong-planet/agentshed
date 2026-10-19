# Ticket #237 — task list

The landing page in Chinese and English. Working record, not a requirement authority (the specs are
`docs/specs/landing-page.md` and `docs/specs/mac-distribution.md`). Checkpoints are what proves each step
done. Branch `feat/landing-page`, cut from `origin/main` at 26b9216 (no commits ahead when cut).

## UI admission check (step 4.0)

Every interface point of this ticket, and where it is confirmed:

| Interface point | Confirmed in | Note |
|---|---|---|
| Header: brand, navigation (hidden below 760px), language toggle at the right, sticky | landing prototype, confirmed 2026-10-13 | The toggle becomes two links to the two pages (landing-page Failure B1); same look |
| Hero in the list state: icon, title, paragraph, button, platform line, whole-window screenshot | landing prototype; the list state confirmed 2026-10-13 | The icon is the transparent production artwork (`build/icon.png`), not the prototype's preview with its painted checkerboard |
| Features section: title, subtitle, four steps, sticky frame, accent bar, hover, focus ring, cross-fade, stacked below 760px | landing prototype | — |
| Install section: three step cards | landing prototype | — |
| Download section in the list state: line, card, one button | landing prototype; the list state confirmed 2026-10-13 | — |
| Footer: GitHub, Releases, copyright | landing prototype | — |
| The palette, light and dark by the system appearance | landing prototype; landing-page::REQ-006 | Values are the app's (`theme.css`, purple). The prototype's dark `--warn-*` differs from the app's; the warn colours are used only by #238's test state |
| Browser-tab icon | The owner's answer of 2026-10-18 (this session): the app icon | Not in the prototype (its tab icon is gallery scaffolding) |
| Browser-tab title and the page description | Exception: plain copy, declared | "Agentshed — <hero title>" per language; the description is the hero paragraph |
| Hero icon's shadow (found while rendering: the real icon's transparent margin showed as a tile under the box shadow) | The revised landing prototype, confirmed by the owner on 2026-10-18 | The owner chose a shadow on the icon's outline (option B); the prototype was revised first, then implemented |

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Scaffold `site/`: Astro 7 with Chinese at `/` and English at `/en`, its own lockfile | `pnpm install --frozen-lockfile` in `site/`; `astro build` | done: Astro 7.4.0, own lockfile; builds two pages |
| 2 | Test design review (`/review-tests` design review), before the first test | `ticket-237-review-tests.md` design section | done: design review recorded before the first test; one increment (B10 → U3) re-reviewed |
| 3 | The dictionary and the list state's download view, test first | unit tests red then green | done: U2 red first then green; U1 proven by mutation |
| 4 | Layout and sections: header, hero, features, install, download, footer; palette; icon module; assets | built pages; rendered screenshots | done: built pages match the prototype's section heights in the list state to 0.01px; screenshots viewed |
| 5 | The built-site check, run against a fresh build | `pnpm --dir site test` | done: 25 cases; red first where written first, the rest proven by 29 mutations |
| 6 | The features section's script and the language switch keeping the step and scroll | browser measurement | done: measured; the first and last steps' offset found and settled by the owner (AC-04 amended) |
| 7 | Root wiring: `pnpm verify`, CI, the working-language gate, lint over `site/` | `pnpm verify` exit 0 | done: `test:site` in `pnpm verify` and in CI's required checks job; two working-language rules, proven both ways; lint covers the site's TypeScript (needs the site's packages: shown) |
| 8 | Browser measurement record (REQ-004, QR-001 list state, REQ-006 and D1, B1, B2, US-001/AC-01, US-003/AC-01) | `evidence/ticket-237/` | done: 216 measurements passing (`evidence/ticket-237/`) |
| 9 | Full verification gateway | `pnpm verify` exit 0 | done: `pnpm verify` exit 0 (re-run after the last edits before committing) |
| 10 | Ticket checklist check (step 4.7) | each item's evidence | done: see the ticket checklist row in `checklist.md` Current verification |
| 11 | Step 5: `/review-code` | `ticket-237-review-code.md` | done: `ticket-237-review-code.md`; four comment findings fixed, one refactoring item and four outside findings for the owner |
| 12 | Step 6: `/review-tests` after implementation | `ticket-237-review-tests.md` post-implementation section | done: `ticket-237-review-tests.md`; three more mutations (M26–M29); one build per run measured |
| 13 | Spec final check and step 7 (spec write-back, ADR, CONTEXT, site README) | spec and records | done: spec written back (AC-04; the app icon, the tab, the language toggle; the palette test; the prototype-gate note); no ADR, no CONTEXT term, no postmortem |
| 14 | Step 8 decision; document sync; PR; the CI job shown able to fail; stop for the owner | PR link; CI runs | done: step 8 skipped by its two questions (nothing in `docs/features/` describes the landing page, and its entry is written when the page goes live); PR #255, CI green; the checks job shown able to fail on #256 (`evidence/ticket-237/ci-gate.txt`); the outside findings placed (#238, #234, `capabilities.toml`); merged to main as 1b58a84 on the owner's word (2026-10-19) |
