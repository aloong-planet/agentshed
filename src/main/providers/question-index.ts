// The question index: while scanning, also record where each question is, so a click can fetch the
// whole turn by byte range (spec C2).
//
// **No question text is stored, not even a truncated preview** (spec D2a): questions are about 9.5% of
// the whole, and repository-wide that is a megabyte-scale burden on a cache read at
// every startup; and 39.7% of questions exceed 60 characters, so a truncated preview both loses the
// body and degenerates into a second corpus at
// search time. Text is always read live by range (measured 23 ms on a warm cache).
import type { AgentSide, ForkState } from '@shared/domain'
import { realUserText } from './session-title'

/**
 * One question's index, encoded into the cache as a compact array:
 * `[question line start, question line end, turn end, timestamp, tool count, subagent count, content fingerprint]`
 *
 * - The question itself = `[0, 1)`; the turn contents = `[1, 2)` (from after that question up to the
 *   next one, spec C1).
 * - The offsets are **bytes** and can be fed straight to `createReadStream(file, { start, end })`.
 * - **The content fingerprint** is a 32-bit integer, not reversible into text and unusable for search;
 *   it exists only to recognise Codex's
 *   replayed span (see `stripReplayPrefix`). This is one necessary relaxation of spec D2a's
 *   "offsets only":
 *   a replay **rewrites the timestamps** (confirmed on 4 of 4 real samples), so storing nothing derived
 *   from the content would leave only
 *   blind stripping by count, which is exactly the "silent mis-strip" ticket 03b exists to prevent.
 *   Neither of D2a's reasons — size, and not creating a second
 *   search corpus — is affected: 4 bytes per entry, and a fingerprint cannot search for anything.
 */
export type QuestionRec = [number, number, number, number | null, number, number, number]


/**
 * The content fingerprint (FNV-1a, 32-bit). It only needs "same text, same value; different text, very
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

/** The replay burst criterion: two adjacent questions ≤ this far apart are taken as a program writing
 * in one go rather than a human's rhythm.
 * Shares its source with the token side's BURST_PAUSE_MS (ccusage replay.rs) but is **computed
 * independently** —
 * metering is a deduplication rule and display is "what this conversation looks like"; neither may
 * reuse the other's conclusions (ticket 03b's acceptance). */
const BURST_GAP_MS = 1000

/**
 * Strip the replay prefix from the start of a Codex fork session, keeping only what is new since this
 * fork (spec B2).
 *
 * **The direction of failure decides the conservative choice here** (the CONTEXT invariant "strictness
 * follows the direction of failure"):
 * stripping too much → a real question silently disappears and the user cannot tell; too little →
 * duplicates, which the user sees immediately and which have
 * an uncertainty marker to explain them. So if the check does not pass, **strip nothing** — never gamble.
 *
 * @param parent The parent session's index; pass null when the parent is not in the scan set
 * @param forkedAt The child session's session_meta timestamp = the fork moment
 */
export type { ForkState }

