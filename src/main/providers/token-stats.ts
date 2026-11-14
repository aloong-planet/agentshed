// The token aggregation engine (aligned with ccusage, 2026-07-30; the source-level basis is in ADR-0005):
// - Claude: recursively scan **the whole tree** under claudeHome/projects (independent of the project
//   registry; unregistered directories count toward the global total);
//   each usage line becomes an entry, and the aggregation layer deduplicates across files — the exact
//   key is message.id+requestId, falling back to message.id-only when either side is isSidechain
//   (a subagent replays its parent's messages under a new requestId); keep the non-sidechain one,
//   otherwise the one with the larger four-field token sum. The total rule = input+output+cacheRead+cacheWrite;
//   entries whose model is '<synthetic>' or missing count toward the total but do not enter a model bucket.
// - Codex (each rollout read and parsed by the engine module, engine/src/sides/codex/, into the entry
//   combined here): per-turn last_token_usage increment events (payload.type=token_count inside event_msg);
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
//   keyed by (path, mtime, size), one row per file in the token store the engine module keeps (ADR-0044). The
//   statistics include stale projects.
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
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
import { sessionIdFromPath } from '@shared/session-resume'
import { ERR, appError } from '@shared/errors'
import { encodeClaudeProjectDir } from './claude'
import { readCodexSessionMeta } from './codex'
import { readGrokSessionMeta } from './grok'
import { isColdRollout } from './cold-rollout'
import { mapLimit, readRanges } from './range-read'
import { eachJsonlLine } from './jsonl'
import { isReadable } from './read-utils'
import {
  makeAntigravityQuestionIndexer,
  makeGrokQuestionIndexer,
  makeQuestionIndexer,
  stripReplayPrefix,
  type QuestionRec
} from './question-index'
import { clipTitle, realUserText } from './session-title'
import type { ScanRoots } from './types'
import { walkSessions, type SessionWalk } from './scan'
import { byName, compareNames, compareScanOrder } from './scan-order'
import { agySessionSignature, agyTranscriptPath, readAgySummaryTitles, readAntigravityUsage, type AgyCall } from './antigravity'
import type { UsageRow } from './archive'
import { loadEngineModule, threadEngineModule, type EngineSource, type TokenStore, type TokenStoreRow } from '../engine-module'

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
  /** The rollout's format (spec session-view B2): a paginated child carries no replayed events, so the
   * replay-prefix stripping is skipped for it — its first question is its own, and a fingerprint check
   * against the parent would misread it as an unmatched replay and flag the session uncertain */
  paginated: boolean
  /** The question index (with no question text, see question-index.ts) */
  questions: QuestionRec[]
  /**
   * Per-turn increments, already filtered for re-reported turns (spec B7) — normally the record's own
   * per-turn figure, or the difference of two cumulatives where that figure is missing. A fork's
   * replay prefix is stripped later, in the combine stage; that stripping matches events by value, so
   * it compares two lists filtered by the same rule.
   */
  events: CodexEvent[]
  /**
   * The usage boundary (spec B9): the index in `events` from which entries come from usage records —
   * `events.length` when the rollout carries none. Only the legacy span before it can hold a replayed
   * prefix (records are never copied into a child thread, spec B10), so the stripping in combine
   * stops there.
   */
  boundary: number
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

/**
 * One Antigravity CLI conversation (ADR-0037): its model calls, each once within the database, with the calls a fork
 * copied from its parent already left out; and the conversation as a session — what its database says (its own id,
 * whether it is a subagent, its last activity, the conversation a fork came from) and its transcript's question index.
 * Calls are matched across databases only in the combine stage, since a call's identity spans databases
 * (token-stats::REQ-003/AC-01). A conversation that cannot be read in the supported format is kept as `unreadable`, so
 * the count of such conversations survives a scan that serves it from the cache; it is listed nowhere.
 */
interface AntigravityFileAgg {
  kind: 'antigravity'
  /** The conversation database's absolute path — the session's identity */
  file: string
  /** The first folder its trajectory record lists (token-stats::REQ-003/AC-08); '' when none is a local folder */
  projectKey: string
  unreadable: boolean
  calls: AgyCall[]
  /** Its own id as its trajectory table records it — the key agy's summaries and a fork's copied steps use; '' when
   * unreadable */
  conversationId: string
  /** A subagent conversation gets no row (token-stats::REQ-003/AC-07) */
  subagent: boolean
  /** Listed: readable, no subagent, and at least one question (session-view::REQ-003/AC-02) */
  listed: boolean
  /** The largest step timestamp in the database (session-view::REQ-003/AC-04) */
  at: number | null
  /** For a fork, the id of the conversation its last copied step came from (session-view::REQ-005/AC-02) */
  forkOf: string | null
  /** The first question clipped as a title — the fallback for a conversation agy did not title (REQ-003/AC-03); agy's
   * own title is read at each scan from its summaries, not kept here */
  title: string | null
  /** The question index over its transcript (with no question text, see question-index.ts) */
  questions: QuestionRec[]
}

