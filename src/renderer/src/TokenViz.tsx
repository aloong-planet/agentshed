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
        <div className="k">其中 cache(ccusage 口径已计入总量)</div>
        <div className="v">{fmtTok(sum('cacheRead'))}</div>
        <div className="s">读 {fmtTok(sum('cacheRead'))} · 写 {fmtTok(sum('cacheWrite'))}</div>
      </div>
    </div>
  )
}

import { buildTrendBars, type TrendMode } from '@shared/trend'
import { PROVIDER_ORDER, providerOf } from '@shared/provider'

/** provider → CSS 类后缀(配色见 theme.css) */
const PROVIDER_CLASS: Record<string, string> = {
  Anthropic: 'anthropic',
  OpenAI: 'openai',
  Google: 'google',
  其他: 'other'
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
  const [mode, setMode] = useState<TrendMode>('合计')
  const bars = buildTrendBars(stats.byDay, anchor, mode, archivedDays)
  const max = Math.max(...bars.map((b) => b.total), 1)
  // 图例只列窗口内真实出现过的 provider(顺序沿用固定序)
  const usedProviders = PROVIDER_ORDER.filter((p) => bars.some((b) => b.segments.some((s) => s.provider === p)))

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
        {bars.map((b) => (
          <div
            key={b.day}
            className={`col ${b.archived ? 'arch' : ''}`}
            style={{ height: `${Math.max(1.5, Math.round((b.total / max) * 100))}%` }}
            data-tip={tipOf(b)}
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
      <div className="xaxis">
        {bars.map((b, i) => (
          <span key={b.day}>{i % 5 === 0 ? b.label : ''}</span>
        ))}
      </div>
      {mode === '合计' && usedProviders.length > 0 && (
        <div className="legend">
          {usedProviders.map((p) => (
            <span className="lg" key={p}>
              <span className={`sw ${PROVIDER_CLASS[p] ?? 'other'}`} />
              {p}
            </span>
          ))}
          <span className="lg-note">柱高=当日总量,分段=各 provider 占比</span>
        </div>
      )}
    </div>
  )
}

/** 悬停明细:当日合计 + 各侧数值与占比(多行,CSS 用 white-space:pre 渲染) */
function tipOf(b: ReturnType<typeof buildTrendBars>[number]): string {
  const head = `${b.label} · 合计 ${fmtTok(b.total)}${b.archived ? ' · 归档(源文件已清理)' : ''}`
  if (b.total === 0) return `${head}\n无用量`
  const lines = b.segments.map(
    (s) => `${s.provider}  ${fmtTok(s.value)}  ${Math.round((s.value / b.total) * 100)}%`
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
