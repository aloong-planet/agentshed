// The question index: while scanning, also record where each question is, so a click can fetch the
// whole turn by byte range (spec C2).
//
// **No question text is stored, not even a truncated preview** (spec D2a): questions are about 9.5% of
// the whole, and repository-wide that is a megabyte-scale burden on a cache read at
// every startup; and 39.7% of questions exceed 60 characters, so a truncated preview both loses the
// body and degenerates into a second corpus at
// search time. Text is always read live by range (measured 23 ms on a warm cache).
import type { AgentSide } from '@shared/domain'
import { normalize, realUserText } from './session-title'

/**
 * One question's index, encoded into the cache as a compact array:
 * `[question line start, question line end, turn end, timestamp, tool count, subagent count, content fingerprint]`
 *
 * - The question itself = `[0, 1)`; the turn contents = `[1, 2)` (from after that question up to the
 *   next one, spec C1).
 * - The offsets are **bytes** and can be fed straight to `createReadStream(file, { start, end })` on a
 *   plain rollout; on a cold one (.jsonl.zst) they are offsets in the decompressed stream, which the
 *   range reader serves in one pass (spec session-view C2).
 * - **The content fingerprint** is a 32-bit integer, not reversible into text and unusable for search;
 *   it exists only to recognise Codex's
 *   replayed span (the replay strip, engine/src/question/). This is one necessary relaxation of spec D2a's
 *   "offsets only":
 *   a replay **rewrites the timestamps** (confirmed on 4 of 4 real samples), so storing nothing derived
 *   from the content would leave only
 *   blind stripping by count, which is exactly the "silent mis-strip" ticket 03b exists to prevent.
 *   Neither of D2a's reasons — size, and not creating a second
 *   search corpus — is affected: 4 bytes per entry, and a fingerprint cannot search for anything.
 */
export type QuestionRec = [number, number, number, number | null, number, number, number]


/**
 * The content fingerprint (FNV-1a, 32-bit), also the engine module's for Claude Code, Codex and Grok
 * (engine/src/text/mod.rs: a change here is made there too). It only needs "same text, same value; different text, very
 * likely a different value", not cryptographic strength —
 * its only use is comparing, entry by entry, whether the start of a child session and the parent hold
 * the same questions.
 */
