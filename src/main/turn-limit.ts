// The turn limit (session-view, the in-turn fetch states; owner's decision on #485): a turn whose body is longer than
// this is never read. The body's length is the index's own `[turn start, turn end)`, known before any read, so the
// decision costs nothing and a huge turn costs no memory. The question is still read: it is not the body, and its text is
// what ties the fetch to the question the page showed after a rewrite. This limit does not bound it, and neither does the
// line limit for every side: a Grok question is a run of lines, each within the line limit, the run itself unbounded.
import type { ByteRange } from './providers/range-read'
import { rescanIntervalMs } from './rescan'

/** 64 MiB, measured on the body alone: exactly this much is read, one byte more is not */
const TURN_LIMIT_BYTES = 64 * 1024 * 1024
/** Test seam (the AGENTSHED_ family a packaged build refuses): lowers the limit so that e2e need not write 64 MiB */
export const TURN_LIMIT_SEAM = 'AGENTSHED_TURN_LIMIT_BYTES'

/** The limit in effect: the seam's positive number, otherwise 64 MiB */
export function turnLimitBytes(env: string | undefined): number {
  return rescanIntervalMs(env, TURN_LIMIT_BYTES)
}

type ReadRanges = (source: string, ranges: readonly ByteRange[]) => Promise<{ texts: string[]; bytesRead: number }>

export type TurnRead =
  | { question: string; body: string; bodyBytes: number; bytesRead: number }
  /** Over the limit: only the question was read, and the body's length is what the reason shows */
  | { question: string; body: null; bodyBytes: number; bytesRead: number }

/** A turn's question and, when its body is within the limit, its body, in one read */
export async function readTurnRanges(
  read: ReadRanges,
  source: string,
  rec: readonly [number, number, number, ...unknown[]],
  limit: number
): Promise<TurnRead> {
  const question = { start: rec[0], end: rec[1] }
  const bodyBytes = rec[2] - rec[1]
  if (bodyBytes > limit) {
    const { texts, bytesRead } = await read(source, [question])
    return { question: texts[0], body: null, bodyBytes, bytesRead }
  }
  const { texts, bytesRead } = await read(source, [question, { start: rec[1], end: rec[2] }])
  return { question: texts[0], body: texts[1], bodyBytes, bytesRead }
}
