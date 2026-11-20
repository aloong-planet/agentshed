// Ticket 06: install and uninstall — landing by copy (dereferenced), blocking same names, refusing stale
// projects, cleaning up on failure, and the uninstall guards.
// Gaps: telling a directory that holds the skill, its library entry or the landing stats each one, all resolved a
// moment before, so that stat fails only on one vanishing in between and no test drives its throw; and a link to the
// copy being written would need that copy's temporary name, which nothing outside the install knows, so the copy's
// own place among the directories that lead back (skill-install::REQ-004/AC-03) is not driven either.
import { chmodSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installSkill, uninstallSkill } from './install'
import type { ScanRoots } from './types'
import { ERR } from '@shared/errors'

let dir: string
let proj: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    geminiHome: join(dir, '.gemini'),
    grokHome: join(dir, '.grok'),
    antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
function mkGlobalSkill(side: 'claude' | 'codex', name: string, body = 'B'): string {
  const base = side === 'claude' ? join(dir, '.claude', 'skills') : join(dir, '.agents', 'skills')
  const d = join(base, name)
  mkdirSync(join(d, 'assets'), { recursive: true })
  writeFileSync(join(d, 'SKILL.md'), `---\nname: ${name}\n---\n${body}\n`)
  writeFileSync(join(d, 'assets', 'x.txt'), 'asset')
  return d
}

