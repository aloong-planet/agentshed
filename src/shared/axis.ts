// 趋势图 x 轴标签排布(纯函数,两端共用、注入测宽可单测):
// 只标数据日(当前视图 total>0),无等距补白;首个可见标签与月份变化后的首个可见标签
// 用 M/D,其余只标日数字;放不下时从右往左简略;标签钉柱中心,首尾出界 clamp。
import type { TrendBar } from './trend'

export interface AxisLabel {
  /** 对应柱索引(bars 下标) */
  index: number
  /** 'M/D'(首个可见/月份变化处)或 'D' */
  text: string
  /** 标签左缘相对轴容器的 x(px) */
  left: number
}

/** 相邻标签最小净距(px) */
export const AXIS_MIN_GAP = 4

export function layoutAxisLabels(
  bars: Array<Pick<TrendBar, 'day' | 'total'>>,
  centers: number[],
  width: number,
  measure: (text: string) => number,
  /**
   * 月/日的成串方式(票 12)。注入而非在此调 Intl:本模块是**纯函数**,
   * 两端共用且单测不带语言环境;默认保持既有的 `M/D` 语序,渲染层传本地化版本。
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
  // 文本依赖"上一个可见标签的月份",简略又会改变文本宽度 → 排布与删除循环到不动点。
  // 必终止:每轮要么无删除退出,要么至少删一个,act 单调缩短。
  for (;;) {
    let prevMon: number | null = null
    for (const c of act) {
      c.text = prevMon === c.mon ? String(c.dom) : monthDay(c.mon, c.dom)
      c.w = measure(c.text)
      // 钉柱中心,首尾出界贴边 clamp(留 1px 边距)
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
