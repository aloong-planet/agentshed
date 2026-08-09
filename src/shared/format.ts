// Localised date and number formatting (ticket 12).
//
// Always go through the platform's built-in `Intl` and **never hand-roll a rule table** — the same
// judgement as plurals (ADR-0014):
// grouping separators, date orders and relative-time wording differ enormously between languages, so
// writing them by hand is bound to be wrong and cannot be exhaustive.
//
// **Unit symbols (B / KB / MB / ms) are not translated**: they are notation rather than natural
// language, handled the same way as type notation
// (`string|null`) and provider names, and do not enter the six dictionaries.
import { dictOf, type Language } from './i18n'

/** The uniform degraded representation for a missing value or a non-finite number — NaN is never shown */
const DASH = '—'

const isFinite_ = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** The locale tag Intl uses shares its source with the dictionaries' htmlLang, so it is not written twice */
const tag = (lang: Language): string => dictOf(lang).htmlLang

/**
 * Relative time: today / yesterday / N days ago / N months ago.
 *
 * Uses `Intl.RelativeTimeFormat` rather than concatenating "N + days ago": the position of the measure
 * word and the plural form differ per language
 * (Russian "5 дней назад" vs "1 день назад"), so concatenation is bound to be wrong. `numeric: 'auto'` lets
 * 0 and 1 day fall to each language's idiomatic words (today/yesterday) rather than a robotic "0 days ago".
 */
export function relativeDays(lang: Language, days: number | null): string {
  if (!isFinite_(days)) return DASH
  const d = Math.max(0, Math.floor(days))
  const rtf = new Intl.RelativeTimeFormat(tag(lang), { numeric: 'auto' })
  if (d < 30) return rtf.format(-d, 'day')
  return rtf.format(-Math.floor(d / 30), 'month')
}

/**
 * The date group label (month/day + weekday).
 *
 * **Must be stable for the same day within one language**: `dayGroups` uses it as the grouping key, and
 * a churning label would split one day
 * into two groups. So it takes only the date part, with no time.
 */
export function dayLabel(lang: Language, ms: number): string {
  if (!isFinite_(ms)) return DASH
  return new Intl.DateTimeFormat(tag(lang), {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(ms))
}

/** Large number grouping (1,234 / 1 234 / 1.234), following the current language */
export function formatCount(lang: Language, n: number): string {
  if (!isFinite_(n)) return DASH
  return new Intl.NumberFormat(tag(lang)).format(n)
}

/**
 * Byte sizes: the number is formatted by language and **the unit symbol is not translated**.
 * A negative is treated as meaningless input rather than "negative bytes", degrading as a non-finite
 * value does.
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
 * The "month/day" used by axis labels, following the language's order (ticket 12).
 *
 * The arguments are the month and day as **numbers** rather than a timestamp: the axis's candidate
 * labels are sliced out of `YYYY-MM-DD` in the first place,
 * and reassembling a timestamp just to format it would introduce time zone problems for nothing. A date
 * in 2001 is fabricated purely to obtain the order —
 * the year never appears in the output (only the month and day fields are requested).
 */
export function monthDay(lang: Language, mon: number, dom: number): string {
  if (!isFinite_(mon) || !isFinite_(dom)) return DASH
  return new Intl.DateTimeFormat(tag(lang), { month: 'numeric', day: 'numeric' }).format(
    new Date(2001, mon - 1, dom)
  )
}
