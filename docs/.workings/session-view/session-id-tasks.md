# Session ID and resume — tasks (2026-10-28)

Direct implementation of the spec, no tickets: session-view::US-001 (AC-01 to AC-10), session-view::CON-001,
session-view::CON-002, session-view::CON-003, against spec commit a443fb3 on branch feat/session-resume (base
03ff1a2, verified as origin/main on 2026-10-28). This file is the working tasklist; the spec, CONTEXT and the
prototype are the authority.

## Success criteria (one per coverage unit, each with how it is checked)

| Unit | Criterion | Checked by |
|---|---|---|
| US-001/AC-01 | The page's meta line ends with the label and the ID; Claude = file name stem, Codex = session-metadata id, Grok = session directory name | e2e (per side) + providers unit |
| US-001/AC-02 | Three buttons in order at the title row's right end; tooltip on hover and focus, gone on leave | e2e |
| US-001/AC-03 | Copy ID writes exactly the ID | e2e, the main process's clipboard write intercepted |
| US-001/AC-04 | Copy resume writes `cd <dir> && <side's resume> <id>` | e2e (three sides) + unit (builder) |
| US-001/AC-05 | The resume tooltip shows the whole command | e2e |
| US-001/AC-06 | A copy shows the check and "Copied" for 1.5 s; a second copy restarts it | e2e |
| US-001/AC-07 | Show in Finder hands Finder the session's source path | e2e, Finder's call intercepted |
| US-001/AC-08 | A stale project's resume tooltip warns about the cd, on the global search route and the fork parent from it | e2e |
| US-001/AC-09 | No ID: "Session ID unavailable", two buttons disabled with the reason, clicks do nothing, Finder still works | e2e (Codex fixture without id) + restore unit |
| US-001/AC-10 | A vanished file on Finder and a refused clipboard show the error toast, nothing else changes | e2e (file deleted) + unit/e2e for the clipboard refusal |
| CON-001 | Only clipboard and Finder; bare tool names; no locating | review + the builder's unit test |
| CON-002 | Directory always single-quoted with `'\''`; ID bare only when [A-Za-z0-9._-] | unit |
| CON-003 | A saved page without the field restores: Claude/Grok ID from the path, Codex null | unit with the previous version's shape from a real saved cache |
| R1 (regression) | The reveal channel admits only allow-listed paths, judged first | unit (pure judge) |
| R3 (regression) | The contract admits a non-empty string or null for the ID, nothing else | unit |
| P, REQ-001 (regression) | Existing session-page e2e and restore cases stay green | full verification |

## Tasks

- [x] T1 Test design review (/review-tests, design review) — before the first test
- [x] T2 Slice: the session ID on the page payload (engine, page handler, contract, restore upgrade)
- [x] T3 Slice: the resume command builder and its quoting (shared, pure)
- [x] T4 Slice: the show-in-Finder channel (main judge + handler, preload, error wording)
- [x] T5 Slice: the header — ID in the meta line, three buttons, tooltip, copy feedback, stale and no-ID forms, toasts; the shell passes the project directory and stale flag on every route
- [x] T6 Targeted verification (typecheck, the slices' tests, lint, the tests importing changed modules)
- [ ] T7 Step 5: /review-code
- [ ] T8 Full verification gate, pre-review run
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
