// Where a keyword occurs in a hit row's text (session-view::REQ-002): found case-insensitively on the text's
// lowercase, as global search's `includes` finds it, and given as offsets of the text itself. The two differ when a
// letter lowers to a different number of UTF-16 units — İ (U+0130) lowers to i and U+0307 — so an offset of the
// lowercase would cut the text one unit late for every such letter before it.
//
// Each lowered unit is traced to the character it came from by that character's own lowercase. This matches the
// lowercase of the whole text unit for unit: the only mapping `toLowerCase` makes by context, the final sigma, gives
// one unit either way (an enumeration of every code point found İ the only one whose lowercase changes length, and
// the final sigma the only context-dependent one, under Node 24 and 26).

/** An occurrence as offsets of the text: it starts at `start` and ends before `end` */
export interface Occurrence {
  start: number
  end: number
}

/**
 * Every occurrence of `needle` in `text`, case-insensitively, in order and not overlapping; none when the needle is
 * empty. An occurrence covers every character one of its lowered units came from, so it never cuts a character in
 * two, and the next one is looked for after that last character.
 */
export function occurrences(text: string, needle: string): Occurrence[] {
  if (needle === '') return []
  const lower = text.toLowerCase()
  const k = needle.toLowerCase()
  // from[u]: the offset in text of the character lowered unit u came from; unit[i]: the first lowered unit of the
  // character at offset i, for every offset a character starts at and for text.length
  const from: number[] = []
  const unit: number[] = []
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i) as number)
    unit[i] = from.length
    for (let n = ch.toLowerCase().length; n > 0; n--) from.push(i)
    i += ch.length
  }
  unit[text.length] = lower.length
  const found: Occurrence[] = []
  for (let u = lower.indexOf(k); u !== -1; ) {
    const last = from[u + k.length - 1]
    const end = last + String.fromCodePoint(text.codePointAt(last) as number).length
    found.push({ start: from[u], end })
    u = lower.indexOf(k, unit[end])
  }
  return found
}
