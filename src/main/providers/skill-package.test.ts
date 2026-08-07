import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  listSkillPackageFiles,
  resolveSkillRoot,
  resolvePluginSkillRoot,
  isUnderKnownSkillRoots,
  statSkillPackage,
  SKILL_DEEP_HINT
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
  it('列出顶层与一层子目录文本;更深进 deepPaths', () => {
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
    expect(SKILL_DEEP_HINT.length).toBeGreaterThan(10)
    const skill = listing.files.find((f) => f.path === 'SKILL.md')!
    expect(skill.lines).toBeGreaterThanOrEqual(3)
    expect(skill.bytes).toBeGreaterThan(0)
    expect(skill.mtimeMs).toBeGreaterThan(0)
  })

  it('跳过 node_modules 与 .git', () => {
    const pack = join(dir, 'pack2')
    mkPack(pack, {
      'SKILL.md': '# s\n',
      'node_modules/x/a.md': 'no\n',
      '.git/config': 'no\n'
    })
    const listing = listSkillPackageFiles(pack)
    expect(listing.files.map((f) => f.path)).toEqual(['SKILL.md'])
  })

  it('空包与缺 SKILL.md:不崩,列表如实', () => {
    const empty = join(dir, 'empty-pack')
    mkdirSync(empty, { recursive: true })
    const l1 = listSkillPackageFiles(empty)
    expect(l1.files).toEqual([])
    expect(l1.deep).toBe(false)

    // 包损坏(无 SKILL.md):其余文本仍列出,不伪造入口(C5)
    const noEntry = join(dir, 'no-entry')
    mkPack(noEntry, { 'notes.txt': 'hi\n' })
    const l2 = listSkillPackageFiles(noEntry)
    expect(l2.files.map((f) => f.path)).toEqual(['notes.txt'])
  })

  it('statSkillPackage:与列举同一套过滤规则计数;不可读根 → null', () => {
    const pack = join(dir, 'stat-pack')
    mkPack(pack, {
      'SKILL.md': '# s\n',
      'references/a.md': 'aa\n',
      'references/nested/deep.md': 'no\n',
      'node_modules/x/no.md': 'no\n'
    })
    const st = statSkillPackage(pack)!
    expect(st.files).toBe(2) // SKILL.md + references/a.md;深层与垃圾目录不计
    expect(st.bytes).toBeGreaterThan(0)
    // 行上数字与展开表格一致(同一套规则)
    expect(st.files).toBe(listSkillPackageFiles(pack).files.length)
    expect(statSkillPackage(join(dir, 'missing'))).toBeNull()
  })

  it('跟随软链 skill 根', () => {
    const real = join(dir, 'real-skill')
    mkPack(real, { 'SKILL.md': '---\ndescription: via link\n---\n' })
    const link = join(dir, 'link-skill')
    symlinkSync(real, link)
    const listing = listSkillPackageFiles(link)
    expect(listing.files.some((f) => f.path === 'SKILL.md')).toBe(true)
  })
})

describe('resolveSkillRoot + isUnderKnownSkillRoots', () => {
  it('解析全局/项目路径并校验落在 skills 根下', () => {
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

  it('软链入口:目标在所有已知根之外仍放行(decision-form 形态;容器检查作用于解析前入口)', () => {
    const r = roots()
    // 真实包在普通仓库目录(所有已知根之外)——软链装 skill 的最常见形态
    const target = join(dir, 'repo', 'skills', 'decision-form')
    mkPack(target, { 'SKILL.md': '---\ndescription: 表单\n---\n决策表正文\n' })
    mkdirSync(r.agentsSkillsDir, { recursive: true })
    symlinkSync(target, join(r.agentsSkillsDir, 'decision-form'))
    // 入口(软链本身)必须过容器检查——A6:目标不设限
    expect(isUnderKnownSkillRoots(join(r.agentsSkillsDir, 'decision-form'), r)).toBe(true)
    const abs = resolveSkillRoot({ side: 'codex', name: 'decision-form', scope: 'global', roots: r })
    expect(abs).toBeTruthy()
    expect(listSkillPackageFiles(abs!).files.some((f) => f.path === 'SKILL.md')).toBe(true)
  })

  it('软链入口:目标在另一已知根内也放行(codebase-design 形态,锁现状)', () => {
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

  it('悬空软链 → null(不崩、不放行)', () => {
    const r = roots()
    mkdirSync(r.agentsSkillsDir, { recursive: true })
    symlinkSync(join(dir, 'gone'), join(r.agentsSkillsDir, 'dangling'))
    expect(resolveSkillRoot({ side: 'codex', name: 'dangling', scope: 'global', roots: r })).toBeNull()
  })

  it('isUnderKnownSkillRoots:包外 / skills 根自身 / 非直接子目录一律拒绝(C9 fail-closed)', () => {
    const r = roots()
    mkdirSync(join(r.claudeHome, 'skills', 'tdd', 'references'), { recursive: true })
    const outside = join(dir, 'elsewhere', 'tdd')
    mkdirSync(outside, { recursive: true })
    expect(isUnderKnownSkillRoots(outside, r)).toBe(false)
    expect(isUnderKnownSkillRoots(join(r.claudeHome, 'skills'), r)).toBe(false)
    expect(isUnderKnownSkillRoots(join(r.claudeHome, 'skills', 'tdd', 'references'), r)).toBe(false)
    // 未传 projectPath 时,项目级目录不在允许集
    mkdirSync(join(dir, 'proj', '.claude', 'skills', 'x'), { recursive: true })
    expect(isUnderKnownSkillRoots(join(dir, 'proj', '.claude', 'skills', 'x'), r)).toBe(false)
    expect(isUnderKnownSkillRoots(join(dir, 'proj', '.claude', 'skills', 'x'), r, join(dir, 'proj'))).toBe(true)
  })
})

describe('resolvePluginSkillRoot(plugins-view H8)', () => {
  it('包根下 skills/<名> 解析;name 消毒;缺失/悬空 → null', () => {
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