/** The paths inside a directory, at any depth, that are symlinks */
function linksBelow(root: string, rel = ''): string[] {
  return readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const path = rel === '' ? e.name : `${rel}/${e.name}`
    if (e.isSymbolicLink()) return [path]
    return e.isDirectory() ? linksBelow(root, path) : []
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-ins-'))
  proj = join(dir, 'work', 'p1')
  mkdirSync(proj, { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('installSkill', () => {
  it('installing on the Claude side: copied into the project\'s .claude/skills with contents intact', () => {
    mkGlobalSkill('claude', 'tdd')
    const r = installSkill(roots(), { skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    const target = join(proj, '.claude', 'skills', 'tdd')
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('tdd')
    expect(readFileSync(join(target, 'assets', 'x.txt'), 'utf8')).toBe('asset')
  })

  it('installing on the Codex side lands in .agents/skills', () => {
    mkGlobalSkill('codex', 'decision-form')
    const r = installSkill(roots(), { skillName: 'decision-form', side: 'codex', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    expect(existsSync(join(proj, '.agents', 'skills', 'decision-form', 'SKILL.md'))).toBe(true)
  })

  // skill-install::REQ-004/AC-01, A1, R1: the skill's own entry is a link, relative as the library's entries are, and
  // below it a file link and a directory link lead out of the skill and a directory link leads to a directory inside
  // it, the first and the last relative
  it('every symlink in the skill, at any depth, lands as what it points to, and writing into the copy changes nothing behind it', () => {
    const real = join(dir, 'library-real', 'linked')
    mkdirSync(join(real, 'sub', 'deep'), { recursive: true })
    mkdirSync(join(real, 'refs', 'inner'), { recursive: true })
    writeFileSync(join(real, 'SKILL.md'), 'linked skill')
    writeFileSync(join(real, 'refs', 'inner', 'i.txt'), 'inner')
    const outside = join(dir, 'outside')
    mkdirSync(join(outside, 'dir'), { recursive: true })
    writeFileSync(join(outside, 'note.md'), 'outside note')
    writeFileSync(join(outside, 'dir', 'g.txt'), 'outside dir file')
    symlinkSync(relative(join(real, 'sub', 'deep'), join(outside, 'note.md')), join(real, 'sub', 'deep', 'flink'))
    symlinkSync(join(outside, 'dir'), join(real, 'sub', 'deep', 'dlink'))
    symlinkSync('inner', join(real, 'refs', 'inner-link'))
    mkdirSync(join(dir, '.claude', 'skills'), { recursive: true })
    symlinkSync(relative(join(dir, '.claude', 'skills'), real), join(dir, '.claude', 'skills', 'linked'))

    expect(installSkill(roots(), { skillName: 'linked', side: 'claude', targetProjectPath: proj })).toEqual({ ok: true })
    const target = join(proj, '.claude', 'skills', 'linked')
    expect(lstatSync(target).isSymbolicLink()).toBe(false)
    expect(linksBelow(target)).toEqual([])
    const landed = {
      'SKILL.md': 'linked skill',
      'sub/deep/flink': 'outside note',
      'sub/deep/dlink/g.txt': 'outside dir file',
      'refs/inner/i.txt': 'inner',
      'refs/inner-link/i.txt': 'inner'
    }
    for (const [path, text] of Object.entries(landed)) expect(readFileSync(join(target, path), 'utf8')).toBe(text)
    for (const path of Object.keys(landed)) writeFileSync(join(target, path), 'written in the project')
    expect(readFileSync(join(real, 'SKILL.md'), 'utf8')).toBe('linked skill')
    expect(readFileSync(join(outside, 'note.md'), 'utf8')).toBe('outside note')
    expect(readFileSync(join(outside, 'dir', 'g.txt'), 'utf8')).toBe('outside dir file')
    expect(readFileSync(join(real, 'refs', 'inner', 'i.txt'), 'utf8')).toBe('inner')
  })

  // skill-install::REQ-004/AC-02, AC-03, A6. Leading nowhere: what the link points to is gone (B1's), runs through a
  // file, or is a chain of links that never reaches a file or a directory, whose first link in path order is named.
  // Leading back: to a directory the copy is inside; to a directory above the skill's real directory or above its
  // library entry, each holding only that one; to the project being installed into. Of several, the first in path
  // order is named, segment by segment in byte order (REQ-004's failure modes): `a-b` comes before `a/z` as whole
  // strings, and `a1` before `B1` in a locale's order
  it.each([
    { what: 'a link to a target through a file', reason: ERR.skillLinkLeadsNowhere, link: 'refs/through-file', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      mkdirSync(join(skill, 'refs'))
      writeFileSync(join(skill, 'notes.md'), 'a file')
      symlinkSync(join(skill, 'notes.md', 'x'), join(skill, 'refs', 'through-file'))
    } },
    { what: 'a chain of links that loops', reason: ERR.skillLinkLeadsNowhere, link: 'loop/a', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      mkdirSync(join(skill, 'loop'))
      symlinkSync(join(skill, 'loop', 'b'), join(skill, 'loop', 'a'))
      symlinkSync(join(skill, 'loop', 'a'), join(skill, 'loop', 'b'))
    } },
    { what: 'a link to a directory the copy is inside', reason: ERR.skillLinkLeadsBack, link: 'refs/deep/up', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      mkdirSync(join(skill, 'refs', 'deep'), { recursive: true })
      symlinkSync('..', join(skill, 'refs', 'deep', 'up'))
    } },
    { what: 'a link to a directory two levels above the skill\'s real directory alone', reason: ERR.skillLinkLeadsBack, link: 'refs/above-real', make: (): void => {
      const real = mkGlobalSkill('codex', 'tidy')
      mkdirSync(join(dir, '.claude', 'skills'), { recursive: true })
      symlinkSync('../../.agents/skills/tidy', join(dir, '.claude', 'skills', 'tidy'))
      mkdirSync(join(real, 'refs'))
      symlinkSync(join(dir, '.agents'), join(real, 'refs', 'above-real'))
    } },
    { what: 'a link to a directory two levels above the library entry alone', reason: ERR.skillLinkLeadsBack, link: 'refs/above-entry', make: (): void => {
      const real = mkGlobalSkill('codex', 'tidy')
      mkdirSync(join(dir, '.claude', 'skills'), { recursive: true })
      symlinkSync('../../.agents/skills/tidy', join(dir, '.claude', 'skills', 'tidy'))
      mkdirSync(join(real, 'refs'))
      symlinkSync(join(dir, '.claude'), join(real, 'refs', 'above-entry'))
    } },
    { what: 'a link to the project being installed into', reason: ERR.skillLinkLeadsBack, link: 'refs/proj', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      mkdirSync(join(skill, 'refs'))
      symlinkSync(proj, join(skill, 'refs', 'proj'))
    } },
    { what: 'bad links a-b and a/z', reason: ERR.skillLinkLeadsBack, link: 'a/z', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      symlinkSync(join(skill, 'gone'), join(skill, 'a-b'))
      mkdirSync(join(skill, 'a'))
      symlinkSync(skill, join(skill, 'a', 'z'))
    } },
    { what: 'bad links a1 and B1', reason: ERR.skillLinkLeadsNowhere, link: 'B1', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      symlinkSync(skill, join(skill, 'a1'))
      symlinkSync(join(skill, 'gone'), join(skill, 'B1'))
    } }
  ])('$what: the install fails naming the first, and nothing lands', ({ reason, link, make }) => {
    make()
    expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({
      ok: false,
      reason,
      params: { link }
    })
    expect(readdirSync(join(proj, '.claude', 'skills'))).toEqual([])
  })

  // skill-install A10 and REQ-004's failure modes: a project inside the skill's own directory fails before the copy
  // starts, so not on the link that leads nowhere that a walk of the skill would meet first
  it('a project inside the skill\'s own directory is the failed copy, before anything is copied', () => {
    const skill = mkGlobalSkill('claude', 'tidy')
    symlinkSync(join(skill, 'gone'), join(skill, 'a'))
    const inner = join(skill, 'work', 'p1')
    mkdirSync(inner, { recursive: true })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: inner })).toEqual({ ok: false, reason: ERR.skillCopyFailed })
      expect(logged.mock.calls).toEqual([['[skill-install] copy failed:', expect.any(Error)]])
    } finally {
      logged.mockRestore()
    }
    expect(readdirSync(join(inner, '.claude', 'skills'))).toEqual([])
  })

  // skill-install::REQ-004's failure modes: a pipe, socket or device is skipped, behind a link or not, since reading a
  // pipe would block the main process; each one skipped goes to the log
  it('an entry neither a file nor a directory is skipped, and logged by its path inside the skill', () => {
    const skill = mkGlobalSkill('claude', 'tidy')
    execFileSync('mkfifo', [join(skill, 'pipe')])
    mkdirSync(join(skill, 'refs'))
    symlinkSync(join(skill, 'pipe'), join(skill, 'refs', 'to-pipe'))
    const logged = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({ ok: true })
      expect(logged.mock.calls).toEqual([
        ['[skill-install] skipped, neither a file nor a directory:', 'pipe'],
        ['[skill-install] skipped, neither a file nor a directory:', 'refs/to-pipe']
      ])
    } finally {
      logged.mockRestore()
    }
    const target = join(proj, '.claude', 'skills', 'tidy')
    expect(readdirSync(target).sort()).toEqual(['SKILL.md', 'assets', 'refs'])
    expect(readdirSync(join(target, 'refs'))).toEqual([])
  })

  it('same-name blocking: the target already has a project-level skill of that name → conflict, not overwritten', () => {
    mkGlobalSkill('claude', 'tdd', 'global version')
    mkdirSync(join(proj, '.claude', 'skills', 'tdd'), { recursive: true })
    writeFileSync(join(proj, '.claude', 'skills', 'tdd', 'SKILL.md'), 'project own version')
    const r = installSkill(roots(), { skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    expect(r).toMatchObject({ ok: false, reason: ERR.skillConflict })
    expect(readFileSync(join(proj, '.claude', 'skills', 'tdd', 'SKILL.md'), 'utf8')).toBe('project own version')
  })

  it('a stale project is refused (the target directory does not exist)', () => {
    mkGlobalSkill('claude', 'tdd')
    const r = installSkill(roots(), {
      skillName: 'tdd',
      side: 'claude',
      targetProjectPath: join(dir, 'work', 'ghost')
    })
    expect(r).toMatchObject({ ok: false, reason: ERR.skillStaleTarget })
  })

  it('a missing source → missing-source, leaving no half-finished directory', () => {
    const r = installSkill(roots(), { skillName: 'nope', side: 'claude', targetProjectPath: proj })
    expect(r).toMatchObject({ ok: false, reason: ERR.skillMissingSource })
    const skillsDir = join(proj, '.claude', 'skills')
    if (existsSync(skillsDir)) {
      expect(readdirSync(skillsDir)).toEqual([])
    }
  })

  it('a skill name containing path traversal → refused', () => {
    const r = installSkill(roots(), { skillName: '../evil', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })
})

// skill-install::REQ-004/AC-03, "by whatever route": a link back spelled in another letter case, on a volume that
// ignores letter case (macOS's default, not the Linux of CI, where that spelling leads nowhere)
describe.skipIf(!existsSync(tmpdir().toUpperCase()))('installSkill, on a volume that ignores letter case', () => {
  it.each([
    { what: 'a link to a directory the copy is inside', link: 'refs/deep/up', make: (skill: string): void => {
      mkdirSync(join(skill, 'refs', 'deep'), { recursive: true })
      symlinkSync(join(skill, 'REFS'), join(skill, 'refs', 'deep', 'up'))
    } },
    { what: 'a link to the directory holding the library', link: 'refs/home', make: (skill: string): void => {
      mkdirSync(join(skill, 'refs'))
      symlinkSync(join(dirname(dir), basename(dir).toUpperCase()), join(skill, 'refs', 'home'))
    } }
  ])('$what, spelled in another letter case: the install fails naming that link', ({ link, make }) => {
    make(mkGlobalSkill('claude', 'tidy'))
    expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({
      ok: false,
      reason: ERR.skillLinkLeadsBack,
      params: { link }
    })
    expect(readdirSync(join(proj, '.claude', 'skills'))).toEqual([])
  })
})

// The notice says the copy failed and was cleaned up, and carries no system error (skill-install's failure notices)
describe.skipIf(process.getuid?.() === 0)('installSkill, when the copy fails', () => {
  it('a project that cannot be written: the failure carries no parameter, and the system error goes to the log', () => {
    mkGlobalSkill('claude', 'tidy')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    chmodSync(proj, 0o555)
    try {
      expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({ ok: false, reason: ERR.skillCopyFailed })
      expect(logged.mock.calls).toEqual([['[skill-install] copy failed:', expect.any(Error)]])
    } finally {
      chmodSync(proj, 0o755)
      logged.mockRestore()
    }
  })

  it('a project behind a directory that cannot be entered is the failed copy, not the stale-target refusal (A10)', () => {
    mkGlobalSkill('claude', 'tidy')
    const locked = join(dir, 'locked')
    const blocked = join(locked, 'blocked')
    mkdirSync(blocked, { recursive: true })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    chmodSync(locked, 0o000)
    try {
      expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: blocked })).toEqual({ ok: false, reason: ERR.skillCopyFailed })
      expect(logged.mock.calls).toEqual([['[skill-install] copy failed:', expect.any(Error)]])
    } finally {
      chmodSync(locked, 0o755)
      logged.mockRestore()
    }
    expect(readdirSync(blocked)).toEqual([])
  })

  // A10, A6 and REQ-004's failure modes: a link to something that cannot be read is the failed copy, not a bad link; with
  // a bad link and a file that cannot be read both in the skill, the install stops at whichever comes first in path
  // order, part way through the copy, and leaves nothing behind. Each case returns what it locked, to unlock it
  it.each([
    { what: 'a link to a file that cannot be read', expected: { ok: false, reason: ERR.skillCopyFailed }, toLog: true, make: (): string => {
      const skill = mkGlobalSkill('claude', 'tidy')
      const secret = join(dir, 'outside', 'secret.txt')
      mkdirSync(join(dir, 'outside'))
      writeFileSync(secret, 'x')
      symlinkSync(secret, join(skill, 'secret'))
      chmodSync(secret, 0o000)
      return secret
    } },
    { what: 'a link to a file in a directory that cannot be entered', expected: { ok: false, reason: ERR.skillCopyFailed }, toLog: true, make: (): string => {
      const skill = mkGlobalSkill('claude', 'tidy')
      const locked = join(dir, 'outside', 'locked')
      mkdirSync(locked, { recursive: true })
      writeFileSync(join(locked, 'f.txt'), 'x')
      symlinkSync(join(locked, 'f.txt'), join(skill, 'locked-file'))
      chmodSync(locked, 0o000)
      return locked
    } },
    { what: 'a file that cannot be read before a link that leads nowhere', expected: { ok: false, reason: ERR.skillCopyFailed }, toLog: true, make: (): string => {
      const skill = mkGlobalSkill('claude', 'tidy')
      writeFileSync(join(skill, 'a.txt'), 'x')
      symlinkSync(join(skill, 'gone'), join(skill, 'b'))
      chmodSync(join(skill, 'a.txt'), 0o000)
      return join(skill, 'a.txt')
    } },
    { what: 'a link that leads nowhere before a file that cannot be read', expected: { ok: false, reason: ERR.skillLinkLeadsNowhere, params: { link: 'a' } }, toLog: false, make: (): string => {
      const skill = mkGlobalSkill('claude', 'tidy')
      symlinkSync(join(skill, 'gone'), join(skill, 'a'))
      writeFileSync(join(skill, 'b.txt'), 'x')
      chmodSync(join(skill, 'b.txt'), 0o000)
      return join(skill, 'b.txt')
    } }
  ])('$what: the install gives that one\'s failure, and nothing lands', ({ expected, toLog, make }) => {
    const locked = make()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual(expected)
      expect(logged.mock.calls).toEqual(toLog ? [['[skill-install] copy failed:', expect.any(Error)]] : [])
      expect(readdirSync(join(proj, '.claude', 'skills'))).toEqual([])
    } finally {
      chmodSync(locked, 0o755)
      logged.mockRestore()
    }
  })
})

