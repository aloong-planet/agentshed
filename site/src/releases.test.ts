// The two reads (landing-page::REQ-001, CON-003, Failures A1–A8, E1), through an injected fetch: no case reaches
// the network. The fixtures are real shapes: the pointer as the release script's own pointRelease writes it, the
// 404 the download host answers before the first formal release (an HTML body), and Transfer's public releases
// answer of 2026-10-19 renamed to this repository (drafts, pre-releases, assets with their upload state).
//
// Not covered here: what a browser does with CORS and with the time limit. A rejected fetch stands for both;
// the browser behaviour is measured with the page (evidence/ticket-238/).
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { readGitHub, readPointer, type Fetch } from './releases'

const POINTER = readFileSync(new URL('../test/fixtures/pointer.json', import.meta.url), 'utf8')
const RELEASES = JSON.parse(readFileSync(new URL('../test/fixtures/github-releases.json', import.meta.url), 'utf8')) as Release[]

interface Release {
  tag_name: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
  assets: { name: string; state: string }[]
}

/** A fetch answering every request with one response, recording the URLs asked for */
function answering(status: number, body: string, type = 'application/json'): Fetch & { urls: string[] } {
  const urls: string[] = []
  const fetch = (url: string): Promise<Response> => {
    urls.push(url)
    return Promise.resolve(new Response(body, { status, headers: { 'content-type': type } }))
  }
  return Object.assign(fetch, { urls })
}
const failing =
  (error: Error): Fetch =>
  () =>
    Promise.reject(error)
const pointerWith = (change: (p: { version: unknown; files: Record<string, unknown>[] }) => void): string => {
  const p = JSON.parse(POINTER) as { version: unknown; files: Record<string, unknown>[] }
  change(p)
  return JSON.stringify(p)
}
const releasesWith = (change: (r: Release[]) => Release[] | void): string => {
  const copy = structuredClone(RELEASES)
  return JSON.stringify(change(copy) ?? copy)
}

