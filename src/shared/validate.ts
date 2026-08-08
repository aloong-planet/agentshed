// IPC 边界的快照 schema 校验:主进程发出前与 renderer 收到时各校验一次,
// 契约漂移在边界立刻暴露而非渲染成 undefined。手写结构校验,零依赖。
import type { Snapshot } from './domain'
import { ERR, appError } from './errors'
import { ARTIFACT_ORDER } from './domain'

/**
 * 校验失败以**结构化**形式返回,不含自然语言(ADR-0015 扩到契约层)。
 * 措辞由 renderer 按当前语言生成——校验原因会经错误消息冒到界面,
 * 保留中文原文等于故障时向非中文用户暴露源语言。
 */
export type ValidateFailure =
  | { kind: 'missing'; path: string }
  /** expect 是**类型记法**(`string|null` / `array` / `object`),语言无关、不翻译 */
  | { kind: 'type'; path: string; expect: string }
  /** 枚举字段收到取值域外的值;value 是实际收到的东西 */
  | { kind: 'enum'; path: string; value: string }

export type ValidateResult = { ok: true } | { ok: false; failure: ValidateFailure }

const AGENT_SIDES = new Set(['claude', 'codex'])

const failMissing = (path: string): ValidateResult => ({ ok: false, failure: { kind: 'missing', path } })
const failType = (path: string, expect: string): ValidateResult => ({
  ok: false,
  failure: { kind: 'type', path, expect }
})
const failEnum = (path: string, value: string): ValidateResult => ({
  ok: false,
  failure: { kind: 'enum', path, value }
})

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function validateSnapshot(v: unknown): ValidateResult {
  if (!isRecord(v)) return failType('$', 'object')
  if (typeof v['scannedAt'] !== 'number') return failType('scannedAt', 'number')

  const sides = v['sides']
  if (!isRecord(sides)) return failType('sides', 'object')
  for (const side of AGENT_SIDES) {
    const s = sides[side]
    if (!isRecord(s)) return failMissing(`sides.${side}`)
    if (typeof s['detected'] !== 'boolean') return failType(`sides.${side}.detected`, 'boolean')
    if (s['error'] !== undefined && typeof s['error'] !== 'string')
      return failType(`sides.${side}.error`, 'string|undefined')
  }

  const projects = v['projects']
  if (!Array.isArray(projects)) return failType('projects', 'array')
  for (let i = 0; i < projects.length; i++) {
    const p: unknown = projects[i]
    const at = `projects[${i}]`
    if (!isRecord(p)) return failType(at, 'object')
    if (typeof p['path'] !== 'string' || p['path'] === '') return failType(`${at}.path`, 'string(non-empty)')
    if (typeof p['name'] !== 'string') return failType(`${at}.name`, 'string')
    const ps = p['sides']
    if (!Array.isArray(ps) || ps.length === 0) return failType(`${at}.sides`, 'array(>=1)')
    for (const s of ps) {
      if (typeof s !== 'string' || !AGENT_SIDES.has(s)) return failEnum(`${at}.sides`, String(s))
    }
    if (typeof p['stale'] !== 'boolean') return failType(`${at}.stale`, 'boolean')
    if (typeof p['hidden'] !== 'boolean') return failType(`${at}.hidden`, 'boolean')
    if (p['lastSessionAt'] !== null && typeof p['lastSessionAt'] !== 'number')
      return failType(`${at}.lastSessionAt`, 'number|null')
    if (typeof p['sessionCount'] !== 'number') return failType(`${at}.sessionCount`, 'number')
  }

  const g = v['global']
  if (!isRecord(g)) return failMissing('global')
  for (const arr of ['skills', 'subagents', 'memory', 'plugins', 'codexPlugins', 'mcp'] as const) {
    if (!Array.isArray(g[arr])) return failType(`global.${arr}`, 'array')
  }
  for (const nullable of ['claudeGlobalMd', 'codexAgentsMd', 'codexConfigSummary'] as const) {
    if (g[nullable] !== null && typeof g[nullable] !== 'string')
      return failType(`global.${nullable}`, 'string|null')
  }
  if (typeof g['codexMemoriesEnabled'] !== 'boolean')
    return failType('global.codexMemoriesEnabled', 'boolean')

  const tk = v['tokens']
  if (!isRecord(tk)) return failMissing('tokens')
  const bySide = tk['bySide']
  if (!isRecord(bySide)) return failType('tokens.bySide', 'object')
  for (const side of AGENT_SIDES) {
    const t = bySide[side]
    if (!isRecord(t) || typeof t['total'] !== 'number') return failType(`tokens.bySide.${side}` + '.total', 'number')
  }
  if (!Array.isArray(tk['byModel']) || !Array.isArray(tk['byDay']))
    return failType('tokens.byModel/byDay', 'array')
  if (!Array.isArray(v['archivedDays'])) return failType('archivedDays', 'array')
  return { ok: true }
}

