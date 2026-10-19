// A state's view applied to the page as served (landing-page::REQ-002, US-001/AC-02, AC-03, Failures A7, E1): the
// pages come from the run's fresh build, and each case gets its own DOM, since applying a view writes to it.
//
// Not covered here: whether the page keeps the visitor's place when a state lands while they are scrolled down
// (jsdom has no layout); that is measured in a browser (evidence/ticket-238/).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, inject, test } from 'vitest'
import { view, type DownloadState } from '../src/download'
import { ui } from '../src/i18n/ui'
import { applyView } from '../src/scripts/apply-download'

const REPO = 'https://github.com/aloong-planet/agentshed'
const R2 = 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'
const html: Record<'zh' | 'en', string> = { zh: '', en: '' }

beforeAll(() => {
  const outDir = inject('builtSite')
  html.zh = readFileSync(join(outDir, 'index.html'), 'utf8')
  html.en = readFileSync(join(outDir, 'en/index.html'), 'utf8')
})

const page = (locale: 'zh' | 'en'): Document => new JSDOM(html[locale]).window.document
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** What a visitor gets from the hero and the download section */
function read(doc: Document) {
  const cta = doc.querySelector('.hero .cta')!
  const link = (a: Element | null) => a && { text: text(a), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }
  return {
    hero: link(cta.querySelector('a.btn')),
    heroIcon: cta.querySelectorAll('a.btn svg').length,
    meta: text(cta.querySelector('.meta')),
    pill: text(cta.querySelector('.meta .pill')) || null,
    note: text(cta.querySelector('.beta-note')) || null,
    every: link(cta.querySelector('.alt a')),
    ctaChildren: [...cta.children].map((c) => c.className),
    line: text(doc.querySelector('#download h2 + p')),
    linePill: text(doc.querySelector('#download h2 + p .pill')) || null,
    buttons: [...doc.querySelectorAll('#download .dl-actions a')].map((a) => ({
      ...link(a)!,
      kind: a.classList.contains('btn-ghost') ? 'ghost' : a.classList.contains('btn-primary') ? 'primary' : '?',
      icon: a.querySelectorAll('svg').length
    }))
  }
}

/** The markup a state changes: the hero's download block, the download section's line and its row */
const markup = (doc: Document): string[] =>
  ['.hero .cta', '#download h2 + p', '#download .dl-actions'].map((s) =>
    doc.querySelector(s)!.outerHTML.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
  )

