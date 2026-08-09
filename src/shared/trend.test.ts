// Trend bar segmentation: in combined mode each bar stacks the two sides (Claude/Codex), and single-side
// mode degenerates to one segment.
import { describe, it, expect } from 'vitest'
import { buildTrendBars } from './trend'
import { providerOf } from './provider'
import type { DayUsage } from './domain'

const anchor = Date.parse('2026-07-30T12:00:00Z')
const day = (d: string, claude: number, codex: number, byProvider?: Record<string, number>): DayUsage => ({
  day: d,
  claude,
  codex,
  byProvider: byProvider ?? { Anthropic: claude, OpenAI: codex }
})
/** Take the anchor day's local day key, so the run's time zone does not affect it */
function localDay(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const today = localDay(anchor)
const yesterday = localDay(anchor - 86_400_000)

describe('buildTrendBars', () => {
  it('always produces 30 bars in ascending date order, with the last as the anchor day', () => {
    const bars = buildTrendBars([], anchor, 'total', [])
    expect(bars).toHaveLength(30)
    expect(bars[29].day).toBe(today)
    expect(bars[28].day).toBe(yesterday)
  })

  it('combined mode: segments by provider in the fixed order Anthropic→OpenAI→…, with the segments summing to the total', () => {
    const bars = buildTrendBars([day(today, 300, 100)], anchor, 'total', [])
    const b = bars[29]
    expect(b.total).toBe(400)
    expect(b.segments.map((s) => s.provider)).toEqual(['Anthropic', 'OpenAI'])
    expect(b.segments.map((s) => s.value)).toEqual([300, 100])
  })

  it('splits by provider rather than agent side when one agent used several providers', () => {
    // For example, an agent using both claude-* and gemini-* (byProvider is merged by model name in the
    // engine)
    const bars = buildTrendBars(
      [day(today, 300, 0, { Anthropic: 200, Google: 100 })],
      anchor,
      'total',
      []
    )
    expect(bars[29].segments.map((s) => s.provider)).toEqual(['Anthropic', 'Google'])
    expect(bars[29].total).toBe(300)
  })

  it('combined mode: only one provider has volume → only one segment (a zero produces no empty segment)', () => {
    const bars = buildTrendBars([day(today, 300, 0)], anchor, 'total', [])
    expect(bars[29].segments).toEqual([{ provider: 'Anthropic', value: 300 }])
  })

  it('single-side mode (filtering by agent side) still works: only that side counts and it degenerates to one segment', () => {
    const cl = buildTrendBars([day(today, 300, 100)], anchor, 'Claude', [])
    expect(cl[29].total).toBe(300)
    expect(cl[29].segments).toEqual([{ provider: 'Anthropic', value: 300 }])
    const cx = buildTrendBars([day(today, 300, 100)], anchor, 'Codex', [])
    expect(cx[29].total).toBe(100)
    expect(cx[29].segments).toEqual([{ provider: 'OpenAI', value: 100 }])
  })

  it('an unknown model\'s volume still enters a segment: the key is produced by providerOf and consumed by PROVIDER_ORDER', () => {
    // byProvider's key type is Record<string, number> — when the producer (providerOf's return value)
    // and the consumer (PROVIDER_ORDER's elements) disagree, **typecheck does not report it** and the
    // segmentation silently
    // goes empty. So this deliberately builds the key with providerOf rather than hard-writing a string:
    // changing only one half makes this case go red.
    const key = providerOf('llama-4-70b')
    const bars = buildTrendBars(
      [{ day: today, claude: 0, codex: 0, byProvider: { [key]: 42 } }],
      anchor,
      'total',
      []
    )
    expect(bars[29].total).toBe(42)
    expect(bars[29].segments).toEqual([{ provider: key, value: 42 }])
  })

  it('a day with no data: total 0, no segments', () => {
    const bars = buildTrendBars([], anchor, 'total', [])
    expect(bars[0].total).toBe(0)
    expect(bars[0].segments).toEqual([])
  })

  it('archived days are marked (the UI draws the hatching from it)', () => {
    const bars = buildTrendBars([day(yesterday, 5, 0)], anchor, 'total', [yesterday])
    expect(bars[28].archived).toBe(true)
    expect(bars[29].archived).toBe(false)
  })

  it('historical days outside the window do not enter the 30 bars', () => {
    const old = localDay(anchor - 60 * 86_400_000)
    const bars = buildTrendBars([day(old, 999, 0), day(today, 1, 0)], anchor, 'total', [])
    expect(bars.some((b) => b.day === old)).toBe(false)
    expect(bars[29].total).toBe(1)
  })
})
