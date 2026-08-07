// token-stats 序列 E:自动保鲜的纯函数 seam——聚焦节流判定与参数注入解析。
// 触发接线(timer/focus 事件)在装配层,由 e2e 短间隔注入驱动。
import { describe, it, expect } from 'vitest'
import { shouldRescanOnFocus, rescanIntervalMs } from './rescan'

describe('shouldRescanOnFocus(E1 节流)', () => {
  it('从未扫过 → 扫;距上次不足节流窗 → 不扫;达到窗口(含边界)→ 扫', () => {
    expect(shouldRescanOnFocus(1000, null, 60_000)).toBe(true)
    expect(shouldRescanOnFocus(59_999, 0, 60_000)).toBe(false)
    expect(shouldRescanOnFocus(60_000, 0, 60_000)).toBe(true)
    expect(shouldRescanOnFocus(100_000, 90_000, 60_000)).toBe(false)
  })
})

describe('rescanIntervalMs(E5 参数注入)', () => {
  it('合法正整数取注入值;缺失/非数/零/负 → 默认值', () => {
    expect(rescanIntervalMs('2000', 300_000)).toBe(2000)
    expect(rescanIntervalMs(undefined, 300_000)).toBe(300_000)
    expect(rescanIntervalMs('abc', 300_000)).toBe(300_000)
    expect(rescanIntervalMs('0', 300_000)).toBe(300_000)
    expect(rescanIntervalMs('-5', 300_000)).toBe(300_000)
  })
})