type FileAgg = ClaudeFileAgg | CodexFileAgg | GrokFileAgg | AntigravityFileAgg

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
 * v16: the Codex question index reads the paginated format's completed-item user messages and strips
 *      the three harness shapes measured in them (spec session-view B1); CodexFileAgg gained
 *      `paginated` (a paginated child skips the replay check, B2). **A computation change and a shape
 *      change**: an entry cached under v15 keeps an empty question index for every paginated rollout,
 *      so those sessions would stay unlisted forever.
 * v15: Codex usage comes from usage records from the first record line on, deduplicated by response
 *      id; usage events count only before that boundary (ADR-0027, spec B9). **A computation
 *      change**: an entry cached under v14 keeps the event-derived figures for a paginated rollout,
 *      up to 2.9% of a session below the records on this machine's data.
 * v17: a Codex entry gained its resume state (#158): the inode, the size and the parse cursor, and
 *      everything the parser carries from line to line, so a rollout that only grew is parsed from where
 *      the last parse stopped. **A shape change** of the cache entry; an entry from v16 has no state to
 *      resume from, and the version check is what keeps it from being read as if it had.
 * v18: FileAgg gained the antigravity variant (ADR-0037's stated consequence, the per-file aggregate gains a fourth
 *      variant). Its entries are keyed by the conversation's signature — the database's modification time and the
 *      log's presence, time and size, never the database's size (token-stats Implementation Decisions) — rather than
 *      by (mtime, size).
 * v19: AntigravityFileAgg gained the conversation as a session (#324): its own id, the subagent flag, listed, its last
 *      activity, the conversation a fork came from, the title fallback and the question index over its transcript —
 *      **a shape change**, bumped with it as this comment's rule asks (the shape guard below, which now requires the new
 *      fields, would also turn every v18 entry away one by one); and its signature now covers the transcript too, so a
 *      transcript agy appended to is indexed again.
 * v13: cacheWrite stopped being parsed on the Codex and Grok sides and is written as 0 (ADR-0023).
 *      **A computation change, not a shape change** — which is exactly the case this comment's rule
 *      above exists for: without the bump, an entry cached under v12 keeps its parsed value while
 *      the total no longer includes it, so the four fields stop summing to the total. Zero on this
 *      machine's data, hence invisible to every fixture with a fresh cache.
 * v20: the cache moved from the JSON file into the token store the engine module keeps (ADR-0044) — **a structure
 *      change of the cache as a whole**, which the store records as its own version. The per-file aggregate is v19's,
 *      unchanged, which is why the first launch imports a v19 JSON file and no other (JSON_CACHE_VERSION, token-stats
 *      C26). The store's tables are this version's too (engine/src/store/): changing them bumps this number.
 *
 * Not bumped, for one computation change and its reasons alone (#427): a Codex rollout's last line is read only once its
 *      line feed is written, where the TypeScript parser read it at once. The change reaches only an entry cached while a
 *      rollout's last line had no line feed yet. While that file stays unchanged, which happens only if Codex stopped
 *      between the line and its line feed, the entry keeps the figure the TypeScript parser gave. Once the file grows,
 *      the resume reads on under the new rule, and only that question's end stays one byte short until the file is
 *      next parsed whole: no figure and no question's text differ. No rollout on this machine was in that state (none
 *      of the 311 non-empty plain rollouts, 2026-11-15). A bump would make every install parse every rollout again, and
 *      would take version 20, which the token store's change lands on, past the version-19 import its upgrade reads.
 *      This exempts that one change; the rule above stands for every other.
 *
 * **A bump also moves the accounting stamp** (`<app version>+c<this>`), and the e2e archive cases seed
 * archive rows under that stamp as a literal on purpose, so a bump turns them red until they are
 * updated with it: search for `+c<old version>` when bumping.
 *
 * **Exported for tests and for the accounting stamp** — a guard test builds an "immediately previous
 * version" store with `CACHE_VERSION - 1` rather than hard-coding a literal that goes stale as the
 * version grows, and the archive's stamp (ADR-0026) carries this number as the identity of the parser
 * rules. Production code must not **branch** on it: the only version comparison is the store's own, when it
 * opens (engine/src/store/), and a second one would be a second rule that can drift.
 */
export const CACHE_VERSION = 20

/**
 * The last structure version kept in the JSON cache file, and the only one a first launch imports (token-stats C26): its
 * per-file aggregate is the store's (CACHE_VERSION, v20). A literal, not `CACHE_VERSION - 1`: a later bump changes what
 * the store holds, never what that file held.
 */
const JSON_CACHE_VERSION = 19

/**
 * The archive rows a snapshot implies — a copy of the token store — through the same aggregation the scan uses,
 * combining its entries as one scan set, in scan order (scan-order.ts; spec C16: a restore writes exactly what a scan of
 * that data would have produced). `roots` are the data roots of the machine the store was made on, which the order
 * is taken by. The copy is read through the engine module without anything written to it or beside it. It must be a
 * store of the current cache structure version — the aggregation only understands the shape it was written for,
 * and reading an older shape would produce plausible nonsense rather than an error; a JSON cache file is no store.
 */
export function rowsFromStoreSnapshot(file: string, engine: EngineSource, roots: ScanRoots): UsageRow[] {
  const snapshot = loadEngineModule(engine).readTokenStoreSnapshot(file, CACHE_VERSION)
  if (snapshot.version !== CACHE_VERSION || !snapshot.rows) {
    throw new Error(`cache snapshot is version ${snapshot.version ?? 'none'}, this build reads version ${CACHE_VERSION}`)
  }
  // A scan parses again the file of an entry that is not well formed; a restore has no file to parse, and rows
  // from the other entries alone would write a day's figure short of that entry's usage as an accepted change
  // The store holds its rows in the order it first held them, which a later scan's order need not be
  const order = compareScanOrder(roots)
  const entries = [...snapshot.rows].sort((a, b) => order(a.path, b.path)).map(CacheEntries.entryOf)
  const aggs = entries.flatMap((entry) => (entry ? [entry.agg] : []))
  if (aggs.length !== entries.length) {
    throw new Error(`cache snapshot holds ${entries.length - aggs.length} of ${entries.length} entries that are not well formed`)
  }
  return combine(aggs).rows
}

/**
 * A project's figures derived from the effective row set (spec G6): the archive's rows carry the project
 * key, so a project page reports archived-only and retained days exactly as the cross-project view does.
 * `sessions` holds each project's sessions as the scan found them, by merge key, and they stay; a project
 * present only in the archive gets an entry with none.
 */
export function projectStatsFromRows(
  sessions: ReadonlyMap<string, SessionMeta[]>,
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
  for (const [key, own] of sessions) out.set(key, { tokens: deriveStats(byProject.get(key) ?? []), sessions: own })
  for (const [key, own] of byProject) {
    if (!out.has(key)) out.set(key, { tokens: deriveStats(own), sessions: [] })
  }
  return out
}

/**
 * Where a Codex rollout's parse stopped, and everything the parser carries from one line to the next
 * (#158). Codex's writer only appends to a rollout or replaces it whole by renaming a staged copy over
 * the path (read in codex-rs: `recorder.rs` opens with append, `rollout_migration.rs` and
 * `compression.rs` rename), so a rollout whose inode is unchanged and whose size grew has only gained
 * lines after `cursor`, and the parse resumes there. A rename shows as a new inode and a rewrite in place
 * as a size that did not grow; both are parsed whole.
 */
interface CodexResume {
  ino: number
  /** The size when the parse began */
  size: number
  /** The end of the last line parsed — a half-written line after it is read again, whole, next time */
  cursor: number
  prevTotal: Record<string, unknown> | null
  prevTotalKey: string | null
  /** -1 until the first usage record (the raw value; the agg's `boundary` cannot tell "none yet") */
  boundary: number
  seenResponses: string[]
  model: string
  /** The clipped first question, the title's fallback: a resumed index carries no question text */
  firstTitle: string | null
  /** Resumes since the last whole parse */
  resumes: number
}

/**
 * How many resumes in a row before a growing rollout is parsed whole again. A third party editing a
 * rollout in place without changing its size or inode is invisible to every cheap check; this bounds
 * how long such an edit can stay unread instead of guessing at it. Codex's own writer never does it.
 */
export const RESUME_LIMIT = 50

interface CacheEntry {
  sig: string
  agg: FileAgg
  /** A Codex rollout's CodexResume. Typed as unknown because it is not part of what makes an entry: only the
   * resume reads it, and checks it there (isCodexResume). A parse that left a state the check turns down would
   * otherwise make its rollout a miss at every scan; this way it only costs that rollout its resume. */
  resume?: unknown
}

/**
 * The token store's entries by session file (ADR-0044), and the one way to them. Under any path the store may hold
 * anything — what a crash, a disk or a hand left there, or text that is no entry — and a reader that looked at one
 * itself, before or without the shape check, failed the whole scan at every launch until the cache was deleted
 * (postmortems `2026-10-29-a-guard-read-after-the-value-it-guards` and
 * `2026-11-11-a-null-files-object-passed-the-cache-loader`). So a row becomes an entry only here (`entryOf`), and only
 * after the check (isWellFormedEntry): what does not pass is no entry, and its file is a miss. The store is a
 * `#private` field, which nothing outside this class can name.
 *
 * Nothing is kept between two reads: each goes to the store, so a read sees what another process wrote before it
 * (token-stats C27), and no scan holds the entries of the one before. A failure of the store fails no scan and no page
 * (token-stats C3, session-view C4): a read that fails is nothing held, a write that fails lands nothing, and each is
 * logged.
 */
class CacheEntries {
  readonly #store: TokenStore

  constructor(store: TokenStore) {
    this.#store = store
  }

  /**
   * A row's entry when it is well formed; otherwise nothing. The resume state is not part of what makes an entry
   * (CacheEntry): one that is no JSON is no resume state, and costs the rollout its resume, never its entry.
   */
  static entryOf(this: void, row: TokenStoreRow): CacheEntry | undefined {
    if (typeof row.agg !== 'string') return undefined
    let agg: unknown
    try {
      agg = JSON.parse(row.agg)
    } catch {
      return undefined
    }
    const entry = { sig: row.sig, agg } as Record<string, unknown>
    if (typeof row.resume === 'string') {
      try {
        entry['resume'] = JSON.parse(row.resume)
      } catch {
        // No resume state
      }
    }
    return isWellFormedEntry(entry) ? entry : undefined
  }

  static #read(read: { rows: TokenStoreRow[]; failure?: string | null }): TokenStoreRow[] {
    if (read.failure) console.error('[token-store] read failed:', read.failure)
    return read.rows
  }

  /**
   * What is held under the file: whether anything is, well formed or not, and its entry when it is well formed. A read
   * that fails tells nothing held, so the file counts as held with no entry: a page rebuilds its index (session-view C4).
   */
  lookup(file: string): { held: boolean; entry: CacheEntry | undefined } {
    const read = this.#store.get(file)
    const row = CacheEntries.#read(read)[0]
    if (read.failure) return { held: true, entry: undefined }
    return { held: row !== undefined, entry: row === undefined ? undefined : CacheEntries.entryOf(row) }
  }

  /** The file's entry when it is well formed; otherwise nothing, and the file is a miss */
  get(file: string): CacheEntry | undefined {
    return this.lookup(file).entry
  }

  /** Every file something is held for, with its entry, or null for one that is not well formed */
  all(): Map<string, CacheEntry | null> {
    const out = new Map<string, CacheEntry | null>()
    for (const row of CacheEntries.#read(this.#store.all())) out.set(row.path, CacheEntries.entryOf(row) ?? null)
    return out
  }

  /** Holds `puts` and removes `removes`, all of it or none (token-stats C3); whether it landed */
  write(puts: ReadonlyMap<string, CacheEntry>, removes: readonly string[] = []): boolean {
    if (puts.size === 0 && removes.length === 0) return true
    const rows = [...puts].map(([path, e]) => ({
      path,
      sig: e.sig,
      agg: JSON.stringify(e.agg),
      ...(e.resume === undefined ? {} : { resume: JSON.stringify(e.resume) })
    }))
    const failure = this.#store.write(rows, [...removes])
    if (failure === null) return true
    console.error('[token-store] write failed:', failure)
    return false
  }

  /** Whether another process wrote to the store since this one last asked (token-stats C27) */
  changedByOther(): boolean {
    return this.#store.changedByOther()
  }
}

/** The JSON file the cache was kept in up to structure version 19, read once by the upgrade (token-stats C26) */
const JSON_CACHE_FILE = 'token-cache.json'

/**
 * Upgrading from the JSON cache (token-stats C26), when a thread opens the store. A store the open made has the JSON
 * file's well-formed entries imported, each as a scan would store it, when the file is of the last version it kept;
 * the file is then deleted. A file of another version, or one that is garbage by that file's rules, is deleted without
 * an import, and so is one beside a store that was already there: the store's signatures decide what is current.
 * An import that fails lands nothing and leaves the file, which a later launch deletes as one beside a store. A deletion
 * that fails is logged.
 */
function settleJsonCache(cacheDir: string, store: CacheEntries, created: boolean): void {
  const file = join(cacheDir, JSON_CACHE_FILE)
  const remove = (): void => {
    try {
      unlinkSync(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`[token-store] ${JSON_CACHE_FILE} could not be deleted:`, error)
    }
  }
  if (!created) {
    remove()
    return
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    // No file is nothing to settle; one that will not read or parse is garbage
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') remove()
    return
  }
  const shape = raw as { version?: unknown; files?: unknown } | null
  const files = shape?.files
  // null is an object to typeof, and so is an array, which would pass for a cache that holds nothing
  if (shape?.version !== JSON_CACHE_VERSION || typeof files !== 'object' || files === null || Array.isArray(files)) {
    remove()
    return
  }
  const puts = new Map<string, CacheEntry>()
  for (const [path, held] of Object.entries(files as Record<string, unknown>)) {
    if (isWellFormedEntry(held)) puts.set(path, held)
  }
  if (store.write(puts)) remove()
  else console.error(`[token-store] the import of ${JSON_CACHE_FILE} failed; the first scan parses every file`)
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
  /** How many Antigravity CLI conversations could not be read in the supported format (token-stats::REQ-004/AC-01);
   * a read that failed while agy was writing is not among them (AC-03) */
  antigravityUnreadable: number
  /**
   * The session read allow-list (ticket 04): **listed sessions + subagent and nested transcripts**.
   * The latter do not enter the list (spec A3/A3a), but ticket 07 needs to expand them inside a turn —
   * writing the rule as "only what is already listed" would have blocked 07 with our own allow-list
   * (a trap ticket 04 wrote down explicitly). The main process validates range-read entry points against it.
   */
  sessionFiles: Set<string>
}

/**
 * One file to parse, as plain data — what a parse worker receives (#159). The engine's thread builds it: it
 * owns the cache and every decision about it (hit, resume, whole parse); a parse touches only the file.
 */
export type ParseJob =
  | { kind: 'claude'; file: string; projectKey: string; listed: boolean }
  | {
      kind: 'codex'
      file: string
      projectKey: string
      meta: CodexParseMeta
      /** The session_index name for this rollout, looked up on the engine's thread */
      threadName: string | undefined
      from?: { agg: CodexFileAgg; state: CodexResume }
    }
  | { kind: 'grok'; file: string; projectKey: string; subagent: boolean }
  | {
      kind: 'antigravity'
      file: string
      /** Where the copy of a conversation agy has open is made: the system temporary directory when absent (tests
       * inject one, as the walk takes one) */
      tmpParent?: string
    }

/** A parse's output: the agg, and for Codex the state a later resume starts from; null when unreadable (for an
 * Antigravity conversation: when the read failed while agy was writing it — one that cannot be read in the supported
 * format is an agg marked unreadable) */
export type ParseResult = { agg: FileAgg; state?: CodexParseState } | null

/** Parses one job on the calling thread. A parse worker runs this same function (parse-worker.ts). */
export async function runParseJob(job: ParseJob): Promise<ParseResult> {
  switch (job.kind) {
    case 'claude': {
      const agg = await parseClaudeFile(job.file, job.projectKey, job.listed)
      return agg ? { agg } : null
    }
    case 'codex':
      // Read and parsed by the engine module (ADR-0045), which this thread loaded before it parses
      return threadEngineModule().parse(job)
    case 'grok': {
      const agg = await parseGrokFile(job.file, job.projectKey, job.subagent)
      return agg ? { agg } : null
    }
    case 'antigravity':
      return parseAntigravityFile(job.file, job.tmpParent)
  }
}

/**
 * One Antigravity conversation: its usage read (token-stats::REQ-003, token-stats::REQ-004) and, for a readable one
 * that is not a subagent, its transcript's question index (session-view::REQ-004). A transcript not there — the empty
 * conversation agy creates has none (measured) — or one that will not open gives no question, so the conversation is
 * not listed while its tokens count (session-view::REQ-004/AC-08).
 */
async function parseAntigravityFile(file: string, tmpParent?: string): Promise<ParseResult> {
  const read = readAntigravityUsage(file, tmpParent)
  if (read.kind === 'failed') return null
  if (read.kind === 'unreadable') {
    const agg: AntigravityFileAgg = {
      kind: 'antigravity', file, projectKey: '', unreadable: true, calls: [],
      conversationId: '', subagent: false, listed: false, at: null, forkOf: null, title: null, questions: []
    }
    return { agg }
  }
  const { conversation: c } = read
  let questions: QuestionRec[] = []
  let first: string | null = null
  if (!c.subagent) {
    const idx = makeAntigravityQuestionIndexer()
    let fileEnd = 0
    try {
      await eachJsonlLine(agyTranscriptPath(file), (obj, start, end) => {
        idx.line(obj, start, end)
        fileEnd = end
      })
      questions = idx.done(fileEnd)
      first = idx.firstQuestionText()
    } catch {
      // No transcript, or one that will not open: no question
    }
  }
  const agg: AntigravityFileAgg = {
    kind: 'antigravity',
    file,
    projectKey: read.folder === null ? '' : mergeKey(read.folder),
    unreadable: false,
    calls: read.calls,
    conversationId: c.id,
    subagent: c.subagent,
    listed: !c.subagent && questions.length > 0,
    at: c.at,
    forkOf: c.forkOf,
    title: first === null ? null : clipTitle(first),
    questions
  }
  return { agg }
}

/** Where a build's parses run, and how many at once */
export interface ParseRunner {
  run(job: ParseJob): Promise<ParseResult>
  concurrency: number
}

/** On the calling thread, one file at a time — what tests and the session page use */
const INLINE: ParseRunner = { run: runParseJob, concurrency: 1 }

/** One file of a build, in scan order: its entry once known, and the job that produces it otherwise */
interface Slot {
  file: string
  entry: CacheEntry | null
  plan?: { job: ParseJob; st: { sig: string; ino: number; size: number } }
  /** Whether the agg admits the file into the session read allow-list */
  admit: (agg: FileAgg) => boolean
  /** The entry kept when the parse fails while agy writes an Antigravity conversation (token-stats::REQ-004/AC-03):
   * its last successful read, under its old signature, so the next build reads the conversation again */
  fallback?: CacheEntry
}

/**
 * Which files hold the sessions a fork names as its parent, by the id the fork names: a Codex session's id, an
 * Antigravity conversation's own id, each with its files in scan order. The parent's entry is then read from the store
 * (a fork's parent lookup, token-stats Implementation Decisions, Cache); this only spares that lookup a read of every
 * entry, on each page of a fork. Taken from the entries a build read, and again from the store once another process
 * wrote to it (token-stats C27).
 */
interface ParentFiles {
  codex: Map<string, string[]>
  antigravity: Map<string, string[]>
  /** Scan order (scan-order.ts), which each list is kept in: the lookup takes the first file, as the combination does */
  order: (a: string, b: string) => number
}

function addParentFile(index: ParentFiles, file: string, agg: FileAgg): void {
  const add = (by: Map<string, string[]>, id: string): void => {
    const files = by.get(id)
    if (!files) by.set(id, [file])
    else if (!files.includes(file)) {
      files.push(file)
      files.sort(index.order)
    }
  }
  if (agg.kind === 'codex' && agg.sessionId !== null) add(index.codex, agg.sessionId)
  if (agg.kind === 'antigravity' && !agg.unreadable && agg.conversationId !== '') add(index.antigravity, agg.conversationId)
}

export class TokenEngine {
  private readonly cacheDir: string
  /** The engine module that keeps the store (ADR-0044, ADR-0045) */
  private readonly engine: EngineSource
  /** The store, once this thread has opened it; null until then, and after an open that failed, which the next use
   * tries again */
  private store: CacheEntries | null = null
  private readonly runner: ParseRunner
  /** agy's own conversation titles as last read (session-view::REQ-003/AC-03): at every build, since agy titles a
   * conversation after the fact without the conversation itself changing, and on a page's first need before any */
  private agyTitles: Map<string, string> | null = null
  /** Where the summaries are copied when a log is beside them; the system's temporary directory unless given, as a
   * parse job's `tmpParent` is */
  private readonly agyTmpParent: string | undefined
  /** The files a fork's parent may be in (ParentFiles); null until a build or a page needs it */
  private parentFiles: ParentFiles | null = null

  constructor(cacheDir: string, engine: EngineSource, runner: ParseRunner = INLINE, agyTmpParent?: string) {
    this.cacheDir = cacheDir
    this.engine = engine
    this.runner = runner
    this.agyTmpParent = agyTmpParent
  }

  /**
   * The store, opened at this thread's first build or page, before anything is read from it: the one there when it is
   * usable, otherwise a new empty one, into which the JSON cache is imported (token-stats C1, C2, C26). A module that
   * will not load throws, as no other engine exists (token-stats, Scans and the window). A store that cannot be opened
   * or made is none: the build parses every file and writes nothing, the failure is logged, and the next use tries
   * again.
   */
  private openStore(): CacheEntries | null {
    if (this.store) return this.store
    const module = loadEngineModule(this.engine)
    const opened = new module.TokenStore(this.cacheDir, CACHE_VERSION)
    if (opened.failure !== null) {
      console.error('[token-store] open failed:', opened.failure)
      return null
    }
    const store = new CacheEntries(opened)
    settleJsonCache(this.cacheDir, store, opened.created)
    this.store = store
    return store
  }

  /** The files a fork's parent may be in, taken again from the store when another process wrote to it since — the
   * store's rows put in scan order, which the store does not hold them in */
  private parentFilesOf(store: CacheEntries | null, roots: ScanRoots): ParentFiles {
    if (this.parentFiles && !store?.changedByOther()) return this.parentFiles
    const index: ParentFiles = { codex: new Map(), antigravity: new Map(), order: compareScanOrder(roots) }
    for (const [file, entry] of store?.all() ?? []) if (entry) addParentFile(index, file, entry.agg)
    this.parentFiles = index
    return index
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
     * and the app's scan must pass the real set.
     */
    registeredKeys?: ReadonlySet<string>,
    /** The scan's one session walk, shared with scan() (#160); walked here when absent */
    sessions?: SessionWalk
  ): Promise<TokenBuildResult> {
    const isRegistered = (key: string): boolean =>
      registeredKeys ? registeredKeys.has(key) : key !== ''
    const aggs: FileAgg[] = []
    const sessionFiles = new Set<string>()
    // Every entry the store holds, read as it is now: whatever another process wrote before this point is in it
    // (token-stats C27). Held for this build only.
    const store = this.openStore()
    store?.changedByOther()
    const held = store?.all() ?? new Map<string, CacheEntry | null>()
    // Every file in scan order. The cache is consulted here, on the engine's thread; the misses are parsed
    // together below, as many at once as the runner allows; then every file is taken in this order, so
    // the aggregation sees exactly the sequence a one-at-a-time build saw.
    const slots: Slot[] = []

    // Encoded directory name → the project's merge key
    const encToProject = new Map<string, string>()
    for (const p of claudeProjectPaths) encToProject.set(encodeClaudeProjectDir(p), mergeKey(p))

    // ── Claude: the whole projects tree ──
    const projectsRoot = join(roots.claudeHome, 'projects')
    if (existsSync(projectsRoot)) {
      let dirs: string[]
      try {
        // In scan order (scan-order.ts)
        dirs = readdirSync(projectsRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort(compareNames)
      } catch {
        dirs = []
      }
      for (const encName of dirs) {
        const projectKey = encToProject.get(encName) ?? ''
        for (const { file, nested } of listJsonl(join(projectsRoot, encName))) {
          // The allow-list is no wider than what the UI can reach: an unregistered project's sessions
          // are never displayed (spec A2),
          // so the read side does not admit them either — the same goes for nested transcripts, whose
          // parent sessions are all invisible
          const admit = (agg: FileAgg): boolean => isRegistered(projectKey) && (nested || listedOf(agg))
          slots.push(this.plan(held.get(file) ?? undefined, file, admit, { kind: 'claude', file, projectKey, listed: !nested }))
        }
      }
    }

    // ── Codex: the whole sessions tree, attributed by the first line's cwd ──
    const walked = sessions ?? walkSessions(roots)
    const titles = readCodexIndex(roots.codexHome)
    for (const s of walked.codex) {
      const admit = (agg: FileAgg): boolean => isRegistered(agg.projectKey) && (s.subagent || listedOf(agg))
      slots.push(this.codexPlan(held.get(s.file) ?? undefined, s.file, s.cwd, s, titles, admit))
    }

    // ── Grok: the session store, attributed by the percent-encoded directory name ──
    // A directory without its update stream never reaches here (readGrokSessions skips it), which
    // is F6 discharged at the walk: the siblings' scan is unaffected.
    for (const s of walked.grok) {
      // Listed sessions only: a subagent's stream is never expanded in a parent turn on this side
      // (the dispatch's result comes from the parent's own finished record), so unlike Claude's
      // nested transcripts it stays outside the read allow-list
      const admit = (agg: FileAgg): boolean => isRegistered(agg.projectKey) && listedOf(agg)
      slots.push(this.plan(held.get(s.file) ?? undefined, s.file, admit, { kind: 'grok', file: s.file, projectKey: mergeKey(s.cwd), subagent: s.subagent }))
    }

    // ── Antigravity CLI: every conversation database, attributed by its own trajectory record ──
    // Listed conversations only join the read allow-list, by their database's path — the session's identity; the
    // transcript a page reads is derived from it on the main process (session-view::REQ-004/AC-09). A subagent's
    // transcript is never expanded in a parent turn on this side (its return is the parent's own system message).
    for (const s of walked.antigravity) {
      const admit = (agg: FileAgg): boolean => isRegistered(agg.projectKey) && listedOf(agg)
      slots.push(this.antigravityPlan(held.get(s.file) ?? undefined, s.file, admit))
    }

    const misses = slots.filter((slot) => slot.plan !== undefined)
    await mapLimit(misses, this.runner.concurrency, async (slot) => {
      if (slot.plan) slot.entry = entryOf(slot.plan, await this.runner.run(slot.plan.job)) ?? slot.fallback ?? null
    })
    // What this build changed in the store, and all it writes (token-stats::QR-002/AC-02): each entry that is not
    // the one the store held — a parse produced it — and the removal of each file the store held something for that
    // ends the build with no entry: it left the scan set, or gives no entry any more. A parse that gave nothing to a
    // file the store held no entry for, or that fell back on the entry already held, changed nothing.
    const puts = new Map<string, CacheEntry>()
    const ending = new Set<string>()
    const parentFiles: ParentFiles = { codex: new Map(), antigravity: new Map(), order: compareScanOrder(roots) }
    for (const slot of slots) {
      if (!slot.entry) continue
      aggs.push(slot.entry.agg)
      ending.add(slot.file)
      addParentFile(parentFiles, slot.file, slot.entry.agg)
      if (!isHeldEntry(held.get(slot.file) ?? undefined, slot.entry)) puts.set(slot.file, slot.entry)
      if (slot.admit(slot.entry.agg)) sessionFiles.add(slot.file)
    }
    const removes = [...held.keys()].filter((file) => !ending.has(file))
    // One transaction: the store holds all of it or none of it. One that does not land is logged and costs the next
    // scan the parses of what it held, which the store then still lacks (token-stats C3).
    store?.write(puts, removes)
    this.parentFiles = parentFiles
    // agy's titles: a failed read while agy writes its summaries keeps the last ones read
    this.agyTitles = readAgySummaryTitles(roots.antigravityHome, this.agyTmpParent) ?? this.agyTitles ?? new Map()
    const result = combine(aggs, this.agyTitles)
    result.sessionFiles = sessionFiles
    await retitleStripped(result.retitle)
    return result
  }

  /**
   * A file's slot: its cached entry when the signature still matches, otherwise the job that parses it.
   * The signature is the one taken **before** parsing, so a file that grows while it is read shows as
   * changed on the next scan rather than matching a signature that already counts bytes the parse
   * never saw. An unreadable file gets neither. `cached` is the file's entry in the store, if it has one.
   */
  private plan(cached: CacheEntry | undefined, file: string, admit: Slot['admit'], job: ParseJob): Slot {
    const st = statOf(file)
    if (st === null) return { file, entry: null, admit }
    // Beyond the version, the store hands out an entry only when its shape holds: manual corruption or future
    // drift within one version is always recomputed, so a missing field never flows into the aggregation layer.
    // The store is keyed by file path and a path's side never changes, so a hit is the same side's agg.
    if (cached && cached.sig === st.sig) return { file, entry: { sig: st.sig, agg: cached.agg }, admit }
    return { file, entry: null, admit, plan: { job, st } }
  }

  /**
   * An Antigravity conversation's slot: cached while its signature — the database's time and the log's presence, time
   * and size, never the database's size — still matches; read whole otherwise, as agy rewrites and truncates rows in
   * place. Its last readable entry stands by in case the read fails while agy writes (token-stats::REQ-004/AC-03).
   */
  private antigravityPlan(cached: CacheEntry | undefined, file: string, admit: Slot['admit']): Slot {
    const sig = agySessionSignature(file)
    if (sig === null) return { file, entry: null, admit }
    const usable = cached !== undefined && cached.agg.kind === 'antigravity'
    if (usable && cached.sig === sig) return { file, entry: cached, admit }
    const fallback = usable && cached.agg.kind === 'antigravity' && !cached.agg.unreadable ? cached : undefined
    return { file, entry: null, admit, fallback, plan: { job: { kind: 'antigravity', file }, st: { sig, ino: 0, size: 0 } } }
  }

  /**
   * A Codex rollout's slot: cached when its signature still matches; a job resuming from the cached
   * parse state when the rollout only grew (CodexResume); a whole parse otherwise.
   */
  private codexPlan(
    cached: CacheEntry | undefined,
    file: string,
    cwd: string,
    meta: CodexParseMeta,
    titles: Map<string, string>,
    admit: Slot['admit']
  ): Slot {
    const st = statOf(file)
    if (st === null) return { file, entry: null, admit }
    if (cached && cached.sig === st.sig) return { file, entry: cached, admit }
    const state = cached?.resume
    const from =
      cached !== undefined &&
      cached.agg.kind === 'codex' &&
      isCodexResume(state) &&
      !isColdRollout(file) &&
      state.ino === st.ino &&
      st.size > state.size &&
      state.resumes < RESUME_LIMIT
        ? { agg: cached.agg, state }
        : undefined
    const job: ParseJob = { kind: 'codex', file, projectKey: mergeKey(cwd), meta: codexParseMeta(meta), threadName: threadNameOf(file, titles), from }
    return { file, entry: null, admit, plan: { job, st } }
  }

  /**
   * One Codex rollout's entry outside a build (the session page), through the same plan. Parsed on the
   * calling thread, not the runner: the page is waiting, and during a scan the runner's queue holds that
   * scan's whole backlog.
   */
  private async codexEntry(
    cached: CacheEntry | undefined,
    file: string,
    cwd: string,
    meta: CodexParseMeta,
    titles: Map<string, string>
  ): Promise<CacheEntry | null> {
    const slot = this.codexPlan(cached, file, cwd, meta, titles, () => false)
    if (!slot.plan) return slot.entry
    return entryOf(slot.plan, await runParseJob(slot.plan.job))
  }

  /**
   * Whether a session file's index still matches disk (signature + shape). A read-only predicate that
   * triggers no rebuild —
   * the renderer uses it to decide whether to show the interim "rebuilding the index for this file only"
   * state (ticket 05),
   * and the sessionQuestions call that follows does the actual rebuild. The file changing between the
   * two steps is harmless: the rebuild is idempotent. With no store to read — the module will not load, or the
   * store will not open — no index matches, and the read that follows says why.
   */
  isFresh(file: string): boolean {
    let cached: CacheEntry | undefined
    try {
      cached = this.openStore()?.get(file)
    } catch {
      return false
    }
    if (!cached) return false
    const sig = cached.agg.kind === 'antigravity' ? agySessionSignature(file) : sigOf(file)
    return sig !== null && cached.sig === sig
  }

  /**
   * The session page service (ticket 04): give a scanned session's question index and fork state.
   * - Validate the (path, mtime, size) signature before fetching; on a mismatch, **rebuild only that
   *   file's** index and write
   *   the cache back (spec C4), without a full rescan. An entry that is not well formed is rebuilt the same
   *   way; a Claude session's index is then served and not kept, as there is no project to keep it under.
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
    /** The ID the session's own side resumes it by (session-view::US-001/AC-01); null when its record has none */
    sessionId: string | null
    /** The file the questions' and turns' byte ranges are in: the session file itself, or for an Antigravity
     * conversation its transcript (session-view::REQ-004/AC-02) — derived here, never taken from the renderer */
    source: string
  }> {
    const store = this.openStore()
    // With no store to read, nothing tells a session the scan never indexed — the read allow-list admitted the file —
    // so the page rebuilds the index as for an entry that is not well formed, and keeps it nowhere (session-view C4)
    const { held, entry: cached } = store?.lookup(file) ?? { held: true, entry: undefined }
    // An entry that is not well formed is read again for the page; a file nothing is held for is a session the
    // scan never indexed
    if (!held) throw appError(ERR.sessionNotIndexed)
    // The side is judged from the data root, not trusted to a possibly corrupt cache entry
    const agyConversation = isAgyConversation(roots, file)
    const sig = agyConversation ? agySessionSignature(file) : sigOf(file)
    if (sig === null) throw appError(ERR.sessionFileUnreadable)
    let agg: FileAgg | null = cached && cached.sig === sig ? cached.agg : null
    if (agg === null) {
      const claudeRoot = join(roots.claudeHome, 'projects')
      let fresh: FileAgg | null
      // A Codex rollout's rebuilt entry, which carries its resume state beside the aggregate
      let codexEntry: CacheEntry | null = null
      // Whether the rebuilt index is kept in the store: always, but for a Claude session with no project to keep
      let kept = true
      if (agyConversation) {
        // The database and the transcript read again, for this conversation alone (C4); a read that fails while agy
        // writes is this page's failure, and the next fetch tries again
        fresh = (await runParseJob({ kind: 'antigravity', file }))?.agg ?? null
      } else if (file.startsWith(claudeRoot)) {
        // Top level = a session (listable), deeper = a subagent or other nested transcript — the same
        // rule as listJsonl.
        // projectKey keeps the value the entry held: the project a Claude session is credited to comes from the
        // registry, which only a build reads, and a build that finds the entry's signature current takes the key
        // with it. So with no well-formed entry to take the key from, the index serves this page and is not kept
        // (session-view C4): kept under no project it would be that hit, and the session would leave its project
        // until its file next changed. The next build parses the file.
        const listedBase = dirname(dirname(file)) === claudeRoot
        fresh = await parseClaudeFile(file, cached?.agg.projectKey ?? '', listedBase)
        kept = cached !== undefined
      } else if (file.startsWith(join(roots.grokHome, 'sessions') + sep)) {
        // A Grok stream rebuilds through the Grok parse, its meta read the way the walk reads it; it
        // used to fall through to the Codex branch below, whose meta reader cannot read a Grok stream
        const meta = readGrokSessionMeta(file)
        if (!meta) throw appError(ERR.sessionMetaUnreadable)
        fresh = await parseGrokFile(file, mergeKey(meta.cwd), meta.subagent)
      } else {
        const meta = readCodexSessionMeta(file)
        // No metadata out of a file that cannot be read is the file's failure, not its first line's (session-view P6)
        if (!meta) throw appError(isReadable(file) ? ERR.sessionMetaUnreadable : ERR.sessionFileUnreadable)
        const entry = await this.codexEntry(cached, file, meta.cwd, meta, readCodexIndex(roots.codexHome))
        if (!entry) throw appError(ERR.sessionFileUnreadable)
        // Stored with the state its next resume starts from
        codexEntry = entry
        fresh = entry.agg
      }
      // A parse gives null only when the file cannot be read: a bad line is skipped, and a format it does not know is
      // an agg marked unreadable, below
      if (!fresh) throw appError(ERR.sessionFileUnreadable)
      agg = fresh
      if (kept && store) {
        // A write that fails is logged and fails no page: the index answers from here, and the store still lacks it,
        // so the next read and the next scan parse the file again (session-view C4, token-stats C3)
        store.write(new Map([[file, codexEntry ?? { sig, agg: fresh }]]))
        if (this.parentFiles) addParentFile(this.parentFiles, file, fresh)
      }
    }
    if (agg.kind === 'antigravity') {
      // A conversation that cannot be read in the supported format is listed nowhere and has no page
      if (agg.unreadable) throw appError(ERR.sessionParseFailed)
      const parent = this.agyParent(agg, roots)
      // Read once when no build has yet: the titles the list shows, so the page and the banner agree with it
      this.agyTitles ??= readAgySummaryTitles(roots.antigravityHome, this.agyTmpParent) ?? new Map()
      return {
        side: 'antigravity',
        questions: agg.questions,
        // A fork's copied history is never in its transcript (measured): nothing is stripped, and its state is
        // certain whether its parent is still here or not (session-view::REQ-005/AC-03, AC-05)
        forkState: agg.forkOf === null ? 'none' : 'stripped',
        title: this.agyTitles.get(agg.conversationId) ?? agg.title,
        at: agg.at,
        forkPoints: 0,
        forkParentTitle: parent ? (this.agyTitles.get(parent.conversationId) ?? parent.title) : null,
        forkParentFile: parent?.file ?? null,
        sessionId: sessionIdFromPath('antigravity', file),
        source: sessionReadSource(roots, file)
      }
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
        forkParentFile: null,
        sessionId: sessionIdFromPath('claude', file),
        source: file
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
        forkParentFile: null,
        sessionId: sessionIdFromPath('grok', file),
        source: file
      }
    }
    const shown = await this.codexShown(agg, roots)
    return {
      side: 'codex',
      questions: shown.questions,
      forkState: shown.state,
      title: shown.title,
      at: agg.at,
      forkPoints: 0,
      // The parent is named as its own page and the list title it: a parent that is itself a stripped fork by
      // its first question left, not by the question it replayed (#278)
      forkParentTitle: shown.parent ? (await this.codexShown(shown.parent, roots)).title : null,
      forkParentFile: shown.parent?.file ?? null,
      // Codex keeps the ID in its record's session metadata, read by the scan
      sessionId: agg.sessionId,
      source: file
    }
  }

  /**
   * The conversation an Antigravity fork came from, when it is still on this machine: the readable conversation in the
   * store whose own id is the one the fork's last copied step names (session-view::REQ-005/AC-02, AC-04). The store is
   * the scan set, so a parent deleted since the last scan is gone from it at the next one.
   */
  private agyParent(agg: AntigravityFileAgg, roots: ScanRoots): AntigravityFileAgg | undefined {
    if (agg.forkOf === null) return undefined
    for (const file of this.parentFilesOf(this.store, roots).antigravity.get(agg.forkOf) ?? []) {
      if (file === agg.file) continue
      const v = this.store?.get(file)?.agg
      if (v?.kind === 'antigravity' && !v.unreadable && v.conversationId === agg.forkOf) return v
    }
    return undefined
  }

  /**
   * A Codex session as its page shows it: its questions after the replay strip against its parent in the
   * store, and its title. A fork whose leading questions were stripped and whose title came from its first
   * question takes the title of the first question left — the scan's re-title of the listed session, so the
   * session page, the project search and the fork banner show the list's titles (spec B2); thread_name
   * keeps priority (A4).
   */
  private async codexShown(
    agg: CodexFileAgg,
    roots: ScanRoots
  ): Promise<{ questions: QuestionRec[]; state: ForkState; title: string | null; parent: CodexFileAgg | undefined }> {
    let parent: CodexFileAgg | undefined
    if (agg.parentId) {
      for (const file of this.parentFilesOf(this.store, roots).codex.get(agg.parentId) ?? []) {
        if (file === agg.file) continue
        const v = this.store?.get(file)?.agg
        if (v?.kind === 'codex' && v.sessionId === agg.parentId) {
          parent = v
          break
        }
      }
    }
    const shown = stripReplayPrefix(
      agg.questions,
      parent && parent.kind === 'codex' ? parent.questions : null,
      agg.forkedAt,
      // A paginated child carries no replayed events (spec B2): nothing to strip, no check to fail
      agg.parentId !== null && !agg.paginated
    )
    const first = shown.questions[0]
    const retitled =
      !agg.titleFromThread && first && shown.questions.length < agg.questions.length
        ? await strippedForkTitle(agg.file, first[0], first[1])
        : null
    return { questions: shown.questions, state: shown.state, title: retitled ?? agg.title, parent }
  }
}


