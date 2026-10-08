// Reading project detail (ticket 03): the skills effective view (a same-name pair within one side lists
// only the project level, skills-view B1),
// project-level MCP, and read-only configuration. Each side's runtime same-name semantics (Claude
// shadows / Codex coexists, verified at source level
// on 2026-07-30) are in CONTEXT under "Codex same-name semantics differ per component"; this list no
// longer emits shadowing or coexistence fields.
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ProjectDetail,
  ProjectMcpEntry,
  ProjectPluginEntry,
  ProjectSkillEntry,
  AgentSide,
  SkillPkgStats
} from '@shared/domain'
import type { ScanRoots } from './types'
import { readArtifacts } from './artifacts'
import { readEffectiveSubagents } from './subagents'
import { readProjectMemory } from './memory'
import { readProjectPlugins } from './plugins'
import { fmField, readCapped, readTextCapped } from './read-utils'
import { statSkillPackage } from './skill-package'

/** G1 (the detail page's rule): the bundled skills of this project's effectively enabled plugins →
 * namespaced entries (level=plugin, not taking part in shadowing) */
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
        // G3 equal-footing preview (ADR-0012): the stats and the package root come from the same scan as
        // the bundled component summary (H5)
        pkg: s.pkg,
        origin: 'plugin',
        pluginName: p.name,
        pluginRoot: p.installPath,
        pluginSkillName: s.name
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function readProjectDetail(roots: ScanRoots, projectPath: string): ProjectDetail {
  // Plugins are read once: the plugins field and the skills join both consume it (review-code refactor
  // item #1)
  const plugins = readProjectPlugins(roots, projectPath)
  return {
    path: projectPath,
    skills: readEffectiveSkills(roots, projectPath, plugins),
    subagents: readEffectiveSubagents(roots, projectPath),
    memory: readProjectMemory(roots, projectPath),
    plugins,
    mcp: readProjectMcp(roots, projectPath),
    configs: {
      claudeMd: readCapped(join(projectPath, 'CLAUDE.md')),
      agentsMd: readCapped(join(projectPath, 'AGENTS.md')),
      settingsSummary: settingsSummary(roots, projectPath)
    },
    stats: null,
    artifacts: readArtifacts(projectPath)
  }
}

// ── The skills effective view ──

interface RawSkill {
  description: string | null
  symlink: boolean
  pkg: SkillPkgStats | null
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
    let symlink: boolean
    try {
      symlink = lstatSync(p).isSymbolicLink()
    } catch {
      continue
    }
    const md = join(p, 'SKILL.md')
    if (!existsSync(md)) continue
    out.set(e.name, { description: fmField(readTextCapped(md), 'description'), symlink, pkg: statSkillPackage(p) })
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
  // skills-view B1: within one side, a same-name pair shows only the project level (a list presentation
  // rule; the runtime semantics are in CONTEXT)
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
        pkg: s.pkg,
        origin: 'disk',
        pluginName: null,
        pluginRoot: null,
        pluginSkillName: null
      })
    }
    for (const [name, s] of [...global.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (project.has(name)) continue // Covered by the project level, so not listed alongside
      out.push({
        name,
        description: s.description,
        level: 'global',
        side,
        symlink: s.symlink,
        pkg: s.pkg,
        origin: 'disk',
        pluginName: null,
        pluginRoot: null,
        pluginSkillName: null
      })
    }
  }
  return [...out, ...pluginSkillEntries(plugins)]
}

// ── Project-level MCP ──

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

// ── Configuration ──

/** The fields worth displaying from a project key in ~/.claude.json (statistics and internal markers are
 * not shown) */
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

