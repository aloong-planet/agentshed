// The token aggregation engine (aligned with ccusage, 2026-07-30; the source-level basis is in ADR-0005):
// - Claude: recursively scan **the whole tree** under claudeHome/projects (independent of the project
//   registry; unregistered directories count toward the global total); each session file read and parsed by
//   the engine module, engine/src/sides/claude/, into the entries it combines by group (engine/src/group/):
//   each usage line becomes an entry, and the combination deduplicates across files — the exact
//   key is message.id+requestId, falling back to message.id-only when either side is isSidechain
//   (a subagent replays its parent's messages under a new requestId); keep the non-sidechain one,
//   otherwise the one with the larger four-field token sum. The total rule = input+output+cacheRead+cacheWrite;
//   entries whose model is '<synthetic>' or missing count toward the total but do not enter a model bucket.
// - Codex (each rollout read and parsed by the engine module, engine/src/sides/codex/, into the entry it
//   combines): per-turn last_token_usage increment events (payload.type=token_count inside event_msg);
//   a legacy fork or subagent rollout replays its parent's history, stripped by the same rules as ccusage's
//   replay.rs — take the parent's event sequence before the fork moment and skip entries at the start
//   of the child that match it by value (if the parent is not in the scan set, or not even the first entry
//   matches, the start is ccusage's rewrite burst instead);
//   the same turn can be re-reported, so a record whose running cumulative has not advanced
//   contributes nothing and one with no per-turn figure contributes the difference of the cumulatives;
//   accounting: sanitise input (subtract cached), count cached as cacheRead, total = input + output
//   (cache creation is not collected on this side or on Grok's — ADR-0023);
//   the model comes from the last turn_context (an approximation of the session's primary model).
// - The incremental cache stores entry-level data, and each de-duplication group's combined result: deduplication
//   happens across files, and only among the files a key links, so a group is combined again when its input changes
//   (token-stats::CON-003); keyed by (path, mtime, size), one row per file in the token store the engine module keeps
//   (ADR-0044). The statistics include stale projects.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import type { AgentSide, ForkState, ProjectStats, SessionMeta, TokenStats } from '@shared/domain'
import { deriveStats } from '@shared/usage'
import { mergeKey } from '@shared/path-key'
import { sessionIdFromPath } from '@shared/session-resume'
import { ERR, appError } from '@shared/errors'
import { encodeClaudeProjectDir } from './claude'
import { isColdRollout } from './cold-rollout'
import { mapLimit, readRanges } from './range-read'
import { isAbsent, isReadable } from './read-utils'
import type { QuestionRec } from './question-index'
import type { ScanRoots } from './types'
import type { SessionWalk } from './scan'
import { byName, compareNames, compareScanOrder } from './scan-order'
import { agySessionSignature, agyTranscriptPath } from './antigravity'
import type { UsageRow } from './archive'
import {
  loadEngineModule,
  threadEngineModule,
  type CombinedScan,
  type EngineSource,
  type ScanFile,
  type TokenStore,
  type TokenStoreHead,
  type TokenStoreRow
} from '../engine-module'

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
 * One model call of an Antigravity conversation, as the token cache keeps it: [identity, time (epoch ms), input, output,
 * cache read, cache write, model]. The identity is the call's response id, else its provider-assigned id, else its
 * message id; null when it carries none, and then it is never matched across databases. The time is the call's step's
 * completion, else its creation (token-stats::REQ-003/AC-05); null for a call recorded by a generator record alone. The
 * model is the generator record's response model as agy recorded it; null without one (token-stats::REQ-003/AC-04).
 */
