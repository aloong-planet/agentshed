# Code review — #314

Ticket: [#314](https://github.com/aloong-planet/agentshed/issues/314) · work directory `prototype-baseline` ·
requirement source: #314's body as rewritten on 2026-10-26, no spec. Task list: [ticket-314-tasks.md](ticket-314-tasks.md).

## Layered review (2026-10-26, implementation b23997e plus the fix below; range a40c926..b23997e)

Scope: `scripts/check-shared-ui.mjs` (blocks derived from `_shared/`, `COMMON_LIBRARIES`, `BLOCK_CONTRACTS`, the
per-element chart rule, the unknown-declaration rule, the hand-kept lists' check, the per-block output lines), its
test `scripts/check-shared-ui.test.mjs`, and the two pages' declarations.

**① Underlying premises — no finding.**
- The file-name convention the derivation rests on, re-checked on b23997e: the gate run lists ten blocks, the eight
  former entries with the same assets plus totals-card and md-preview (`evidence/ticket-314/green.txt`); the prototype
  skill's UI.md places a shared block at `_shared/<block name>.{css,js}`.
- The registry's two comments and its labels, deleted with it: each block's own file opens with what the block is
  (all eight blocks' headers read); the session-hits comment (one piece for both searches) stands in
  `session-hits.css:1–3`, the app-window comment (root styles on the box, the candidates page reuses them) in
  `app-window.css:1–7`. Nothing is lost.
- New comments that state a cause, each confirmed: the chart rule reads text "rather than through JSDOM, so a chart
  written in a script template is judged as well" — JSDOM over a page with one chart in markup and one in a script
  string finds only the first (`node -e`, 2026-10-26: `JSDOM .chart ids: a`); M3 shows the rule judging the second. The
  lists' check: "a stale entry would silently exempt a future file, or silently drop a block's checks" — the second is
  `contracts-empty.txt` (the table emptied, D, T1 and T2 red, nothing else reports it); the first follows from
  `sharedBlocks` skipping any listed name.

**② Runnability — one finding (1), fixed.**
- `sharedBlocks`: files whose names do not end in `.css` or `.js` are skipped; a missing `_shared/` yields no blocks,
  so every declaration reports as unknown and every library as missing — loud, not silent. Each block's assets come
  sorted (css before js); `BLOCK_CONTRACTS[id]` spread over the default `containers: []` overrides it for trend-chart.
- `OPEN_TAG`: an attribute name cannot be split without whitespace and a bare value runs to the next whitespace, so a
  failed match backtracks at most once over each attribute — linear per `<`. Measured, interleaved under one load:
  the gate on a40c926 1.47–1.48 s, on b23997e 1.57–1.61 s.
- The chart rule matches `class` and `data-shared-block` in double quotes, as the old rule and `checkBlock` do; no
  prototype page writes `class='…'` (`grep -rhoE "class='[^']*'" docs/prototypes --include='*.html' | wc -l`: 0). An
  empty `data-shared-block=""` is no declaration for the chart rule and an unknown block for the declaration rule.
- **Finding 1 (escape: upper — it writes the repository).** The test's plants became keyed by their path from the
  tree's root, so a plant or a `FILES` entry can name a path the tree links rather than copies (`docs/adr/…`,
  `package.json`), and the harness would write, create or delete the repository's file through the link.
  No plant does so today. Class-level: the only test that links repository parts into a temporary tree
  (`rg -n 'symlinkSync|\.symlink\(|ln -s' --glob '*.test.*' --glob '*.spec.*' scripts build src e2e site/test`: the
  other 13 calls, in 7 files, link temporary paths to temporary paths as fixtures of the app's symlink handling).
  Fixed: `assertInCopy` refuses any plant or file change whose path does not resolve inside the tree (the file, or its
  directory for a new file). Shown failing first: a probe — the test with one `FILES` entry under `docs/adr/`, in a
  scratch tree whose `docs/adr/` is a scratch directory — lands its file there through the link with all 23 cases
  green (`harness-probe-before.txt`); with the guard, the run stops at that path and nothing lands
  (`harness-probe-after.txt`). The 23 cases pass with the guard (`green-2.txt`).
- **What went wrong while showing it.** The first probe tree linked `docs/prototypes/` and `src/` directly; the
  harness's `cpSync` copied those links as links, so all 15 plants of that run were written into this worktree's
  pages, shared files and `DetailPane.tsx` (one file deleted, two added). The guard, run next, refused exactly that
  linked copy, which is how it was found. Before restoring, each affected path was compared with HEAD's content plus
  its plant (a script built from the test's own `PLANTS` and `FILES`): all fifteen equal, no other change in the tree
  but the guard. Restored byte for byte from HEAD; the tree then held only the guard. The probes were then rerun on
  real copies of `docs/prototypes/` and `src/`, the worktree checked clean after each; the evidence files are those
  reruns. The main checkout was not involved and no dev instance was running.

**③ Security — no finding beyond 1.** The gate reads repository files and writes nothing; its inputs are the
repository's own pages and sheets. Pattern cost: above (linear). The test now writes only inside its temporary
tree's copies (finding 1).

**④ Consistency — no finding.**
- Invariants this change could break: the per-block output lines lose their labels — nothing reads them (a search of
  the worktree's `.mjs`, `.js`, `.ts`, `.yml`, `.md` and `.json` files outside `node_modules` for the labels, the old
  rule name and "usage site(s) compliant": the gate itself and one shared file's own header only). `checkBlock` is unchanged: its messages, which
  the test and #270's cases assert, stay as they were. The header's other paragraphs still hold.
- Smells, on the code this change brings: duplicated `_shared/` listing (`sharedBlocks` and the lists' check each read
  the directory) — two small reads in one script run; kept, the check reads the files independently of the
  derivation it audits. No other entry of the list applies.
- Outside this change, recorded only: the gate's other hand-kept name lists — the copy rule's `ALLOWED` dictionary
  keys and the rail rule's `EXEMPT` keys — are not checked against the dictionaries, so an entry for a removed key
  would exempt a future key of the same name. Impact: one copy check skipped for that future key. Recommendation: no
  change — both lists name long-standing keys, and a stale entry needs a later key reusing the exact name to bite.
  Reported to the owner with the delivery; no persistent home unless the owner wants a ticket.

Refactor list: none.

Self-check before handing finding 1's fix over (2026-10-26), item 1: the guard is a set-up assertion in the test; the
gate is unchanged. The order slip: the guard was written before the test design table recorded it; the increment is
recorded in `ticket-314-review-tests.md` and reviewed there.

Self-check before handing over the post-implementation check's fixes (2026-10-26), item 1: no product code changed;
the gate is unchanged (`green-3.txt` records it equal to HEAD's), the fixes are test cases only.
