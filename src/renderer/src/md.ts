// The single exit from markdown to sanitised HTML: every dangerouslySetInnerHTML must come through here.
// DOMPurify's default URI allow-list excludes file:, while the artifact reader rewrites relative images to
// file:// (which the packaged build can load),
// so ALLOWED_URI_REGEXP is extended explicitly; scripts, event attributes and javascript: are still
// stripped by default.
// skills-view: YAML frontmatter is split into a key-value card before the body is rendered.
import DOMPurify from 'dompurify'
import { marked } from 'marked'

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
  const raw = marked.parse(body, { async: false }) as string
  const bodyHtml = DOMPurify.sanitize(raw, { ALLOWED_URI_REGEXP: URI_ALLOW })
  return (fields && fields.length ? renderFrontmatterHtml(fields) : '') + bodyHtml
}
