// The side badge on session surfaces: class + two-letter label per side, complete over AgentSide
// so a new side is a compile error here rather than a silent fall-through in a ternary — which is
// exactly how Grok sessions briefly wore the CX badge (#125 review).
import type { AgentSide } from '@shared/domain'

export const SIDE_BADGE: Record<AgentSide, { cls: string; label: string }> = {
  claude: { cls: 'cl', label: 'CC' },
  codex: { cls: 'cx', label: 'CX' },
  grok: { cls: 'gk', label: 'GK' }
}

/** The side's full display name where a sentence needs it (the session page meta) */
export const SIDE_FULL_NAME: Record<AgentSide, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  grok: 'Grok'
}
