// Read the app's stylesheet the way the prototype sync scripts derive from it: a section between two
// comment markers, cut into its blocks, each declaration kept exactly as the app wrote it.
//
// **Why not jsdom's CSS parser.** Its declaration parser silently drops values it cannot parse — a
// shorthand carrying var() (border-color: var(--line)), a flex shorthand, content: attr(…) — and a derived
// file missing a declaration reads exactly like a correct one. Cutting the text keeps every declaration.
// The cut skips over quoted strings, and a declaration is only ended by a semicolon outside parentheses,
// so neither a brace in a string nor the semicolon of a data: URL splits anything.

/** The text between the first `from` and the next `to`; a marker that has moved is an error */
export function section(css, [from, to]) {
  const a = css.indexOf(from)
  const b = a < 0 ? -1 : css.indexOf(to, a)
  if (a < 0 || b < 0) throw new Error(`theme.css: cannot find the section "${from}" … "${to}" — has it been renamed?`)
  return css.slice(a, b)
}

/** Calls visit(char, index) for every character outside a quoted string; returns false from visit to stop */
function outsideStrings(src, visit) {
  let quote = null
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else visit(c, i)
  }
  if (quote) throw new Error('an unterminated string')
}

/** The top-level blocks of a fragment, comments removed: [{ prelude, body }], where prelude is the
 * selector list or at-rule with its whitespace collapsed and body the raw text between the braces */
export function blocks(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let depth = 0
  let start = 0
  let open = -1
  outsideStrings(src, (c, i) => {
    if (c === '{') {
      if (depth++ === 0) open = i
    } else if (c === '}') {
      if (--depth < 0) throw new Error('unbalanced braces')
      if (depth === 0) {
        out.push({ prelude: src.slice(start, open).trim().replace(/\s+/g, ' '), body: src.slice(open + 1, i) })
        start = i + 1
      }
    }
  })
  if (depth !== 0 || src.slice(start).trim()) throw new Error('unbalanced braces or text outside a block')
  return out
}

/** A block body's declarations, each with its line breaks and indentation folded to single spaces */
export function declarations(body) {
  const out = []
  let paren = 0
  let start = 0
  outsideStrings(body, (c, i) => {
    if (c === '(') paren++
    else if (c === ')') paren--
    else if (c === ';' && paren === 0) {
      out.push(body.slice(start, i))
      start = i + 1
    }
  })
  out.push(body.slice(start))
  const decls = out.map((d) => d.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean)
  for (const d of decls) if (!/^(--[\w-]+|-?[a-z][-a-z]*)\s*:/.test(d)) throw new Error(`not a declaration: "${d}"`)
  return decls
}

/** A rule with the given selector and the body's declarations, one per line */
export function rule(selector, body) {
  return `${selector} {\n${declarations(body).map((d) => `  ${d};`).join('\n')}\n}`
}

/** The selectors of a selector list */
export const selectors = (prelude) => prelude.split(',').map((s) => s.trim())
