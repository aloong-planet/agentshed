// Searching this project's sessions (ticket 08, spec D1–D4).
//
// - Question mode (the default): a coarse pass over **raw bytes** read range by range from the offsets
//   (readRangeBuffers, no decoding),
//   decoding and parsing only the matching ranges to get the text (D2). The stripped question set
//   contains no fork replay
//   copies by construction (03b), so nothing needs folding.
// - Full-text mode: the engine module searches the file's stream line by line on a thread of its own
//   (full-text.ts), never holding it whole, and maps each hit to its turn by its offset. Hits outside the
//   displayed range
//   — an already-stripped fork prefix, Claude's abandoned branches, the noise before the first question —
//   count as folded rather than masquerading as
//   reachable hits (D3: a fork's replay copies repeat its parent's text, and without folding the same
//   sentence is reported once per generation).
//   The full-text toggle exists for **hit quality** (full text hits tool output noise), not performance.
// - Case: searchBytes folds at the byte level (never decode + toLowerCase over everything — spec D2
//   measured 391 ms as the
//   counter-example); after a hit, **re-verify** with the parsed text to guard against byte-level false
//   hits from JSON escape sequences (\n, \" and so on)
//   — the re-verification touches only the matching ranges and does not change the "no reading whole, no
//   parsing everything" cost structure.
import type { SearchHit, SearchResult, SessionMeta } from '@shared/domain'
import { threadEngineModule } from '../engine-module'
import { searchFullText, type FullTextFound } from './full-text'
import { readRangeBuffers } from './range-read'
import { searchBytes } from './search-bytes'
import type { TokenEngine } from './token-stats'
import type { ScanRoots } from './types'

const fold = (s: string): string => s.toLowerCase()

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
  const kF = fold(k)

  for (const s of sessions) {
    let q
    try {
      q = await engine.sessionQuestions(roots, s.file)
    } catch {
      // An unreadable session only hurts itself: skip it without dragging down the whole search
      continue
    }
    const recs = q.questions
    const hits: SearchHit[] = []
    /** A cache of question text (a body hit in full-text mode also displays its turn's question) */
    const qText = new Map<number, { text: string; at: number | null }>()

    // ── The coarse question pass: raw byte ranges, decoding and parsing only the entries that hit ──
    // From the file the ranges are in: the session file, or an Antigravity conversation's transcript
    let bufs: Buffer[]
    try {
      ;({ bufs } = await readRangeBuffers(
        q.source,
        recs.map((r) => ({ start: r[0], end: r[1] }))
      ))
    } catch {
      // A file that exists and cannot be read only hurts itself too, as above
      continue
    }
    const parseQ = (idx: number): { text: string; at: number | null } | null => {
      const cached = qText.get(idx)
      if (cached) return cached
      const text = threadEngineModule().questionText(q.side, bufs[idx].toString('utf8'))
      if (text === null) return null
      const v = { text, at: recs[idx][3] }
      qText.set(idx, v)
      return v
    }
    for (let idx = 0; idx < recs.length; idx++) {
      if (searchBytes(bufs[idx], k).length === 0) continue
      const parsed = parseQ(idx)
      // Re-verify: the clean parsed text really does contain the needle (eliminating byte-level false
      // hits from JSON escaping)
      if (!parsed || !fold(parsed.text).includes(kF)) continue
      hits.push({ i: idx + 1, text: parsed.text, at: parsed.at, inBody: false, snippet: null })
    }

    // ── Full text: the engine module's search of the file's stream; hits outside the displayed range → folded ──
    if (fullText) {
      let found: FullTextFound = { folded: 0, body: [] }
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
      result.folded += found.folded
      for (const { turn: t, snippet } of found.body) {
        const parsed = parseQ(t)
        hits.push({
          i: t + 1,
          text: parsed?.text ?? null,
          at: parsed?.at ?? recs[t][3],
          inBody: true,
          snippet
        })
      }
      hits.sort((x, y) => x.i - y.i || Number(x.inBody) - Number(y.inBody))
    }

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
