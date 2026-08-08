// 提问列表的日期分组(票 06):跨天会话单行索引只有 HH:MM 会失真,
// 分组行同时承担"这是哪天"。纯函数,渲染层直接消费。
import type { SessionQuestion } from '@shared/domain'
import type { Language } from '@shared/i18n'
import { dayLabel as localeDayLabel } from '@shared/format'

export type QuestionOrder = 'asc' | 'desc'

export interface DayGroup {
  day: string
  /** 折叠状态与 React key 的键:同日被时间戳乱序隔开时会出现两个同标签组,
   * day 本身不唯一——用组首元素的原始下标补齐 */
  id: string
  /** idx = 提问在展示集合里的原始下标(展开状态的键);q.i 是显示序号,恒为原始轮次号 */
  items: Array<{ q: SessionQuestion; idx: number }>
}

/**
 * 全部提问都有时间戳才启用日期分组;缺任一则整页平铺(降级到无分组形态)。
 * 不造"日期未知"组——那是一个没在原型里出现过的形态,而缺时间戳在真实数据里
 * 是罕见的坏行,降级只需可用,不值得为它发明界面。
 */
export function groupable(qs: readonly SessionQuestion[]): boolean {
  return qs.length > 0 && qs.every((q) => q.at !== null)
}

/**
 * 本地时区的日期标签,按当前语言(票 12)。
 * **同一语言下对同一天必须稳定**——本函数的输出被 `dayGroups` 当分组键用,
 * 标签抖动会把同一天拆成两组。
 */
export function dayLabel(lang: Language, ms: number): string {
  return localeDayLabel(lang, ms)
}

/**
 * 按日分组(同日相邻归组;输入顺序 = 原始轮次顺序)。
 * desc 时**组与组内一起翻**——只翻组不翻组内会出现"日期倒序而组内正序"。
 */
export function dayGroups(
  lang: Language,
  qs: readonly SessionQuestion[],
  order: QuestionOrder
): DayGroup[] {
  const groups: DayGroup[] = []
  qs.forEach((q, idx) => {
    const day = dayLabel(lang, q.at as number)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push({ q, idx })
    else groups.push({ day, id: `${day}#${idx}`, items: [{ q, idx }] })
  })
  if (order === 'desc') {
    groups.reverse()
    for (const g of groups) g.items.reverse()
  }
  return groups
}