export function stripReplayPrefix(
  child: readonly QuestionRec[],
  parent: readonly QuestionRec[] | null,
  forkedAt: number | null,
  /** Whether this session is a fork. **Must be given separately**: `parent === null` covers both "not a
   * fork"
   * and "a fork whose parent is not in the scan set", whose states are none and uncertain respectively
   * — ticket 03b explicitly requires these two to be distinguishable in the data, not two shades of one
   * field. */
  isFork: boolean
): { questions: QuestionRec[]; state: ForkState } {
  if (!isFork) return { questions: [...child], state: 'none' }

  if (parent === null) {
    // The parent is missing: all that is left is the mechanism "a replay is written by a program in one
    // go, with near-zero gaps between lines"
    // n = how many questions the opening run of near-zero gaps contains (the first one is its own start)
    let n = child.length === 0 ? 0 : 1
    while (n < child.length) {
      const a = child[n - 1][3]
      const b = child[n][3]
      // Stop at a negative (out-of-order) difference, the same rule as the token side's
      // skipRewrittenBurst: a single program write has
      // monotonic timestamps, out-of-order ones are not evidence of a burst, and the direction of failure
      // (stripping too much → silent disappearance) forbids gambling
      if (a === null || b === null || b - a < 0 || b - a > BURST_GAP_MS) break
      n++
    }
    // A single entry with no following "human rhythm" entry to contrast against is not evidence of a burst
    if (n === 1) n = 0
    // **Never strip empty**: when the whole span looks like a burst, it could be either "this fork
    // produced nothing new" or
    // a heuristic misjudgement (a human pasting several entries in a row, say). Keeping one entry in the
    // former case shows one extra row; stripping empty in the latter makes
    // an entire session vanish — the direction of failure picks the former.
    if (n >= child.length) n = Math.max(0, child.length - 1)
    return { questions: child.slice(n), state: 'uncertain' }
  }

  // The parent's questions from before the fork moment are the ones this session replays
  const replayLen =
    forkedAt === null
      ? parent.length
      : parent.findIndex((q) => q[3] !== null && (q[3] as number) > forkedAt) === -1
        ? parent.length
        : parent.findIndex((q) => q[3] !== null && (q[3] as number) > forkedAt)

  // Check entry by entry **by content fingerprint** (the timestamps were rewritten by the replay and
  // cannot be trusted)
  let n = 0
  while (n < replayLen && n < child.length && child[n][6] === parent[n][6]) n++

  // Only a fully matching span counts as certain; no match at all, or a partial match, is treated as
  // uncertain
  const state: ForkState = n === replayLen && replayLen > 0 ? 'stripped' : 'uncertain'
  return { questions: child.slice(n), state }
}

export interface QuestionIndexer {
  /** Feed lines in one by one, in the file's order */
  line(obj: Record<string, unknown>, start: number, end: number): void
  /**
   * The first real question's text **after noise stripping** (untruncated); null if there is none.
   * The caller turns it into a title with `clipTitle` directly and **must not run `realUserText`
   * again** — stripping is not idempotent.
   * This way only the indexer decides which line is the first question, so there is no "the title has a
   * value but the question count is 0"
   * — the same concept with two numbers (the same lesson as spec A1); when the last-leaf walk-back
   * filters out the first one, the title changes with it.
   */
  firstQuestionText(): string | null
  /**
   * Finishing: the last turn's end point = the end of the last **parseable** line (passed in by the
   * caller).
   * Deliberately not the file's byte size: an active session may be mid-line, and that half line neither
   * parses nor should be sliced into
   * a turn's range — taking the end of the last complete line means an on-demand fetch always reads
   * well-formed content.
   */
  done(fileEnd: number): QuestionRec[]
  /**
   * The number of branch points on the main chain = the number of nodes treated as a parent by ≥2
   * main-chain nodes (ticket 06's banner signal:
   * "this session has N branch points; abandoned branches are not shown"). It counts branch points, not
   * branches;
   * sidechain lines do not enter the graph and the compaction boundary bridge is a single chain, so
   * neither creates a branch. Always 0 on the Codex side.
   */
  forkPoints(): number
}

/** The tool names that dispatch a subagent on the Claude side. Measured across the repository: Agent 152
 * times, Task 4 — two generations of
 * the same tool's name, both taking description/prompt/subagent_type as arguments.
 * The seemingly more mechanism-based criterion "the arguments contain subagent_type" is not used:
 * checking it back across the repository wrongly counts one
 * `TaskCreate` and misses 5 `Agent` calls that omitted the optional parameter. A future rename can only
 * undercount,
 * never miscount — what is displayed is a volume figure, and an undercount does not pollute other
 * turns. */
export const CLAUDE_DISPATCH = new Set(['Agent', 'Task'])

/** The function_call name that dispatches a subagent on the Codex side (real sample: namespace=collaboration) */
const CODEX_DISPATCH = 'spawn_agent'

