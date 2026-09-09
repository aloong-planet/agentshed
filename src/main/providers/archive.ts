// The usage archive: persist daily aggregates in the app's own storage so history survives the agent
// cleaning up — or rewriting — the source session files.
// (Claude Code deletes session files after 30 days by default; on 2026-09-09 Codex rewrote 1329 rollouts
// into a compacted format and the live figures fell to a fraction of their real values, ADR-0026.)
//
// Granularity: day × agent side × project × model — it can be aggregated up, never split down.
// The conflict rule (ADR-0026): liveness is judged per (day, side); a past day's figure is accepted when it
// rose, or when it fell under a **different accounting stamp** (our rules changed); under the same stamp
// a lower figure means the data shrank and the archive's value is retained. Whatever an accepted change
// replaces is kept as a superseded value. The scan's own day is rewritten freely.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// The row type lives in the domain rather than here: since ADR-0025 it is also what the renderer
// receives, so persistence no longer owns it.
import type { AgentSide, UsageRow } from '@shared/domain'
import { localDay } from '@shared/format'
export type { UsageRow }

/** v2 (2026-09-10): stamps, observed values and superseded values joined the rows (ADR-0026). A v1 file
 * reads back with every pair under an unknown stamp (spec C14). */
const ARCHIVE_VERSION = 2

/** The rows a (day, side) pair held before an accepted change replaced them (spec C13) */
export interface SupersededEntry {
  day: string
  side: AgentSide
  /** The stamp the superseded rows were written under */
  stamp: string
  /** The stamp of the change that replaced them */
  replacedBy: string
  /** When the replacement happened (epoch ms) */
  replacedAt: number
  rows: UsageRow[]
}

interface ObservedEntry {
  /** The live side total the scan produced while the pair stayed retained */
  total: number
  /** The stamp that observation was made under */
  stamp: string
  at: number
}

interface ArchiveShape {
  version: typeof ARCHIVE_VERSION
  rows: UsageRow[]
  /** pair key → the stamp its current rows were written under; absent = unknown (a v1 file) */
  stamps: Record<string, string>
  /** pair key → the observed value, present only while the pair is retained */
  observed: Record<string, ObservedEntry>
  superseded: SupersededEntry[]
}

export interface ArchiveOptions {
  /** The accounting stamp: the identity of the accounting code (application version + cache structure
   * version in production; injected so the seam can move it between merges) */
  stamp: string
  /** The clock, for superseded and observed timestamps */
  now?: () => number
}

export interface MergeOptions {
  /** Accept every live figure for this scan (spec C15, a developer override; never set in production) */
  forceAccept?: boolean
}

export interface MergeResult {
  /** The effective row set every figure derives from: live rows for accepted pairs, archive rows for
   * archived-only and retained pairs. Undated live rows are not the archive's business and are not here. */
  rows: UsageRow[]
  /** Days the archive holds rows for and no side is live on (the interface hatches these, spec C9) */
  archivedOnlyDays: string[]
}

function keyOf(r: UsageRow): string {
  return `${r.day}\x00${r.side}\x00${r.projectKey}\x00${r.model}`
}

function pairKey(day: string, side: AgentSide): string {
  return `${day}\x00${side}`
}

/** The stamp recorded for rows that came from a file written before stamps existed (spec C14) */
const UNKNOWN_STAMP = 'unknown'

/** Whether two row sets of one pair carry the same figures (order-insensitive) */
function sameRows(a: UsageRow[], b: UsageRow[]): boolean {
  if (a.length !== b.length) return false
  const sig = (r: UsageRow): string =>
    `${r.projectKey}\x00${r.model}\x00${r.input}\x00${r.output}\x00${r.cacheRead}\x00${r.cacheWrite}\x00${r.total}`
  const sa = a.map(sig).sort()
  const sb = b.map(sig).sort()
  return sa.every((s, i) => s === sb[i])
}

export class UsageArchive {
  private readonly dir: string
  private readonly file: string
  private readonly stamp: string
  private readonly now: () => number
  private map: Map<string, UsageRow>
  private stamps: Map<string, string>
  private observed: Map<string, ObservedEntry>
  private supersededList: SupersededEntry[]
  /** The on-disk signature (mtime:size) this instance last read or wrote; another writer moves it */
  private diskSig: string | null = null

