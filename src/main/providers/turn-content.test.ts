import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eachJsonlLine } from './jsonl'
import { makeQuestionIndexer, type QuestionRec } from './question-index'
import { readRanges } from './range-read'
import { turnBlocksFromText } from './turn-content'
import type { TurnBlock } from '@shared/domain'

// ─────────────────────────────────────────────────────────────────────────
// 票 05 立正文模型,票 07 扩全(工具/思考/推理/subagent/未知留痕)。
//
// 规则依据 = 全量枚举(2026-08-05 正文 + 2026-08-06 富内容,CONTEXT 不变量):
// - Claude 2131 文件:顶层 type 全谱 18 种;assistant 段全谱 text/tool_use/thinking
//   (主链 thinking 全库 3312 段全为空,think 块机制保留但当前数据不产生);
//   tool_result 经 tool_use_id 配对(19,711/19,711 全部命中同文件已见 tool_use);
//   **subagent 内部步骤不归位**:四条候选连接键实测全部排除(agentId 两种格式
//   0/225、promptId 0/202、outputFile 指向后台任务输出、prompt 相等 0/1299),
//   零样本不写归组规则——sub 块两侧统一为派发+返回+未归位标注;
//   截断判据 = 正文含 tool-results/ 旁挂路径(49 例,机制性:harness 旁挂目录;
//   "truncated" 字样太泛不作判据)。
// - Codex 296 文件:顶层 7 种;response_item 9 种(调用 input/arguments,出参按
//   call_id 配对恒在);event_msg 15 种;reasoning.summary = [{type:'summary_text',
//   text}](64% 为空数组);agent_reasoning(event_msg)是 reasoning 的镜像,不渲染
//   防双计;spawn_agent 出参无 thread id → 子线程不可归位(2026-08-06 用户裁定:
//   显示派发与返回并标注,不做启发式硬配)。
// ─────────────────────────────────────────────────────────────────────────

const TS = '2026-08-01T10:00:00.000Z'
const AT = Date.parse(TS)

const blocks = (side: 'claude' | 'codex', objs: unknown[]): TurnBlock[] =>
  turnBlocksFromText(side, objs.map((o) => JSON.stringify(o)).join('\n') + '\n')

// ── Claude 行构造器 ──
const cA = (content: unknown[], extra: Record<string, unknown> = {}): unknown => ({
  type: 'assistant',
  timestamp: TS,
  message: { role: 'assistant', content },
  ...extra
})
const cU = (content: unknown[], extra: Record<string, unknown> = {}): unknown => ({
  type: 'user',
  timestamp: TS,
  message: { role: 'user', content },
  ...extra
})

describe('Claude 正文/思考(票 05 行为保持 + think 块)', () => {
  test('text 段出正文块;同行多 text 段合一块;空白不出块', () => {
    expect(blocks('claude', [cA([{ type: 'text', text: '答一' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: '答一' }
    ])
    expect(blocks('claude', [cA([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }])])).toEqual([
      { kind: 'text', role: 'assistant', at: AT, body: 'A\nB' }
    ])
    expect(blocks('claude', [cA([{ type: 'text', text: '  ' }])])).toEqual([])
  })

  test('thinking 段出 think 块,行内顺序 = 思考 → 正文 → 工具', () => {
    const bs = blocks('claude', [
      cA([
        { type: 'thinking', thinking: '想一想' },
        { type: 'text', text: '答案' },
        { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }
      ])
    ])
    expect(bs.map((b) => b.kind)).toEqual(['think', 'text', 'tool'])
    expect(bs[0]).toEqual({ kind: 'think', at: AT, body: '想一想' })
  })
})

describe('Claude 工具块(tool_use ↔ tool_result 按 id 配对)', () => {
  test('配对出入参与返回;摘要一行;未回灌的 output 为 null', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls -la' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: '共 3 个文件' }]),
      cA([{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: '/a.ts' } }])
    ])
    expect(bs).toHaveLength(2)
    const [t1, t2] = bs as Array<Extract<TurnBlock, { kind: 'tool' }>>
    expect(t1.kind).toBe('tool')
    expect(t1.name).toBe('Bash')
    expect(t1.summary).toContain('ls -la')
    expect(t1.input).toContain('ls -la')
    expect(t1.output).toBe('共 3 个文件')
    expect(t1.truncated).toBe(false)
    expect(t2.output).toBeNull()
  })

  test('tool_result 内容为段数组时取 text 段拼接', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Grep', input: { pattern: 'x' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: '命中 1' }, { type: 'text', text: '命中 2' }] }])
    ])
    expect((bs[0] as Extract<TurnBlock, { kind: 'tool' }>).output).toBe('命中 1\n命中 2')
  })

  test('截断判据:返回含 tool-results/ 旁挂路径 → truncated,不谎称完整', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'WebFetch', input: { url: 'https://x' } }]),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: 'output saved to: /Users/x/.claude/projects/-p/s/tool-results/abc.txt\n\nPreview (first 2KB): …' }])
    ])
    expect((bs[0] as Extract<TurnBlock, { kind: 'tool' }>).truncated).toBe(true)
  })
})

