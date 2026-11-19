// A project's question search over one session file (spec session-view D2, D4): the engine module reads each
// question's range, a plain file's where it lies on the thread pool the main process's reads of plain files share
// (D2b), a cold rollout's in one pass of its stream on a thread of its own, and matches the question's text, as the
// question list shows it, as global search matches a question (global-search S6). Only the questions the search shows
// cross back: those that hit, and those asked for apart, whose text a body hit of full-text mode shows.
import type { AgentSide } from '@shared/domain'
import { threadEngineModule } from '../engine-module'
import { inColdPlace, isColdRollout } from './cold-rollout'
import type { ByteRange } from './range-read'

export interface QuestionFound {
  /** Its index among the questions asked about */
  question: number
  /** Its text, as the question list shows it; null when its range holds no question */
  text: string | null
  /** Whether it holds the needle */
  hit: boolean
}

/**
 * Searches the `questions` of `file`, a session file of the side `side`, for `needle`: each question that holds it, and
 * each at an index `also` names whether or not it does, ascending by index. A cold rollout's search takes one of the
 * cold places (cold-rollout.ts). Rejects when the file cannot be read as far as its questions go, its stream turns out
 * cut short (spec token-stats B12) or the search panics.
 */
export async function searchQuestions(
  side: AgentSide,
  file: string,
  needle: string,
  questions: readonly ByteRange[],
  also: readonly number[] = []
): Promise<QuestionFound[]> {
  const search = () => threadEngineModule().searchQuestions(side, file, needle, questions, also)
  const found = await (isColdRollout(file) ? inColdPlace(search) : search())
  return found.map((q) => ({ question: q.question, text: q.text ?? null, hit: q.hit }))
}
