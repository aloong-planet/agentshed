// IPC 边界的快照 schema 校验:主进程发出前与 renderer 收到时各校验一次,
// 契约漂移在边界立刻暴露而非渲染成 undefined。手写结构校验,零依赖。
import type { Snapshot } from './domain'
import { ARTIFACT_ORDER } from './domain'

export type ValidateResult = { ok: true } | { ok: false; error: string }

const AGENT_SIDES = new Set(['claude', 'codex'])

function fail(path: string, why: string): ValidateResult {
  return { ok: false, error: `${path}: ${why}` }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function validateSnapshot(v: unknown): ValidateResult {
  if (!isRecord(v)) return fail('$', '不是对象')
  if (typeof v['scannedAt'] !== 'number') return fail('scannedAt', '需为 number')

  const sides = v['sides']
  if (!isRecord(sides)) return fail('sides', '需为对象')
  for (const side of AGENT_SIDES) {
    const s = sides[side]
    if (!isRecord(s)) return fail(`sides.${side}`, '缺失')
    if (typeof s['detected'] !== 'boolean') return fail(`sides.${side}.detected`, '需为 boolean')
    if (s['error'] !== undefined && typeof s['error'] !== 'string')
      return fail(`sides.${side}.error`, '需为 string|undefined')
  }

  const projects = v['projects']
  if (!Array.isArray(projects)) return fail('projects', '需为数组')
  for (let i = 0; i < projects.length; i++) {
    const p: unknown = projects[i]
    const at = `projects[${i}]`
    if (!isRecord(p)) return fail(at, '不是对象')
    if (typeof p['path'] !== 'string' || p['path'] === '') return fail(`${at}.path`, '需为非空 string')
    if (typeof p['name'] !== 'string') return fail(`${at}.name`, '需为 string')
    const ps = p['sides']
    if (!Array.isArray(ps) || ps.length === 0) return fail(`${at}.sides`, '需为非空数组')
    for (const s of ps) {
      if (typeof s !== 'string' || !AGENT_SIDES.has(s)) return fail(`${at}.sides`, `非法 side: ${String(s)}`)
    }
    if (typeof p['stale'] !== 'boolean') return fail(`${at}.stale`, '需为 boolean')
    if (typeof p['hidden'] !== 'boolean') return fail(`${at}.hidden`, '需为 boolean')
    if (p['lastSessionAt'] !== null && typeof p['lastSessionAt'] !== 'number')
      return fail(`${at}.lastSessionAt`, '需为 number|null')
    if (typeof p['sessionCount'] !== 'number') return fail(`${at}.sessionCount`, '需为 number')
  }

  const g = v['global']
  if (!isRecord(g)) return fail('global', '缺失')
  for (const arr of ['skills', 'subagents', 'memory', 'plugins', 'codexPlugins', 'mcp'] as const) {
    if (!Array.isArray(g[arr])) return fail(`global.${arr}`, '需为数组')
  }
  for (const nullable of ['claudeGlobalMd', 'codexAgentsMd', 'codexConfigSummary'] as const) {
    if (g[nullable] !== null && typeof g[nullable] !== 'string')
      return fail(`global.${nullable}`, '需为 string|null')
  }
  if (typeof g['codexMemoriesEnabled'] !== 'boolean')
    return fail('global.codexMemoriesEnabled', '需为 boolean')

  const tk = v['tokens']
  if (!isRecord(tk)) return fail('tokens', '缺失')
  const bySide = tk['bySide']
  if (!isRecord(bySide)) return fail('tokens.bySide', '需为对象')
  for (const side of AGENT_SIDES) {
    const t = bySide[side]
    if (!isRecord(t) || typeof t['total'] !== 'number') return fail(`tokens.bySide.${side}`, '缺失或无 total')
  }
  if (!Array.isArray(tk['byModel']) || !Array.isArray(tk['byDay']))
    return fail('tokens.byModel/byDay', '需为数组')
  if (!Array.isArray(v['archivedDays'])) return fail('archivedDays', '需为数组')
  return { ok: true }
}

/** 主进程出口:校验失败直接抛(契约破坏是编程错误,不静默) */
export function assertSnapshot(v: unknown): asserts v is Snapshot {
  const r = validateSnapshot(v)
  if (!r.ok) throw new Error(`快照契约校验失败 — ${r.error}`)
}

/**
 * 项目详情里的统计块(概览 tab 数据)。**只覆盖 sessions**——getProjectDetail
 * 整条通道此前无边界校验(既有缺口,非本次引入);这里不造大而全的校验器,
 * 只钉住会话元数据:file 是会话的身份,渲染层拿它回请内容,缺失或空串就是
 * 一条读不了的会话,必须在边界暴露而不是渲染成 undefined 再去读 cwd。
 */
export function validateProjectStats(v: unknown): ValidateResult {
  if (!isRecord(v)) return fail('stats', '不是对象')
  const sessions = v['sessions']
  if (!Array.isArray(sessions)) return fail('stats.sessions', '需为数组')
  for (let i = 0; i < sessions.length; i++) {
    const s: unknown = sessions[i]
    const at = `stats.sessions[${i}]`
    if (!isRecord(s)) return fail(at, '不是对象')
    if (typeof s['side'] !== 'string' || !AGENT_SIDES.has(s['side']))
      return fail(`${at}.side`, `非法 side: ${String(s['side'])}`)
    if (typeof s['title'] !== 'string') return fail(`${at}.title`, '需为 string')
    if (s['at'] !== null && typeof s['at'] !== 'number') return fail(`${at}.at`, '需为 number|null')
    if (typeof s['tokens'] !== 'number') return fail(`${at}.tokens`, '需为 number')
    if (typeof s['file'] !== 'string' || s['file'] === '') return fail(`${at}.file`, '需为非空 string')
    if (typeof s['questionCount'] !== 'number') return fail(`${at}.questionCount`, '需为 number')
  }
  return { ok: true }
}

/** 主进程出口:同 assertSnapshot,契约破坏直接抛 */
export function assertProjectStats(v: unknown): void {
  const r = validateProjectStats(v)
  if (!r.ok) throw new Error(`项目统计契约校验失败 — ${r.error}`)
}

// ── 项目详情(getProjectDetail 通道)──
// 快照两端各校验一次,而这条通道此前完全没有校验(preload 里直接 as ProjectDetail),
// 于是任一字段漂移都渲染成 undefined 而不是在边界暴露——现象离原因很远,排查极贵。
//
// **深度取"渲染层无保护读取的字段"**,不是把每片叶子都验一遍:这类校验 fail-closed,
// 一次误拒就是整个详情页打不开,过严比漏验更容易咬人。故枚举、必填标量、可空字段的
// 类型都验;而 PluginContents / SubagentSideDetail 这类只验它在不在、是不是对的容器,
// 内部叶子交给渲染层自己的空值处理(它们本来就按可缺失写的)。

const SKILL_LEVELS = new Set(['project', 'global', 'plugin'])
const SUBAGENT_LEVELS = new Set(['project', 'global'])
const ORIGINS = new Set(['disk', 'plugin'])
const ENABLED_FROM = new Set(['local', 'project', 'user'])
const ARTIFACT_TYPES: ReadonlySet<string> = new Set(ARTIFACT_ORDER)

function str(v: unknown): boolean {
  return typeof v === 'string'
}
function strOrNull(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

/** 数组字段:逐元素跑 check,错误路径带下标 */
function eachOf(
  v: unknown,
  at: string,
  check: (el: Record<string, unknown>, at: string) => ValidateResult | null
): ValidateResult | null {
  if (!Array.isArray(v)) return fail(at, '需为数组')
  for (let i = 0; i < v.length; i++) {
    const el: unknown = v[i]
    const p = `${at}[${i}]`
    if (!isRecord(el)) return fail(p, '不是对象')
    const r = check(el, p)
    if (r) return r
  }
  return null
}

export function validateProjectDetail(v: unknown): ValidateResult {
  if (!isRecord(v)) return fail('detail', '不是对象')
  if (typeof v['path'] !== 'string' || v['path'] === '') return fail('detail.path', '需为非空 string')

  const skills = eachOf(v['skills'], 'detail.skills', (s, at) => {
    if (!str(s['name'])) return fail(`${at}.name`, '需为 string')
    if (!strOrNull(s['description'])) return fail(`${at}.description`, '需为 string|null')
    if (!SKILL_LEVELS.has(s['level'] as string)) return fail(`${at}.level`, `非法 level: ${String(s['level'])}`)
    if (!AGENT_SIDES.has(s['side'] as string)) return fail(`${at}.side`, `非法 side: ${String(s['side'])}`)
    for (const b of ['symlink', 'shadowed', 'shadows', 'coexists'] as const) {
      if (typeof s[b] !== 'boolean') return fail(`${at}.${b}`, '需为 boolean')
    }
    if (!ORIGINS.has(s['origin'] as string)) return fail(`${at}.origin`, `非法 origin: ${String(s['origin'])}`)
    if (!strOrNull(s['pluginName'])) return fail(`${at}.pluginName`, '需为 string|null')
    return null
  })
  if (skills) return skills

  const subagents = eachOf(v['subagents'], 'detail.subagents', (a, at) => {
    if (!str(a['name'])) return fail(`${at}.name`, '需为 string')
    if (!AGENT_SIDES.has(a['side'] as string)) return fail(`${at}.side`, `非法 side: ${String(a['side'])}`)
    if (!SUBAGENT_LEVELS.has(a['level'] as string)) return fail(`${at}.level`, `非法 level: ${String(a['level'])}`)
    if (!strOrNull(a['description'])) return fail(`${at}.description`, '需为 string|null')
    if (!isRecord(a['detail'])) return fail(`${at}.detail`, '需为对象')
    for (const b of ['shadows', 'shadowed', 'overridesBuiltin'] as const) {
      if (typeof a[b] !== 'boolean') return fail(`${at}.${b}`, '需为 boolean')
    }
    return null
  })
  if (subagents) return subagents

  const mem = v['memory']
  if (!isRecord(mem)) return fail('detail.memory', '需为对象')
  if (!strOrNull(mem['main'])) return fail('detail.memory.main', '需为 string|null')
  const topics = eachOf(mem['topics'], 'detail.memory.topics', (t, at) => {
    if (!str(t['name'])) return fail(`${at}.name`, '需为 string')
    if (typeof t['file'] !== 'string' || t['file'] === '') return fail(`${at}.file`, '需为非空 string')
    if (typeof t['mtimeMs'] !== 'number') return fail(`${at}.mtimeMs`, '需为 number')
    return null
  })
  if (topics) return topics

  const plugins = eachOf(v['plugins'], 'detail.plugins', (p, at) => {
    if (!str(p['name'])) return fail(`${at}.name`, '需为 string')
    if (!strOrNull(p['version'])) return fail(`${at}.version`, '需为 string|null')
    if (typeof p['enabled'] !== 'boolean') return fail(`${at}.enabled`, '需为 boolean')
    if (p['enabledFrom'] !== null && !ENABLED_FROM.has(p['enabledFrom'] as string))
      return fail(`${at}.enabledFrom`, `非法 enabledFrom: ${String(p['enabledFrom'])}`)
    if (!Array.isArray(p['installs'])) return fail(`${at}.installs`, '需为数组')
    if (!isRecord(p['contents'])) return fail(`${at}.contents`, '需为对象')
    return null
  })
  if (plugins) return plugins

  const mcp = eachOf(v['mcp'], 'detail.mcp', (m, at) => {
    if (!str(m['name'])) return fail(`${at}.name`, '需为 string')
    if (m['enabled'] !== null && typeof m['enabled'] !== 'boolean')
      return fail(`${at}.enabled`, '需为 boolean|null')
    return null
  })
  if (mcp) return mcp

  const cfg = v['configs']
  if (!isRecord(cfg)) return fail('detail.configs', '需为对象')
  for (const k of ['claudeMd', 'agentsMd', 'settingsSummary'] as const) {
    if (!strOrNull(cfg[k])) return fail(`detail.configs.${k}`, '需为 string|null')
  }

  const artifacts = eachOf(v['artifacts'], 'detail.artifacts', (a, at) => {
    if (!ARTIFACT_TYPES.has(a['type'] as string)) return fail(`${at}.type`, `非法 type: ${String(a['type'])}`)
    if (!str(a['title'])) return fail(`${at}.title`, '需为 string')
    if (typeof a['file'] !== 'string' || a['file'] === '') return fail(`${at}.file`, '需为非空 string')
    if (typeof a['mtimeMs'] !== 'number') return fail(`${at}.mtimeMs`, '需为 number')
    return null
  })
  if (artifacts) return artifacts

  // stats 复用既有校验器,不另起一套会话口径
  if (v['stats'] !== null) {
    const r = validateProjectStats(v['stats'])
    if (!r.ok) return r
  }
  return { ok: true }
}

/** 主进程出口:同 assertSnapshot,契约破坏直接抛 */
export function assertProjectDetail(v: unknown): void {
  const r = validateProjectDetail(v)
  if (!r.ok) throw new Error(`项目详情契约校验失败 — ${r.error}`)
}
