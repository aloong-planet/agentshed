# A bounding box is not a painted pixel (2026-08-11)

## Symptom

Clicking "Install to…" in the global Agents · Skills list did nothing. The popover was in the DOM, had a
perfectly ordinary bounding box, and every existing test was green. It was rendering at the bottom edge of
the viewport, below everything visible.

The bug had been shipped since #40 and nobody noticed, because the failure mode is silence: a button that
appears to do nothing reads as "maybe I misclicked".

## Root cause

The popover is positioned against its row. The row's wrapper carries `className="rel"`, but the stylesheet
defined `.it.rel` — a compound selector matching only elements that have *both* classes.

`git log -S` dates it exactly: #7 introduced the rule when the wrapper really was `class="it rel"`; #40
changed the skills rows from the shared row style to their own, rewrote the class to `"rel"`, and left the
CSS side alone. From that commit on, the selector matched nothing, the popover had no containing block,
and its `top: calc(100% - 4px)` resolved against the initial containing block — i.e. the viewport height.

## Why nothing caught it

**No test asserted where the popover was**, only that things existed. And that is the interesting part,
because the obvious fix — adding a visibility assertion — would not have caught it either.

An element clipped away by an ancestor's `overflow`, or positioned off-screen, still reports a non-empty
bounding box. Every "is it visible" check available at that level is satisfied by an element that paints
nowhere:

- the element exists in the DOM ✓
- it has non-zero width and height ✓
- `visibility` is not `hidden`, `display` is not `none` ✓
- Playwright's `toBeVisible()` passes ✓

The only check that separates the two is asking what is actually **painted** at the layer's own centre —
`document.elementFromPoint` at the middle of its rect, and confirming the returned node belongs to the
layer. When the popover was mislaid, that point resolved to the pane body behind it.

## The chain of wrong turns while fixing it

Worth recording, because each looked like solid ground at the time:

1. **The first fix looked like one line.** Make `.rel` a positioning ancestor and the popover lands beside
   its button. Measured: it does — and it is then **entirely clipped** by the card's `overflow: hidden`.
   Position correct, still invisible. The one-line estimate was wrong by a whole design decision.
2. **The measuring harness was wrong three times before the measurement was right.** The probe put the
   layer in the wrong parent; the clipping walk stopped at the containing block instead of continuing up
   past it (the box that actually clips is usually just above); and the probe page omitted `#root`, so the
   height chain collapsed and every number was of a layout that does not exist. Each produced confident,
   plausible numbers. The tell each time was a value that did not fit the story — not a crash.
3. **The invariant was written down backwards.** It was first recorded as "a floating layer must be
   mounted outside the clipping box". That is one *way* to escape clipping, stated as if it were the
   requirement. Viewport positioning escapes it on its own — a fixed element's containing block is the
   viewport, which is inside no ancestor. The fix itself disproves the sentence: the popover sits inside
   the clipping card and renders fine. Had it not been corrected, the next tooltip would have been
   portalled out of the tree for no reason.

## What was changed

- The popover positions against the viewport from its trigger's measured rect, flips up when the room
  below runs short, and dismisses on scroll and resize.
- `.it.rel` deleted — dead since #40, proven by full-repository search plus `git log -S` over the whole
  history, and it is a CSS rule, so no dynamic access or persisted value could reach it.
- CONTEXT gained the floating-layer invariant, stated as **escape the clipping** + **stay honest about
  where you point**, with the note that viewport positioning discharges the first by itself.

## What to carry forward

- **"The element exists" and "the element is visible" are both satisfied by an element painting nowhere.**
  For any layer that escapes its parent's box, the assertion is a hit test at its own centre.
- **A selector that stops matching is silent.** No error, no warning, no failing type. The change that
  breaks it is in a different file from the rule it breaks, and usually in a different commit — so when a
  visual element is mysteriously misplaced, compare the classes the markup actually emits against the
  selectors the stylesheet actually defines, before reasoning about the positioning at all.
- **When a measurement disagrees with the story, suspect the harness first.** Three of the wrong turns
  above were the probe, not the subject. A harness that reports a plausible number is indistinguishable
  from a correct one until something forces the comparison — so build in a self-check that fails loudly
  when the setup is not what you think (the probe eventually asserted its own scroll container was full
  height, and would have caught the collapsed layout immediately).
