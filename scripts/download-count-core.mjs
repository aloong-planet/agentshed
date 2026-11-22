// The download count's core (landing-page::REQ-011, Implementation Decisions "The collection" and "The statistics
// file"; ADR-0055, ADR-0056): an hourly run adds the download host's traffic, read from Cloudflare's analytics up to
// the hour landing-page::REQ-011/AC-04 counts to, to the download counts GitHub reports for the DMG assets, and
// publishes the sum in the release bucket: as stats/downloads.json, which the landing page reads through the download
// host, or in the shadow period as the Worker's shadow file (Implementation Decisions "The shadow period").
//
// It imports nothing, Node's modules included, and reaches the bucket only through the one it is given, whose calls it
// awaits: list(prefix) answering [{ key, size }] for every object whose key starts with prefix, every page of the
// listing joined (the core takes the answer as complete: a DMG missing from it is not counted), getText(key) and
// putText(key, text, { cacheControl, contentType }).
// So a runtime without Node, such as a Cloudflare Worker, can run it with a bucket of its own; the Download count
// workflow runs it through scripts/download-count.mjs, with aws-cli's and the workflow's GitHub token, and the Worker
// through scripts/download-count-worker.mjs, with its binding's and no GitHub token.
//
// Every read comes first; only when all of them succeeded is the file written, so a failed run leaves the previous
// file and its cursor as they were, and says which source failed it.
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?`
// The packaged name, <productName>-<version>-mac-<arch>.dmg (electron-builder.yml's dmg.artifactName), for the arches
// electron-builder builds for macOS
const DMG = new RegExp(`^Agentshed-${VERSION}-mac-(?:arm64|x64|universal)\\.dmg$`)

/** Whether a file name is a DMG's, the only file whose downloads count (landing-page::REQ-011/AC-02) */
export const isDmg = (name) => typeof name === 'string' && DMG.test(name)

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
/** Whether a value is a whole number of zero or more, as every count and byte total is */
export const isCount = (value) => Number.isSafeInteger(value) && value >= 0

/**
 * GitHub's share merged into the recorded assets (landing-page::REQ-011/AC-02, AC-03): every DMG asset of a
 * published release, formal or pre-release, keyed by its ID with the highest count read for it; an asset no longer
 * listed keeps its last count. `releases` is GitHub's answer, every page; an entry not shaped like a release, or a
 * DMG asset without an ID and a count, fails the run (Failure G2).
 */
export function mergeGitHub(recorded, releases) {
  const assets = { ...recorded }
  for (const release of releases) {
    if (!isObject(release) || typeof release.draft !== 'boolean' || !Array.isArray(release.assets)) {
      throw new Error(`GitHub listed a release that is not one: ${JSON.stringify(release)?.slice(0, 200)}`)
    }
    if (release.draft) continue
    for (const asset of release.assets) {
      if (!isObject(asset) || typeof asset.name !== 'string') throw new Error(`release ${release.tag_name} lists an asset without a name`)
      if (!isDmg(asset.name)) continue
      if (!Number.isSafeInteger(asset.id) || asset.id <= 0 || !isCount(asset.download_count)) {
        throw new Error(`${asset.name} is listed without an ID and a download count`)
      }
      const key = String(asset.id)
      assets[key] = { name: asset.name, downloads: Math.max(assets[key]?.downloads ?? 0, asset.download_count) }
    }
  }
  return assets
}

const nameOf = (key) => key.slice(key.lastIndexOf('/') + 1)

/**
 * The download host's share merged into the recorded objects (landing-page::REQ-011/AC-02, AC-03): every DMG the
 * bucket lists under releases/, keyed by its key, with the bytes of each counted request for it added. An object no
 * longer listed keeps its bytes and still takes the requests a cached copy serves; a request for anything else counts
 * for nothing. A DMG listed at another size than the one recorded fails the run (Failure G5).
 */
export function mergeR2(recorded, listing, rows) {
  const objects = Object.fromEntries(Object.entries(recorded).map(([key, object]) => [key, { ...object }]))
  for (const { key, size } of listing) {
    const name = nameOf(key)
    if (!isDmg(name)) continue
    if (size === 0) throw new Error(`${key} is empty in the bucket`)
    if (objects[key] && objects[key].size !== size) {
      throw new Error(`${key} is ${size} bytes in the bucket, not the ${objects[key].size} recorded`)
    }
    objects[key] ??= { name, size, bytes: 0 }
  }
  for (const { path, bytes } of rows) {
    const object = objects[path.slice(1)]
    if (object) object.bytes += bytes
  }
  return objects
}

/** The page's figure and its two shares, unrounded (the statistics file's `summary`) */
export function summarize(assets, objects) {
  const github = Object.values(assets).reduce((sum, { downloads }) => sum + downloads, 0)
  const r2 = Object.values(objects).reduce((sum, { size, bytes }) => sum + bytes / size, 0)
  return { total: github + r2, sources: { github, r2 } }
}

const HOUR_MS = 3_600_000
// How long before the run an hour must have ended for the run to count it (landing-page::REQ-011/AC-04)
const SETTLED_MS = 30 * 60_000
const ON_THE_HOUR = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/

/** An instant as the statistics file writes it, ISO 8601 UTC to the second */
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z')

/** The instant of an ISO 8601 UTC time on the hour, as the statistics file writes one, or null for any other text */
export function hourOf(text) {
  if (typeof text !== 'string' || !ON_THE_HOUR.test(text)) return null
  const ms = Date.parse(text)
  return Number.isNaN(ms) || iso(ms) !== text ? null : ms
}

/**
 * The ranges of the download host's traffic a run reads (Implementation Decisions "The collection"): from the cursor,
 * or on a first run from the oldest full hour notOlderThan allows, to the end of the last hour that ended at least
 * SETTLED_MS before `now`, each no wider than maxDuration (both in seconds, from the analytics' settings). The new
 * cursor is that end. A cursor older than the analytics hold fails the run, unless it accepts the gap, which it then
 * records (Failure G3).
 *
 * An input it cannot use fails the run with the error's `source` naming where the input came from ("The run record"):
 * `analytics` for limits that leave no hour to read, `bucket` for a cursor, the previous file's, that is not one or
 * is after the hours the run may count. A refused gap names none: every source answered what it holds.
 */
export function planRanges({ cursor, now, notOlderThan, maxDuration, acceptGap }) {
  const unusable = (source, message) => Object.assign(new Error(message), { source })
  const end = Math.floor((now - SETTLED_MS) / HOUR_MS) * HOUR_MS
  const oldest = Math.ceil((now - notOlderThan * 1000) / HOUR_MS) * HOUR_MS
  const width = Math.floor(maxDuration / 3600) * HOUR_MS
  if (width === 0) throw unusable('analytics', `the analytics' maxDuration ${maxDuration} is narrower than an hour`)
  if (oldest > end) throw unusable('analytics', `the analytics hold no full hour: notOlderThan is ${notOlderThan} seconds`)
  let start = oldest
  let gap = null
  if (cursor !== null) {
    const at = hourOf(cursor)
    if (at === null) throw unusable('bucket', `the cursor ${cursor} is not on the hour`)
    if (at > end) throw unusable('bucket', `the cursor ${cursor} is after ${iso(end)}, the end of the hours this run may count`)
    if (at >= oldest) start = at
    else if (acceptGap) gap = { from: cursor, to: iso(oldest) }
    else {
      throw new Error(`the cursor ${cursor} is older than ${iso(oldest)}, the oldest full hour the analytics hold; ` +
        'a run that accepts the gap resumes from there (docs/ops/download-count.md)')
    }
  }
  const ranges = []
  for (let from = start; from < end; from += width) ranges.push({ from: iso(from), to: iso(Math.min(from + width, end)) })
  return { ranges, cursor: iso(end), gap }
}

