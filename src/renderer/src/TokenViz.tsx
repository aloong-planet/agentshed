// Shared token visualisation pieces: number formatting, the summary card, the 30-day trend bar chart, and
// the model breakdown bars.
// Shared by the project overview tab and the Agents page's Token section: the same data source, differing
// only in the grouping key.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelUsage, TokenStats, UsageRow } from '@shared/domain'
import { inWindow, sliceUsage, USAGE_WINDOWS, type UsageSlice, type UsageWindow } from '@shared/usage'

/**
 * Compact notation for token counts. **Deliberately not localised** (settled 2026-08-09): k / M / B are
 * notation of the same kind as KB / MB / ms
 * and are common to every language; switching to Intl's compact form would render other languages in
 * their own myriad-based groupings, which is a separate product decision.
 */
export function fmtTok(n: number): string {
  // The billions tier must be checked before the millions tier: otherwise 12.4B displays as 12400.0M, and
  // five digits do not read as a magnitude
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

/**
 * The four time windows **are** the selector (spec G1): each card shows that window's total and
 * clicking it scopes the page. Below them, outside any card, the composition of whichever window is
 * selected — it cuts the same number the side figures cut, along a different axis, so the two are
 * siblings rather than one containing the other (G8).
 *
 * The window is cut against `anchor` — the snapshot's scan moment — rather than the clock, so "today"
 * always means the same day as the trend chart's last bar (G2).
 */
/** The window's own label, so a caller can name the selected window outside the card row */
export function useWindowLabel(): (w: UsageWindow, note?: string) => string {
  const t = useDict()
  return (w, note) =>
    w === 'all' ? t.token.winAll(note ?? '') : w === 'today' ? t.token.winToday : w === 'd7' ? t.token.winD7 : t.token.winD30
}

export function TotalsCards({
  slice,
  rows,
  anchor,
  window: win,
  onWindow,
  note
}: {
  /** The selected window's figures; passed in because the caller also renders them elsewhere */
  slice: UsageSlice
  rows: UsageRow[]
  anchor: number
  window: UsageWindow
  onWindow: (w: UsageWindow) => void
  note?: string
}): JSX.Element {
  const t = useDict()
  const label = useWindowLabel()
  // Every window's own total, so a card can show it without being selected. Cheap on the measured
  // data (hundreds of rows), and it keeps "what does that window hold" answerable before clicking.
  const totals = useMemo(
    () => Object.fromEntries(USAGE_WINDOWS.map((w) => [w, sliceUsage(rows, w, anchor).total])) as Record<UsageWindow, number>,
    [rows, anchor]
  )
  const c = slice.composition
  const pct = (v: number): number => (slice.total ? (v / slice.total) * 100 : 0)
  // A bucket at exactly zero draws **nothing**. The segments carry a minimum width so the smallest
  // non-zero one survives rounding, and that floor turns a zero into a visible sliver — a drawing of
  // usage that does not exist. "Small" and "none" have to stay distinguishable.
  const seg = (v: number, cls: string): JSX.Element | null =>
    v > 0 ? <i className={cls} style={{ width: `${pct(v).toFixed(4)}%` }} /> : null
  // Two decimals only where one would round a real share to 0.0% — on real data output sits near
  // 0.28%. Above 1% the extra digit just makes the three legend figures look inconsistent.
  const share = (v: number): string => `${pct(v).toFixed(pct(v) < 1 ? 2 : 1)}%`
  return (
    <>
      <div className="tot-row">
        {USAGE_WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            className={`tot-c ${w === win ? 'on' : ''} ${totals[w] ? '' : 'zero'}`}
            aria-pressed={w === win}
            onClick={() => onWindow(w)}
          >
            <div className="k">{label(w, note)}</div>
            <div className="v">{fmtTok(totals[w])}</div>
          </button>
        ))}
      </div>
      {/* A window with no usage draws no bar: a zero-width bar is a drawing of nothing (G5) */}
      {slice.total > 0 && (
        <div className="comp-block">
          <div className="comp">
            {seg(c.cacheRead, 'comp-rd')}
            {seg(c.uncachedInput, 'comp-in')}
            {seg(c.output, 'comp-ou')}
          </div>
          {/* The smallest bucket is a fraction of a percent on real data, so the legend — not the
              width — is where its number can actually be read (G9) */}
          <div className="comp-lg">
            <span title={t.token.compTipCacheRead(fmtTok(c.cacheRead))}>
              <i className="comp-rd" />
              {t.token.compCacheRead} <b>{share(c.cacheRead)}</b>
            </span>
            <span title={t.token.compTipUncached(fmtTok(c.uncachedInput))}>
              <i className="comp-in" />
              {t.token.compUncached} <b>{share(c.uncachedInput)}</b>
            </span>
            <span title={t.token.compTipOutput(fmtTok(c.output))}>
              <i className="comp-ou" />
              {t.token.compOutput} <b>{share(c.output)}</b>
            </span>
          </div>
        </div>
      )}
    </>
  )
}