describe('the pointer', () => {
  test('a pointer as the release workflow writes it: the formal version and its DMG on the download host', async () => {
    const fetch = answering(200, POINTER)
    expect(await readPointer(fetch)).toEqual({
      kind: 'formal',
      version: '0.2.0',
      url: 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'
    })
    expect(fetch.urls).toEqual(['https://dl.agentshed.aloongplanet.com/latest.json'])
  })

  test('no pointer yet: the host answers 404 with an HTML page', async () => {
    expect(await readPointer(answering(404, '<html><body>Not Found</body></html>', 'text/html'))).toEqual({ kind: 'absent' })
  })

  const unreadable: [string, Fetch][] = [
    ['the request fails (CORS refused, offline)', failing(new TypeError('Failed to fetch'))],
    ['the request is aborted', failing(new DOMException('The operation was aborted.', 'AbortError'))],
    ['the host errs', answering(500, 'Internal Server Error', 'text/plain')],
    ['the body is not JSON', answering(200, 'not json')],
    ['the body is not an object', answering(200, 'null')],
    ['no version', answering(200, pointerWith((p) => delete (p as Partial<typeof p>).version))],
    ['a version written with its v', answering(200, pointerWith((p) => (p.version = 'v0.2.0')))],
    [
      'a pre-release version, which never reaches R2',
      answering(
        200,
        pointerWith((p) => {
          p.version = '0.2.0-beta'
          p.files[0].name = 'Agentshed-0.2.0-beta-mac-arm64.dmg'
          p.files[0].url = 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0-beta/Agentshed-0.2.0-beta-mac-arm64.dmg'
        })
      )
    ],
    ['no arm64 DMG', answering(200, pointerWith((p) => (p.files[0].arch = 'x64')))],
    [
      'the DMG on another host',
      answering(200, pointerWith((p) => (p.files[0].url = 'https://evil.example/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg')))
    ],
    [
      'the DMG over plain http',
      answering(200, pointerWith((p) => (p.files[0].url = 'http://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg')))
    ],
    [
      'the DMG under another version’s directory',
      answering(200, pointerWith((p) => (p.files[0].url = 'https://dl.agentshed.aloongplanet.com/releases/v0.1.0/Agentshed-0.2.0-mac-arm64.dmg')))
    ],
    ['a DMG named for another version', answering(200, pointerWith((p) => (p.files[0].name = 'Agentshed-0.1.0-mac-arm64.dmg')))]
  ]
  test.each(unreadable)('unreadable when %s', async (_, fetch) => {
    expect(await readPointer(fetch)).toEqual({ kind: 'unreadable' })
  })

  test('a read that does not answer within the time limit is unreadable', async () => {
    const hanging: Fetch = (_, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const started = Date.now()
    expect(await readPointer(hanging, { timeoutMs: 30 })).toEqual({ kind: 'unreadable' })
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('GitHub’s releases', () => {
  test('the latest formal release, with its DMG', async () => {
    const fetch = answering(200, JSON.stringify(RELEASES))
    expect(await readGitHub(fetch)).toEqual({ kind: 'formal', version: '1.2.1', dmg: true })
    expect(fetch.urls).toEqual(['https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100'])
  })

  test('a pre-release newer than the latest formal release: the formal release (Failure A4)', async () => {
    const body = releasesWith((r) => {
      r.find((x) => x.tag_name === 'v1.2.0-beta')!.published_at = '2026-09-30T00:00:00Z'
    })
    expect(await readGitHub(answering(200, body))).toEqual({ kind: 'formal', version: '1.2.1', dmg: true })
  })

  test('the newest by date, whatever order the list comes in', async () => {
    const body = releasesWith((r) => [...r].reverse())
    expect(await readGitHub(answering(200, body))).toEqual({ kind: 'formal', version: '1.2.1', dmg: true })
  })

  test('only pre-releases: the newest of them', async () => {
    const body = releasesWith((r) => {
      const beta = r.find((x) => x.tag_name === 'v1.2.0-beta')!
      const older = { ...structuredClone(beta), tag_name: 'v1.1.0-beta', published_at: '2026-07-01T00:00:00Z' }
      return [older, beta]
    })
    expect(await readGitHub(answering(200, body))).toEqual({ kind: 'pre', version: '1.2.0-beta' })
  })

  test('no release at all (Failure A1)', async () => {
    expect(await readGitHub(answering(200, '[]'))).toEqual({ kind: 'none' })
  })

  test('a draft is ignored, however new (Failure A8)', async () => {
    const body = releasesWith((r) => [
      { ...structuredClone(r[0]), tag_name: 'v1.3.0', draft: true, published_at: null },
      ...r
    ])
    expect(await readGitHub(answering(200, body))).toEqual({ kind: 'formal', version: '1.2.1', dmg: true })
  })

  test('a formal release without the DMG is offered without it (Failure A8)', async () => {
    const body = releasesWith((r) => {
      r[0].assets = r[0].assets.filter((a) => a.name !== 'Agentshed-1.2.1-mac-arm64.dmg')
    })
    expect(await readGitHub(answering(200, body))).toEqual({ kind: 'formal', version: '1.2.1', dmg: false })
  })

  test('a DMG whose upload has not finished does not count', async () => {
    const body = releasesWith((r) => {
      r[0].assets.find((a) => a.name === 'Agentshed-1.2.1-mac-arm64.dmg')!.state = 'starter'
    })
    expect(await readGitHub(answering(200, body))).toEqual({ kind: 'formal', version: '1.2.1', dmg: false })
  })

  test('an entry that is not a release of this kind is passed over, the others still count', async () => {
    const body = releasesWith((r) => [
      { ...structuredClone(r[0]), tag_name: 'nightly', published_at: '2026-10-01T00:00:00Z' },
      { ...structuredClone(r[0]), tag_name: 'v1.3.0-rc', prerelease: false, published_at: '2026-10-02T00:00:00Z' },
      ...r
    ])
    expect(await readGitHub(answering(200, body))).toEqual({ kind: 'formal', version: '1.2.1', dmg: true })
  })

  const unreadable: [string, Fetch][] = [
    [
      'the rate limit is spent (Failure A6)',
      () =>
        Promise.resolve(
          new Response('{"message":"API rate limit exceeded"}', {
            status: 403,
            headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '0' }
          })
        )
    ],
    ['GitHub errs', answering(500, '{"message":"Server Error"}')],
    ['the body is not a list', answering(200, '{"message":"Not Found"}')],
    ['the body is not JSON', answering(200, '<html></html>', 'text/html')],
    ['the request fails', failing(new TypeError('Failed to fetch'))]
  ]
  test.each(unreadable)('unreadable when %s', async (_, fetch) => {
    expect(await readGitHub(fetch)).toEqual({ kind: 'unreadable' })
  })
})
