// 票04+修正轮:token 聚合引擎(ccusage 对齐,2026-07-30)——
// 全树扫描(与注册表无关)、message.id+requestId 去重(sidechain 回退)、
// 总量四项全加、synthetic 不入模型桶、流式坏行跳过、增量缓存。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CACHE_VERSION, TokenEngine } from './token-stats'
import { encodeClaudeProjectDir } from './claude'
import { ERR, decodeAppError } from '@shared/errors'
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
function userLine(text: string, tsIso?: string): string {
  return JSON.stringify({ type: 'user', timestamp: tsIso, message: { role: 'user', content: text } })
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
  /** 每轮增量(last_token_usage),按各自时间戳归日 */
  turns: Array<{ input: number; cached: number; output: number; at?: string }>,
  subagent = false,
  atSec = 2000,
  /** 真实提问;传 null 造"无人问过任何东西"的会话(spec A3a) */
  userMsg: string | null = '示例提问'
): string {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  let acc = { input: 0, cached: 0, output: 0 }
  const lines = [
    JSON.stringify({
      timestamp: tsIso,
      type: 'session_meta',
      payload: subagent ? { cwd, thread_source: 'subagent' } : { cwd }
    }),
    JSON.stringify({ timestamp: tsIso, type: 'turn_context', payload: { model, cwd } }),
    ...(userMsg === null
      ? []
      : [JSON.stringify({ timestamp: tsIso, type: 'event_msg', payload: { type: 'user_message', message: userMsg } })]),
    // 真实形状:顶层 type=event_msg,数据在 payload.info(payload.type=token_count)
    ...turns.map((t) => {
      acc = { input: acc.input + t.input, cached: acc.cached + t.cached, output: acc.output + t.output }
      return JSON.stringify({
        timestamp: t.at ?? tsIso,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: t.input,
              cached_input_tokens: t.cached,
              cache_write_input_tokens: 0,
              output_tokens: t.output,
              total_tokens: t.input + t.output
            },
            total_token_usage: {
              input_tokens: acc.input,
              cached_input_tokens: acc.cached,
              cache_write_input_tokens: 0,
              output_tokens: acc.output,
              total_tokens: acc.input + acc.output
            }
          }
        }
      })
    })
  ]
  const f = join(d, file)
  writeFileSync(f, `${lines.join('\n')}\n`)
  utimesSync(f, atSec, atSec)
  return f
}

/**
 * fork 会话:session_meta 带 id/forked_from_id;首行时间戳 = 重放时刻。
 * 形态经真实样本核实(2026-08-02,本机 ~/.codex 里的两个 fork 会话):顶层
 * timestamp/type/payload,payload 含 id + forked_from_id + cwd。真实数据另有
 * session_id / parent_thread_id / thread_source / base_instructions 等字段,
 * 本 fixture 只保留被读取的那些(那些字段各有既有测试覆盖)。
 */
function mkCodexFork(
  file: string,
  cwd: string,
  o: { id: string; parentId: string; forkedAtIso: string },
  model: string,
  turns: Array<{ input: number; cached: number; output: number; at?: string }>,
  atSec = 2000
): string {
  const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(d, { recursive: true })
  const lines = [
    JSON.stringify({
      timestamp: o.forkedAtIso,
      type: 'session_meta',
      payload: { cwd, id: o.id, forked_from_id: o.parentId }
    }),
    JSON.stringify({ timestamp: o.forkedAtIso, type: 'turn_context', payload: { model, cwd } }),
    JSON.stringify({
      timestamp: o.forkedAtIso,
      type: 'event_msg',
      payload: { type: 'user_message', message: 'fork 后的提问' }
    }),
    ...turns.map((t) =>
      JSON.stringify({
        timestamp: t.at ?? o.forkedAtIso,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: t.input,
              cached_input_tokens: t.cached,
              cache_write_input_tokens: 0,
              output_tokens: t.output,
              total_tokens: t.input + t.output
            }
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
      userLine('主会话的提问'),
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

  it('cache_creation 明细优先:存在 ephemeral 明细时取 5m+1h 之和,不用扁平字段', async () => {
    // 实测真实数据(2026-07-13)存在明细与扁平不等的行,ccusage 取明细
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-07-30T02:00:00Z',
      message: {
        id: 'm1',
        model: 'claude-fable-5',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 100,
          cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 507 }
        }
      }
    })
    mkClaudeFile('cc.jsonl', [line])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.cacheWrite).toBe(547)
    expect(r.global.bySide.claude.total).toBe(562)
  })

  it('坏行跳过不弃文件', async () => {
    mkClaudeFile('b.jsonl', ['not json {{{', usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
  })

  // 票 03a:坏行的降级必须**只自伤**——不许连累同一文件里它前后的提问。
  // 活跃会话正写到半行就是这个形态,不是假想。
  it('提问之间夹坏行:该行跳过,前后提问都还在且条数不受影响', async () => {
    mkClaudeFile('mid-bad.jsonl', [
      userLine('第一个提问'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      '{"type":"user","message":{"role":"user","content":"半行写到一', // 半行,解析不出
      userLine('第二个提问'),
      usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 10, 5)
    ])
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.file.endsWith('mid-bad.jsonl'))
    expect(s?.questionCount, '坏行不该吃掉它前后的提问').toBe(2)
    expect(s?.title).toBe('第一个提问')
  })
})