/** Whether a session file is an Antigravity CLI conversation: a database in agy's conversations directory */
function isAgyConversation(roots: ScanRoots, file: string): boolean {
  return file.startsWith(join(roots.antigravityHome, 'conversations') + sep)
}

/**
 * The file a session's question and turn byte ranges are read from: the session file itself, or for an Antigravity
 * conversation its transcript (session-view::REQ-004/AC-02). Derived by the main process from the session file the
 * read allow-list admitted — never taken from the renderer — so a transcript is read only through its listed
 * conversation (session-view::REQ-004/AC-09). The session page's handlers take the source's identity before the index
 * is consulted, as they always have, so this is a function of the path alone.
 */
export function sessionReadSource(roots: ScanRoots, file: string): string {
  return isAgyConversation(roots, file) ? agyTranscriptPath(file) : file
}

/**
 * The title a stripped Codex fork takes from its first question left: that line read live by byte range,
 * its real user text clipped as a title; null when the line cannot be read or holds no real text, and the
 * caller then keeps the original title — degradation only hurts that one title.
 * The scan's re-title of the listed session and the session questions behind the session page, the
 * project search and the fork banner's parent title all use it, so every surface shows the same title
 * (spec B2). It runs only for such forks, of which there are very few (0 in this machine's real data),
 * each reading a single line, so it adds no meaningful cost.
 */
