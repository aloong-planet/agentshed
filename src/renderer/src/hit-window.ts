// Where a hit row starts when its keyword would be out of view (session-view::REQ-002). Characters are counted
// as written — one outside the basic plane, such as an emoji, counts as one — so a moved start never cuts one in
// two. Which text a row shows is decided by laying it out (SessionHits.tsx); this only says what the
// candidates are.

/** Characters of context kept before the keyword when a row is moved (REQ-002/AC-02) */
const BEFORE = 20

/**
 * The candidate texts for a row whose first occurrence of the keyword would be out of view: `before` starts 20
 * characters before that occurrence, `at` starts at the occurrence itself, each after an ellipsis. `before` is
 * null when the occurrence lies within the first 20 characters (it would be the whole text); both are null when
 * the keyword opens the text or is not in it. The occurrence is found case-insensitively, as the highlight
 * finds it.
 */
export function hitWindow(text: string, needle: string): { before: string | null; at: string | null } {
  const i = needle === '' ? -1 : text.toLowerCase().indexOf(needle.toLowerCase())
  if (i <= 0) return { before: null, at: null }
  const chars = Array.from(text)
  const at = Array.from(text.slice(0, i)).length
  return {
    before: at > BEFORE ? `…${chars.slice(at - BEFORE).join('')}` : null,
    at: `…${chars.slice(at).join('')}`
  }
}