  constructor(storeDir: string, opts: ArchiveOptions) {
    this.dir = storeDir
    this.file = join(storeDir, 'usage-archive.json')
    this.stamp = opts.stamp
    this.now = opts.now ?? (() => Date.now())
    this.map = new Map()
    this.stamps = new Map()
    this.observed = new Map()
    this.supersededList = []
    this.load()
  }

  private fileSig(): string | null {
    try {
      const st = statSync(this.file)
      return `${st.mtimeMs}:${st.size}`
    } catch {
      return null
    }
  }

  /**
   * Two instances can share one store — the running app and the restore script — and each holds its
   * own memory of the file. Writing from stale memory would silently undo the other's write (a restore
   * overwritten by the next scan), so a merge or restore first re-reads the file if anyone else has
   * written it since this instance last did. Two writes inside one mtime tick with the same byte size
   * would still be missed; a restore changes the size, so that window is theoretical.
   */
  private reloadIfChanged(): void {
    if (this.fileSig() === this.diskSig) return
    this.map = new Map()
    this.stamps = new Map()
    this.observed = new Map()
    this.supersededList = []
    this.load()
  }

  private load(): void {
    this.diskSig = this.fileSig()
    if (!existsSync(this.file)) return
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      // Read loosely: the file may be a v1 archive (rows only) or a v2 one; anything else is corrupt
      const shape = raw as {
        version?: number
        rows?: unknown[]
        stamps?: Record<string, unknown>
        observed?: Record<string, Partial<ObservedEntry>>
        superseded?: Array<Partial<SupersededEntry>>
      }
      // v1 and v2 both carry rows; v1 has no stamps — every pair reads back under an unknown stamp (C14)
      if ((shape?.version !== 1 && shape?.version !== ARCHIVE_VERSION) || !Array.isArray(shape.rows)) return
      for (const r of shape.rows as Array<Partial<UsageRow>>) {
        if (typeof r?.day === 'string' && typeof r?.total === 'number') this.map.set(keyOf(r as UsageRow), r as UsageRow)
      }
      if (shape.version === ARCHIVE_VERSION) {
        for (const [k, v] of Object.entries(shape.stamps ?? {})) if (typeof v === 'string') this.stamps.set(k, v)
        for (const [k, v] of Object.entries(shape.observed ?? {})) {
          if (typeof v?.total === 'number' && typeof v?.stamp === 'string' && typeof v?.at === 'number') {
            this.observed.set(k, { total: v.total, stamp: v.stamp, at: v.at })
          }
        }
        for (const s of shape.superseded ?? []) {
          if (typeof s?.day === 'string' && Array.isArray(s.rows)) this.supersededList.push(s as SupersededEntry)
        }
      }
    } catch {
      // A corrupt archive: degrade to empty and start accumulating again on the next scan (history is
      // lost but the app does not crash)
    }
  }

  /**
   * Merge this scan's results and return the effective row set.
   * @param live The rows this scan computed (rows with an empty day are ignored: the archive is keyed by day)
   * @param anchorMs The scan anchor; its local day is the scan's own day (spec C11)
   */
  merge(live: UsageRow[], anchorMs: number, opts: MergeOptions = {}): MergeResult {
    this.reloadIfChanged()
    // Liveness is a property of a (day, side) pair (spec C5): only pairs this scan produced rows for are
    // replaced; a side with no rows on a day keeps its archived rows whatever the other sides did that day
    const livePairs = new Map<string, UsageRow[]>()
    for (const r of live) {
      if (!r.day) continue
      const k = pairKey(r.day, r.side)
      const list = livePairs.get(k)
      if (list) list.push(r)
      else livePairs.set(k, [r])
    }
    const total = (rows: UsageRow[]): number => rows.reduce((s, r) => s + r.total, 0)
    // The scan's own day is exempt from retention and keeps no superseded values (spec C11): its rows
    // change on every scan while a session is active
    const ownDay = localDay(anchorMs)
    for (const [k, rows] of livePairs) {
      const cur = [...this.map.values()].filter((r) => pairKey(r.day, r.side) === k)
      const pastDay = rows[0].day !== ownDay
      // The conflict rule (spec C10): a lower side total on a past day under the same stamp means the
      // data shrank, not the rules — retain the archive's rows and record what was observed. A new
      // stamp accepts the decrease only if the figure moved: the same figure under new rules is the same
      // data, not a correction (C12), so a release does not re-apply a loss retained once.
      if (pastDay && cur.length > 0 && total(rows) < total(cur) && !opts.forceAccept) {
        const sameStamp = this.stamps.get(k) === this.stamp
        const sameFigure = this.observed.get(k)?.total === total(rows)
        if (sameStamp || sameFigure) {
          this.observed.set(k, { total: total(rows), stamp: this.stamp, at: this.now() })
          continue
        }
      }
      // Accepted: whatever a past day's pair held before is kept as a superseded value when it differs
      // (spec C13); a pair that read back from a v1 file has no stamp, and is recorded as such (C14)
      if (pastDay && cur.length > 0 && !sameRows(cur, rows)) {
        this.supersededList.push({
          day: rows[0].day,
          side: rows[0].side,
          stamp: this.stamps.get(k) ?? UNKNOWN_STAMP,
          replacedBy: this.stamp,
          replacedAt: this.now(),
          rows: cur
        })
      }
      for (const r of cur) this.map.delete(keyOf(r))
      for (const r of rows) this.map.set(keyOf(r), r)
      this.stamps.set(k, this.stamp)
      this.observed.delete(k)
    }
    this.persist()
    const liveDays = new Set<string>()
    for (const rows of livePairs.values()) liveDays.add(rows[0].day)
    const archivedOnlyDays = new Set<string>()
    for (const r of this.map.values()) if (!liveDays.has(r.day)) archivedOnlyDays.add(r.day)
    return { rows: this.rows(), archivedOnlyDays: [...archivedOnlyDays].sort() }
  }

  /**
   * Restore past-day rows from a snapshot (spec C16): each (day, side) pair in `rows` is written as an
   * accepted change under the current stamp, what it replaces is kept as a superseded value, and the
   * scan's own day is left alone. The next scan judges the restored rows by the ordinary rule — a
   * compacted live figure is lower under the same stamp, so they are retained.
   */
  restore(rows: UsageRow[], anchorMs: number): { pairs: number; skippedOwnDay: number } {
    this.reloadIfChanged()
    const ownDay = localDay(anchorMs)
    const pairs = new Map<string, UsageRow[]>()
    for (const r of rows) {
      if (!r.day) continue
      const k = pairKey(r.day, r.side)
      const list = pairs.get(k)
      if (list) list.push(r)
      else pairs.set(k, [r])
    }
    let written = 0
    let skippedOwnDay = 0
    for (const [k, next] of pairs) {
      if (next[0].day === ownDay) {
        skippedOwnDay++
        continue
      }
      const cur = [...this.map.values()].filter((r) => pairKey(r.day, r.side) === k)
      if (cur.length > 0 && !sameRows(cur, next)) {
        this.supersededList.push({
          day: next[0].day,
          side: next[0].side,
          stamp: this.stamps.get(k) ?? UNKNOWN_STAMP,
          replacedBy: this.stamp,
          replacedAt: this.now(),
          rows: cur
        })
      }
      for (const r of cur) this.map.delete(keyOf(r))
      for (const r of next) this.map.set(keyOf(r), r)
      this.stamps.set(k, this.stamp)
      this.observed.delete(k)
      written++
    }
    if (written > 0) this.persist()
    return { pairs: written, skippedOwnDay }
  }

  /** The archive's current rows, every pair */
  rows(): UsageRow[] {
    return [...this.map.values()]
  }

  /** The trail of values accepted changes replaced (spec C13) */
  superseded(): SupersededEntry[] {
    return [...this.supersededList]
  }

  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.usage-archive.w-${process.pid}`)
    const payload: ArchiveShape = {
      version: ARCHIVE_VERSION,
      rows: this.rows(),
      stamps: Object.fromEntries(this.stamps),
      observed: Object.fromEntries(this.observed),
      superseded: this.supersededList
    }
    writeFileSync(tmp, JSON.stringify(payload))
    renameSync(tmp, this.file)
    this.diskSig = this.fileSig()
  }
}
