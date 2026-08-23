// The side badge on session surfaces: class + two-letter label per side, complete over AgentSide
// so a new side is a compile error here rather than a silent fall-through in a ternary — which is
// exactly how Grok sessions briefly wore the CX badge (#125 review).
import type { AgentSide } from '@shared/domain'

export const SIDE_BADGE: Record<AgentSide, { cls: 'cl' | 'cx' | 'gk'; label: string }> = {
  claude: { cls: 'cl', label: 'CC' },
  codex: { cls: 'cx', label: 'CX' },
  grok: { cls: 'gk', label: 'GK' }
}

/** The display order, derived from the Record's keys rather than written out again: the Record is
 *  total over AgentSide, so this is complete by construction and a new side cannot be left out of it */
export const SIDE_ORDER = Object.keys(SIDE_BADGE) as AgentSide[]

/** The side's full display name where a sentence needs it (the session page meta) */
export const SIDE_FULL_NAME: Record<AgentSide, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  grok: 'Grok'
}

/** The side's short display name for compact chrome (side-switch buttons, drawer and list meta) */
export const SIDE_SHORT_NAME: Record<AgentSide, string> = {
  claude: 'Claude',
  codex: 'Codex',
  grok: 'Grok'
}

/** The uppercase brand-chip label (the side cards' form; deliberate caps, see CONTEXT's text-case
 *  invariant) — total over AgentSide so a chip surface cannot silently miss a new side */
export const SIDE_CHIP_LABEL: Record<AgentSide, string> = {
  claude: 'CLAUDE CODE',
  codex: 'CODEX',
  grok: 'GROK'
}
