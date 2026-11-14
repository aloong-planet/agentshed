// Reading the Antigravity CLI side (ADR-0037): its registry — the trust ledger in agy's settings — and the activity
// walk's reading of its conversations, each a SQLite database directly in agy's conversations directory. A
// conversation's usage, its transcript's question index and agy's conversation titles are read by the engine module
// (engine/src/sides/antigravity/), whose reading without writing follows the rules below: a change to them here is made
// there too, until the walk moves into the module.
//
// Only agy's own data root is read (`~/.gemini/antigravity-cli`, token-stats::CON-001); the desktop app's and the
// IDE's roots never are, and neither are agy's own project records (`~/.gemini/config/projects`, shared with the
// desktop app and created automatically) nor its folder cache (projects-list::REQ-001/AC-03).
//
// **Reading writes nothing under agy's directories** (token-stats::CON-002). An ordinary read-only SQLite open of a
// database in WAL mode leaves `-shm` and `-wal` files behind (measured 2026-10-28), so a database with no log beside
// it is opened in place as immutable — SQLite then takes no lock and creates nothing (measured 2026-10-29) — and one
// with a log (agy has it open) is copied, log first, into a temporary directory of this application's own, read
// there, and the copy removed. The log goes first for agy exiting between the two copies: its last connection merges
// the log into the database before deleting it, so a log already gone means the database copied after it holds
// everything. A checkpoint agy runs while it keeps writing could still land between the two copies (not observed; the
// mechanism allows it): a read of such a pair that fails contributes nothing, and the next scan reads it again.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ERR } from '@shared/errors'
import type { RegistryResult } from './claude'
import { isAbsent } from './read-utils'
import { DatabaseSync } from './sqlite'
import { byName } from './scan-order'
import { decodeTrajectoryMetadata, firstFolder, isSubagent, type TrajectoryMetadata } from './agy-proto'

/**
 * Open one conversation database without writing under agy's directories and hand it to `read`; the connection is
 * closed, and a copy removed, before this returns or throws. `tmpParent` is where the copy's directory is made
 * (the system temporary directory in production; injected by tests to see that it is removed).
 */
