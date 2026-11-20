// The decision layer of Electron's host security guards (checklist #13/#14/#15/#12).
// ── Wiring coverage as it stands (2026-08-04, ticket 04): sessionReadTarget's **refusal wiring** has
// end-to-end evidence —
// the e2e "IPC surface" case sends an invalid path over real IPC via page.evaluate and asserts the handler
// refuses it
// (mutation-checked: removing the guard from the handler turns it red). Still missing are
// unit-level behaviour tests for the exit assertSessionPage
// and the !scans line (there is no IPC harness, the same kind of gap getProjectDetail already
// has); the former is backed by the preload's second validation, and the latter is a self-harming path in
// the startup race window.
// Why these tests exist: research (2026-08-02) confirmed that the official runtime Security Warnings
// **do not cover**
// items 12–14 (their source comments say "not implemented"), and Electronegativity is unmaintained and
// **silently admits** the case of "only
// setWindowOpenHandler written, no will-navigate" — which is exactly the shape this project once had.
// So no off-the-shelf tool guards this class of regression, and the decision layer is a pure function
// pinned down here.
import { describe, it, expect, afterAll } from 'vitest'
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

// session-view::US-001/AC-07, AC-10 and R1: showing a session's record file in Finder admits exactly what reading
// it admits (the exact-path session allow-list, judged first), and then only a file still there; an entry restored
// before the first scan only while it is a regular file, as a restored memory file is read. Real temp files and a
// symlink stand in for the disk; the judge is given the same probes the handler gives it.
import { sessionRevealTarget } from './security'
import { regularTarget } from './source-identity'
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('sessionRevealTarget (showing a session\'s record file in Finder)', () => {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-reveal-'))
  const present = join(root, 'a.jsonl')
  const target = join(root, 'target.jsonl')
  const link = join(root, 'link.jsonl')
  const gone = join(root, 'gone.jsonl')
  writeFileSync(present, '{}\n')
  writeFileSync(target, '{}\n')
  symlinkSync(target, link)
  const listed = new Set([present, link, gone])
  const probes = { exists: existsSync, regular: (f: string) => regularTarget(f) }
  const judge = (raw: unknown, restored = false) => sessionRevealTarget(listed, raw, { restored, ...probes })

  it('shows a listed file that is still there, live or restored', () => {
    expect(judge(present)).toEqual({ ok: true, file: present })
    expect(judge(present, true)).toEqual({ ok: true, file: present })
  })

  it('reports a listed file that is gone, without showing anything', () => {
    expect(judge(gone)).toEqual({ ok: false, code: ERR.sessionFileUnreadable })
  })

  it('a restored entry that is not a regular file is refused; a live one is shown', () => {
    expect(judge(link, true)).toEqual({ ok: false, code: ERR.sessionNotWhitelisted })
    expect(judge(link)).toEqual({ ok: true, file: link })
  })

  it('refuses whatever is not exactly a listed path — another type, empty, traversal, a prefix lookalike, an encoding, another case — before touching it', () => {
    let touched = 0
    const counting = { restored: false, exists: (f: string) => { touched++; return existsSync(f) }, regular: (f: string) => { touched++; return regularTarget(f) } }
    for (const raw of [42, null, '', `${root}/../${root.split('/').pop() ?? ''}/a.jsonl`, `${present}2`, `${present}/x`,
      present.replace('a.jsonl', '%61.jsonl'), present.toUpperCase(), target]) {
      expect(sessionRevealTarget(listed, raw, counting)).toEqual({ ok: false, code: ERR.sessionNotWhitelisted })
    }
    expect(touched).toBe(0)
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))
})

// skill-install R3: a skill install or uninstall goes only into one of the app's projects, named by its exact
// path, and a project the app lists as stale is refused as stale. The target arrives from the renderer, so anything
// that is not exactly a listed path is refused, whatever directory it would reach.
import { skillOpTarget } from './security'

