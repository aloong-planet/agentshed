// 票02 纵切(b):活跃度——Claude 编码目录 readdir 计数/取时,Codex rollout 首行 cwd 归属,
// subagent 线程不计入会话数。
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
/** 造一个 Claude 会话 jsonl,mtime 设为 atSec(epoch 秒) */
function mkClaudeSession(projectPath: string, file: string, atSec: number): void {
  const d = join(dir, '.claude', 'projects', encodeClaudeProjectDir(projectPath))
  mkdirSync(d, { recursive: true })
  const f = join(d, file)
  writeFileSync(f, '{"type":"x"}\n')
  utimesSync(f, atSec, atSec)
}
/** 造一个 Codex rollout,首行 session_meta 带 cwd;subagent 参数控制 thread_source */
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
  it('非字母数字全部替换为 -(实测规律:/ . _ 均转换)', () => {
    expect(encodeClaudeProjectDir('/Users/loong_zhou/CascadeProjects/Transfer')).toBe(
      '-Users-loong-zhou-CascadeProjects-Transfer'
    )
    expect(encodeClaudeProjectDir('/Users/loong_zhou/.openclaw/workspace')).toBe(
      '-Users-loong-zhou--openclaw-workspace'
    )
  })
})

describe('活跃度', () => {
  it('Claude 会话:jsonl 计数 + 最大 mtime 为最近会话时间', async () => {
    const p = mkProject('cl-act')
    writeClaudeRegistry([p])
    mkClaudeSession(p, 'a.jsonl', 1000)
    mkClaudeSession(p, 'b.jsonl', 2000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(2)
    expect(snap.projects[0].lastSessionAt).toBe(2000 * 1000)
  })

  it('无会话项目 → count=0,lastSessionAt=null', async () => {
    const p = mkProject('no-act')
    writeClaudeRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(0)
    expect(snap.projects[0].lastSessionAt).toBeNull()
  })

  it('Codex 会话:读 rollout 首行 cwd 归属到项目', async () => {
    const p = mkProject('cx-act')
    writeCodexRegistry([p])
    mkCodexRollout(p, 'rollout-1.jsonl', 3000)
    mkCodexRollout(p, 'rollout-2.jsonl', 4000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(2)
    expect(snap.projects[0].lastSessionAt).toBe(4000 * 1000)
  })

  it('Codex subagent 线程不计入会话数,也不推高最近时间', async () => {
    const p = mkProject('cx-sub')
    writeCodexRegistry([p])
    mkCodexRollout(p, 'rollout-main.jsonl', 3000)
    mkCodexRollout(p, 'rollout-sub.jsonl', 9000, true)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(snap.projects[0].lastSessionAt).toBe(3000 * 1000)
  })

  it('双侧会话合并计数取并、时间取最大', async () => {
    const p = mkProject('both-act')
    writeClaudeRegistry([p])
    writeCodexRegistry([p])
    mkClaudeSession(p, 'a.jsonl', 1000)
    mkCodexRollout(p, 'rollout-1.jsonl', 5000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(2)
    expect(snap.projects[0].lastSessionAt).toBe(5000 * 1000)
  })

  it('首行超长(实测 base_instructions 可达 42KB)仍能取到 cwd 归属', async () => {
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

  it('rollout 首行损坏 → 跳过该文件不抛错', async () => {
    const p = mkProject('cx-broken')
    writeCodexRegistry([p])
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'rollout-bad.jsonl'), 'not json at all\n')
    mkCodexRollout(p, 'rollout-good.jsonl', 3000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
  })

  // 两条管线的分界(2026-08-02 定案,spec session-view A1):
  // 项目活跃度走**文件 mtime**,会话列表的 SessionMeta.at 走**文件内最大时间戳**。
  // 两者刻意不统一——mtime 是全库近千文件的廉价近似,改成读内容会把项目列表的
  // 首屏成本抬到与全量扫描同级。下面这条钉住分界,防止后人"顺手统一"。
  it('活跃度取 mtime,不受文件内时间戳影响', async () => {
    const p = mkProject('mtime-only')
    writeCodexRegistry([p])
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    // 文件内时间戳远在未来(2030),mtime 却是 3000 秒 —— 活跃度必须报 mtime
    const meta = { timestamp: '2030-01-01T00:00:00Z', type: 'session_meta', payload: { cwd: p } }
    const evt = { timestamp: '2030-06-01T00:00:00Z', type: 'event_msg', payload: { type: 'token_count' } }
    const f = join(d, 'rollout-future.jsonl')
    writeFileSync(f, `${JSON.stringify(meta)}\n${JSON.stringify(evt)}\n`)
    utimesSync(f, 3000, 3000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].lastSessionAt, '活跃度是 mtime 管线,不读文件内时间戳').toBe(3000 * 1000)
  })
})
