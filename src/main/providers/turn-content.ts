// 轮次内容归一化(票 05 立正文,票 07 扩全):把整轮区间里两侧各自的原始行,
// 统一成公共消息模型(TurnBlock),渲染层只认这个模型,不各写一套。
//
// 规则依据 = 全量枚举(2026-08-05/06,CONTEXT 不变量「形态集合必须全量枚举」):
// - Claude(2131 文件):顶层 type 全谱 18 种(KNOWN 集);assistant 段全谱
//   text/tool_use/thinking(主链 thinking 全库 3312 段**全部为空**,只有 signature
//   占位——明文思考正文不落主链,think 块机制保留但当前数据不产生);
//   tool_result 按 tool_use_id 配对(19,711/19,711 命中)。
//   **subagent 内部步骤不归位**(2026-08-06 实测):四条候选连接键全部排除——
//   toolUseResult.agentId(7 位)与 sidechain.agentId(17 位)不同名空间 0/225 命中;
//   dispatch 行无 promptId(0/202);outputFile 指向后台任务输出非转写;sidechain
//   首行文本与 dispatch prompt 相等 0/1299。零样本不写归组规则(CONTEXT 不变量),
//   sub 块两侧统一:派发入参 + 返回 + 未归位标注,sidechain 行不渲染(已知类型,
//   其完整转写在源文件/嵌套文件中)。
//   截断判据 = 返回文本含 tool-results/ 旁挂路径(机制性:harness 旁挂目录;
//   spec C7 原记"无引用链"经实测修正——路径存在,但旁挂文件不进读白名单,
//   只展示截断版并标注,2026-08-06 用户裁定)。
// - Codex(296 文件):顶层 7 种;response_item 9 种——调用入参在
//   custom_tool_call.input / function_call.arguments / tool_search_call.arguments,
//   出参按 call_id 配对(恒在);reasoning.summary = [{type:'summary_text',text}]
//   明文小标题(64% 为空,空不出块),正文 encrypted_content 永不可得(spec C6);
//   event_msg 15 种,正文取 agent_message,agent_reasoning 是 reasoning 的镜像
//   不渲染防双计;spawn_agent 出参无 thread id → 子线程不可归位,sub 块标
//   unlinked(2026-08-06 用户裁定,不做启发式硬配)。
// - 白名单外的未知类型一律留痕(unknown 块,置于块序末尾)——spec C8:
//   白名单类失败不可见,绝不静默丢(CONTEXT 不变量「按失败方向定严格度」)。
import type { AgentSide, TurnBlock, TurnSubBlock, TurnToolBlock } from '@shared/domain'
import { CLAUDE_DISPATCH } from './question-index'

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

function atOf(obj: Record<string, unknown>): number | null {
  const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
  return Number.isNaN(ts) ? null : ts
}

/** 折叠态一行摘要:首行、限长 */
function oneLine(s: string, max = 88): string {
  const t = s.split('\n')[0].trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** 工具入参对象 → 展示文本(对象序列化;已是字符串则原样) */
function inputText(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === undefined || v === null) return ''
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

/** Claude tool_result 内容 → 文本(string 或 text 段数组;其余形态序列化兜底) */
function resultText(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    return v
      .map((s) => asRecord(s)?.['text'])
      .filter((t): t is string => typeof t === 'string')
      .join('\n')
  }
  return inputText(v)
}

/** 截断判据:harness 把超限原文旁挂到 tool-results/ 并在正文留路径(机制性) */
const TRUNC_MARK = 'tool-results/'

// ── Claude 顶层 type 全谱(2026-08-06 全量枚举 2131 文件,18 种)──
// assistant/user 是内容载体;其余 16 种为 known-noise:不渲染、不留痕。
const CLAUDE_KNOWN = new Set([
  'assistant',
  'user',
  'attachment',
  'system',
  'ai-title',
  'last-prompt',
  'mode',
  'permission-mode',
  'queue-operation',
  'file-history-snapshot',
  'pr-link',
  'bridge-session',
  'file-history-delta',
  'relocated',
  'worktree-state',
  'started',
  'result',
  'frame-link'
])

