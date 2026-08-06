import { describe, expect, test } from 'vitest'
import type { SessionQuestion } from '@shared/domain'
import { dayGroups, dayLabel, groupable } from './question-groups'

const q = (i: number, at: number | null): SessionQuestion => ({
  i,
  text: `问${i}`,
  at,
  tools: 0,
  subagents: 0
})

const D1 = Date.parse('2026-08-04T09:00:00') // 周二
const D1b = Date.parse('2026-08-04T15:30:00')
const D2 = Date.parse('2026-08-05T10:00:00')

describe('groupable(全部提问都有时间戳才分组)', () => {
  test('全有时间戳 → 可分组;任一缺失 → 平铺降级;空列表不分组', () => {
    expect(groupable([q(1, D1), q(2, D2)])).toBe(true)
    expect(groupable([q(1, D1), q(2, null)])).toBe(false)
    expect(groupable([])).toBe(false)
  })
})

describe('dayLabel(与原型同格式:M月D日 周X)', () => {
  test('本地时区取日与星期', () => {
    expect(dayLabel(D1)).toBe('8月4日 周二')
    expect(dayLabel(D2)).toBe('8月5日 周三')
  })
})

describe('dayGroups(按日分组 + 排序)', () => {
  test('正序:同日相邻的归一组,组头带当日条数;下标与序号保持原始', () => {
    const gs = dayGroups([q(1, D1), q(2, D1b), q(3, D2)], 'asc')
    expect(gs.map((g) => g.day)).toEqual(['8月4日 周二', '8月5日 周三'])
    expect(gs[0].items.map((x) => x.idx)).toEqual([0, 1])
    expect(gs[0].items.map((x) => x.q.i)).toEqual([1, 2])
    expect(gs[1].items.map((x) => x.idx)).toEqual([2])
  })

  test('倒序:日期组与组内提问一起翻,不出现「日期倒序而组内正序」', () => {
    const gs = dayGroups([q(1, D1), q(2, D1b), q(3, D2)], 'desc')
    expect(gs.map((g) => g.day)).toEqual(['8月5日 周三', '8月4日 周二'])
    // 组内也翻:后问的在前;序号仍是原始轮次号
    expect(gs[1].items.map((x) => x.q.i)).toEqual([2, 1])
    expect(gs[1].items.map((x) => x.idx)).toEqual([1, 0])
  })

  test('单日会话也成一组(组头承担「这是哪天」)', () => {
    const gs = dayGroups([q(1, D1), q(2, D1b)], 'asc')
    expect(gs).toHaveLength(1)
    expect(gs[0].items).toHaveLength(2)
  })

  test('同日被乱序时间戳隔开 → 两组同标签但 id 不同(折叠与 key 不串)', () => {
    const gs = dayGroups([q(1, D1), q(2, D2), q(3, D1b)], 'asc')
    expect(gs.map((g) => g.day)).toEqual(['8月4日 周二', '8月5日 周三', '8月4日 周二'])
    expect(new Set(gs.map((g) => g.id)).size).toBe(3)
  })
})
