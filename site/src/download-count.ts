// The page's read of the download count (landing-page::REQ-011/AC-01, AC-05, CON-003): the statistics file the
// hourly collection publishes on the download host (scripts/download-count.mjs). It is outside data (Failure E3):
// only a validated total comes out of it, floored to a whole number; nothing else it holds reaches the page.
import { HTML_LANG, ui, type Locale } from './i18n/ui'
import { DOWNLOAD_HOST, get, isObject, TIMEOUT_MS, type Fetch } from './releases'

export const COUNT_URL = `${DOWNLOAD_HOST}/stats/downloads.json`
/**
 * The same file through the dev server (astro.config.mjs): the download host answers CORS for the landing page's own
 * origin only (Failure G7), so a page served from localhost reads it from its own origin instead
 */
export const DEV_COUNT_PATH = '/__download-count'

const MAX_TOTAL = 9007199254740991
const TOLERANCE = 0.000001

const isShare = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * The download count, or null when there is none to show: the file is absent or cannot be fetched (the network,
 * CORS, the time limit, an answer other than 2xx), is not JSON, has another schemaVersion, or holds a total or share
 * that is negative or not finite, a total above 9007199254740991 or one that is not the sum of the two shares
 */
export async function readCount(fetch: Fetch, { url = COUNT_URL, timeoutMs = TIMEOUT_MS }: { url?: string; timeoutMs?: number } = {}): Promise<number | null> {
  const answer = await get(fetch, url, timeoutMs)
  if (!answer || answer.status < 200 || answer.status > 299 || !isObject(answer.body)) return null
  const { schemaVersion, summary } = answer.body
  if (schemaVersion !== 1 || !isObject(summary) || !isObject(summary['sources'])) return null
  const total = summary['total']
  const { github, r2 } = summary['sources']
  if (!isShare(total) || !isShare(github) || !isShare(r2) || total > MAX_TOTAL) return null
  // The collection writes the total as the shares' sum, so their sum is compared rather than each one subtracted
  if (Math.abs(total - (github + r2)) > TOLERANCE) return null
  return Math.floor(total)
}

/** The count's line in a language: the count grouped as that language groups numbers (landing-page::REQ-011/AC-01) */
export const countText = (count: number, locale: Locale): string =>
  ui[locale].download.count.replace('{count}', new Intl.NumberFormat(HTML_LANG[locale]).format(count))
