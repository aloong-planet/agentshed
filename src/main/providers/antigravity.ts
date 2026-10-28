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
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ERR } from '@shared/errors'
import type { RegistryResult } from './claude'
import { DatabaseSync } from './sqlite'
import {
  decodeGeneratorMetadata,
  decodeStepMetadata,
  decodeTrajectoryMetadata,
  firstFolder,
  hasTokens,
  isSubagent,
  type ModelUsage,
  type TrajectoryMetadata
} from './agy-proto'

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
    entries = readdirSync(join(home, 'conversations'), { withFileTypes: true })
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

// ── Usage (token-stats::REQ-003) ──

/**
 * One model call of a conversation, as the token cache keeps it: [identity, time (epoch ms), input, output, cache read,
 * cache write, model]. The identity is the call's response id, else its provider-assigned id, else its message id;
 * null when it carries none, and then it is never matched across databases. The time is the call's step's completion,
 * else its creation (token-stats::REQ-003/AC-05); null for a call recorded by a generator record alone. The model is the
 * generator record's response model as agy recorded it; null without one (token-stats::REQ-003/AC-04).
 */
export type AgyCall = [string | null, number | null, number, number, number, number, string | null]

/** What a conversation's database says about it as a session (session-view::REQ-003, REQ-005) */
export interface AgyConversation {
  /** Its own id, as its trajectory table records it (token-stats::REQ-003/AC-06): the key agy's summaries and a fork's
   * copied steps name it by */
  id: string
  /** Whether its own metadata says it is a subagent (token-stats::REQ-003/AC-07): it gets no row */
  subagent: boolean
  /** The largest step timestamp in the database (session-view::REQ-003/AC-04); null when no step carries one */
  at: number | null
  /** For a fork, the conversation its last copied step came from (session-view::REQ-005/AC-02); null otherwise */
  forkOf: string | null
}

/** A conversation's usage read: its credited folder, calls and session facts; unreadable in the supported format; or
 * failed while agy was writing it (not counted, its last result kept) */
export type AgyUsageRead =
  | { kind: 'read'; folder: string | null; calls: AgyCall[]; conversation: AgyConversation }
  | { kind: 'unreadable' }
  | { kind: 'failed' }

/**
 * A conversation's own id, as its database records it: the trajectory table's cascade id (one row in every measured
 * database, its id equal to the database's name — 19 of 19, forks and subagents included). Read from the database rather
 * than taken from its file's name, so that a renamed file cannot make every step look copied and its calls vanish
 * without a trace; a trajectory table with no row is a shape never measured, and unreadable.
 */
function ownConversationIds(db: DatabaseSync): Set<string> {
  const ids = new Set<string>()
  for (const row of db.prepare('SELECT cascade_id FROM trajectory_meta').all() as Array<{ cascade_id?: unknown }>) {
    if (typeof row.cascade_id === 'string' && row.cascade_id !== '') ids.add(row.cascade_id)
  }
  if (ids.size === 0) throw new Error('agy conversation: no trajectory row')
  return ids
}

/**
 * Read a conversation's model calls, each once (token-stats::REQ-003). agy records a call three times in one database —
 * the step's usage, the generator record's usage and the first entry of that record's retry list — so calls are
 * matched by identity within the database, and the step's time and the generator record's model are joined onto one
 * call. A retry entry is a call of its own only with token counts and an identity of its own (AC-02). A step whose
 * recorded-in conversation is another one — a fork's copy of its parent's history — and a generator record attached
 * only to such steps, or attached to no step here and naming another conversation as its maker, are that
 * conversation's usage, never this one's (AC-06). The steps are read first and kept small
 * (time, copied, the call they carry); the generator records, which hold each call's whole prompt, are decoded one row
 * at a time.
 */