export function fingerprint(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    // The FNV prime 16777619; use shift-and-add to avoid losing precision to 32-bit overflow
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/** The tool names that dispatch a subagent on the Claude side. Measured across the repository: Agent 152
 * times, Task 4 — two generations of
 * the same tool's name, both taking description/prompt/subagent_type as arguments.
 * The seemingly more mechanism-based criterion "the arguments contain subagent_type" is not used:
 * checking it back across the repository wrongly counts one
 * `TaskCreate` and misses 5 `Agent` calls that omitted the optional parameter. A future rename can only
 * undercount,
 * never miscount — what is displayed is a volume figure, and an undercount does not pollute other
 * turns.
 * The session page's turns read it (turn-content.ts); the question index counts by the engine module's copy
 * (`DISPATCH` in engine/src/sides/claude/question.rs), and a change here is made there too until the turns read
 * through the module (#432). */
export const CLAUDE_DISPATCH = new Set(['Agent', 'Task'])

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

/**
 * The text of a Claude human question; null if it is not a question.
 * `type=user` with content as a string or an array containing a text segment; an `isSidechain` line is a
 * subagent's
 * own transcript, not something a human asked (spec B1).
 *
 * Tool results fed back in (`tool_result`) are excluded by the "take text segments" rule itself, with no
 * separate guard: enumerating
 * all 12,734 user.content arrays in the repository, the segment type combinations are only three —
 * `(tool_result)` 12541,
 * `(text)` 142, `(image,text)` 51 — **tool_result never co-occurs with text**, and a tool_result
 * segment has no text field of its own. An additional `some(type===tool_result)` is an unreachable branch.
 *
 * The question text the session page and both searches show (`questionTextAt`); the question index takes its
 * questions by the engine module's copy of this rule (`question` in engine/src/sides/claude/question.rs). A change
 * here is made there too, and this copy goes once those readers read through the module (#432).
 */
function claudeQuestion(obj: Record<string, unknown>): string | null {
  if (obj['type'] !== 'user' || obj['isSidechain'] === true) return null
  const msg = asRecord(obj['message'])
  if (!msg) return null
  const c = msg['content']
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return null
  const texts = c
    .map((s) => asRecord(s)?.['text'])
    .filter((t): t is string => typeof t === 'string')
  return texts.length > 0 ? texts.join(' ') : null
}

/**
 * A Codex human question (spec B1): the legacy `event_msg/user_message`, or its paginated replacement —
 * the completed-item event whose item is a user message, with the text in `item.content[].text` (the one
 * shape seen in 8285 items across this machine's rollouts, 2026-09-11). `response_item/message` is never a
 * source: it mixes in `<environment_context>` and AGENTS.md injected content a human did not write, and
 * in every paginated rollout without a user-message item it holds nothing else (29 of 29, 2026-09-11).
 */
function codexQuestion(obj: Record<string, unknown>): string | null {
  if (obj['type'] !== 'event_msg') return null
  const p = asRecord(obj['payload'])
  if (p?.['type'] === 'user_message') return typeof p['message'] === 'string' ? p['message'] : null
  if (p?.['type'] !== 'item_completed') return null
  const item = asRecord(p['item'])
  if (item?.['type'] !== 'UserMessage') return null
  const c = item['content']
  if (!Array.isArray(c)) return null
  const texts = c
    .map((s) => asRecord(s)?.['text'])
    .filter((t): t is string => typeof t === 'string')
  return texts.length > 0 ? texts.join(' ') : null
}

/**
 * One line → the question in full for display (noise already stripped); null if it is not a question.
 * The same judgement as the indexer (claudeQuestion/codexQuestion + realUserText; the Claude and Codex indexers are
 * the engine module's, engine/src/sides/claude/question.rs and engine/src/sides/codex/question.rs, which read the
 * same shapes) — the session page
 * reads the raw line back by
 * range and produces its text here, guaranteeing that what the list counts and what the page displays
 * are always the same set.
 */
export function questionTextAt(side: AgentSide, obj: Record<string, unknown>): string | null {
  // A Grok question can span several chunk lines, so its text is derived from the whole slice by
  // grokQuestionTextFromSlice — a single parsed line cannot carry it and this path must not be used
  if (side === 'grok') return null
  // agy's question is its request block; the other harnesses' noise shapes are not stripped from it — none of them
  // is agy's, and its own additions sit outside the block
  if (side === 'antigravity') return antigravityQuestion(obj)
  const raw = (side === 'claude' ? claudeQuestion : codexQuestion)(obj)
  return raw === null ? null : realUserText(raw)
}

/**
 * One question's byte range, as the question index records it → the question as the session page shows it;
 * null when it cannot be read. A Grok question's range can span several chunk lines, which concatenate raw;
 * on the other sides it is one JSON line. Every reader of question text goes through here — the session page,
 * a project's session search and global search — so a hit's text is always the one the page shows.
 */
export function questionTextOfRange(side: AgentSide, raw: string): string | null {
  if (side === 'grok') return grokQuestionTextFromSlice(raw)
  try {
    const obj: unknown = JSON.parse(raw.trim())
    return typeof obj === 'object' && obj !== null ? questionTextAt(side, obj as Record<string, unknown>) : null
  } catch {
    // A single bad line only hurts itself
    return null
  }
}

/** The update record inside a Grok stream line, or undefined when the line is something else */
function grokUpdate(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const params = obj['params'] as Record<string, unknown> | undefined
  return params?.['update'] as Record<string, unknown> | undefined
}

/** A user chunk's text; null when the line is not a user_message_chunk. The engine module's Grok indexer
 * (engine/src/sides/grok/question.rs) reads the same field to decide which chunks are a question: a change here is made
 * there too. */
function grokUserChunkText(obj: Record<string, unknown>): string | null {
  const upd = grokUpdate(obj)
  if (upd?.['sessionUpdate'] !== 'user_message_chunk') return null
  const content = upd['content'] as Record<string, unknown> | undefined
  const text = content?.['text']
  return typeof text === 'string' ? text : ''
}

/**
 * A Grok question's text out of its byte range. The range covers every chunk line of one prompt
 * (they are adjacent in the stream except for interleaved retry_state lines, measured), so the
 * slice is parsed line by line and the user chunks' texts concatenate raw — no separator is
 * injected, because a long question is split mid-word (the same measured behaviour as the prose
 * chunks) and any separator would corrupt it.
 */
export function grokQuestionTextFromSlice(raw: string): string | null {
  let out = ''
  let seen = false
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const obj: unknown = JSON.parse(line)
      if (typeof obj !== 'object' || obj === null) continue
      const text = grokUserChunkText(obj as Record<string, unknown>)
      if (text !== null) {
        out += text
        seen = true
      }
    } catch {
      // Skip bad lines; the bytes still belonged to the range
    }
  }
  return seen ? out : null
}