import { buildTrendBars, TREND_MODE_LABEL, type TrendBar, type TrendMode } from '@shared/trend'
import { layoutAxisLabels } from '@shared/axis'
import { PROVIDER_ORDER, PROVIDER_LABEL, providerOf } from '@shared/provider'
import type { Language, Locale } from '@shared/i18n'
import { monthDay } from '@shared/format'
import { useDict, useLanguage } from './language'

/** provider → a CSS class suffix (the colours are in theme.css) */
const PROVIDER_CLASS: Record<string, string> = {
  Anthropic: 'anthropic',
  OpenAI: 'openai',
  Google: 'google',
  xAI: 'xai',
  other: 'other'
}

/** The last 30 days (anchored on scannedAt) as a daily trend; combined mode stacks the two sides */
export function TrendChart({
  stats,
  anchor,
  archivedDays = [],
  window: win = 'all'
}: {
  stats: TokenStats
  anchor: number
  /** Days whose source session files the agent cleaned up, with values from the local archive */
  archivedDays?: string[]
  /** Days outside it are dimmed rather than removed — the chart's own span stays 30 days (D10) */
  window?: UsageWindow
}): JSX.Element {
  const lang = useLanguage()
  const t = useDict()
  const [mode, setMode] = useState<TrendMode>('total')
  const bars = useMemo(
    () => buildTrendBars(stats.byDay, anchor, mode, archivedDays),
    [stats, anchor, mode, archivedDays]
  )
  const max = Math.max(...bars.map((b) => b.total), 1)
  const chartRef = useRef<HTMLDivElement>(null)
  const axisRef = useRef<HTMLDivElement>(null)
  // Axis labels are pinned to real bar centres, so the layout is measured from the DOM after the bars
  // render; a width change re-lays out only the axis (the bars flex on their own)
  useEffect(() => {
    const chart = chartRef.current
    const axis = axisRef.current
    if (!chart || !axis) return
    const relayout = (): void => renderAxisInto(axis, chart, bars, lang)
    relayout()
    const ro = new ResizeObserver(relayout)
    ro.observe(chart)
    return () => ro.disconnect()
  }, [bars, lang])
  // The legend lists only providers that actually appear within the window (in the fixed order)
  const usedProviders = PROVIDER_ORDER.filter((p) => bars.some((b) => b.segments.some((s) => s.provider === p)))

  return (
    <div>
      <div className="grp-t">
        {t.token.trendTitle}
        <span className="seg">
          {/* Derived from the label Record rather than written out, so the mode bar is complete by
              construction — a new mode lands in TREND_MODE_LABEL (typecheck-forced) and appears here */}
          {(Object.keys(TREND_MODE_LABEL) as TrendMode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {TREND_MODE_LABEL[m] ?? t.label.trendTotal}
            </button>
          ))}
        </span>
      </div>
      <div className="chart" ref={chartRef}>
        {bars.map((b) => (
          <div
            key={b.day}
            className={`col ${b.archived ? 'arch' : ''} ${inWindow(b.day, win, anchor) ? '' : 'out'}`}
            style={{ height: `${Math.max(1.5, Math.round((b.total / max) * 100))}%` }}
            data-tip={tipOf(b, t.label.providerOther, t)}
            data-day={b.day}
          >
            {b.segments.map((sg) => (
              <div
                key={sg.provider}
                className={`sp ${PROVIDER_CLASS[sg.provider] ?? 'other'}`}
                style={{ height: `${b.total ? (sg.value / b.total) * 100 : 0}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="xaxis" ref={axisRef} />
      {mode === 'total' && usedProviders.length > 0 && (
        <div className="legend">
          {usedProviders.map((p) => (
            <span className="lg" key={p}>
              <span className={`sw ${PROVIDER_CLASS[p] ?? 'other'}`} />
              {PROVIDER_LABEL[p] ?? t.label.providerOther}
            </span>
          ))}
          <span className="lg-note">
            {t.token.legendNote}
            {win !== 'all' && t.token.legendDimNote}
          </span>
        </div>
      )}
    </div>
  )
}

// Text measurement reuses a single canvas, with the font taken from the axis container's computed style
// (a single truth with the CSS)
let measureCtx: CanvasRenderingContext2D | null = null
function axisMeasurer(axis: HTMLElement): (text: string) => number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  const cs = getComputedStyle(axis)
  const ctx = measureCtx
  if (!ctx) return (t) => t.length * 6
  ctx.font = `${cs.fontSize} ${cs.fontFamily}`
  return (t) => ctx.measureText(t).width
}

/** Write the label layout into the axis container (absolutely positioned spans whose data-day matches a
 * bar) */
function renderAxisInto(
  axis: HTMLElement,
  chart: HTMLElement,
  bars: TrendBar[],
  lang: Language
): void {
  const width = axis.clientWidth
  const cols = Array.from(chart.children) as HTMLElement[]
  if (!width || cols.length !== bars.length) return
  // Bar centres are converted from rects relative to the axis container — not relying on offsetParent
  // (a bar's positioned ancestor is not the chart)
  const axisLeft = axis.getBoundingClientRect().left
  const centers = cols.map((c) => {
    const r = c.getBoundingClientRect()
    return r.left + r.width / 2 - axisLeft
  })
  const labels = layoutAxisLabels(bars, centers, width, axisMeasurer(axis), (mon, dom) =>
    monthDay(lang, mon, dom)
  )
  axis.innerHTML = labels
    .map((l) => `<span style="left:${l.left.toFixed(1)}px" data-day="${bars[l.index].day}">${l.text}</span>`)
    .join('')
}

/** The hover breakdown: that day's total plus each side's value and share (multi-line, rendered by CSS
 * with white-space:pre) */
function tipOf(
  b: ReturnType<typeof buildTrendBars>[number],
  otherLabel: string,
  t: Locale
): string {
  const head = `${t.token.tipTotal(b.label, fmtTok(b.total))}${b.archived ? t.token.tipArchived : ''}`
  if (b.total === 0) return `${head}\n${t.token.tipNoUsage}`
  const lines = b.segments.map(
    (s) =>
      `${PROVIDER_LABEL[s.provider] ?? otherLabel}  ${fmtTok(s.value)}  ${Math.round((s.value / b.total) * 100)}%`
  )
  return [head, ...lines].join('\n')
}

/** Takes the models of whichever window is selected, not the whole-history projection (G3) */
export function ModelBars({ models }: { models: ModelUsage[] }): JSX.Element {
  const t = useDict()
  if (models.length === 0) return <div className="none">{t.token.noModelData}</div>
  const max = Math.max(...models.map((m) => m.total), 1)
  return (
    <div className="models">
      {models.map((m) => (
        <div className={`m ${PROVIDER_CLASS[providerOf(m.model)] ?? 'other'}`} key={`${m.side}:${m.model}`}>
          <span className="nm2 mono">{m.model}</span>
          <span className="tr">
            <i style={{ width: `${Math.max(1, Math.round((m.total / max) * 100))}%` }} />
          </span>
          <span className="num">{fmtTok(m.total)}</span>
        </div>
      ))}
    </div>
  )
}
