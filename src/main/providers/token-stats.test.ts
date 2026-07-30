// 票04+修正轮:token 聚合引擎(ccusage 对齐,2026-07-30)——
// 全树扫描(与注册表无关)、message.id+requestId 去重(sidechain 回退)、
// 总量四项全加、synthetic 不入模型桶、流式坏行跳过、增量缓存。
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

interface UsageOpts {
  id?: string
  requestId?: string
  sidechain?: boolean
  cacheRead?: number
  cacheWrite?: number
}
/** Claude usage 行(实测形状;id/requestId/sidechain 供去重用例) */
function usageLine(model: string, tsIso: string, inTok: number, outTok: number, o: UsageOpts = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: tsIso,
    requestId: o.requestId,
    isSidechain: o.sidechain ?? false,
    message: {
      id: o.id,
      model,
      usage: {
        input_tokens: inTok,
        output_tokens: outTok,
        cache_read_input_tokens: o.cacheRead ?? 0,
        cache_creation_input_tokens: o.cacheWrite ?? 0
      }
    }
  })
}
function userLine(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } })
}
/** 在 projects/<encodedDir>/ 下造会话文件;encodedDir 缺省取真实项目路径的编码 */
function mkClaudeFile(rel: string, lines: string[], atSec = 1000, encodedDir?: string): string {
  const enc = encodedDir ?? encodeClaudeProjectDir(proj)
  const f = join(dir, '.claude', 'projects', enc, rel)
  mkdirSync(join(f, '..'), { recursive: true })
  writeFileSync(f, `${lines.join('\n')}\n`)
  utimesSync(f, atSec, atSec)
  return f
}
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

describe('Claude 聚合(ccusage 口径)', () => {
  it('总量四项全加;cache 分列;模型桶同口径;标题取首条用户消息', async () => {
    mkClaudeFile('a.jsonl', [
      userLine('帮我修一个布局 bug,谢谢'),
      usageLine('claude-fable-5', '2026-07-29T10:00:00Z', 100, 50, { cacheRead: 7000, cacheWrite: 300 }),
      usageLine('claude-opus-5', '2026-07-30T02:00:00Z', 20, 10)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude).toMatchObject({
      input: 120,
      output: 60,
      cacheRead: 7000,
      cacheWrite: 300,
      total: 7480
    })
    const models = Object.fromEntries(r.global.byModel.map((m) => [m.model, m.total]))
    expect(models['claude-fable-5']).toBe(7450)
    expect(models['claude-opus-5']).toBe(30)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions[0].title).toContain('帮我修一个布局')
    expect(p?.sessions[0].tokens).toBe(7480)
  })

  it('全树扫描:未注册项目的编码目录也计入全局(不再依赖注册表)', async () => {
    mkClaudeFile('x.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)], 1000, '-Users-ghost-unregistered')
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
    // 未注册目录不归属任何项目
    expect(r.perProject.size).toBe(0)
  })

  it('同 message.id+requestId 重复行只计一次,保留 usage 更全的一条', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 5, { id: 'm1', requestId: 'r1' }),
      usageLine('claude-fable-5', '2026-07-30T02:00:01Z', 100, 50, { id: 'm1', requestId: 'r1' })
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(150)
  })

  it('sidechain 重放(同 message.id 新 requestId)跨文件去重,保留非 sidechain', async () => {
    mkClaudeFile('main.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 50, { id: 'm1', requestId: 'r1' })
    ])
    mkClaudeFile('sess/subagents/agent-x.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 100, 50, { id: 'm1', requestId: 'r2', sidechain: true }),
      usageLine('claude-haiku-4-5', '2026-07-30T02:02:00Z', 1000, 200, { id: 'm2', requestId: 'r3', sidechain: true })
    ])
    const r = await engine().build(roots(), [proj])
    // m1 只计一次(150),m2 计入(1200);嵌套文件不产生会话条目
    expect(r.global.bySide.claude.total).toBe(1350)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.tokens.bySide.claude.total).toBe(1350)
    expect(p?.sessions).toHaveLength(1)
  })

  it('无 message.id 的行不去重(照常累加)', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(30)
  })

  it('synthetic 模型:token 计入总量,不进模型桶', async () => {
    mkClaudeFile('a.jsonl', [usageLine('<synthetic>', '2026-07-30T02:00:00Z', 7, 3)])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(10)
    expect(r.global.byModel).toHaveLength(0)
  })

  it('坏行跳过不弃文件', async () => {
    mkClaudeFile('b.jsonl', ['not json {{{', usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
  })
})

describe('Codex 聚合', () => {
  it('取末条 token_count 累计(input 已含 cached,不重复相加);模型取 turn_context;标题经 session_index 映射', async () => {
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
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const e = engine()
    const r1 = await e.build(roots(), [proj])
    const r2 = await new TokenEngine(join(dir, 'cache')).build(roots(), [proj])
    expect(r2.global).toEqual(r1.global)
    expect(existsSync(join(dir, 'cache', 'token-cache.json'))).toBe(true)
    expect(readdirSync(join(dir, 'cache')).filter((f) => f.includes('tmp'))).toHaveLength(0)
  })

  it('源文件变化(mtime/size 变)→ 重算反映新内容', async () => {
    const f = mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)], 1000)
    await engine().build(roots(), [proj])
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

  it('缓存命中时跨文件去重仍生效(去重在聚合层,不在缓存层)', async () => {
    mkClaudeFile('main.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 50, { id: 'm1', requestId: 'r1' })
    ])
    mkClaudeFile('sess/subagents/agent-x.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 100, 50, { id: 'm1', requestId: 'r2', sidechain: true })
    ])
    await engine().build(roots(), [proj])
    const r2 = await new TokenEngine(join(dir, 'cache')).build(roots(), [proj])
    expect(r2.global.bySide.claude.total).toBe(150)
  })
})
