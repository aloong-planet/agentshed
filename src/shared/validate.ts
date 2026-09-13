// Snapshot schema validation at the IPC boundary: once before the main process sends and once when the
// renderer receives,
// so contract drift surfaces at the boundary rather than rendering as undefined. Hand-written structural
// validation, zero dependencies.
import type { Snapshot } from './domain'
import { ERR, appError } from './errors'
import { ARTIFACT_ORDER } from './domain'

/**
 * A validation failure is returned in **structured** form with no natural language (ADR-0015 extended to
 * the contract layer).
 * The renderer produces the wording in the current language — a validation reason bubbles to the UI
 * through the error message,
 * so keeping the source-language text would expose it to non-Chinese users at exactly the moment of
 * failure.
 */
export type ValidateFailure =
  | { kind: 'missing'; path: string }
  /** `expect` is **type notation** (`string|null` / `array` / `object`): language-independent and not
   * translated */
  | { kind: 'type'; path: string; expect: string }
  /** An enum field received a value outside its domain; `value` is what was actually received */
  | { kind: 'enum'; path: string; value: string }

export type ValidateResult = { ok: true } | { ok: false; failure: ValidateFailure }

/** Exported for runtime argument guards: a hand-enumerated side check is exactly what typecheck
 * cannot see, and it is how skill installs silently refused the third side (#126). */
export const AGENT_SIDES = new Set(['claude', 'codex', 'grok'])

const failMissing = (path: string): ValidateResult => ({ ok: false, failure: { kind: 'missing', path } })
const failType = (path: string, expect: string): ValidateResult => ({
  ok: false,
  failure: { kind: 'type', path, expect }
})
const failEnum = (path: string, value: string): ValidateResult => ({
  ok: false,
  failure: { kind: 'enum', path, value }
})

/** CappedText: { text: string; truncated: boolean } (ticket 07) */
function isCapped(v: unknown): boolean {
  return isRecord(v) && typeof v['text'] === 'string' && typeof v['truncated'] === 'boolean'
}
/** AppError: { code: string; params: object } (ticket 07 brought it onto data fields) */
function isAppErr(v: unknown): boolean {
  return isRecord(v) && typeof v['code'] === 'string' && isRecord(v['params'])
}

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
    if (s['error'] !== undefined && !isAppErr(s['error']))
      return failType(`sides.${side}.error`, 'AppError|undefined')
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
    if (p['lastSessionAt'] !== null && typeof p['lastSessionAt'] !== 'number')
      return failType(`${at}.lastSessionAt`, 'number|null')
    if (typeof p['sessionCount'] !== 'number') return failType(`${at}.sessionCount`, 'number')
  }

  const g = v['global']
  if (!isRecord(g)) return failMissing('global')
  for (const arr of ['skills', 'subagents', 'memory', 'plugins', 'codexPlugins', 'mcp'] as const) {
    if (!Array.isArray(g[arr])) return failType(`global.${arr}`, 'array')
  }
  for (const capped of ['claudeGlobalMd', 'codexAgentsMd'] as const) {
    if (g[capped] !== null && !isCapped(g[capped]))
      return failType(`global.${capped}`, 'CappedText|null')
  }
  if (g['codexConfigSummary'] !== null && !isRecord(g['codexConfigSummary']))
    return failType('global.codexConfigSummary', 'object|null')
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
  // Every figure the interface shows for a selected window comes from here, so an absent `rows` is not
  // a degraded snapshot but a blank page — checked like the projections rather than assumed
  if (!Array.isArray(tk['rows'])) return failType('tokens.rows', 'array')
  if (!Array.isArray(v['archivedDays'])) return failType('archivedDays', 'array')
  return { ok: true }
}

/** The main process's exit: a validation failure throws outright (a broken contract is a programming
 * error and is never silent) */

/**
 * A validation failure → a structured error. The payload's name is folded into the path prefix
 * (`snapshot.sessions[0].file`),
 * so the wording needs only the generic word "payload" instead of a noun per payload kind, while losing
 * none of the locating information.
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
 * The statistics block in project detail (the overview tab's data). **It covers sessions only** —
 * getProjectDetail
 * had no boundary validation at all before (an existing gap, not introduced here), and rather than
 * building an exhaustive validator,
 * this pins the session metadata: `file` is a session's identity and the renderer requests contents with
 * it, so a missing or empty string is
 * an unreadable session, which must surface at the boundary rather than rendering as undefined and then
 * reading cwd.
 */
const FORK_STATES = new Set(['none', 'stripped', 'uncertain'])

// ── The session page (the getSessionPage channel, ticket 04) ──
// The same rule as the snapshot and detail: assert once at the main process's exit and validate again at
// the preload's entry.
export function validateSessionPage(v: unknown): ValidateResult {
  if (!isRecord(v)) return failType('page', 'object')
  if (v['revision'] !== undefined && typeof v['revision'] !== 'string') return failType('page.revision', 'string')
  if (typeof v['file'] !== 'string' || v['file'] === '') return failType('page.file', 'string(non-empty)')
  if (typeof v['side'] !== 'string' || !AGENT_SIDES.has(v['side']))
    return failEnum('page.side', String(v['side']))
  if (!strOrNull(v['title'])) return failType('page.title', 'string|null')
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
    if (q['revision'] !== undefined && typeof q['revision'] !== 'string') return failType(`${at}.revision`, 'string')
    if (typeof q['i'] !== 'number') return failType(`${at}.i`, 'number')
    if (!strOrNull(q['text'])) return failType(`${at}.text`, 'string|null')
    if (q['at'] !== null && typeof q['at'] !== 'number') return failType(`${at}.at`, 'number|null')
    if (typeof q['tools'] !== 'number') return failType(`${at}.tools`, 'number')
    if (typeof q['subagents'] !== 'number') return failType(`${at}.subagents`, 'number')
  }
  return { ok: true }
}

