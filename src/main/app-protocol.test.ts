// app:// path resolution (checklist #18): locking the readable range to the renderer build directory.
// Ported from the Transfer project's test of the same name, adjusted for this project's host and root
// path.
import { describe, it, expect } from 'vitest'
import { resolveAppPath, APP_HOST } from './app-protocol'

const ROOT = '/app/out/renderer'
const u = (p: string): string => `app://${APP_HOST}${p}`

describe('resolveAppPath', () => {
  it('an ordinary path maps under the build root', () => {
    expect(resolveAppPath(ROOT, u('/index.html'))).toBe('/app/out/renderer/index.html')
    expect(resolveAppPath(ROOT, u('/assets/x.js'))).toBe('/app/out/renderer/assets/x.js')
  })

  it('an empty path falls back to index.html; query strings and fragments do not enter the path', () => {
    expect(resolveAppPath(ROOT, u('/'))).toBe('/app/out/renderer/index.html')
    expect(resolveAppPath(ROOT, u('/index.html?v=1#top'))).toBe('/app/out/renderer/index.html')
  })

  it('a plain .. is clamped by the URL parser at the URL layer, so the result still lands inside the build root (safe, not refused)', () => {
    // The WHATWG URL specification: a path cannot go above the root and `..` is normalised away. So what
    // is expected here is
    // "clamped inside the root" (naturally 404ing afterwards) rather than null — expecting null would be
    // a false assertion.
    expect(resolveAppPath(ROOT, u('/../../../etc/passwd'))).toBe('/app/out/renderer/etc/passwd')
  })

  it('**encoded traversal must be refused** — the one vector the explicit prefix check actually stops', () => {
    // %2e%2e%2f is not decoded at the URL layer and only becomes ../ after decodeURIComponent,
    // by which point the URL's clamping has been bypassed and only normalise + the prefix check remain.
    for (const p of ['/%2e%2e%2f%2e%2e%2fetc/passwd', '/assets/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc']) {
      expect(resolveAppPath(ROOT, u(p)), p).toBeNull()
    }
  })

  it('the wrong host is refused (an arbitrary app://<host> is not accepted)', () => {
    expect(resolveAppPath(ROOT, 'app://evil/index.html')).toBeNull()
  })

  it('an unparseable URL → null (the caller returns 404, without throwing)', () => {
    expect(resolveAppPath(ROOT, 'not a url')).toBeNull()
  })

  it('non-ASCII and space-containing paths map correctly after decoding', () => {
    expect(resolveAppPath(ROOT, u('/caf%C3%A9%20a.html'))).toBe(
      '/app/out/renderer/café a.html'
    )
  })
})
