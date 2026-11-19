// Turn content normalisation (ticket 05 established prose, ticket 07 completed it): each side's raw
// lines within a turn range are
// unified into a common message model (TurnBlock), and the renderer knows only that model rather than
// one per side. A Claude Code, Codex or Grok turn's blocks are the engine module's, assembled as its read
// reads the lines (engine/src/sides/claude/turn.rs, engine/src/sides/codex/turn.rs and
// engine/src/sides/grok/turn.rs, whose headers hold each side's enumeration); the other sides' are
// assembled here from the lines the read hands over, one side moving into the module at a time (ADR-0054,
// ADR-0047).
//
// Unknown types outside the allow-list always leave a trace (an unknown block placed at the end of the
// block order) — spec C8: allow-list failures are invisible, so nothing is ever silently dropped (the
// AGENTS.md invariant that admitting may not follow the sample).
import type { AgentSide, TurnBlock, TurnSubBlock, TurnToolBlock } from '@shared/domain'
import { threadEngineModule } from '../engine-module'
import type { TurnBody } from './turn-read'

/** The tool names whose call dispatches a subagent on the turn's side: the engine module's, which the question index
 * counts the turn's subagents by */
type Dispatches = ReadonlySet<string>

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

/** The one-line summary shown while collapsed: the first line, length-limited */
function oneLine(s: string, max = 88): string {
  const t = s.split('\n')[0].trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** A tool's argument object → display text (objects are serialised; a string is passed through). Every
 * value here comes out of JSON.parse in turnBlocks, so serialising it back cannot throw. */
function inputText(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === undefined || v === null) return ''
  return JSON.stringify(v, null, 2)
}

/** A parsed value as a label in the unknown trace: a string as is, anything else as its JSON, so an object
 * reads as its content rather than as String's "[object Object]". Absent reads as 'undefined'. */
function labelOf(v: unknown): string {
  return typeof v === 'string' ? v : (JSON.stringify(v) ?? 'undefined')
}

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

// ── Antigravity CLI (session-view::REQ-004). Every transcript of 2026-10-28 enumerated (15 transcripts, 104 lines):
// five line types, each a known one here; anything else leaves the unknown trace (C8).
const AGY_KNOWN = new Set(['USER_INPUT', 'PLANNER_RESPONSE', 'GENERIC', 'SYSTEM_MESSAGE', 'ERROR_MESSAGE'])
/** The conversation a dispatch created, in its result's echo ("Created the following subagent: {…}", measured) */
const AGY_CREATED = /"conversationId":\s*"([^"]+)"/
/** A system message's sender and body: `[Message] timestamp=… sender=<id> priority=… content=<body>` (measured) */
const AGY_SENDER = /\bsender=(\S+)/
const AGY_MESSAGE = /\[Message\][^\n]*?\bcontent=([\s\S]*?)\n<\/SYSTEM_MESSAGE>/

function agyAt(o: Record<string, unknown>): number | null {
  const ts = typeof o['created_at'] === 'string' ? Date.parse(o['created_at']) : NaN
  return Number.isNaN(ts) ? null : ts
}

/**
 * An Antigravity turn's lines → blocks (session-view::REQ-004/AC-04 to AC-06). A response line is thinking → prose →
 * its calls, in that order; the format carries no call id, and each measured call is followed by exactly one result
 * line (24 of 24), so results pair with calls in order — a failed or still-running call's result included. A dispatch
 * (`invoke_subagent`) is a sub block: its result only echoes the creation, and its return is the message the created
 * conversation sends back — a system message whose sender is that conversation's id, in this turn (C3). A failed model
 * call's error line is prose (owner's ruling 2026-10-28); every other system message is harness noise. Lines a rewind
 * undid inside the turn never reach here (the engine module's turn read leaves them out); a rewind back to a question does not either, the
 * indexer having ended the turn before it.
 */