describe('a state applied to the served page', () => {
  test('the formal state from R2: the DMG from the download host in place, GitHub in a new tab', () => {
    const doc = page('en')
    applyView(doc, view({ kind: 'formal-r2', version: '0.2.0', url: R2 }, 'en'))
    const got = read(doc)
    expect(got.hero).toEqual({ text: 'Download Agentshed 0.2.0', href: R2, target: null, rel: null })
    expect(got.heroIcon).toBe(1)
    expect(got.meta).toBe('macOS 12 or later · Apple Silicon')
    expect([got.pill, got.note]).toEqual([null, null])
    expect(got.every).toEqual({ text: 'See every version on GitHub', href: `${REPO}/releases`, target: '_blank', rel: 'noopener' })
    expect(got.line).toBe('Current version 0.2.0')
    expect(got.buttons).toEqual([
      { text: 'Download', href: R2, target: null, rel: null, kind: 'primary', icon: 1 },
      { text: 'GitHub', href: `${REPO}/releases/download/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg`, target: '_blank', rel: 'noopener', kind: 'ghost', icon: 0 }
    ])
  })

  test('the formal state from GitHub: every link on GitHub, one button', () => {
    const doc = page('en')
    applyView(doc, view({ kind: 'formal-github', version: '0.2.0', dmg: true }, 'en'))
    const got = read(doc)
    const dmg = `${REPO}/releases/download/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg`
    expect(got.hero).toEqual({ text: 'Download Agentshed 0.2.0', href: dmg, target: '_blank', rel: 'noopener' })
    expect(got.every?.href).toBe(`${REPO}/releases`)
    expect(got.buttons).toEqual([{ text: 'Download', href: dmg, target: '_blank', rel: 'noopener', kind: 'primary', icon: 1 }])
  })

  test('the test state: the pill on the platform line, the note beneath it, the pill before the line', () => {
    const doc = page('en')
    applyView(doc, view({ kind: 'test', version: '0.1.0-beta' }, 'en'))
    const got = read(doc)
    const tag = `${REPO}/releases/tag/v0.1.0-beta`
    expect(got.hero).toEqual({ text: 'Download test version 0.1.0-beta', href: tag, target: '_blank', rel: 'noopener' })
    expect(got.pill).toBe('Test version')
    expect(got.meta).toBe('Test version macOS 12 or later · Apple Silicon')
    expect(got.note).toBe('No stable release yet. The test version downloads from GitHub and may still be rough in places.')
    expect(got.every).toBeNull()
    expect(got.ctaChildren).toEqual(['btn btn-primary', 'meta', 'beta-note'])
    expect(got.linePill).toBe('Test version')
    expect(got.line).toBe('Test version Only a test version so far: 0.1.0-beta')
    expect(got.buttons).toEqual([{ text: 'Download the test version from GitHub', href: tag, target: '_blank', rel: 'noopener', kind: 'primary', icon: 1 }])
  })

  test.each(['zh', 'en'] as const)('%s: a later state replaces an earlier one in place, leaving nothing of it (Failure A7)', (locale) => {
    const doc = page(locale)
    const served = markup(doc)
    applyView(doc, view({ kind: 'test', version: '0.1.0-beta' }, locale))
    applyView(doc, view({ kind: 'formal-r2', version: '0.2.0', url: R2 }, locale))
    const got = read(doc)
    expect([got.pill, got.note, got.linePill]).toEqual([null, null, null])
    expect(got.ctaChildren).toEqual(['btn btn-primary', 'meta', 'alt'])
    expect(got.buttons).toHaveLength(2)
    // And back to the list state: the markup as served, so a change to the components that applyView does not
    // follow fails here
    applyView(doc, view({ kind: 'list' }, locale))
    expect(markup(doc)).toEqual(served)
  })

  test.each(['zh', 'en'] as const)('%s: each state applies with the language’s own copy', (locale) => {
    const states: DownloadState[] = [
      { kind: 'formal-r2', version: '0.2.0', url: R2 },
      { kind: 'formal-github', version: '0.2.0', dmg: true },
      { kind: 'test', version: '0.1.0-beta' }
    ]
    for (const state of states) {
      const doc = page(locale)
      const v = view(state, locale)
      // Copied out before the view is applied, so the expectation is not the object applyView receives
      const expected = { hero: v.hero.label, buttons: v.section.buttons.map((b) => b.label) }
      applyView(doc, v)
      const got = read(doc)
      expect(got.hero?.text, state.kind).toBe(expected.hero)
      expect(got.buttons.map((b) => b.text), state.kind).toEqual(expected.buttons)
    }
  })

  test.each(['zh', 'en'] as const)('%s: every string of the states’ copy is on the page once its state is applied', (locale) => {
    const shown = (state: DownloadState): string => {
      const doc = page(locale)
      applyView(doc, view(state, locale))
      return text(doc.body)
    }
    const formal = shown({ kind: 'formal-r2', version: '0.2.0', url: R2 })
    const pre = shown({ kind: 'test', version: '0.1.0-beta' })
    const copy = ui[locale].download
    const strings = [
      ...Object.values(copy.formal).map((s) => [s.replace('{version}', '0.2.0'), formal] as const),
      ...Object.values(copy.test).map((s) => [s.replace('{version}', '0.1.0-beta'), pre] as const)
    ]
    expect(strings).toHaveLength(10)
    expect(strings.filter(([s, on]) => !on.includes(s)).map(([s]) => s)).toEqual([])
  })

  test('labels are set as text: markup in one creates no element (Failure E1)', () => {
    const doc = page('en')
    const v = view({ kind: 'test', version: '0.1.0-beta' }, 'en')
    v.hero.label = '<img src=x onerror=alert(1)>'
    v.note = '<b>bold</b>'
    applyView(doc, v)
    expect(text(doc.querySelector('.hero .cta a.btn'))).toBe('<img src=x onerror=alert(1)>')
    expect(doc.querySelector('.hero .cta img')).toBeNull()
    expect(doc.querySelector('.hero .cta b')).toBeNull()
  })
})