/** Codex records tool calls on response_item; the event_msg path is a UI event mirror of the same calls,
 * and taking only one path avoids double counting (the same reason as the spec's "choose one of the two
 * written streams", except that response_item is chosen here
 * — it is the record of the calls the model actually made, while the event_msg side has only *_end
 * events and lacks the counterpart of function_call).
 *
 * The three come from **a full enumeration** (278 files / 62,912 lines with a payload) of the whole
 * response_item spectrum:
 * message 10311 · reasoning 6075 · custom_tool_call 3400 · function_call 1883 ·
 * agent_message 54 · **tool_search_call 25**, plus each of their *_output counterparts.
 * `tool_search_call` never appeared once in a 120-file sample — a positive enumeration based on sampling
 * misses things,
 * and it only became visible when review switched to the full set. */
const CODEX_CALL_TYPES = new Set(['custom_tool_call', 'function_call', 'tool_search_call'])

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

/** A Codex human question: only event_msg/user_message counts. response_item/message mixes in
 * `<environment_context>` and AGENTS.md injected content, which a human did not write (spec B1). */
function codexQuestion(obj: Record<string, unknown>): string | null {
  if (obj['type'] !== 'event_msg') return null
  const p = asRecord(obj['payload'])
  if (p?.['type'] !== 'user_message') return null
  return typeof p['message'] === 'string' ? p['message'] : null
}

function claudeCounts(obj: Record<string, unknown>): { tools: number; subagents: number } {
  // A sidechain line is a subagent's own transcript: what it did counts under the subagent number,
  // not again in the parent turn's tool count (expanding a subagent is spec C3's business)
  if (obj['isSidechain'] === true) return { tools: 0, subagents: 0 }
  const c = asRecord(obj['message'])?.['content']
  if (!Array.isArray(c)) return { tools: 0, subagents: 0 }
  let tools = 0
  let subagents = 0
  for (const seg of c) {
    const s = asRecord(seg)
    if (s?.['type'] !== 'tool_use') continue
    if (typeof s['name'] === 'string' && CLAUDE_DISPATCH.has(s['name'])) subagents++
    else tools++
  }
  return { tools, subagents }
}

function codexCounts(obj: Record<string, unknown>): { tools: number; subagents: number } {
  if (obj['type'] !== 'response_item') return { tools: 0, subagents: 0 }
  const p = asRecord(obj['payload'])
  const t = p?.['type']
  if (typeof t !== 'string' || !CODEX_CALL_TYPES.has(t)) return { tools: 0, subagents: 0 }
  return p?.['name'] === CODEX_DISPATCH ? { tools: 0, subagents: 1 } : { tools: 1, subagents: 0 }
}

/**
 * One line → the question in full for display (noise already stripped); null if it is not a question.
 * The same judgement as the indexer (claudeQuestion/codexQuestion + realUserText) — the session page
 * reads the raw line back by
 * range and produces its text here, guaranteeing that what the list counts and what the page displays
 * are always the same set.
 */
export function questionTextAt(side: AgentSide, obj: Record<string, unknown>): string | null {
  // The Grok question shape lands with the session-view ticket; until then no grok session enters
  // the index, so this branch cannot run — null (not a question) rather than a guess at the format.
  if (side === 'grok') return null
  const raw = (side === 'claude' ? claudeQuestion : codexQuestion)(obj)
  return raw === null ? null : realUserText(raw)
}

