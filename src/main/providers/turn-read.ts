// A turn's read for the session page (session-view C2): its question's range and its body's, in one pass through the
// session file that stops at the turn's end, by the engine module (ADR-0045) on a thread of its own. The body is read
// line by line there and handed over as the lines the turn holds, so that no copy of the whole body is made (#485): not
// its bytes, not its text in one string, not a split of it.
import type { AgentSide } from '@shared/domain'
import { threadEngineModule } from '../engine-module'
import { inColdPlace, isColdRollout, placesOf } from './cold-rollout'
import type { ByteRange } from './range-read'

/**
 * How many turn reads of plain files run at once on a thread, the others waiting their turn, in the order asked. Four,
 * as many as the range reads they replace ran on libuv's pool of four. A queue apart from the cold rollouts' four
 * places, so that a plain turn's read never waits behind seconds-long decompressions of cold rollouts a search asked
 * for.
 */
const PLAIN_TURN_READS_AT_ONCE = 4
const inPlainPlace = placesOf(PLAIN_TURN_READS_AT_ONCE)

export interface TurnLines {
  /** The question's text, its range's bytes decoded as `Buffer.toString('utf8')` decodes them */
  question: string
  /** The lines of the body the turn holds, each as text with its line feed left off; null when no body was asked */
  lines: string[] | null
  /** How far into the file's stream the read went from where it started (the engine module's `readTurn`) */
  bytesRead: number
}

/**
 * Reads a turn of `file`, a session file of `side`: the question's range and, when `body` is given, the body's.
 * A cold rollout's read takes one of the cold places (cold-rollout.ts), shared with its range reads and full-text
 * searches; a plain file's, one of the plain turn reads' places. Rejects as the engine module's read does.
 */
export async function readTurnLines(side: AgentSide, file: string, question: ByteRange, body: ByteRange | null): Promise<TurnLines> {
  const read = () => threadEngineModule().readTurn(side, file, question, body)
  const got = await (isColdRollout(file) ? inColdPlace(read) : inPlainPlace(read))
  return { question: got.question.toString('utf8'), lines: body === null ? null : got.lines, bytesRead: got.bytesRead }
}
