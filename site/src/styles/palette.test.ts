// The page uses the app's own palette, light and dark (landing-page::REQ-006, Failure D1): every token the
// site shares with the app carries the app's purple value, and every token is declared in both appearances.
import { expect, test } from 'vitest'
import { palette } from '../../test/support/palette'

const site = palette(new URL('./global.css', import.meta.url))
const app = palette(new URL('../../../src/renderer/src/theme.css', import.meta.url))

/** The page's own tokens, with no app counterpart (named in the stylesheet's header) */
const SITE_ONLY = ['--bg-soft', '--icon-shadow', '--shadow', '--shot-a', '--shot-b']

test('every token is declared in light and again in dark', () => {
  expect(site.light.size).toBeGreaterThan(10)
  expect([...site.dark.keys()].sort()).toEqual([...site.light.keys()].sort())
})

test('the tokens the app also has carry the app’s purple values, light and dark', () => {
  const shared = [...site.light.keys()].filter((k) => app.light.has(k))
  expect(shared.length).toBeGreaterThanOrEqual(9)
  for (const k of shared) {
    expect(site.light.get(k), `${k} light`).toBe(app.light.get(k))
    expect(site.dark.get(k), `${k} dark`).toBe(app.dark.get(k))
  }
})

test('a token the app does not have is one of the page’s own', () => {
  expect([...site.light.keys()].filter((k) => !app.light.has(k)).sort()).toEqual(SITE_ONLY)
})
