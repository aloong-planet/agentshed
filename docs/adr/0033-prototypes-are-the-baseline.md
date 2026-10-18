# ADR-0033: The prototypes keep their own icons, tokens, styles and copy; the app follows them

- Status: Accepted (2026-10-18); supersedes in part ADR-0018 (the prototypes' half: generated icons and the
  `check:ui --cross` rule that guarded them)

## Context

ADR-0018 made the prototypes derive their icons from the app's icon module, and the gallery work of
2026-10-14 extended the arrangement: the theme tokens, the project column and the startup skeleton's
placeholders were generated from the app's `theme.css`, and `check:ui --cross` failed whenever a generated
file fell behind the app. The app was the source and the prototypes a view of it — a fit for the period
when the prototypes trailed the app, which is what ADR-0018 was written about.

The order of work now runs the other way. An interface change is made in the prototype first and confirmed
there; the app is then built from the confirmed prototype (the prototype gate before a spec, the admission
check before implementation). Under that order a generator copies the app's current state back over the
very design that is about to change it, and a cross check reports the expected state of a design not yet
implemented as a failure.

## Options

1. **The prototypes are the baseline: they keep their own icons, tokens, styles and copy, edited by hand,
   and nothing generates them from the app or compares them with it.**
2. The existing arrangement: the app is the source, the prototypes hold generated views of it, and a
   `--cross` tier checks that they are current — rejected: it copies in the wrong direction once the
   prototype leads, and its own tier comment already conceded that while a prototype awaits implementation
   the cross check reports noise.

## Decision

We adopt **option 1**. `docs/prototypes/_shared/` holds the prototypes' own icons (`icons.js`), colour tokens
(`theme.css`) and the shared pieces' styles (`project-side.css`, `startup-skeleton.css`). They are edited by
hand and are the baseline the app follows. The four generators and their helper are removed, and
`check:ui` compares no prototype with the app: the `--cross` tier is gone with its prototype-versus-app
checks, while the checks of the app's own code (copy rules, hard-coded colours, side chips, the app side of
the shared blocks) run on every invocation.

One exception: a screen the app has and no prototype has drawn yet is drawn, the first time, as the app has
it — with its entry on screens that do have a prototype. From then on the prototype is the baseline. Whether
the app matches the prototypes is checked when a round of work closes, in the documentation cross-check, not
by the prototypes.

The app's own icons stay as ADR-0018 decided: inline SVG through one `Icon` component, Lucide first and
Tabler where Lucide has no glyph for the meaning.

## Consequences

- Positive: a design change lives in its prototype until the app implements it; nothing overwrites it, and
  `check:ui` does not go red because a prototype is ahead of the app.
- Positive: `check:ui` has one tier. What it reports is a defect wherever it runs, so there is no "expected
  red" to learn to ignore.
- Negative: a change made in the app without its prototype — one that skipped the admission check — is no
  longer caught as it happens; it shows only at the round's closing cross-check. ADR-0018's original problem
  (prototypes drawing emoji for weeks after the app moved on) is now answered by the order of work rather
  than by a generator.
- Neutral: adding an icon means drawing it in the prototypes first, then copying it into the icon module.
  The two are kept equal by that order and by the closing cross-check, not by generation.
- Neutral: where the app already holds a settled value the prototypes lack or disagree with, the prototype
  takes the app's value only on the owner's explicit decision, recorded with the change.

## Sources

- The prototype skill's UI rules as of 2026-10-18: the prototype is the app's interface baseline, with the
  first-drawing exception.
- The owner's ruling of 2026-10-18 that the prototype is the app's baseline and that synchronising the
  prototypes from the app does not belong in the prototype workflow.
- `scripts/check-shared-ui.mjs` (the single tier) and `docs/prototypes/_shared/`.
