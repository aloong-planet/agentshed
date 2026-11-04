import { createHash } from 'node:crypto'
import { lstatSync, statSync } from 'node:fs'
import { appError, ERR } from '@shared/errors'
import { readRanges, type ByteRange } from './providers/range-read'

/** lstat never follows a replaced final symlink. The exact allow-list check belongs before this. */
export function sourceIdentity(file: string): string {
  try {
    const s = lstatSync(file)
    if (!s.isFile() || s.isSymbolicLink()) throw appError(ERR.sessionFileUnreadable)
    return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`
  } catch {
    throw appError(ERR.sessionFileUnreadable)
  }
}
/**
 * A session's byte ranges for its page and its turns. Whatever fails here is the file's: one that exists and cannot be
 * read, one gone since the identity check, a cold rollout whose stream breaks. The system's message names the path, and
 * it would reach the screen as it is (session-view P6, the in-turn fetch states).
 */
export async function readSessionRanges(source: string, ranges: readonly ByteRange[]): Promise<{ texts: string[]; bytesRead: number }> {
  try {
    return await readRanges(source, ranges)
  } catch {
    throw appError(ERR.sessionFileUnreadable)
  }
}
/** The record file's size, for the page's header; a file gone since the identity check fails as the read does */
export function recordFileBytes(file: string): number {
  try {
    return statSync(file).size
  } catch {
    throw appError(ERR.sessionFileUnreadable)
  }
}
export function pageRevision(identity: string, questions: unknown): string {
  return createHash('sha256').update(identity).update(JSON.stringify(questions)).digest('hex')
}
export function regularTarget(file: string, directory = false): boolean {
  try { const s = lstatSync(file); return !s.isSymbolicLink() && (directory ? s.isDirectory() : s.isFile()) }
  catch { return false }
}
/** A turn remains attached to this question when later questions are appended. Byte positions and
 * raw question identity (including source UUIDs) prevent ordinal reuse after a rewrite. */
export function questionRevision(identity: string, file: string, start: number, end: number, raw: string): string {
  return pageRevision(identity.split(':').slice(0, 2).join(':'), [file, start, end, raw])
}