describe('uninstallSkill', () => {
  it('deletes the project-level copy; the global library is unaffected', () => {
    mkGlobalSkill('claude', 'tdd')
    installSkill(roots(), { skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    const r = uninstallSkill({ skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    expect(existsSync(join(proj, '.claude', 'skills', 'tdd'))).toBe(false)
    expect(existsSync(join(dir, '.claude', 'skills', 'tdd'))).toBe(true)
  })

  // B1: a copy holding links, as one copied by hand or landed before REQ-004 would; its links go, not what they point to
  it('deleting a copy that holds links removes the links and leaves what they point to', () => {
    const outside = join(dir, 'outside')
    mkdirSync(join(outside, 'dir'), { recursive: true })
    writeFileSync(join(outside, 'note.md'), 'outside note')
    writeFileSync(join(outside, 'dir', 'g.txt'), 'outside dir file')
    const copy = join(proj, '.claude', 'skills', 'tidy')
    mkdirSync(join(copy, 'sub'), { recursive: true })
    writeFileSync(join(copy, 'SKILL.md'), '---\nname: tidy\n---\n')
    symlinkSync(join(outside, 'note.md'), join(copy, 'sub', 'flink'))
    symlinkSync(join(outside, 'dir'), join(copy, 'sub', 'dlink'))
    expect(uninstallSkill({ skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({ ok: true })
    expect(existsSync(copy)).toBe(false)
    expect(readFileSync(join(outside, 'note.md'), 'utf8')).toBe('outside note')
    expect(readFileSync(join(outside, 'dir', 'g.txt'), 'utf8')).toBe('outside dir file')
  })

  it('a missing target → reports an error rather than throwing', () => {
    const r = uninstallSkill({ skillName: 'nope', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })

  it.skipIf(process.getuid?.() === 0)('a directory that cannot be written: the failure names the path, with no system error, and the system error goes to the log', () => {
    const skills = join(proj, '.claude', 'skills')
    const copy = join(skills, 'tidy')
    mkdirSync(copy, { recursive: true })
    writeFileSync(join(copy, 'SKILL.md'), '---\nname: tidy\n---\n')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    chmodSync(skills, 0o555)
    try {
      expect(uninstallSkill({ skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({ ok: false, reason: ERR.skillDeleteFailed, params: { path: copy } })
      expect(logged.mock.calls).toEqual([['[skill-install] delete failed:', expect.any(Error)]])
    } finally {
      chmodSync(skills, 0o755)
      logged.mockRestore()
    }
  })

  it('name traversal is refused', () => {
    const r = uninstallSkill({ skillName: '../../etc', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })
})
