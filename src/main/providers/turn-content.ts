// Turn content normalisation (ticket 05 established prose, ticket 07 completed it): each side's raw
// lines within a turn range are
// unified into a common message model (TurnBlock), and the renderer knows only that model rather than
// one per side.
//
// The rules are grounded in a full enumeration (2026-08-05/06; the CONTEXT invariant "a set of shapes
// must come from a full enumeration"):
// - Claude (2131 files): 18 top-level types in the whole spectrum (the KNOWN set); the whole assistant
//   segment spectrum is
//   text/tool_use/thinking (all 3312 main-chain thinking segments in the repository are **empty**, with
//   only a signature
//   placeholder — plaintext thinking bodies do not land on the main chain, so the think block mechanism
//   is retained but current data produces none);
//   tool_result pairs by tool_use_id (19,711/19,711 matched).
//   **Subagent internal steps are not attributed** (measured 2026-08-06): all four candidate join keys
//   were excluded —
//   toolUseResult.agentId (7 digits) and sidechain.agentId (17 digits) are different namespaces, 0/225
//   matched;
//   dispatch lines have no promptId (0/202); outputFile points at a background task's output, not a
//   transcript; a sidechain's
//   first-line text equals the dispatch prompt in 0/1299 cases. No grouping rule is written without a
//   sample (a CONTEXT invariant),
//   so the sub block is unified on both sides: the dispatch arguments + the return + an unattributed
//   label, with sidechain lines not rendered (a known type,
//   whose full transcript is in the source or a nested file).
//   The truncation criterion = the return text contains a tool-results/ sidecar path (mechanism-based:
//   the harness's sidecar directory;
//   spec C7's original "no reference chain" was corrected by measurement — the path is there, but the
//   sidecar file does not enter the read allow-list,
//   and only the truncated version is shown with a label; the user ruled on 2026-08-06).
// - Codex (296 files): 7 top-level types; 9 response_item types — the call arguments are on
//   custom_tool_call.input / function_call.arguments / tool_search_call.arguments,
//   and the outputs pair by call_id (always present); reasoning.summary = [{type:'summary_text',text}]
//   is a plaintext sub-heading (64% empty, and an empty one produces no block), while the body,
//   encrypted_content, is never obtainable (spec C6);
//   15 event_msg types, with prose taken from agent_message; agent_reasoning is a mirror of reasoning
//   and is not rendered, to avoid double counting; spawn_agent's output has no thread id → the
//   sub-thread cannot be attributed and the sub block is marked
//   unlinked (the user ruled on 2026-08-06 against forcing a heuristic pairing).
// - Unknown types outside the allow-list always leave a trace (an unknown block placed at the end of the
//   block order) — spec C8:
//   allow-list failures are invisible, so nothing is ever silently dropped (the CONTEXT invariant
//   "strictness follows the direction of failure").
import type {
  AgentSide,
  TurnBlock,
  TurnSubBlock,
  TurnTextBlock,
  TurnThinkBlock,
  TurnToolBlock
} from '@shared/domain'
import { CLAUDE_DISPATCH } from './question-index'

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

function atOf(obj: Record<string, unknown>): number | null {
  const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
  return Number.isNaN(ts) ? null : ts
}

/** The one-line summary shown while collapsed: the first line, length-limited */
function oneLine(s: string, max = 88): string {
  const t = s.split('\n')[0].trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** A tool's argument object → display text (objects are serialised; a string is passed through) */
function inputText(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === undefined || v === null) return ''
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see #190
    return String(v)
  }
}

/** Claude tool_result content → text (a string or an array of text segments; anything else falls back to
 * serialisation) */
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

/** The truncation criterion: the harness puts oversized originals in a tool-results/ sidecar and leaves
 * the path in the body (mechanism-based) */
const TRUNC_MARK = 'tool-results/'

// ── The whole Claude top-level type spectrum (a full enumeration of 2131 files on 2026-08-06, 18 types) ──
// assistant/user carry content; the other 16 are known noise: neither rendered nor traced.
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