export function makeQuestionIndexer(side: 'claude' | 'codex'): QuestionIndexer {
  const questionOf = side === 'claude' ? claudeQuestion : codexQuestion
  const countsOf = side === 'claude' ? claudeCounts : codexCounts
  const out: QuestionRec[] = []
  /** Parallel to `out`: the uuid of each question's line (null if absent), for the last-leaf walk-back filter */
  const qUuid: Array<string | null> = []
  /** Parallel to `out`: the question text **after noise stripping**, used only to re-derive the first
   * question's title after filtering.
   * The raw text is not stored truncated: measured, the real content inside a wrapper such as
   * `<command-args>` can be as far in as character 4054,
   * so truncating before stripping would leave the stripping rules unable to find the tag and turn the
   * title into a chunk of wrapper garbage. **In memory only, never in the cache.** */
  const qHead: string[] = []
  /** Claude main chain's uuid → parent. **The parent is `parentUuid ?? logicalParentUuid`** */
  const parentOf = new Map<string, string | null>()
  /** The uuid of the last **non-sidechain** line — where the walk-back starts */
  let lastMainUuid: string | null = null
  let firstRaw: string | null = null

  return {
    line(obj, start, end) {
      // The walk-back graph is built on the Claude side only and admits main-chain lines only: a
      // sidechain is a subagent's own
      // transcript, whose parentUuid is always null and whose children point only within the sidechain,
      // so letting it in would take
      // the walk-back's starting point into the subagent's chain (measured: 69% of files end on a
      // sidechain line).
      if (side === 'claude' && obj['isSidechain'] !== true) {
        const u = obj['uuid']
        if (typeof u === 'string') {
          const p = obj['parentUuid']
          const lp = obj['logicalParentUuid']
          // A compaction boundary's (type=system, subtype=compact_boundary) parentUuid is broken, and
          // logicalParentUuid is its bridge to the pre-compaction history. Without the bridge, the worst
          // measured case had
          // 346 questions collapse to 44 — all pre-compaction history judged as "abandoned branches".
          parentOf.set(u, typeof p === 'string' ? p : typeof lp === 'string' ? lp : null)
          lastMainUuid = u
        }
      }
      const raw = questionOf(obj)
      // Noise is not a question (the same rules as title stripping): otherwise a session containing only
      // a Warmup would report
      // "1 question" while not being listed per spec A3a — one concept with two numbers
      const clean = raw === null ? null : realUserText(raw)
      if (clean !== null) {
        const prev = out[out.length - 1]
        if (prev) prev[2] = start
        const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
        out.push([start, end, end, Number.isNaN(ts) ? null : ts, 0, 0, fingerprint(clean)])
        qUuid.push(typeof obj['uuid'] === 'string' ? obj['uuid'] : null)
        qHead.push(clean)
        return
      }
      const cur = out[out.length - 1]
      // Lines before the first question (session_meta, warmup noise and so on) belong to no turn
      if (!cur) return
      const { tools, subagents } = countsOf(obj)
      cur[4] += tools
      cur[5] += subagents
    },
    firstQuestionText() {
      return firstRaw
    },
    forkPoints() {
      const refs = new Map<string, number>()
      for (const p of parentOf.values()) {
        if (p !== null) refs.set(p, (refs.get(p) ?? 0) + 1)
      }
      let n = 0
      for (const c of refs.values()) if (c >= 2) n++
      return n
    },
    done(fileEnd) {
      // Extend the **original** last entry to the file's end point first, then filter: if the last entry
      // is on an abandoned branch,
      // that extension should disappear with it rather than letting the surviving previous entry swallow
      // the abandoned content into its own turn.
      const last = out[out.length - 1]
      if (last && fileEnd > last[2]) last[2] = fileEnd

      let kept = out
      let keptHeads = qHead
      if (side === 'claude' && lastMainUuid !== null) {
        const chain = new Set<string>()
        let cur: string | null = lastMainUuid
        while (cur !== null && !chain.has(cur)) {
          chain.add(cur)
          cur = parentOf.get(cur) ?? null
        }
        kept = []
        keptHeads = []
        for (let i = 0; i < out.length; i++) {
          const u = qUuid[i]
          // A question with no uuid cannot be judged as on or off the chain — kept on the do-not-lose
          // principle (losing a real question
          // violates "find that question I asked" — this feature's reason for existing — more than
          // keeping one extra abandoned entry does)
          if (u === null || chain.has(u)) {
            kept.push(out[i])
            keptHeads.push(qHead[i])
          }
        }
      }
      // The title and the count share a source: re-take the first entry after filtering, so the title
      // does not come from a discarded question
      firstRaw = keptHeads.length > 0 ? keptHeads[0] : null
      return kept
    }
  }
}
