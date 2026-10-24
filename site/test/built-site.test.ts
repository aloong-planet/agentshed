// The built-site check (landing-page Testing Decisions): the pages one build produces, read as files.
//
// It reads the HTML as served, before any script runs, so what it sees is what a visitor without scripts
// gets (landing-page::REQ-001/AC-04).
//
// Not covered here, by the seam the owner chose: the features section's pinned showcase and how the scroll
// turns its steps (landing-page::REQ-004, Failures C1–C3 and C5–C7), the layout across widths (landing-page::QR-001), and
// what the page looks like in light and dark (landing-page::REQ-006, Failure D1). They are measured in a browser
// against the built site, and the measurement record is kept with the ticket's evidence; they would become tests
// only with a browser seam in these tests.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, inject, test } from 'vitest'
import { ui } from '../src/i18n/ui'

const outDir = inject('builtSite')

/** Every file under the build output, as paths relative to it */
function files(dir = outDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [relative(outDir, join(dir, e.name))]
  )
}

const pages: Record<'zh' | 'en', Document> = {} as Record<'zh' | 'en', Document>

beforeAll(() => {
  pages.zh = new JSDOM(readFileSync(join(outDir, 'index.html'), 'utf8')).window.document
  pages.en = new JSDOM(readFileSync(join(outDir, 'en/index.html'), 'utf8')).window.document
})

const REPOSITORY = 'https://github.com/aloong-planet/agentshed'
const LOCALES = ['zh', 'en'] as const

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('page structure', () => {
  test.each(LOCALES)('%s: the header holds the brand, the navigation and, at its right, the toggle', (locale) => {
    const header = pages[locale].querySelector('header')
    const brand = header?.querySelector('a.brand')
    expect(brand?.querySelector('img')?.getAttribute('src')).toMatch(/^\/icon-\d+\.png$/)
    expect(text(brand)).toBe('Agentshed')

    const nav = [...(header?.querySelectorAll('nav a') ?? [])]
    expect(nav.map((a) => a.getAttribute('href'))).toEqual(['#features', '#install', '#download', REPOSITORY])
    for (const a of nav.slice(0, 3)) {
      expect(pages[locale].getElementById(a.getAttribute('href')!.slice(1)), a.getAttribute('href')!).not.toBeNull()
    }

    // The toggle is the bar's last group
    const toggle = header?.querySelector('.bar')?.lastElementChild
    const links = [...(toggle?.querySelectorAll('a') ?? [])]
    expect(links.map(text)).toEqual(['中文', 'EN'])
    const current = links.filter((a) => a.getAttribute('aria-current') === 'page').map(text)
    expect(current).toEqual([locale === 'zh' ? '中文' : 'EN'])
    // Toggling goes to the other language's page (Failure B1)
    const other = links.find((a) => a.getAttribute('aria-current') !== 'page')
    expect(other?.getAttribute('href')).toBe(locale === 'zh' ? '/en/' : '/')
  })

  test('the English navigation reads as the spec’s', () => {
    expect([...pages.en.querySelectorAll('header nav a')].map(text)).toEqual(['Features', 'Install', 'Download', 'GitHub'])
  })

  test.each(LOCALES)('%s: hero, features, install and download in that order, then the footer', (locale) => {
    const doc = pages[locale]
    expect([...(doc.querySelector('main')?.children ?? [])].map((s) => s.id)).toEqual([
      'top',
      'features',
      'install',
      'download'
    ])
    expect(doc.querySelector('main + footer')).not.toBeNull()
  })

  test('the English features title and subtitle, and the footer, read as the spec’s', () => {
    const features = pages.en.getElementById('features')
    expect(text(features?.querySelector('h2'))).toBe('One app, the whole picture')
    expect(text(features?.querySelector('h2 + p'))).toBe('It only reads the files your coding agents leave on your Mac.')

    const footer = pages.en.querySelector('footer')
    expect([...(footer?.querySelectorAll('a') ?? [])].map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['GitHub', REPOSITORY],
      ['Releases', `${REPOSITORY}/releases`]
    ])
    expect(text(footer)).toContain('© 2026 aloongplanet')
  })
})