/** 主进程出口:校验失败直接抛(契约破坏是编程错误,不静默) */

/**
 * 校验失败 → 结构化错误。载荷名并进 path 前缀(`snapshot.sessions[0].file`),
 * 这样措辞只需一个泛称"载荷",不必为六种载荷各配一套名词,而定位信息一点没少。
 */
export function contractError(payload: string, f: ValidateFailure): Error {
  const path = `${payload}.${f.path}`
  if (f.kind === 'missing') return appError(ERR.contractMissing, { path })
  if (f.kind === 'type') return appError(ERR.contractType, { path, expect: f.expect })
  return appError(ERR.contractEnum, { path, value: f.value })
}

export function assertSnapshot(v: unknown): asserts v is Snapshot {
  const r = validateSnapshot(v)
  if (!r.ok) throw contractError('snapshot', r.failure)
}

/**
 * 项目详情里的统计块(概览 tab 数据)。**只覆盖 sessions**——getProjectDetail
 * 整条通道此前无边界校验(既有缺口,非本次引入);这里不造大而全的校验器,
 * 只钉住会话元数据:file 是会话的身份,渲染层拿它回请内容,缺失或空串就是
 * 一条读不了的会话,必须在边界暴露而不是渲染成 undefined 再去读 cwd。
 */
const FORK_STATES = new Set(['none', 'stripped', 'uncertain'])

// ── 会话页(getSessionPage 通道,票 04)──
// 与快照/详情同规矩:主进程出口 assert 一次,preload 入口再校验一次。
export function validateSessionPage(v: unknown): ValidateResult {
  if (!isRecord(v)) return failType('page', 'object')
  if (typeof v['file'] !== 'string' || v['file'] === '') return failType('page.file', 'string(non-empty)')
  if (typeof v['side'] !== 'string' || !AGENT_SIDES.has(v['side']))
    return failEnum('page.side', String(v['side']))
  if (typeof v['title'] !== 'string') return failType('page.title', 'string')
  if (v['at'] !== null && typeof v['at'] !== 'number') return failType('page.at', 'number|null')
  if (typeof v['tokens'] !== 'number') return failType('page.tokens', 'number')
  if (typeof v['bytes'] !== 'number') return failType('page.bytes', 'number')
  if (typeof v['forkState'] !== 'string' || !FORK_STATES.has(v['forkState']))
    return failEnum('page.forkState', String(v['forkState']))
  if (typeof v['forkPoints'] !== 'number') return failType('page.forkPoints', 'number')
  if (v['forkParentTitle'] !== null && typeof v['forkParentTitle'] !== 'string')
    return failType('page.forkParentTitle', 'string|null')
  if (v['forkParentFile'] !== null && typeof v['forkParentFile'] !== 'string')
    return failType('page.forkParentFile', 'string|null')
  const qs = v['questions']
  if (!Array.isArray(qs)) return failType('page.questions', 'array')
  for (let i = 0; i < qs.length; i++) {
    const q: unknown = qs[i]
    const at = `page.questions[${i}]`
    if (!isRecord(q)) return failType(at, 'object')
    if (typeof q['i'] !== 'number') return failType(`${at}.i`, 'number')
    if (typeof q['text'] !== 'string') return failType(`${at}.text`, 'string')
    if (q['at'] !== null && typeof q['at'] !== 'number') return failType(`${at}.at`, 'number|null')
    if (typeof q['tools'] !== 'number') return failType(`${at}.tools`, 'number')
    if (typeof q['subagents'] !== 'number') return failType(`${at}.subagents`, 'number')
  }
  return { ok: true }
}

/** 主进程出口:契约破坏直接抛(与 assertSnapshot 同风格) */
export function assertSessionPage(v: unknown): void {
  const r = validateSessionPage(v)
  if (!r.ok) throw contractError('sessionPage', r.failure)
}

// ── 单轮取回(getSessionTurn 通道,票 05 立,票 07 扩全)──
// kind 白名单校验:未知 kind 在边界拒收——新增块类型必须先过契约
const SUB_STEP_KINDS = new Set(['text', 'tool'])

