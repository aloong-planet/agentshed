// Agents 全局层读取(票07):全局 skills(合并/软链)、plugins、全局 MCP、配置只读。
// skills-view:已拆除跨侧 content diff(differs)。
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSide, GlobalLayer, GlobalSkill, McpServerEntry, PluginEntry } from '@shared/domain'
import type { ScanRoots } from './types'
import { readGlobalSubagents } from './subagents'
import { readClaudePlugins, readCodexPlugins } from './plugins'
import { readCodexMemoriesEnabled } from './memory'
import { fmField, readTextCapped } from './read-utils'

export function readGlobalLayer(roots: ScanRoots): GlobalLayer {
  // plugins 只读一次,skills 并入与 MCP 来源都消费它(review-code 重构项 #1:去 3 次重复扫描)
  const plugins = readClaudePlugins(roots.claudeHome)
  return {
    skills: readGlobalSkills(roots, plugins),
    subagents: readGlobalSubagents(roots),
    memory: [], // 依赖项目注册表,由 scan 在 projects 之后填充(见 scan.ts)
    codexMemoriesEnabled: readCodexMemoriesEnabled(roots.codexHome),
    plugins,
    codexPlugins: readCodexPlugins(roots.codexHome),
    mcp: readGlobalMcp(roots, plugins),
    claudeGlobalMd: readTextCapped(join(roots.claudeHome, 'CLAUDE.md')),
    codexAgentsMd: readTextCapped(join(roots.codexHome, 'AGENTS.md')),
    codexConfigSummary: summarizeCodexConfig(join(roots.codexHome, 'config.toml'))
  }
}

// ── skills ──

interface SideSkill {
  description: string | null
  symlink: boolean
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
    // 只读 frontmatter description;正文按需读(skills-view),不再为跨侧 diff 保全文
    const content = readTextCapped(skillMd)
    out.set(e.name, { description: fmField(content, 'description'), symlink })
  }
  return out
}

function readGlobalSkills(roots: ScanRoots, plugins: PluginEntry[]): GlobalSkill[] {
  const claude = readSkillDir(join(roots.claudeHome, 'skills'))
  const codex = readSkillDir(roots.agentsSkillsDir)
  const names = [...new Set([...claude.keys(), ...codex.keys()])].sort()
  const disk: GlobalSkill[] = names.map((name) => {
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
      origin: 'disk',
      pluginName: null
    }
  })
  // G1(全局页口径):user 层启用插件的内含 skills 并入——命名空间条目,不参与遮蔽(G2)
  const fromPlugins: GlobalSkill[] = []
  for (const p of plugins) {
    if (!p.enabled || p.contents.missing) continue
    const ns = p.name.split('@')[0]
    for (const s of p.contents.skills) {
      fromPlugins.push({
        name: `${ns}:${s.name}`,
        description: s.description,
        sides: ['claude'],
        symlink: { claude: false, codex: false },
        origin: 'plugin',
        pluginName: p.name
      })
    }
  }
  return [...disk, ...fromPlugins.sort((a, b) => a.name.localeCompare(b.name))]
}

// ── MCP ──

const MCP_HEADER = /^\s*\[mcp_servers\.([^\]"]+)\]\s*$/

function readGlobalMcp(roots: ScanRoots, plugins: PluginEntry[]): McpServerEntry[] {
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

function summarizeCodexConfig(configFile: string): string | null {
  const raw = readTextCapped(configFile)
  if (raw === null) return null
  const model = /^model\s*=\s*"(.+)"\s*$/m.exec(raw)?.[1] ?? '未设置'
  const projectCount = raw.split('\n').filter((l) => /^\s*\[projects\."/.test(l)).length
  const mcpCount = raw.split('\n').filter((l) => MCP_HEADER.test(l)).length
  return `model = ${model}\nprojects: ${projectCount} 条\nmcp_servers: ${mcpCount} 段`
}
