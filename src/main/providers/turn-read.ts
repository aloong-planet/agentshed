// A turn's read for the session page (session-view C2): its question's range and its body's, in one pass through the
// session file that stops at the turn's end, by the engine module (ADR-0054). The body is read line by line there, so
// that no allocation holds the whole body but a line of it (#485): not its bytes, not its text in one string, not a split
// of it. A side whose turns the module assembles has its blocks handed over, each line let go once it is read; any other
// side, the lines the turn holds, which turn-content.ts assembles (ADR-0047). At its peak the read holds the body's text
// twice: the module's lines and the strings made from them, or for an assembled turn the module's lines and blocks and
// the strings made from the blocks.
import type { AgentSide, TurnBlock } from '@shared/domain'
import { threadEngineModule } from '../engine-module'
import { inColdPlace, isColdRollout } from './cold-rollout'
import type { ByteRange } from './range-read'

/** A turn's body as its read hands it over: its blocks, of a side whose turns the engine module assembles; otherwise
 * the lines of the body the turn holds, each as text with its line feed left off */
export type TurnBody = { blocks: TurnBlock[] } | { lines: string[] }

export interface TurnRead {
  /** The question's text, its range's bytes decoded as `Buffer.toString('utf8')` decodes them */
  question: string
  /** The body; null when no body was asked */
  body: TurnBody | null
  /** How far into the file's stream the read went from where it started (the engine module's `readTurn`) */
  bytesRead: number
}

/**
 * Reads a turn of `file`, a session file of `side`: the question's range and, when `body` is given, the body's.
 * A cold rollout's read takes one of the cold places (cold-rollout.ts), shared with its range reads and full-text
 * searches, and runs on a thread of the module's own; a plain file's runs on the thread pool the main process's reads
 * of plain files share (session-view D2b). Rejects as the engine module's read does.
 */
export async function readTurn(side: AgentSide, file: string, question: ByteRange, body: ByteRange | null): Promise<TurnRead> {
  const read = () => threadEngineModule().readTurn(side, file, question, body)
  const got = await (isColdRollout(file) ? inColdPlace(read) : read())
  const turn: TurnBody = 'blocks' in got ? { blocks: got.blocks } : { lines: got.lines }
  return { question: got.question.toString('utf8'), body: body === null ? null : turn, bytesRead: got.bytesRead }
}