function validateTurnBlock(b: Record<string, unknown>, at: string): ValidateResult {
  const kind = b['kind']
  // unknown 是聚合块无时间;其余 kind 一律要求 at: number|null
  if (kind !== 'unknown' && b['at'] !== null && typeof b['at'] !== 'number')
    return failType(`${at}.at`, 'number|null')
  switch (kind) {
    case 'text':
      if (b['role'] !== 'assistant') return failEnum(`${at}.role`, String(b['role']))
      if (typeof b['body'] !== 'string') return failType(`${at}.body`, 'string')
      return { ok: true }
    case 'think':
      if (typeof b['body'] !== 'string') return failType(`${at}.body`, 'string')
      return { ok: true }
    case 'reason': {
      const t = b['titles']
      if (!Array.isArray(t) || t.some((x) => typeof x !== 'string')) return failType(`${at}.titles`, 'string[]')
      return { ok: true }
    }
    case 'tool':
      if (typeof b['name'] !== 'string') return failType(`${at}.name`, 'string')
      if (typeof b['summary'] !== 'string') return failType(`${at}.summary`, 'string')
      if (typeof b['input'] !== 'string') return failType(`${at}.input`, 'string')
      if (b['output'] !== null && typeof b['output'] !== 'string') return failType(`${at}.output`, 'string|null')
      if (typeof b['truncated'] !== 'boolean') return failType(`${at}.truncated`, 'boolean')
      return { ok: true }
    case 'sub': {
      if (typeof b['name'] !== 'string') return failType(`${at}.name`, 'string')
      if (typeof b['prompt'] !== 'string') return failType(`${at}.prompt`, 'string')
      if (b['result'] !== null && typeof b['result'] !== 'string') return failType(`${at}.result`, 'string|null')
      if (typeof b['unlinked'] !== 'boolean') return failType(`${at}.unlinked`, 'boolean')
      const steps = b['steps']
      if (!Array.isArray(steps)) return failType(`${at}.steps`, 'array')
      for (let j = 0; j < steps.length; j++) {
        const s: unknown = steps[j]
        if (!isRecord(s)) return failType(`${at}.steps[${j}]`, 'object')
        if (typeof s['kind'] !== 'string' || !SUB_STEP_KINDS.has(s['kind']))
          return failEnum(`${at}.steps[${j}].kind`, String(s['kind']))
        if (typeof s['label'] !== 'string') return failType(`${at}.steps[${j}].label`, 'string')
      }
      return { ok: true }
    }
    case 'unknown': {
      if (typeof b['count'] !== 'number') return failType(`${at}.count`, 'number')
      const t = b['types']
      if (!Array.isArray(t) || t.some((x) => typeof x !== 'string')) return failType(`${at}.types`, 'string[]')
      return { ok: true }
    }
    default:
      return failEnum(`${at}.kind`, String(kind))
  }
}

export function validateSessionTurn(v: unknown): ValidateResult {
  if (!isRecord(v)) return failType('turn', 'object')
  if (typeof v['bytesRead'] !== 'number') return failType('turn.bytesRead', 'number')
  const blocks = v['blocks']
  if (!Array.isArray(blocks)) return failType('turn.blocks', 'array')
  for (let i = 0; i < blocks.length; i++) {
    const b: unknown = blocks[i]
    const at = `turn.blocks[${i}]`
    if (!isRecord(b)) return failType(at, 'object')
    const r = validateTurnBlock(b, at)
    if (!r.ok) return r
  }
  return { ok: true }
}

/** 主进程出口:同 assertSnapshot,契约破坏直接抛 */
export function assertSessionTurn(v: unknown): void {
  const r = validateSessionTurn(v)
  if (!r.ok) throw contractError('sessionTurn', r.failure)
}

