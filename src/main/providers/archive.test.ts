// The archive: persist daily aggregates so history survives the agent cleaning up — or rewriting — the
// source files. Granularity is day × side × project × model. The conflict rule is ADR-0026's: liveness is
// judged per (day, side); a past day's figure never falls under the same accounting stamp; superseded
// values are kept. The seam is the archive's public interface with the stamp and the clock injected.
//
// A file a newer build wrote (token-stats::REQ-005, token-stats::REQ-006) is seeded at the file boundary, the
// only way rows of a side this build does not know can reach it. Not asserted here: that no notice appears on a
// page (no code renders one); the log half of the two AC-04s is asserted below.
import { mkdtempSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AGENT_SIDES } from '@shared/validate'
import { ARCHIVE_VERSION, UsageArchive } from './archive'
import type { UsageRow } from './archive'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-arc-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const row = (day: string, project: string, model: string, total: number, side: UsageRow['side'] = 'claude'): UsageRow => ({
  day,
  side,
  projectKey: project,
  model,
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  total
})

/** A scan anchored on a day well after every fixture day, so those days are past days */
const ANCHOR = Date.parse('2026-08-15T12:00:00')

const open = (stamp = 'v1+c14'): UsageArchive => new UsageArchive(join(dir, 'store'), { stamp, now: () => ANCHOR })

