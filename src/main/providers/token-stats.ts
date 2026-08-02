// Token 聚合引擎(ccusage 对齐版,2026-07-30;源码级依据见 ADR-0005):
// - Claude:递归扫 claudeHome/projects **全树**(与项目注册表无关,未注册目录计入全局);
//   逐 usage 行成条目,聚合层跨文件去重——精确键 message.id+requestId,任一方 isSidechain
//   时回退 message.id-only(subagent 会以新 requestId 重放父消息);保留非 sidechain、
//   其次 token 四项和更大的一条。总量口径 = input+output+cacheRead+cacheWrite 四项全加;
//   model 为 '<synthetic>' 或缺失的条目计总量、不入模型桶。
// - Codex:逐轮 last_token_usage 增量事件(payload.type=token_count in event_msg);
//   fork/subagent 会话会重放父会话历史,按 ccusage replay.rs 同规则剥离——取父会话
//   fork 时刻前的事件序列,与子会话开头逐条按值匹配跳过(首条即不匹配则不剥);
//   口径:input 净化(减 cached)、cached 计 cacheRead、total 四项全加;
//   模型取末条 turn_context(会话主模型近似)。
// - 增量缓存存"条目级"数据(去重必须跨文件,在聚合层做,不能缓存去重后的结果);
//   按(路径, mtime, size)键,原子写。统计含隐藏/失效项目。
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import type { AgentSide, ProjectStats, TokenStats, TokenTotals } from '@shared/domain'
import { emptyTokenStats, emptyTotals } from '@shared/domain'
import { mergeKey } from '@shared/path-key'
import { providerOf } from '@shared/provider'
import { encodeClaudeProjectDir } from './claude'
import { readCodexSessions } from './codex'
import type { ScanRoots } from './types'
import type { UsageRow } from './archive'

/** Claude 单条 usage(紧凑数组编码进缓存):[mid, rid, sc, in, out, cr, cw, model, day] */
type PackedEntry = [
  string | null,
  string | null,
  0 | 1,
  number,
  number,
  number,
  number,
  string | null,
  string | null
]

interface ClaudeFileAgg {
  kind: 'claude'
  /** 源文件绝对路径 —— 会话身份,随 SessionMeta 出到渲染层 */
  file: string
  projectKey: string
  listed: boolean
  title: string
  at: number | null
  entries: PackedEntry[]
}

/** Codex 单轮用量事件:[ts, input, cached, output, cacheWrite] */
type CodexEvent = [number | null, number, number, number, number]

interface CodexFileAgg {
  kind: 'codex'
  /** 源文件绝对路径 —— 会话身份,随 SessionMeta 出到渲染层 */
  file: string
  projectKey: string
  listed: boolean
  title: string
  at: number | null
  model: string
  sessionId: string | null
  parentId: string | null
  forkedAt: number | null
  /** 逐轮增量事件(last_token_usage);fork 重放前缀在 combine 阶段剥离 */
  events: CodexEvent[]
}

type FileAgg = ClaudeFileAgg | CodexFileAgg

/**
 * 缓存结构版本。**改动 FileAgg 形状必须同时升此号**——否则旧缓存会被当新结构读,
 * 字段缺失处直接崩(2026-07-30 线上事故:Codex agg 从 totals/byDay 改为 events
 * 未升版本,旧缓存命中后 a.events 为 undefined)。
 *
 * **改动 FileAgg 里某字段的算出方式,同样必须升号**(2026-08-02 补):缓存按
 * (路径, mtime, size) 命中,文件没变就直接返回旧值——新算法对存量文件永不生效。
 * fixture 用全新缓存必过,真实用户看不到修复,是典型假绿。
 * v4:Codex 的 at 由首个时间戳改为文件内最大时间戳。
 * v5:FileAgg 加 file(会话身份)。
 */
const CACHE_VERSION = 5

interface CacheShape {
  version: typeof CACHE_VERSION
  files: Record<string, { sig: string; agg: FileAgg }>
}

export interface TokenBuildResult {
  global: TokenStats
  perProject: Map<string, ProjectStats>
  /** 归档行(天×侧×项目×模型),供 UsageArchive 持久化 */
  rows: UsageRow[]
  /** 本次扫描仍能看到源数据的天(归档冲突规则用) */
  liveDays: Set<string>
}

