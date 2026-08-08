// 票06:装卸——复制落地(解引用)、同名阻止、失效拒绝、失败清理、卸载守卫。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-ins-'))
  proj = join(dir, 'work', 'p1')
  mkdirSync(proj, { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('installSkill', () => {
  it('Claude 侧安装:复制到项目 .claude/skills,内容完整', () => {
    mkGlobalSkill('claude', 'tdd')
    const r = installSkill(roots(), { skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    const target = join(proj, '.claude', 'skills', 'tdd')
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('tdd')
    expect(readFileSync(join(target, 'assets', 'x.txt'), 'utf8')).toBe('asset')
  })

  it('Codex 侧安装落 .agents/skills', () => {
    mkGlobalSkill('codex', 'decision-form')
    const r = installSkill(roots(), { skillName: 'decision-form', side: 'codex', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    expect(existsSync(join(proj, '.agents', 'skills', 'decision-form', 'SKILL.md'))).toBe(true)
  })

  it('源是软链 → 解引用复制为真目录', () => {
    const real = mkGlobalSkill('codex', 'shared-real')
    mkdirSync(join(dir, '.claude', 'skills'), { recursive: true })
    symlinkSync(real, join(dir, '.claude', 'skills', 'shared'))
    const r = installSkill(roots(), { skillName: 'shared', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    const target = join(proj, '.claude', 'skills', 'shared')
    expect(lstatSync(target).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('shared-real')
  })

  it('同名阻止:目标已有同名项目级 skill → conflict,不覆盖', () => {
    mkGlobalSkill('claude', 'tdd', '全局版')
    mkdirSync(join(proj, '.claude', 'skills', 'tdd'), { recursive: true })
    writeFileSync(join(proj, '.claude', 'skills', 'tdd', 'SKILL.md'), '项目自有版')
    const r = installSkill(roots(), { skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    expect(r).toMatchObject({ ok: false, reason: ERR.skillConflict })
    expect(readFileSync(join(proj, '.claude', 'skills', 'tdd', 'SKILL.md'), 'utf8')).toBe('项目自有版')
  })

  it('失效项目拒绝(目标目录不存在)', () => {
    mkGlobalSkill('claude', 'tdd')
    const r = installSkill(roots(), {
      skillName: 'tdd',
      side: 'claude',
      targetProjectPath: join(dir, 'work', 'ghost')
    })
    expect(r).toMatchObject({ ok: false, reason: ERR.skillStaleTarget })
  })

  it('源缺失 → missing-source,且不留半成品目录', () => {
    const r = installSkill(roots(), { skillName: 'nope', side: 'claude', targetProjectPath: proj })
    expect(r).toMatchObject({ ok: false, reason: ERR.skillMissingSource })
    const skillsDir = join(proj, '.claude', 'skills')
    if (existsSync(skillsDir)) {
      expect(readdirSync(skillsDir)).toEqual([])
    }
  })

  it('skill 名含路径穿越 → 拒绝', () => {
    const r = installSkill(roots(), { skillName: '../evil', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })
})

describe('uninstallSkill', () => {
  it('删除项目级副本;全局库不受影响', () => {
    mkGlobalSkill('claude', 'tdd')
    installSkill(roots(), { skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    const r = uninstallSkill({ skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    expect(existsSync(join(proj, '.claude', 'skills', 'tdd'))).toBe(false)
    expect(existsSync(join(dir, '.claude', 'skills', 'tdd'))).toBe(true)
  })

  it('目标不存在 → 报错不抛异常', () => {
    const r = uninstallSkill({ skillName: 'nope', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })

  it('名称穿越拒绝', () => {
    const r = uninstallSkill({ skillName: '../../etc', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })
})
