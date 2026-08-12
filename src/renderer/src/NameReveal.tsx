// Revealing a skill name that its column was too narrow to show.
//
// The name column is a fixed width shared with the rows in other sections, so a long name has always been
// truncated to an ellipsis. Filtering makes that land more often — the user arrives at a row *by name* and
// then cannot read the name — so hovering a truncated name shows it in full. Only a truncated one:
// repeating a name that is already legible is noise.
//
// **The two obligations of a floating layer over this list** (CONTEXT's invariant):
//
//  1. *Escape the clipping.* The skills card clips its overflow. `position: fixed` discharges this on its
//     own — such an element's containing block is the viewport, so no ancestor's overflow reaches it, and
//     it does not additionally need portalling out of the list. (What would still clip it is an ancestor
//     creating a containing block for fixed descendants — a transform, filter or perspective — so that is
//     the thing to watch, not how deeply this sits.)
//  2. *Stay honest about where it points.* Its coordinates are measured once from the name element, so
//     anything that moves that element invalidates them. Scrolling and resizing therefore dismiss it.
//     Filtering does too, for free: the row unmounts and takes this with it.
import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { FloatingBox } from './FloatingBox'
import { useAnchorInvalidation } from './useAnchorInvalidation'

/**
 * The layer's width ceiling, and the value the placement clamps against so no second measurement is
 * needed. It is passed to the surface as well, so the bound and the clamp cannot drift apart — they were
 * two separate constants, one in CSS and one here, until this became a component.
 */
const TIP_MAX_WIDTH = 420
/** Breathing room kept between the layer and the window edge */
const TIP_MARGIN = 8
/** The gap between the name's baseline row and the layer */
const TIP_OFFSET = 4

interface TipAt {
  left: number
  top: number
}

/**
 * A skill name that reveals itself in full when the column has truncated it.
 *
 * Truncation is decided **at hover time** by comparing the rendered width against the available width —
 * one layout read, at the moment the user asks for it.
 *
 * It is not computed once and remembered. Not because anything is known to invalidate it (the column is
 * a fixed 200px and the fonts are system ones, so neither resizing nor font loading moves it — measured),
 * but because a remembered value would need something to invalidate it, and reading it on demand costs
 * so little that there is nothing to buy with that complexity.
 */
export function NameReveal({ name }: { name: string }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<TipAt | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)

  // Dismissed on both scroll and resize: this is a glance, not an interaction — it is going away the
  // moment the pointer moves anyway, so re-placing it would buy nothing.
  useAnchorInvalidation(at !== null, tipRef, { onResize: 'dismiss', dismiss: () => setAt(null) })

  const reveal = (): void => {
    const el = ref.current
    if (el === null) return
    // The whole condition: the text is wider than the box drawing it
    if (el.scrollWidth <= el.clientWidth) return
    const r = el.getBoundingClientRect()
    // Clamped against the layer's own ceiling rather than its measured width, so no second render is
    // needed to place it. The name column sits far from the right edge, so this mostly never binds —
    // it is here so that a narrow window cannot push the layer off-screen.
    setAt({
      left: Math.max(TIP_MARGIN, Math.min(r.left, window.innerWidth - TIP_MAX_WIDTH - TIP_MARGIN)),
      top: r.bottom + TIP_OFFSET
    })
  }

  return (
    <>
      <span className="nm mono" ref={ref} onMouseEnter={reveal} onMouseLeave={() => setAt(null)}>
        {name}
      </span>
      {at !== null && (
        <FloatingBox ref={tipRef} className="nm-tip" at={{ left: at.left, top: at.top, maxWidth: TIP_MAX_WIDTH }}>
          {name}
        </FloatingBox>
      )}
    </>
  )
}
