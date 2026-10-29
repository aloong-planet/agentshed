// Small shared read helpers for providers: truncated reading and line-level frontmatter field extraction.
// Four places used to hold their own copy (review-code refactor items #2/#3); the truncation rule now
// changes in one place only.
import { existsSync, readFileSync } from 'node:fs'
import type { CappedText, ConfigFile } from '@shared/domain'

export const MAX_TEXT_BYTES = 200_000

function capped(raw: string, max: number): CappedText {
  return raw.length > max ? { text: raw.slice(0, max), truncated: true } : { text: raw, truncated: false }
}

/** Read text and truncate at a cap; null when the file is missing or unreadable */
/**
 * Read text with a length limit. **It only reports whether it was truncated and splices in no marker** —
 * a marker is UI copy,
 * appended by the renderer in the current language (ticket 07).
 */
export function readCapped(file: string, max = MAX_TEXT_BYTES): CappedText | null {
  if (!existsSync(file)) return null
  try {
    return capped(readFileSync(file, 'utf8'), max)
  } catch {
    return null
  }
}

/**
 * A file for a Configuration entry: null when it does not exist; when it exists but the read fails (a permission
 * or I/O error, a directory at the path), it keeps its path with no contents, so its slot can say so rather
 * than read as absent (agents-overview::REQ-004 failure modes; project-detail::REQ-002).
 */
export function readConfigFile(file: string, max = MAX_TEXT_BYTES): ConfigFile | null {
  if (!existsSync(file)) return null
  try {
    return { file, content: capped(readFileSync(file, 'utf8'), max) }
  } catch {
    return { file, content: null }
  }
}

/** For cases wanting only the body (feeding a regex, reading a frontmatter field), where truncation does
 * not affect parsing */
export function readTextCapped(file: string, max = MAX_TEXT_BYTES): string | null {
  return readCapped(file, max)?.text ?? null
}

/** Frontmatter / line-level field extraction (single-line values such as description/tools/model,
 * matching skills' existing rule; a block scalar's lines are read as blockScalar says) */
export function fmField(content: string | null, key: string): string | null {
  if (content === null) return null
  const m = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(content)
  if (!m) return null
  if (!BLOCK_SCALAR.test(m[1])) return m[1]
  return blockScalar(content.split(/\r?\n/), content.slice(0, m.index).split('\n').length - 1, m[1])
}

/** The header of a YAML block scalar (`>`, `|-`, `>+2` …), the form agy's official flutter plugin writes five of its skill
 * descriptions in (ticket #325): the value is the indented lines under the key */
const BLOCK_SCALAR = /^[>|](?:[-+]?[1-9]?|[1-9][-+])$/

/**
 * A block scalar's value for display: the indented lines under line `at`, trimmed — folded (`>`) ones joined with a
 * space, literal (`|`) ones with a line break; null when there are none. The rest of YAML's block rules (kept blank
 * lines, chomping, more-indented lines) is not interpreted: the value is shown, never acted on.
 */
function blockScalar(lines: readonly string[], at: number, header: string): string | null {
  const body: string[] = []
  for (const l of lines.slice(at + 1)) {
    if (l.trim() === '') continue
    if (!/^\s/.test(l)) break
    body.push(l.trim())
  }
  return body.length > 0 ? body.join(header.startsWith('>') ? ' ' : '\n') : null
}

/**
 * The front matter block at the top of a Markdown file — the lines between an opening `---` line and the next `---`
 * line — or null without one. Antigravity CLI's definitions are read from the block alone (ticket #325), so a body line
 * that happens to read `name: x` is never taken for a field.
 */
export function frontMatter(content: string | null): string | null {
  if (content === null) return null
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  return end < 0 ? null : lines.slice(1, end).join('\n')
}

const unquote = (v: string): string =>
  v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) ? v.slice(1, -1) : v

/**
 * A top-level field of a front matter block as written: a one-line value with its quotes dropped, a block scalar's
 * lines (blockScalar), or the items of a block list under it (`  - item` lines, the form agy's sample agents give
 * `tools`) joined with ", ". null when the field is absent or empty. Nothing else of YAML is interpreted: a value is
 * shown, never acted on.
 */
export function fmValue(block: string | null, key: string): string | null {
  if (block === null) return null
  const lines = block.split('\n')
  const at = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (at < 0) return null
  const rest = lines[at].slice(key.length + 1).trim()
  if (BLOCK_SCALAR.test(rest)) return blockScalar(lines, at, rest)
  if (rest !== '') return unquote(rest)
  const items: string[] = []
  for (const l of lines.slice(at + 1)) {
    const item = /^\s+-\s+(.*)$/.exec(l)
    if (!item) break
    items.push(unquote(item[1].trim()))
  }
  return items.length > 0 ? items.join(', ') : null
}
