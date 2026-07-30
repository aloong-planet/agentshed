// Markdown → 消毒后 HTML 的唯一出口:所有 dangerouslySetInnerHTML 必须经此。
// DOMPurify 默认 URI 白名单不含 file:,而产物阅读器把相对图片重写为 file://(打包版可加载),
// 故显式扩展 ALLOWED_URI_REGEXP;脚本/事件属性/javascript: 仍按默认剥除。
import DOMPurify from 'dompurify'
import { marked } from 'marked'

const URI_ALLOW = /^(?:(?:https?|mailto|file|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw, { ALLOWED_URI_REGEXP: URI_ALLOW })
}