describe('UsageArchive', () => {
  it('the first merge persists; a new instance reads it back', () => {
    const a = open()
    a.merge([row('2026-07-01', '/p1', 'm1', 100)], ANCHOR)
    expect(existsSync(join(dir, 'store', 'usage-archive.json'))).toBe(true)
    const b = open()
    expect(b.rows()).toHaveLength(1)
    expect(b.rows()[0].total).toBe(100)
  })

  it('a live (day, side) whose figure rose: the live values replace the archive (an accounting fix corrects history)', () => {
    const a = open()
    a.merge([row('2026-07-01', '/p1', 'm1', 100)], ANCHOR)
    const r = a.merge([row('2026-07-01', '/p1', 'm1', 250)], ANCHOR)
    expect(r.rows.filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([250])
    expect(a.rows().filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([250])
  })

  it('a day whose source files are gone: the archived values are kept and not wiped by this scan finding nothing', () => {
    const a = open()
    a.merge([row('2026-06-01', '/p1', 'm1', 999)], ANCHOR)
    // The next scan can no longer see 6-01 (the agent cleaned the files up)
    const r = a.merge([row('2026-07-01', '/p1', 'm1', 10)], ANCHOR)
    expect(r.rows.map((x) => x.day).sort()).toEqual(['2026-06-01', '2026-07-01'])
    expect(r.rows.find((x) => x.day === '2026-06-01')?.total).toBe(999)
  })

  it('C6: a side with no live rows on a day another side is still live on keeps its archived rows, and the day is not archived-only', () => {
    const a = open()
    a.merge([row('2026-07-01', '/p1', 'm1', 100), row('2026-07-01', '/p1', 'm1', 40, 'codex')], ANCHOR)
    // The next scan: Claude still live on 7-01, Codex has nothing for that day (its history vanished)
    const r = a.merge([row('2026-07-01', '/p1', 'm1', 100)], ANCHOR)
    expect(r.rows.filter((x) => x.day === '2026-07-01' && x.side === 'codex').map((x) => x.total)).toEqual([40])
    expect(r.archivedOnlyDays).toEqual([])
  })

  it('C10: a past (day, side) whose live total fell under the same stamp is retained — the archive value stays, in the result and on disk', () => {
    const a = open()
    a.merge([row('2026-07-01', '/p1', 'm1', 1000, 'codex'), row('2026-07-01', '/p1', 'm1', 100)], ANCHOR)
    // The agent rewrote its records: Codex on 7-01 now reads 30 under the same accounting stamp
    const r = a.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex'), row('2026-07-01', '/p1', 'm1', 100)], ANCHOR)
    expect(r.rows.filter((x) => x.day === '2026-07-01' && x.side === 'codex').map((x) => x.total)).toEqual([1000])
    expect(open().rows().filter((x) => x.day === '2026-07-01' && x.side === 'codex').map((x) => x.total)).toEqual([1000])
    // Claude's rows on the same day were not touched by Codex's retention
    expect(r.rows.filter((x) => x.day === '2026-07-01' && x.side === 'claude').map((x) => x.total)).toEqual([100])
  })

  it('C10/C13: a past-day decrease under a different stamp is accepted (a correction of ours), and the replaced rows are kept as superseded values with both stamps', () => {
    const a = open('v1+c14')
    a.merge([row('2026-07-01', '/p1', 'm1', 1000, 'codex'), row('2026-07-01', '/p1', 'm2', 200, 'codex')], ANCHOR)
    const b = open('v2+c15')
    const r = b.merge([row('2026-07-01', '/p1', 'm1', 700, 'codex')], ANCHOR)
    expect(r.rows.filter((x) => x.day === '2026-07-01').map((x) => [x.model, x.total])).toEqual([['m1', 700]])
    const kept = b.superseded()
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ day: '2026-07-01', side: 'codex', stamp: 'v1+c14', replacedBy: 'v2+c15', replacedAt: ANCHOR })
    expect(kept[0].rows.map((x) => [x.model, x.total]).sort()).toEqual([['m1', 1000], ['m2', 200]])
    // The trail survives a reopen
    expect(open('v2+c15').superseded()).toHaveLength(1)
  })

  it('C10/C12: a new stamp accepts a decrease only if the observed figure moved — the same figure stays retained across a release', () => {
    const a = open('v1+c14')
    a.merge([row('2026-07-01', '/p1', 'm1', 1000, 'codex')], ANCHOR)
    // The rewrite: 30 under the same stamp → retained, 30 recorded as the observed value
    a.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR)
    // A release: the new stamp observes the very same 30 — nothing was corrected, still retained
    const b = open('v2+c14')
    const r1 = b.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR)
    expect(r1.rows.filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([1000])
    expect(b.superseded()).toHaveLength(0)
    // The next release's rules produce a different (still lower) figure — that is a correction, accepted
    const c = open('v3+c15')
    const r2 = c.merge([row('2026-07-01', '/p1', 'm1', 25, 'codex')], ANCHOR)
    expect(r2.rows.filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([25])
    expect(c.superseded().map((s) => [s.stamp, s.replacedBy, s.rows[0].total])).toEqual([['v1+c14', 'v3+c15', 1000]])
  })

  it("C11: the scan's own day is exempt — its rows are replaced on every scan, decreases included, and nothing is kept as superseded", () => {
    const a = open()
    const today = '2026-08-15' // the anchor's local day
    a.merge([row(today, '/p1', 'm1', 500, 'codex')], ANCHOR)
    const r = a.merge([row(today, '/p1', 'm1', 200, 'codex')], ANCHOR)
    expect(r.rows.filter((x) => x.day === today).map((x) => x.total)).toEqual([200])
    expect(a.superseded()).toHaveLength(0)
  })

  // Green on arrival: the v1 loader records no stamps and the unknown stamp differs from every real one,
  // so the behaviour fell out of slices 0 and 3. Kept as the lock on C14 rather than left to inference.
  it('C14: a v1 file reads back stampless — the first scan accepts whatever it finds (recording the replaced rows under the unknown stamp), then the pair is stamped and retention applies', () => {
    mkdirSync(join(dir, 'store'), { recursive: true })
    writeFileSync(
      join(dir, 'store', 'usage-archive.json'),
      JSON.stringify({ version: 1, rows: [row('2026-07-01', '/p1', 'm1', 1000, 'codex')] })
    )
    const a = open('v1+c14')
    const r1 = a.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR)
    expect(r1.rows.filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([30])
    expect(a.superseded().map((s) => [s.stamp, s.replacedBy])).toEqual([['unknown', 'v1+c14']])
    // Now stamped: a further decrease under the same stamp is retained
    const r2 = a.merge([row('2026-07-01', '/p1', 'm1', 10, 'codex')], ANCHOR)
    expect(r2.rows.filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([30])
  })

  it('C15: the forced-accept override accepts a same-stamp decrease on a past day (the developer path), still keeping the replaced rows', () => {
    const a = open()
    a.merge([row('2026-07-01', '/p1', 'm1', 1000, 'codex')], ANCHOR)
    const r = a.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR, { forceAccept: true })
    expect(r.rows.filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([30])
    expect(a.superseded().map((s) => s.rows[0].total)).toEqual([1000])
  })

  it('C16: restore writes past-day rows as accepted changes under the current stamp, keeps what they replace, skips the own day, and the next same-stamp decrease is retained against them', () => {
    const a = open('v1+c14')
    a.merge([row('2026-07-01', '/p1', 'm1', 1000, 'codex'), row('2026-08-15', '/p1', 'm1', 50, 'codex')], ANCHOR)
    // The agent's rewrite landed and was accepted under an earlier, stampless archive — the figure is now 30
    a.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR, { forceAccept: true })
    // Restore from a snapshot: 7-01 is a past day and is written; 8-15 is the own day and is left alone
    const outcome = a.restore(
      [row('2026-07-01', '/p1', 'm1', 900, 'codex'), row('2026-07-01', '/p1', 'm2', 100, 'codex'), row('2026-08-15', '/p1', 'm1', 999, 'codex')],
      ANCHOR
    )
    expect(outcome).toEqual({ pairs: 1, skippedOwnDay: 1 })
    expect(a.rows().filter((x) => x.day === '2026-07-01').map((x) => [x.model, x.total]).sort()).toEqual([['m1', 900], ['m2', 100]])
    expect(a.rows().filter((x) => x.day === '2026-08-15').map((x) => x.total)).toEqual([50])
    expect(a.superseded().map((s) => [s.replacedBy, s.rows.map((x) => x.total)])).toEqual([['v1+c14', [1000]], ['v1+c14', [30]]])
    // The next scan still sees the compacted 30 under the same stamp: retained against the restored rows
    const r = a.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR)
    expect(r.rows.filter((x) => x.day === '2026-07-01').reduce((s, x) => s + x.total, 0)).toBe(1000)
  })

  it('a restore written by another instance (the script, while the app runs) is picked up by the next merge instead of being overwritten from memory', () => {
    const app = open()
    app.merge([row('2026-07-01', '/p1', 'm1', 1000, 'codex')], ANCHOR)
    app.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR, { forceAccept: true })
    // The restore script: a second instance on the same store
    const script = open()
    script.restore([row('2026-07-01', '/p1', 'm1', 900, 'codex')], ANCHOR)
    // The app's next scan, from the instance that still holds 30 in memory
    const r = app.merge([row('2026-07-01', '/p1', 'm1', 30, 'codex')], ANCHOR)
    expect(r.rows.filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([900])
    expect(open().rows().filter((x) => x.day === '2026-07-01').map((x) => x.total)).toEqual([900])
  })

  it('C10: a shift between projects with an unchanged side total is accepted as an ordinary rewrite', () => {
    const a = open()
    a.merge([row('2026-07-01', '/old-path', 'm1', 600, 'codex')], ANCHOR)
    const r = a.merge([row('2026-07-01', '/new-path', 'm1', 600, 'codex')], ANCHOR)
    expect(r.rows.filter((x) => x.day === '2026-07-01').map((x) => [x.projectKey, x.total])).toEqual([['/new-path', 600]])
  })

  it('within one day, rows split by side × project × model without overwriting each other', () => {
    const a = open()
    const r = a.merge(
      [
        row('2026-07-01', '/p1', 'm1', 10),
        row('2026-07-01', '/p1', 'm2', 20),
        row('2026-07-01', '/p2', 'm1', 30),
        row('2026-07-01', '/p1', 'm1', 40, 'codex')
      ],
      ANCHOR
    )
    expect(r.rows).toHaveLength(4)
    expect(r.rows.reduce((s, x) => s + x.total, 0)).toBe(100)
  })

  it('archived-only days are reported for the interface to label: a day the archive holds and no side is live on', () => {
    const a = open()
    a.merge([row('2026-06-01', '/p1', 'm1', 5)], ANCHOR)
    const r = a.merge([row('2026-07-01', '/p1', 'm1', 5)], ANCHOR)
    expect(r.archivedOnlyDays).toEqual(['2026-06-01'])
  })

  it('atomic writes: no temporary file is left in the directory', () => {
    const a = open()
    a.merge([row('2026-07-01', '/p1', 'm1', 1)], ANCHOR)
    expect(readdirSync(join(dir, 'store'))).toEqual(['usage-archive.json'])
  })

  it('a corrupt archive file → degrades to empty without crashing (the next scan starts accumulating again)', () => {
    mkdirSync(join(dir, 'store'), { recursive: true })
    writeFileSync(join(dir, 'store', 'usage-archive.json'), '{broken')
    const a = open()
    expect(a.rows()).toEqual([])
    a.merge([row('2026-07-01', '/p1', 'm1', 7)], ANCHOR)
    expect((JSON.parse(readFileSync(join(dir, 'store', 'usage-archive.json'), 'utf8')) as { version: number }).version).toBe(2)
  })
})

