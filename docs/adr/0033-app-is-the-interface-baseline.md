# ADR-0033: The app is the interface's baseline; the prototypes are kept by hand, never generated from the app or compared with it

- Status: Accepted (2026-11-16)

## Context

The prototypes under `docs/prototypes/` hold their own icons, colour tokens, shared styles and copy, and when a
prototype and the app differ, one of them has to be the one that is right. A change inside the prototype gate (a new
surface, or more than one arrangement weighed) is confirmed in its prototype and then built from it, while every other
interface change is built in the app directly. Generating the prototypes from the app would copy the app's current
state over a confirmed design not yet built, and comparing the two would report that design as a failure.

## Options

1. **The app is the baseline; the prototypes are edited by hand, nothing generates them from the app or compares them
   with it, and a confirmed prototype governs its own change only until that change is delivered** — chosen.
2. The prototypes are the baseline and the app follows them — rejected: since the prototype gate narrowed, most
   interface changes do not pass through a prototype, so the prototypes fall behind the app and would send it after an
   outdated drawing.
3. The app is the source, the prototypes hold views generated from it, and a `--cross` tier of `check:ui` checks that
   they are current — rejected: it copies the app over a confirmed prototype the app is about to be built from, and
   the cross check reports a prototype that awaits its change as a failure.

## Decision

We adopt **option 1**. `docs/prototypes/_shared/` holds the prototypes' own icons, colour tokens and shared styles, and
the prototypes their own copy, all edited by hand. No script generates a prototype file from the app, and `check:ui`
compares no prototype with the app; its checks of the app's own code run on every invocation. Where a prototype and the
app differ the app is right, with the one exception the prototype skill gives for a change inside its gate.

## Consequences

- Positive: `check:ui` has no expected red, so what it reports is a defect wherever it runs.
- Positive: a confirmed design for a change inside the gate stays in its prototype until that change is built, and
  nothing overwrites it.
- Negative: a prototype can show an interface the app has since changed, with nothing marking it, so a reader takes
  the app, not the prototype, as the interface's present state.
- Negative: work on an existing prototype page begins by redrawing what the app has changed since the page was drawn,
  which a generator would have done unasked.
- Neutral: the prototypes stay in the repository as reference, and whether the app matches them is not checked at any
  point.

## Sources

The owner's ruling of 2026-11-16, reversing the ruling of 2026-10-18 that the prototypes are the baseline; the
prototype skill as of 2026-11-16, under which the app is the interface's baseline and the gate covers a new surface or
more than one arrangement weighed. `scripts/check-shared-ui.mjs` and `docs/prototypes/_shared/`.
