import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eachJsonlLine } from './jsonl'
import { makeQuestionIndexer, type QuestionRec } from './question-index'
import { readRanges } from './range-read'
import { turnBlockAt, turnBlocksFromText, type TurnBlock } from './turn-content'

// ─────────────────────────────────────────────────────────────────────────
// 票 05:两侧归一化为公共消息模型,本票只做正文(text 块;工具/推理归 07)。
//
// 规则依据 = 全量枚举(2026-08-05,CONTEXT 不变量「形态集合必须全量枚举」):
// - Codex 296 文件 / 65,583 行:正文载体是 event_msg/agent_message(8005 条,
//   payload.message 恒为 string;字段形态两种——{message,type} × 1、
//   {memory_citation,message,phase,type} × 8004)。response_item/message 不用,
//   与「双写流二选一取 event_msg」同一决策(user_message 侧已用同规则)。
// - Claude 1859 文件:主链 assistant 行 content 段类型全谱只有
//   tool_use 13868 / text 9714 / thinking 3079 三种——正文 = text 段。
// ─────────────────────────────────────────────────────────────────────────

const TS = '2026-08-01T10:00:00.000Z'

describe('turnBlockAt(Claude 侧)', () => {
  test('assistant 行的 text 段成正文块,时间取行时间戳', () => {
    const obj = {
      type: 'assistant',
      timestamp: TS,
      message: { role: 'assistant', content: [{ type: 'text', text: '这是回答' }] }
    }
    expect(turnBlockAt('claude', obj)).toEqual([
      { kind: 'text', role: 'assistant', at: Date.parse(TS), body: '这是回答' }
    ])
  })

  test('thinking 与 tool_use 段本票不出块(归 07),text 段照常', () => {
    // 真实形态:同一条 assistant 消息内三种段混排(全量枚举的全谱就这三种)
    const obj = {
      type: 'assistant',
      timestamp: TS,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '想一想' },
          { type: 'text', text: '答案在此' },
          { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }
        ]
      }
    }
    const blocks = turnBlockAt('claude', obj)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].body).toBe('答案在此')
  })

  test('sidechain 的 assistant 行不出正文——那是 subagent 的话,不是主线回答', () => {
    const obj = {
      type: 'assistant',
      timestamp: TS,
      isSidechain: true,
      agentId: 'a1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'subagent 说的' }] }
    }
    expect(turnBlockAt('claude', obj)).toEqual([])
  })

  test('同条消息多个 text 段合成一块,段间换行', () => {
    const obj = {
      type: 'assistant',
      timestamp: TS,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: '第一段' },
          { type: 'text', text: '第二段' }
        ]
      }
    }
    expect(turnBlockAt('claude', obj)).toEqual([
      { kind: 'text', role: 'assistant', at: Date.parse(TS), body: '第一段\n第二段' }
    ])
  })

  test('非 assistant 行(user/工具回灌/system)一律不出块', () => {
    expect(turnBlockAt('claude', { type: 'user', message: { role: 'user', content: '追问' } })).toEqual([])
    expect(
      turnBlockAt('claude', {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] }
      })
    ).toEqual([])
    expect(turnBlockAt('claude', { type: 'system', subtype: 'compact_boundary' })).toEqual([])
  })

  test('text 段为空白 / 无时间戳:空白不出块;无时间戳 at 为 null', () => {
    expect(
      turnBlockAt('claude', { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '  ' }] } })
    ).toEqual([])
    expect(
      turnBlockAt('claude', { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '有话' }] } })
    ).toEqual([{ kind: 'text', role: 'assistant', at: null, body: '有话' }])
  })
})

describe('turnBlockAt(Codex 侧)', () => {
  test('event_msg/agent_message 成正文块;两种真实字段形态都认', () => {
    // 形态 1(全量枚举 ×1):只有 message,type
    expect(
      turnBlockAt('codex', { type: 'event_msg', timestamp: TS, payload: { type: 'agent_message', message: '回答甲' } })
    ).toEqual([{ kind: 'text', role: 'assistant', at: Date.parse(TS), body: '回答甲' }])
    // 形态 2(×8004):带 memory_citation/phase
    expect(
      turnBlockAt('codex', {
        type: 'event_msg',
        timestamp: TS,
        payload: { type: 'agent_message', message: '回答乙', memory_citation: null, phase: 'final' }
      })
    ).toEqual([{ kind: 'text', role: 'assistant', at: Date.parse(TS), body: '回答乙' }])
  })

  test('其他 event_msg 载荷不出块:reasoning 小标题/token_count/task_* 都不是正文', () => {
    for (const p of [
      { type: 'agent_reasoning', text: '小标题' },
      { type: 'token_count', info: {} },
      { type: 'task_started' },
      { type: 'user_message', message: '这是提问不是回答' }
    ]) {
      expect(turnBlockAt('codex', { type: 'event_msg', timestamp: TS, payload: p })).toEqual([])
    }
  })

  test('response_item 一路不出正文(双写流二选一,与提问侧同一决策)', () => {
    const obj = {
      type: 'response_item',
      timestamp: TS,
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '镜像' }] }
    }
    expect(turnBlockAt('codex', obj)).toEqual([])
  })

  test('message 非 string 不出块(fail-closed,不猜形状)', () => {
    expect(
      turnBlockAt('codex', { type: 'event_msg', timestamp: TS, payload: { type: 'agent_message', message: 42 } })
    ).toEqual([])
  })

  test('侧别不串:Claude 行喂给 Codex 规则不出块,反之亦然', () => {
    const cl = { type: 'assistant', timestamp: TS, message: { role: 'assistant', content: [{ type: 'text', text: 'x' }] } }
    const cx = { type: 'event_msg', timestamp: TS, payload: { type: 'agent_message', message: 'y' } }
    expect(turnBlockAt('codex', cl)).toEqual([])
    expect(turnBlockAt('claude', cx)).toEqual([])
  })
})

