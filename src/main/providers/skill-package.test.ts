// Gap: the walk's catch around resolving a directory link has no trigger short of the link vanishing between that
// call and the stat before it, so no test drives it; driving it would need the filesystem injected.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  holdsPath,
  listSkillPackageFiles,
  resolveSkillRoot,
  resolvePluginSkillRoot,
  isUnderKnownSkillRoots,
  readSkillFileText,
  statSkillPackage
} from './skill-package'
import type { ScanRoots } from './types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-skpkg-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

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

function mkPack(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, body)
  }
}

describe('holdsPath', () => {
  it('a directory holds what is below it, the filesystem root included, and nothing else', () => {
    expect(holdsPath('/', '/a/b')).toBe(true)
    expect(holdsPath('/a', '/a/b/c')).toBe(true)
    expect(holdsPath('/a', '/a/..x/b')).toBe(true)
    expect(holdsPath('/a', '/a')).toBe(false)
    expect(holdsPath('/a/b', '/a/bc')).toBe(false)
    expect(holdsPath('/a/b', '/a')).toBe(false)
  })
})

describe('listSkillPackageFiles', () => {
  // The nested paths are shapes real packages hold (skills-view::REQ-003/AC-01, C4)
  it('lists text at any depth with the entry point first and the rest in path order, leaving off-list types out', () => {
    const pack = join(dir, 'pack')
    mkPack(pack, {
      'SKILL.md': '---\nname: x\n---\n\n# Hi\n',
      'references/overview.md': '# ov\n',
      'artifact_tool_docs/api/references/cookbook/imported-deck.md': 'deep\n',
      'container_tools/lib/inspect_layout.py': 'print(1)\n',
      'script.sh': 'echo 1\n',
      'ooxml/schemas/wml.xsd': '<schema/>\n',
      'schema.xsd': '<schema/>\n',
      'scripts/go': '#!/bin/sh\n',
      'bin/tool.png': 'not-text',
      'assets/fonts/deep/font.ttf': 'not-text'
    })
    writeFileSync(join(pack, 'bin', 'tool.png'), Buffer.from([0x89, 0x50]))
    const listing = listSkillPackageFiles(pack)
    expect(listing.files.map((f) => f.path)).toEqual([
      'SKILL.md',
      'artifact_tool_docs/api/references/cookbook/imported-deck.md',
      'container_tools/lib/inspect_layout.py',
      'references/overview.md',
      'script.sh'
    ])
    const skill = listing.files.find((f) => f.path === 'SKILL.md')!
    expect(skill.lines).toBeGreaterThanOrEqual(3)
    expect(skill.bytes).toBeGreaterThan(0)
    expect(skill.mtimeMs).toBeGreaterThan(0)
  })

  it('skips node_modules and .git', () => {
    const pack = join(dir, 'pack2')
    mkPack(pack, {
      'SKILL.md': '# s\n',
      'node_modules/x/a.md': 'no\n',
      '.git/config': 'no\n'
    })
    const listing = listSkillPackageFiles(pack)
    expect(listing.files.map((f) => f.path)).toEqual(['SKILL.md'])
  })

  it('an empty package and a missing SKILL.md: no crash, and the list is truthful', () => {
    const empty = join(dir, 'empty-pack')
    mkdirSync(empty, { recursive: true })
    const l1 = listSkillPackageFiles(empty)
    expect(l1.files).toEqual([])

    // A broken package (no SKILL.md): the other text files are still listed and no entry point is
    // fabricated (C5)
    const noEntry = join(dir, 'no-entry')
    mkPack(noEntry, { 'notes.txt': 'hi\n' })
    const l2 = listSkillPackageFiles(noEntry)
    expect(l2.files.map((f) => f.path)).toEqual(['notes.txt'])
  })

  it('statSkillPackage: counts what the table lists at every depth, junk directories skipped at any depth; an unreadable root → null', () => {
    const pack = join(dir, 'stat-pack')
    mkPack(pack, {
      'SKILL.md': '# s\n',
      'references/a.md': 'aa\n',
      'references/nested/deep.md': 'yes\n',
      'node_modules/x/no.md': 'no\n',
      'references/node_modules/x/no.md': 'no\n',
      'references/nested/.git/no.md': 'no\n'
    })
    const st = statSkillPackage(pack)!
    expect(st.files).toBe(3) // SKILL.md, references/a.md and references/nested/deep.md
    expect(st.bytes).toBe(11) // 4 + 3 + 4
    // The row's numbers match the expanded table (the same rules)
    expect(st.files).toBe(listSkillPackageFiles(pack).files.length)
    expect(statSkillPackage(join(dir, 'missing'))).toBeNull()
  })

  it('follows a symlinked skill root', () => {
    const real = join(dir, 'real-skill')
    mkPack(real, { 'SKILL.md': '---\ndescription: via link\n---\n' })
    const link = join(dir, 'link-skill')
    symlinkSync(real, link)
    const listing = listSkillPackageFiles(link)
    expect(listing.files.some((f) => f.path === 'SKILL.md')).toBe(true)
  })

  it('lists a name starting with two dots', () => {
    const pack = join(dir, 'dotted')
    mkPack(pack, { 'SKILL.md': '# s\n', '..notes.md': 'n\n', '..x/y.md': 'y\n', 'normal/z.md': 'z\n' })
    expect(listSkillPackageFiles(pack).files.map((f) => f.path)).toEqual(['SKILL.md', '..notes.md', '..x/y.md', 'normal/z.md'])
    expect(statSkillPackage(pack)!.files).toBe(4)
  })

  // The row counts by stat alone (C1), so it cannot know; either failure costs nothing but the entry itself
  it.skipIf(process.getuid?.() === 0)('a file that cannot be read leaves the table and stays in the row\'s count; a directory that cannot be read lists nothing', () => {
    const pack = join(dir, 'locked')
    mkPack(pack, { 'SKILL.md': '# s\n', 'a/b/locked.md': 'x\n', 'a/b/open.md': 'y\n', 'a/sealed/hidden.md': 'z\n' })
    const sealed = join(pack, 'a', 'sealed')
    chmodSync(join(pack, 'a', 'b', 'locked.md'), 0o000)
    chmodSync(sealed, 0o000)
    try {
      expect(listSkillPackageFiles(pack).files.map((f) => f.path)).toEqual(['SKILL.md', 'a/b/open.md'])
      expect(statSkillPackage(pack)!.files).toBe(3)
    } finally {
      chmodSync(sealed, 0o755) // The temp directory's cleanup cannot read into it otherwise
    }
  })

  it('a nested oversized file truncates when read, and its line count covers the whole file', () => {
    const pack = join(dir, 'oversized')
    mkPack(pack, { 'SKILL.md': '# s\n', 'refs/deep/big.md': `${'x'.repeat(99)}\n`.repeat(5001), 'refs/deep/small.md': 'small\n' })
    const files = listSkillPackageFiles(pack).files
    const big = files.find((f) => f.path === 'refs/deep/big.md')!
    expect(big.lines).toBe(5001)
    const read = readSkillFileText(big.absPath)
    expect([read.truncated, read.text.length]).toEqual([true, 500_000])
    expect(readSkillFileText(files.find((f) => f.path === 'refs/deep/small.md')!.absPath)).toEqual({ text: 'small\n', truncated: false })
  })

  it('a named pipe with a text name is skipped', () => {
    const pack = join(dir, 'with-pipe')
    mkPack(pack, { 'SKILL.md': '# s\n', 'refs/a.md': 'a\n' })
    execFileSync('mkfifo', [join(pack, 'refs', 'pipe.md')])
    // The stats first: reading a pipe blocks, so a regression fails here rather than hanging the run
    expect(statSkillPackage(pack)).toMatchObject({ files: 2, bytes: 6 })
    expect(listSkillPackageFiles(pack).files.map((f) => f.path)).toEqual(['SKILL.md', 'refs/a.md'])
  })

  it('caps no rows: a large package lists every file', () => {
    const pack = join(dir, 'large-pack')
    const files: Record<string, string> = { 'SKILL.md': '# s\n' }
    for (let i = 0; i < 299; i++) files[`refs/group-${i % 7}/nested/${i}.md`] = 'x\n'
    mkPack(pack, files)
    expect(listSkillPackageFiles(pack).files).toHaveLength(300)
    expect(statSkillPackage(pack)!.files).toBe(300)
  })

  // A link inside a package (skills-view::REQ-003/AC-05). No package on the machine this was written on holds one,
  // so these rest on the mechanism: statSync follows a link, and without a guard a cycle repeats every file it reaches
  describe('directory symlinks inside a package', () => {
    const listed = (pack: string): string[] => listSkillPackageFiles(pack).files.map((f) => f.path)

    it('a link back to a directory the walk is inside repeats no file', () => {
      const pack = join(dir, 'self-link')
      mkPack(pack, { 'SKILL.md': '# s\n', 'refs/a.md': 'a\n' })
      symlinkSync('..', join(pack, 'refs', 'up'))
      expect(listed(pack)).toEqual(['SKILL.md', 'refs/a.md'])
      expect(statSkillPackage(pack)!.files).toBe(2)
    })

    it('a cycle through two links ends, each directory listed under both of its paths', () => {
      const pack = join(dir, 'two-links')
      mkPack(pack, { 'SKILL.md': '# s\n', 'a/x.md': 'x\n', 'b/y.md': 'y\n' })
      symlinkSync('../b', join(pack, 'a', 'l1'))
      symlinkSync('../a', join(pack, 'b', 'l2'))
      expect(listed(pack)).toEqual(['SKILL.md', 'a/l1/y.md', 'a/x.md', 'b/l2/x.md', 'b/y.md'])
      expect(statSkillPackage(pack)!.files).toBe(5)
    })

    it('a link re-entering a directory through its own child ends there, whatever the links\' name order', () => {
      const pack = join(dir, 're-entry')
      mkPack(pack, { 'SKILL.md': '# s\n', 'a/g.md': 'g\n', 'a/b/f.md': 'f\n' })
      symlinkSync('a/b', join(pack, 'l1'))
      symlinkSync('..', join(pack, 'a', 'b', 'l2'))
      const expected = ['SKILL.md', 'a/b/f.md', 'a/g.md', 'l1/f.md', 'l1/l2/g.md']
      expect(listed(pack)).toEqual(expected)
      // Self links on both sides of l2, since the order a directory lists in decides what a stale guard lets through
      symlinkSync('.', join(pack, 'a', 'b', 'aself'))
      symlinkSync('.', join(pack, 'a', 'b', 'zself'))
      expect(listed(pack)).toEqual(expected)
      expect(statSkillPackage(pack)!.files).toBe(5)
    })

    it('a link out of the package that leads back into its own target ends there', () => {
      const pack = join(dir, 'through-out')
      mkPack(pack, { 'SKILL.md': '# s\n' })
      mkPack(join(dir, 'ext'), { 'foo/a.md': 'a\n', 'other.md': 'o\n' })
      symlinkSync('../ext/foo', join(pack, 'x'))
      symlinkSync('..', join(dir, 'ext', 'foo', 'up'))
      expect(listed(pack)).toEqual(['SKILL.md', 'x/a.md', 'x/up/other.md'])
    })

    it('a broken link and a link to itself are skipped, and the rest lists', () => {
      const pack = join(dir, 'bad-links')
      mkPack(pack, { 'SKILL.md': '# s\n', 'refs/a.md': 'a\n' })
      symlinkSync('gone', join(pack, 'dead'))
      symlinkSync('loop', join(pack, 'refs', 'loop'))
      expect(listed(pack)).toEqual(['SKILL.md', 'refs/a.md'])
      expect(statSkillPackage(pack)).toMatchObject({ files: 2, bytes: 6 })
    })

    it('a link to a directory containing the package is not followed', () => {
      const skills = join(dir, 'skills')
      const pack = join(skills, 'pack')
      mkPack(pack, { 'SKILL.md': '# s\n' })
      mkPack(join(skills, 'sibling'), { 'SKILL.md': '# other\n' })
      symlinkSync('..', join(pack, 'up'))
      expect(listed(pack)).toEqual(['SKILL.md'])
      expect(statSkillPackage(pack)!.files).toBe(1)
    })

    it('a link to the filesystem root is not followed', () => {
      const pack = join(dir, 'links-to-root')
      mkPack(pack, { 'SKILL.md': '# s\n' })
      symlinkSync('/', join(pack, 'disk'))
      expect(listed(pack)).toEqual(['SKILL.md'])
    })

    it('any other link is followed at depth, and a directory linked twice lists under both paths', () => {
      const pack = join(dir, 'links-out')
      mkPack(pack, { 'SKILL.md': '# s\n', 'docs/a.md': 'a\n' })
      mkPack(join(dir, 'shared-docs'), { 'x/y/z.md': 'z\n' })
      symlinkSync('../shared-docs', join(pack, 'shared'))
      symlinkSync('docs', join(pack, 'alias'))
      expect(listed(pack)).toEqual(['SKILL.md', 'alias/a.md', 'docs/a.md', 'shared/x/y/z.md'])
    })
  })
})