function antigravityAssemble(objs: Array<Record<string, unknown>>, dispatches: Dispatches): TurnBlock[] {
  const out: TurnBlock[] = []
  const u: Unknowns = { counts: new Map() }
  /** Calls awaiting their result line, in order */
  const pending: Array<TurnToolBlock | TurnSubBlock> = []
  /** A dispatched conversation's id → its sub block, for the message it sends back */
  const subByConversation = new Map<string, TurnSubBlock>()
  for (const o of objs) {
    const t = labelOf(o['type'])
    const at = agyAt(o)
    if (t === 'PLANNER_RESPONSE') {
      if (typeof o['thinking'] === 'string' && o['thinking'].trim()) out.push({ kind: 'think', at, body: o['thinking'] })
      if (typeof o['content'] === 'string' && o['content'].trim()) out.push({ kind: 'text', role: 'assistant', at, body: o['content'] })
      for (const c of Array.isArray(o['tool_calls']) ? o['tool_calls'] : []) {
        const call = asRecord(c)
        const name = typeof call?.['name'] === 'string' ? call['name'] : null
        const args = asRecord(call?.['args'])
        const block: TurnToolBlock | TurnSubBlock =
          name !== null && dispatches.has(name)
            ? {
                kind: 'sub',
                at,
                name: typeof args?.['TypeName'] === 'string' ? args['TypeName'] : name,
                prompt: typeof args?.['Prompt'] === 'string' ? args['Prompt'] : inputText(call?.['args']),
                steps: [],
                result: null,
                // Its transcript is not read: the read allow-list admits listed sessions only (R1)
                unlinked: true
              }
            : (() => {
                const text = inputText(call?.['args'])
                return { kind: 'tool', at, name, summary: oneLine(text.replace(/\s+/g, ' ')), input: text, output: null, truncated: false }
              })()
        pending.push(block)
        out.push(block)
      }
    } else if (t === 'GENERIC') {
      const call = pending.shift()
      const text = typeof o['content'] === 'string' ? o['content'] : typeof o['error'] === 'string' ? o['error'] : ''
      if (call?.kind === 'tool') call.output = text
      else if (call?.kind === 'sub') {
        const id = AGY_CREATED.exec(text)?.[1]
        if (id !== undefined) subByConversation.set(id, call)
      }
    } else if (t === 'SYSTEM_MESSAGE') {
      const c = typeof o['content'] === 'string' ? o['content'] : ''
      const sender = AGY_SENDER.exec(c)?.[1]
      const sub = sender === undefined ? undefined : subByConversation.get(sender)
      if (sub) {
        const body = AGY_MESSAGE.exec(c)?.[1] ?? c
        sub.result = sub.result === null ? body : `${sub.result}\n\n${body}`
      }
    } else if (t === 'ERROR_MESSAGE') {
      const e = typeof o['error'] === 'string' ? o['error'] : typeof o['content'] === 'string' ? o['content'] : ''
      if (e.trim()) out.push({ kind: 'text', role: 'assistant', at, body: e })
    } else if (!AGY_KNOWN.has(t)) {
      noteUnknown(u, t)
    }
    // USER_INPUT: the question renders in its own row; an empty request renders nothing
  }
  return [...out, ...unknownBlock(u)]
}

/** A turn's body as its read hands it over (turn-read.ts) → its blocks: those the engine module assembled, of a side
 * whose turns it assembles, or those its lines give */
export function bodyBlocks(side: AgentSide, body: TurnBody): TurnBlock[] {
  return 'blocks' in body ? body.blocks : turnBlocks(side, body.lines)
}

/**
 * The lines a turn holds, as its read hands them over (turn-read.ts), → its blocks. Which lines the turn holds was the
 * engine module's to say as it read them (a line agy's rewind undid is not one), as are the tool names that dispatch a
 * subagent: the rules the question index applies.
 */
export function turnBlocks(side: AgentSide, lines: readonly string[]): TurnBlock[] {
  const engine = threadEngineModule()
  const objs: Array<Record<string, unknown>> = []
  lines.forEach((line) => {
    if (!line.trim()) return
    try {
      const obj: unknown = JSON.parse(line)
      if (typeof obj === 'object' && obj !== null) objs.push(obj as Record<string, unknown>)
    } catch {
      // Skip bad lines
    }
  })
  const dispatches = new Set(engine.dispatches(side))
  if (side === 'antigravity') return antigravityAssemble(objs, dispatches)
  throw new Error(`a ${side} turn's blocks are the engine module's: its read hands over no lines`)
}
