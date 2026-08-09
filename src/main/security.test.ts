// The decision layer of Electron's host security guards (checklist #13/#14/#15/#12).
// ── Wiring coverage as it stands (2026-08-04, ticket 04): sessionReadTarget's **refusal wiring** has
// end-to-end evidence —
// the e2e "IPC surface" case sends an invalid path over real IPC via page.evaluate and asserts the handler
// refuses it
// (mutation-checked: removing the guard from the handler turns it red). What is still missing is only
// unit-level behaviour tests for the exit assertSessionPage
// and the !tokenEngine line (there is no IPC harness, the same kind of gap getProjectDetail already
// has); the former is backed by the preload's second validation, and the latter is a self-harming path in
// the startup race window.
// Why these tests exist: research (2026-08-02) confirmed that the official runtime Security Warnings
// **do not cover**
// items 12–14 (their source comments say "not implemented"), and Electronegativity is unmaintained and
// **silently admits** the case of "only
// setWindowOpenHandler written, no will-navigate" — which is exactly the shape this project once had.
// So no off-the-shelf tool guards this class of regression, and the decision layer is a pure function
// pinned down here.
import { describe, it, expect } from 'vitest'
import { isAppUrl, externalOpenTarget, assertTrustedSender, cspFor } from './security'

const DEV = 'http://localhost:5173'

describe('isAppUrl (the navigation admission judgement · #13)', () => {
  it('dev: the same origin is admitted, including subpaths and query strings', () => {
    expect(isAppUrl(`${DEV}/index.html`, DEV)).toBe(true)
    expect(isAppUrl(`${DEV}/index.html?x=1#a`, DEV)).toBe(true)
  })

  it('dev: **a matching prefix with a different origin** must be refused (the startsWith bypass the official docs name)', () => {
    expect(isAppUrl('http://localhost:5173.attacker.com/x', DEV)).toBe(false)
    expect(isAppUrl('http://localhost:51730/x', DEV)).toBe(false)
    expect(isAppUrl('https://localhost:5173/x', DEV)).toBe(false) // A different protocol is a different origin
  })

  it('prod (no dev base): admits app:// (the renderer page as of #18) and file:, refusing everything else', () => {
    expect(isAppUrl('app://bundle/index.html', undefined)).toBe(true)
    expect(isAppUrl('file:///app/out/renderer/index.html', undefined)).toBe(true)
    expect(isAppUrl('https://example.com', undefined)).toBe(false)
    expect(isAppUrl('http://localhost:5173/', undefined)).toBe(false)
  })

  it('a URL parse failure → refused (unparseable input is never admitted)', () => {
    expect(isAppUrl('not a url', DEV)).toBe(false)
    expect(isAppUrl('', DEV)).toBe(false)
  })
})

