// One run's scanner (ADR-0043): the token engine with its cache, and the Codex rollouts' first-line readings.
// It lives on the scan worker; after a worker failure the main process holds one of its own, so a scan is
// this same code wherever it runs. Nothing here imports electron, which a worker thread cannot load.
import type { ProjectStats, SessionMeta, Snapshot } from '@shared/domain'
import { mergeKey } from '@shared/path-key'
import { deriveStats } from '@shared/usage'
import { loadEngineModule, type EngineSource } from '../engine-module'
import type { UsageArchive, UsageRow } from './archive'
import { CodexHeads } from './codex'
import { scan, walkSessions } from './scan'
import { TokenEngine, projectStatsFromRows, type ParseRunner } from './token-stats'
import type { ScanRoots } from './types'

/**
 * What a scan hands the main process (token-stats, Implementation Decisions, "Where a scan runs"). Plain data,
 * so it crosses from the scan worker as it is.
 */
export interface ScanOutput {
  /** The snapshot without its token figures and archived days: both come from the archive merge (settleScan) */
  snapshot: Snapshot
  /** The scan's live usage rows, for the archive to judge */
  rows: UsageRow[]
  /** Each project's listed sessions, by merge key */
  sessions: Map<string, SessionMeta[]>
  /** The session read allow-list */
  sessionFiles: Set<string>
}

/** Lets the thread's event loop run what is waiting — a question-index read, a request to stop — before the next step */
const betweenSteps = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export class Scanner {
  private readonly engine: TokenEngine
  /** The run's first-line readings: every scan walks through them, so a rescan opens only the rollouts that
   * changed (token-stats::QR-002/AC-01) */
  private readonly heads = new CodexHeads()

  /**
   * `module`: the engine module this thread loads (ADR-0045); `runner`: where the builds' parses run, a parse pool in
   * the app, on the calling thread when absent
   */
  constructor(cacheDir: string, private readonly module: EngineSource, private readonly runner?: ParseRunner & { close?: () => void }) {
    this.engine = new TokenEngine(cacheDir, runner)
  }

  /**
   * The engine module, confirmed as this build's own before anything is read: no other engine exists, so one that will
   * not load, or is another build's, fails the scan or the read that asked (token-stats, Scans and the window)
   */
  private confirmModule(): void {
    loadEngineModule(this.module)
  }

  /** Stops the parse workers the runner holds idle, when it is a pool */
  close(): void {
    this.runner?.close?.()
  }

  /**
   * One scan, in three steps: the session walk, the registries and components, the token build. `holdMs` is the
   * e2e seam that holds a run's first scan open (AGENTSHED_SCAN_DELAY_MS), 0 in production.
   */
  async scan(roots: ScanRoots, holdMs = 0): Promise<ScanOutput> {
    if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs))
    this.confirmModule()
    // One walk of the Codex, Grok and Antigravity session lists, read by both scan() and the token build (#160)
    const walked = walkSessions(roots, this.heads)
    await betweenSteps()
    const snapshot = await scan(roots, { now: () => Date.now(), sessions: walked })
    await betweenSteps()
    const claudePaths = snapshot.projects.filter((p) => p.sides.includes('claude')).map((p) => p.path)
    const registered = new Set(snapshot.projects.map((p) => mergeKey(p.path)))
    const built = await this.engine.build(roots, claudePaths, registered, walked)
    // Antigravity CLI conversations the scan could not read reach the side's card (token-stats::REQ-004/AC-02)
    if (built.antigravityUnreadable > 0) snapshot.sides.antigravity.unreadable = built.antigravityUnreadable
    // The session count shares its source with the sessions section. scan() gives a file count, warmups and
    // subagents included, while the section lists only real sessions (spec A3a/A3): two numbers both called
    // "session count" would contradict each other (measured on one project: 1511 against 507).
    for (const p of snapshot.projects) p.sessionCount = built.perProject.get(mergeKey(p.path))?.sessions.length ?? 0
    const sessions = new Map<string, SessionMeta[]>()
    for (const [key, stats] of built.perProject) sessions.set(key, stats.sessions)
    return { snapshot, rows: built.rows, sessions, sessionFiles: built.sessionFiles }
  }

  /** A session's question index (TokenEngine.sessionQuestions) */
  async sessionQuestions(roots: ScanRoots, file: string): ReturnType<TokenEngine['sessionQuestions']> {
    this.confirmModule()
    return this.engine.sessionQuestions(roots, file)
  }

  /** Whether a session file's index still matches disk (TokenEngine.isFresh) */
  isFresh(file: string): boolean {
    return this.engine.isFresh(file)
  }
}

/**
 * What the main process makes of a scan's result. The archive owns the effective row set (ADR-0026): live rows
 * for the (day, side) pairs it accepted, its own for archived-only and retained pairs, and every figure derives
 * from that set (spec G6), the project pages' included. Undated rows never enter the archive and are added
 * back here, so the whole-history figures keep them (spec G7). The snapshot gets its token figures and its
 * archived days; `fileFailed` says the archive's file failed at this merge (spec C4).
 */
export function settleScan(
  out: ScanOutput,
  archive: UsageArchive,
  opts: { forceAccept?: boolean } = {}
): { stats: Map<string, ProjectStats>; fileFailed: boolean } {
  const effective = archive.merge(out.rows, out.snapshot.scannedAt, { forceAccept: opts.forceAccept })
  const rows = [...effective.rows, ...out.rows.filter((r) => !r.day)]
  out.snapshot.tokens = deriveStats(rows)
  out.snapshot.archivedDays = effective.archivedOnlyDays
  return { stats: projectStatsFromRows(out.sessions, rows), fileFailed: effective.fileFailed }
}
