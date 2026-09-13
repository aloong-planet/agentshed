// Everything derived from the usage rows: the fixed projections the whole-history views read, and the
// window slice a time selection reads. Both live here so there is exactly one rule for "what does a set
// of rows add up to" — the defect this replaces was two accumulators computing the same figures
// separately, free to disagree with nothing reporting it (ADR-0025).
//
// Pure and side-effect free: it runs in the main process to build the projections and in the renderer to
// answer the selected window, and both must get the same answer from the same rows.
import type { AgentSide, DayUsage, ModelUsage, TokenStats, TokenTotals, UsageRow } from './domain'
import { emptyTotals, zeroBySide } from './domain'
import { providerOf } from './provider'
import { localDay } from './format'

/** The selectable time windows, in display order. `all` is the default. */
export const USAGE_WINDOWS = ['all', 'today', 'd7', 'd30'] as const
export type UsageWindow = (typeof USAGE_WINDOWS)[number]

/**
 * How many days back each window covers, counting the anchor day as the first.
 * `null` = every day on record.
 *
 * A **total** Record, so adding a window makes typecheck enumerate everyone who has to answer for it —
 * the same reason `DayUsage.bySide` is total (ADR-0020).
 */
export const USAGE_WINDOW_DAYS: Record<UsageWindow, number | null> = {
  all: null,
  today: 1,
  d7: 7,
  d30: 30
}

/**
 * The three cross-side comparable buckets. `input` and `cacheWrite` do **not** each carry one meaning
 * across sides, but their sum does, and the three together sum exactly to the total on every side —
 * see the invariant in CONTEXT.md before reaching for either on its own.
 */
export interface UsageComposition {
  /** Everything the model had to read fresh this turn, cache writes included */
  uncachedInput: number
  output: number
  cacheRead: number
}

export interface UsageSlice {
  total: number
  bySide: Record<AgentSide, number>
  composition: UsageComposition
  /** Descending by total, the same order the whole-history projection uses */
  byModel: ModelUsage[]
}

/**
 * Is this row inside the window? The window is cut against the **caller-provided common anchor**,
 * so "today" always means the same day as the trend chart's last bar (spec G2). Reading a separate clock here
 * would let the two disagree about which day today is, with nothing on screen to reveal it.
 */
export function inWindow(day: string, window: UsageWindow, anchorMs: number): boolean {
  const days = USAGE_WINDOW_DAYS[window]
  // `all` means every row on record, and a row carrying no day **is** on record — excluding it here
  // would make the whole-history figure disagree with the side totals derived from the same rows. A
  // bounded window is the opposite case: an undated row genuinely cannot be shown to fall inside it.
  if (days === null) return true
  if (!day) return false
  // Compare day keys rather than timestamps: the keys are already cut by local time zone, so a
  // millisecond comparison would re-derive the boundary and could land a day off around DST.
  return day >= localDay(anchorMs - (days - 1) * 86_400_000) && day <= localDay(anchorMs)
}

/** Aggregate the rows falling inside one window. */
export function sliceUsage(rows: UsageRow[], window: UsageWindow, anchorMs: number): UsageSlice {
  const bySide = zeroBySide()
  const composition: UsageComposition = { uncachedInput: 0, output: 0, cacheRead: 0 }
  const models = new Map<string, ModelUsage>()
  let total = 0
  for (const r of rows) {
    if (!inWindow(r.day, window, anchorMs)) continue
    total += r.total
    bySide[r.side] += r.total
    composition.uncachedInput += r.input + r.cacheWrite
    composition.output += r.output
    composition.cacheRead += r.cacheRead
    if (!r.model) continue
    const k = `${r.side}|${r.model}`
    const m = models.get(k)
    if (m) m.total += r.total
    else models.set(k, { model: r.model, side: r.side, total: r.total })
  }
  return {
    total,
    bySide,
    composition,
    byModel: [...models.values()].sort((a, b) => b.total - a.total)
  }
}

/**
 * The fixed projections, derived from the same rows. Kept on the wire because the whole-history views
 * and the trend chart read them directly; derived rather than accumulated so they cannot drift from the
 * rows the windows are cut from.
 */
export function deriveStats(rows: UsageRow[]): TokenStats {
  const bySide: Record<AgentSide, TokenTotals> = {
    claude: emptyTotals(),
    codex: emptyTotals(),
    grok: emptyTotals()
  }
  const models = new Map<string, ModelUsage>()
  const days = new Map<string, DayUsage>()
  for (const r of rows) {
    const t = bySide[r.side]
    t.input += r.input
    t.output += r.output
    t.cacheRead += r.cacheRead
    t.cacheWrite += r.cacheWrite
    t.total += r.total
    if (r.model) {
      const k = `${r.side}|${r.model}`
      const m = models.get(k)
      if (m) m.total += r.total
      else models.set(k, { model: r.model, side: r.side, total: r.total })
    }
    if (!r.day) continue
    const d = days.get(r.day) ?? { day: r.day, bySide: zeroBySide(), byProvider: {} }
    d.bySide[r.side] += r.total
    const prov = providerOf(r.model)
    d.byProvider[prov] = (d.byProvider[prov] ?? 0) + r.total
    days.set(r.day, d)
  }
  return {
    rows,
    bySide,
    byModel: [...models.values()].sort((a, b) => b.total - a.total),
    byDay: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
  }
}
