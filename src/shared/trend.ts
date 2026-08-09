// Trend bar segmentation (a pure function shared by both ends, unit testable):
// in combined mode each bar stacks by agent side (Claude below, Codex above), and single-side mode
// degenerates to one segment.
// A zero value produces no empty segment; the window is a fixed last 30 days, cut by local time zone.
import type { DayUsage } from './domain'
import { PROVIDER_ORDER, type Provider } from './provider'

/** The values are language-independent identifiers; for the UI text see TREND_MODE_LABEL */
export type TrendMode = 'total' | 'Claude' | 'Codex'

/**
 * Display names. Claude / Codex are product names and are the same in every language;
 * **only `total` varies with the UI language**, so it is left null here and the renderer takes it from
 * the dictionaries (ticket 07).
 */
export const TREND_MODE_LABEL: Record<TrendMode, string | null> = {
  total: null,
  Claude: 'Claude',
  Codex: 'Codex'
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

function localDay(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function buildTrendBars(
  byDay: DayUsage[],
  anchorMs: number,
  mode: TrendMode,
  archivedDays: string[]
): TrendBar[] {
  const index = new Map(byDay.map((d) => [d.day, d]))
  const archived = new Set(archivedDays)
  const bars: TrendBar[] = []
  for (let i = TREND_WINDOW_DAYS - 1; i >= 0; i--) {
    const at = new Date(anchorMs - i * 86_400_000)
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
      // Single-side filter: that side's total degenerates to one segment, with the provider taken as that
      // side's primary provider
      const v = mode === 'Claude' ? (row?.claude ?? 0) : (row?.codex ?? 0)
      total = v
      if (v > 0) segments.push({ provider: mode === 'Claude' ? 'Anthropic' : 'OpenAI', value: v })
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
