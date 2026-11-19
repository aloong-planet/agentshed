// The engine module (ADR-0046) as the application's threads load it: the scan worker, every parse worker and the
// main process each load it once, through Node-API, from the path the main process works out. No other engine exists (ADR-0047):
// a module that will not load, or that is another build's, fails every scan and every question-index read that asks
// for it — the reads the session page and both searches make included, whose question texts and turns the module's
// line rules read, and whose cold rollouts it reads — and every write of the display copy (token-stats, Scans and the
// window). Nothing here imports electron, which a worker thread cannot load.
import { join } from 'node:path'
import type { AgentSide, ForkState, SessionMeta, TurnBlock } from '@shared/domain'
import type { UsageRow } from './providers/archive'
import type { CodexSessionMeta } from './providers/codex'
import type { GrokSessionMeta } from './providers/grok'
import type { QuestionRec } from './providers/question-index'
import type { SessionWalk } from './providers/scan'
import type { ParseJob, ParseResult } from './providers/token-stats'
import type { ScanRoots } from './providers/types'

/** A row of the token store as the module hands it out (engine/src/exports/cache_entries.rs): a column holding anything
 * but text is absent */
export interface TokenStoreRow {
  path: string
  sig?: string | null
  agg?: string | null
  resume?: string | null
}

/** A file's row without its entry (engine/src/exports/cache_entries.rs): its signature, and what the module read of its
 * entry when it was written — its side, whether it is listed, its project, and the id its side's forks name it by (a
 * Codex session id, a readable Antigravity conversation's own id) — absent for an entry the module could not read */
export interface TokenStoreHead {
  path: string
  sig?: string | null
  kind?: string | null
  listed?: boolean | null
  projectKey?: string | null
  ownId?: string | null
}

/** One file of a scan, in scan order: its new entry when a parse gave it one, otherwise the one the store holds; its
 * admission to the read allow-list; a title read beside it (agy's own, for an Antigravity conversation) */
export interface ScanFile {
  path: string
  put?: { sig: string; agg: string; resume?: string }
  admitted: boolean
  title: string | null
}

/** What a scan derives from the token cache (token-stats::CON-003): the usage rows, each project's sessions newest first,
 * the read allow-list, the count of unreadable Antigravity conversations, and `[project, session, start, end]` for each
 * stripped Codex fork titled by its first question left, whose live text titles it */
export interface CombinedScan {
  rows: UsageRow[]
  projects: Array<[string, SessionMeta[]]>
  sessionFiles: string[]
  antigravityUnreadable: number
  retitle: Array<[number, number, number, number]>
  /** Why the store could not be read or written, or null */
  failure: string | null
  /** The files left out of the scan's figures: those a last scan could not combine, and those whose new entry the store
   * cannot hold (a figure past the range of a double), each that file's failed read */
  leftOut: string[]
}

/** One thread's token store (ADR-0044). A failure of the store is a returned message; only a panic throws. */
export interface TokenStore {
  /** Whether opening made the store: none was there, or what was there was replaced (token-stats C1, C2) */
  readonly created: boolean
  /** Why the store could not be opened, or null; a store that has one holds nothing and takes no write */
  readonly failure: string | null
  get(path: string): { rows: TokenStoreRow[]; failure?: string | null }
  heads(): { rows: TokenStoreHead[]; failure?: string | null }
  /**
   * A scan by group (token-stats::CON-003) under `combination`, the store left holding its entries and results: its
   * figures, or the files whose stored entry the combination cannot read, which are parsed again before a scan of them
   * again, nothing having been written. A `last` scan gives its figures, leaving out what it cannot combine. A new entry
   * that is not well formed throws.
   */
  scan(combination: string, files: ScanFile[], last: boolean): CombinedScan | { bad: string[]; failure: string | null }
  /** Holds `puts` and removes `removes` in one transaction: null when it landed, otherwise why it did not */
  write(puts: Array<{ path: string; sig: string; agg: string; resume?: string }>, removes: string[]): string | null
  /** Whether another process wrote to the store since this thread last asked (token-stats C27) */
  changedByOther(): boolean
}

