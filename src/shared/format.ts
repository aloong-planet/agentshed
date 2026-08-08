// 日期与数字的本地化格式(票 12)。
//
// 一律走平台内建的 `Intl`,**不自造规则表**——与复数同一条判断(ADR-0014):
// 各语言的分组符号、日期语序、相对时间措辞差异极大,手写必错且无法穷举。
//
// **单位符号(B / KB / MB / ms)不翻译**:它们是记法而非自然语言,与类型记法
// (`string|null`)、provider 名同一处置,不进六份字典。
import { dictOf, type Language } from './i18n'

/** 取不到值 / 非有限数时的统一降级表示——绝不显示 NaN */
const DASH = '—'

const isFinite_ = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Intl 用的 locale tag 与字典的 htmlLang 同源,避免两处各写一份 */
const tag = (lang: Language): string => dictOf(lang).htmlLang

/**
 * 相对时间:今天 / 昨天 / N 天前 / N 月前。
 *
 * 用 `Intl.RelativeTimeFormat` 而非拼「N + 天前」:各语言的量词位置与复数形式不同
 * (俄语「5 дней назад」vs「1 день назад」),拼接必错。`numeric: 'auto'` 让
 * 0/1 天落到各语言的惯用词(今天/昨天),而不是机器味的「0 天前」。
 */
export function relativeDays(lang: Language, days: number | null): string {
  if (!isFinite_(days)) return DASH
  const d = Math.max(0, Math.floor(days))
  const rtf = new Intl.RelativeTimeFormat(tag(lang), { numeric: 'auto' })
  if (d < 30) return rtf.format(-d, 'day')
  return rtf.format(-Math.floor(d / 30), 'month')
}

/**
 * 日期分组标签(月/日 + 星期)。
 *
 * **必须在同一语言下对同一天稳定**:`dayGroups` 拿它当分组键,标签抖动会把同一天
 * 拆成两组。故只取日期部分,不含时间。
 */
export function dayLabel(lang: Language, ms: number): string {
  if (!isFinite_(ms)) return DASH
  return new Intl.DateTimeFormat(tag(lang), {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(ms))
}

/** 大数字分组(1,234 / 1 234 / 1.234),跟随当前语言 */
export function formatCount(lang: Language, n: number): string {
  if (!isFinite_(n)) return DASH
  return new Intl.NumberFormat(tag(lang)).format(n)
}

/**
 * 字节量:数值按语言格式化,**单位符号不翻译**。
 * 负数视为无意义输入而非「负字节」,与非有限值同样降级。
 */
export function formatBytes(lang: Language, n: number): string {
  if (!isFinite_(n) || n < 0) return DASH
  const nf = (v: number, digits = 0): string =>
    new Intl.NumberFormat(tag(lang), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(v)
  if (n < 1024) return `${nf(n)} B`
  if (n < 1024 * 1024) return `${nf(n / 1024, 1)} KB`
  return `${nf(n / (1024 * 1024), 1)} MB`
}

/**
 * 轴标签用的「月/日」,跟随语言语序(票 12)。
 *
 * 入参是月与日的**数字**而非时间戳:轴的候选标签本就是从 `YYYY-MM-DD` 切片来的,
 * 拼回时间戳再格式化会平白引入时区问题。用 2001 年造一个只为取语序的日期——
 * 年份不出现在输出里(只要 month/day 两个字段)。
 */
export function monthDay(lang: Language, mon: number, dom: number): string {
  if (!isFinite_(mon) || !isFinite_(dom)) return DASH
  return new Intl.DateTimeFormat(tag(lang), { month: 'numeric', day: 'numeric' }).format(
    new Date(2001, mon - 1, dom)
  )
}