type AgyCall = [string | null, number | null, number, number, number, number, string | null]

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
 * v21: the token store gained each entry's de-duplication keys and each group's combined result, with the group's input
 *      and the combination it came from — the tables `keys` and `results`, and beside each entry its number, the write
 *      that held it and what the grouping read of it (engine/src/store/) — **a structure change of the store**. The
 *      per-file aggregate is still v19's, so the first launch still imports a v19 JSON file. Version 20 never shipped (no
 *      release tag holds it): only a development store of v20 is replaced, and parses every file once.
 *
 * Not bumped, for one computation change and its reasons alone (#427): a Codex rollout's last line is read only once its
 *      line feed is written, where the TypeScript parser read it at once. The change reaches only an entry cached while a
 *      rollout's last line had no line feed yet. While that file stays unchanged, which happens only if Codex stopped
 *      between the line and its line feed, the entry keeps the figure the TypeScript parser gave. Once the file grows,
 *      the resume reads on under the new rule, and only that question's end stays one byte short until the file is
 *      next parsed whole: no figure and no question's text differ. No rollout on this machine was in that state (none
 *      of the 311 non-empty plain rollouts, 2026-11-15). A bump would make every install parse every rollout again, and
 *      would not reach such an entry where one could be: an entry from a released install reaches the store only
 *      through a version-19 JSON file, which its first launch with the store imports whatever this number is.
 *
 * Not bumped, for one computation change and its reasons alone (#439): an Antigravity conversation is unreadable when
 *      its trajectory record carries a field the reader reads in another wire type than its descriptor declares, where
 *      the field was passed over, and when the scan lists its database but cannot look at it, where it was left out as
 *      deleted. The second never reached the store: such a conversation had no entry in a scan, so one held for it was
 *      removed. The first reaches only an entry cached from a record already in that state, and no conversation on this
 *      machine is (none of the 19, 2026-11-15). Such an entry stands whole — its figures, its project and its place
 *      in the session lists — until the conversation's signature next changes, while the walk, which keeps no
 *      reading across launches, credits it to no folder. A bump would make every
 *      install parse every side's files again, and would still not reach such an entry where one could be: an entry
 *      from a released install reaches the store only through a version-19 JSON file, which its first launch with the
 *      store imports whatever this number is.
 *
 * Each of the two exempts its own change; the rule above stands for every other.
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
export const CACHE_VERSION = 21

/**
 * The last structure version kept in the JSON cache file, and the only one a first launch imports (token-stats C26): its
 * per-file aggregate is the store's (CACHE_VERSION, v20 and v21). A literal, not `CACHE_VERSION - 1`: a later bump changes what
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
  const module = loadEngineModule(engine)
  const snapshot = module.readTokenStoreSnapshot(file, CACHE_VERSION)
  if (snapshot.version !== CACHE_VERSION || !snapshot.rows) {
    throw new Error(`cache snapshot is version ${snapshot.version ?? 'none'}, this build reads version ${CACHE_VERSION}`)
  }
  // The store holds its rows in the order it first held them, which a later scan's order need not be
  const order = compareScanOrder(roots)
  const rows = [...snapshot.rows].sort((a, b) => order(a.path, b.path))
  // A scan parses again the file of an entry that is not well formed; a restore has no file to parse, and rows
  // from the other entries alone would write a day's figure short of that entry's usage as an accepted change
  const bad = rows.filter((row) => !CacheEntries.entryOf(row)).length
  if (bad > 0) throw new Error(`cache snapshot holds ${bad} of ${rows.length} entries that are not well formed`)
  // One combination over every entry, as a scan of that data sums its groups to; the rows need no admission or title.
  // An entry the module cannot read, which the check above let through, is refused as well
  const combined = module.combineEntries(rows.map((row) => ({ path: row.path, agg: String(row.agg), admitted: false, title: null })))
  if (combined.leftOut.length > 0) throw new Error(`cache snapshot holds ${combined.leftOut.length} of ${rows.length} entries that are not well formed`)
  return combined.rows
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

  static #read<T>(read: { rows: T[]; failure?: string | null }): T[] {
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

  /** Every file something is held for, by path, with what the module read of its entry when it was written: a read
   * that fails is nothing held, and every file is a miss. Asked at every build: no file's signature or group is kept
   * between two scans, in this thread or in the module, and the aggregates and the key index stay in the store, a
   * group's aggregates read only when it is combined again (engine/src/group/) */
  heads(): Map<string, TokenStoreHead> {
    const out = new Map<string, TokenStoreHead>()
    for (const head of CacheEntries.#read(this.#store.heads())) out.set(head.path, head)
    return out
  }

  /** An entry as the store takes it: its aggregate and resume state as JSON text */
  static putOf(this: void, e: CacheEntry): NonNullable<ScanFile['put']> {
    return { sig: e.sig, agg: JSON.stringify(e.agg), ...(e.resume === undefined ? {} : { resume: JSON.stringify(e.resume) }) }
  }

  /** A scan by group (token-stats::CON-003): the module reads a held entry, and judges it, as its group is combined
   * again; the store's failures come back as a value, which the caller logs */
  scan(combination: string, files: ScanFile[], last: boolean): CombinedScan | { bad: string[]; failure: string | null } {
    return this.#store.scan(combination, files, last)
  }

  /** Holds `puts` and removes `removes`, all of it or none (token-stats C3); whether it landed */
  write(puts: ReadonlyMap<string, CacheEntry>, removes: readonly string[] = []): boolean {
    if (puts.size === 0 && removes.length === 0) return true
    const rows = [...puts].map(([path, e]) => ({ path, ...CacheEntries.putOf(e) }))
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
      /** The conversation's full transcript (`agyTranscriptPath`), where its questions are: the path the session page's
       * range reads take, worked out on the engine's thread */
      transcript: string
      /** Where the copy of a conversation agy has open is made: the system temporary directory when absent (tests
       * inject one, as the walk takes one) */
      tmpParent?: string
    }

/** A parse's output: the agg, and for Codex the state a later resume starts from; null when unreadable (for an
 * Antigravity conversation: when the read failed while agy was writing it — one that cannot be read in the supported
 * format is an agg marked unreadable) */
export type ParseResult = { agg: FileAgg; state?: CodexParseState } | null

/** Parses one job on the calling thread. A parse worker runs this same function (parse-worker.ts). */
// Every side is the module's, so nothing here awaits; it stays async so that a throw from the module rejects the
// promise the parse workers and the pool chain on, rather than escaping the call
// eslint-disable-next-line @typescript-eslint/require-await
export async function runParseJob(job: ParseJob): Promise<ParseResult> {
  switch (job.kind) {
    case 'claude':
    case 'codex':
    case 'grok':
      // Read and parsed by the engine module (ADR-0045), which this thread loaded before it parses
      return threadEngineModule().parse(job)
    case 'antigravity':
      // Read by the engine module (ADR-0045), databases and transcript alike
      return threadEngineModule().parse(job)
  }
}

/** Where a build's parses run, and how many at once */
export interface ParseRunner {
  run(job: ParseJob): Promise<ParseResult>
  concurrency: number
}

/** On the calling thread, one file at a time — what tests and the session page use */
const INLINE: ParseRunner = { run: runParseJob, concurrency: 1 }

/** What a session file's admission to the read allow-list is judged by: its entry's project and whether it is listed */
interface Admission {
  projectKey: string
  listed: boolean
}

/** One file of a build, in scan order: held in the store, or given a new entry by a parse, or neither (no entry) */
interface Slot {
  file: string
  /** What the store holds for the file, when the held entry is the file's entry for this scan */
  held?: TokenStoreHead
  /** The entry a parse gave */
  entry?: CacheEntry
  plan?: { job: ParseJob; st: { sig: string; ino: number; size: number } }
  /** Whether the entry admits the file into the session read allow-list */
  admit: (agg: Admission) => boolean
  /** The entry kept when the parse fails while agy writes an Antigravity conversation (token-stats::REQ-004/AC-03):
   * its last successful read, under its old signature, so the next build reads the conversation again */
  fallback?: TokenStoreHead
  /** The file's slot as a miss with nothing held: the parse a held entry the combination could not read needs */
  miss: () => Slot
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

/** Adds a file by the id its side's forks name it by (`own`, ownOf) */
function addParentFile(index: ParentFiles, file: string, kind: string | null | undefined, own: string | null | undefined): void {
  const add = (by: Map<string, string[]>, id: string): void => {
    const files = by.get(id)
    if (!files) by.set(id, [file])
    else if (!files.includes(file)) {
      files.push(file)
      files.sort(index.order)
    }
  }
  if (typeof own !== 'string') return
  if (kind === 'codex') add(index.codex, own)
  if (kind === 'antigravity' && own !== '') add(index.antigravity, own)
}

/** The id an entry's side's forks name it by, as the module records it beside the entry: a Codex session's id, a
 * readable Antigravity conversation's own id; null for any other */
function ownOf(agg: FileAgg): string | null {
  if (agg.kind === 'codex') return agg.sessionId
  if (agg.kind === 'antigravity' && !agg.unreadable) return agg.conversationId
  return null
}

/** Whether the module read the held entry when it was written: it records the entry's side beside it then, and only
 * for an entry well formed by its side's rules */
function isReadEntry(head: TokenStoreHead): boolean {
  return typeof head.kind === 'string'
}

/** A build's result from what the combination gives: every figure derived from the rows (ADR-0025), each project's
 * from its own */
function resultOf(c: CombinedScan): TokenBuildResult {
  const byProject = new Map<string, UsageRow[]>()
  for (const r of c.rows) {
    if (!r.projectKey) continue
    const list = byProject.get(r.projectKey)
    if (list) list.push(r)
    else byProject.set(r.projectKey, [r])
  }
  const perProject = new Map<string, ProjectStats>()
  for (const [key, sessions] of c.projects) perProject.set(key, { tokens: deriveStats(byProject.get(key) ?? []), sessions })
  const retitle = c.retitle.map(([project, i, start, end]) => {
    const session = c.projects[project][1][i]
    return { session, file: session.file, start, end }
  })
  return {
    global: deriveStats(c.rows),
    perProject,
    rows: c.rows,
    retitle,
    sessionFiles: new Set(c.sessionFiles),
    antigravityUnreadable: c.antigravityUnreadable
  }
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
  /** What the stored group results this engine writes come from, before the time zone each build adds (token-stats,
   * Implementation Decisions, Cache): the application version in a packaged build, a run of its own otherwise */
  private readonly combination: string

  constructor(cacheDir: string, engine: EngineSource, runner: ParseRunner = INLINE, agyTmpParent?: string, combination = `run ${randomUUID()}`) {
    this.cacheDir = cacheDir
    this.engine = engine
    this.runner = runner
    this.agyTmpParent = agyTmpParent
    this.combination = combination
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

  /** The files the store holds an entry for, which the session walk keeps below a directory that is there but that it
   * cannot list (`EngineModule.walkSessions`, token-stats, Failure modes and boundaries: the token store); none when
   * there is no store */
  heldFiles(): string[] {
    return [...(this.openStore()?.heads().keys() ?? [])]
  }

  /** The files a fork's parent may be in, taken again from the store when another process wrote to it since — the
   * store's rows put in scan order, which the store does not hold them in */
  private parentFilesOf(store: CacheEntries | null, roots: ScanRoots): ParentFiles {
    if (this.parentFiles && !store?.changedByOther()) return this.parentFiles
    const index: ParentFiles = { codex: new Map(), antigravity: new Map(), order: compareScanOrder(roots) }
    for (const [file, head] of store?.heads() ?? []) addParentFile(index, file, head.kind, head.ownId)
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
    /** The scan's one session walk, shared with scan() (#160); walked here, by the engine module, when absent */
    sessions?: SessionWalk
  ): Promise<TokenBuildResult> {
    const isRegistered = (key: string): boolean =>
      registeredKeys ? registeredKeys.has(key) : key !== ''
    // What the store holds for each file, as it is now: whatever another process wrote before this point is in it
    // (token-stats C27). Held for this build only. A hit's entry is not read here: it stays in the store, which the
    // scan reads it from when its group is combined again.
    const store = this.openStore()
    store?.changedByOther()
    const held = store?.heads() ?? new Map<string, TokenStoreHead>()
    // Every file in scan order. The cache is consulted here, on the engine's thread; the misses are parsed
    // together below, as many at once as the runner allows; then every file is taken in this order, so
    // the combination sees exactly the sequence a one-at-a-time build saw.
    const slots: Slot[] = []

    // Encoded directory name → the project's merge key
    const encToProject = new Map<string, string>()
    for (const p of claudeProjectPaths) encToProject.set(encodeClaudeProjectDir(p), mergeKey(p))
    const order = compareScanOrder(roots)
    // A directory the walk lists that is there but cannot be listed keeps, in the scan set, the files the store holds
    // below it, each at its place in scan order and looked at as a listed file is (token-stats, Failure modes and
    // boundaries: the token store)
    const below = (dir: string): HeldFile[] => heldBelow(dir, held.keys(), order)

    // ── Claude: the whole projects tree ──
    const claude = (projectKey: string, file: string, nested: boolean): void => {
      // The allow-list is no wider than what the UI can reach: an unregistered project's sessions
      // are never displayed (spec A2),
      // so the read side does not admit them either — the same goes for nested transcripts, whose
      // parent sessions are all invisible
      const admit = (agg: Admission): boolean => isRegistered(projectKey) && (nested || agg.listed)
      slots.push(this.plan(held.get(file), file, admit, { kind: 'claude', file, projectKey, listed: !nested }))
    }
    const projectsRoot = join(roots.claudeHome, 'projects')
    let dirs: string[] | null
    try {
      // In scan order (scan-order.ts)
      dirs = readdirSync(projectsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort(compareNames)
    } catch {
      dirs = null
    }
    if (dirs !== null) {
      for (const encName of dirs) {
        const projectKey = encToProject.get(encName) ?? ''
        for (const { file, nested } of listJsonl(join(projectsRoot, encName), below)) claude(projectKey, file, nested)
      }
    } else if (!isAbsent(projectsRoot)) {
      // Each in a project's directory, taken as listJsonl takes one held there; one directly in the root is no
      // project's, as the listing above takes only directories
      for (const { file, parts: [encName, ...rest] } of below(projectsRoot)) {
        const t = rest.length > 0 ? heldTranscript({ file, parts: rest }, false) : null
        if (t) claude(encToProject.get(encName) ?? '', t.file, t.nested)
      }
    }

    // ── Codex: the whole sessions tree, attributed by the first line's cwd ──
    const walked = sessions ?? loadEngineModule(this.engine).walkSessions(roots, undefined, undefined, () => [...held.keys()])
    const titles = readCodexIndex(roots.codexHome)
    for (const s of inScanOrder(walked.codex, walked.held.codex, (s) => s.file, order)) {
      const admit = (agg: Admission): boolean => isRegistered(agg.projectKey) && (s.subagent || agg.listed)
      slots.push(this.codexPlan(store, held.get(s.file), s.file, s.cwd, s, titles, admit))
    }

    // ── Grok: the session store, attributed by the percent-encoded directory name ──
    // A directory without its update stream never reaches here (the walk skips it), which
    // is F6 discharged at the walk: the siblings' scan is unaffected.
    for (const s of inScanOrder(walked.grok, walked.held.grok, (s) => s.file, order)) {
      // Listed sessions only: a subagent's stream is never expanded in a parent turn on this side
      // (the dispatch's result comes from the parent's own finished record), so unlike Claude's
      // nested transcripts it stays outside the read allow-list
      const admit = (agg: Admission): boolean => isRegistered(agg.projectKey) && agg.listed
      slots.push(this.plan(held.get(s.file), s.file, admit, { kind: 'grok', file: s.file, projectKey: mergeKey(s.cwd), subagent: s.subagent }))
    }

    // ── Antigravity CLI: every conversation database, attributed by its own trajectory record ──
    // Listed conversations only join the read allow-list, by their database's path — the session's identity; the
    // transcript a page reads is derived from it on the main process (session-view::REQ-004/AC-09). A subagent's
    // transcript is never expanded in a parent turn on this side (its return is the parent's own system message).
    for (const file of inScanOrder(walked.antigravity.map((s) => s.file), walked.held.antigravity, (file) => file, order)) {
      const admit = (agg: Admission): boolean => isRegistered(agg.projectKey) && agg.listed
      slots.push(this.antigravityPlan(held.get(file), file, admit))
    }

    await this.parse(slots)
    // agy's titles, read before the combination: a title read beside a conversation is part of its group's input. A
    // failed read while agy writes its summaries keeps the last ones read
    this.agyTitles = readAgyTitles(roots.antigravityHome, this.agyTmpParent) ?? this.agyTitles ?? new Map()
    // The time zone the scan runs in is part of the combination: Codex, Grok and Antigravity usage is filed under its
    // day as the groups are combined
    const combination = `${this.combination} ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
    let combined = this.combine(store, combination, slots, false)
    // A stored entry the combination cannot read is parsed again, its file a miss, and the scan run again, once: that
    // round is the last, and what the store still cannot give then — another process removed or rewrote it meanwhile —
    // is left out of this scan's figures and read again at the next (token-stats C27)
    if ('bad' in combined) {
      if (combined.failure) console.error('[token-store] read failed:', combined.failure)
      const bad = new Set(combined.bad)
      const again: Slot[] = []
      slots.forEach((slot, i) => {
        if (!bad.has(slot.file)) return
        slots[i] = slot.miss()
        again.push(slots[i])
      })
      await this.parse(again)
      combined = this.combine(store, combination, slots, true)
      if ('bad' in combined) throw new Error('the token store named entries to parse again in a scan\'s last round')
    }
    // A file whose parsed entry the store cannot hold is left out too, as that file's failed read (A10, B12, F6)
    if (combined.leftOut.length > 0) console.warn('[token-store] left out of this scan and read again at the next:', combined.leftOut.join(', '))
    // A scan whose write did not land is logged and costs the next scan the work again, which the store then still
    // lacks (token-stats C3)
    if (combined.failure) console.error('[token-store] write failed:', combined.failure)
    const parentFiles: ParentFiles = { codex: new Map(), antigravity: new Map(), order }
    for (const slot of slots) {
      if (slot.entry) addParentFile(parentFiles, slot.file, slot.entry.agg.kind, ownOf(slot.entry.agg))
      else if (slot.held) addParentFile(parentFiles, slot.file, slot.held.kind, slot.held.ownId)
    }
    this.parentFiles = parentFiles
    const result = resultOf(combined)
    await retitleStripped(result.retitle)
    return result
  }

  /** Parses the slots that need it, as many at once as the runner allows; a parse that gives nothing leaves the slot
   * with the entry standing by, if any */
  private async parse(slots: Slot[]): Promise<void> {
    await mapLimit(
      slots.filter((slot) => slot.plan !== undefined),
      this.runner.concurrency,
      async (slot) => {
        if (!slot.plan) return
        slot.entry = entryOf(slot.plan, await this.runner.run(slot.plan.job)) ?? undefined
        if (!slot.entry) slot.held = slot.fallback
      }
    )
  }

  /**
   * The scan's files given to the combination, in scan order, each with its new entry when a parse gave it one and
   * otherwise held in the store; a file with neither has no entry, and its held one, if any, is removed. With no store,
   * every file was parsed, and the entries are combined in memory.
   */
  private combine(store: CacheEntries | null, combination: string, slots: Slot[], last: boolean): CombinedScan | { bad: string[]; failure: string | null } {
    const files: ScanFile[] = []
    for (const slot of slots) {
      if (slot.entry) {
        const { agg } = slot.entry
        files.push({ path: slot.file, put: CacheEntries.putOf(slot.entry), admitted: slot.admit(agg), title: this.titleBeside(agg.kind, ownOf(agg)) })
      } else if (slot.held) {
        const h = slot.held
        files.push({ path: slot.file, admitted: slot.admit({ projectKey: h.projectKey ?? '', listed: h.listed === true }), title: this.titleBeside(h.kind, h.ownId) })
      }
    }
    if (store) return store.scan(combination, files, last)
    return loadEngineModule(this.engine).combineEntries(
      files.map((f) => ({ path: f.path, agg: f.put?.agg ?? '', admitted: f.admitted, title: f.title }))
    )
  }

  /** The title read beside a session file: agy's own for an Antigravity conversation it could read (session-view::REQ-003/AC-03) */
  private titleBeside(kind: string | null | undefined, own: string | null | undefined): string | null {
    return kind === 'antigravity' && typeof own === 'string' ? (this.agyTitles?.get(own) ?? null) : null
  }

  /**
   * A file's slot: held in the store when the signature still matches, otherwise the job that parses it.
   * The signature is the one taken **before** parsing, so a file that grows while it is read shows as
   * changed on the next scan rather than matching a signature that already counts bytes the parse
   * never saw. An unreadable file gets neither. `cached` is what the store holds for the file, if anything.
   */
  private plan(cached: TokenStoreHead | undefined, file: string, admit: Slot['admit'], job: ParseJob): Slot {
    const miss = (): Slot => this.plan(undefined, file, admit, job)
    const st = statOf(file)
    if (st === null) return { file, admit, miss }
    // Beyond the version, a hit is an entry the module could read when it was written, which it records beside it:
    // manual corruption or future drift within one version is recomputed, so a missing field never flows into the
    // combination. The store is keyed by file path and a path's side never changes, so a hit is the same side's.
    if (cached && isReadEntry(cached) && cached.sig === st.sig) return { file, held: cached, admit, miss }
    return { file, admit, miss, plan: { job, st } }
  }

  /**
   * An Antigravity conversation's slot: held while its signature — the database's time and the log's presence, time
   * and size, never the database's size — still matches; read whole otherwise, as agy rewrites and truncates rows in
   * place. Its last readable entry stands by in case the read fails while agy writes (token-stats::REQ-004/AC-03).
   * One no longer there has no entry; one there whose database cannot be looked at is read, and that read finds a
   * database that will not open (AC-01), its entry kept under UNLOOKED_SIGNATURE while it stays so (QR-002).
   */
  private antigravityPlan(cached: TokenStoreHead | undefined, file: string, admit: Slot['admit']): Slot {
    const miss = (): Slot => this.antigravityPlan(undefined, file, admit)
    const looked = agySessionSignature(file)
    if (looked === null && isAbsent(file)) return { file, admit, miss }
    const sig = looked ?? UNLOOKED_SIGNATURE
    const usable = cached !== undefined && cached.kind === 'antigravity'
    // The module records a conversation's own id for one it could read, and only then
    const readable = usable && typeof cached.ownId === 'string'
    // Under UNLOOKED_SIGNATURE only the verdict a read out of sight gives holds: a readable entry there was read once
    // the scan could look again after its planning could not, and is read again (AC-01)
    const holds = looked !== null || !readable
    if (usable && cached.sig === sig && holds) return { file, held: cached, admit, miss }
    const fallback = readable ? cached : undefined
    return { file, admit, fallback, miss, plan: { job: { kind: 'antigravity', file, transcript: agyTranscriptPath(file) }, st: { sig, ino: 0, size: 0 } } }
  }

  /**
   * A Codex rollout's slot: held when its signature still matches; a job resuming from the held parse
   * state when the rollout only grew (CodexResume), which the miss reads from the store; a whole parse otherwise.
   */
  private codexPlan(
    store: CacheEntries | null,
    cached: TokenStoreHead | undefined,
    file: string,
    cwd: string,
    meta: CodexParseMeta,
    titles: Map<string, string>,
    admit: Slot['admit']
  ): Slot {
    const miss = (): Slot => this.codexPlan(store, undefined, file, cwd, meta, titles, admit)
    const st = statOf(file)
    if (st === null) return { file, admit, miss }
    if (cached && isReadEntry(cached) && cached.sig === st.sig) return { file, held: cached, admit, miss }
    const entry = cached?.kind === 'codex' ? store?.get(file) : undefined
    return { file, admit, miss, plan: { job: codexJob(entry, file, cwd, meta, titles, st), st } }
  }

  /**
   * One Codex rollout's entry outside a build (the session page), by the same rules. Parsed on the
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
    const st = statOf(file)
    if (st === null) return null
    if (cached && cached.sig === st.sig) return cached
    const plan = { job: codexJob(cached, file, cwd, meta, titles, st), st }
    return entryOf(plan, await runParseJob(plan.job))
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
        fresh = (await runParseJob({ kind: 'antigravity', file, transcript: agyTranscriptPath(file) }))?.agg ?? null
      } else if (file.startsWith(claudeRoot)) {
        // Top level = a session (listable), deeper = a subagent or other nested transcript — the same
        // rule as listJsonl.
        // projectKey keeps the value the entry held: the project a Claude session is credited to comes from the
        // registry, which only a build reads, and a build that finds the entry's signature current takes the key
        // with it. So with no well-formed entry to take the key from, the index serves this page and is not kept
        // (session-view C4): kept under no project it would be that hit, and the session would leave its project
        // until its file next changed. The next build parses the file.
        const listedBase = dirname(dirname(file)) === claudeRoot
        fresh = (await runParseJob({ kind: 'claude', file, projectKey: cached?.agg.projectKey ?? '', listed: listedBase }))?.agg ?? null
        kept = cached !== undefined
      } else if (file.startsWith(join(roots.grokHome, 'sessions') + sep)) {
        // A Grok stream rebuilds through the Grok parse, its meta read the way the walk reads it; it
        // used to fall through to the Codex branch below, whose meta reader cannot read a Grok stream
        const meta = threadEngineModule().sessionMeta('grok', file)
        if (!meta) throw appError(ERR.sessionMetaUnreadable)
        fresh = (await runParseJob({ kind: 'grok', file, projectKey: mergeKey(meta.cwd), subagent: meta.subagent }))?.agg ?? null
      } else {
        const meta = threadEngineModule().sessionMeta('codex', file)
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
        if (this.parentFiles) addParentFile(this.parentFiles, file, fresh.kind, ownOf(fresh))
      }
    }
    if (agg.kind === 'antigravity') {
      // A conversation that cannot be read in the supported format is listed nowhere and has no page
      if (agg.unreadable) throw appError(ERR.sessionParseFailed)
      const parent = this.agyParent(agg, roots)
      // Read once when no build has yet: the titles the list shows, so the page and the banner agree with it
      this.agyTitles ??= readAgyTitles(roots.antigravityHome, this.agyTmpParent) ?? new Map()
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
    // The scan's own rule, in the engine module, so the page and the list strip alike (spec B2)
    const shown = loadEngineModule(this.engine).stripReplayPrefix(
      agg.questions,
      parent && parent.kind === 'codex' ? parent.questions : null,
      agg.forkedAt,
      // A paginated child carries no replayed events (spec B2): nothing to strip, no check to fail
      agg.parentId !== null && !agg.paginated
    )
    const questions = agg.questions.slice(shown.stripped)
    const first = questions[0]
    const retitled =
      !agg.titleFromThread && first && questions.length < agg.questions.length
        ? await strippedForkTitle(agg.file, first[0], first[1])
        : null
    return { questions, state: shown.state, title: retitled ?? agg.title, parent }
  }
}


/**
 * agy's own conversation titles by conversation id (session-view::REQ-003/AC-03), read by the engine module from its
 * summaries database without writing there (token-stats::CON-002); null when the read failed while agy was writing them,
 * so the caller keeps the titles it last read. `tmpParent` is where a copy is made: the system temporary directory when
 * absent.
 */
function readAgyTitles(home: string, tmpParent: string | undefined): Map<string, string> | null {
  const pairs = threadEngineModule().sessionTitles('antigravity', home, tmpParent)
  return pairs === null ? null : new Map(pairs)
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
 * titled by the engine module as the index titles a session by its first question; null when the line cannot be read
 * or holds no question, and the caller then keeps the original title — degradation only hurts that one title.
 * The scan's re-title of the listed session and the session questions behind the session page, the
 * project search and the fork banner's parent title all use it, so every surface shows the same title
 * (spec B2). It runs only for such forks, of which there are very few (0 in this machine's real data),
 * each reading a single line, so it adds no meaningful cost.
 */
async function strippedForkTitle(file: string, start: number, end: number): Promise<string | null> {
  try {
    // The shared range reader: a byte read on a plain rollout, one streaming pass on a cold one (spec C2)
    const { texts } = await readRanges(file, [{ start, end }])
    return threadEngineModule().questionTitle('codex', texts[0])
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

// ── File enumeration and parsing ──

/** Every jsonl under a directory, in scan order (scan-order.ts): top level = a session, nested = a subagent or other
 * transcript. Below a directory there that cannot be listed, those of the files `below` gives for it. */
function listJsonl(root: string, below: (dir: string) => HeldFile[]): Array<{ file: string; nested: boolean }> {
  const out: Array<{ file: string; nested: boolean }> = []
  const walk = (dir: string, nested: boolean): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort(byName)
    } catch {
      if (!isAbsent(dir)) {
        for (const held of below(dir)) {
          const t = heldTranscript(held, nested)
          if (t) out.push(t)
        }
      }
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        walk(p, true)
        continue
      }
      if (isTranscript(e.name)) out.push({ file: p, nested })
    }
  }
  walk(root, false)
  return out
}

/** Whether a file of this name in Claude Code's projects tree is a transcript */
function isTranscript(file: string): boolean {
  return file.endsWith('.jsonl')
}

/** A file the store holds below a directory listJsonl walks at `nested`, as the listing gives it: one directly in it
 * keeps the directory's `nested`, one any deeper is nested; null when it is no transcript */
function heldTranscript({ file, parts }: HeldFile, nested: boolean): { file: string; nested: boolean } | null {
  return isTranscript(file) ? { file, nested: nested || parts.length > 1 } : null
}

/** A file the store holds, with its path's components below the directory it was asked for under */
interface HeldFile {
  file: string
  parts: string[]
}

/** The files of `held` below `dir`, in scan order */
function heldBelow(dir: string, held: Iterable<string>, order: (a: string, b: string) => number): HeldFile[] {
  const prefix = dir + sep
  const out: HeldFile[] = []
  for (const file of held) if (file.startsWith(prefix)) out.push({ file, parts: file.slice(prefix.length).split(sep) })
  return out.sort((a, b) => order(a.file, b.file))
}

/** A side's walked sessions and the ones it kept below a directory it could not list, each list in scan order, merged
 * into one in scan order */
function inScanOrder<T>(listed: readonly T[], kept: readonly T[], file: (t: T) => string, order: (a: string, b: string) => number): readonly T[] {
  if (kept.length === 0) return listed
  const out: T[] = []
  let i = 0
  let j = 0
  while (i < listed.length || j < kept.length) {
    if (j === kept.length || (i < listed.length && order(file(listed[i]), file(kept[j])) <= 0)) out.push(listed[i++])
    else out.push(kept[j++])
  }
  return out
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

/** The signature an Antigravity conversation's entry is kept under when its database could not be looked at: a real one
 * starts with the database's time, so none equals it, and the first scan that can look at the database reads it
 * again */
const UNLOOKED_SIGNATURE = '-'

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

/** A Codex rollout's parse job: resuming from the held entry's state when the rollout only grew since (CodexResume), a
 * whole parse otherwise */
function codexJob(
  cached: CacheEntry | undefined,
  file: string,
  cwd: string,
  meta: CodexParseMeta,
  titles: Map<string, string>,
  st: { ino: number; size: number }
): ParseJob {
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
  return { kind: 'codex', file, projectKey: mergeKey(cwd), meta: codexParseMeta(meta), threadName: threadNameOf(file, titles), from }
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
