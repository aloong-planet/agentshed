// Token 可视化共用件:数字格式化、汇总卡、30 天趋势条形图、模型拆分条。
// 概览 tab(项目)与 Agents 页 Token 分栏共用,数据同源仅分组键不同。
import { useState } from 'react'
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
        <div className="k">cache 命中(单列,不计入总量)</div>
        <div className="v">{fmtTok(sum('cacheRead'))}</div>
        <div className="s">读 {fmtTok(sum('cacheRead'))} · 写 {fmtTok(sum('cacheWrite'))}</div>
      </div>
    </div>
  )
}

type Mode = '合计' | 'Claude' | 'Codex'

/** 近 30 天(以 scannedAt 为锚)日粒度趋势;合计/单侧切换 */
export function TrendChart({ stats, anchor }: { stats: TokenStats; anchor: number }): JSX.Element {
  const [mode, setMode] = useState<Mode>('合计')
  const days: Array<{ day: string; label: string; v: number }> = []
  const byDay = new Map(stats.byDay.map((d) => [d.day, d]))
  for (let i = 29; i >= 0; i--) {
    const d = new Date(anchor - i * 86_400_000)
    const p = (n: number): string => String(n).padStart(2, '0')
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const row = byDay.get(key)
    const v =
      mode === 'Claude' ? (row?.claude ?? 0) : mode === 'Codex' ? (row?.codex ?? 0) : (row?.claude ?? 0) + (row?.codex ?? 0)
    days.push({ day: key, label: `${d.getMonth() + 1}/${d.getDate()}`, v })
  }
  const max = Math.max(...days.map((d) => d.v), 1)
  return (
    <div>
      <div className="grp-t">
        近 30 天趋势(本地时区 · 日粒度)
        <span className="seg">
          {(['合计', 'Claude', 'Codex'] as const).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </span>
      </div>
      <div className="chart">
        {days.map((d) => (
          <div
            key={d.day}
            className={`bar ${mode === 'Codex' ? 'x' : ''}`}
            style={{ height: `${Math.max(2, Math.round((d.v / max) * 100))}%` }}
            title={`${d.label} · ${fmtTok(d.v)} tok`}
          />
        ))}
      </div>
    </div>
  )
}

export function ModelBars({ stats }: { stats: TokenStats }): JSX.Element {
  if (stats.byModel.length === 0) return <div className="none">暂无模型数据</div>
  const max = Math.max(...stats.byModel.map((m) => m.total), 1)
  return (
    <div className="models">
      {stats.byModel.map((m) => (
        <div className={`m ${m.side === 'codex' ? 'x' : ''}`} key={`${m.side}:${m.model}`}>
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