// ── Codex's whole three-layer spectrum (a full enumeration of 296 files on 2026-08-05/06) ──
const CODEX_TOP_KNOWN = new Set([
  'event_msg',
  'response_item',
  'turn_context',
  'session_meta',
  'world_state',
  'inter_agent_communication_metadata',
  'compacted',
  // The paginated format's per-response accounting record (ADR-0027): usage, never display
  'token_usage_record'
])
// The paginated format's completed-item event carries a typed item in place of the legacy events (full
// enumeration of 60245 events over 1391 rollouts, 2026-09-10). AgentMessage is the prose carrier — no
// paginated rollout carries the legacy agent_message event beside it (0 of 1367, measured 2026-09-11) —
// and UserMessage is the question (its own row, never a block). The other types leave no block:
// Reasoning, CommandExecution, DynamicToolCall and FileChange accompany response_item records that are
// rendered already (the reasoning summary, the tool calls), while McpToolCall and WebSearch carry calls
// whose legacy records (the mcp_tool_call_end and web_search_end events) were never rendered either —
// measured 2026-09-11, in 31 of 1367 paginated rollouts the tool-like items outnumber the response_item
// calls, so they are not mirrors: a known gap on both formats, recorded in the spec, not a double-write
// rule. A type outside this set leaves the unknown trace like any other.
const CODEX_ITEM_KNOWN = new Set([
  'Reasoning',
  'AgentMessage',
  'UserMessage',
  'FileChange',
  'McpToolCall',
  'WebSearch',
  'DynamicToolCall',
  'CommandExecution',
  'SubAgentActivity',
  'ContextCompaction',
  'Extension',
  'CollabAgentToolCall',
  'ImageView'
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
  'tool_search_output',
  // The paginated format's compaction marker on the response path: an encrypted body and nothing else
  // (78 records over 1391 rollouts, 2026-09-11; found by the unknown-trace probe, not by the item
  // enumeration, which is why it was missing) — noise, like the encrypted reasoning body
  'compaction'
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
    // Sidechain lines are not rendered: they are a subagent's transcript, and which dispatch they belong
    // to has
    // no stable reference chain in the records (see the measurements in the file header), so no
    // speculative grouping is done — a known type, no trace
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
          // The within-line order = thinking → prose → tools (which is the real segment order)
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
              name: typeof input?.['subagent_type'] === 'string' ? input['subagent_type'] : name,
              prompt:
                typeof input?.['prompt'] === 'string'
                  ? input['prompt']
                  : typeof input?.['description'] === 'string'
                    ? input['description']
                    : '',
              steps: [],
              result: null,
              // Unified on both sides: internal steps have no stable reference chain to attribute them
              // by (see the measurements in the file header), so it is labelled explicitly
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
    // Known noise (16 types): neither rendered nor traced
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
      } else if (pt === 'item_completed') {
        const item = asRecord(p?.['item'])
        const it = String(item?.['type'])
        if (it === 'AgentMessage') {
          const c = item?.['content']
          const body = Array.isArray(c)
            ? c
                .map((s) => asRecord(s)?.['text'])
                .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
                .join('\n\n')
            : ''
          if (body) out.push({ kind: 'text', role: 'assistant', at: atOf(o), body })
        } else if (!CODEX_ITEM_KNOWN.has(it)) {
          noteUnknown(u, `item_completed/${it}`)
        }
      } else if (!CODEX_EVENT_KNOWN.has(pt)) {
        noteUnknown(u, `event_msg/${pt}`)
      }
      // The remaining event_msg types (including the agent_reasoning mirror) are known noise
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
      // message / agent_message on the response_item path are double-write mirrors, known noise
      continue
    }
    if (!CODEX_TOP_KNOWN.has(top)) noteUnknown(u, top)
    // The remaining top-level types (turn_context/session_meta/world_state and so on) are known noise
  }

  return [...out, ...unknownBlock(u)]
}

/**
 * A whole turn range's raw text → a block sequence (in the file's order).
 * A bad line only hurts itself: skip it without breaking the chain and without throwing — an active
 * session's range may end mid-line.
 */
/**
 * The enumerated non-display update types (full enumeration of this machine's streams,
 * 2026-08-16: 17 types in total). State records, deliberately stripped — and deliberately NOT
 * breaking a prose/thought merge, because a single assistant message measures as split MID-WORD
 * across chunk records with these state records between the fragments. Anything outside the
 * enumeration leaves a trace (the CONTEXT allow-list invariant).
 */
const GROK_STATE_TYPES = new Set([
  'turn_completed',
  'plan',
  'session_recap',
  'retry_state',
  'task_backgrounded',
  'task_completed',
  'current_mode_update',
  'auto_compact_started',
  'auto_compact_completed',
  'compaction_checkpoint'
])

/** The text inside a Grok chunk record's content */
function grokChunkText(upd: Record<string, unknown>): string {
  const content = upd['content'] as Record<string, unknown> | undefined
  const t = content?.['text']
  return typeof t === 'string' ? t : ''
}

/** The joined text of a tool_call_update's content array */
function grokUpdateContentText(upd: Record<string, unknown>): string | null {
  const arr = upd['content']
  if (!Array.isArray(arr)) return null
  let out = ''
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const inner = (item as Record<string, unknown>)['content'] as Record<string, unknown> | undefined
    const t = inner?.['text']
    if (typeof t === 'string') out += t
  }
  return out === '' ? null : out
}

