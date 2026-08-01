// Claude plugins 读取(spec: subagents-memory-plugin 序列 E/F)。
// 安装记录来自 installed_plugins.json(全量保留,E1);
// 启用态分层:全局页取 user 层(E4),项目视角按 local > project > user 合并(F1),
// 某层文件缺失/损坏即跳过该层降级(F2)。
import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type {
  CodexPluginEntry,
  PluginContents,
  PluginEntry,
  PluginHookSummary,
  PluginInstallRecord,
  ProjectPluginEntry
} from '@shared/domain'
import type { ScanRoots } from './types'
import { fmField, readTextCapped } from './read-utils'

function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  } catch {
    return null // F2:损坏视为该来源缺失
  }
}

/** 某 settings 文件的 enabledPlugins 键;文件缺失/损坏/无该键 → null(该层不参与判定) */
function readEnabledLayer(settingsFile: string): Record<string, unknown> | null {
  const s = readJson(settingsFile)
  const e = s?.['enabledPlugins']
  return typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : null
}

interface InstalledPlugin {
  name: string
  installs: PluginInstallRecord[]
}

function readInstalled(claudeHome: string): InstalledPlugin[] {
  const raw = readJson(join(claudeHome, 'plugins', 'installed_plugins.json'))
  const plugins = raw?.['plugins']
  if (typeof plugins !== 'object' || plugins === null) return []
  const out: InstalledPlugin[] = []
  for (const [name, records] of Object.entries(plugins as Record<string, unknown>)) {
    const installs: PluginInstallRecord[] = (Array.isArray(records) ? records : []).map((r) => {
      const rec = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>
      const str = (k: string): string | null => (typeof rec[k] === 'string' ? (rec[k] as string) : null)
      const projectPath = str('projectPath')
      return {
        scope: str('scope') ?? '(未知)',
        projectPath,
        projectMissing: projectPath !== null && !existsSync(projectPath),
        installPath: str('installPath'),
        version: str('version')
      }
    })
    out.push({ name, installs })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function readClaudePlugins(claudeHome: string): PluginEntry[] {
  const userEnabled = readEnabledLayer(join(claudeHome, 'settings.json'))
  return readInstalled(claudeHome).map(({ name, installs }) => {
    const installPath = installs.find((r) => r.installPath !== null)?.installPath ?? null
    return {
      name,
      version: installs.find((r) => r.version !== null)?.version ?? null,
      installs,
      enabled: userEnabled?.[name] === true,
      installPath,
      contents: readPluginContents(installPath)
    }
  })
}

// ── 内含组件展开(E5-E7) ──

const EMPTY_CONTENTS: PluginContents = { skills: [], agents: [], hooks: [], mcp: [], missing: true }

/** hooks 配置(来自文件或内联 object)→ 事件摘要;形状不合期望时忽略 */
function hookEvents(config: unknown): Map<string, number> {
  const out = new Map<string, number>()
  if (typeof config !== 'object' || config === null) return out
  // 支持 { hooks: {Event: [...]} } 与直接 {Event: [...]} 两种形状
  const rec = config as Record<string, unknown>
  const events = typeof rec['hooks'] === 'object' && rec['hooks'] !== null ? (rec['hooks'] as Record<string, unknown>) : rec
  for (const [event, groups] of Object.entries(events)) {
    if (Array.isArray(groups)) out.set(event, (out.get(event) ?? 0) + groups.length)
  }
  return out
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** manifest 声明的相对路径必须落在包内——包外(../ 等)一律拒绝,堵路径逃逸读取口 */
function insideJoin(root: string, rel: string): string | null {
  const p = resolve(root, rel)
  return p === resolve(root) || p.startsWith(resolve(root) + sep) ? p : null
}

export function readPluginContents(installPath: string | null): PluginContents {
  if (installPath === null || !existsSync(installPath)) return { ...EMPTY_CONTENTS }
  // skills:目录约定 skills/*/SKILL.md;单文件损坏 → 名称保留、描述空(E5)
  const skills: PluginContents['skills'] = []
  const skillsDir = join(installPath, 'skills')
  if (existsSync(skillsDir)) {
    try {
      for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!d.isDirectory() && !d.isSymbolicLink()) continue
        const md = join(skillsDir, d.name, 'SKILL.md')
        if (!existsSync(md)) continue
        skills.push({ name: d.name, description: fmField(readTextCapped(md), 'description') })
      }
    } catch {
      // skills 目录不可读:该类为空
    }
  }
  // agents:目录约定 agents/*.md
  const agents: string[] = []
  const agentsDir = join(installPath, 'agents')
  if (existsSync(agentsDir)) {
    try {
      for (const f of readdirSync(agentsDir)) {
        if (f.endsWith('.md')) agents.push(basename(f, '.md'))
      }
    } catch {
      // 同上
    }
  }
  // hooks:目录约定 hooks/hooks.json + manifest hooks 字段(string/array/内联 object 三形态)合并(E5)
  const merged = new Map<string, number>()
  const addAll = (m: Map<string, number>): void => {
    for (const [ev, n] of m) merged.set(ev, (merged.get(ev) ?? 0) + n)
  }
  addAll(hookEvents(readJsonFile(join(installPath, 'hooks', 'hooks.json'))))
  const manifest = readJsonFile(join(installPath, '.claude-plugin', 'plugin.json')) as Record<
    string,
    unknown
  > | null
  const hooksField = manifest?.['hooks']
  const fromPath = (p: unknown): void => {
    if (typeof p !== 'string') return
    const file = insideJoin(installPath, p)
    if (file !== null) addAll(hookEvents(readJsonFile(file)))
  }
  if (typeof hooksField === 'string') fromPath(hooksField)
  else if (Array.isArray(hooksField)) hooksField.forEach(fromPath)
  else if (typeof hooksField === 'object' && hooksField !== null) addAll(hookEvents(hooksField))
  const hooks: PluginHookSummary[] = [...merged.entries()]
    .map(([event, matchers]) => ({ event, matchers }))
    .sort((a, b) => a.event.localeCompare(b.event))
  // mcp:manifest mcpServers(内联 object 或指向文件的 string)+ 根目录 .mcp.json
  const mcp = new Set<string>()
  const addMcp = (v: unknown): void => {
    if (typeof v === 'string') {
      const file = insideJoin(installPath, v)
      if (file === null) return
      const j = readJsonFile(file) as Record<string, unknown> | null
      addMcp(j?.['mcpServers'] ?? j)
      return
    }
    if (typeof v === 'object' && v !== null) for (const k of Object.keys(v)) mcp.add(k)
  }
  if (manifest?.['mcpServers'] !== undefined) addMcp(manifest['mcpServers'])
  const rootMcp = readJsonFile(join(installPath, '.mcp.json')) as Record<string, unknown> | null
  if (rootMcp) addMcp(rootMcp['mcpServers'] ?? rootMcp)
  return { skills: skills.sort((a, b) => a.name.localeCompare(b.name)), agents: agents.sort(), hooks, mcp: [...mcp].sort(), missing: false }
}

// ── Codex 插件缓存枚举(E8:仅列存在,启用态/展开不建模) ──

/** 单层安全枚举:该层不可读只影响该层,不向同层其他条目逃逸(E10) */
function safeDirents(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

export function readCodexPlugins(codexHome: string): CodexPluginEntry[] {
  const cache = join(codexHome, 'plugins', 'cache')
  if (!existsSync(cache)) return []
  const out: CodexPluginEntry[] = []
  for (const mkt of safeDirents(cache)) {
    if (!mkt.isDirectory()) continue
    for (const plug of safeDirents(join(cache, mkt.name))) {
      if (!plug.isDirectory()) continue
      const versions = safeDirents(join(cache, mkt.name, plug.name))
        .filter((v) => v.isDirectory())
        .map((v) => v.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      if (versions.length === 0) continue
      out.push({
        name: plug.name,
        marketplace: mkt.name,
        version: versions[0],
        cachedVersions: versions.length
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** 项目视角有效启用集:local > project > user,首个提及该插件名的层决定启用态(F1) */
export function readProjectPlugins(roots: ScanRoots, projectPath: string): ProjectPluginEntry[] {
  const layers: Array<{ from: 'local' | 'project' | 'user'; map: Record<string, unknown> | null }> = [
    { from: 'local', map: readEnabledLayer(join(projectPath, '.claude', 'settings.local.json')) },
    { from: 'project', map: readEnabledLayer(join(projectPath, '.claude', 'settings.json')) },
    { from: 'user', map: readEnabledLayer(join(roots.claudeHome, 'settings.json')) }
  ]
  return readInstalled(roots.claudeHome).map(({ name, installs }) => {
    let enabled = false
    let enabledFrom: ProjectPluginEntry['enabledFrom'] = null
    for (const { from, map } of layers) {
      if (map !== null && typeof map[name] === 'boolean') {
        enabled = map[name] === true
        enabledFrom = from
        break
      }
    }
    const installPath = installs.find((r) => r.installPath !== null)?.installPath ?? null
    return {
      name,
      version: installs.find((r) => r.version !== null)?.version ?? null,
      enabled,
      enabledFrom,
      installs,
      contents: readPluginContents(installPath)
    }
  })
}
