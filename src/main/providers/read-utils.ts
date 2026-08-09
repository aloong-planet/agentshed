// Small shared read helpers for providers: truncated reading and line-level frontmatter field extraction.
// Four places used to hold their own copy (review-code refactor items #2/#3); the truncation rule now
// changes in one place only.
import { existsSync, readFileSync } from 'node:fs'
import type { CappedText } from '@shared/domain'

export const MAX_TEXT_BYTES = 200_000

/** Read text and truncate at a cap; null when the file is missing or unreadable */
/**
 * Read text with a length limit. **It only reports whether it was truncated and splices in no marker** —
 * a marker is UI copy,
 * appended by the renderer in the current language (ticket 07).
 */
export function readCapped(file: string, max = MAX_TEXT_BYTES): CappedText | null {
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8')
    return raw.length > max ? { text: raw.slice(0, max), truncated: true } : { text: raw, truncated: false }
  } catch {
    return null
  }
}

/** For cases wanting only the body (feeding a regex, reading a frontmatter field), where truncation does
 * not affect parsing */
export function readTextCapped(file: string, max = MAX_TEXT_BYTES): string | null {
  return readCapped(file, max)?.text ?? null
}

/** Frontmatter / line-level field extraction (single-line values such as description/tools/model,
 * matching skills' existing rule) */
export function fmField(content: string | null, key: string): string | null {
  if (content === null) return null
  const m = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(content)
  return m ? m[1] : null
}