export class TokenEngine {
  private readonly cacheDir: string
  private readonly cacheFile: string
  private cache: CacheShape

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
    this.cacheFile = join(cacheDir, 'token-cache.json')
    this.cache = this.loadCache()
  }

  private loadCache(): CacheShape {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.cacheFile, 'utf8'))
      if (
        typeof raw === 'object' &&
        raw !== null &&
        (raw as Record<string, unknown>)['version'] === CACHE_VERSION &&
        typeof (raw as Record<string, unknown>)['files'] === 'object'
      ) {
        return raw as unknown as CacheShape
      }
    } catch {
      // 缓存缺失/损坏/旧版:全量重算
    }
    return { version: CACHE_VERSION, files: {} }
  }

  private persist(): void {
    mkdirSync(this.cacheDir, { recursive: true })
    const tmp = join(this.cacheDir, `.token-cache.j-${process.pid}`)
    writeFileSync(tmp, JSON.stringify(this.cache))
    renameSync(tmp, this.cacheFile)
  }

  /**
   * claudeProjectPaths 仅用于「编码目录名 → 项目」归属映射;
   * 全局统计对 projects 全树生效,与该清单无关。
   */
  async build(roots: ScanRoots, claudeProjectPaths: string[]): Promise<TokenBuildResult> {
    const aggs: FileAgg[] = []
    const seen: Record<string, { sig: string; agg: FileAgg }> = {}

    // 编码目录名 → 项目合并键
    const encToProject = new Map<string, string>()
    for (const p of claudeProjectPaths) encToProject.set(encodeClaudeProjectDir(p), mergeKey(p))

    // ── Claude:projects 全树 ──
    const projectsRoot = join(roots.claudeHome, 'projects')
    if (existsSync(projectsRoot)) {
      let dirs: string[] = []
      try {
        dirs = readdirSync(projectsRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      } catch {
        dirs = []
      }
      for (const encName of dirs) {
        const projectKey = encToProject.get(encName) ?? ''
        for (const { file, nested } of listJsonl(join(projectsRoot, encName))) {
          const agg = await this.aggFor(file, () => parseClaudeFile(file, projectKey, !nested))
          if (agg) {
            aggs.push(agg)
            seen[file] = { sig: sigOf(file) ?? '', agg }
          }
        }
      }
    }

    // ── Codex:sessions 全树,首行 cwd 归属 ──
    const titles = readCodexIndex(roots.codexHome)
    for (const s of readCodexSessions(roots.codexHome)) {
      const agg = await this.aggFor(s.file, () =>
        parseCodexFile(
          s.file,
          mergeKey(s.cwd),
          { subagent: s.subagent, sessionId: s.sessionId, parentId: s.parentId, forkedAt: s.forkedAt },
          titles
        )
      )
      if (agg) {
        aggs.push(agg)
        seen[s.file] = { sig: sigOf(s.file) ?? '', agg }
      }
    }

    this.cache = { version: CACHE_VERSION, files: seen }
    this.persist()
    return combine(aggs)
  }

  private async aggFor(file: string, parse: () => Promise<FileAgg | null>): Promise<FileAgg | null> {
    const sig = sigOf(file)
    if (sig === null) return null
    const cached = this.cache.files[file]
    // 除版本号外再校验条目形状:同版本内的手工损坏/未来漂移一律重算,不让缺字段流进聚合层
    if (cached && cached.sig === sig && isWellFormedAgg(cached.agg)) return cached.agg
    return parse()
  }
}

// ── 聚合(含跨文件去重)──

interface KeptEntry {
  e: PackedEntry
  fileIdx: number
}

function entryTotal(e: PackedEntry): number {
  return e[3] + e[4] + e[5] + e[6]
}

/** 非 sidechain 优先;其次四项和更大者 */
function shouldReplace(oldE: PackedEntry, cand: PackedEntry): boolean {
  if (oldE[2] !== cand[2]) return oldE[2] === 1 && cand[2] === 0
  return entryTotal(cand) > entryTotal(oldE)
}

