// 项目详情读取(票03):skills 生效视图(项目级+全局,遮蔽/软链)、项目级 MCP、配置只读。
// 遮蔽语义:同侧同名时项目级压过全局(Claude 侧有既往佐证;Codex 侧为同规则假设,
// 待核事实见 .scratch/v1/requirements.md——实证不同再改标注)。
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ProjectDetail, ProjectMcpEntry, ProjectSkillEntry, AgentSide } from '@shared/domain'
import type { ScanRoots } from './types'

const MAX_CONFIG_BYTES = 200_000

export function readProjectDetail(roots: ScanRoots, projectPath: string): ProjectDetail {
  return {
    path: projectPath,
    skills: readEffectiveSkills(roots, projectPath),
    mcp: readProjectMcp(roots, projectPath),
    configs: {
      claudeMd: readTextCapped(join(projectPath, 'CLAUDE.md')),
      agentsMd: readTextCapped(join(projectPath, 'AGENTS.md')),
      settingsSummary: settingsSummary(roots, projectPath)
    },
    stats: null
  }
}

// ── skills 生效视图 ──

interface RawSkill {
  description: string | null
  symlink: boolean
}

function listSkills(base: string): Map<string, RawSkill> {
  const out = new Map<string, RawSkill>()
  if (!existsSync(base)) return out
  let entries
  try {
    entries = readdirSync(base, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const p = join(base, e.name)
    let symlink = false
    try {
      symlink = lstatSync(p).isSymbolicLink()
    } catch {
      continue
    }
    const md = join(p, 'SKILL.md')
    if (!existsSync(md)) continue
    const content = readTextCapped(md)
    const desc = content ? /^description:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1] ?? null : null
    out.set(e.name, { description: desc, symlink })
  }
  return out
}

function readEffectiveSkills(roots: ScanRoots, projectPath: string): ProjectSkillEntry[] {
  const sides: Array<{ side: AgentSide; projectDir: string; globalDir: string }> = [
    {
      side: 'claude',
      projectDir: join(projectPath, '.claude', 'skills'),
      globalDir: join(roots.claudeHome, 'skills')
    },
    {
      side: 'codex',
      projectDir: join(projectPath, '.agents', 'skills'),
      globalDir: roots.agentsSkillsDir
    }
  ]
  const out: ProjectSkillEntry[] = []
  for (const { side, projectDir, globalDir } of sides) {
    const project = listSkills(projectDir)
    const global = listSkills(globalDir)
    for (const [name, s] of [...project.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        name,
        description: s.description,
        level: 'project',
        side,
        symlink: s.symlink,
        shadowed: false,
        shadows: global.has(name)
      })
    }
    for (const [name, s] of [...global.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        name,
        description: s.description,
        level: 'global',
        side,
        symlink: s.symlink,
        shadowed: project.has(name),
        shadows: false
      })
    }
  }
  return out
}

// ── 项目级 MCP ──

function readProjectMcp(roots: ScanRoots, projectPath: string): ProjectMcpEntry[] {
  const file = join(projectPath, '.mcp.json')
  if (!existsSync(file)) return []
  let names: string[] = []
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const servers = (raw as Record<string, unknown>)?.['mcpServers']
    if (typeof servers === 'object' && servers !== null) names = Object.keys(servers)
  } catch {
    return []
  }
  const settings = projectSettings(roots, projectPath)
  const enabled = new Set(asStringArray(settings?.['enabledMcpjsonServers']))
  const disabled = new Set(asStringArray(settings?.['disabledMcpjsonServers']))
  return names.map((name) => ({
    name,
    enabled: enabled.has(name) ? true : disabled.has(name) ? false : null
  }))
}

// ── 配置 ──

/** ~/.claude.json 项目键里值得展示的字段(统计/内部标记不展示) */
const SETTINGS_KEYS = ['allowedTools', 'enabledMcpjsonServers', 'disabledMcpjsonServers'] as const

function projectSettings(roots: ScanRoots, projectPath: string): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(roots.claudeConfigFile, 'utf8'))
    const projects = (raw as Record<string, unknown>)?.['projects']
    if (typeof projects !== 'object' || projects === null) return null
    const entry = (projects as Record<string, unknown>)[projectPath]
    if (typeof entry !== 'object' || entry === null) return null
    return entry as Record<string, unknown>
  } catch {
    return null
  }
}

function settingsSummary(roots: ScanRoots, projectPath: string): string | null {
  const s = projectSettings(roots, projectPath)
  if (!s) return null
  const picked: Record<string, unknown> = {}
  for (const k of SETTINGS_KEYS) {
    if (s[k] !== undefined) picked[k] = s[k]
  }
  if (Object.keys(picked).length === 0) return null
  return JSON.stringify(picked, null, 2)
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function readTextCapped(file: string): string | null {
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8')
    return raw.length > MAX_CONFIG_BYTES ? `${raw.slice(0, MAX_CONFIG_BYTES)}\n…(已截断)` : raw
  } catch {
    return null
  }
}
