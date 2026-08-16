// Reading Grok-side data: the registry (the trusted-folder ledger, ADR-0019).
// The registry is the per-project record Grok keeps on a user decision — the folders table in
// trusted_folders.toml — never the session store's directory names (which decode losslessly and are
// therefore tempting, but would make "registered" mean something different on this side).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { RegistryResult } from './claude'
import { ERR } from '@shared/errors'

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

/**
 * Walk sessions/<percent-encoded cwd>/<session-id>/ (the layout measured 2026-08-16). A session
 * directory without an updates.jsonl has no session identity and is skipped; loose files at either
 * level (prompt_history.jsonl, session_search.sqlite) are not sessions.
 */
export function readGrokSessions(grokHome: string): GrokSessionMeta[] {
  const out: GrokSessionMeta[] = []
  const root = join(grokHome, 'sessions')
  let cwdDirs
  try {
    cwdDirs = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const cwdEntry of cwdDirs) {
    if (!cwdEntry.isDirectory()) continue
    let cwd: string
    try {
      cwd = decodeURIComponent(cwdEntry.name)
    } catch {
      continue // A malformed name only loses its own directory, not the scan
    }
    const cwdDir = join(root, cwdEntry.name)
    let sessionDirs
    try {
      sessionDirs = readdirSync(cwdDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const s of sessionDirs) {
      if (!s.isDirectory()) continue
      const sessionDir = join(cwdDir, s.name)
      const stream = join(sessionDir, 'updates.jsonl')
      try {
        out.push({
          file: stream,
          cwd,
          subagent: isSubagentSession(sessionDir),
          mtimeMs: statSync(stream).mtimeMs
        })
      } catch {
        // No authoritative stream → no session identity; skip without abandoning the scan
      }
    }
  }
  return out
}

/**
 * A child session sits **beside** its parent, so depth cannot tell the two apart — the judgement
 * reads what the record says about itself: summary.json's `"session_kind": "subagent"` (measured
 * 2026-08-16; a parent session has no session_kind key at all). An unreadable summary says nothing,
 * and a record that says nothing is not a subagent — miscounting one extra session is visible,
 * silently dropping a real one is not.
 */
function isSubagentSession(sessionDir: string): boolean {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(sessionDir, 'summary.json'), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return false
    return (parsed as Record<string, unknown>)['session_kind'] === 'subagent'
  } catch {
    return false
  }
}

export function readGrokRegistry(grokHome: string): RegistryResult {
  if (!existsSync(grokHome)) return { detected: false, paths: [] }
  const ledger = join(grokHome, 'trusted_folders.toml')
  // A9: an installed side that has registered nothing is a normal state, not a failure
  if (!existsSync(ledger)) return { detected: true, paths: [] }
  try {
    const parsed = parseToml(readFileSync(ledger, 'utf8')) as Record<string, unknown>
    const folders = parsed['folders']
    // No folders table at all is the empty ledger (A9, normal); a folders key that is NOT a table
    // is a corrupt one (A3) — degrading without an explanation is what the two must not share
    if (folders === undefined) return { detected: true, paths: [] }
    if (typeof folders !== 'object' || folders === null) {
      return { detected: true, paths: [], error: { code: ERR.registryProjectsInvalid, params: {} } }
    }
    return { detected: true, paths: Object.keys(folders) }
  } catch (err) {
    return {
      detected: true,
      paths: [],
      error: { code: ERR.registryParseFailed, params: { detail: String(err) } }
    }
  }
}
