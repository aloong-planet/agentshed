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
//   the same turn can be re-reported, so a record whose running cumulative has not advanced
//   contributes nothing and one with no per-turn figure contributes the difference of the cumulatives;
//   accounting: sanitise input (subtract cached), count cached as cacheRead, total = input + output
//   (cache creation is not collected on this side or on Grok's — ADR-0023);
//   the model comes from the last turn_context (an approximation of the session's primary model).
// - The incremental cache stores entry-level data (deduplication has to happen across files, in the
//   aggregation layer, so a deduplicated result cannot be what is cached);
//   keyed by (path, mtime, size), written atomically. The statistics include stale projects.
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AgentSide,
  ForkState,
  ProjectStats,
  SessionMeta,
  TokenStats,
  TokenTotals
} from '@shared/domain'
import { emptyTokenStats, emptyTotals } from '@shared/domain'
import { deriveStats } from '@shared/usage'
import { mergeKey } from '@shared/path-key'
import { localDay } from '@shared/format'
import { ERR, appError } from '@shared/errors'
import { encodeClaudeProjectDir } from './claude'
import { readCodexSessionMeta, readCodexSessions } from './codex'
import { readGrokSessions } from './grok'
import { eachJsonlLine } from './jsonl'
import {
  makeGrokQuestionIndexer,
  makeQuestionIndexer,
  stripReplayPrefix,
  type QuestionRec
} from './question-index'
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

/**
 * One Codex per-turn usage event: [ts, input, cached, output, cacheWrite].
 * The last slot is always 0 — cache creation is not collected on this side (ADR-0023). The slot is
 * kept rather than removed because the tuple is the on-disk cache shape: dropping it would change
 * that shape and force a CACHE_VERSION bump, and an old entry read as a new shape is the
 * 2026-07-30 production crash (ADR-0019).
 */
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
  /**
   * Per-turn increments, already filtered for re-reported turns (spec B7) — normally the record's own
   * per-turn figure, or the difference of two cumulatives where that figure is missing. A fork's
   * replay prefix is stripped later, in the combine stage; that stripping matches events by value, so
   * it compares two lists filtered by the same rule.
   */
  events: CodexEvent[]
}

/** One Grok per-turn, per-model usage event: [ts(ms)|null, input, cachedRead, output,
 * cacheCreation, billedModel|null]. The input **already includes** the cached reads (measured on
 * real data: inputTokens ⊇ cachedReadTokens), which is what makes the accounting Codex-shaped.
 * The cacheCreation slot is always 0 — not collected on this side either (ADR-0023) — and is kept
 * rather than removed for the same reason as the Codex tuple's: it is the on-disk cache shape. */
type GrokEvent = [number | null, number, number, number, number, string | null]

interface GrokFileAgg {
  kind: 'grok'
  /** The authoritative update stream's absolute path — the session's identity (ADR-0019) */
  file: string
  projectKey: string
  /** Tokens count regardless (F5); a subagent session never enters the session list */
  subagent: boolean
  /** The summary's own name first (session_summary — the same priority rule as Codex thread_name),
   * falling back to the first indexed question, then the session directory's name */
  title: string | null
  /** The largest timestamp in the file (the same meaning as on the other sides) */
  at: number | null
  listed: boolean
  questions: QuestionRec[]
  events: GrokEvent[]
}

