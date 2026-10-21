# Code review — #279

Ticket: [#279](https://github.com/aloong-planet/agentshed/issues/279). 2026-10-21. Implementation version: the
uncommitted changes on `feat/landing-global-search` over 80f2968 — `site/src/components/Features.astro`,
`site/src/styles/global.css`, `site/src/scripts/features.ts`, `site/src/scripts/language-switch.ts`,
`site/src/i18n/ui.ts`, `site/src/shots.ts`, the six screenshots copied from the confirmed prototype,
`site/test/built-site.test.ts`, and the spec's write-back (Failure C7, the features section's implementation
decision). Scope: the whole change, read again in full.

## Underlying premises

No finding. Checked:
- The pin point: the header's bar is 58px and its 1px bottom border overlaps the showcase's empty top edge; the
  showcase's text and screenshot sit below the header's real bottom edge (measured, M1). The prototype has the
  same 58px pin.
- A turn's length: the script reads the turn block's own height and the pin's computed `top`, so it cannot
  disagree with the stylesheet's `60svh` and `58px`; the comment that says so states a fact of the code.
- The comments that state a cause were checked against the code or a measurement: the pinned part would bring
  every step back as the first if it marked the place (on the other page it sits at its natural place, so the
  restore would land where the showcase pins); an element that is not displayed has an all-zero box and never
  crosses the viewport's middle; without scripts the served first step would stay on (M7 shows the stacked
  steps instead). `@media (scripting: none)` is honoured by the Chrome measured (M7).
- The new hero copy is the READMEs' opening line and summary (built-site check B5), and the six steps' copy is
  the confirmed prototype's, item by item (compared when written).

## Runnability

No bug. Checked:
- Every path into and out of a current step: the served first step; scrolling (rAF-throttled); resizing,
  including to a narrow width and back (M6); a jump (M2); the language switch's restore, which sets the noted
  step and then lets the scroll decide (M5); reduced motion (M3). Before the showcase the first step shows,
  past it the last (M2).
- The language switch on a narrow page: the hidden showcase is never chosen, the stacked steps are, as before.
- Two edge cases, both confined to the showcase (self-harm), are on the refactoring list (R1, R3).

## Security

No finding: no new input reaches the page; the copy is static text rendered by Astro; no new request.

## Consistency

No finding against existing invariants. Checked:
- No style in the markup (the stylesheet's own rule): the block's height comes from the turn blocks, not from an
  inline custom property, which the prototype used.
- Every rule and selector of the clickable list is gone, with no reference left in the site: `rg -n
  "fs-item|fs-panel|fs-stack|\.fs\b|framePanel|nearest" site/src site/test site/README.md` lists only `.fs-step`
  and `.fs-list`, which the stacked steps still use.
- New class names (`deck`, `deck-pin`, `deck-turn`, `deck-copy`, `deck-stage`, `deck-text`, `deck-shot`,
  `deck-n`): `rg -n deck site src -l` returned nothing before they were added.
- Colours use the palette's tokens only (`--text`, `--text-2`); M8 reads them back in light and dark.
- A statement that becomes untrue elsewhere: the site's README calls `features.ts` the "scroll-linked frame".
  That is document sync, on the ticket's checklist for step 8.
- Smells: the steps are rendered twice (the showcase and the stacked steps). Exempt: the confirmed design shows
  one or the other by width and by scripting, as the prototype does, and both come from one list.

## Refactoring list (for the owner's decision)

| # | What | Why | Reach | Recommendation |
|---|---|---|---|---|
| R1 | Guard the step computation against a turn block of zero height | With a window of zero height (minimised, for example) the division gives `NaN`, and every step is switched off until the next scroll or resize | Self-harm: the showcase only, and only until the next scroll or resize | Now: one condition in the guard that already returns when the showcase is not displayed |
| R2 | Rename `two` in the features component to `twoDigits` | Mysterious name: it pads a number to two digits | None (a name) | Now |
| R3 | The screenshot's width cap `(100svh - 190px) × 16/9` reaches zero in a window under 190px tall | The prototype's rule; a window that short shows almost nothing of the page anyway | Self-harm, at heights no real window has | Leave it |

The owner's decision (2026-10-21): R1 and R2 now, R3 left as it is. Both done before the full gateway: the guard
returns while a turn has no length, leaving the step as it was; the helper is `twoDigits`.
