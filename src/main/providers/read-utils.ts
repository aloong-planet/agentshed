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
 * matching skills' existing rule) */
export function fmField(content: string | null, key: string): string | null {
  if (content === null) return null
  const m = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(content)
  return m ? m[1] : null
}
