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
      return fail(`sides.${side}.error`, '需为 string|undefined`')
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
  return { ok: true }
}

/** 主进程出口:校验失败直接抛(契约破坏是编程错误,不静默) */
export function assertSnapshot(v: unknown): asserts v is Snapshot {
  const r = validateSnapshot(v)
  if (!r.ok) throw new Error(`快照契约校验失败 — ${r.error}`)
}
