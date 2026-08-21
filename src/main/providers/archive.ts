// The usage archive: persist daily aggregates in the app's own storage so history survives the agent
// cleaning up the source session files.
// (Claude Code deletes session files after 30 days by default, and the history of a scan-on-demand tool
// such as ccusage disappears with them.)
//
// Granularity: day × agent side × project × model — it can be aggregated up, never split down.
// The conflict rule: days whose source data this scan can still see (liveDays) have their archive
// **overwritten** by the live values
//   (so history corrects itself after an accounting change or a bug fix); days whose source data is gone
//   keep their archived values.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// The row type lives in the domain rather than here: since ADR-0025 it is also what the renderer
// receives, so persistence no longer owns it.
import type { UsageRow } from '@shared/domain'
export type { UsageRow }

const ARCHIVE_VERSION = 1

interface ArchiveShape {
  version: typeof ARCHIVE_VERSION
  rows: UsageRow[]
}

function keyOf(r: UsageRow): string {
  return `${r.day}\x00${r.side}\x00${r.projectKey}\x00${r.model}`
}

export class UsageArchive {
  private readonly dir: string
  private readonly file: string
  private map: Map<string, UsageRow>

  constructor(storeDir: string) {
    this.dir = storeDir
    this.file = join(storeDir, 'usage-archive.json')
    this.map = this.load()
  }

  private load(): Map<string, UsageRow> {
    const out = new Map<string, UsageRow>()
    if (!existsSync(this.file)) return out
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      const shape = raw as ArchiveShape
      if (shape?.version !== ARCHIVE_VERSION || !Array.isArray(shape.rows)) return out
      for (const r of shape.rows) {
        if (typeof r?.day === 'string' && typeof r?.total === 'number') out.set(keyOf(r), r)
      }
    } catch {
      // A corrupt archive: degrade to empty and start accumulating again on the next scan (history is
      // lost but the app does not crash)
    }
    return out
  }

  /**
   * Merge this scan's results.
   * @param live The rows this scan computed (only for the days liveDays covers)
   * @param liveDays The set of days whose source data this scan can still see — these days are replaced
   *   wholesale,
   *   so "that project had no usage that day" is reflected correctly (rather than leaving last time's
   *   stale row)
   */
  merge(live: UsageRow[], liveDays: Set<string>): void {
    for (const key of [...this.map.keys()]) {
      const day = key.slice(0, key.indexOf('\x00'))
      if (liveDays.has(day)) this.map.delete(key)
    }
    for (const r of live) {
      if (!liveDays.has(r.day)) continue
      this.map.set(keyOf(r), r)
    }
    this.persist()
  }

  rows(): UsageRow[] {
    return [...this.map.values()]
  }

  /** Days that exist only in the archive, whose source data this scan can no longer see (the UI labels
   * these historical spans from it) */
  archivedOnlyDays(liveDays: Set<string>): string[] {
    const days = new Set<string>()
    for (const r of this.map.values()) {
      if (!liveDays.has(r.day)) days.add(r.day)
    }
    return [...days].sort()
  }

  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.usage-archive.w-${process.pid}`)
    const payload: ArchiveShape = { version: ARCHIVE_VERSION, rows: this.rows() }
    writeFileSync(tmp, JSON.stringify(payload))
    renameSync(tmp, this.file)
  }
}
