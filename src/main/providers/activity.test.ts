// Ticket 02 slice (b): activity — Claude counts and times from a readdir of the encoded directory, Codex
// attributes by the rollout first line's cwd,
// and subagent threads do not count toward the session count.
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
    grokHome: join(dir, '.grok'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
function mkProject(name: string): string {
  const p = join(dir, 'work', name)
  mkdirSync(p, { recursive: true })
  return p
}
function writeClaudeRegistry(paths: string[]): void {
  const projects: Record<string, object> = {}
  for (const p of paths) projects[p] = {}
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects }))
}
function writeCodexRegistry(paths: string[]): void {
  mkdirSync(join(dir, '.codex'), { recursive: true })
  const lines = paths.map((p) => `[projects."${p}"]\ntrust_level = "trusted"\n`).join('\n')
  writeFileSync(join(dir, '.codex', 'config.toml'), lines)
}
/** Build a Claude session jsonl with its mtime set to atSec (epoch seconds) */
function mkClaudeSession(projectPath: string, file: string, atSec: number): void {
  const d = join(dir, '.claude', 'projects', encodeClaudeProjectDir(projectPath))
  mkdirSync(d, { recursive: true })
  const f = join(d, file)
  writeFileSync(f, '{"type":"x"}\n')
  utimesSync(f, atSec, atSec)
}
/** Build a Codex rollout whose first line session_meta carries a cwd; the subagent parameter controls
 * thread_source */
function mkCodexRollout(cwd: string, file: string, atSec: number, subagent = false): void {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  const meta = {
    timestamp: '2026-07-30T00:00:00Z',
    type: 'session_meta',
    payload: subagent ? { cwd, thread_source: 'subagent' } : { cwd }
  }
  const f = join(d, file)
  writeFileSync(f, `${JSON.stringify(meta)}\n{"type":"other"}\n`)
  utimesSync(f, atSec, atSec)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-act-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('encodeClaudeProjectDir', () => {
  it('every non-alphanumeric character becomes - (the measured rule: / . _ all convert)', () => {
    expect(encodeClaudeProjectDir('/Users/loong_zhou/CascadeProjects/Transfer')).toBe(
      '-Users-loong-zhou-CascadeProjects-Transfer'
    )
    expect(encodeClaudeProjectDir('/Users/loong_zhou/.openclaw/workspace')).toBe(
      '-Users-loong-zhou--openclaw-workspace'
    )
  })
})

describe('activity', () => {
  it('Claude sessions: a jsonl count plus the largest mtime as the most recent session time', async () => {
    const p = mkProject('cl-act')
    writeClaudeRegistry([p])
    mkClaudeSession(p, 'a.jsonl', 1000)
    mkClaudeSession(p, 'b.jsonl', 2000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(2)
    expect(snap.projects[0].lastSessionAt).toBe(2000 * 1000)
  })

  it('a project with no sessions → count=0, lastSessionAt=null', async () => {
    const p = mkProject('no-act')
    writeClaudeRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(0)
    expect(snap.projects[0].lastSessionAt).toBeNull()
  })

  it('Codex sessions: attributed to a project by the rollout first line\'s cwd', async () => {
    const p = mkProject('cx-act')
    writeCodexRegistry([p])
    mkCodexRollout(p, 'rollout-1.jsonl', 3000)
    mkCodexRollout(p, 'rollout-2.jsonl', 4000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(2)
    expect(snap.projects[0].lastSessionAt).toBe(4000 * 1000)
  })

  it('a Codex subagent thread does not count toward the session count and does not push the most recent time up', async () => {
    const p = mkProject('cx-sub')
    writeCodexRegistry([p])
    mkCodexRollout(p, 'rollout-main.jsonl', 3000)
    mkCodexRollout(p, 'rollout-sub.jsonl', 9000, true)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(snap.projects[0].lastSessionAt).toBe(3000 * 1000)
  })

  it('sessions on both sides merge, with the count as the union and the time as the larger', async () => {
    const p = mkProject('both-act')
    writeClaudeRegistry([p])
    writeCodexRegistry([p])
    mkClaudeSession(p, 'a.jsonl', 1000)
    mkCodexRollout(p, 'rollout-1.jsonl', 5000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(2)
    expect(snap.projects[0].lastSessionAt).toBe(5000 * 1000)
  })

  it('an oversized first line (base_instructions measures up to 42 KB) still yields the cwd attribution', async () => {
    const p = mkProject('cx-huge')
    writeCodexRegistry([p])
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const meta = {
      timestamp: '2026-07-30T00:00:00Z',
      type: 'session_meta',
      payload: { cwd: p, base_instructions: { text: 'x'.repeat(40000) } }
    }
    const f = join(d, 'rollout-huge.jsonl')
    writeFileSync(f, `${JSON.stringify(meta)}\n{"type":"other"}\n`)
    utimesSync(f, 3000, 3000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
  })

  it('a corrupt rollout first line → skip that file without throwing', async () => {
    const p = mkProject('cx-broken')
    writeCodexRegistry([p])
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'rollout-bad.jsonl'), 'not json at all\n')
    mkCodexRollout(p, 'rollout-good.jsonl', 3000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
  })

  // The boundary between two pipelines (settled 2026-08-02, spec session-view A1):
  // project activity uses **the file's mtime**, while the session list's SessionMeta.at uses **the largest
  // timestamp inside the file**.
  // They are deliberately not unified — mtime is a cheap approximation over nearly a thousand files, and
  // reading contents instead would push the project list's
  // first-paint cost up to the level of a full scan. The case below pins the boundary against a later
  // "unify them while we are here".
  it('activity takes the mtime and is unaffected by timestamps inside the file', async () => {
    const p = mkProject('mtime-only')
    writeCodexRegistry([p])
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    // The timestamp inside the file is far in the future (2030) while the mtime is 3000 seconds —
    // activity must report the mtime
    const meta = { timestamp: '2030-01-01T00:00:00Z', type: 'session_meta', payload: { cwd: p } }
    const evt = { timestamp: '2030-06-01T00:00:00Z', type: 'event_msg', payload: { type: 'token_count' } }
    const f = join(d, 'rollout-future.jsonl')
    writeFileSync(f, `${JSON.stringify(meta)}\n${JSON.stringify(evt)}\n`)
    utimesSync(f, 3000, 3000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].lastSessionAt, 'activity is the mtime pipeline and does not read timestamps inside the file').toBe(3000 * 1000)
  })
})
