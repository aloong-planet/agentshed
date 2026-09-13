import { createHash } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { appError, ERR } from '@shared/errors'

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