describe('turnBlocksFromText(整轮原始文本 → 块序列)', () => {
  test('多行文本逐行出块,顺序保持;坏行只自伤不断链', () => {
    const lines = [
      JSON.stringify({ type: 'assistant', timestamp: TS, message: { role: 'assistant', content: [{ type: 'text', text: '先说一' }] } }),
      '{ 这行坏了',
      JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] } }),
      JSON.stringify({ type: 'assistant', timestamp: TS, message: { role: 'assistant', content: [{ type: 'text', text: '再说二' }] } })
    ]
    const blocks = turnBlocksFromText('claude', lines.join('\n') + '\n')
    expect(blocks.map((b) => b.body)).toEqual(['先说一', '再说二'])
  })
})

// ── 锚测试(票 05 验收):按偏移取回的整轮 = 全解析该文件后取对应轮次 ──

function withFile<T>(text: string, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'turn-'))
  const file = join(dir, 's.jsonl')
  writeFileSync(file, text)
  return fn(file).finally(() => rmSync(dir, { recursive: true, force: true }))
}

async function indexFile(file: string, side: 'claude' | 'codex'): Promise<QuestionRec[]> {
  const idx = makeQuestionIndexer(side)
  let fileEnd = 0
  await eachJsonlLine(file, (obj, start, end) => {
    idx.line(obj, start, end)
    fileEnd = end
  })
  return idx.done(fileEnd)
}

const cU = (t: string): string => JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: t } })
const cA = (t: string): string =>
  JSON.stringify({ type: 'assistant', timestamp: TS, message: { role: 'assistant', content: [{ type: 'text', text: t }] } })

describe('区间取回与全解析一致(锚)', () => {
  test('每一轮:offset 通路的块 == 全解析通路的对应轮块', async () => {
    const raw = [cU('问一'), cA('答一 A'), cA('答一 B'), cU('问二'), cA('答二')].join('\n') + '\n'
    await withFile(raw, async (file) => {
      const recs = await indexFile(file, 'claude')
      expect(recs).toHaveLength(2)
      // 全解析口径:逐行 turnBlockAt,按轮次区间归组
      const allBlocks: TurnBlock[][] = recs.map(() => [])
      await eachJsonlLine(file, (obj, start) => {
        const t = recs.findIndex((r) => start >= r[1] && start < r[2])
        if (t !== -1) allBlocks[t].push(...turnBlockAt('claude', obj as Record<string, unknown>))
      })
      // offset 通路:readRanges 只读该轮区间
      for (let i = 0; i < recs.length; i++) {
        const { texts } = await readRanges(file, [{ start: recs[i][1], end: recs[i][2] }])
        expect(turnBlocksFromText('claude', texts[0])).toEqual(allBlocks[i])
      }
    })
  })

  test('单轮取回的读取字节数 = 该轮区间宽度,与文件总大小无关(不用墙钟)', async () => {
    const turn1 = [cU('问一'), cA('答一')].join('\n') + '\n'
    const small = turn1 + [cU('问二'), cA('答二')].join('\n') + '\n'
    // 同样的第一轮 + 一条巨大的后续轮(约 5MB):第一轮的 bytesRead 必须与文件大小无关
    const big = turn1 + [cU('问二'), cA('大'.repeat(5 * 1024 * 1024 / 3))].join('\n') + '\n'
    const bytesOfTurn1 = async (text: string): Promise<number> =>
      withFile(text, async (file) => {
        const recs = await indexFile(file, 'claude')
        const { bytesRead } = await readRanges(file, [{ start: recs[0][1], end: recs[0][2] }])
        return bytesRead
      })
    const a = await bytesOfTurn1(small)
    const b = await bytesOfTurn1(big)
    expect(a).toBe(b) // 同一轮,读取字节数完全一致
    expect(b).toBeLessThan(Buffer.byteLength(turn1) + 64) // 且只有该轮那么大
  })
})
