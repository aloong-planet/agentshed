// The question index: while scanning, also record where each question is, so a click can fetch the
// whole turn by byte range (spec C2). The engine module builds each side's index as it parses the session file, and
// reads a question's text and a turn's lines back out of their ranges by the same line rules (engine/src/sides/), and
// strips a Codex fork's replay off the index (engine/src/question/); what is left here is the index's shape.
//
// **No question text is stored, not even a truncated preview** (spec D2a): questions are about 9.5% of
// the whole, and repository-wide that is a megabyte-scale burden on a cache read at
// every startup; and 39.7% of questions exceed 60 characters, so a truncated preview both loses the
// body and degenerates into a second corpus at
// search time. Text is always read live by range (measured 23 ms on a warm cache).

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
