# Code review — #281

Ticket: [#281](https://github.com/aloong-planet/agentshed/issues/281). 2026-10-23. Implementation version: bef913e on
5f376ad (the prototypes' shared stylesheets in 5f376ad, from fc3fbeb), plus the comment and spec wording below.
Scope: the whole change — the theme stylesheet's scrollbar rules and thumb tokens, the prototypes' shared stylesheets,
the new e2e case and the memory case's scrollbar checks — read again in full.

## Underlying premises

One finding, a premise not yet grounded, now grounded (no behaviour change). The stylesheet's comment, the spec
(Implementation Decisions, F1) and the prototypes' comment said a drawn scrollbar also replaces macOS's overlay
scrollbar, so the thumb does not hide on a trackpad-only Mac. The e2e window draws the classic scrollbar, and no overlay
Mac was at hand, so it was not measured. It is the same claim in three places, so all three were checked. Grounded in
Chromium's source (`evidence/ticket-281/chromium-custom-scrollbar.txt`): an element with scrollbar pseudo-element styles
gets a `CustomScrollbar`, whose `IsOverlayScrollbar()` returns false, and the overlay decision excludes such elements
(`will_be_overlay = UsesOverlayScrollbars() && !has_custom_scrollbar_style`). The source is Chromium's main branch on
2026-10-23, not the exact build Electron 43 ships. The stylesheet's comment now names that ground, and the spec says
where it comes from and that no overlay Mac was measured. The prototypes' comment states the same conclusion without a
causal claim it cannot back, so it is unchanged. F1's overlay case stays unverified by test (the checklist).

Checked without finding:
- the classic scrollbar's 15px and light track, measured red first;
- the uncleared corner's white square, measured under a planted fault, in dark;
- the canvas decoding RGBA by specification;
- the thumb's measured position: its pixel differs from the track's, asserted.

## Runnability

No bug. Checked:
- The global rule reaches every scrolling element: nothing else in the renderer styles a scrollbar (`rg -n -i
  scrollbar src/renderer`: only this change). A standard `scrollbar-width` or `scrollbar-color` on an element would make
  Chromium ignore the pseudo-element rule for it, and there is none.
- The thumb tokens resolve in all six theme × appearance states (`theme-vars.txt`), so no theme leaves the thumb
  unpainted.
- The 6px gutter changes the space a scrolling area's content gets: 9px more than under the classic scrollbar, 6px less
  than under the overlay one. The layouts that measure their width are held by the full e2e suite (F7), at the gateway.
- The e2e's dark readings run inside one page with no reload, and the memory case returns the page to light emulation
  before its later steps, polling the body's background back to the light one.
- Hover while dragging: the thumb falls back to its rest shade if the pointer leaves it mid-drag, as on the prototype.

## Security

No finding: the change is a stylesheet rule, two tokens and test code. No input, no new surface a user or content can
reach.

## Consistency

No broken invariant:
- The thumb tokens are appearance-varying, declared for light and for dark and in no theme block, as CONTEXT's theme
  variable classes require. Measured: they vary with the appearance only.
- The app's and the prototypes' values are the same.

CONTEXT's count of appearance-varying variables is stale. It already was before this change (20 written, 26 measured
without the two thumb tokens); its update is in the document sync checklist.

Smells, judged on the new code only:
- **Duplicated code**: the walk up the ancestors to the first painted background is written twice in the e2e file,
  once in the list helper and once in the memory case. Each copy runs inside a page evaluation, so they cannot share a
  function directly. R1.
- **Helpers placed after their first use**: the scrollbar helpers sit beside the new case, while the memory case
  earlier in the file also calls them, which works through hoisting. R2.

## Refactoring list (for the owner's decision)

| # | What | Why | Reach | Recommendation |
|---|---|---|---|---|
| R1 | One helper for "the colour an area paints", used by both cases | Duplicated code: two copies of the ancestor walk, which can drift apart | Self-harm: test code only; a drifted copy would read a wrong expected colour and fail loudly, not pass | Now: a few lines in one file, and the tests guard it |
| R2 | Move the scrollbar helpers above their first use | A reader of the memory case meets calls to helpers defined two thousand lines later | Self-harm: readability only | Not now: hoisting is valid TypeScript, and the move is churn in a long file |

The owner's decision (2026-10-23): both done. R1: one helper for the colour an area paints, used by the list helper and
the memory case. R2: the scrollbar helpers moved above the memory case, their first use. Typecheck, lint, a fresh
build and both cases green after it; the full gateway follows.
