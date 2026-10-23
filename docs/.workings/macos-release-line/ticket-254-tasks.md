# Ticket #254 — task list

The app-update case that waits to read the download at 0% is flaky. Working record, not a requirement authority:
the requirements are [the app-update spec](../../specs/app-update.md); the coverage checklist is
[checklist.md](checklist.md). Branch `fix/app-update-e2e-first-step`, in its own worktree, cut from `origin/main` at
1349d76 (no commits ahead when cut).

## Facts found before deciding (2026-10-23)

- The scripted update source starts the download inside the launch check and reports its steps on a fixed timer:
  `onProgress(step)`, then `stepMs`, then the next step (`src/main/update-source.ts:166–176`). The case "an open
  message follows the progress of the download…" scripts `steps: [0, 20, 40, 60]`, `stepMs: 700` and first waits for
  the slot to read 0 (`e2e/app-update.spec.ts:162–166`).
- Measured on this machine, built at 1349d76, with a throwaway copy of the case (`evidence/ticket-254/diag-before.txt`):
  the slot first shows 614–654 ms after launch (4,843 ms on a cold first launch, still reading 0). The first step lasts
  700 ms, so the case's margin is about 50–80 ms.
- The same copy with `stepMs` cut to 100 fails three times out of three with the issue's exact symptom:
  `Expected: "0"`, `Received: "60"`. That is the feedback loop: the window shows after the download has moved on.
- The same pattern, enumerated over every e2e use of the scripted source (`rg -n "steps:|stepMs|aria-valuenow|Downloading
  update|FOUND_HOLDING|FOUND_READY|checkMs" e2e/app-update.spec.ts e2e/menu-check-updates.spec.ts
  e2e/settings-updates.spec.ts`): a case that must see a state the download only holds for a fixed time.
  - `app-update.spec.ts:278` (a failed background download shows nothing) waits for the slot to show during a download
    that fails 800 ms after launch: a margin of about 150–180 ms, the same race.
  - Six more start their clock at a click in a window already shown, or leave 1.1–2 s: `menu-check-updates.spec.ts:133`,
    `:149`, `settings-updates.spec.ts:173`, `:234`, `:421`, `:537`. Margins estimated from their scripts and the
    measured window appearance, not measured one by one.
  - The rest hold their last step (`download: 'hold'`) or wait only for the end state: no race.

## Decision (implementing agent, 2026-10-23)

| # | Decision | Answer and reason |
|---|---|---|
| D1 | How the case stops depending on how fast the window appears (the issue's two leads) | A new script field, `holdFirstStep`: the download reports its first step and stays there while the script still says so; the case rewrites the script to let it go. Reading whatever step shows and asserting it moves on only widens the margin: a window later than the last step still fails |
| D2 | Which cases take the hold | The issue's case and `app-update.spec.ts:278`, the two whose margin is inside the window's normal appearance time. The six with wider margins are reported with a recommendation; the owner decides |

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Feedback loop: reproduce the symptom on demand | `evidence/ticket-254/diag-before.txt` | done |
| 2 | Records declared on #254 and its document sync checklist | `ticket-254-doc-sync.md`, the issue body | done |
| 3 | Test design review | `ticket-254-review-tests.md`, Design review | done |
| 4 | Slices: S1 the scripted source holds at its first step (unit); S2 the issue's case takes the hold (e2e); S3 the failed-download case takes the hold (e2e) | targeted runs, the late-observer loop green, the planted fault red | done: U1–U4 red then green (U4 added when reading the staged change: the hold now waits only for a download whose own script asked for it); both late-observer loops red on the old cases and green on the held ones, and the planted fault red at the 60% read — all three run before U4's guard, which changes only downloads without the field, so the old cases then ran exactly as on main; targeted run `evidence/ticket-254/targeted.txt` (`TARGETED_EXIT=0`) |
| 5 | Code review | `ticket-254-review-code.md` | done: one wording fix (the doc comment); the hold's premises measured (a half-written script, teardown while held); no refactoring |
| 6 | Full gateway | `evidence/ticket-254/gateway-43451fa.txt` | done: `VERIFY_EXIT=0` on the clean tree of 43451fa (871 unit, 109 site, 148 e2e, smoke OK) |
| 7 | Independent post-implementation test check | `ticket-254-review-tests.md` | handed to an independent agent on 1349d76..43451fa |
| 8 | Spec check, step 7 write-back (the spec's Testing Decisions name the hold), step 8 | `final-regression.md` | |
| 9 | CI: the two cases repeated | a throwaway branch's run, recorded | |
| 10 | PR; stop for the owner | PR link | |

## Targeted verification (step 4)

The tests that read what this change touched, found by search rather than recalled: `rg -l "update-source" src e2e
scripts` lists `src/main/index.ts` (the entry, no test) and `src/main/update-source.test.ts`; `rg -l
"AGENTSHED_UPDATE_SCRIPT" e2e` lists `e2e/app-update.spec.ts`, `e2e/menu-check-updates.spec.ts` and
`e2e/settings-updates.spec.ts`, every e2e that goes through the scripted source. All of them, with typecheck, lint and a
fresh build, passed (`evidence/ticket-254/targeted.txt`: 13 unit tests, 38 e2e, `TARGETED_EXIT=0`).
