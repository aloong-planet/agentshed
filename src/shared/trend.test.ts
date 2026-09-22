// Trend bar segmentation: in combined mode each bar stacks the two sides (Claude/Codex), and single-side
// mode degenerates to one segment.
import { describe, it, expect } from 'vitest'
import { buildTrendBars } from './trend'
import { providerOf } from './provider'
import { inWindow } from './usage'
import type { DayUsage } from './domain'

const anchor = Date.parse('2026-07-30T12:00:00Z')
const day = (
  d: string,
  claude: number,
  codex: number,
  byProvider?: DayUsage['byProvider']
): DayUsage => ({
  day: d,
  bySide: { claude, codex, grok: 0 },
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

  it.each([
    [60, '2026-06-01'],
    [90, '2026-05-02']
  ] as const)('shows %i calendar days including older archived data', (span, first) => {
    const end = new Date(2026, 6, 30, 12).getTime()
    const bars = buildTrendBars([
      day('2026-05-01', 999, 0),
      day(first, 200, 50),
      day('2026-07-30', 10, 0),
      day('2026-07-31', 999, 0)
    ], end, 'total', [first], span)
    expect(bars).toHaveLength(span)
    expect(bars[0]).toMatchObject({ day: first, total: 250, archived: true })
    expect(bars[0].segments).toEqual([
      { provider: 'Anthropic', value: 200 }, { provider: 'OpenAI', value: 50 }
    ])
    expect(bars.at(-1)).toMatchObject({ day: '2026-07-30', total: 10 })
    expect(bars.filter(b => b.total > 0)).toHaveLength(2)
    expect(bars[1]).toMatchObject({ total: 0, segments: [] })
    const single = buildTrendBars([day(first, 200, 50)], end, 'Codex', [first], span)
    expect(single[0]).toMatchObject({ total: 50, segments: [{ provider: 'OpenAI', value: 50 }] })
  })

  it('uses consecutive local dates across daylight-saving changes and year boundaries', () => {
    const previous = process.env.TZ
    try {
      process.env.TZ = 'America/New_York'
      for (const [end, first, last] of [
        [new Date(2026, 10, 1, 23, 30), '2026-08-04', '2026-11-01'],
        [new Date(2026, 2, 9, 0, 30), '2025-12-10', '2026-03-09']
      ] as const) {
        const bars = buildTrendBars([], end.getTime(), 'total', [], 90)
        expect(new Set(bars.map(b => b.day)).size).toBe(90)
        expect(bars.filter(b => inWindow(b.day, 'd7', end.getTime()))).toHaveLength(7)
        expect(bars[0].day).toBe(first)
        expect(bars.at(-1)?.day).toBe(last)
        expect(bars.every(b => b.total === 0 && b.segments.length === 0)).toBe(true)
      }
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
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

  it('Grok mode reads the grok side and degenerates to one xAI segment (D4; #124)', () => {
    const row = { day: today, bySide: { claude: 300, codex: 100, grok: 40 }, byProvider: {} }
    const gk = buildTrendBars([row], anchor, 'Grok', [])
    expect(gk[29].total).toBe(40)
    expect(gk[29].segments).toEqual([{ provider: 'xAI', value: 40 }])
    // The other sides' volume must not leak into Grok mode
    const empty = buildTrendBars(
      [{ day: today, bySide: { claude: 300, codex: 100, grok: 0 }, byProvider: {} }],
      anchor,
      'Grok',
      []
    )
    expect(empty[29].total).toBe(0)
    expect(empty[29].segments).toEqual([])
  })

  it('an unknown model\'s volume still enters a segment: the key is produced by providerOf and consumed by PROVIDER_ORDER', () => {
    // Since the key type was tightened to Provider, a producer and consumer that disagree on the
    // **spelling** of a key are caught by typecheck. What that cannot catch is the *runtime* question
    // this case asks: does an unrecognised model's volume actually land in a segment at all, rather
    // than being dropped on the way through? So the key is still built with providerOf rather than
    // written as a literal — the point is the pipeline, not the name.
    const key = providerOf('llama-4-70b')
    const bars = buildTrendBars(
      [{ day: today, bySide: { claude: 0, codex: 0, grok: 0 }, byProvider: { [key]: 42 } }],
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