/** The run's memory of what the session walk read (engine/src/exports/scanner.rs): the Codex rollouts' first lines
 * (token-stats::QR-002/AC-01) and the Antigravity conversations' metadata. One Scanner holds one, and nothing saves it. */
export type SessionMemory = object

/** What the application calls in the engine module */
export interface EngineModule {
  /** The build the module belongs to (scripts/lib/engine-build.mjs) */
  build(): string
  /**
   * Parses one session file of a side the module parses, on the calling thread: the file's entry, or null when it
   * cannot be read. A panic while the file is parsed answers null, as a read that fails does; a job of a side the
   * module does not parse throws.
   */
  parse(job: ParseJob): ParseResult
  /**
   * The titles agy keeps for its conversations apart from their files (session-view::REQ-003/AC-03), read from its data
   * root `home` without writing there (token-stats::CON-002): `[conversation id, title]` pairs in its table's order, or
   * null when the read failed while agy was writing them. A copy a read needs is made under `tmpParent`, the system
   * temporary directory when it is absent.
   */
  sessionTitles(kind: 'antigravity', home: string, tmpParent?: string): Array<[string, string]> | null
  /**
   * The question `text` holds, as the session page and both searches show it: `text` is a question's range in a
   * session file of the side `kind`, as the question index recorded it, read (session-view C2); null when it holds no
   * question
   */
  questionText(kind: AgentSide, text: string): string | null
  /**
   * The title the question `text` holds gives its session, as the question index's first question gives it: `text` is a
   * question's range in a session file of the side `kind`, as the index recorded it, read; null when it holds no
   * question. A fork whose first questions were stripped as replays takes its title from its first question left
   * (session-view B2).
   */
  questionTitle(kind: AgentSide, text: string): string | null
  /**
   * Each of `ranges` of the session file `file`, of the side `kind`, `[start, end)` in the offsets its question index
   * records, read in one pass on a thread of its own (session-view C2): each range's bytes, in the order asked, as much
   * of the range as the file holds, and how far into the file's stream the read went. A cold rollout is read through
   * its decompressed stream, every frame of it, by the reader the scan reads it with, and the read stops once the last
   * range's end has passed. Rejects when the file cannot be read as far as the read goes, when a read that reached the
   * stream's end finds it cut short (token-stats B12), or when the read panics; a side the module does not read by
   * range rejects too.
   */
  readRanges(kind: 'codex', file: string, ranges: ReadonlyArray<{ start: number; end: number }>): Promise<{ bufs: Buffer[]; bytesRead: number }>
  /**
   * A turn of the session file `file`, of the side `kind`: its `question`'s range and, when `body` is given, its body's,
   * `[start, end)` in the offsets its question index records, read in one pass that stops at the turn's end (session-view
   * C2): a cold rollout's on a thread of its own, a plain file's on the thread pool (session-view D2b). Settles with the question's bytes, as much of its range as the file holds; the body,
   * of the lines the turn holds, each as text with its line feed left off, clipped to the body's range, as the body's
   * text splits at its line feeds but for the empty piece after a last line feed (a line agy's rewind undid inside the
   * turn is not held, session-view::REQ-004/AC-03): their `blocks` for a side whose turns the module assembles (a Claude
   * Code or a Codex turn), the `lines` themselves for one whose turns are still assembled here (ADR-0047); and how far into the
   * file's stream the read went from where it started, the question's start in a plain file and the stream's start in a
   * cold rollout. The body is read line by line: no allocation holds it whole but a line of it. A cold rollout is read
   * through its decompressed stream, as `readRanges` reads it.
   * Rejects when the file cannot be read as far as the turn goes, when a read that reached the stream's end finds it cut
   * short (token-stats B12), or when the read or its assembly panics.
   */
  readTurn(
    kind: AgentSide,
    file: string,
    question: { start: number; end: number },
    body: { start: number; end: number } | null
  ): Promise<{ question: Buffer; bytesRead: number } & ({ blocks: TurnBlock[] } | { lines: string[] })>
  /**
   * The full-text search of the session file `file`, of the side `kind`, for `needle` against its `turns`, each turn's
   * question `[start, questionEnd)` and the turn `[start, end)` in the offsets its question index records (session-view
   * D2, D3), on a thread of its own: the file's stream is read line by line, a cold rollout's decompressed as it is
   * read, and never held whole. Settles with how many hits fall in no turn, and each turn with a hit in its body, by its
   * index among `turns`, ascending, with the snippet of its first such hit. Rejects when the file cannot be read to its
   * end, when its stream turns out cut short (token-stats B12), or when the search panics; nothing found is then given.
   */
  searchFullText(
    kind: AgentSide,
    file: string,
    needle: string,
    turns: ReadonlyArray<{ start: number; questionEnd: number; end: number }>
  ): Promise<{ folded: number; body: Array<{ turn: number; snippet: string | null }> }>
  /**
   * A project's question search of the session file `file`, of the side `kind`, for `needle` (session-view D2, D4):
   * each of `questions`, a question's range `[start, end)` in the offsets its question index records, read, and its
   * text, as the question list shows it, matched as global search matches one (global-search S6). A plain file's
   * ranges are read where they lie, on the thread pool (session-view D2b); a cold rollout's in one pass of its
   * decompressed stream, on a thread of its own, as `readRanges` reads it. Settles with each question that holds the
   * needle, or with every question when `every`, ascending by index among `questions`, with its text, null when its
   * range holds no question, and whether it holds the needle. Rejects when the file cannot be read as far as its questions
   * go, when a read that reached the stream's end finds it cut short (token-stats B12), or when the search panics.
   */
  searchQuestions(
    kind: AgentSide,
    file: string,
    needle: string,
    questions: ReadonlyArray<{ start: number; end: number }>,
    every: boolean
  ): Promise<Array<{ question: number; text: string | null; hit: boolean }>>
  /** The tool names whose call dispatches a subagent on the side `kind`, which a turn draws as a sub block: the names
   * its question index counts a turn's subagents by (session-view C3) */
  dispatches(kind: AgentSide): string[]
  /**
   * Every side's session list under `roots`, each in scan order, read without writing under agy's
   * directories (token-stats::CON-002). Given `memory`, a walk opens only what changed since the last walk that was
   * given it; without, it reads everything. A failure reading one entry loses only that entry; a copy a read needs is
   * made under `tmpParent`, the system temporary directory when it is absent. Given `held`, a directory that is there
   * but cannot be listed keeps the files `held` names below it, in `SessionWalk.held` (token-stats, Failure modes and
   * boundaries: the token store): it is called at the first such directory, once, and not at all by a walk that lists
   * every directory; one that throws holds nothing.
   */
  walkSessions(roots: ScanRoots, memory?: SessionMemory, tmpParent?: string, held?: () => string[]): SessionWalk
  /** A memory for `walkSessions`, holding nothing yet */
  SessionMemory: new () => SessionMemory
  /**
   * One session's entry as the walk reads it, for the session page's single-file rebuild: a Codex rollout's or a Grok
   * update stream's, by its path; null when the walk would list no session for it
   */
  sessionMeta(kind: 'codex', file: string): CodexSessionMeta | null
  sessionMeta(kind: 'grok', file: string): Pick<GrokSessionMeta, 'cwd' | 'subagent'> | null
  /**
   * Writes `copy` to `file` as the text `JSON.stringify(copy)` gives, by an atomic replacement (engine/src/display/).
   * The value is read during the call, as it stands then, and the call throws when it holds what JSON cannot (a BigInt, a
   * cycle); the promise settles once the file is replaced, and rejects with why it was not.
   */
  writeDisplayCopy(file: string, copy: unknown): Promise<void>
  /** Opens the token store in a settings directory for a cache structure version, making an empty one when there is
   * none to use */
  TokenStore: new (dir: string, version: number) => TokenStore
  /** A copy of a token store, read without writing to it or beside it (token-stats C16): the version it records,
   * absent when it is no store, and its rows when that is the version asked */
  readTokenStoreSnapshot(file: string, version: number): { version?: number | null; rows?: TokenStoreRow[] | null }
  /** Combines entries held in memory, in scan order, as one combination over them gives; an entry it cannot read is left
   * out of the figures and named in `leftOut` */
  combineEntries(entries: Array<{ path: string; agg: string; admitted: boolean; title: string | null }>): CombinedScan
  /** How many of a Codex fork's leading questions replay its parent's, and its fork state (session-view B2); `parent` is
   * null when the parent is not in the scan set */
  stripReplayPrefix(child: QuestionRec[], parent: QuestionRec[] | null, forkedAt: number | null, isFork: boolean): { stripped: number; state: ForkState }
}

