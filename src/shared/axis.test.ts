// x axis label layout: data days only, hierarchical date formats, thinning, pinning to bar centres and
// clamping.
// The coverage list = the spec's "failure modes and boundaries" 1–14; 15 (resize and refresh
// concurrently) is render wiring,
// guaranteed by useEffect's semantics and not automated (the gap and the conditions for covering it are
// in the comments of the e2e trend chart cases).
import { describe, it, expect } from 'vitest'
import { layoutAxisLabels, AXIS_MIN_GAP } from './axis'

/** A width-measurement stub: 6px per character, deterministic, so expectations can be worked out by hand */
const measure = (t: string): number => t.length * 6

/** Build bars: days are 'YYYY-MM-DD', and days outside dataDoms have total=0 */
const mkBars = (days: string[], dataDays: string[]): Array<{ day: string; total: number }> =>
  days.map((day) => ({ day, total: dataDays.includes(day) ? 100 : 0 }))

/** Evenly spaced bar centres */
const mkCenters = (n: number, step: number, first: number): number[] =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see #192
  [...Array(n)].map((_, i) => first + i * step)

describe('layoutAxisLabels · hierarchical formats', () => {
  it('the first visible label is M/D and the rest of the month show the day number alone', () => {
    const days = ['2026-07-05', '2026-07-06', '2026-07-08']
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(3, 60, 30), 300, measure)
    expect(out.map((l) => l.text)).toEqual(['7/5', '6', '8'])
  })

  it('across months: the first visible label after a month change is promoted back to M/D', () => {
    const days = ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02']
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(4, 60, 30), 340, measure)
    expect(out.map((l) => l.text)).toEqual(['7/30', '31', '8/1', '2'])
  })
})

/** Assert: no overlap (a clear gap of ≥ AXIS_MIN_GAP) and nothing outside [0,width] */
function expectNoOverlapInBounds(out: ReturnType<typeof layoutAxisLabels>, width: number): void {
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]
    expect(out[i].left).toBeGreaterThanOrEqual(prev.left + measure(prev.text) + AXIS_MIN_GAP)
  }
  for (const l of out) {
    expect(l.left).toBeGreaterThanOrEqual(0)
    expect(l.left + measure(l.text)).toBeLessThanOrEqual(width)
  }
}

describe('layoutAxisLabels · thinning and layout', () => {
  it('when a cluster of adjacent data days will not fit, every other one is dropped (the right-hand member of a conflicting pair), and survivors stay pinned to bar centres', () => {
    const days = ['2026-07-10', '2026-07-11', '2026-07-12']
    const out = layoutAxisLabels(mkBars(days, days), [20, 33, 46], 415, measure)
    expect(out.map((l) => [l.index, l.text])).toEqual([[0, '7/10'], [2, '12']])
    // A non-clamped label's centre = the bar centre ('12' w=12, left=46-6=40)
    expect(out[1].left + measure('12') / 2).toBe(46)
  })

  it('the first day\'s label has its left edge clamped inside the container', () => {
    const out = layoutAxisLabels(mkBars(['2026-07-05'], ['2026-07-05']), [2], 300, measure)
    expect(out).toEqual([{ index: 0, text: '7/5', left: 1 }])
  })

  it('the last day\'s label has its right edge clamped inside the container', () => {
    const out = layoutAxisLabels(mkBars(['2026-07-31'], ['2026-07-31']), [298], 300, measure)
    // 'M/D' w=24, right edge clamped: left = 300-1-24
    expect(out).toEqual([{ index: 0, text: '7/31', left: 275 }])
  })

  it('when a month-boundary label is thinned away, the next surviving label in the new month is promoted back to M/D', () => {
    const days = ['2026-07-31', '2026-08-01', '2026-08-02']
    const out = layoutAxisLabels(mkBars(days, days), [10, 24, 39], 200, measure)
    expect(out.map((l) => l.text)).toEqual(['7/31', '8/2'])
  })

  it('30 days of data in a wide window: everything labelled, the first and month boundaries as M/D, with no overlap and nothing out of bounds', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see #192
    const days = [...Array(30)].map((_, i) =>
      i < 21 ? `2026-07-${String(11 + i).padStart(2, '0')}` : `2026-08-0${i - 20}`
    )
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(30, 29, 15), 900, measure)
    expect(out).toHaveLength(30)
    expect(out[0].text).toBe('7/11')
    expect(out[21].text).toBe('8/1')
    expectNoOverlapInBounds(out, 900)
  })

  it('extremely narrow: keeps thinning, leaves at least 1, no overlap, nothing out of bounds, and terminates', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see #192
    const days = [...Array(30)].map((_, i) =>
      i < 21 ? `2026-07-${String(11 + i).padStart(2, '0')}` : `2026-08-0${i - 20}`
    )
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(30, 4, 3), 130, measure)
    expect(out.length).toBeGreaterThanOrEqual(1)
    expectNoOverlapInBounds(out, 130)
  })
})

describe('layoutAxisLabels · selection', () => {
  it('no data at all → no labels', () => {
    const days = ['2026-07-01', '2026-07-02', '2026-07-03']
    expect(layoutAxisLabels(mkBars(days, []), mkCenters(3, 40, 20), 200, measure)).toEqual([])
  })

  it('only data days are selected, formatted M/D; empty days (including the first and last) get no label', () => {
    const days = ['2026-07-01', '2026-07-16', '2026-07-30']
    const out = layoutAxisLabels(mkBars(days, ['2026-07-16']), mkCenters(3, 80, 40), 300, measure)
    expect(out.map((l) => [l.index, l.text])).toEqual([[1, '7/16']])
  })

  it('what counts as a data day follows the total passed in (the view-switching semantics): the same day called with 0 and a positive value makes the label disappear and reappear', () => {
    const days = ['2026-07-10', '2026-07-11']
    const centers = mkCenters(2, 80, 40)
    const on = layoutAxisLabels(mkBars(days, ['2026-07-11']), centers, 300, measure)
    const off = layoutAxisLabels(mkBars(days, []), centers, 300, measure)
    expect(on.map((l) => l.index)).toEqual([1])
    expect(off).toEqual([])
  })
})
