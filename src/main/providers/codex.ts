// Reading Codex-side data: the registry (the [projects."<path>"] sections in config.toml).
// No TOML dependency: only the paths in the section headers are needed, extracted line by line with a
// regex; the section contents (trust_level) are not consumed at present.
import { readFileSync, existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import type { RegistryResult } from './claude'
import { isColdRollout, isRolloutName, readFirstLineCold } from './cold-rollout'
import { isAbsent } from './read-utils'
import { ERR } from '@shared/errors'

const PROJECT_HEADER = /^\s*\[projects\."(.+)"\]\s*$/

export interface CodexSessionMeta {
  /** The rollout file's absolute path */
  file: string
  /** The owning project's path (the first line's session_meta.payload.cwd) */
  cwd: string
  /** Whether this is a subagent thread (not counted toward session counts or activity time) */
  subagent: boolean
  /** The file's mtime (epoch ms) */
  mtimeMs: number
  /** This session's id (payload.id) */
  sessionId: string | null
  /** The parent session's id: payload.forked_from_id or
   * source.subagent.thread_spawn.parent_thread_id */
  parentId: string | null
  /** The fork moment (the top-level timestamp, epoch ms); the parent's usage before it is the history
   * this session replays */
  forkedAt: number | null
  /** Whether the rollout is in the paginated format — its first line carries an ordinal. A paginated
   * child thread carries no replayed events, so nothing is stripped from it (spec session-view B2). */
  paginated: boolean
}

/**
 * Walk every .jsonl under codexHome/sessions recursively, reading each file's first line for its cwd
 * attribution.
 * A file whose first line is corrupt or has no cwd is skipped (without abandoning the whole scan).
 */
export function readCodexSessions(codexHome: string): CodexSessionMeta[] {
  return new CodexHeads().walk(codexHome)
}

/** A rollout's first-line reading with the rest of the signature it was read under; the time is the meta's own */
interface KeptHead {
  size: number
  ino: number
  meta: CodexSessionMeta
}

/**
 * The rollouts' first-line readings of one run (token-stats::QR-002/AC-01). A walk opens a rollout only when
 * its modification time, size or inode differ from the ones the last walk saw, and otherwise hands back what
 * was read then: on a machine with three thousand rollouts, most of them cold, reading every first line
 * again was most of a rescan. An edit that moves none of the three is not seen until the file next changes,
 * the limit the token cache's own signature has.
 *
 * Kept in memory and never saved, so a run's first walk reads every first line. Only a reading that gave a
 * session is kept: a rollout that gave none is read again at every walk, because a failure can end without
 * the signature moving (a change of mode does not touch it), and a kept failure would hide the session
 * until the file next changed — which a cold rollout never does.
 */
export class CodexHeads {
  private kept = new Map<string, KeptHead>()

  /** As readCodexSessions, reading only the rollouts that changed since this object's last walk */
  walk(codexHome: string): CodexSessionMeta[] {
    const out: CodexSessionMeta[] = []
    // Rebuilt at each walk, so a rollout that left the tree leaves the readings with it
    const next = new Map<string, KeptHead>()
    // Two data roots (matching ccusage's codex paths.rs): archived sessions count toward the statistics too
    for (const name of ['sessions', 'archived_sessions']) {
      const root = join(codexHome, name)
      if (existsSync(root)) walk(root, out, this.kept, next)
    }
    this.kept = next
    return out
  }
}

function walk(dir: string, out: CodexSessionMeta[], kept: ReadonlyMap<string, KeptHead>, next: Map<string, KeptHead>): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      walk(p, out, kept, next)
      continue
    }
    // Plain and cold rollouts alike (spec token-stats B12): a cold one is the same session under its
    // compressed path
    if (!isRolloutName(e.name)) continue
    const meta = keptOrRead(p, kept, next)
    if (meta) out.push(meta)
  }
}

/**
 * A rollout's reading: the kept one while its signature stands, a fresh one otherwise. The signature is taken
 * before the first line is read, as the token cache takes its own, so a rollout replaced while it is read
 * shows as changed at the next walk instead of matching a signature its reading never saw.
 */
function keptOrRead(file: string, kept: ReadonlyMap<string, KeptHead>, next: Map<string, KeptHead>): CodexSessionMeta | null {
  let st
  try {
    st = statSync(file)
  } catch {
    return null
  }
  const was = kept.get(file)
  if (was && was.meta.mtimeMs === st.mtimeMs && was.size === st.size && was.ino === st.ino) {
    next.set(file, was)
    return was.meta
  }
  const meta = readHead(file, st.mtimeMs)
  if (meta) next.set(file, { size: st.size, ino: st.ino, meta })
  return meta
}

