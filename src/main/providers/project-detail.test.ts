// Ticket 03: project detail's "what is installed" — the skills effective view (a same-name pair shows only
// the project level, skills-view B1),
// project-level MCP (.mcp.json plus the enabled/disabled switches), and read-only configuration.
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

describe('the skills effective view', () => {
  it('within one side a same-name pair lists only the project level; names present only globally are still listed from the global layer (skills-view B1)', () => {
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
    expect(map['claude:project:tdd'].pkg?.files).toBe(1)
    expect(map['claude:project:tdd'].pkg!.bytes).toBeGreaterThan(0)
    expect(map['claude:global:tdd']).toBeUndefined()
    expect(map['claude:global:review-code']).toBeTruthy()
    expect(map['codex:project:decision-form']).toBeTruthy()
    expect(map['codex:global:github-ops']).toBeTruthy()
  })

  it('a same name on the Codex side likewise lists only the project level (list presentation unified with Claude)', () => {
    mkSkill(join(proj, '.agents', 'skills'), 'grilling', '项目版')
    mkSkill(join(dir, '.agents', 'skills'), 'grilling', '全局版')
    const d = readProjectDetail(roots(), proj)
    const project = d.skills.find((s) => s.side === 'codex' && s.level === 'project' && s.name === 'grilling')
    const global = d.skills.find((s) => s.side === 'codex' && s.level === 'global' && s.name === 'grilling')
    expect(project).toBeTruthy()
    expect(global).toBeUndefined()
  })

  it('a project-level symlinked skill carries the symlink marker', () => {
    mkSkill(join(dir, '.agents', 'skills'), 'shared', '共享')
    mkdirSync(join(proj, '.claude', 'skills'), { recursive: true })
    symlinkSync(join(dir, '.agents', 'skills', 'shared'), join(proj, '.claude', 'skills', 'shared'))
    const d = readProjectDetail(roots(), proj)
    const s = d.skills.find((x) => x.level === 'project' && x.name === 'shared')
    expect(s?.symlink).toBe(true)
  })

  it('a stale project (its directory missing) → project level empty, global as usual, without throwing', () => {
    mkSkill(join(dir, '.claude', 'skills'), 'tdd', '全局')
    const d = readProjectDetail(roots(), join(dir, 'work', 'ghost'))
    expect(d.skills.filter((s) => s.level === 'project')).toHaveLength(0)
    expect(d.skills.filter((s) => s.level === 'global')).toHaveLength(1)
  })
})

describe('project-level MCP', () => {
  it('.mcp.json servers plus the enabled/disabled switches on the project key', () => {
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

  it('no .mcp.json → an empty list', () => {
    const d = readProjectDetail(roots(), proj)
    expect(d.mcp).toEqual([])
  })
})

describe('read-only configuration', () => {
  it('the project CLAUDE.md / AGENTS.md contents; the settings summary comes from the project key', () => {
    writeFileSync(join(proj, 'CLAUDE.md'), '# 项目约定\n')
    writeFileSync(join(proj, 'AGENTS.md'), '# Codex 项目说明\n')
    writeFileSync(
      join(dir, '.claude.json'),
      JSON.stringify({
        projects: { [proj]: { allowedTools: ['Bash'], enabledMcpjsonServers: ['figma'] } }
      })
    )
    const d = readProjectDetail(roots(), proj)
    expect(d.configs.claudeMd?.text).toContain('项目约定')
    expect(d.configs.agentsMd?.text).toContain('Codex 项目说明')
    expect(d.configs.settingsSummary).toContain('allowedTools')
    expect(d.configs.settingsSummary).toContain('figma')
  })

  it('missing configuration → null', () => {
    const d = readProjectDetail(roots(), proj)
    expect(d.configs.claudeMd).toBeNull()
    expect(d.configs.agentsMd).toBeNull()
  })
})
