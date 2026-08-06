// 票03:项目详情"装了什么"——skills 生效视图(同名只见项目级,skills-view B1)、
// 项目级 MCP(.mcp.json + enabled/disabled 开关)、配置只读。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readProjectDetail } from './project-detail'
import type { ScanRoots } from './types'

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
function mkSkill(base: string, name: string, desc: string): void {
  const d = join(base, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\nbody\n`)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-det-'))
  proj = join(dir, 'work', 'myproj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('skills 生效视图', () => {
  it('同侧同名只列项目级;仅全局有的仍列全局层(skills-view B1)', () => {
    mkSkill(join(proj, '.claude', 'skills'), 'ui-design', '项目专属')
    mkSkill(join(proj, '.claude', 'skills'), 'tdd', '项目版 tdd')
    mkSkill(join(dir, '.claude', 'skills'), 'tdd', '全局版 tdd')
    mkSkill(join(dir, '.claude', 'skills'), 'review-code', '四层法')
    mkSkill(join(proj, '.agents', 'skills'), 'decision-form', '项目级表单')
    mkSkill(join(dir, '.agents', 'skills'), 'github-ops', '规范')
    const d = readProjectDetail(roots(), proj)
    const key = (s: { name: string; level: string; side: string }): string =>
      `${s.side}:${s.level}:${s.name}`
    const map = Object.fromEntries(d.skills.map((s) => [key(s), s]))
    expect(map['claude:project:ui-design']).toBeTruthy()
    expect(map['claude:project:tdd']).toMatchObject({ description: '项目版 tdd' })
    expect(map['claude:global:tdd']).toBeUndefined()
    expect(map['claude:global:review-code']).toBeTruthy()
    expect(map['codex:project:decision-form']).toBeTruthy()
    expect(map['codex:global:github-ops']).toBeTruthy()
  })

  it('Codex 侧同名也只列项目级(列表展示与 Claude 统一)', () => {
    mkSkill(join(proj, '.agents', 'skills'), 'grilling', '项目版')
    mkSkill(join(dir, '.agents', 'skills'), 'grilling', '全局版')
    const d = readProjectDetail(roots(), proj)
    const project = d.skills.find((s) => s.side === 'codex' && s.level === 'project' && s.name === 'grilling')
    const global = d.skills.find((s) => s.side === 'codex' && s.level === 'global' && s.name === 'grilling')
    expect(project).toBeTruthy()
    expect(global).toBeUndefined()
  })

  it('项目级软链 skill 带 symlink 标记', () => {
    mkSkill(join(dir, '.agents', 'skills'), 'shared', '共享')
    mkdirSync(join(proj, '.claude', 'skills'), { recursive: true })
    symlinkSync(join(dir, '.agents', 'skills', 'shared'), join(proj, '.claude', 'skills', 'shared'))
    const d = readProjectDetail(roots(), proj)
    const s = d.skills.find((x) => x.level === 'project' && x.name === 'shared')
    expect(s?.symlink).toBe(true)
  })

  it('失效项目(目录不存在)→ 项目级为空、全局照常,不抛错', () => {
    mkSkill(join(dir, '.claude', 'skills'), 'tdd', '全局')
    const d = readProjectDetail(roots(), join(dir, 'work', 'ghost'))
    expect(d.skills.filter((s) => s.level === 'project')).toHaveLength(0)
    expect(d.skills.filter((s) => s.level === 'global')).toHaveLength(1)
  })
})

describe('项目级 MCP', () => {
  it('.mcp.json servers + 项目键的 enabled/disabled 开关', () => {
    writeFileSync(
      join(proj, '.mcp.json'),
      JSON.stringify({ mcpServers: { figma: { command: 'x' }, sentry: { command: 'y' } } })
    )
    writeFileSync(
      join(dir, '.claude.json'),
      JSON.stringify({
        projects: {
          [proj]: { enabledMcpjsonServers: ['figma'], disabledMcpjsonServers: ['sentry'] }
        }
      })
    )
    const d = readProjectDetail(roots(), proj)
    const map = Object.fromEntries(d.mcp.map((m) => [m.name, m]))
    expect(map['figma'].enabled).toBe(true)
    expect(map['sentry'].enabled).toBe(false)
  })

  it('无 .mcp.json → 空列表', () => {
    const d = readProjectDetail(roots(), proj)
    expect(d.mcp).toEqual([])
  })
})

describe('配置只读', () => {
  it('项目 CLAUDE.md / AGENTS.md 内容;settings 摘要来自项目键', () => {
    writeFileSync(join(proj, 'CLAUDE.md'), '# 项目约定\n')
    writeFileSync(join(proj, 'AGENTS.md'), '# Codex 项目说明\n')
    writeFileSync(
      join(dir, '.claude.json'),
      JSON.stringify({
        projects: { [proj]: { allowedTools: ['Bash'], enabledMcpjsonServers: ['figma'] } }
      })
    )
    const d = readProjectDetail(roots(), proj)
    expect(d.configs.claudeMd).toContain('项目约定')
    expect(d.configs.agentsMd).toContain('Codex 项目说明')
    expect(d.configs.settingsSummary).toContain('allowedTools')
    expect(d.configs.settingsSummary).toContain('figma')
  })

  it('配置缺失 → null', () => {
    const d = readProjectDetail(roots(), proj)
    expect(d.configs.claudeMd).toBeNull()
    expect(d.configs.agentsMd).toBeNull()
  })
})
