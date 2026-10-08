# Review — code (step 5), lint adoption

Date: 2026-10-08 · Scope: the whole lint adoption change on `feat/lint` (ESLint config and scripts, class A
fixes, the five `react-hooks/exhaustive-deps` resolutions, wiring into verify / CI / `capabilities.toml`,
two spec boundary entries). No standalone spec by decision; the requirements are the alignment recorded
in the session and the two spec entries (skills-view A11, plugins-view H10).

## ① Underlying premises — no finding

Every causal comment written in this change was checked against the code or a measurement:

- `react-hooks` ships `exhaustive-deps` as a warning — measured on the trial run (5 warnings, exit 0
  without `--max-warnings`).
- `src/shared/` is in both tsconfigs and `projectService` resolves it — the trial run had zero parse errors.
- `useAnchorInvalidation`'s `layer` is stable — all five call sites pass a `useRef` object.
- `queryClient` is stable — created once at module scope in the renderer entry (ADR-0028), so the App
  startup effect never re-runs on its account.
- The e2e `import type {} from '…/env'` is load-bearing — removing it from both specs fails `tsc` with
  `Property 'agentshed' does not exist on type 'Window'`; removing it from one spec alone does not fail,
  because a global augmentation is program-wide (the first mutation hit nothing; recorded so nobody
  repeats it as proof).
- Two framework-constraint comments were corrected before landing: the triple-slash exemption was not a
  constraint at all (the declaration is an importable module), so the rule stays on and the code was
  fixed; the CommonJS hook comment now states the verified constraint (`"type": "module"` forces `.cjs`)
  instead of an unverified claim about how electron-builder loads hooks.

## ② Runnability — no finding

- App startup effect, deps `[queryClient]`: enters once at mount; re-entry paths none (stable client).
- `useAnchorInvalidation`, deps `[active, layer]`: same entry/exit as before (`layer` never changes).
- `LanguageSelect` key/click listeners, deps `[open, pick]`: enter on open; while open, re-register when
  `pick` changes, i.e. when `pref` or the parent's `onChange` identity changes (the parent passes an inline
  arrow, so on every parent render). Each re-run only removes and re-adds two listeners; the cursor lives in
  a ref, so no state is lost. Exit on close as before.
- The two toast effects are unchanged in behaviour (inline disable + reason).
- Gate failure paths measured (direct exit codes, no pipe): an error (`no-floating-promises`) → 1; a
  warning (`exhaustive-deps`) → 1 with "too many warnings (maximum: 0)"; a `.ts` file outside every
  tsconfig → 1 ("not found by the project service"); probes removed → 0.

## ③ Security — no finding

No runtime input surface changed. Five dev dependencies added (`eslint`, `@eslint/js`, `typescript-eslint`,
`eslint-plugin-react-hooks`, `globals`), all at their latest published versions on 2026-10-07.

## ④ Consistency — one class-level finding, fixed

- **Leftover parentheses from the auto-fix** (class-level: "an auto-fix that removes `as T` leaves the
  parentheses that wrapped it"). Enumerated every `+` line of the diff with a regex for a parenthesised
  lone element access / identifier: 22 matches. 20 were the leftover parentheses — removed. 2 were the
  argument parentheses of `Date.parse(…)` — correct as written.
- The CI job's name ("typecheck + unit tests + shared-piece consistency") is deliberately unchanged even
  though it now runs lint: the branch ruleset requires that check by name.
- Smell baseline on the touched code: no hit (the `useCallback` in LanguageSelect is the minimal form).

## Refactor list

None raised by this change. The deferred rule findings are tracked as issues #190–#198.
