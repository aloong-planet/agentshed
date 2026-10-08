# Review — tests (step 6), lint adoption

Date: 2026-10-08 · Scope: the verification this change relies on — the new lint gate itself, the e2e edits,
and the two spec boundary entries. The change adds no unit tests: the code edits are behaviour-preserving
and covered by the existing unit and e2e suites; the gate's own behaviour is proved by mutation.

## Dimension 1 — coverage

- skills-view A11 / plugins-view H10 (no repeat toast on a language switch): **gap, declared in the spec**
  — the renderer has no component-level test seam and no e2e drives a list failure followed by a language
  switch. Condition to close: a component test seam in the renderer, or an e2e fixture that makes a skill
  package unreadable.
- The gate's requirements (an error fails; a warning fails; a TypeScript file outside every tsconfig
  fails; nothing lintable is silently skipped) are covered by the mutations and the coverage check below,
  not by an automated test. That is the right shape for a gate, but it means a later config edit can
  weaken it without anything going red — see the finding under dimension 3.

## Dimension 2 — case design

- e2e edits: `'[aria-pressed=\"true\"]'` → `'[aria-pressed="true"]'` (the same string value inside single
  quotes) and `querySelector(...) as HTMLElement | null` → `querySelector<HTMLElement>(...)` (the same type)
  — no assertion changed meaning.
- `import type {} from '…/env'` replaces the triple-slash reference: proved load-bearing by mutation
  (removing it from both specs fails `tsc`; see review-code ①).
- Implementation-coupling red flags: none introduced.

## Dimension 3 — false greens (false-greens.md forms applied to the gate)

- Form 4 (a new gate that never went red): three mutations, each a new probe file, each with an
  expectation written before the run and the error attributed to the probe's own file and line —
  `no-floating-promises` at 2:3 → exit 1; `react-hooks/exhaustive-deps` at 6:6 plus "too many warnings
  (maximum: 0)" → exit 1; "not found by the project service" for the out-of-tsconfig file → exit 1. Restore
  was by deleting the probe files, not by a version-control checkout; the clean re-run exits 0.
- Form 6 (the verifying command itself wrong): exit codes were taken from `pnpm lint` directly, never
  after a pipe.
- Form 9 (the tool ran but the object was out of scope): the tracked file list was compared with the
  files ESLint reported — 190 lintable files outside `docs/`, 190 linted, 0 missing, 0 extra; `docs/` (16
  files) is skipped by design.
- CI: the new `pnpm lint` step has not run in CI (Actions is blocked by billing on this account). Gap;
  closes on the first CI run after billing is restored.
- **Finding (form 7, over-wide exemption) — open, for the user's decision.** The nine deferred rules are
  turned off at rule level in the config, so until #190–#198 are fixed a *new* violation of any of them
  anywhere is invisible: the exemption covers code that does not exist yet. Options: keep rule-level offs;
  switch to per-line `eslint-disable-next-line <rule> -- see #N` on the existing sites only, keeping the
  rules on for new code; or ESLint's bulk-suppressions file, which records counts per file and rule and so
  is blind to a replacement (one legitimate site removed, one violation added, same count).
  **Resolved (user decision, 2026-10-08): per-line directives.** The nine rules are back on; 59 inline
  `eslint-disable-next-line <rules> -- see #N` comments cover the 64 existing findings (some lines carry
  two rules). Both properties the choice depends on were measured with probe files: a new violation of a
  deferred rule (`require-await`) → exit 1; a directive that matches no violation → "Unused
  eslint-disable directive", a warning, exit 1 under `--max-warnings 0`. The nine issues were updated to
  the new mechanism and say to locate sites with `git grep "see #N"`, since inserting the comments moved
  the original line numbers.

---

# Review — tests (step 6), clearing the deferred findings #190–#198 (2026-10-08)

Cases added or rewritten on the branch, listed in full:

| # | Case | Kind | Why it was red first |
|---|---|---|---|
| T1 | validate: an invalid enum value is reported as received | new | `[object Object]` for the object and array values |
| T2 | turn-content: a Grok record without an update is named by its method | new | `[object Object]` for an object method |
| T3 | turn-content: a Claude non-string type is named by its JSON | new | `[object Object]` |
| T4 | turn-content: a Codex non-string type at every level | new | `[object Object]` at top level and item_completed |
| T5 | e2e: a theme chosen while the initial preference read is in flight survives it | new | green on the original code; red under mutation M2 (prefs mirror removed), failing at the `data-theme` assertion after the read lands |
| — | 14 async test doubles → `Promise.resolve` / `Promise.reject` | rewritten | n/a — same semantics; rejecting doubles stay rejections |
| — | 25 any sites typed (casts, `Map`, `Array.from`) | rewritten | n/a — types only; every assertion unchanged |

## Dimension 1 — coverage: two gaps, recorded

- Issue acceptance "every site whose fix changes runtime behaviour has a test": validate (T1), Grok
  method label (T2), type labels (T3, T4). inputText's removed catch and scan's lost `async` change no
  reachable behaviour (see review-code ①/②).
- The ticket for #197 asked for the behaviour around each ref to be pinned before the change. Each was
  checked by mutation on the original code, rebuilt, restored by copying back a backup:
  - M1 LanguageSelect cursor mirror removed → red: "the language selector by keyboard…" (existing).
  - M2 App prefs mirror removed → every existing e2e green, so T5 and the `AGENTSHED_PREFS_DELAY_MS`
    seam were added; red under M2.
  - M3 useAnchorInvalidation handler mirror removed → red: "the install-to popover sits next to its
    button…" (existing); the same test passed twice on the unmutated build, so the red belongs to M3.
- #198's two resets (SessionPane focus, SkillFileDrawer mode): M4 and M5 left every e2e green. Both are
  unreachable through the UI in a way that differs from a fresh mount (enumeration in review-code).
  Recorded as gaps in the e2e/app.spec.ts header with the condition that retires each. An attempted
  e2e for M4 was dropped: it timed out because the hit list is not on screen once a session is open,
  which is exactly why the path is unreachable.
- Fixtures: T2–T4 records are deliberately malformed (a non-string `type` / `method` never seen in
  real transcripts); they guard a defensive branch, so a real-sample shape does not apply. T5 uses the
  suite's existing real-shaped Claude fixture.

## Dimension 2 — case design: no finding

No `vi.mock` / `vi.spyOn` added. T5 drives the public UI and asserts through the DOM; its only
non-public input is the env seam, which is the suite's existing mechanism. T1–T4 go through the
public validators and `turnBlocksFromText`.

## Dimension 3 — false greens: one timing risk, addressed

- T5 relies on acting before a delayed read lands. Its first assertion (the language still reads
  "Follow") makes a slow machine fail red rather than pass green; the delay was raised from 3 s to
  5 s to keep that from flaking.
- Every new case answers "when does it go red": T1–T4 when the formatting falls back to String; T5 when
  the backfill sees mount-time preferences.
- Mutations M1–M5: reach confirmed by the restored diff being the mutation only and the rebuild before
  each run; attribution by the failing assertion's location; restore by copying a backup, never
  `git checkout`, each followed by `git diff --quiet`.
