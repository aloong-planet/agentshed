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
import { dirname, join } from 'node:path'
import type { AgentSide, ForkState, ProjectStats, SessionMeta, TokenStats, TokenTotals } from '@shared/domain'
import { emptyTokenStats, emptyTotals } from '@shared/domain'
import { mergeKey } from '@shared/path-key'
import { ERR, appError } from '@shared/errors'
import { providerOf } from '@shared/provider'
import { encodeClaudeProjectDir } from './claude'
import { readCodexSessionMeta, readCodexSessions } from './codex'
import { eachJsonlLine } from './jsonl'
import { makeQuestionIndexer, stripReplayPrefix, type QuestionRec } from './question-index'
import { clipTitle, realUserText } from './session-title'
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
  title: string | null
  at: number | null
  /** 提问索引(不含提问文本,见 question-index.ts) */
  questions: QuestionRec[]
  /** 主链分叉处数(票 06 横幅:"本会话有 N 处分叉";0 = 线性会话不出横幅) */
  forkPoints: number
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
  title: string | null
  at: number | null
  model: string
  /** 标题是否来自 session_index 的 thread_name。retitle 只许改"来自首条提问"的
   * 标题——thread_name 的优先级(spec A4)不因剥离而失效。 */
  titleFromThread: boolean
  sessionId: string | null
  parentId: string | null
  forkedAt: number | null
  /** 提问索引(不含提问文本,见 question-index.ts) */
  questions: QuestionRec[]
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
 * v5:FileAgg 加 file(会话身份);Claude 的 at 改为对全部行取最大(此前只看 usage 行)。
 * v6:标题剥离 harness 噪声;无真实提问的会话 listed=false。
 * v7:FileAgg 加 questions(提问索引);标题与 listed 改由索引器同源判定
 *     ——顺带把 sidechain 行排除出"人类提问",此前它可能被当成首条提问。
 * v8:QuestionRec 由 6 元变 7 元(加内容指纹),且内容本身也变了(Claude 末叶回溯
 *     滤掉被放弃分支上的提问)。**这个号尤其不能漏**:旧缓存的记录没有第 7 位,
 *     读出来是 undefined,而 `undefined === undefined` 会让 Codex 的重放指纹校验
 *     全部"通过"并盲剥——静默剥错正是票 03b 要防的那件事。
 * v9:CodexFileAgg 加 titleFromThread(retitle 不得顶掉 thread_name,spec A4 优先级)。
 * v10:ClaudeFileAgg 加 forkPoints(票 06 分叉横幅信号)。
 *
 * **导出仅供测试**——让守卫测试能用 `CACHE_VERSION - 1` 构造"紧邻上一版"的缓存,
 * 而不是硬编码一个会随版本号增长而失效的字面量。产线代码不得据它做分支判断:
 * 唯一的版本比较在 loadCache 里,多一处就多一处会漂移的口径。
 */
