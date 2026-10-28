// Reading Claude plugins (spec: subagents-memory-plugin, sequences E/F).
// Installation records come from installed_plugins.json (all kept, E1);
// enablement is layered: the global page reads the user layer (E4) and a project's viewpoint merges
// local > project > user (F1),
// with a missing or corrupt file at one layer skipping that layer (F2).
import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type {
  AntigravityPluginEntry,
  CodexPluginEntry,
  PluginContents,
  PluginEntry,
  PluginHookSummary,
  PluginInstallRecord,
  PluginSkillSummary,
  ProjectPluginEntry
} from '@shared/domain'
import { antigravityConfigDir, type ScanRoots } from './types'
import { fmField, fmValue, frontMatter, readTextCapped } from './read-utils'
import { statSkillPackage } from './skill-package'

function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  } catch {
    return null // F2: corruption counts as that source being absent
  }
}

/** A settings file's enabledPlugins key; a missing or corrupt file, or no such key → null (that layer
 * takes no part in the judgement) */
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
      const str = (k: string): string | null => (typeof rec[k] === 'string' ? rec[k] : null)
      const projectPath = str('projectPath')
      return {
        scope: str('scope') ?? null,
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

// ── Expanding bundled components (E5–E7) ──

const EMPTY_CONTENTS: PluginContents = { skills: [], agents: [], hooks: [], mcp: [], missing: true }

/** A hooks configuration (from a file or an inline object) → an event summary; ignored when the shape is
 * not as expected */
function hookEvents(config: unknown): Map<string, number> {
  const out = new Map<string, number>()
  if (typeof config !== 'object' || config === null) return out
  // Both { hooks: {Event: [...]} } and a bare {Event: [...]} shape are supported
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

/** A manifest-declared relative path must land inside the package — anything outside (`../` and so on)
 * is refused, closing the path escape read hole */
function insideJoin(root: string, rel: string): string | null {
  const p = resolve(root, rel)
  return p === resolve(root) || p.startsWith(resolve(root) + sep) ? p : null
}

/** Enumerate the skills directory convention under a package root (isomorphic for Claude and Codex, E8),
 * with stat-only package stats (H1) */
function pluginSkillSummaries(installPath: string): PluginSkillSummary[] {
  const skills: PluginSkillSummary[] = []
  const skillsDir = join(installPath, 'skills')
  if (!existsSync(skillsDir)) return skills
  try {
    for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!d.isDirectory() && !d.isSymbolicLink()) continue
      const md = join(skillsDir, d.name, 'SKILL.md')
      if (!existsSync(md)) continue
      skills.push({
        name: d.name,
        description: fmField(readTextCapped(md), 'description'),
        pkg: statSkillPackage(join(skillsDir, d.name))
      })
    }
  } catch {
    // The skills directory cannot be read: this category is empty
  }
  return skills
}

