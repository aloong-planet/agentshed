// The list state's download view (landing-page::REQ-002/AC-04): what both buttons say and where they lead.
// The served page renders this view; the built-site check confirms that the HTML carries it.
import { describe, expect, test } from 'vitest'
import { listView } from './download'
import { LOCALES } from './i18n/ui'

/** GitHub's release list for this repository: the spec's "GitHub's release list" */
const RELEASE_LIST = 'https://github.com/aloong-planet/agentshed/releases'

describe('the list state', () => {
  test.each(LOCALES)('%s: both buttons lead to the release list, in a new tab', (locale) => {
    const view = listView(locale)
    expect(view.hero).toMatchObject({ href: RELEASE_LIST, newTab: true })
    expect(view.section.buttons).toHaveLength(1)
    expect(view.section.buttons[0]).toMatchObject({ href: RELEASE_LIST, newTab: true })
  })

  test('English copy is the spec’s', () => {
    const view = listView('en')
    expect(view.hero.label).toBe('Download Agentshed from GitHub')
    expect(view.section.line).toBe('Version details can’t be loaded right now — download from GitHub')
    expect(view.section.buttons[0]?.label).toBe('Download from GitHub')
  })

  test.each(LOCALES)('%s: no version anywhere in the buttons, and every label is there', (locale) => {
    const view = listView(locale)
    for (const label of [view.hero.label, view.section.line, ...view.section.buttons.map((b) => b.label)]) {
      expect(label.trim()).not.toBe('')
      expect(label).not.toMatch(/\d+\.\d+/)
    }
  })
})