function dedupeClaude(files: Array<{ agg: ClaudeFileAgg; fileIdx: number }>): KeptEntry[] {
  const kept: KeptEntry[] = []
  const byExact = new Map<string, number>()
  const byMid = new Map<string, number[]>()

  const register = (mid: string, exact: string, idx: number): void => {
    byExact.set(exact, idx)
    const list = byMid.get(mid)
    if (list) list.push(idx)
    else byMid.set(mid, [idx])
  }

  for (const { agg, fileIdx } of files) {
    for (const e of agg.entries) {
      const mid = e[0]
      if (mid === null) {
        kept.push({ e, fileIdx })
        continue
      }
      const exact = `${mid} ${e[1] ?? ''}`
      let matchIdx = byExact.get(exact)
      if (matchIdx === undefined) {
        // sidechain 回退:任一方是 sidechain 时按 message.id-only 匹配
        for (const i of byMid.get(mid) ?? []) {
          if (kept[i].e[2] === 1 || e[2] === 1) {
            matchIdx = i
            break
          }
        }
      }
      if (matchIdx === undefined) {
        kept.push({ e, fileIdx })
        register(mid, exact, kept.length - 1)
      } else if (shouldReplace(kept[matchIdx].e, e)) {
        kept[matchIdx] = { e, fileIdx }
        byExact.set(exact, matchIdx)
      }
    }
  }
  return kept
}