describe('externalOpenTarget (the allow-list for handing to the system browser · #15)', () => {
  it('http/https are admitted, returning the normalised href', () => {
    expect(externalOpenTarget('https://code.claude.com/docs')).toBe('https://code.claude.com/docs')
    expect(externalOpenTarget('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
  })

  it('**an allow-list of protocols, not a deny-list**: anything other than http(s) is refused', () => {
    for (const u of [
      'file:///etc/passwd',
      'smb://server/share',
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'vscode://x',
      'mailto:a@b.c'
    ]) {
      expect(externalOpenTarget(u), u).toBeNull()
    }
  })

  it('casing and malformed input must not bypass it (the string-comparison trap the official docs warn about)', () => {
    expect(externalOpenTarget('HTTPS://example.com/')).toBe('https://example.com/')
    expect(externalOpenTarget('JaVaScRiPt:alert(1)')).toBeNull()
    // A trusted domain stuffed into userinfo: the real host is evil.com, and it may be admitted but must
    // open with the real origin
    const u = externalOpenTarget('https://code.claude.com@evil.com/x')
    expect(u === null || new URL(u).hostname === 'evil.com').toBe(true)
  })

  it('unparseable → refused', () => {
    expect(externalOpenTarget('')).toBeNull()
    expect(externalOpenTarget('://x')).toBeNull()
  })
})

describe('cspFor (the content security policy · #7)', () => {
  it('prod: no unsafe-eval or unsafe-inline script, with outbound requests blocked by default-src self', () => {
    const p = cspFor(false)
    expect(p).toContain("script-src 'self'")
    expect(p).not.toContain('unsafe-eval')
    expect(p).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(p).toContain("default-src 'self'")
  })

  it('both profiles forbid object/frame/base-uri/form-action (removing the subframe and form-exfiltration surfaces)', () => {
    for (const p of [cspFor(true), cspFor(false)]) {
      expect(p).toContain("object-src 'none'")
      expect(p).toContain("frame-src 'none'")
      expect(p).toContain("base-uri 'none'")
      expect(p).toContain("form-action 'none'")
    }
  })

  it('img-src excludes http(s): an external tracking image in markdown must not go out (privacy)', () => {
    for (const p of [cspFor(true), cspFor(false)]) {
      const img = /img-src ([^;]*)/.exec(p)?.[1] ?? ''
      expect(img).toContain("'self'")
      expect(img).toContain('data:')
      expect(img).not.toMatch(/https?:/)
    }
  })

  it('dev: relaxed for vite HMR (inline+eval+ws), without which the development environment will not run', () => {
    const d = cspFor(true)
    expect(d).toContain('unsafe-eval')
    expect(d).toContain('ws:')
  })
})

describe('assertTrustedSender (IPC caller validation · #17)', () => {
  it('the app\'s own page is admitted', () => {
    expect(() => assertTrustedSender(`${DEV}/index.html`, DEV)).not.toThrow()
    expect(() => assertTrustedSender('file:///app/out/renderer/index.html', undefined)).not.toThrow()
  })

  it('an external page throws (a navigated-away renderer still holds the channels → this layer stops it)', () => {
    expect(() => assertTrustedSender('https://evil.com/', DEV)).toThrow(ERR.untrustedSender)
  })

  it('no sender (a destroyed frame and the like) is treated as untrusted', () => {
    expect(() => assertTrustedSender(undefined, DEV)).toThrow(ERR.untrustedSender)
  })
})

// ── Ticket 04: the session file read allow-list (the range-read path's entry guard) ──
import { sessionReadTarget } from './security'
import { ERR } from '@shared/errors'

describe('sessionReadTarget (the session read allow-list judgement)', () => {
  const wl = new Set([
    '/Users/x/.claude/projects/-e/a.jsonl',
    '/Users/x/.codex/sessions/2026/01/01/rollout-1.jsonl'
  ])

  it('an exact path on the allow-list is admitted and returned as is', () => {
    expect(sessionReadTarget(wl, '/Users/x/.claude/projects/-e/a.jsonl')).toBe(
      '/Users/x/.claude/projects/-e/a.jsonl'
    )
  })

  it('a non-string or empty string is refused', () => {
    expect(sessionReadTarget(wl, 42)).toBeNull()
    expect(sessionReadTarget(wl, null)).toBeNull()
    expect(sessionReadTarget(wl, '')).toBeNull()
  })

  it('path traversal vectors are refused: a .. segment cannot equal any exact member', () => {
    expect(sessionReadTarget(wl, '/Users/x/.claude/projects/-e/../-e/a.jsonl')).toBeNull()
    expect(sessionReadTarget(wl, '/Users/x/.claude/projects/-e/a.jsonl/../a.jsonl')).toBeNull()
  })

  it('prefix-lookalike vectors are refused: a member being another path\'s prefix admits nothing', () => {
    expect(sessionReadTarget(wl, '/Users/x/.claude/projects/-e/a.jsonl2')).toBeNull()
    expect(sessionReadTarget(wl, '/Users/x/.claude/projects/-e/a.jsonl/x')).toBeNull()
  })

  it('encoded traversal vectors are refused: forms such as %2e%2e are not decoded before comparison', () => {
    expect(sessionReadTarget(wl, '/Users/x/.claude/projects/%2e%2e/-e/a.jsonl')).toBeNull()
  })

  it('Unicode normalisation variants are refused (the fail-closed direction): an NFD string does not equal an NFC member', () => {
    // The macOS filesystem is normalisation-insensitive, so an NFD variant may open the same file — but
    // under exact matching
    // we refuse the variant outright; the direction is to shut out "another spelling of the same file",
    // never to let something in.
    const nfd = '/Users/x/.claude/projects/-é/a.jsonl'.normalize('NFD')
    const wl2 = new Set(['/Users/x/.claude/projects/-é/a.jsonl'.normalize('NFC')])
    expect(sessionReadTarget(wl2, nfd)).toBeNull()
  })

  it('an empty allow-list refuses everything', () => {
    expect(sessionReadTarget(new Set<string>(), '/Users/x/.claude/projects/-e/a.jsonl')).toBeNull()
  })
})
