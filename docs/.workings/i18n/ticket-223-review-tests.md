# Review — tests (step 6), ticket aloong-planet/agentshed#223

- Date: 2026-10-12
- Version: branch `fix/gallery-shell-language`, commit c149802 (includes the step-5 review fix)
- Scope: the verification of the narrowed `mockupOnly` predicate in `scripts/check-lang.mjs`, and of the
  gallery shell copy. No test file is added or changed: `check-lang.mjs` scans the repository and exits
  when imported, so it has no unit seam, and building one would widen this ticket. The checks are the
  gate's own run against the real file set, five mutations, and a browser render of the gallery.
- Review path: see `ticket-223-review-code.md` (tracker ticket, `docs/.workings/i18n/`). Raw evidence is
  in `ticket-223-evidence/`.

## Dimension 1 — coverage

| Requirement (ticket #223) | Covered by | Input that reaches it |
|---|---|---|
| `check:lang` passes with the shell no longer exempt | green run after the copy | the real file set, shell included (`git ls-files --cached --others --exclude-standard`) |
| A Chinese string in the shell turns the gate red | red step before the copy; mutation M1 | the old shell's five lines; M1's Chinese button title |
| A Chinese string in a mockup page does not | mutation M2 | Chinese comment in `shell/prototype-app-shell.html` |
| Mockup pages and `manifest.js` stay exempt | mutations M2, M4 | Chinese comment in `manifest.js` |
| Only the shell is named, not files sharing its basename | mutation M3 | Chinese comment in the logic page `project-list/visibility/index.html` |
| The narrowing is what makes the shell red | mutation M5 | M1 again with the exclusion removed: green |
| The gallery still lists and opens every prototype | Playwright render, `file://`, Chrome | every one of the 16 manifest entries, plus the empty state and the folded state |

- Fixtures: none invented. Every gate run used the repository's real files, and the mutations edited real
  files in place.
- **Gaps:**
  - No regression test stays behind. If the exclusion were dropped later, the shell (now without Chinese)
    would not turn anything red until Chinese came back into it. Re-check condition: if `check-lang.mjs`
    ever exposes its rules to a test, add the shell, mockup and same-basename cases from the table above.
  - The render covered selection, iframe loading, both button titles, the empty text and folding by key.
    Arrow-key navigation and the cross-frame `proto-nav` message were not driven. The diff against the old
    shell shows those code paths unchanged apart from comments.

## Dimension 2 — case design

- Each mutation was applied to one file from a backup copy, confirmed present in the file before the gate
  ran, and restored by copying the backup back (`cmp` confirmed the restore). No `git checkout` was used,
  so the uncommitted change was never at risk. The script is `ticket-223-evidence/mutate.sh`.
- The gate is run as a whole, the same way `pnpm verify` and CI run it, rather than one predicate in
  isolation. A red therefore names the file, the line and the rule.
- No mocks and no hand-built state: the render loads the real shell and the real manifest.

## Dimension 3 — false greens

- **The first red has the right cause.** It came from the shell's own Chinese lines (lines 4, 51, 54, 55 and
  83, no other file), which is the failure this change exists to report. It did not come from a syntax
  error or a missing file.
- **Mutation triad:**
  - Reach: each marker was checked in the mutated file before the run. The green runs M2–M5 report 2374
    permitted lines against 2373 at baseline, so the gate read the mutated line and permitted it. It did
    not skip the file.
  - Attribution: M1's only problem is `docs/prototypes/index.html:49`, the mutated line.
  - Restore: by copy from backup, confirmed by `cmp`. The final run is back at 2373 and exit 0.
- **The render check asserts effects, not presence.** For each entry the target file exists on disk, the
  iframe with that `src` finishes loading, its document has text, and the sidebar item is selected. The
  strings are read from the DOM, not from the source. The check itself was not mutation-tested; it is
  one-off evidence, not a gate.
- A full `pnpm verify` exited 0 during this review: typecheck, lint, 750 unit tests (1 skipped), 6 script
  tests, `check:ui`, `check:lang`, `check:i18n`, `check:nul` (8 tests and the scan), 93 e2e tests and smoke.
  It started before the step-5 fix, which reworded the comment and moved the constant above the doc block,
  so `lint`, `check:lang` and `check:nul` were run again on the staged commit (all exit 0, still 2373
  permitted lines); those three also read the newly tracked records and evidence. The full gateway runs
  again on the pull request's final commit, and its result is in the pull request description.
