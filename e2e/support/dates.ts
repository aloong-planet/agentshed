/** The local day (the same rule as the main process's localDay); the trend window is the last 30 days, so
 * timestamps have to be computed relative to today
 *
 * Why a moment sits on a local day and is never an offset of the current time: the app files a moment under the
 * local day it falls on, cut at local midnight. Which day a moment set as now minus a duration falls on can move with
 * the hour the run starts (20 days and 1 hour back is the 21st day back for a run starting before 01:00 and the 20th
 * for a later one), and a run of such moments minutes apart straddles a local midnight at some hours, splitting in a
 * place that moves with the hour. An assertion that reads the day split (a per-day figure, a fold, a day count) can
 * then pass or fail by the hour the run starts, and green runs at other hours do not show otherwise. #517's case
 * failed this way: session `many` of the global search home asked question k at now minus 20 days minus 1 hour plus
 * 2k minutes, the case's fold step turned on how many of the 150 questions fell on the earlier day, and runs starting
 * between about 23:48 and 00:26 local time failed (PR #522). A moment placed from a local day, as at its noon here or
 * from its midnight as `sinceMidnight` in `search-home.ts` does, falls on the same day whatever the hour the run
 * starts, and so does the current time itself, which is today. */
export function localDayOffset(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0) // Midday, so no time zone pushes the date outside the window
  return d
}