/** The first line measures up to 42 KB (session_meta embeds base_instructions), so it must be read up to
 * the newline before parsing */
const HEAD_CHUNK = 64 * 1024
const HEAD_MAX = 4 * 1024 * 1024

function readFirstLine(file: string): string | null {
  if (isColdRollout(file)) return readFirstLineCold(file, HEAD_MAX)
  const fd = openSync(file, 'r')
  try {
    const chunks: Buffer[] = []
    let offset = 0
    for (;;) {
      const buf = Buffer.alloc(HEAD_CHUNK)
      const n = readSync(fd, buf, 0, HEAD_CHUNK, offset)
      if (n === 0) break
      const slice = buf.subarray(0, n)
      const nl = slice.indexOf(0x0a)
      if (nl !== -1) {
        chunks.push(slice.subarray(0, nl))
        return Buffer.concat(chunks).toString('utf8')
      }
      chunks.push(slice)
      offset += n
      if (offset >= HEAD_MAX) return null // An abnormally large file with no newline: give up rather than
      // eating memory
    }
    return chunks.length ? Buffer.concat(chunks).toString('utf8') : null
  } finally {
    closeSync(fd)
  }
}

/** The single-file version: read the first line's session_meta. Ticket 04's single-file index rebuild
 * goes through here, sharing its source with the full scan */
export const readCodexSessionMeta = (file: string): CodexSessionMeta | null => readHead(file)

/** `mtimeMs` is the file's time when the caller has already taken it; read here when absent */
function readHead(file: string, mtimeMs?: number): CodexSessionMeta | null {
  try {
    {
      const firstLine = readFirstLine(file)
      if (firstLine === null) return null
      const parsed: unknown = JSON.parse(firstLine)
      if (typeof parsed !== 'object' || parsed === null) return null
      const payload = (parsed as Record<string, unknown>)['payload']
      if (typeof payload !== 'object' || payload === null) return null
      const cwd = (payload as Record<string, unknown>)['cwd']
      if (typeof cwd !== 'string' || cwd === '') return null
      const pl = payload as Record<string, unknown>
      const subagent = pl['thread_source'] === 'subagent'
      const sessionId = typeof pl['id'] === 'string' ? pl['id'] : null
      const spawnParent = (
        ((pl['source'] as Record<string, unknown> | undefined)?.['subagent'] as
          | Record<string, unknown>
          | undefined)?.['thread_spawn'] as Record<string, unknown> | undefined
      )?.['parent_thread_id']
      const forked = pl['forked_from_id']
      // Only these two count (matching ccusage's replay.rs): payload.parent_thread_id is not a fork
      // relationship,
      // since it also appears in a continuation session on the same thread, and mistaking it for the
      // parent would strip this session's own usage.
      const parentId =
        typeof forked === 'string' && forked !== ''
          ? forked
          : typeof spawnParent === 'string' && spawnParent !== ''
            ? spawnParent
            : null
      const topTs = (parsed as Record<string, unknown>)['timestamp']
      const forkedAt = typeof topTs === 'string' ? Date.parse(topTs) : NaN
      return {
        file,
        cwd,
        subagent,
        mtimeMs: mtimeMs ?? statSync(file).mtimeMs,
        sessionId,
        parentId,
        forkedAt: Number.isNaN(forkedAt) ? null : forkedAt,
        paginated: typeof (parsed as Record<string, unknown>)['ordinal'] === 'number'
      }
    }
  } catch {
    return null
  }
}

export function readCodexRegistry(codexHome: string): RegistryResult {
  if (!existsSync(codexHome)) return { detected: false, paths: [] }
  const configFile = join(codexHome, 'config.toml')
  if (isAbsent(configFile)) return { detected: true, paths: [] }
  // Section headers are looked for line by line and nothing is parsed, so the one failure here is the read
  try {
    const paths: string[] = []
    for (const line of readFileSync(configFile, 'utf8').split('\n')) {
      const m = PROJECT_HEADER.exec(line)
      if (m) paths.push(m[1])
    }
    return { detected: true, paths }
  } catch {
    return { detected: true, paths: [], error: { code: ERR.registryUnreadable, params: { path: configFile } } }
  }
}
