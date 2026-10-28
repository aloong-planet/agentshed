// Reading the Antigravity CLI side (ADR-0037): its registry — the trust ledger in agy's settings — and its
// conversations, each a SQLite database directly in agy's conversations directory.
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
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ERR } from '@shared/errors'
import type { RegistryResult } from './claude'
import { DatabaseSync } from './sqlite'
import { decodeTrajectoryMetadata, firstFolder, isSubagent } from './agy-proto'

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
  if (!existsSync(home)) return { detected: false, paths: [] }
  const file = join(home, 'settings.json')
  // A9: installed, nothing trusted yet — a normal state
  if (!existsSync(file)) return { detected: true, paths: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { detected: true, paths: [], error: { code: ERR.registryParseFailed, params: { detail: String(err) } } }
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
 * What each conversation's metadata said, keyed by path, with the signature it was read under: the database's
 * modification time and the log's presence, time and size — never the database's size, which a checkpoint leaves
 * unchanged (measured). An unchanged conversation is not opened again, which keeps a rescan from opening, or copying,
 * every database each time. Only successful reads are kept, and only for the conversations the last walk saw.
 */
let attributions = new Map<string, { sig: string; value: Attribution }>()

function readAttribution(file: string, tmpParent: string): Attribution | null {
  try {
    return readConversationDb(
      file,
      (db) => {
        const row = db.prepare("SELECT data FROM trajectory_metadata_blob WHERE id = 'main'").get() as
          | { data: Uint8Array }
          | undefined
        if (!row || !(row.data instanceof Uint8Array)) return null
        const m = decodeTrajectoryMetadata(row.data)
        return { cwd: firstFolder(m), subagent: isSubagent(m) }
      },
      tmpParent
    )
  } catch {
    // Will not open, has no such table, or its record will not decode: it contributes nothing
    return null
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
    entries = readdirSync(join(home, 'conversations'), { withFileTypes: true })
  } catch {
    attributions = seen
    return out
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.db')) continue
    const file = join(home, 'conversations', e.name)
    let dbMtime: number
    try {
      dbMtime = statSync(file).mtimeMs
    } catch {
      continue // Deleted since the listing
    }
    let wal: { mtimeMs: number; size: number } | null
    try {
      wal = statSync(`${file}-wal`)
    } catch {
      wal = null
    }
    const sig = wal ? `${dbMtime}:${wal.mtimeMs}:${wal.size}` : `${dbMtime}:-`
    const cached = attributions.get(file)
    let value = cached?.sig === sig ? cached.value : readAttribution(file, tmpParent)
    if (value) seen.set(file, { sig, value })
    else value = { cwd: null, subagent: false }
    out.push({ file, cwd: value.cwd, subagent: value.subagent, mtimeMs: wal ? Math.max(dbMtime, wal.mtimeMs) : dbMtime })
  }
  attributions = seen
  return out
}