const TOLERANCE = 0.000001
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
/** Whether a text is an ISO 8601 UTC time to the second or the millisecond, as the files write their instants */
export const isUtc = (text) => typeof text === 'string' && UTC.test(text) && !Number.isNaN(Date.parse(text)) &&
  new Date(Date.parse(text)).toISOString().slice(0, 19) === text.slice(0, 19)

/** Whether `value` is an object with exactly these fields */
export const shaped = (value, fields) => isObject(value) && Object.keys(value).sort().join() === [...fields].sort().join()

/**
 * The previous run's statistics file, taken only when it has exactly the fields and types of the spec's table
 * (Implementation Decisions "The statistics file"); anything else fails the run, which then writes nothing rather
 * than start the count over (Failure G1). `name` is what a failure calls the file: its key, when it was read from one.
 */
export function validateStatistics(file, name = 'the statistics file') {
  const fail = (reason) => { throw new Error(`${name} ${reason}`) }
  if (!shaped(file, ['schemaVersion', 'updatedAt', 'r2Cursor', 'r2Gaps', 'summary', 'github', 'r2'])) {
    fail(`does not have the statistics file's fields: ${JSON.stringify(isObject(file) ? Object.keys(file) : file)}`)
  }
  if (file.schemaVersion !== 1) fail(`has schemaVersion ${JSON.stringify(file.schemaVersion)}, not 1`)
  if (!isUtc(file.updatedAt)) fail(`has updatedAt ${JSON.stringify(file.updatedAt)}, not a UTC time`)
  const cursor = hourOf(file.r2Cursor)
  if (cursor === null) fail(`has r2Cursor ${JSON.stringify(file.r2Cursor)}, not a UTC hour`)
  if (!Array.isArray(file.r2Gaps)) fail('has r2Gaps that is not a list')
  for (const gap of file.r2Gaps) {
    const from = shaped(gap, ['from', 'to']) ? hourOf(gap.from) : null
    const to = from === null ? null : hourOf(gap.to)
    if (to === null || from >= to || to > cursor) fail(`has a gap that is not two UTC hours before the cursor: ${JSON.stringify(gap)}`)
  }
  if (!shaped(file.github, ['assets']) || !isObject(file.github.assets)) fail('has no github.assets')
  for (const [id, asset] of Object.entries(file.github.assets)) {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !shaped(asset, ['name', 'downloads']) ||
      !isDmg(asset.name) || !isCount(asset.downloads)) fail(`has an asset that is not a DMG's count: ${id}`)
  }
  if (!shaped(file.r2, ['objects']) || !isObject(file.r2.objects)) fail('has no r2.objects')
  for (const [key, object] of Object.entries(file.r2.objects)) {
    if (!key.startsWith('releases/') || !shaped(object, ['name', 'size', 'bytes']) || nameOf(key) !== object.name ||
      !isDmg(object.name) || !Number.isSafeInteger(object.size) || object.size <= 0 || !isCount(object.bytes)) {
      fail(`has an object that is not a DMG's bytes: ${key}`)
    }
  }
  const { summary } = file
  if (!shaped(summary, ['total', 'sources']) || !shaped(summary.sources, ['github', 'r2']) ||
    ![summary.total, summary.sources.github, summary.sources.r2].every(Number.isFinite)) fail('has no numeric summary')
  const parts = summarize(file.github.assets, file.r2.objects)
  if (summary.sources.github !== parts.sources.github) fail(`has GitHub's share ${summary.sources.github}, not its assets' ${parts.sources.github}`)
  if (Math.abs(summary.sources.r2 - parts.sources.r2) > TOLERANCE) fail(`has the download host's share ${summary.sources.r2}, not its objects' ${parts.sources.r2}`)
  if (Math.abs(summary.total - (summary.sources.github + summary.sources.r2)) > TOLERANCE) fail(`has the total ${summary.total}, not the sum of its shares`)
  return file
}