export const CACHE_VERSION = 10

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
  /**
   * 需要重新起标题的会话:Codex fork 剥掉重放前缀后,原标题取自一条**已经不展示**的
   * 提问(95% 的 Codex 会话没有 thread_name,都走首条提问回退,所以这不是边角情况)。
   * 标题与提问集合必须同源——同一个概念两个数字是 spec A1 记过的教训。
   * 只带偏移不带文本:文本由 build() 按区间现读,与 spec D2a 一致。
   */
  retitle: Array<{ session: SessionMeta; file: string; start: number; end: number }>
  /**
   * 会话读白名单(票 04):**入列会话 + subagent/嵌套转写**。后者虽不入列表
   * (spec A3/A3a),但票 07 要在轮内展开它们——口径若写成"只允许已列出的",
   * 07 会被自己的白名单挡住(票 04 明写的坑)。主进程按它做区间读的入口校验。
   */
  sessionFiles: Set<string>
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
  async build(
    roots: ScanRoots,
    claudeProjectPaths: string[],
    /**
     * 已注册项目的合并键集合(注册表并集,含失效项目——它们的详情仍可打开)。
     * 白名单只收注册集内的会话:claude 的 projectKey 本就来自注册表映射,
     * ''-判据与之等价;**codex 的 projectKey 是 cwd 直接算的、恒非空**,
     * 不传显式集合就分不出注册与否。缺省(测试便利)按"非空即注册"近似,
     * 主进程必须传真实集合。
     */
    registeredKeys?: ReadonlySet<string>
  ): Promise<TokenBuildResult> {
    const isRegistered = (key: string): boolean =>
      registeredKeys ? registeredKeys.has(key) : key !== ''
    const aggs: FileAgg[] = []
    const seen: Record<string, { sig: string; agg: FileAgg }> = {}
    const sessionFiles = new Set<string>()

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
            // 白名单不宽于 UI 可达面:未注册项目的会话 UI 永远不展示(spec A2),
            // 读端也不放行——嵌套转写同理,它们的父会话都不可见
            if (isRegistered(projectKey) && (nested || agg.listed)) sessionFiles.add(file)
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
        if (isRegistered(agg.projectKey) && (s.subagent || agg.listed)) sessionFiles.add(s.file)
      }
    }

    this.cache = { version: CACHE_VERSION, files: seen }
    this.persist()
    const result = combine(aggs)
    result.sessionFiles = sessionFiles
    await retitleStripped(result.retitle)
    return result
  }

  private async aggFor(file: string, parse: () => Promise<FileAgg | null>): Promise<FileAgg | null> {
    const sig = sigOf(file)
    if (sig === null) return null
    const cached = this.cache.files[file]
    // 除版本号外再校验条目形状:同版本内的手工损坏/未来漂移一律重算,不让缺字段流进聚合层
    if (cached && cached.sig === sig && isWellFormedAgg(cached.agg)) return cached.agg
    return parse()
  }

  /**
   * 会话文件的索引是否仍与磁盘一致(签名 + 形状)。只读谓词,不触发重建——
   * 渲染层据它决定要不要先展示"正在只重建该文件索引"的中间态(票 05),
   * 随后的 sessionQuestions 才做真正的重建。两步之间文件再变也无妨:重建幂等。
   */
  isFresh(file: string): boolean {
    const cached = this.cache.files[file]
    if (!cached) return false
    const sig = sigOf(file)
    return sig !== null && cached.sig === sig && isWellFormedAgg(cached.agg)
  }

  /**
   * 会话页服务(票 04):给出某个已扫描会话的提问索引与 fork 状态。
   * - 取回前按(路径, mtime, size)签名校验;不符则**只重建该文件**的索引并回写
   *   缓存(spec C4),不全量重扫。
   * - Codex fork 的剥离与列表**同源**(同一个 stripReplayPrefix、同一个父查找),
   *   不复用 token 计量侧的剥离结论——计量是去重口径,展示是"这次对话长什么样"。
   * - 只服务白名单里的文件;不在缓存中的文件直接拒绝,由调用方引导刷新。
   */
  async sessionQuestions(
    roots: ScanRoots,
    file: string
  ): Promise<{
    side: AgentSide
    questions: QuestionRec[]
    forkState: ForkState
    title: string | null
    at: number | null
    /** Claude 主链分叉处数(横幅"本会话有 N 处分叉");Codex 恒 0 */
    forkPoints: number
    /** Codex fork 且父在扫描集内时的父会话标题/文件(stripped 与 uncertain 都给,
     * 由渲染层按档呈现);父缺失或 Claude 侧为 null */
    forkParentTitle: string | null
    forkParentFile: string | null
  }> {
    const cached = this.cache.files[file]
    if (!cached) throw appError(ERR.sessionNotIndexed)
    const sig = sigOf(file)
    if (sig === null) throw appError(ERR.sessionFileUnreadable)
    let agg = cached.agg
    if (cached.sig !== sig || !isWellFormedAgg(agg)) {
      // 侧别按数据根判定,不信可能已损坏的缓存条目
      const claudeRoot = join(roots.claudeHome, 'projects')
      let fresh: FileAgg | null
      if (file.startsWith(claudeRoot)) {
        // 顶层 = 会话(可入列),更深 = subagent 等嵌套转写——与 listJsonl 同口径。
        // projectKey 沿用旧值:它只影响归属统计,下一次全量扫描会重算;这里只为提问索引。
        const listedBase = dirname(dirname(file)) === claudeRoot
        // 类型上两支都有 projectKey;运行时缓存可能损坏(isWellFormedAgg 为 false 才走到这),再兜一层
        const oldKey = typeof agg.projectKey === 'string' ? agg.projectKey : ''
        fresh = await parseClaudeFile(file, oldKey, listedBase)
      } else {
        const meta = readCodexSessionMeta(file)
        if (!meta) throw appError(ERR.sessionMetaUnreadable)
        fresh = await parseCodexFile(
          file,
          mergeKey(meta.cwd),
          { subagent: meta.subagent, sessionId: meta.sessionId, parentId: meta.parentId, forkedAt: meta.forkedAt },
          readCodexIndex(roots.codexHome)
        )
      }
      if (!fresh) throw appError(ERR.sessionParseFailed)
      agg = fresh
      this.cache.files[file] = { sig, agg }
      this.persist()
    }
    if (agg.kind === 'claude') {
      // Claude 的分叉在索引阶段就由末叶回溯消解,没有"重放前缀"这回事
      return {
        side: 'claude',
        questions: agg.questions,
        forkState: 'none',
        title: agg.title,
        at: agg.at,
        forkPoints: agg.forkPoints,
        forkParentTitle: null,
        forkParentFile: null
      }
    }
    let parent: FileAgg | undefined
    if (agg.parentId) {
      for (const v of Object.values(this.cache.files)) {
        if (v.agg.kind === 'codex' && v.agg.sessionId === agg.parentId && v.agg !== agg) {
          parent = v.agg
          break
        }
      }
    }
    const shown = stripReplayPrefix(
      agg.questions,
      parent && parent.kind === 'codex' ? parent.questions : null,
      agg.forkedAt,
      agg.parentId !== null
    )
    return {
      side: 'codex',
      questions: shown.questions,
      forkState: shown.state,
      title: agg.title,
      at: agg.at,
      forkPoints: 0,
      forkParentTitle: parent?.title ?? null,
      forkParentFile: parent?.file ?? null
    }
  }
}


