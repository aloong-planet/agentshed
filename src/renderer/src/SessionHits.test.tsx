// @vitest-environment jsdom
// Which characters a hit row marks (session-view::REQ-002/AC-01): `Highlight` rendered, read back as its runs of
// text, each marked or plain. The keyword is found case-insensitively, as global search's `includes` finds it, and a
// mark covers the text's own characters, also when a letter lowers to a different number of UTF-16 units (İ U+0130
// lowers to i and U+0307).
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Highlight } from './SessionHits'

afterEach(cleanup)

/** The rendered runs as [text, marked] pairs, empty runs dropped */
function runs(text: string, needle: string): [string, boolean][] {
  const { container } = render(<Highlight text={text} needle={needle} />)
  return Array.from(container.childNodes)
    .filter((n) => (n.textContent ?? '') !== '')
    .map((n): [string, boolean] => [n.textContent ?? '', n.nodeName === 'MARK'])
}

const DOT_ABOVE = String.fromCharCode(0x307)

describe('Highlight', () => {
  it('marks a keyword that differs from the text only in the case of a non-ASCII letter', () => {
    expect(runs('Énergie du plan', 'énergie')).toEqual([
      ['Énergie', true],
      [' du plan', false]
    ])
  })

  it('marks the characters of the keyword itself when a letter before it lowers to two units', () => {
    expect(runs('İstanbul trip plan', 'plan')).toEqual([
      ['İstanbul trip ', false],
      ['plan', true]
    ])
  })

  it('marks the whole occurrence when a letter inside it lowers to two units', () => {
    expect(runs('Trip to İSTANBUL now', `i${DOT_ABOVE}stanbul`)).toEqual([
      ['Trip to ', false],
      ['İSTANBUL', true],
      [' now', false]
    ])
  })

  it('marks every occurrence after a letter that lowers to two units', () => {
    expect(runs('a İ a', 'a')).toEqual([
      ['a', true],
      [' İ ', false],
      ['a', true]
    ])
  })
})
