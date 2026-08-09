// token 数的紧凑记法。
//
// **刻意不本地化**(2026-08-09 用户裁定):k / M / B 是与 KB / MB / ms 同类的**记法**,
// 各语言通用;改成 Intl 的 compact 会让中文变成「1240万」,那是另一个产品决定。
// 故本文件不涉及语言,只验进位与边界。
import { describe, it, expect } from 'vitest'
import { fmtTok } from './TokenViz'

describe('fmtTok', () => {
  it('千位以下原样', () => {
    expect(fmtTok(0)).toBe('0')
    expect(fmtTok(999)).toBe('999')
  })

  it('千位用 k,百万位用 M', () => {
    expect(fmtTok(1_000)).toBe('1k')
    expect(fmtTok(12_400)).toBe('12k')
    expect(fmtTok(1_200_000)).toBe('1.2M')
  })

  it('**十亿以上用 B**——否则 12.4B 会显示成 12400.0M', () => {
    // 这是本次新增的一档:token 总量到十亿级时,M 会长到五位数字,读不出量级
    expect(fmtTok(1_000_000_000)).toBe('1.0B')
    expect(fmtTok(12_400_000_000)).toBe('12.4B')
  })

  it('每一档的下边界恰好进位,不早不晚', () => {
    // 边界写错会让 999_999 显示成 1000k 之类
    expect(fmtTok(999)).not.toContain('k')
    expect(fmtTok(999_999)).toContain('k')
    expect(fmtTok(1_000_000)).toContain('M')
    expect(fmtTok(999_999_999)).toContain('M')
    expect(fmtTok(1_000_000_000)).toContain('B')
  })
})
