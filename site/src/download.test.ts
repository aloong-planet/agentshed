// What the page offers, from the two reads (landing-page::REQ-001), and what each state's buttons say and where
// they lead (landing-page::REQ-002). The English copy is the spec's; the Chinese is checked against the confirmed
// prototype in the evidence. Every link is written out as a literal, not rebuilt with the module's helpers.
import { describe, expect, test } from 'vitest'
import { decide, view, type DownloadState } from './download'
import { LOCALES } from './i18n/ui'
import type { GitHubRead, PointerRead } from './releases'

const REPO = 'https://github.com/aloong-planet/agentshed'
const RELEASE_LIST = `${REPO}/releases`

describe('deciding what to offer', () => {
  const formalR2: PointerRead = { kind: 'formal', version: '0.2.0', url: 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg' }
  const pointers: [string, PointerRead][] = [
    ['no pointer', { kind: 'absent' }],
    ['an unreadable pointer', { kind: 'unreadable' }]
  ]
  const githubs: [string, GitHubRead | undefined, DownloadState][] = [
    ['a formal release', { kind: 'formal', version: '0.2.0', dmg: true }, { kind: 'formal-github', version: '0.2.0', dmg: true }],
    ['a formal release without its DMG', { kind: 'formal', version: '0.2.0', dmg: false }, { kind: 'formal-github', version: '0.2.0', dmg: false }],
    ['only a pre-release', { kind: 'pre', version: '0.1.0-beta' }, { kind: 'test', version: '0.1.0-beta' }],
    ['no release', { kind: 'none' }, { kind: 'list' }],
    ['GitHub unreadable', { kind: 'unreadable' }, { kind: 'list' }],
    ['GitHub not read', undefined, { kind: 'list' }]
  ]

  test.each(githubs)('a readable pointer wins, whatever GitHub says (%s)', (_, github) => {
    expect(decide(formalR2, github)).toEqual({ kind: 'formal-r2', version: '0.2.0', url: formalR2.url })
  })

  for (const [p, pointer] of pointers) {
    test.each(githubs)(`${p}, and GitHub has %s`, (_, github, expected) => {
      expect(decide(pointer, github)).toEqual(expected)
    })
  }
})

describe('the list state', () => {
  test.each(LOCALES)('%s: both buttons lead to the release list, in a new tab', (locale) => {
    const v = view({ kind: 'list' }, locale)
    expect(v.hero).toMatchObject({ href: RELEASE_LIST, newTab: true })
    expect(v.section.buttons).toHaveLength(1)
    expect(v.section.buttons[0]).toMatchObject({ href: RELEASE_LIST, newTab: true, kind: 'primary' })
    expect([v.pill, v.note, v.every, v.section.pill]).toEqual([null, null, null, null])
  })

  test('English copy is the spec’s', () => {
    const v = view({ kind: 'list' }, 'en')
    expect(v.hero.label).toBe('Download Agentshed from GitHub')
    expect(v.section.line).toBe('Version details can’t be loaded right now — download from GitHub')
    expect(v.section.buttons[0]?.label).toBe('Download from GitHub')
  })

  test.each(LOCALES)('%s: no version anywhere in the buttons, and every label is there', (locale) => {
    const v = view({ kind: 'list' }, locale)
    for (const label of [v.hero.label, v.section.line, ...v.section.buttons.map((b) => b.label)]) {
      expect(label.trim()).not.toBe('')
      expect(label).not.toMatch(/\d+\.\d+/)
    }
  })
})

describe('the formal state from R2', () => {
  const state: DownloadState = { kind: 'formal-r2', version: '0.2.0', url: 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg' }

  test('English: the versioned button downloads the DMG from the download host, in place', () => {
    const v = view(state, 'en')
    expect(v.hero).toEqual({ label: 'Download Agentshed 0.2.0', href: state.url, newTab: false, kind: 'primary' })
    expect(v.every).toEqual({ label: 'See every version on GitHub', href: RELEASE_LIST, newTab: true, kind: 'primary' })
    expect([v.pill, v.note, v.section.pill]).toEqual([null, null, null])
    expect(v.section.line).toBe('Current version 0.2.0')
    expect(v.section.buttons).toEqual([
      { label: 'Download', href: state.url, newTab: false, kind: 'primary' },
      { label: 'GitHub', href: `${REPO}/releases/download/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg`, newTab: true, kind: 'ghost' }
    ])
  })
})

describe('the formal state from GitHub', () => {
  test('English: every link on GitHub, the download row with one button', () => {
    const v = view({ kind: 'formal-github', version: '0.2.0', dmg: true }, 'en')
    const dmg = `${REPO}/releases/download/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg`
    expect(v.hero).toEqual({ label: 'Download Agentshed 0.2.0', href: dmg, newTab: true, kind: 'primary' })
    expect(v.every).toEqual({ label: 'See every version on GitHub', href: RELEASE_LIST, newTab: true, kind: 'primary' })
    expect(v.section.line).toBe('Current version 0.2.0')
    expect(v.section.buttons).toEqual([{ label: 'Download', href: dmg, newTab: true, kind: 'primary' }])
  })

  test('a release without its DMG: the buttons lead to its release page (Failure A8)', () => {
    const v = view({ kind: 'formal-github', version: '0.2.0', dmg: false }, 'en')
    const page = `${REPO}/releases/tag/v0.2.0`
    expect(v.hero.href).toBe(page)
    expect(v.section.buttons.map((b) => b.href)).toEqual([page])
  })
})

describe('the test state', () => {
  test('English: the test version on GitHub, said plainly', () => {
    const v = view({ kind: 'test', version: '0.1.0-beta' }, 'en')
    const page = `${REPO}/releases/tag/v0.1.0-beta`
    expect(v.hero).toEqual({ label: 'Download test version 0.1.0-beta', href: page, newTab: true, kind: 'primary' })
    expect(v.pill).toBe('Test version')
    expect(v.note).toBe('No stable release yet. The test version downloads from GitHub and may still be rough in places.')
    expect(v.every).toBeNull()
    expect(v.section.pill).toBe('Test version')
    expect(v.section.line).toBe('Only a test version so far: 0.1.0-beta')
    expect(v.section.buttons).toEqual([{ label: 'Download the test version from GitHub', href: page, newTab: true, kind: 'primary' }])
  })
})

describe('every state in both languages', () => {
  const states: DownloadState[] = [
    { kind: 'formal-r2', version: '0.2.0', url: 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg' },
    { kind: 'formal-github', version: '0.2.0', dmg: true },
    { kind: 'test', version: '0.1.0-beta' },
    { kind: 'list' }
  ]

  test('the other language: the same shape in each state as in English', () => {
    const others = LOCALES.filter((l) => l !== 'en')
    expect(others).toHaveLength(1)
    expect(states).toHaveLength(4)
    for (const locale of others) for (const state of states) {
      const shape = (v: ReturnType<typeof view>) => ({
        hero: [v.hero.href, v.hero.newTab, v.hero.kind],
        pill: v.pill === null,
        note: v.note === null,
        every: v.every && [v.every.href, v.every.newTab],
        section: [v.section.pill === null, v.section.buttons.map((b) => [b.href, b.newTab, b.kind])]
      })
      expect(shape(view(state, locale)), state.kind).toEqual(shape(view(state, 'en')))
      expect(view(state, locale).hero.label.trim(), state.kind).not.toBe('')
    }
  })

  test('the version comes from the state, so another release needs no change (REQ-001/AC-05)', () => {
    const a = view({ kind: 'formal-github', version: '0.2.0', dmg: true }, 'zh')
    const b = view({ kind: 'formal-github', version: '1.4.2', dmg: true }, 'zh')
    expect(a.hero.label).toContain('0.2.0')
    expect(b.hero.label).toContain('1.4.2')
    expect(b.hero.label).not.toContain('0.2.0')
    expect(b.hero.href).toBe(`${REPO}/releases/download/v1.4.2/Agentshed-1.4.2-mac-arm64.dmg`)
    expect(b.section.line).toContain('1.4.2')
  })
})
