# Ticket #281 — task list

Ticket: [#281 Dark mode: scrollbar tracks stay light beside scrolling lists](https://github.com/aloong-planet/agentshed/issues/281)
· spec [appearance](../../specs/appearance.md). Branch `fix/thin-scrollbars`, in the worktree `agentshed-wt/scrollbars`,
cut from `origin/main` at fc3fbeb (no commits ahead when cut).

## Facts established before the change (2026-10-23)

- The app's stylesheets declare no scrollbar rule and no `color-scheme`: a search of `src/renderer` for
  `scrollbar|color-scheme` finds only the dark media query's name in `SettingsPane.tsx`. So every scrolling area
  draws Chromium's default scrollbar, which in dark keeps a light track (#281's strip).
- The prototypes' shared stylesheet does declare `color-scheme` (`docs/prototypes/_shared/theme.css`, light at
  line 11, dark at line 81), so the prototypes draw dark native scrollbars where the app draws light ones.
- This Mac's "Show scroll bars" is unset, so macOS's default (Automatic) applies: overlay scrollbars with only a
  trackpad, classic ones with a mouse. The e2e windows draw classic ones (a 15px gutter).
- Measured in the app's Electron 43 window, dark emulated (`evidence/ticket-281/scrollbar-probe.txt`, screenshots
  beside it):
  - no rule: a 15px classic scrollbar with a light track;
  - `color-scheme: light dark` alone: the track turns dark, still 15px with a track;
  - `scrollbar-width: thin` with `scrollbar-color`: an 11px gutter set by the engine, a transparent track, the
    thumb in the given colour, no hover state;
  - `::-webkit-scrollbar` at 6px with a transparent track: exactly 6px, a rounded thumb, a hover state possible;
    the corner where two scrollbars meet stays light unless `::-webkit-scrollbar-corner` is made transparent too.
  Custom `::-webkit-scrollbar` styles replace macOS's overlay scrollbars, so they do not hide when idle.
- Playwright's Electron launch emulates a light colour scheme by default (appearance spec, Testing Decisions), so
  dark set through `nativeTheme` does not reach the page in a test unless the emulation is removed.

## Owner decisions in this ticket (2026-10-23)

Asked in one batch, each with a recommended answer; the owner took every recommendation.

| # | Decision | Chosen | Other options offered |
|---|---|---|---|
| D1 | How narrow | A 6px thumb drawn through `::-webkit-scrollbar`, no track | 8px the same way; the engine's thin scrollbar (`scrollbar-width: thin`, 11px, no hover state) |
| D2 | When the thumb shows | Always, whenever the content overflows (like the reference image) | Only while the pointer is over the scrolling area |
| D3 | Which scrollbars | Every scrolling area in the app, vertical and horizontal | Only the long lists #281 names |
| D4 | The thumb's colour | A neutral grey that changes with light and dark, the same in all three themes | The theme's accent |
| D5 | The prototype | Confirmed as drawn, the hover shade included: a 6px thumb with 3px corners; light black at 25%, 40% on hover; dark white at 22%, 36% on hover; no track, the corner cleared | — |

The owner's request, in their words translated: narrow the scrollbar like the reference image (a slim grey
thumb), and do not show its background.

## Interface gate

A user-visible change on every scrolling area: the prototypes' shared stylesheet takes the same rule, and the
owner confirms it on the prototypes before any app code changes.

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Step 1: facts and decisions | this record | done |
| 2 | Step 2: the prototypes' scrollbars; the owner confirms; the appearance spec | the confirmed prototype, the spec | done (5f376ad): the prototypes' shared stylesheets carry the rule (the window's scrollbars in `app-window.css`, the two thumb tokens per light and dark in `theme.css`); measured 6px on every overflowing scroller of the 11 app pages in light and dark, a control outside the window 15px (`evidence/ticket-281/prototype-measure.txt`); a hover shade added; the owner confirmed the prototype on 2026-10-23 (D5); the spec written |
| 3 | Steps 4–7 (`/implement`) | the review records, the gateway | done: test design review; red first and implementation (bef913e); code review, the owner chose both refactors (7211ff3); full gateway on 7211ff3 green; independent test check, its findings T1–T5 fixed (b0bcfac), then I1–I2 (db00779), then K1–K2 (29353e3, comment only); spec final check: no departure |
| 4 | Step 8 (`/features-catalog`); PR; stop for the owner | `final-regression.md`, PR link | step 8 done (`final-regression.md`); the final gateway on 764addb green; PR #304, whose merge the owner confirmed on 2026-10-23 to follow a green CI (a squash merge, the remote branch deleted); after it, the tracker only |
