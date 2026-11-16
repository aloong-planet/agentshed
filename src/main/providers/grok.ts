// Reading Grok-side data: the registry (the trusted-folder ledger, ADR-0019).
// The registry is the per-project record Grok keeps on a user decision — the folders table in
// trusted_folders.toml — never the session store's directory names (which decode losslessly and are
// therefore tempting, but would make "registered" mean something different on this side).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { RegistryResult } from './claude'
import { isAbsent } from './read-utils'
import { ERR } from '@shared/errors'

/** A session, as the engine module's session walk reads it (engine/src/sides/grok/walk.rs) */
export interface GrokSessionMeta {
  /** The authoritative update stream's absolute path — the session's identity (ADR-0019) */
  file: string
  /** The owning project's path (the percent-encoded directory name, decoded losslessly) */
  cwd: string
  /** Whether this is a subagent session (not counted toward session counts or activity time) */
  subagent: boolean
  /** The authoritative stream's mtime (epoch ms) — "the session file's mtime" keeps one meaning
   * across all sides even though this side stores a session as a directory (spec B7) */
  mtimeMs: number
}

export function readGrokRegistry(grokHome: string): RegistryResult {
  // Only a root that is really not there: one behind a directory it cannot enter is unreadable (agents-overview A3)
  if (isAbsent(grokHome)) return { detected: false, paths: [] }
  const ledger = join(grokHome, 'trusted_folders.toml')
  // A9: an installed side that has registered nothing is a normal state, not a failure
  if (isAbsent(ledger)) return { detected: true, paths: [] }
  let text: string
  try {
    text = readFileSync(ledger, 'utf8')
  } catch {
    return { detected: true, paths: [], error: { code: ERR.registryUnreadable, params: { path: ledger } } }
  }
  let parsed: Record<string, unknown>
  try {
    parsed = parseToml(text)
  } catch {
    return { detected: true, paths: [], error: { code: ERR.registryParseFailed, params: { path: ledger } } }
  }
  const folders = parsed['folders']
  // No folders table at all is the empty ledger (A9, normal); a folders key that is NOT a table
  // is a corrupt one (A3) — degrading without an explanation is what the two must not share
  if (folders === undefined) return { detected: true, paths: [] }
  if (typeof folders !== 'object' || folders === null) {
    return { detected: true, paths: [], error: { code: ERR.registryProjectsInvalid, params: {} } }
  }
  return { detected: true, paths: Object.keys(folders) }
}
