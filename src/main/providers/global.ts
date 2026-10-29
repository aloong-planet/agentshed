// Reading the Agents global layer (ticket 07): global skills (merged, symlinks), plugins, global MCP, and
// read-only configuration.
// skills-view: the cross-side content diff (differs) has been removed.
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentSide,
  AntigravityPluginEntry,
  GlobalLayer,
  GlobalSkill,
  McpServerEntry,
  PluginEntry,
  PluginSkillSummary,
  SkillPkgStats } from '@shared/domain'
import type { SavedConfigPaths } from '@shared/display-data'
import { antigravityConfigDir, globalSkillsRoots, type ScanRoots } from './types'
import { readGlobalSubagents } from './subagents'
import { readAntigravityPlugins, readClaudePlugins, readCodexPlugins, readMcpConfigServers } from './plugins'
import { readCodexMemoriesEnabled } from './memory'
import { fmField, readConfigFile, readTextCapped } from './read-utils'
import { statSkillPackage } from './skill-package'

export function readGlobalLayer(roots: ScanRoots): GlobalLayer {
  // Plugins are read once, consumed by both the skills join and the MCP sources (review-code refactor
  // item #1: removing 3 duplicate scans)
  const plugins = readClaudePlugins(roots.claudeHome)
  const antigravityPlugins = readAntigravityPlugins(roots)
  return {
    skills: readGlobalSkills(roots, plugins, antigravityPlugins),
    subagents: readGlobalSubagents(roots),
    memory: [], // Depends on the project registry; scan fills it in after projects (see scan.ts)
    codexMemoriesEnabled: readCodexMemoriesEnabled(roots.codexHome),
    plugins,
    codexPlugins: readCodexPlugins(roots.codexHome),
    antigravityPlugins,
    mcp: readGlobalMcp(roots, plugins, antigravityPlugins),
    claudeMd: readConfigFile(claudeMdPath(roots)),
    agentsMd: globalAgentsMdPaths(roots).flatMap((file) => readConfigFile(file) ?? [])
  }
}

// ── skills ──

export interface SideSkill {
  description: string | null
  symlink: boolean
  pkg: SkillPkgStats | null
}

function readSkillDir(base: string): Map<string, SideSkill> {
  const out = new Map<string, SideSkill>()
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
    const skillMd = join(p, 'SKILL.md')
    if (!existsSync(skillMd)) continue // Not a skill directory (a loose file, say): skip
    // Only the frontmatter description is read; the body is read on demand (skills-view), and the full
    // text is no longer retained for a cross-side diff
    const content = readTextCapped(skillMd)
    out.set(e.name, { description: fmField(content, 'description'), symlink, pkg: statSkillPackage(p) })
  }
  return out
}

/**
 * A side's global library: its directories merged, a name present in several being the first one's — the copy the
 * side itself uses (skills-view::REQ-001/AC-01). The other copies are reachable from no list, as the side does not use
 * them either.
 */
export function readSkillLibrary(dirs: readonly string[]): Map<string, SideSkill> {
  const out = new Map<string, SideSkill>()
  for (const d of dirs) for (const [name, s] of readSkillDir(d)) if (!out.has(name)) out.set(name, s)
  return out
}

function readGlobalSkills(
  roots: ScanRoots,
  plugins: PluginEntry[],
  antigravityPlugins: AntigravityPluginEntry[]
): GlobalSkill[] {
  // Each side's own roots only. Grok's (ADR-0019): what it borrows from Claude's directories at runtime never
  // joins its list — the exclusion is by construction, since only ~/.grok/skills is read for it, and the
  // compensating copy lives on the Skills section. Antigravity's: its three directories, never its built-in skills
  // nor Codex's ~/.agents/skills (skills-view::REQ-001/AC-02, AC-06)
  const libraries = globalSkillsRoots(roots)
  const sides = Object.keys(libraries) as AgentSide[]
  const bySide = new Map(sides.map((side) => [side, readSkillLibrary(libraries[side])] as const))
  const perSide = <T>(name: string, pick: (s: SideSkill | undefined) => T): Record<AgentSide, T> =>
    Object.fromEntries(sides.map((side) => [side, pick(bySide.get(side)?.get(name))])) as Record<AgentSide, T>
  const names = [...new Set(sides.flatMap((side) => [...(bySide.get(side)?.keys() ?? [])]))].sort()
  const disk: GlobalSkill[] = names.map((name) => {
    const present = sides.filter((side) => bySide.get(side)?.has(name))
    return {
      name,
      // The first side, in side order, whose copy has one
      description: present.map((side) => bySide.get(side)?.get(name)?.description ?? null).find((d) => d !== null) ?? null,
      sides: present,
      symlink: perSide(name, (s) => s?.symlink ?? false),
      pkg: perSide(name, (s) => s?.pkg ?? null),
      origin: 'disk',
      pluginName: null,
      pluginRoot: null,
      pluginSkillName: null
    }
  })
  // G1 (the global page's rule): the bundled skills of effectively enabled plugins join in — namespaced
  // entries that do not take part in shadowing (G2), each on its plugin's own side only (G4). Claude's by the
  // user layer; Antigravity's by agy's own record, which has no other layer (plugins-view::REQ-001/AC-04)
  const fromPlugins: GlobalSkill[] = []
  const everySide = <T>(v: T): Record<AgentSide, T> =>
    Object.fromEntries(sides.map((side) => [side, v])) as Record<AgentSide, T>
  const addPluginSkill = (side: AgentSide, ns: string, s: PluginSkillSummary, pluginName: string, root: string | null): void => {
    fromPlugins.push({
      name: `${ns}:${s.name}`,
      description: s.description,
      sides: [side],
      symlink: everySide(false),
      // G3 equal-footing preview (ADR-0012): the stats and the package root come from the same scan as
      // the bundled component summary (H5)
      pkg: { ...everySide<SkillPkgStats | null>(null), [side]: s.pkg },
      origin: 'plugin',
      pluginName,
      pluginRoot: root,
      pluginSkillName: s.name
    })
  }
  for (const p of plugins) {
    if (!p.enabled || p.contents.missing) continue
    for (const s of p.contents.skills) addPluginSkill('claude', p.name.split('@')[0], s, p.name, p.installPath)
  }
  for (const p of antigravityPlugins) {
    if (!p.enabled) continue
    for (const s of p.contents.skills) addPluginSkill('antigravity', p.name, s, p.name, p.root)
  }
  return [...disk, ...fromPlugins.sort((a, b) => a.name.localeCompare(b.name))]
}

