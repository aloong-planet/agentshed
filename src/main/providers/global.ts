// Reading the Agents global layer (ticket 07): global skills (merged, symlinks), plugins, global MCP, and
// read-only configuration.
// skills-view: the cross-side content diff (differs) has been removed.
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentSide,
  GlobalLayer,
  GlobalSkill,
  McpServerEntry,
  PluginEntry,
  SkillPkgStats, CodexConfigSummary } from '@shared/domain'
import type { ScanRoots } from './types'
import { readGlobalSubagents } from './subagents'
import { readClaudePlugins, readCodexPlugins } from './plugins'
import { readCodexMemoriesEnabled } from './memory'
import { fmField, readCapped, readTextCapped } from './read-utils'
import { statSkillPackage } from './skill-package'

export function readGlobalLayer(roots: ScanRoots): GlobalLayer {
  // Plugins are read once, consumed by both the skills join and the MCP sources (review-code refactor
  // item #1: removing 3 duplicate scans)
  const plugins = readClaudePlugins(roots.claudeHome)
  return {
    skills: readGlobalSkills(roots, plugins),
    subagents: readGlobalSubagents(roots),
    memory: [], // Depends on the project registry; scan fills it in after projects (see scan.ts)
    codexMemoriesEnabled: readCodexMemoriesEnabled(roots.codexHome),
    plugins,
    codexPlugins: readCodexPlugins(roots.codexHome),
    mcp: readGlobalMcp(roots, plugins),
    claudeGlobalMd: readCapped(join(roots.claudeHome, 'CLAUDE.md')),
    codexAgentsMd: readCapped(join(roots.codexHome, 'AGENTS.md')),
    codexConfigSummary: summarizeCodexConfig(join(roots.codexHome, 'config.toml'))
  }
}

// ── skills ──

interface SideSkill {
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

function readGlobalSkills(roots: ScanRoots, plugins: PluginEntry[]): GlobalSkill[] {
  const claude = readSkillDir(join(roots.claudeHome, 'skills'))
  const codex = readSkillDir(roots.agentsSkillsDir)
  // Grok's own root only (ADR-0019): what it borrows from Claude's directories at runtime never
  // joins its list — the exclusion is by construction, since only ~/.grok/skills is read here,
  // and the compensating copy lives on the Skills section
  const grok = readSkillDir(join(roots.grokHome, 'skills'))
  const names = [...new Set([...claude.keys(), ...codex.keys(), ...grok.keys()])].sort()
  const disk: GlobalSkill[] = names.map((name) => {
    const cl = claude.get(name)
    const cx = codex.get(name)
    const gk = grok.get(name)
    const sides: AgentSide[] = []
    if (cl) sides.push('claude')
    if (cx) sides.push('codex')
    if (gk) sides.push('grok')
    return {
      name,
      description: cl?.description ?? cx?.description ?? gk?.description ?? null,
      sides,
      symlink: { claude: cl?.symlink ?? false, codex: cx?.symlink ?? false, grok: gk?.symlink ?? false },
      pkg: { claude: cl?.pkg ?? null, codex: cx?.pkg ?? null, grok: gk?.pkg ?? null },
      origin: 'disk',
      pluginName: null,
      pluginRoot: null,
      pluginSkillName: null
    }
  })
  // G1 (the global page's rule): the bundled skills of user-layer enabled plugins join in — namespaced
  // entries that do not take part in shadowing (G2)
  const fromPlugins: GlobalSkill[] = []
  for (const p of plugins) {
    if (!p.enabled || p.contents.missing) continue
    const ns = p.name.split('@')[0]
    for (const s of p.contents.skills) {
      fromPlugins.push({
        name: `${ns}:${s.name}`,
        description: s.description,
        sides: ['claude'],
        symlink: { claude: false, codex: false, grok: false },
        // G3 equal-footing preview (ADR-0012): the stats and the package root come from the same scan as
        // the bundled component summary (H5)
        pkg: { claude: s.pkg, codex: null, grok: null },
        origin: 'plugin',
        pluginName: p.name,
        pluginRoot: p.installPath,
        pluginSkillName: s.name
      })
    }
  }
  return [...disk, ...fromPlugins.sort((a, b) => a.name.localeCompare(b.name))]
}

// ── MCP ──

const MCP_HEADER = /^\s*\[mcp_servers\.([^\]"]+)\]\s*$/

function readGlobalMcp(roots: ScanRoots, plugins: PluginEntry[]): McpServerEntry[] {
  const out: McpServerEntry[] = []
  // Claude global mcpServers (at the top level of ~/.claude.json)
  try {
    const raw: unknown = JSON.parse(readFileSync(roots.claudeConfigFile, 'utf8'))
    const servers = (raw as Record<string, unknown>)?.['mcpServers']
    if (typeof servers === 'object' && servers !== null) {
      for (const name of Object.keys(servers)) out.push({ name, side: 'claude', source: 'global-config' })
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
        for (const name of Object.keys(servers)) out.push({ name, side: 'claude', source: 'plugin' })
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
        if (m) out.push({ name: m[1], side: 'codex', source: 'config.toml' })
      }
    } catch {
      // Ignore
    }
  }
  return out
}

// ── Read-only configuration ──

/** Emits structured fields only; the renderer assembles the sentence (including quantifiers such as
 * "entries" and "sections") in the current language (ticket 07) */
function summarizeCodexConfig(configFile: string): CodexConfigSummary | null {
  const raw = readTextCapped(configFile)
  if (raw === null) return null
  return {
    model: /^model\s*=\s*"(.+)"\s*$/m.exec(raw)?.[1] ?? null,
    projectCount: raw.split('\n').filter((l) => /^\s*\[projects\."/.test(l)).length,
    mcpCount: raw.split('\n').filter((l) => MCP_HEADER.test(l)).length
  }
}
