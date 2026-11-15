// Reading the Antigravity CLI side (ADR-0037): its registry — the trust ledger in agy's settings — and what the token
// cache and the session page key a conversation by, its signature and its transcript's path. Each conversation is a
// SQLite database directly in agy's conversations directory, which the engine module reads
// (engine/src/sides/antigravity/): the session walk's folder and subagent markers, the usage, the transcript's question
// index and agy's conversation titles, all without writing under agy's directories (token-stats::CON-002; the rules are
// in that directory's db.rs).
//
// Only agy's own data root is read (`~/.gemini/antigravity-cli`, token-stats::CON-001); the desktop app's and the
// IDE's roots never are, and neither are agy's own project records (`~/.gemini/config/projects`, shared with the
// desktop app and created automatically) nor its folder cache (projects-list::REQ-001/AC-03).
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { ERR } from '@shared/errors'
import type { RegistryResult } from './claude'
import { isAbsent } from './read-utils'

/** The registry: `trustedWorkspaces` in agy's settings — the folders the user agreed to trust when agy asked, which agy
 * writes itself (projects-list::REQ-001/AC-01, measured 2026-10-28) */
export function readAntigravityRegistry(home: string): RegistryResult {
  if (isAbsent(home)) return { detected: false, paths: [] }
  const file = join(home, 'settings.json')
  // A9: installed, nothing trusted yet — a normal state
  if (isAbsent(file)) return { detected: true, paths: [] }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return { detected: true, paths: [], error: { code: ERR.registryUnreadable, params: { path: file } } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { detected: true, paths: [], error: { code: ERR.registryParseFailed, params: { path: file } } }
  }
  const ledger = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)['trustedWorkspaces'] : undefined
  if (ledger === undefined) return { detected: true, paths: [] }
  // A ledger that is not a list is corrupt (A3), unlike an absent one (A9)
  if (!Array.isArray(ledger)) return { detected: true, paths: [], error: { code: ERR.registryProjectsInvalid, params: {} } }
  // An entry that is not a path loses only itself
  return { detected: true, paths: ledger.filter((p): p is string => typeof p === 'string' && p !== '') }
}

/** A conversation, as the engine module's session walk reads it (engine/src/sides/antigravity/walk.rs) */
export interface AntigravitySessionMeta {
  /** The conversation database's absolute path — the session's identity */
  file: string
  /** The folder the conversation is credited to (token-stats::REQ-003/AC-08); null when it cannot be read or lists no
   * local folder, so it is attributed to nothing */
  cwd: string | null
  /** Whether its own metadata says it is a subagent (token-stats::REQ-003/AC-07) */
  subagent: boolean
  /** The later of the database's and its log's modification times: while agy writes, only the log changes
   * (projects-list::REQ-001/AC-04, measured); 0 for a database the walk listed but cannot look at, whose `cwd` is then
   * null (token-stats::REQ-004/AC-01) */
  mtimeMs: number
}

/**
 * A conversation's signature: the database's modification time and the log's presence, time and size — never the
 * database's size, which a checkpoint leaves unchanged (measured; token-stats Implementation Decisions). The token cache
 * keys a conversation by it, and the session walk's memory by the same parts (engine/src/sides/antigravity/walk.rs).
 * Null when the database cannot be looked at, whether it is gone or there behind a directory that cannot be entered.
 */
function conversationSignature(file: string): string | null {
  let dbMtime: number
  try {
    dbMtime = statSync(file).mtimeMs
  } catch {
    return null
  }
  let wal: { mtimeMs: number; size: number } | null
  try {
    wal = statSync(`${file}-wal`)
  } catch {
    wal = null
  }
  return wal ? `${dbMtime}:${wal.mtimeMs}:${wal.size}` : `${dbMtime}:-`
}

// ── Sessions (session-view::REQ-003, REQ-004) ──

/**
 * A conversation's full transcript: `<data root>/brain/<conversation id>/.system_generated/logs/transcript_full.jsonl`,
 * the conversation id being its database's name (19 of 19 measured, forks and subagents included). The session's
 * questions and turns are read from it by byte range (session-view::REQ-004/AC-02); its identity stays the database.
 */
export function agyTranscriptPath(file: string): string {
  return join(dirname(dirname(file)), 'brain', basename(file, '.db'), '.system_generated', 'logs', 'transcript_full.jsonl')
}

/**
 * A conversation's signature as a session: its database's (conversationSignature) and its transcript's modification
 * time and size, so a transcript agy appended to — or rewrote when it compacted the context — is indexed again (C4),
 * as is a database it wrote; '-' for a transcript not there.
 */
export function agySessionSignature(file: string): string | null {
  const db = conversationSignature(file)
  if (db === null) return null
  let transcript: string
  try {
    const st = statSync(agyTranscriptPath(file))
    transcript = `${st.mtimeMs}:${st.size}`
  } catch {
    transcript = '-'
  }
  return `${db}|${transcript}`
}