// ── Codex 三层全谱(2026-08-05/06 全量枚举 296 文件)──
const CODEX_TOP_KNOWN = new Set([
  'event_msg',
  'response_item',
  'turn_context',
  'session_meta',
  'world_state',
  'inter_agent_communication_metadata',
  'compacted'
])
const CODEX_EVENT_KNOWN = new Set([
  'token_count',
  'agent_message',
  'agent_reasoning',
  'task_started',
  'user_message',
  'task_complete',
  'thread_settings_applied',
  'mcp_tool_call_end',
  'patch_apply_end',
  'web_search_end',
  'sub_agent_activity',
  'context_compacted',
  'turn_aborted',
  'thread_rolled_back',
  'image_generation_end'
])
const CODEX_RI_KNOWN = new Set([
  'message',
  'reasoning',
  'custom_tool_call',
  'custom_tool_call_output',
  'function_call',
  'function_call_output',
  'agent_message',
  'tool_search_call',
  'tool_search_output'
])
const CODEX_CALLS = new Set(['custom_tool_call', 'function_call', 'tool_search_call'])
const CODEX_OUTPUTS: Record<string, string> = {
  custom_tool_call_output: 'custom_tool_call',
  function_call_output: 'function_call',
  tool_search_output: 'tool_search_call'
}
const CODEX_SPAWN = 'spawn_agent'

interface Unknowns {
  counts: Map<string, number>
}
function noteUnknown(u: Unknowns, type: string): void {
  u.counts.set(type, (u.counts.get(type) ?? 0) + 1)
}
function unknownBlock(u: Unknowns): TurnBlock[] {
  if (u.counts.size === 0) return []
  let count = 0
  for (const n of u.counts.values()) count += n
  return [{ kind: 'unknown', count, types: [...u.counts.keys()] }]
}

function claudeAssemble(objs: Array<Record<string, unknown>>): TurnBlock[] {
  const out: TurnBlock[] = []
  const toolById = new Map<string, TurnToolBlock>()
  const subById = new Map<string, TurnSubBlock>()
  const u: Unknowns = { counts: new Map() }

  for (const o of objs) {
    // sidechain 行不渲染:它是 subagent 的转写,而它与哪次派发对应在记录中
    // 没有稳定引用链(见文件头实测),不做猜测性归组——已知类型,不留痕
    if (o['isSidechain'] === true) continue
    const t = String(o['type'])
    if (t === 'assistant') {
      const c = asRecord(o['message'])?.['content']
      if (!Array.isArray(c)) continue
      const at = atOf(o)
      const texts: string[] = []
      const tail: TurnBlock[] = []
      for (const seg of c) {
        const s = asRecord(seg)
        if (!s) continue
        if (s['type'] === 'thinking' && typeof s['thinking'] === 'string' && s['thinking'].trim()) {
          // 行内顺序 = 思考 → 正文 → 工具(真实段序即如此)
          out.push({ kind: 'think', at, body: s['thinking'] })
        } else if (s['type'] === 'text' && typeof s['text'] === 'string') {
          texts.push(s['text'])
        } else if (s['type'] === 'tool_use' && typeof s['id'] === 'string') {
          const name = typeof s['name'] === 'string' ? s['name'] : null
          const input = asRecord(s['input'])
          if (name !== null && CLAUDE_DISPATCH.has(name)) {
            const sub: TurnSubBlock = {
              kind: 'sub',
              at,
              name: typeof input?.['subagent_type'] === 'string' ? (input['subagent_type'] as string) : name,
              prompt:
                typeof input?.['prompt'] === 'string'
                  ? (input['prompt'] as string)
                  : typeof input?.['description'] === 'string'
                    ? (input['description'] as string)
                    : '',
              steps: [],
              result: null,
              // 两侧统一:内部步骤无稳定引用链可归位(见文件头实测),显式标注
              unlinked: true
            }
            subById.set(s['id'], sub)
            tail.push(sub)
          } else {
            const text = inputText(s['input'])
            const tool: TurnToolBlock = {
              kind: 'tool',
              at,
              name,
              summary: oneLine(text.replace(/\s+/g, ' ')),
              input: text,
              output: null,
              truncated: false
            }
            toolById.set(s['id'], tool)
            tail.push(tool)
          }
        }
      }
      const body = texts.join('\n')
      if (body.trim()) out.push({ kind: 'text', role: 'assistant', at, body })
      out.push(...tail)
      continue
    }
    if (t === 'user') {
      const c = asRecord(o['message'])?.['content']
      if (!Array.isArray(c)) continue
      for (const seg of c) {
        const s = asRecord(seg)
        if (s?.['type'] !== 'tool_result' || typeof s['tool_use_id'] !== 'string') continue
        const text = resultText(s['content'])
        const tool = toolById.get(s['tool_use_id'])
        if (tool) {
          tool.output = text
          tool.truncated = text.includes(TRUNC_MARK)
          continue
        }
        const sub = subById.get(s['tool_use_id'])
        if (sub) sub.result = text
      }
      continue
    }
    if (!CLAUDE_KNOWN.has(t)) noteUnknown(u, t)
    // known-noise(16 种):不渲染、不留痕
  }

  return [...out, ...unknownBlock(u)]
}

