// Trend bar segmentation (a pure function shared by both ends, unit testable):
// in combined mode each bar stacks by provider, and single-side mode
// degenerates to one segment.
// A zero value produces no empty segment; the selected span is cut by local calendar days.
import type { AgentSide, DayUsage } from './domain'
import { PROVIDER_ORDER, type Provider } from './provider'
import { localDay } from './format'

/** The values are language-independent identifiers; for the UI text see TREND_MODE_LABEL */
export type TrendMode = 'total' | 'Claude' | 'Codex' | 'Grok'

/**
 * Display names. Claude / Codex are product names and are the same in every language;
 * **only `total` varies with the UI language**, so it is left null here and the renderer takes it from
 * the dictionaries (ticket 07).
 */
export const TREND_MODE_LABEL: Record<TrendMode, string | null> = {
  total: null,
  Claude: 'Claude',
  Codex: 'Codex',
  Grok: 'Grok'
}

/** Which side each single-side mode reads (typecheck-complete over the non-total modes) */
const MODE_SIDE: Record<Exclude<TrendMode, 'total'>, AgentSide> = {
  Claude: 'claude',
  Codex: 'codex',
  Grok: 'grok'
}

/** A side's primary provider, for the degenerate single-segment colour (ADR-0021: the side's
 * identifying colour is its provider colour) */
const SIDE_PRIMARY_PROVIDER: Record<AgentSide, Provider> = {
  claude: 'Anthropic',
  codex: 'OpenAI',
  grok: 'xAI'
}

export interface TrendSegment {
  provider: Provider
  value: number
}

export interface TrendBar {
  /** The local day key, YYYY-MM-DD */
  day: string
  /** The short display label, M/D */
  label: string
  total: number
  segments: TrendSegment[]
  /** The source session files were cleaned up by the agent, and the values come from the local archive */
  archived: boolean
}

export const TREND_WINDOW_DAYS = 30
export const TREND_SPANS = [30, 60, 90] as const
export type TrendSpan = (typeof TREND_SPANS)[number]

export function buildTrendBars(
  byDay: DayUsage[],
  anchorMs: number,
  mode: TrendMode,
  archivedDays: string[],
  span: TrendSpan = TREND_WINDOW_DAYS
): TrendBar[] {
  const index = new Map(byDay.map((d) => [d.day, d]))
  const archived = new Set(archivedDays)
  const bars: TrendBar[] = []
  const anchor = new Date(anchorMs)
  for (let i = span - 1; i >= 0; i--) {
    // Calendar arithmetic keeps a 23/25-hour day from skipping or duplicating a date.
    const at = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - i, 12)
    const day = localDay(at.getTime())
    const row = index.get(day)
    const segments: TrendSegment[] = []
    let total = 0
    if (mode === 'total') {
      // Segment by provider in a fixed order (the legend and the stacking do not churn with the day's data)
      for (const p of PROVIDER_ORDER) {
        const v = row?.byProvider?.[p] ?? 0
        if (v > 0) segments.push({ provider: p, value: v })
        total += v
      }
    } else {
      // Single-side filter: that side's total degenerates to one segment, with the provider taken as
      // that side's primary provider (both maps are Records over the mode/side unions, so a new side
      // is a compile error here rather than a silent zero)
      const v = row?.bySide[MODE_SIDE[mode]] ?? 0
      total = v
      if (v > 0) segments.push({ provider: SIDE_PRIMARY_PROVIDER[MODE_SIDE[mode]], value: v })
    }
    bars.push({
      day,
      label: `${at.getMonth() + 1}/${at.getDate()}`,
      total,
      segments,
      archived: archived.has(day)
    })
  }
  return bars
}
