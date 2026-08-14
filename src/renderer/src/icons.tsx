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
// **How to add an icon**: copy the **internal elements** of that icon from an icon library and wrap them
// in the Icon component below. No third-party icon library runtime dependency, no pasting a whole `<svg>`
// tag, and no hard-coded colours on the paths.
//
// **Two libraries, and each icon says which one it came from.** Lucide is the default. Tabler is used
// where Lucide has no glyph for the meaning: Lucide has exactly one robot in its whole set, and that one
// is already the subagent, so the Agents rail would have had nothing left to be. Mixing is safe here for
// a specific reason rather than by luck — both draw on a 24×24 grid with a 2px stroke and round caps, so
// the same Icon wrapper fits either without adjustment. Check that before adding a third source.
//
// Every icon slot in the renderer now comes from here. What is deliberately **not** an icon: the CC / CX /
// CLAUDE CODE badges are text labels, and the middle dots in copy (`a · b`) are typographic separators.
//
// Icons still living inside the six language dictionaries are tracked separately (they are glued to copy,
// so getting them out is an i18n change, not a rendering one).
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

/** Lucide bot — a subagent. Note it is **not** the rail's Agents icon (that is RobotFace): the two used to
 * share one 🤖, which tied two meanings to a single glyph and meant neither could change alone. */
export function Bot({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </Icon>
  )
}

/** Lucide folder — rail · the Projects dimension */
export function Folder({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Icon>
  )
}

/** Lucide refresh-cw — rail · refresh everything. Two arrows rather than one: the button spins while busy, and a single arrow reads off-centre while rotating */
export function RefreshCw({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </Icon>
  )
}

/** Lucide settings — rail · settings */
export function Settings({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

/** Lucide chevron-right — the expand indicator for a collapsed row — rotated 90° by CSS when open, so one icon carries both states */
export function ChevronRight({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

/** Lucide chevron-left — the back control in a pane header. Its mirror, ChevronRight, is the expand
 * indicator; this one is navigation, and the two never appear in the same slot. */
export function ChevronLeft({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  )
}

/** Lucide dot — the placeholder in an expand slot that cannot expand */
export function Dot({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <circle cx="12.1" cy="12.1" r="1" />
    </Icon>
  )
}

/** Lucide x — close (drawer, dialog) */
export function X({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

/** Lucide git-fork — a session forked from another. The uncertain-strip variant uses the **same** icon and is distinguished by the pill (dashed border, risk colour), so the icon keeps one meaning */
export function GitFork({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </Icon>
  )
}

/** Lucide brain — a thinking / reasoning block */
export function Brain({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M12 18V5" />
      <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
      <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
      <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
      <path d="M18 18a4 4 0 0 0 2-7.464" />
      <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
      <path d="M6 18a4 4 0 0 1-2-7.464" />
      <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
    </Icon>
  )
}

/** Lucide search — the search / filter box */
export function Search({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </Icon>
  )
}

/** Lucide inbox — the empty state for “no data yet” */
export function Inbox({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Icon>
  )
}

/** Lucide minus — a badge meaning “this side does not have it” */
export function Minus({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M5 12h14" />
    </Icon>
  )
}

/** Tabler robot-face — rail · the Agents dimension */
export function RobotFace({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" />
      <path d="M9 16c1 .667 2 1 3 1s2 -.333 3 -1" />
      <path d="M9 7l-1 -4" />
      <path d="M15 7l1 -4" />
      <path d="M9 12v-1" />
      <path d="M15 12v-1" />
    </Icon>
  )
}

/** Lucide terminal — a tool call */
export function Terminal({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M12 19h8" />
      <path d="m4 17 6-6-6-6" />
    </Icon>
  )
}

/** Lucide mouse-pointer-click — the empty state prompting a pick from the list on the left */
export function MousePointerClick({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size}>
      <path d="M14 4.1 12 6" />
      <path d="m5.1 8-2.9-.8" />
      <path d="m6 12-1.9 2" />
      <path d="M7.2 2.2 8 5.1" />
      <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" />
    </Icon>
  )
}