describe('skillOpTarget (which directory a skill install or uninstall may go into)', () => {
  const nfc = '/Users/x/work/café'.normalize('NFC')
  const projects = [
    { path: '/Users/x/work/alpha', stale: false },
    { path: '/Users/x/work/beta', stale: false },
    { path: '/Users/x/work/beta/nested', stale: false },
    { path: nfc, stale: false },
    { path: '/Users/x/work/gone', stale: true }
  ]

  const admitted = { ok: true }
  const notProject = { ok: false, code: ERR.skillTargetNotProject }
  it.each([
    ['admits a listed project that is not stale, by its exact path', projects, '/Users/x/work/beta', admitted],
    ['admits a listed project inside another listed project', projects, '/Users/x/work/beta/nested', admitted],
    ['refuses a directory no project has as not one of the app\'s projects', projects, '/Users/x/work/gamma', notProject],
    ['refuses the home directory as not one of the app\'s projects', projects, '/Users/x', notProject],
    ['refuses the parent of a project as not one of the app\'s projects', projects, '/Users/x/work', notProject],
    ['refuses a directory inside a project that is not itself listed as not one of the app\'s projects', projects, '/Users/x/work/alpha/src', notProject],
    ['refuses a project with a trailing separator as not one of the app\'s projects', projects, '/Users/x/work/alpha/', notProject],
    ['refuses a .. segment leading to a listed project as not one of the app\'s projects', projects, '/Users/x/work/alpha/../beta', notProject],
    ['refuses a .. segment leading out of a project as not one of the app\'s projects', projects, '/Users/x/work/alpha/..', notProject],
    ['refuses a project in another letter case as not one of the app\'s projects', projects, '/Users/x/work/ALPHA', notProject],
    ['refuses a prefix lookalike of a project as not one of the app\'s projects', projects, '/Users/x/work/alpha2', notProject],
    ['refuses a project spelled in another Unicode normalisation as not one of the app\'s projects', projects, nfc.normalize('NFD'), notProject],
    ['refuses a relative spelling of a project as not one of the app\'s projects', projects, 'work/alpha', notProject],
    ['refuses an empty path as not one of the app\'s projects', projects, '', notProject],
    ['refuses the root directory as not one of the app\'s projects', projects, '/', notProject],
    ['refuses any path, when the app lists no project, as not one of the app\'s projects', [], '/Users/x/work/alpha', notProject],
    ['refuses a project the app lists as stale as stale', projects, '/Users/x/work/gone', { ok: false, code: ERR.skillStaleTarget }]
  ])('%s', (_what, listed, target, expected) => {
    expect(skillOpTarget(listed, target)).toEqual(expected)
  })
})

// skill-install R4: an install or uninstall never changes a global library — its landing is never a library or inside
// one, and its copy is never a library, inside one or holding one — whatever spelling, link or letter case names it,
// and a library not there yet is judged where it would be created. Real directories stand in for the disk; the
// decision is given the probes the install gives it. Every row's target would pass R3: only this decision stands
// between it and the disk.
import { skillOpLibrary } from './security'
import { dirPlace, entryPlace } from './providers/install'
import { globalSkillsRoots, type ScanRoots } from './providers/types'
import { mkdirSync } from 'node:fs'

