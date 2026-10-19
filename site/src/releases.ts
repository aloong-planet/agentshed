// The two reads that decide what the page offers (landing-page::REQ-001), and nothing else at run time
// (landing-page::CON-003): the R2 latest pointer, and GitHub's public releases API for this repository.
//
// Both answers are outside data (landing-page Failure E1): only a validated version comes out of them, and a
// link only when it is exactly the one the release layout gives for that version. A pointer that is anything
// else, however close, is unreadable, and the page tries GitHub; on GitHub, a release not shaped like this
// repository's is passed over and the others still count, and an answer that is not a list is unreadable.
// Nothing else of an answer (release notes, names, other URLs) is ever kept.

export const DOWNLOAD_HOST = 'https://dl.agentshed.aloongplanet.com'
export const POINTER_URL = `${DOWNLOAD_HOST}/latest.json`
export const RELEASES_API = 'https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100'

/** How long a read may take before the page stops waiting for it (Failure A5) */
const TIMEOUT_MS = 5000

export type PointerRead = { kind: 'formal'; version: string; url: string } | { kind: 'absent' } | { kind: 'unreadable' }

export type GitHubRead =
  | { kind: 'formal'; version: string; dmg: boolean }
  | { kind: 'pre'; version: string }
  | { kind: 'none' }
  | { kind: 'unreadable' }

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const FORMAL = /^\d+\.\d+\.\d+$/
const PRE = /^\d+\.\d+\.\d+-[0-9A-Za-z][0-9A-Za-z.-]*$/

/** The DMG's name for a version (mac-distribution::REQ-001/AC-01) */
export const dmgName = (version: string): string => `Agentshed-${version}-mac-arm64.dmg`

/** A version's DMG on the download host, in the mirror's layout (releases/v<version>/) */
export const r2Dmg = (version: string): string => `${DOWNLOAD_HOST}/releases/v${version}/${dmgName(version)}`

/** The answer's status and parsed body, or null when there is none to read: failed, aborted, timed out, not JSON */
async function get(fetch: Fetch, url: string, timeoutMs: number): Promise<{ status: number; body: unknown } | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: abort.signal, headers: { accept: 'application/json' } })
    if (response.status !== 200) return { status: response.status, body: undefined }
    return { status: 200, body: (await response.json()) as unknown }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export async function readPointer(fetch: Fetch, { timeoutMs = TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<PointerRead> {
  const answer = await get(fetch, POINTER_URL, timeoutMs)
  if (answer?.status === 404) return { kind: 'absent' }
  if (answer?.status !== 200 || !isObject(answer.body)) return { kind: 'unreadable' }
  const { version, files } = answer.body
  // Pre-releases never reach R2 (mac-distribution::CON-004), so a pointer naming one is not a pointer to trust
  if (typeof version !== 'string' || !FORMAL.test(version) || !Array.isArray(files)) return { kind: 'unreadable' }
  const url = r2Dmg(version)
  const listed = files.some((f) => isObject(f) && f['name'] === dmgName(version) && f['arch'] === 'arm64' && f['url'] === url)
  return listed ? { kind: 'formal', version, url } : { kind: 'unreadable' }
}

interface Candidate {
  version: string
  published: number
  dmg: boolean
}

/** A release this page could offer, or null for a draft or anything not shaped like this repository's releases */
function candidate(entry: unknown): (Candidate & { pre: boolean }) | null {
  if (!isObject(entry) || entry['draft'] !== false || typeof entry['prerelease'] !== 'boolean') return null
  const tag = entry['tag_name']
  if (typeof tag !== 'string' || !tag.startsWith('v')) return null
  const version = tag.slice(1)
  const pre = entry['prerelease']
  // A tag with a suffix is a pre-release, and only that (mac-distribution Failure A2); a flag saying otherwise is not trusted
  if (!(pre ? PRE : FORMAL).test(version)) return null
  const published = typeof entry['published_at'] === 'string' ? Date.parse(entry['published_at']) : NaN
  if (Number.isNaN(published)) return null
  const assets = Array.isArray(entry['assets']) ? entry['assets'] : []
  const dmg = assets.some((a) => isObject(a) && a['name'] === dmgName(version) && a['state'] === 'uploaded')
  return { version, published, dmg, pre }
}

const newest = <T extends Candidate>(list: T[]): T | undefined => list.reduce<T | undefined>((a, b) => (!a || b.published > a.published ? b : a), undefined)

export async function readGitHub(fetch: Fetch, { timeoutMs = TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<GitHubRead> {
  const answer = await get(fetch, RELEASES_API, timeoutMs)
  if (answer?.status !== 200 || !Array.isArray(answer.body)) return { kind: 'unreadable' }
  const releases = answer.body.map(candidate).filter((c) => c !== null)
  const formal = newest(releases.filter((c) => !c.pre))
  if (formal) return { kind: 'formal', version: formal.version, dmg: formal.dmg }
  const pre = newest(releases.filter((c) => c.pre))
  return pre ? { kind: 'pre', version: pre.version } : { kind: 'none' }
}
