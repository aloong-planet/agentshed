// The version the previous run recorded (app-update Implementation Decisions): the first run after the
// app's version went up shows "You're up to date" in settings (app-update::REQ-004/AC-04). Kept in userData
// apart from the preferences, since it is not something the user chooses, and written at every launch.
// Atomic writes, as for the other userData files.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gt, valid } from 'semver'

const FILE = 'last-run-version.json'

/**
 * Records this run's version and answers whether it is the first run after the version went up — by an
 * update from either route, or a newer copy installed by hand (Failures C7, C9). A missing or unreadable
 * record, the same version, and a version that went down answer false (C8).
 */
export function recordRunVersion(dir: string, running: string): boolean {
  const previous = readRecord(dir)
  const wentUp = previous !== null && valid(running) !== null && gt(running, previous)
  // A record that cannot be written must not stop the launch; the next run then compares with the older
  // record and may show the line once more
  try {
    mkdirSync(dir, { recursive: true })
    const tmp = join(dir, `.${FILE}.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify({ version: running }))
    renameSync(tmp, join(dir, FILE))
  } catch (error) {
    console.error('[run-version] could not record this run\'s version:', error)
  }
  return wentUp
}

function readRecord(dir: string): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(dir, FILE), 'utf8'))
    const version = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)['version'] : null
    return typeof version === 'string' && valid(version) !== null ? version : null
  } catch {
    return null
  }
}
