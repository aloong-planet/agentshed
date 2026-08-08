// 趋势柱分段(纯函数,两端共用、可单测):
// 合计模式下每根柱按 agent 侧堆叠(Claude 在下、Codex 在上),单侧模式退化为单段。
// 零值不产生空段;窗口固定近 30 天,按本地时区切日。
import type { DayUsage } from './domain'
import { PROVIDER_ORDER, type Provider } from './provider'

/** 值是语言无关标识符,界面文字见 TREND_MODE_LABEL */
export type TrendMode = 'total' | 'Claude' | 'Codex'

/**
 * 界面显示名。Claude / Codex 是产品名、各语言通用;
 * **只有 `total` 随界面语言变化**,故此处留 null,由渲染层从字典取(票 07)。
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
    const segments: TrendSegment[] = []
    let total = 0
    if (mode === 'total') {
      // 按 provider 分段,顺序固定(图例与堆叠不随当日数据抖动)
      for (const p of PROVIDER_ORDER) {
        const v = row?.byProvider?.[p] ?? 0
        if (v > 0) segments.push({ provider: p, value: v })
        total += v
      }
    } else {
      // 单侧筛选:该侧总量退化为单段,provider 取该侧主 provider
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
