// The shared core of the working-language gates (ADR-0017, ADR-0030): which characters count as Chinese,
// and the prose rule "Chinese may be cited, never written". scripts/check-lang.mjs applies it to the files
// in the repository; scripts/check-message-lang.mjs applies it to commit messages and pull-request text.
//
// Every Chinese character and CJK quoting mark in this file is written as an escape, so the file itself
// holds no Chinese and needs no exemption from the gate that imports it.

// Ideographs, CJK punctuation and fullwidth forms: U+4E00–U+9FFF, U+3000–U+303F, U+FF00–U+FFEF. The
// punctuation range was added after a real miss: the fork banner hard-coded Chinese book-title marks in a
// component, so all six UIs rendered one — including Japanese, whose own dictionary already quoted the same
// title with the marks U+300E/U+300F — and the gate stayed green throughout, because U+300A sits below the
// ideograph range.
export const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/
export const CJK_G = new RegExp(CJK.source, 'g')

/** Ranges inside a quoting span on one line — the shape prose uses to cite a foreign string */
const QUOTE_PAIRS = [
  ['`', '`'],
  ["'", "'"],
  ['"', '"'],
  ['\u201c', '\u201d'],
  ['\u2018', '\u2019'],
  ['\u00ab', '\u00bb'],
  ['\u300c', '\u300d']
]
export function quotedRanges(line) {
  const ranges = []
  for (const [open, close] of QUOTE_PAIRS) {
    let i = 0
    while (i < line.length) {
      const a = line.indexOf(open, i)
      if (a < 0) break
      const b = line.indexOf(close, a + 1)
      if (b < 0) break
      // The marks themselves are inside the span: corner brackets are CJK punctuation, so leaving them out
      // would report the delimiter of a correct citation as Chinese written outside a quote
      ranges.push([a, b + 1])
      i = b + 1
    }
  }
  return ranges
}
export const within = (pos, ranges) => ranges.some(([a, b]) => pos >= a && pos < b)

/**
 * Line indexes (0-based) inside a **closed** fenced code block, the fence lines included — prose quoting a
 * block of output or copy. A fence is three or more backticks or tildes at the start of a line (up to three
 * spaces of indent, an info string allowed); it closes on a line of the same character, at least as long,
 * with nothing after it but whitespace. An unclosed fence exempts nothing: otherwise one stray fence would
 * turn the rest of the text into a citation.
 */
export function fencedLines(lines) {
  const inside = new Set()
  let open = null
  for (const [i, line] of lines.entries()) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (open === null) {
      if (m) open = { i, ch: m[1][0], len: m[1].length }
      continue
    }
    if (m && m[1][0] === open.ch && m[1].length >= open.len && /^ {0,3}(`{3,}|~{3,})\s*$/.test(line)) {
      for (let k = open.i; k <= i; k++) inside.add(k)
      open = null
    }
  }
  return inside
}

/**
 * The prose rule on its own: the lines that **write** Chinese rather than cite it, as [lineNumber, line]
 * pairs (1-based). A line qualifies when some Chinese character on it sits outside every quoting span and
 * the line is not inside a closed fenced code block.
 */
export function proseViolations(text) {
  const bad = []
  const lines = text.split('\n')
  const fenced = fencedLines(lines)
  for (const [i, line] of lines.entries()) {
    if (!CJK.test(line) || fenced.has(i)) continue
    const quotes = quotedRanges(line)
    CJK_G.lastIndex = 0
    let m
    while ((m = CJK_G.exec(line))) {
      if (!within(m.index, quotes)) {
        bad.push([i + 1, line])
        break
      }
    }
  }
  return bad
}
