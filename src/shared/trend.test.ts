// 趋势柱分段:合计模式下每柱按两侧堆叠(Claude/Codex),单侧模式退化为单段。
import { describe, it, expect } from 'vitest'
import { buildTrendBars } from './trend'
import type { DayUsage } from './domain'

const anchor = Date.parse('2026-07-30T12:00:00Z')
const day = (d: string, claude: number, codex: number): DayUsage => ({ day: d, claude, codex })
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

  it('合计模式:两侧都有量 → 两段,Claude 在下、Codex 在上,段值与总量一致', () => {
    const bars = buildTrendBars([day(today, 300, 100)], anchor, '合计', [])
    const b = bars[29]
    expect(b.total).toBe(400)
    expect(b.segments.map((s) => s.side)).toEqual(['claude', 'codex'])
    expect(b.segments.map((s) => s.value)).toEqual([300, 100])
  })

  it('合计模式:只有一侧有量 → 只出一段(零值不产生空段)', () => {
    const bars = buildTrendBars([day(today, 300, 0)], anchor, '合计', [])
    expect(bars[29].segments).toEqual([{ side: 'claude', value: 300 }])
  })

  it('单侧模式:只算该侧,另一侧不进段也不进总量', () => {
    const cl = buildTrendBars([day(today, 300, 100)], anchor, 'Claude', [])
    expect(cl[29].total).toBe(300)
    expect(cl[29].segments).toEqual([{ side: 'claude', value: 300 }])
    const cx = buildTrendBars([day(today, 300, 100)], anchor, 'Codex', [])
    expect(cx[29].total).toBe(100)
    expect(cx[29].segments).toEqual([{ side: 'codex', value: 100 }])
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
