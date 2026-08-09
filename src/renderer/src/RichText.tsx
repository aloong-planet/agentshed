// Rendering rich-text copy (ticket 09).
//
// **Why it is needed**: the session page and the in-turn blocks have a dozen or so explanations with
// inline emphasis, and that emphasis carries **warning semantics**
// ("never obtainable", "may have stripped too much or too little", "only the truncated version is
// stored"), not decoration. Two existing constraints rule out the usual approaches:
//   (1) this feature's convention that "rich text must not be assembled from fragment keys" — word order
//       differs per language, so concatenation is bound to be wrong;
//   (2) ADR-0014 settled that the copy layer is pure data plus pure functions and **does not depend on
//       React**, so a dictionary entry cannot return a ReactNode.
//
// The solution is for the dictionary to still hold **one complete plain string**, carrying emphasis in
// two lightweight markers that this component parses at render time:
//   `**bold**`  →  <b>
//   `` `code` ``  →  <code>
// One key per sentence, complete in all six languages, with the markers moving naturally with each
// language's word order — precisely what fragment keys cannot do.
//
// Nesting and links are deliberately **not** supported: this use needs only these two, and supporting
// more would mean keeping a markdown implementation here,
// while rendering agent-generated content already has its own markdown path (that one sanitises, this
// one does not — do not mix them up).
import type { JSX } from 'react'

/** Split on `**bold**` and `` `code` ``; the two do not nest, and first come first served */
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g

export function RichText({ text }: { text: string }): JSX.Element {
  const parts = text.split(TOKEN).filter((p) => p !== '')
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
