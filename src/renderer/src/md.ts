// Markdown → 消毒后 HTML 的唯一出口:所有 dangerouslySetInnerHTML 必须经此。
// DOMPurify 默认 URI 白名单不含 file:,而产物阅读器把相对图片重写为 file://(打包版可加载),
// 故显式扩展 ALLOWED_URI_REGEXP;脚本/事件属性/javascript: 仍按默认剥除。
// skills-view:YAML frontmatter 拆成键值卡片后再渲染正文。
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