describe('Claude subagent 块(派发 + 返回 + 未归位标注;归组零样本不做)', () => {
  test('派发名取 subagent_type;prompt/result 配对;unlinked 恒真(实测无连接键)', () => {
    const bs = blocks('claude', [
      cA([{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { description: '查日志', prompt: '查一下日志', subagent_type: 'debugger' } }]),
      // 轮内的 sidechain 行:与哪次派发对应无稳定引用链,不渲染也不归组
      cA([{ type: 'text', text: '我先看日志文件' }], { isSidechain: true, agentId: 'a1b2c3d4e5f6a7b8c' }),
      cU([{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: '日志干净' }] }], {
        toolUseResult: { agentId: 'ac50856', status: 'completed', prompt: '查一下日志' }
      })
    ])
    expect(bs).toHaveLength(1)
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.kind).toBe('sub')
    expect(sub.name).toBe('debugger')
    expect(sub.prompt).toBe('查一下日志')
    expect(sub.result).toBe('日志干净')
    expect(sub.steps).toEqual([])
    expect(sub.unlinked).toBe(true)
  })

  test('无 subagent_type 时派发名回退工具名;未回灌时 result 为 null', () => {
    const bs = blocks('claude', [cA([{ type: 'tool_use', id: 'tu1', name: 'Task', input: { prompt: '干活' } }])])
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.name).toBe('Task')
    expect(sub.result).toBeNull()
  })

  test('sidechain 行一律不出块也不计未知——已知类型,完整转写在源文件/嵌套文件', () => {
    expect(blocks('claude', [cA([{ type: 'text', text: '子代理的话' }], { isSidechain: true, agentId: 'ag-x' })])).toEqual([])
  })
})

describe('Claude 显示白名单与未知留痕(顶层 18 种全谱)', () => {
  test('known-noise 不渲染也不留痕:system/attachment/file-history-snapshot/mode 等', () => {
    expect(
      blocks('claude', [
        { type: 'system', subtype: 'compact_boundary', timestamp: TS },
        { type: 'attachment', attachment: { type: 'task_reminder' }, timestamp: TS },
        { type: 'file-history-snapshot', messageId: 'x', timestamp: TS },
        { type: 'mode', timestamp: TS },
        { type: 'queue-operation', timestamp: TS }
      ])
    ).toEqual([])
  })

  test('白名单外的新类型留痕:类型名点出、条数累计,置于块序末尾', () => {
    const bs = blocks('claude', [
      cA([{ type: 'text', text: '正文' }]),
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'agent_snapshot', timestamp: TS },
      { type: 'new_thing', timestamp: TS }
    ])
    expect(bs[0].kind).toBe('text')
    expect(bs[bs.length - 1]).toEqual({ kind: 'unknown', count: 3, types: ['agent_snapshot', 'new_thing'] })
  })
})

// ── Codex 行构造器 ──
const xEvent = (payload: Record<string, unknown>): unknown => ({ type: 'event_msg', timestamp: TS, payload })
const xRI = (payload: Record<string, unknown>): unknown => ({ type: 'response_item', timestamp: TS, payload })

describe('Codex 工具块(call_id 配对;input/arguments 两种入参字段)', () => {
  test('custom_tool_call.input 与 function_call.arguments 都认;出参按 call_id 配对', () => {
    const bs = blocks('codex', [
      xRI({ type: 'custom_tool_call', id: 'r1', call_id: 'c1', name: 'exec', input: 'ls -la', status: 'completed' }),
      xRI({ type: 'custom_tool_call_output', call_id: 'c1', output: '3 files' }),
      xRI({ type: 'function_call', id: 'r2', call_id: 'c2', name: 'wait', arguments: '{"ms":100}' }),
      xRI({ type: 'function_call_output', call_id: 'c2', output: 'ok' }),
      xRI({ type: 'tool_search_call', id: 'r3', call_id: 'c3', arguments: '{"q":"read"}', status: 'completed' })
    ])
    expect(bs.map((b) => b.kind)).toEqual(['tool', 'tool', 'tool'])
    const [t1, t2, t3] = bs as Array<Extract<TurnBlock, { kind: 'tool' }>>
    expect(t1.name).toBe('exec')
    expect(t1.input).toBe('ls -la')
    expect(t1.output).toBe('3 files')
    expect(t2.input).toBe('{"ms":100}')
    expect(t2.output).toBe('ok')
    expect(t3.name).toBe('tool_search_call')
    expect(t3.output).toBeNull()
  })

  test('spawn_agent 出 sub 块:unlinked 标注,子线程不归位(2026-08-06 裁定)', () => {
    const bs = blocks('codex', [
      xRI({ type: 'function_call', id: 'r1', call_id: 'c1', name: 'spawn_agent', namespace: 'collaboration', arguments: '{"task_name":"t1"}' }),
      xRI({ type: 'function_call_output', call_id: 'c1', output: '{"agent_id":"x"}' })
    ])
    const sub = bs[0] as Extract<TurnBlock, { kind: 'sub' }>
    expect(sub.kind).toBe('sub')
    expect(sub.name).toBe('spawn_agent')
    expect(sub.prompt).toBe('{"task_name":"t1"}')
    expect(sub.result).toBe('{"agent_id":"x"}')
    expect(sub.steps).toEqual([])
    expect(sub.unlinked).toBe(true)
  })
})

