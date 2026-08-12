// A floating layer's second obligation, in one place.
//
// CONTEXT's floating-layer invariant says such a layer owes two things: escape the ancestors'
// clipping, and **stay honest about where it points**. The first is discharged by the shared surface
// (viewport positioning). This hook is the second: it watches for the things that invalidate a
// position measured from an anchor, and hands control back to the caller.
//
// **What it deliberately does not do** is compute coordinates. The three layers using it place
// themselves quite differently — the install popover flips above/below its button, the language
// dropdown right-aligns and needs its own rendered width, the name tooltip clamps against the window
// edge. Folding those into one function would produce a parameter for every difference. What they
// genuinely share is *when* a position stops being true, and that is what lives here.
import { useEffect, useRef } from 'react'

/**
 * What a window resize means for this layer — and, as a union, which callbacks that choice requires.
 *
 * **'reposition'** for anything the user is in the middle of operating (a menu they are choosing
 * from): closing it mid-interaction throws away what they were doing, and a resize is not a signal
 * that they changed their mind. Choosing it obliges you to supply `reposition`.
 *
 * **'dismiss'** for a layer merely being glanced at (a hover tooltip): it is about to disappear the
 * moment the pointer moves, so re-placing it buys nothing. Choosing it takes no `reposition` at all —
 * a union rather than an optional field, so a caller cannot pass a `reposition` that never runs, nor
 * ask for repositioning without providing one.
 */
export type AnchorInvalidation =
  | { onResize: 'dismiss'; dismiss: () => void }
  | { onResize: 'reposition'; dismiss: () => void; reposition: () => void }

/**
 * Watch for anything that makes an anchored position stale, while `active`.
 *
 * **Scrolling always dismisses**, whichever container scrolled. The listener is registered on
 * `document` in the **capture** phase, which is what makes "whichever container" true: scroll events
 * do not bubble, but they do pass through document on the way down, so this hears every scrollable
 * ancestor without being told which one it is. The alternative — looking the container up by class
 * name — fails silently when that class is renamed: the listener simply never binds, and the layer
 * hangs over unrelated content with nothing raising an error.
 */
export function useAnchorInvalidation(active: boolean, handlers: AnchorInvalidation): void {
  // Held in a ref so the effect depends only on `active`. Callers pass inline closures, which are new
  // objects every render; depending on them directly would tear down and re-register both listeners
  // on every render of the surrounding component.
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!active) return
    const onScroll = (): void => ref.current.dismiss()
    const onResize = (): void => {
      const h = ref.current
      if (h.onResize === 'reposition') h.reposition()
      else h.dismiss()
    }
    // Scroll is not configurable: a scrolled anchor has moved out from under a viewport-positioned
    // layer, and there is no reading of that where the old coordinates stay true.
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [active])
}
