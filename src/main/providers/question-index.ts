// The question index: while scanning, also record where each question is, so a click can fetch the
// whole turn by byte range (spec C2). The engine module builds each side's index as it parses the session file, and
// reads a question's text and a turn's lines back out of their ranges by the same line rules (engine/src/sides/);
// what is left here is the index's shape and the Codex fork's replay strip, which works on the index alone.
//
// **No question text is stored, not even a truncated preview** (spec D2a): questions are about 9.5% of
// the whole, and repository-wide that is a megabyte-scale burden on a cache read at
// every startup; and 39.7% of questions exceed 60 characters, so a truncated preview both loses the
// body and degenerates into a second corpus at
// search time. Text is always read live by range (measured 23 ms on a warm cache).
import type { ForkState } from '@shared/domain'

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
 *   replayed span (see `stripReplayPrefix`). This is one necessary relaxation of spec D2a's
 *   "offsets only":
 *   a replay **rewrites the timestamps** (confirmed on 4 of 4 real samples), so storing nothing derived
 *   from the content would leave only
 *   blind stripping by count, which is exactly the "silent mis-strip" ticket 03b exists to prevent.
 *   Neither of D2a's reasons — size, and not creating a second
 *   search corpus — is affected: 4 bytes per entry, and a fingerprint cannot search for anything.
 */
export type QuestionRec = [number, number, number, number | null, number, number, number]


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
 * **The direction of failure decides the conservative choice here** (the AGENTS.md invariant that
 * stripping may follow the sample and admitting may not):
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
      : parent.findIndex((q) => q[3] !== null && q[3] > forkedAt) === -1
        ? parent.length
        : parent.findIndex((q) => q[3] !== null && q[3] > forkedAt)

  // Check entry by entry **by content fingerprint** (the timestamps were rewritten by the replay and
  // cannot be trusted)
  let n = 0
  while (n < replayLen && n < child.length && child[n][6] === parent[n][6]) n++

  // Only a fully matching span counts as certain; no match at all, or a partial match, is treated as
  // uncertain
  const state: ForkState = n === replayLen && replayLen > 0 ? 'stripped' : 'uncertain'
  return { questions: child.slice(n), state }
}