describe('the download as served: the list state', () => {
  test.each(LOCALES)('%s: the hero button and the download section lead to the release list', (locale) => {
    const doc = pages[locale]
    const t = ui[locale].download.list

    const hero = doc.querySelector('.hero .cta a.btn')
    expect(text(hero)).toBe(t.hero)
    expect(hero?.getAttribute('href')).toBe(`${REPOSITORY}/releases`)
    expect(hero?.getAttribute('target')).toBe('_blank')
    // The platform line sits beneath the button, with no pill
    expect(text(hero?.nextElementSibling)).toBe(ui[locale].hero.platform)
    expect(doc.querySelector('.hero .cta')?.children).toHaveLength(2)
    expect(doc.querySelector('.pill')).toBeNull()

    const section = doc.getElementById('download')
    expect(text(section?.querySelector('h2 + p'))).toBe(t.line)
    const buttons = [...(section?.querySelectorAll('.dl-actions a') ?? [])]
    expect(buttons.map((b) => [text(b), b.getAttribute('href'), b.getAttribute('target')])).toEqual([
      [t.button, `${REPOSITORY}/releases`, '_blank']
    ])

    // No version anywhere in the buttons
    for (const b of [hero, ...buttons]) expect(text(b)).not.toMatch(/\d+\.\d+/)
  })

  test('the English list state reads as the spec’s', () => {
    expect(text(pages.en.querySelector('.hero .cta a.btn'))).toBe('Download Agentshed from GitHub')
    expect(text(pages.en.querySelector('.hero .cta .meta'))).toBe('macOS 12 or later · Apple Silicon')
    expect(text(pages.en.querySelector('#download h2 + p'))).toBe(
      'Version details can’t be loaded right now — download from GitHub'
    )
    expect(text(pages.en.querySelector('#download .dl-actions a'))).toBe('Download from GitHub')
  })
})

describe('the sections', () => {
  test.each(LOCALES)('%s: the hero has the icon, the title, a paragraph, the button and the whole window', (locale) => {
    const hero = pages[locale].getElementById('top')
    expect(hero?.querySelector('img.icon')?.getAttribute('src')).toMatch(/^\/icon-\d+\.png$/)
    expect(text(hero?.querySelector('h1'))).toBe(ui[locale].hero.title)
    expect(text(hero?.querySelector('p'))).toBe(ui[locale].hero.lede)
    expect(hero?.querySelector('.cta a.btn')).not.toBeNull()
    expect(hero?.querySelector('.shot img')?.getAttribute('src')).toBe(`/shots/hero-${locale}.png`)
  })

  test('the English heading reads as the spec’s', () => {
    expect(text(pages.en.querySelector('.hero h1'))).toBe('Your coding agents, in full view')
  })

  test.each(LOCALES)('%s: six feature steps in order, in the showcase and stacked, each with its own screenshot', (locale) => {
    const features = pages[locale].getElementById('features')
    const views = ['overview', 'project', 'memory', 'tokens', 'session', 'search'].map((v) => `/shots/${v}-${locale}.png`)
    const showcase = [...(features?.querySelectorAll('.deck-stage .deck-shot img') ?? [])]
    expect(showcase.map((img) => img.getAttribute('src'))).toEqual(views)
    const stacked = [...(features?.querySelectorAll('.fs-list .fs-step') ?? [])]
    expect(stacked.map((s) => s.querySelector('.m-shot img')?.getAttribute('src'))).toEqual(views)
  })

  test('the English feature steps are the spec’s six', () => {
    const titles = [
      'The overview',
      'What each project has',
      'What the agents remember',
      'Token usage and trends',
      'Sessions, revisited',
      'Search across projects'
    ]
    expect([...pages.en.querySelectorAll('#features .deck-text h3')].map(text)).toEqual(titles)
    expect([...pages.en.querySelectorAll('#features .fs-step .fs-h')].map(text)).toEqual(titles)
  })

  test.each(LOCALES)('%s: as served, the showcase is on its first step, and each step carries its count', (locale) => {
    const features = pages[locale].getElementById('features')
    const texts = [...(features?.querySelectorAll('.deck-copy .deck-text') ?? [])]
    const shots = [...(features?.querySelectorAll('.deck-stage .deck-shot') ?? [])]
    const first = [true, false, false, false, false, false]
    expect(texts.map((t) => t.classList.contains('on'))).toEqual(first)
    expect(shots.map((s) => s.classList.contains('on'))).toEqual(first)
    expect(texts.map((t) => text(t.querySelector('.deck-n')))).toEqual([
      '01 / 06',
      '02 / 06',
      '03 / 06',
      '04 / 06',
      '05 / 06',
      '06 / 06'
    ])
  })

  test.each(LOCALES)('%s: the sessions step searches within the project, the search step across projects, and neither names a shortcut', (locale) => {
    const bodies = [...pages[locale].querySelectorAll('#features .deck-text p')].map(text)
    expect(bodies).toHaveLength(6)
    const [sessions, search] = [bodies[4], bodies[5]]
    if (locale === 'en') {
      expect(sessions).toMatch(/, or search within the project\.$/)
      expect(search).toBe('Find what you asked in any project’s sessions, grouped by project, and open a hit right at that question.')
    } else {
      expect(sessions).toContain('\u4e5f\u80fd\u5728\u9879\u76ee\u5185\u641c\u7d22')
      expect(search).toContain('\u5728\u6240\u6709\u9879\u76ee\u7684\u4f1a\u8bdd\u91cc\u641c')
    }
    for (const body of bodies) expect(body).not.toMatch(/⌘|⇧|\bCmd\b|\bCtrl\b|\bShift\b/)
  })

  test('three install steps; the English ones say what the spec says', () => {
    for (const locale of LOCALES) expect(pages[locale].querySelectorAll('#install .step')).toHaveLength(3)
    const [download, drag, open] = [...pages.en.querySelectorAll('#install .step')].map(text)
    expect(download).toMatch(/DMG/)
    expect(download).toMatch(/Apple Silicon/)
    expect(drag).toMatch(/drag Agentshed into your Applications/)
    expect(open).toMatch(/Apple checked it for malicious software and none was detected/)
    expect(open).toMatch(/click Open/)
    expect(open).toMatch(/update button appears at the bottom left/)
  })
})

