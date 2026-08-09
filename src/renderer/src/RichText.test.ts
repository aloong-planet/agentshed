// Ticket 09: parsing the rich-text markers.
//
// This seam's value is **keeping one sentence to one key** — word order differs per language, so the
// emphasis moves with it,
// and fragment keys cannot do that. So these cases verify both the marker parsing and that "a marker holds
// anywhere in the sentence".
//
// createElement rather than JSX: the repository's vitest only picks up `*.test.ts`, and the configuration
// is not bent for one test.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichText } from './RichText'

const html = (text: string): string => renderToStaticMarkup(createElement(RichText, { text }))

describe('RichText', () => {
  it('**bold** renders as <b>', () => {
    expect(html('pre**mid**post')).toBe('<span>pre</span><b>mid</b><span>post</span>')
  })

  it('`code` renders as <code>', () => {
    expect(html('see the `encrypted_content` field')).toContain('<code>encrypted_content</code>')
  })

  it('emphasis holds at the start, middle and end of a sentence', () => {
    // This case is why the component exists: the six languages order words differently, so the emphasis
    // moves with them.
    // An implementation assuming the marker is always in the middle (a fixed three-way split, say) would
    // miss the start and end
    expect(html('**start**rest')).toBe('<b>start</b><span>rest</span>')
    expect(html('rest**end**')).toBe('<span>rest</span><b>end</b>')
  })

  it('several emphases in one sentence each hold', () => {
    expect(html('**A**and**B**')).toBe('<b>A</b><span>and</span><b>B</b>')
  })

  it('with no markers the output is verbatim, swallowing nothing', () => {
    expect(html('an ordinary sentence')).toBe('<span>an ordinary sentence</span>')
  })

  it('a lone marker character is not treated as a marker and displays as is', () => {
    // A single asterisk in the wording should not derange the whole sentence
    expect(html('discount 5*3 off')).toBe('<span>discount 5*3 off</span>')
  })

  it('HTML special characters are escaped and produce no tags', () => {
    // The parameters may carry user data (a session title, say); going through a JSX text node lets React
    // escape it
    expect(html('<img src=x onerror=1>')).not.toContain('<img ')
  })
})
