# Session ID and resume — tasks (2026-10-28)

Direct implementation of the spec, no tickets: session-view::US-001 (AC-01 to AC-10), session-view::CON-001,
session-view::CON-002, session-view::CON-003, against spec commit a443fb3 on branch feat/session-resume (base
03ff1a2, verified as origin/main on 2026-10-28). This file is the working tasklist; the spec, CONTEXT and the
prototype are the authority.

## Success criteria (one per coverage unit, each with how it is checked)

| Unit | Criterion | Checked by |
|---|---|---|
| US-001/AC-01 | The page's meta line ends with the label and the ID; Claude = file name stem, Codex = session-metadata id, Grok = session directory name | e2e (per side; the line's end anchored) + providers unit |
| US-001/AC-02 | Three buttons in order at the title row's right end; tooltip on hover and focus, gone on leave | e2e (the tooltip within 500 ms) |
| US-001/AC-03 | Copy ID writes exactly the ID | e2e, the main process's clipboard write intercepted |
| US-001/AC-04 | Copy resume writes `cd <dir> && <side's resume> <id>` | e2e (three sides) + unit (builder) |
| US-001/AC-05 | The resume tooltip shows the whole command | e2e |
| US-001/AC-06 | A copy shows the check and "Copied" for 1.5 s; a second copy restarts it | e2e (the check glyph's own markup; the restart timed in the page; the check stays on its own page) |
| US-001/AC-07 | Show in Finder hands Finder the session's source path | e2e, Finder's call intercepted |
| US-001/AC-08 | A stale project's resume tooltip warns about the cd, on the global search route and the fork parent from it | e2e |
| US-001/AC-09 | No ID: "Session ID unavailable", two buttons disabled with the reason, clicks do nothing, Finder still works | e2e (Codex fixture without id) + restore unit |
| US-001/AC-10 | A vanished file on Finder and a refused clipboard show the error toast, nothing else changes | e2e (file deleted; clipboard refused, the button's class read once inside the 1.5 s) |
| CON-001 | Only clipboard and Finder; bare tool names; no locating | review + the builder's unit test |
| CON-002 | Directory always single-quoted with `'\''`; ID bare only when [A-Za-z0-9._-] | unit |
| CON-003 | A saved page without the field restores: Claude/Grok ID from the path, Codex null | unit with the previous version's shape from a real saved cache |
| R1 (regression) | The reveal channel admits only allow-listed paths, judged first; a restored entry only while it is a regular file | unit (pure judge) + e2e (the restart case's second launch, for the handler's restored state) |
| R3 (regression) | The contract admits a non-empty string or null for the ID, nothing else | unit |
| P, REQ-001 (regression) | Existing session-page e2e and restore cases stay green | full verification |

## Tasks

- [x] T1 Test design review (/review-tests, design review) — before the first test
- [x] T2 Slice: the session ID on the page payload (engine, page handler, contract, restore upgrade)
- [x] T3 Slice: the resume command builder and its quoting (shared, pure)
- [x] T4 Slice: the show-in-Finder channel (main judge + handler, preload, error wording)
- [x] T5 Slice: the header — ID in the meta line, three buttons, tooltip, copy feedback, stale and no-ID forms, toasts; the shell passes the project directory and stale flag on every route
- [x] T6 Targeted verification (typecheck, the slices' tests, lint, the tests importing changed modules)
- [x] T7 Step 5: /review-code
- [x] T8 Full verification gate, pre-review run — in two parts on 2026-10-28: lint, typecheck, the unit suite and
  e2e/app.spec.ts on 99d96c1 ([log](evidence/session-id/pre-review-run.log)); the rest of the verify set — test:scripts,
  test:site, check:ui, check:lang, check:i18n, check:nul, smoke — on 466d1c0, after the post-implementation check
  found them missing (its F6; [log](evidence/session-id/pre-review-run-rest.log)). All passed.
- [ ] T9 Step 6: /review-tests post-implementation check
- [ ] T10 Spec final check
- [ ] T11 Step 7: archive
- [ ] T12 Step 8: /features-catalog
- [ ] T13 Full verification, delivery (PR)

## Targeted verification (T6), 2026-10-28, on the working tree before the implementation commit

- typecheck: exit 0. lint: exit 0 after fixing two needless type assertions in the e2e case and an unused binding in
  validate.test.ts ([log](evidence/session-id/targeted-lint.log)); the first lint run also failed across `site/`
  because this worktree had not installed the site's own dependencies — after `pnpm --dir site install` those
  errors were gone, none of them came from this change.
- The tests touching the changed modules: retrieved with
  `rg -l --glob '*.test.ts' --glob '*.test.tsx' --glob '*.test.mjs' -e "from ['\"](\./|\.\./|@shared/)[^'\"]*(session-resume|token-stats|validate|domain|display-data|security|ipc|i18n|zh|en|SessionActions|SessionPane|App|icons|error-text)['\"]" src scripts`
  ([result](evidence/session-id/affected-tests.txt), a deliberate superset); the one dynamic import among tests
  (`plural.test.ts` importing `./index`, which loads both dictionaries) is in it. The whole unit suite was run as the
  superset of that list: 77 files, 897 tests passed, 1 skipped ([log](evidence/session-id/targeted-unit.log)); the
  validate tests again after the lint fix ([log](evidence/session-id/targeted-validate-after-lint-fix.log)).
- check:ui, check:i18n, check:lang: exit 0.
- e2e: the new case, built first, passed; passed again after the lint fix to its file
  ([log](evidence/session-id/targeted-e2e-e1.log)).
- Render evidence (ui-design §7), from the built app: screenshots in English light, Chinese dark, a stale project in
  English dark, a session with no ID, and the minimum window (800 × 520) in Chinese, with computed values — 22 × 22
  buttons in the theme's line, card and secondary text colours per appearance, the tooltip on the fixed dark tip
  ground, 440 px wide for a command, its stale line in #f0bd8c, the ID in the monospaced face at 10.5 px without
  wrapping ([values](evidence/session-id/render-computed.json), the render-*.png files beside it). Theme variables
  measured across every theme × appearance: --tip-warn resolves everywhere and changes along no dimension, grouped
  with --tip-bg and --tip-fg ([log](evidence/session-id/theme-vars.log)).

## The post-implementation check's fixes (2026-10-28) — self-check items 6 and 7

- Item 6, the evidence the fixes produced: the mutation script and its results, the two e2e runs of the changed cases
  ([E1](evidence/session-id/post-check-fix-e2e-e1.log), [restart](evidence/session-id/post-check-fix-e2e-restore.log)),
  each read for a value that can change (the failures land on the asserted values; the passing runs list the cases by
  name). Kept under evidence/session-id with names matching their contents. No finding.
- Item 7, the records the fixes touch: the test design table's increment and the design review's two corrected
  statements (review-tests.md); E1's gap note in the test file; the success criteria above and T8's description; the
  spec's testing decisions naming the restart seam. Checked against the tests as written. No finding.
- A slip worth recording: while applying F1, F2 and F4, a node `String.replace` with a replacement string that held
  `$\`` inserted the text before the match and duplicated e2e/app.spec.ts (+5650 lines, caught by the typecheck at
  once). The file had no other uncommitted change, so it was restored from 99d96c1 and the edits reapplied with a
  function replacer, which takes the replacement literally. The branch's committed diffs were checked for the same
  duplication by their line counts: none.
- The fixes' targeted verification, written as the gate requires: lint, typecheck, e2e/app.spec.ts and
  e2e/startup-restore.spec.ts in full (88 passed) and check:lang, on 466d1c0 with the fixes' six files listed by hash
  ([log](evidence/session-id/post-check-fix-targeted.log)). Whether another review is due:
  `node ~/.claude/skills/implement/change-scope.mjs --base 466d1c0`, exit 1, output:
  `inert` docs/.workings/session-view/review-code.md, review-tests.md, session-id-tasks.md and docs/specs/session-view.md;
  `changed` e2e/app.spec.ts (code changed) and e2e/startup-restore.spec.ts (code changed); "verdict: run (6 files differ
  from the base)". The tests changed, so the fixes are committed and handed to an incremental review.
