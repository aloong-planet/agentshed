// Seam 1 (the data layer): behavioural tests of the scan engine against fixture directories.
// Ticket 01 skeleton: an empty fixture → an empty snapshot in the not-detected state; a missing directory
// does not throw.
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
    grokHome: join(dir, '.grok'),
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

describe('scan (skeleton)', () => {
  it('neither side exists → an empty snapshot with detected=false on both sides, without throwing', async () => {
    const snap = await scan(roots(), { now: () => 42 })
    expect(snap.scannedAt).toBe(42)
    expect(snap.sides.claude.detected).toBe(false)
    expect(snap.sides.codex.detected).toBe(false)
    expect(snap.projects).toEqual([])
  })

  it('only the Claude side exists (there is a ~/.claude.json) → claude.detected=true', async () => {
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.claude.detected).toBe(true)
    expect(snap.sides.codex.detected).toBe(false)
  })

  it('only the Codex side exists (there is a ~/.codex directory) → codex.detected=true', async () => {
    mkdirSync(join(dir, '.codex'), { recursive: true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.claude.detected).toBe(false)
    expect(snap.sides.codex.detected).toBe(true)
    expect(snap.sides.grok.detected).toBe(false)
  })

  it('only the Grok side exists (there is a ~/.grok directory) → grok.detected=true', async () => {
    mkdirSync(join(dir, '.grok'), { recursive: true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.claude.detected).toBe(false)
    expect(snap.sides.codex.detected).toBe(false)
    expect(snap.sides.grok.detected).toBe(true)
  })
})
