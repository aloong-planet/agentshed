// The answers the site's tests give the page's three reads (landing-page::CON-003): the pointer as the release script
// writes it, a real releases answer from GitHub reshaped to this repository, and the statistics file as the
// collection writes it. The tests through the page's script (in jsdom and in a browser) answer with these, and assert
// against the URLs written out here.
import { readFileSync } from 'node:fs'

export const POINTER_URL = 'https://dl.agentshed.aloongplanet.com/latest.json'
export const RELEASES_API = 'https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100'
export const COUNT_URL = 'https://dl.agentshed.aloongplanet.com/stats/downloads.json'
export const POINTER = readFileSync(new URL('../fixtures/pointer.json', import.meta.url), 'utf8')
export const RELEASES = JSON.parse(readFileSync(new URL('../fixtures/github-releases.json', import.meta.url), 'utf8')) as { prerelease: boolean }[]

/** The statistics file as the collection writes it, its summary given */
export const statistics = (total: number, github: number, r2: number, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    schemaVersion: 1,
    updatedAt: '2026-11-22T09:47:12.000Z',
    r2Cursor: '2026-11-22T09:00:00Z',
    r2Gaps: [],
    summary: { total, sources: { github, r2 } },
    github: { assets: { 665347607: { name: 'Agentshed-0.1.0-beta-mac-arm64.dmg', downloads: github } } },
    r2: { objects: {} },
    ...extra
  })
