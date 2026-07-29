// Token 聚合引擎(票04):两侧会话 jsonl 流式解析 → 全局与每项目统计。
// 增量缓存按(路径, mtime, size)键;原子写;坏行跳过不弃文件。
// 口径:总量 = input + output,cache 读写单列不计入;统计含隐藏/失效项目(浏览过滤≠数据排除)。
// Codex 按模型拆分为近似:整会话记到最后一条 turn_context 的 model(累计口径无法逐模型拆)。
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import type { AgentSide, ProjectStats, TokenStats, TokenTotals } from '@shared/domain'
import { emptyTokenStats, emptyTotals } from '@shared/domain'
import { mergeKey } from '@shared/path-key'
import { encodeClaudeProjectDir } from './claude'
import { readCodexSessions } from './codex'
import type { ScanRoots } from './types'

interface FileAgg {
  side: AgentSide
  /** 归属项目的合并键;无法归属为 '' */
  projectKey: string
  totals: TokenTotals
  byModel: Record<string, number>
  byDay: Record<string, number>
  /** 会话元数据;listed=false(subagent)时计 token 不入列表 */
  session: { title: string; at: number | null; tokens: number; listed: boolean }
}

interface CacheShape {
  version: 1
  files: Record<string, { sig: string; agg: FileAgg }>
}

