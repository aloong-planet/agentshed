// 趋势柱分段:合计模式下每柱按两侧堆叠(Claude/Codex),单侧模式退化为单段。
import { describe, it, expect } from 'vitest'
import { buildTrendBars } from './trend'
import type { DayUsage } from './domain'

const anchor = Date.parse('2026-07-30T12:00:00Z')
const day = (d: string, claude: number, codex: number, byProvider?: Record<string, number>): DayUsage => ({
  day: d,
  claude,
  codex,
  byProvider: byProvider ?? { Anthropic: claude, OpenAI: codex }
})
/** 取锚点当天的本地日键,免受运行时区影响 */
function localDay(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const today = localDay(anchor)
const yesterday = localDay(anchor - 86_400_000)

describe('buildTrendBars', () => {
  it('固定产出 30 根柱,按日期升序,末根为锚点当天', () => {
    const bars = buildTrendBars([], anchor, '合计', [])
    expect(bars).toHaveLength(30)
    expect(bars[29].day).toBe(today)
    expect(bars[28].day).toBe(yesterday)
  })

  it('合计模式:按 provider 分段,顺序固定 Anthropic→OpenAI→…,段值与总量一致', () => {
    const bars = buildTrendBars([day(today, 300, 100)], anchor, '合计', [])
    const b = bars[29]
    expect(b.total).toBe(400)
    expect(b.segments.map((s) => s.provider)).toEqual(['Anthropic', 'OpenAI'])
    expect(b.segments.map((s) => s.value)).toEqual([300, 100])
  })

  it('同一 agent 用了多家 provider 时按 provider 拆(不按 agent 侧)', () => {
    // 例:某 agent 既用 claude-* 又用 gemini-*(byProvider 由引擎按模型名归并)
    const bars = buildTrendBars(
      [day(today, 300, 0, { Anthropic: 200, Google: 100 })],
      anchor,
      '合计',
      []
    )
    expect(bars[29].segments.map((s) => s.provider)).toEqual(['Anthropic', 'Google'])
    expect(bars[29].total).toBe(300)
  })

  it('合计模式:只有一个 provider 有量 → 只出一段(零值不产生空段)', () => {
    const bars = buildTrendBars([day(today, 300, 0)], anchor, '合计', [])
    expect(bars[29].segments).toEqual([{ provider: 'Anthropic', value: 300 }])
  })

  it('单侧模式(按 agent 侧筛选)仍可用:只算该侧,段退化为单段', () => {
    const cl = buildTrendBars([day(today, 300, 100)], anchor, 'Claude', [])
    expect(cl[29].total).toBe(300)
    expect(cl[29].segments).toEqual([{ provider: 'Anthropic', value: 300 }])
    const cx = buildTrendBars([day(today, 300, 100)], anchor, 'Codex', [])
    expect(cx[29].total).toBe(100)
    expect(cx[29].segments).toEqual([{ provider: 'OpenAI', value: 100 }])
  })

  it('无数据的天:总量 0、无段', () => {
    const bars = buildTrendBars([], anchor, '合计', [])
    expect(bars[0].total).toBe(0)
    expect(bars[0].segments).toEqual([])
  })

  it('归档天被标记(UI 据此画斜纹)', () => {
    const bars = buildTrendBars([day(yesterday, 5, 0)], anchor, '合计', [yesterday])
    expect(bars[28].archived).toBe(true)
    expect(bars[29].archived).toBe(false)
  })

  it('窗口外的历史天不进 30 根柱', () => {
    const old = localDay(anchor - 60 * 86_400_000)
    const bars = buildTrendBars([day(old, 999, 0), day(today, 1, 0)], anchor, '合计', [])
    expect(bars.some((b) => b.day === old)).toBe(false)
    expect(bars[29].total).toBe(1)
  })
})
