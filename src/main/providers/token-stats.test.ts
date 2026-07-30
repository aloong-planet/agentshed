// 票04:token 聚合引擎——流式解析/坏行跳过/模型与日粒度聚合/会话元数据/增量缓存。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TokenEngine } from './token-stats'
import { encodeClaudeProjectDir } from './claude'
import type { ScanRoots } from './types'

let dir: string
let proj: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}

/** Claude usage 行(实测形状) */
function usageLine(model: string, tsIso: string, inTok: number, outTok: number, cacheRead = 0, cacheWrite = 0): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: tsIso,
    message: {
      model,
      usage: {
        input_tokens: inTok,
        output_tokens: outTok,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheWrite
      }
    }
  })
}
function userLine(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } })
}
function mkClaudeSession(projectPath: string, file: string, lines: string[], atSec = 1000): string {
  const d = join(dir, '.claude', 'projects', encodeClaudeProjectDir(projectPath))
  mkdirSync(d, { recursive: true })
  const f = join(d, file)
  writeFileSync(f, `${lines.join('\n')}\n`)
  utimesSync(f, atSec, atSec)
  return f
}
/** Codex rollout:session_meta + turn_context(model) + 若干累计 token_count */
function mkCodexRollout(
  file: string,
  cwd: string,
  tsIso: string,
  model: string,
  totals: Array<{ input: number; cached: number; output: number }>,
  subagent = false,
  atSec = 2000
): string {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  const lines = [
    JSON.stringify({
      timestamp: tsIso,
      type: 'session_meta',
      payload: subagent ? { cwd, thread_source: 'subagent' } : { cwd }
    }),
    JSON.stringify({ timestamp: tsIso, type: 'turn_context', payload: { model, cwd } }),
    ...totals.map((t) =>
      JSON.stringify({
        timestamp: tsIso,
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: t.input,
            cached_input_tokens: t.cached,
            cache_write_input_tokens: 0,
            output_tokens: t.output,
            total_tokens: t.input + t.output
          }
        }
      })
    )
  ]
  const f = join(d, file)
  writeFileSync(f, `${lines.join('\n')}\n`)
  utimesSync(f, atSec, atSec)
  return f
}
function writeIndex(entries: Array<{ id: string; name: string }>): void {
  mkdirSync(join(dir, '.codex'), { recursive: true })
  writeFileSync(
    join(dir, '.codex', 'session_index.jsonl'),
    entries.map((e) => JSON.stringify({ id: e.id, thread_name: e.name, updated_at: 'x' })).join('\n') + '\n'
  )
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-tok-'))
  proj = join(dir, 'work', 'p1')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function engine(): TokenEngine {
  return new TokenEngine(join(dir, 'cache'))
}

describe('Claude 聚合', () => {
  it('逐行累加 usage:总量=in+out,cache 单列;按模型与本地日期聚合;会话标题取首条用户消息', async () => {
    mkClaudeSession(proj, 'a.jsonl', [
      userLine('帮我修一个布局 bug,谢谢'),
      usageLine('claude-fable-5', '2026-07-29T10:00:00Z', 100, 50, 7000, 300),
      usageLine('claude-opus-5', '2026-07-30T02:00:00Z', 20, 10)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude).toMatchObject({
      input: 120,
      output: 60,
      cacheRead: 7000,
      cacheWrite: 300,
      total: 180
    })
    const models = Object.fromEntries(r.global.byModel.map((m) => [m.model, m.total]))
    expect(models['claude-fable-5']).toBe(150)
    expect(models['claude-opus-5']).toBe(30)
    expect(r.global.byDay.length).toBeGreaterThanOrEqual(1)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions[0].title).toContain('帮我修一个布局')
    expect(p?.sessions[0].tokens).toBe(180)
  })

  it('坏行跳过不弃文件', async () => {
    mkClaudeSession(proj, 'b.jsonl', [
      'not json {{{',
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
  })
})

describe('Claude subagent 转写', () => {
  it('<session>/subagents/*.jsonl 的 usage 计入项目与全局,但不产生会话条目', async () => {
    mkClaudeSession(proj, 'main.jsonl', [
      userLine('主会话'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const subDir = join(
      dir,
      '.claude',
      'projects',
      encodeClaudeProjectDir(proj),
      'some-session-uuid',
      'subagents'
    )
    mkdirSync(subDir, { recursive: true })
    writeFileSync(
      join(subDir, 'agent-x.jsonl'),
      `${usageLine('claude-haiku-4-5', '2026-07-30T03:00:00Z', 1000, 200)}\n`
    )
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(1215)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.tokens.bySide.claude.total).toBe(1215)
    expect(p?.sessions).toHaveLength(1)
    expect(p?.sessions[0].title).toContain('主会话')
  })
})

describe('Codex 聚合', () => {
  it('取末条 token_count 累计;模型取 turn_context;标题经 session_index 映射', async () => {
    const id = '019fa9a1-380e-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-2026-07-30T00-49-03-${id}.jsonl`, proj, '2026-07-30T00:49:03Z', 'gpt-5.5-codex', [
      { input: 100, cached: 80, output: 10 },
      { input: 500, cached: 400, output: 30 }
    ])
    writeIndex([{ id, name: '迁移 skills' }])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex).toMatchObject({ input: 500, output: 30, cacheRead: 400, total: 530 })
    const models = Object.fromEntries(r.global.byModel.map((m) => [`${m.side}:${m.model}`, m.total]))
    expect(models['codex:gpt-5.5-codex']).toBe(530)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.side === 'codex')?.title).toBe('迁移 skills')
  })

  it('subagent 会话 token 计入、不进会话列表', async () => {
    mkCodexRollout('rollout-main-019f001.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.5-codex', [
      { input: 10, cached: 0, output: 5 }
    ])
    mkCodexRollout(
      'rollout-sub-019f002.jsonl',
      proj,
      '2026-07-30T01:30:00Z',
      'codex-auto-review',
      [{ input: 1000, cached: 0, output: 100 }],
      true
    )
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.codex.total).toBe(1115)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.filter((s) => s.side === 'codex')).toHaveLength(1)
    expect(p?.tokens.bySide.codex.total).toBe(1115)
  })
})

describe('增量缓存', () => {
  it('二次 build 结果一致(幂等);缓存文件为合法 JSON 且原子落盘', async () => {
    mkClaudeSession(proj, 'a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const e = engine()
    const r1 = await e.build(roots(), [proj])
    const e2 = new TokenEngine(join(dir, 'cache'))
    const r2 = await e2.build(roots(), [proj])
    expect(r2.global).toEqual(r1.global)
    const cacheFile = join(dir, 'cache', 'token-cache.json')
    expect(existsSync(cacheFile)).toBe(true)
    expect(readdirSync(join(dir, 'cache')).filter((f) => f.includes('tmp'))).toHaveLength(0)
  })

  it('源文件变化(mtime/size 变)→ 重算反映新内容', async () => {
    const f = mkClaudeSession(proj, 'a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)], 1000)
    const e = engine()
    const r1 = await e.build(roots(), [proj])
    expect(r1.global.bySide.claude.total).toBe(15)
    writeFileSync(
      f,
      [
        usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
        usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 100, 50)
      ].join('\n') + '\n'
    )
    utimesSync(f, 2000, 2000)
    const r2 = await new TokenEngine(join(dir, 'cache')).build(roots(), [proj])
    expect(r2.global.bySide.claude.total).toBe(165)
  })
})
