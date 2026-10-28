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
    geminiHome: join(dir, '.gemini'),
    grokHome: join(dir, '.grok'),
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
    mkSkill(join(proj, '.claude', 'skills'), 'ui-design', 'project only')
    mkSkill(join(proj, '.claude', 'skills'), 'tdd', 'project tdd')
    mkSkill(join(dir, '.claude', 'skills'), 'tdd', 'global tdd')
    mkSkill(join(dir, '.claude', 'skills'), 'review-code', 'four-layer method')
    mkSkill(join(proj, '.agents', 'skills'), 'decision-form', 'project-level form')
    mkSkill(join(dir, '.agents', 'skills'), 'github-ops', 'conventions')
    const d = readProjectDetail(roots(), proj)
    const key = (s: { name: string; level: string; side: string }): string =>
      `${s.side}:${s.level}:${s.name}`
    const map = Object.fromEntries(d.skills.map((s) => [key(s), s]))
    expect(map['claude:project:ui-design']).toBeTruthy()
    expect(map['claude:project:tdd']).toMatchObject({ description: 'project tdd' })
    expect(map['claude:project:tdd'].pkg?.files).toBe(1)
    expect(map['claude:project:tdd'].pkg!.bytes).toBeGreaterThan(0)
    expect(map['claude:global:tdd']).toBeUndefined()
    expect(map['claude:global:review-code']).toBeTruthy()
    expect(map['codex:project:decision-form']).toBeTruthy()
    expect(map['codex:global:github-ops']).toBeTruthy()
  })

  it('a same name on the Codex side likewise lists only the project level (list presentation unified with Claude)', () => {
    mkSkill(join(proj, '.agents', 'skills'), 'grilling', 'project version')
    mkSkill(join(dir, '.agents', 'skills'), 'grilling', 'global version')
    const d = readProjectDetail(roots(), proj)
    const project = d.skills.find((s) => s.side === 'codex' && s.level === 'project' && s.name === 'grilling')
    const global = d.skills.find((s) => s.side === 'codex' && s.level === 'global' && s.name === 'grilling')
    expect(project).toBeTruthy()
    expect(global).toBeUndefined()
  })

  it('a project-level symlinked skill carries the symlink marker', () => {
    mkSkill(join(dir, '.agents', 'skills'), 'shared', 'shared')
    mkdirSync(join(proj, '.claude', 'skills'), { recursive: true })
    symlinkSync(join(dir, '.agents', 'skills', 'shared'), join(proj, '.claude', 'skills', 'shared'))
    const d = readProjectDetail(roots(), proj)
    const s = d.skills.find((x) => x.level === 'project' && x.name === 'shared')
    expect(s?.symlink).toBe(true)
  })

  it('a stale project (its directory missing) → project level empty, global as usual, without throwing', () => {
    mkSkill(join(dir, '.claude', 'skills'), 'tdd', 'global')
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

// project-detail::REQ-002/AC-02: two entries, the project's own CLAUDE.md and AGENTS.md, each with its path
describe('the Configuration section (project-detail::REQ-002/AC-02)', () => {
  it('the project CLAUDE.md and AGENTS.md, each with its path; no settings summary, even with a project key carrying settings', () => {
    writeFileSync(join(proj, 'CLAUDE.md'), '# Project conventions\n')
    // The shape of agy's demo project sample (research record, spike/samples/project/AGENTS.md)
    writeFileSync(join(proj, 'AGENTS.md'), '# agy-demo instructions\n\nRun the tests with `python3 -m unittest` before finishing.\n')
    // The input that used to produce the settings summary
    writeFileSync(
      join(dir, '.claude.json'),
      JSON.stringify({
        projects: { [proj]: { allowedTools: ['Bash'], enabledMcpjsonServers: ['figma'] } }
      })
    )
    const d = readProjectDetail(roots(), proj)
    expect(d.configs).toEqual({
      claudeMd: { file: join(proj, 'CLAUDE.md'), content: { text: '# Project conventions\n', truncated: false } },
      agentsMd: {
        file: join(proj, 'AGENTS.md'),
        content: { text: '# agy-demo instructions\n\nRun the tests with `python3 -m unittest` before finishing.\n', truncated: false }
      }
    })
    expect(d.configs).not.toHaveProperty('settingsSummary')
  })

  it('missing configuration → null', () => {
    const d = readProjectDetail(roots(), proj)
    expect(d.configs.claudeMd).toBeNull()
    expect(d.configs.agentsMd).toBeNull()
  })

  it('the project\'s GEMINI.md and its .agents/rules are shown nowhere (agents-overview::REQ-004/AC-05)', () => {
    writeFileSync(join(proj, 'AGENTS.md'), '# marker-project-agents\n')
    writeFileSync(join(proj, 'GEMINI.md'), '# marker-project-gemini\n')
    mkdirSync(join(proj, '.agents', 'rules'), { recursive: true })
    writeFileSync(join(proj, '.agents', 'rules', 'house-style.md'), '# marker-project-rule\n')
    const payload = JSON.stringify(readProjectDetail(roots(), proj))
    expect(payload).toContain('marker-project-agents')
    expect(payload).not.toContain('marker-project-gemini')
    expect(payload).not.toContain('marker-project-rule')
  })

  it('a file that exists but cannot be read keeps its path with no contents; the other entry is unaffected', () => {
    writeFileSync(join(proj, 'CLAUDE.md'), '# Project conventions\n')
    // A directory where the file should be: the read fails (EISDIR) whoever runs the test
    mkdirSync(join(proj, 'AGENTS.md'))
    const d = readProjectDetail(roots(), proj)
    expect(d.configs.agentsMd).toEqual({ file: join(proj, 'AGENTS.md'), content: null })
    expect(d.configs.claudeMd).toEqual({ file: join(proj, 'CLAUDE.md'), content: { text: '# Project conventions\n', truncated: false } })
  })
})
