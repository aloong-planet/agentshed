// Ticket 06: install and uninstall — landing by copy (dereferenced), blocking same names, refusing stale
// projects, cleaning up on failure, and the uninstall guards.
// Gaps: telling a directory that holds the skill, its library entry or the landing stats each one, all resolved a
// moment before, so that stat fails only on one vanishing in between and no test drives its throw. And a link to the
// copy being written, among the directories that lead back (skill-install::REQ-004/AC-03), is not driven: it would
// have to name the copy's temporary name, which is the install's own (neither the spec nor ADR-0004 gives its form),
// so a test of it would pin that name; it can be tested once the name is part of the contract.
import { chmodSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installIntoListedProject, installSkill, uninstallFromListedProject, uninstallSkill } from './install'
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
  // library entry, each holding only that one, by the library's path as written or where it really lies when its
  // directory is a link; to the project being installed into, its skills directory, or where its `.claude`, a link,
  // really lies. Of several, the first in path order is named, segment by segment in byte order (REQ-004's failure
  // modes): `a-b` comes before `a/z` as whole strings, and `a1` before `B1` in a locale's order
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
    { what: 'a link to a directory two levels above the library entry alone, by the library\'s path as written', reason: ERR.skillLinkLeadsBack, link: 'refs/above-entry', make: (): void => {
      const real = mkGlobalSkill('codex', 'tidy')
      mkdirSync(join(dir, 'A', 'skills'), { recursive: true })
      mkdirSync(join(dir, '.claude'))
      symlinkSync(join(dir, 'A', 'skills'), join(dir, '.claude', 'skills'))
      symlinkSync('../../.agents/skills/tidy', join(dir, 'A', 'skills', 'tidy'))
      mkdirSync(join(real, 'refs'))
      symlinkSync(join(dir, '.claude'), join(real, 'refs', 'above-entry'))
    } },
    { what: 'a link to what really holds the library directory, itself a link', reason: ERR.skillLinkLeadsBack, link: 'refs/lib-holder', make: (): void => {
      const real = join(dir, 'B', 'tidy')
      mkdirSync(join(real, 'refs'), { recursive: true })
      writeFileSync(join(real, 'SKILL.md'), '---\nname: tidy\n---\n')
      mkdirSync(join(dir, 'A', 'skills'), { recursive: true })
      mkdirSync(join(dir, '.claude'))
      symlinkSync(join(dir, 'A', 'skills'), join(dir, '.claude', 'skills'))
      symlinkSync(real, join(dir, 'A', 'skills', 'tidy'))
      symlinkSync(join(dir, 'A'), join(real, 'refs', 'lib-holder'))
    } },
    { what: 'a link to the project being installed into, its .claude a link elsewhere', reason: ERR.skillLinkLeadsBack, link: 'refs/proj', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      mkdirSync(join(dir, 'D', 'proj-claude'), { recursive: true })
      symlinkSync(join(dir, 'D', 'proj-claude'), join(proj, '.claude'))
      mkdirSync(join(skill, 'refs'))
      symlinkSync(proj, join(skill, 'refs', 'proj'))
    } },
    { what: 'a link to the project\'s skills directory', reason: ERR.skillLinkLeadsBack, link: 'refs/skills', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      mkdirSync(join(skill, 'refs'))
      symlinkSync(join(proj, '.claude', 'skills'), join(skill, 'refs', 'skills'))
    } },
    { what: 'a link to where the project\'s .claude, itself a link, really lies', reason: ERR.skillLinkLeadsBack, link: 'refs/dots', make: (): void => {
      const skill = mkGlobalSkill('claude', 'tidy')
      mkdirSync(join(dir, 'D', 'proj-claude'), { recursive: true })
      symlinkSync(join(dir, 'D', 'proj-claude'), join(proj, '.claude'))
      mkdirSync(join(skill, 'refs'))
      symlinkSync(join(dir, 'D'), join(skill, 'refs', 'dots'))
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

  // skill-install A10 and REQ-004's failure modes: a project inside the skill's own directory, by its own path or by a
  // link, fails before anything is written into the skill, and so not on the link that leads nowhere that a walk of the
  // skill would meet first
  it.each([
    { what: 'by its own path', project: (inner: string): string => inner },
    { what: 'by a link to it', project: (inner: string): string => {
      symlinkSync(inner, join(dir, 'plink'))
      return join(dir, 'plink')
    } }
  ])('a project inside the skill\'s own directory, $what, is the failed copy, and nothing is written into the skill', ({ project }) => {
    const skill = mkGlobalSkill('claude', 'tidy')
    symlinkSync(join(skill, 'gone'), join(skill, 'a'))
    const inner = join(skill, 'work', 'p1')
    mkdirSync(inner, { recursive: true })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(installSkill(roots(), { skillName: 'tidy', side: 'claude', targetProjectPath: project(inner) })).toEqual({ ok: false, reason: ERR.skillCopyFailed })
      expect(logged.mock.calls).toEqual([['[skill-install] copy failed:', expect.any(Error)]])
    } finally {
      logged.mockRestore()
    }
    expect(readdirSync(inner)).toEqual([])
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

  // skill-install A7: "." is not a single directory name either. Joined to a directory it names that directory, so the
  // install's source would be the global library itself and its copy the project's skills directory
  it('a skill named "." is refused as an invalid name, and nothing is written', () => {
    mkGlobalSkill('claude', 'tidy')
    expect(installSkill(roots(), { skillName: '.', side: 'claude', targetProjectPath: proj })).toEqual({ ok: false, reason: ERR.skillBadName })
    expect(readdirSync(proj)).toEqual([])
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

  // skill-install B3: the copy "." names is the project's whole skills directory of that side, every skill in it
  it('a skill named "." is refused as an invalid name, and nothing is deleted', () => {
    mkdirSync(join(proj, '.claude', 'skills', 'tidy'), { recursive: true })
    expect(uninstallSkill({ skillName: '.', side: 'claude', targetProjectPath: proj })).toEqual({ ok: false, reason: ERR.skillBadName })
    expect(readdirSync(join(proj, '.claude', 'skills'))).toEqual(['tidy'])
  })
})

// skill-install R3 at the entries the app calls: the target goes through skillOpTarget's judgement against the
// projects the app lists before anything is written or deleted, and a refusal is reported rather than thrown. Each
// refusal row has a target directory that is really there and a skill that would land or a copy that would go, so
// only the judgement stands between the call and the disk.
describe('the install and uninstall the app calls, into one of its projects', () => {
  const other = (): { path: string; stale: boolean } => ({ path: join(dir, 'work', 'p0'), stale: false })
  const refusals: [string, (target: string) => { path: string; stale: boolean }[], string][] = [
    ['a directory the app does not list', () => [other()], ERR.skillTargetNotProject],
    ['a project the app lists as stale, its directory there again', (target) => [other(), { path: target, stale: true }], ERR.skillStaleTarget]
  ]

  it.each(refusals)('an uninstall from %s is refused and deletes nothing', (_what, listed, reason) => {
    const copy = join(proj, '.claude', 'skills', 'tidy')
    mkdirSync(copy, { recursive: true })
    writeFileSync(join(copy, 'SKILL.md'), '---\nname: tidy\n---\n')
    expect(uninstallFromListedProject(roots(), listed(proj), { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({ ok: false, reason })
    expect(readFileSync(join(copy, 'SKILL.md'), 'utf8')).toBe('---\nname: tidy\n---\n')
  })

  it('an uninstall from a listed project deletes its copy', () => {
    const copy = join(proj, '.claude', 'skills', 'tidy')
    mkdirSync(copy, { recursive: true })
    writeFileSync(join(copy, 'SKILL.md'), '---\nname: tidy\n---\n')
    expect(uninstallFromListedProject(roots(), [other(), { path: proj, stale: false }], { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({ ok: true })
    expect(existsSync(copy)).toBe(false)
  })

  it.each(refusals)('an install into %s is refused at every landing and writes nothing', (_what, listed, reason) => {
    mkGlobalSkill('claude', 'tidy')
    mkGlobalSkill('codex', 'tidy')
    const r = installIntoListedProject(roots(), listed(proj), { skillName: 'tidy', sides: ['claude', 'codex', 'antigravity'], targetProjectPath: proj })
    expect(r).toEqual([
      { dir: '.claude/skills', loaders: ['claude'], result: { ok: false, reason } },
      { dir: '.agents/skills', loaders: ['codex', 'antigravity'], result: { ok: false, reason } }
    ])
    expect(readdirSync(proj)).toEqual([])
  })

  it('an install into a listed project lands at every landing', () => {
    mkGlobalSkill('claude', 'tidy', 'from claude')
    mkGlobalSkill('codex', 'tidy', 'from codex')
    const r = installIntoListedProject(roots(), [other(), { path: proj, stale: false }], { skillName: 'tidy', sides: ['claude', 'codex', 'antigravity'], targetProjectPath: proj })
    expect(r).toEqual([
      { dir: '.claude/skills', loaders: ['claude'], result: { ok: true } },
      { dir: '.agents/skills', loaders: ['codex', 'antigravity'], result: { ok: true } }
    ])
    expect(readFileSync(join(proj, '.claude', 'skills', 'tidy', 'SKILL.md'), 'utf8')).toContain('from claude')
    expect(readFileSync(join(proj, '.agents', 'skills', 'tidy', 'SKILL.md'), 'utf8')).toContain('from codex')
  })
})

// skill-install R4 at the entries the app calls: an install or uninstall whose target R3 admits still never changes a
// global library. The fixture's home is `dir`, its libraries the ones roots() names; each refusal row's operation would
// otherwise go through, so only the judgement stands between the call and the library.
describe('the install and uninstall the app calls, never into a global library', () => {
  const library = 'skill-target-global-library'
  const home = (): { path: string; stale: boolean }[] => [{ path: dir, stale: false }, { path: proj, stale: false }]

  it('an uninstall from the home directory, listed as a project, is refused and Claude\'s library keeps the skill', () => {
    const lib = mkGlobalSkill('claude', 'tidy')
    expect(uninstallFromListedProject(roots(), home(), { skillName: 'tidy', side: 'claude', targetProjectPath: dir })).toEqual({ ok: false, reason: library })
    expect(readFileSync(join(lib, 'SKILL.md'), 'utf8')).toContain('name: tidy')
  })

  it('an install for Antigravity alone into the home directory is refused at its landing, and Codex\'s library is left as it was', () => {
    mkGlobalSkill('codex', 'other')
    const agy = join(dir, '.gemini', 'antigravity-cli', 'skills', 'agyonly')
    mkdirSync(agy, { recursive: true })
    writeFileSync(join(agy, 'SKILL.md'), '---\nname: agyonly\n---\n')
    const r = installIntoListedProject(roots(), home(), { skillName: 'agyonly', sides: ['antigravity'], targetProjectPath: dir })
    expect(r).toEqual([{ dir: '.agents/skills', loaders: ['codex', 'antigravity'], result: { ok: false, reason: library } }])
    expect(readdirSync(join(dir, '.agents', 'skills'))).toEqual(['other'])
  })

  it('an install with one landing that is a library is refused at every landing, and nothing is written at the others', () => {
    mkGlobalSkill('claude', 'tidy')
    mkGlobalSkill('codex', 'tidy')
    mkdirSync(join(proj, '.claude'))
    symlinkSync(join(dir, '.claude', 'skills'), join(proj, '.claude', 'skills'))
    const r = installIntoListedProject(roots(), home(), { skillName: 'tidy', sides: ['claude', 'codex'], targetProjectPath: proj })
    expect(r).toEqual([
      { dir: '.claude/skills', loaders: ['claude'], result: { ok: false, reason: library } },
      { dir: '.agents/skills', loaders: ['codex', 'antigravity'], result: { ok: false, reason: library } }
    ])
    expect(readdirSync(proj)).toEqual(['.claude'])
  })

  it('an uninstall whose copy is Claude\'s library, through a landing that leads to its parent, is refused and the library is left as it was', () => {
    const lib = mkGlobalSkill('claude', 'tidy')
    mkdirSync(join(proj, '.claude'))
    symlinkSync(join(dir, '.claude'), join(proj, '.claude', 'skills'))
    expect(uninstallFromListedProject(roots(), home(), { skillName: 'skills', side: 'claude', targetProjectPath: proj })).toEqual({ ok: false, reason: library })
    expect(readFileSync(join(lib, 'SKILL.md'), 'utf8')).toContain('name: tidy')
  })

  it('an uninstall of a project\'s copy that is a link into a library deletes the link alone', () => {
    const lib = mkGlobalSkill('claude', 'tidy')
    mkdirSync(join(proj, '.claude', 'skills'), { recursive: true })
    symlinkSync(lib, join(proj, '.claude', 'skills', 'tidy'))
    expect(uninstallFromListedProject(roots(), home(), { skillName: 'tidy', side: 'claude', targetProjectPath: proj })).toEqual({ ok: true })
    expect(readdirSync(join(proj, '.claude', 'skills'))).toEqual([])
    expect(readdirSync(lib).sort()).toEqual(['SKILL.md', 'assets'])
    expect(readFileSync(join(lib, 'SKILL.md'), 'utf8')).toContain('name: tidy')
  })
})