export function readConversationDb<T>(file: string, read: (db: DatabaseSync) => T, tmpParent: string = tmpdir()): T {
  if (!existsSync(`${file}-wal`)) {
    const url = pathToFileURL(file)
    url.searchParams.set('immutable', '1')
    const db = new DatabaseSync(url, { readOnly: true })
    try {
      return read(db)
    } finally {
      db.close()
    }
  }
  const dir = mkdtempSync(join(tmpParent, 'agentshed-agy-'))
  try {
    const copy = join(dir, 'conversation.db')
    try {
      copyFileSync(`${file}-wal`, `${copy}-wal`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    copyFileSync(file, copy)
    // The copy is this application's own, so it is opened like any database. agy's `-shm` — the index its running
    // connection keeps over the log — is not copied; SQLite builds the copy's own from the copied log (measured: a row
    // only the log holds reads back)
    const db = new DatabaseSync(copy)
    try {
      return read(db)
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

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

export interface AntigravitySessionMeta {
  /** The conversation database's absolute path — the session's identity */
  file: string
  /** The folder the conversation is credited to (token-stats::REQ-003/AC-08); null when it cannot be read or lists no
   * local folder, so it is attributed to nothing */
  cwd: string | null
  /** Whether its own metadata says it is a subagent (token-stats::REQ-003/AC-07) */
  subagent: boolean
  /** The later of the database's and its log's modification times: while agy writes, only the log changes
   * (projects-list::REQ-001/AC-04, measured) */
  mtimeMs: number
}

interface Attribution {
  cwd: string | null
  subagent: boolean
}

/**
 * The format this reader supports (token-stats::CON-001): user version 1, with the tables and columns usage is read
 * from — the steps' index and metadata, the generator metadata's index and data, the trajectory metadata, and the
 * trajectory table's cascade id (the conversation's own id). A database of any other shape is unreadable
 * (token-stats::REQ-004): it throws here, before a record is decoded, so a drift shows as a counted conversation rather
 * than as figures that quietly shrank.
 */
const SUPPORTED_USER_VERSION = 1
const REQUIRED_COLUMNS: Record<string, string[]> = {
  steps: ['idx', 'metadata'],
  gen_metadata: ['idx', 'data'],
  trajectory_metadata_blob: ['id', 'data'],
  trajectory_meta: ['cascade_id']
}

function checkFormat(db: DatabaseSync): void {
  const v = db.prepare('PRAGMA user_version').get() as { user_version?: unknown } | undefined
  if (v?.user_version !== SUPPORTED_USER_VERSION) throw new Error(`agy conversation: user version ${String(v?.user_version)}`)
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    // A missing table has no columns, so it fails the same check
    const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name))
    for (const c of columns) if (!have.has(c)) throw new Error(`agy conversation: no ${table}.${c}`)
  }
}

/** The conversation's trajectory record (the `main` row; the table's default id and the only row in every measured
 * database); null when there is none */
function trajectoryRecord(db: DatabaseSync): TrajectoryMetadata | null {
  const row = db.prepare("SELECT data FROM trajectory_metadata_blob WHERE id = 'main'").get() as { data?: unknown } | undefined
  return row && row.data instanceof Uint8Array ? decodeTrajectoryMetadata(row.data) : null
}

/**
 * Whether a failed read is agy writing the conversation rather than a format it cannot be read in
 * (token-stats::REQ-004/AC-03): a log was beside the database before the read or is after it — agy had it open, and a
 * torn copy or a database mid-write is not a format change — or the database is gone (deleted since the listing).
 */
function failedWhileWritten(file: string, logBefore: boolean): boolean {
  return logBefore || existsSync(`${file}-wal`) || !existsSync(file)
}

/**
 * A conversation's signature: the database's modification time and the log's presence, time and size — never the
 * database's size, which a checkpoint leaves unchanged (measured; token-stats Implementation Decisions). The walk's
 * memo and the token cache both key a conversation by it. `mtimeMs` is the later of the two times: while agy writes,
 * only the log changes (projects-list::REQ-001/AC-04, measured). Null when the database is gone.
 */
export function conversationSignature(file: string): { sig: string; mtimeMs: number } | null {
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
  return wal
    ? { sig: `${dbMtime}:${wal.mtimeMs}:${wal.size}`, mtimeMs: Math.max(dbMtime, wal.mtimeMs) }
    : { sig: `${dbMtime}:-`, mtimeMs: dbMtime }
}

/**
 * What each conversation's metadata said, keyed by path, with the signature it was read under. An unchanged
 * conversation is not opened again, which keeps a rescan from opening, or copying, every database each time. Only
 * successful reads are kept, and only for the conversations the last walk saw.
 */
let attributions = new Map<string, { sig: string; value: Attribution }>()

/** A conversation's folder and subagent markers; null when it cannot be read, 'failed' when the read failed while agy
 * was writing it */
function readAttribution(file: string, tmpParent: string): Attribution | null | 'failed' {
  const logBefore = existsSync(`${file}-wal`)
  try {
    return readConversationDb(
      file,
      (db) => {
        checkFormat(db)
        const m = trajectoryRecord(db)
        return m ? { cwd: firstFolder(m), subagent: isSubagent(m) } : null
      },
      tmpParent
    )
  } catch {
    // Will not open, is in another format, or its record will not decode: it contributes nothing — unless agy was
    // writing it
    return failedWhileWritten(file, logBefore) ? 'failed' : null
  }
}

/**
 * Every conversation of the side: the `.db` files directly in `<home>/conversations` (subagents sit there too,
 * measured), never their `-wal` and `-shm` companions nor anything one level down (token-stats::CON-001).
 */
export function readAntigravitySessions(home: string, tmpParent: string = tmpdir()): AntigravitySessionMeta[] {
  const out: AntigravitySessionMeta[] = []
  const seen = new Map<string, { sig: string; value: Attribution }>()
  let entries
  try {
    // In scan order (scan-order.ts)
    entries = readdirSync(join(home, 'conversations'), { withFileTypes: true }).sort(byName)
  } catch {
    attributions = seen
    return out
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.db')) continue
    const file = join(home, 'conversations', e.name)
    const signature = conversationSignature(file)
    if (signature === null) continue // Deleted since the listing
    const { sig, mtimeMs } = signature
    const cached = attributions.get(file)
    let entry = cached?.sig === sig ? cached : null
    if (entry === null) {
      const read = readAttribution(file, tmpParent)
      // A read that failed while agy was writing keeps the last successful one (token-stats::REQ-004/AC-03), under its
      // old signature, so the next walk reads the conversation again
      if (read === 'failed') entry = cached ?? null
      else if (read !== null) entry = { sig, value: read }
    }
    if (entry) seen.set(file, entry)
    const value = entry?.value ?? { cwd: null, subagent: false }
    out.push({ file, cwd: value.cwd, subagent: value.subagent, mtimeMs })
  }
  attributions = seen
  return out
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
  return `${db.sig}|${transcript}`
}
