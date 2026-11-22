// The download count's read (landing-page::REQ-011/AC-01, AC-05, Failure E3, Implementation Decisions "Every read"),
// through an injected fetch: no case reaches the network. The file is shaped as the collection writes it
// (scripts/download-count.mjs); the page reads its schemaVersion and summary only.
//
// Not covered here: what a browser does with CORS (Failure G7). A rejected fetch stands for it; the download host's
// answer to the landing page's origin and to another one is measured in docs/ops/r2-setup.md.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { COUNT_URL, countText, readCount } from './download-count'
import { readGitHub, readPointer, type Fetch } from './releases'

const file = (summary: unknown, schemaVersion: unknown = 1): string =>
  JSON.stringify({
    schemaVersion,
    updatedAt: '2026-11-22T09:47:12.000Z',
    r2Cursor: '2026-11-22T09:00:00Z',
    r2Gaps: [],
    summary,
    github: { assets: { 665347607: { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads: 1234560 } } },
    r2: { objects: { 'releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg': { name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1000, bytes: 7750 } } }
  })

/** A fetch answering every request with one response, recording the URLs and the requests' options */
function answering(status: number, body: string, type = 'application/json'): Fetch & { calls: [string, RequestInit | undefined][] } {
  const calls: [string, RequestInit | undefined][] = []
  const fetch = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push([url, init])
    return Promise.resolve(new Response(body, { status, headers: { 'content-type': type } }))
  }
  return Object.assign(fetch, { calls })
}

describe('the download count', () => {
  test('a valid file: its total floored to a whole number, read from the statistics file on the download host', async () => {
    const fetch = answering(200, file({ total: 1234567.75, sources: { github: 1234560, r2: 7.75 } }))
    expect(await readCount(fetch)).toBe(1234567)
    expect(fetch.calls.map(([url]) => url)).toEqual(['https://dl.agentshed.aloongplanet.com/stats/downloads.json'])
    expect(COUNT_URL).toBe('https://dl.agentshed.aloongplanet.com/stats/downloads.json')
  })

  test('any 2xx answer is read', async () => {
    expect(await readCount(answering(203, file({ total: 3, sources: { github: 3, r2: 0 } })))).toBe(3)
  })

  test.each([
    ['the largest total, 9007199254740991', { total: 9007199254740991, sources: { github: 9007199254740991, r2: 0 } }, 9007199254740991],
    ['a total off the shares by 0.0000005', { total: 7.7500005, sources: { github: 5, r2: 2.75 } }, 7],
    ['nothing counted yet', { total: 0, sources: { github: 0, r2: 0 } }, 0]
  ])('accepted: %s', async (_, summary, count) => {
    expect(await readCount(answering(200, file(summary)))).toBe(count)
  })

  const valid = { total: 7.75, sources: { github: 5, r2: 2.75 } }
  const unshown: [string, Fetch][] = [
    ['the file is absent', answering(404, '<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>', 'application/xml')],
    ['the host errs', answering(500, 'Internal Server Error', 'text/plain')],
    ['the request fails (CORS refused, offline)', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['the body is not JSON', answering(200, '<html></html>', 'text/html')],
    ['schemaVersion 2', answering(200, file(valid, 2))],
    ['schemaVersion as text', answering(200, file(valid, '1'))],
    ['no schemaVersion', answering(200, JSON.stringify({ summary: valid }))],
    ['no summary', answering(200, JSON.stringify({ schemaVersion: 1 }))],
    ['no sources', answering(200, file({ total: 7.75 }))],
    ['a negative total', answering(200, file({ total: -1, sources: { github: 0, r2: -1 } }))],
    ['a negative GitHub share', answering(200, file({ total: 1, sources: { github: -1, r2: 2 } }))],
    ['a negative R2 share', answering(200, file({ total: 1, sources: { github: 2, r2: -1 } }))],
    ['a total that is not finite', answering(200, '{"schemaVersion":1,"summary":{"total":1e400,"sources":{"github":1e400,"r2":0}}}')],
    ['a total that is not a number', answering(200, file({ total: '7.75', sources: { github: 5, r2: 2.75 } }))],
    ['a total above 9007199254740991', answering(200, file({ total: 2 ** 53, sources: { github: 2 ** 53, r2: 0 } }))],
    ['a total off the shares by 0.000002', answering(200, file({ total: 7.750002, sources: { github: 5, r2: 2.75 } }))]
  ]
  test.each(unshown)('no count when %s', async (_, fetch) => {
    expect(await readCount(fetch)).toBeNull()
  })
})

// The Chinese copy by code point: check:lang keeps Han characters out of a test's source
const zh = (...points: number[]): string => String.fromCharCode(...points)

describe("the count's line", () => {
  test.each([
    ['en', 1234567, 'Downloads so far: 1,234,567'],
    ['en', 9007199254740991, 'Downloads so far: 9,007,199,254,740,991'],
    ['en', 0, 'Downloads so far: 0'],
    ['zh', 1234567, `${zh(0x5f53, 0x524d, 0x5df2, 0x6709)} 1,234,567 ${zh(0x6b21, 0x4e0b, 0x8f7d)}`]
  ] as const)('%s, %d', (locale, count, text) => {
    expect(countText(count, locale)).toBe(text)
  })
})

describe('every read', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('the count is given up after five seconds', async () => {
    vi.useFakeTimers()
    const hanging: Fetch = (_, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    let result: number | null | undefined
    const read = readCount(hanging).then((count) => (result = count))
    await vi.advanceTimersByTimeAsync(4999)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await read
    expect(result).toBeNull()
  })

  // A header outside the CORS-safelisted set would make the browser send a preflight first
  test.each([
    ['the pointer', (fetch: Fetch) => readPointer(fetch)],
    ['GitHub', (fetch: Fetch) => readGitHub(fetch)],
    ['the statistics file', (fetch: Fetch) => readCount(fetch)]
  ])('%s is read with a plain GET and no header that needs a preflight', async (_, read) => {
    const fetch = answering(200, '{}')
    await read(fetch)
    expect(fetch.calls).toHaveLength(1)
    const [[, init]] = fetch.calls
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.body ?? null).toBeNull()
    expect([...new Headers(init?.headers).entries()]).toEqual([['accept', 'application/json']])
  })
})
