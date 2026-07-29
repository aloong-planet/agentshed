// Seam 1(数据层):扫描引擎对 fixture 目录的行为测试。
// 票01 骨架:空 fixture → 空快照、未检测态;缺目录不抛错。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import type { ScanRoots } from './types'

let dir: string
function roots(overrides: Partial<ScanRoots> = {}): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    agentsSkillsDir: join(dir, '.agents', 'skills'),
    ...overrides
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-fixture-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('scan(骨架)', () => {
  it('两侧都不存在 → 空快照,双侧 detected=false,不抛错', async () => {
    const snap = await scan(roots(), { now: () => 42 })
    expect(snap.scannedAt).toBe(42)
    expect(snap.sides.claude.detected).toBe(false)
    expect(snap.sides.codex.detected).toBe(false)
    expect(snap.projects).toEqual([])
  })

  it('仅 Claude 侧存在(有 ~/.claude.json)→ claude.detected=true', async () => {
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.claude.detected).toBe(true)
    expect(snap.sides.codex.detected).toBe(false)
  })

  it('仅 Codex 侧存在(有 ~/.codex 目录)→ codex.detected=true', async () => {
    mkdirSync(join(dir, '.codex'), { recursive: true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.claude.detected).toBe(false)
    expect(snap.sides.codex.detected).toBe(true)
  })
})
