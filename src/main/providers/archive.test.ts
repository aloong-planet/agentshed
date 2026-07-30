// 归档:把日聚合结果持久化,源文件被 agent 清理后历史仍在。
// 粒度 天×侧×项目×模型;冲突规则:源文件在→实时覆盖归档,源文件消失→保留归档值。
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
  it('首次合并即落盘;重开实例读得回', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-07-01', '/p1', 'm1', 100)], new Set(['2026-07-01']))
    expect(existsSync(join(dir, 'store', 'usage-archive.json'))).toBe(true)
    const b = new UsageArchive(join(dir, 'store'))
    expect(b.rows()).toHaveLength(1)
    expect(b.rows()[0].total).toBe(100)
  })

  it('源文件仍在的天:实时值覆盖归档(口径修正能自动纠正历史)', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-07-01', '/p1', 'm1', 100)], new Set(['2026-07-01']))
    a.merge([row('2026-07-01', '/p1', 'm1', 250)], new Set(['2026-07-01']))
    const r = a.rows().filter((x) => x.day === '2026-07-01')
    expect(r).toHaveLength(1)
    expect(r[0].total).toBe(250)
  })

  it('源文件已消失的天:归档值保留,不被本次空扫描抹掉', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-06-01', '/p1', 'm1', 999)], new Set(['2026-06-01']))
    // 下一次扫描已看不到 6-01(文件被 agent 清理),liveDays 不含该天
    a.merge([row('2026-07-01', '/p1', 'm1', 10)], new Set(['2026-07-01']))
    const days = a.rows().map((r) => r.day).sort()
    expect(days).toEqual(['2026-06-01', '2026-07-01'])
    expect(a.rows().find((r) => r.day === '2026-06-01')?.total).toBe(999)
  })

  it('同一天内按 侧×项目×模型 分行,互不覆盖', () => {
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

  it('归档覆盖的天集合可查(供 UI 标注历史段)', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-06-01', '/p1', 'm1', 5)], new Set(['2026-06-01']))
    a.merge([row('2026-07-01', '/p1', 'm1', 5)], new Set(['2026-07-01']))
    expect(a.archivedOnlyDays(new Set(['2026-07-01']))).toEqual(['2026-06-01'])
  })

  it('原子写:目录内无临时文件残留', () => {
    const a = new UsageArchive(join(dir, 'store'))
    a.merge([row('2026-07-01', '/p1', 'm1', 1)], new Set(['2026-07-01']))
    expect(readdirSync(join(dir, 'store'))).toEqual(['usage-archive.json'])
  })

  it('归档文件损坏 → 降级为空,不崩(下次扫描重新攒)', () => {
    mkdirSync(join(dir, 'store'), { recursive: true })
    writeFileSync(join(dir, 'store', 'usage-archive.json'), '{坏了')
    const a = new UsageArchive(join(dir, 'store'))
    expect(a.rows()).toEqual([])
    a.merge([row('2026-07-01', '/p1', 'm1', 7)], new Set(['2026-07-01']))
    expect(JSON.parse(readFileSync(join(dir, 'store', 'usage-archive.json'), 'utf8')).version).toBe(1)
  })
})