function combine(aggs: FileAgg[]): TokenBuildResult {
  const global = emptyTokenStats()
  // 归档行累积:键 天|侧|项目|模型
  const rowMap = new Map<string, UsageRow>()
  const liveDays = new Set<string>()
  const addRow = (
    day: string | null,
    side: AgentSide,
    projectKey: string,
    model: string,
    v: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  ): void => {
    if (day === null) return
    liveDays.add(day)
    const key = `${day}|${side}|${projectKey}|${model}`
    const cur =
      rowMap.get(key) ??
      { day, side, projectKey, model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    cur.input += v.input
    cur.output += v.output
    cur.cacheRead += v.cacheRead
    cur.cacheWrite += v.cacheWrite
    cur.total += v.total
    rowMap.set(key, cur)
  }
  const globalModels = new Map<string, number>()
  const globalDays = new Map<string, { claude: number; codex: number; byProvider: Record<string, number> }>()
  const perProject = new Map<string, ProjectStats>()

  const projectOf = (key: string): ProjectStats => {
    const p = perProject.get(key) ?? { tokens: emptyTokenStats(), sessions: [] }
    perProject.set(key, p)
    return p
  }
  const addModel = (stats: TokenStats, side: AgentSide, model: string, v: number): void => {
    const found = stats.byModel.find((m) => m.model === model && m.side === side)
    if (found) found.total += v
    else stats.byModel.push({ model, side, total: v })
  }
  const addDay = (stats: TokenStats, side: AgentSide, day: string, v: number, model: string): void => {
    const prov = providerOf(model)
    let found = stats.byDay.find((d) => d.day === day)
    if (!found) {
      found = { day, claude: 0, codex: 0, byProvider: {} }
      stats.byDay.push(found)
    }
    found[side] += v
    found.byProvider[prov] = (found.byProvider[prov] ?? 0) + v
  }
  const addGlobalDay = (day: string, side: AgentSide, v: number, model: string): void => {
    const prov = providerOf(model)
    const d = globalDays.get(day) ?? { claude: 0, codex: 0, byProvider: {} }
    d[side] += v
    d.byProvider[prov] = (d.byProvider[prov] ?? 0) + v
    globalDays.set(day, d)
  }

  // ── Claude:条目级去重后聚合 ──
  const claudeFiles: Array<{ agg: ClaudeFileAgg; fileIdx: number }> = []
  aggs.forEach((a, i) => {
    if (a.kind === 'claude') claudeFiles.push({ agg: a, fileIdx: i })
  })
  const kept = dedupeClaude(claudeFiles)
  const perFileTokens = new Map<number, number>()
  for (const { e, fileIdx } of kept) {
    const agg = aggs[fileIdx] as ClaudeFileAgg
    const t = entryTotal(e)
    global.bySide.claude.input += e[3]
    global.bySide.claude.output += e[4]
    global.bySide.claude.cacheRead += e[5]
    global.bySide.claude.cacheWrite += e[6]
    global.bySide.claude.total += t
    if (e[7] !== null) globalModels.set(`claude:${e[7]}`, (globalModels.get(`claude:${e[7]}`) ?? 0) + t)
    if (e[8] !== null) addGlobalDay(e[8], 'claude', t, e[7] ?? '')
    perFileTokens.set(fileIdx, (perFileTokens.get(fileIdx) ?? 0) + t)
    addRow(e[8], 'claude', agg.projectKey, e[7] ?? '', {
      input: e[3],
      output: e[4],
      cacheRead: e[5],
      cacheWrite: e[6],
      total: t
    })
    if (agg.projectKey) {
      const p = projectOf(agg.projectKey)
      p.tokens.bySide.claude.input += e[3]
      p.tokens.bySide.claude.output += e[4]
      p.tokens.bySide.claude.cacheRead += e[5]
      p.tokens.bySide.claude.cacheWrite += e[6]
      p.tokens.bySide.claude.total += t
      if (e[7] !== null) addModel(p.tokens, 'claude', e[7], t)
      if (e[8] !== null) addDay(p.tokens, 'claude', e[8], t, e[7] ?? '')
    }
  }
  // Claude 会话条目(顶层文件;tokens = 去重后该文件保留条目之和)
  claudeFiles.forEach(({ agg, fileIdx }) => {
    if (!agg.listed || !agg.projectKey) return
    projectOf(agg.projectKey).sessions.push({
      side: 'claude',
      title: agg.title,
      at: agg.at,
      tokens: perFileTokens.get(fileIdx) ?? 0,
      file: agg.file
    })
  })

  // ── Codex:先剥 fork/subagent 重放前缀,再逐事件聚合 ──
  const codexAggs = aggs.filter((a): a is CodexFileAgg => a.kind === 'codex')
  const bySessionId = new Map<string, CodexFileAgg>()
  for (const a of codexAggs) {
    if (a.sessionId && !bySessionId.has(a.sessionId)) bySessionId.set(a.sessionId, a)
  }
  const sameUsage = (x: CodexEvent, y: CodexEvent): boolean =>
    x[1] === y[1] && x[2] === y[2] && x[3] === y[3] && x[4] === y[4]

  for (const a of codexAggs) {
    let start = 0
    if (a.parentId) {
      const parent = bySessionId.get(a.parentId)
      if (!parent || parent === a) {
        // 父日志不在扫描集:退化为「重写突发」启发式
        start = skipRewrittenBurst(a.events)
      } else {
        // 父会话在 fork 时刻之前的事件即被本会话重放的历史。
        // 与 ccusage 一致:按「首个时间戳晚于 fork 时刻」的位置截断,而非全量过滤
        // (父事件时间戳非严格有序时两者不等价,过滤会剥多)。
        let replayLen = parent.events.length
        if (a.forkedAt !== null) {
          const pos = parent.events.findIndex((e) => e[0] !== null && e[0] > (a.forkedAt as number))
          if (pos !== -1) replayLen = pos
        }
        const prefix = parent.events.slice(0, replayLen)
        while (start < a.events.length && start < prefix.length && sameUsage(prefix[start], a.events[start])) {
          start++
        }
        // 首条即不匹配 → 父流锚不住这次重放(日志被重写),退化为突发启发式
        if (start === 0) start = skipRewrittenBurst(a.events)
      }
    }
    const totals = emptyTotals()
    const byDay: Record<string, number> = {}
    for (let i = start; i < a.events.length; i++) {
      const [ts, rawInput, cached, output, cacheWrite] = a.events[i]
      totals.input += Math.max(0, rawInput - cached)
      totals.cacheRead += cached
      totals.output += output
      totals.cacheWrite += cacheWrite
      const turnTotal = rawInput + output + cacheWrite
      totals.total += turnTotal
      if (ts !== null && turnTotal > 0) {
        const day = localDay(ts)
        byDay[day] = (byDay[day] ?? 0) + turnTotal
      }
    }
    addTotals(global.bySide.codex, totals)
    if (totals.total > 0) {
      globalModels.set(`codex:${a.model}`, (globalModels.get(`codex:${a.model}`) ?? 0) + totals.total)
    }
    for (const [day, v] of Object.entries(byDay)) {
      // 四项按该天占总量的比例分摊(Codex 增量事件已按天聚合,细分四项无独立来源)
      const ratio = totals.total > 0 ? v / totals.total : 0
      addRow(day, 'codex', a.projectKey, a.model, {
        input: Math.round(totals.input * ratio),
        output: Math.round(totals.output * ratio),
        cacheRead: Math.round(totals.cacheRead * ratio),
        cacheWrite: Math.round(totals.cacheWrite * ratio),
        total: v
      })
    }
    for (const [day, v] of Object.entries(byDay)) addGlobalDay(day, 'codex', v, a.model)
    if (a.projectKey) {
      const p = projectOf(a.projectKey)
      addTotals(p.tokens.bySide.codex, totals)
      if (totals.total > 0) addModel(p.tokens, 'codex', a.model, totals.total)
      for (const [day, v] of Object.entries(byDay)) addDay(p.tokens, 'codex', day, v, a.model)
      if (a.listed) {
        p.sessions.push({ side: 'codex', title: a.title, at: a.at, tokens: totals.total, file: a.file })
      }
    }
  }

  global.byModel = [...globalModels.entries()]
    .map(([k, total]) => {
      const [side, ...rest] = k.split(':')
      return { side: side as AgentSide, model: rest.join(':'), total }
    })
    .sort((x, y) => y.total - x.total)
  global.byDay = [...globalDays.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((x, y) => (x.day < y.day ? -1 : 1))

  for (const p of perProject.values()) {
    p.tokens.byModel.sort((x, y) => y.total - x.total)
    p.tokens.byDay.sort((x, y) => (x.day < y.day ? -1 : 1))
    p.sessions.sort((x, y) => (y.at ?? 0) - (x.at ?? 0))
  }
  return { global, perProject, rows: [...rowMap.values()], liveDays }
}

/** 重写突发(ccusage detect_rewritten_burst 同规则):前两个事件间隔 ≤1s 即认定
 * 开头是复制来的历史,连续跳到间隔 >1s 处 */
const BURST_PAUSE_MS = 1000

function skipRewrittenBurst(events: CodexEvent[]): number {
  if (events.length < 2) return 0
  const t0 = events[0][0]
  const t1 = events[1][0]
  if (t0 === null || t1 === null) return 0
  const gap = t1 - t0
  if (gap < 0 || gap > BURST_PAUSE_MS) return 0
  let i = 1
  let prev = t1
  while (i + 1 < events.length) {
    const next = events[i + 1][0]
    if (next === null) break
    const d = next - prev
    if (d < 0 || d > BURST_PAUSE_MS) break
    prev = next
    i++
  }
  return i + 1
}

function addTotals(into: TokenTotals, from: TokenTotals): void {
  into.input += from.input
  into.output += from.output
  into.cacheRead += from.cacheRead
  into.cacheWrite += from.cacheWrite
  into.total += from.total
}

// ── 文件枚举与解析 ──

/** 目录下全部 jsonl:顶层=会话,嵌套=subagent 等转写 */
function listJsonl(root: string): Array<{ file: string; nested: boolean }> {
  const out: Array<{ file: string; nested: boolean }> = []
  const walk = (dir: string, nested: boolean): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        walk(p, true)
        continue
      }
      if (e.name.endsWith('.jsonl')) out.push({ file: p, nested })
    }
  }
  walk(root, false)
  return out
}