describe('resolveSkillRoot + isUnderKnownSkillRoots', () => {
  it('resolves global and project paths and validates they land under a skills root', () => {
    const r = roots()
    mkdirSync(join(r.claudeHome, 'skills', 'tdd'), { recursive: true })
    writeFileSync(join(r.claudeHome, 'skills', 'tdd', 'SKILL.md'), '#\n')
    const abs = resolveSkillRoot({
      side: 'claude',
      name: 'tdd',
      scope: 'global',
      roots: r
    })
    expect(abs).toBeTruthy()
    expect(isUnderKnownSkillRoots(abs!, r)).toBe(true)
    expect(resolveSkillRoot({ side: 'claude', name: '../x', scope: 'global', roots: r })).toBeNull()
    expect(resolveSkillRoot({ side: 'claude', name: 'plug:x', scope: 'global', roots: r })).toBeNull()
  })

  it('a symlinked entry point: admitted even when the target is outside every known root (the container check applies to the entry point before resolution)', () => {
    const r = roots()
    // The real package lives in an ordinary repository directory, outside every known root — the most
    // common shape of a symlink-installed skill
    const target = join(dir, 'repo', 'skills', 'decision-form')
    mkPack(target, { 'SKILL.md': '---\ndescription: form\n---\ndecision table body\n' })
    mkdirSync(r.agentsSkillsDir, { recursive: true })
    symlinkSync(target, join(r.agentsSkillsDir, 'decision-form'))
    // The entry point (the symlink itself) must pass the container check — A6: the target is unconstrained
    expect(isUnderKnownSkillRoots(join(r.agentsSkillsDir, 'decision-form'), r)).toBe(true)
    const abs = resolveSkillRoot({ side: 'codex', name: 'decision-form', scope: 'global', roots: r })
    expect(abs).toBeTruthy()
    expect(listSkillPackageFiles(abs!).files.some((f) => f.path === 'SKILL.md')).toBe(true)
  })

  it('a symlinked entry point: also admitted when the target is inside another known root (pinning the current behaviour)', () => {
    const r = roots()
    const real = join(r.agentsSkillsDir, 'codebase-design')
    mkPack(real, { 'SKILL.md': '# cd\n' })
    mkdirSync(join(r.claudeHome, 'skills'), { recursive: true })
    symlinkSync(real, join(r.claudeHome, 'skills', 'codebase-design'))
    expect(isUnderKnownSkillRoots(join(r.claudeHome, 'skills', 'codebase-design'), r)).toBe(true)
    expect(
      resolveSkillRoot({ side: 'claude', name: 'codebase-design', scope: 'global', roots: r })
    ).toBeTruthy()
  })

  it('a dangling symlink → null (no crash, not admitted)', () => {
    const r = roots()
    mkdirSync(r.agentsSkillsDir, { recursive: true })
    symlinkSync(join(dir, 'gone'), join(r.agentsSkillsDir, 'dangling'))
    expect(resolveSkillRoot({ side: 'codex', name: 'dangling', scope: 'global', roots: r })).toBeNull()
  })

  it('isUnderKnownSkillRoots: outside a package, a skills root itself, and anything not a direct subdirectory are all refused (C9 fail-closed)', () => {
    const r = roots()
    mkdirSync(join(r.claudeHome, 'skills', 'tdd', 'references'), { recursive: true })
    const outside = join(dir, 'elsewhere', 'tdd')
    mkdirSync(outside, { recursive: true })
    expect(isUnderKnownSkillRoots(outside, r)).toBe(false)
    expect(isUnderKnownSkillRoots(join(r.claudeHome, 'skills'), r)).toBe(false)
    expect(isUnderKnownSkillRoots(join(r.claudeHome, 'skills', 'tdd', 'references'), r)).toBe(false)
    // Without a projectPath, the project-level directory is not in the allowed set
    mkdirSync(join(dir, 'proj', '.claude', 'skills', 'x'), { recursive: true })
    expect(isUnderKnownSkillRoots(join(dir, 'proj', '.claude', 'skills', 'x'), r)).toBe(false)
    expect(isUnderKnownSkillRoots(join(dir, 'proj', '.claude', 'skills', 'x'), r, join(dir, 'proj'))).toBe(true)
  })
})

describe('resolvePluginSkillRoot(plugins-view H8)', () => {
  it('resolves skills/<name> under a package root; the name is sanitised; missing or dangling → null', () => {
    const root = join(dir, 'plug-pkg')
    mkPack(root, { 'skills/brainstorming/SKILL.md': '# b\n' })
    const abs = resolvePluginSkillRoot(root, 'brainstorming')
    expect(abs).toBeTruthy()
    expect(listSkillPackageFiles(abs!).files.map((f) => f.path)).toEqual(['SKILL.md'])
    expect(resolvePluginSkillRoot(root, '../escape')).toBeNull()
    expect(resolvePluginSkillRoot(root, 'a/b')).toBeNull()
    expect(resolvePluginSkillRoot(root, '')).toBeNull()
    expect(resolvePluginSkillRoot(root, 'gone')).toBeNull()
    expect(resolvePluginSkillRoot(join(dir, 'no-such-root'), 'brainstorming')).toBeNull()
  })
})
