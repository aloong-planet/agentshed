// IPC 边界的快照 schema 校验:主进程发出前与 renderer 收到时各校验一次,
// 契约漂移在边界立刻暴露而非渲染成 undefined。手写结构校验,零依赖。
import type { Snapshot } from './domain'

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
  }
  return { ok: true }
}

/** 主进程出口:同 assertSnapshot,契约破坏直接抛 */
export function assertProjectStats(v: unknown): void {
  const r = validateProjectStats(v)
  if (!r.ok) throw new Error(`项目统计契约校验失败 — ${r.error}`)
}
