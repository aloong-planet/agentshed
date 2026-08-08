// Token 可视化共用件:数字格式化、汇总卡、30 天趋势条形图、模型拆分条。
// 概览 tab(项目)与 Agents 页 Token 分栏共用,数据同源仅分组键不同。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TokenStats, TokenTotals } from '@shared/domain'

export function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

export function TotalsCards({ stats, note }: { stats: TokenStats; note?: string }): JSX.Element {
  const cl = stats.bySide.claude
  const cx = stats.bySide.codex
  const sum = (f: keyof TokenTotals): number => cl[f] + cx[f]
  return (
    <div className="stats">
      <div className="stat">
        <div className="k">累计总量(两侧合计{note ? ` · ${note}` : ''})</div>
        <div className="v">{fmtTok(sum('total'))}</div>
        <div className="s">
          Claude {fmtTok(cl.total)} · Codex {fmtTok(cx.total)}
        </div>
      </div>
      <div className="stat">
        <div className="k">输入 / 输出</div>
        <div className="v">
          {fmtTok(sum('input'))} / {fmtTok(sum('output'))}
        </div>
        <div className="s">各侧原生口径分列</div>
      </div>
      <div className="stat cache">
        <div className="k">其中 cache(ccusage 口径已计入总量)</div>
        <div className="v">{fmtTok(sum('cacheRead'))}</div>
        <div className="s">读 {fmtTok(sum('cacheRead'))} · 写 {fmtTok(sum('cacheWrite'))}</div>
      </div>
    </div>
  )
}

import { buildTrendBars, TREND_MODE_LABEL, type TrendBar, type TrendMode } from '@shared/trend'
import { layoutAxisLabels } from '@shared/axis'
import { PROVIDER_ORDER, PROVIDER_LABEL, providerOf } from '@shared/provider'

/** provider → CSS 类后缀(配色见 theme.css) */
const PROVIDER_CLASS: Record<string, string> = {
  Anthropic: 'anthropic',
  OpenAI: 'openai',
  Google: 'google',
  other: 'other'
}

/** 近 30 天(以 scannedAt 为锚)日粒度趋势;合计模式按两侧堆叠 */
export function TrendChart({
  stats,
  anchor,
  archivedDays = []
}: {
  stats: TokenStats
  anchor: number
  /** 源会话文件已被 agent 清理、数值来自本地归档的天 */
  archivedDays?: string[]
}): JSX.Element {
  const [mode, setMode] = useState<TrendMode>('total')
  const bars = useMemo(
    () => buildTrendBars(stats.byDay, anchor, mode, archivedDays),
    [stats, anchor, mode, archivedDays]
  )
  const max = Math.max(...bars.map((b) => b.total), 1)
  const chartRef = useRef<HTMLDivElement>(null)
  const axisRef = useRef<HTMLDivElement>(null)
  // 轴标签钉真实柱中心,须在柱渲染后量 DOM 排布;宽度变化仅重排轴(柱 flex 自适应)
  useEffect(() => {
    const chart = chartRef.current
    const axis = axisRef.current
    if (!chart || !axis) return
    const relayout = (): void => renderAxisInto(axis, chart, bars)
    relayout()
    const ro = new ResizeObserver(relayout)
    ro.observe(chart)
    return () => ro.disconnect()
  }, [bars])
  // 图例只列窗口内真实出现过的 provider(顺序沿用固定序)
  const usedProviders = PROVIDER_ORDER.filter((p) => bars.some((b) => b.segments.some((s) => s.provider === p)))

  return (
    <div>
      <div className="grp-t">
        近 30 天趋势(本地时区 · 日粒度)
        <span className="seg">
          {(['total', 'Claude', 'Codex'] as const).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {TREND_MODE_LABEL[m]}
            </button>
          ))}
        </span>
      </div>
      <div className="chart" ref={chartRef}>
        {bars.map((b) => (
          <div
            key={b.day}
            className={`col ${b.archived ? 'arch' : ''}`}
            style={{ height: `${Math.max(1.5, Math.round((b.total / max) * 100))}%` }}
            data-tip={tipOf(b)}
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
              {PROVIDER_LABEL[p]}
            </span>
          ))}
          <span className="lg-note">柱高=当日总量,分段=各 provider 占比</span>
        </div>
      )}
    </div>
  )
}

// 文本测宽复用单个 canvas,字体取自轴容器计算样式(与 CSS 单一事实)
let measureCtx: CanvasRenderingContext2D | null = null
function axisMeasurer(axis: HTMLElement): (text: string) => number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  const cs = getComputedStyle(axis)
  const ctx = measureCtx
  if (!ctx) return (t) => t.length * 6
  ctx.font = `${cs.fontSize} ${cs.fontFamily}`
  return (t) => ctx.measureText(t).width
}

/** 把标签排布结果写进轴容器(绝对定位 span,data-day 与柱对应) */
function renderAxisInto(axis: HTMLElement, chart: HTMLElement, bars: TrendBar[]): void {
  const width = axis.clientWidth
  const cols = Array.from(chart.children) as HTMLElement[]
  if (!width || cols.length !== bars.length) return
  // 柱中心用 rect 相对轴容器换算——不依赖 offsetParent(柱的定位祖先并非 chart)
  const axisLeft = axis.getBoundingClientRect().left
  const centers = cols.map((c) => {
    const r = c.getBoundingClientRect()
    return r.left + r.width / 2 - axisLeft
  })
  const labels = layoutAxisLabels(bars, centers, width, axisMeasurer(axis))
  axis.innerHTML = labels
    .map((l) => `<span style="left:${l.left.toFixed(1)}px" data-day="${bars[l.index].day}">${l.text}</span>`)
    .join('')
}

/** 悬停明细:当日合计 + 各侧数值与占比(多行,CSS 用 white-space:pre 渲染) */
function tipOf(b: ReturnType<typeof buildTrendBars>[number]): string {
  const head = `${b.label} · 合计 ${fmtTok(b.total)}${b.archived ? ' · 归档(源文件已清理)' : ''}`
  if (b.total === 0) return `${head}\n无用量`
  const lines = b.segments.map(
    (s) => `${PROVIDER_LABEL[s.provider]}  ${fmtTok(s.value)}  ${Math.round((s.value / b.total) * 100)}%`
  )
  return [head, ...lines].join('\n')
}

export function ModelBars({ stats }: { stats: TokenStats }): JSX.Element {
  if (stats.byModel.length === 0) return <div className="none">暂无模型数据</div>
  const max = Math.max(...stats.byModel.map((m) => m.total), 1)
  return (
    <div className="models">
      {stats.byModel.map((m) => (
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
