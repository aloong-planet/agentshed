// Ticket 02 slice (b): activity — Claude counts and times from a readdir of the encoded directory, Codex
// attributes by the rollout first line's cwd,
// and subagent threads do not count toward the session count.
//
// Gap: that doScan hands its one session walk to both scan() and the token build (#160) is wiring in the
// main process, which no unit test reaches; `pnpm bench:scan` prints the walk on its own line in the
// app's order. A main-process test seam would let a test count the walks.
import { chmodSync, closeSync, mkdtempSync, openSync, renameSync, rmSync, mkdirSync, statSync, writeFileSync, writeSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { zstdCompressSync } from 'node:zlib'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan, walkSessions } from './scan'
import { encodeClaudeProjectDir } from './claude'
import { CodexHeads, type CodexSessionMeta } from './codex'
import type { ScanRoots } from './types'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    geminiHome: join(dir, '.gemini'),
    grokHome: join(dir, '.grok'),
    antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
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
    expect(encodeClaudeProjectDir('/Users/jane_doe/Projects/Transfer')).toBe(
      '-Users-jane-doe-Projects-Transfer'
    )
    expect(encodeClaudeProjectDir('/Users/jane_doe/.cache/workspace')).toBe(
      '-Users-jane-doe--cache-workspace'
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

  it('an unreadable summary.json says nothing, and a record that says nothing is not a subagent — the session counts', async () => {
    const p = mkProject('gk-broken-summary')
    writeGrokRegistry([p])
    const d = mkGrokSession(p, '019f-nosummary', 3000)
    writeFileSync(join(d, 'summary.json'), '{not json')
    const snap = await scan(roots(), { now: () => 1 })
    // Miscounting one extra session is visible; silently dropping a real one is not — the
    // degradation errs in the visible direction
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

// One walk of the session trees per scan (#160): scan() reads the supplied walk instead of walking
// again, so a session written after the walk is outside this scan — the same set TokenEngine.build sees.
describe('the shared session walk', () => {
  it('scan() counts the sessions of the supplied walk, not ones that appeared after it', async () => {
    const p = mkProject('walk-once')
    writeCodexRegistry([p])
    writeGrokRegistry([p])
    mkCodexRollout(p, 'rollout-1.jsonl', 3000)
    mkGrokSession(p, 'g1', 3500)
    const walked = walkSessions(roots())
    mkCodexRollout(p, 'rollout-2.jsonl', 4000)
    mkGrokSession(p, 'g2', 5000)
    const snap = await scan(roots(), { now: () => 1, sessions: walked })
    expect(snap.projects[0].sessionCount).toBe(2)
    expect(snap.projects[0].lastSessionAt).toBe(3500 * 1000)
  })
})

// A rescan keeps the first-line reading of a rollout that did not change (token-stats::QR-002/AC-01). The
// readings belong to a CodexHeads, which the main process keeps for the run; whether a rollout was opened
// again is told by what the walk returns after its first line was rewritten.
//
// The first lines are built after real ones: all 3048 rollouts of one machine were enumerated on
// 2026-11-11 by key shape (59 shapes). Every first line carries an ordinal, a payload with cwd, id,
// session_id, timestamp and base_instructions; a subagent's adds thread_source, parent_thread_id and
// source.subagent; a fork's adds forked_from_id. A first line without an ordinal is the legacy format.
describe('the first-line readings a run keeps (token-stats::QR-002/AC-01)', () => {
  interface Head {
    cwd: string
    id: string
    at: string
    subagentOf?: string
    forkOf?: string
    legacy?: boolean
  }
  /** One first line, padded through base_instructions (which measures up to 42 KB in real ones) to exactly `bytes` */
  function headLine(h: Head, bytes = 2048): string {
    const line = (pad: number): string =>
      JSON.stringify({
        timestamp: h.at,
        type: 'session_meta',
        ...(h.legacy ? {} : { ordinal: 0 }),
        payload: {
          id: h.id,
          session_id: h.id,
          timestamp: h.at,
          cwd: h.cwd,
          originator: 'codex_cli_rs',
          cli_version: '0.71.0',
          model_provider: 'openai',
          history_mode: 'paginated',
          context_window: { window_id: 'w0' },
          ...(h.subagentOf === undefined
            ? { source: 'cli' }
            : {
                source: { subagent: { thread_spawn: { parent_thread_id: h.subagentOf, depth: 1 } } },
                thread_source: 'subagent',
                parent_thread_id: h.subagentOf,
                multi_agent_version: 'v2'
              }),
          ...(h.forkOf === undefined ? {} : { forked_from_id: h.forkOf }),
          base_instructions: { text: 'x'.repeat(pad) }
        }
      })
    const text = line(bytes - line(0).length)
    expect(text.length, 'the fixture line has the size asked for').toBe(bytes)
    return text
  }
  const REST = '{"timestamp":"2026-07-30T00:00:01.000Z","type":"event_msg","payload":{"type":"task_started"}}\n'
  const plainBytes = (h: Head, bytes?: number): Buffer => Buffer.from(`${headLine(h, bytes)}\n${REST}`)
  /** A cold rollout's bytes, brought to exactly `bytes` with a zstd skippable frame, which a decoder passes over */
  function coldBytes(h: Head, bytes: number): Buffer {
    const frame = zstdCompressSync(plainBytes(h))
    const fill = bytes - frame.length - 8
    expect(fill, 'the compressed fixture fits the size asked for').toBeGreaterThanOrEqual(0)
    const skippable = Buffer.alloc(8 + fill)
    skippable.writeUInt32LE(0x184d2a50, 0)
    skippable.writeUInt32LE(fill, 4)
    return Buffer.concat([frame, skippable])
  }
  function rolloutPath(name: string): string {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    return join(d, name)
  }
  function put(name: string, bytes: Buffer, atSec: number): string {
    const f = rolloutPath(name)
    writeFileSync(f, bytes)
    utimesSync(f, atSec, atSec)
    return f
  }
  /** Overwrite a file's bytes where they are: the same inode, and the same size when the bytes are as many */
  function overwrite(file: string, bytes: Buffer, atSec: number): void {
    const fd = openSync(file, 'r+')
    try {
      writeSync(fd, bytes, 0, bytes.length, 0)
    } finally {
      closeSync(fd)
    }
    utimesSync(file, atSec, atSec)
  }
  const signature = (file: string): { mtimeMs: number; size: number; ino: number } => {
    const st = statSync(file)
    return { mtimeMs: st.mtimeMs, size: st.size, ino: st.ino }
  }
  const byFile = (list: CodexSessionMeta[]): CodexSessionMeta[] => [...list].sort((a, b) => a.file.localeCompare(b.file))
  const walk = (heads?: CodexHeads): CodexSessionMeta[] => byFile(walkSessions(roots(), heads).codex)

  const T1 = Date.UTC(2026, 6, 30, 1, 0, 0)
  const T2 = Date.UTC(2026, 7, 2, 3, 4, 5)
  const first = (cwd: string): Head => ({ cwd, id: '019f0a01-0000-7000-8000-000000000001', at: '2026-07-30T01:00:00.000Z' })
  /** A first line that differs from `first` in everything a walk takes from it */
  const other = (cwd: string): Head => ({
    cwd,
    id: '019f0b02-0000-7000-8000-000000000002',
    at: '2026-08-02T03:04:05.000Z',
    subagentOf: '019f0c03-0000-7000-8000-000000000003',
    legacy: true
  })

  it('a rollout whose time, size and inode are the ones the last walk saw keeps what was read then, plain or cold', () => {
    const a = mkProject('kept-a')
    const b = mkProject('kept-b')
    const plain = put('rollout-2026-07-30T01-00-00-plain.jsonl', plainBytes(first(a)), 3000)
    const cold = put('rollout-2026-07-30T01-00-00-cold.jsonl.zst', coldBytes(first(a), 1024), 4000)
    const read = [
      { file: cold, cwd: a, subagent: false, mtimeMs: 4000_000, sessionId: '019f0a01-0000-7000-8000-000000000001', parentId: null, forkedAt: T1, paginated: true },
      { file: plain, cwd: a, subagent: false, mtimeMs: 3000_000, sessionId: '019f0a01-0000-7000-8000-000000000001', parentId: null, forkedAt: T1, paginated: true }
    ]
    const heads = new CodexHeads()
    expect(walk(heads)).toEqual(read)

    const before = [signature(plain), signature(cold)]
    overwrite(plain, plainBytes(other(b)), 3000)
    overwrite(cold, coldBytes(other(b), 1024), 4000)
    expect([signature(plain), signature(cold)], 'the rewrite moved none of the three').toEqual(before)

    expect(walk(heads)).toEqual(read)
    expect(walk(heads), 'and at every walk after it').toEqual(read)
  })

  it.each([
    {
      name: 'grew',
      change: (f: string, bytes: Buffer): void => {
        writeFileSync(f, Buffer.concat([bytes, Buffer.from(REST)]))
        utimesSync(f, 3000, 3000)
      },
      moved: { mtimeMs: false, size: true, ino: false },
      mtimeMs: 3000_000
    },
    {
      name: 'was replaced by a rename',
      change: (f: string, bytes: Buffer): void => {
        const staged = join(dir, 'staged')
        writeFileSync(staged, bytes)
        utimesSync(staged, 3000, 3000)
        renameSync(staged, f)
      },
      moved: { mtimeMs: false, size: false, ino: true },
      mtimeMs: 3000_000
    },
    {
      name: 'had only its modification time moved',
      change: (f: string, bytes: Buffer): void => overwrite(f, bytes, 3001),
      moved: { mtimeMs: true, size: false, ino: false },
      mtimeMs: 3001_000
    }
  ])('a rollout that $name is read again', ({ change, moved, mtimeMs }) => {
    const a = mkProject('changed-a')
    const b = mkProject('changed-b')
    const f = put('rollout-2026-07-30T01-00-00-changes.jsonl', plainBytes(first(a)), 3000)
    const heads = new CodexHeads()
    expect(walk(heads).map((s) => s.cwd)).toEqual([a])

    const before = signature(f)
    change(f, plainBytes(other(b)))
    const after = signature(f)
    expect({ mtimeMs: after.mtimeMs !== before.mtimeMs, size: after.size !== before.size, ino: after.ino !== before.ino }, 'the change moved this one part').toEqual(moved)

    expect(walk(heads)).toEqual([
      { file: f, cwd: b, subagent: true, mtimeMs, sessionId: '019f0b02-0000-7000-8000-000000000002', parentId: '019f0c03-0000-7000-8000-000000000003', forkedAt: T2, paginated: false }
    ])
  })

  it.each([
    {
      name: 'whose first line no longer parses',
      spoil: (f: string, good: Buffer): void => overwrite(f, Buffer.concat([Buffer.from('['), good.subarray(1)]), 3001)
    },
    {
      name: 'that can no longer be opened',
      spoil: (f: string): void => {
        chmodSync(f, 0o000)
        utimesSync(f, 3001, 3001)
      }
    }
  ])('a changed rollout $name leaves the walk: the reading kept for it is not handed back', ({ spoil }) => {
    const a = mkProject('gone-a')
    const good = plainBytes(first(a))
    const f = put('rollout-2026-07-30T01-00-00-gone.jsonl', good, 3000)
    const heads = new CodexHeads()
    expect(walk(heads).map((s) => s.cwd)).toEqual([a])
    try {
      spoil(f, good)
      expect(walk(heads)).toEqual([])
      expect(walk(heads), 'nor at the walk after it').toEqual([])
    } finally {
      chmodSync(f, 0o644)
    }
  })

  it('the readings are one run\'s: a walk with no earlier walk behind it reads the first line as it is on disk', () => {
    const a = mkProject('run-a')
    const b = mkProject('run-b')
    const f = put('rollout-2026-07-30T01-00-00-run.jsonl', plainBytes(first(a)), 3000)
    const earlier = new CodexHeads()
    expect(walk(earlier).map((s) => s.cwd)).toEqual([a])
    overwrite(f, plainBytes(other(b)), 3000)
    expect(walk(earlier).map((s) => s.cwd), 'the earlier run still holds its reading').toEqual([a])

    expect(walk(new CodexHeads()).map((s) => s.cwd)).toEqual([b])
    expect(walk().map((s) => s.cwd)).toEqual([b])
  })

  it('two walks of an unchanged tree give the same sessions, and a later walk follows the files that left and joined', () => {
    const a = mkProject('same-a')
    const main = put('rollout-2026-07-30T01-00-00-main.jsonl', plainBytes(first(a)), 3000)
    const sub = put('rollout-2026-07-30T01-00-01-sub.jsonl', plainBytes({ cwd: a, id: 'sub-1', at: '2026-07-30T01:00:01.000Z', subagentOf: '019f0a01-0000-7000-8000-000000000001' }), 3100)
    const fork = put('rollout-2026-07-30T01-00-02-fork.jsonl', plainBytes({ cwd: a, id: 'fork-1', at: '2026-07-30T01:00:02.000Z', forkOf: '019f0a01-0000-7000-8000-000000000001' }), 3200)
    const cold = put('rollout-2026-07-30T01-00-03-cold.jsonl.zst', zstdCompressSync(plainBytes({ cwd: a, id: 'cold-1', at: '2026-07-30T01:00:03.000Z' })), 3300)
    const heads = new CodexHeads()
    const one = walk(heads)
    expect(one.map((s) => [s.file, s.subagent, s.parentId])).toEqual([
      [main, false, null],
      [sub, true, '019f0a01-0000-7000-8000-000000000001'],
      [fork, false, '019f0a01-0000-7000-8000-000000000001'],
      [cold, false, null]
    ])
    expect(walk(heads)).toEqual(one)
    expect(walk(), 'the same sessions a walk that keeps nothing reads').toEqual(one)

    // Codex compresses the main session: the plain path leaves and its cold twin joins (B12); the fork is deleted
    rmSync(main)
    rmSync(fork)
    const twin = put('rollout-2026-07-30T01-00-00-main.jsonl.zst', zstdCompressSync(plainBytes(first(a))), 3000)
    expect(walk(heads).map((s) => [s.file, s.sessionId])).toEqual([
      [twin, '019f0a01-0000-7000-8000-000000000001'],
      [sub, 'sub-1'],
      [cold, 'cold-1']
    ])
  })

  it.each([
    {
      name: 'whose first line was corrupt and is rewritten under the same signature',
      breakIt: (f: string, good: Buffer): void => overwrite(f, Buffer.concat([Buffer.from('['), good.subarray(1)]), 3000),
      mend: (f: string, good: Buffer): void => overwrite(f, good, 3000)
    },
    {
      name: 'that could not be opened and can be again',
      breakIt: (f: string): void => chmodSync(f, 0o000),
      mend: (f: string): void => chmodSync(f, 0o644)
    }
  ])('a rollout that gave no reading is read again at the next walk: one $name', ({ breakIt, mend }) => {
    const a = mkProject('failed-a')
    const good = plainBytes(first(a))
    const f = put('rollout-2026-07-30T01-00-00-failed.jsonl', good, 3000)
    breakIt(f, good)
    const heads = new CodexHeads()
    try {
      expect(walk(heads)).toEqual([])
      const before = signature(f)
      mend(f, good)
      expect(signature(f), 'mending moved none of the three').toEqual(before)
    } finally {
      chmodSync(f, 0o644)
    }
    expect(walk(heads).map((s) => s.cwd)).toEqual([a])
  })
})