function conversationCalls(self: Set<string>, db: DatabaseSync): { calls: AgyCall[]; at: number | null; forkOf: string | null } {
  interface Call {
    usage: ModelUsage
    at: number | null
    model: string | null
  }
  interface StepInfo {
    at: number | null
    copied: boolean
    call: Call | null
  }
  const calls: Call[] = []
  const byIdentity = new Map<string, Call>()
  const add = (usage: ModelUsage, at: number | null, model: string | null): Call => {
    const seen = usage.identity === null ? undefined : byIdentity.get(usage.identity)
    if (seen) {
      // The same call recorded again: the step's time stays, the generator record brings the model
      if (seen.model === null) seen.model = model
      return seen
    }
    const call: Call = { usage, at, model }
    calls.push(call)
    if (usage.identity !== null) byIdentity.set(usage.identity, call)
    return call
  }
  const addRetries = (own: ModelUsage | null, retries: Array<ModelUsage | null>, at: number | null, model: string | null): void => {
    for (const r of retries) {
      if (r && hasTokens(r) && r.identity !== null && r.identity !== own?.identity) add(r, at, model)
    }
  }
  const steps = new Map<number, StepInfo>()
  // The session facts the steps give (session-view::REQ-003/AC-04, REQ-005/AC-02): the largest step time — copied
  // steps included, theirs being older — and the source of the last copied step, the conversation the nearest copied
  // content came from
  let lastStepAt: number | null = null
  let forkOf: string | null = null
  for (const row of db.prepare('SELECT idx, metadata FROM steps WHERE metadata IS NOT NULL ORDER BY idx').iterate()) {
    const { idx, metadata } = row as { idx: number; metadata: unknown }
    if (!(metadata instanceof Uint8Array)) throw new Error('agy conversation: step metadata is not a blob')
    const m = decodeStepMetadata(metadata)
    const info: StepInfo = {
      at: m.completedAt ?? m.createdAt,
      copied: m.sourceConversationId !== null && !self.has(m.sourceConversationId),
      call: null
    }
    steps.set(idx, info)
    for (const t of [m.createdAt, m.completedAt]) if (t !== null && (lastStepAt === null || t > lastStepAt)) lastStepAt = t
    if (info.copied) forkOf = m.sourceConversationId
    if (info.copied) continue
    if (m.usage && hasTokens(m.usage)) info.call = add(m.usage, info.at, null)
    addRetries(m.usage, m.retries, info.at, null)
  }
  for (const row of db.prepare('SELECT idx, data FROM gen_metadata WHERE data IS NOT NULL ORDER BY idx').iterate()) {
    const { data } = row as { data: unknown }
    if (!(data instanceof Uint8Array)) throw new Error('agy conversation: generator record is not a blob')
    const g = decodeGeneratorMetadata(data)
    const named = g.stepIndices.flatMap((i) => steps.get(i) ?? [])
    // Copied: every step it names was copied; or, naming no step here, its own record names another conversation as
    // the one that made the call — a fork copies such a record too, and with the parent gone nothing else tells
    if (named.length > 0 ? named.every((s) => s.copied) : g.conversationId !== null && !self.has(g.conversationId)) continue
    const own = named.filter((s) => !s.copied)
    const at = own.length > 0 ? own[0].at : null
    if (g.usage && hasTokens(g.usage)) {
      // A call with no identity is matched to the step it names that carries an unidentified call — the only link
      // between the two copies when there is no id to match
      const stepCall = g.usage.identity === null ? own.find((s) => s.call?.usage.identity === null)?.call : undefined
      if (stepCall) {
        if (stepCall.model === null) stepCall.model = g.responseModel
      } else add(g.usage, at, g.responseModel)
    }
    addRetries(g.usage, g.retries, at, g.responseModel)
  }
  return { calls: calls.map((c) => [c.usage.identity, c.at, c.usage.input, c.usage.output, c.usage.cacheRead, c.usage.cacheWrite, c.model]), at: lastStepAt, forkOf }
}

/**
 * Read a conversation's usage without writing under agy's directories (token-stats::CON-002): its format checked
 * (token-stats::CON-001), its credited folder (token-stats::REQ-003/AC-08), its calls, and what its database says about
 * it as a session (AgyConversation). `tmpParent` is where a copy is made when a log is beside the database.
 */
export function readAntigravityUsage(file: string, tmpParent: string = tmpdir()): AgyUsageRead {
  const logBefore = existsSync(`${file}-wal`)
  try {
    return readConversationDb(
      file,
      (db): AgyUsageRead => {
        checkFormat(db)
        const m = trajectoryRecord(db)
        if (m === null) throw new Error('agy conversation: no trajectory record')
        const self = ownConversationIds(db)
        const { calls, at, forkOf } = conversationCalls(self, db)
        return { kind: 'read', folder: firstFolder(m), calls, conversation: { id: [...self][0], subagent: isSubagent(m), at, forkOf } }
      },
      tmpParent
    )
  } catch {
    return failedWhileWritten(file, logBefore) ? { kind: 'failed' } : { kind: 'unreadable' }
  }
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

/**
 * agy's own conversation titles, from its summaries database (`<data root>/conversation_summaries.db`, the index its
 * `/resume` list reads), by conversation id; a conversation agy left untitled — its row's title empty, as for a fork or
 * a subagent (measured) — is left out (session-view::REQ-003/AC-03). Read without writing there (token-stats::CON-002), as a conversation is. Empty when the
 * database is not there or will not read in the shape titles are read from (its table with `conversation_id` and
 * `title`) — the titles then fall back to the first question; null when the read failed while agy was writing it, so
 * the caller keeps the titles it last read.
 */
export function readAgySummaryTitles(home: string, tmpParent: string = tmpdir()): Map<string, string> | null {
  const file = join(home, 'conversation_summaries.db')
  if (!existsSync(file)) return new Map()
  const logBefore = existsSync(`${file}-wal`)
  try {
    return readConversationDb(
      file,
      (db) => {
        const titles = new Map<string, string>()
        for (const row of db.prepare('SELECT conversation_id, title FROM conversation_summaries').iterate()) {
          const { conversation_id: id, title } = row as { conversation_id?: unknown; title?: unknown }
          if (typeof id === 'string' && id !== '' && typeof title === 'string' && title.trim() !== '') titles.set(id, title)
        }
        return titles
      },
      tmpParent
    )
  } catch {
    return failedWhileWritten(file, logBefore) ? null : new Map()
  }
}
