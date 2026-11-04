// Replacing a file whole: a temporary file beside it, then a rename, so an interruption leaves the old file or the new one.
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Throws what the write threw, with the temporary file gone: a full disk leaves it empty or partly written, a failed
 * rename leaves it whole, and its name carries the process id, so every launch that failed would add another (token-stats C8).
 */
export function writeFileAtomicSync(file: string, tmp: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  try {
    writeFileSync(tmp, text)
    renameSync(tmp, file)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // Never created, or the directory refuses this too: the write's own failure is the one to report
    }
    throw error
  }
}
