// The dictionary's own guard. Key parity between the two languages needs no test: both satisfy one type,
// and `astro check` fails on a missing or extra key. A blank value is a string like any other to the type,
// and renders as nothing on the page, so it is checked here.
import { expect, test } from 'vitest'
import { LOCALES, ui } from './ui'

/** Every string in a dictionary, with its path, however deep */
function leaves(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  }
  return []
}

test.each(LOCALES)('%s: no blank copy', (locale) => {
  const all = leaves(ui[locale], '')
  expect(all.length).toBeGreaterThan(30)
  expect(all.filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([])
})