/** A side no build of this one knows: generated rather than hand-picked, so a side added later can never take it */
function outsideSide(): string {
  let s = 'side-from-a-newer-build'
  while (AGENT_SIDES.has(s)) s += '+'
  return s
}
const OUT = outsideSide()

/** A row as a newer build writes it; the shape and figures follow the two real rows of the side 0.1.0-beta.2 did
 * not know, read from this machine's archive on 2026-10-30 */
const rawRow = (day: string, side: unknown, total: number): Record<string, unknown> => ({
  day, side, projectKey: '/users/x/agy-demo', model: 'gemini-3.8-flash-n', input: total - 2 * Math.round(total / 50),
  output: Math.round(total / 50), cacheRead: Math.round(total / 50), cacheWrite: 0, total
})

const storeFile = (): string => join(dir, 'store', 'usage-archive.json')
const seed = (content: unknown): void => {
  mkdirSync(join(dir, 'store'), { recursive: true })
  writeFileSync(storeFile(), JSON.stringify(content))
}
const onDisk = (): { rows: Array<Record<string, unknown>>; stamps: Record<string, string>; observed: Record<string, unknown>; superseded: Array<{ side: unknown }> } =>
  JSON.parse(readFileSync(storeFile(), 'utf8')) as ReturnType<typeof onDisk>