function grokAssemble(objs: Array<Record<string, unknown>>): TurnBlock[] {
  const out: TurnBlock[] = []
  const u: Unknowns = { counts: new Map() }
  const toolById = new Map<string, TurnToolBlock>()
  /** Spawn sub blocks awaiting their subagent_spawned pairing, in dispatch order */
  const unpairedSubs: TurnSubBlock[] = []
  /** subagent_id → its sub block, for the finished record's result */
  const subById = new Map<string, TurnSubBlock>()
  /** The ids of spawn tool calls, whose own updates are the "started in background" echo, not a result */
  const spawnToolIds = new Set<string>()
  let openProse: TurnTextBlock | null = null
  let openThink: TurnThinkBlock | null = null

  for (const o of objs) {
    const params = o['params'] as Record<string, unknown> | undefined
    const upd = params?.['update'] as Record<string, unknown> | undefined
    const t = typeof upd?.['sessionUpdate'] === 'string' ? upd['sessionUpdate'] : null
    if (upd === undefined || t === null) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see #190
      noteUnknown(u, String(o['method'] ?? '<no-update>'))
      continue
    }
    const tsRaw = o['timestamp']
    const at = typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw * 1000 : null

    if (t === 'agent_message_chunk') {
      const text = grokChunkText(upd)
      if (openProse) openProse.body += text // raw: a fragment can end mid-word
      else {
        openProse = { kind: 'text', role: 'assistant', at, body: text }
        out.push(openProse)
      }
      openThink = null
      continue
    }
    if (t === 'agent_thought_chunk') {
      const text = grokChunkText(upd)
      if (openThink) openThink.body += text
      else {
        openThink = { kind: 'think', at, body: text }
        out.push(openThink)
      }
      openProse = null
      continue
    }
    if (t === 'tool_call') {
      openProse = null
      openThink = null
      const id = typeof upd['toolCallId'] === 'string' ? upd['toolCallId'] : null
      const rawInput = upd['rawInput']
      if (upd['title'] === 'spawn_subagent') {
        const input = rawInput as Record<string, unknown> | undefined
        const prompt =
          typeof input?.['prompt'] === 'string'
            ? input['prompt']
            : typeof input?.['description'] === 'string'
              ? input['description']
              : ''
        const sub: TurnSubBlock = {
          kind: 'sub',
          at,
          // The dispatch record carries no agent type; the paired subagent_spawned names it
          name: null,
          prompt,
          steps: [],
          result: null,
          // The child's transcript is not read — its internal steps are unattributed, same label
          // as the Codex side
          unlinked: true
        }
        unpairedSubs.push(sub)
        if (id !== null) spawnToolIds.add(id)
        out.push(sub)
        continue
      }
      const meta = (upd['_meta'] as Record<string, unknown> | undefined)?.['x.ai/tool'] as
        | Record<string, unknown>
        | undefined
      const name =
        typeof meta?.['name'] === 'string'
          ? meta['name']
          : typeof upd['title'] === 'string'
            ? upd['title']
            : null
      const input = inputText(rawInput)
      const block: TurnToolBlock = {
        kind: 'tool',
        at,
        name,
        summary: oneLine(`${name ?? ''} ${input}`.trim()),
        input,
        output: null,
        truncated: false
      }
      if (id !== null) toolById.set(id, block)
      out.push(block)
      continue
    }
    if (t === 'tool_call_update') {
      const id = typeof upd['toolCallId'] === 'string' ? upd['toolCallId'] : null
      if (id === null || spawnToolIds.has(id)) continue // a spawn's echo is not a result
      const block = toolById.get(id)
      if (!block) continue // an update for a call dispatched before this turn only enriches nothing
      const text = grokUpdateContentText(upd)
      if (text !== null) block.output = text
      continue
    }
    if (t === 'subagent_spawned') {
      const sub = unpairedSubs.shift()
      if (sub) {
        const kind = upd['subagent_type']
        if (typeof kind === 'string' && kind !== '') sub.name = kind
        const id = upd['subagent_id']
        if (typeof id === 'string') subById.set(id, sub)
      }
      continue
    }
    if (t === 'subagent_finished') {
      const id = upd['subagent_id']
      const sub = typeof id === 'string' ? subById.get(id) : undefined
      if (sub) {
        const output = upd['output']
        const error = upd['error']
        sub.result =
          typeof output === 'string' && output !== ''
            ? output
            : typeof error === 'string'
              ? error
              : null
      }
      continue
    }
    if (t === 'user_message_chunk') continue // the question renders in its own row; injected notices render nothing
    if (GROK_STATE_TYPES.has(t)) continue
    noteUnknown(u, `update/${t}`)
  }
  return [...out, ...unknownBlock(u)]
}

export function turnBlocksFromText(side: AgentSide, raw: string): TurnBlock[] {
  const objs: Array<Record<string, unknown>> = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const obj: unknown = JSON.parse(line)
      if (typeof obj === 'object' && obj !== null) objs.push(obj as Record<string, unknown>)
    } catch {
      // Skip bad lines
    }
  }
  if (side === 'grok') return grokAssemble(objs)
  return side === 'claude' ? claudeAssemble(objs) : codexAssemble(objs)
}
