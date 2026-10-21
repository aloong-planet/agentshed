// The single exit from markdown to sanitised HTML: every dangerouslySetInnerHTML must come through here.
// DOMPurify's default URI allow-list excludes file:, while the artifact reader rewrites relative images to
// file:// (which the packaged build can load),
// so ALLOWED_URI_REGEXP is extended explicitly; scripts, event attributes and javascript: are still
// stripped by default.
// skills-view: YAML frontmatter is split into a key-value card before the body is rendered.
// memory-view::CON-002: text an agent writes stays text — a [[…]] reference with whatever follows it, and a
// tag-like <name> whose name is not an HTML element (a placeholder such as <slug>), which the sanitiser would
// otherwise drop together with the word.
import DOMPurify from 'dompurify'
import { Marked, type TokenizerAndRendererExtension } from 'marked'

const URI_ALLOW = /^(?:(?:https?|mailto|file|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
const MD_EXT = /\.(md|markdown|mdx)$/i

export function isMarkdownName(name: string): boolean {
  const base = name.split('/').pop() || ''
  return MD_EXT.test(base)
}

export function splitFrontmatter(src: string): {
  fields: Array<{ key: string; value: string }> | null
  body: string
} {
  const m = String(src).match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/)
  if (!m) return { fields: null, body: src }
  return { fields: parseYamlFields(m[1]), body: m[2] }
}

function parseYamlFields(block: string): Array<{ key: string; value: string }> {
  const fields: Array<{ key: string; value: string }> = []
  let cur: { key: string; value: string } | null = null
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (kv) {
      if (cur) fields.push(cur)
      let val = kv[2]
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1)
      }
      cur = { key: kv[1], value: val }
    } else if (cur && line.trim() !== '') {
      cur.value += (cur.value ? ' ' : '') + line.trim()
    }
  }
  if (cur) fields.push(cur)
  return fields
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A [[…]] reference is text: matched before the link rule, so [[name]](remark) leaves the remark as text too */
const wikiRef: TokenizerAndRendererExtension = {
  name: 'wikiRef',
  level: 'inline',
  start: (src) => src.indexOf('[['),
  tokenizer: (src) => {
    const m = /^\[\[[^\]\n]+\]\]/.exec(src)
    return m ? { type: 'wikiRef', raw: m[0] } : undefined
  },
  renderer: (token) => escapeHtml(token.raw)
}

const TAG = /<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?\/?>/g
/** An HTML element's name, as the document knows it; a hyphenated name (a custom element's form) counts as written text */
function isHtmlElementName(name: string): boolean {
  return !name.includes('-') && !(document.createElement(name) instanceof HTMLUnknownElement)
}

const parser = new Marked({
  extensions: [wikiRef],
  renderer: {
    // Raw HTML passes through to the sanitiser as before, except a tag whose name is not an element: that is
    // written text, so it is escaped to show as written
    html: ({ text }) => text.replace(TAG, (tag: string, name: string) => (isHtmlElementName(name) ? tag : escapeHtml(tag)))
  }
})

function renderFrontmatterHtml(fields: Array<{ key: string; value: string }>): string {
  const rows = fields
    .map(
      (f) =>
        `<div class="md-fm-row"><div class="md-fm-k">${escapeHtml(f.key)}</div>` +
        `<div class="md-fm-v">${escapeHtml(f.value)}</div></div>`
    )
    .join('')
  return `<div class="md-fm" aria-label="frontmatter">${rows}</div>`
}

export function renderMarkdown(md: string): string {
  const { fields, body } = splitFrontmatter(md)
  const raw = parser.parse(body, { async: false })
  const bodyHtml = DOMPurify.sanitize(raw, { ALLOWED_URI_REGEXP: URI_ALLOW })
  return (fields && fields.length ? renderFrontmatterHtml(fields) : '') + bodyHtml
}