/**
 * 按字节区间现读那一行,重新起标题。只对被剥掉重放前缀的 Codex fork 会话跑,
 * 数量极少(本机真实数据为 0),每个只读一行,不构成扫描开销。
 * 读失败就保留原标题——降级只自伤:一个会话标题旧,不牵连别的会话、不拖垮扫描。
 */
async function retitleStripped(items: TokenBuildResult['retitle']): Promise<void> {
  for (const it of items) {
    try {
      const buf: Buffer[] = []
      const rs = createReadStream(it.file, { start: it.start, end: Math.max(it.start, it.end - 1) })
      for await (const c of rs as AsyncIterable<Buffer>) buf.push(c)
      const obj: unknown = JSON.parse(Buffer.concat(buf).toString('utf8'))
      const msg = (obj as Record<string, unknown>)?.['payload'] as Record<string, unknown> | undefined
      const text = typeof msg?.['message'] === 'string' ? (msg['message'] as string) : null
      const clean = text === null ? null : realUserText(text)
      if (clean !== null) it.session.title = clipTitle(clean)
    } catch {
      // 保留原标题
    }
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
  const retitle: TokenBuildResult['retitle'] = []
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
      file: agg.file,
      questionCount: agg.questions.length,
      // Claude 侧的分叉在索引阶段就由末叶回溯消解了,不存在"重放前缀"这回事
      forkState: 'none'
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
        // 展示口径的剥离**在这里做**,不在 parser 里:它要看父会话的索引,而缓存是
        // 按文件存的,parser 阶段拿不到父。也**不复用 token 侧那个 start**——
        // 计量口径是去重、展示口径是"这次对话看起来什么样",语义不同(票 03b 验收)。
        const forkParent = a.parentId ? bySessionId.get(a.parentId) : undefined
        const shown = stripReplayPrefix(
          a.questions,
          forkParent && forkParent !== a ? forkParent.questions : null,
          a.forkedAt,
          a.parentId !== null
        )
        // 已验证剥空(每条提问都经指纹核实为重放、fork 后无新提问)的会话不入列,
        // token 照计(2026-08-05 裁定,与 A3a 同构)。剥空只能出自指纹校验路径:
        // 启发式绝不剥空,本就没提问的会话 listed 在解析期已是 false。白名单仍按
        // 剥前口径——其内容全是已可读父会话的重放,不扩大读端暴露面,而收窄要把
        // 白名单决策挪到 combine 之后,改动面大于收益。
        if (shown.questions.length > 0) {
          const meta: SessionMeta = {
            side: 'codex',
            title: a.title,
            at: a.at,
            tokens: totals.total,
            file: a.file,
            questionCount: shown.questions.length,
            forkState: shown.state
          }
          p.sessions.push(meta)
          // 剥掉了开头若干条、且原标题来自首条提问 → 按存活首条重起;
          // thread_name 的优先级(spec A4)不因剥离而失效
          if (!a.titleFromThread && shown.questions.length < a.questions.length) {
            const first = shown.questions[0]
            retitle.push({ session: meta, file: a.file, start: first[0], end: first[1] })
          }
        }
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
  return { global, perProject, rows: [...rowMap.values()], liveDays, retitle, sessionFiles: new Set<string>() }
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
  // file 是会话身份,缺了会一路流到契约层抛掉整份详情(上层逃逸)。
  // **给 FileAgg 加必填字段时,这里同步加一条**——版本号只拦得住跨版本,
  // 同版本内的手工损坏与漂移只有这道守卫。
  if (typeof a['file'] !== 'string' || a['file'] === '') return false
  const qs = a['questions']
  if (!Array.isArray(qs)) return false
  // 记录**元数**也要守:版本号只拦跨版本,同版本内的手工损坏与未来漂移只有这道闸。
  // 少一位会让指纹比对退化成 undefined === undefined,恒真,于是盲剥。
  if (qs.length > 0 && (!Array.isArray(qs[0]) || (qs[0] as unknown[]).length !== 7)) return false
  // forkPoints 缺失(undefined)会让横幅判定拿到假值,同版本内的损坏只有这道闸拦
  if (a['kind'] === 'claude') return Array.isArray(a['entries']) && typeof a['forkPoints'] === 'number'
  // titleFromThread 缺失(undefined)是假 false:会让 thread_name 会话被 retitle 顶掉
  if (a['kind'] === 'codex') return Array.isArray(a['events']) && typeof a['titleFromThread'] === 'boolean'
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

const SYNTHETIC = '<synthetic>'

async function parseClaudeFile(
  file: string,
  projectKey: string,
  listed: boolean
): Promise<ClaudeFileAgg | null> {
  const entries: PackedEntry[] = []
  let lastAt: number | null = null
  // 提问索引与标题同源:哪一行算"首条真实提问"只有索引器一个判断点
  const idx = makeQuestionIndexer('claude')
  let fileEnd = 0
  try {
    await eachJsonlLine(file, (obj, start, end) => {
      idx.line(obj, start, end)
      fileEnd = end
      const msg = obj['message'] as Record<string, unknown> | undefined
      // 时间戳在 usage 判断**之前**取:at = 文件内最大时间戳(与 Codex 侧同义)。
      // 只看 usage 行会漏掉用户消息——它没有 usage 字段,而"用户最后问的那句话"
      // 正是最后活动。实测 118 个真实会话,45% 的末行时间戳晚于末条 usage 行。
      const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp'] as string) : NaN
      if (!Number.isNaN(ts)) lastAt = lastAt === null ? ts : Math.max(lastAt, ts)
      const usage = msg?.['usage'] as Record<string, unknown> | undefined
      if (!usage) return
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
  const questions = idx.done(fileEnd)
  // 索引器已经剥完噪声、也已按末叶回溯滤过,这里只负责截断成型。
  // **不要再过一遍 realUserText**——剥离不幂等,见 session-title.ts。
  const first = idx.firstQuestionText()
  const title = first === null ? null : clipTitle(first)
  return {
    kind: 'claude',
    file,
    forkPoints: idx.forkPoints(),
    projectKey,
    // 没有任何真实提问的会话不入列(spec A3a)。实测某项目 1511 个会话里
    // 1004 个只有一条 Warmup —— 照列会让 66% 的行是 uuid 文件名,而本功能
    // 要回答的正是"我提过的那个问题在哪"。token 照计,与 subagent 同口径。
    listed: listed && questions.length > 0,
    title: title ?? file.split('/').pop()?.replace(/\.jsonl$/, '') ?? null,
    at: lastAt ?? fallbackAt,
    questions,
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
  // 提问索引与标题同源(与 Claude 侧同一套剥离规则),并决定本会话是否入列
  const idx = makeQuestionIndexer('codex')
  let fileEnd = 0
  try {
    await eachJsonlLine(file, (obj, start, end) => {
      idx.line(obj, start, end)
      fileEnd = end
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
  const stem = file.split('/').pop()?.replace(/\.jsonl$/, '') ?? null
  const questions = idx.done(fileEnd)
  const first = idx.firstQuestionText()
  const realTitle = first === null ? null : clipTitle(first)
  const threadName = id ? titles.get(id) : undefined
  return {
    kind: 'codex',
    file,
    projectKey,
    // 与 Claude 侧同口径(spec A3a):没有任何真实提问的会话不入列,token 照计
    listed: !meta.subagent && questions.length > 0,
    // 标题优先 thread_name(Codex 自己起的名字比首条提问更概括),无则退回首条提问
    title: threadName ?? realTitle ?? stem,
    titleFromThread: threadName !== undefined,
    // 没有 mtime 兜底(Claude 侧有)——不是遗漏:Codex 的 session_meta 必带顶层
    // timestamp(真实样本核实),首行不可解析时 readCodexSessions 直接跳过该文件、
    // 根本不会走到这里。所以 lastTs 为 null 是不可达分支,不为它加兜底代码。
    at: lastTs,
    model,
    sessionId: meta.sessionId,
    parentId: meta.parentId,
    forkedAt: meta.forkedAt,
    questions,
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
