// Disk payloads need deeper checks than live IPC's producer-contract checks: a corrupt leaf must not
// become a renderer exception. Keep this additional boundary local to display restoration.
import { AGENT_SIDES } from './validate'
import { isErrorCode } from './errors'

type Check = (v: unknown) => boolean
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str: Check = v => typeof v === 'string'
const num: Check = v => typeof v === 'number' && Number.isFinite(v)
const bool: Check = v => typeof v === 'boolean'
const nullable = (check: Check): Check => v => v === null || check(v)
const list = (check: Check): Check => v => Array.isArray(v) && v.every(check)
const fields = (shape: Record<string, Check>): Check => v => obj(v) && Object.entries(shape).every(([k, check]) => check(v[k]))
const side: Check = v => typeof v === 'string' && AGENT_SIDES.has(v)
const perSide = (check: Check): Check => fields(Object.fromEntries([...AGENT_SIDES].map(s => [s, check])))
const text = fields({ text: str, truncated: bool })
const error = fields({ code: isErrorCode, params: v => obj(v) && Object.values(v).every(x => str(x) || num(x)) })
const pkg = nullable(fields({ files: num, bytes: num }))
const sub = fields({ content: nullable(text), description: nullable(str), tools: nullable(str), model: nullable(str), sandbox: nullable(str), error: nullable(error) })
const memoryFile = fields({ name: str, file: str, mtimeMs: num })
const pluginSkills = list(fields({ name: str, description: nullable(str), pkg }))
const contents = fields({ skills: pluginSkills, agents: list(str), hooks: list(fields({ event: str, matchers: num })), mcp: list(str), missing: bool })
const installs = list(fields({ scope: nullable(str), projectPath: nullable(str), projectMissing: bool, installPath: nullable(str), version: nullable(str) }))
const plugin = fields({ name: str, version: nullable(str), installs, enabled: bool, installPath: nullable(str), contents })
const totals = { input: num, output: num, cacheRead: num, cacheWrite: num, total: num }
export const displayTokensValid: Check = fields({
  rows: list(fields({ day: str, side, projectKey: str, model: str, ...totals })),
  bySide: perSide(fields(totals)),
  byModel: list(fields({ model: str, side, total: num })),
  byDay: list(fields({ day: str, bySide: perSide(num), byProvider: v => obj(v) && Object.values(v).every(num) }))
})
const globalLayer = fields({
  skills: list(fields({ name: str, description: nullable(str), sides: list(side), symlink: perSide(bool), pkg: perSide(pkg),
    origin: v => v === 'disk' || v === 'plugin', pluginName: nullable(str), pluginRoot: nullable(str), pluginSkillName: nullable(str) })),
  subagents: list(fields({ name: str, sides: list(side), description: nullable(str), claude: nullable(sub), codex: nullable(sub), overridesBuiltin: bool })),
  memory: list(fields({ side, projectPath: nullable(str), projectName: nullable(str), hasMain: bool, files: list(memoryFile), lastModified: nullable(num), stale: bool })),
  codexMemoriesEnabled: bool, plugins: list(plugin),
  codexPlugins: list(fields({ name: str, marketplace: str, root: nullable(str), skills: pluginSkills, version: nullable(str), cachedVersions: num })),
  mcp: list(fields({ name: str, side, source: str })), claudeGlobalMd: nullable(text), codexAgentsMd: nullable(text),
  codexConfigSummary: nullable(fields({ model: nullable(str), projectCount: num, mcpCount: num }))
})
export const displaySnapshotValid: Check = fields({
  scannedAt: num, global: globalLayer, tokens: displayTokensValid, archivedDays: list(str),
  sides: perSide(v => obj(v) && bool(v.detected) && (v.error === undefined || error(v.error)))
})
export const displayStatsValid: Check = fields({ tokens: displayTokensValid })
export const displayDetailValid: Check = fields({
  subagents: list(fields({ detail: sub })), plugins: list(plugin),
  stats: nullable(displayStatsValid)
})
