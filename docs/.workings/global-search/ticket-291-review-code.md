# Code review — #291

Ticket: [#291](https://github.com/aloong-planet/agentshed/issues/291). 2026-10-22. Implementation version: f8b7ca8
(rebased onto 7fe0186) and the uncommitted fix below — `src/renderer/src/hit-window.ts` and its test,
`src/renderer/src/SessionHits.tsx`, the e2e case in `e2e/global-search.spec.ts`. Scope: the whole change, read
again in full.

## Underlying premises

One finding, fixed (a bug). The row measured its ellipsis with a canvas given the element's computed `font`
shorthand. Measured in the built app, that shorthand is empty for a hit row, so the canvas measured in its
default `10px sans-serif`: 10px against the real 13px. Cause, measured in Chrome: `font-variant-numeric:
tabular-nums`, which the hit row sets, cannot be expressed by the shorthand and blanks it (a plain 13px element
reports `13px sans-serif`, the same with tabular figures reports nothing). A keyword ending inside the ellipsis's
last 3px was judged in view while the ellipsis covered it. Fixed: the ellipsis is measured on a hidden probe laid
out in the row itself, cached per font (style, weight, size and family, which are never blank). Its regression
case E6 sizes the window so the keyword ends 11.5px before the row's edge: red before the fix (the row left
unmoved, its keyword under the ellipsis), green after.

Checked without finding: the 20-character window and the keyword's position are counted in characters as
written (unit-tested with characters outside the basic plane); the row's first highlighted occurrence and the
occurrence the window is cut around are found the same way (lowercased `indexOf`), so they are the same one.

## Runnability

No other bug. Checked: every path into a judging — mount (the width read before the first paint), a new text or
keyword, a width change through the row's ResizeObserver — starts again from the question's beginning; each step
changes the drawn text, so the next step runs after it is laid out, and the steps only advance (whole text, the
20-character window, the keyword), so judging ends. A row with no width is left until it has one. The observer
is disconnected when the row unmounts. The search page and the Sessions tab unmount when left, so a row is never
drawn hidden in the app (the spec's failure item says otherwise and is corrected at the spec check).

## Security

No finding: the row's text is still drawn as text through the existing highlight; the probe is a text node.

## Consistency

No finding against existing invariants. The full-text body hit keeps the existing highlight; the prototypes'
shared piece does the same steps, so the app follows the confirmed prototype. Smells: none in the new code. The e2e
helper's "in view" is its own code but the component's method (an ellipsis probe and an overflow test), so it is
not an independent oracle for the ellipsis's width; E6's sizing from the highlight's box is (corrected after the
independent test check, F7).

## Refactoring list (for the owner's decision)

| # | What | Why | Reach | Recommendation |
|---|---|---|---|---|
| R1 | Find the keyword without assuming lowercasing keeps lengths | The highlight (already so before this change) and the window both find the keyword in the lowercased text and use that index in the original; a character whose lowercase form is longer (the Turkish dotted capital I) shifts them by one | Self-harm: one row's highlight or window start off by a character, only with such characters before the keyword | Not now: rare, and it is the highlight's existing behaviour, not this change's |

The owner's decision (2026-10-22): R1 not done.
