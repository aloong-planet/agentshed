// 票02 纵切(a):两侧注册表 → 项目并集(徽标/失效/路径规范化)。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import type { ScanRoots } from './types'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
/** 建一个真实存在的"项目目录"并返回其路径 */
function mkProject(name: string): string {
  const p = join(dir, 'work', name)
  mkdirSync(p, { recursive: true })
  return p
}
function writeClaudeRegistry(paths: string[]): void {
  const projects: Record<string, object> = {}
  for (const p of paths) projects[p] = {}
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects }))
}
function writeCodexRegistry(paths: string[]): void {
  mkdirSync(join(dir, '.codex'), { recursive: true })
  const lines = paths.map((p) => `[projects."${p}"]\ntrust_level = "trusted"\n`).join('\n')
  writeFileSync(join(dir, '.codex', 'config.toml'), `model = "gpt-5.5-codex"\n\n${lines}`)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-reg-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('注册表并集', () => {
  it('Claude 注册表 → 项目条目,目录存在为正常、不存在为失效', async () => {
    const alive = mkProject('alive')
    writeClaudeRegistry([alive, join(dir, 'work', 'ghost')])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(2)
    const byName = Object.fromEntries(snap.projects.map((p) => [p.name, p]))
    expect(byName['alive']).toMatchObject({ sides: ['claude'], stale: false })
    expect(byName['ghost']).toMatchObject({ sides: ['claude'], stale: true })
  })

  it('Codex config.toml 注册表 → 项目条目', async () => {
    const p = mkProject('codex-only')
    writeCodexRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0]).toMatchObject({ name: 'codex-only', sides: ['codex'], stale: false })
  })

  it('同一目录两侧都注册 → 合并为一项,双徽标', async () => {
    const p = mkProject('both')
    writeClaudeRegistry([p])
    writeCodexRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].sides).toEqual(['claude', 'codex'])
  })

  it('尾斜杠差异不产生重复项', async () => {
    const p = mkProject('slashy')
    writeClaudeRegistry([p])
    writeCodexRegistry([`${p}/`])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].sides).toEqual(['claude', 'codex'])
  })

  it('注册表 JSON 损坏 → 该侧降级为空并带错误,另一侧照常', async () => {
    writeFileSync(join(dir, '.claude.json'), '{broken json')
    const p = mkProject('ok-side')
    writeCodexRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.claude.detected).toBe(true)
    expect(snap.sides.claude.error).toBeTruthy()
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].name).toBe('ok-side')
  })
})