// ── 搜索载荷(searchSessions 通道,票 08)──
export function validateSearchResult(v: unknown): ValidateResult {
  if (!isRecord(v)) return failType('search', 'object')
  for (const k of ['totalHits', 'sessionCount', 'folded'] as const) {
    if (typeof v[k] !== 'number') return failType(`search.${k}`, 'number')
  }
  const groups = v['groups']
  if (!Array.isArray(groups)) return failType('search.groups', 'array')
  for (let g = 0; g < groups.length; g++) {
    const grp: unknown = groups[g]
    const at = `search.groups[${g}]`
    if (!isRecord(grp)) return failType(at, 'object')
    if (typeof grp['file'] !== 'string' || grp['file'] === '') return failType(`${at}.file`, 'string(non-empty)')
    if (typeof grp['title'] !== 'string') return failType(`${at}.title`, 'string')
    if (typeof grp['side'] !== 'string' || !AGENT_SIDES.has(grp['side']))
      return failEnum(`${at}.side`, String(grp['side']))
    if (typeof grp['forkState'] !== 'string' || !FORK_STATES.has(grp['forkState']))
      return failEnum(`${at}.forkState`, String(grp['forkState']))
    if (grp['at'] !== null && typeof grp['at'] !== 'number') return failType(`${at}.at`, 'number|null')
    const hits = grp['hits']
    if (!Array.isArray(hits)) return failType(`${at}.hits`, 'array')
    for (let h = 0; h < hits.length; h++) {
      const hit: unknown = hits[h]
      const hat = `${at}.hits[${h}]`
      if (!isRecord(hit)) return failType(hat, 'object')
      if (typeof hit['i'] !== 'number') return failType(`${hat}.i`, 'number')
      if (typeof hit['text'] !== 'string') return failType(`${hat}.text`, 'string')
      if (hit['at'] !== null && typeof hit['at'] !== 'number') return failType(`${hat}.at`, 'number|null')
      if (typeof hit['inBody'] !== 'boolean') return failType(`${hat}.inBody`, 'boolean')
      if (hit['snippet'] !== null && typeof hit['snippet'] !== 'string')
        return failType(`${hat}.snippet`, 'string|null')
    }
  }
  return { ok: true }
}

/** 主进程出口:同 assertSnapshot,契约破坏直接抛 */
export function assertSearchResult(v: unknown): void {
  const r = validateSearchResult(v)
  if (!r.ok) throw contractError('searchResult', r.failure)
}

export function validateProjectStats(v: unknown): ValidateResult {
  if (!isRecord(v)) return failType('stats', 'object')
  const sessions = v['sessions']
  if (!Array.isArray(sessions)) return failType('stats.sessions', 'array')
  for (let i = 0; i < sessions.length; i++) {
    const s: unknown = sessions[i]
    const at = `stats.sessions[${i}]`
    if (!isRecord(s)) return failType(at, 'object')
    if (typeof s['side'] !== 'string' || !AGENT_SIDES.has(s['side']))
      return failEnum(`${at}.side`, String(s['side']))
    if (typeof s['title'] !== 'string') return failType(`${at}.title`, 'string')
    if (s['at'] !== null && typeof s['at'] !== 'number') return failType(`${at}.at`, 'number|null')
    if (typeof s['tokens'] !== 'number') return failType(`${at}.tokens`, 'number')
    if (typeof s['file'] !== 'string' || s['file'] === '') return failType(`${at}.file`, 'string(non-empty)')
    if (typeof s['questionCount'] !== 'number') return failType(`${at}.questionCount`, 'number')
    if (typeof s['forkState'] !== 'string' || !FORK_STATES.has(s['forkState']))
      return failEnum(`${at}.forkState`, String(s['forkState']))
  }
  return { ok: true }
}

/** 主进程出口:同 assertSnapshot,契约破坏直接抛 */
export function assertProjectStats(v: unknown): void {
  const r = validateProjectStats(v)
  if (!r.ok) throw contractError('projectStats', r.failure)
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
  if (!Array.isArray(v)) return failType(at, 'array')
  for (let i = 0; i < v.length; i++) {
    const el: unknown = v[i]
    const p = `${at}[${i}]`
    if (!isRecord(el)) return failType(p, 'object')
    const r = check(el, p)
    if (r) return r
  }
  return null
}