describe('Codex 聚合(ccusage 口径)', () => {
  it('逐轮 last_token_usage 增量累加;input 净化(减 cached)、cached 单列;模型取 turn_context;标题经 session_index', async () => {
    const id = '019fa9a1-380e-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-2026-07-30T00-49-03-${id}.jsonl`, proj, '2026-07-30T00:49:03Z', 'gpt-5.6-sol', [
      { input: 100, cached: 80, output: 10 },
      { input: 400, cached: 320, output: 20 }
    ])
    writeIndex([{ id, name: '迁移 skills' }])
    const r = await engine().build(roots(), [proj])
    // 原 input 合计 500(含 cached 400)→ 净 input 100、cacheRead 400、output 30;total 四项全加 = 530
    expect(r.global.bySide.codex).toMatchObject({ input: 100, output: 30, cacheRead: 400, total: 530 })
    const models = Object.fromEntries(r.global.byModel.map((m) => [`${m.side}:${m.model}`, m.total]))
    expect(models['codex:gpt-5.6-sol']).toBe(530)
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.side === 'codex')?.title).toBe('迁移 skills')
  })

  it('跨天会话按事件时间戳分摊到各自日期(不再整会话堆在首日)', async () => {
    // 用相隔 24h 的两个时间戳,确保在任何本地时区都跨日
    mkCodexRollout('rollout-cross-019f003.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 0, at: '2026-07-29T12:00:00Z' },
      { input: 200, cached: 0, output: 0, at: '2026-07-30T12:00:00Z' }
    ])
    const r = await engine().build(roots(), [proj])
    const byDay = Object.fromEntries(r.global.byDay.map((d) => [d.day, d.codex]))
    expect(Object.keys(byDay).length).toBe(2)
    expect(Object.values(byDay).reduce((a, b) => a + b, 0)).toBe(300)
  })

  it('subagent 会话 token 计入、不进会话列表', async () => {
    mkCodexRollout('rollout-main-019f001.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
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

// 票 session-view/01:两侧 at 语义原本相反(Claude 取最大、Codex 取首个),
// 统一为「文件内最大时间戳」= 最后活动。Codex 侧尤甚——fork 会话的首个
// 时间戳是重放时刻,拿它当活动时间既不是开始也不是结束。
describe('会话 at = 文件内最大时间戳(两侧同义)', () => {
  it('Codex 跨天会话取最后一轮的时间戳,不是首行的', async () => {
    mkCodexRollout('rollout-at-019fb01.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5, at: '2026-07-29T12:00:00Z' },
      { input: 20, cached: 0, output: 5, at: '2026-07-30T18:30:00Z' }
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'codex')
    expect(s?.at).toBe(Date.parse('2026-07-30T18:30:00Z'))
  })

  it('Codex fork 会话的 at 不是重放时刻,而是本会话最后活动', async () => {
    const parentId = '019fa9a1-380e-7af3-af7d-8505cedf1ec2'
    const childId = '019fb0b0-1111-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-parent-${parentId}.jsonl`, proj, '2026-07-28T09:00:00Z', 'gpt-5.6-sol', [
      { input: 100, cached: 0, output: 10, at: '2026-07-28T09:00:00Z' }
    ])
    // 子会话在 07-29 fork:首行时间戳是重放时刻,真正的新活动发生在 07-31
    mkCodexFork(
      `rollout-child-${childId}.jsonl`,
      proj,
      { id: childId, parentId, forkedAtIso: '2026-07-29T09:00:00Z' },
      'gpt-5.6-sol',
      [
        { input: 100, cached: 0, output: 10, at: '2026-07-29T09:00:00Z' }, // 重放父历史
        { input: 50, cached: 0, output: 5, at: '2026-07-31T20:00:00Z' } // 本次新内容
      ]
    )
    const r = await engine().build(roots(), [proj])
    const child = r.perProject
      .get(proj.toLowerCase())
      ?.sessions.filter((x) => x.side === 'codex')
      .find((x) => x.at === Date.parse('2026-07-31T20:00:00Z'))
    expect(child, 'fork 子会话的 at 应为 07-31 最后活动,而非 07-29 重放时刻').toBeDefined()
  })

  it('每条会话带得回源文件(两侧),且指向真实存在的文件', async () => {
    const cl = mkClaudeFile('ident.jsonl', [
      userLine('提问一'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const cx = mkCodexRollout('rollout-ident-019fb02.jsonl', proj, '2026-07-30T03:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5 }
    ])
    const sessions = (await engine().build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    expect(sessions.map((s) => s.file).sort()).toEqual([cl, cx].sort())
    for (const s of sessions) expect(existsSync(s.file), `${s.file} 应存在`).toBe(true)
  })

  it('subagent / 嵌套文件不入列,故不会带出多余的身份', async () => {
    mkClaudeFile('main.jsonl', [userLine('主会话的提问'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    mkClaudeFile('sess/subagents/agent-x.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:01:00Z', 20, 5, { sidechain: true })
    ])
    const sessions = (await engine().build(roots(), [proj])).perProject.get(proj.toLowerCase())?.sessions ?? []
    expect(sessions).toHaveLength(1)
    expect(sessions[0].file.endsWith('main.jsonl')).toBe(true)
  })

  // review 实测发现(2026-08-02):抽样 118 个真实 Claude 会话,53 个(45%)的
  // 最后一行时间戳晚于最后一条 usage 行,最大差 203 秒。根因是**用户消息没有
  // usage 字段**——用户最后问的那句话,按"只看 usage 行"的口径根本看不见。
  it('Claude:末尾是用户消息(无 usage)时,at 取它而不是上一条助手回复', async () => {
    mkClaudeFile('trailing-user.jsonl', [
      userLine('第一问', '2026-07-30T10:00:00Z'),
      usageLine('claude-fable-5', '2026-07-30T10:00:30Z', 10, 5),
      userLine('追问,然后我就走了', '2026-07-30T10:03:53Z')
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'claude')
    expect(s?.at, 'at 应为最后一条用户消息的时间,不是最后一条 usage 行').toBe(
      Date.parse('2026-07-30T10:03:53Z')
    )
  })

  it('Claude:一条 usage 都没有的会话,at 仍取文件内最大时间戳而非退回 mtime', async () => {
    mkClaudeFile('no-usage.jsonl', [userLine('只问了一句就崩了', '2026-07-30T11:22:33Z')], 1000)
    const r = await engine().build(roots(), [proj])
    // 该文件不产生 token,但仍是一条会话
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.title.includes('崩了'))
    expect(s?.at, 'mtime 是 1000 秒(1970),文件内有真实时间戳就不该退回它').toBe(
      Date.parse('2026-07-30T11:22:33Z')
    )
  })

  it('Claude 侧维持最大时间戳语义(回归)', async () => {
    mkClaudeFile('a.jsonl', [
      userLine('第一问'),
      usageLine('claude-fable-5', '2026-07-29T10:00:00Z', 10, 5),
      usageLine('claude-fable-5', '2026-07-31T22:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    const s = r.perProject.get(proj.toLowerCase())?.sessions.find((x) => x.side === 'claude')
    expect(s?.at).toBe(Date.parse('2026-07-31T22:00:00Z'))
  })
})

describe('缓存版本迁移(真 bug 回归)', () => {
  it('旧格式缓存(Codex agg 无 events 字段)不崩,按新结构重算', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    const rollout = mkCodexRollout('rollout-old-019f900.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
      { input: 30, cached: 0, output: 5 }
    ])
    // 手工写入上一版结构的缓存:Codex 条目只有 totals/byDay,没有 events
    mkdirSync(join(dir, 'cache'), { recursive: true })
    const st = statSync(rollout)
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        version: 2,
        files: {
          [rollout]: {
            sig: `${st.mtimeMs}:${st.size}`,
            agg: {
              kind: 'codex',
              projectKey: proj.toLowerCase(),
              listed: true,
              title: '旧格式',
              at: 1,
              model: 'gpt-5.6-sol',
              totals: { input: 999, output: 0, cacheRead: 0, cacheWrite: 0, total: 999 },
              byDay: { '2026-07-30': 999 }
            }
          }
        }
      })
    )
    const r = await engine().build(roots(), [proj])
    // 不崩,且数字来自重算(35)而非旧缓存的 999
    expect(r.global.bySide.codex.total).toBe(35)
    expect(r.global.bySide.claude.total).toBe(15)
  })

  // 假绿防线:改的是"某字段怎么算出来的"而非结构时,签名照样命中、形状照样合法,
  // 旧值会一路流到界面。fixture 用全新缓存必过,存量用户看不到修复。
  //
  // ⚠️ 这条测的是**版本失效机制本身**(上一版的缓存会被拒),不是"作者记得升号"。
  //    后者任何单测都测不到:漏升号在被测代码里**不留任何痕迹**,而 fixture 写的是
  //    `CACHE_VERSION - 1`,版本号无论是几它都比当前小一档,永远匹配不上。
  //    实测确认:把 CACHE_VERSION 从 6 退回 5(模拟漏升),本用例仍然绿。
  //    形状变更那一半由下面的字段集指纹兜住;算法变更那一半只能靠流程(见 spec)。
  it('紧邻上一版的缓存里、结构完全合法但算法已过时的值,不得被沿用', async () => {
    const rollout = mkCodexRollout('rollout-staleat-019f901.jsonl', proj, '2026-07-29T12:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5, at: '2026-07-29T12:00:00Z' },
      { input: 20, cached: 0, output: 5, at: '2026-07-30T18:30:00Z' }
    ])
    const st = statSync(rollout)
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        // 用相对版本号而非字面量:硬编码 3 的话,版本号涨到 6、7 之后这条就退化成
        // 旁边那条"很旧的版本被拒",而"紧邻上一版被拒"没人管——漏升号照样抓不到。
        version: CACHE_VERSION - 1,
        files: {
          [rollout]: {
            sig: `${st.mtimeMs}:${st.size}`,
            // 除版本号外**一切合法**——尤其 file 不能少:isWellFormedAgg 会因缺字段
            // 判它不合格并重算,那样即使版本检查被整个删掉本用例也照样绿,
            // 就测不到"版本号"这个机制本身了。
            agg: {
              kind: 'codex',
              file: rollout,
              projectKey: proj.toLowerCase(),
              listed: true,
              title: 'stale',
              at: Date.parse('2026-07-29T12:00:00Z'),
              model: 'gpt-5.6-sol',
              sessionId: null,
              parentId: null,
              forkedAt: null,
              events: [
                [Date.parse('2026-07-29T12:00:00Z'), 10, 0, 5, 0],
                [Date.parse('2026-07-30T18:30:00Z'), 20, 0, 5, 0]
              ]
            }
          }
        }
      })
    )
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.side === 'codex')
    expect(s?.at, '版本号必须随算法变更一起升,否则旧值被沿用').toBe(Date.parse('2026-07-30T18:30:00Z'))
  })

  // review 发现:isWellFormedAgg 是**同版本内**损坏/漂移的护栏,加了 file 却没加进去。
  // 逃逸面是上层——一条缺 file 的缓存条目会让 SessionMeta.file 为 undefined,
  // 契约校验抛出,整个 getProjectDetail 挂掉(skills/memory/plugins/产物全没了)。
  // 修完后逃逸面降为自伤:该文件重算一次。
  // 版本号必须写 CACHE_VERSION 本身,不能硬编码字面量:写死的那一刻它等于当前版本,
  // 下次升号后 loadCache 会因版本不符先把整份缓存丢掉,该文件照样重算——用例转为
  // **空过**,再也测不到 isWellFormedAgg。(本用例原本写死 5,升到 7 时就已经空过了。)
  it.each([
    // 各行只缺目标字段,其余齐全(含 forkPoints)——缺两个字段的 fixture 会让
    // 守卫少查一条也照样红,测不出目标那条
    ['file', { projectKey: 'X', listed: true, title: '缓存里的陈旧标题', at: 1, questions: [], forkPoints: 0 }],
    ['questions', { file: 'X', projectKey: 'X', listed: true, title: '缓存里的陈旧标题', at: 1, forkPoints: 0 }],
    ['forkPoints(票 06 横幅信号)', { file: 'X', projectKey: 'X', listed: true, title: '缓存里的陈旧标题', at: 1, questions: [] }],
    // 票 03b:记录元数从 6 变 7(加内容指纹)。旧记录读出来第 7 位是 undefined,
    // 而 undefined === undefined 会让 Codex 重放指纹校验恒真、进而盲剥。
    [
      'questions 记录少一位(旧元数)',
      {
        file: 'X',
        projectKey: 'X',
        listed: true,
        title: '缓存里的陈旧标题',
        at: 1,
        forkPoints: 0,
        questions: [[0, 10, 20, 1, 0, 0]]
      }
    ]
  ])('同版本缓存里条目缺 %s → 只重算该文件,不污染整份详情', async (_missing, partial) => {
    const cl = mkClaudeFile('wellformed.jsonl', [
      userLine('x'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const st = statSync(cl)
    mkdirSync(join(dir, 'cache'), { recursive: true })
    const agg = { kind: 'claude', ...partial, entries: [[null, null, 0, 10, 5, 0, 0, 'claude-fable-5', '2026-07-30']] }
    if ('file' in agg) agg.file = cl
    if ('projectKey' in agg) agg.projectKey = proj.toLowerCase()
    writeFileSync(
      join(dir, 'cache', 'token-cache.json'),
      JSON.stringify({
        version: CACHE_VERSION, // 同版本:版本号拦不住它,只能靠 isWellFormedAgg
        files: { [cl]: { sig: `${st.mtimeMs}:${st.size}`, agg } }
      })
    )
    const s = (await engine().build(roots(), [proj])).perProject
      .get(proj.toLowerCase())
      ?.sessions.find((x) => x.side === 'claude')
    expect(s?.file, '缺字段的缓存条目必须被判不合格并重算,不能把 undefined 放行到契约层').toBe(cl)
    // 断言重算真的发生了:缓存里放的是哨兵标题,真解析出来的是 userLine 的内容。
    // 没有这一条,"条目被判不合格"与"缓存压根没命中"两种情形在结果上无从分辨。
    expect(s?.title, '必须是重新解析出的标题,不是缓存里那个').toBe('x')
  })

  // 形状变更漏升号的唯一自动防线:字段集变了这条就红,作者被迫顺带想一下版本号。
  // 断言对象取**落盘的缓存**——它正是版本号要保护的那个东西,不是旁路。
  // 覆盖面写明:只管字段增删,不管某字段的算法变更(那种不改字段集,指纹照旧)。
  it('FileAgg 字段集变化必须被察觉(形状变更是漏升号唯一测得到的一半)', async () => {
    mkClaudeFile('shape.jsonl', [
      userLine('提问'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    mkCodexRollout('rollout-shape-019fd01.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol', [
      { input: 10, cached: 0, output: 5 }
    ])
    await engine().build(roots(), [proj])
    const cache = JSON.parse(readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')) as {
      files: Record<string, { agg: Record<string, unknown> }>
    }
    const keysOf = (kind: string): string[] => {
      const hit = Object.values(cache.files).find((f) => f.agg['kind'] === kind)
      expect(hit, `缓存里应有 ${kind} 条目`).toBeDefined()
      return Object.keys((hit as { agg: Record<string, unknown> }).agg).sort()
    }
    expect(keysOf('claude')).toEqual([
      'at', 'entries', 'file', 'forkPoints', 'kind', 'listed', 'projectKey', 'questions', 'title'
    ])
    expect(keysOf('codex')).toEqual([
      'at', 'events', 'file', 'forkedAt', 'kind', 'listed', 'model', 'parentId', 'projectKey', 'questions', 'sessionId', 'title', 'titleFromThread'
    ])
  })

  // 票 03a 的立票前提(spec D2a):索引**只存偏移,连截断预览都不存**。
  // 理由是全库进每次启动都读的缓存里,提问文本占全文约 9.5%,是 MB 级负担。
  // 没有这道断言,后人"顺手存个预览方便搜索"不会红——那正是这条决定要防的事。
  it('缓存里不含任何提问文本(只存偏移)', async () => {
    const uniq = '独一无二的提问文本CANARY7391'
    mkClaudeFile('notext.jsonl', [
      userLine(uniq),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    await engine().build(roots(), [proj])
    const raw = readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')
    const cache = JSON.parse(raw) as { files: Record<string, { agg: Record<string, unknown> }> }
    const hit = Object.values(cache.files).find((f) => String(f.agg['file']).endsWith('notext.jsonl'))
    // 先证明这条真进了缓存,否则下面的"找不到文本"是空过
    expect(hit, '该文件应在缓存里').toBeDefined()
    expect((hit as { agg: Record<string, unknown> }).agg['questions']).toHaveLength(1)
    // title 是设计上要存的(会话列表要显示),提问**正文**不存;
    // 这里用一段只出现在提问里、不会成为标题以外任何东西的串来判定。
    const questionsJson = JSON.stringify((hit as { agg: Record<string, unknown> }).agg['questions'])
    expect(questionsJson, '索引里出现了提问文本').not.toContain('CANARY')
    expect(questionsJson, '索引应当只有数字与 null').toMatch(/^\[\[[\d,\s.enull-]*\]\]$/)
  })

  it('缓存文件是垃圾内容时不崩,全量重算', async () => {
    mkClaudeFile('a.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)])
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(join(dir, 'cache', 'token-cache.json'), '{"version":3,"files":{"x":{"sig":"1:1","agg":{"kind":"claude"}}}}')
    const r = await engine().build(roots(), [proj])
    expect(r.global.bySide.claude.total).toBe(15)
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

describe('归档行输出(供 UsageArchive 持久化)', () => {
  it('build 产出 天×侧×项目×模型 的行,与 byDay 合计一致;liveDays 为本次可见的天', async () => {
    mkClaudeFile('a.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5),
      usageLine('claude-opus-5', '2026-07-30T03:00:00Z', 20, 10)
    ])
    mkCodexRollout('rollout-r-019f100.jsonl', proj, '2026-07-30T04:00:00Z', 'gpt-5.6-sol', [
      { input: 40, cached: 0, output: 0 }
    ])
    const r = await engine().build(roots(), [proj])
    // 行覆盖两侧、两个 Claude 模型
    const sides = new Set(r.rows.map((x) => x.side))
    expect(sides).toEqual(new Set(['claude', 'codex']))
    const models = new Set(r.rows.filter((x) => x.side === 'claude').map((x) => x.model))
    expect(models).toEqual(new Set(['claude-fable-5', 'claude-opus-5']))
    // 行合计 == 全局合计
    const rowTotal = r.rows.reduce((s, x) => s + x.total, 0)
    expect(rowTotal).toBe(r.global.bySide.claude.total + r.global.bySide.codex.total)
    // 项目归属带上
    expect(r.rows.every((x) => x.projectKey === proj.toLowerCase())).toBe(true)
    // liveDays 非空且包含行里的天
    expect(r.liveDays.size).toBeGreaterThan(0)
    for (const x of r.rows) expect(r.liveDays.has(x.day)).toBe(true)
  })
})

// 票 session-view/02:标题剥噪声 + 无真实提问的会话不入列(spec A3a/A4)。
// 噪声形态取自真实采样(297 个会话:Warmup 188、cron 92、caveat 13、slash 2),
// 不是照调研期清单造的。
describe('会话标题与入列口径', () => {
  it('Claude:只有 Warmup 的会话不入列,但 token 照计', async () => {
    mkClaudeFile('warm.jsonl', [
      userLine('Warmup'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 100, 50)
    ])
    mkClaudeFile('real.jsonl', [
      userLine('帮我看下这个 bug'),
      usageLine('claude-fable-5', '2026-07-30T03:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.map((s) => s.title)).toEqual(['帮我看下这个 bug'])
    // 预热会话的 token 一分不少(与 subagent 同口径)
    expect(p?.tokens.bySide.claude.total).toBe(165)
    expect(r.global.bySide.claude.total).toBe(165)
  })

  it('Claude:噪声连着好几条时继续往后找,标题取第一条真实提问', async () => {
    mkClaudeFile('noisy.jsonl', [
      userLine('<local-command-caveat>Caveat: …</local-command-caveat>'),
      userLine('<command-name>/clear</command-name> <command-message>clear</command-message> <command-args></command-args>'),
      userLine('继续会话查看功能:读 spec'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions[0].title).toBe('继续会话查看功能:读 spec')
  })

  it('Claude:cron 会话入列,标题是方括号后面的真实指令', async () => {
    mkClaudeFile('cron.jsonl', [
      userLine('[cron:95a214a4-0021-44ea-a831-f5c851b11d77 hackernews-daily-top5] 取今日最热门的 5 个话题'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 10, 5)
    ])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions[0].title).toBe('取今日最热门的 5 个话题')
  })

  it('Codex:没有 user_message 的会话不入列,token 照计', async () => {
    mkCodexRollout('rollout-nouser-019fc01.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol',
      [{ input: 100, cached: 0, output: 20 }], false, 2000, null)
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.filter((s) => s.side === 'codex')).toHaveLength(0)
    expect(p?.tokens.bySide.codex.total).toBe(120)
  })

  it('Codex:thread_name 优先于首条提问', async () => {
    const id = '019fc0a2-380e-7af3-af7d-8505cedf1ec2'
    mkCodexRollout(`rollout-named-${id}.jsonl`, proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000, '首条提问原文')
    writeIndex([{ id, name: '线程名' }])
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.side === 'codex')?.title).toBe('线程名')
  })

  it('Codex:无 thread_name 时退回首条真实提问(噪声同样剥)', async () => {
    mkCodexRollout('rollout-unnamed-019fc03.jsonl', proj, '2026-07-30T01:00:00Z', 'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }], false, 2000,
      '[cron:abc daily] 每天跑一遍回归')
    const r = await engine().build(roots(), [proj])
    expect(r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.side === 'codex')?.title).toBe('每天跑一遍回归')
  })

  // 03 回溯 review R1:retitle 只该在"原标题来自首条提问"时重起;
  // thread_name 的优先级(spec A4)不因剥离而失效。
  it('Codex:剥过前缀的 fork 有 thread_name 时,标题仍是 thread_name,不被存活首问顶掉', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000011'
    const CHILD = '019f0000-bbbb-7000-8000-000000000012'
    writeFileSync(
      join(d, `rollout-${PARENT}.jsonl`),
      [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n'
    )
    writeFileSync(
      join(d, `rollout-${CHILD}.jsonl`),
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', '父问一'), // 重放(时间戳被改写,内容相同)
        q('2026-07-30T02:00:05Z', '子的新问')
      ].join('\n') + '\n'
    )
    writeIndex([{ id: CHILD, name: 'fork 线程名' }])
    const r = await engine().build(roots(), [proj])
    const child = r.perProject.get(proj.toLowerCase())?.sessions.find((s) => s.forkState === 'stripped')
    expect(child, '剥离过的子会话应在列(还有存活提问)').toBeDefined()
    expect(child?.title, 'thread_name 优先(A4),retitle 不得顶掉它').toBe('fork 线程名')
  })

  // 03 回溯 review R3(2026-08-05 用户裁定):已验证剥空(纯重放、指纹全段吻合、
  // 无新提问)的 fork 不入列,token 照计——与 A3a「没有可找的提问就不入列」同构。
  // 剥空只能出自指纹校验路径:启发式绝不剥空,子会话本就没提问时 listed 在解析期已 false。
  it('Codex:纯重放 fork(已验证剥空)不入列,token 照计', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const usage = (ts: string, input: number, output: number): string =>
      JSON.stringify({
        timestamp: ts,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: { input_tokens: input, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: output, total_tokens: input + output } }
        }
      })
    const PARENT = '019f0000-aaaa-7000-8000-000000000021'
    const CHILD = '019f0000-bbbb-7000-8000-000000000022'
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(
      join(d, `rollout-${PARENT}.jsonl`),
      [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n'
    )
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', '父问一'), // 全部提问都是重放,fork 后没产生新提问
        usage('2026-07-30T02:00:01Z', 100, 20)
      ].join('\n') + '\n'
    )
    const r = await engine().build(roots(), [proj])
    const p = r.perProject.get(proj.toLowerCase())
    expect(p?.sessions.find((s) => s.file === childFile), '剥空的 fork 不该入列').toBeUndefined()
    expect(p?.sessions.filter((s) => s.side === 'codex'), '父会话照常在列').toHaveLength(1)
    expect(p?.tokens.bySide.codex.total, '不入列不等于不计 token').toBe(120)
  })
})

// ── 票 04:sessionQuestions(会话页服务:签名校验 / 单文件重建 / 剥离同源)──
import { appendFileSync } from 'node:fs'

describe('sessionQuestions(会话页服务)', () => {
  it('签名一致:直接用缓存索引,给出侧别/条数/forkState', async () => {
    const cl = mkClaudeFile('sq.jsonl', [
      userLine('问一', '2026-07-30T02:00:00Z'),
      usageLine('claude-fable-5', '2026-07-30T02:00:10Z', 10, 5),
      userLine('问二', '2026-07-30T03:00:00Z')
    ])
    const e = engine()
    await e.build(roots(), [proj])
    const r = await e.sessionQuestions(roots(), cl)
    expect(r.side).toBe('claude')
    expect(r.questions).toHaveLength(2)
    expect(r.forkState).toBe('none')
  })

  it('签名变了:只重建该文件的索引,并把新索引回写缓存(落盘可见)', async () => {
    const cl = mkClaudeFile('sq2.jsonl', [userLine('问一', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    appendFileSync(cl, userLine('问二', '2026-07-30T04:00:00Z') + '\n') // size 变 → 签名不符
    const r = await e.sessionQuestions(roots(), cl)
    expect(r.questions, '重建后应看到追加的提问').toHaveLength(2)
    // 回写断言:落盘缓存里该文件的索引与签名都已更新——这是"下次不用再重建"的证据
    const cache = JSON.parse(readFileSync(join(dir, 'cache', 'token-cache.json'), 'utf8')) as {
      files: Record<string, { sig: string; agg: { questions: unknown[] } }>
    }
    expect(cache.files[cl].agg.questions).toHaveLength(2)
    const st = statSync(cl)
    expect(cache.files[cl].sig).toBe(`${st.mtimeMs}:${st.size}`)
  })

  it('codex fork:剥离与列表同源(stripped + 只剩新提问)', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000001'
    const CHILD = '019f0000-bbbb-7000-8000-000000000002'
    const parentFile = join(d, `rollout-${PARENT}.jsonl`)
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    writeFileSync(parentFile, [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n')
    writeFileSync(
      childFile,
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', '父问一'), // 重放(时间戳被改写,内容相同)
        q('2026-07-30T02:00:05Z', '子的新问')
      ].join('\n') + '\n'
    )
    const e = engine()
    await e.build(roots(), [proj])
    const r = await e.sessionQuestions(roots(), childFile)
    expect(r.side).toBe('codex')
    expect(r.forkState).toBe('stripped')
    expect(r.questions).toHaveLength(1)
  })

  // 票 05:isFresh 是渲染层"要不要展示重建中间态"的判据(只读谓词,不触发重建)
  it('isFresh:构建后为真;文件被追加后为假;未知/已删文件为假', async () => {
    const cl = mkClaudeFile('fresh.jsonl', [userLine('问', '2026-07-30T02:00:00Z')])
    const e = engine()
    await e.build(roots(), [proj])
    expect(e.isFresh(cl)).toBe(true)
    appendFileSync(cl, userLine('又一问', '2026-07-30T03:00:00Z') + '\n')
    expect(e.isFresh(cl), '追加后签名不符,应为假').toBe(false)
    expect(e.isFresh(join(dir, 'nope.jsonl')), '不在索引中的文件为假').toBe(false)
    const gone = mkClaudeFile('fresh-gone.jsonl', [userLine('问', '2026-07-30T02:00:00Z')])
    await e.build(roots(), [proj])
    rmSync(gone)
    expect(e.isFresh(gone), '文件已删为假').toBe(false)
  })

  // 票 06:横幅数据面——claude 分叉处数;codex stripped 时带父标题与父文件
  it('claude 有分叉:sessionQuestions 给出 forkPoints;线性会话为 0', async () => {
    const q = (u: string, p: string | null, t: string): string =>
      JSON.stringify({ type: 'user', uuid: u, parentUuid: p, timestamp: '2026-07-30T02:00:00Z', message: { role: 'user', content: t } })
    const a = (u: string, p: string): string =>
      JSON.stringify({ type: 'assistant', uuid: u, parentUuid: p, timestamp: '2026-07-30T02:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } })
    const forked = mkClaudeFile('forked.jsonl', [q('u1', null, '问一'), a('a1', 'u1'), q('u2b', 'a1', '走岔的'), q('u2', 'a1', '问二')])
    const linear = mkClaudeFile('linear.jsonl', [q('v1', null, '问一'), a('b1', 'v1'), q('v2', 'b1', '问二')])
    const e = engine()
    await e.build(roots(), [proj])
    expect((await e.sessionQuestions(roots(), forked)).forkPoints).toBe(1)
    expect((await e.sessionQuestions(roots(), linear)).forkPoints).toBe(0)
  })

  it('codex stripped fork:带父会话标题与父文件;孤儿 fork 两者为 null', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000031'
    const CHILD = '019f0000-bbbb-7000-8000-000000000032'
    const ORPHAN = '019f0000-cccc-7000-8000-000000000033'
    const parentFile = join(d, `rollout-${PARENT}.jsonl`)
    const childFile = join(d, `rollout-${CHILD}.jsonl`)
    const orphanFile = join(d, `rollout-${ORPHAN}.jsonl`)
    writeFileSync(parentFile, [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', '父问一')].join('\n') + '\n')
    writeFileSync(
      childFile,
      [meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }), q('2026-07-30T02:00:00Z', '父问一'), q('2026-07-30T02:00:05Z', '子的新问')].join('\n') + '\n'
    )
    writeFileSync(
      orphanFile,
      [meta('2026-07-30T03:00:00Z', ORPHAN, { forked_from_id: '019f0000-dead-7000-8000-000000000099' }), q('2026-07-30T03:00:00Z', '孤儿的问')].join('\n') + '\n'
    )
    const e = engine()
    await e.build(roots(), [proj])
    const child = await e.sessionQuestions(roots(), childFile)
    expect(child.forkState).toBe('stripped')
    expect(child.forkParentTitle).toBe('父问一')
    expect(child.forkParentFile).toBe(parentFile)
    const orphan = await e.sessionQuestions(roots(), orphanFile)
    expect(orphan.forkState).toBe('uncertain')
    expect(orphan.forkParentTitle).toBeNull()
    expect(orphan.forkParentFile).toBeNull()
    // claude 侧无父概念,恒 null;forkPoints 对 codex 恒 0
    expect(child.forkPoints).toBe(0)
  })

  it('缓存里有、文件却被删了:明确报错,不静默空列表(维度1 补:spec 失败路径)', async () => {
    const cl = mkClaudeFile('gone.jsonl', [userLine('问'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    const e = engine()
    await e.build(roots(), [proj])
    rmSync(cl)
    // 断言**错误码**而不是中文措辞:措辞已交给渲染层按语言生成(ADR-0015)
    await expect(e.sessionQuestions(roots(), cl)).rejects.toSatisfy(
      (err: unknown) => decodeAppError(err)?.code === ERR.sessionFileUnreadable
    )
  })

  it('不在缓存里的文件:拒绝(调用方引导刷新),不静默空列表', async () => {
    const e = engine()
    await e.build(roots(), [proj])
    await expect(e.sessionQuestions(roots(), join(dir, 'nope.jsonl'))).rejects.toThrow()
  })

  it('build 顺带产出会话读白名单:listed 与 subagent/嵌套文件都在,其余不在', async () => {
    const cl = mkClaudeFile('wl.jsonl', [userLine('问'), usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    // 嵌套(subagent 转写):listed=false,但 07 要展开它 → 必须进白名单
    const nested = mkClaudeFile('sub/agent-x.jsonl', [usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)])
    const e = engine()
    const t = await e.build(roots(), [proj])
    expect(t.sessionFiles.has(cl)).toBe(true)
    expect(t.sessionFiles.has(nested)).toBe(true)
  })

  it('未注册项目的会话不进白名单——读端不宽于 UI 可达面(spec A2,review 收窄)', async () => {
    // 未注册:编码目录不在 claudePaths 映射里 → projectKey=''
    const orphan = mkClaudeFile('orphan.jsonl', [
      userLine('未注册项目里的提问'),
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)
    ], 1000, '-Users-nobody-unregistered')
    const orphanNested = mkClaudeFile('sub/agent-o.jsonl', [
      usageLine('claude-fable-5', '2026-07-30T02:00:00Z', 1, 1)
    ], 1000, '-Users-nobody-unregistered')
    const e = engine()
    const t = await e.build(roots(), [proj])
    expect(t.sessionFiles.has(orphan), '未注册项目的入列会话不该可读').toBe(false)
    expect(t.sessionFiles.has(orphanNested), '未注册项目的嵌套转写同样不该可读').toBe(false)
    // codex 侧的"未注册"不体现在 projectKey(它是 cwd 直接算的,恒非空)——
    // 必须按显式注册集过滤,claude 那套 ''-判据在这侧是假守卫
    const cxOrphan = mkCodexRollout(
      'rollout-orphan-019f9999-aaaa-7000-8000-000000000009.jsonl',
      join(dir, 'not-registered-proj'),
      '2026-07-30T01:00:00Z',
      'gpt-5.6-sol',
      [{ input: 10, cached: 0, output: 5 }]
    )
    const t2 = await engine().build(roots(), [proj], new Set([proj.toLowerCase()]))
    expect(t2.sessionFiles.has(cxOrphan), '未注册 cwd 的 codex 会话不该可读').toBe(false)
  })
})
