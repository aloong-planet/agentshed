// The page's download script end to end (landing-page::REQ-001, REQ-011, CON-003, Failure A7): the served page, a
// fake fetch standing in for the network (the pointer as the release script writes it, GitHub's real-shaped list, the
// statistics file as the collection writes it), and the state the page ends in. Which URLs were asked for is
// asserted: CON-003 makes the three reads the requirement.
//
// Not covered here: keeping the visitor's place when a state lands while they are scrolled (jsdom has no layout);
// measured in a browser (evidence/ticket-238/).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, inject, test, vi } from 'vitest'
import { ui } from '../src/i18n/ui'
import type { Fetch } from '../src/releases'
import { initDownload } from '../src/scripts/download'
import { COUNT_URL, POINTER, POINTER_URL, RELEASES, RELEASES_API, statistics } from './support/stand-ins'

const html: Record<'zh' | 'en', string> = { zh: '', en: '' }

beforeAll(() => {
  const outDir = inject('builtSite')
  html.zh = readFileSync(join(outDir, 'zh/index.html'), 'utf8')
  html.en = readFileSync(join(outDir, 'index.html'), 'utf8')
})

const page = (locale: 'zh' | 'en'): Document => new JSDOM(html[locale]).window.document
const heroText = (doc: Document): string => (doc.querySelector('.hero .cta a.btn')?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** A network that answers each URL as given, and fails anything else; it records what was asked */
function network(answers: Record<string, [number, string] | 'fail' | 'pending'>): Fetch & { urls: string[] } {
  const urls: string[] = []
  const fetch = (url: string, init?: RequestInit): Promise<Response> => {
    urls.push(url)
    const a = answers[url]
    // Never answers; it gives up only when the read's own time limit aborts it
    if (a === 'pending') return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
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
  expect(net.urls).toEqual([COUNT_URL, POINTER_URL])
})

test('no pointer, only pre-releases on GitHub: the test state, in the page’s language', async () => {
  const doc = page('zh')
  const net = network({ [POINTER_URL]: [404, '<html></html>'], [RELEASES_API]: [200, JSON.stringify(RELEASES.filter((r) => r.prerelease))] })
  expect(await initDownload(doc, net)).toEqual({ kind: 'test', version: '1.2.0-beta' })
  // The Chinese page's own copy, not the English page's (the copy itself is checked against the prototype)
  expect(heroText(doc)).toBe(ui.zh.download.test.hero.replace('{version}', '1.2.0-beta'))
  expect(net.urls).toEqual([COUNT_URL, POINTER_URL, RELEASES_API])
})

test('neither source readable: the page stays as served, the release list', async () => {
  const doc = page('en')
  const served = doc.body.innerHTML
  const net = network({ [POINTER_URL]: 'fail', [RELEASES_API]: 'fail' })
  expect(await initDownload(doc, net)).toEqual({ kind: 'list' })
  expect(doc.body.innerHTML).toBe(served)
  expect(net.urls).toEqual([COUNT_URL, POINTER_URL, RELEASES_API])
})

const countLine = (doc: Document): Element => doc.querySelector('#download [data-download-count]') ?? expect.unreachable('no count line')

describe('the download count', () => {
  test.each([
    ['en', 'Downloads so far: 1,234,567'],
    ['zh', ui.zh.download.count.replace('{count}', '1,234,567')]
  ] as const)('%s: a valid file fills the line below the card, in the page’s language', async (locale, line) => {
    const doc = page(locale)
    const net = network({ [COUNT_URL]: [200, statistics(1234567.75, 1234560, 7.75)], [POINTER_URL]: [200, POINTER] })
    await initDownload(doc, net)
    await vi.waitFor(() => expect(countLine(doc).textContent).toBe(line))
  })

  // Failure E3: only the validated total reaches the page, as text
  test('markup in the file never reaches the page: the line holds the number as text and nothing else', async () => {
    const doc = page('en')
    const markup = '<img src=x onerror="document.title=1">'
    const net = network({ [COUNT_URL]: [200, statistics(7, 7, 0, { updatedAt: markup, note: markup })], [POINTER_URL]: [200, POINTER] })
    await initDownload(doc, net)
    await vi.waitFor(() => expect(countLine(doc).textContent).toBe('Downloads so far: 7'))
    expect(countLine(doc).children).toHaveLength(0)
    expect(doc.querySelectorAll('img[src="x"]')).toHaveLength(0)
  })

  // landing-page::REQ-011/AC-05 on the page: the line is written only once a read brings a count. A read that brings
  // none leaves the page as served ('neither source readable' above, whose count read is refused); one that has not
  // answered leaves the line empty in the meantime
  test('the line stays empty while the read has not answered', async () => {
    const lineAfter = async (count: [number, string] | 'pending'): Promise<string | null> => {
      const doc = page('en')
      await initDownload(doc, network({ [COUNT_URL]: count, [POINTER_URL]: [200, POINTER] }))
      // The fake network answers at once, so a read that lands has landed by then: the valid file shows it
      await new Promise((resolve) => setTimeout(resolve, 50))
      return countLine(doc).textContent
    }
    expect(await lineAfter([200, statistics(3, 3, 0)])).toBe('Downloads so far: 3')
    expect(await lineAfter('pending')).toBe('')
  })

  // landing-page::REQ-011/AC-06: in each of the four states, the count read succeeding, failing or never answering
  // leaves the state and every part of the page the state writes as they are without it
  const PRE_ONLY = JSON.stringify(RELEASES.filter((r) => r.prerelease))
  const states: [string, Record<string, [number, string] | 'fail'>][] = [
    ['formal-r2', { [POINTER_URL]: [200, POINTER] }],
    ['formal-github', { [POINTER_URL]: [404, '<html></html>'], [RELEASES_API]: [200, JSON.stringify(RELEASES)] }],
    ['test', { [POINTER_URL]: [404, '<html></html>'], [RELEASES_API]: [200, PRE_ONLY] }],
    ['list', { [POINTER_URL]: 'fail', [RELEASES_API]: 'fail' }]
  ]
  const written = (doc: Document): string[] =>
    ['.hero .cta', '#download h2 + p', '#download .dl'].map((selector) => doc.querySelector(selector)?.outerHTML ?? '')
  test.each(states)('%s: the count read never changes or delays the download', async (kind, reads) => {
    const outcomes = []
    const counts: ([number, string] | 'fail' | 'pending')[] = [[200, statistics(3, 3, 0)], 'fail', 'pending']
    for (const count of counts) {
      const doc = page('en')
      const state = await initDownload(doc, network({ ...reads, [COUNT_URL]: count }))
      outcomes.push({ state, written: written(doc) })
    }
    expect(outcomes[0].state.kind).toBe(kind)
    expect(outcomes[1]).toEqual(outcomes[0])
    expect(outcomes[2]).toEqual(outcomes[0])
  })
})