/** The main process's exit: a broken contract throws outright (the same style as assertSnapshot) */
export function assertSessionPage(v: unknown): void {
  const r = validateSessionPage(v)
  if (!r.ok) throw contractError('sessionPage', r.failure)
}

// ── Fetching one turn (the getSessionTurn channel, established in ticket 05 and completed in 07) ──
// Kind allow-list validation: an unknown kind is refused at the boundary — a new block type has to pass
// through the contract first
const SUB_STEP_KINDS = new Set(['text', 'tool'])

function validateTurnBlock(b: Record<string, unknown>, at: string): ValidateResult {
  const kind = b['kind']
  // `unknown` is an aggregate block with no time; every other kind requires at: number|null
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

/** The main process's exit: as with assertSnapshot, a broken contract throws outright */
export function assertSessionTurn(v: unknown): void {
  const r = validateSessionTurn(v)
  if (!r.ok) throw contractError('sessionTurn', r.failure)
}

// ── The search payload (the searchSessions channel, ticket 08) ──
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
    if (!strOrNull(grp['title'])) return failType(`${at}.title`, 'string|null')
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
      if (!strOrNull(hit['text'])) return failType(`${hat}.text`, 'string|null')
      if (hit['at'] !== null && typeof hit['at'] !== 'number') return failType(`${hat}.at`, 'number|null')
      if (typeof hit['inBody'] !== 'boolean') return failType(`${hat}.inBody`, 'boolean')
      if (hit['snippet'] !== null && typeof hit['snippet'] !== 'string')
        return failType(`${hat}.snippet`, 'string|null')
    }
  }
  return { ok: true }
}

/** The main process's exit: as with assertSnapshot, a broken contract throws outright */
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
    if (!strOrNull(s['title'])) return failType(`${at}.title`, 'string|null')
    if (s['at'] !== null && typeof s['at'] !== 'number') return failType(`${at}.at`, 'number|null')
    if (typeof s['tokens'] !== 'number') return failType(`${at}.tokens`, 'number')
    if (typeof s['file'] !== 'string' || s['file'] === '') return failType(`${at}.file`, 'string(non-empty)')
    if (typeof s['questionCount'] !== 'number') return failType(`${at}.questionCount`, 'number')
    if (typeof s['forkState'] !== 'string' || !FORK_STATES.has(s['forkState']))
      return failEnum(`${at}.forkState`, String(s['forkState']))
  }
  return { ok: true }
}

/** The main process's exit: as with assertSnapshot, a broken contract throws outright */
export function assertProjectStats(v: unknown): void {
  const r = validateProjectStats(v)
  if (!r.ok) throw contractError('projectStats', r.failure)
}

// ── Project detail (the getProjectDetail channel) ──
// The snapshot is validated at each end, whereas this channel had no validation at all (the preload
// simply did `as ProjectDetail`),
// so any field drift rendered as undefined rather than surfacing at the boundary — the symptom is far
// from the cause and investigating it is very expensive.
//
// **The depth is set by "fields the renderer reads without protection"** rather than validating every
// leaf: this kind of validation is fail-closed,
// so one false refusal means the whole detail page will not open, and being too strict bites more easily
// than missing something. Hence enums, required scalars and nullable fields
// all have their types validated, while things like PluginContents and SubagentSideDetail are only
// checked for presence and being the right kind of container,
// leaving the inner leaves to the renderer's own null handling (they were written as optional in the
// first place).

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

/** An array field: run `check` per element, with the index in the error path */
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
  if (mem['main'] !== null && !isCapped(mem['main'])) return failType('detail.memory.main', 'CappedText|null')
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
    // The bundled skills summary (the preview entry point's metadata, H1/H6): missing its validation
    // lets the boundary pass it silently (R1)
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
  for (const k of ['claudeMd', 'agentsMd'] as const) {
    if (cfg[k] !== null && !isCapped(cfg[k])) return failType(`detail.configs.${k}`, 'CappedText|null')
  }
  if (!strOrNull(cfg['settingsSummary'])) return failType('detail.configs.settingsSummary', 'string|null')

  const artifacts = eachOf(v['artifacts'], 'detail.artifacts', (a, at) => {
    if (!ARTIFACT_TYPES.has(a['type'] as string)) return failEnum(`${at}.type`, String(a['type']))
    if (!str(a['title'])) return failType(`${at}.title`, 'string')
    if (typeof a['file'] !== 'string' || a['file'] === '') return failType(`${at}.file`, 'string(non-empty)')
    if (typeof a['mtimeMs'] !== 'number') return failType(`${at}.mtimeMs`, 'number')
    return null
  })
  if (artifacts) return artifacts

  // `stats` reuses the existing validator rather than starting a second set of session rules
  if (v['stats'] !== null) {
    const r = validateProjectStats(v['stats'])
    if (!r.ok) return r
  }
  return { ok: true }
}

/** The main process's exit: as with assertSnapshot, a broken contract throws outright */
export function assertProjectDetail(v: unknown): void {
  const r = validateProjectDetail(v)
  if (!r.ok) throw contractError('projectDetail', r.failure)
}