export const STATISTICS_KEY = 'stats/downloads.json'
/** The shadow period's files that the Worker writes (Implementation Decisions "The shadow period", "The run record") */
export const SHADOW_KEY = 'stats/downloads-shadow.json'
export const RUNS_KEY = 'stats/worker-runs.json'
/** A SHA-256 as the run record writes it, and the comparison record copies it: 64 lowercase hex digits */
export const SHA256 = /^[0-9a-f]{64}$/
/**
 * How every file of the count is written (Implementation Decisions "The collection", "The run record" and "The shadow
 * period"): JSON, which the download host caches for five minutes
 */
export const WRITE_OPTIONS = Object.freeze({ cacheControl: 'public, max-age=300', contentType: 'application/json' })

/**
 * The previous run's file, read from the bucket itself, never through the download host's cache: the object at `key`,
 * or while there is none the one at `seedKey` (Implementation Decisions "The shadow period"), with the key it was read
 * from; or null when the bucket holds neither, the one case in which the count starts over (Failure G1)
 */
async function readPrevious(bucket, key, seedKey) {
  for (const candidate of seedKey ? [key, seedKey] : [key]) {
    if (!(await bucket.list(candidate)).some((object) => object.key === candidate)) continue
    const text = await bucket.getText(candidate)
    let file
    try {
      file = JSON.parse(text)
    } catch {
      throw new Error(`${candidate} in the bucket is not JSON`)
    }
    return { key: candidate, file: validateStatistics(file, candidate) }
  }
  return { key: null, file: null }
}

const RELEASES_PER_PAGE = 100
const MAX_RELEASE_PAGES = 100

