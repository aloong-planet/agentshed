// Searching this project's sessions (spec session-view D1–D4).
//
// - Question mode (the default): the engine module reads each question's range by the offset index and matches its
//   text, as the question list shows it, as global search matches a question (D4, question-search.ts): every letter's
//   other case, quotes and backslashes as written, the words either side of a line break with a space between them.
//   The stripped question set contains no fork replay copies by construction (03b), so nothing needs folding.
// - Full-text mode: the engine module searches the file's stream line by line on a thread of its own
//   (full-text.ts), never holding it whole, and maps each hit to its turn by its offset. Hits outside the
//   displayed range
//   — an already-stripped fork prefix, Claude's abandoned branches, the noise before the first question — count as
//   folded rather than masquerading as
//   reachable hits (D3: a fork's replay copies repeat its parent's text, and without folding the same
//   sentence is reported once per generation). A hit inside a question's own range is question mode's, so the question
//   hits are question mode's, and the search of the questions is asked after the full-text one for the texts its body
//   hits show as well: a cold rollout is read through twice, as it was when the questions were searched first.
//   The full-text toggle exists for **hit quality** (full text hits tool output noise), not performance.
import type { SearchHit, SearchResult, SessionMeta } from '@shared/domain'
import { searchFullText, type FullTextFound } from './full-text'
import { searchQuestions, type QuestionFound } from './question-search'
import type { TokenEngine } from './token-stats'
import type { ScanRoots } from './types'

export async function searchProjectSessions(
  /** Where the question indexes are read: the scan worker's client in the app (ADR-0043) */
  engine: Pick<TokenEngine, 'sessionQuestions'>,
  roots: ScanRoots,
  sessions: readonly SessionMeta[],
  needle: string,
  fullText: boolean
): Promise<SearchResult> {
  const k = needle.trim()
  const result: SearchResult = { groups: [], totalHits: 0, sessionCount: 0, folded: 0 }
  if (k === '') return result

  for (const s of sessions) {
    let q
    try {
      q = await engine.sessionQuestions(roots, s.file)
    } catch {
      // An unreadable session only hurts itself: skip it without dragging down the whole search
      continue
    }
    const recs = q.questions

    // ── Full text: the engine module's search of the file's stream; hits outside the displayed range → folded ──
    let found: FullTextFound = { folded: 0, body: [] }
    if (fullText) {
      try {
        found = await searchFullText(
          q.side,
          q.source,
          k,
          recs.map((r) => ({ start: r[0], questionEnd: r[1], end: r[2] }))
        )
      } catch {
        // A file that cannot be searched to its end loses its full-text hits alone: nothing of that search counts, and
        // its question hits stand
      }
    }

    // ── The questions: those that hit, and the texts the body hits show ──
    // From the file the ranges are in: the session file, or an Antigravity conversation's transcript
    let questions: QuestionFound[]
    try {
      questions = await searchQuestions(
        q.side,
        q.source,
        k,
        recs.map((r) => ({ start: r[0], end: r[1] })),
        found.body.map((b) => b.turn)
      )
    } catch {
      // A file that exists and cannot be read only hurts itself too, as above: its full-text search with it
      continue
    }
    const text = new Map(questions.map((f) => [f.question, f.text]))
    const hits: SearchHit[] = []
    for (const f of questions) {
      if (f.hit) hits.push({ i: f.question + 1, text: f.text, at: recs[f.question][3], inBody: false, snippet: null })
    }
    result.folded += found.folded
    for (const { turn: t, snippet } of found.body) {
      hits.push({ i: t + 1, text: text.get(t) ?? null, at: recs[t][3], inBody: true, snippet })
    }
    hits.sort((x, y) => x.i - y.i || Number(x.inBody) - Number(y.inBody))

    if (hits.length > 0) {
      result.groups.push({
        file: s.file,
        title: q.title,
        side: q.side,
        forkState: q.forkState,
        at: q.at,
        hits
      })
      result.totalHits += hits.length
      result.sessionCount++
    }
  }
  return result
}
