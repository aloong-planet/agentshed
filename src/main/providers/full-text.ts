// The full-text search of one session file (spec session-view D2, D3): the engine module reads the file's stream line
// by line on a thread of its own, a cold rollout's decompressed as it is read, and never holds it whole, so a file's
// size no longer bounds what can be searched (its longest line still does) and nothing of it is read on the main
// process's thread (C2). It maps each hit to its turn there,
// and hands back only what the search shows: the hits that fall in no turn (folded), and each turn with a hit in its
// body, with the snippet of its first. A cold rollout's search takes one of the places its reads share (cold-rollout.ts).
import type { AgentSide } from '@shared/domain'
import { threadEngineModule } from '../engine-module'
import { inColdPlace, isColdRollout } from './cold-rollout'

/** A turn as the question index records it: its question `[start, questionEnd)` and the turn `[start, end)` */
export interface TurnBounds {
  start: number
  questionEnd: number
  end: number
}

export interface FullTextFound {
  /** The hits that fall in no turn */
  folded: number
  /** Each turn with a hit in its body, by its index among the turns, ascending, with the snippet of its first */
  body: Array<{ turn: number; snippet: string | null }>
}

/**
 * Searches `file`, a session file of the side `side`, for `needle` against its `turns`. Rejects when the file cannot be
 * read to its end, its stream turns out cut short (spec token-stats B12) or the search panics; nothing found is then
 * given.
 */
export async function searchFullText(side: AgentSide, file: string, needle: string, turns: readonly TurnBounds[]): Promise<FullTextFound> {
  const search = (): Promise<FullTextFound> => threadEngineModule().searchFullText(side, file, needle, turns)
  const found = await (isColdRollout(file) ? inColdPlace(search) : search())
  return { folded: found.folded, body: found.body.map((b) => ({ turn: b.turn, snippet: b.snippet ?? null })) }
}
