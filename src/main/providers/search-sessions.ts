// 本项目会话搜索(票 08,spec D1-D4)。
//
// - 提问模式(默认):按偏移逐区间读**原始字节**粗筛(readRangeBuffers,不 decode),
//   只对命中的区间 decode + parse 取文本(D2)。剥离后的提问集天然不含 fork 重放
//   副本(03b),无需折叠。
// - 全文模式:整读文件 + 字节匹配;命中按偏移二分归轮。落在展示区间之外的命中
//   ——fork 已剥前缀、Claude 被放弃分支、首问前噪声区——计入 folded,不冒充
//   可达命中(D3:Codex 54.7% 字节是重放副本,不折叠会让同一句话每代各报一次)。
//   全文开关的立命理由是**命中质量**(全文会命中工具输出噪声),不是性能。
// - 大小写:searchBytes 字节折叠(不整体 decode+toLowerCase,spec D2 实测 391ms
//   反例);命中后用解析出的文本**复验**,防 JSON 转义序列(\n、\" 等)的字节级
//   假命中——复验只对命中区间做,不改变"不整读不全解析"的成本结构。
import { readFile } from 'node:fs/promises'
import type { SearchHit, SearchResult, SessionMeta } from '@shared/domain'
import { questionTextAt, type QuestionRec } from './question-index'
import { readRangeBuffers } from './range-read'
import { searchBytes } from './search-bytes'
import type { TokenEngine } from './token-stats'
import type { ScanRoots } from './types'

const fold = (s: string): string => s.toLowerCase()

/** 命中行 JSON 里首个包含 needle 的字符串值 → 上下文片段(needle 前 20 后 60 字符) */
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

/** 命中偏移 → 所在展示轮的下标(区间 [提问起, 轮止);不在任何轮内返回 -1) */
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

/** 从命中偏移向前后找行边界(0x0A),切出该行文本 */
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
      // 单会话读不了只自伤:跳过该会话,不拖垮整次搜索
      continue
    }
    const recs = q.questions
    const hits: SearchHit[] = []
    /** 提问文本缓存(全文模式正文命中也要展示所在轮的提问) */
    const qText = new Map<number, { text: string; at: number | null }>()

    // ── 提问粗筛:原始字节区间,只对命中的条 decode + parse ──
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
      // 复验:解析出的干净文本确实含 needle(剔除 JSON 转义的字节级假命中)
      if (!parsed || !fold(parsed.text).includes(kF)) continue
      hits.push({ i: idx + 1, text: parsed.text, at: parsed.at, inBody: false, snippet: null })
    }

    // ── 全文:整读 + 命中归轮;展示区间外 → folded ──
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
        if (off < recs[t][1]) continue // 提问行命中已由提问通路收录,不重复计
        if (bodyHit.has(t)) continue // 同轮多处正文命中只报一条
        bodyHit.add(t)
        bodySnippet.set(t, extractSnippet(lineAround(whole, off), k))
      }
      for (const t of [...bodyHit].sort((x, y) => x - y)) {
        const parsed = parseQ(t)
        hits.push({
          i: t + 1,
          text: parsed?.text ?? '(该行已无法读取)',
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
