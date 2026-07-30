// 趋势柱分段(纯函数,两端共用、可单测):
// 合计模式下每根柱按 agent 侧堆叠(Claude 在下、Codex 在上),单侧模式退化为单段。
// 零值不产生空段;窗口固定近 30 天,按本地时区切日。
import type { AgentSide, DayUsage } from './domain'

export type TrendMode = '合计' | 'Claude' | 'Codex'

export interface TrendSegment {
  side: AgentSide
  value: number
}

export interface TrendBar {
  /** 本地日键 YYYY-MM-DD */
  day: string
  /** 展示用短标签 M/D */
  label: string
  total: number
  segments: TrendSegment[]
  /** 源会话文件已被 agent 清理、数值来自本地归档 */
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
    const claude = mode === 'Codex' ? 0 : (row?.claude ?? 0)
    const codex = mode === 'Claude' ? 0 : (row?.codex ?? 0)
    const segments: TrendSegment[] = []
    if (claude > 0) segments.push({ side: 'claude', value: claude })
    if (codex > 0) segments.push({ side: 'codex', value: codex })
    bars.push({
      day,
      label: `${at.getMonth() + 1}/${at.getDate()}`,
      total: claude + codex,
      segments,
      archived: archived.has(day)
    })
  }
  return bars
}
