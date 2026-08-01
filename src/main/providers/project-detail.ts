// 项目详情读取(票03):skills 生效视图(项目级+全局)、项目级 MCP、配置只读。
// 同名语义按侧区分(2026-07-30 源码级核实):
//   Claude:项目级遮蔽全局(shadows/shadowed);
//   Codex:不遮蔽,仅按路径去重、同名共存且两个都生效(coexists;openai/codex
//   root_loader.rs 只按 path 去重,官方文档明言 "doesn't merge them")。
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ProjectDetail,
  ProjectMcpEntry,
  ProjectPluginEntry,
  ProjectSkillEntry,
  AgentSide
} from '@shared/domain'
import type { ScanRoots } from './types'
import { readArtifacts } from './artifacts'
import { readEffectiveSubagents } from './subagents'
import { readProjectMemory } from './memory'
import { readProjectPlugins } from './plugins'
import { fmField, readTextCapped } from './read-utils'

/** G1(详情页口径):本项目有效启用插件的内含 skills → 命名空间条目(level=plugin,不参与遮蔽) */
function pluginSkillEntries(plugins: ProjectPluginEntry[]): ProjectSkillEntry[] {
  const out: ProjectSkillEntry[] = []
  for (const p of plugins) {
    if (!p.enabled || p.contents.missing) continue
    const ns = p.name.split('@')[0]
    for (const s of p.contents.skills) {
      out.push({
        name: `${ns}:${s.name}`,
        description: s.description,
        level: 'plugin',
        side: 'claude',
        symlink: false,
        shadowed: false,
        shadows: false,
        coexists: false,
        origin: 'plugin',
        pluginName: p.name
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function readProjectDetail(roots: ScanRoots, projectPath: string): ProjectDetail {
  // plugins 只读一次:plugins 字段与 skills 并入共同消费(review-code 重构项 #1)
  const plugins = readProjectPlugins(roots, projectPath)
  return {
    path: projectPath,
    skills: readEffectiveSkills(roots, projectPath, plugins),
    subagents: readEffectiveSubagents(roots, projectPath),
    memory: readProjectMemory(roots, projectPath),
    plugins,
    mcp: readProjectMcp(roots, projectPath),
    configs: {
      claudeMd: readTextCapped(join(projectPath, 'CLAUDE.md')),
      agentsMd: readTextCapped(join(projectPath, 'AGENTS.md')),
      settingsSummary: settingsSummary(roots, projectPath)
    },
    stats: null,
    artifacts: readArtifacts(projectPath)
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
    out.set(e.name, { description: fmField(readTextCapped(md), 'description'), symlink })
  }
  return out
}

function readEffectiveSkills(
  roots: ScanRoots,
  projectPath: string,
  plugins: ProjectPluginEntry[]
): ProjectSkillEntry[] {
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
    const shadowing = side === 'claude' // Codex 同名共存,不遮蔽
    for (const [name, s] of [...project.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        name,
        description: s.description,
        level: 'project',
        side,
        symlink: s.symlink,
        shadowed: false,
        shadows: shadowing && global.has(name),
        coexists: !shadowing && global.has(name),
        origin: 'disk',
        pluginName: null
      })
    }
    for (const [name, s] of [...global.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        name,
        description: s.description,
        level: 'global',
        side,
        symlink: s.symlink,
        shadowed: shadowing && project.has(name),
        shadows: false,
        coexists: !shadowing && project.has(name),
        origin: 'disk',
        pluginName: null
      })
    }
  }
  return [...out, ...pluginSkillEntries(plugins)]
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

