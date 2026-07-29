// Agents 全局层读取(票07):全局 skills(合并/软链/差异)、plugins、全局 MCP、配置只读。
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSide, GlobalLayer, GlobalSkill, McpServerEntry, PluginEntry } from '@shared/domain'
import type { ScanRoots } from './types'

const MAX_CONFIG_BYTES = 200_000

export function readGlobalLayer(roots: ScanRoots): GlobalLayer {
  return {
    skills: readGlobalSkills(roots),
    plugins: readClaudePlugins(roots.claudeHome),
    mcp: readGlobalMcp(roots),
    claudeGlobalMd: readTextCapped(join(roots.claudeHome, 'CLAUDE.md')),
    codexAgentsMd: readTextCapped(join(roots.codexHome, 'AGENTS.md')),
    codexConfigSummary: summarizeCodexConfig(join(roots.codexHome, 'config.toml'))
  }
}

// ── skills ──

interface SideSkill {
  description: string | null
  symlink: boolean
  content: string | null
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
    let symlink = false
    try {
      symlink = lstatSync(p).isSymbolicLink()
    } catch {
      continue
    }
    const skillMd = join(p, 'SKILL.md')
    if (!existsSync(skillMd)) continue // 非 skill 目录(如散文件)跳过
    const content = readTextCapped(skillMd)
    out.set(e.name, { description: extractDescription(content), symlink, content })
  }
  return out
}

function extractDescription(content: string | null): string | null {
  if (!content) return null
  const m = /^description:\s*["']?(.+?)["']?\s*$/m.exec(content)
  return m ? m[1] : null
}

function readGlobalSkills(roots: ScanRoots): GlobalSkill[] {
  const claude = readSkillDir(join(roots.claudeHome, 'skills'))
  const codex = readSkillDir(roots.agentsSkillsDir)
  const names = [...new Set([...claude.keys(), ...codex.keys()])].sort()
  return names.map((name) => {
    const cl = claude.get(name)
    const cx = codex.get(name)
    const sides: AgentSide[] = []
    if (cl) sides.push('claude')
    if (cx) sides.push('codex')
    return {
      name,
      description: cl?.description ?? cx?.description ?? null,
      sides,
      symlink: { claude: cl?.symlink ?? false, codex: cx?.symlink ?? false },
      differs: Boolean(cl && cx && cl.content !== cx.content)
    }
  })
}

// ── plugins ──

function readClaudePlugins(claudeHome: string): PluginEntry[] {
  const file = join(claudeHome, 'plugins', 'installed_plugins.json')
  if (!existsSync(file)) return []
  let enabled: Record<string, unknown> = {}
  try {
    const settings: unknown = JSON.parse(readFileSync(join(claudeHome, 'settings.json'), 'utf8'))
    const e = (settings as Record<string, unknown>)?.['enabledPlugins']
    if (typeof e === 'object' && e !== null) enabled = e as Record<string, unknown>
  } catch {
    // settings 缺失/损坏:全部视为未启用
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const plugins = (raw as Record<string, unknown>)?.['plugins']
    if (typeof plugins !== 'object' || plugins === null) return []
    const out: PluginEntry[] = []
    for (const [name, installs] of Object.entries(plugins as Record<string, unknown>)) {
      const first = Array.isArray(installs) ? (installs[0] as Record<string, unknown>) : undefined
      out.push({
        name,
        version: typeof first?.['version'] === 'string' ? (first['version'] as string) : null,
        scope: typeof first?.['scope'] === 'string' ? (first['scope'] as string) : null,
        enabled: enabled[name] === true,
        installPath: typeof first?.['installPath'] === 'string' ? (first['installPath'] as string) : null
      })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

// ── MCP ──

const MCP_HEADER = /^\s*\[mcp_servers\.([^\]"]+)\]\s*$/

function readGlobalMcp(roots: ScanRoots): McpServerEntry[] {
  const out: McpServerEntry[] = []
  // Claude 全局 mcpServers(~/.claude.json 顶层)
  try {
    const raw: unknown = JSON.parse(readFileSync(roots.claudeConfigFile, 'utf8'))
    const servers = (raw as Record<string, unknown>)?.['mcpServers']
    if (typeof servers === 'object' && servers !== null) {
      for (const name of Object.keys(servers)) out.push({ name, side: 'claude', source: 'global-config' })
    }
  } catch {
    // 注册表缺失/损坏:该来源为空
  }
  // plugin 自带(installPath/.claude-plugin/plugin.json 的 mcpServers)
  for (const plugin of readClaudePlugins(roots.claudeHome)) {
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
      // 插件无 plugin.json 或不含 mcpServers:跳过
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
      // 忽略
    }
  }
  return out
}

// ── 配置只读 ──

function readTextCapped(file: string): string | null {
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8')
    return raw.length > MAX_CONFIG_BYTES ? `${raw.slice(0, MAX_CONFIG_BYTES)}\n…(已截断)` : raw
  } catch {
    return null
  }
}

function summarizeCodexConfig(configFile: string): string | null {
  const raw = readTextCapped(configFile)
  if (raw === null) return null
  const model = /^model\s*=\s*"(.+)"\s*$/m.exec(raw)?.[1] ?? '未设置'
  const projectCount = raw.split('\n').filter((l) => /^\s*\[projects\."/.test(l)).length
  const mcpCount = raw.split('\n').filter((l) => MCP_HEADER.test(l)).length
  return `model = ${model}\nprojects: ${projectCount} 条\nmcp_servers: ${mcpCount} 段`
}