/** Where a thread loads the engine module from, and the build it must report; plain data, so it crosses to a worker */
export interface EngineSource {
  path: string
  build: string
}

/** Defined by every bundler of this code from the module's sources (scripts/lib/engine-build.mjs) */
declare const __ENGINE_BUILD__: string

/** The build this code was made with: a module reporting another one is from another build */
export const ENGINE_BUILD: string = __ENGINE_BUILD__

/**
 * The test seam that points an unpackaged run at another module file: e2e's way to a module that will not load. A
 * packaged build refuses it at launch, by its prefix (ADR-0042), and never reads it here either.
 */
export const ENGINE_MODULE_SEAM = 'AGENTSHED_ENGINE_MODULE'

/**
 * Where the engine module is. A packaged build ships it outside the asar archive, in its resources
 * (electron-builder.yml); an unpackaged run loads the development build (scripts/build-engine.mjs), two levels above
 * the directory of the built main process, out/main, as above src/main.
 */
export function engineModulePath(run: {
  packaged: boolean
  resourcesPath: string
  mainDir: string
  env: Readonly<Record<string, string | undefined>>
}): string {
  if (run.packaged) return join(run.resourcesPath, 'engine', 'agentshed_engine.node')
  const seam = run.env[ENGINE_MODULE_SEAM]
  if (seam) return seam
  return join(run.mainDir, '..', '..', 'engine', 'dist', 'agentshed_engine.node')
}

