// 轮次正文归一化(票 05):把整轮区间里两侧各自的原始行,统一成公共消息模型
// (TurnBlock),渲染层只认这个模型,不各写一套。本票只出正文块;工具/推理归 07。
//
// 规则依据 = 全量枚举(2026-08-05,CONTEXT 不变量「形态集合必须全量枚举」):
// - Claude(1859 文件):主链 assistant 行 content 段类型全谱只有
//   tool_use 13868 / text 9714 / thinking 3079——正文 = `text` 段。
//   sidechain 的 assistant 行是 subagent 的话,不是主线回答,不出正文。
// - Codex(296 文件 / 65,583 行):正文载体是 event_msg/agent_message
//   (8005 条,payload.message 恒为 string;带不带 memory_citation/phase 两种
//   字段形态)。response_item/message 一路不用——双写流二选一取 event_msg,
//   与提问侧(user_message)同一决策。
import type { AgentSide, TurnBlock } from '@shared/domain'

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

function atOf(obj: Record<string, unknown>): number | null {
  const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
  return Number.isNaN(ts) ? null : ts
}

function claudeBlocks(obj: Record<string, unknown>): TurnBlock[] {
  if (obj['type'] !== 'assistant' || obj['isSidechain'] === true) return []
  const c = asRecord(obj['message'])?.['content']
  if (!Array.isArray(c)) return []
  const texts = c
    .map((s) => asRecord(s))
    .filter((s) => s?.['type'] === 'text')
    .map((s) => s?.['text'])
    .filter((t): t is string => typeof t === 'string')
  // 同一条消息的多个 text 段合成一块(段间换行);全空白不出块
  const body = texts.join('\n')
  if (!body.trim()) return []
  return [{ kind: 'text', role: 'assistant', at: atOf(obj), body }]
}

function codexBlocks(obj: Record<string, unknown>): TurnBlock[] {
  if (obj['type'] !== 'event_msg') return []
  const p = asRecord(obj['payload'])
  if (p?.['type'] !== 'agent_message') return []
  const m = p['message']
  if (typeof m !== 'string' || !m.trim()) return []
  return [{ kind: 'text', role: 'assistant', at: atOf(obj), body: m }]
}

/** 一行 → 归一化块(不是正文载体则空数组) */
export function turnBlockAt(side: AgentSide, obj: Record<string, unknown>): TurnBlock[] {
  return (side === 'claude' ? claudeBlocks : codexBlocks)(obj)
}

/**
 * 整轮区间的原始文本 → 块序列(顺序与文件一致)。
 * 坏行只自伤:跳过该行,不断链、不抛——活跃会话的区间尾部可能是半行。
 */
export function turnBlocksFromText(side: AgentSide, raw: string): TurnBlock[] {
  const out: TurnBlock[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const obj: unknown = JSON.parse(line)
      if (typeof obj === 'object' && obj !== null) {
        out.push(...turnBlockAt(side, obj as Record<string, unknown>))
      }
    } catch {
      // 坏行跳过
    }
  }
  return out
}

export type { TurnBlock }
