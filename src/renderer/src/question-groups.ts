// Day grouping for the question list (ticket 06): in a session spanning days, a single-line index showing
// only HH:MM distorts,
// so the group row also carries "which day this is". A pure function, consumed directly by the renderer.
import type { SessionQuestion } from '@shared/domain'
import type { Language } from '@shared/i18n'
import { dayLabel as localeDayLabel } from '@shared/format'

export type QuestionOrder = 'asc' | 'desc'

export interface DayGroup {
  day: string
  /** The key for collapse state and the React key: when out-of-order timestamps separate one day, two
   * groups with the same label appear,
   * so day alone is not unique — the group's first element's original index completes it */
  id: string
  /** idx = the question's original index within the displayed set (the key for expansion state); q.i is
   * the display index, always the original turn number */
  items: Array<{ q: SessionQuestion; idx: number }>
}

/**
 * Day grouping applies only when every question has a timestamp; if any is missing, the whole page is
 * flat (degrading to the ungrouped form).
 * No "unknown date" group is invented — that form never appeared in the prototype, and a missing timestamp
 * in real data
 * is a rare bad line; degrading merely has to be usable, and is not worth inventing a UI for.
 */
export function groupable(qs: readonly SessionQuestion[]): boolean {
  return qs.length > 0 && qs.every((q) => q.at !== null)
}

/**
 * The date label in the local time zone, in the current language (ticket 12).
 * **It must be stable for the same day within one language** — this function's output is used by
 * `dayGroups` as the grouping key,
 * and a churning label would split one day into two groups.
 */
export function dayLabel(lang: Language, ms: number): string {
  return localeDayLabel(lang, ms)
}

/**
 * Group by day (adjacent entries of the same day group together; the input order = the original turn
 * order).
 * When descending, **the groups and their contents are both reversed** — reversing only the groups would
 * give descending dates with ascending contents.
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
