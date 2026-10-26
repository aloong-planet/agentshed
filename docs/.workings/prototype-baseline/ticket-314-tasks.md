# Ticket #314 — task list

`check:ui` judges a page's charts against all its declarations, and knows only the blocks in its registry. Working
record, not a requirement authority: the requirement source is #314's body as rewritten on 2026-10-26 with the owner's
decisions (no spec; no comments), in the work directory `prototype-baseline`, where the prototype tickets without a
spec keep their records; coverage units `314::*` in [checklist.md](checklist.md). Branch `fix/check-ui-block-contracts`,
in its own worktree, cut from `origin/main` at a40c926 (no commits ahead when cut).

## Facts found before deciding (2026-10-26, on a40c926)

- The chart rule (`scripts/check-shared-ui.mjs:541–555`) counts `class="…chart…"` and every `data-shared-block="…"`
  in the raw page, and fails only when the declarations are fewer than the charts. The prototypes hold three chart
  containers, all in markup: `#chart` and `#skChart` on the Agents page (`prototype-agents.html:226`, `:336`), `#ovchart`
  on the project detail page (`prototype-detail.html:259`). `#skChart` has no declaration; its page has eleven.
- `#skChart` is the token trend chart's loading skeleton. It sits in the page's skeleton root (`.sk-page`), whose
  totals card declares `totals-card` and whose scanning hint declares `startup-status` (`:319–320`). The page's script
  draws its gray bars as the container's children and sets `data-trend-span` on it (`:821–823`), so it takes the trend
  chart's container rules (`_shared/trend-chart.css:6`, `:36–37`). The app's skeleton does the same: a `chart` element
  with `data-trend-span` and placeholder bars (`src/renderer/src/StartupSkeleton.tsx:198`), not a `<TrendChart>`.
- Nothing selects on `data-shared-block="trend-chart"` or `="md-preview"`: no rule in either page's styles, in
  `trend-chart.css`, `trend-chart.js` or `md-preview.css`; `md-preview.js` sets the attribute on its mount itself
  (`:172`). `trend-chart.js` draws into the ids its caller passes to `mount` (`:191–199`).
- The shared-block check iterates the registry `SHARED_BLOCKS` (`:31–95`, eight blocks). Pages declare ten ids:
  the eight, plus `totals-card` (twice on the Agents page, once on the detail page) and `md-preview` (once on each of
  four pages, in script templates). Neither string was ever in the gate (`git log --all -S"'totals-card'" -- scripts`
  and the same for `md-preview`: no output).
- `md-preview` is used on five pages; four declare it; the heading-ladder page references its two files and calls
  `MdPreview.mount` on `#drawer-mount` (`prototype-heading-ladder.html:172`, `:246`) with no declaration in its text.
  `md-preview.js`'s header says "A use site adds data-shared-block="md-preview" to its container" (`:12`).
- Deriving the contract from file names holds today: each registered block's `assets` equal the existing
  `_shared/<id>.css` and `_shared/<id>.js` (all eight); every declared id has such a file; the `_shared/` names no page
  declares are `copy`, `icons`, `startup-skeleton` and `theme` (linked by 6, 11, 1 and 13 pages). The prototype
  skill's UI.md already places a shared block at `docs/prototypes/_shared/<block name>.{css,js}`. No document in the
  repository describes the registry; the gate's header does.

## Decisions

| # | Decision | Answer and reason |
|---|---|---|
| D1 | How `#skChart` is settled | It declares `trend-chart`, being that block in its loading state (owner, 2026-10-26, the recommended answer): the precedent of the same skeleton's totals card, and it takes the trend chart's container rules |
| D2 | What a chart's declaration must name | A shared block (owner, recommended): a declaration naming no block is checked by nothing |
| D3 | The unlisted `totals-card` and `md-preview` | Fixed in this ticket (owner; the recommendation was a new ticket) |
| D4 | A general rule | Every declaration on a prototype page names a shared block (owner, recommended). With it, D2 holds for charts by that rule, and the chart rule asks only that each chart carry a declaration |
| D5 | Where a block's contract comes from | Its files (owner, recommended, after asking what the registry is for and whether it could be done without one): `_shared/<id>.css` and `_shared/<id>.js` are block `<id>`'s assets, apart from the common libraries. What names cannot give — trend-chart's mount points, style invariant and app component's required prop — stays in a table keyed by block id |
| D6 | md-preview's declaration | Static, on the page (owner, recommended): the heading-ladder page's `#drawer-mount` declares it, as the file header asks and four pages do; `#card-mount` only receives `MdPreview.render`'s HTML and is not the block's container |
| D7 | `startup-skeleton.css` | A common library (owner, recommended, asked on its own because the D5 option named the four libraries): placeholder primitives with no mount, linked by one page |
| D8 | How the chart rule reads a page | Every opening tag in the page's text without comments (`stripComments`), so a chart written in a script template is in view as the old rule's raw count had it; #314 suggested JSDOM, which sees markup only — the four md-preview declarations show such markup lives in scripts. A chart's class is matched by its token `chart` |
| D9 | The two hand-kept lists (common libraries, the block-specific table) | Each is checked against the files: a listed library with no file, and a table key that is no block, turn the gate red, since a stale entry would silently exempt or silently drop checks — the failure #314 is about |

The pages gain two attributes and render nothing differently (facts above): the interface gate's exception for a change
with no visible effect (`/to-spec`'s prototype gate) applies, so no prototype round precedes it.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Facts, decisions, #314's body rewritten with them | the issue body, this list | done: the body rewritten on 2026-10-26 |
| 2 | Records: the document sync checklist and the coverage checklist's fourth round | `ticket-314-doc-sync.md`, `checklist.md` | done |
| 3 | Test design review | `ticket-314-review-tests.md`, Design review | done: no finding |
| 4 | Slice: the new cases red on the unfixed gate; the gate and the two pages changed; all green | the red and green runs in `evidence/ticket-314/` | done: the nine new cases for missing behaviour red on a40c926's gate with the new pages, T1, T2, C and G0 green there (`red-first.txt`); all 23 green after, and the gate green on the pages (`green.txt`); the table emptied turns exactly D, T1 and T2 red (`contracts-empty.txt`); a renamed table key is reported (`contracts-stale-key.txt`) |
| 5 | Targeted verification | `evidence/ticket-314/targeted*.txt` | done: `targeted.txt`, `TARGETED_EXIT=0`, and the artifacts test the search found (it only names a prototype page in its own fixtures) |
| 6 | Code review | `ticket-314-review-code.md` | done: finding 1 (the harness could write the repository through its links), fixed by a guard; shown failing first on a scratch tree; the first attempt at showing it wrote the worktree, verified and restored (recorded there); targeted again, `targeted-2.txt` |
| 7 | Full gateway | `evidence/ticket-314/gateway-*.txt` | |
| 8 | Independent post-implementation test check | `ticket-314-review-tests.md` | |
| 9 | Source check, write-back, step 8 | `final-regression.md` | |
| 10 | PR; CI; stop for the owner | PR link | |