// ── Antigravity CLI (session-view::REQ-004) ──
//
// agy writes a conversation's full transcript as a JSON line per step (`transcript_full.jsonl`), every line carrying
// its step index and one of five types — measured over every transcript of 2026-10-28 (15 transcripts, 104 lines):
// USER_INPUT 24, PLANNER_RESPONSE 44, GENERIC 24 (a tool call's result), SYSTEM_MESSAGE 11, ERROR_MESSAGE 1. The
// question index is the engine module's (engine/src/sides/antigravity/transcript.rs), which applies the same question
// and rewind rules as these, the ones the session page, both searches and the turn reader use: a change here is made
// there too.

/** The tool call that dispatches a subagent (2 of the 24 measured calls); its result only echoes the creation */
export const AGY_DISPATCH = 'invoke_subagent'

const AGY_REQUEST = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/

/**
 * An agy question (session-view::REQ-004/AC-01): a user-input line's request body. agy appends blocks after it — the
 * additional metadata (every one of the 24 measured lines) and a settings change (13) — which are not the question.
 * A line without a request block (never measured) is listed whole, so that nothing is lost; an empty request is no
 * question. Normalised like every side's question text (session-view::REQ-002).
 */
function antigravityQuestion(obj: Record<string, unknown>): string | null {
  if (obj['type'] !== 'USER_INPUT') return null
  const c = obj['content']
  if (typeof c !== 'string') return null
  const t = normalize(AGY_REQUEST.exec(c)?.[1] ?? c)
  return t === '' ? null : t
}

/** A line's step index; null when it carries none (never measured), and then it is neither a redo nor undone */
export function agyStepIndex(obj: Record<string, unknown>): number | null {
  const s = obj['step_index']
  return typeof s === 'number' && Number.isFinite(s) ? s : null
}

/**
 * Which lines a rewind left behind (session-view::REQ-004/AC-03). agy's rewind keeps the undone lines in the transcript
 * and writes the redo under the same step indices (measured): a line whose step index is not greater than an earlier
 * line's starts a redo, and every line from the first one carrying that index up to the redo is undone. Equivalently,
 * a line is undone exactly when a later line's step index is not greater than its own — which is what this reads,
 * from the end. `steps[i]` is line i's step index; the result's i is whether line i is kept.
 */
export function agyKeptLines(steps: ReadonlyArray<number | null>): boolean[] {
  const kept = new Array<boolean>(steps.length)
  let laterMin = Infinity
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]
    kept[i] = s === null || s < laterMin
    if (s !== null && s < laterMin) laterMin = s
  }
  return kept
}
