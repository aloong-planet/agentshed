// Deciding where a rendered markdown link goes (the bug: clicking a relative link navigated the whole
// window and lost all app state).
// A pure function seam: given href + the current document's directory + the readable file list → the
// destination verdict; the click interception itself is in the UI layer.
import { describe, it, expect } from 'vitest'
import { resolveMdLink } from './md-links'
import { ERR } from '@shared/errors'

const READABLE = [
  '/p/.claude/projects/enc/memory/pr-merge.md',
  '/p/.claude/projects/enc/memory/verify-exit.md',
  '/p/docs/specs/memory-view.md',
  '/p/docs/features/memory-view.md'
]
const MEM_DIR = '/p/.claude/projects/enc/memory'

describe('resolveMdLink', () => {
  it('a same-directory relative link → resolves to a readable file, opened inside the app', () => {
    expect(resolveMdLink('pr-merge.md', MEM_DIR, READABLE)).toEqual({
      kind: 'internal',
      file: '/p/.claude/projects/enc/memory/pr-merge.md'
    })
  })

  it('a cross-directory relative link (../) on the readable list → likewise opened inside the app', () => {
    expect(resolveMdLink('../features/memory-view.md', '/p/docs/specs', READABLE)).toEqual({
      kind: 'internal',
      file: '/p/docs/features/memory-view.md'
    })
  })

  it('an http(s) external link → handed to the system browser, never navigating inside the app window', () => {
    expect(resolveMdLink('https://code.claude.com/docs', MEM_DIR, READABLE)).toEqual({
      kind: 'external',
      url: 'https://code.claude.com/docs'
    })
  })

  it('a target not on the readable list → refused explicitly (neither silently ignored nor allowed to navigate)', () => {
    expect(resolveMdLink('missing.md', MEM_DIR, READABLE)).toEqual({
      kind: 'unresolved',
      code: ERR.linkOutOfScope
    })
  })

  it('path traversal: a result outside the readable list is refused (the allow-list is the only basis for admitting)', () => {
    expect(resolveMdLink('../../../../etc/passwd', MEM_DIR, READABLE).kind).toBe('unresolved')
  })

  it('dangerous non-http protocols are always refused (neither as an external link nor as navigation)', () => {
    for (const h of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x']) {
      expect(resolveMdLink(h, MEM_DIR, READABLE).kind).toBe('unresolved')
    }
  })

  it('an in-page anchor → left alone (the browser default, which is not a navigation escape)', () => {
    expect(resolveMdLink('#section', MEM_DIR, READABLE)).toEqual({ kind: 'anchor' })
  })

  it('a relative link with a fragment → resolved by the path with the fragment removed', () => {
    expect(resolveMdLink('pr-merge.md#why', MEM_DIR, READABLE).kind).toBe('internal')
  })
})
