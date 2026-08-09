import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  listSkillPackageFiles,
  resolveSkillRoot,
  resolvePluginSkillRoot,
  isUnderKnownSkillRoots,
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

describe('listSkillPackageFiles', () => {
  it('lists text at the top level and one subdirectory down; anything deeper goes to deepPaths', () => {
    const pack = join(dir, 'pack')
    mkPack(pack, {
      'SKILL.md': '---\nname: x\n---\n\n# Hi\n',
      'references/overview.md': '# ov\n',
      'references/nested/too-deep.md': 'deep\n',
      'script.sh': 'echo 1\n',
      'bin/tool.png': 'not-text'
    })
    // png under bin - not text, skip; create empty so walk enters
    writeFileSync(join(pack, 'bin', 'tool.png'), Buffer.from([0x89, 0x50]))
    const listing = listSkillPackageFiles(pack)
    const paths = listing.files.map((f) => f.path)
    expect(paths).toContain('SKILL.md')
    expect(paths).toContain('references/overview.md')
    expect(paths).toContain('script.sh')
    expect(paths).not.toContain('references/nested/too-deep.md')
    expect(paths).not.toContain('bin/tool.png')
    expect(listing.deep).toBe(true)
    expect(listing.deepPaths).toContain('references/nested/too-deep.md')
    // The notice copy moved to the renderer (ticket 07) and the main process only passes the `deep`
    // verdict —
    // so the assertion moved from "the copy is present" to "the verdict is true"
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
    expect(l1.deep).toBe(false)

    // A broken package (no SKILL.md): the other text files are still listed and no entry point is
    // fabricated (C5)
    const noEntry = join(dir, 'no-entry')
    mkPack(noEntry, { 'notes.txt': 'hi\n' })
    const l2 = listSkillPackageFiles(noEntry)
    expect(l2.files.map((f) => f.path)).toEqual(['notes.txt'])
  })

  it('statSkillPackage: counts by the same filtering rules as enumeration; an unreadable root → null', () => {
    const pack = join(dir, 'stat-pack')
    mkPack(pack, {
      'SKILL.md': '# s\n',
      'references/a.md': 'aa\n',
      'references/nested/deep.md': 'no\n',
      'node_modules/x/no.md': 'no\n'
    })
    const st = statSkillPackage(pack)!
    expect(st.files).toBe(2) // SKILL.md + references/a.md; deeper files and junk directories do not count
    expect(st.bytes).toBeGreaterThan(0)
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
    mkPack(target, { 'SKILL.md': '---\ndescription: form\n---\n决策表body\n' })
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
