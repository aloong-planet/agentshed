// Searching this project's sessions (ticket 08, spec D1–D4).
//
// - Question mode (the default): a coarse pass over **raw bytes** read range by range from the offsets
//   (readRangeBuffers, no decoding),
//   decoding and parsing only the matching ranges to get the text (D2). The stripped question set
//   contains no fork replay
//   copies by construction (03b), so nothing needs folding.
// - Full-text mode: read the file whole + byte matching, with hits mapped back to their turn by binary
//   search on the offset. Hits outside the displayed range
//   — an already-stripped fork prefix, Claude's abandoned branches, the noise before the first question —
//   count as folded rather than masquerading as
//   reachable hits (D3: 54.7% of Codex bytes are replay copies, and without folding the same sentence is
//   reported once per generation).
//   The full-text toggle exists for **hit quality** (full text hits tool output noise), not performance.
// - Case: searchBytes folds at the byte level (never decode + toLowerCase over everything — spec D2
//   measured 391 ms as the
//   counter-example); after a hit, **re-verify** with the parsed text to guard against byte-level false
//   hits from JSON escape sequences (\n, \" and so on)
//   — the re-verification touches only the matching ranges and does not change the "no reading whole, no
//   parsing everything" cost structure.
import { readFile } from 'node:fs/promises'
import type { SearchHit, SearchResult, SessionMeta } from '@shared/domain'
import { questionTextAt, type QuestionRec } from './question-index'
import { readRangeBuffers } from './range-read'
import { searchBytes } from './search-bytes'
import type { TokenEngine } from './token-stats'
import type { ScanRoots } from './types'

const fold = (s: string): string => s.toLowerCase()

/** The first string value in the matching line's JSON that contains the needle → a context snippet
 * (20 characters before and 60 after) */
function extractSnippet(lineText: string, needle: string): string | null {
  let obj: unknown
  try {
    obj = JSON.parse(lineText)
  } catch {
    return null
  }
  const needleF = fold(needle)
  const walk = (v: unknown): string | null => {
    if (typeof v === 'string') {
      const idx = fold(v).indexOf(needleF)
      if (idx === -1) return null
      const from = Math.max(0, idx - 20)
      const to = Math.min(v.length, idx + needle.length + 60)
      return `${from > 0 ? '…' : ''}${v.slice(from, to)}${to < v.length ? '…' : ''}`
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = walk(x)
        if (r !== null) return r
      }
      return null
    }
    if (typeof v === 'object' && v !== null) {
      for (const x of Object.values(v)) {
        const r = walk(x)
        if (r !== null) return r
      }
    }
    return null
  }
  return walk(obj)
}

/** A hit offset → the index of the displayed turn it falls in (the range [question start, turn end);
 * returns -1 when it is in no turn) */
function turnIndexOf(recs: readonly QuestionRec[], off: number): number {
  let lo = 0
  let hi = recs.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (off < recs[mid][0]) hi = mid - 1
    else if (off >= recs[mid][2]) lo = mid + 1
    else return mid
  }
  return -1
}

/** Search outwards from the hit offset for the line boundaries (0x0A) and slice out that line's text */
function lineAround(buf: Buffer, off: number): string {
  let start = buf.lastIndexOf(0x0a, off) + 1
  let end = buf.indexOf(0x0a, off)
  if (end === -1) end = buf.length
  return buf.subarray(start, end).toString('utf8')
}

export async function searchProjectSessions(
  engine: TokenEngine,
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
    const { bufs } = await readRangeBuffers(
      s.file,
      recs.map((r) => ({ start: r[0], end: r[1] }))
    )
    const parseQ = (idx: number): { text: string; at: number | null } | null => {
      const cached = qText.get(idx)
      if (cached) return cached
      try {
        const obj: unknown = JSON.parse(bufs[idx].toString('utf8').trim())
        if (typeof obj !== 'object' || obj === null) return null
        const text = questionTextAt(q.side, obj as Record<string, unknown>)
        if (text === null) return null
        const v = { text, at: recs[idx][3] }
        qText.set(idx, v)
        return v
      } catch {
        return null
      }
    }
    for (let idx = 0; idx < recs.length; idx++) {
      if (searchBytes(bufs[idx], k).length === 0) continue
      const parsed = parseQ(idx)
      // Re-verify: the clean parsed text really does contain the needle (eliminating byte-level false
      // hits from JSON escaping)
      if (!parsed || !fold(parsed.text).includes(kF)) continue
      hits.push({ i: idx + 1, text: parsed.text, at: parsed.at, inBody: false, snippet: null })
    }

    // ── Full text: read whole + map hits back to turns; outside the displayed range → folded ──
    if (fullText) {
      let whole: Buffer
      try {
        whole = await readFile(s.file)
      } catch {
        whole = Buffer.alloc(0)
      }
      const bodyHit = new Set<number>()
      const bodySnippet = new Map<number, string | null>()
      for (const off of searchBytes(whole, k)) {
        const t = turnIndexOf(recs, off)
        if (t === -1) {
          result.folded++
          continue
        }
        if (off < recs[t][1]) continue // A hit on the question line was already collected by the question path
        if (bodyHit.has(t)) continue // Several body hits in one turn are reported once
        bodyHit.add(t)
        bodySnippet.set(t, extractSnippet(lineAround(whole, off), k))
      }
      for (const t of [...bodyHit].sort((x, y) => x - y)) {
        const parsed = parseQ(t)
        hits.push({
          i: t + 1,
          text: parsed?.text ?? null,
          at: parsed?.at ?? recs[t][3],
          inBody: true,
          snippet: bodySnippet.get(t) ?? null
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
