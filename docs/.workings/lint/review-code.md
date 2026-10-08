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

---

# Review — code (step 5), clearing the deferred findings #190–#198 (2026-10-08)

Scope: every commit on the branch (`origin/main..HEAD`), 27 files, read in full as one diff.

## ① Underlying premises — one wrong premise, corrected before commit

- **scan() callers.** "Both callers await it" — enumerated every `scan(` call: `src/main/index.ts`
  (inside the scan IIFE's `try`) and `scripts/bench-scan.entry.ts`, plus tests, all `await`. A
  synchronous throw from the now non-async function is caught the same way. Holds.
- **inputText's catch was unreachable.** Its values all come from `JSON.parse` in
  `turnBlocksFromText`: the assemblers are module-private and that function is their only caller
  (grep of `Assemble(`). A parsed value always serialises again. Holds; the proof is in the commit body.
- **Wrong premise found and corrected: "SkillFileDrawer flashes the old mode for one frame."** Stated
  while planning; checked before committing: when the new file is not markdown, `canPreview` is false
  and the stale mode is never shown, and the only in-drawer switch happens from preview mode. The
  commit message describes the change as having no visible effect.
- New comments state only checked causes (scan, inputText, SessionPane, SkillFileDrawer, labelOf,
  received, the prefs seam).

## ② Runnability — no finding

- Latest-value refs now written in `useLayoutEffect` with no dependency list: their readers (keydown
  and capture listeners, the getPrefs callback) run only after a commit, so they read the committed
  values. Each site is pinned by an e2e proven to fail when the write is removed (see review-tests).
  The handler in App that writes `prefsRef` directly on a span change keeps working: the next commit
  writes the same value.
- Render-time resets (SessionPane focus, SkillFileDrawer mode) converge in one extra render: the
  tracking state is set to the new prop, so the condition is false on the re-render.
- getPrefs became an async handler; `ipcMain.handle` accepts either. The window-creation read used for
  launch arguments calls `prefsHandlers.getPrefs()` directly and is not delayed.
- `received()` cannot throw: a value without JSON (undefined, symbol) or one that throws (bigint, a
  cycle) falls back to String. Escape surface of every new path: self-harm (one message, one label).

## ③ Security — no finding

Enum failures and unknown-trace labels can now carry a value's JSON, which can be longer than
`[object Object]`. The values come from our own main process (contract checks) or the user's own
transcript files (labels); nothing crosses a trust boundary. Length is noted in the refactor list.

## ④ Consistency — one class-level finding, fixed

- **"An unknown value turned into a shown string with String() renders an object as [object
  Object]."** Lint named one site in validate.ts and one Grok label. Enumerated all 40 `String(` calls
  in production source:
  - 17 `failEnum` calls (validate.ts) — same class, fixed by formatting inside `failEnum`.
  - 5 type labels in turn-content.ts (Claude top level; Codex top level, event_msg, item_completed,
    response_item) — same class, not flagged because their type is `unknown`; fixed with `labelOf`,
    shared with the Grok method label; red first.
  - `token-stats.ts:222` (a developer-only error message) and `error-text.ts:38` (the last-resort
    fallback for non-protocol throws) — same class, not fixed: outside the touched files, and neither
    reaches a user in a way the fix would change (see "Outside this change").
  - The rest are numbers, buffers, membership checks or caught errors (`String(err)` of an Error).
- The two remaining `react-hooks/exhaustive-deps` disables (PluginSkillList, SkillExpandBlock) are
  intentional and carry their reason, as the adoption playbook requires.
- The new test seam follows the existing family (`rescanIntervalMs`, 0 in production, documented next
  to SCAN_DELAY_MS / FETCH_DELAY_MS).
- Smell baseline on touched code: the layout-effect "latest value" pattern now appears three times
  (Duplicated Code) — see the refactor list.

## Refactor list (for the user's decision)

| Item | Reason | Escape surface | Suggested |
|---|---|---|---|
| Extract a `useLatest(value)` hook for the three layout-effect ref mirrors | Duplicated Code, three short copies | none (style) | not now: three 3-line copies read more directly than one more hook |
| Cap the length of `failure.value` / unknown labels | an object's JSON can be long | self-harm (one message) | not now: values are produced locally; no long one observed |

## Outside this change (reported, not fixed)

- **The skill file table shows the raw, untranslated error.** `PluginSkillList.tsx:43` and
  `SkillExpandBlock.tsx:75` pass `String(listResult.error)` to the table, which renders it verbatim,
  while the toast for the same failure goes through `errorText`. Visible when listing a skill's files
  fails. Needs the user's call on where it lives.
