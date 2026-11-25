// The download count's sources standing in at the system boundary (download-count::REQ-011, Implementation Decisions
// "The collection"), shared by the core's and the Worker's cases and the watchdog's: GitHub's releases, answered 100 to
// a page, and Cloudflare's analytics, answering the dataset's settings and, for a range, the rows of each hour in it.
//
// GitHub's answer is the repository's real one (../fixtures/github-releases.json: `gh api
// 'repos/aloong-planet/agentshed/releases?per_page=100'`, 2026-11-22, nine pre-releases, trimmed to the fields a
// release and an asset are read for); a draft and a formal release are added by copying its entries. The analytics'
// answers are shaped from Cloudflare's documented schema and the query Transfer runs hourly on the same zone.
import { readFileSync } from 'node:fs'

export const REAL_RELEASES = JSON.parse(readFileSync(new URL('../fixtures/github-releases.json', import.meta.url), 'utf8'))

/** The real answer's newest release, copied under another tag and other asset IDs */
export function copyOf(tag, { draft = false, prerelease = false, dmgDownloads = 0, idBase }) {
  const [newest] = REAL_RELEASES
  const version = tag.slice(1)
  return {
    ...newest,
    id: idBase,
    tag_name: tag,
    draft,
    prerelease,
    assets: newest.assets.map((asset, i) => {
      const name = asset.name.replace('0.1.0-beta.9', version)
      return {
        ...asset,
        id: idBase + 1 + i,
        name,
        download_count: name.endsWith('.dmg') ? dmgDownloads : 40,
        browser_download_url: `https://github.com/aloong-planet/agentshed/releases/download/${tag}/${name}`
      }
    })
  }
}

// The real answer's DMG counts on 2026-11-22: 2 for beta.3 to beta.9, 3 for beta and beta.2
export const REAL_ASSETS = {
  771176132: { name: 'Agentshed-0.1.0-beta.9-mac-arm64.dmg', downloads: 2 },
  716218198: { name: 'Agentshed-0.1.0-beta.8-mac-arm64.dmg', downloads: 2 },
  714192334: { name: 'Agentshed-0.1.0-beta.7-mac-arm64.dmg', downloads: 2 },
  712587166: { name: 'Agentshed-0.1.0-beta.6-mac-arm64.dmg', downloads: 2 },
  711706094: { name: 'Agentshed-0.1.0-beta.5-mac-arm64.dmg', downloads: 2 },
  708189336: { name: 'Agentshed-0.1.0-beta.4-mac-arm64.dmg', downloads: 2 },
  691524290: { name: 'Agentshed-0.1.0-beta.3-mac-arm64.dmg', downloads: 2 },
  682397225: { name: 'Agentshed-0.1.0-beta.2-mac-arm64.dmg', downloads: 3 },
  665347607: { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads: 3 }
}

export const DMG_KEY = 'releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'

// The clock reads 09:47:12 UTC, the minute the schedule runs at: the last full hour ended at 09:00, 47 minutes
// before. A day of notOlderThan reaches back to 09:47:12 the day before, so the oldest full hour the analytics hold
// starts at 10:00.
export const NOW = Date.UTC(2026, 10, 22, 9, 47, 12)
export const DAY = 86400

/** A statistics file with every field of the spec's table, its summary added by hand */
export const writtenFile = () => ({
  schemaVersion: 1,
  updatedAt: '2026-11-22T09:47:12.000Z',
  r2Cursor: '2026-11-22T09:00:00Z',
  r2Gaps: [{ from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }],
  summary: { total: 7.5, sources: { github: 5, r2: 2.5 } },
  github: {
    assets: {
      682397225: { name: 'Agentshed-0.1.0-beta.2-mac-arm64.dmg', downloads: 3 },
      665347607: { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads: 2 }
    }
  },
  r2: { objects: { [DMG_KEY]: { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 2500 } } }
})

export const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'
export const RELEASES_PAGE = 'https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100&page='
export const LIMITS = { enabled: true, notOlderThan: 31 * DAY, maxDuration: 3 * DAY, maxPageSize: 10000 }
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
export const text = (body, status = 200) => new Response(body, { status })
export const zoneAnswer = (zone) => json({ data: { viewer: { zones: [zone] } }, errors: null })

/**
 * The sources as a fetch: GitHub's `releases`, 100 to a page, and the analytics answering `limits` and, for a range,
 * the rows of each hour in it (`traffic`: hour -> [{ path, bytes }]), summed by path. `answer` replaces an answer, or
 * throws for a call that fails, and leaves the usual answer where it answers undefined; GitHub's is given the page and
 * the request. `requests` records what was asked, in order, and may be shared with a bucket's stand-in.
 */
export function sources({ releases = REAL_RELEASES, limits = LIMITS, traffic = {}, answer = {}, requests = [] } = {}) {
  return async (url, init = {}) => {
    if (url.startsWith(RELEASES_PAGE)) {
      const page = Number(url.slice(RELEASES_PAGE.length))
      requests.push({ to: 'github', page, headers: init.headers })
      return answer.github?.(page, init) ?? json(releases.slice((page - 1) * 100, page * 100))
    }
    if (url === GRAPHQL && init.method === 'POST') {
      const { query, variables } = JSON.parse(init.body)
      if (query.includes('settings')) {
        requests.push({ to: 'settings', headers: init.headers, variables })
        return answer.settings?.() ?? json({ data: { viewer: { zones: [{ settings: { httpRequestsAdaptiveGroups: limits } }] } }, errors: null })
      }
      const { filter } = variables
      requests.push({ to: 'traffic', headers: init.headers, query, variables })
      const groups = new Map()
      for (const [hour, rows] of Object.entries(traffic)) {
        if (hour < filter.datetime_geq || hour >= filter.datetime_lt) continue
        for (const { path, bytes } of rows) groups.set(path, (groups.get(path) ?? 0) + bytes)
      }
      const rows = [...groups].map(([path, bytes]) => ({ dimensions: { clientRequestPath: path }, sum: { edgeResponseBytes: bytes } }))
      return answer.traffic?.(filter) ?? json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: rows }] } }, errors: null })
    }
    throw new Error(`unexpected request: ${url}`)
  }
}