async function jsonOf(response, what) {
  if (response.status !== 200) throw new Error(`${what} answered HTTP ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new Error(`${what} answered with a body that is not JSON`)
  }
}

/**
 * Whether GitHub refused a read for its rate limit (Implementation Decisions "The run record"): HTTP 403 or 429 with
 * `x-ratelimit-remaining` 0, or with a message naming a secondary rate limit
 */
async function rateLimited(response) {
  if (response.status !== 403 && response.status !== 429) return false
  if (response.headers.get('x-ratelimit-remaining') === '0') return true
  let message
  try {
    message = (await response.json())?.message
  } catch {
    return false
  }
  return typeof message === 'string' && /secondary rate limit/i.test(message)
}

/**
 * GitHub's releases of the repository, every page, read with the token when there is one (the workflow's) and
 * without one otherwise (the Worker's: Implementation Decisions "The collection")
 */
async function readReleases(fetch, { repository, token }) {
  const releases = []
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'user-agent': 'agentshed-download-count',
        'x-github-api-version': '2022-11-28'
      }
    })
    if (await rateLimited(response)) {
      throw Object.assign(new Error(`page ${page} of GitHub's releases answered HTTP ${response.status} for its rate limit`), { rateLimited: true })
    }
    const answer = await jsonOf(response, `page ${page} of GitHub's releases`)
    if (!Array.isArray(answer)) throw new Error(`page ${page} of GitHub's releases is not a list`)
    releases.push(...answer)
    if (answer.length < RELEASES_PER_PAGE) return releases
  }
  throw new Error(`GitHub lists more than ${MAX_RELEASE_PAGES * RELEASES_PER_PAGE} releases`)
}

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

/** One query of the zone's analytics: the zone's part of the answer, or an error for anything else */
async function zoneQuery(fetch, { token, zone }, query, variables) {
  const response = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { zoneTag: zone, ...variables } })
  })
  const answer = await jsonOf(response, "Cloudflare's analytics")
  // GraphQL reports a failed query with HTTP 200 and its errors beside whatever data it has
  if (!isObject(answer) || (answer.errors !== undefined && answer.errors !== null)) {
    const messages = Array.isArray(answer?.errors) ? answer.errors.map((error) => error?.message).join('; ') : JSON.stringify(answer)
    throw new Error(`Cloudflare's analytics answered with errors: ${messages}`)
  }
  const zones = answer.data?.viewer?.zones
  if (!Array.isArray(zones) || zones.length !== 1 || !isObject(zones[0])) {
    throw new Error("Cloudflare's analytics did not answer for exactly one zone")
  }
  return zones[0]
}

const SETTINGS_QUERY = `query DownloadCountSettings($zoneTag: string) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      settings { httpRequestsAdaptiveGroups { enabled notOlderThan maxDuration maxPageSize } }
    }
  }
}`

/** The dataset's limits, read before any traffic: how far back a query reaches, its widest range and its page size */
async function readLimits(fetch, analytics) {
  const zone = await zoneQuery(fetch, analytics, SETTINGS_QUERY, {})
  const limits = zone.settings?.httpRequestsAdaptiveGroups
  const positive = (value) => Number.isSafeInteger(value) && value > 0
  if (!isObject(limits) || limits.enabled !== true || ![limits.notOlderThan, limits.maxDuration, limits.maxPageSize].every(positive)) {
    throw new Error(`Cloudflare's analytics answered limits the run cannot use: ${JSON.stringify(limits)}`)
  }
  return { notOlderThan: limits.notOlderThan, maxDuration: limits.maxDuration, maxPageSize: limits.maxPageSize }
}

// The page size is the settings' validated integer, written into the query as Transfer's hourly query writes its own
const trafficQuery = (limit) => `query DownloadCountTraffic($zoneTag: string, $filter: filter) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(limit: ${limit}, filter: $filter) {
        dimensions { clientRequestPath }
        sum { edgeResponseBytes }
      }
    }
  }
}`

/**
 * The bytes the download host served under /releases/ in one range, by path: visitors' successful GETs only, the
 * project's own reads included (Failure G6). A full page may have left rows out, so it fails the run.
 */
async function readTraffic(fetch, analytics, { host, range, limit }) {
  const filter = {
    datetime_geq: range.from,
    datetime_lt: range.to,
    clientRequestHTTPHost: host,
    clientRequestHTTPMethodName: 'GET',
    clientRequestPath_like: '/releases/%',
    edgeResponseStatus_in: [200, 206],
    requestSource: 'eyeball'
  }
  const zone = await zoneQuery(fetch, analytics, trafficQuery(limit), { filter })
  const groups = zone.httpRequestsAdaptiveGroups
  if (!Array.isArray(groups)) throw new Error(`Cloudflare's analytics answered no traffic for ${range.from} to ${range.to}`)
  if (groups.length >= limit) throw new Error(`Cloudflare's analytics answered a full page for ${range.from} to ${range.to}, which may leave rows out`)
  return groups.map((group) => {
    const path = group?.dimensions?.clientRequestPath
    const bytes = group?.sum?.edgeResponseBytes
    if (typeof path !== 'string' || !path.startsWith('/') || !isCount(bytes)) {
      throw new Error(`Cloudflare's analytics answered a row the run cannot read: ${JSON.stringify(group)}`)
    }
    return { path, bytes }
  })
}