describe('Codex 推理块(reasoning.summary 明文小标题;正文加密不可得)', () => {
  test('summary 非空出 reason 块;空数组不出块(全量枚举 64% 为空)', () => {
    const bs = blocks('codex', [
      xRI({ type: 'reasoning', id: 'r1', summary: [{ type: 'summary_text', text: '**先对比目录**' }, { type: 'summary_text', text: '再看差异' }], encrypted_content: 'gAAA…' }),
      xRI({ type: 'reasoning', id: 'r2', summary: [], encrypted_content: 'gAAA…' })
    ])
    expect(bs).toEqual([{ kind: 'reason', at: AT, titles: ['**先对比目录**', '再看差异'] }])
  })

  test('event_msg/agent_reasoning 是镜像,不出块(防双计)', () => {
    expect(blocks('codex', [xEvent({ type: 'agent_reasoning', text: '小标题' })])).toEqual([])
  })
})

describe('Codex 显示白名单与未知留痕', () => {
  test('known-noise 不留痕:token_count/task_started/turn_context/world_state/双写镜像', () => {
    expect(
      blocks('codex', [
        xEvent({ type: 'token_count', info: {} }),
        xEvent({ type: 'task_started' }),
        xEvent({ type: 'thread_settings_applied' }),
        { type: 'turn_context', timestamp: TS, payload: { model: 'x' } },
        { type: 'world_state', timestamp: TS },
        xRI({ type: 'message', role: 'assistant', content: [] }),
        xRI({ type: 'agent_message', message: '镜像' })
      ])
    ).toEqual([])
  })

  test('三个层级的未知类型都留痕:顶层 / event_msg 载荷 / response_item 载荷', () => {
    const bs = blocks('codex', [
      { type: 'brand_new_top', timestamp: TS },
      xEvent({ type: 'shiny_event' }),
      xRI({ type: 'shiny_item' })
    ])
    expect(bs).toEqual([
      { kind: 'unknown', count: 3, types: ['brand_new_top', 'event_msg/shiny_event', 'response_item/shiny_item'] }
    ])
  })
})

describe('坏行与侧别(票 05 行为保持)', () => {
  test('坏行只自伤;侧别不串', () => {
    const raw = [JSON.stringify(cA([{ type: 'text', text: '好行' }])), '{ 坏行'].join('\n')
    expect(turnBlocksFromText('claude', raw)).toHaveLength(1)
    expect(blocks('codex', [cA([{ type: 'text', text: 'claude 行' }])])).toEqual([{ kind: 'unknown', count: 1, types: ['assistant'] }])
  })
})

// ── 锚测试(票 05 验收保持):按偏移取回的整轮 = 全解析该文件后取对应轮次 ──

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

const uLine = (t: string): string => JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: t } })
const aLine = (t: string): string => JSON.stringify(cA([{ type: 'text', text: t }]))

describe('区间取回与全解析一致(锚)', () => {
  test('每一轮:offset 通路的块 == 整文件切轮通路的对应轮块', async () => {
    const raw = [
      uLine('问一'),
      aLine('答一'),
      JSON.stringify(cA([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }])),
      JSON.stringify(cU([{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }])),
      uLine('问二'),
      aLine('答二')
    ].join('\n') + '\n'
    await withFile(raw, async (file) => {
      const recs = await indexFile(file, 'claude')
      expect(recs).toHaveLength(2)
      const whole = await readRanges(file, recs.map((r) => ({ start: r[1], end: r[2] })))
      for (let i = 0; i < recs.length; i++) {
        const { texts } = await readRanges(file, [{ start: recs[i][1], end: recs[i][2] }])
        expect(turnBlocksFromText('claude', texts[0])).toEqual(turnBlocksFromText('claude', whole.texts[i]))
      }
      // 第一轮:工具已配对(output 就位)
      const t = turnBlocksFromText('claude', whole.texts[0]).find((b) => b.kind === 'tool')
      expect(t && t.kind === 'tool' && t.output).toBe('ok')
    })
  })

  test('单轮取回的读取字节数与文件总大小无关(不用墙钟,票 05 保持)', async () => {
    const turn1 = [uLine('问一'), aLine('答一')].join('\n') + '\n'
    const small = turn1 + [uLine('问二'), aLine('答二')].join('\n') + '\n'
    const big = turn1 + [uLine('问二'), aLine('大'.repeat((5 * 1024 * 1024) / 3))].join('\n') + '\n'
    const bytesOfTurn1 = async (text: string): Promise<number> =>
      withFile(text, async (file) => {
        const recs = await indexFile(file, 'claude')
        const { bytesRead } = await readRanges(file, [{ start: recs[0][1], end: recs[0][2] }])
        return bytesRead
      })
    expect(await bytesOfTurn1(small)).toBe(await bytesOfTurn1(big))
  })
})