export interface TokenBuildResult {
  global: TokenStats
  perProject: Map<string, ProjectStats>
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
        (raw as Record<string, unknown>)['version'] === 1 &&
        typeof (raw as Record<string, unknown>)['files'] === 'object'
      ) {
        return raw as unknown as CacheShape
      }
    } catch {
      // 缓存缺失/损坏:全量重算
    }
    return { version: 1, files: {} }
  }

  private persist(): void {
    mkdirSync(this.cacheDir, { recursive: true })
    const tmp = join(this.cacheDir, `.token-cache.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify(this.cache))
    renameSync(tmp, this.cacheFile)
  }

  async build(roots: ScanRoots, claudeProjectPaths: string[]): Promise<TokenBuildResult> {
    const aggs: FileAgg[] = []
    const seen: Record<string, { sig: string; agg: FileAgg }> = {}

    // ── Claude:项目编码目录下的 *.jsonl ──
    for (const projectPath of claudeProjectPaths) {
      const dir = join(roots.claudeHome, 'projects', encodeClaudeProjectDir(projectPath))
      if (!existsSync(dir)) continue
      let names: string[]
      try {
        names = readdirSync(dir).filter((n) => n.endsWith('.jsonl'))
      } catch {
        continue
      }
      for (const name of names) {
        const file = join(dir, name)
        const agg = await this.aggFor(file, () => parseClaudeFile(file, mergeKey(projectPath)))
        if (agg) {
          aggs.push(agg)
          seen[file] = { sig: sigOf(file) ?? '', agg }
        }
      }
    }

    // ── Codex:sessions 下 rollout,首行 cwd 归属 ──
    const titles = readCodexIndex(roots.codexHome)
    for (const s of readCodexSessions(roots.codexHome)) {
      const agg = await this.aggFor(s.file, () =>
        parseCodexFile(s.file, mergeKey(s.cwd), s.subagent, titles)
      )
      if (agg) {
        aggs.push(agg)
        seen[s.file] = { sig: sigOf(s.file) ?? '', agg }
      }
    }

    this.cache = { version: 1, files: seen }
    this.persist()
    return combine(aggs)
  }

  private async aggFor(file: string, parse: () => Promise<FileAgg | null>): Promise<FileAgg | null> {
    const sig = sigOf(file)
    if (sig === null) return null
    const cached = this.cache.files[file]
    if (cached && cached.sig === sig) return cached.agg
    return parse()
  }
}

function sigOf(file: string): string | null {
  try {
    const st = statSync(file)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return null
  }
}

function combine(aggs: FileAgg[]): TokenBuildResult {
  const global = emptyTokenStats()
  const globalModels = new Map<string, number>()
  const globalDays = new Map<string, { claude: number; codex: number }>()
  const perProject = new Map<string, ProjectStats>()

  for (const a of aggs) {
    addTotals(global.bySide[a.side], a.totals)
    for (const [model, v] of Object.entries(a.byModel)) {
      const k = `${a.side}:${model}`
      globalModels.set(k, (globalModels.get(k) ?? 0) + v)
    }
    for (const [day, v] of Object.entries(a.byDay)) {
      const d = globalDays.get(day) ?? { claude: 0, codex: 0 }
      d[a.side] += v
      globalDays.set(day, d)
    }
    if (a.projectKey) {
      const p = perProject.get(a.projectKey) ?? { tokens: emptyTokenStats(), sessions: [] }
      addTotals(p.tokens.bySide[a.side], a.totals)
      mergeModelList(p.tokens, a)
      mergeDayList(p.tokens, a)
      if (a.session.listed) {
        p.sessions.push({ side: a.side, title: a.session.title, at: a.session.at, tokens: a.session.tokens })
      }
      perProject.set(a.projectKey, p)
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
  return { global, perProject }
}

function mergeModelList(stats: TokenStats, a: FileAgg): void {
  for (const [model, v] of Object.entries(a.byModel)) {
    const found = stats.byModel.find((m) => m.model === model && m.side === a.side)
    if (found) found.total += v
    else stats.byModel.push({ model, side: a.side, total: v })
  }
}
function mergeDayList(stats: TokenStats, a: FileAgg): void {
  for (const [day, v] of Object.entries(a.byDay)) {
    const found = stats.byDay.find((d) => d.day === day)
    if (found) found[a.side] += v
    else stats.byDay.push({ day, claude: a.side === 'claude' ? v : 0, codex: a.side === 'codex' ? v : 0 })
  }
}

function addTotals(into: TokenTotals, from: TokenTotals): void {
  into.input += from.input
  into.output += from.output
  into.cacheRead += from.cacheRead
  into.cacheWrite += from.cacheWrite
  into.total += from.total
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

async function parseClaudeFile(file: string, projectKey: string): Promise<FileAgg | null> {
  const totals = emptyTotals()
  const byModel: Record<string, number> = {}
  const byDay: Record<string, number> = {}
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
      const input = num(usage['input_tokens'])
      const output = num(usage['output_tokens'])
      totals.input += input
      totals.output += output
      totals.cacheRead += num(usage['cache_read_input_tokens'])
      totals.cacheWrite += num(usage['cache_creation_input_tokens'])
      totals.total += input + output
      const model = typeof msg?.['model'] === 'string' ? (msg['model'] as string) : 'unknown'
      byModel[model] = (byModel[model] ?? 0) + input + output
      const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp'] as string) : NaN
      if (!Number.isNaN(ts)) {
        lastAt = lastAt === null ? ts : Math.max(lastAt, ts)
        const day = localDay(ts)
        byDay[day] = (byDay[day] ?? 0) + input + output
      }
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
    side: 'claude',
    projectKey,
    totals,
    byModel,
    byDay,
    session: {
      title: title ?? file.split('/').pop()?.replace(/\.jsonl$/, '') ?? '会话',
      at: lastAt ?? fallbackAt,
      tokens: totals.total,
      listed: true
    }
  }
}

async function parseCodexFile(
  file: string,
  projectKey: string,
  subagent: boolean,
  titles: Map<string, string>
): Promise<FileAgg | null> {
  let last: Record<string, unknown> | null = null
  let model = 'unknown'
  let firstTs: number | null = null
  try {
    await eachLine(file, (obj) => {
      const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp'] as string) : NaN
      if (firstTs === null && !Number.isNaN(ts)) firstTs = ts
      if (obj['type'] === 'turn_context') {
        const m = (obj['payload'] as Record<string, unknown> | undefined)?.['model']
        if (typeof m === 'string') model = m
      }
      if (obj['type'] === 'token_count') {
        const info = obj['info'] as Record<string, unknown> | undefined
        const usage = info?.['total_token_usage'] as Record<string, unknown> | undefined
        if (usage) last = usage
      }
    })
  } catch {
    return null
  }
  const totals = emptyTotals()
  if (last !== null) {
    const usage = last as Record<string, unknown>
    totals.input = num(usage['input_tokens'])
    totals.output = num(usage['output_tokens'])
    totals.cacheRead = num(usage['cached_input_tokens'])
    totals.cacheWrite = num(usage['cache_write_input_tokens'])
    totals.total = totals.input + totals.output
  }
  const byDay: Record<string, number> = {}
  if (firstTs !== null && totals.total > 0) byDay[localDay(firstTs)] = totals.total
  const id = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(file)?.[1]
  const stem = file.split('/').pop()?.replace(/\.jsonl$/, '') ?? '会话'
  return {
    side: 'codex',
    projectKey,
    totals,
    byModel: totals.total > 0 ? { [model]: totals.total } : {},
    byDay,
    session: {
      title: (id ? titles.get(id) : undefined) ?? stem,
      at: firstTs,
      tokens: totals.total,
      listed: !subagent
    }
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