async function strippedForkTitle(file: string, start: number, end: number): Promise<string | null> {
  try {
    // The shared range reader: a byte read on a plain rollout, one streaming pass on a cold one (spec C2)
    const { texts } = await readRanges(file, [{ start, end }])
    const obj: unknown = JSON.parse(texts[0])
    const msg = (obj as Record<string, unknown>)?.['payload'] as Record<string, unknown> | undefined
    const text = typeof msg?.['message'] === 'string' ? msg['message'] : null
    const clean = text === null ? null : realUserText(text)
    return clean === null ? null : clipTitle(clean)
  } catch {
    return null
  }
}

async function retitleStripped(items: TokenBuildResult['retitle']): Promise<void> {
  for (const it of items) {
    const title = await strippedForkTitle(it.file, it.start, it.end)
    if (title !== null) it.session.title = title
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

/** `agyTitles`: agy's own conversation titles by conversation id (session-view::REQ-003/AC-03); none for a restore,
 * which needs the rows alone */
function combine(aggs: FileAgg[], agyTitles: ReadonlyMap<string, string> = new Map()): TokenBuildResult {
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
    // Only the legacy span can hold a replayed prefix: records are never copied into a child thread and
    // paginated children get no usage events either (spec B10), so a fully paginated child has an
    // empty legacy span and nothing below strips anything from it.
    const legacy = a.events.slice(0, a.boundary)
    if (a.parentId) {
      const parent = bySessionId.get(a.parentId)
      if (!parent || parent === a) {
        // The parent log is not in the scan set: degrade to the "rewrite burst" heuristic
        start = skipRewrittenBurst(legacy)
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
        while (start < legacy.length && start < prefix.length && sameUsage(prefix[start], legacy[start])) {
          start++
        }
        // The very first does not match → the parent stream cannot anchor this replay (the log was
        // rewritten), so degrade to the burst heuristic
        if (start === 0) start = skipRewrittenBurst(legacy)
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
          // A paginated child carries no replayed events (spec B2): nothing to strip, no check to fail
          a.parentId !== null && !a.paginated
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

  // ── Antigravity CLI: each model call once across every conversation (token-stats::REQ-003/AC-01) ──
  // A call's identity spans databases — a generator record a fork copied from its parent carries the parent's call —
  // so calls are matched here, after the per-file reads, keeping the first in scan order. A call without an identity
  // cannot be matched and counts where it is. The total is the four fields (AC-03): agy's input already leaves the
  // cache reads out and its output already holds the thinking, so nothing is subtracted or added again.
  let antigravityUnreadable = 0
  const seenCalls = new Set<string>()
  for (const a of aggs) {
    if (a.kind !== 'antigravity') continue
    if (a.unreadable) {
      antigravityUnreadable++
      continue
    }
    /** The conversation's own usage: the calls it keeps after the match across databases (session-view::REQ-003/AC-05,
     * the rule the Claude rows follow) — a fork's copies were already left out by the read */
    let fileTokens = 0
    for (const [identity, at, input, output, cacheRead, cacheWrite, model] of a.calls) {
      if (identity !== null) {
        if (seenCalls.has(identity)) continue
        seenCalls.add(identity)
      }
      const total = input + output + cacheRead + cacheWrite
      fileTokens += total
      addRow(at === null ? null : localDay(at), 'antigravity', a.projectKey, model ?? '', { input, output, cacheRead, cacheWrite, total })
      if (a.projectKey) projectOf(a.projectKey)
    }
    // The session row (session-view::REQ-003): a subagent, a conversation that asked nothing and one in an unregistered
    // folder have none, their tokens counted above. A fork is marked as one, its state never uncertain (REQ-005/AC-05)
    if (a.projectKey && a.listed) {
      projectOf(a.projectKey).sessions.push({
        side: 'antigravity',
        title: agyTitles.get(a.conversationId) ?? a.title,
        at: a.at,
        tokens: fileTokens,
        file: a.file,
        questionCount: a.questions.length,
        forkState: a.forkOf === null ? 'none' : 'stripped'
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
  return { global, perProject, rows, retitle, sessionFiles: new Set<string>(), antigravityUnreadable }
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

/** Every jsonl under a directory, in scan order (scan-order.ts): top level = a session, nested = a subagent or other
 * transcript */
function listJsonl(root: string): Array<{ file: string; nested: boolean }> {
  const out: Array<{ file: string; nested: boolean }> = []
  const walk = (dir: string, nested: boolean): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort(byName)
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

/** Whether a session is listed */
function listedOf(agg: FileAgg): boolean {
  return agg.listed
}

/**
 * Whether a list field is a list of rows of one tuple type, every row checked: as many elements as `shape` has
 * letters, each of the type its letter names — `n` a number, `N` a number or null, `S` a string or null. A row that
 * is no row (a `null` among them) throws where the aggregation reads it, and text where a number belongs is joined
 * on, not added: either way at every scan, the entry still a hit.
 */
function isRows(v: unknown, shape: string): boolean {
  if (!Array.isArray(v)) return false
  for (const row of v as unknown[]) {
    if (!Array.isArray(row) || row.length !== shape.length) return false
    for (let i = 0; i < shape.length; i++) {
      const x: unknown = row[i]
      if (x === null ? shape[i] === 'n' : typeof x !== (shape[i] === 'S' ? 'string' : 'number')) return false
    }
  }
  return true
}

/** Whether an aggregate has every field its side's FileAgg requires, each of the type it requires, its lists row by
 * row (isRows) */
function isWellFormedAgg(agg: unknown): agg is FileAgg {
  if (typeof agg !== 'object' || agg === null) return false
  const a = agg as Record<string, unknown>
  // `file` is the session's identity; missing it flows all the way to the contract layer and throws away
  // the whole detail payload (upward escape).
  // **When adding a required field to FileAgg, add a line here at the same time** — the version number
  // only catches across versions,
  // and manual corruption or drift within one version is caught only by this guard.
  if (typeof a['file'] !== 'string' || a['file'] === '') return false
  // The record's **arity** needs guarding too: the version number only catches across versions, and
  // manual corruption or future drift within one version is caught only by this gate.
  // One element short degrades the fingerprint comparison into undefined === undefined, which is always
  // true, and so strips blindly.
  if (!isRows(a['questions'], 'nnnNnnn')) return false
  // What every side's aggregate carries. A missing `projectKey` would take the session's usage out of its project
  // and leave it in the total, at every launch, the entry still a hit; a missing `listed` would silently HIDE a real
  // session; `title` and `at` go to the session list as they are
  if (typeof a['projectKey'] !== 'string' || typeof a['listed'] !== 'boolean') return false
  if (a['title'] !== null && typeof a['title'] !== 'string') return false
  if (a['at'] !== null && typeof a['at'] !== 'number') return false
  // A missing `unreadable` would drop the conversation from the count, a call of another arity would misread its
  // fields; a missing `subagent` would list a subagent, a missing `forkOf` would unmark a fork, a missing
  // `conversationId` would lose its title and its parent
  if (a['kind'] === 'antigravity') {
    return (
      typeof a['unreadable'] === 'boolean' &&
      isRows(a['calls'], 'SNnnnnS') &&
      typeof a['conversationId'] === 'string' &&
      typeof a['subagent'] === 'boolean' &&
      (a['forkOf'] === null || typeof a['forkOf'] === 'string')
    )
  }
  // A missing forkPoints (undefined) gives the banner judgement a false value, and corruption within one
  // version is caught only by this gate
  if (a['kind'] === 'claude') return isRows(a['entries'], 'SSnnnnnSS') && typeof a['forkPoints'] === 'number'
  // A missing titleFromThread (undefined) is a false false: it lets a retitle displace a thread_name session;
  // a missing boundary (undefined) would make every slice(0, undefined) the whole list and strip records
  if (a['kind'] === 'codex') {
    return (
      isRows(a['events'], 'Nnnnn') &&
      typeof a['titleFromThread'] === 'boolean' &&
      typeof a['boundary'] === 'number' &&
      // A missing paginated (undefined) would run the replay check on a paginated child and flag it uncertain
      typeof a['paginated'] === 'boolean' &&
      // The model names the bucket the rollout's usage goes to; a missing `sessionId` would lose the ID its page
      // resumes it by and the forks that name it their parent; `parentId` and `forkedAt` decide which of a fork's
      // questions are its own
      typeof a['model'] === 'string' &&
      (a['sessionId'] === null || typeof a['sessionId'] === 'string') &&
      (a['parentId'] === null || typeof a['parentId'] === 'string') &&
      (a['forkedAt'] === null || typeof a['forkedAt'] === 'number')
    )
  }
  // A missing subagent (undefined) would silently list a subagent session
  if (a['kind'] === 'grok') return isRows(a['events'], 'NnnnnS') && typeof a['subagent'] === 'boolean'
  return false
}

function sigOf(file: string): string | null {
  return statOf(file)?.sig ?? null
}

/** The cache signature (mtime and size) with the inode and size a resume is judged by */
function statOf(file: string): { sig: string; ino: number; size: number } | null {
  try {
    const st = statSync(file)
    return { sig: `${st.mtimeMs}:${st.size}`, ino: st.ino, size: st.size }
  } catch {
    return null
  }
}

/**
 * Whether a build's entry for a file is the one the cache already held. A cache hit hands the held aggregate
 * on, with its signature and resume state, and every parse makes a new aggregate, a resumed one included, so
 * the aggregate being the very object held is the whole test.
 */
function isHeldEntry(held: CacheEntry | undefined, entry: CacheEntry): boolean {
  return held?.agg === entry.agg
}

/**
 * Whether what the cache holds under a path is an entry: a signature and a well-formed aggregate. CacheEntries asks
 * this before it hands anything out, so both are checked in one place and before either is read. The resume state
 * a Codex entry carries is not asked about here (CacheEntry).
 */
function isWellFormedEntry(held: unknown): held is CacheEntry {
  if (typeof held !== 'object' || held === null) return false
  const e = held as Record<string, unknown>
  return typeof e['sig'] === 'string' && isWellFormedAgg(e['agg'])
}

/** The cache entry a parse produces: a Codex rollout's carries the state its next resume starts from */
function entryOf(plan: NonNullable<Slot['plan']>, parsed: ParseResult): CacheEntry | null {
  if (!parsed) return null
  const { job, st } = plan
  if (job.kind !== 'codex' || !parsed.state) return { sig: st.sig, agg: parsed.agg }
  return {
    sig: st.sig,
    agg: parsed.agg,
    resume: { ...parsed.state, ino: st.ino, size: st.size, resumes: job.from ? job.from.state.resumes + 1 : 0 }
  }
}

/** Only the fields a parse reads — a walk's session meta carries more, which a worker need not receive */
function codexParseMeta(m: CodexParseMeta): CodexParseMeta {
  return { subagent: m.subagent, sessionId: m.sessionId, parentId: m.parentId, forkedAt: m.forkedAt, paginated: m.paginated }
}

/** The session_index name of a rollout, by the id in its file name (either suffix) */
function threadNameOf(file: string, titles: Map<string, string>): string | undefined {
  const id = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(?:\.zst)?$/.exec(file)?.[1]
  return id ? titles.get(id) : undefined
}

function isCodexResume(v: unknown): v is CodexResume {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r['ino'] === 'number' &&
    typeof r['size'] === 'number' &&
    typeof r['cursor'] === 'number' &&
    (r['prevTotal'] === null || (typeof r['prevTotal'] === 'object' && !Array.isArray(r['prevTotal']))) &&
    (r['prevTotalKey'] === null || typeof r['prevTotalKey'] === 'string') &&
    typeof r['boundary'] === 'number' &&
    Array.isArray(r['seenResponses']) &&
    r['seenResponses'].every((x) => typeof x === 'string') &&
    typeof r['model'] === 'string' &&
    (r['firstTitle'] === null || typeof r['firstTitle'] === 'string') &&
    typeof r['resumes'] === 'number'
  )
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
  const idx = makeQuestionIndexer()
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
      const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
      if (!Number.isNaN(ts)) lastAt = lastAt === null ? ts : Math.max(lastAt, ts)
      const usage = msg?.['usage'] as Record<string, unknown> | undefined
      if (!usage) return
      const rawModel = typeof msg?.['model'] === 'string' ? msg['model'] : null
      entries.push([
        typeof msg?.['id'] === 'string' ? msg['id'] : null,
        typeof obj['requestId'] === 'string' ? obj['requestId'] : null,
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

interface CodexParseMeta {
  subagent: boolean
  sessionId: string | null
  parentId: string | null
  forkedAt: number | null
  paginated: boolean
}

/** The state a parse carries out of a rollout (the engine module's, engine/src/sides/codex/); entryOf adds the inode,
 * the size and the count */
type CodexParseState = Omit<CodexResume, 'ino' | 'size' | 'resumes'>

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