describe('screenshots and links', () => {
  /** A PNG's pixel size, from its header */
  function pngSize(file: string): { width: number; height: number } {
    const b = readFileSync(join(outDir, file))
    expect(b.subarray(1, 4).toString('latin1')).toBe('PNG')
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }

  test.each(LOCALES)('%s: every image declares its size, and the size is the file’s own', (locale) => {
    const images = [...pages[locale].querySelectorAll('img')]
    // The brand, the hero icon, the hero window, and the six steps' screenshots twice: in the showcase and stacked
    expect(images).toHaveLength(15)
    for (const img of images) {
      const src = img.getAttribute('src')!
      const declared = { width: Number(img.getAttribute('width')), height: Number(img.getAttribute('height')) }
      expect(declared.width, src).toBeGreaterThan(0)
      expect(declared.height, src).toBeGreaterThan(0)
      const real = pngSize(src.slice(1))
      expect(declared.width / declared.height, src).toBeCloseTo(real.width / real.height, 6)
    }
  })

  test.each(LOCALES)('%s: every link to GitHub opens in a new tab', (locale) => {
    const github = [...pages[locale].querySelectorAll('a[href]')].filter(
      (a) => new URL(a.getAttribute('href')!, 'https://agentshed.aloongplanet.com').hostname === 'github.com'
    )
    // The navigation, the hero, the download row, and the footer's two
    expect(github).toHaveLength(5)
    for (const a of github) {
      expect(a.getAttribute('target'), a.outerHTML).toBe('_blank')
      expect(a.getAttribute('rel') ?? '', a.outerHTML).toMatch(/(^|\s)noopener(\s|$)/)
    }
  })
})

describe('two languages', () => {
  test('exactly two pages: Chinese at the root and English under /en', () => {
    expect(files().filter((f) => f.endsWith('.html')).sort()).toEqual(['en/index.html', 'index.html'])
    expect(pages.zh.documentElement.lang).toBe('zh-CN')
    expect(pages.en.documentElement.lang).toBe('en')
  })

  /** The words a page shows or announces: its text and the attributes read out or shown */
  function words(doc: Document): string {
    const attrs = [...doc.querySelectorAll('[alt], [aria-label], meta[name="description"]')].map(
      (el) => el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? el.getAttribute('content') ?? ''
    )
    return [doc.title, text(doc.body), ...attrs].join('\n').replace(/\s+/g, ' ')
  }

  /** Every string of a dictionary */
  function leaves(value: unknown): string[] {
    if (typeof value === 'string') return [value]
    return value && typeof value === 'object' ? Object.values(value).flatMap(leaves) : []
  }

  test.each(LOCALES)('%s: every string of the language’s copy is on its page, but the copy of the states a read brings', (locale) => {
    // The formal and test states' copy appears only once a read brings that state: the apply check holds it
    const { formal, test: testState, ...served } = ui[locale].download
    expect(leaves(formal).length + leaves(testState).length).toBeGreaterThan(5)
    const page = words(pages[locale])
    const missing = leaves({ ...ui[locale], download: served }).filter((s) => !page.includes(s.replace(/\s+/g, ' ')))
    expect(missing).toEqual([])
  })

  test('the English page has no Chinese, except the toggle naming Chinese in its own script', () => {
    const page = words(pages.en).replace('中文', '')
    expect(page.match(/\p{Script=Han}+/gu) ?? []).toEqual([])
  })

  test.each(LOCALES)('%s: the agents are named as examples, never as the whole set', (locale) => {
    const page = words(pages[locale])
    const named = page.match(/Claude Code|Codex|Grok/g) ?? []
    expect(named.length).toBeGreaterThan(0)
    expect(page).not.toMatch(/Grok/)
    // Every mention sits in the non-exhaustive phrase
    const phrase = locale === 'en' ? 'Claude Code, Codex and other coding agents' : 'Claude Code、Codex 等 coding agent'
    expect(page.split(phrase).join('')).not.toMatch(/Claude Code|Codex/)
  })
})