function codexAssemble(objs: Array<Record<string, unknown>>): TurnBlock[] {
  const out: TurnBlock[] = []
  const byCallId = new Map<string, TurnToolBlock | TurnSubBlock>()
  const u: Unknowns = { counts: new Map() }

  for (const o of objs) {
    const top = String(o['type'])
    if (top === 'event_msg') {
      const p = asRecord(o['payload'])
      const pt = String(p?.['type'])
      if (pt === 'agent_message') {
        const m = p?.['message']
        if (typeof m === 'string' && m.trim()) out.push({ kind: 'text', role: 'assistant', at: atOf(o), body: m })
      } else if (!CODEX_EVENT_KNOWN.has(pt)) {
        noteUnknown(u, `event_msg/${pt}`)
      }
      // 其余 event_msg(含 agent_reasoning 镜像)为 known-noise
      continue
    }
    if (top === 'response_item') {
      const p = asRecord(o['payload'])
      const pt = String(p?.['type'])
      if (CODEX_CALLS.has(pt) && p) {
        const callId = typeof p['call_id'] === 'string' ? p['call_id'] : null
        const name = typeof p['name'] === 'string' ? p['name'] : pt
        const text = inputText(p['input'] ?? p['arguments'])
        if (name === CODEX_SPAWN) {
          const sub: TurnSubBlock = {
            kind: 'sub',
            at: atOf(o),
            name,
            prompt: text,
            steps: [],
            result: null,
            unlinked: true
          }
          if (callId) byCallId.set(callId, sub)
          out.push(sub)
        } else {
          const tool: TurnToolBlock = {
            kind: 'tool',
            at: atOf(o),
            name,
            summary: oneLine(text.replace(/\s+/g, ' ')),
            input: text,
            output: null,
            truncated: false
          }
          if (callId) byCallId.set(callId, tool)
          out.push(tool)
        }
      } else if (pt in CODEX_OUTPUTS && p) {
        const hit = typeof p['call_id'] === 'string' ? byCallId.get(p['call_id']) : undefined
        const text = typeof p['output'] === 'string' ? p['output'] : inputText(p['output'])
        if (hit?.kind === 'tool') hit.output = text
        else if (hit?.kind === 'sub') hit.result = text
      } else if (pt === 'reasoning' && p) {
        const titles = Array.isArray(p['summary'])
          ? p['summary']
              .map((s) => asRecord(s)?.['text'])
              .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
          : []
        if (titles.length > 0) out.push({ kind: 'reason', at: atOf(o), titles })
      } else if (!CODEX_RI_KNOWN.has(pt)) {
        noteUnknown(u, `response_item/${pt}`)
      }
      // message / agent_message(response_item 路)是双写镜像,known-noise
      continue
    }
    if (!CODEX_TOP_KNOWN.has(top)) noteUnknown(u, top)
    // 其余顶层(turn_context/session_meta/world_state 等)为 known-noise
  }

  return [...out, ...unknownBlock(u)]
}

/**
 * 整轮区间的原始文本 → 块序列(顺序与文件一致)。
 * 坏行只自伤:跳过该行,不断链、不抛——活跃会话的区间尾部可能是半行。
 */
export function turnBlocksFromText(side: AgentSide, raw: string): TurnBlock[] {
  const objs: Array<Record<string, unknown>> = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const obj: unknown = JSON.parse(line)
      if (typeof obj === 'object' && obj !== null) objs.push(obj as Record<string, unknown>)
    } catch {
      // 坏行跳过
    }
  }
  return side === 'claude' ? claudeAssemble(objs) : codexAssemble(objs)
}
