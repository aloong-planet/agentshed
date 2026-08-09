// The token aggregation engine (aligned with ccusage, 2026-07-30; the source-level basis is in ADR-0005):
// - Claude: recursively scan **the whole tree** under claudeHome/projects (independent of the project
//   registry; unregistered directories count toward the global total);
//   each usage line becomes an entry, and the aggregation layer deduplicates across files — the exact
//   key is message.id+requestId, falling back to message.id-only when either side is isSidechain
//   (a subagent replays its parent's messages under a new requestId); keep the non-sidechain one,
//   otherwise the one with the larger four-field token sum. The total rule = input+output+cacheRead+cacheWrite;
//   entries whose model is '<synthetic>' or missing count toward the total but do not enter a model bucket.
// - Codex: per-turn last_token_usage increment events (payload.type=token_count inside event_msg);
//   a fork or subagent session replays its parent's history, stripped by the same rules as ccusage's
//   replay.rs — take the parent's event sequence before the fork moment and skip entries at the start
//   of the child that match it by value (if the very first does not match, strip nothing);
//   accounting: sanitise input (subtract cached), count cached as cacheRead, sum all four as total;
//   the model comes from the last turn_context (an approximation of the session's primary model).
// - The incremental cache stores entry-level data (deduplication has to happen across files, in the
//   aggregation layer, so a deduplicated result cannot be what is cached);
//   keyed by (path, mtime, size), written atomically. The statistics include hidden and stale projects.
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

/** One Claude usage entry (encoded into the cache as a compact array): [mid, rid, sc, in, out, cr, cw, model, day] */
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
  /** The source file's absolute path — the session's identity, sent to the renderer with SessionMeta */
  file: string
  projectKey: string
  listed: boolean
  title: string | null
  at: number | null
  /** The question index (with no question text, see question-index.ts) */
  questions: QuestionRec[]
  /** The number of branch points on the main chain (ticket 06's banner: "this session has N branch points"; 0 = a linear session, no banner) */
  forkPoints: number
  entries: PackedEntry[]
}

/** One Codex per-turn usage event: [ts, input, cached, output, cacheWrite] */
type CodexEvent = [number | null, number, number, number, number]

interface CodexFileAgg {
  kind: 'codex'
  /** The source file's absolute path — the session's identity, sent to the renderer with SessionMeta */
  file: string
  projectKey: string
  listed: boolean
  title: string | null
  at: number | null
  model: string
  /** Whether the title came from session_index's thread_name. A retitle may only change a title that
   * came from the first question — thread_name's priority (spec A4) is not invalidated by stripping. */
  titleFromThread: boolean
  sessionId: string | null
  parentId: string | null
  forkedAt: number | null
  /** The question index (with no question text, see question-index.ts) */
  questions: QuestionRec[]
  /** Per-turn increment events (last_token_usage); a fork's replay prefix is stripped in the combine stage */
  events: CodexEvent[]
}

type FileAgg = ClaudeFileAgg | CodexFileAgg

/**
 * The cache structure version. **Changing FileAgg's shape requires bumping this at the same time** —
 * otherwise an old cache is read as the new structure and crashes where a field is missing (the
 * 2026-07-30 production incident: the Codex agg changed from totals/byDay to events
 * without a version bump, and after the old cache hit, a.events was undefined).
 *
 * **Changing how a field in FileAgg is computed also requires a bump** (added 2026-08-02): the cache
 * hits on (path, mtime, size), so an unchanged file returns the old value directly and the new
 * algorithm never takes effect for existing files.
 * Fixtures with a fresh cache always pass, real users never see the fix — a textbook false green.
 * v4: Codex's `at` changed from the first timestamp to the largest timestamp in the file.
 * v5: FileAgg gained `file` (the session's identity); Claude's `at` now takes the maximum over all
 *     lines (it previously looked only at usage lines).
 * v6: titles strip harness noise; a session with no real question gets listed=false.
 * v7: FileAgg gained `questions` (the question index); the title and `listed` are now judged from the
 *     same source, the indexer
 *     — which incidentally excluded sidechain lines from "human questions"; one could previously be
 *     taken for the first question.
 * v8: QuestionRec went from 6 elements to 7 (adding the content fingerprint), and the contents changed
 *     too (Claude's last-leaf walk-back
 *     filters out questions on abandoned branches). **This bump especially must not be missed**: an old
 *     cache's records have no 7th element,
 *     which reads back as undefined, and `undefined === undefined` would make Codex's replay
 *     fingerprint check "pass" every time and strip blindly — a silent mis-strip being exactly what
 *     ticket 03b exists to prevent.
 * v9: CodexFileAgg gained titleFromThread (a retitle must not displace thread_name, spec A4's priority).
 * v10: ClaudeFileAgg gained forkPoints (ticket 06's branch banner signal).
 *
 * **Exported for tests only** — so a guard test can build an "immediately previous version" cache with
 * `CACHE_VERSION - 1`
 * rather than hard-coding a literal that goes stale as the version grows. Production code must not
 * branch on it:
 * the only version comparison is in loadCache, and a second one would be a second rule that can drift.
 */
