# Ticket #296 — task list

The language gate recognises the prototype skill's copies by a hand-kept list, which an asset the skill adds or
renames never updates. Working record, not a requirement authority: the requirement source is #296's body, with the
owner's decisions of 2026-10-27 and the acceptance criteria 296::1–296::5 added to it that day (no spec), in the work
directory `prototype-baseline`, where the gate tickets without a spec keep their records; coverage units in
[checklist.md](checklist.md) (sixth round). The gate's previous change, #223, has its records in
`../i18n/ticket-223-*.md`. Branch `fix/check-lang-copy-marker`, in its own worktree, cut from `origin/main` at e4c9589
(no commits ahead when cut).

## Facts found before the work (2026-10-27, on e4c9589)

- `scripts/check-lang.mjs:134` `SKILL_TOOLING` names four files. Its only use is `mockupOnly` (`:154`), which exempts
  every `.html`, `.mmd`, `.css` and `.js` file under `docs/prototypes/` unless the list names it. `sync-mmd.mjs` is
  checked by its type (`.mjs`), as the comment at `:131` says.
- Under `docs/prototypes/` the marker `copied from the prototype skill's template` is in four files, the four the
  list names (`rg -l -uu -F`; control: `Demo harness dock` found in `demo-harness.js`): `index.html` on line 2, after
  `<!doctype html>`, and `app-identity.js`, `demo-dimensions.js` and `demo-harness.js` on line 1. Each is byte-equal
  to the skill's file at skillshed 3db94ce.
- `docs/prototypes/sync-mmd.mjs` equals the skill's file before skillshed#25; the skill's current file differs from
  it in the header only.
- `scripts/check-lang.test.mjs` names the four copies in a loop, one case each (a file whose second line is a Chinese
  comment), checks `sync-mmd.mjs` by its type, and keeps four permitted cases: a mockup page, a logic page named
  `index.html`, `manifest.js` and `dimensions.js`. Its header names the gap this ticket closes.
- The marked files hold no Chinese, so recognising them by the marker instead of the list changes no result on main.

## Tasks

| # | Task | Check | Status |
|---|---|---|---|
| 1 | Test design review (`/review-tests`) | `ticket-296-review-tests.md`, design review | Done — no finding |
| 2 | Re-copy `docs/prototypes/sync-mmd.mjs` from the skill (296::4) | `cmp` with the skill's file | Done in 446bad8 — `evidence/ticket-296/copy-check.txt` |
| 3 | The gate recognises a copy by the marker in its first comment; `SKILL_TOOLING` goes; the comments follow (296::1–296::3) | the test's cases; a search of the gate for the list and the copies' names | Done in 446bad8 — `no-list.txt` |
| 4 | The test: copies by shape, a new copy, the boundary page, the header's gap line (296::1, 296::2) | the new copy's case red first on e4c9589's gate | Done in 446bad8 — `red-first.txt`, `base-run.txt` |
| 5 | Targeted verification | lint, typecheck, `check:lang`, `check:ui`, the sync script; the search for tests that read the changed files | Done — `TARGETED_EXIT=0` (`targeted.txt`; the search in `targeted-search.txt`) |
| 6 | Checklist sign-off, sixth round | `checklist.md` | Done — 296::1–296::5 verified at 446bad8, each by its tier; the gateway's rows follow task 8 |
| 7 | Code review (`/review-code`) | `ticket-296-review-code.md` | Pending |
| 8 | Gateway, the run before the test check | log under `evidence/ticket-296/` | Pending |
| 9 | Post-implementation test check (`/review-tests`, independent subagent) | `ticket-296-review-tests.md` | Pending |
| 10 | Spec check (no spec: against #296's body) and step 7 archive | this file, `checklist.md` | Pending |
| 11 | Step 8 (`/features-catalog`) | `final-regression.md`, #296 section | Pending |
| 12 | Full gateway and delivery | log; PR | Pending |
