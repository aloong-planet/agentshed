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
function writeGrokRegistry(paths: string[]): void {
  mkdirSync(join(dir, '.grok'), { recursive: true })
  const lines = paths.map((p) => `[folders."${p}"]\ntrusted = true\n`).join('\n')
  writeFileSync(join(dir, '.grok', 'trusted_folders.toml'), lines)
}
/**
 * Build a Grok session directory (the real layout measured 2026-08-16):
 * sessions/<percent-encoded cwd>/<session-id>/ with updates.jsonl as the authoritative stream.
 * A real child session carries `"session_kind": "subagent"` in its summary.json and sits beside its
 * parent; a parent has no session_kind key at all.
 */
function mkGrokSession(
  cwd: string,
  id: string,
  atSec: number,
  opts: { subagent?: boolean } = {}
): string {
  const d = join(dir, '.grok', 'sessions', encodeURIComponent(cwd), id)
  mkdirSync(d, { recursive: true })
  const summary: Record<string, unknown> = { info: { id, cwd } }
  if (opts.subagent) summary['session_kind'] = 'subagent'
  writeFileSync(join(d, 'summary.json'), JSON.stringify(summary))
  const f = join(d, 'updates.jsonl')
  writeFileSync(f, '{"type":"x"}\n')
  utimesSync(f, atSec, atSec)
  return d
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

  it('Grok sessions: a directory-stored session contributes the authoritative stream\'s mtime, not another file\'s (B7)', async () => {
    const p = mkProject('gk-act')
    writeGrokRegistry([p])
    const d = mkGrokSession(p, '019f-b7-case', 3000)
    // A sibling file with a later mtime must not win: "the session file's mtime" means the
    // authoritative stream's, keeping one meaning across all sides
    const noise = join(d, 'chat_history.jsonl')
    writeFileSync(noise, '{"x":1}\n')
    utimesSync(noise, 9000, 9000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(snap.projects[0].lastSessionAt).toBe(3000 * 1000)
  })

  it('a Grok child session sits beside its parent and is judged by its own record, not by depth (B8)', async () => {
    const p = mkProject('gk-sub')
    writeGrokRegistry([p])
    mkGrokSession(p, '019f-parent', 3000)
    // The child is a **sibling** at the same directory level — depth cannot tell the two apart, only
    // the record's own session_kind can; it must not count and must not push the time up
    mkGrokSession(p, '019f-child', 9000, { subagent: true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(snap.projects[0].lastSessionAt).toBe(3000 * 1000)
  })

  it('B9: activity counts a side that did not register the directory, while the side count stays at one (A8)', async () => {
    const p = mkProject('one-side-act')
    writeClaudeRegistry([p])
    mkGrokSession(p, '019f-unreg', 7000) // Grok has sessions here but no trust record
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    // "How many sides claim this project" and "when was it last worked in" answer different
    // questions and are deliberately not reconciled
    expect(snap.projects[0].sides).toEqual(['claude'])
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(snap.projects[0].lastSessionAt).toBe(7000 * 1000)
  })

  it('A7: a directory with Grok sessions but no registry record on any side does not enter the list', async () => {
    const p = mkProject('sessions-only')
    mkdirSync(join(dir, '.grok'), { recursive: true })
    mkGrokSession(p, '019f-orphan', 5000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.grok.detected).toBe(true)
    expect(snap.projects).toEqual([])
  })

  it('sessions on all three sides merge: the count is the sum and the time is the largest (B6)', async () => {
    const p = mkProject('tri-act')
    writeClaudeRegistry([p])
    writeCodexRegistry([p])
    writeGrokRegistry([p])
    mkClaudeSession(p, 'a.jsonl', 1000)
    mkCodexRollout(p, 'rollout-1.jsonl', 5000)
    mkGrokSession(p, '019f-tri', 8000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].sessionCount).toBe(3)
    expect(snap.projects[0].lastSessionAt).toBe(8000 * 1000)
  })

  it('a Grok session directory without an updates.jsonl is skipped without abandoning the scan', async () => {
    const p = mkProject('gk-missing-stream')
    writeGrokRegistry([p])
    mkGrokSession(p, '019f-whole', 3000)
    // A directory with no authoritative stream has no session identity (ADR-0019)
    mkdirSync(join(dir, '.grok', 'sessions', encodeURIComponent(p), '019f-hollow'), {
      recursive: true
    })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(snap.projects[0].lastSessionAt).toBe(3000 * 1000)
  })

  it('loose files in the Grok session store (prompt_history.jsonl, session_search.sqlite) are not sessions', async () => {
    const p = mkProject('gk-loose')
    writeGrokRegistry([p])
    mkGrokSession(p, '019f-real', 3000)
    writeFileSync(join(dir, '.grok', 'sessions', 'session_search.sqlite'), 'not a dir')
    writeFileSync(
      join(dir, '.grok', 'sessions', encodeURIComponent(p), 'prompt_history.jsonl'),
      '{"q":1}\n'
    )
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