const known = (side: unknown): boolean => typeof side === 'string' && AGENT_SIDES.has(side)
const bySig = (rows: Array<Record<string, unknown>>): string[] => rows.map((r) => JSON.stringify(r)).sort()

describe('UsageArchive: a file a newer build wrote', () => {
  const D1 = '2026-07-01' // live for claude and codex, and held for the outside side too
  const D0 = '2026-06-20' // held only for the outside side
  const DK = '2026-06-10' // held only for claude, live nowhere: the archived-only control
  const OWN = '2026-08-15' // the anchor's own day
  let quiet: Array<ReturnType<typeof vi.spyOn>>
  beforeEach(() => {
    quiet = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m))
  })
  afterEach(() => {
    for (const s of quiet) s.mockRestore()
  })

  it('token-stats::REQ-005: rows of a side this build does not know stay in the file and out of every figure, the archived-only days included', () => {
    const outside = [rawRow(D1, OUT, 283_172), rawRow(D0, OUT, 137_497), rawRow(OWN, OUT, 9_000), rawRow(D1, undefined, 15_000)]
    delete outside[3].side // a row with no side at all
    const outsideStamps = { [`${D1}\x00${OUT}`]: 'v9+c99', [`${D0}\x00${OUT}`]: 'v9+c99' }
    const outsideObserved = { [`${D0}\x00${OUT}`]: { total: 1, stamp: 'v9+c99', at: 123 } }
    const outsideSuperseded = [{ day: D0, side: OUT, stamp: 'v8+c98', replacedBy: 'v9+c99', replacedAt: 122, rows: [rawRow(D0, OUT, 100_000)] }]
    seed({
      version: 2,
      rows: [row(D1, '/p1', 'm1', 100), row(D1, '/p1', 'm1', 40, 'codex'), row(DK, '/p1', 'm1', 7), ...outside],
      stamps: { [`${D1}\x00claude`]: 'v1+c14', [`${D1}\x00codex`]: 'v1+c14', [`${DK}\x00claude`]: 'v1+c14', ...outsideStamps },
      observed: outsideObserved,
      superseded: outsideSuperseded
    })
    const a = open()
    const live = [row(D1, '/p1', 'm1', 100), row(D1, '/p1', 'm1', 40, 'codex'), row(OWN, '/p1', 'm1', 10)]
    a.merge(live, ANCHOR)
    const r = a.merge(live, ANCHOR)
    expect(r.rows.filter((x) => !known(x.side))).toEqual([])
    expect(r.rows.map((x) => [x.day, x.side, x.total]).sort()).toEqual([
      [DK, 'claude', 7], [D1, 'claude', 100], [D1, 'codex', 40], [OWN, 'claude', 10]
    ].sort())
    expect(r.archivedOnlyDays).toEqual([DK])
    const file = onDisk()
    expect(bySig(file.rows.filter((x) => !known(x.side)))).toEqual(bySig(outside))
    expect(Object.fromEntries(Object.entries(file.stamps).filter(([k]) => k.endsWith(`\x00${OUT}`)))).toEqual(outsideStamps)
    expect(file.observed).toEqual(outsideObserved)
    expect(file.superseded.filter((s) => !known(s.side))).toEqual(outsideSuperseded)
    for (const s of quiet) expect(s).not.toHaveBeenCalled()
  })

  it('token-stats::REQ-005: rows of such a side another writer adds between two merges are carried through, not overwritten from memory', () => {
    const a = open()
    a.merge([row(D1, '/p1', 'm1', 100)], ANCHOR)
    // The newer build, running at the same time, writes its side's row into the same file
    const theirs = onDisk()
    const added = rawRow(D0, OUT, 137_497)
    seed({ ...theirs, rows: [...theirs.rows, added] })
    const r = a.merge([row(D1, '/p1', 'm1', 100)], ANCHOR)
    expect(r.rows.map((x) => [x.day, x.side])).toEqual([[D1, 'claude']])
    expect(onDisk().rows.filter((x) => !known(x.side))).toEqual([added])
  })

  it('token-stats::REQ-005: a restore of a known side carries rows of a side this build does not know through', () => {
    const outside = [rawRow(D0, OUT, 137_497)]
    seed({ version: 2, rows: [row(D1, '/p1', 'm1', 30, 'codex'), ...outside], stamps: {}, observed: {}, superseded: [] })
    const outcome = open().restore([row(D1, '/p1', 'm1', 900, 'codex')], ANCHOR)
    expect(outcome).toEqual({ pairs: 1, skippedOwnDay: 0 })
    const file = onDisk()
    expect(file.rows.filter((x) => known(x.side)).map((x) => x.total)).toEqual([900])
    expect(file.rows.filter((x) => !known(x.side))).toEqual(outside)
  })

  /** A file of the format after this build's, as a newer build that changed the archive's shape would write it:
   * its version raised and keys this build has never seen */
  const newerFile = (): string => JSON.stringify({
    version: ARCHIVE_VERSION + 1, rows: [rawRow(D1, 'claude', 5_000_000)], stamps: {}, observed: {}, superseded: [],
    retention: { policy: 'unknown to this build' }
  })

  it('token-stats::REQ-006: an archive of a newer format is never written, and the figures come from the live rows alone', () => {
    const bytes = newerFile()
    mkdirSync(join(dir, 'store'), { recursive: true })
    writeFileSync(storeFile(), bytes)
    const a = open()
    const live = [row(D1, '/p1', 'm1', 100), row(OWN, '/p1', 'm1', 10), row('', '/p1', 'm1', 3)]
    for (let i = 0; i < 2; i++) {
      const r = a.merge(live, ANCHOR)
      expect(r.rows.map((x) => [x.day, x.total])).toEqual([[D1, 100], [OWN, 10]])
      expect(r.archivedOnlyDays).toEqual([])
      expect(readFileSync(storeFile(), 'utf8')).toBe(bytes)
    }
    expect(() => a.restore([row(D1, '/p1', 'm1', 900, 'codex')], ANCHOR)).toThrow()
    expect(readFileSync(storeFile(), 'utf8')).toBe(bytes)
    expect(readdirSync(join(dir, 'store'))).toEqual(['usage-archive.json'])
    for (const s of quiet) expect(s).not.toHaveBeenCalled()
  })

  it('token-stats::REQ-006: a newer build writing its format while this build runs is left alone from the next merge on; a removed file starts a new archive', () => {
    const a = open()
    a.merge([row(D1, '/p1', 'm1', 100)], ANCHOR)
    const bytes = newerFile()
    writeFileSync(storeFile(), bytes)
    const r = a.merge([row(D1, '/p1', 'm1', 100)], ANCHOR)
    expect(r.rows.map((x) => [x.day, x.total])).toEqual([[D1, 100]])
    expect(readFileSync(storeFile(), 'utf8')).toBe(bytes)
    rmSync(storeFile())
    a.merge([row(D1, '/p1', 'm1', 100)], ANCHOR)
    const file = JSON.parse(readFileSync(storeFile(), 'utf8')) as { version: number; rows: UsageRow[] }
    expect([file.version, file.rows.map((x) => [x.day, x.total])]).toEqual([ARCHIVE_VERSION, [[D1, 100]]])
  })

  it.each([['"3"', '3'], ['2.5', 2.5]])('a version that is not a whole number (%s) is corrupt, not newer: C8 applies', (_label, version) => {
    seed({ version, rows: [row(DK, '/p1', 'm1', 7)], stamps: {}, observed: {}, superseded: [] })
    const a = open()
    expect(a.rows()).toEqual([])
    a.merge([row(D1, '/p1', 'm1', 100)], ANCHOR)
    expect(onDisk().rows.map((x) => [x.day, x.total])).toEqual([[D1, 100]])
  })
})
