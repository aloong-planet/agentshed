// The icon module: everything is inline SVG, wrapped uniformly by Icon.
//
// **Why emoji and Unicode characters are not used as icons**: a character's glyph is decided by the
// system font, and different characters
// have different visual weights and baselines, so side by side on one row they sit at different heights
// and sizes; rendering also differs
// across platforms and fonts. Colouring is worse still — a character takes the text colour, so on a theme
// switch it behaves differently from
// the rest of the UI, whereas inline SVG follows naturally through currentColor.
//
// **How to add an icon**: copy the **internal elements** of that icon from the icon library (Lucide) and
// wrap them in the
// Icon component below. No third-party icon library runtime dependency, no pasting a whole `<svg>` tag,
// and no hard-coded colours on the paths.
//
// Note: the repository still has a number of places using characters as icons; they are outside this
// module, and a separate task covers migrating them.
import type { JSX, ReactNode } from 'react'

function Icon({
  children,
  size = 14,
  strokeWidth = 2
}: {
  children: ReactNode
  size?: number
  strokeWidth?: number
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Lucide chevron-down — the dropdown trigger's expand indicator */
export function ChevronDown({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size} strokeWidth={2.2}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

/** Lucide check — the marker for the currently selected item in a list */
export function Check({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size} strokeWidth={2.5}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}