// ── MCP ──

const MCP_HEADER = /^\s*\[mcp_servers\.([^\]"]+)\]\s*$/

function readGlobalMcp(
  roots: ScanRoots,
  plugins: PluginEntry[],
  antigravityPlugins: AntigravityPluginEntry[]
): McpServerEntry[] {
  const out: McpServerEntry[] = []
  // Claude global mcpServers (at the top level of ~/.claude.json)
  try {
    const raw: unknown = JSON.parse(readFileSync(roots.claudeConfigFile, 'utf8'))
    const servers = (raw as Record<string, unknown>)?.['mcpServers']
    if (typeof servers === 'object' && servers !== null) {
      for (const name of Object.keys(servers))
        out.push({ name, side: 'claude', source: 'global-config', disabled: false, plugin: null })
    }
  } catch {
    // A missing or corrupt registry: this source is empty
  }
  // Bundled with a plugin (mcpServers in installPath/.claude-plugin/plugin.json)
  for (const plugin of plugins) {
    if (!plugin.installPath) continue
    try {
      const pj: unknown = JSON.parse(
        readFileSync(join(plugin.installPath, '.claude-plugin', 'plugin.json'), 'utf8')
      )
      const servers = (pj as Record<string, unknown>)?.['mcpServers']
      if (typeof servers === 'object' && servers !== null) {
        for (const name of Object.keys(servers))
          out.push({ name, side: 'claude', source: 'plugin', disabled: false, plugin: plugin.name.split('@')[0] })
      }
    } catch {
      // The plugin has no plugin.json, or none with mcpServers: skip
    }
  }
  // Codex config.toml [mcp_servers.*]
  const configFile = join(roots.codexHome, 'config.toml')
  if (existsSync(configFile)) {
    try {
      for (const line of readFileSync(configFile, 'utf8').split('\n')) {
        const m = MCP_HEADER.exec(line)
        if (m) out.push({ name: m[1], side: 'codex', source: 'config.toml', disabled: false, plugin: null })
      }
    } catch {
      // Ignore
    }
  }
  // Antigravity CLI (agents-overview::REQ-003/AC-04): its global file — a missing, empty or unparsable one lists none,
  // the plugin servers and the other sides unaffected — then its effectively enabled plugins' servers under the name
  // agy gives them. A project's own .agents/mcp_config.json is read nowhere: agy was not observed to load it (ADR-0037)
  for (const s of readMcpConfigServers(join(antigravityConfigDir(roots), 'mcp_config.json')))
    out.push({ name: s.name, side: 'antigravity', source: 'mcp_config.json', disabled: s.disabled, plugin: null })
  for (const p of antigravityPlugins) {
    if (!p.enabled) continue
    for (const s of readMcpConfigServers(join(p.root, 'mcp_config.json')))
      out.push({ name: `${p.name}_${s.name}`, side: 'antigravity', source: 'plugin', disabled: s.disabled, plugin: p.name })
  }
  return out
}

// ── Read-only configuration ──

/** The Configuration section's CLAUDE.md (agents-overview::REQ-004/AC-02) */
const claudeMdPath = (roots: ScanRoots): string => join(roots.claudeHome, 'CLAUDE.md')
const codexAgentsMdPath = (roots: ScanRoots): string => join(roots.codexHome, 'AGENTS.md')

/**
 * The global AGENTS.md files the Configuration section's AGENTS.md entry shows, in the order shown
 * (agents-overview::REQ-004/AC-03): Codex's, then the two agy loads together, the root one first (measured with
 * agy, ADR-0037). Only the ones a side was observed to load: Grok's is not read, there being no sample of it, and
 * agy's GEMINI.md files and rules are read nowhere (AC-05) — the exclusion is by construction, as this is the only
 * list.
 */
function globalAgentsMdPaths(roots: ScanRoots): string[] {
  return [
    codexAgentsMdPath(roots),
    join(roots.geminiHome, 'AGENTS.md'),
    join(antigravityConfigDir(roots), 'AGENTS.md')
  ]
}

/** The two files a snapshot saved before configuration entries carried their paths had read, for restoring it
 * (display-data's SavedConfigPaths) */
export function savedConfigPaths(roots: ScanRoots): SavedConfigPaths {
  return { claudeMd: claudeMdPath(roots), codexAgentsMd: codexAgentsMdPath(roots) }
}
