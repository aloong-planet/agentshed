// The archive: persist daily aggregates so history survives the agent cleaning up the source files.
// Granularity is day × side × project × model; the conflict rule: source present → live values overwrite
// the archive, source gone → the archived values are kept.
import { mkdtempSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UsageArchive } from './archive'
import type { UsageRow } from './archive'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-arc-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const row = (day: string, project: string, model: string, total: number): UsageRow => ({
  day,
  side: 'claude',
  projectKey: project,
  model,
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  total
})

describe('UsageArchive', () => {
  it('the first merge persists; a new instance reads it back', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-07-01', '/p1', 'm1', 100)], new Set(['2026-07-01']))
    expect(existsSync(join(dir, 'store', 'usage-archive.json'))).toBe(true)
    const b = new UsageArchive(join(dir, 'store'))
    expect(b.rows()).toHaveLength(1)
    expect(b.rows()[0].total).toBe(100)
  })

  it('a day whose source files remain: live values overwrite the archive (so an accounting fix corrects history automatically)', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-07-01', '/p1', 'm1', 100)], new Set(['2026-07-01']))
    a.merge([row('2026-07-01', '/p1', 'm1', 250)], new Set(['2026-07-01']))
    const r = a.rows().filter((x) => x.day === '2026-07-01')
    expect(r).toHaveLength(1)
    expect(r[0].total).toBe(250)
  })

  it('a day whose source files are gone: the archived values are kept and not wiped by this empty scan', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-06-01', '/p1', 'm1', 999)], new Set(['2026-06-01']))
    // The next scan can no longer see 6-01 (the agent cleaned the files up), so liveDays excludes it
    a.merge([row('2026-07-01', '/p1', 'm1', 10)], new Set(['2026-07-01']))
    const days = a.rows().map((r) => r.day).sort()
    expect(days).toEqual(['2026-06-01', '2026-07-01'])
    expect(a.rows().find((r) => r.day === '2026-06-01')?.total).toBe(999)
  })

  it('within one day, rows split by side × project × model without overwriting each other', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge(
      [
        row('2026-07-01', '/p1', 'm1', 10),
        row('2026-07-01', '/p1', 'm2', 20),
        row('2026-07-01', '/p2', 'm1', 30),
        { ...row('2026-07-01', '/p1', 'm1', 40), side: 'codex' }
      ],
      new Set(['2026-07-01'])
    )
    expect(a.rows()).toHaveLength(4)
    expect(a.rows().reduce((s, r) => s + r.total, 0)).toBe(100)
  })

  it('the set of days the archive covers is queryable (for the UI to label historical spans)', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-06-01', '/p1', 'm1', 5)], new Set(['2026-06-01']))
    a.merge([row('2026-07-01', '/p1', 'm1', 5)], new Set(['2026-07-01']))
    expect(a.archivedOnlyDays(new Set(['2026-07-01']))).toEqual(['2026-06-01'])
  })

  it('atomic writes: no temporary file is left in the directory', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-07-01', '/p1', 'm1', 1)], new Set(['2026-07-01']))
    expect(readdirSync(join(dir, 'store'))).toEqual(['usage-archive.json'])
  })

  it('a corrupt archive file → degrades to empty without crashing (the next scan starts accumulating again)', () => {
    mkdirSync(join(dir, 'store'), { recursive: true })
    writeFileSync(join(dir, 'store', 'usage-archive.json'), '{broken')
    const a = new UsageArchive(join(dir, 'store'))
    expect(a.rows()).toEqual([])
    a.merge([row('2026-07-01', '/p1', 'm1', 7)], new Set(['2026-07-01']))
    expect(JSON.parse(readFileSync(join(dir, 'store', 'usage-archive.json'), 'utf8')).version).toBe(1)
  })
})