export function readPluginContents(installPath: string | null): PluginContents {
  if (installPath === null || !existsSync(installPath)) return { ...EMPTY_CONTENTS }
  // skills: the directory convention skills/*/SKILL.md; one corrupt file → the name is kept with an empty
  // description (E5)
  const skills = pluginSkillSummaries(installPath)
  // agents: the directory convention agents/*.md
  const agents: string[] = []
  const agentsDir = join(installPath, 'agents')
  if (existsSync(agentsDir)) {
    try {
      for (const f of readdirSync(agentsDir)) {
        if (f.endsWith('.md')) agents.push(basename(f, '.md'))
      }
    } catch {
      // As above
    }
  }
  // hooks: the directory convention hooks/hooks.json merged with the manifest hooks field (in string,
  // array or inline object form) (E5)
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
  // mcp: the manifest mcpServers (an inline object or a string pointing at a file) plus the root .mcp.json
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

// ── Enumerating the Codex plugin cache (E8: existence only; enablement and expansion are not modelled) ──

/** Safe enumeration of one layer: an unreadable layer affects only itself and does not escape sideways to
 * the other entries in it (E10) */
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
      const root = join(cache, mkt.name, plug.name, versions[0])
      out.push({
        name: plug.name,
        marketplace: mkt.name,
        root,
        skills: pluginSkillSummaries(root),
        version: versions[0],
        cachedVersions: versions.length
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Antigravity CLI plugins (plugins-view::REQ-001; shapes measured 2026-10-28 with agy's official `flutter` plugin) ──

/** An MCP configuration file's servers, by name, with the flag agy reads to keep one from starting. A missing file, one
 * that does not parse (agy's own global file can be 0 bytes), or one without an object of servers lists none */
export function readMcpConfigServers(file: string): Array<{ name: string; disabled: boolean }> {
  const servers = readJson(file)?.['mcpServers']
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return []
  return Object.entries(servers as Record<string, unknown>).map(([name, s]) => ({
    name,
    disabled: typeof s === 'object' && s !== null && (s as Record<string, unknown>)['disabled'] === true
  }))
}

/** The name agy gives a Markdown agent definition: its front matter `name`, else the file's (or directory's) name
 * (subagents-view::REQ-001/AC-02) */
export function agyDefinitionName(text: string | null, fallback: string): string {
  return fmValue(frontMatter(text), 'name') ?? fallback
}

/** A plugin's bundled pieces as agy loads them: `skills/<name>/SKILL.md`, `agents/*.md` (named as agy names them) and
 * the servers of its `mcp_config.json` (`<plugin>_<server>`). Its rules are shown nowhere (ADR-0037) and its hooks have
 * no sample, so neither is a category; workspace plugins are not read (AC-03, AC-05) */
function readAntigravityPluginContents(root: string, plugin: string): PluginContents {
  const agents: string[] = []
  for (const d of safeDirents(join(root, 'agents'))) {
    if (!d.name.endsWith('.md') || d.name.startsWith('.')) continue
    const file = join(root, 'agents', d.name)
    // Through a symbolic link as well, as the global agents directories are read (subagents.ts)
    try {
      if (!statSync(file).isFile()) continue
    } catch {
      continue
    }
    agents.push(agyDefinitionName(readTextCapped(file), basename(d.name, '.md')))
  }
  return {
    skills: pluginSkillSummaries(root).sort((a, b) => a.name.localeCompare(b.name)),
    agents: agents.sort(),
    hooks: [],
    mcp: readMcpConfigServers(join(root, 'mcp_config.json')).map((s) => `${plugin}_${s.name}`).sort(),
    missing: false
  }
}

/**
 * Antigravity CLI's plugins: every directory under `~/.gemini/config/plugins/`, each with the version its top-level
 * plugin.json gives (none when that cannot be read — the plugin keeps its directory name, the others are unaffected)
 * and the record agy's shared configuration keeps of it. Enablement (AC-02): no enabled key — a fresh install writes
 * none — is enabled, an explicit false disabled; a configuration file that is missing or does not parse is skipped, so
 * every plugin reads as having no key (F2's fall-through).
 */
export function readAntigravityPlugins(roots: ScanRoots): AntigravityPluginEntry[] {
  const config = antigravityConfigDir(roots)
  const recorded = readJson(join(config, 'config.json'))?.['plugins']
  const records = typeof recorded === 'object' && recorded !== null ? (recorded as Record<string, unknown>) : {}
  const dir = join(config, 'plugins')
  const out: AntigravityPluginEntry[] = []
  for (const d of safeDirents(dir)) {
    if (d.name.startsWith('.')) continue
    const root = join(dir, d.name)
    try {
      if (!statSync(root).isDirectory()) continue
    } catch {
      continue
    }
    const record = records[d.name]
    const rec = typeof record === 'object' && record !== null ? (record as Record<string, unknown>) : {}
    const from = rec['installedFrom']
    const marketplace = typeof from === 'object' && from !== null ? (from as Record<string, unknown>)['marketplace'] : null
    const version = readJson(join(root, 'plugin.json'))?.['version']
    out.push({
      name: d.name,
      version: typeof version === 'string' ? version : null,
      marketplace: typeof marketplace === 'string' ? marketplace : null,
      enabled: rec['enabled'] !== false,
      root,
      contents: readAntigravityPluginContents(root, d.name)
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** The effective enabled set from a project's viewpoint: local > project > user, with the first layer
 * mentioning the plugin name deciding its enablement (F1) */
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
      installPath,
      enabled,
      enabledFrom,
      installs,
      contents: readPluginContents(installPath)
    }
  })
}
