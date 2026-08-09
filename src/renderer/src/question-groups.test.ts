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

const D1 = Date.parse('2026-08-04T09:00:00') // A Tuesday
const D1b = Date.parse('2026-08-04T15:30:00')
const D2 = Date.parse('2026-08-05T10:00:00')

describe('groupable (grouping applies only when every question has a timestamp)', () => {
  test('all timestamped → groupable; any missing → degrade to flat; an empty list is not grouped', () => {
    expect(groupable([q(1, D1), q(2, D2)])).toBe(true)
    expect(groupable([q(1, D1), q(2, null)])).toBe(false)
    expect(groupable([])).toBe(false)
  })
})

describe('dayLabel (in the current language; stable for the same day)', () => {
  test('takes the day and weekday in the local time zone', () => {
    // The wording comes from Intl and changes with the ICU version; pinning a specific string would tie
    // the test to a runtime version.
    // What is asserted are the two things this function really has to guarantee: it contains the correct
    // day number, and it is stable for the same day (it is the grouping key)
    expect(dayLabel('zh', D1)).toContain('4')
    expect(dayLabel('zh', D2)).toContain('5')
    expect(dayLabel('zh', D1)).not.toBe(dayLabel('zh', D2))
  })
})

describe('dayGroups (grouping by day + sorting)', () => {
  test('ascending: adjacent entries of the same day form one group whose header carries that day\'s count; indices and numbers stay original', () => {
    const gs = dayGroups('zh', [q(1, D1), q(2, D1b), q(3, D2)], 'asc')
    expect(gs.map((g) => g.day)).toEqual([dayLabel('zh', D1), dayLabel('zh', D2)])
    expect(gs[0].items.map((x) => x.idx)).toEqual([0, 1])
    expect(gs[0].items.map((x) => x.q.i)).toEqual([1, 2])
    expect(gs[1].items.map((x) => x.idx)).toEqual([2])
  })

  test('descending: the day groups and the questions inside them both reverse, never giving descending dates with ascending contents', () => {
    const gs = dayGroups('zh', [q(1, D1), q(2, D1b), q(3, D2)], 'desc')
    expect(gs.map((g) => g.day)).toEqual([dayLabel('zh', D2), dayLabel('zh', D1)])
    // The contents reverse too: later questions come first, while the numbers remain the original turn
    // numbers
    expect(gs[1].items.map((x) => x.q.i)).toEqual([2, 1])
    expect(gs[1].items.map((x) => x.idx)).toEqual([1, 0])
  })

  test('a single-day session still forms one group (the header carries "which day this is")', () => {
    const gs = dayGroups('zh', [q(1, D1), q(2, D1b)], 'asc')
    expect(gs).toHaveLength(1)
    expect(gs[0].items).toHaveLength(2)
  })

  test('one day separated by out-of-order timestamps → two groups with the same label but different ids (so collapsing and keys do not cross over)', () => {
    const gs = dayGroups('zh', [q(1, D1), q(2, D2), q(3, D1b)], 'asc')
    expect(gs.map((g) => g.day)).toEqual([dayLabel('zh', D1), dayLabel('zh', D2), dayLabel('zh', D1)])
    expect(new Set(gs.map((g) => g.id)).size).toBe(3)
  })
})
