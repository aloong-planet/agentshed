// Ticket 06: install and uninstall — landing by copy (dereferenced), blocking same names, refusing stale
// projects, cleaning up on failure, and the uninstall guards.
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
    grokHome: join(dir, '.grok'),
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

  it('a symlinked source → dereferenced and copied as a real directory', () => {
    const real = mkGlobalSkill('codex', 'shared-real')
    mkdirSync(join(dir, '.claude', 'skills'), { recursive: true })
    symlinkSync(real, join(dir, '.claude', 'skills', 'shared'))
    const r = installSkill(roots(), { skillName: 'shared', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    const target = join(proj, '.claude', 'skills', 'shared')
    expect(lstatSync(target).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('shared-real')
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

describe('uninstallSkill', () => {
  it('deletes the project-level copy; the global library is unaffected', () => {
    mkGlobalSkill('claude', 'tdd')
    installSkill(roots(), { skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    const r = uninstallSkill({ skillName: 'tdd', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(true)
    expect(existsSync(join(proj, '.claude', 'skills', 'tdd'))).toBe(false)
    expect(existsSync(join(dir, '.claude', 'skills', 'tdd'))).toBe(true)
  })

  it('a missing target → reports an error rather than throwing', () => {
    const r = uninstallSkill({ skillName: 'nope', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })

  it('name traversal is refused', () => {
    const r = uninstallSkill({ skillName: '../../etc', side: 'claude', targetProjectPath: proj })
    expect(r.ok).toBe(false)
  })
})