/** What each path gave this thread, once: the module, or why it would not load */
const loaded = new Map<string, { module: Record<string, unknown> } | { error: Error }>()

/** The module this thread last confirmed as this build's own */
let confirmed: EngineModule | null = null

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * The engine module, confirmed as this build's own. The path is opened once per thread; a load that failed fails again
 * for the rest of the run, as no build of the module can change under a running app.
 */
export function loadEngineModule(source: EngineSource): EngineModule {
  let got = loaded.get(source.path)
  if (!got) {
    try {
      const holder = { exports: {} as Record<string, unknown> }
      process.dlopen(holder, source.path)
      got = { module: holder.exports }
    } catch (error) {
      got = { error: new Error(`the engine module will not load from ${source.path}: ${messageOf(error)}`) }
    }
    loaded.set(source.path, got)
  }
  if ('error' in got) throw got.error
  const build = got.module['build']
  const reported = typeof build === 'function' ? (build as () => unknown)() : undefined
  if (reported !== source.build) {
    throw new Error(`the engine module at ${source.path} is another build's (${JSON.stringify(reported)}), not this build's (${JSON.stringify(source.build)})`)
  }
  confirmed = got.module as unknown as EngineModule
  return confirmed
}

/**
 * The engine module this thread loaded, for a parse or a line rule on this thread. Every thread that calls one loads it
 * first: a parse worker as it starts, the thread that runs a scan before each scan and each question-index read
 * (scanner.ts), and the main process before each question-index read it asks for, whose question texts and turns it
 * reads (scan-client.ts).
 */
export function threadEngineModule(): EngineModule {
  if (!confirmed) throw new Error('the engine module has not been loaded on this thread')
  return confirmed
}
