// The surface shared by every floating layer over a list: the install popover and the skill-name
// reveal today, and whatever comes third.
//
// **The look is defined here, in one place.** It used to be written out twice in the theme file, and the
// two copies had already drifted — different shadows, different radii. Worse, each copy hard-coded its
// shadow colour, so the surface was the one thing in the UI that could not follow the palette. Defining
// it once means the next layer inherits a surface rather than approximating one.
//
// **What is NOT here**: where the layer goes. Positioning differs per layer in ways that do not
// generalise — the popover flips between above and below its button, the name reveal clamps against the
// window edge — so each supplies its own coordinates. Unifying that logic is issue #101; the surface came
// first because it is the part that genuinely is the same.
//
// Colours stay on the theme variables (never literal values), so the surface follows the palette and the
// light/dark switch like everything else.
import type { CSSProperties, JSX, ReactNode } from 'react'

/**
 * Viewport coordinates for the layer. `top`/`bottom` and `left`/`right` are each a choice of edge to
 * anchor from — a layer that flips upwards gives `bottom`, one that hangs below gives `top`.
 */
export interface FloatingAt {
  top?: number
  bottom?: number
  left?: number
  right?: number
  maxHeight?: number
  maxWidth?: number
}

/**
 * `fixed` is load-bearing, not a style choice: it is what carries the layer out of the list's overflow
 * clipping. A fixed element's containing block is the viewport, which lies inside no ancestor, so no
 * ancestor's `overflow` reaches it — see CONTEXT's floating-layer invariant, and the postmortem for what
 * it looks like when this is got wrong (an element with a perfectly normal bounding box, painting
 * nowhere).
 */
const SURFACE: CSSProperties = {
  position: 'fixed',
  zIndex: 30,
  background: 'var(--card)',
  border: '1px solid var(--line-strong)',
  borderRadius: 9,
  boxShadow: '0 6px 22px var(--float-shadow)',
  padding: 6
}

export function FloatingBox({
  at,
  className,
  style,
  children
}: {
  at: FloatingAt
  /** An extra class for layer-specific rules that are not part of the surface */
  className?: string
  /** Layer-specific overrides; applied last so a layer can opt out of any surface property */
  style?: CSSProperties
  children: ReactNode
}): JSX.Element {
  return (
    <div className={className} style={{ ...SURFACE, ...at, ...style }}>
      {children}
    </div>
  )
}