export const CACHE_VERSION = 10

interface CacheShape {
  version: typeof CACHE_VERSION
  files: Record<string, { sig: string; agg: FileAgg }>
}

export interface TokenBuildResult {
  global: TokenStats
  perProject: Map<string, ProjectStats>
  /** Archive rows (day × side × project × model), for UsageArchive to persist */
  rows: UsageRow[]
  /** The days whose source data this scan can still see (used by the archive conflict rule) */
  liveDays: Set<string>
  /**
   * Sessions needing a new title: once a Codex fork's replay prefix is stripped, the original title
   * came from a question that is **no longer displayed** (95% of Codex sessions have no thread_name and
   * fall back to the first question, so this is not a corner case).
   * The title and the question set must share a source — the same concept with two numbers is the
   * lesson recorded in spec A1.
   * Only offsets, no text: build() reads the text live by range, consistent with spec D2a.
   */
  retitle: Array<{ session: SessionMeta; file: string; start: number; end: number }>
  /**
   * The session read allow-list (ticket 04): **listed sessions + subagent and nested transcripts**.
   * The latter do not enter the list (spec A3/A3a), but ticket 07 needs to expand them inside a turn —
   * writing the rule as "only what is already listed" would have blocked 07 with our own allow-list
   * (a trap ticket 04 wrote down explicitly). The main process validates range-read entry points against it.
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
      // Cache missing / corrupt / an old version: recompute everything
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
   * claudeProjectPaths is used only for the "encoded directory name → project" attribution mapping;
   * the global statistics cover the whole projects tree and are independent of that list.
   */
  async build(
    roots: ScanRoots,
    claudeProjectPaths: string[],
    /**
     * The set of merge keys for registered projects (the registry union, including stale ones — their
     * detail pages still open).
     * The allow-list admits only sessions in the registered set: Claude's projectKey already comes from
     * the registry mapping,
     * so the ''-emptiness criterion is equivalent for it; **Codex's projectKey is computed straight from
     * cwd and is never empty**,
     * so without an explicit set there is no telling registered from not. The default (for test
     * convenience) approximates it as "non-empty means registered",
     * and the main process must pass the real set.
     */
    registeredKeys?: ReadonlySet<string>
  ): Promise<TokenBuildResult> {
    const isRegistered = (key: string): boolean =>
      registeredKeys ? registeredKeys.has(key) : key !== ''
    const aggs: FileAgg[] = []
    const seen: Record<string, { sig: string; agg: FileAgg }> = {}
    const sessionFiles = new Set<string>()

    // Encoded directory name → the project's merge key
    const encToProject = new Map<string, string>()
    for (const p of claudeProjectPaths) encToProject.set(encodeClaudeProjectDir(p), mergeKey(p))

    // ── Claude: the whole projects tree ──
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
            // The allow-list is no wider than what the UI can reach: an unregistered project's sessions
            // are never displayed (spec A2),
            // so the read side does not admit them either — the same goes for nested transcripts, whose
            // parent sessions are all invisible
            if (isRegistered(projectKey) && (nested || agg.listed)) sessionFiles.add(file)
          }
        }
      }
    }

    // ── Codex: the whole sessions tree, attributed by the first line's cwd ──
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
    // Beyond the version, validate each entry's shape: manual corruption or future drift within one
    // version is always recomputed, so a missing field never flows into the aggregation layer
    if (cached && cached.sig === sig && isWellFormedAgg(cached.agg)) return cached.agg
    return parse()
  }

  /**
   * Whether a session file's index still matches disk (signature + shape). A read-only predicate that
   * triggers no rebuild —
   * the renderer uses it to decide whether to show the interim "rebuilding the index for this file only"
   * state (ticket 05),
   * and the sessionQuestions call that follows does the actual rebuild. The file changing between the
   * two steps is harmless: the rebuild is idempotent.
   */
  isFresh(file: string): boolean {
    const cached = this.cache.files[file]
    if (!cached) return false
    const sig = sigOf(file)
    return sig !== null && cached.sig === sig && isWellFormedAgg(cached.agg)
  }

  /**
   * The session page service (ticket 04): give a scanned session's question index and fork state.
   * - Validate the (path, mtime, size) signature before fetching; on a mismatch, **rebuild only that
   *   file's** index and write
   *   the cache back (spec C4), without a full rescan.
   * - A Codex fork's stripping **shares its source** with the list (the same stripReplayPrefix and the
   *   same parent lookup),
   *   rather than reusing the token metering side's conclusions — metering is a deduplication rule,
   *   display is "what this conversation looks like".
   * - Serves only allow-listed files; a file not in the cache is refused outright and the caller
   *   guides the user to refresh.
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
    /** The number of branch points on Claude's main chain (the "this session has N branch points" banner); always 0 for Codex */
    forkPoints: number
    /** For a Codex fork whose parent is in the scan set, the parent session's title and file (given for
     * both stripped and uncertain, with the renderer presenting them per tier); null when the parent is
     * missing or on the Claude side */
    forkParentTitle: string | null
    forkParentFile: string | null
  }> {
    const cached = this.cache.files[file]
    if (!cached) throw appError(ERR.sessionNotIndexed)
    const sig = sigOf(file)
    if (sig === null) throw appError(ERR.sessionFileUnreadable)
    let agg = cached.agg
    if (cached.sig !== sig || !isWellFormedAgg(agg)) {
      // The side is judged from the data root, not trusted to a possibly corrupt cache entry
      const claudeRoot = join(roots.claudeHome, 'projects')
      let fresh: FileAgg | null
      if (file.startsWith(claudeRoot)) {
        // Top level = a session (listable), deeper = a subagent or other nested transcript — the same
        // rule as listJsonl.
        // projectKey keeps its old value: it only affects attribution statistics and the next full scan
        // recomputes it; here it exists only for the question index.
        const listedBase = dirname(dirname(file)) === claudeRoot
        // Both branches have projectKey in the types; the runtime cache may be corrupt (we only reach
        // here when isWellFormedAgg is false), so add one more layer of defence
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
      // Claude's branches are resolved by the last-leaf walk-back at indexing time, so there is no such
      // thing as a "replay prefix" here
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
 * Read that line live by byte range and derive a new title. Runs only for Codex fork sessions whose
 * replay prefix was stripped,
 * of which there are very few (0 in this machine's real data), each reading a single line, so it adds
 * no meaningful scan cost.
 * A read failure keeps the original title — degradation only hurts itself: one session has a stale
 * title, without affecting other sessions or dragging down the scan.
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
      // Keep the original title
    }
  }
}

// ── Aggregation (including cross-file deduplication) ──

interface KeptEntry {
  e: PackedEntry
  fileIdx: number
}

function entryTotal(e: PackedEntry): number {
  return e[3] + e[4] + e[5] + e[6]
}

/** Non-sidechain wins; otherwise the one with the larger four-field sum */
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
        // Sidechain fallback: match by message.id-only when either side is a sidechain
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
  // Accumulate archive rows: keyed day|side|project|model
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

  // ── Claude: deduplicate at entry level, then aggregate ──
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
  // Claude session entries (top-level files; tokens = the sum of the entries this file keeps after dedup)
  claudeFiles.forEach(({ agg, fileIdx }) => {
    if (!agg.listed || !agg.projectKey) return
    projectOf(agg.projectKey).sessions.push({
      side: 'claude',
      title: agg.title,
      at: agg.at,
      tokens: perFileTokens.get(fileIdx) ?? 0,
      file: agg.file,
      questionCount: agg.questions.length,
      // Claude's branches are resolved by the last-leaf walk-back at indexing time, so there is no such
      // thing as a "replay prefix"
      forkState: 'none'
    })
  })

  // ── Codex: strip the fork/subagent replay prefix first, then aggregate event by event ──
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
        // The parent log is not in the scan set: degrade to the "rewrite burst" heuristic
        start = skipRewrittenBurst(a.events)
      } else {
        // The parent session's events before the fork moment are the history this session replays.
        // Consistent with ccusage: cut at the first timestamp later than the fork moment rather than
        // filtering everything
        // (the two are not equivalent when the parent's event timestamps are not strictly ordered, and
        // filtering would strip too much).
        let replayLen = parent.events.length
        if (a.forkedAt !== null) {
          const pos = parent.events.findIndex((e) => e[0] !== null && e[0] > (a.forkedAt as number))
          if (pos !== -1) replayLen = pos
        }
        const prefix = parent.events.slice(0, replayLen)
        while (start < a.events.length && start < prefix.length && sameUsage(prefix[start], a.events[start])) {
          start++
        }
        // The very first does not match → the parent stream cannot anchor this replay (the log was
        // rewritten), so degrade to the burst heuristic
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
      // The four fields are apportioned by that day's share of the total (Codex increment events are
      // already aggregated by day, and the four fields have no independent source)
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
        // The display-side stripping happens **here**, not in the parser: it needs the parent session's
        // index, and the cache is
        // stored per file, so the parser cannot reach the parent. It also **does not reuse the token
        // side's `start`** —
        // metering is a deduplication rule and display is "what this conversation looks like"; they mean
        // different things (ticket 03b's acceptance).
        const forkParent = a.parentId ? bySessionId.get(a.parentId) : undefined
        const shown = stripReplayPrefix(
          a.questions,
          forkParent && forkParent !== a ? forkParent.questions : null,
          a.forkedAt,
          a.parentId !== null
        )
        // A session verified to have been stripped empty (every question fingerprint-verified as a replay,
        // with no new question after the fork) is not listed,
        // and its tokens still count (ruled 2026-08-05, structurally identical to A3a). Stripping empty
        // can only come from the fingerprint path:
        // the heuristic never strips empty, and a session that never had questions already has
        // listed=false from parse time. The allow-list still follows
        // the pre-strip rule — its contents are entirely replays of an already-readable parent session,
        // so it does not widen the read exposure surface, while narrowing it would mean moving
        // the allow-list decision after combine, a bigger change than the benefit.
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
          // Some leading entries were stripped and the original title came from the first question →
          // re-derive it from the first survivor;
          // thread_name's priority (spec A4) is not invalidated by stripping
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

/** A rewrite burst (the same rule as ccusage's detect_rewritten_burst): if the first two events are
 * ≤1s apart, treat the start as copied history and skip forward to the first gap > 1s */
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

// ── File enumeration and parsing ──

/** Every jsonl under a directory: top level = a session, nested = a subagent or other transcript */
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

/** Whether a cache entry matches the current FileAgg shape (the array fields the aggregation layer depends on must be present) */
function isWellFormedAgg(agg: unknown): agg is FileAgg {
  if (typeof agg !== 'object' || agg === null) return false
  const a = agg as Record<string, unknown>
  // `file` is the session's identity; missing it flows all the way to the contract layer and throws away
  // the whole detail payload (upward escape).
  // **When adding a required field to FileAgg, add a line here at the same time** — the version number
  // only catches across versions,
  // and manual corruption or drift within one version is caught only by this guard.
  if (typeof a['file'] !== 'string' || a['file'] === '') return false
  const qs = a['questions']
  if (!Array.isArray(qs)) return false
  // The record's **arity** needs guarding too: the version number only catches across versions, and
  // manual corruption or future drift within one version is caught only by this gate.
  // One element short degrades the fingerprint comparison into undefined === undefined, which is always
  // true, and so strips blindly.
  if (qs.length > 0 && (!Array.isArray(qs[0]) || (qs[0] as unknown[]).length !== 7)) return false
  // A missing forkPoints (undefined) gives the banner judgement a false value, and corruption within one
  // version is caught only by this gate
  if (a['kind'] === 'claude') return Array.isArray(a['entries']) && typeof a['forkPoints'] === 'number'
  // A missing titleFromThread (undefined) is a false false: it lets a retitle displace a thread_name session
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

/** A local-time-zone day key, YYYY-MM-DD (spec: the trend cuts days in local time) */
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
  // The question index and the title share a source: only the indexer decides which line is "the first
  // real question"
  const idx = makeQuestionIndexer('claude')
  let fileEnd = 0
  try {
    await eachJsonlLine(file, (obj, start, end) => {
      idx.line(obj, start, end)
      fileEnd = end
      const msg = obj['message'] as Record<string, unknown> | undefined
      // The timestamp is taken **before** the usage check: at = the largest timestamp in the file (the
      // same meaning as on the Codex side).
      // Looking only at usage lines misses user messages — they have no usage field, and "the last thing
      // the user asked"
      // is exactly the last activity. Measured over 118 real sessions, 45% have a last-line timestamp
      // later than the last usage line.
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
  // The indexer has already stripped the noise and filtered by the last-leaf walk-back; this is only
  // responsible for truncating into shape.
  // **Do not run realUserText again** — stripping is not idempotent, see session-title.ts.
  const first = idx.firstQuestionText()
  const title = first === null ? null : clipTitle(first)
  return {
    kind: 'claude',
    file,
    forkPoints: idx.forkPoints(),
    projectKey,
    // A session with no real question at all is not listed (spec A3a). Measured: of one project's 1511
    // sessions,
    // 1004 have a single Warmup — listing them would make 66% of the rows uuid filenames, while what this
    // feature
    // answers is exactly "where is that question I asked". The tokens still count, the same rule as
    // subagents.
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
  // at = the largest timestamp in the file (the same meaning as on the Claude side = last activity). It
  // previously took the first timestamp,
  // which is especially wrong for a fork session — the first line's timestamp is the replay moment,
  // neither the start nor the end.
  let lastTs: number | null = null
  // The question index and the title share a source (the same stripping rules as the Claude side), and
  // decide whether this session is listed
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
      // The real shape: top-level type=event_msg with the data in payload.info (payload.type=token_count);
      // take last_token_usage as a per-turn increment (one turn may be reported more than once, which
      // fork stripping and the difference rule handle)
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
    // The same rule as the Claude side (spec A3a): a session with no real question is not listed, and its
    // tokens still count
    listed: !meta.subagent && questions.length > 0,
    // The title prefers thread_name (the name Codex gave itself summarises better than the first
    // question), falling back to the first question
    title: threadName ?? realTitle ?? stem,
    titleFromThread: threadName !== undefined,
    // There is no mtime fallback (the Claude side has one) — not an omission: Codex's session_meta always
    // carries a top-level
    // timestamp (verified against real samples), and when the first line will not parse readCodexSessions
    // skips the file outright and
    // never reaches here. So lastTs being null is an unreachable branch, and no fallback is written for it.
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
        // Skip bad lines
      }
    }
  } catch {
    // The index cannot be read: the title falls back to the filename
  }
  return out
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Cache write volume: where a cache_creation breakdown object exists, take the sum of ephemeral_5m and
 * ephemeral_1h,
 * otherwise take the flat cache_creation_input_tokens (the same rule as ccusage's
 * TokenUsageRaw::cache_creation_token_count).
 * Measured against real data, the two can differ (2 lines on 2026-07-13 differ by 894).
 */
function cacheCreationOf(usage: Record<string, unknown>): number {
  const detail = usage['cache_creation']
  if (typeof detail === 'object' && detail !== null) {
    const d = detail as Record<string, unknown>
    return num(d['ephemeral_5m_input_tokens']) + num(d['ephemeral_1h_input_tokens'])
  }
  return num(usage['cache_creation_input_tokens'])
}
