// The global Memory summary (spec: subagents-memory-plugin, sequence C):
// metadata and the filename list enter the snapshot, contents do not (C8); the project registry is
// authoritative (C5); Codex is probe-style (C6).
// Known gaps: (1) the drawer read-failure path (a deleted file or an allow-list refusal → the UI reports
// without crashing) is in the UI layer,
//   not unit tested per ADR-0002, with e2e covering the normal read path and the failure branch tested by
//   hand;
//   (2) D4's empty-state copy for a Codex-only project is likewise UI layer.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import { encodeClaudeProjectDir } from './claude'
import type { ScanRoots } from './types'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
/** Register a project (writing the projects key in ~/.claude.json) and optionally create a memory
 * directory */
function register(projects: string[]): void {
  writeFileSync(
    join(dir, '.claude.json'),
    JSON.stringify({ projects: Object.fromEntries(projects.map((p) => [p, {}])) })
  )
}
function mkMemory(projectPath: string, files: Record<string, { body: string; mtime: number }>): void {
  const d = join(dir, '.claude', 'projects', encodeClaudeProjectDir(projectPath), 'memory')
  mkdirSync(d, { recursive: true })
  for (const [name, { body, mtime }] of Object.entries(files)) {
    const f = join(d, name)
    writeFileSync(f, body)
    utimesSync(f, new Date(mtime), new Date(mtime))
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-mem-'))
  register([])
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the global Memory summary', () => {
  it('C3/C4/C8 a project with memories is listed: metadata and filenames (with absolute paths and mtimes), no contents; ordered by most recent modification', async () => {
    const pa = join(dir, 'proj-a')
    const pb = join(dir, 'proj-b')
    mkdirSync(pa)
    mkdirSync(pb)
    register([pa, pb])
    mkMemory(pa, { 'MEMORY.md': { body: '# Main file', mtime: 1_000 }, 'topic.md': { body: 't', mtime: 2_000 } })
    mkMemory(pb, { 'only-topic.md': { body: 't', mtime: 9_000 } }) // C3: no MEMORY.md, topics only
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toHaveLength(2)
    // Descending: proj-b (9000) comes first
    expect(snap.global.memory[0].projectPath).toBe(pb)
    expect(snap.global.memory[0].hasMain).toBe(false)
    expect(snap.global.memory[1].projectPath).toBe(pa)
    expect(snap.global.memory[1].hasMain).toBe(true)
    const files = snap.global.memory[1].files
    expect(files.map((f) => f.name).sort()).toEqual(['MEMORY.md', 'topic.md'])
    expect(files[0].file.startsWith('/')).toBe(true)
    expect(files.every((f) => typeof f.mtimeMs === 'number')).toBe(true)
    expect(JSON.stringify(snap.global.memory)).not.toContain('# Main file') // Contents do not enter the snapshot
  })

  it('C2 an existing but empty memory directory → not listed; no memory directory → not listed', async () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkdirSync(join(dir, '.claude', 'projects', encodeClaudeProjectDir(pa), 'memory'), { recursive: true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toEqual([])
  })

  it('C5 an encoded directory with no matching project in the registry → not listed (the registry is authoritative)', async () => {
    mkMemory(join(dir, 'ghost-proj'), { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toEqual([])
  })

  it('C4 a stale project is listed as usual with its marker', async () => {
    const gone = join(dir, 'deleted-proj') // The directory is never created → stale
    register([gone])
    mkMemory(gone, { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toHaveLength(1)
    expect(snap.global.memory[0].stale).toBe(true)
  })

  it('C4 a hidden project is listed as usual with its marker', async () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkMemory(pa, { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    const snap = await scan(roots(), { now: () => 1, isHidden: (p) => p === pa })
    expect(snap.global.memory[0].hidden).toBe(true)
  })

  it('C6 the three states: toggle detection is confined to the [features] section and is not misled by a [memories] configuration section', async () => {
    // No config → not enabled
    let snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexMemoriesEnabled).toBe(false)
    // Neither a key inside a [memories] section nor a same-named top-level key counts as enabled
    writeFileSync(
      join(dir, '.codex', 'config.toml'),
      'memories = true\n[memories]\nuse_memories = true\n[other]\nmemories = true\n'
    )
    snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexMemoriesEnabled).toBe(false)
    // memories = true inside the [features] section → enabled
    writeFileSync(join(dir, '.codex', 'config.toml'), '[features]\nmemories = true\n[memories]\nuse_memories = true\n')
    snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexMemoriesEnabled).toBe(true)
    // An explicit false inside [features] → not enabled
    writeFileSync(join(dir, '.codex', 'config.toml'), '[features]\nmemories = false\n')
    snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexMemoriesEnabled).toBe(false)
  })

  it('C6 the dotted form features.memories = true is equivalent to the [features] section and must be recognised', async () => {
    writeFileSync(join(dir, '.codex', 'config.toml'), 'model = "gpt-5.5"\nfeatures.memories = true\n')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexMemoriesEnabled).toBe(true)
  })

  it('C6 a config parse failure → not enabled: Codex cannot read that config either, and we do not salvage semantics from a broken file', async () => {
    writeFileSync(
      join(dir, '.codex', 'config.toml'),
      'broken = "unterminated\n[features]\nmemories = true\n'
    )
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexMemoriesEnabled).toBe(false)
  })

  it('C6 an empty Codex memories directory → no codex entry; non-empty → listed probe-style', async () => {
    mkdirSync(join(dir, '.codex', 'memories'), { recursive: true })
    let snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory.filter((m) => m.side === 'codex')).toEqual([])
    writeFileSync(join(dir, '.codex', 'memories', 'consolidated.md'), 'mem')
    snap = await scan(roots(), { now: () => 1 })
    const cx = snap.global.memory.filter((m) => m.side === 'codex')
    expect(cx).toHaveLength(1)
    expect(cx[0].projectPath).toBeNull()
    expect(cx[0].files.map((f) => f.name)).toEqual(['consolidated.md'])
  })
})

// ── Project detail's Memory (sequence D) ──
import { readProjectDetail } from './project-detail'

describe('project detail memory', () => {
  it('D2 MEMORY.md\'s contents are emitted directly; topics carry metadata only (contents go through the on-demand channel)', () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkMemory(pa, {
      'MEMORY.md': { body: '# Main file body', mtime: 1_000 },
      'topic-a.md': { body: 'topic body', mtime: 2_000 }
    })
    const detail = readProjectDetail(roots(), pa)
    expect(detail.memory.main?.text).toContain('# Main file body')
    expect(detail.memory.topics.map((t) => t.name)).toEqual(['topic-a.md'])
    expect(JSON.stringify(detail.memory.topics)).not.toContain('topic body')
  })

  it('D1 no memory directory → main null and topics empty (the UI empty state)', () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    const detail = readProjectDetail(roots(), pa)
    expect(detail.memory.main).toBeNull()
    expect(detail.memory.topics).toEqual([])
  })

  it('D3 subdirectories under memory (such as subagent-level ones) are not read', () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkMemory(pa, { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    mkdirSync(
      join(dir, '.claude', 'projects', encodeClaudeProjectDir(pa), 'memory', 'sub.md'),
      { recursive: true }
    ) // A same-named decoy: it is a directory rather than a file and must not be listed
    const detail = readProjectDetail(roots(), pa)
    expect(detail.memory.topics).toEqual([])
  })
})
