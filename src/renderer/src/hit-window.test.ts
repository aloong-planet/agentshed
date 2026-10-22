// Where a hit row starts when its keyword would be out of view (session-view::REQ-002): a pure function seam, given
// the question and the keyword → the text from 20 characters before the first occurrence, and the text from the
// occurrence itself, each after an ellipsis. Which of them a row shows is decided by laying the row out, in the
// e2e cases.
import { describe, expect, it } from 'vitest'
import { hitWindow } from './hit-window'

const THIRTY = '0123456789'.repeat(3)

describe('hitWindow', () => {
  it('starts 20 characters before the first occurrence, after an ellipsis (AC-02)', () => {
    expect(hitWindow(`${THIRTY}quokka and more`, 'quokka').before).toBe('…01234567890123456789quokka and more')
  })

  it('or at the occurrence itself, after an ellipsis (AC-03)', () => {
    expect(hitWindow(`${THIRTY}quokka and more`, 'quokka').at).toBe('…quokka and more')
  })

  it('moves nothing when the keyword opens the question, or is not in it', () => {
    expect(hitWindow('quokka first, then the rest', 'quokka')).toEqual({ before: null, at: null })
    expect(hitWindow('no such word here', 'quokka')).toEqual({ before: null, at: null })
    expect(hitWindow('anything', '')).toEqual({ before: null, at: null })
  })

  it('has no 20-character window when the keyword lies within the first 20 characters, but can still start at it', () => {
    expect(hitWindow('twelve chars quokka x', 'quokka')).toEqual({ before: null, at: '…quokka x' })
  })

  it('counts a character outside the basic plane once and never cuts one in two', () => {
    const smile = String.fromCodePoint(0x1f600)
    const { before, at } = hitWindow(`${smile.repeat(25)}quokka`, 'quokka')
    expect(before).toBe(`…${smile.repeat(20)}quokka`)
    expect(at).toBe('…quokka')
    expect(before).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('takes the first occurrence, whatever its case', () => {
    expect(hitWindow('abcdefghijklmnopqrstuvwxyQuokka one, quokka two', 'quokka').before).toBe('…fghijklmnopqrstuvwxyQuokka one, quokka two')
  })
})
