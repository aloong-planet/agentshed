// The engine module (ADR-0045) as the application's threads load it: the scan worker, every parse worker and the
// main process each load it once, through Node-API, from the path the main process works out. No other engine exists:
// a module that will not load, or that is another build's, fails every scan and every question-index read that asks
// for it, and every write of the display copy (token-stats, Scans and the window). Nothing here imports electron, which
// a worker thread cannot load.
import { join } from 'node:path'
import type { CodexSessionMeta } from './providers/codex'
import type { GrokSessionMeta } from './providers/grok'
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

/** One thread's token store (ADR-0044). A failure of the store is a returned message; only a panic throws. */
export interface TokenStore {
  /** Whether opening made the store: none was there, or what was there was replaced (token-stats C1, C2) */
  readonly created: boolean
  /** Why the store could not be opened, or null; a store that has one holds nothing and takes no write */
  readonly failure: string | null
  get(path: string): { rows: TokenStoreRow[]; failure?: string | null }
  all(): { rows: TokenStoreRow[]; failure?: string | null }
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
   * The Codex, Grok and Antigravity session lists under `roots`, each in scan order, read without writing under agy's
   * directories (token-stats::CON-002). Given `memory`, a walk opens only what changed since the last walk that was
   * given it; without, it reads everything. A failure reading one entry loses only that entry; a copy a read needs is
   * made under `tmpParent`, the system temporary directory when it is absent.
   */
  walkSessions(roots: ScanRoots, memory?: SessionMemory, tmpParent?: string): SessionWalk
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
 * The engine module this thread loaded, for a parse on this thread. Every thread that parses loads it first: a parse
 * worker as it starts, the thread that runs a scan before each scan and each question-index read (scanner.ts).
 */
export function threadEngineModule(): EngineModule {
  if (!confirmed) throw new Error('the engine module has not been loaded on this thread')
  return confirmed
}
