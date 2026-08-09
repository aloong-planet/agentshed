// Trend chart x axis label layout (a pure function shared by both ends, unit testable with measurement
// injected):
// label data days only (total > 0 under the current view) with no evenly spaced filler; the first
// visible label and the first visible label after a month change
// use M/D and the rest show the day number alone; when space runs out, thin from right to left; labels
// are pinned to bar centres and clamped at the ends.
import type { TrendBar } from './trend'

export interface AxisLabel {
  /** The corresponding bar index (an index into bars) */
  index: number
  /** 'M/D' (the first visible one, or at a month change) or 'D' */
  text: string
  /** The label's left edge in x relative to the axis container (px) */
  left: number
}

/** The minimum clear gap between adjacent labels (px) */
export const AXIS_MIN_GAP = 4

export function layoutAxisLabels(
  bars: Array<Pick<TrendBar, 'day' | 'total'>>,
  centers: number[],
  width: number,
  measure: (text: string) => number,
  /**
   * How month/day is turned into a string (ticket 12). Injected rather than calling Intl here: this
   * module is a **pure function**,
   * shared by both ends and unit tested without a locale environment; the default keeps the existing
   * `M/D` order and the renderer passes a localised version.
   */
  monthDay: (mon: number, dom: number) => string = (mon, dom) => `${mon}/${dom}`
): AxisLabel[] {
  interface Cand extends AxisLabel {
    mon: number
    dom: number
    w: number
  }
  const act: Cand[] = []
  bars.forEach((b, index) => {
    if (b.total <= 0) return
    act.push({ index, mon: Number(b.day.slice(5, 7)), dom: Number(b.day.slice(8, 10)), text: '', w: 0, left: 0 })
  })
  // The text depends on "the previous visible label's month", and thinning changes the text width →
  // layout and removal iterate to a fixed point.
  // Termination is guaranteed: each round either exits with no removal or removes at least one, so act
  // shrinks monotonically.
  for (;;) {
    let prevMon: number | null = null
    for (const c of act) {
      c.text = prevMon === c.mon ? String(c.dom) : monthDay(c.mon, c.dom)
      c.w = measure(c.text)
      // Pinned to the bar centre, with the ends clamped to the edge (leaving a 1px margin)
      c.left = Math.min(Math.max(centers[c.index] - c.w / 2, 1), width - 1 - c.w)
      prevMon = c.mon
    }
    let removed = false
    for (;;) {
      let conflictAt = -1
      for (let i = 1; i < act.length; i++) {
        if (act[i].left < act[i - 1].left + act[i - 1].w + AXIS_MIN_GAP) {
          conflictAt = i
          break
        }
      }
      if (conflictAt < 0) break
      act.splice(conflictAt, 1)
      removed = true
    }
    if (!removed) break
  }
  return act.map((c) => ({ index: c.index, text: c.text, left: c.left }))
}
