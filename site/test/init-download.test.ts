// The page's download script end to end (landing-page::REQ-001, CON-003, Failure A7): the served page, a fake
// fetch standing in for the network (the pointer as the release script writes it, GitHub's real-shaped list), and
// the state the page ends in. Which URLs were asked for is asserted: CON-003 makes the two reads the requirement.
//
// Not covered here: keeping the visitor's place when a state lands while they are scrolled (jsdom has no layout);
// measured in a browser (evidence/ticket-238/).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { beforeAll, expect, inject, test } from 'vitest'
import { ui } from '../src/i18n/ui'
import type { Fetch } from '../src/releases'
import { initDownload } from '../src/scripts/download'

const POINTER_URL = 'https://dl.agentshed.aloongplanet.com/latest.json'
const RELEASES_API = 'https://api.github.com/repos/aloong-planet/agentshed/releases?per_page=100'
const POINTER = readFileSync(new URL('./fixtures/pointer.json', import.meta.url), 'utf8')
const RELEASES = JSON.parse(readFileSync(new URL('./fixtures/github-releases.json', import.meta.url), 'utf8')) as { prerelease: boolean }[]
const html: Record<'zh' | 'en', string> = { zh: '', en: '' }

beforeAll(() => {
  const outDir = inject('builtSite')
  html.zh = readFileSync(join(outDir, 'index.html'), 'utf8')
  html.en = readFileSync(join(outDir, 'en/index.html'), 'utf8')
})

const page = (locale: 'zh' | 'en'): Document => new JSDOM(html[locale]).window.document
const heroText = (doc: Document): string => (doc.querySelector('.hero .cta a.btn')?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** A network that answers each URL as given, and fails anything else; it records what was asked */
function network(answers: Record<string, [number, string] | 'fail'>): Fetch & { urls: string[] } {
  const urls: string[] = []
  const fetch = (url: string): Promise<Response> => {
    urls.push(url)
    const a = answers[url]
    if (!a || a === 'fail') return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve(new Response(a[1], { status: a[0], headers: { 'content-type': 'application/json' } }))
  }
  return Object.assign(fetch, { urls })
}

test('a readable pointer: the formal state from R2, and GitHub is never asked', async () => {
  const doc = page('en')
  const net = network({ [POINTER_URL]: [200, POINTER], [RELEASES_API]: [200, JSON.stringify(RELEASES)] })
  expect(await initDownload(doc, net)).toEqual({
    kind: 'formal-r2',
    version: '0.2.0',
    url: 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'
  })
  expect(heroText(doc)).toBe('Download Agentshed 0.2.0')
  expect(net.urls).toEqual([POINTER_URL])
})

test('no pointer, only pre-releases on GitHub: the test state, in the page’s language', async () => {
  const doc = page('zh')
  const net = network({ [POINTER_URL]: [404, '<html></html>'], [RELEASES_API]: [200, JSON.stringify(RELEASES.filter((r) => r.prerelease))] })
  expect(await initDownload(doc, net)).toEqual({ kind: 'test', version: '1.2.0-beta' })
  // The Chinese page's own copy, not the English page's (the copy itself is checked against the prototype)
  expect(heroText(doc)).toBe(ui.zh.download.test.hero.replace('{version}', '1.2.0-beta'))
  expect(net.urls).toEqual([POINTER_URL, RELEASES_API])
})

test('neither source readable: the page stays as served, the release list', async () => {
  const doc = page('en')
  const served = doc.body.innerHTML
  const net = network({ [POINTER_URL]: 'fail', [RELEASES_API]: 'fail' })
  expect(await initDownload(doc, net)).toEqual({ kind: 'list' })
  expect(doc.body.innerHTML).toBe(served)
  expect(net.urls).toEqual([POINTER_URL, RELEASES_API])
})