/** 缓存条目是否符合当前 FileAgg 形状(聚合层依赖的数组字段必须在) */
function isWellFormedAgg(agg: unknown): agg is FileAgg {
  if (typeof agg !== 'object' || agg === null) return false
  const a = agg as Record<string, unknown>
  if (a['kind'] === 'claude') return Array.isArray(a['entries'])
  if (a['kind'] === 'codex') return Array.isArray(a['events'])
  return false
}

function sigOf(file: string): string | null {
  try {
    const st = statSync(file)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return null
  }
}

/** 本地时区日键 YYYY-MM-DD(spec:趋势按本地时区切日) */
function localDay(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function eachLine(file: string, onLine: (obj: Record<string, unknown>) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const obj: unknown = JSON.parse(line)
      if (typeof obj === 'object' && obj !== null) onLine(obj as Record<string, unknown>)
    } catch {
      // 坏行跳过(活跃会话写入中/损坏)
    }
  }
}

const TITLE_MAX = 60
const SYNTHETIC = '<synthetic>'

async function parseClaudeFile(
  file: string,
  projectKey: string,
  listed: boolean
): Promise<ClaudeFileAgg | null> {
  const entries: PackedEntry[] = []
  let title: string | null = null
  let lastAt: number | null = null
  try {
    await eachLine(file, (obj) => {
      const msg = obj['message'] as Record<string, unknown> | undefined
      if (title === null && obj['type'] === 'user' && msg) {
        const c = msg['content']
        const text =
          typeof c === 'string'
            ? c
            : Array.isArray(c)
              ? c
                  .map((seg) =>
                    typeof (seg as Record<string, unknown>)?.['text'] === 'string'
                      ? ((seg as Record<string, unknown>)['text'] as string)
                      : ''
                  )
                  .join(' ')
              : ''
        const t = text.trim().replace(/\s+/g, ' ')
        if (t) title = t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX)}…` : t
      }
      const usage = msg?.['usage'] as Record<string, unknown> | undefined
      if (!usage) return
      const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp'] as string) : NaN
      if (!Number.isNaN(ts)) lastAt = lastAt === null ? ts : Math.max(lastAt, ts)
      const rawModel = typeof msg?.['model'] === 'string' ? (msg['model'] as string) : null
      entries.push([
        typeof msg?.['id'] === 'string' ? (msg['id'] as string) : null,
        typeof obj['requestId'] === 'string' ? (obj['requestId'] as string) : null,
        obj['isSidechain'] === true ? 1 : 0,
        num(usage['input_tokens']),
        num(usage['output_tokens']),
        num(usage['cache_read_input_tokens']),
        cacheCreationOf(usage),
        rawModel === null || rawModel === SYNTHETIC ? null : rawModel,
        Number.isNaN(ts) ? null : localDay(ts)
      ])
    })
  } catch {
    return null
  }
  const fallbackAt = ((): number | null => {
    try {
      return statSync(file).mtimeMs
    } catch {
      return null
    }
  })()
  return {
    kind: 'claude',
    file,
    projectKey,
    listed,
    title: title ?? file.split('/').pop()?.replace(/\.jsonl$/, '') ?? '会话',
    at: lastAt ?? fallbackAt,
    entries
  }
}

async function parseCodexFile(
  file: string,
  projectKey: string,
  meta: { subagent: boolean; sessionId: string | null; parentId: string | null; forkedAt: number | null },
  titles: Map<string, string>
): Promise<CodexFileAgg | null> {
  const events: CodexEvent[] = []
  let model = 'unknown'
  // at = 文件内最大时间戳(与 Claude 侧同义 = 最后活动)。此前取首个时间戳,
  // 对 fork 会话尤其错——首行时间戳是重放时刻,既不是开始也不是结束。
  let lastTs: number | null = null
  try {
    await eachLine(file, (obj) => {
      const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp'] as string) : NaN
      if (!Number.isNaN(ts)) lastTs = lastTs === null ? ts : Math.max(lastTs, ts)
      const payload = obj['payload'] as Record<string, unknown> | undefined
      if (obj['type'] === 'turn_context') {
        const m = payload?.['model']
        if (typeof m === 'string') model = m
      }
      // 真实形状:顶层 type=event_msg,数据在 payload.info(payload.type=token_count);
      // 取 last_token_usage 逐轮增量(同一轮可能重复上报,由 fork 剥离与差值口径处理)
      if (payload?.['type'] !== 'token_count') return
      const info = payload['info'] as Record<string, unknown> | undefined
      const usage = (info?.['last_token_usage'] ?? info?.['total_token_usage']) as
        | Record<string, unknown>
        | undefined
      if (!usage) return
      events.push([
        Number.isNaN(ts) ? null : ts,
        num(usage['input_tokens']),
        num(usage['cached_input_tokens']),
        num(usage['output_tokens']),
        num(usage['cache_write_input_tokens'])
      ])
    })
  } catch {
    return null
  }
  const id = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(file)?.[1]
  const stem = file.split('/').pop()?.replace(/\.jsonl$/, '') ?? '会话'
  return {
    kind: 'codex',
    file,
    projectKey,
    listed: !meta.subagent,
    title: (id ? titles.get(id) : undefined) ?? stem,
    at: lastTs,
    model,
    sessionId: meta.sessionId,
    parentId: meta.parentId,
    forkedAt: meta.forkedAt,
    events
  }
}

function readCodexIndex(codexHome: string): Map<string, string> {
  const out = new Map<string, string>()
  const file = join(codexHome, 'session_index.jsonl')
  if (!existsSync(file)) return out
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const obj: unknown = JSON.parse(line)
        const id = (obj as Record<string, unknown>)?.['id']
        const name = (obj as Record<string, unknown>)?.['thread_name']
        if (typeof id === 'string' && typeof name === 'string') out.set(id, name)
      } catch {
        // 坏行跳过
      }
    }
  } catch {
    // 索引不可读:标题走文件名回退
  }
  return out
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * cache 写入量:存在 cache_creation 明细对象时取 ephemeral_5m + ephemeral_1h 之和,
 * 否则取扁平 cache_creation_input_tokens(与 ccusage TokenUsageRaw::cache_creation_token_count 同规则)。
 * 真实数据实测两者可不等(2026-07-13 有 2 行差 894)。
 */
function cacheCreationOf(usage: Record<string, unknown>): number {
  const detail = usage['cache_creation']
  if (typeof detail === 'object' && detail !== null) {
    const d = detail as Record<string, unknown>
    return num(d['ephemeral_5m_input_tokens']) + num(d['ephemeral_1h_input_tokens'])
  }
  return num(usage['cache_creation_input_tokens'])
}
