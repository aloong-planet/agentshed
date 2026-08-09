// Byte-level substring search (ticket 08, spec D2): find every hit of a needle in a raw UTF-8 Buffer,
// case-insensitive for ASCII letters — **without decoding + toLowerCase over everything** (measured
// 391 ms, 17× the cost of
// the search itself). The approach:
// - a needle with no ASCII letters → a plain Buffer.indexOf loop (the SIMD fast path, measured
//   27 ms per 92 MB);
// - with letters → pick an **anchor** for a coarse indexOf pass, then compare candidate positions byte by
//   byte with case folding.
//   The anchor is the longest letter-free byte run in the needle (wide characters, digits, symbols —
//   case-independent, so indexOf works directly);
//   an all-letter needle scans with both cases of its first letter.
// UTF-8 safe: every byte of a multi-byte character is ≥0x80 while folding only touches
// 0x41-0x5A/0x61-0x7A,
// so a multi-byte character is never folded by mistake; both the needle and the text are valid UTF-8, and
// a byte sequence spanning characters is not a valid needle.
const A = 0x41
const Z = 0x5a
const a = 0x61
const z = 0x7a

const isUpper = (b: number): boolean => b >= A && b <= Z
const isAlpha = (b: number): boolean => isUpper(b) || (b >= a && b <= z)
const fold = (b: number): number => (isUpper(b) ? b + 32 : b)

/** Exact comparison at a candidate position: fold buf[pos..] byte by byte against the pre-folded needle */
function foldEq(buf: Buffer, pos: number, needleFolded: Buffer): boolean {
  if (pos < 0 || pos + needleFolded.length > buf.length) return false
  for (let i = 0; i < needleFolded.length; i++) {
    if (fold(buf[pos + i]) !== needleFolded[i]) return false
  }
  return true
}

/** The longest run of consecutive letter-free bytes in the needle (the case-independent indexOf anchor) */
function bestAnchor(needle: Buffer): { start: number; len: number } {
  let bestStart = 0
  let bestLen = 0
  let runStart = 0
  let runLen = 0
  for (let i = 0; i <= needle.length; i++) {
    if (i < needle.length && !isAlpha(needle[i])) {
      if (runLen === 0) runStart = i
      runLen++
    } else {
      if (runLen > bestLen) {
        bestLen = runLen
        bestStart = runStart
      }
      runLen = 0
    }
  }
  return { start: bestStart, len: bestLen }
}

/**
 * Return every byte offset in buf where the needle hits (overlaps allowed, advancing one byte at a time).
 * Case-insensitive for ASCII letters; an empty needle returns nothing.
 */
export function searchBytes(buf: Buffer, needle: string): number[] {
  if (needle === '') return []
  const nRaw = Buffer.from(needle, 'utf8')
  const nFolded = Buffer.from(nRaw.map((b) => fold(b)))
  const out: number[] = []

  const anchor = bestAnchor(nRaw)
  if (anchor.len === nRaw.length) {
    // No letters anywhere: take the SIMD indexOf fast path directly
    let from = 0
    for (;;) {
      const i = buf.indexOf(nRaw, from)
      if (i === -1) break
      out.push(i)
      from = i + 1
    }
    return out
  }

  if (anchor.len > 0) {
    // Use the letter-free run as the anchor: a coarse indexOf pass → an exact folded comparison
    const anchorBuf = nRaw.subarray(anchor.start, anchor.start + anchor.len)
    let from = 0
    for (;;) {
      const i = buf.indexOf(anchorBuf, from)
      if (i === -1) break
      const pos = i - anchor.start
      if (foldEq(buf, pos, nFolded)) out.push(pos)
      from = i + 1
    }
    return out
  }

  // An all-letter needle: scan with both cases of the first letter, then merge, deduplicate and compare
  // exactly
  const lo = nFolded[0]
  const hi = isUpper(lo - 32) ? lo - 32 : lo
  const candidates: number[] = []
  for (const first of hi === lo ? [lo] : [lo, hi]) {
    const one = Buffer.from([first])
    let from = 0
    for (;;) {
      const i = buf.indexOf(one, from)
      if (i === -1) break
      candidates.push(i)
      from = i + 1
    }
  }
  candidates.sort((x, y) => x - y)
  let prev = -1
  for (const pos of candidates) {
    if (pos === prev) continue
    prev = pos
    if (foldEq(buf, pos, nFolded)) out.push(pos)
  }
  return out
}
