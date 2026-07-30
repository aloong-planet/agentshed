// x 轴标签排布:只标数据日、层级日期格式、简略降级、钉柱中心与 clamp。
// 覆盖清单 = spec「失败模式与边界」1-14;15(resize+刷新并发)属渲染接线,
// 由 useEffect 语义保证、未自动化(缺口与补测条件见 e2e 趋势图用例注释)。
import { describe, it, expect } from 'vitest'
import { layoutAxisLabels, AXIS_MIN_GAP } from './axis'

/** 测宽 stub:6px/字符,deterministic,使期望值可手算 */
const measure = (t: string): number => t.length * 6

/** 造 bars:days 为 'YYYY-MM-DD',dataDoms 之外的日子 total=0 */
const mkBars = (days: string[], dataDays: string[]): Array<{ day: string; total: number }> =>
  days.map((day) => ({ day, total: dataDays.includes(day) ? 100 : 0 }))

/** 等距柱中心 */
const mkCenters = (n: number, step: number, first: number): number[] =>
  [...Array(n)].map((_, i) => first + i * step)

describe('layoutAxisLabels · 层级格式', () => {
  it('首个可见标签 M/D,同月其余只标日数字', () => {
    const days = ['2026-07-05', '2026-07-06', '2026-07-08']
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(3, 60, 30), 300, measure)
    expect(out.map((l) => l.text)).toEqual(['7/5', '6', '8'])
  })

  it('跨月:月份变化后的首个可见标签升回 M/D', () => {
    const days = ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02']
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(4, 60, 30), 340, measure)
    expect(out.map((l) => l.text)).toEqual(['7/30', '31', '8/1', '2'])
  })
})

/** 断言:互不重叠(净距 ≥ AXIS_MIN_GAP)且不越出 [0,width] */
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

describe('layoutAxisLabels · 简略与排布', () => {
  it('相邻数据日成簇放不下时隔一丢一(丢冲突对右侧),存活者仍钉柱中心', () => {
    const days = ['2026-07-10', '2026-07-11', '2026-07-12']
    const out = layoutAxisLabels(mkBars(days, days), [20, 33, 46], 415, measure)
    expect(out.map((l) => [l.index, l.text])).toEqual([[0, '7/10'], [2, '12']])
    // 非 clamp 标签中心 = 柱中心('12' w=12,left=46-6=40)
    expect(out[1].left + measure('12') / 2).toBe(46)
  })

  it('首日数据标签左缘 clamp 在容器内', () => {
    const out = layoutAxisLabels(mkBars(['2026-07-05'], ['2026-07-05']), [2], 300, measure)
    expect(out).toEqual([{ index: 0, text: '7/5', left: 1 }])
  })

  it('末日数据标签右缘 clamp 在容器内', () => {
    const out = layoutAxisLabels(mkBars(['2026-07-31'], ['2026-07-31']), [298], 300, measure)
    // 'M/D' w=24,右缘 clamp:left = 300-1-24
    expect(out).toEqual([{ index: 0, text: '7/31', left: 275 }])
  })

  it('月界标签被简略丢弃后,新月份下一个存活标签自动升回 M/D', () => {
    const days = ['2026-07-31', '2026-08-01', '2026-08-02']
    const out = layoutAxisLabels(mkBars(days, days), [10, 24, 39], 200, measure)
    expect(out.map((l) => l.text)).toEqual(['7/31', '8/2'])
  })

  it('30 天全有数据 · 宽窗:全标,首标 M/D、月界 M/D,无重叠不越界', () => {
    const days = [...Array(30)].map((_, i) =>
      i < 21 ? `2026-07-${String(11 + i).padStart(2, '0')}` : `2026-08-0${i - 20}`
    )
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(30, 29, 15), 900, measure)
    expect(out).toHaveLength(30)
    expect(out[0].text).toBe('7/11')
    expect(out[21].text).toBe('8/1')
    expectNoOverlapInBounds(out, 900)
  })

  it('极端窄:持续简略,至少剩 1 个,无重叠不越界,且终止', () => {
    const days = [...Array(30)].map((_, i) =>
      i < 21 ? `2026-07-${String(11 + i).padStart(2, '0')}` : `2026-08-0${i - 20}`
    )
    const out = layoutAxisLabels(mkBars(days, days), mkCenters(30, 4, 3), 130, measure)
    expect(out.length).toBeGreaterThanOrEqual(1)
    expectNoOverlapInBounds(out, 130)
  })
})

describe('layoutAxisLabels · 选取', () => {
  it('全无数据 → 零标签', () => {
    const days = ['2026-07-01', '2026-07-02', '2026-07-03']
    expect(layoutAxisLabels(mkBars(days, []), mkCenters(3, 40, 20), 200, measure)).toEqual([])
  })

  it('仅数据日入选,格式 M/D;空白日(含首尾)不标', () => {
    const days = ['2026-07-01', '2026-07-16', '2026-07-30']
    const out = layoutAxisLabels(mkBars(days, ['2026-07-16']), mkCenters(3, 80, 40), 300, measure)
    expect(out.map((l) => [l.index, l.text])).toEqual([[1, '7/16']])
  })

  it('数据日判定跟随传入的 total(视图切换语义):同一天 0/正 两次调用,标签出现/消失', () => {
    const days = ['2026-07-10', '2026-07-11']
    const centers = mkCenters(2, 80, 40)
    const on = layoutAxisLabels(mkBars(days, ['2026-07-11']), centers, 300, measure)
    const off = layoutAxisLabels(mkBars(days, []), centers, 300, measure)
    expect(on.map((l) => l.index)).toEqual([1])
    expect(off).toEqual([])
  })
})