describe('skillOpLibrary (an install or uninstall that would change a global library)', () => {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-library-'))
  const at = (...p: string[]): string => join(root, ...p)
  const mk = (...p: string[]): string => {
    mkdirSync(at(...p), { recursive: true })
    return at(...p)
  }
  const link = (target: string, ...p: string[]): string => {
    symlinkSync(target, at(...p))
    return at(...p)
  }
  // A home with Claude's and Codex's libraries there, one with no library there yet, and one whose Claude library is
  // itself a link
  const home = mk('home')
  mk('home', '.claude', 'skills', 'tidy')
  mk('home', '.agents', 'skills', 'tdd')
  mk('home', '.agents', 'skills', 'other')
  mk('home', '.agents', 'skills-old')
  const bare = mk('bare')
  const linked = mk('linked')
  mk('linked', '.claude', 'library')
  link(at('linked', '.claude', 'library'), 'linked', '.claude', 'skills')
  // Projects outside every home
  const toHome = link(home, 'to-home')
  const libLink = mk('lib-link')
  mk('lib-link', '.claude')
  link(at('home', '.claude', 'skills'), 'lib-link', '.claude', 'skills')
  const toTdd = link(at('home', '.agents', 'skills', 'tdd'), 'to-tdd')
  const own = mk('own')
  mk('own', '.claude', 'skills', 'mine')
  link(at('home', '.claude', 'skills'), 'own', '.claude', 'skills', 'borrowed')
  const fresh = mk('fresh')
  const toClaude = mk('to-claude')
  mk('to-claude', '.claude')
  link(at('home', '.claude'), 'to-claude', '.claude', 'skills')
  const atHome = mk('at-home')
  mk('at-home', '.claude')
  link(home, 'at-home', '.claude', 'skills')
  const atBare = mk('at-bare')
  mk('at-bare', '.claude')
  link(bare, 'at-bare', '.claude', 'skills')
  const toLinked = mk('to-linked')
  mk('to-linked', '.claude')
  link(at('linked', '.claude'), 'to-linked', '.claude', 'skills')
  // A home whose Claude library is a link to a directory elsewhere, and a project whose skills directory leads to the
  // directory above that one
  const far = mk('far')
  mk('far', '.claude')
  mk('dot', 'skills', 'tidy')
  link(at('dot', 'skills'), 'far', '.claude', 'skills')
  const above = mk('above')
  mk('above', '.claude')
  link(root, 'above', '.claude', 'skills')

  const rootsOf = (h: string): ScanRoots => ({
    claudeHome: join(h, '.claude'),
    claudeConfigFile: join(h, '.claude.json'),
    codexHome: join(h, '.codex'),
    geminiHome: join(h, '.gemini'),
    grokHome: join(h, '.grok'),
    antigravityHome: join(h, '.gemini', 'antigravity-cli'),
    agentsSkillsDir: join(h, '.agents', 'skills')
  })
  const judge = (h: string, landings: string[], copies: string[]) =>
    skillOpLibrary({ landings, copies, libraries: Object.values(globalSkillsRoots(rootsOf(h))).flat() }, { dir: dirPlace, entry: entryPlace })
  const refused = { ok: false, code: 'skill-target-global-library' }
  const admitted = { ok: true }

  it.each([
    ['refuses the home directory, by its own path, at Claude\'s landing', home, [join(home, '.claude', 'skills')], [], refused],
    ['refuses the home directory through a link to it', home, [join(toHome, '.claude', 'skills')], [], refused],
    ['refuses the home directory at the shared skills directory, Codex\'s library', home, [join(home, '.agents', 'skills')], [], refused],
    ['refuses the home directory at a library not there yet, judged where it would be created', bare, [join(bare, '.agents', 'skills')], [], refused],
    ['refuses a project whose skills directory is a link to a library', home, [join(libLink, '.claude', 'skills')], [], refused],
    ['refuses a project inside a library\'s skill', home, [join(home, '.agents', 'skills', 'tdd', '.claude', 'skills')], [], refused],
    ['refuses a project that is a link to a library\'s skill, seen only where it really leads', home, [join(toTdd, '.claude', 'skills')], [], refused],
    ['admits a project with a skills directory of its own', home, [join(own, '.claude', 'skills')], [join(own, '.claude', 'skills', 'mine')], admitted],
    ['admits a project with no skills directory yet', home, [join(fresh, '.claude', 'skills'), join(fresh, '.agents', 'skills')], [join(fresh, '.claude', 'skills', 'tidy'), join(fresh, '.agents', 'skills', 'tidy')], admitted],
    ['admits a project whose name extends a library\'s', home, [join(home, '.agents', 'skills-old', '.claude', 'skills'), join(home, '.agents', 'skills-old', '.agents', 'skills')], [join(home, '.agents', 'skills-old', '.claude', 'skills', 'tidy')], admitted],
    ['refuses a copy that is a library, through a landing that leads to the library\'s parent', home, [join(toClaude, '.claude', 'skills')], [join(toClaude, '.claude', 'skills', 'skills')], refused],
    ['refuses a copy that is a library that is itself a link', linked, [join(toLinked, '.claude', 'skills')], [join(toLinked, '.claude', 'skills', 'skills')], refused],
    ['refuses a project inside where a library that is itself a link leads', far, [at('dot', 'skills', 'tidy', '.claude', 'skills')], [], refused],
    ['refuses a copy that would hold where a library that is itself a link leads', far, [join(above, '.claude', 'skills')], [join(above, '.claude', 'skills', 'dot')], refused],
    ['refuses an install whose copy would hold a library', home, [join(atHome, '.claude', 'skills'), join(atHome, '.agents', 'skills')], [join(atHome, '.claude', 'skills', '.claude'), join(atHome, '.agents', 'skills', '.claude')], refused],
    ['refuses a copy that would hold a library not there yet, named in another letter case', bare, [join(atBare, '.claude', 'skills')], [join(atBare, '.claude', 'skills', '.CLAUDE')], refused],
    ['admits a copy that is itself a link to a library, which is deleted as the link alone', home, [join(own, '.claude', 'skills')], [join(own, '.claude', 'skills', 'borrowed')], admitted]
  ])('%s', (_what, h, landings, copies, expected) => {
    expect(judge(h, landings, copies)).toEqual(expected)
  })

  // On a volume that ignores letter case (macOS's default, not the Linux of CI, where that spelling is another directory)
  it.skipIf(!existsSync(at('HOME')))('refuses the home directory spelled in another letter case', () => {
    expect(judge(home, [at('HOME', '.claude', 'skills')], [])).toEqual(refused)
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))
})