type FileAgg = ClaudeFileAgg | CodexFileAgg | GrokFileAgg

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
 * v11: FileAgg gained the grok variant (ADR-0019's stated consequence: the cache gains a third
 *      variant, so the version bumps in the same change).
 * v12: GrokFileAgg gained title/at/listed and a real question index (the session-view ticket) — an
 *      old entry's empty questions would otherwise be reused forever for an unchanged file.
 * v14: the Codex events array stopped including re-reported turns — records whose running cumulative
 *      has not advanced now contribute nothing (spec B7). **A computation change**, so the bump is
 *      required for the same reason v13's was: an entry cached under v13 keeps the doubled events and
 *      the correction never reaches an unchanged file. Unlike v13 this one is *not* invisible — it
 *      moves real numbers (the Codex total falls by ~0.7% on this machine's data), so a missed bump
 *      would leave existing users on the old figures indefinitely.
 * v13: cacheWrite stopped being parsed on the Codex and Grok sides and is written as 0 (ADR-0023).
 *      **A computation change, not a shape change** — which is exactly the case this comment's rule
 *      above exists for: without the bump, an entry cached under v12 keeps its parsed value while
 *      the total no longer includes it, so the four fields stop summing to the total. Zero on this
 *      machine's data, hence invisible to every fixture with a fresh cache.
 *
 * **Exported for tests and for the accounting stamp** — a guard test builds an "immediately previous
 * version" cache with `CACHE_VERSION - 1` rather than hard-coding a literal that goes stale as the
 * version grows, and the archive's stamp (ADR-0026) carries this number as the identity of the parser
 * rules. Production code must not **branch** on it: the only version comparison is in loadCache, and a
 * second one would be a second rule that can drift.
 */
export const CACHE_VERSION = 14

/**
 * The archive rows a cache snapshot implies, through the same aggregation the scan uses (spec C16: a
 * restore writes exactly what a scan of that data would have produced). The snapshot must be of the
 * current cache structure version — the aggregation only understands the shape it was written for, and
 * reading an older shape would produce plausible nonsense rather than an error.
 */
export function rowsFromCacheFile(file: string): UsageRow[] {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
  const shape = raw as { version?: unknown; files?: Record<string, { agg?: unknown }> }
  if (shape?.version !== CACHE_VERSION) {
    throw new Error(`cache snapshot is version ${String(shape?.version)}, this build reads version ${CACHE_VERSION}`)
  }
  const aggs: FileAgg[] = []
  for (const entry of Object.values(shape.files ?? {})) if (isWellFormedAgg(entry?.agg)) aggs.push(entry.agg)
  return combine(aggs).rows
}

/**
 * A project's figures derived from the effective row set (spec G6): the archive's rows carry the project
 * key, so a project page reports archived-only and retained days exactly as the cross-project view does.
 * Sessions stay as the scan found them; a project present only in the archive gets an entry with none.
 */
export function projectStatsFromRows(
  base: Map<string, ProjectStats>,
  rows: UsageRow[]
): Map<string, ProjectStats> {
  const byProject = new Map<string, UsageRow[]>()
  for (const r of rows) {
    if (!r.projectKey) continue
    const list = byProject.get(r.projectKey)
    if (list) list.push(r)
    else byProject.set(r.projectKey, [r])
  }
  const out = new Map<string, ProjectStats>()
  for (const [key, p] of base) out.set(key, { tokens: deriveStats(byProject.get(key) ?? []), sessions: p.sessions })
  for (const [key, own] of byProject) {
    if (!out.has(key)) out.set(key, { tokens: deriveStats(own), sessions: [] })
  }
  return out
}

interface CacheShape {
  version: typeof CACHE_VERSION
  files: Record<string, { sig: string; agg: FileAgg }>
}

export interface TokenBuildResult {
  global: TokenStats
  perProject: Map<string, ProjectStats>
  /** Archive rows (day × side × project × model), for UsageArchive to merge; liveness is judged there,
   * per (day, side), from the rows themselves (ADR-0026) */
  rows: UsageRow[]
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

    // ── Grok: the session store, attributed by the percent-encoded directory name ──
    // A directory without its update stream never reaches here (readGrokSessions skips it), which
    // is F6 discharged at the walk: the siblings' scan is unaffected.
    for (const s of readGrokSessions(roots.grokHome)) {
      const agg = await this.aggFor(s.file, () => parseGrokFile(s.file, mergeKey(s.cwd), s.subagent))
      if (agg) {
        aggs.push(agg)
        seen[s.file] = { sig: sigOf(s.file) ?? '', agg }
        // Listed sessions only: a subagent's stream is never expanded in a parent turn on this side
        // (the dispatch's result comes from the parent's own finished record), so unlike Claude's
        // nested transcripts it stays outside the read allow-list
        if (isRegistered(agg.projectKey) && agg.listed) sessionFiles.add(s.file)
      }
    }

    this.cache = { version: CACHE_VERSION, files: seen }
    this.persist()
    const result = combine(aggs)
    result.sessionFiles = sessionFiles
    await retitleStripped(result.retitle)
    return result
  }

  private async aggFor<T extends FileAgg>(file: string, parse: () => Promise<T | null>): Promise<T | null> {
    const sig = sigOf(file)
    if (sig === null) return null
    const cached = this.cache.files[file]
    // Beyond the version, validate each entry's shape: manual corruption or future drift within one
    // version is always recomputed, so a missing field never flows into the aggregation layer.
    // The cast is sound because the cache is keyed by file path and a path's side never changes —
    // the cached agg was produced by the same per-side parser the caller is passing now.
    if (cached && cached.sig === sig && isWellFormedAgg(cached.agg)) return cached.agg as T
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
    if (agg.kind === 'grok') {
      // No fork mechanism on this side: nothing to strip, forkState is always none
      return {
        side: 'grok',
        questions: agg.questions,
        forkState: 'none',
        title: agg.title,
        at: agg.at,
        forkPoints: 0,
        forkParentTitle: null,
        forkParentFile: null
      }
    }
    let parent: CodexFileAgg | undefined
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
      const exact = `${mid}\x00${e[1] ?? ''}`
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
  // Accumulate archive rows: keyed day|side|project|model
  const rowMap = new Map<string, UsageRow>()
  const addRow = (
    day: string | null,
    side: AgentSide,
    projectKey: string,
    model: string,
    v: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  ): void => {
    // An entry carrying no timestamp is kept with an empty day rather than dropped: it is on record,
    // so the whole-history figures must include it, and only a **bounded** window can honestly exclude
    // it. Dropping it would leave the side totals and the sum of their days free to differ with
    // nothing reporting it — a latent divergence rather than an observed one, since the timestamp is
    // present on every row measured to date. It is not archived: the archive is keyed by day, and the
    // filtering happens at that call.
    const key = `${day ?? ''}|${side}|${projectKey}|${model}`
    const cur =
      rowMap.get(key) ??
      { day: day ?? '', side, projectKey, model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    cur.input += v.input
    cur.output += v.output
    cur.cacheRead += v.cacheRead
    cur.cacheWrite += v.cacheWrite
    cur.total += v.total
    rowMap.set(key, cur)
  }
  const perProject = new Map<string, ProjectStats>()

  const projectOf = (key: string): ProjectStats => {
    const p = perProject.get(key) ?? { tokens: emptyTokenStats(), sessions: [] }
    perProject.set(key, p)
    return p
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
    perFileTokens.set(fileIdx, (perFileTokens.get(fileIdx) ?? 0) + t)
    addRow(e[8], 'claude', agg.projectKey, e[7] ?? '', {
      input: e[3],
      output: e[4],
      cacheRead: e[5],
      cacheWrite: e[6],
      total: t
    })
    // Registers the project; its figures are derived from its rows at the end
    if (agg.projectKey) projectOf(agg.projectKey)
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
    // Per day, the **four fields measured on that day's own turns** — not the session's totals
    // apportioned by each day's share (spec B8). The events already carry all four figures and a
    // timestamp, so nothing has to be reconstructed; apportioning rounded four times per day and the
    // roundings did not cancel, which broke "the three buckets sum to the total".
    const byDay = new Map<string, TokenTotals>()
    /** Turns whose timestamp is unreadable: on record, but attributable to no day */
    const undated = emptyTotals()
    for (let i = start; i < a.events.length; i++) {
      const [ts, rawInput, cached, output, cacheWrite] = a.events[i]
      const turn: TokenTotals = {
        input: Math.max(0, rawInput - cached),
        cacheRead: cached,
        output,
        cacheWrite,
        // The total is input + output — exactly the total this side reports for itself. Adding
        // cacheRead (the Claude four-field sum) would double-count: it is a **measured** subset of the
        // reported input. Adding cache creation would make the total exceed the side's own, which is
        // why it is not collected at all (ADR-0023, `cacheWrite` is always 0 on this side).
        total: rawInput + output
      }
      addTotals(totals, turn)
      if (turn.total === 0) continue
      if (ts === null) {
        addTotals(undated, turn)
        continue
      }
      const day = localDay(ts)
      const cur = byDay.get(day) ?? emptyTotals()
      addTotals(cur, turn)
      byDay.set(day, cur)
    }
    for (const [day, v] of byDay) addRow(day, 'codex', a.projectKey, a.model, v)
    if (undated.total > 0) addRow(null, 'codex', a.projectKey, a.model, undated)
    if (a.projectKey) {
      const p = projectOf(a.projectKey)
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

  // ── Grok: per-turn, per-model events carry all four fields, so days are exact by each turn's
  // own timestamp (F7) with no ratio apportionment. F5: a subagent's real record appears exactly
  // once in the scan (the parent holds only a pointer), so its tokens sum with no cross-file
  // dedup — and no session entry is produced here at all; the session-view ticket lands that side.
  const grokAggs = aggs.filter((a): a is GrokFileAgg => a.kind === 'grok')
  for (const a of grokAggs) {
    let fileTokens = 0
    for (const [ts, rawInput, cached, output, cacheWrite, model] of a.events) {
      // F2, the Codex shape: reported input already includes cached reads (measured), so input is
      // sanitised and the total is input + output — exactly the total this side reports for itself.
      // The Claude four-field sum would double-count the cache; adding cache creation would make the
      // total exceed the side's own, which is why it is not collected here at all (ADR-0023,
      // `cacheWrite` is always 0 on this side).
      const turnTotal = rawInput + output
      if (turnTotal === 0) continue
      fileTokens += turnTotal
      const v = {
        input: Math.max(0, rawInput - cached),
        output,
        cacheRead: cached,
        cacheWrite,
        total: turnTotal
      }
      addRow(ts !== null ? localDay(ts) : null, 'grok', a.projectKey, model ?? '', v)
      if (a.projectKey) projectOf(a.projectKey)
    }
    // The session row (ticket #125): no fork mechanism exists on this side, so no stripping and
    // forkState is always none; a subagent or question-less session already has listed=false
    if (a.projectKey && a.listed) {
      projectOf(a.projectKey).sessions.push({
        side: 'grok',
        title: a.title,
        at: a.at,
        tokens: fileTokens,
        file: a.file,
        questionCount: a.questions.length,
        forkState: 'none'
      })
    }
  }

  // Every figure is derived from the rows here, in one place. It used to be accumulated in parallel
  // with them, which left the totals and the days free to disagree with nothing reporting it
  // (ADR-0025) — and did: an entry with no timestamp joined the totals but no day.
  const rows = [...rowMap.values()]
  const global = deriveStats(rows)

  const byProject = new Map<string, UsageRow[]>()
  for (const r of rows) {
    if (!r.projectKey) continue
    const list = byProject.get(r.projectKey)
    if (list) list.push(r)
    else byProject.set(r.projectKey, [r])
  }
  for (const [key, p] of perProject) {
    const own = byProject.get(key) ?? []
    p.tokens = deriveStats(own)
    p.sessions.sort((x, y) => (y.at ?? 0) - (x.at ?? 0))
  }
  return { global, perProject, rows, retitle, sessionFiles: new Set<string>() }
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
  // A missing subagent (undefined) would silently list a subagent session; a missing listed
  // (undefined) would silently HIDE a real one — both fields are load-bearing booleans
  if (a['kind'] === 'grok') {
    return (
      Array.isArray(a['events']) &&
      typeof a['subagent'] === 'boolean' &&
      typeof a['listed'] === 'boolean'
    )
  }
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

/** The four cumulative fields, as one comparable value — "has this record's running total moved" */
function cumulativeKey(u: Record<string, unknown>): string {
  return `${num(u['input_tokens'])}|${num(u['cached_input_tokens'])}|${num(u['output_tokens'])}|${num(u['total_tokens'])}`
}

/**
 * The increment implied by two consecutive cumulatives. Used where a record carries no per-turn
 * figure, and — because a cumulative that has not advanced yields zeros — it is also what makes a
 * re-reported turn drop out.
 *
 * Clamped at zero **defensively, not to handle a known shape**: no record measured on this machine
 * has a decreasing cumulative (0 of 59328 events across 444 files, checked field by field), so the
 * clamp has never fired. It is here because a subtraction that can go negative would silently take
 * tokens *out* of a day's total, which is a worse failure than dropping an increment.
 */
function diffUsage(
  total: Record<string, unknown>,
  prev: Record<string, unknown> | undefined
): Record<string, unknown> {
  const d = (k: string): number => Math.max(0, num(total[k]) - (prev ? num(prev[k]) : 0))
  return {
    input_tokens: d('input_tokens'),
    cached_input_tokens: d('cached_input_tokens'),
    output_tokens: d('output_tokens')
  }
}

async function parseCodexFile(
  file: string,
  projectKey: string,
  meta: { subagent: boolean; sessionId: string | null; parentId: string | null; forkedAt: number | null },
  titles: Map<string, string>
): Promise<CodexFileAgg | null> {
  const events: CodexEvent[] = []
  // The running cumulative of the previous usage record, carried across lines so that a re-reported
  // turn can be recognised by its cumulative standing still (spec B7). Per file: the cumulative
  // restarts with each session.
  let prevTotal: Record<string, unknown> | undefined
  let prevTotalKey: string | null = null
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
      // The real shape: top-level type=event_msg with the data in payload.info (payload.type=token_count).
      // last_token_usage is the per-turn increment — but the same turn can be re-reported, and summing
      // every record counts it twice (spec B7). The discriminator is the **cumulative**:
      // total_token_usage not advancing means this record accounts for nothing new. Where the per-turn
      // figure is missing the increment is the difference between the two cumulatives, which is also
      // what makes a non-advancing record contribute zero and drop out.
      // Deliberately not "the per-turn figure repeats": that would drop two genuinely identical
      // consecutive turns and keep a re-report that varied its per-turn figure. The two criteria happen
      // to select the same records on the data measured so far, which is a property of that data.
      if (payload?.['type'] !== 'token_count') return
      const info = payload['info'] as Record<string, unknown> | undefined
      const last = info?.['last_token_usage'] as Record<string, unknown> | undefined
      const total = info?.['total_token_usage'] as Record<string, unknown> | undefined
      const totalKey = total ? cumulativeKey(total) : null
      const advanced = totalKey === null || totalKey !== prevTotalKey
      // A cumulative that has not advanced makes the difference zero, so both branches agree there
      const usage = last && advanced ? last : total ? diffUsage(total, prevTotal) : undefined
      // Both carried forward unconditionally, including when a record has no cumulative at all: the
      // upstream rule compares against whatever the previous record carried, so keeping a stale value
      // here while clearing the key would make the two disagree about what "previous" means
      prevTotalKey = totalKey
      prevTotal = total
      if (!usage) return
      // All-zero records carry nothing to attribute (spec B6 for the reported kind, and this is where
      // a non-advancing cumulative lands)
      if (num(usage['input_tokens']) === 0 && num(usage['output_tokens']) === 0 && num(usage['cached_input_tokens']) === 0) return
      events.push([
        Number.isNaN(ts) ? null : ts,
        num(usage['input_tokens']),
        num(usage['cached_input_tokens']),
        num(usage['output_tokens']),
        // Cache creation is deliberately NOT read on this side (ADR-0023). The field exists in
        // records written from 2026-07-21 onward but has never carried a value, and the side's own
        // reported total is input + output with no write term — so reading it would make our total
        // exceed the total the side publishes for itself. Where those tokens actually sit is **not
        // observable** from this data (no non-zero record exists to test against); zero asserts no
        // quantity, only that this side reports none.
        0
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

/**
 * Grok: walk the update stream for turn_completed records (sequence F). The top-level timestamp is
 * epoch **seconds** (measured; params._meta carries the same instant in ms). Where a modelUsage map
 * exists its entries are the events — one per billed model, which is what makes the per-model split
 * exact (F3) — and a record without one falls back to the top-level usage with no model bucket.
 * The cost figure in the record is **never read** (F4). Full enumeration of this machine's 224
 * turn_completed records, 2026-08-16: 222 full-shape, one empty usage `{}`, one lacking
 * costUsdTicks but flagged usageIsIncomplete — so every numeric read tolerates absence.
 */
async function parseGrokFile(
  file: string,
  projectKey: string,
  subagent: boolean
): Promise<GrokFileAgg | null> {
  const events: GrokEvent[] = []
  const idx = makeGrokQuestionIndexer()
  let lastTs: number | null = null
  let fileEnd = 0
  try {
    await eachJsonlLine(file, (obj, start, end) => {
      idx.line(obj, start, end)
      fileEnd = end
      const tsRaw = obj['timestamp']
      const ts = typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw * 1000 : null
      if (ts !== null) lastTs = lastTs === null ? ts : Math.max(lastTs, ts)
      const params = obj['params'] as Record<string, unknown> | undefined
      const update = params?.['update'] as Record<string, unknown> | undefined
      if (update?.['sessionUpdate'] !== 'turn_completed') return
      const usage = update['usage'] as Record<string, unknown> | undefined
      if (!usage) return
      const mu = usage['modelUsage']
      const perModel: Array<[string | null, Record<string, unknown>]> =
        typeof mu === 'object' && mu !== null && Object.keys(mu).length > 0
          ? Object.entries(mu as Record<string, Record<string, unknown>>)
          : [[null, usage]]
      for (const [model, u] of perModel) {
        events.push([
          ts,
          num(u['inputTokens']),
          num(u['cachedReadTokens']),
          num(u['outputTokens']),
          // Cache creation is deliberately NOT read on this side (ADR-0023). `cacheCreationTokens`
          // exists in the record but has never carried a value, and the side's own reported total is
          // input + output with no write term — so reading it would make our total exceed the total
          // the side publishes for itself. Where those tokens actually sit is **not observable**
          // from this data; zero asserts no quantity, only that this side reports none.
          0,
          model
        ])
      }
    })
  } catch {
    return null
  }
  const questions = idx.done(fileEnd)
  const first = idx.firstQuestionText()
  // The summary's own name first (the same priority rule as Codex thread_name: the side's own
  // summary reads better than a first question); reading summary.json here is the file the
  // registry walk already reads for session_kind, not a second data source for the conversation
  let summaryTitle: string | null = null
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dirname(file), 'summary.json'), 'utf8'))
    if (typeof parsed === 'object' && parsed !== null) {
      const p = parsed as Record<string, unknown>
      const cand = p['session_summary'] ?? p['generated_title']
      if (typeof cand === 'string' && cand !== '') summaryTitle = cand
    }
  } catch {
    // No summary is no title source — the fallbacks below carry it
  }
  const stem = dirname(file).split('/').pop() ?? null
  return {
    kind: 'grok',
    file,
    projectKey,
    subagent,
    title: summaryTitle ?? (first === null ? null : clipTitle(first)) ?? stem,
    at: lastTs,
    // The same rule as the other sides (spec A3a): no real question → not listed, tokens count
    listed: !subagent && questions.length > 0,
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