export function validateProjectDetail(v: unknown): ValidateResult {
  if (!isRecord(v)) return failType('detail', 'object')
  if (typeof v['path'] !== 'string' || v['path'] === '') return failType('detail.path', 'string(non-empty)')

  const skills = eachOf(v['skills'], 'detail.skills', (s, at) => {
    if (!str(s['name'])) return failType(`${at}.name`, 'string')
    if (!strOrNull(s['description'])) return failType(`${at}.description`, 'string|null')
    if (!SKILL_LEVELS.has(s['level'] as string)) return failEnum(`${at}.level`, String(s['level']))
    if (!AGENT_SIDES.has(s['side'] as string)) return failEnum(`${at}.side`, String(s['side']))
    if (typeof s['symlink'] !== 'boolean') return failType(`${at}.symlink`, 'boolean')
    const pkg = s['pkg']
    if (pkg !== null) {
      if (!isRecord(pkg)) return failType(`${at}.pkg`, 'object|null')
      if (typeof pkg['files'] !== 'number' || typeof pkg['bytes'] !== 'number')
        return failType(`${at}.pkg` + '.files|bytes', 'number')
    }
    if (!ORIGINS.has(s['origin'] as string)) return failEnum(`${at}.origin`, String(s['origin']))
    if (!strOrNull(s['pluginName'])) return failType(`${at}.pluginName`, 'string|null')
    if (!strOrNull(s['pluginRoot'])) return failType(`${at}.pluginRoot`, 'string|null')
    if (!strOrNull(s['pluginSkillName'])) return failType(`${at}.pluginSkillName`, 'string|null')
    return null
  })
  if (skills) return skills

  const subagents = eachOf(v['subagents'], 'detail.subagents', (a, at) => {
    if (!str(a['name'])) return failType(`${at}.name`, 'string')
    if (!AGENT_SIDES.has(a['side'] as string)) return failEnum(`${at}.side`, String(a['side']))
    if (!SUBAGENT_LEVELS.has(a['level'] as string)) return failEnum(`${at}.level`, String(a['level']))
    if (!strOrNull(a['description'])) return failType(`${at}.description`, 'string|null')
    if (!isRecord(a['detail'])) return failType(`${at}.detail`, 'object')
    for (const b of ['shadows', 'shadowed', 'overridesBuiltin'] as const) {
      if (typeof a[b] !== 'boolean') return failType(`${at}.${b}`, 'boolean')
    }
    return null
  })
  if (subagents) return subagents

  const mem = v['memory']
  if (!isRecord(mem)) return failType('detail.memory', 'object')
  if (!strOrNull(mem['main'])) return failType('detail.memory.main', 'string|null')
  const topics = eachOf(mem['topics'], 'detail.memory.topics', (t, at) => {
    if (!str(t['name'])) return failType(`${at}.name`, 'string')
    if (typeof t['file'] !== 'string' || t['file'] === '') return failType(`${at}.file`, 'string(non-empty)')
    if (typeof t['mtimeMs'] !== 'number') return failType(`${at}.mtimeMs`, 'number')
    return null
  })
  if (topics) return topics

  const plugins = eachOf(v['plugins'], 'detail.plugins', (p, at) => {
    if (!str(p['name'])) return failType(`${at}.name`, 'string')
    if (!strOrNull(p['version'])) return failType(`${at}.version`, 'string|null')
    if (!strOrNull(p['installPath'])) return failType(`${at}.installPath`, 'string|null')
    if (typeof p['enabled'] !== 'boolean') return failType(`${at}.enabled`, 'boolean')
    if (p['enabledFrom'] !== null && !ENABLED_FROM.has(p['enabledFrom'] as string))
      return failEnum(`${at}.enabledFrom`, String(p['enabledFrom']))
    if (!Array.isArray(p['installs'])) return failType(`${at}.installs`, 'array')
    const contents = p['contents']
    if (!isRecord(contents)) return failType(`${at}.contents`, 'object')
    // 内含 skills 摘要(预览入口的元数据,H1/H6):漏校验即边界静默放过(R1)
    const cskills = eachOf(contents['skills'], `${at}.contents.skills`, (s, sat) => {
      if (!str(s['name'])) return failType(`${sat}.name`, 'string')
      if (!strOrNull(s['description'])) return failType(`${sat}.description`, 'string|null')
      const pkg = s['pkg']
      if (pkg !== null) {
        if (!isRecord(pkg)) return failType(`${sat}.pkg`, 'object|null')
        if (typeof pkg['files'] !== 'number' || typeof pkg['bytes'] !== 'number')
          return failType(`${sat}.pkg` + '.files|bytes', 'number')
      }
      return null
    })
    if (cskills) return cskills
    return null
  })
  if (plugins) return plugins

  const mcp = eachOf(v['mcp'], 'detail.mcp', (m, at) => {
    if (!str(m['name'])) return failType(`${at}.name`, 'string')
    if (m['enabled'] !== null && typeof m['enabled'] !== 'boolean')
      return failType(`${at}.enabled`, 'boolean|null')
    return null
  })
  if (mcp) return mcp

  const cfg = v['configs']
  if (!isRecord(cfg)) return failType('detail.configs', 'object')
  for (const k of ['claudeMd', 'agentsMd', 'settingsSummary'] as const) {
    if (!strOrNull(cfg[k])) return failType(`detail.configs.${k}`, 'string|null')
  }

  const artifacts = eachOf(v['artifacts'], 'detail.artifacts', (a, at) => {
    if (!ARTIFACT_TYPES.has(a['type'] as string)) return failEnum(`${at}.type`, String(a['type']))
    if (!str(a['title'])) return failType(`${at}.title`, 'string')
    if (typeof a['file'] !== 'string' || a['file'] === '') return failType(`${at}.file`, 'string(non-empty)')
    if (typeof a['mtimeMs'] !== 'number') return failType(`${at}.mtimeMs`, 'number')
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
  if (!r.ok) throw contractError('projectDetail', r.failure)
}