/**
 * One run (Implementation Decisions "The collection"): every source is read first, and only after every read has
 * succeeded is the new statistics file written at `key`; a read that fails, or answers what the run cannot validate,
 * fails the run with nothing written and the cursor where it was, so the next run counts the hours this one missed
 * (Failure G2). While the bucket holds nothing at `key`, the previous file is the one at `seedKey`, if given.
 *
 * A cursor older than the analytics hold is accepted when `acceptGap` is true, or when it equals `acceptGapFrom`
 * (Failure G3). `beforeWrite`, if given, is awaited with the previous file and the key it was read from once the new
 * file is ready, just before it is written, and fails the run as the write would (the Worker writes the run record's
 * seed there: Implementation Decisions "The shadow period"). The run answers the file it wrote, the previous file and
 * the key it was read from (null for both when there was none).
 *
 * A run that fails throws with `outcomes`, each source's state when it failed (Implementation Decisions "The run
 * record"): `ok` when every read of it that started succeeded, `rate-limited` or `failed` for the one that failed,
 * `not-read` when none started. The bucket's reads are the previous file, the listing and the write, with
 * `beforeWrite`. An answer the run finds it cannot use only after the read fails that read's source too: the
 * analytics' limits, the previous file's cursor (planRanges) and an object the listing answered (the new file's check).
 */
export async function collect({
  bucket, fetch, now, repository, githubToken, analyticsToken, zone, host, acceptGap = false, acceptGapFrom = null,
  key = STATISTICS_KEY, seedKey = null, beforeWrite = null
}) {
  const outcomes = { github: 'not-read', analytics: 'not-read', bucket: 'not-read' }
  const from = async (source, read) => {
    try {
      const value = await read()
      outcomes[source] = 'ok'
      return value
    } catch (error) {
      outcomes[source] = error?.rateLimited === true ? 'rate-limited' : 'failed'
      throw error
    }
  }
  try {
    const analytics = { token: analyticsToken, zone }
    const previous = await from('bucket', () => readPrevious(bucket, key, seedKey))
    const releases = await from('github', () => readReleases(fetch, { repository, token: githubToken }))
    const listing = await from('bucket', () => bucket.list('releases/'))
    const { maxPageSize, ...limits } = await from('analytics', () => readLimits(fetch, analytics))
    const cursor = previous.file?.r2Cursor ?? null
    let plan
    try {
      plan = planRanges({ cursor, now, ...limits, acceptGap: acceptGap || (acceptGapFrom !== null && cursor === acceptGapFrom) })
    } catch (error) {
      if (error.source !== undefined) outcomes[error.source] = 'failed'
      throw error
    }
    const rows = []
    for (const range of plan.ranges) {
      // Row by row: a call takes only so many arguments, and a page may hold more
      for (const row of await from('analytics', () => readTraffic(fetch, analytics, { host, range, limit: maxPageSize }))) rows.push(row)
    }

    const assets = await from('github', () => mergeGitHub(previous.file?.github.assets ?? {}, releases))
    const objects = await from('bucket', () => mergeR2(previous.file?.r2.objects ?? {}, listing, rows))
    const statistics = {
      schemaVersion: 1,
      updatedAt: new Date(now).toISOString(),
      r2Cursor: plan.cursor,
      r2Gaps: [...(previous.file?.r2Gaps ?? []), ...(plan.gap ? [plan.gap] : [])],
      summary: summarize(assets, objects),
      github: { assets },
      r2: { objects }
    }
    await from('bucket', async () => {
      // The new file is checked as the next run will read it. Its cursor, gaps, GitHub's assets and summary hold by how
      // they were made, so only its objects, the bucket's, can fail it: one listed at a size that is not a whole number
      // of bytes, or bytes beyond a whole number JavaScript holds exactly (some 9 PB)
      validateStatistics(statistics, `the new ${key}`)
      await beforeWrite?.({ previous: previous.file, previousKey: previous.key })
      await bucket.putText(key, `${JSON.stringify(statistics, null, 2)}\n`, WRITE_OPTIONS)
    })
    return { statistics, previous: previous.file, previousKey: previous.key }
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { outcomes: { ...outcomes } })
  }
}
