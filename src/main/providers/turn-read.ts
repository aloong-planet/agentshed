// A turn's read for the session page (session-view C2): its question's range and its body's, in one pass through the
// session file that stops at the turn's end, by the engine module (ADR-0045). The body is read line by line there and
// handed over as the lines the turn holds, so that no allocation holds the whole body but a line of it (#485): not its
// bytes, not its text in one string, not a split of it. At its peak the read holds the body's text twice, the module's
// lines and the strings made from them.
import type { AgentSide } from '@shared/domain'
import { threadEngineModule } from '../engine-module'
import { inColdPlace, isColdRollout } from './cold-rollout'
import type { ByteRange } from './range-read'

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
 * searches, and runs on a thread of the module's own; a plain file's runs on the thread pool the main process's reads
 * of plain files share (session-view D2b). Rejects as the engine module's read does.
 */
export async function readTurnLines(side: AgentSide, file: string, question: ByteRange, body: ByteRange | null): Promise<TurnLines> {
  const read = () => threadEngineModule().readTurn(side, file, question, body)
  const got = await (isColdRollout(file) ? inColdPlace(read) : read())
  return { question: got.question.toString('utf8'), lines: body === null ? null : got.lines, bytesRead: got.bytesRead }
}
